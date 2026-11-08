import { LandRecord, BuildingData, PlantData, createEmptyRecord } from '../types';

/**
 * Generates a reliable, unique identifier key for a LandRecord even if CODE or ID_UNIK
 * was not yet populated in an imported spreadsheet.
 */
export function getRecordUniqueKey(r: LandRecord): string {
  const code = (r.CODE || '').trim();
  if (code) return code;
  const idUnik = (r.ID_UNIK || '').trim();
  if (idUnik) return idUnik;
  const desa = (r.DESA || '').trim().toUpperCase();
  const span = (r.SPAN || '').trim().toUpperCase();
  const nobid = (r.NOBID || '').trim().toUpperCase();
  if (desa || span || nobid) {
    return `${desa}_${span}_${nobid}`;
  }
  return `ROW_${r.rowNumber || 0}`;
}

/**
 * Builds a consistent CODE for a parcel in a Desa + Span, respecting the project's existing CODE convention
 * (e.g. "KEBRAON_T.23 - LLG1_1" or "KEBRAON_T23_LLG1_1").
 */
export function buildConsistentParcelCode(desaRaw: string, spanRaw: string, nobid: string, templateCode?: string): string {
  const cleanDesa = (desaRaw || '').trim().toUpperCase();
  const cleanSpan = (spanRaw || '').trim().toUpperCase();
  const cleanNobid = (nobid || '').trim().toUpperCase();

  // If templateCode preserves spaces in SPAN (like "KEBRAON_T.23 - LLG1_1"), keep that style
  if (templateCode && templateCode.includes(' ')) {
    return `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
  }

  const safeDesa = cleanDesa.replace(/[\s\/\\?%*:|"]/g, '_');
  const safeSpan = cleanSpan.replace(/[\s\/\\?%*:|"]/g, '_');
  return `${safeDesa}_${safeSpan}_${cleanNobid}`;
}

/**
 * Parses NOBID into numeric parent number, optional letter suffix, and digit padding width.
 * Examples:
 *   "3"    -> { num: 3, suffix: "", padLength: 0 }
 *   "003"  -> { num: 3, suffix: "", padLength: 3 }
 *   "3A"   -> { num: 3, suffix: "A", padLength: 0 }
 *   "014B" -> { num: 14, suffix: "B", padLength: 3 }
 */
export function parseNobid(nobidStr: string): { num: number; suffix: string; padLength: number } {
  const clean = (nobidStr || '').trim();
  const match = clean.match(/^(\d+)([a-zA-Z]*)$/);
  if (match) {
    const digits = match[1];
    const padLength = digits.length > 1 && digits.startsWith('0') ? digits.length : 0;
    return {
      num: parseInt(digits, 10),
      suffix: match[2].toUpperCase(),
      padLength
    };
  }
  const digitsOnly = clean.replace(/\D/g, '');
  const padLength = digitsOnly.length > 1 && digitsOnly.startsWith('0') ? digitsOnly.length : 0;
  const fallbackNum = parseInt(digitsOnly, 10) || 0;
  const fallbackSuffix = clean.replace(/[\d\s]/g, '').toUpperCase();
  return { num: fallbackNum, suffix: fallbackSuffix, padLength };
}

/**
 * Formats numeric parent and suffix back to NOBID string, preserving leading zero padding if used.
 */
export function formatNobid(num: number, suffix: string = '', padLength: number = 0): string {
  const numStr = padLength > 0 ? String(Math.max(0, num)).padStart(padLength, '0') : String(num);
  return `${numStr}${suffix.toUpperCase()}`;
}

/**
 * Reliable identity check between two LandRecord objects even if CODE or ID_UNIK was generated dynamically.
 */
export function isSameRecord(a: LandRecord, b: LandRecord): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const idA = (a.ID_UNIK || '').trim();
  const idB = (b.ID_UNIK || '').trim();
  if (idA && idB && idA === idB) return true;

  const codeA = (a.CODE || '').trim().toUpperCase();
  const codeB = (b.CODE || '').trim().toUpperCase();
  if (codeA && codeB && codeA === codeB) return true;

  if (a.rowNumber && b.rowNumber && a.rowNumber > 1 && a.rowNumber === b.rowNumber) {
    return true;
  }

  const desaA = (a.DESA || '').trim().toUpperCase();
  const desaB = (b.DESA || '').trim().toUpperCase();
  const spanA = (a.SPAN || '').trim().toUpperCase();
  const spanB = (b.SPAN || '').trim().toUpperCase();
  const nobidA = (a.NOBID || '').trim().toUpperCase();
  const nobidB = (b.NOBID || '').trim().toUpperCase();

  if (desaA && spanA && nobidA && desaA === desaB && spanA === spanB && nobidA === nobidB) {
    return true;
  }

  return false;
}

/**
 * Normalizes a plant name for repetition detection:
 * - Uppercase, collapse multiple spaces, strip leading/trailing punctuation
 * - If looseMode is true, also strips generic prefixes like "POHON ", "TANAMAN ", "BIBIT ", "RUMPUT "
 */
export function normalizePlantSpeciesKey(rawJenis: string, looseMode: boolean = false): string {
  let clean = (rawJenis || '')
    .trim()
    .toUpperCase()
    .replace(/[.,;:/\\|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (looseMode) {
    clean = clean.replace(/^(POHON|TANAMAN|BIBIT|TNM|PHN)\s+/i, '').trim();
  }
  return clean;
}

export interface PlantSlotOccurrence {
  slotIndex: number; // 0-based (0..29)
  slotNumber: number; // 1-based (1..30)
  rawJenis: string;
  sudah_menghasilkan: number;
  belum_menghasilkan: number;
  kecil: number;
  sedang: number;
  besar: number;
  totalBatang: number;
  keterangan: string;
}

export interface PlantRepetitionGroup {
  normalizedKey: string;
  displayJenis: string;
  occurrences: PlantSlotOccurrence[];
  mergedPreview: {
    jenis: string;
    sudah_menghasilkan: number;
    belum_menghasilkan: number;
    kecil: number;
    sedang: number;
    besar: number;
    totalBatang: number;
    keterangan: string;
  };
}

export interface ParcelPlantRepetitionReport {
  record: LandRecord;
  recordKey: string;
  code: string;
  desa: string;
  span: string;
  nobid: string;
  nama: string;
  totalPopulatedSlots: number;
  uniquePlantCount: number;
  duplicateSlotCount: number; // How many extra slots can be consolidated
  repetitionGroups: PlantRepetitionGroup[];
}

/**
 * Inspects a single LandRecord for repeated plant entries across its 30 plant slots.
 */
export function analyzeRecordPlantRepetition(
  record: LandRecord,
  looseMode: boolean = false
): ParcelPlantRepetitionReport {
  const groupsMap = new Map<string, PlantSlotOccurrence[]>();
  const plants = Array.isArray(record.plants) ? record.plants : [];
  let totalPopulatedSlots = 0;

  plants.forEach((p, idx) => {
    if (!p) return;
    const rawJenis = (p.jenis || '').trim();
    if (!rawJenis) return;

    totalPopulatedSlots++;
    const key = normalizePlantSpeciesKey(rawJenis, looseMode);
    if (!key) return;

    const sm = parseInt(p.sudah_menghasilkan || '0', 10) || 0;
    const bm = parseInt(p.belum_menghasilkan || '0', 10) || 0;
    const kc = parseInt(p.kecil || '0', 10) || 0;
    const sd = parseInt(p.sedang || '0', 10) || 0;
    const bs = parseInt(p.besar || '0', 10) || 0;

    const occ: PlantSlotOccurrence = {
      slotIndex: idx,
      slotNumber: idx + 1,
      rawJenis,
      sudah_menghasilkan: sm,
      belum_menghasilkan: bm,
      kecil: kc,
      sedang: sd,
      besar: bs,
      totalBatang: sm + bm + kc + sd + bs,
      keterangan: (p.keterangan || '').trim()
    };

    const existing = groupsMap.get(key) || [];
    existing.push(occ);
    groupsMap.set(key, existing);
  });

  const repetitionGroups: PlantRepetitionGroup[] = [];
  let duplicateSlotCount = 0;

  groupsMap.forEach((occurrences, normalizedKey) => {
    if (occurrences.length > 1) {
      duplicateSlotCount += occurrences.length - 1;
      let sumSm = 0;
      let sumBm = 0;
      let sumKc = 0;
      let sumSd = 0;
      let sumBs = 0;
      const ketParts: string[] = [];

      occurrences.forEach(o => {
        sumSm += o.sudah_menghasilkan;
        sumBm += o.belum_menghasilkan;
        sumKc += o.kecil;
        sumSd += o.sedang;
        sumBs += o.besar;
        if (o.keterangan && o.keterangan !== '-') {
          if (!ketParts.some(k => k.toLowerCase() === o.keterangan.toLowerCase())) {
            ketParts.push(o.keterangan);
          }
        }
      });

      const displayJenis = occurrences[0].rawJenis.toUpperCase();
      repetitionGroups.push({
        normalizedKey,
        displayJenis,
        occurrences,
        mergedPreview: {
          jenis: displayJenis,
          sudah_menghasilkan: sumSm,
          belum_menghasilkan: sumBm,
          kecil: sumKc,
          sedang: sumSd,
          besar: sumBs,
          totalBatang: sumSm + sumBm + sumKc + sumSd + sumBs,
          keterangan: ketParts.join('; ')
        }
      });
    }
  });

  return {
    record,
    recordKey: getRecordUniqueKey(record),
    code: record.CODE || getRecordUniqueKey(record),
    desa: (record.DESA || '-').trim(),
    span: (record.SPAN || '-').trim(),
    nobid: (record.NOBID || '-').trim(),
    nama: (record.NAMA || '-').trim(),
    totalPopulatedSlots,
    uniquePlantCount: groupsMap.size,
    duplicateSlotCount,
    repetitionGroups
  };
}

/**
 * Consolidates/deduplicates repeated plants within a single LandRecord's 30 plant slots
 * by summing quantities and merging keterangan, preserving initial slot order.
 */
export function consolidateRepeatedPlantsInRecord(
  record: LandRecord,
  looseMode: boolean = false
): { updatedRecord: LandRecord; mergedSlotsCount: number } {
  const plants = Array.isArray(record.plants) ? record.plants : [];
  const map = new Map<string, PlantData>();
  const orphanNotesOnly: PlantData[] = [];
  let originalPopulated = 0;

  const sumValues = (v1: string, v2: string): string => {
    const n1 = parseInt(v1 || '0', 10) || 0;
    const n2 = parseInt(v2 || '0', 10) || 0;
    const total = n1 + n2;
    return total > 0 ? String(total) : '';
  };

  plants.forEach(p => {
    if (!p) return;
    const rawJenis = (p.jenis || '').trim();
    const rawKet = (p.keterangan || '').trim();
    const hasNumbers =
      (parseInt(p.sudah_menghasilkan || '0', 10) || 0) > 0 ||
      (parseInt(p.belum_menghasilkan || '0', 10) || 0) > 0 ||
      (parseInt(p.kecil || '0', 10) || 0) > 0 ||
      (parseInt(p.sedang || '0', 10) || 0) > 0 ||
      (parseInt(p.besar || '0', 10) || 0) > 0;

    if (!rawJenis) {
      if (rawKet || hasNumbers) {
        orphanNotesOnly.push({
          jenis: '',
          sudah_menghasilkan: p.sudah_menghasilkan || '',
          belum_menghasilkan: p.belum_menghasilkan || '',
          kecil: p.kecil || '',
          sedang: p.sedang || '',
          besar: p.besar || '',
          keterangan: rawKet
        });
      }
      return;
    }

    originalPopulated++;
    const key = normalizePlantSpeciesKey(rawJenis, looseMode);

    if (!map.has(key)) {
      map.set(key, {
        jenis: rawJenis.toUpperCase(),
        sudah_menghasilkan: p.sudah_menghasilkan || '',
        belum_menghasilkan: p.belum_menghasilkan || '',
        kecil: p.kecil || '',
        sedang: p.sedang || '',
        besar: p.besar || '',
        keterangan: rawKet
      });
    } else {
      const cur = map.get(key)!;
      cur.sudah_menghasilkan = sumValues(cur.sudah_menghasilkan, p.sudah_menghasilkan);
      cur.belum_menghasilkan = sumValues(cur.belum_menghasilkan, p.belum_menghasilkan);
      cur.kecil = sumValues(cur.kecil, p.kecil);
      cur.sedang = sumValues(cur.sedang, p.sedang);
      cur.besar = sumValues(cur.besar, p.besar);
      if (rawKet && rawKet !== '-') {
        if (!cur.keterangan || cur.keterangan === '-') {
          cur.keterangan = rawKet;
        } else if (!cur.keterangan.toLowerCase().includes(rawKet.toLowerCase())) {
          cur.keterangan = `${cur.keterangan}; ${rawKet}`;
        }
      }
    }
  });

  const mergedSlotsCount = Math.max(0, originalPopulated - map.size);
  const consolidatedList: PlantData[] = [...Array.from(map.values()), ...orphanNotesOnly];

  while (consolidatedList.length < 30) {
    consolidatedList.push({
      jenis: '',
      sudah_menghasilkan: '',
      belum_menghasilkan: '',
      kecil: '',
      sedang: '',
      besar: '',
      keterangan: ''
    });
  }

  return {
    updatedRecord: {
      ...record,
      plants: consolidatedList.slice(0, 30),
      _lastModified: Date.now()
    },
    mergedSlotsCount
  };
}

/**
 * Auto-sum plants by identical kind (jenis) across all categories:
 * sudah_menghasilkan, belum_menghasilkan, kecil, sedang, besar
 */
export function autoSumPlants(plantsA: PlantData[] = [], plantsB: PlantData[] = []): PlantData[] {
  const map = new Map<string, PlantData>();

  const sumValues = (v1: string, v2: string): string => {
    const n1 = parseInt(v1 || '0', 10) || 0;
    const n2 = parseInt(v2 || '0', 10) || 0;
    const total = n1 + n2;
    return total > 0 ? String(total) : '';
  };

  const processPlant = (p: PlantData) => {
    if (!p || !p.jenis || !p.jenis.trim()) return;
    const key = normalizePlantSpeciesKey(p.jenis, false);

    if (!map.has(key)) {
      map.set(key, {
        jenis: p.jenis.trim().toUpperCase(),
        sudah_menghasilkan: p.sudah_menghasilkan || '',
        belum_menghasilkan: p.belum_menghasilkan || '',
        kecil: p.kecil || '',
        sedang: p.sedang || '',
        besar: p.besar || '',
        keterangan: (p.keterangan || '').trim()
      });
    } else {
      const cur = map.get(key)!;
      cur.sudah_menghasilkan = sumValues(cur.sudah_menghasilkan, p.sudah_menghasilkan);
      cur.belum_menghasilkan = sumValues(cur.belum_menghasilkan, p.belum_menghasilkan);
      cur.kecil = sumValues(cur.kecil, p.kecil);
      cur.sedang = sumValues(cur.sedang, p.sedang);
      cur.besar = sumValues(cur.besar, p.besar);
      const nextKet = (p.keterangan || '').trim();
      if (nextKet) {
        if (!cur.keterangan) {
          cur.keterangan = nextKet;
        } else if (!cur.keterangan.toLowerCase().includes(nextKet.toLowerCase())) {
          cur.keterangan = `${cur.keterangan}; ${nextKet}`;
        }
      }
    }
  };

  plantsA.forEach(processPlant);
  plantsB.forEach(processPlant);

  const result: PlantData[] = Array.from(map.values());
  while (result.length < 30) {
    result.push({
      jenis: '',
      sudah_menghasilkan: '',
      belum_menghasilkan: '',
      kecil: '',
      sedang: '',
      besar: '',
      keterangan: ''
    });
  }
  return result.slice(0, 30);
}

/**
 * Auto-join buildings from both parcels
 */
export function autoJoinBuildings(bA: BuildingData[] = [], bB: BuildingData[] = []): BuildingData[] {
  const joined: BuildingData[] = [];

  const add = (b: BuildingData) => {
    if (b && (b.luas?.trim() || b.bentuk?.trim() || b.jenis?.trim())) {
      joined.push({
        luas: b.luas || '',
        bentuk: b.bentuk || '',
        jenis: b.jenis || ''
      });
    }
  };

  bA.forEach(add);
  bB.forEach(add);

  while (joined.length < 8) {
    joined.push({ luas: '', bentuk: '', jenis: '' });
  }
  return joined.slice(0, 8);
}

export interface MergePreviewItem {
  code: string;
  desa: string;
  span: string;
  oldNobid: string;
  newNobid: string;
  status: 'MERGED_RESULT' | 'REMOVED' | 'SHIFTED_DOWN' | 'UNCHANGED';
  reason: string;
}

export interface MergeParcelsOptions {
  recordA: LandRecord;
  recordB: LandRecord;
  keepIdentityFrom: 'A' | 'B';
  customLuas?: number;
  catatanMerge?: string;
}

/**
 * Simulates merge to generate a clear preview of affected parcel numbers.
 * Correctly identifies which record has the lower NOBID (kept as MERGED_RESULT)
 * and which record has the higher NOBID (swallowed/REMOVED) regardless of selection order.
 */
export function previewMergeParcels(
  allRecords: LandRecord[],
  options: MergeParcelsOptions
): {
  mergedNobid: string;
  removedNobid: string;
  previewList: MergePreviewItem[];
  sumLuas: number;
} {
  const { recordA, recordB } = options;
  const pA = parseNobid(recordA.NOBID);
  const pB = parseNobid(recordB.NOBID);
  const padLen = Math.max(pA.padLength, pB.padLength);

  // Determine which record is the lower-numbered anchor and which is the higher-numbered absorbed record
  const isALowerOrEqual = pA.num < pB.num || (pA.num === pB.num && (recordA.NOBID || '') <= (recordB.NOBID || ''));
  const lowerRecord = isALowerOrEqual ? recordA : recordB;
  const higherRecord = isALowerOrEqual ? recordB : recordA;

  const minNum = Math.min(pA.num, pB.num);
  const maxNum = Math.max(pA.num, pB.num);

  const mergedNobid = formatNobid(minNum, '', padLen);
  const removedNobid = higherRecord.NOBID || formatNobid(maxNum, '', padLen);

  const luasA = parseFloat((recordA.LUAS || '0').replace(',', '.')) || 0;
  const luasB = parseFloat((recordB.LUAS || '0').replace(',', '.')) || 0;
  const sumLuas = Math.round((luasA + luasB) * 100) / 100;

  // Relevant scope: same DESA & SPAN
  const targetDesa = (recordA.DESA || '').trim().toUpperCase();
  const targetSpan = (recordA.SPAN || '').trim().toUpperCase();

  const scopeRecords = allRecords.filter(
    r =>
      (r.DESA || '').trim().toUpperCase() === targetDesa &&
      (r.SPAN || '').trim().toUpperCase() === targetSpan
  );

  const previewList: MergePreviewItem[] = [];

  scopeRecords.forEach(r => {
    const isLower = isSameRecord(r, lowerRecord);
    const isHigher = isSameRecord(r, higherRecord);

    if (isLower) {
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: mergedNobid,
        status: 'MERGED_RESULT',
        reason: `Hasil penggabungan Bidang ${lowerRecord.NOBID} dan ${higherRecord.NOBID}`
      });
      return;
    }

    if (isHigher) {
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: '(Dilebur)',
        status: 'REMOVED',
        reason: `Dilebur ke dalam Bidang No. ${mergedNobid}`
      });
      return;
    }

    const { num, suffix, padLength } = parseNobid(r.NOBID);
    const effectivePad = padLength || padLen;

    if (num === maxNum && suffix) {
      // Sub-parcel attached to the removed number follows merged parent
      const newNobid = formatNobid(minNum, suffix, effectivePad);
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid,
        status: 'SHIFTED_DOWN',
        reason: `Sub-bidang mengikuti induk yang dilebur ke No. ${mergedNobid}`
      });
    } else if (num > maxNum) {
      // Shift down by 1 (n-1 rule)
      const newNum = num - 1;
      const newNobid = formatNobid(newNum, suffix, effectivePad);
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid,
        status: 'SHIFTED_DOWN',
        reason: `Mundur 1 nomor (-1) karena Bidang ${removedNobid} dilebur`
      });
    } else {
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: r.NOBID,
        status: 'UNCHANGED',
        reason: 'Nomor tetap (berada di bawah nomor yang dilebur)'
      });
    }
  });

  // Sort preview by old numeric
  previewList.sort((a, b) => {
    const numA = parseNobid(a.oldNobid).num;
    const numB = parseNobid(b.oldNobid).num;
    if (numA !== numB) return numA - numB;
    return a.oldNobid.localeCompare(b.oldNobid);
  });

  return {
    mergedNobid,
    removedNobid,
    previewList,
    sumLuas
  };
}

/**
 * Executes merge parcels and re-indexes all affected parcels in the span/desa.
 * Ensures the lower NOBID position is retained as the merged parcel and the higher NOBID
 * is absorbed, while preserving any existing DRIVE_FOLDER_ID and document links.
 */
export function executeMergeParcels(
  allRecords: LandRecord[],
  options: MergeParcelsOptions
): { updatedRecords: LandRecord[]; logSummary: string } {
  const { recordA, recordB, keepIdentityFrom, customLuas, catatanMerge } = options;

  const pA = parseNobid(recordA.NOBID);
  const pB = parseNobid(recordB.NOBID);
  const padLen = Math.max(pA.padLength, pB.padLength);

  const isALowerOrEqual = pA.num < pB.num || (pA.num === pB.num && (recordA.NOBID || '') <= (recordB.NOBID || ''));
  const lowerRecord = isALowerOrEqual ? recordA : recordB;
  const higherRecord = isALowerOrEqual ? recordB : recordA;

  const minNum = Math.min(pA.num, pB.num);
  const maxNum = Math.max(pA.num, pB.num);

  const mergedNobid = formatNobid(minNum, '', padLen);

  const luasA = parseFloat((recordA.LUAS || '0').replace(',', '.')) || 0;
  const luasB = parseFloat((recordB.LUAS || '0').replace(',', '.')) || 0;
  const finalLuas = customLuas !== undefined ? customLuas : Math.round((luasA + luasB) * 100) / 100;

  const baseRecord = keepIdentityFrom === 'A' ? recordA : recordB;
  const secondaryRecord = keepIdentityFrom === 'A' ? recordB : recordA;

  // 1. Build Merged Record (preserving non-empty DRIVE_FOLDER_ID and document links from secondaryRecord if baseRecord is empty)
  const mergedRecord: LandRecord = {
    ...baseRecord,
    NOBID: mergedNobid,
    LUAS: String(finalLuas),
    DRIVE_FOLDER_ID: (baseRecord.DRIVE_FOLDER_ID || '').trim() || (secondaryRecord.DRIVE_FOLDER_ID || '').trim(),
    LINK_KTP: baseRecord.LINK_KTP || secondaryRecord.LINK_KTP || '',
    LINK_KK: baseRecord.LINK_KK || secondaryRecord.LINK_KK || '',
    LINK_ALAS_HAK: baseRecord.LINK_ALAS_HAK || secondaryRecord.LINK_ALAS_HAK || '',
    LINK_DOKUMENTASI_BIDANG: baseRecord.LINK_DOKUMENTASI_BIDANG || secondaryRecord.LINK_DOKUMENTASI_BIDANG || '',
    LINK_WAJAH_PEMILIK: baseRecord.LINK_WAJAH_PEMILIK || secondaryRecord.LINK_WAJAH_PEMILIK || '',
    buildings: autoJoinBuildings(recordA.buildings, recordB.buildings),
    plants: autoSumPlants(recordA.plants, recordB.plants),
    _lastModified: Date.now()
  };

  const mergeHist = `[Hasil Penggabungan Bidang ${lowerRecord.NOBID} dan ${higherRecord.NOBID}${catatanMerge ? `: ${catatanMerge}` : ''}]`;
  mergedRecord.KETERANGAN = mergedRecord.KETERANGAN
    ? `${mergedRecord.KETERANGAN}; ${mergeHist}`
    : mergeHist;

  // Recompute CODE and ID_UNIK for merged record
  mergedRecord.CODE = buildConsistentParcelCode(mergedRecord.DESA, mergedRecord.SPAN, mergedNobid, lowerRecord.CODE);
  mergedRecord.ID_UNIK = `ID-${mergedRecord.CODE.replace(/[\s-]/g, '_')}`;

  const targetDesa = (recordA.DESA || '').trim().toUpperCase();
  const targetSpan = (recordA.SPAN || '').trim().toUpperCase();

  // 2. Iterate all records: replace lowerRecord with merged, remove higherRecord, shift > maxNum down by 1
  const updatedRecords: LandRecord[] = [];
  let hasInsertedMerged = false;

  allRecords.forEach(r => {
    const isLower = isSameRecord(r, lowerRecord);
    const isHigher = isSameRecord(r, higherRecord);

    if (isLower) {
      if (!hasInsertedMerged) {
        updatedRecords.push(mergedRecord);
        hasInsertedMerged = true;
      }
      return;
    }

    if (isHigher) {
      // Omit higherRecord (swallowed into mergedRecord)
      return;
    }

    const rDesa = (r.DESA || '').trim().toUpperCase();
    const rSpan = (r.SPAN || '').trim().toUpperCase();

    // If outside this span/desa, keep untouched
    if (rDesa !== targetDesa || rSpan !== targetSpan) {
      updatedRecords.push(r);
      return;
    }

    const { num, suffix, padLength } = parseNobid(r.NOBID);
    const effectivePad = padLength || padLen;

    if (num === maxNum && suffix) {
      // Sub-parcel attached to the removed number moves to merged parent
      const newNobid = formatNobid(minNum, suffix, effectivePad);
      const newCode = buildConsistentParcelCode(r.DESA, r.SPAN, newNobid, r.CODE);
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`,
        _lastModified: Date.now()
      });
    } else if (num > maxNum) {
      // Shift down by 1
      const newNum = num - 1;
      const newNobid = formatNobid(newNum, suffix, effectivePad);
      const newCode = buildConsistentParcelCode(r.DESA, r.SPAN, newNobid, r.CODE);
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`,
        _lastModified: Date.now()
      });
    } else {
      updatedRecords.push(r);
    }
  });

  if (!hasInsertedMerged) {
    updatedRecords.push(mergedRecord);
  }

  const logSummary = `Penggabungan Bidang: No. ${lowerRecord.NOBID} (${lowerRecord.NAMA || '-'}) dan No. ${higherRecord.NOBID} (${higherRecord.NAMA || '-'}) menjadi No. ${mergedNobid} di Desa ${targetDesa} Span ${targetSpan}. Penomoran bidang di atasnya disesuaikan otomatis (n-1).`;

  return { updatedRecords, logSummary };
}

export interface SplitPartInput {
  luas: number;
  nama: string;
  nik?: string;
  keterangan?: string;
}

export interface SplitParcelOptions {
  plantAllocationMode?: 'KEEP_ON_PART_1' | 'COPY_TO_ALL_PARTS';
}

export interface SplitPreviewItem {
  code: string;
  desa: string;
  span: string;
  oldNobid: string;
  newNobid: string;
  status: 'SPLIT_PART_1' | 'SPLIT_NEW_PART' | 'SHIFTED_UP' | 'UNCHANGED';
  reason: string;
}

/**
 * Simulates split parcel to generate preview list of affected parcel numbers.
 */
export function previewSplitParcel(
  allRecords: LandRecord[],
  targetRecord: LandRecord,
  parts: SplitPartInput[]
): {
  previewList: SplitPreviewItem[];
  insertedCount: number;
} {
  const pTarget = parseNobid(targetRecord.NOBID);
  const splitNum = pTarget.num;
  const padLen = pTarget.padLength;
  const insertedCount = Math.max(0, parts.length - 1);

  const targetDesa = (targetRecord.DESA || '').trim().toUpperCase();
  const targetSpan = (targetRecord.SPAN || '').trim().toUpperCase();

  const scopeRecords = allRecords.filter(
    r =>
      (r.DESA || '').trim().toUpperCase() === targetDesa &&
      (r.SPAN || '').trim().toUpperCase() === targetSpan
  );

  const previewList: SplitPreviewItem[] = [];

  scopeRecords.forEach(r => {
    const isTarget = isSameRecord(r, targetRecord);

    if (isTarget) {
      const part1Nobid = formatNobid(splitNum, '', padLen);
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: part1Nobid,
        status: 'SPLIT_PART_1',
        reason: `Bagian 1 hasil pemecahan (tetap No. ${part1Nobid})`
      });

      for (let i = 1; i < parts.length; i++) {
        const assignedNum = splitNum + i;
        const assignedNobid = formatNobid(assignedNum, '', padLen);
        previewList.push({
          code: `NEW_PART_${i}`,
          desa: r.DESA,
          span: r.SPAN,
          oldNobid: '-',
          newNobid: assignedNobid,
          status: 'SPLIT_NEW_PART',
          reason: `Bagian ${i + 1} baru hasil pemecahan (${parts[i]?.nama || 'Pemilik Baru'})`
        });
      }
      return;
    }

    const { num, suffix, padLength } = parseNobid(r.NOBID);
    const effectivePad = padLength || padLen;

    if (num <= splitNum) {
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: r.NOBID,
        status: 'UNCHANGED',
        reason: 'Nomor tetap (di bawah/sama dengan bidang yang dipecah)'
      });
    } else {
      const newNum = num + insertedCount;
      const newNobid = formatNobid(newNum, suffix, effectivePad);
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid,
        status: 'SHIFTED_UP',
        reason: `Maju ${insertedCount} nomor (+${insertedCount}) karena disisipkan pecahan bidang`
      });
    }
  });

  previewList.sort((a, b) => {
    const numA = a.newNobid.match(/\d+/) ? parseInt(a.newNobid.match(/\d+/)![0], 10) : 0;
    const numB = b.newNobid.match(/\d+/) ? parseInt(b.newNobid.match(/\d+/)![0], 10) : 0;
    if (numA !== numB) return numA - numB;
    return a.newNobid.localeCompare(b.newNobid);
  });

  return { previewList, insertedCount };
}

/**
 * Executes split parcel into multiple pieces and shifts subsequent parcels +N.
 */
export function executeSplitParcel(
  allRecords: LandRecord[],
  targetRecord: LandRecord,
  parts: SplitPartInput[],
  options?: SplitParcelOptions
): { updatedRecords: LandRecord[]; logSummary: string } {
  if (parts.length < 2) {
    throw new Error('Pecah bidang minimal harus menghasilkan 2 bagian.');
  }

  const plantAllocationMode = options?.plantAllocationMode || 'KEEP_ON_PART_1';
  const pTarget = parseNobid(targetRecord.NOBID);
  const splitNum = pTarget.num;
  const padLen = pTarget.padLength;
  const insertedCount = parts.length - 1;

  const targetDesa = (targetRecord.DESA || '').trim().toUpperCase();
  const targetSpan = (targetRecord.SPAN || '').trim().toUpperCase();

  // 1. Prepare Part 1 (updates targetRecord)
  const part1Input = parts[0];
  const part1Nobid = formatNobid(splitNum, '', padLen);
  const part1Code = buildConsistentParcelCode(targetRecord.DESA, targetRecord.SPAN, part1Nobid, targetRecord.CODE);
  const part1Record: LandRecord = {
    ...targetRecord,
    NOBID: part1Nobid,
    CODE: part1Code,
    ID_UNIK: `ID-${part1Code.replace(/[\s-]/g, '_')}`,
    LUAS: String(part1Input.luas ?? 0),
    NAMA: part1Input.nama || targetRecord.NAMA || '',
    NIK: part1Input.nik !== undefined ? part1Input.nik : (targetRecord.NIK || ''),
    KETERANGAN: targetRecord.KETERANGAN
      ? `${targetRecord.KETERANGAN}; [Bagian 1 pecahan Bidang ${targetRecord.NOBID}${part1Input.keterangan ? `: ${part1Input.keterangan}` : ''}]`
      : `[Bagian 1 pecahan Bidang ${targetRecord.NOBID}${part1Input.keterangan ? `: ${part1Input.keterangan}` : ''}]`,
    _lastModified: Date.now()
  };

  // 2. Prepare Additional Parts (New Records)
  const newPartRecords: LandRecord[] = [];
  for (let i = 1; i < parts.length; i++) {
    const assignedNum = splitNum + i;
    const assignedNobid = formatNobid(assignedNum, '', padLen);
    const pInput = parts[i];

    const newCode = buildConsistentParcelCode(targetRecord.DESA, targetRecord.SPAN, assignedNobid, targetRecord.CODE);
    const baseEmpty = createEmptyRecord();

    const newRec: LandRecord = {
      ...baseEmpty,
      CODE: newCode,
      ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`,
      DESA: targetRecord.DESA,
      SPAN: targetRecord.SPAN,
      NOBID: assignedNobid,
      LUAS: String(pInput.luas ?? 0),
      NAMA: pInput.nama || '',
      NIK: pInput.nik || '',
      STATUS_KEPEMILIKAN: targetRecord.STATUS_KEPEMILIKAN || 'MILIK SENDIRI',
      PENUTUP_LAHAN: targetRecord.PENUTUP_LAHAN || 'PERKEBUNAN',
      STATUS_PENUTUP_LAHAN: targetRecord.STATUS_PENUTUP_LAHAN || '',
      KECAMATAN: targetRecord.KECAMATAN || '',
      KABUPATEN: targetRecord.KABUPATEN || '',
      STATUS_DESA: targetRecord.STATUS_DESA || '',
      STATUS_KEPALA: targetRecord.STATUS_KEPALA || '',
      NAMA_KADES: targetRecord.NAMA_KADES || '',
      NAMA_SAKSI_1: targetRecord.NAMA_SAKSI_1 || '',
      NAMA_SAKSI_2: targetRecord.NAMA_SAKSI_2 || '',
      nama_tim_1: targetRecord.nama_tim_1 || '',
      nama_tim_2: targetRecord.nama_tim_2 || '',
      TANGGAL_PELAKSANAAN: targetRecord.TANGGAL_PELAKSANAAN || '',
      BATAS_UTARA: targetRecord.BATAS_UTARA || '',
      BATAS_SELATAN: targetRecord.BATAS_SELATAN || '',
      BATAS_TIMUR: targetRecord.BATAS_TIMUR || '',
      BATAS_BARAT: targetRecord.BATAS_BARAT || '',
      plants:
        plantAllocationMode === 'COPY_TO_ALL_PARTS' && targetRecord.plants
          ? targetRecord.plants.map(p => ({ ...p }))
          : baseEmpty.plants,
      buildings:
        plantAllocationMode === 'COPY_TO_ALL_PARTS' && targetRecord.buildings
          ? targetRecord.buildings.map(b => ({ ...b }))
          : baseEmpty.buildings,
      QC_STATUS: 'PENDING',
      KETERANGAN: `[Bagian ${i + 1} pecahan dari Bidang ${targetRecord.NOBID}${pInput.keterangan ? `: ${pInput.keterangan}` : ''}]`,
      _lastModified: Date.now()
    };

    newPartRecords.push(newRec);
  }

  // 3. Re-assemble all records
  const updatedRecords: LandRecord[] = [];
  let hasInsertedSplit = false;

  allRecords.forEach(r => {
    const isTarget = isSameRecord(r, targetRecord);

    if (isTarget) {
      if (!hasInsertedSplit) {
        updatedRecords.push(part1Record);
        newPartRecords.forEach(np => updatedRecords.push(np));
        hasInsertedSplit = true;
      }
      return;
    }

    const rDesa = (r.DESA || '').trim().toUpperCase();
    const rSpan = (r.SPAN || '').trim().toUpperCase();

    if (rDesa !== targetDesa || rSpan !== targetSpan) {
      updatedRecords.push(r);
      return;
    }

    const { num, suffix, padLength } = parseNobid(r.NOBID);
    const effectivePad = padLength || padLen;

    if (num <= splitNum) {
      updatedRecords.push(r);
    } else {
      const newNum = num + insertedCount;
      const newNobid = formatNobid(newNum, suffix, effectivePad);
      const newCode = buildConsistentParcelCode(r.DESA, r.SPAN, newNobid, r.CODE);
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`,
        _lastModified: Date.now()
      });
    }
  });

  if (!hasInsertedSplit) {
    updatedRecords.push(part1Record);
    newPartRecords.forEach(np => updatedRecords.push(np));
  }

  const logSummary = `Pecah Bidang: No. ${targetRecord.NOBID} (${targetRecord.NAMA || '-'}) dipecah menjadi ${parts.length} bagian (No. ${formatNobid(splitNum, '', padLen)} s.d. ${formatNobid(splitNum + insertedCount, '', padLen)}) di Desa ${targetDesa} Span ${targetSpan}. Penomoran bidang di atasnya disesuaikan (+${insertedCount}).`;

  return { updatedRecords, logSummary };
}

/**
 * Options for deleting a parcel
 */
export interface DeleteParcelOptions {
  targetRecord: LandRecord;
  adjustNextParcels?: boolean;
}

/**
 * Previews which parcels will be affected if a parcel is deleted
 */
export function previewDeleteParcel(
  allRecords: LandRecord[],
  targetRecord: LandRecord,
  adjustNextParcels: boolean = true
): {
  impactedParcels: { oldNobid: string; newNobid: string; nama: string; code: string }[];
  targetNobid: string;
  desa: string;
  span: string;
} {
  const targetDesa = (targetRecord.DESA || '').trim().toUpperCase();
  const targetSpan = (targetRecord.SPAN || '').trim().toUpperCase();
  const { num: targetNum, padLength: targetPad } = parseNobid(targetRecord.NOBID);

  const impactedParcels: { oldNobid: string; newNobid: string; nama: string; code: string }[] = [];

  if (adjustNextParcels) {
    allRecords.forEach(r => {
      if (isSameRecord(r, targetRecord)) {
        return;
      }
      const rDesa = (r.DESA || '').trim().toUpperCase();
      const rSpan = (r.SPAN || '').trim().toUpperCase();
      if (rDesa !== targetDesa || rSpan !== targetSpan) return;

      const { num, suffix, padLength } = parseNobid(r.NOBID);
      const effectivePad = padLength || targetPad;
      if (num > targetNum) {
        const newNum = num - 1;
        impactedParcels.push({
          oldNobid: r.NOBID,
          newNobid: formatNobid(newNum, suffix, effectivePad),
          nama: r.NAMA || '(Tanpa Nama)',
          code: r.CODE
        });
      }
    });

    impactedParcels.sort((a, b) => {
      const numA = parseNobid(a.oldNobid).num;
      const numB = parseNobid(b.oldNobid).num;
      return numA - numB;
    });
  }

  return {
    impactedParcels,
    targetNobid: targetRecord.NOBID,
    desa: targetDesa,
    span: targetSpan
  };
}

/**
 * Executes parcel deletion by removing the target record and optionally
 * renumbering all subsequent parcels in the same span and desa down by 1 (n-1).
 */
export function executeDeleteParcel(
  allRecords: LandRecord[],
  options: DeleteParcelOptions
): { updatedRecords: LandRecord[]; logSummary: string } {
  const { targetRecord, adjustNextParcels = true } = options;
  const targetDesa = (targetRecord.DESA || '').trim().toUpperCase();
  const targetSpan = (targetRecord.SPAN || '').trim().toUpperCase();
  const { num: targetNum, padLength: targetPad } = parseNobid(targetRecord.NOBID);

  const updatedRecords: LandRecord[] = [];
  let shiftedCount = 0;

  allRecords.forEach(r => {
    if (isSameRecord(r, targetRecord)) {
      return;
    }

    const rDesa = (r.DESA || '').trim().toUpperCase();
    const rSpan = (r.SPAN || '').trim().toUpperCase();

    if (rDesa !== targetDesa || rSpan !== targetSpan || !adjustNextParcels) {
      updatedRecords.push(r);
      return;
    }

    const { num, suffix, padLength } = parseNobid(r.NOBID);
    const effectivePad = padLength || targetPad;

    if (num > targetNum) {
      const newNum = num - 1;
      const newNobid = formatNobid(newNum, suffix, effectivePad);
      const newCode = buildConsistentParcelCode(r.DESA, r.SPAN, newNobid, r.CODE);
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`,
        _lastModified: Date.now()
      });
      shiftedCount++;
    } else {
      updatedRecords.push(r);
    }
  });

  const logSummary = `Hapus Bidang (Admin): No. ${targetRecord.NOBID} (${targetRecord.NAMA || '-'}) di Desa ${targetDesa} Span ${targetSpan} berhasil dihapus.${
    adjustNextParcels && shiftedCount > 0
      ? ` Penomoran ${shiftedCount} bidang setelahnya otomatis disesuaikan mundur (n-1).`
      : ''
  }`;

  return { updatedRecords, logSummary };
}
