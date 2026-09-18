import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { toPng } from 'html-to-image';
import { 
  Map as MapIcon, Layers, Compass, RotateCw, Printer, Search, 
  ChevronDown, Info, Shield, CheckCircle2, FileText, ArrowUp, Download, Image as ImageIcon, Loader2,
  Edit3, ExternalLink, Trash2
} from 'lucide-react';
import DeleteParcelModal from "./DeleteParcelModal";
import type { LandRecord } from '../types';

interface LoadedGeoJSON {
  id: string;
  name: string;
  type: 'bidang' | 'jalur' | 'tower';
  data: any;
  visible: boolean;
  isDefault?: boolean;
  fieldMapping?: {
    desa?: string;
    span?: string;
    nobid?: string;
    nama?: string;
    tower?: string;
    jalurName?: string;
    rotasi?: string;
  };
}

interface PetaBidangTanahProps {
  records: LandRecord[];
  loadedGeoJSONs: LoadedGeoJSON[];
  role?: string | null;
  activeProjectName?: string;
  activeProjectId?: string;
  onNavigateToInput?: (record: LandRecord) => void;
  onDeleteRecord?: (record: LandRecord, adjustNextParcels: boolean) => Promise<void>;
}

// Utility functions
const normalizeString = (str: any) => String(str || '').trim();
const normalizeClean = (str: any) => String(str || '').trim().toLowerCase();
const normalizeNoSpaces = (str: any) => normalizeClean(str).replace(/[\s\-_.,\/]/g, '');

const normalizeDesa = (val: any): string => {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .trim()
    .replace(/^(desa|kelurahan|kel|dsa)\.?\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
};

const normalizeSpan = (val: any): string => {
  if (!val) return '';
  let s = String(val).toLowerCase().trim();
  s = s.replace(/^span\s*/i, '');
  const m = s.match(/(?:t(?:ower|wr)?\.?\s*)?(\d+)([a-z]?)\s*(?:[-–—/]|s\/d|sampai|to)\s*(?:t(?:ower|wr)?\.?\s*)?(\d+)([a-z]?)/i);
  if (m) {
    const t1Num = m[1].replace(/^0+/, '') || '0';
    const t1Suffix = m[2] || '';
    let t2Num = m[3].replace(/^0+/, '') || '0';
    const t2Suffix = m[4] || '';
    if (t2Num.length < t1Num.length && /^\d+$/.test(t1Num) && /^\d+$/.test(t2Num)) {
      t2Num = t1Num.substring(0, t1Num.length - t2Num.length) + t2Num;
    }
    return `t${t1Num}${t1Suffix}t${t2Num}${t2Suffix}`;
  }
  return s.replace(/\b0+(\d+)/g, '$1').replace(/[^a-z0-9]/g, '');
};

const findPropCaseInsensitive = (props: any, keys: string[]) => {
  if (!props || typeof props !== 'object') return '';
  const propKeys = Object.keys(props);
  for (const k of keys) {
    const match = propKeys.find(pk => pk.toLowerCase().trim() === k.toLowerCase());
    if (match && props[match] !== undefined && props[match] !== null) {
      return String(props[match]).trim();
    }
  }
  return '';
};

export default function PetaBidangTanah({
  records,
  loadedGeoJSONs,
  role,
  activeProjectName,
  activeProjectId,
  onNavigateToInput,
  onDeleteRecord
}: PetaBidangTanahProps) {
  // Map Container Refs
  const topMapContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomMapContainerRef = useRef<HTMLDivElement | null>(null);
  const topMapRef = useRef<L.Map | null>(null);
  const bottomMapRef = useRef<L.Map | null>(null);

  // Sync state flag to prevent infinite loops during drag/zoom sync
  const isSyncingRef = useRef(false);

  // State for Custom Rotation Offset, Dynamic Scale & PNG Exporting
  const [recordToDelete, setRecordToDelete] = useState<LandRecord | null>(null);
  const [selectedDesa, setSelectedDesa] = useState<string>('');
  const [selectedSpan, setSelectedSpan] = useState<string>('');
  const [rotasiOffset, setRotasiOffset] = useState<number>(0); // Custom +/- rotation adjustment (UserRotationOffset)
  const [projectionCorrection, setProjectionCorrection] = useState<number>(0); // Optional projection correction offset
  const [currentScaleText, setCurrentScaleText] = useState<string>('1 : 1.000');
  const [isExportingPNG, setIsExportingPNG] = useState<boolean>(false);

  // Extract distinct Desa & Span list from both spreadsheet records & GeoJSON layers
  const desaOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.DESA && r.DESA.trim()) set.add(r.DESA.trim().toUpperCase());
    });
    loadedGeoJSONs.forEach(layer => {
      if (!layer.data?.features) return;
      layer.data.features.forEach((f: any) => {
        const props = f.properties || {};
        const d = layer.fieldMapping?.desa 
          ? props[layer.fieldMapping.desa] 
          : findPropCaseInsensitive(props, ['desa', 'village', 'kelurahan']);
        if (d && String(d).trim()) set.add(String(d).trim().toUpperCase());
      });
    });
    return Array.from(set).sort();
  }, [records, loadedGeoJSONs]);

  // Set default Desa when options load
  useEffect(() => {
    if (!selectedDesa && desaOptions.length > 0) {
      setSelectedDesa(desaOptions[0]);
    }
  }, [desaOptions, selectedDesa]);

  // Extract available Spans for selected Desa
  const spanOptions = useMemo(() => {
    if (!selectedDesa) return [];
    const set = new Set<string>();
    const normSelDesa = normalizeDesa(selectedDesa);

    records.forEach(r => {
      if (normalizeDesa(r.DESA) === normSelDesa && r.SPAN && r.SPAN.trim()) {
        set.add(r.SPAN.trim().toUpperCase());
      }
    });

    loadedGeoJSONs.forEach(layer => {
      if (!layer.data?.features) return;
      layer.data.features.forEach((f: any) => {
        const props = f.properties || {};
        const d = layer.fieldMapping?.desa 
          ? props[layer.fieldMapping.desa] 
          : findPropCaseInsensitive(props, ['desa', 'village', 'kelurahan']);
        if (normalizeDesa(d) === normSelDesa) {
          const s = layer.fieldMapping?.span 
            ? props[layer.fieldMapping.span] 
            : findPropCaseInsensitive(props, ['span', 'section', 'jalur']);
          if (s && String(s).trim()) set.add(String(s).trim().toUpperCase());
        }
      });
    });

    return Array.from(set).sort();
  }, [records, loadedGeoJSONs, selectedDesa]);

  // Set default Span when span options update
  useEffect(() => {
    if (spanOptions.length > 0) {
      if (!selectedSpan || !spanOptions.includes(selectedSpan)) {
        setSelectedSpan(spanOptions[0]);
      }
    } else {
      setSelectedSpan('');
    }
  }, [spanOptions]);

  // Composite Desa_Span Code
  const desaSpanCode = useMemo(() => {
    if (!selectedDesa || !selectedSpan) return 'DESA_SPAN';
    return `${selectedDesa.replace(/\s+/g, '_')}_${selectedSpan.replace(/\s+/g, '_')}`;
  }, [selectedDesa, selectedSpan]);

  // Filter Spreadsheet Records matching selected Desa + Span
  const filteredRecords = useMemo(() => {
    if (!selectedDesa || !selectedSpan) return [];
    const normSelDesa = normalizeDesa(selectedDesa);
    const normSelSpan = normalizeSpan(selectedSpan);

    return records.filter(r => {
      const matchDesa = normalizeDesa(r.DESA) === normSelDesa;
      const matchSpan = normalizeSpan(r.SPAN) === normSelSpan;
      return matchDesa && matchSpan;
    }).sort((a, b) => (Number(a.NOBID) || 0) - (Number(b.NOBID) || 0));
  }, [records, selectedDesa, selectedSpan]);

  // Total Area Calculation
  const totalLuas = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + (Number(r.LUAS) || 0), 0);
  }, [filteredRecords]);

  // Base GeoJSON Rotation detection from GeoJSON features in selected Desa/Span
  const baseGeojsonRotasi = useMemo(() => {
    if (!selectedDesa) return 0;
    const normSelDesa = normalizeDesa(selectedDesa);
    const normSelSpan = normalizeSpan(selectedSpan);

    for (const layer of loadedGeoJSONs) {
      if (!layer.data?.features) continue;
      for (const f of layer.data.features) {
        const props = f.properties || {};
        const d = layer.fieldMapping?.desa 
          ? props[layer.fieldMapping.desa] 
          : findPropCaseInsensitive(props, ['desa', 'village', 'kelurahan']);
        const s = layer.fieldMapping?.span 
          ? props[layer.fieldMapping.span] 
          : findPropCaseInsensitive(props, ['span', 'section', 'jalur']);

        if (normalizeDesa(d) === normSelDesa && (!normSelSpan || normalizeSpan(s) === normSelSpan)) {
          const rotKey = layer.fieldMapping?.rotasi 
            ? props[layer.fieldMapping.rotasi]
            : findPropCaseInsensitive(props, ['rotasi', 'rotate', 'rotation', 'angle', 'sudut']);
          const rotNum = Number(rotKey);
          if (!isNaN(rotNum) && rotNum !== 0) {
            return rotNum;
          }
        }
      }
    }
    return 0;
  }, [loadedGeoJSONs, selectedDesa, selectedSpan]);

  // Helper to extract clean Tower Name e.g. "T.70", "T.11A"
  const featPropsTower = (props: any, layer?: LoadedGeoJSON) => {
    if (!props) return 'Tower';
    if (layer?.fieldMapping?.tower && props[layer.fieldMapping.tower]) {
      const mapped = String(props[layer.fieldMapping.tower]).trim();
      if (mapped) {
        if (/^t[\.\-_\s]?/i.test(mapped)) {
          return 'T.' + mapped.replace(/^t[\.\-_\s]?/i, '').trim();
        }
        if (/^[0-9]+[a-zA-Z]?$/.test(mapped)) {
          return `T.${mapped}`;
        }
        return mapped;
      }
    }
    const val = findPropCaseInsensitive(props, [
      'towernumb', 'tower_numb', 'tower', 'no_tower', 'id_tower', 'nomor_tower', 'no_tapak', 'tapak', 'tapaktower', 'tapak_tower', 'nama', 'namobj', 'name', 
      'code', 'label', 'text', 'no'
    ]);
    if (!val) return 'Tower';
    const str = String(val).trim();
    if (/^t[\.\-_\s]?/i.test(str)) {
      return 'T.' + str.replace(/^t[\.\-_\s]?/i, '').trim();
    }
    if (/^[0-9]+[a-zA-Z]?$/.test(str)) {
      return `T.${str}`;
    }
    return str;
  };

  // Extract Tower Coordinates (X / Easting / Lng, Y / Northing / Lat) strictly for towers in current active span
  const towerPoints = useMemo(() => {
    const list: { name: string; lng: number; lat: number }[] = [];
    if (!selectedSpan) return list;

    // Extract tower tokens from selectedSpan e.g. "T.70 - T.71" -> ["70", "71"] or "SPAN T.15-T.16A" -> ["15", "16A"]
    const cleanSpan = selectedSpan.toUpperCase();
    const match = cleanSpan.match(/T\.?\s*([0-9a-zA-Z]+)\s*[\-\–\/]\s*T\.?\s*([0-9a-zA-Z]+)/i);
    let t1Raw = match ? match[1] : '';
    let t2Raw = match ? match[2] : '';

    if (!t1Raw) {
      const singleMatch = cleanSpan.match(/T\.?\s*([0-9a-zA-Z]+)/i);
      if (singleMatch) t1Raw = singleMatch[1];
    }

    const targetTokens = [t1Raw, t2Raw].filter(Boolean);

    // Helper to calculate coordinates from Point or Polygon feature
    const getFeatureCoords = (feat: any): { lng: number; lat: number } | null => {
      if (!feat.geometry) return null;
      const geomType = feat.geometry.type;
      const coords = feat.geometry.coordinates;

      if (geomType === 'Point' && Array.isArray(coords) && coords.length >= 2) {
        return { lng: Number(coords[0]), lat: Number(coords[1]) };
      }
      if ((geomType === 'Polygon' || geomType === 'MultiPolygon') && Array.isArray(coords)) {
        let pts: number[][] = [];
        if (geomType === 'Polygon') {
          pts = coords[0] || [];
        } else {
          pts = coords[0]?.[0] || [];
        }
        if (pts.length > 0) {
          let sumLng = 0, sumLat = 0, count = 0;
          pts.forEach((p: any) => {
            if (Array.isArray(p) && p.length >= 2) {
              sumLng += Number(p[0]);
              sumLat += Number(p[1]);
              count++;
            }
          });
          if (count > 0) {
            return { lng: sumLng / count, lat: sumLat / count };
          }
        }
      }
      return null;
    };

    const foundTowersMap = new Map<string, { name: string; lng: number; lat: number }>();

    loadedGeoJSONs.forEach(layer => {
      if (!layer.data?.features) return;
      const isTowerLayer = layer.type === 'tower' || /tower|tapak|tw/i.test(layer.name || '');

      layer.data.features.forEach((f: any) => {
        const props = f.properties || {};
        const coords = getFeatureCoords(f);
        if (!coords) return;

        // Check all property string values in feature
        const allPropValuesStr = Object.values(props).map(v => String(v).trim().toUpperCase()).join(' ');

        let matchedToken = '';
        for (const tok of targetTokens) {
          const normTok = tok.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
          if (!normTok) continue;

          // Match exact token or T.<tok> or T<tok> or token in property values
          const regexStr = `(?:\\b|T[\\._\\-]?)${normTok}\\b`;
          const tokenRegex = new RegExp(regexStr, 'i');

          if (tokenRegex.test(allPropValuesStr)) {
            matchedToken = tok;
            break;
          }
        }

        const featSpan = layer.fieldMapping?.span 
          ? props[layer.fieldMapping.span] 
          : findPropCaseInsensitive(props, ['span', 'section', 'jalur']);
        const isSpanMatch = featSpan && normalizeSpan(featSpan) === normalizeSpan(selectedSpan);

        if (matchedToken || (isTowerLayer && isSpanMatch)) {
          const tNameFromProp = featPropsTower(props);
          const displayName = matchedToken ? `T.${matchedToken.toUpperCase()}` : tNameFromProp;
          if (!foundTowersMap.has(displayName)) {
            foundTowersMap.set(displayName, {
              name: displayName,
              lng: coords.lng,
              lat: coords.lat
            });
          }
        }
      });
    });

    const result = Array.from(foundTowersMap.values());
    result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    return result;
  }, [loadedGeoJSONs, selectedSpan]);

  // Calculate rotation automatically to make span corridor HORIZONTAL on screen
  const towerCalculatedRotasi = useMemo(() => {
    let dx = 0, dy = 0;
    let foundVector = false;

    if (towerPoints && towerPoints.length >= 2) {
      // Sort towers by number/suffix so Tower Kecil is T1 and Tower Besar is T2
      const sortedTowers = [...towerPoints].sort((a, b) => {
        const numA = parseFloat(a.name.replace(/[^0-9.]/g, '')) || 0;
        const numB = parseFloat(b.name.replace(/[^0-9.]/g, '')) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });

      const t1 = sortedTowers[0]; // Tower Kecil
      const t2 = sortedTowers[sortedTowers.length - 1]; // Tower Besar

      if (t1 && t2) {
        const avgLatRad = ((t1.lat + t2.lat) / 2) * (Math.PI / 180);
        dx = (t2.lng - t1.lng) * Math.cos(avgLatRad);
        dy = t2.lat - t1.lat;
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
          foundVector = true;
        }
      }
    }

    // Fallback if tower points are missing: find 2 furthest points across all loaded GeoJSON features for current span
    if (!foundVector) {
      const allPts: [number, number][] = [];
      loadedGeoJSONs.forEach(layer => {
        if (!layer?.data?.features) return;
        layer.data.features.forEach((f: any) => {
          const geom = f.geometry;
          if (!geom?.coordinates) return;
          const collectPts = (c: any) => {
            if (typeof c[0] === 'number' && typeof c[1] === 'number') {
              allPts.push([c[0], c[1]]);
            } else if (Array.isArray(c)) {
              c.forEach(collectPts);
            }
          };
          collectPts(geom.coordinates);
        });
      });

      if (allPts.length >= 2) {
        let maxDistSq = -1;
        let pBest1: [number, number] | null = null;
        let pBest2: [number, number] | null = null;
        const refLat = allPts[0][1];
        const cosLat = Math.cos((refLat * Math.PI) / 180);

        const step = Math.max(1, Math.floor(allPts.length / 80));
        for (let i = 0; i < allPts.length; i += step) {
          for (let j = i + 1; j < allPts.length; j += step) {
            const dX = (allPts[j][0] - allPts[i][0]) * cosLat;
            const dY = allPts[j][1] - allPts[i][1];
            const dSq = dX * dX + dY * dY;
            if (dSq > maxDistSq) {
              maxDistSq = dSq;
              pBest1 = allPts[i];
              pBest2 = allPts[j];
            }
          }
        }

        if (pBest1 && pBest2 && maxDistSq > 1e-12) {
          dx = (pBest2[0] - pBest1[0]) * cosLat;
          dy = pBest2[1] - pBest1[1];
          foundVector = true;
        }
      }
    }

    if (!foundVector) return null;

    // Viewport Rotation angle (deg) to orient vector (dx, dy) horizontally on screen
    const autoRot = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    return autoRot;
  }, [towerPoints, loadedGeoJSONs]);

  // Combined Base Rotation: Prefer tower line bearing calculation if available, else fall back to GeoJSON attribute rotation
  const computedBaseRotasi = useMemo(() => {
    if (towerCalculatedRotasi !== null) {
      return towerCalculatedRotasi;
    }
    return baseGeojsonRotasi;
  }, [towerCalculatedRotasi, baseGeojsonRotasi]);

  // Formula: FinalRotation = BaseRotation (Line Bearing / GeoJSON) + UserRotationOffset + ProjectionCorrection
  const effectiveRotationAngle = useMemo(() => {
    return ((computedBaseRotasi + rotasiOffset + projectionCorrection) % 360 + 360) % 360;
  }, [computedBaseRotasi, rotasiOffset, projectionCorrection]);

  // Helper to extract building rows for a record
  const getRecordBuildings = (r: any): { bentuk: string; luas: string }[] => {
    const result: { bentuk: string; luas: string }[] = [];

    if (Array.isArray(r.buildings)) {
      r.buildings.forEach((b: any) => {
        if (!b) return;
        const btk = (b.bentuk || b.jenis || b.BENTUK_BANGUNAN || b.BENTUK || '').trim();
        const ls = (b.luas || b.LUAS_BANGUNAN || b.LUAS || '').trim();
        if (btk || ls) {
          const cleanBtk = btk ? (btk.toUpperCase().startsWith('BANGUNAN') ? btk.toUpperCase() : `BANGUNAN (${btk.toUpperCase()})`) : 'BANGUNAN';
          result.push({ bentuk: cleanBtk, luas: ls });
        }
      });
    }

    if (result.length === 0) {
      for (let i = 1; i <= 8; i++) {
        const btk = (r[`BENTUK BANGUNAN ${i}`] || r[`BENTUK_BANGUNAN_${i}`] || r[`JENIS BANGUNAN ${i}`] || '').trim();
        const ls = (r[`LUAS BANGUNAN ${i}`] || r[`LUAS_BANGUNAN_${i}`] || '').trim();
        if (btk || ls) {
          const cleanBtk = btk ? (btk.toUpperCase().startsWith('BANGUNAN') ? btk.toUpperCase() : `BANGUNAN (${btk.toUpperCase()})`) : 'BANGUNAN';
          result.push({ bentuk: cleanBtk, luas: ls });
        }
      }
    }

    if (result.length === 0) {
      const btk = (r.BENTUK_BANGUNAN || r.BANGUNAN || r.BENTUK || r['BENTUK BANGUNAN'] || '').trim();
      const ls = (r.LUAS_BANGUNAN || r.LUAS_BANG || r['LUAS BANGUNAN'] || '').trim();
      if (btk || ls) {
        const cleanBtk = btk ? (btk.toUpperCase().startsWith('BANGUNAN') ? btk.toUpperCase() : `BANGUNAN (${btk.toUpperCase()})`) : 'BANGUNAN';
        result.push({ bentuk: cleanBtk, luas: ls });
      }
    }

    return result;
  };

  // Initialize & Synchronize Leaflet Map instances
  useEffect(() => {
    if (!topMapContainerRef.current || !bottomMapContainerRef.current) return;

    // Destroy previous map instances if existing
    if (topMapRef.current) {
      topMapRef.current.remove();
      topMapRef.current = null;
    }
    if (bottomMapRef.current) {
      bottomMapRef.current.remove();
      bottomMapRef.current = null;
    }

    // Default center (Kebondalem / Banyusari)
    const initialCenter: L.LatLngExpression = [-7.284, 110.355];
    const initialZoom = 17;

    // 1. Initialize Top Map (Sket / Vector Light Basemap)
    const topMap = L.map(topMapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false
    });

    // Top Basemap: CartoDB Positron / Clean Light Tile Layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd'
    }).addTo(topMap);

    topMapRef.current = topMap;

    // 2. Initialize Bottom Map (Satellite Basemap)
    const bottomMap = L.map(bottomMapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false
    });

    // Bottom Basemap: Google Satellite / Esri World Imagery
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 20
    }).addTo(bottomMap);

    bottomMapRef.current = bottomMap;

    // 3. Map Sync Handler (Top -> Bottom)
    const syncTopToBottom = () => {
      if (isSyncingRef.current || !bottomMapRef.current) return;
      isSyncingRef.current = true;
      bottomMapRef.current.setView(topMap.getCenter(), topMap.getZoom(), { animate: false });
      isSyncingRef.current = false;
    };

    // 4. Map Sync Handler (Bottom -> Top)
    const syncBottomToTop = () => {
      if (isSyncingRef.current || !topMapRef.current) return;
      isSyncingRef.current = true;
      topMapRef.current.setView(bottomMap.getCenter(), bottomMap.getZoom(), { animate: false });
      isSyncingRef.current = false;
    };

    topMap.on('move', syncTopToBottom);
    bottomMap.on('move', syncBottomToTop);

    // Dynamic Scale Calculation
    const updateMapScale = () => {
      if (!topMapRef.current) return;
      const zoom = topMapRef.current.getZoom();
      const center = topMapRef.current.getCenter();
      const latRad = (center.lat * Math.PI) / 180;
      const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);
      const rawScale = metersPerPixel * 3779.52;

      let roundedScale = 1000;
      if (rawScale < 350) roundedScale = 250;
      else if (rawScale < 650) roundedScale = 500;
      else if (rawScale < 850) roundedScale = 750;
      else if (rawScale < 1250) roundedScale = 1000;
      else if (rawScale < 1750) roundedScale = 1500;
      else if (rawScale < 2500) roundedScale = 2000;
      else if (rawScale < 3500) roundedScale = 3000;
      else if (rawScale < 7500) roundedScale = 5000;
      else roundedScale = Math.round(rawScale / 1000) * 1000;

      setCurrentScaleText(`1 : ${roundedScale.toLocaleString('id-ID')}`);
    };

    topMap.on('zoomend', updateMapScale);
    topMap.on('moveend', updateMapScale);
    updateMapScale();

    return () => {
      topMap.off('move', syncTopToBottom);
      bottomMap.off('move', syncBottomToTop);
      topMap.off('zoomend', updateMapScale);
      topMap.off('moveend', updateMapScale);
      topMap.remove();
      bottomMap.remove();
      topMapRef.current = null;
      bottomMapRef.current = null;
    };
  }, []);

  // Render Features & Layers on Both Maps
  useEffect(() => {
    const topMap = topMapRef.current;
    const bottomMap = bottomMapRef.current;
    if (!topMap || !bottomMap || !selectedDesa) return;

    const normSelDesa = normalizeDesa(selectedDesa);
    const normSelSpan = normalizeSpan(selectedSpan);

    // Group for layer removal
    const topLayerGroup = L.layerGroup().addTo(topMap);
    const bottomLayerGroup = L.layerGroup().addTo(bottomMap);

    const spanBidangBounds: L.LatLngBounds[] = [];
    const spanOtherBounds: L.LatLngBounds[] = [];

    // Iterate through loaded GeoJSON layers
    loadedGeoJSONs.forEach(layer => {
      if (!layer.data?.features) return;

      const isTowerLayer = layer.type === 'tower' || /tower|tapak|tw/i.test(layer.name || '') || /tower|tapak|tw/i.test(layer.id || '');
      const isJalurLayer = layer.type === 'jalur';

      layer.data.features.forEach((feature: any) => {
        const props = feature.properties || {};
        const featDesa = layer.fieldMapping?.desa 
          ? props[layer.fieldMapping.desa] 
          : findPropCaseInsensitive(props, ['desa', 'village', 'kelurahan']);
        const featSpan = layer.fieldMapping?.span 
          ? props[layer.fieldMapping.span] 
          : findPropCaseInsensitive(props, ['span', 'section', 'jalur']);
        const featNobid = layer.fieldMapping?.nobid 
          ? props[layer.fieldMapping.nobid] 
          : findPropCaseInsensitive(props, ['nobiddc', 'nobiddis', 'nobid', 'no_bidang', 'no_bid', 'nomor', 'nomer', 'nib']);

        const isSameDesa = !normSelDesa || normalizeDesa(featDesa) === normSelDesa;
        const isSameSpan = normSelSpan && normalizeSpan(featSpan) === normSelSpan;
        const isFeatureTower = isTowerLayer || Boolean(
          findPropCaseInsensitive(props, [
            'towernumb', 'tower_numb', 'tower', 'no_tower', 'id_tower', 'nomor_tower', 
            'no_tapak', 'tapak', 'tapaktower', 'tapak_tower', 'id_tapak', 'tower_no'
          ]) ||
          (props.type && String(props.type).toLowerCase().includes('tower')) ||
          (props.layer && String(props.layer).toLowerCase().includes('tower')) ||
          (props.layer && String(props.layer).toLowerCase().includes('tapak'))
        );

        // On this view: render all features in selectedDesa, highlight features in selectedSpan
        if (isSameDesa || isJalurLayer || isFeatureTower) {
          const isHighlighted = isSameSpan || isJalurLayer || isFeatureTower;

          // Check if feature represents a road or water body
          const propsStr = JSON.stringify(props).toLowerCase();
          const isRoad = /\b(jalan|jln|road|gang|akses|street|sarana_jalan|sarana_jln)\b/i.test(propsStr);
          const isWater = /\b(sungai|kali|saluran|air|river|stream|drainase|parit|rawa|danau|badan_air|badan_sungai)\b/i.test(propsStr);

          // GeoJSON Styling for Top Map (Sket Vektor)
          let topStyle: L.PathOptions;
          let bottomStyle: L.PathOptions;

          if (isRoad) {
            topStyle = {
              color: '#dc2626',
              weight: isHighlighted ? 2.5 : 1.5,
              fillColor: '#ef4444',
              fillOpacity: isHighlighted ? 0.6 : 0.3
            };
            bottomStyle = {
              color: '#f87171',
              weight: isHighlighted ? 2.5 : 1.5,
              fillColor: '#dc2626',
              fillOpacity: isHighlighted ? 0.7 : 0.35
            };
          } else if (isWater) {
            topStyle = {
              color: '#0284c7',
              weight: isHighlighted ? 2.5 : 1.5,
              fillColor: '#38bdf8',
              fillOpacity: isHighlighted ? 0.6 : 0.3
            };
            bottomStyle = {
              color: '#38bdf8',
              weight: isHighlighted ? 2.5 : 1.5,
              fillColor: '#0284c7',
              fillOpacity: isHighlighted ? 0.7 : 0.35
            };
          } else if (isFeatureTower) {
            topStyle = {
              color: '#dc2626',
              weight: 2,
              fillColor: '#ef4444',
              fillOpacity: 0.6
            };
            bottomStyle = {
              color: '#f87171',
              weight: 2,
              fillColor: '#dc2626',
              fillOpacity: 0.7
            };
          } else {
            topStyle = {
              color: isHighlighted ? '#2563eb' : '#94a3b8',
              weight: isHighlighted ? 2.5 : 1,
              fillColor: isHighlighted ? '#3b82f6' : '#e2e8f0',
              fillOpacity: isHighlighted ? 0.35 : 0.15,
              dashArray: isJalurLayer ? '6,6' : undefined
            };
            bottomStyle = {
              color: isHighlighted ? '#38bdf8' : '#cbd5e1',
              weight: isHighlighted ? 2.5 : 1,
              fillColor: isHighlighted ? '#38bdf8' : '#64748b',
              fillOpacity: isHighlighted ? 0.45 : 0.2,
              dashArray: isJalurLayer ? '6,6' : undefined
            };
          }

          // Clean number string (strip 'No. ', 'No ', 'Bidang ', etc.)
          let cleanNum = featNobid ? String(featNobid).trim().replace(/^(no\.\s*|no\s+|bidang\s+|no:\s*)/i, '').trim() : '';

          // Determine label for feature (number for plot, name for road/river)
          let displayLabel = cleanNum;
          if (!displayLabel) {
            const otherLabel = findPropCaseInsensitive(props, ['nama', 'name', 'ket', 'deskripsi', 'jalan', 'sungai', 'objek', 'obyek', 'tipe']);
            if (otherLabel) displayLabel = String(otherLabel).trim();
          }
          if (!displayLabel && isRoad) displayLabel = 'JALAN';
          if (!displayLabel && isWater) displayLabel = 'SUNGAI';

          const towerLabel = featPropsTower(feature.properties, layer);

          // Render on Top Map
          const topGeoLayer = L.geoJSON(feature, {
            style: () => topStyle,
            pointToLayer: (feat, latlng) => {
              if (isFeatureTower) {
                const icon = L.divIcon({
                  className: 'custom-tower-marker-top',
                  html: `
                    <div class="relative flex flex-col items-center justify-center transition-transform duration-300 pointer-events-none" style="transform: rotate(${-effectiveRotationAngle}deg); transform-origin: center;">
                      <div class="w-5 h-5 border-2 border-red-600 bg-red-500/40 flex items-center justify-center shadow-md rounded-xs">
                        <span class="text-red-700 font-extrabold text-[10px] leading-none">✕</span>
                      </div>
                      <span class="mt-0.5 bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap border border-white leading-none">
                        ${towerLabel}
                      </span>
                    </div>
                  `,
                  iconSize: [32, 36],
                  iconAnchor: [16, 18]
                });
                return L.marker(latlng, { icon });
              }
              return L.circleMarker(latlng, { radius: 5, color: '#2563eb' });
            },
            onEachFeature: (feat, l) => {
              if (isFeatureTower) {
                if (feat.geometry?.type !== 'Point') {
                  const labelHtml = `<div style="transform: rotate(${-effectiveRotationAngle}deg); transform-origin: center; display: inline-block; white-space: nowrap; transition: transform 0.3s ease;" class="bg-red-600 text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded shadow border border-white">${towerLabel}</div>`;
                  l.bindTooltip(labelHtml, { permanent: true, direction: 'center', className: 'map-tower-tooltip' });
                }
              } else if (displayLabel && isSameSpan) {
                const labelHtml = `<div style="transform: rotate(${-effectiveRotationAngle}deg); transform-origin: center; display: inline-block; white-space: nowrap; transition: transform 0.3s ease;">${displayLabel}</div>`;
                l.bindTooltip(labelHtml, { permanent: true, direction: 'center', className: 'map-nobid-tooltip-top' });
              }
            }
          }).addTo(topLayerGroup);

          // Render on Bottom Map
          const bottomGeoLayer = L.geoJSON(feature, {
            style: () => bottomStyle,
            pointToLayer: (feat, latlng) => {
              if (isFeatureTower) {
                const icon = L.divIcon({
                  className: 'custom-tower-marker-bottom',
                  html: `
                    <div class="relative flex flex-col items-center justify-center transition-transform duration-300 pointer-events-none" style="transform: rotate(${-effectiveRotationAngle}deg); transform-origin: center;">
                      <div class="w-5 h-5 border-2 border-red-500 bg-red-500/50 flex items-center justify-center shadow-lg rounded-xs">
                        <span class="text-white font-extrabold text-[10px] leading-none">✕</span>
                      </div>
                      <span class="mt-0.5 bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap border border-white leading-none">
                        ${towerLabel}
                      </span>
                    </div>
                  `,
                  iconSize: [32, 36],
                  iconAnchor: [16, 18]
                });
                return L.marker(latlng, { icon });
              }
              return L.circleMarker(latlng, { radius: 5, color: '#38bdf8' });
            },
            onEachFeature: (feat, l) => {
              if (isFeatureTower) {
                if (feat.geometry?.type !== 'Point') {
                  const labelHtml = `<div style="transform: rotate(${-effectiveRotationAngle}deg); transform-origin: center; display: inline-block; white-space: nowrap; transition: transform 0.3s ease;" class="bg-red-600 text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded shadow border border-white">${towerLabel}</div>`;
                  l.bindTooltip(labelHtml, { permanent: true, direction: 'center', className: 'map-tower-tooltip' });
                }
              } else if (displayLabel && isSameSpan) {
                const labelHtml = `<div style="transform: rotate(${-effectiveRotationAngle}deg); transform-origin: center; display: inline-block; white-space: nowrap; transition: transform 0.3s ease;">${displayLabel}</div>`;
                l.bindTooltip(labelHtml, { permanent: true, direction: 'center', className: 'map-nobid-tooltip-bottom' });
              }
            }
          }).addTo(bottomLayerGroup);

          // Collect bounds for camera fit - prioritize bidang layer
          if (isSameSpan && topGeoLayer.getBounds().isValid()) {
            if (layer.type === 'bidang') {
              spanBidangBounds.push(topGeoLayer.getBounds());
            } else {
              spanOtherBounds.push(topGeoLayer.getBounds());
            }
          }
        }
      });
    });

    // Fit camera view tightly to highlighted span features
    const boundsToFit = spanBidangBounds.length > 0 ? spanBidangBounds : spanOtherBounds;
    if (boundsToFit.length > 0) {
      let mergedBounds = boundsToFit[0];
      for (let i = 1; i < boundsToFit.length; i++) {
        mergedBounds.extend(boundsToFit[i]);
      }
      topMap.invalidateSize();
      bottomMap.invalidateSize();
      topMap.fitBounds(mergedBounds, { padding: [15, 15], maxZoom: 19 });
      bottomMap.fitBounds(mergedBounds, { padding: [15, 15], maxZoom: 19 });
    } else {
      topMap.invalidateSize();
      bottomMap.invalidateSize();
    }

    return () => {
      topLayerGroup.clearLayers();
      bottomLayerGroup.clearLayers();
    };
  }, [loadedGeoJSONs, selectedDesa, selectedSpan, effectiveRotationAngle]);

  // Invalidate map size when rotation changes to ensure tiles fill oversized canvas
  useEffect(() => {
    if (topMapRef.current) topMapRef.current.invalidateSize();
    if (bottomMapRef.current) bottomMapRef.current.invalidateSize();
  }, [effectiveRotationAngle]);

  // Quick rotation offset controls
  const handleQuickRotate = (delta: number) => {
    setRotasiOffset(prev => (prev + delta + 360) % 360);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPNG = async () => {
    const elem = document.getElementById('printable-map-span-layout');
    if (!elem) return;
    setIsExportingPNG(true);
    try {
      await new Promise(r => setTimeout(r, 250));
      const dataUrl = await toPng(elem, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `PETA_BIDANG_${selectedDesa || 'DESA'}_${selectedSpan || 'SPAN'}.png`.replace(/\s+/g, '_');
      link.click();
    } catch (error) {
      console.error('Failed to export PNG layout:', error);
      alert('Gagal mengunduh layout PNG. Silakan coba lagi.');
    } finally {
      setIsExportingPNG(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* CSS Styles for Tooltips & Printable Layout */}
      <style>{`
        .map-nobid-tooltip-top {
          background-color: rgba(255, 255, 255, 0.95) !important;
          border: 1.5px solid #2563eb !important;
          color: #1e3a8a !important;
          font-weight: 800 !important;
          font-size: 8.5px !important;
          padding: 1.5px 5px !important;
          border-radius: 9999px !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
        }
        .map-nobid-tooltip-bottom {
          background-color: rgba(15, 23, 42, 0.92) !important;
          border: 1.5px solid #38bdf8 !important;
          color: #f0f9ff !important;
          font-weight: 800 !important;
          font-size: 8.5px !important;
          padding: 1.5px 5px !important;
          border-radius: 9999px !important;
          box-shadow: 0 1px 5px rgba(0,0,0,0.4) !important;
        }
        .map-tower-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .custom-tower-marker-top,
        .custom-tower-marker-bottom,
        .custom-tower-marker,
        .leaflet-div-icon.custom-tower-marker-top,
        .leaflet-div-icon.custom-tower-marker-bottom {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-map-span-layout, #printable-map-span-layout * {
            visibility: visible;
          }
          #printable-map-span-layout {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header & Controls Bar */}
      <div className="no-print bg-slate-900/90 backdrop-blur border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[11px] font-bold">
                1.3. Peta Bidang Tanah
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[11px] font-bold">
                2 Muka Peta (Vektor & Citra Satelit)
              </span>
            </div>
            <h1 className="text-xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-400" />
              PETA BIDANG TANAH PER SPAN & DESA
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualisasi 2 muka peta (Sketsa biasa & Citra Satelit/Drone) berbasis kode kombinasi <span className="font-mono text-amber-300 font-bold">DESA_SPAN</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPNG}
              disabled={isExportingPNG}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-lg cursor-pointer"
            >
              {isExportingPNG ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengunduh PNG...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Unduh Layout Peta (PNG)
                </>
              )}
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-2 shadow cursor-pointer border border-slate-700"
            >
              <Printer className="w-4 h-4" />
              Cetak (PDF)
            </button>
          </div>
        </div>

        {/* Filters & Rotation Adjustment Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/10">
          {/* Desa Filter */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1">
              Pilih Desa / Kelurahan:
            </label>
            <select
              value={selectedDesa}
              onChange={(e) => setSelectedDesa(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
            >
              {desaOptions.map(d => (
                <option key={d} value={d}>Desa {d}</option>
              ))}
            </select>
          </div>

          {/* Span Filter */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1">
              Pilih Span Transmission Line:
            </label>
            <select
              value={selectedSpan}
              onChange={(e) => setSelectedSpan(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
            >
              {spanOptions.map(s => (
                <option key={s} value={s}>Span {s}</option>
              ))}
            </select>
          </div>

          {/* Identification Code Badge */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1">
              Kode Identifikasi Span & Desa:
            </label>
            <div className="w-full bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 truncate flex items-center justify-between">
              <span>📍 {desaSpanCode}</span>
              <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-200">AUTO</span>
            </div>
          </div>

          {/* Rotation Management / Custom Adjustment */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1 flex items-center justify-between">
              <span>Rotasi Viewport Peta (Line Bearing Tower / Map Series):</span>
              <span className="text-emerald-400 font-mono text-[10px]">
                {effectiveRotationAngle.toFixed(1)}° ({towerCalculatedRotasi !== null ? `Bearing Tower ${computedBaseRotasi.toFixed(1)}°` : `GeoJSON ${baseGeojsonRotasi}°`} + Offset {rotasiOffset > 0 ? `+${rotasiOffset}` : rotasiOffset}°)
              </span>
            </label>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => handleQuickRotate(-90)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700"
                title="Putar -90 Derajat"
              >
                -90°
              </button>
              <button
                onClick={() => handleQuickRotate(-15)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700"
                title="Putar -15 Derajat"
              >
                -15°
              </button>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-400 font-medium">Offset:</span>
                <input
                  type="number"
                  value={rotasiOffset}
                  onChange={(e) => setRotasiOffset(Number(e.target.value) || 0)}
                  className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-white focus:outline-none focus:border-amber-500"
                  placeholder="Offset"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-400 font-medium" title="Koreksi Proyeksi UTM/WGS84">Koreksi:</span>
                <input
                  type="number"
                  step="0.1"
                  value={projectionCorrection}
                  onChange={(e) => setProjectionCorrection(Number(e.target.value) || 0)}
                  className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                  placeholder="Koreksi"
                />
              </div>
              <button
                onClick={() => handleQuickRotate(15)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700"
                title="Putar +15 Derajat"
              >
                +15°
              </button>
              <button
                onClick={() => handleQuickRotate(90)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700"
                title="Putar +90 Derajat"
              >
                +90°
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PRINTABLE DUAL MAP & TABULAR LAYOUT FRAME */}
      <div 
        id="printable-map-span-layout" 
        className="bg-white border-2 border-slate-900 rounded-2xl shadow-2xl p-4 md:p-6 space-y-4 text-slate-900"
      >
        {/* Frame Title Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
          <div>
            <h2 className="text-lg font-black tracking-tight uppercase text-slate-900">
              PETA LOKASI BIDANG TANAH & KORIDOR JALUR TRANSMISI
            </h2>
            <p className="text-xs font-semibold text-slate-600">
              DESA: <span className="font-bold text-slate-900">{selectedDesa || '-'}</span> | SPAN: <span className="font-bold text-slate-900">{selectedSpan || '-'}</span> | KODE: <span className="font-mono text-amber-600 font-bold">{desaSpanCode}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono font-bold text-slate-500 block">PROYEK TRANSMISI</span>
            <span className="text-xs font-black text-slate-800 uppercase">{activeProjectName || 'SUTT / SUTET'}</span>
          </div>
        </div>

        {/* DUAL MAP PANES (STACKED VERTICALLY LIKE REFERENCE IMAGE) */}
        <div className="space-y-4">
          {/* MUKA PETA 1: SKET BIASA (SKETSA VEKTOR) */}
          <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-slate-50">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                MUKA PETA 1: SKETSA LAYOUT VEKTOR (DESA {selectedDesa})
              </span>
              <span className="text-[10px] font-mono text-slate-500">Sket Kontur & Batas Tanah</span>
            </div>
            {/* Map Container Top with Oversized Rotated View */}
            <div className="relative w-full h-[320px] overflow-hidden flex items-center justify-center bg-slate-100">
              <div 
                className="w-[350%] h-[500%] shrink-0 transition-transform duration-300 origin-center flex items-center justify-center"
                style={{ transform: `rotate(${effectiveRotationAngle}deg)` }}
              >
                <div ref={topMapContainerRef} className="w-full h-full z-0" />
              </div>
              {/* Overlay Label for Village Boundary */}
              <div className="absolute top-2 left-3 bg-white/95 border border-slate-400 px-2.5 py-1 rounded shadow text-[10px] font-extrabold text-slate-800 pointer-events-none z-10">
                DESA {selectedDesa}
              </div>
            </div>
          </div>

          {/* MUKA PETA 2: CITRA SATELIT / DRONE */}
          <div className="border-2 border-slate-800 rounded-xl overflow-hidden bg-slate-900">
            <div className="bg-slate-800 text-white px-3 py-1.5 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-100 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                MUKA PETA 2: FOTO CITRA DRONE / SATELIT (SPAN {selectedSpan})
              </span>
              <span className="text-[10px] font-mono text-slate-300">Resolusi Tinggi</span>
            </div>
            {/* Map Container Bottom with Oversized Rotated View */}
            <div className="relative w-full h-[320px] overflow-hidden flex items-center justify-center bg-slate-950">
              <div 
                className="w-[350%] h-[500%] shrink-0 transition-transform duration-300 origin-center flex items-center justify-center"
                style={{ transform: `rotate(${effectiveRotationAngle}deg)` }}
              >
                <div ref={bottomMapContainerRef} className="w-full h-full z-0" />
              </div>
              {/* Overlay Label for Village Boundary */}
              <div className="absolute top-2 left-3 bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded shadow text-[10px] font-extrabold text-white pointer-events-none z-10">
                DESA {selectedDesa}
              </div>
            </div>
          </div>
        </div>

        {/* INFORMATION BAR UNDER MAPS (LEGENDA, ARAH UTARA, SKALA, KOORDINAT TOWER) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 text-slate-800 text-xs">
          {/* LEGENDA PETA (4 cols) */}
          <div className="md:col-span-4 border-2 border-slate-800 rounded-xl p-3 space-y-2">
            <div className="font-extrabold text-[11px] uppercase tracking-wider border-b border-slate-300 pb-1 text-slate-900">
              LEGENDA PETA :
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 border border-red-600 bg-red-500/30 flex items-center justify-center font-bold text-red-600 text-[9px] shrink-0">✕</div>
                <span>Tapak Tower</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 bg-blue-500/30 border border-blue-600 shrink-0" />
                <span>Areal Bidang Tanah</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0 border-b-2 border-dashed border-orange-500 shrink-0" />
                <span>Koridor ROW</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 bg-cyan-400/30 border border-cyan-500 shrink-0" />
                <span>Areal Badan Air</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0 border-b-2 border-dashdot border-slate-800 shrink-0" />
                <span>Batas Desa</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-3 bg-red-400/30 border border-red-500 shrink-0" />
                <span>Areal Jalan</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <div className="w-4 h-4 rounded-full border border-blue-600 bg-blue-100 text-blue-900 font-extrabold flex items-center justify-center text-[8px] shrink-0">1</div>
                <span>Nomor Bidang Tanah</span>
              </div>
            </div>
          </div>

          {/* ARAH UTARA & SKALA (4 cols) */}
          <div className="md:col-span-4 border-2 border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center text-center space-y-2">
            <div className="flex items-center gap-2">
              {/* Rotated Compass Arrow */}
              <div 
                className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center bg-slate-100 shadow-inner transition-transform duration-300"
                style={{ transform: `rotate(${-effectiveRotationAngle}deg)` }}
              >
                <ArrowUp className="w-5 h-5 text-red-600 font-extrabold" />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-black uppercase text-slate-800 block">ARAH UTARA</span>
                <span className="text-[9px] text-slate-500 font-mono block">Rotasi: {effectiveRotationAngle}°</span>
              </div>
            </div>
            <div className="border-t border-slate-300 w-full pt-1.5">
              <span className="text-xs font-black text-slate-900 block">Skala : {currentScaleText}</span>
              <span className="text-[9px] text-slate-500 block">otomatis beradaptasi pada muka peta 550 mm x 230 mm</span>
            </div>
          </div>

          {/* TABEL KOORDINAT TOWER (4 cols) */}
          <div className="md:col-span-4 border-2 border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-100 border-b border-slate-800 px-2 py-1 font-extrabold text-[10px] uppercase text-slate-800 text-center">
              KOORDINAT TAPAK TOWER ({selectedSpan || 'SPAN'})
            </div>
            <table className="w-full text-[10px] text-center border-collapse">
              <thead>
                <tr className="bg-slate-200 border-b border-slate-800 font-bold text-slate-800">
                  <th className="py-1 px-1 border-r border-slate-800">TOWER</th>
                  <th className="py-1 px-1 border-r border-slate-800">X (EASTING)</th>
                  <th className="py-1 px-1">Y (NORTHING)</th>
                </tr>
              </thead>
              <tbody>
                {towerPoints.length > 0 ? (
                  towerPoints.map((tw, idx) => (
                    <tr key={idx} className="border-b border-slate-300 font-mono">
                      <td className="py-1 px-1 border-r border-slate-800 font-bold bg-slate-50">{tw.name}</td>
                      <td className="py-1 px-1 border-r border-slate-800">{tw.lng.toFixed(5)}</td>
                      <td className="py-1 px-1">{tw.lat.toFixed(5)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-2 text-slate-400 italic text-[9px]">
                      Data koordinat tower dimuat otomatis dari layer GeoJSON Tower
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABEL DATA BIDANG TANAH SPREADSHEET (SESUAI KODE DESA_SPAN) */}
        <div className="border-2 border-slate-800 rounded-xl overflow-hidden pt-1">
          <div className="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              DAFTAR BIDANG TANAH TERDAMPAK (SINKRON SPREADSHEET - KODE: {desaSpanCode})
            </span>
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
              Total {filteredRecords.length} Bidang
            </span>
          </div>

          <div className="table-scroll-container overflow-auto max-h-[380px] scrollbar-thin print:max-h-none print:overflow-visible">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 print:static">
                <tr className="bg-slate-100 border-b-2 border-slate-800 font-extrabold text-slate-900 uppercase text-[10px]">
                  <th className="py-2 px-3 border-r border-slate-800 text-center w-12">No. Bidang</th>
                  <th className="py-2 px-3 border-r border-slate-800">Nama Pihak yang Berhak</th>
                  <th className="py-2 px-3 border-r border-slate-800">Obyek / Pengunaan Lahan</th>
                  <th className="py-2 px-3 text-right w-28">Luas (m²)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {filteredRecords.length > 0 ? (
                  filteredRecords.flatMap((r, i) => {
                    const parentNoBid = r.NOBID || String(i + 1);
                    const buildings = getRecordBuildings(r);
                    const parentRow = (
                      <tr 
                        key={r.ID_UNIK || `parent-${i}`} 
                        onClick={() => onNavigateToInput && onNavigateToInput(r)}
                        className="hover:bg-amber-50/70 transition font-medium cursor-pointer group"
                        title="Klik untuk langsung mengedit bidang tanah ini di menu Input & Edit Lahan"
                      >
                        <td className="py-2 px-3 border-r border-slate-300 text-center font-bold bg-slate-50 group-hover:bg-amber-100 group-hover:text-amber-900 transition">
                          {parentNoBid}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-300 font-bold text-slate-900 uppercase group-hover:text-amber-600 transition">
                          <div className="flex items-center justify-between gap-2">
                            <span>{r.NAMA || '-'}</span>
                            <div className="flex items-center gap-1">
                              <span className="opacity-0 group-hover:opacity-100 bg-amber-500 text-slate-950 font-bold text-[9px] px-2 py-0.5 rounded font-sans flex items-center gap-1 shadow-sm shrink-0 transition-opacity">
                                <Edit3 className="w-2.5 h-2.5" /> Edit
                              </span>
                              {role === 'ADMIN' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRecordToDelete(r);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 bg-rose-600 hover:bg-rose-700 text-white text-[9px] px-2 py-0.5 rounded font-sans font-bold flex items-center gap-1 shadow-sm shrink-0 transition-opacity cursor-pointer"
                                  title="Hapus bidang ini dari spreadsheet & database (Khusus Admin)"
                                >
                                  <Trash2 className="w-2.5 h-2.5" /> Hapus
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 border-r border-slate-300 text-slate-700 uppercase font-semibold">
                          {r.PENUTUP_LAHAN || r.OBYEK || r.PEKERJAAN || 'SAWAH / LADANG'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {r.LUAS ? Number(r.LUAS).toLocaleString('id-ID') : '0'}
                        </td>
                      </tr>
                    );

                    const bRows = buildings.map((b, bIdx) => {
                      const letter = String.fromCharCode(97 + bIdx); // 'a', 'b', 'c'...
                      return (
                        <tr 
                          key={`${r.ID_UNIK || i}-bld-${bIdx}`} 
                          onClick={() => onNavigateToInput && onNavigateToInput(r)}
                          className="bg-amber-50/50 hover:bg-amber-100/70 transition text-slate-800 cursor-pointer group"
                          title="Klik untuk mengedit data bidang & bangunan ini"
                        >
                          <td className="py-1.5 px-3 border-r border-slate-300 text-center font-bold text-amber-900 bg-amber-100/60 group-hover:bg-amber-200">
                            {parentNoBid}{letter}
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-300 text-slate-400 italic">
                            -
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-300 text-amber-950 font-bold text-[11px]">
                            {b.bentuk}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-900">
                            {b.luas ? Number(b.luas).toLocaleString('id-ID') : '0'}
                          </td>
                        </tr>
                      );
                    });

                    return [parentRow, ...bRows];
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 italic">
                      Tidak ada data bidang tanah spreadsheet untuk kode <span className="font-mono font-bold">{desaSpanCode}</span>.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredRecords.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-200 border-t-2 border-slate-800 font-extrabold text-slate-900">
                    <td colSpan={3} className="py-2 px-3 border-r border-slate-800 text-right uppercase">
                      Total Luas Teridentifikasi ({filteredRecords.length} Bidang):
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-amber-900">
                      {totalLuas.toLocaleString('id-ID')} m²
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Footer Stamp / Sign-off */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-300 pt-2 font-mono">
          <span>Dihasilkan secara otomatis oleh Sistem Informasi Geografis Transmisi (GIS Ventura)</span>
          <span>Halaman Layout Peta Span & Desa: {selectedDesa}</span>
        </div>
      </div>

      {/* Modal Hapus Bidang untuk Admin */}
      {recordToDelete && (
        <DeleteParcelModal
          isOpen={!!recordToDelete}
          onClose={() => setRecordToDelete(null)}
          targetRecord={recordToDelete}
          allRecords={records}
          onConfirmDelete={async (updatedRecords, logMsg) => {
            const target = recordToDelete;
            setRecordToDelete(null);
            if (onDeleteRecord) {
              await onDeleteRecord(target, true);
            }
          }}
        />
      )}
    </div>
  );
}
