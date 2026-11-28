import { doc, getDoc, setDoc, onSnapshot, deleteField } from 'firebase/firestore';
import { db } from './firebase';

export interface AerialCogConfig {
  driveUrl: string;
  fileId: string;
  label?: string;
  enabled: boolean;
  opacity: number; // 0..1
  epsgOverride?: string; // '' = auto-detect from GeoTIFF GeoKeys
  updatedAt?: number;
  updatedBy?: string;
}

export interface AerialCogStoreState {
  byProject: Record<string, AerialCogConfig>;
  customDriveApiKey: string; // Optional override; if empty, uses project's default Google/Firebase API key
}

const LOCAL_STORAGE_KEY = 'project_ventura_aerial_cog_configs_v1';
const LOCAL_API_KEY_STORAGE = 'project_ventura_aerial_cog_api_key_v1';
const FIRESTORE_COLLECTION = 'configs';
const FIRESTORE_DOC_ID = 'aerial_cog_configs';

/**
 * Extracts a Google Drive File ID from any common Google Drive URL format
 * or returns the raw string if it already looks like a Google Drive File ID.
 */
export function extractGoogleDriveFileId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match /file/d/<ID>
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileDMatch) return fileDMatch[1];

  // Match /d/<ID>
  const genericDMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (genericDMatch) return genericDMatch[1];

  // Match /drive/v3/files/<ID>
  const apiMatch = trimmed.match(/\/drive\/v3\/files\/([a-zA-Z0-9_-]{10,})/);
  if (apiMatch) return apiMatch[1];

  // Match ?id=<ID> or &id=<ID>
  const queryIdMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryIdMatch) return queryIdMatch[1];

  // Raw file ID pasted directly (no spaces or slashes, 15..80 chars)
  if (/^[a-zA-Z0-9_-]{15,80}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function normalizeCogProjectKey(projectId: string): string {
  return (projectId || 'default').trim().replace(/[.#$/[\]]/g, '_');
}

function sanitizeConfig(cfg: AerialCogConfig): AerialCogConfig {
  return {
    driveUrl: (cfg.driveUrl || '').trim(),
    fileId: (cfg.fileId || '').trim(),
    label: (cfg.label || '').trim(),
    enabled: cfg.enabled !== false,
    opacity: typeof cfg.opacity === 'number' && Number.isFinite(cfg.opacity)
      ? Math.max(0.05, Math.min(1, cfg.opacity))
      : 1,
    epsgOverride: (cfg.epsgOverride || '').trim(),
    updatedAt: cfg.updatedAt || Date.now(),
    updatedBy: (cfg.updatedBy || '').trim()
  };
}

function readLocalMap(): Record<string, AerialCogConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalMap(map: Record<string, AerialCogConfig>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[AerialCOG] Gagal menyimpan cache lokal:', e);
  }
}

export function getLocalCustomDriveApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(LOCAL_API_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function saveLocalCustomDriveApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = (apiKey || '').trim();
    if (clean) {
      localStorage.setItem(LOCAL_API_KEY_STORAGE, clean);
    } else {
      localStorage.removeItem(LOCAL_API_KEY_STORAGE);
    }
  } catch {
    // ignore
  }
}

export function getLocalAerialCogConfig(projectId: string): AerialCogConfig | null {
  const key = normalizeCogProjectKey(projectId);
  const map = readLocalMap();
  return map[key] || null;
}

export function getAllLocalAerialCogConfigs(): Record<string, AerialCogConfig> {
  return readLocalMap();
}

export function saveLocalAerialCogConfig(projectId: string, config: AerialCogConfig | null): void {
  const key = normalizeCogProjectKey(projectId);
  const map = readLocalMap();
  if (config && config.fileId) {
    map[key] = sanitizeConfig(config);
  } else {
    delete map[key];
  }
  writeLocalMap(map);
}

/**
 * Loads the per-project COG config from Firestore `configs/aerial_cog_configs`
 * (only stores tiny link/fileId JSON objects, ~200 bytes — zero impact on Firebase free quota).
 */
export async function loadAerialCogConfigFromCloud(projectId: string): Promise<AerialCogConfig | null> {
  const key = normalizeCogProjectKey(projectId);
  try {
    const snap = await getDoc(doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID));
    if (snap.exists()) {
      const data = snap.data() as { byProject?: Record<string, AerialCogConfig>; customDriveApiKey?: string };
      if (typeof data?.customDriveApiKey === 'string') {
        saveLocalCustomDriveApiKey(data.customDriveApiKey);
      }
      const cloudCfg = data?.byProject?.[key] || null;
      if (cloudCfg && cloudCfg.fileId) {
        saveLocalAerialCogConfig(projectId, cloudCfg);
        return sanitizeConfig(cloudCfg);
      }
    }
  } catch (err) {
    console.warn('[AerialCOG] Gagal memuat konfigurasi COG dari Firestore, pakai cache lokal:', err);
  }
  return getLocalAerialCogConfig(projectId);
}

/**
 * Subscribes in real time to ALL project COG configs + optional custom Drive API Key.
 */
export function subscribeAllAerialCogConfigs(
  onUpdate: (state: AerialCogStoreState) => void
): () => void {
  return onSnapshot(
    doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { byProject?: Record<string, AerialCogConfig>; customDriveApiKey?: string };
        const byProjectRaw = data?.byProject || {};
        const cleanMap: Record<string, AerialCogConfig> = {};
        Object.entries(byProjectRaw).forEach(([k, v]) => {
          if (v && v.fileId) {
            cleanMap[k] = sanitizeConfig(v);
          }
        });
        const customKey = typeof data?.customDriveApiKey === 'string' ? data.customDriveApiKey.trim() : '';
        writeLocalMap(cleanMap);
        saveLocalCustomDriveApiKey(customKey);
        onUpdate({ byProject: cleanMap, customDriveApiKey: customKey });
      } else {
        onUpdate({ byProject: {}, customDriveApiKey: '' });
      }
    },
    (err) => {
      console.warn('[AerialCOG] Realtime all-configs sync error:', err);
    }
  );
}

/**
 * Subscribes in real time to a single project's COG config + global custom Drive API Key.
 */
export function subscribeAerialCogConfig(
  projectId: string,
  onUpdate: (config: AerialCogConfig | null, customDriveApiKey: string) => void
): () => void {
  const key = normalizeCogProjectKey(projectId);
  return onSnapshot(
    doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { byProject?: Record<string, AerialCogConfig>; customDriveApiKey?: string };
        const customKey = typeof data?.customDriveApiKey === 'string' ? data.customDriveApiKey.trim() : '';
        saveLocalCustomDriveApiKey(customKey);
        const cloudCfg = data?.byProject?.[key] || null;
        if (cloudCfg && cloudCfg.fileId) {
          const clean = sanitizeConfig(cloudCfg);
          saveLocalAerialCogConfig(projectId, clean);
          onUpdate(clean, customKey);
          return;
        }
        onUpdate(null, customKey);
        return;
      }
      onUpdate(null, '');
    },
    (err) => {
      console.warn('[AerialCOG] Realtime sync error:', err);
    }
  );
}

/**
 * Persists (or deletes when null) a project's COG Drive link to Firestore & localStorage.
 */
export async function saveAerialCogConfigToCloud(
  projectId: string,
  config: AerialCogConfig | null
): Promise<void> {
  const key = normalizeCogProjectKey(projectId);
  saveLocalAerialCogConfig(projectId, config);

  const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);
  if (config && config.fileId) {
    const clean = sanitizeConfig(config);
    await setDoc(
      ref,
      {
        byProject: {
          [key]: clean
        },
        updatedAt: Date.now()
      },
      { merge: true }
    );
  } else {
    await setDoc(
      ref,
      {
        byProject: {
          [key]: deleteField()
        },
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }
}

/**
 * Saves optional custom Google Drive API Key (for Guest/Tamu access) to Firestore `configs/aerial_cog_configs`.
 * Leaving it empty tells the app to use the default project Google/Firebase API key automatically.
 */
export async function saveCustomDriveApiKeyToCloud(apiKey: string): Promise<void> {
  const clean = (apiKey || '').trim();
  saveLocalCustomDriveApiKey(clean);
  const ref = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);
  await setDoc(
    ref,
    {
      customDriveApiKey: clean,
      updatedAt: Date.now()
    },
    { merge: true }
  );
}
