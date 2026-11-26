import { jsPDF } from 'jspdf';
import {
  type LandRecord,
  type InventoryFormPdfConfig,
  type VendorHeaderPreset
} from '../types';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { loadGeoJSONLayerDoc } from './geojsonStorage';
import { getOfficialLogos } from './logoLoader';
import {
  formatProjectedCoordinate,
  getCoordinateProjectionOption
} from './geoUtils';
import { resolveProjectTitleByDesa } from './projectTitleHelper';

export interface GenerateInventoryPDFOptions {
  pdfConfig?: InventoryFormPdfConfig;
  projectId?: string;
  projectGeoJSONs?: any[];
  accessToken?: string | null;
}

export function getVendorPresetDefaults(preset: VendorHeaderPreset = 'SURVEYOR_INDONESIA'): InventoryFormPdfConfig {
  switch (preset) {
    case 'PLN':
      return {
        vendorPreset: 'PLN',
        headerMode: 'TWO_LOGOS_WITH_TEXT',
        headerCompanyName: 'PT PLN (PERSERO)',
        headerSubTitle: 'UNIT INDUK PEMBANGUNAN / PROYEK JARINGAN TRANSMISI',
        headerAddress: '',
        docTitleLine1: 'FORMULIR INVENTARISASI',
        docTitleLine2: 'PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK',
        footerPhone: '',
        footerEmail: '',
        footerWebsite: 'www.pln.co.id',
        footerLine1: 'PT PLN (Persero) — Pengadaan Lahan & Kompensasi Ruang Bebas (ROW)',
        footerLine2: 'www.pln.co.id',
        footerLeftPrefix: 'Kode Lahan',
        coordinateProjection: 'UTM_49S',
        coordinateLabelOverride: ''
      };
    case 'VENTURA':
      return {
        vendorPreset: 'VENTURA',
        headerMode: 'TWO_LOGOS_WITH_TEXT',
        headerCompanyName: 'PT. VENTURA SKALA SIMETRIS',
        headerSubTitle: 'KONSULTAN SURVEI, PEMETAAN GIS & INVENTARISASI PERTANAHAN',
        headerAddress: '',
        docTitleLine1: 'FORMULIR INVENTARISASI',
        docTitleLine2: 'PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK',
        footerPhone: '',
        footerEmail: 'admin@venturaskalasimetris.co.id',
        footerWebsite: 'www.venturaskalasimetris.co.id',
        footerLine1: 'PT. Ventura Skala Simetris   |   Survei & Inventarisasi Jalur Transmisi',
        footerLine2: 'www.venturaskalasimetris.co.id',
        footerLeftPrefix: 'Kode Lahan',
        coordinateProjection: 'UTM_49S',
        coordinateLabelOverride: ''
      };
    case 'CUSTOM':
      return {
        vendorPreset: 'CUSTOM',
        headerMode: 'TWO_LOGOS_WITH_TEXT',
        headerCompanyName: 'NAMA VENDOR / INSTANSI',
        headerSubTitle: 'DIVISI / UNIT PELAKSANA SURVEI & INVENTARISASI',
        headerAddress: '',
        docTitleLine1: 'FORMULIR INVENTARISASI',
        docTitleLine2: 'PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK',
        footerPhone: '',
        footerEmail: '',
        footerWebsite: '',
        footerLine1: '',
        footerLine2: '',
        footerLeftPrefix: 'Kode Lahan',
        coordinateProjection: 'UTM_49S',
        coordinateLabelOverride: ''
      };
    case 'SURVEYOR_INDONESIA':
    default:
      return {
        vendorPreset: 'SURVEYOR_INDONESIA',
        headerMode: 'THREE_LOGOS',
        headerCompanyName: 'PT SURVEYOR INDONESIA',
        headerSubTitle: 'Member of ID Survey',
        headerAddress: '',
        docTitleLine1: 'FORMULIR INVENTARISASI',
        docTitleLine2: 'PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK',
        footerPhone: '(62-24) 845 0918',
        footerEmail: 'surveyorindonesia@ptsi.co.id',
        footerWebsite: 'www.ptsi.co.id',
        footerLine1: '',
        footerLine2: '',
        footerLeftPrefix: 'Kode Lahan',
        coordinateProjection: 'UTM_49S',
        coordinateLabelOverride: ''
      };
  }
}

function extractGoogleDriveFileIdFromUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return '';
}

async function blobOrUrlToResizedPngDataUrl(src: string, maxWidth: number = 280, maxHeight: number = 140): Promise<string> {
  return await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve(''), 5500);
    const img = new Image();
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        let w = img.naturalWidth || img.width || 240;
        let h = img.naturalHeight || img.height || 100;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        if (h > maxHeight) {
          w = Math.round((w * maxHeight) / h);
          h = maxHeight;
        }
        canvas.width = Math.max(w, 1);
        canvas.height = Math.max(h, 1);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve('');
    };
    img.src = src;
  });
}

/**
 * Resolves a custom logo (base64 data URL, Google Drive share link, or direct HTTP image URL)
 * into a crisp, resized transparent PNG Data URL suitable for Firestore caching & jsPDF rendering.
 */
export async function resolveDriveOrUrlLogoToDataUrl(
  url: string,
  accessToken?: string | null,
  maxWidth: number = 280
): Promise<string> {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;

  const fileId = extractGoogleDriveFileIdFromUrl(trimmed);

  // 1. If Google Drive file ID and valid OAuth accessToken exist, download directly via Drive API v3 (100% CORS-free)
  if (fileId && accessToken && accessToken !== 'GUEST_BYPASS' && accessToken !== 'null') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0 && (blob.type.startsWith('image/') || blob.type === 'application/octet-stream')) {
          const objUrl = URL.createObjectURL(blob);
          try {
            const resized = await blobOrUrlToResizedPngDataUrl(objUrl, maxWidth, 140);
            if (resized && resized.startsWith('data:image/')) {
              return resized;
            }
          } finally {
            URL.revokeObjectURL(objUrl);
          }
        }
      }
    } catch (driveErr) {
      console.warn('[PDF Logo] Drive API fetch fallback to public URL:', driveErr);
    }
  }

  // 2. Try public direct URL candidates (prioritizing CORS-friendly lh3.googleusercontent.com)
  const candidates = fileId
    ? [
        `https://lh3.googleusercontent.com/d/${fileId}=w800`,
        `https://lh3.googleusercontent.com/d/${fileId}`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
        `https://drive.google.com/uc?export=view&id=${fileId}`
      ]
    : [trimmed];

  for (const srcUrl of candidates) {
    const resized = await blobOrUrlToResizedPngDataUrl(srcUrl, maxWidth, 140);
    if (resized && resized.startsWith('data:image/')) {
      return resized;
    }
  }

  return '';
}

async function loadLogoWithDimensions(
  cachedDataUrl?: string,
  url?: string,
  accessToken?: string | null,
  maxWidth: number = 360
): Promise<{ dataUrl: string; ratio: number } | null> {
  let dataUrl = '';
  if (cachedDataUrl && cachedDataUrl.startsWith('data:image/')) {
    dataUrl = cachedDataUrl;
  } else if (url) {
    dataUrl = await resolveDriveOrUrlLogoToDataUrl(url, accessToken, maxWidth);
  }
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width || 100;
      const h = img.naturalHeight || img.height || 100;
      resolve({ dataUrl, ratio: w / Math.max(h, 1) });
    };
    img.onerror = () => resolve({ dataUrl, ratio: 2.0 });
    img.src = dataUrl;
  });
}

const findPropInObj = (obj: any, keys: string[]): string => {
  if (!obj) return '';
  const objKeys = Object.keys(obj);
  for (const k of keys) {
    const found = objKeys.find(ok => ok.toLowerCase() === k.toLowerCase());
    if (found && obj[found] !== undefined && obj[found] !== null) {
      return String(obj[found]).trim();
    }
  }
  return '';
};

const normalizeString = (val: string): string => {
  return String(val || '').trim().toLowerCase();
};

const normalizeNobid = (val: string): string => {
  const s = normalizeString(val);
  return s.replace(/^0+/, '') || '0';
};

const normalizeSpan = (val: string): string => {
  const s = normalizeString(val);
  return s
    .replace(/[\s\-_.]/g, '')
    .replace(/0+(\d+)/g, '$1');
};

const isRecordMatched = (
  featNobid: string,
  featDesa: string,
  featSpan: string,
  recordNobid: string,
  recordDesa: string,
  recordSpan: string
): boolean => {
  const nFeatNobid = normalizeNobid(featNobid);
  const nRecordNobid = normalizeNobid(recordNobid);
  if (!nFeatNobid || !nRecordNobid || nFeatNobid !== nRecordNobid) {
    return false;
  }

  const nFeatDesa = normalizeString(featDesa);
  const nRecordDesa = normalizeString(recordDesa);
  if (nFeatDesa && nRecordDesa && nFeatDesa.length >= 3 && nRecordDesa.length >= 3) {
    if (!nFeatDesa.includes(nRecordDesa) && !nRecordDesa.includes(nFeatDesa)) {
      return false;
    }
  }

  const nFeatSpan = normalizeSpan(featSpan);
  const nRecordSpan = normalizeSpan(recordSpan);
  if (nFeatSpan && nRecordSpan && nFeatSpan.length >= 2 && nRecordSpan.length >= 2) {
    if (!nFeatSpan.includes(nRecordSpan) && !nRecordSpan.includes(nFeatSpan)) {
      return false;
    }
  }

  return true;
};

function latLngToUTM49S(lng: number, lat: number): { x: number; y: number } {
  // WGS84 constants
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = (a*a - b*b) / (a*a);
  const eOct2 = e2 / (1 - e2);
  
  const k0 = 0.9996;
  const falseEasting = 500000.0;
  const falseNorthing = 10000000.0; // Southern hemisphere offset
  
  // Central meridian for UTM Zone 49 is 111 degrees East
  const centralMeridian = 111.0 * Math.PI / 180;
  
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = eOct2 * Math.cos(latRad) * Math.cos(latRad);
  const A = (lngRad - centralMeridian) * Math.cos(latRad);
  
  const M = a * (
    (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2/256) * latRad
    - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024) * Math.sin(2*latRad)
    + (15*e2*e2/256 + 45*e2*e2*e2/1024) * Math.sin(4*latRad)
    - (35*e2*e2*e2/3072) * Math.sin(6*latRad)
  );
  
  const x = falseEasting + k0 * N * (
    A + (1 - T + C) * A*A*A / 6
    + (5 - 18*T + T*T + 72*C - 58*eOct2) * A*A*A*A*A / 120
  );
  
  const y = falseNorthing + k0 * (
    M + N * Math.tan(latRad) * (
      A*A / 2 + (5 - T + 9*C + 4*C*C) * A*A*A*A / 24
      + (61 - 58*T + T*T + 600*C - 330*eOct2) * A*A*A*A*A*A / 720
    )
  );
  
  return { x, y };
}

/**
 * Converts a Google Drive URL or standard URL into embeddable direct image URLs.
 */
function getDirectImageUrls(url: string): string[] {
  if (!url || typeof url !== 'string') return [];
  const trimmed = url.trim();
  if (!trimmed) return [];
  
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) {
    return [trimmed];
  }

  let fileId = '';
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) {
    fileId = dMatch[1];
  } else {
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      fileId = idMatch[1];
    }
  }

  if (fileId) {
    return [
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      trimmed
    ];
  }

  return [trimmed];
}

function wgs84ToWebMercator(lat: number, lng: number): { x: number; y: number } {
  const R = 6378137.0;
  const x = (lng * Math.PI * R) / 180.0;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180.0;
  const y = R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return { x, y };
}

function normalizeTowerToken(raw: any): { canonicalId: string; displayName: string; sortNum: number; suffix: string } | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  if (/\bgi\b/i.test(str)) {
    const cleanGi = str.replace(/\s+/g, ' ').trim();
    const upperGi = cleanGi.toUpperCase();
    const isStartGi = /jelok|awal|start/i.test(upperGi);
    return {
      canonicalId: 'GI_' + upperGi.replace(/[^A-Z0-9]/g, ''),
      displayName: cleanGi.toUpperCase(),
      sortNum: isStartGi ? 0 : 99999,
      suffix: ''
    };
  }

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
}

function parseSpanEndpoints(spanStr: string) {
  if (!spanStr) return [];
  const cleaned = spanStr.replace(/^span\s+/i, '').trim();
  const parts = cleaned
    .split(/\s*(?:[-–—/]|s\/d|sampai|to)\s*/i)
    .map(p => p.trim())
    .filter(Boolean);

  const parsed = parts
    .map(p => normalizeTowerToken(p))
    .filter((item): item is NonNullable<ReturnType<typeof normalizeTowerToken>> => item !== null);

  if (parsed.length === 2) {
    parsed.sort((a, b) => {
      if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
      return a.suffix.localeCompare(b.suffix);
    });
  }
  return parsed;
}

// Cache for candidate GeoJSON datasets (including bidang, tower, and jalur) to avoid repetitive network/Firestore fetching
let cachedCandidateGeoJSONs: { id?: string; name?: string; type: 'bidang' | 'tower' | 'jalur'; data: any; fieldMapping?: any }[] | null = null;

/**
 * Helper to load an image from URL, resize it to a maximum width to reduce file size, and return its Base64 representation.
 */
async function loadImageAsBase64(url: string, maxWidth: number = 700, isLogo: boolean = false): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  const candidateUrls = getDirectImageUrls(url);
  if (candidateUrls.length === 0) return '';

  for (const srcUrl of candidateUrls) {
    if (srcUrl.startsWith('data:image/')) return srcUrl;

    const result = await new Promise<string>((resolve) => {
      // 2.5s timeout safety to avoid hanging on dead/slow links
      const timer = setTimeout(() => {
        resolve('');
      }, 2500);

      const img = new Image();
      if (srcUrl.startsWith('http://') || srcUrl.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          let w = img.width || 400;
          let h = img.height || 300;
          
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          
          canvas.width = Math.max(w, 1);
          canvas.height = Math.max(h, 1);
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('');
            return;
          }
          
          if (!isLogo) {
            // For photos, fill pure white background first
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
          }

          ctx.drawImage(img, 0, 0, w, h);
          if (isLogo) {
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          } else {
            // Compress photos with high-efficiency JPEG format (keeps total PDF well under 1.5MB)
            resolve(canvas.toDataURL('image/jpeg', 0.70));
          }
        } catch (err) {
          console.warn('Canvas image drawing error:', err);
          resolve('');
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve('');
      };
      img.src = srcUrl;
    });

    if (result && result.startsWith('data:image/')) {
      return result;
    }
  }

  return '';
}

/**
 * Helper to load signature/stamp as transparent PNG Base64 for PDF embedding.
 */
async function loadSignatureAsBase64(url: string, maxWidth: number = 400): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  const candidateUrls = getDirectImageUrls(url);
  if (candidateUrls.length === 0) return '';

  for (const srcUrl of candidateUrls) {
    if (srcUrl.startsWith('data:image/')) return srcUrl;
    const result = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(''), 2500);
      const img = new Image();
      if (srcUrl.startsWith('http://') || srcUrl.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          let w = img.width || 400;
          let h = img.height || 200;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          canvas.width = Math.max(w, 1);
          canvas.height = Math.max(h, 1);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('');
            return;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve('');
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve('');
      };
      img.src = srcUrl;
    });
    if (result && result.startsWith('data:image/')) return result;
  }
  return '';
}

/**
 * Generates a beautiful, high-fidelity 4-page Formulir Inventarisasi PDF
 * based on the provided LandRecord, Project Name, and optional per-jalur PDF configuration.
 */
export async function generateInventoryPDF(
  record: LandRecord,
  projectName: string,
  options?: GenerateInventoryPDFOptions
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

  const presetDefaults = getVendorPresetDefaults(options?.pdfConfig?.vendorPreset || 'SURVEYOR_INDONESIA');
  const pdfCfg: InventoryFormPdfConfig = {
    ...presetDefaults,
    ...(options?.pdfConfig || {})
  };
  const headerMode = pdfCfg.headerMode || presetDefaults.headerMode || 'THREE_LOGOS';
  const projectionId = pdfCfg.coordinateProjection || 'UTM_49S';
  const projectionOption = getCoordinateProjectionOption(projectionId);
  const effectiveProjectGeoJSONs = options?.projectGeoJSONs;
  const activeProjectId = options?.projectId;
  const resolvedProjectTitle = resolveProjectTitleByDesa(projectName, record.DESA, activeProjectId);
  const effectiveProjectTitle = resolvedProjectTitle.title || projectName;
  
  // Set A4 dimensions
  const pageWidth = 210;
  const pageHeight = 297;
  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin; // 180mm

  // Preload crisp official PNG logos directly from /public + any custom per-jalur cached/Drive/URL logos
  const logos = await getOfficialLogos();
  const pdfAccessToken = options?.accessToken || null;
  const [customLeftLogo, customCenterLogo, customRightLogo] = await Promise.all([
    pdfCfg.headerLeftLogoDataUrl || pdfCfg.headerLeftLogoUrl
      ? loadLogoWithDimensions(pdfCfg.headerLeftLogoDataUrl, pdfCfg.headerLeftLogoUrl, pdfAccessToken)
      : Promise.resolve(null),
    pdfCfg.headerCenterLogoDataUrl || pdfCfg.headerCenterLogoUrl
      ? loadLogoWithDimensions(pdfCfg.headerCenterLogoDataUrl, pdfCfg.headerCenterLogoUrl, pdfAccessToken)
      : Promise.resolve(null),
    pdfCfg.headerRightLogoDataUrl || pdfCfg.headerRightLogoUrl
      ? loadLogoWithDimensions(pdfCfg.headerRightLogoDataUrl, pdfCfg.headerRightLogoUrl, pdfAccessToken)
      : Promise.resolve(null)
  ]);

  // Preload 7 official signatures and village stamp
  const [
    sigTim1,
    sigTim2,
    sigPemilik,
    sigSaksi1,
    sigSaksi2,
    sigKades,
    capDesa
  ] = await Promise.all([
    record.TTD_TIM_1 ? loadSignatureAsBase64(record.TTD_TIM_1) : Promise.resolve(''),
    record.TTD_TIM_2 ? loadSignatureAsBase64(record.TTD_TIM_2) : Promise.resolve(''),
    record.TTD_PEMILIK ? loadSignatureAsBase64(record.TTD_PEMILIK) : Promise.resolve(''),
    record.TTD_SAKSI_1 ? loadSignatureAsBase64(record.TTD_SAKSI_1) : Promise.resolve(''),
    record.TTD_SAKSI_2 ? loadSignatureAsBase64(record.TTD_SAKSI_2) : Promise.resolve(''),
    record.TTD_KADES ? loadSignatureAsBase64(record.TTD_KADES) : Promise.resolve(''),
    record.CAP_DESA ? loadSignatureAsBase64(record.CAP_DESA) : Promise.resolve('')
  ]);

  // Formatted date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Color Palette
  const darkSlate = [15, 23, 42]; // #0f172a
  const textGray = [55, 65, 81]; // #374151
  const borderGray = [209, 213, 219]; // #d1d5db
  const primaryBlue = [3, 105, 161]; // #0369a1
  const accentRed = [185, 28, 28]; // #b91c1c
  const tealAccent = [13, 148, 136]; // #0d9488

  // Helper to fit a custom logo inside a bounding box without distorting aspect ratio
  const drawFittedLogo = (
    logoObj: { dataUrl: string; ratio: number },
    boxX: number,
    boxY: number,
    maxW: number,
    maxH: number,
    align: 'left' | 'center' | 'right',
    alias: string
  ) => {
    let drawW = maxW;
    let drawH = drawW / Math.max(logoObj.ratio, 0.2);
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * logoObj.ratio;
    }
    const drawX =
      align === 'center'
        ? boxX + (maxW - drawW) / 2
        : align === 'right'
        ? boxX + (maxW - drawW)
        : boxX;
    const drawY = boxY + (maxH - drawH) / 2;
    const fmt = logoObj.dataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(logoObj.dataUrl, fmt, drawX, drawY, drawW, drawH, alias, 'FAST');
  };

  // Helper function to draw the corporate header on every page (customizable per jalur)
  const drawPageHeader = (pNum: number) => {
    // Header bottom line
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.2);
    doc.line(15, 24, 195, 24);

    if (headerMode === 'TWO_LOGOS_WITH_TEXT' || headerMode === 'CUSTOM_TEXT_ONLY') {
      if (headerMode === 'TWO_LOGOS_WITH_TEXT') {
        if (customLeftLogo) {
          try {
            drawFittedLogo(customLeftLogo, 15, 6.5, 34, 14, 'left', 'custom_left_logo');
          } catch (e) {
            console.warn('Failed to draw custom left logo:', e);
          }
        }
        if (customRightLogo) {
          try {
            drawFittedLogo(customRightLogo, 161, 6.5, 34, 14, 'right', 'custom_right_logo');
          } catch (e) {
            console.warn('Failed to draw custom right logo:', e);
          }
        }
      }

      const companyText = (pdfCfg.headerCompanyName || '').trim();
      const subText = (pdfCfg.headerSubTitle || '').trim();
      const addrText = (pdfCfg.headerAddress || '').trim();

      let textY = addrText ? 11.5 : 13.5;
      if (companyText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        doc.text(companyText, 105, textY, { align: 'center', maxWidth: 112 });
        textY += 4.3;
      }
      if (subText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.text(subText, 105, textY, { align: 'center', maxWidth: 112 });
        textY += 3.6;
      }
      if (addrText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(addrText, 105, textY, { align: 'center', maxWidth: 116 });
      }
    } else {
      // THREE_LOGOS mode (Default Surveyor Indonesia / custom 3-logo corporate kop)
      const isDefaultSI = (pdfCfg.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA';

      // 1. Left Logo (Custom or Danantara default)
      let leftRendered = false;
      if (customLeftLogo) {
        try {
          drawFittedLogo(customLeftLogo, 15, 7.0, 38, 12.5, 'left', 'custom_left_logo');
          leftRendered = true;
        } catch (e) {
          console.warn('Failed to add custom left logo:', e);
        }
      } else if (isDefaultSI && logos.danantara) {
        try {
          doc.addImage(logos.danantara, 'PNG', 15, 8.5, 36.1, 9.5, 'danantara_logo', 'FAST');
          leftRendered = true;
        } catch (e) {
          console.warn('Failed to add danantara image to PDF:', e);
        }
      }
      if (!leftRendered && isDefaultSI) {
        doc.setFillColor(178, 34, 34);
        doc.rect(15, 11, 4, 8, 'F');
        doc.setFillColor(212, 175, 55);
        doc.rect(19, 11, 2, 8, 'F');
        doc.setFillColor(15, 23, 42);
        doc.rect(21, 11, 1, 8, 'F');
        doc.setFillColor(178, 34, 34);
        doc.triangle(15, 11, 19, 11, 17, 8, 'F');
        doc.setFillColor(212, 175, 55);
        doc.triangle(19, 11, 21, 11, 20, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('DANANTARA', 24, 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text('REPUBLIK INDONESIA', 24, 18);
      }

      // 2. Center Logo (Custom or ID Survey default)
      let centerRendered = false;
      if (customCenterLogo) {
        try {
          drawFittedLogo(customCenterLogo, 82, 7.0, 46, 12.5, 'center', 'custom_center_logo');
          centerRendered = true;
        } catch (e) {
          console.warn('Failed to add custom center logo:', e);
        }
      } else if (isDefaultSI && logos.idsurvey) {
        try {
          doc.addImage(logos.idsurvey, 'PNG', 89, 8.5, 30.0, 9.2, 'idsurvey_logo', 'FAST');
          centerRendered = true;
        } catch (e) {
          console.warn('Failed to add idsurvey image to PDF:', e);
        }
      }
      if (!centerRendered && isDefaultSI) {
        doc.setFillColor(2, 132, 199);
        doc.circle(92, 13.5, 3, 'F');
        doc.setFillColor(255, 255, 255);
        doc.circle(92, 13.5, 1.8, 'F');
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.6);
        doc.line(91.5, 13.5, 92.5, 14.5);
        doc.line(92.5, 14.5, 94.5, 12.5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text('id', 97, 15);
        doc.setFont('helvetica', 'normal');
        doc.text('survey', 100.5, 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Testing · Inspection · Certification', 105, 19, { align: 'center' });
      }

      // 3. Right Logo (Custom or Surveyor Indonesia default)
      let rightRendered = false;
      if (customRightLogo) {
        try {
          drawFittedLogo(customRightLogo, 157, 7.0, 38, 12.5, 'right', 'custom_right_logo');
          rightRendered = true;
        } catch (e) {
          console.warn('Failed to add custom right logo:', e);
        }
      } else if (isDefaultSI && logos.surveyor) {
        try {
          doc.addImage(logos.surveyor, 'PNG', 195 - 15.5, 8.0, 15.5, 11.0, 'surveyor_logo', 'FAST');
          rightRendered = true;
        } catch (e) {
          console.warn('Failed to add surveyor image to PDF:', e);
        }
      }
      if (!rightRendered && isDefaultSI) {
        const xRight = 171;
        doc.setDrawColor(2, 132, 199);
        doc.setLineWidth(0.2);
        doc.circle(xRight - 4, 14, 3, 'S');
        doc.ellipse(xRight - 4, 14, 1.2, 3, 'S');
        doc.line(xRight - 7, 14, xRight - 1, 14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(2, 132, 199);
        doc.text('SURVEYOR', xRight + 1, 13);
        doc.text('INDONESIA', xRight + 1, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(100, 116, 139);
        doc.text('Member of ID Survey', xRight + 1, 19.5);
      }
    }

    // Page Number Indicator
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Halaman ${pNum} dari 4`, rightMargin, 22.5, { align: 'right' });
  };

  // =========================================================================
  // AUTO-FIT TEXT HELPERS (Prevent horizontal/vertical cell overflow WITHOUT
  // ever expanding row heights or adding extra pages beyond the 4-page rule)
  // =========================================================================
  const truncateToWidth = (text: string, maxW: number): string => {
    const ellipsis = '...';
    if (doc.getTextWidth(text) <= maxW) return text;
    if (doc.getTextWidth(ellipsis) >= maxW) return '';
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.getTextWidth(text.slice(0, mid) + ellipsis) <= maxW) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return text.slice(0, lo).trimEnd() + ellipsis;
  };

  const drawFittedSingleLine = (
    rawText: string,
    x: number,
    y: number,
    maxW: number,
    opts: {
      fontSize?: number;
      minFontSize?: number;
      fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
      align?: 'left' | 'center' | 'right';
      color?: number[];
    } = {}
  ) => {
    const text = (rawText ?? '').toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const startSize = opts.fontSize ?? 8;
    const minSize = opts.minFontSize ?? 5.5;
    const style = opts.fontStyle ?? 'normal';
    const align = opts.align ?? 'left';

    doc.setFont('helvetica', style);
    if (opts.color) {
      doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
    }

    let size = startSize;
    doc.setFontSize(size);
    while (size > minSize && doc.getTextWidth(text) > maxW) {
      size = Math.max(minSize, Math.round((size - 0.25) * 100) / 100);
      doc.setFontSize(size);
    }

    const finalText = doc.getTextWidth(text) > maxW ? truncateToWidth(text, maxW) : text;
    doc.text(finalText, x, y, { align });
  };

  const drawFittedCellText = (
    rawText: string,
    x: number,
    cellTopY: number,
    cellH: number,
    maxW: number,
    opts: {
      fontSize?: number;
      minFontSize?: number;
      fontStyle?: 'normal' | 'bold' | 'italic';
      align?: 'left' | 'center' | 'right';
      color?: number[];
      allowTwoLines?: boolean;
    } = {}
  ) => {
    const text = (rawText ?? '').toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const startSize = opts.fontSize ?? 8;
    const minSize = opts.minFontSize ?? 5.5;
    const style = opts.fontStyle ?? 'normal';
    const align = opts.align ?? 'left';
    const allowTwoLines = (opts.allowTwoLines ?? false) && cellH >= 5.0;

    doc.setFont('helvetica', style);
    if (opts.color) {
      doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
    }

    // Step 1: Try fitting on a single line cleanly (shrink down to startSize - 1.25 if two lines allowed, else minSize)
    const singleLineFloor = allowTwoLines ? Math.max(minSize, startSize - 1.25) : minSize;
    let size = startSize;
    doc.setFontSize(size);
    while (size > singleLineFloor && doc.getTextWidth(text) > maxW) {
      size = Math.max(singleLineFloor, Math.round((size - 0.25) * 100) / 100);
      doc.setFontSize(size);
    }

    if (doc.getTextWidth(text) <= maxW || !allowTwoLines) {
      const finalText = doc.getTextWidth(text) > maxW ? truncateToWidth(text, maxW) : text;
      const baselineY = cellTopY + cellH / 2 + size * 0.125;
      doc.text(finalText, x, baselineY, { align });
      return;
    }

    // Step 2: Fit nicely into 2 compact lines strictly inside fixed cellH (never expands row height)
    let twoLineSize = Math.min(startSize - 1.0, 6.75);
    let lines: string[] = [];
    while (twoLineSize >= minSize) {
      doc.setFontSize(twoLineSize);
      lines = doc.splitTextToSize(text, maxW);
      const fitsTwo = lines.length <= 2 && lines.every((l) => doc.getTextWidth(l) <= maxW + 0.1);
      if (fitsTwo) break;
      if (twoLineSize === minSize) break;
      twoLineSize = Math.max(minSize, Math.round((twoLineSize - 0.25) * 100) / 100);
    }

    doc.setFontSize(twoLineSize);
    if (lines.length > 2) {
      const line1 = truncateToWidth(lines[0], maxW);
      const rest = lines.slice(1).join(' ');
      lines = [line1, truncateToWidth(rest, maxW)];
    } else {
      lines = lines.map((l) => (doc.getTextWidth(l) > maxW ? truncateToWidth(l, maxW) : l));
    }

    if (lines.length === 1) {
      const baselineY = cellTopY + cellH / 2 + twoLineSize * 0.125;
      doc.text(lines[0], x, baselineY, { align });
      return;
    }

    const lineGap = Math.min(cellH * 0.44, twoLineSize * 0.39);
    const midY = cellTopY + cellH / 2 + twoLineSize * 0.12;
    doc.text(lines[0], x, midY - lineGap / 2, { align });
    doc.text(lines[1], x, midY + lineGap / 2, { align });
  };

  // Helper function to draw contact info footer at the bottom of every page (customizable per jalur)
  const drawPageFooter = (pNum: number, totalPages: number = 4) => {
    // Top border line
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.setLineWidth(0.15);
    doc.line(15, 282, 195, 282);

    const phoneText = (pdfCfg.footerPhone || '').trim();
    const emailText = (pdfCfg.footerEmail || '').trim();
    const webText = (pdfCfg.footerWebsite || '').trim();

    const structuredLine1Parts: string[] = [];
    if (phoneText) structuredLine1Parts.push(`Telp: ${phoneText}`);
    if (emailText) structuredLine1Parts.push(`Email: ${emailText}`);

    const line1 = (pdfCfg.footerLine1 || '').trim() || structuredLine1Parts.join('   |   ');
    const line2 = (pdfCfg.footerLine2 || '').trim() || webText;
    const leftPrefix = (pdfCfg.footerLeftPrefix || 'Kode Lahan').trim();
    const footerSlate = [100, 116, 139];

    if (line1) {
      drawFittedSingleLine(line1, 105, 286, 176, {
        fontSize: 7,
        minFontSize: 5.5,
        fontStyle: 'normal',
        align: 'center',
        color: footerSlate
      });
    }
    if (line2) {
      drawFittedSingleLine(line2, 105, 290, 58, {
        fontSize: 7,
        minFontSize: 5.2,
        fontStyle: 'bold',
        align: 'center',
        color: footerSlate
      });
    }

    // Page indicator (right zone) & left code (left zone, guarded from colliding with center website)
    drawFittedSingleLine(`Halaman ${pNum} dari ${totalPages}`, 195, 290, 55, {
      fontSize: 7,
      minFontSize: 5.5,
      fontStyle: 'normal',
      align: 'right',
      color: footerSlate
    });
    drawFittedSingleLine(`${leftPrefix}: ${record.CODE || '-'}`, 15, 290, 58, {
      fontSize: 7,
      minFontSize: 5.2,
      fontStyle: 'normal',
      align: 'left',
      color: footerSlate
    });
  };

  // Helper to draw clean table grids with key-value rows
  const drawKeyValueTable = (
    startY: number, 
    data: { label: string; value: string }[], 
    columnWidths: [number, number, number] // [labelWidth, spacerWidth, valueWidth]
  ): number => {
    let currentY = startY;
    const rowHeight = 6.2;
    const tableWidth = contentWidth;

    // Outer table border
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.3);
    doc.rect(leftMargin, startY, tableWidth, data.length * rowHeight);

    data.forEach((row, idx) => {
      // Row background zebra striping (alternate)
      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 251); // gray-50
        doc.rect(leftMargin + 0.15, currentY + 0.15, tableWidth - 0.3, rowHeight - 0.3, 'F');
      }

      // Horizontal dividers
      if (idx > 0) {
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.15);
        doc.line(leftMargin, currentY, rightMargin, currentY);
      }

      // Vertical columns lines
      doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.setLineWidth(0.2);
      
      const col1Right = leftMargin + columnWidths[0];
      const col2Right = col1Right + columnWidths[1];

      // Inner vertical lines
      doc.line(col1Right, currentY, col1Right, currentY + rowHeight);
      doc.line(col2Right, currentY, col2Right, currentY + rowHeight);

      // Labels Text (auto-fit inside label column so it never touches the ':' divider)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text(`${idx + 1}.`, leftMargin + 2, currentY + 4.1);
      drawFittedCellText(row.label, leftMargin + 6, currentY, rowHeight, columnWidths[0] - 7.5, {
        fontSize: 8,
        minFontSize: 6.0,
        fontStyle: 'normal',
        color: textGray,
        allowTwoLines: false
      });

      // Spacer Column (usually contains ':')
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text(':', col1Right + columnWidths[1] / 2, currentY + 4.1, { align: 'center' });

      // Value text (auto-fit + 2-line support within fixed rowHeight so it never overflows right border)
      drawFittedCellText(row.value || '-', col2Right + 2.5, currentY, rowHeight, columnWidths[2] - 5, {
        fontSize: 8,
        minFontSize: 5.5,
        fontStyle: 'bold',
        color: darkSlate,
        allowTwoLines: true
      });

      currentY += rowHeight;
    });

    return currentY;
  };


  // ==========================================
  // PAGE 1: Transmisi, Pihak Berhak, Lahan, Tanah & Bangunan
  // ==========================================
  drawPageHeader(1);

  // Document main title (auto-fit single-line so long custom titles never overflow margins or push layout down)
  drawFittedSingleLine((pdfCfg.docTitleLine1 || 'FORMULIR INVENTARISASI').toUpperCase(), 105, 31, contentWidth, {
    fontSize: 11,
    minFontSize: 8,
    fontStyle: 'bold',
    align: 'center',
    color: darkSlate
  });
  drawFittedSingleLine((pdfCfg.docTitleLine2 || 'PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK').toUpperCase(), 105, 36, contentWidth, {
    fontSize: 11,
    minFontSize: 7.5,
    fontStyle: 'bold',
    align: 'center',
    color: darkSlate
  });
  drawFittedSingleLine(effectiveProjectTitle, 105, 41, contentWidth, {
    fontSize: 10,
    minFontSize: 7,
    fontStyle: 'bold',
    align: 'center',
    color: darkSlate
  });

  let y = 47;

  // --- SECTION I: DATA JARINGAN TRANSMISI ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('I. DATA JARINGAN TRANSMISI', leftMargin, y);
  
  y += 3;
  const section1Data = [
    { label: 'Jaringan Transmisi', value: effectiveProjectTitle },
    { label: 'Nomor SPAN (Tower)', value: record.SPAN },
    { label: 'Nomor Bidang Lahan', value: record.NOBID }
  ];
  y = drawKeyValueTable(y, section1Data, [45, 6, 129]);

  y += 5;

  // --- SECTION II: DATA PIHAK YANG BERHAK ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('II. DATA PIHAK YANG BERHAK', leftMargin, y);

  y += 3;
  const section2Data = [
    { label: 'Status Kepemilikan', value: record.STATUS_KEPEMILIKAN },
    { label: 'Nama Lengkap Pemilik', value: record.NAMA },
    { label: 'Pekerjaan', value: record.PEKERJAAN },
    { label: 'Nomor Identitas (NIK)', value: record.NIK }
  ];
  y = drawKeyValueTable(y, section2Data, [45, 6, 129]);

  y += 5;

  // --- SECTION III: DATA BIDANG TANAH ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('III. DATA BIDANG TANAH', leftMargin, y);

  y += 3;
  const coordProjectionLabel = projectionOption.sheetRowLabel;
  const coordProjectionValue = (pdfCfg.coordinateLabelOverride || '').trim() || projectionOption.sheetRowValue;
  const buktiKepemilikanValue = [
    (record.JENIS_ALAS_HAK || '').trim(),
    record.NOMER_HAK && record.NOMER_HAK.trim() ? `(No: ${record.NOMER_HAK.trim()})` : ''
  ].filter(Boolean).join(' ') || '-';

  const section3Data = [
    { label: coordProjectionLabel, value: coordProjectionValue },
    { label: 'Desa / Kelurahan', value: record.DESA ? record.DESA.trim().replace(/^(desa|kelurahan|kel\.?|dsa\.?)\s+/i, '').toUpperCase() : '-' },
    { label: 'Kecamatan', value: record.KECAMATAN },
    { label: 'Kabupaten/Kota', value: record.KABUPATEN },
    { label: 'Jenis Bukti Kepenguasaan / Kepemilikan', value: buktiKepemilikanValue },
    { label: 'Penutup Lahan / Kondisi Fisik Lahan', value: record.PENUTUP_LAHAN }
  ];
  y = drawKeyValueTable(y, section3Data, [62, 6, 112]);

  y += 5;

  // --- SECTION IV: DATA TANAH DAN BANGUNAN ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('IV. DATA TANAH DAN BANGUNAN', leftMargin, y);

  y += 3;
  
  // Custom styled table for buildings and land (rebalanced widths so KETERANGAN / SPESIFIKASI has ample space)
  const table4Widths = [12, 54, 30, 84]; // Total = 180mm (NO=12, URAIAN=54, LUAS=30, KETERANGAN=84)
  const col1 = leftMargin;
  const col2 = col1 + table4Widths[0];
  const col3 = col2 + table4Widths[1];
  const col4 = col3 + table4Widths[2];

  // Header row for Table IV
  doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.rect(leftMargin, y, contentWidth, 6.5, 'F');
  
  const whiteColor = [255, 255, 255];
  drawFittedSingleLine('NO', col1 + table4Widths[0] / 2, y + 4.4, table4Widths[0] - 2, {
    fontSize: 8, minFontSize: 6.5, fontStyle: 'bold', align: 'center', color: whiteColor
  });
  drawFittedSingleLine('URAIAN', col2 + 3, y + 4.4, table4Widths[1] - 6, {
    fontSize: 8, minFontSize: 6.5, fontStyle: 'bold', align: 'left', color: whiteColor
  });
  drawFittedSingleLine('LUAS (M²)', col3 + 3, y + 4.4, table4Widths[2] - 6, {
    fontSize: 8, minFontSize: 6.5, fontStyle: 'bold', align: 'left', color: whiteColor
  });
  drawFittedSingleLine('KETERANGAN / SPESIFIKASI', col4 + 3, y + 4.4, table4Widths[3] - 6, {
    fontSize: 8, minFontSize: 6.5, fontStyle: 'bold', align: 'left', color: whiteColor
  });

  y += 6.5;

  const formatBuildingSpec = (b?: { luas?: string; bentuk?: string; jenis?: string }) => {
    if (!b?.luas) return '';
    return [b.bentuk, b.jenis].map((s) => (s || '').trim()).filter(Boolean).join(' · ');
  };

  // Compile Tanah + 5 Buildings to print
  const table4Rows = [
    { no: '1.', uraian: 'Luas Tanah', luas: record.LUAS, ket: record.PENUTUP_LAHAN ? `Kondisi: ${record.PENUTUP_LAHAN}` : '-' },
    { no: '2.', uraian: 'Luas Bangunan 1', luas: record.buildings?.[0]?.luas || '', ket: formatBuildingSpec(record.buildings?.[0]) },
    { no: '3.', uraian: 'Luas Bangunan 2', luas: record.buildings?.[1]?.luas || '', ket: formatBuildingSpec(record.buildings?.[1]) },
    { no: '4.', uraian: 'Luas Bangunan 3', luas: record.buildings?.[2]?.luas || '', ket: formatBuildingSpec(record.buildings?.[2]) },
    { no: '5.', uraian: 'Luas Bangunan 4', luas: record.buildings?.[3]?.luas || '', ket: formatBuildingSpec(record.buildings?.[3]) },
    { no: '6.', uraian: 'Luas Bangunan 5', luas: record.buildings?.[4]?.luas || '', ket: formatBuildingSpec(record.buildings?.[4]) }
  ];

  const rowHeight4 = 6;
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, y, contentWidth, table4Rows.length * rowHeight4);

  table4Rows.forEach((row, idx) => {
    // Alternating background
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(leftMargin + 0.15, y + 0.15, contentWidth - 0.3, rowHeight4 - 0.3, 'F');
    }

    // Dividers
    if (idx > 0) {
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, y, rightMargin, y);
    }

    // Vertical line split
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(col2, y, col2, y + rowHeight4);
    doc.line(col3, y, col3, y + rowHeight4);
    doc.line(col4, y, col4, y + rowHeight4);

    // Text Values (auto-fit inside fixed 6mm cell so nothing ever overflows borders)
    drawFittedCellText(row.no, col1 + table4Widths[0] / 2, y, rowHeight4, table4Widths[0] - 2, {
      fontSize: 8, minFontSize: 6.5, fontStyle: 'normal', align: 'center', color: textGray
    });
    drawFittedCellText(row.uraian, col2 + 3, y, rowHeight4, table4Widths[1] - 6, {
      fontSize: 8, minFontSize: 6.0, fontStyle: 'normal', align: 'left', color: textGray
    });
    drawFittedCellText(row.luas ? `${row.luas} m²` : '-', col3 + 3, y, rowHeight4, table4Widths[2] - 6, {
      fontSize: 8, minFontSize: 6.0, fontStyle: 'bold', align: 'left', color: darkSlate
    });
    drawFittedCellText(row.ket || '-', col4 + 3, y, rowHeight4, table4Widths[3] - 6, {
      fontSize: 8, minFontSize: 5.5, fontStyle: 'normal', align: 'left', color: [100, 116, 139], allowTwoLines: true
    });

    y += rowHeight4;
  });


  // ==========================================
  // PAGE 2: Daftar Tanaman & Blok Tanda Tangan
  // ==========================================
  doc.addPage();
  let currentPNum = 2;
  drawPageHeader(currentPNum);

  let y2 = 30;

  // --- SECTION V: DATA TANAMAN ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('V. DATA TANAMAN', leftMargin, y2);

  y2 += 3.5;

  // Setup complex crop table layout
  const colWidthsCrop = [12, 58, 55, 55]; // NO, JENIS, TANAMAN BUAH (PROD/NON-PROD), TANAMAN KERAS (KECIL/SEDANG/BESAR)
  const subWidthsBuah = [27.5, 27.5];
  const subWidthsKeras = [18.3, 18.3, 18.4];

  const xCol1 = leftMargin;
  const xCol2 = xCol1 + colWidthsCrop[0];
  const xCol3 = xCol2 + colWidthsCrop[1];
  const xCol4 = xCol3 + colWidthsCrop[2];

  const drawCropTableHeader = (startY: number) => {
    doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.rect(leftMargin, startY, contentWidth, 11, 'F');

    const whiteText = [255, 255, 255];
    drawFittedSingleLine('NO', xCol1 + colWidthsCrop[0] / 2, startY + 7, colWidthsCrop[0] - 2, {
      fontSize: 7.5, minFontSize: 6.0, fontStyle: 'bold', align: 'center', color: whiteText
    });
    drawFittedSingleLine('JENIS TANAMAN', xCol2 + 3, startY + 7, colWidthsCrop[1] - 6, {
      fontSize: 7.5, minFontSize: 6.0, fontStyle: 'bold', align: 'left', color: whiteText
    });

    drawFittedSingleLine('JUMLAH TANAMAN BUAH', xCol3 + colWidthsCrop[2] / 2, startY + 3.5, colWidthsCrop[2] - 2, {
      fontSize: 7.5, minFontSize: 6.0, fontStyle: 'bold', align: 'center', color: whiteText
    });
    drawFittedSingleLine('PRODUKTIF', xCol3 + subWidthsBuah[0] / 2, startY + 8.5, subWidthsBuah[0] - 2, {
      fontSize: 7.2, minFontSize: 5.5, fontStyle: 'bold', align: 'center', color: whiteText
    });
    drawFittedSingleLine('NON-PRODUKTIF', xCol3 + subWidthsBuah[0] + subWidthsBuah[1] / 2, startY + 8.5, subWidthsBuah[1] - 2, {
      fontSize: 7.2, minFontSize: 5.5, fontStyle: 'bold', align: 'center', color: whiteText
    });

    drawFittedSingleLine('JUMLAH TANAMAN KERAS', xCol4 + colWidthsCrop[3] / 2, startY + 3.5, colWidthsCrop[3] - 2, {
      fontSize: 7.5, minFontSize: 6.0, fontStyle: 'bold', align: 'center', color: whiteText
    });
    drawFittedSingleLine('KECIL', xCol4 + subWidthsKeras[0] / 2, startY + 8.5, subWidthsKeras[0] - 2, {
      fontSize: 7.2, minFontSize: 5.5, fontStyle: 'bold', align: 'center', color: whiteText
    });
    drawFittedSingleLine('SEDANG', xCol4 + subWidthsKeras[0] + subWidthsKeras[1] / 2, startY + 8.5, subWidthsKeras[1] - 2, {
      fontSize: 7.2, minFontSize: 5.5, fontStyle: 'bold', align: 'center', color: whiteText
    });
    drawFittedSingleLine('BESAR', xCol4 + subWidthsKeras[0] + subWidthsKeras[1] + subWidthsKeras[2] / 2, startY + 8.5, subWidthsKeras[2] - 2, {
      fontSize: 7.2, minFontSize: 5.5, fontStyle: 'bold', align: 'center', color: whiteText
    });

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.line(xCol3, startY + 5, rightMargin, startY + 5);
    doc.line(xCol3 + subWidthsBuah[0], startY + 5, xCol3 + subWidthsBuah[0], startY + 11);
    doc.line(xCol4 + subWidthsKeras[0], startY + 5, xCol4 + subWidthsKeras[0], startY + 11);
    doc.line(xCol4 + subWidthsKeras[0] + subWidthsKeras[1], startY + 5, xCol4 + subWidthsKeras[0] + subWidthsKeras[1], startY + 11);
  };

  drawCropTableHeader(y2);
  y2 += 11;

  // Filter crops with name
  const activePlants = (record.plants || []).filter(p => p.jenis && p.jenis.trim() !== "");
  
  // Total target rows (30 is max) — dynamically fit all rows + declaration + signatures on Page 2 (NEVER add Page 5!)
  const totalPlantRows = Math.max(14, Math.min(30, activePlants.length));
  const plantRowsToDraw: any[] = [];
  
  for (let i = 0; i < totalPlantRows; i++) {
    if (i < activePlants.length) {
      plantRowsToDraw.push(activePlants[i]);
    } else {
      plantRowsToDraw.push({ jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' });
    }
  }

  // Pre-compute declaration & signature height budget so Page 2 strictly stays 1 page
  const isCompactPage2 = totalPlantRows > 20;
  const gapAfterCropTable = isCompactPage2 ? 3 : 5;
  const declFontSize = isCompactPage2 ? 7.5 : 8;
  const declLineH = isCompactPage2 ? 3.6 : 4.2;
  const declBottomGap = isCompactPage2 ? 3.5 : 5;
  const sigRowStep = isCompactPage2 ? 16.5 : 18.5;
  const sigBottomOffset = isCompactPage2 ? 10 : 12;
  const sigStampOffset = isCompactPage2 ? 10 : 11;
  const sigKadesNameOffset = isCompactPage2 ? 20.5 : 23;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(declFontSize);
  const closingText = 'Yang bertanda tangan di bawah ini, menyatakan bahwa secara bersama-sama telah melakukan inventarisasi dengan hasil yang sesuai dengan di lapangan dan tidak akan mengubah hasil inventarisasi ini sampai proses kompensasi selesai.';
  const lines = doc.splitTextToSize(closingText, contentWidth - 4);

  const declTotalH = lines.length * declLineH + declBottomGap;
  const sigTotalH = sigRowStep * 2 + sigBottomOffset + sigStampOffset + sigKadesNameOffset;
  const maxPage2BottomY = 277; // Safe margin above footer line at y=282
  const availableForPlants = Math.max(40, maxPage2BottomY - y2 - gapAfterCropTable - declTotalH - sigTotalH);
  const rowHeight2 = Math.min(5.2, Math.max(3.6, Math.floor((availableForPlants / totalPlantRows) * 10) / 10));
  const cropFontSize = rowHeight2 >= 4.8 ? 7.5 : rowHeight2 >= 4.2 ? 7.0 : 6.5;

  plantRowsToDraw.forEach((row, idx) => {
    // Zebra Striping
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(leftMargin + 0.15, y2 + 0.15, contentWidth - 0.3, rowHeight2 - 0.3, 'F');
    }

    // Dividers
    if (idx > 0) {
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, y2, rightMargin, y2);
    }

    // Vertical lines
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(xCol1, y2, xCol1, y2 + rowHeight2);
    doc.line(xCol2, y2, xCol2, y2 + rowHeight2);
    doc.line(xCol3, y2, xCol3, y2 + rowHeight2);
    doc.line(xCol4, y2, xCol4, y2 + rowHeight2);
    doc.line(rightMargin, y2, rightMargin, y2 + rowHeight2);
    
    // Sub-vertical lines
    doc.line(xCol3 + subWidthsBuah[0], y2, xCol3 + subWidthsBuah[0], y2 + rowHeight2);
    doc.line(xCol4 + subWidthsKeras[0], y2, xCol4 + subWidthsKeras[0], y2 + rowHeight2);
    doc.line(xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2, xCol4 + subWidthsKeras[0] + subWidthsKeras[1], y2 + rowHeight2);

    // Horizontal border at bottom
    doc.line(leftMargin, y2 + rowHeight2, rightMargin, y2 + rowHeight2);

    // Write auto-fitted text values (never overflow into neighboring columns)
    drawFittedCellText(`${idx + 1}`, xCol1 + colWidthsCrop[0] / 2, y2, rowHeight2, colWidthsCrop[0] - 2, {
      fontSize: cropFontSize, minFontSize: 5.5, fontStyle: 'normal', align: 'center', color: textGray
    });

    if (row.jenis) {
      drawFittedCellText(row.jenis, xCol2 + 2.5, y2, rowHeight2, colWidthsCrop[1] - 5, {
        fontSize: cropFontSize, minFontSize: 5.2, fontStyle: 'bold', align: 'left', color: darkSlate, allowTwoLines: rowHeight2 >= 5.0
      });
    }

    const valProd = row.sudah_menghasilkan || (row.jenis ? '0' : '');
    const valNonProd = row.belum_menghasilkan || (row.jenis ? '0' : '');
    const valKecil = row.kecil || (row.jenis ? '0' : '');
    const valSedang = row.sedang || (row.jenis ? '0' : '');
    const valBesar = row.besar || (row.jenis ? '0' : '');

    if (valProd) {
      drawFittedCellText(String(valProd), xCol3 + subWidthsBuah[0] / 2, y2, rowHeight2, subWidthsBuah[0] - 2.5, {
        fontSize: cropFontSize, minFontSize: 5.2, fontStyle: 'bold', align: 'center', color: darkSlate
      });
    }
    if (valNonProd) {
      drawFittedCellText(String(valNonProd), xCol3 + subWidthsBuah[0] + subWidthsBuah[1] / 2, y2, rowHeight2, subWidthsBuah[1] - 2.5, {
        fontSize: cropFontSize, minFontSize: 5.2, fontStyle: 'bold', align: 'center', color: darkSlate
      });
    }
    if (valKecil) {
      drawFittedCellText(String(valKecil), xCol4 + subWidthsKeras[0] / 2, y2, rowHeight2, subWidthsKeras[0] - 2, {
        fontSize: cropFontSize, minFontSize: 5.0, fontStyle: 'bold', align: 'center', color: darkSlate
      });
    }
    if (valSedang) {
      drawFittedCellText(String(valSedang), xCol4 + subWidthsKeras[0] + subWidthsKeras[1] / 2, y2, rowHeight2, subWidthsKeras[1] - 2, {
        fontSize: cropFontSize, minFontSize: 5.0, fontStyle: 'bold', align: 'center', color: darkSlate
      });
    }
    if (valBesar) {
      drawFittedCellText(String(valBesar), xCol4 + subWidthsKeras[0] + subWidthsKeras[1] + subWidthsKeras[2] / 2, y2, rowHeight2, subWidthsKeras[2] - 2, {
        fontSize: cropFontSize, minFontSize: 5.0, fontStyle: 'bold', align: 'center', color: darkSlate
      });
    }

    y2 += rowHeight2;
  });

  y2 += gapAfterCropTable;

  // --- DECLARATION TEXT BLOCK (SESUAI GAMBAR ACUAN) ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(declFontSize);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

  lines.forEach((line: string, i: number) => {
    doc.text(line, leftMargin + 1, y2 + 3.8 + (i * declLineH));
  });

  y2 += declTotalH;

  // Helper for title casing names from user data while preserving common Indonesian academic/honorific titles
  const PRESERVED_UPPER_TOKENS = new Set([
    'SH', 'SE', 'ST', 'SP', 'SI', 'MM', 'MH', 'MT', 'MP', 'MS', 'MA', 'MBA', 'MPD', 'MSI', 'SKM', 'SIP', 'SPD', 'SHU', 'AK', 'CA', 'DR', 'DRS', 'DRA', 'IR', 'HJ', 'KH', 'PLT', 'PJ', 'PJS', 'SH.', 'SE.', 'ST.', 'SP.', 'MM.', 'MH.', 'MT.', 'MP.', 'MSI.', 'SIP.', 'SPD.', 'SKM.'
  ]);
  const formatNameDisplay = (str?: string) => {
    if (!str || !str.trim()) return '';
    const s = str.trim();
    if (s === s.toUpperCase() && s.length > 2) {
      return s.replace(/\S+/g, (token) => {
        const strippedPunct = token.replace(/^[,.\-()]+|[,.\-()]+$/g, '');
        const upperClean = strippedPunct.toUpperCase();
        // Preserve dotted academic degrees like S.H., S.Pd., M.M., S.Sos., S.IP.
        if (/^([A-Z]\.){2,}$/i.test(strippedPunct) || /^[A-Z]\.[A-Z][a-z]*\.?$/i.test(strippedPunct)) {
          return token.replace(/[A-Za-z]+/g, (part, offset) =>
            offset === 0 || part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.substring(1).toLowerCase()
          );
        }
        if (PRESERVED_UPPER_TOKENS.has(upperClean) || PRESERVED_UPPER_TOKENS.has(token.toUpperCase())) {
          if (upperClean === 'PLT' || upperClean === 'PJ' || upperClean === 'PJS' || upperClean === 'DRS' || upperClean === 'DRA' || upperClean === 'IR' || upperClean === 'HJ') {
            return token.charAt(0).toUpperCase() + token.substring(1).toLowerCase();
          }
          return token.toUpperCase();
        }
        return token.charAt(0).toUpperCase() + token.substring(1).toLowerCase();
      });
    }
    return s;
  };

  // Village / Kelurahan Head Title (adapts dynamically to STATUS_KEPALA & STATUS_DESA)
  const desaRaw = (record.DESA || '').trim();
  const desaBase = desaRaw.replace(/^(desa|kelurahan|kel\.?|dsa\.?)\s+/i, '').trim();
  const formattedDesaBase = formatNameDisplay(desaBase);

  const statusKepalaRaw = (record.STATUS_KEPALA || '').trim();
  const statusKepalaUpper = statusKepalaRaw.toUpperCase();
  const statusDesaUpper = (record.STATUS_DESA || '').trim().toUpperCase();

  let kepalaRoleLabel = 'Kepala Desa';
  if (statusKepalaUpper) {
    if (statusKepalaUpper === 'LURAH') {
      kepalaRoleLabel = 'Lurah';
    } else if (statusKepalaUpper === 'KEPALA DESA' || statusKepalaUpper === 'KADES') {
      kepalaRoleLabel = 'Kepala Desa';
    } else {
      // Custom typed jabatan (e.g. "Pj. Kepala Desa", "Plt. Lurah", "Sekretaris Desa")
      kepalaRoleLabel = formatNameDisplay(statusKepalaRaw);
    }
  } else if (statusDesaUpper.includes('KELURAHAN') || desaRaw.toUpperCase().startsWith('KELURAHAN ')) {
    kepalaRoleLabel = 'Lurah';
  }

  let desaTitle = kepalaRoleLabel;
  if (formattedDesaBase) {
    if (kepalaRoleLabel.toLowerCase().includes(formattedDesaBase.toLowerCase())) {
      desaTitle = kepalaRoleLabel;
    } else {
      desaTitle = `${kepalaRoleLabel} ${formattedDesaBase}`;
    }
  }

  // Execution Date
  let displayDate = formattedDate;
  if (record.TANGGAL_PELAKSANAAN && record.TANGGAL_PELAKSANAAN.trim()) {
    const rawDate = record.TANGGAL_PELAKSANAAN.trim();
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      displayDate = parsed.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } else {
      displayDate = rawDate;
    }
  }

  const nameTim1 = formatNameDisplay(record.nama_tim_1);
  const nameTim2 = formatNameDisplay(record.nama_tim_2);
  const nameOwner = formatNameDisplay(record.NAMA);
  const nameSaksi1 = formatNameDisplay(record.NAMA_SAKSI_1);
  const nameSaksi2 = formatNameDisplay(record.NAMA_SAKSI_2);
  const nameKades = formatNameDisplay(record.NAMA_KADES) || '........................................';

  // --- STRUKTUR TABEL TANDA TANGAN 3 KOLOM SESUAI LAMPIRAN USER ---
  // Kolom: No (15..22, w:7), TIM INVENTARISASI (22..84, w:62), PIHAK YANG BERHAK (84..138, w:54), PARA SAKSI (138..195, w:57)
  const yTable = y2;
  
  // Header Baris 1: Judul Kategori Kolom
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

  doc.text('TIM INVENTARISASI', 53, yTable, { align: 'center' });
  doc.text('PIHAK YANG BERHAK', 111, yTable, { align: 'center' });
  doc.text('PARA SAKSI', 166.5, yTable, { align: 'center' });

  // Header Baris 2: Sub-header Kolom
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);

  // Tim: "Nama dan" \n "Jabatan" & "Tanda Tangan"
  doc.text('Nama dan', 38, yTable + 4.2, { align: 'center' });
  doc.text('Jabatan', 38, yTable + 7.4, { align: 'center' });
  doc.text('Tanda Tangan', 70, yTable + 6, { align: 'center' });

  // Pihak yang Berhak: "Nama" & "Tanda Tangan"
  doc.text('Nama', 97, yTable + 6, { align: 'center' });
  doc.text('Tanda Tangan', 124, yTable + 6, { align: 'center' });

  // Para Saksi: "Nama" & "Tanda Tangan"
  doc.text('Nama', 151, yTable + 6, { align: 'center' });
  doc.text('Tanda Tangan', 179.5, yTable + 6, { align: 'center' });

  // --- HELPER UNTUK POSISI TENGAH NAMA & TANDA TANGAN (VERTICALLY CENTERED) ---
  const drawCenteredName = (
    name: string,
    x: number,
    yCenter: number,
    maxW: number = 24,
    roleSubtitle?: string
  ) => {
    const displayName = (name || '....................').trim();
    doc.setFont('helvetica', 'normal');
    let nameFontSize = name ? 8 : 7.5;
    doc.setFontSize(nameFontSize);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

    let nameLines: string[] = name ? doc.splitTextToSize(displayName, maxW) : [displayName];
    // Shrink font slightly if long name wraps beyond 2 lines or has a wide unbroken word
    if (name) {
      while (
        nameFontSize > 6.0 &&
        (nameLines.length > 2 || nameLines.some((l) => doc.getTextWidth(l) > maxW + 0.1))
      ) {
        nameFontSize = Math.max(6.0, Math.round((nameFontSize - 0.25) * 100) / 100);
        doc.setFontSize(nameFontSize);
        nameLines = doc.splitTextToSize(displayName, maxW);
      }
      if (nameLines.length > 3) {
        nameLines = [nameLines[0], nameLines[1], truncateToWidth(nameLines.slice(2).join(' '), maxW)];
      } else {
        nameLines = nameLines.map((l) => (doc.getTextWidth(l) > maxW ? truncateToWidth(l, maxW) : l));
      }
    }

    let roleLines: string[] = [];
    if (roleSubtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      roleLines = doc.splitTextToSize(roleSubtitle, maxW);
    }

    const nameLineH = nameFontSize >= 7.5 ? 3.4 : 2.9;
    const roleLineH = 2.6;
    const gapBetween = roleLines.length > 0 ? 0.9 : 0;
    const totalHeight =
      nameLines.length * nameLineH +
      gapBetween +
      roleLines.length * roleLineH;

    let curY = yCenter - totalHeight / 2 + 2.3;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(nameFontSize);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    nameLines.forEach((line) => {
      doc.text(line, x, curY, { align: 'center' });
      curY += nameLineH;
    });

    if (roleLines.length > 0) {
      curY += gapBetween - 0.4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      roleLines.forEach((line) => {
        doc.text(line, x, curY, { align: 'center' });
        curY += roleLineH;
      });
    }
  };

  const drawCenteredSignature = (sigImage: string | undefined, x: number, yCenter: number) => {
    // Garis titik-titik ttd
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text('....................', x, yCenter + 6.5, { align: 'center' });

    if (sigImage && sigImage.startsWith('data:image/')) {
      try {
        // Gambar ttd dinaikkan agar seimbang berada di tengah-tengah baris sejajar nama
        doc.addImage(sigImage, 'PNG', x - 11, yCenter - 7, 22, 13, undefined, 'FAST');
      } catch (e) {
        console.warn('Failed to embed signature:', e);
      }
    }
  };

  const TIM_INVENT_JABATAN = 'Pelaksana Madya/Operator Madya';

  // --- BARIS 1: 1. | Tim 1 | Pemilik | Saksi 1 ---
  const yCenter1 = yTable + sigRowStep;

  // Nomor 1.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('1.', 17, yCenter1 + 1);

  // Kolom Tim 1 (Nama, Jabatan & TTD)
  drawCenteredName(nameTim1, 38, yCenter1, 34, TIM_INVENT_JABATAN);
  drawCenteredSignature(sigTim1, 70, yCenter1);

  // Kolom Pihak yang Berhak / Pemilik (Nama & TTD)
  drawCenteredName(nameOwner, 97, yCenter1, 24);
  drawCenteredSignature(sigPemilik, 124, yCenter1);

  // Kolom Saksi 1 (Nama & TTD)
  drawCenteredName(nameSaksi1, 151, yCenter1, 24);
  drawCenteredSignature(sigSaksi1, 179.5, yCenter1);

  // --- BARIS 2: 2. | Tim 2 | .................... | Saksi 2 ---
  const yCenter2 = yCenter1 + sigRowStep;

  // Nomor 2.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('2.', 17, yCenter2 + 1);

  // Kolom Tim 2 (Nama, Jabatan & TTD)
  drawCenteredName(nameTim2, 38, yCenter2, 34, TIM_INVENT_JABATAN);
  drawCenteredSignature(sigTim2, 70, yCenter2);

  // Kolom Pihak yang Berhak Baris 2 (Titik-titik nama & ttd sejajar)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('....................', 97, yCenter2 + 1, { align: 'center' });
  doc.text('....................', 124, yCenter2 + 6.5, { align: 'center' });

  // Kolom Saksi 2 (Nama & TTD)
  drawCenteredName(nameSaksi2, 151, yCenter2, 24);
  drawCenteredSignature(sigSaksi2, 179.5, yCenter2);

  // --- BAGIAN BAWAH: TANGGAL, MENGETAHUI, KEPALA DESA, STEMPEL & TTD OVERLAY, NAMA KADES ---
  const yBottom = yCenter2 + sigBottomOffset;

  // Tanggal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(displayDate, 105, yBottom, { align: 'center' });

  // "Mengetahui"
  doc.text('Mengetahui', 105, yBottom + 4.3, { align: 'center' });

  // "Kepala Desa / Lurah [DESA]" (auto-fit width)
  drawFittedSingleLine(desaTitle, 105, yBottom + 9.0, 160, {
    fontSize: 8.5, minFontSize: 6.5, fontStyle: 'bold', align: 'center', color: darkSlate
  });

  // Stempel Desa & Tanda Tangan Kades (Layered Overlay)
  const yStamp = yBottom + sigStampOffset;
  const stampSize = isCompactPage2 ? 21 : 24;

  if (capDesa && capDesa.startsWith('data:image/')) {
    try {
      const hasGState = typeof (doc as any).GState === 'function';
      if (hasGState) {
        (doc as any).setGState(new (doc as any).GState({ opacity: 0.85 }));
      }
      doc.addImage(capDesa, 'PNG', 82, yStamp, stampSize, stampSize, undefined, 'FAST');
      if (hasGState) {
        (doc as any).setGState(new (doc as any).GState({ opacity: 1.0 }));
      }
    } catch (e) {
      console.warn('Failed to embed capDesa:', e);
    }
  }

  if (sigKades && sigKades.startsWith('data:image/')) {
    try {
      doc.addImage(sigKades, 'PNG', 96, yStamp + 1.5, 27, isCompactPage2 ? 14 : 16, undefined, 'FAST');
    } catch (e) {
      console.warn('Failed to embed sigKades:', e);
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.text('........................................', 105, yStamp + (isCompactPage2 ? 15 : 17), { align: 'center' });
  }

  // Nama Kades di bawah stempel & tanda tangan (auto-fit width)
  const yKadesName = yStamp + sigKadesNameOffset;
  drawFittedSingleLine(nameKades, 105, yKadesName, 160, {
    fontSize: 8.5, minFontSize: 6.5, fontStyle: 'bold', align: 'center', color: darkSlate
  });


  // ==========================================
  // PAGE 3: Sketsa Bidang, Koordinat & Batas Lahan
  // ==========================================
  doc.addPage();
  currentPNum++;
  drawPageHeader(currentPNum);

  drawFittedSingleLine('SITUASI DAN DENAH BIDANG TANAH UNTUK KOMPENSASI', 105, 30, contentWidth, {
    fontSize: 10, minFontSize: 8, fontStyle: 'bold', align: 'center', color: darkSlate
  });
  drawFittedSingleLine(`NOMER BIDANG : ${record.NOBID || '-'}`, 105, 34, contentWidth, {
    fontSize: 8, minFontSize: 6.5, fontStyle: 'normal', align: 'center', color: darkSlate
  });

  // Attempt to load and render polygon points dynamically!
  let polygonPoints: [number, number][] = [];
  let geojsonData: any = null;
  let matchedFeat: any = null;
  let rotationDeg = 0;
  let customMapping: any = null;

  try {
    let candidateGeoJSONs: { id?: string; name?: string; type: 'bidang' | 'tower' | 'jalur'; data: any; fieldMapping?: any }[] = [];

    if (Array.isArray(effectiveProjectGeoJSONs) && effectiveProjectGeoJSONs.length > 0) {
      effectiveProjectGeoJSONs.forEach((l: any) => {
        if (l?.data && Array.isArray(l.data.features) && l.data.features.length > 0) {
          candidateGeoJSONs.push({
            id: l.id,
            name: l.name,
            type: l.type || 'bidang',
            data: l.data,
            fieldMapping: l.fieldMapping
          });
        }
      });
    } else if (cachedCandidateGeoJSONs && cachedCandidateGeoJSONs.length > 0 && !activeProjectId) {
      candidateGeoJSONs = cachedCandidateGeoJSONs;
    } else {
      // 1. Gather all custom layers (bidang, tower, jalur) from localStorage
      try {
        const localLayers = JSON.parse(localStorage.getItem('local_geojson_layers') || '[]');
        localLayers.forEach((l: any) => {
          if (l.data && Array.isArray(l.data.features) && l.data.features.length > 0) {
            const inferredType: 'bidang' | 'tower' | 'jalur' =
              l.type === 'tower' || /tower|tapak/i.test(l.name || '') || /tower|tapak/i.test(l.id || '')
                ? 'tower'
                : l.type === 'jalur' || /jalur|as_tower|astower|row|koridor/i.test(l.name || '') || /jalur|as_tower|astower/i.test(l.id || '')
                ? 'jalur'
                : 'bidang';
            candidateGeoJSONs.push({
              id: l.id,
              name: l.name,
              type: inferredType,
              data: l.data,
              fieldMapping: l.fieldMapping
            });
          }
        });
      } catch (e) {}

      // 2. Also attempt to load any Firestore geojson_layers if available
      try {
        const snap = await getDocs(collection(db, 'geojson_layers'));
        const loadedDocs = await Promise.all(snap.docs.map(d => loadGeoJSONLayerDoc(d).catch(() => null)));
        loadedDocs.forEach(l => {
          if (l && l.data && Array.isArray(l.data.features) && l.data.features.length > 0) {
            const exists = candidateGeoJSONs.some(c => c.id && c.id === l.id && c.data?.features?.length >= l.data.features.length);
            if (!exists) {
              candidateGeoJSONs.push({
                id: l.id,
                name: l.name,
                type: l.type || 'bidang',
                data: l.data,
                fieldMapping: l.fieldMapping
              });
            }
          }
        });
      } catch (e) {}

      // 3. Static primary files for bidang, tower, and jalur
      const projName = projectName || '';
      const normalizedProj = projName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      const staticEntries: { path: string; type: 'bidang' | 'tower' | 'jalur' }[] = [
        { path: '/geojson/KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN_BIDANG_WARGA.geojson', type: 'bidang' },
        { path: '/geojson/KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN_TAPAK_TOWER.geojson', type: 'tower' },
        { path: '/geojson/KOMPENSASI ROW 150 kV JELOK - SANGGARAHAN_JALUR_UTUH.geojson', type: 'jalur' },
        { path: '/geojson/bidang_warga.geojson', type: 'bidang' },
        { path: '/geojson/bidang_tanah.geojson', type: 'bidang' },
        { path: '/geojson/bidang.geojson', type: 'bidang' },
        { path: '/geojson/tapak_tower.geojson', type: 'tower' },
        { path: '/geojson/tower.geojson', type: 'tower' },
        { path: '/geojson/jalur_utuh.geojson', type: 'jalur' },
        { path: '/geojson/jalur.geojson', type: 'jalur' }
      ];
      if (projName) {
        staticEntries.unshift(
          { path: `/geojson/${projName}_BIDANG_WARGA.geojson`, type: 'bidang' },
          { path: `/geojson/${normalizedProj}_bidang_warga.geojson`, type: 'bidang' },
          { path: `/geojson/${projName}_TAPAK_TOWER.geojson`, type: 'tower' },
          { path: `/geojson/${projName}_JALUR_UTUH.geojson`, type: 'jalur' }
        );
      }

      await Promise.allSettled(
        staticEntries.map(async (entry) => {
          try {
            const response = await fetch(encodeURI(entry.path));
            if (response.ok) {
              const contentType = response.headers.get('content-type') || '';
              if (contentType.includes('html')) return;
              const fetchedJson = await response.json();
              if (fetchedJson && Array.isArray(fetchedJson.features)) {
                candidateGeoJSONs.push({
                  name: entry.path,
                  type: entry.type,
                  data: fetchedJson,
                  fieldMapping: customMapping
                });
              }
            }
          } catch (err) {
            // ignore missing fallback
          }
        })
      );

      // Cache the result for subsequent instant PDF generation
      cachedCandidateGeoJSONs = candidateGeoJSONs;
    }

    // Search across all candidate 'bidang' GeoJSON datasets for matched parcel!
    for (const candidate of candidateGeoJSONs) {
      if (candidate.type !== 'bidang') continue;
      const gData = candidate.data;
      if (!gData || !Array.isArray(gData.features)) continue;
      const cMapping = candidate.fieldMapping || customMapping;

      const found = gData.features.find((f: any) => {
        const props = f.properties;
        if (!props) return false;

        // Direct exact match on CODE or DRIVEN property (e.g. BARAN_T.23-T.24_8 or KEBONDALEM_T.43-T.44_18)
        if (record.CODE) {
          const recCodeNorm = String(record.CODE).trim().toUpperCase();
          if (props.DRIVEN && String(props.DRIVEN).trim().toUpperCase() === recCodeNorm) return true;
          if (props.CODE && String(props.CODE).trim().toUpperCase() === recCodeNorm) return true;
          if (props.kode && String(props.kode).trim().toUpperCase() === recCodeNorm) return true;
          if (props.KODE_BIDANG && String(props.KODE_BIDANG).trim().toUpperCase() === recCodeNorm) return true;
        }

        let featDesa = '';
        let featSpan = '';
        let featNobid = '';

        if (cMapping) {
          if (cMapping.desa && props[cMapping.desa] !== undefined) featDesa = String(props[cMapping.desa] || '');
          if (cMapping.span && props[cMapping.span] !== undefined) featSpan = String(props[cMapping.span] || '');
          if (cMapping.nobid && props[cMapping.nobid] !== undefined) featNobid = String(props[cMapping.nobid] || '');
        }

        if (!featDesa) {
          featDesa = findPropInObj(props, ['desa', 'village', 'kelurahan', 'distrik', 'kecamatan', 'kabupaten']);
        }
        if (!featSpan) {
          featSpan = findPropInObj(props, ['span', 'section', 'jalur', 'row', 'koridor', 'corridor']);
        }
        if (!featNobid) {
          featNobid = findPropInObj(props, ['nobid', 'nobiddc', 'nobiddis', 'nobidis', 'no_bidang', 'no_bid', 'nomor', 'nomer', 'id', 'fid', 'objectid', 'nib']);
        }

        return isRecordMatched(
          String(featNobid), String(featDesa), String(featSpan),
          record.NOBID, record.DESA, record.SPAN
        );
      });

      if (found) {
        matchedFeat = found;
        geojsonData = gData;

        const geom = matchedFeat.geometry;
        if (geom) {
          if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
            polygonPoints = geom.coordinates[0];
          } else if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) {
            polygonPoints = geom.coordinates[0][0];
          }
        }

        const props = matchedFeat.properties || {};
        const userOffset = Number(props.userRotationOffset || props.rotasiOffset || cMapping?.rotasiOffset || 0);
        const projCorr = Number(props.projectionCorrection || cMapping?.projectionCorrection || 0);

        // =========================================================================
        // EXACT SAME HORIZONTAL SPAN SLOPE CALCULATION AS PETA BIDANG TANAH (1.3):
        // Tower Kecil on LEFT -> Tower Besar on RIGHT (0° Horizontal)
        // =========================================================================
        const activeSpanStr = record.SPAN || findPropInObj(props, ['span', 'section', 'jalur']) || '';
        const targetEndpoints = parseSpanEndpoints(activeSpanStr);
        const targetIds = new Set(targetEndpoints.map(e => e.canonicalId));

        let pdfTowerCalcRotation: number | null = null;
        const foundTowersMap = new Map<string, { name: string; canonicalId: string; sortNum: number; lng: number; lat: number }>();

        if (targetIds.size > 0) {
          for (const cand of candidateGeoJSONs) {
            const isTowerLayer = cand.type === 'tower' || /tower|tapak|tw/i.test(cand.name || '') || /tower|tapak|tw/i.test(cand.id || '');
            if (cand.type === 'bidang' && !isTowerLayer) continue;
            const cData = cand.data;
            if (!cData?.features) continue;

            for (const f of cData.features) {
              const fProps = f.properties || {};
              const fGeom = f.geometry;
              if (!fGeom?.coordinates) continue;

              let ptLng = NaN;
              let ptLat = NaN;
              if (fGeom.type === 'Point' && Array.isArray(fGeom.coordinates) && fGeom.coordinates.length >= 2) {
                ptLng = Number(fGeom.coordinates[0]);
                ptLat = Number(fGeom.coordinates[1]);
              } else if ((fGeom.type === 'Polygon' || fGeom.type === 'MultiPolygon') && Array.isArray(fGeom.coordinates)) {
                const pts = fGeom.type === 'Polygon' ? (fGeom.coordinates[0] || []) : (fGeom.coordinates[0]?.[0] || []);
                let sumLng = 0, sumLat = 0, cnt = 0;
                pts.forEach((p: any) => {
                  if (Array.isArray(p) && p.length >= 2) {
                    sumLng += Number(p[0]);
                    sumLat += Number(p[1]);
                    cnt++;
                  }
                });
                if (cnt > 0) {
                  ptLng = sumLng / cnt;
                  ptLat = sumLat / cnt;
                }
              }
              if (isNaN(ptLng) || isNaN(ptLat)) continue;

              const candidateRawValues: any[] = [];
              if (cand.fieldMapping?.tower && fProps[cand.fieldMapping.tower] !== undefined) {
                candidateRawValues.push(fProps[cand.fieldMapping.tower]);
              }
              const explicitTowerName = findPropInObj(fProps, [
                'towernumb', 'tower_numb', 'tower', 'no_tower', 'id_tower', 'nomor_tower', 'tower_no', 'nama', 'namobj', 'name', 'label'
              ]);
              if (explicitTowerName) candidateRawValues.push(explicitTowerName);

              if (candidateRawValues.length === 0 && isTowerLayer) {
                const nomerProp = findPropInObj(fProps, ['nomer', 'nomor']);
                if (nomerProp) candidateRawValues.push(nomerProp);
              }

              for (const rawVal of candidateRawValues) {
                const tok = normalizeTowerToken(rawVal);
                if (!tok) continue;
                if (targetIds.has(tok.canonicalId) && !foundTowersMap.has(tok.canonicalId)) {
                  foundTowersMap.set(tok.canonicalId, {
                    name: tok.displayName,
                    canonicalId: tok.canonicalId,
                    sortNum: tok.sortNum,
                    lng: ptLng,
                    lat: ptLat
                  });
                  break;
                }
              }
            }
          }

          // Fallback to As Tower (jalur) WGS84 LineString segment if separate tower layer doesn't have both endpoints
          if (foundTowersMap.size < 2 && targetEndpoints.length === 2 && polygonPoints.length > 0) {
            const [epSmall, epLarge] = targetEndpoints;
            const centroidLng = polygonPoints.reduce((acc, p) => acc + p[0], 0) / polygonPoints.length;
            const centroidLat = polygonPoints.reduce((acc, p) => acc + p[1], 0) / polygonPoints.length;

            let bestSeg: { p1: { lng: number; lat: number }; p2: { lng: number; lat: number }; distSq: number } | null = null;
            for (const cand of candidateGeoJSONs) {
              const isJalur = cand.type === 'jalur' || /jalur|as_tower|astower|row|koridor|line/i.test(cand.name || '');
              if (!isJalur || !cand.data?.features) continue;

              for (const f of cand.data.features) {
                const fGeom = f.geometry;
                if (!fGeom?.coordinates) continue;
                const lines: number[][][] =
                  fGeom.type === 'LineString'
                    ? [fGeom.coordinates]
                    : fGeom.type === 'MultiLineString'
                    ? fGeom.coordinates
                    : [];

                lines.forEach(lineCoords => {
                  for (let i = 0; i < lineCoords.length - 1; i++) {
                    const a = lineCoords[i];
                    const b = lineCoords[i + 1];
                    if (!a || !b || a.length < 2 || b.length < 2) continue;
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
              }
            }

            if (bestSeg) {
              const seg = bestSeg as { p1: { lng: number; lat: number }; p2: { lng: number; lat: number }; distSq: number };
              if (!foundTowersMap.has(epSmall.canonicalId)) {
                foundTowersMap.set(epSmall.canonicalId, {
                  name: epSmall.displayName,
                  canonicalId: epSmall.canonicalId,
                  sortNum: epSmall.sortNum,
                  lng: seg.p1.lng,
                  lat: seg.p1.lat
                });
              }
              if (!foundTowersMap.has(epLarge.canonicalId)) {
                foundTowersMap.set(epLarge.canonicalId, {
                  name: epLarge.displayName,
                  canonicalId: epLarge.canonicalId,
                  sortNum: epLarge.sortNum,
                  lng: seg.p2.lng,
                  lat: seg.p2.lat
                });
              }
            }
          }
        }

        const towersList = Array.from(foundTowersMap.values()).sort((a, b) => {
          if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        if (towersList.length >= 2) {
          const t1 = towersList[0]; // Tower Kecil (Left)
          const t2 = towersList[towersList.length - 1]; // Tower Besar (Right)
          const merc1 = wgs84ToWebMercator(t1.lat, t1.lng);
          const merc2 = wgs84ToWebMercator(t2.lat, t2.lng);
          const dMercX = merc2.x - merc1.x;
          const dMercY = merc2.y - merc1.y;
          if (Math.abs(dMercX) > 1e-6 || Math.abs(dMercY) > 1e-6) {
            pdfTowerCalcRotation = ((Math.atan2(dMercY, dMercX) * 180) / Math.PI + 360) % 360;
          }
        }

        // Convert ArcGIS ROTATE (CCW) to Clockwise screen rotation if present
        let geojsonBaseRotasi = 0;
        const rotRaw =
          cMapping?.rotasi && props[cMapping.rotasi] !== undefined
            ? props[cMapping.rotasi]
            : findPropInObj(props, ['rotate', 'rotasi', 'rotation', 'rotdetec', 'sudut', 'angle']);
        const rotNum = parseFloat(String(rotRaw || '0'));
        if (!isNaN(rotNum) && rotNum !== 0) {
          geojsonBaseRotasi = ((360 - rotNum) % 360 + 360) % 360;
        }

        // Fallback if towers not found: principal axis across ALL parcels in the active span
        if (pdfTowerCalcRotation === null) {
          const normSelSpan = normalizeSpan(activeSpanStr);
          const spanPts: { mercX: number; mercY: number }[] = [];
          if (normSelSpan && geojsonData?.features) {
            geojsonData.features.forEach((f: any) => {
              const fProps = f.properties || {};
              const s = cMapping?.span ? fProps[cMapping.span] : findPropInObj(fProps, ['span', 'section', 'jalur']);
              if (normalizeSpan(s) === normSelSpan) {
                const collect = (c: any) => {
                  if (typeof c?.[0] === 'number' && typeof c?.[1] === 'number') {
                    const m = wgs84ToWebMercator(Number(c[1]), Number(c[0]));
                    spanPts.push({ mercX: m.x, mercY: m.y });
                  } else if (Array.isArray(c)) {
                    c.forEach(collect);
                  }
                };
                collect(f.geometry?.coordinates);
              }
            });
          }

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
            let webCw = ((Math.atan2(p2.mercY - p1.mercY, p2.mercX - p1.mercX) * 180) / Math.PI + 360) % 360;
            if (geojsonBaseRotasi !== 0) {
              const diff = Math.abs((((webCw - geojsonBaseRotasi) % 360) + 540) % 360 - 180);
              if (diff > 90) webCw = (webCw + 180) % 360;
            }
            pdfTowerCalcRotation = webCw;
          }
        }

        if (pdfTowerCalcRotation !== null) {
          rotationDeg = pdfTowerCalcRotation;
        } else {
          rotationDeg = geojsonBaseRotasi;
        }

        if (isNaN(rotationDeg)) rotationDeg = 0;

        // Final Rotation = Base (WGS84 As Tower Bearing / GeoJSON) + UserRotationOffset + ProjectionCorrection
        rotationDeg = ((rotationDeg + userOffset + projCorr) % 360 + 360) % 360;
        break;
      }
    }
  } catch (e) {
    console.warn('Gagal memuat GeoJSON untuk sketsa:', e);
  }

  // Draw clean container border for the map/sketch
  const boxW = 140; // width of drawing box in mm
  const boxH = 60;  // height of drawing box in mm
  const boxX = 35;  // start X
  const boxY = 40;  // start Y

  // Start by clearing background with white
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxW, boxH, 'F');

  if (polygonPoints && polygonPoints.length > 0) {
    // 1. Find the center of the matched polygon to rotate all parcels around it
    let centerLng = 0;
    let centerLat = 0;
    const count = polygonPoints.length > 1 ? polygonPoints.length - 1 : polygonPoints.length;
    for (let i = 0; i < count; i++) {
      centerLng += polygonPoints[i][0];
      centerLat += polygonPoints[i][1];
    }
    centerLng /= count;
    centerLat /= count;

    const latScaleFactor = Math.cos(centerLat * Math.PI / 180);

    // 2. Viewport Rotation synchronized with Peta Bidang Tanah (Tower Kecil Left -> Tower Besar Right)
    const effectiveRotDeg = rotationDeg;
    const rad = (effectiveRotDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    // Calculate actual rotated bounding box of the target polygon so it fits snugly
    let minRotX = Infinity, maxRotX = -Infinity;
    let minRotY = Infinity, maxRotY = -Infinity;

    polygonPoints.forEach(([lng, lat]) => {
      const uX = (lng - centerLng) * latScaleFactor;
      const uY = -(lat - centerLat);
      const rX = uX * cosR - uY * sinR;
      const rY = uX * sinR + uY * cosR;
      if (rX < minRotX) minRotX = rX;
      if (rX > maxRotX) maxRotX = rX;
      if (rY < minRotY) minRotY = rY;
      if (rY > maxRotY) maxRotY = rY;
    });

    const boundW = maxRotX - minRotX;
    const boundH = maxRotY - minRotY;

    const targetW = Math.max(boundW * 1.45, 0.00008);
    const targetH = Math.max(boundH * 1.45, 0.00005);

    const containerAspect = boxW / boxH;
    let viewW = targetW;
    let viewH = targetH;

    if (viewW / viewH < containerAspect) {
      viewW = viewH * containerAspect;
    } else {
      viewH = viewW / containerAspect;
    }

    const wRot = viewW;
    const hRot = viewH;

    if (wRot > 0 && hRot > 0) {
      const scale = Math.min((boxW - 10) / wRot, (boxH - 6) / hRot);

      const screenCenterX = boxX + boxW / 2;
      const screenCenterY = boxY + boxH / 2;

      // Projection helper:
      // Unrotated projection relative to geometry center (centerLng, centerLat),
      // followed by 2D Viewport Rotation around Viewport Center (screenCenterX, screenCenterY)
      const getRotatedCoords = (lng: number, lat: number) => {
        const uX = (lng - centerLng) * latScaleFactor * scale;
        const uY = -(lat - centerLat) * scale;

        const rotX = uX * cosR - uY * sinR;
        const rotY = uX * sinR + uY * cosR;

        return { rotX, rotY };
      };

      // Helper to compute centroid of polygon
      const getCentroid = (pts: { x: number; y: number }[]) => {
        const n = pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y
          ? pts.length - 1
          : pts.length;
        if (n <= 0) return { x: 0, y: 0 };
        let sumX = 0, sumY = 0;
        for (let i = 0; i < n; i++) {
          sumX += pts[i].x;
          sumY += pts[i].y;
        }
        return { x: sumX / n, y: sumY / n };
      };

      // 4. Draw all unhighlighted background parcels & features first
      if (geojsonData && Array.isArray(geojsonData.features)) {
        geojsonData.features.forEach((feature: any) => {
          if (feature === matchedFeat) return;

          const geom = feature.geometry;
          if (!geom) return;

          const props = feature.properties || {};

          // Tower point or Tower polygon handling
          const towerVal = findPropInObj(props, ['tower', 'tapaktower', 'no_tower', 'tapak']);
          if (geom.type === 'Point') {
            const [pLng, pLat] = geom.coordinates || [0, 0];
            const { rotX, rotY } = getRotatedCoords(pLng, pLat);
            const px = screenCenterX + rotX;
            const py = screenCenterY + rotY;

            if (px >= boxX && px <= boxX + boxW && py >= boxY && py <= boxY + boxH) {
              doc.setDrawColor(185, 28, 28);
              doc.setFillColor(255, 255, 255);
              doc.setLineWidth(0.3);
              doc.rect(px - 2.5, py - 2.5, 5, 5, 'FD');
              doc.line(px - 2.5, py - 2.5, px + 2.5, py + 2.5);
              doc.line(px - 2.5, py + 2.5, px + 2.5, py - 2.5);

              const twName = towerVal ? `T.${towerVal}` : 'Tower';
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6);
              doc.setTextColor(185, 28, 28);
              doc.text(twName, px, py - 3, { align: 'center' });
            }
            return;
          }

          let featPoints: [number, number][] = [];
          if (geom.type === 'Polygon') {
            featPoints = geom.coordinates[0];
          } else if (geom.type === 'MultiPolygon') {
            featPoints = geom.coordinates[0][0];
          }

          if (featPoints && featPoints.length > 0) {
            const paperPts = featPoints.map(([lng, lat]) => {
              const { rotX, rotY } = getRotatedCoords(lng, lat);
              const px = screenCenterX + rotX;
              const py = screenCenterY + rotY;
              return { x: px, y: py };
            });

            // Fill unhighlighted background parcel with clean white/light slate and dark outline
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(51, 65, 85);
            doc.setLineWidth(0.2);

            if (typeof (doc as any).polygon === 'function') {
              (doc as any).polygon(paperPts, 'FD');
            } else {
              for (let i = 0; i < paperPts.length - 1; i++) {
                doc.line(paperPts[i].x, paperPts[i].y, paperPts[i + 1].x, paperPts[i + 1].y);
              }
            }

            // Extract NOBID label for unhighlighted polygon
            let fNobid = '';
            if (customMapping && customMapping.nobid && props[customMapping.nobid] !== undefined) {
              fNobid = String(props[customMapping.nobid] || '');
            }
            if (!fNobid) {
              fNobid = findPropInObj(props, ['nobid', 'nobiddc', 'nobiddis', 'nobidis', 'no_bidang', 'no_bid', 'nomor', 'nomer', 'id', 'fid', 'objectid', 'nib']);
            }
            if (!fNobid && towerVal) {
              fNobid = `T.${towerVal}`;
            }

            if (fNobid) {
              const { x: cx, y: cy } = getCentroid(paperPts);
              if (cx >= boxX + 2 && cx <= boxX + boxW - 2 && cy >= boxY + 2 && cy <= boxY + boxH - 2) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                doc.setTextColor(15, 23, 42);
                doc.text(String(fNobid), cx, cy + 0.8, { align: 'center' });
              }
            }
          }
        });
      }

      // 4b. Also draw As Tower (jalur) lines and Tapak Tower (tower) features from separate GeoJSON layers
      if (cachedCandidateGeoJSONs && cachedCandidateGeoJSONs.length > 0) {
        cachedCandidateGeoJSONs.forEach(cand => {
          if (cand.type === 'jalur' && cand.data?.features) {
            cand.data.features.forEach((f: any) => {
              const geom = f.geometry;
              if (!geom?.coordinates) return;
              const lines: number[][][] =
                geom.type === 'LineString'
                  ? [geom.coordinates]
                  : geom.type === 'MultiLineString'
                  ? geom.coordinates
                  : [];
              doc.setDrawColor(234, 88, 12); // Orange ROW / As Tower line
              doc.setLineWidth(0.25);
              lines.forEach(lineCoords => {
                for (let i = 0; i < lineCoords.length - 1; i++) {
                  const a = lineCoords[i];
                  const b = lineCoords[i + 1];
                  if (!a || !b || a.length < 2 || b.length < 2) continue;
                  const rA = getRotatedCoords(Number(a[0]), Number(a[1]));
                  const rB = getRotatedCoords(Number(b[0]), Number(b[1]));
                  const x1 = screenCenterX + rA.rotX;
                  const y1 = screenCenterY + rA.rotY;
                  const x2 = screenCenterX + rB.rotX;
                  const y2 = screenCenterY + rB.rotY;
                  // Draw if at least near the viewport
                  if (
                    (x1 >= boxX - 40 && x1 <= boxX + boxW + 40 && y1 >= boxY - 40 && y1 <= boxY + boxH + 40) ||
                    (x2 >= boxX - 40 && x2 <= boxX + boxW + 40 && y2 >= boxY - 40 && y2 <= boxY + boxH + 40)
                  ) {
                    doc.line(x1, y1, x2, y2);
                  }
                }
              });
            });
          } else if (cand.type === 'tower' && cand.data?.features) {
            cand.data.features.forEach((f: any) => {
              const geom = f.geometry;
              if (!geom?.coordinates) return;
              const props = f.properties || {};
              let pLng = NaN, pLat = NaN;
              if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
                pLng = Number(geom.coordinates[0]);
                pLat = Number(geom.coordinates[1]);
              } else if ((geom.type === 'Polygon' || geom.type === 'MultiPolygon') && Array.isArray(geom.coordinates)) {
                const pts = geom.type === 'Polygon' ? (geom.coordinates[0] || []) : (geom.coordinates[0]?.[0] || []);
                if (pts.length > 0) {
                  let sLng = 0, sLat = 0, cnt = 0;
                  pts.forEach((p: any) => {
                    if (Array.isArray(p) && p.length >= 2) {
                      sLng += Number(p[0]);
                      sLat += Number(p[1]);
                      cnt++;
                    }
                  });
                  if (cnt > 0) {
                    pLng = sLng / cnt;
                    pLat = sLat / cnt;
                  }
                }
              }
              if (isNaN(pLng) || isNaN(pLat)) return;
              const { rotX, rotY } = getRotatedCoords(pLng, pLat);
              const px = screenCenterX + rotX;
              const py = screenCenterY + rotY;
              if (px >= boxX + 2 && px <= boxX + boxW - 2 && py >= boxY + 2 && py <= boxY + boxH - 2) {
                doc.setDrawColor(185, 28, 28);
                doc.setFillColor(254, 226, 226);
                doc.setLineWidth(0.35);
                doc.rect(px - 2.2, py - 2.2, 4.4, 4.4, 'FD');
                doc.line(px - 2.2, py - 2.2, px + 2.2, py + 2.2);
                doc.line(px - 2.2, py + 2.2, px + 2.2, py - 2.2);

                const rawTw = findPropInObj(props, ['towernumb', 'tower_numb', 'tower', 'no_tower', 'nama', 'name', 'nomer']);
                const tok = normalizeTowerToken(rawTw);
                const twName = tok ? tok.displayName : (rawTw || 'Tower');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(5.8);
                doc.setTextColor(185, 28, 28);
                doc.text(String(twName), px, py - 2.8, { align: 'center' });
              }
            });
          }
        });
      }

      // 5. Draw the highlighted selected matched parcel
      const paperPoints = polygonPoints.map(([lng, lat]) => {
        const { rotX, rotY } = getRotatedCoords(lng, lat);
        const px = screenCenterX + rotX;
        const py = screenCenterY + rotY;
        return { x: px, y: py };
      });

      // Fill with sky-blue / cyan and royal blue border (matching Image 2)
      doc.setFillColor(125, 211, 252);
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.4);

      if (typeof (doc as any).polygon === 'function') {
        (doc as any).polygon(paperPoints, 'FD');
      } else {
        for (let i = 0; i < paperPoints.length - 1; i++) {
          doc.line(paperPoints[i].x, paperPoints[i].y, paperPoints[i + 1].x, paperPoints[i + 1].y);
        }
      }

      // NOBID label inside highlighted polygon
      const { x: mcx, y: mcy } = getCentroid(paperPoints);
      if (mcx >= boxX && mcx <= boxX + boxW && mcy >= boxY && mcy <= boxY + boxH) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(String(record.NOBID || '15'), mcx, mcy + 0.8, { align: 'center' });
      }

      // 6. Draw 4 white masking rectangles outside the box container to clean any bleed
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 210, boxY, 'F');
      doc.rect(0, boxY + boxH, 210, 297 - (boxY + boxH), 'F');
      doc.rect(0, boxY, boxX, boxH, 'F');
      doc.rect(boxX + boxW, boxY, 210 - (boxX + boxW), boxH, 'F');

      // Redraw Header & Title over the top mask
      drawPageHeader(currentPNum);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text('SITUASI DAN DENAH BIDANG TANAH UNTUK KOMPENSASI', 105, 30, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`NOMER BIDANG : ${record.NOBID || '-'}`, 105, 34, { align: 'center' });

      // 7. Redraw the container border
      doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.setLineWidth(0.35);
      doc.rect(boxX, boxY, boxW, boxH, 'D');

      // 8. Draw Compass rose rotated with effective map rotation (matching Peta Bidang Tanah)!
      const compX = boxX + boxW - 12;
      const compY = boxY + 12;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.15);
      doc.circle(compX, compY, 3.5, 'S');

      // Rotation needles: North (uX=0, uY=-1) rotated clockwise by effectiveRotDeg -> (+sin(theta), -cos(theta))
      const theta = (effectiveRotDeg * Math.PI) / 180;
      const uX = compX + Math.sin(theta) * 3.5;
      const uY = compY - Math.cos(theta) * 3.5;
      const sX = compX - Math.sin(theta) * 3.5;
      const sY = compY + Math.cos(theta) * 3.5;

      const perpAngle = theta + Math.PI / 2;
      const w1X = compX + Math.sin(perpAngle) * 0.9;
      const w1Y = compY - Math.cos(perpAngle) * 0.9;
      const w2X = compX - Math.sin(perpAngle) * 0.9;
      const w2Y = compY + Math.cos(perpAngle) * 0.9;

      // Crimson triangle for North
      doc.setFillColor(185, 28, 28);
      doc.triangle(w1X, w1Y, w2X, w2Y, uX, uY, 'F');

      // Slate triangle for South
      doc.setFillColor(100, 116, 139);
      doc.triangle(w1X, w1Y, w2X, w2Y, sX, sY, 'F');

      // Labels (U, S, T, B) placed neatly on rotated axes
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(15, 23, 42);

      const labelDist = 5.2;
      doc.text('U', compX + Math.sin(theta) * labelDist, compY - Math.cos(theta) * labelDist + 0.8, { align: 'center' });
      doc.text('S', compX - Math.sin(theta) * labelDist, compY + Math.cos(theta) * labelDist + 0.8, { align: 'center' });
      doc.text('T', compX + Math.sin(perpAngle) * labelDist, compY - Math.cos(perpAngle) * labelDist + 0.8, { align: 'center' });
      doc.text('B', compX - Math.sin(perpAngle) * labelDist, compY + Math.cos(perpAngle) * labelDist + 0.8, { align: 'center' });

      // 9. Label vertex points on the matched polygon
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);

      const uniquePts = paperPoints.slice(0, paperPoints.length - 1);
      uniquePts.forEach((pt, i) => {
        if (pt.x >= boxX - 1 && pt.x <= boxX + boxW + 1 && pt.y >= boxY - 1 && pt.y <= boxY + boxH + 1) {
          doc.setFillColor(2, 132, 199);
          doc.circle(pt.x, pt.y, 0.8, 'F');
          doc.text(`P${i + 1}`, pt.x + 1.2, pt.y - 0.8);
        }
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Sketsa bidang tanah tidak tersedia', 105, boxY + boxH / 2, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Sketsa bidang tanah tidak tersedia (GeoJSON belum dimuat)', 105, boxY + boxH / 2, { align: 'center' });
  }

  // Add caption
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('SITUASI MENGGAMBARKAN KONDISI SEMPADAN DAN BIDANG TANAH', 105, boxY + boxH + 4, { align: 'center' });

  // COORDINATES TABLE / GRID (uses the configured per-jalur projection)
  const coordSectionSuffix = (pdfCfg.coordinateLabelOverride || '').trim() || projectionOption.shortName;
  drawFittedSingleLine(`I. KOORDINAT BIDANG TANAH (${coordSectionSuffix})`, leftMargin, 115, contentWidth, {
    fontSize: 8.5, minFontSize: 6.5, fontStyle: 'bold', align: 'left', color: darkSlate
  });

  const coordSlate = [51, 65, 85];
  let coordY = 120;
  let lastCoordY = coordY;

  if (polygonPoints && polygonPoints.length > 0) {
    const uniquePoints = polygonPoints.slice(0, polygonPoints.length - 1);
    const totalPts = uniquePoints.length; // Show all points while keeping Section II safely above footer (y=282)
    const numCols = totalPts > 72 ? 4 : totalPts > 20 ? 3 : 2;
    const numRows = Math.ceil(totalPts / numCols);
    // Keep lastCoordY <= 241 so II. BATAS-BATAS TANAH (height ~28.5mm) always fits cleanly above y=282
    const maxCoordBlockH = 117;
    const rawRowH = numRows > 1 ? Math.min(5.0, maxCoordBlockH / numRows) : 5.0;
    const rowHeight = Math.max(3.0, Math.floor(rawRowH * 10) / 10);
    const colGap = 2;
    const usableColW = (contentWidth - (numCols - 1) * colGap) / numCols;
    const baseCoordFont = numCols === 2 ? 7.5 : numCols === 3 ? 6.8 : 6.0;
    const labelW = numCols === 2 ? 20.5 : numCols === 3 ? 14.5 : 10.0;
    const valOffset = labelW + 1.0;
    const valMaxW = Math.max(18, usableColW - valOffset - 0.5);

    uniquePoints.forEach((pt, i) => {
      const formatted = formatProjectedCoordinate(pt[0], pt[1], projectionId, numCols >= 3);
      const colIdx = Math.floor(i / numRows);
      const rowIdx = i % numRows;
      const px = leftMargin + colIdx * (usableColW + colGap);
      const py = coordY + rowIdx * rowHeight;

      const labelText = numCols === 2 ? `Koordinat P${i + 1}` : numCols === 3 ? `Koord. P${i + 1}` : `P${i + 1}`;
      drawFittedSingleLine(labelText, px, py, labelW, {
        fontSize: baseCoordFont, minFontSize: 5.0, fontStyle: 'bold', align: 'left', color: coordSlate
      });
      drawFittedSingleLine(formatted.primaryText, px + valOffset, py, valMaxW, {
        fontSize: baseCoordFont, minFontSize: 4.8, fontStyle: 'normal', align: 'left', color: coordSlate
      });
    });

    lastCoordY = coordY + ((numRows - 1) * rowHeight) + 4;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(coordSlate[0], coordSlate[1], coordSlate[2]);
    doc.text('Data koordinat bidang tanah tidak tersedia.', leftMargin + 6, coordY);
    lastCoordY = coordY + 6;
  }

  // BOUNDARIES TABLE - Dynamically placed below Section I, strictly clamped above footer (y=282)
  const batasYStart = Math.min(248, Math.max(162, lastCoordY + 6));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('II. BATAS-BATAS TANAH', leftMargin, batasYStart);

  const dataBatas = [
    { no: '1.', arah: 'Utara berbatasan dengan', value: record.BATAS_UTARA || 'Sri Suyani' },
    { no: '2.', arah: 'Selatan berbatasan dengan', value: record.BATAS_SELATAN || 'Sri Suyani' },
    { no: '3.', arah: 'Timur berbatasan dengan', value: record.BATAS_TIMUR || 'Sri Suyani' },
    { no: '4.', arah: 'Barat berbatasan dengan', value: record.BATAS_BARAT || 'Tumirah' }
  ];

  let currBatasY = batasYStart + 3.5;
  const rowHeightB = 6.2;

  // Table outer border
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, currBatasY, contentWidth, 4 * rowHeightB);

  dataBatas.forEach((b, idx) => {
    // Zebra striping
    if (idx % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(leftMargin + 0.15, currBatasY + 0.15, contentWidth - 0.3, rowHeightB - 0.3, 'F');
    }

    // Dividers
    if (idx > 0) {
      doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, currBatasY, rightMargin, currBatasY);
    }

    // Vertical splits
    doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.setLineWidth(0.2);
    doc.line(leftMargin + 12, currBatasY, leftMargin + 12, currBatasY + rowHeightB);
    doc.line(leftMargin + 65, currBatasY, leftMargin + 65, currBatasY + rowHeightB);

    // Text (auto-fitted so long neighbor names / ministries never overflow right border)
    drawFittedCellText(b.no, leftMargin + 6, currBatasY, rowHeightB, 10, {
      fontSize: 8, minFontSize: 6.5, fontStyle: 'normal', align: 'center', color: textGray
    });
    drawFittedCellText(b.arah, leftMargin + 15, currBatasY, rowHeightB, 48, {
      fontSize: 8, minFontSize: 6.0, fontStyle: 'normal', align: 'left', color: textGray
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text(':', leftMargin + 67, currBatasY + 4.1);

    drawFittedCellText(b.value || '-', leftMargin + 70, currBatasY, rowHeightB, rightMargin - (leftMargin + 70) - 2.5, {
      fontSize: 8, minFontSize: 5.2, fontStyle: 'bold', align: 'left', color: darkSlate, allowTwoLines: true
    });

    currBatasY += rowHeightB;
  });


  // Preload photo images asynchronously
  const photoUrls = [
    record.LINK_DOKUMENTASI_BIDANG || '',
    record.LINK_DOKUMENTASI_BIDANG_2 || '',
    record.LINK_DOKUMENTASI_BIDANG_3 || record.LINK_WAJAH_PEMILIK || ''
  ];

  const photoBase64s = await Promise.all(
    photoUrls.map(url => url ? loadImageAsBase64(url, 700, false) : Promise.resolve(''))
  );

  // ==========================================
  // PAGE 4: Dokumentasi Situasi Bidang Tanah
  // ==========================================
  doc.addPage();
  currentPNum++;
  drawPageHeader(currentPNum);

  drawFittedSingleLine('DOKUMENTASI SITUASI BIDANG TANAH', 105, 30, contentWidth, {
    fontSize: 10, minFontSize: 8, fontStyle: 'bold', align: 'center', color: darkSlate
  });
  drawFittedSingleLine(`KODE LAHAN : ${record.CODE || '-'}`, 105, 34, contentWidth, {
    fontSize: 8, minFontSize: 6.0, fontStyle: 'normal', align: 'center', color: darkSlate
  });

  // Large elegant container box for documentation photos (matching screenshot)
  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(15, 45, 180, 110, 'FD');

  // Let's draw 3 beautiful landscape photo placeholder slots (matching the screenshot exactly)
  const picW = 51;
  const picH = 34;
  const picY = 83; // vertically centered in the 110mm height box
  const picGap = 8;
  const picStartX = 15 + 10; // offset of 10mm inside the 180mm container

  const photoLabels = [
    'Foto Kondisi Bidang Lahan 1',
    'Foto Kondisi Bidang Lahan 2',
    'Foto Kondisi Bidang Lahan 3'
  ];

  for (let i = 0; i < 3; i++) {
    const px = picStartX + i * (picW + picGap);
    const photoData = photoBase64s[i];
    
    // Draw photo outer border
    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setLineWidth(0.2);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(px, picY, picW, picH, 'FD');

    if (photoData && photoData.startsWith('data:image/')) {
      try {
        // Embed the actual uploaded image inside the box!
        doc.addImage(photoData, 'JPEG', px + 0.8, picY + 0.8, picW - 1.6, picH - 1.6, undefined, 'FAST');
      } catch (err) {
        console.warn(`Failed to add image ${i+1} to PDF:`, err);
        // Fallback placeholder
        doc.setFillColor(241, 245, 249);
        doc.rect(px + 2, picY + 2, picW - 4, picH - 4, 'F');

        const cx = px + picW / 2;
        const cy = picY + picH / 2;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.4);
        doc.circle(cx, cy, 3.5, 'S');
        doc.rect(cx - 5.5, cy - 3, 11, 6, 'S');
        doc.rect(cx - 2, cy - 4.5, 4, 1.5, 'S');
      }
    } else {
      // Inner photo area placeholder
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(px + 2, picY + 2, picW - 4, picH - 4, 'F');

      // camera icon in center
      const cx = px + picW / 2;
      const cy = picY + picH / 2;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.circle(cx, cy, 3.5, 'S');
      doc.rect(cx - 5.5, cy - 3, 11, 6, 'S');
      doc.rect(cx - 2, cy - 4.5, 4, 1.5, 'S');
    }

    // label
    const cx = px + picW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(photoLabels[i], cx, picY + picH + 5, { align: 'center' });
  }

  // Draw some helpful descriptions
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DOKUMENTASI INVENTARISASI LAPANGAN OLEH TIM BERSAMA', 105, 165, { align: 'center' });


  // --- DYNAMIC PAGE NUMBERS LOOP ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageFooter(i, totalPages);
  }

  return doc;
}
