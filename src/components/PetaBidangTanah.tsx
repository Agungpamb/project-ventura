import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { toPng } from 'html-to-image';
import { 
  Map as MapIcon, Layers, Compass, RotateCw, Printer, Search, 
  ChevronDown, Info, Shield, CheckCircle2, FileText, ArrowUp, Download, Image as ImageIcon, Loader2,
  Edit3, ExternalLink, Trash2, MapPin, Navigation, X
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

  // Selected polygon / feature for navigation to Google Maps & details
  const [selectedFeature, setSelectedFeature] = useState<{
    props: any;
    coordinates?: { lat: number; lng: number } | null;
    record?: LandRecord | null;
    displayLabel?: string;
    towerLabel?: string;
    isTower?: boolean;
  } | null>(null);

  // Link URL to open Google Maps with precise pin in a new tab
  const googleMapsUrl = useMemo(() => {
    if (!selectedFeature) return null;
    if (selectedFeature.coordinates?.lat && selectedFeature.coordinates?.lng) {
      return `https://www.google.com/maps?q=${selectedFeature.coordinates.lat},${selectedFeature.coordinates.lng}&z=19`;
    }
    if (selectedFeature.record) {
      const q = [
        selectedFeature.record.DESA ? `Desa ${selectedFeature.record.DESA}` : '',
        selectedFeature.record.KECAMATAN ? `Kecamatan ${selectedFeature.record.KECAMATAN}` : '',
        'Indonesia'
      ].filter(Boolean).join(', ');
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }
    const desa = selectedFeature.props?.DESA || selectedFeature.props?.Desa || selectedFeature.props?.desa;
    if (desa) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Desa ${desa}, Indonesia`)}`;
    }
    return null;
  }, [selectedFeature]);

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
  // Total Area Calculation
  const totalLuas = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + (Number(r.LUAS) || 0), 0);
  }, [filteredRecords]);

  // ============================================================================
  // GEODETIC CONVERSION: WGS 1984 (Lat/Lng) -> UTM (Easting X, Northing Y) & Web Mercator
  // ============================================================================
  const wgs84ToUtm = (lat: number, lng: number): { x: number; y: number; zone: number; hemisphere: 'N' | 'S'; convergenceDeg: number } => {
    const a = 6378137.0; // WGS84 semi-major axis (m)
    const f = 1 / 298.257223563; // WGS84 flattening
    const k0 = 0.9996;
    const eSq = 2 * f - f * f;
    const ePrimeSq = eSq / (1 - eSq);

    const zone = Math.floor((lng + 180) / 6) + 1;
    const lonOrigin = (zone - 1) * 6 - 180 + 3; // Central meridian of UTM zone
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lng * Math.PI) / 180;
    const lonOriginRad = (lonOrigin * Math.PI) / 180;
    const dLon = lonRad - lonOriginRad;

    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const tanLat = Math.tan(latRad);

    const N = a / Math.sqrt(1 - eSq * sinLat * sinLat);
    const T = tanLat * tanLat;
    const C = ePrimeSq * cosLat * cosLat;
    const A = cosLat * dLon;

    const e4 = eSq * eSq;
    const e6 = e4 * eSq;
    const M =
      a *
      ((1 - eSq / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latRad -
        ((3 * eSq) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latRad) +
        ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latRad) -
        ((35 * e6) / 3072) * Math.sin(6 * latRad));

    const easting =
      500000.0 +
      k0 *
        N *
        (A +
          ((1 - T + C) * Math.pow(A, 3)) / 6 +
          ((5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * Math.pow(A, 5)) / 120);

    let northing =
      k0 *
      (M +
        N *
          tanLat *
          ((A * A) / 2 +
            ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
            ((61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * Math.pow(A, 6)) / 720));

    const hemisphere: 'N' | 'S' = lat < 0 ? 'S' : 'N';
    if (lat < 0) {
      northing += 10000000.0;
    }

    // Meridian convergence angle (gamma) in degrees
    const convergenceRad = Math.atan(Math.tan(dLon) * sinLat);
    const convergenceDeg = (convergenceRad * 180) / Math.PI;

    return { x: easting, y: northing, zone, hemisphere, convergenceDeg };
  };

  const wgs84ToWebMercator = (lat: number, lng: number): { x: number; y: number } => {
    const R = 6378137.0;
    const x = (lng * Math.PI * R) / 180.0;
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const latRad = (clampedLat * Math.PI) / 180.0;
    const y = R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return { x, y };
  };

  // Normalize any tower token e.g. "T.02", "T.2", "02", "2", "T.16A", "GI Jelok", "GI Sanggarahan"
  const normalizeTowerToken = (raw: any): { canonicalId: string; displayName: string; sortNum: number; suffix: string } | null => {
    if (raw === undefined || raw === null) return null;
    const str = String(raw).trim();
    if (!str) return null;

    // Check if Gardu Induk (GI)
    if (/\bgi\b/i.test(str)) {
      const cleanGi = str.replace(/\s+/g, ' ').trim();
      const upperGi = cleanGi.toUpperCase();
      // GI Jelok is at the start (Tower 0), GI Sanggarahan is at the end (Tower 9999)
      const isStartGi = /jelok|awal|start/i.test(upperGi);
      return {
        canonicalId: 'GI_' + upperGi.replace(/[^A-Z0-9]/g, ''),
        displayName: cleanGi.toUpperCase(),
        sortNum: isStartGi ? 0 : 99999,
        suffix: ''
      };
    }

    // Match T.40, T02, Tower 15A, or plain number 40
    const m = str.match(/^(?:t(?:ower|wr|pk|apak)?[\.\-_\s]*)?0*(\d+)([a-zA-Z]?)$/i);
    if (m) {
      const numVal = parseInt(m[1], 10);
      const numStr = String(isNaN(numVal) ? 0 : numVal);
      const suffix = (m[2] || '').toUpperCase();
      return {
        canonicalId: `T.${numStr}${suffix}`,
        displayName: `T.${numStr}${suffix}`,
        sortNum: numVal,
        suffix
      };
    }

    return null;
  };

  // Parse selectedSpan into [Tower Kecil (Left), Tower Besar (Right)]
  const parseSpanEndpoints = (spanStr: string) => {
    if (!spanStr) return [];
    const cleaned = spanStr.replace(/^span\s+/i, '').trim();
    const parts = cleaned
      .split(/\s*(?:[-–—/]|s\/d|sampai|to)\s*/i)
      .map(p => p.trim())
      .filter(Boolean);

    const parsed = parts
      .map(p => normalizeTowerToken(p))
      .filter((item): item is NonNullable<ReturnType<typeof normalizeTowerToken>> => item !== null);

    // Handle shorthand like "T.40-41" or "T.10-1"
    if (parsed.length === 2) {
      parsed.sort((a, b) => {
        if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
        return a.suffix.localeCompare(b.suffix);
      });
    }
    return parsed;
  };

  // Base GeoJSON Rotation detection from GeoJSON features in selected Desa/Span
  // Note: ArcGIS Data Driven Pages "ROTATE" attribute is Counter-Clockwise (CCW),
  // whereas CSS transform rotate() is Clockwise (CW) -> CSS Angle = (360 - ROTATE) % 360
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
            return ((360 - (rotNum % 360)) + 360) % 360;
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
      const tok = normalizeTowerToken(props[layer.fieldMapping.tower]);
      if (tok) return tok.displayName;
    }
    const primaryVal = findPropCaseInsensitive(props, [
      'towernumb', 'tower_numb', 'tower', 'no_tower', 'id_tower', 'nomor_tower', 'tower_no', 'nama', 'namobj', 'name', 'label'
    ]);
    if (primaryVal) {
      const tok = normalizeTowerToken(primaryVal);
      if (tok) return tok.displayName;
      return String(primaryVal).trim();
    }
    const nomerVal = findPropCaseInsensitive(props, ['nomer', 'nomor', 'no']);
    if (nomerVal) {
      const tok = normalizeTowerToken(nomerVal);
      if (tok) return tok.displayName;
    }
    return 'Tower';
  };

  // Extract Tower Coordinates (WGS84 Lng/Lat + UTM Easting X / Northing Y) strictly for towers in current active span,
  // OR automatically synthesize from As Tower (jalur) WGS84 LineString if tower points are not in a separate layer!
  const towerPoints = useMemo(() => {
    const list: { name: string; canonicalId: string; sortNum: number; lng: number; lat: number; utmX: number; utmY: number; utmZone: string }[] = [];
    if (!selectedSpan) return list;

    const targetEndpoints = parseSpanEndpoints(selectedSpan);
    const targetIds = new Set(targetEndpoints.map(e => e.canonicalId));

    const getFeatureCoords = (feat: any): { lng: number; lat: number } | null => {
      if (!feat.geometry) return null;
      const geomType = feat.geometry.type;
      const coords = feat.geometry.coordinates;

      if (geomType === 'Point' && Array.isArray(coords) && coords.length >= 2) {
        return { lng: Number(coords[0]), lat: Number(coords[1]) };
      }
      if ((geomType === 'Polygon' || geomType === 'MultiPolygon') && Array.isArray(coords)) {
        const pts: number[][] = geomType === 'Polygon' ? (coords[0] || []) : (coords[0]?.[0] || []);
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

    const foundTowersMap = new Map<string, typeof list[0]>();

    loadedGeoJSONs.forEach(layer => {
      if (!layer.data?.features) return;
      const isTowerLayer = layer.type === 'tower' || /tower|tapak|tw/i.test(layer.name || '') || /tower|tapak|tw/i.test(layer.id || '');
      // Do not extract point towers from parcel (bidang) polygons
      if (layer.type === 'bidang' && !isTowerLayer) return;

      layer.data.features.forEach((f: any) => {
        const props = f.properties || {};
        const coords = getFeatureCoords(f);
        if (!coords || isNaN(coords.lat) || isNaN(coords.lng)) return;

        // Strictly check tower name / number attributes (NEVER FID, OBJECTID, TAPAK foundation size, or luas!)
        const candidateRawValues: any[] = [];
        if (layer.fieldMapping?.tower && props[layer.fieldMapping.tower] !== undefined) {
          candidateRawValues.push(props[layer.fieldMapping.tower]);
        }
        const explicitTowerName = findPropCaseInsensitive(props, [
          'towernumb', 'tower_numb', 'tower', 'no_tower', 'id_tower', 'nomor_tower', 'tower_no', 'nama', 'namobj', 'name', 'label'
        ]);
        if (explicitTowerName) candidateRawValues.push(explicitTowerName);

        // Only use 'NOMER' if explicitTowerName is absent or doesn't parse
        if (candidateRawValues.length === 0 && isTowerLayer) {
          const nomerProp = findPropCaseInsensitive(props, ['nomer', 'nomor']);
          if (nomerProp) candidateRawValues.push(nomerProp);
        }

        for (const rawVal of candidateRawValues) {
          const tok = normalizeTowerToken(rawVal);
          if (!tok) continue;

          if (targetIds.has(tok.canonicalId) && !foundTowersMap.has(tok.canonicalId)) {
            const utmCalc = wgs84ToUtm(coords.lat, coords.lng);
            const propX = Number(findPropCaseInsensitive(props, ['x', 'easting', 'utm_x']));
            const propY = Number(findPropCaseInsensitive(props, ['y', 'northing', 'utm_y']));
            // Use property X/Y if they are valid UTM meters (e.g. Easting 100,000..900,000, Northing > 1,000,000)
            const hasValidUtmProps = !isNaN(propX) && !isNaN(propY) && propX > 100000 && propX < 900000 && propY > 1000000;

            foundTowersMap.set(tok.canonicalId, {
              name: tok.displayName,
              canonicalId: tok.canonicalId,
              sortNum: tok.sortNum,
              lng: coords.lng,
              lat: coords.lat,
              utmX: hasValidUtmProps ? propX : utmCalc.x,
              utmY: hasValidUtmProps ? propY : utmCalc.y,
              utmZone: `${utmCalc.zone}${utmCalc.hemisphere}`
            });
            break;
          }
        }
      });
    });

    // If Tower layer didn't have both towers, try extracting the exact span vertices from the As Tower (jalur) WGS84 LineString!
    if (foundTowersMap.size < 2 && targetEndpoints.length === 2) {
      const [epSmall, epLarge] = targetEndpoints;
      // Collect active span parcel points to locate the exact segment on As Tower (jalur)
      const normSelSpan = normalizeSpan(selectedSpan);
      const normSelDesa = normalizeDesa(selectedDesa);
      const spanBidangPts: { lng: number; lat: number }[] = [];

      loadedGeoJSONs.forEach(layer => {
        if (!layer.data?.features || layer.type !== 'bidang') return;
        layer.data.features.forEach((f: any) => {
          const props = f.properties || {};
          const s = layer.fieldMapping?.span ? props[layer.fieldMapping.span] : findPropCaseInsensitive(props, ['span', 'section', 'jalur']);
          const d = layer.fieldMapping?.desa ? props[layer.fieldMapping.desa] : findPropCaseInsensitive(props, ['desa', 'village', 'kelurahan']);
          if (normalizeSpan(s) === normSelSpan && (!normSelDesa || normalizeDesa(d) === normSelDesa)) {
            const collect = (c: any) => {
              if (typeof c?.[0] === 'number' && typeof c?.[1] === 'number') {
                spanBidangPts.push({ lng: Number(c[0]), lat: Number(c[1]) });
              } else if (Array.isArray(c)) {
                c.forEach(collect);
              }
            };
            collect(f.geometry?.coordinates);
          }
        });
      });

      if (spanBidangPts.length > 0) {
        const centroidLng = spanBidangPts.reduce((acc, p) => acc + p.lng, 0) / spanBidangPts.length;
        const centroidLat = spanBidangPts.reduce((acc, p) => acc + p.lat, 0) / spanBidangPts.length;

        let bestSeg: { p1: { lng: number; lat: number }; p2: { lng: number; lat: number }; distSq: number } | null = null;

        loadedGeoJSONs.forEach(layer => {
          if (!layer.data?.features) return;
          const isJalur = layer.type === 'jalur' || /jalur|as_tower|astower|row|koridor|line/i.test(layer.name || '');
          if (!isJalur) return;

          layer.data.features.forEach((f: any) => {
            const geom = f.geometry;
            if (!geom?.coordinates) return;
            const lines: number[][][] =
              geom.type === 'LineString'
                ? [geom.coordinates]
                : geom.type === 'MultiLineString'
                ? geom.coordinates
                : [];

            lines.forEach(lineCoords => {
              for (let i = 0; i < lineCoords.length - 1; i++) {
                const a = lineCoords[i];
                const b = lineCoords[i + 1];
                if (!a || !b || a.length < 2 || b.length < 2) continue;
                const midLng = (Number(a[0]) + Number(b[0])) / 2;
                const midLat = (Number(a[1]) + Number(b[1])) / 2;
                // Project point-to-segment distance from span parcel centroid
                const dx = Number(b[0]) - Number(a[0]);
                const dy = Number(b[1]) - Number(a[1]);
                const lenSq = dx * dx + dy * dy;
                if (lenSq < 1e-12) continue;
                const t = Math.max(0, Math.min(1, ((centroidLng - Number(a[0])) * dx + (centroidLat - Number(a[1])) * dy) / lenSq));
                const projLng = Number(a[0]) + t * dx;
                const projLat = Number(a[1]) + t * dy;
                const dSq = Math.pow(centroidLng - projLng, 2) + Math.pow(centroidLat - projLat, 2);

                if (!bestSeg || dSq < bestSeg.distSq) {
                  bestSeg = {
                    p1: { lng: Number(a[0]), lat: Number(a[1]) },
                    p2: { lng: Number(b[0]), lat: Number(b[1]) },
                    distSq: dSq
                  };
                }
              }
            });
          });
        });

        if (bestSeg) {
          const seg = bestSeg as { p1: { lng: number; lat: number }; p2: { lng: number; lat: number }; distSq: number };
          const utm1 = wgs84ToUtm(seg.p1.lat, seg.p1.lng);
          const utm2 = wgs84ToUtm(seg.p2.lat, seg.p2.lng);
          if (!foundTowersMap.has(epSmall.canonicalId)) {
            foundTowersMap.set(epSmall.canonicalId, {
              name: epSmall.displayName,
              canonicalId: epSmall.canonicalId,
              sortNum: epSmall.sortNum,
              lng: seg.p1.lng,
              lat: seg.p1.lat,
              utmX: utm1.x,
              utmY: utm1.y,
              utmZone: `${utm1.zone}${utm1.hemisphere}`
            });
          }
          if (!foundTowersMap.has(epLarge.canonicalId)) {
            foundTowersMap.set(epLarge.canonicalId, {
              name: epLarge.displayName,
              canonicalId: epLarge.canonicalId,
              sortNum: epLarge.sortNum,
              lng: seg.p2.lng,
              lat: seg.p2.lat,
              utmX: utm2.x,
              utmY: utm2.y,
              utmZone: `${utm2.zone}${utm2.hemisphere}`
            });
          }
        }
      }
    }

    // Sort strictly by tower number so index 0 is ALWAYS Tower Kecil (Left) and index 1 is ALWAYS Tower Besar (Right)
    const result = Array.from(foundTowersMap.values());
    result.sort((a, b) => {
      if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return result;
  }, [loadedGeoJSONs, selectedSpan, selectedDesa]);

  // ============================================================================
  // AUTOMATIC HORIZONTAL SPAN SLOPE CALCULATION (TOWER KECIL DI KIRI -> TOWER BESAR DI KANAN)
  // ============================================================================
  const spanSlopeDetails = useMemo(() => {
    // 1. Primary Source: Tower Kecil (t1) -> Tower Besar (t2) from Tower / As Tower WGS84 coordinates
    if (towerPoints && towerPoints.length >= 2) {
      const t1 = towerPoints[0]; // Tower Kecil (Wajib di Kiri)
      const t2 = towerPoints[towerPoints.length - 1]; // Tower Besar (Wajib di Kanan)

      // Web Mercator vector (for exact horizontal alignment on Leaflet EPSG:3857 canvas)
      const merc1 = wgs84ToWebMercator(t1.lat, t1.lng);
      const merc2 = wgs84ToWebMercator(t2.lat, t2.lng);
      const dMercX = merc2.x - merc1.x;
      const dMercY = merc2.y - merc1.y;

      // UTM metric vector (for engineering report, distance, and ArcGIS Data Driven Pages ROTATE)
      const dUtmX = t2.utmX - t1.utmX;
      const dUtmY = t2.utmY - t1.utmY;
      const spanDistanceMeters = Math.hypot(dUtmX, dUtmY);

      if (Math.abs(dMercX) > 1e-6 || Math.abs(dMercY) > 1e-6) {
        // On Leaflet screen: +X is East, +Y_screen is South (-dMercY).
        // Rotating container clockwise by atan2(dMercY, dMercX) puts vector (t1 -> t2) at 0° (pointing right: t1 Left, t2 Right).
        const webClockwiseDeg = ((Math.atan2(dMercY, dMercX) * 180) / Math.PI + 360) % 360;
        const utmClockwiseDeg = ((Math.atan2(dUtmY, dUtmX) * 180) / Math.PI + 360) % 360;
        const arcgisRotateCcwDeg = ((360 - utmClockwiseDeg) + 360) % 360;
        // True North Azimuth (0° = North, 90° = East, 180° = South, 270° = West)
        const azimuthDeg = ((Math.atan2(dUtmX, dUtmY) * 180) / Math.PI + 360) % 360;

        return {
          source: 'AS_TOWER_WGS84' as const,
          t1,
          t2,
          fromName: t1.name || 'Tower Kiri',
          toName: t2.name || 'Tower Kanan',
          utmZoneLabel: t1.utmZone || '49S',
          dX: dUtmX,
          dY: dUtmY,
          distanceMeters: spanDistanceMeters,
          dUtmX,
          dUtmY,
          spanDistanceMeters,
          webClockwiseDeg,
          utmClockwiseDeg,
          arcgisRotateCcwDeg,
          azimuthDeg
        };
      }
    }

    // 2. Fallback: Principal Axis of current span's parcels (bidang) in WGS84
    const normSelSpan = normalizeSpan(selectedSpan);
    const normSelDesa = normalizeDesa(selectedDesa);
    const spanPts: { lng: number; lat: number; mercX: number; mercY: number }[] = [];

    loadedGeoJSONs.forEach(layer => {
      if (!layer?.data?.features) return;
      layer.data.features.forEach((f: any) => {
        const props = f.properties || {};
        const s = layer.fieldMapping?.span ? props[layer.fieldMapping.span] : findPropCaseInsensitive(props, ['span', 'section', 'jalur']);
        const d = layer.fieldMapping?.desa ? props[layer.fieldMapping.desa] : findPropCaseInsensitive(props, ['desa', 'village', 'kelurahan']);
        if (normSelSpan && normalizeSpan(s) === normSelSpan && (!normSelDesa || normalizeDesa(d) === normSelDesa)) {
          const collect = (c: any) => {
            if (typeof c?.[0] === 'number' && typeof c?.[1] === 'number') {
              const lng = Number(c[0]);
              const lat = Number(c[1]);
              const m = wgs84ToWebMercator(lat, lng);
              spanPts.push({ lng, lat, mercX: m.x, mercY: m.y });
            } else if (Array.isArray(c)) {
              c.forEach(collect);
            }
          };
          collect(f.geometry?.coordinates);
        }
      });
    });

    if (spanPts.length >= 2) {
      let maxDistSq = -1;
      let p1 = spanPts[0];
      let p2 = spanPts[1];
      const step = Math.max(1, Math.floor(spanPts.length / 100));
      for (let i = 0; i < spanPts.length; i += step) {
        for (let j = i + 1; j < spanPts.length; j += step) {
          const dx = spanPts[j].mercX - spanPts[i].mercX;
          const dy = spanPts[j].mercY - spanPts[i].mercY;
          const dSq = dx * dx + dy * dy;
          if (dSq > maxDistSq) {
            maxDistSq = dSq;
            p1 = spanPts[i];
            p2 = spanPts[j];
          }
        }
      }

      // If baseGeojsonRotasi exists from ArcGIS ROTATE field, align p1->p2 direction with it
      let webClockwiseDeg = ((Math.atan2(p2.mercY - p1.mercY, p2.mercX - p1.mercX) * 180) / Math.PI + 360) % 360;
      if (baseGeojsonRotasi !== 0) {
        const diff = Math.abs((((webClockwiseDeg - baseGeojsonRotasi) % 360) + 540) % 360 - 180);
        if (diff > 90) {
          webClockwiseDeg = (webClockwiseDeg + 180) % 360;
        }
      }

      const u1 = wgs84ToUtm(p1.lat, p1.lng);
      const u2 = wgs84ToUtm(p2.lat, p2.lng);
      const eps = parseSpanEndpoints(selectedSpan);
      const dUtmX = u2.x - u1.x;
      const dUtmY = u2.y - u1.y;
      const spanDistanceMeters = Math.hypot(dUtmX, dUtmY);
      return {
        source: 'SPAN_POLYGON_AXIS' as const,
        t1: null,
        t2: null,
        fromName: eps[0]?.displayName || 'Ujung Kiri',
        toName: eps[1]?.displayName || 'Ujung Kanan',
        utmZoneLabel: `${u1.zone}${u1.hemisphere}`,
        dX: dUtmX,
        dY: dUtmY,
        distanceMeters: spanDistanceMeters,
        dUtmX,
        dUtmY,
        spanDistanceMeters,
        webClockwiseDeg,
        utmClockwiseDeg: webClockwiseDeg,
        arcgisRotateCcwDeg: ((360 - webClockwiseDeg) + 360) % 360,
        azimuthDeg: ((90 - webClockwiseDeg) % 360 + 360) % 360
      };
    }

    return null;
  }, [towerPoints, loadedGeoJSONs, selectedSpan, selectedDesa, baseGeojsonRotasi]);

  const towerCalculatedRotasi = useMemo(() => {
    return spanSlopeDetails ? spanSlopeDetails.webClockwiseDeg : null;
  }, [spanSlopeDetails]);

  // Combined Base Rotation: Prefer WGS84 As Tower / Tapak Tower bearing calculation, else fall back to GeoJSON attribute rotation
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

    // 1. Initialize Top Map (Sket / Vector Light Basemap) with fractional zoom so rotated horizontal spans fit accurately
    const topMap = L.map(topMapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
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
      zoomSnap: 0.25,
      zoomDelta: 0.5,
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
      if (isSyncingRef.current || !bottomMapRef.current || !(bottomMapRef.current as any)._mapPane) return;
      isSyncingRef.current = true;
      try {
        bottomMapRef.current.setView(topMap.getCenter(), topMap.getZoom(), { animate: false });
      } catch (e) {}
      isSyncingRef.current = false;
    };

    // 4. Map Sync Handler (Bottom -> Top)
    const syncBottomToTop = () => {
      if (isSyncingRef.current || !topMapRef.current || !(topMapRef.current as any)._mapPane) return;
      isSyncingRef.current = true;
      try {
        topMapRef.current.setView(bottomMap.getCenter(), bottomMap.getZoom(), { animate: false });
      } catch (e) {}
      isSyncingRef.current = false;
    };

    topMap.on('move', syncTopToBottom);
    bottomMap.on('move', syncBottomToTop);

    // Dynamic Scale Calculation
    const updateMapScale = () => {
      if (!topMapRef.current || !(topMapRef.current as any)._mapPane) return;
      try {
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
      } catch (e) {}
    };

    topMap.on('zoomend', updateMapScale);
    topMap.on('moveend', updateMapScale);
    updateMapScale();

    return () => {
      topMap.off('move', syncTopToBottom);
      bottomMap.off('move', syncBottomToTop);
      topMap.off('zoomend', updateMapScale);
      topMap.off('moveend', updateMapScale);
      try {
        topMap.stop();
        topMap.remove();
      } catch (e) {}
      try {
        bottomMap.stop();
        bottomMap.remove();
      } catch (e) {}
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

              // Interactive click selection to inspect and navigate to Google Maps
              l.on('click', (e: any) => {
                if (e.originalEvent) {
                  e.originalEvent.stopPropagation();
                }
                let coords: { lat: number; lng: number } | null = null;
                if (e.latlng) {
                  coords = { lat: e.latlng.lat, lng: e.latlng.lng };
                } else if ((l as any).getLatLng) {
                  const ll = (l as any).getLatLng();
                  coords = { lat: ll.lat, lng: ll.lng };
                } else if ((l as any).getBounds) {
                  const b = (l as any).getBounds();
                  if (b && b.isValid()) {
                    const c = b.getCenter();
                    coords = { lat: c.lat, lng: c.lng };
                  }
                }

                let matchedRecord: LandRecord | null = null;
                if (featNobid) {
                  matchedRecord = records.find(r => 
                    (normalizeClean(r.NOBID) === normalizeClean(featNobid) || r.NOBID === featNobid) &&
                    (!selectedDesa || normalizeClean(r.DESA) === normalizeClean(selectedDesa))
                  ) || records.find(r => normalizeClean(r.NOBID) === normalizeClean(featNobid)) || null;
                }

                setSelectedFeature({
                  props: feat.properties || {},
                  coordinates: coords,
                  record: matchedRecord,
                  displayLabel,
                  towerLabel,
                  isTower: isFeatureTower
                });
              });
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

              // Interactive click selection to inspect and navigate to Google Maps
              l.on('click', (e: any) => {
                if (e.originalEvent) {
                  e.originalEvent.stopPropagation();
                }
                let coords: { lat: number; lng: number } | null = null;
                if (e.latlng) {
                  coords = { lat: e.latlng.lat, lng: e.latlng.lng };
                } else if ((l as any).getLatLng) {
                  const ll = (l as any).getLatLng();
                  coords = { lat: ll.lat, lng: ll.lng };
                } else if ((l as any).getBounds) {
                  const b = (l as any).getBounds();
                  if (b && b.isValid()) {
                    const c = b.getCenter();
                    coords = { lat: c.lat, lng: c.lng };
                  }
                }

                let matchedRecord: LandRecord | null = null;
                if (featNobid) {
                  matchedRecord = records.find(r => 
                    (normalizeClean(r.NOBID) === normalizeClean(featNobid) || r.NOBID === featNobid) &&
                    (!selectedDesa || normalizeClean(r.DESA) === normalizeClean(selectedDesa))
                  ) || records.find(r => normalizeClean(r.NOBID) === normalizeClean(featNobid)) || null;
                }

                setSelectedFeature({
                  props: feat.properties || {},
                  coordinates: coords,
                  record: matchedRecord,
                  displayLabel,
                  towerLabel,
                  isTower: isFeatureTower
                });
              });
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

    // Fit camera view tightly to the rotated span (including both span parcels and endpoint towers)
    // inside the actual visible viewport (clientWidth x 320px) rather than the 350%x500% oversized canvas
    const boundsToFit = spanBidangBounds.length > 0 ? spanBidangBounds : spanOtherBounds;
    const samplePoints: Array<{ lat: number; lng: number }> = [];

    boundsToFit.forEach(b => {
      if (b.isValid()) {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const nw = b.getNorthWest();
        const se = b.getSouthEast();
        samplePoints.push(
          { lat: sw.lat, lng: sw.lng },
          { lat: ne.lat, lng: ne.lng },
          { lat: nw.lat, lng: nw.lng },
          { lat: se.lat, lng: se.lng }
        );
      }
    });

    // Always include the active span's endpoint towers so Tower Kecil (Left) and Tower Besar (Right) are framed
    towerPoints.forEach(tw => {
      if (Number.isFinite(tw.lat) && Number.isFinite(tw.lng)) {
        samplePoints.push({ lat: tw.lat, lng: tw.lng });
      }
    });

    if (samplePoints.length > 0) {
      const refLat = samplePoints.reduce((acc, p) => acc + p.lat, 0) / samplePoints.length;
      const refLng = samplePoints.reduce((acc, p) => acc + p.lng, 0) / samplePoints.length;
      const cosLat = Math.cos((refLat * Math.PI) / 180);
      const metersPerDegLat = 111132.92;
      const metersPerDegLng = 111412.84 * cosLat;
      const rad = (effectiveRotationAngle * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      let minScreenX = Infinity;
      let maxScreenX = -Infinity;
      let minScreenY = Infinity;
      let maxScreenY = -Infinity;

      samplePoints.forEach(p => {
        const dE = (p.lng - refLng) * metersPerDegLng;
        const dN = (p.lat - refLat) * metersPerDegLat;
        // Rotated screen coordinates in meters (+X right, +Y down)
        const sx = dE * cosA + dN * sinA;
        const sy = dE * sinA - dN * cosA;
        if (sx < minScreenX) minScreenX = sx;
        if (sx > maxScreenX) maxScreenX = sx;
        if (sy < minScreenY) minScreenY = sy;
        if (sy > maxScreenY) maxScreenY = sy;
      });

      const midScreenX = (minScreenX + maxScreenX) / 2;
      const midScreenY = (minScreenY + maxScreenY) / 2;
      const midDE = midScreenX * cosA + midScreenY * sinA;
      const midDN = midScreenX * sinA - midScreenY * cosA;
      const centerLat = refLat + midDN / metersPerDegLat;
      const centerLng = refLng + midDE / metersPerDegLng;

      const spanWidthMeters = Math.max(maxScreenX - minScreenX, 60);
      const spanHeightMeters = Math.max(maxScreenY - minScreenY, 35);

      const visibleViewport = topMapContainerRef.current?.parentElement?.parentElement;
      const visibleWidthPx = visibleViewport?.clientWidth || 900;
      const visibleHeightPx = visibleViewport?.clientHeight || 320;

      const reqMetersPerPx = Math.max(
        spanWidthMeters / (visibleWidthPx * 0.80),
        spanHeightMeters / (visibleHeightPx * 0.72)
      );
      const rawZoom = Math.log2((156543.03392 * cosLat) / reqMetersPerPx);
      const idealZoom = Math.max(14.5, Math.min(19, Math.floor(rawZoom * 4) / 4));

      if ((topMap as any)._mapPane) {
        topMap.invalidateSize();
        topMap.setView([centerLat, centerLng], idealZoom, { animate: false });
      }
      if ((bottomMap as any)._mapPane) {
        bottomMap.invalidateSize();
        bottomMap.setView([centerLat, centerLng], idealZoom, { animate: false });
      }
    } else {
      if ((topMap as any)._mapPane) topMap.invalidateSize();
      if ((bottomMap as any)._mapPane) bottomMap.invalidateSize();
    }

    return () => {
      topLayerGroup.clearLayers();
      bottomLayerGroup.clearLayers();
    };
  }, [loadedGeoJSONs, selectedDesa, selectedSpan, effectiveRotationAngle, towerPoints]);

  // Invalidate map size when rotation changes to ensure tiles fill oversized canvas
  useEffect(() => {
    if (topMapRef.current && (topMapRef.current as any)._mapPane) topMapRef.current.invalidateSize();
    if (bottomMapRef.current && (bottomMapRef.current as any)._mapPane) bottomMapRef.current.invalidateSize();
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
              <span>Rotasi Horizontal (Tower Kecil Kiri → Besar Kanan):</span>
              <span className="text-emerald-400 font-mono text-[10px]">
                {effectiveRotationAngle.toFixed(2)}°
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

        {/* Kalkulasi Kemiringan Span Otomatis (Konversi WGS 1984 -> Proyeksi Meter UTM & Web Mercator) */}
        {spanSlopeDetails && (
          <div className="pt-2 border-t border-white/10">
            <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px]">
                  KALKULASI KEMIRINGAN AS TOWER (WGS 1984 → UTM {spanSlopeDetails.utmZoneLabel || '49S'})
                </span>
                <span className="text-slate-300 font-semibold">
                  Kiri (Kecil): <strong className="text-amber-300 font-mono">{spanSlopeDetails.fromName}</strong>
                  {' '}→{' '}
                  Kanan (Besar): <strong className="text-amber-300 font-mono">{spanSlopeDetails.toName}</strong>
                </span>
                <span className="text-slate-400 font-mono text-[10px]">
                  (ΔX = {Number(spanSlopeDetails.dX || 0) >= 0 ? `+${Number(spanSlopeDetails.dX || 0).toFixed(2)}` : Number(spanSlopeDetails.dX || 0).toFixed(2)} m, ΔY = {Number(spanSlopeDetails.dY || 0) >= 0 ? `+${Number(spanSlopeDetails.dY || 0).toFixed(2)}` : Number(spanSlopeDetails.dY || 0).toFixed(2)} m, Jarak = {Number(spanSlopeDetails.distanceMeters || 0).toFixed(2)} m)
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap font-mono text-[10px]">
                <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-sky-300" title="Sudut rotasi searah jarum jam pada Web Peta agar As Tower lurus horizontal (0°)">
                  Rotasi Web (CW): <strong>{Number(spanSlopeDetails.webClockwiseDeg || 0).toFixed(2)}°</strong>
                </span>
                <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-amber-300" title="Sudut ROTATE untuk Data Driven Pages ArcGIS / QGIS (berlawanan jarum jam)">
                  ROTATE GIS/ArcGIS (CCW): <strong>{Number(spanSlopeDetails.arcgisRotateCcwDeg || 0).toFixed(2)}°</strong>
                </span>
                <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-emerald-300" title="Azimuth Kompas dari Tower Kecil ke Tower Besar">
                  Azimuth: <strong>{Number(spanSlopeDetails.azimuthDeg || 0).toFixed(2)}°</strong>
                </span>
              </div>
            </div>
          </div>
        )}
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

        {/* Floating Quick Action Card: Menuju Lokasi via Google Maps (Tab Baru) */}
        {selectedFeature && (
          <div className="p-3.5 bg-slate-900 text-white rounded-xl border-2 border-emerald-500 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0 mt-0.5">
                <MapPin className="w-5 h-5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    {selectedFeature.isTower ? `Tower ${selectedFeature.towerLabel}` : (selectedFeature.displayLabel ? `Bidang ${selectedFeature.displayLabel}` : (selectedFeature.record?.NOBID ? `Bidang No. ${selectedFeature.record.NOBID}` : 'Bidang Terpilih'))}
                  </span>
                  <span className="text-xs font-extrabold text-white truncate">
                    {selectedFeature.record?.NAMA || selectedFeature.props?.NAMA || selectedFeature.props?.PEMILIK || 'Informasi Geometri Bidang'}
                  </span>
                  {selectedFeature.record?.LUAS && (
                    <span className="text-[10px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                      Luas: {selectedFeature.record.LUAS} m²
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                  <span>Desa {selectedFeature.record?.DESA || selectedDesa || '-'} &bull; Span {selectedFeature.record?.SPAN || selectedSpan || '-'}</span>
                  {selectedFeature.coordinates && (
                    <span className="font-mono text-emerald-400 font-semibold">
                      📍 {selectedFeature.coordinates.lat.toFixed(6)}, {selectedFeature.coordinates.lng.toFixed(6)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95 text-center"
                  title="Buka titik bidang ini di Google Maps (Buka Tab Baru)"
                >
                  <Navigation className="w-3.5 h-3.5 shrink-0" />
                  <span>Buka di Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                </a>
              )}
              {selectedFeature.record && onNavigateToInput && role !== 'GUEST' && (
                <button
                  onClick={() => onNavigateToInput(selectedFeature.record!)}
                  className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 px-3 rounded-xl transition-all cursor-pointer"
                  title="Edit Data Bidang Ini"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
              <button
                onClick={() => setSelectedFeature(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Tutup Info"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

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
              {/* Rotated Compass Arrow matching the map's rotated North direction */}
              <div 
                className="w-8 h-8 rounded-full border-2 border-slate-800 flex items-center justify-center bg-slate-100 shadow-inner transition-transform duration-300"
                style={{ transform: `rotate(${effectiveRotationAngle}deg)` }}
              >
                <ArrowUp className="w-5 h-5 text-red-600 font-extrabold" />
              </div>
              <div className="text-left">
                <span className="text-[10px] font-black uppercase text-slate-800 block">ARAH UTARA</span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  Web: {effectiveRotationAngle.toFixed(1)}° {spanSlopeDetails ? `| GIS: ${spanSlopeDetails.arcgisRotateCcwDeg.toFixed(1)}°` : ''}
                </span>
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
                      <td className="py-1 px-1 border-r border-slate-800">{Number(tw.utmX ?? tw.lng ?? 0).toFixed(4)}</td>
                      <td className="py-1 px-1">{Number(tw.utmY ?? tw.lat ?? 0).toFixed(4)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-2 text-slate-400 italic text-[9px]">
                      Data koordinat tower dimuat otomatis dari layer GeoJSON Tower / As Jalur
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
          onConfirmDelete={async (_updatedRecords, _logMsg, adjustNextParcels) => {
            const target = recordToDelete;
            if (onDeleteRecord) {
              await onDeleteRecord(target, adjustNextParcels);
            }
            setRecordToDelete(null);
          }}
        />
      )}
    </div>
  );
}
