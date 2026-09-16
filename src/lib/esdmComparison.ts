import { LandRecord, PlantData, BuildingData } from '../types';
import { EsdmBidangData, EsdmPlantData, normalizePlantName } from './esdmPdfParser';

export type EsdmComparisonStatus = 'MATCH' | 'DISCREPANCY' | 'ESDM_ONLY' | 'APP_ONLY';

export interface PlantDiffItem {
  jenis: string;
  appBm: number;
  appSm: number;
  appK: number;
  appS: number;
  appB: number;
  appTotal: number;

  esdmBm: number;
  esdmSm: number;
  esdmK: number;
  esdmS: number;
  esdmB: number;
  esdmTotal: number;

  diffTotal: number; // appTotal - esdmTotal
  status: 'MATCH' | 'MISMATCH' | 'APP_ONLY' | 'ESDM_ONLY';
  discrepancyNotes: string[];
}

export interface EsdmComparisonItem {
  id: string; // key e.g. "T45T46_1"
  span: string;
  nobid: string;
  desa: string;
  status: EsdmComparisonStatus;
  discrepancyReasons: string[];

  // App side
  appRecord: LandRecord | null;
  appNama: string;
  appNik: string;
  appLuas: number;
  appJenisHak: string;
  appNomerHak: string;
  appPenutup: string;
  appStatusTanah: string;
  appTotalTanaman: number;

  // ESDM side
  esdmBidang: EsdmBidangData | null;
  esdmNama: string;
  esdmNik: string;
  esdmLuas: number;
  esdmJenisHak: string;
  esdmNomerHak: string;
  esdmPenutup: string;
  esdmStatusTanah: string;
  esdmTotalTanaman: number;

  // Diff metrics
  diffLuas: number; // appLuas - esdmLuas
  diffTanaman: number; // appTotalTanaman - esdmTotalTanaman
  isLuasMatch: boolean;
  isNamaMatch: boolean;
  isNikMatch: boolean;
  isTanamanMatch: boolean;
  isAlasHakMatch: boolean;
  isNomerHakMatch: boolean;
  isHakOverallMatch: boolean;

  // Detailed plant breakdown
  plantDiffs: PlantDiffItem[];
}

export interface EsdmComparisonSummary {
  desa: string;
  totalEsdmBidang: number;
  totalAppBidang: number;
  matchCount: number;
  discrepancyCount: number;
  esdmOnlyCount: number;
  appOnlyCount: number;

  totalLuasEsdm: number;
  totalLuasApp: number;
  diffTotalLuas: number;

  totalTanamanEsdm: number;
  totalTanamanApp: number;
  diffTotalTanaman: number;
}

export interface EsdmComparisonResult {
  summary: EsdmComparisonSummary;
  items: EsdmComparisonItem[];
}

/**
 * Normalize Span text e.g. "T.45 - T.46" -> "T45T46", "T.05-T.06" -> "T5T6", "T.5 - T.6" -> "T5T6"
 * Ensures leading zeroes in tower numbers do not break equality matching between datasets.
 */
export function normalizeSpanKey(span: string): string {
  if (!span) return '';
  let s = String(span).toUpperCase().trim();
  s = s.replace(/^SPAN\s*/i, '');

  // Extract two tower patterns e.g. "T.05 - T.06", "T.5 - 6", "T5-T6", "T.05A - T.06"
  const m = s.match(/(?:T(?:OWER|WR)?\.?\s*)?(\d+)([A-Z]?)\s*(?:[-–—/]|S\/D|SAMPAI|TO)\s*(?:T(?:OWER|WR)?\.?\s*)?(\d+)([A-Z]?)/i);
  if (m) {
    const t1Num = m[1].replace(/^0+/, '') || '0';
    const t1Suffix = m[2] || '';
    let t2Num = m[3].replace(/^0+/, '') || '0';
    const t2Suffix = m[4] || '';

    // Handle shortened second tower e.g. T.45 - 46 or T.105 - 6
    if (t2Num.length < t1Num.length && /^\d+$/.test(t1Num) && /^\d+$/.test(t2Num)) {
      t2Num = t1Num.substring(0, t1Num.length - t2Num.length) + t2Num;
    }

    return `T${t1Num}${t1Suffix}T${t2Num}${t2Suffix}`;
  }

  // Fallback: strip leading zeroes in number sequences and remove special characters
  return s.replace(/\b0+(\d+)/g, '$1').replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalize No. Bidang e.g. "01" -> "1", "014" -> "14", "14A" -> "14A"
 */
export function normalizeNobidKey(nobid: string | number): string {
  if (nobid === undefined || nobid === null) return '';
  const str = String(nobid).trim().toUpperCase();
  const clean = str.replace(/^0+([1-9A-Z])/i, '$1').replace(/^0+$/, '0') || '0';
  return clean;
}

/**
 * Compare two strings ignoring case and extra spacing
 */
function isStringSimilar(a: string, b: string): boolean {
  const cleanA = (a || '')
    .toUpperCase()
    .replace(/^(?:PEMILIK(?:\s+(?:TIDAK\s+)?DIKETAHUI(?:\s+KEBERADAANNYA)?)?|PENGGARAP|PEMERINTAH(?:\s+DESA|\s+KABUPATEN)?)\s*/i, '');
  const cleanB = (b || '')
    .toUpperCase()
    .replace(/^(?:PEMILIK(?:\s+(?:TIDAK\s+)?DIKETAHUI(?:\s+KEBERADAANNYA)?)?|PENGGARAP|PEMERINTAH(?:\s+DESA|\s+KABUPATEN)?)\s*/i, '');
  const normA = cleanA.replace(/[^A-Z0-9]/g, '');
  const normB = cleanB.replace(/[^A-Z0-9]/g, '');
  if (!normA && !normB) return true;
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

/**
 * Canonical mapping for Indonesian land certificate / alas hak types
 */
export function normalizeAlasHakType(jenis: string): string {
  if (!jenis) return '';
  const s = jenis.toUpperCase().trim();

  // Sporadik / Non-sertifikat / Girik / Surat Penguasaan Fisik / Lainnya
  if (/SPORADIK|SEPORADIK|NON\s*SERTIPI?KAT|PENGUASAAN\s*FISIK|SKT|SURAT\s*KETERANGAN|LAINNYA/i.test(s)) {
    return 'SPORADIK';
  }

  // Hak Milik / SHM
  if (/HAK\s*MILIK|SHM|MILIK\s*ADAT|SERTIPI?KAT(?:\s*\/)?\s*HAK\s*MILIK/i.test(s)) {
    return 'HAK MILIK';
  }

  // Letter C / Girik / Petuk
  if (/LETTER\s*[-–]?\s*C|LETER\s*C|GIRIK|PETUK|KOKO|\bC\b/i.test(s)) {
    return 'LETTER C';
  }

  // HGB
  if (/HGB|HAK\s*GUNA\s*BANGUNAN/i.test(s)) {
    return 'HGB';
  }

  // HGU
  if (/HGU|HAK\s*GUNA\s*USAHA/i.test(s)) {
    return 'HGU';
  }

  // Hak Pakai
  if (/HAK\s*PAKAI|\bHP\b/i.test(s)) {
    return 'HAK PAKAI';
  }

  // Tanah Kas Desa
  if (/KAS\s*DESA|TKD|BENGKOK|ASET\s*DESA/i.test(s)) {
    return 'TANAH KAS DESA';
  }

  // Wakaf
  if (/WAKAF|IKRAR\s*WAKAF/i.test(s)) {
    return 'WAKAF';
  }

  return s.replace(/[^A-Z0-9]/g, '');
}

/**
 * Month name to 2-digit number mapping in Indonesian
 */
const ID_MONTHS: Record<string, string> = {
  JANUARI: '01',
  FEBRUARI: '02',
  MARET: '03',
  APRIL: '04',
  MEI: '05',
  JUNI: '06',
  JULI: '07',
  AGUSTUS: '08',
  SEPTEMBER: '09',
  OKTOBER: '10',
  NOVEMBER: '11',
  DESEMBER: '12',
};

/**
 * Normalize Nomor Alas Hak (stripping prefixes, formatting dates, stripping leading zeros)
 * e.g. "00772" -> "772", "27 FEBRUARI 2026" -> "27/02/2026", "27/02/2026" -> "27/02/2026"
 */
export function normalizeNomorHak(nomor: string): string {
  if (!nomor) return '';
  let str = nomor.toUpperCase().trim();

  // Strip prefixes like "NOMOR :", "NO.", "NO:", "NOMOR"
  str = str.replace(/^(?:NOMOR\s*[:.]?|NO\s*[:.]?)\s*/i, '').trim();

  // Replace Indonesian Month Name e.g. "27 FEBRUARI 2026" -> "27/02/2026"
  for (const [mName, mNum] of Object.entries(ID_MONTHS)) {
    if (str.includes(mName)) {
      str = str.replace(new RegExp(`\\b${mName}\\b`, 'i'), mNum);
    }
  }

  // Normalise spaces, hyphens, and dots into slashes for uniform date/number structure
  str = str.replace(/[\s.-]+/g, '/').replace(/\/+/g, '/').trim();

  // Strip leading zeroes from purely numeric segments e.g. "00772" -> "772" or "00772/DESA" -> "772/DESA"
  const parts = str.split('/');
  const cleanedParts = parts.map(p => {
    if (/^\d+$/.test(p)) {
      return p.replace(/^0+/, '') || '0';
    }
    return p;
  });
  str = cleanedParts.join('/');

  return str;
}

/**
 * Check if two Alas Hak (Jenis + Nomor) are equivalent
 */
export function isAlasHakEquivalent(
  jenisA: string,
  nomorA: string,
  jenisB: string,
  nomorB: string
): { isMatch: boolean; isJenisMatch: boolean; isNomorMatch: boolean } {
  const normJenisA = normalizeAlasHakType(jenisA);
  const normJenisB = normalizeAlasHakType(jenisB);
  const isJenisMatch =
    !normJenisA && !normJenisB
      ? true
      : normJenisA === normJenisB || !normJenisA || !normJenisB;

  const normNomorA = normalizeNomorHak(nomorA);
  const normNomorB = normalizeNomorHak(nomorB);

  let isNomorMatch = false;
  if (!normNomorA && !normNomorB) {
    isNomorMatch = true;
  } else if (!normNomorA || !normNomorB) {
    // If one is empty and the other isn't, treat as partial match if jenis matches
    isNomorMatch = false;
  } else {
    // 1. Direct equality (e.g. "772" === "772" after stripping leading zeroes from "00772")
    if (normNomorA === normNomorB) {
      isNomorMatch = true;
    } else {
      // 2. Alphanumeric only equality
      const alphaA = normNomorA.replace(/[^A-Z0-9]/g, '');
      const alphaB = normNomorB.replace(/[^A-Z0-9]/g, '');
      if (alphaA && alphaB && (alphaA === alphaB || alphaA.includes(alphaB) || alphaB.includes(alphaA))) {
        isNomorMatch = true;
      } else {
        // 3. Date partial match e.g. "27/02/2026" vs "27/02"
        const partsA = normNomorA.split('/');
        const partsB = normNomorB.split('/');
        if (partsA.length >= 2 && partsB.length >= 2) {
          if (partsA[0] === partsB[0] && partsA[1] === partsB[1]) {
            isNomorMatch = true;
          }
        }
      }
    }
  }

  const isMatch = isJenisMatch && isNomorMatch;
  return { isMatch, isJenisMatch, isNomorMatch };
}

/**
 * Compare local app records with parsed ESDM PDF bidangs for a specified Desa
 */
export function compareEsdmData(
  appRecords: LandRecord[],
  esdmBidangs: EsdmBidangData[],
  selectedDesa: string
): EsdmComparisonResult {
  // 1. Filter app records for the selected Desa (case-insensitive)
  const cleanDesa = (selectedDesa || '').trim().toUpperCase();
  const villageAppRecords = appRecords.filter(r => {
    const d = (r.DESA || '').trim().toUpperCase();
    return !cleanDesa || d === cleanDesa;
  });

  const comparisonMap = new Map<string, EsdmComparisonItem>();
  const matchedAppIds = new Set<string>();
  const matchedEsdmIds = new Set<string>();

  // Helper to get total plants for a local LandRecord
  const getAppRecordPlantTotal = (rec: LandRecord): number => {
    if (!rec.plants || rec.plants.length === 0) return 0;
    return rec.plants.reduce((sum, p) => {
      const bm = Number(p.belum_menghasilkan) || 0;
      const sm = Number(p.sudah_menghasilkan) || 0;
      const k = Number(p.kecil) || 0;
      const s = Number(p.sedang) || 0;
      const b = Number(p.besar) || 0;
      return sum + (bm + sm + k + s + b);
    }, 0);
  };

  // Helper to get total plants for an ESDM bidang
  const getEsdmPlantTotal = (eb: EsdmBidangData): number => {
    if (!eb.tanaman || eb.tanaman.length === 0) return 0;
    return eb.tanaman.reduce((sum, p) => sum + (p.total || 0), 0);
  };

  const getAppRecordKey = (r: LandRecord, idx: number): string => {
    return r.CODE || `${r.DESA}_${r.SPAN}_${r.NOBID}_${idx}`;
  };

  // 2. Iterate through ESDM Bidangs and attempt to match with App records
  esdmBidangs.forEach(esdm => {
    const normSpan = normalizeSpanKey(esdm.span);
    const normNobid = normalizeNobidKey(esdm.nobid);
    const key = `${normSpan}_${normNobid}`;

    // 1. Primary match: by Span and No Bidang
    let matchedApp = villageAppRecords.find((app, idx) => {
      const appKey = getAppRecordKey(app, idx);
      if (matchedAppIds.has(appKey)) return false;
      const appSpan = normalizeSpanKey(app.SPAN || '');
      const appNobid = normalizeNobidKey(app.NOBID || '');
      return appSpan === normSpan && appNobid === normNobid;
    });

    // Fallback 1a: match by Span + NIK if available (10 or more digits)
    if (!matchedApp && esdm.nik && esdm.nik.length >= 10) {
      const spanNikCandidates = villageAppRecords.filter((app, idx) => {
        const appKey = getAppRecordKey(app, idx);
        if (matchedAppIds.has(appKey)) return false;
        const appSpan = normalizeSpanKey(app.SPAN || '');
        const cleanNik = String(app.NIK || '').replace(/\D/g, '');
        return appSpan === normSpan && cleanNik === esdm.nik;
      });

      if (spanNikCandidates.length === 1) {
        matchedApp = spanNikCandidates[0];
      } else if (spanNikCandidates.length > 1) {
        // Disambiguate when owner owns multiple plots in this span
        matchedApp = spanNikCandidates.find(app => {
          const appNobid = normalizeNobidKey(app.NOBID || '');
          return appNobid === normNobid;
        }) || spanNikCandidates.find(app => {
          if (esdm.luasTanah && esdm.luasTanah > 0) {
            const appLuas = Number(app.LUAS) || 0;
            return Math.abs(appLuas - esdm.luasTanah) <= 0.05;
          }
          return false;
        }) || spanNikCandidates.find(app => {
          const hRes = isAlasHakEquivalent(
            app.JENIS_ALAS_HAK || '',
            app.NOMER_HAK || '',
            esdm.jenisAlasHak || '',
            esdm.nomerAlasHak || ''
          );
          return hRes.isMatch;
        }) || spanNikCandidates[0];
      }
    }

    // Fallback 1b: match by unique NIK across village (only if exactly 1 unused candidate in village)
    if (!matchedApp && esdm.nik && esdm.nik.length >= 10) {
      const allNikCandidates = villageAppRecords.filter((app, idx) => {
        const appKey = getAppRecordKey(app, idx);
        if (matchedAppIds.has(appKey)) return false;
        const cleanNik = String(app.NIK || '').replace(/\D/g, '');
        return cleanNik === esdm.nik;
      });
      if (allNikCandidates.length === 1) {
        matchedApp = allNikCandidates[0];
      }
    }

    // Fallback 2: match by Span and Alas Hak equivalence
    if (!matchedApp && (esdm.jenisAlasHak || esdm.nomerAlasHak)) {
      matchedApp = villageAppRecords.find((app, idx) => {
        const appKey = getAppRecordKey(app, idx);
        if (matchedAppIds.has(appKey)) return false;
        const appSpan = normalizeSpanKey(app.SPAN || '');
        if (appSpan !== normSpan) return false;
        const hRes = isAlasHakEquivalent(
          app.JENIS_ALAS_HAK || '',
          app.NOMER_HAK || '',
          esdm.jenisAlasHak || '',
          esdm.nomerAlasHak || ''
        );
        return hRes.isMatch;
      });
    }

    // Fallback 3: match by Span and Name similarity
    if (!matchedApp && esdm.nama && esdm.nama.length >= 3) {
      const spanNameCandidates = villageAppRecords.filter((app, idx) => {
        const appKey = getAppRecordKey(app, idx);
        if (matchedAppIds.has(appKey)) return false;
        const appSpan = normalizeSpanKey(app.SPAN || '');
        if (appSpan !== normSpan) return false;
        return isStringSimilar((app.NAMA || '').trim(), esdm.nama.trim());
      });

      if (spanNameCandidates.length === 1) {
        matchedApp = spanNameCandidates[0];
      } else if (spanNameCandidates.length > 1) {
        matchedApp = spanNameCandidates.find(app => {
          const appNobid = normalizeNobidKey(app.NOBID || '');
          return appNobid === normNobid;
        }) || spanNameCandidates.find(app => {
          if (esdm.luasTanah && esdm.luasTanah > 0) {
            const appLuas = Number(app.LUAS) || 0;
            return Math.abs(appLuas - esdm.luasTanah) <= 0.05;
          }
          return false;
        }) || spanNameCandidates[0];
      }
    }

    // Fallback 4: match by unique Name within the selected village (if no span match)
    if (!matchedApp && esdm.nama && esdm.nama.length >= 4) {
      const candidates = villageAppRecords.filter((app, idx) => {
        const appKey = getAppRecordKey(app, idx);
        if (matchedAppIds.has(appKey)) return false;
        return isStringSimilar((app.NAMA || '').trim(), esdm.nama.trim());
      });
      if (candidates.length === 1) {
        matchedApp = candidates[0];
      }
    }

    if (matchedApp) {
      const matchedIdx = villageAppRecords.indexOf(matchedApp);
      const appKey = getAppRecordKey(matchedApp, matchedIdx);
      matchedAppIds.add(appKey);
      matchedEsdmIds.add(esdm.id);

      // Perform detailed field-by-field diff
      const appLuas = Number(matchedApp.LUAS) || 0;
      const esdmLuas = esdm.luasTanah || 0;
      const diffLuas = Math.round((appLuas - esdmLuas) * 100) / 100;
      const isLuasMatch = Math.abs(diffLuas) <= 0.05;

      const appNama = (matchedApp.NAMA || '').trim();
      const esdmNama = (esdm.nama || '').trim();
      const isNamaMatch = isStringSimilar(appNama, esdmNama);

      const appNik = String(matchedApp.NIK || '').replace(/\D/g, '');
      const esdmNik = (esdm.nik || '').replace(/\D/g, '');
      const isNikMatch = (!appNik && !esdmNik) || appNik === esdmNik;

      // Alas Hak comparison (with fuzzy scrubbing & date/leading zero normalization)
      const appJenisHak = matchedApp.JENIS_ALAS_HAK || '';
      const appNomerHak = matchedApp.NOMER_HAK || '';
      const esdmJenisHak = esdm.jenisAlasHak || '';
      const esdmNomerHak = esdm.nomerAlasHak || '';
      const hakEquiv = isAlasHakEquivalent(appJenisHak, appNomerHak, esdmJenisHak, esdmNomerHak);
      const isAlasHakMatch = hakEquiv.isJenisMatch;
      const isNomerHakMatch = hakEquiv.isNomorMatch;
      const isHakOverallMatch = hakEquiv.isMatch;

      // Plant comparison
      const plantDiffs = buildPlantDiffs(matchedApp.plants || [], esdm.tanaman || []);
      const appTotalTanaman = getAppRecordPlantTotal(matchedApp);
      const esdmTotalTanaman = getEsdmPlantTotal(esdm);
      const diffTanaman = appTotalTanaman - esdmTotalTanaman;
      const isTanamanMatch = diffTanaman === 0 && plantDiffs.every(p => p.status === 'MATCH');

      const discrepancyReasons: string[] = [];
      if (!isLuasMatch) {
        const sign = diffLuas > 0 ? '+' : '';
        discrepancyReasons.push(`Selisih Luas: ${sign}${diffLuas} m² (Data: ${appLuas} vs ESDM: ${esdmLuas})`);
      }
      if (!isNamaMatch) {
        discrepancyReasons.push(`Beda Nama: "${appNama}" vs "${esdmNama}"`);
      }
      if (!isNikMatch && (appNik || esdmNik)) {
        discrepancyReasons.push(`Beda NIK: ${appNik || '(kosong)'} vs ${esdmNik || '(kosong)'}`);
      }
      if (!isHakOverallMatch && (appJenisHak || appNomerHak || esdmJenisHak || esdmNomerHak)) {
        const appHakStr = `${appJenisHak || '(kosong)'}${appNomerHak ? ` No. ${appNomerHak}` : ''}`.trim();
        const esdmHakStr = `${esdmJenisHak || '(kosong)'}${esdmNomerHak ? ` No. ${esdmNomerHak}` : ''}`.trim();
        discrepancyReasons.push(`Beda Bukti Hak: ${appHakStr} vs ${esdmHakStr}`);
      }
      if (!isTanamanMatch) {
        if (diffTanaman !== 0) {
          const sign = diffTanaman > 0 ? '+' : '';
          discrepancyReasons.push(`Selisih Tanaman: ${sign}${diffTanaman} pohon (Data: ${appTotalTanaman} vs ESDM: ${esdmTotalTanaman})`);
        } else {
          const mismatchedPlants = plantDiffs.filter(p => p.status !== 'MATCH');
          if (mismatchedPlants.length > 0) {
            const desc = mismatchedPlants.slice(0, 2).map(p => {
              if (p.status === 'APP_ONLY') return `${p.jenis} (hanya di Data Kita: ${p.appTotal})`;
              if (p.status === 'ESDM_ONLY') return `${p.jenis} (hanya di ESDM: ${p.esdmTotal})`;
              return `${p.jenis} (Data: ${p.appTotal} vs ESDM: ${p.esdmTotal})`;
            }).join(', ');
            discrepancyReasons.push(`Beda Rincian Jenis Tanaman: ${desc}`);
          } else {
            discrepancyReasons.push(`Beda Kategori Ukuran Tanaman (Total sama: ${appTotalTanaman} pohon)`);
          }
        }
      }

      const status: EsdmComparisonStatus = discrepancyReasons.length === 0 ? 'MATCH' : 'DISCREPANCY';

      comparisonMap.set(key || esdm.id, {
        id: key || esdm.id,
        span: esdm.span || matchedApp.SPAN || '',
        nobid: String(esdm.nobid || matchedApp.NOBID || ''),
        desa: selectedDesa || matchedApp.DESA || '',
        status,
        discrepancyReasons,

        appRecord: matchedApp,
        appNama,
        appNik,
        appLuas,
        appJenisHak,
        appNomerHak,
        appPenutup: matchedApp.PENUTUP_LAHAN || '',
        appStatusTanah: matchedApp.STATUS_KEPEMILIKAN || '',
        appTotalTanaman,

        esdmBidang: esdm,
        esdmNama,
        esdmNik,
        esdmLuas,
        esdmJenisHak,
        esdmNomerHak,
        esdmPenutup: esdm.penutupLahan || '',
        esdmStatusTanah: esdm.statusTanah || '',
        esdmTotalTanaman,

        diffLuas,
        diffTanaman,
        isLuasMatch,
        isNamaMatch,
        isNikMatch,
        isTanamanMatch,
        isAlasHakMatch,
        isNomerHakMatch,
        isHakOverallMatch,
        plantDiffs,
      });
    } else {
      // Exists in ESDM only!
      matchedEsdmIds.add(esdm.id);
      const esdmTotalTanaman = getEsdmPlantTotal(esdm);
      const plantDiffs = buildPlantDiffs([], esdm.tanaman || []);

      comparisonMap.set(key || esdm.id, {
        id: key || esdm.id,
        span: esdm.span,
        nobid: String(esdm.nobid),
        desa: selectedDesa,
        status: 'ESDM_ONLY',
        discrepancyReasons: ['Hanya ada di dokumen ESDM, belum terdaftar di aplikasi'],

        appRecord: null,
        appNama: '-',
        appNik: '-',
        appLuas: 0,
        appJenisHak: '-',
        appNomerHak: '-',
        appPenutup: '-',
        appStatusTanah: '-',
        appTotalTanaman: 0,

        esdmBidang: esdm,
        esdmNama: esdm.nama || 'Pemilik Diketahui',
        esdmNik: esdm.nik || '-',
        esdmLuas: esdm.luasTanah || 0,
        esdmJenisHak: esdm.jenisAlasHak || '-',
        esdmNomerHak: esdm.nomerAlasHak || '-',
        esdmPenutup: esdm.penutupLahan || '-',
        esdmStatusTanah: esdm.statusTanah || '-',
        esdmTotalTanaman,

        diffLuas: -(esdm.luasTanah || 0),
        diffTanaman: -esdmTotalTanaman,
        isLuasMatch: false,
        isNamaMatch: false,
        isNikMatch: false,
        isTanamanMatch: false,
        isAlasHakMatch: false,
        isNomerHakMatch: false,
        isHakOverallMatch: false,
        plantDiffs,
      });
    }
  });

  // 3. Check any remaining App records that were NOT matched in ESDM (APP_ONLY)
  villageAppRecords.forEach((app, idx) => {
    const appKey = getAppRecordKey(app, idx);
    if (matchedAppIds.has(appKey)) return;

    const normSpan = normalizeSpanKey(app.SPAN || '');
    const normNobid = normalizeNobidKey(app.NOBID || '');
    const key = `APP_${normSpan}_${normNobid}_${appKey}`;
    const appTotalTanaman = getAppRecordPlantTotal(app);
    const plantDiffs = buildPlantDiffs(app.plants || [], []);
    const appLuas = Number(app.LUAS) || 0;

    comparisonMap.set(key, {
      id: key,
      span: app.SPAN || '-',
      nobid: String(app.NOBID || '-'),
      desa: app.DESA || selectedDesa,
      status: 'APP_ONLY',
      discrepancyReasons: ['Hanya ada di database aplikasi, tidak ditemukan dalam PDF ESDM'],

      appRecord: app,
      appNama: app.NAMA || '-',
      appNik: app.NIK || '-',
      appLuas,
      appJenisHak: app.JENIS_ALAS_HAK || '-',
      appNomerHak: app.NOMER_HAK || '-',
      appPenutup: app.PENUTUP_LAHAN || '-',
      appStatusTanah: app.STATUS_KEPEMILIKAN || '-',
      appTotalTanaman,

      esdmBidang: null,
      esdmNama: '-',
      esdmNik: '-',
      esdmLuas: 0,
      esdmJenisHak: '-',
      esdmNomerHak: '-',
      esdmPenutup: '-',
      esdmStatusTanah: '-',
      esdmTotalTanaman: 0,

      diffLuas: appLuas,
      diffTanaman: appTotalTanaman,
      isLuasMatch: false,
      isNamaMatch: false,
      isNikMatch: false,
      isTanamanMatch: false,
      isAlasHakMatch: false,
      isNomerHakMatch: false,
      isHakOverallMatch: false,
      plantDiffs,
    });
  });

  // 4. Sort items by Span and No Bidang
  const items = Array.from(comparisonMap.values()).sort((a, b) => {
    // Sort by Span first
    const spanComp = a.span.localeCompare(b.span, undefined, { numeric: true });
    if (spanComp !== 0) return spanComp;
    // Sort by No. Bidang
    const numA = parseInt(a.nobid, 10) || 0;
    const numB = parseInt(b.nobid, 10) || 0;
    return numA - numB;
  });

  // 5. Calculate summary metrics
  let matchCount = 0;
  let discrepancyCount = 0;
  let esdmOnlyCount = 0;
  let appOnlyCount = 0;

  let totalLuasEsdm = 0;
  let totalLuasApp = 0;

  let totalTanamanEsdm = 0;
  let totalTanamanApp = 0;

  items.forEach(item => {
    if (item.status === 'MATCH') matchCount++;
    else if (item.status === 'DISCREPANCY') discrepancyCount++;
    else if (item.status === 'ESDM_ONLY') esdmOnlyCount++;
    else if (item.status === 'APP_ONLY') appOnlyCount++;

    totalLuasEsdm += item.esdmLuas || 0;
    totalLuasApp += item.appLuas || 0;

    totalTanamanEsdm += item.esdmTotalTanaman || 0;
    totalTanamanApp += item.appTotalTanaman || 0;
  });

  const summary: EsdmComparisonSummary = {
    desa: selectedDesa,
    totalEsdmBidang: esdmBidangs.length,
    totalAppBidang: villageAppRecords.length,
    matchCount,
    discrepancyCount,
    esdmOnlyCount,
    appOnlyCount,

    totalLuasEsdm: Math.round(totalLuasEsdm * 100) / 100,
    totalLuasApp: Math.round(totalLuasApp * 100) / 100,
    diffTotalLuas: Math.round((totalLuasApp - totalLuasEsdm) * 100) / 100,

    totalTanamanEsdm,
    totalTanamanApp,
    diffTotalTanaman: totalTanamanApp - totalTanamanEsdm,
  };

  return {
    summary,
    items,
  };
}

/**
 * Build plant-by-plant diff matrix for a single Bidang
 */
export function buildPlantDiffs(
  appPlants: PlantData[],
  esdmPlants: EsdmPlantData[]
): PlantDiffItem[] {
  const map = new Map<string, PlantDiffItem>();

  // Process App plants
  appPlants.forEach(ap => {
    const jenisNorm = normalizePlantName(ap.jenis || '');
    if (!jenisNorm) return;

    const bm = Number(ap.belum_menghasilkan) || 0;
    const sm = Number(ap.sudah_menghasilkan) || 0;
    const k = Number(ap.kecil) || 0;
    const s = Number(ap.sedang) || 0;
    const b = Number(ap.besar) || 0;
    const total = bm + sm + k + s + b;

    map.set(jenisNorm, {
      jenis: ap.jenis?.trim().toUpperCase() || jenisNorm,
      appBm: bm,
      appSm: sm,
      appK: k,
      appS: s,
      appB: b,
      appTotal: total,

      esdmBm: 0,
      esdmSm: 0,
      esdmK: 0,
      esdmS: 0,
      esdmB: 0,
      esdmTotal: 0,

      diffTotal: total,
      status: 'APP_ONLY',
      discrepancyNotes: [],
    });
  });

  // Process ESDM plants
  esdmPlants.forEach(ep => {
    const jenisNorm = normalizePlantName(ep.jenis || '');
    if (!jenisNorm) return;

    const bm = ep.belum_menghasilkan || 0;
    const sm = ep.sudah_menghasilkan || 0;
    const k = ep.kecil || 0;
    const s = ep.sedang || 0;
    const b = ep.besar || 0;
    const total = ep.total || (bm + sm + k + s + b);

    const existing = map.get(jenisNorm);
    if (existing) {
      existing.esdmBm += bm;
      existing.esdmSm += sm;
      existing.esdmK += k;
      existing.esdmS += s;
      existing.esdmB += b;
      existing.esdmTotal += total;
      existing.diffTotal = existing.appTotal - existing.esdmTotal;
    } else {
      map.set(jenisNorm, {
        jenis: ep.jenis?.trim().toUpperCase() || jenisNorm,
        appBm: 0,
        appSm: 0,
        appK: 0,
        appS: 0,
        appB: 0,
        appTotal: 0,

        esdmBm: bm,
        esdmSm: sm,
        esdmK: k,
        esdmS: s,
        esdmB: b,
        esdmTotal: total,

        diffTotal: -total,
        status: 'ESDM_ONLY',
        discrepancyNotes: [],
      });
    }
  });

  // Evaluate final status and notes for each plant
  const results = Array.from(map.values()).map(item => {
    const notes: string[] = [];

    if (item.appTotal > 0 && item.esdmTotal === 0) {
      item.status = 'APP_ONLY';
      notes.push(`Ada di aplikasi (${item.appTotal}), tidak ada di ESDM`);
    } else if (item.appTotal === 0 && item.esdmTotal > 0) {
      item.status = 'ESDM_ONLY';
      notes.push(`Ada di ESDM (${item.esdmTotal}), belum ada di aplikasi`);
    } else {
      // Both have it, compare category breakdowns
      const isBmDiff = item.appBm !== item.esdmBm;
      const isSmDiff = item.appSm !== item.esdmSm;
      const isKDiff = item.appK !== item.esdmK;
      const isSDiff = item.appS !== item.esdmS;
      const isBDiff = item.appB !== item.esdmB;

      if (!isBmDiff && !isSmDiff && !isKDiff && !isSDiff && !isBDiff) {
        item.status = 'MATCH';
      } else {
        item.status = 'MISMATCH';
        if (isBmDiff) notes.push(`BM: Data(${item.appBm}) vs ESDM(${item.esdmBm})`);
        if (isSmDiff) notes.push(`SM: Data(${item.appSm}) vs ESDM(${item.esdmSm})`);
        if (isKDiff) notes.push(`Kecil: Data(${item.appK}) vs ESDM(${item.esdmK})`);
        if (isSDiff) notes.push(`Sedang: Data(${item.appS}) vs ESDM(${item.esdmS})`);
        if (isBDiff) notes.push(`Besar: Data(${item.appB}) vs ESDM(${item.esdmB})`);
      }
    }

    item.discrepancyNotes = notes;
    return item;
  });

  // Sort plants alphabetically
  return results.sort((a, b) => a.jenis.localeCompare(b.jenis));
}
