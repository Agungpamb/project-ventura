import { db } from './firebase';
import { doc, setDoc, deleteDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';

export interface SavedGeoJSONLayer {
  id: string;
  name: string;
  type: 'bidang' | 'jalur' | 'tower';
  data: any;
  visible?: boolean;
  isDefault?: boolean;
  fieldMapping?: any;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
  chunked?: boolean;
  totalChunks?: number;
  driveFileId?: string | null;
  driveFolderId?: string | null;
  driveModifiedTime?: string | null;
  source?: 'drive' | 'upload' | 'deployed';
}

/**
 * Generates a deterministic Firestore document ID for a Drive-synced GeoJSON layer
 * so repeated syncs overwrite the same layer instead of creating duplicates.
 */
export function getDriveLayerDocId(projectId: string, type: 'bidang' | 'jalur' | 'tower'): string {
  const safeProj = (projectId || 'global').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `drive_${safeProj}_${type}`;
}

/**
 * Removes a layer from localStorage cache cleanly.
 */
export function removeLayerFromLocalStorage(id: string): void {
  try {
    const localGeoJSONs = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
    const filtered = localGeoJSONs.filter((l: any) => l.id !== id);
    localStorage.setItem('local_geojson_layers', JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed removing layer from localStorage:', e);
  }
}

/**
 * Safely saves a layer to localStorage without throwing QuotaExceededError
 */
export function saveLayerToLocalStorage(layer: SavedGeoJSONLayer): void {
  try {
    const localGeoJSONs = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
    const filtered = localGeoJSONs.filter((l: any) => l.id !== layer.id);
    
    // Test payload size
    const payloadString = JSON.stringify([...filtered, layer]);
    if (payloadString.length < 4000000) { // ~4MB threshold for localStorage safety
      filtered.push(layer);
      localStorage.setItem('local_geojson_layers', JSON.stringify(filtered));
    } else {
      // Store lightweight version without full feature dump in localStorage
      const lightweightLayer = {
        ...layer,
        data: {
          type: layer.data?.type || 'FeatureCollection',
          features: layer.data?.features ? layer.data.features.slice(0, 50) : []
        }
      };
      filtered.push(lightweightLayer);
      localStorage.setItem('local_geojson_layers', JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('LocalStorage quota exceeded or unavailable, skipping local cache update:', e);
  }
}

/**
 * Computes UTF-8 byte length of a string (for accurate Firestore 1MB document limit checks).
 */
function getUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  return str.length * 2;
}

/**
 * Splits GeoJSON features into JSON-serialized chunks guaranteed to stay well under Firestore's 1MB doc limit.
 */
function buildFeatureJsonChunks(features: any[], maxChunkBytes: number = 450000): string[] {
  const chunks: string[] = [];
  let currentBatch: any[] = [];
  let currentBytes = 2; // "[]"

  for (const feat of features) {
    const featStr = JSON.stringify(feat);
    const featBytes = getUtf8ByteLength(featStr) + 1; // +1 for comma

    if (currentBatch.length > 0 && currentBytes + featBytes > maxChunkBytes) {
      chunks.push(JSON.stringify(currentBatch));
      currentBatch = [feat];
      currentBytes = 2 + featBytes;
    } else {
      currentBatch.push(feat);
      currentBytes += featBytes;
    }
  }

  if (currentBatch.length > 0) {
    chunks.push(JSON.stringify(currentBatch));
  }

  return chunks;
}

/**
 * Saves a GeoJSON layer to Firestore.
 * Serializes GeoJSON payloads as JSON strings (`dataJson` / `featuresJson`) because Cloud Firestore
 * does not support nested arrays (which GeoJSON LineString/Polygon/MultiPolygon coordinates require).
 * Automatically chunks large feature collections across subcollection documents if payload > 650KB.
 */
export async function saveGeoJSONLayerToFirestore(layer: SavedGeoJSONLayer): Promise<void> {
  const {
    id,
    name,
    type,
    data,
    visible = true,
    isDefault = false,
    fieldMapping = null,
    projectId = 'global',
    driveFileId = null,
    driveFolderId = null,
    driveModifiedTime = null,
    source = 'upload'
  } = layer;

  const nowIso = new Date().toISOString();
  const docRef = doc(db, 'geojson_layers', id);
  const safeData = data && typeof data === 'object' ? data : { type: 'FeatureCollection', features: [] };
  const dataString = JSON.stringify(safeData);
  const totalBytes = getUtf8ByteLength(dataString);

  const cleanupStaleChunks = async (keepCount: number) => {
    try {
      const existingChunks = await getDocs(collection(docRef, 'chunks'));
      const deletePromises: Promise<void>[] = [];
      existingChunks.forEach(cSnap => {
        const idx = cSnap.data()?.chunkIndex;
        if (keepCount === 0 || (typeof idx === 'number' && idx >= keepCount)) {
          deletePromises.push(deleteDoc(cSnap.ref));
        }
      });
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    } catch (e) {
      // Ignore if chunks subcollection does not exist yet
    }
  };

  // Under 650KB: Save directly in single document as JSON string (avoids Firestore nested array error)
  if (totalBytes < 650000) {
    await cleanupStaleChunks(0);
    await setDoc(docRef, {
      name,
      type,
      dataJson: dataString,
      data: null,
      visible,
      isDefault,
      fieldMapping,
      projectId,
      driveFileId,
      driveFolderId,
      driveModifiedTime,
      source,
      createdAt: layer.createdAt || nowIso,
      updatedAt: layer.updatedAt || nowIso,
      chunked: false,
      totalChunks: 0,
      totalFeatures: Array.isArray(safeData.features) ? safeData.features.length : 0
    });
    return;
  }

  // Large GeoJSON (>= 650KB): Chunk features array across subcollection as JSON strings
  const features = Array.isArray(safeData.features) ? safeData.features : [];
  const featureJsonChunks = buildFeatureJsonChunks(features, 450000);

  // 1. Write chunks first so any snapshot listener reading the parent doc immediately sees complete chunks
  for (let i = 0; i < featureJsonChunks.length; i++) {
    const chunkRef = doc(db, 'geojson_layers', id, 'chunks', `chunk_${i}`);
    await setDoc(chunkRef, {
      chunkIndex: i,
      featuresJson: featureJsonChunks[i]
    });
  }

  // 2. Remove any leftover chunks from an older larger version
  await cleanupStaleChunks(featureJsonChunks.length);

  // 3. Save metadata document in root collection (triggers realtime onSnapshot for all roles)
  const { features: _omitFeatures, ...metaWithoutFeatures } = safeData;
  await setDoc(docRef, {
    name,
    type,
    dataJson: JSON.stringify({ ...metaWithoutFeatures, type: safeData.type || 'FeatureCollection', features: [] }),
    data: null,
    visible,
    isDefault,
    fieldMapping,
    projectId,
    driveFileId,
    driveFolderId,
    driveModifiedTime,
    source,
    createdAt: layer.createdAt || nowIso,
    updatedAt: layer.updatedAt || nowIso,
    chunked: true,
    totalChunks: featureJsonChunks.length,
    totalFeatures: features.length
  });
}

/**
 * Reconstructs a full layer from a Firestore doc snapshot (assembling chunked subcollections if needed).
 * Supports both JSON-stringified payloads (`dataJson`/`featuresJson`) and legacy object payloads.
 */
export async function loadGeoJSONLayerDoc(docSnap: any): Promise<SavedGeoJSONLayer> {
  const item = docSnap.data();
  const layerId = docSnap.id;

  let layerData: any = item.data;
  if (typeof item.dataJson === 'string' && item.dataJson.trim()) {
    try {
      layerData = JSON.parse(item.dataJson);
    } catch (parseErr) {
      console.warn(`Gagal parsing dataJson GeoJSON ${layerId}:`, parseErr);
    }
  }

  // Reconstruct chunked features
  if (item.chunked && item.totalChunks > 0) {
    try {
      const chunksSnap = await getDocs(collection(doc(db, 'geojson_layers', layerId), 'chunks'));
      const chunkDocs: { index: number; features: any[] }[] = [];
      chunksSnap.forEach(cSnap => {
        const cData = cSnap.data();
        let chunkFeatures: any[] = [];
        if (typeof cData.featuresJson === 'string' && cData.featuresJson.trim()) {
          try {
            const parsed = JSON.parse(cData.featuresJson);
            if (Array.isArray(parsed)) chunkFeatures = parsed;
          } catch (e) {
            console.warn(`Gagal parsing chunk ${cSnap.id} dari ${layerId}:`, e);
          }
        } else if (Array.isArray(cData.features)) {
          chunkFeatures = cData.features;
        }
        chunkDocs.push({
          index: cData.chunkIndex ?? 0,
          features: chunkFeatures
        });
      });

      chunkDocs.sort((a, b) => a.index - b.index);
      const allFeatures = chunkDocs.flatMap(c => c.features);

      layerData = {
        ...(layerData && typeof layerData === 'object' ? layerData : {}),
        type: layerData?.type || 'FeatureCollection',
        features: allFeatures
      };
    } catch (err) {
      console.warn(`Gagal memuat chunk GeoJSON ${layerId}:`, err);
    }
  }

  return {
    id: layerId,
    name: item.name || '',
    type: item.type || 'bidang',
    data: layerData,
    visible: item.visible !== undefined ? item.visible : true,
    isDefault: item.isDefault || false,
    fieldMapping: item.fieldMapping || null,
    projectId: item.projectId || 'global',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    chunked: item.chunked,
    totalChunks: item.totalChunks,
    driveFileId: item.driveFileId || null,
    driveFolderId: item.driveFolderId || null,
    driveModifiedTime: item.driveModifiedTime || null,
    source: item.source || (item.isDefault ? 'deployed' : 'upload')
  };
}

/**
 * Deletes a GeoJSON layer and its chunk subcollection if present.
 */
export async function deleteGeoJSONLayerFromFirestore(id: string, isChunked?: boolean): Promise<void> {
  try {
    const chunksSnap = await getDocs(collection(doc(db, 'geojson_layers', id), 'chunks'));
    const deletePromises: Promise<void>[] = [];
    chunksSnap.forEach(cSnap => {
      deletePromises.push(deleteDoc(cSnap.ref));
    });
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
  } catch (e) {}

  await deleteDoc(doc(db, 'geojson_layers', id));
}

export const DEPLOYED_GEOJSON_CONFIGS = [
  {
    id: 'deployed_bidang_warga',
    name: 'KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN (Bidang Warga)',
    type: 'bidang' as const,
    candidates: [
      '/geojson/KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN_BIDANG_WARGA.geojson',
      '/geojson/bidang_warga.geojson',
      '/geojson/bidang_tanah.geojson',
      '/geojson/bidang.geojson'
    ]
  },
  {
    id: 'deployed_jalur_utuh',
    name: 'KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN (Jalur Utuh)',
    type: 'jalur' as const,
    candidates: [
      '/geojson/KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN_JALUR_UTUH.geojson',
      '/geojson/jalur_utuh.geojson',
      '/geojson/jalur.geojson'
    ]
  },
  {
    id: 'deployed_tapak_tower',
    name: 'KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN (Tapak Tower)',
    type: 'tower' as const,
    candidates: [
      '/geojson/KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN_TAPAK_TOWER.geojson',
      '/geojson/tapak_tower.geojson',
      '/geojson/tower.geojson'
    ]
  }
];

/**
 * Fetches default deployed GeoJSON files from /public/geojson/
 */
export async function loadDeployedDefaultGeoJSONs(): Promise<SavedGeoJSONLayer[]> {
  const results: SavedGeoJSONLayer[] = [];

  for (const config of DEPLOYED_GEOJSON_CONFIGS) {
    for (const path of config.candidates) {
      try {
        const res = await fetch(encodeURI(path));
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('html')) continue; // Skip HTML fallback page

          const data = await res.json();
          if (data && (data.type === 'FeatureCollection' || Array.isArray(data.features))) {
            results.push({
              id: config.id,
              name: config.name,
              type: config.type,
              data: data,
              visible: true,
              isDefault: true,
              fieldMapping: null,
              projectId: 'proj-1'
            });
            break;
          }
        }
      } catch (err) {
        // Try next candidate path
      }
    }
  }

  return results;
}

