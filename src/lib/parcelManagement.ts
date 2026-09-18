import { LandRecord, BuildingData, PlantData, createEmptyRecord } from '../types';

/**
 * Parses NOBID into numeric parent number and optional letter suffix.
 * Examples:
 *   "3"   -> { num: 3, suffix: "" }
 *   "3A"  -> { num: 3, suffix: "A" }
 *   "14B" -> { num: 14, suffix: "B" }
 */
export function parseNobid(nobidStr: string): { num: number; suffix: string } {
  const clean = (nobidStr || '').trim();
  const match = clean.match(/^(\d+)([a-zA-Z]*)$/);
  if (match) {
    return {
      num: parseInt(match[1], 10),
      suffix: match[2].toUpperCase()
    };
  }
  const fallbackNum = parseInt(clean.replace(/\D/g, ''), 10) || 0;
  const fallbackSuffix = clean.replace(/[\d\s]/g, '').toUpperCase();
  return { num: fallbackNum, suffix: fallbackSuffix };
}

/**
 * Formats numeric parent and suffix back to NOBID string.
 */
export function formatNobid(num: number, suffix: string = ''): string {
  return `${num}${suffix.toUpperCase()}`;
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
    const key = p.jenis.trim().toUpperCase();

    if (!map.has(key)) {
      map.set(key, {
        jenis: p.jenis.trim(),
        sudah_menghasilkan: p.sudah_menghasilkan || '',
        belum_menghasilkan: p.belum_menghasilkan || '',
        kecil: p.kecil || '',
        sedang: p.sedang || '',
        besar: p.besar || ''
      });
    } else {
      const cur = map.get(key)!;
      cur.sudah_menghasilkan = sumValues(cur.sudah_menghasilkan, p.sudah_menghasilkan);
      cur.belum_menghasilkan = sumValues(cur.belum_menghasilkan, p.belum_menghasilkan);
      cur.kecil = sumValues(cur.kecil, p.kecil);
      cur.sedang = sumValues(cur.sedang, p.sedang);
      cur.besar = sumValues(cur.besar, p.besar);
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
      besar: ''
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

  const minNum = Math.min(pA.num, pB.num);
  const maxNum = Math.max(pA.num, pB.num);

  const mergedNobid = String(minNum);
  const removedNobid = String(maxNum);

  const luasA = parseFloat((recordA.LUAS || '0').replace(',', '.')) || 0;
  const luasB = parseFloat((recordB.LUAS || '0').replace(',', '.')) || 0;
  const sumLuas = Math.round((luasA + luasB) * 100) / 100;

  // Relevant scope: same DESA & SPAN
  const targetDesa = (recordA.DESA || '').trim().toUpperCase();
  const targetSpan = (recordA.SPAN || '').trim().toUpperCase();

  const scopeRecords = allRecords.filter(r => 
    (r.DESA || '').trim().toUpperCase() === targetDesa &&
    (r.SPAN || '').trim().toUpperCase() === targetSpan
  );

  const previewList: MergePreviewItem[] = [];

  scopeRecords.forEach(r => {
    const isA = r.CODE === recordA.CODE || r.ID_UNIK === recordA.ID_UNIK;
    const isB = r.CODE === recordB.CODE || r.ID_UNIK === recordB.ID_UNIK;

    if (isA) {
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: mergedNobid,
        status: 'MERGED_RESULT',
        reason: `Hasil penggabungan Bidang ${recordA.NOBID} dan ${recordB.NOBID}`
      });
      return;
    }

    if (isB) {
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: '(Dilebur)',
        status: 'REMOVED',
        reason: `Dilebur ke dalam Bidang ${mergedNobid}`
      });
      return;
    }

    const { num, suffix } = parseNobid(r.NOBID);

    if (num === maxNum && suffix) {
      // Sub-parcel attached to the removed number follows merged parent
      const newNobid = formatNobid(minNum, suffix);
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid,
        status: 'SHIFTED_DOWN',
        reason: `Sub-bidang mengikuti induk yang dilebur ke No. ${minNum}`
      });
    } else if (num > maxNum) {
      // Shift down by 1 (n+1 rule)
      const newNum = num - 1;
      const newNobid = formatNobid(newNum, suffix);
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid,
        status: 'SHIFTED_DOWN',
        reason: `Mundur 1 nomor karena Bidang ${maxNum} dilebur`
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
 */
export function executeMergeParcels(
  allRecords: LandRecord[],
  options: MergeParcelsOptions
): { updatedRecords: LandRecord[]; logSummary: string } {
  const { recordA, recordB, keepIdentityFrom, customLuas, catatanMerge } = options;

  const pA = parseNobid(recordA.NOBID);
  const pB = parseNobid(recordB.NOBID);
  const minNum = Math.min(pA.num, pB.num);
  const maxNum = Math.max(pA.num, pB.num);

  const mergedNobid = String(minNum);

  const luasA = parseFloat((recordA.LUAS || '0').replace(',', '.')) || 0;
  const luasB = parseFloat((recordB.LUAS || '0').replace(',', '.')) || 0;
  const finalLuas = customLuas !== undefined ? customLuas : Math.round((luasA + luasB) * 100) / 100;

  const baseRecord = keepIdentityFrom === 'A' ? recordA : recordB;
  const otherRecord = keepIdentityFrom === 'A' ? recordB : recordA;

  // 1. Build Merged Record
  const mergedRecord: LandRecord = {
    ...baseRecord,
    NOBID: mergedNobid,
    LUAS: String(finalLuas),
    buildings: autoJoinBuildings(recordA.buildings, recordB.buildings),
    plants: autoSumPlants(recordA.plants, recordB.plants)
  };

  const mergeHist = `[Hasil Penggabungan Bidang ${recordA.NOBID} dan ${recordB.NOBID}${catatanMerge ? `: ${catatanMerge}` : ''}]`;
  mergedRecord.KETERANGAN = mergedRecord.KETERANGAN 
    ? `${mergedRecord.KETERANGAN}; ${mergeHist}` 
    : mergeHist;

  // Recompute CODE and ID_UNIK for merged record
  const cleanDesa = (mergedRecord.DESA || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
  const cleanSpan = (mergedRecord.SPAN || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
  mergedRecord.CODE = `${cleanDesa}_${cleanSpan}_${mergedNobid}`;
  mergedRecord.ID_UNIK = `ID-${mergedRecord.CODE.replace(/[\s-]/g, '_')}`;

  const targetDesa = (recordA.DESA || '').trim().toUpperCase();
  const targetSpan = (recordA.SPAN || '').trim().toUpperCase();

  // 2. Iterate all records: replace A with merged, remove B, shift > maxNum down by 1
  const updatedRecords: LandRecord[] = [];

  allRecords.forEach(r => {
    const isA = r.CODE === recordA.CODE || (r.ID_UNIK && r.ID_UNIK === recordA.ID_UNIK);
    const isB = r.CODE === recordB.CODE || (r.ID_UNIK && r.ID_UNIK === recordB.ID_UNIK);

    if (isA) {
      updatedRecords.push(mergedRecord);
      return;
    }

    if (isB) {
      // Omit B (it's removed / swallowed into mergedRecord)
      return;
    }

    const rDesa = (r.DESA || '').trim().toUpperCase();
    const rSpan = (r.SPAN || '').trim().toUpperCase();

    // If outside this span/desa, keep untouched
    if (rDesa !== targetDesa || rSpan !== targetSpan) {
      updatedRecords.push(r);
      return;
    }

    const { num, suffix } = parseNobid(r.NOBID);

    if (num === maxNum && suffix) {
      // Sub-parcel attached to the removed number moves to merged parent
      const newNobid = formatNobid(minNum, suffix);
      const newCode = `${cleanDesa}_${cleanSpan}_${newNobid}`;
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`
      });
    } else if (num > maxNum) {
      // Shift down by 1
      const newNum = num - 1;
      const newNobid = formatNobid(newNum, suffix);
      const newCode = `${cleanDesa}_${cleanSpan}_${newNobid}`;
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`
      });
    } else {
      updatedRecords.push(r);
    }
  });

  const logSummary = `Penggabungan Bidang: No. ${recordA.NOBID} (${recordA.NAMA || '-'}) dan No. ${recordB.NOBID} (${recordB.NAMA || '-'}) menjadi No. ${mergedNobid} di Desa ${targetDesa} Span ${targetSpan}. Penomoran bidang di atasnya disesuaikan n+1.`;

  return { updatedRecords, logSummary };
}

export interface SplitPartInput {
  luas: number;
  nama: string;
  nik?: string;
  keterangan?: string;
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
  const splitNum = pTarget.num; // e.g. 3
  const insertedCount = Math.max(0, parts.length - 1); // e.g. 2 parts -> 1 inserted (+1 shift)

  const targetDesa = (targetRecord.DESA || '').trim().toUpperCase();
  const targetSpan = (targetRecord.SPAN || '').trim().toUpperCase();

  const scopeRecords = allRecords.filter(r => 
    (r.DESA || '').trim().toUpperCase() === targetDesa &&
    (r.SPAN || '').trim().toUpperCase() === targetSpan
  );

  const previewList: SplitPreviewItem[] = [];

  scopeRecords.forEach(r => {
    const isTarget = r.CODE === targetRecord.CODE || (r.ID_UNIK && r.ID_UNIK === targetRecord.ID_UNIK);

    if (isTarget) {
      // Part 1 keeps splitNum
      previewList.push({
        code: r.CODE,
        desa: r.DESA,
        span: r.SPAN,
        oldNobid: r.NOBID,
        newNobid: String(splitNum),
        status: 'SPLIT_PART_1',
        reason: `Bagian 1 hasil pemecahan (tetap No. ${splitNum})`
      });

      // New parts preview
      for (let i = 1; i < parts.length; i++) {
        const assignedNum = splitNum + i;
        previewList.push({
          code: `NEW_PART_${i}`,
          desa: r.DESA,
          span: r.SPAN,
          oldNobid: '-',
          newNobid: String(assignedNum),
          status: 'SPLIT_NEW_PART',
          reason: `Bagian ${i + 1} baru hasil pemecahan`
        });
      }
      return;
    }

    const { num, suffix } = parseNobid(r.NOBID);

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
      // num > splitNum: shift UP by insertedCount!
      const newNum = num + insertedCount;
      const newNobid = formatNobid(newNum, suffix);
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

  // Sort preview by numeric
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
  parts: SplitPartInput[]
): { updatedRecords: LandRecord[]; logSummary: string } {
  if (parts.length < 2) {
    throw new Error('Pecah bidang minimal harus menghasilkan 2 bagian.');
  }

  const pTarget = parseNobid(targetRecord.NOBID);
  const splitNum = pTarget.num;
  const insertedCount = parts.length - 1;

  const targetDesa = (targetRecord.DESA || '').trim().toUpperCase();
  const targetSpan = (targetRecord.SPAN || '').trim().toUpperCase();
  const cleanDesa = targetDesa.replace(/[\s\/\\?%*:|"]/g, '_');
  const cleanSpan = targetSpan.replace(/[\s\/\\?%*:|"]/g, '_');

  // 1. Prepare Part 1 (updates targetRecord)
  const part1Input = parts[0];
  const part1Record: LandRecord = {
    ...targetRecord,
    NOBID: String(splitNum),
    LUAS: String(part1Input.luas),
    KETERANGAN: targetRecord.KETERANGAN 
      ? `${targetRecord.KETERANGAN}; [Bagian 1 pecahan Bidang ${targetRecord.NOBID}${part1Input.keterangan ? `: ${part1Input.keterangan}` : ''}]`
      : `[Bagian 1 pecahan Bidang ${targetRecord.NOBID}${part1Input.keterangan ? `: ${part1Input.keterangan}` : ''}]`
  };
  part1Record.CODE = `${cleanDesa}_${cleanSpan}_${splitNum}`;
  part1Record.ID_UNIK = `ID-${part1Record.CODE.replace(/[\s-]/g, '_')}`;

  // 2. Prepare Additional Parts (New Records)
  const newPartRecords: LandRecord[] = [];
  for (let i = 1; i < parts.length; i++) {
    const assignedNum = splitNum + i;
    const assignedNobid = String(assignedNum);
    const pInput = parts[i];

    const newCode = `${cleanDesa}_${cleanSpan}_${assignedNobid}`;
    const newRec: LandRecord = {
      ...createEmptyRecord(),
      CODE: newCode,
      ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`,
      DESA: targetRecord.DESA,
      SPAN: targetRecord.SPAN,
      NOBID: assignedNobid,
      LUAS: String(pInput.luas),
      NAMA: pInput.nama || '',
      NIK: pInput.nik || '',
      STATUS_KEPEMILIKAN: targetRecord.STATUS_KEPEMILIKAN || 'MILIK SENDIRI',
      PENUTUP_LAHAN: targetRecord.PENUTUP_LAHAN || 'PERKEBUNAN',
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
      QC_STATUS: 'PENDING',
      KETERANGAN: `[Bagian ${i + 1} pecahan dari Bidang ${targetRecord.NOBID}${pInput.keterangan ? `: ${pInput.keterangan}` : ''}]`
    };

    newPartRecords.push(newRec);
  }

  // 3. Re-assemble all records
  const updatedRecords: LandRecord[] = [];

  allRecords.forEach(r => {
    const isTarget = r.CODE === targetRecord.CODE || (r.ID_UNIK && r.ID_UNIK === targetRecord.ID_UNIK);

    if (isTarget) {
      updatedRecords.push(part1Record);
      newPartRecords.forEach(np => updatedRecords.push(np));
      return;
    }

    const rDesa = (r.DESA || '').trim().toUpperCase();
    const rSpan = (r.SPAN || '').trim().toUpperCase();

    if (rDesa !== targetDesa || rSpan !== targetSpan) {
      updatedRecords.push(r);
      return;
    }

    const { num, suffix } = parseNobid(r.NOBID);

    if (num <= splitNum) {
      // Unchanged (including any sub-parcels of splitNum like 3A, 3B)
      updatedRecords.push(r);
    } else {
      // Shift UP by insertedCount
      const newNum = num + insertedCount;
      const newNobid = formatNobid(newNum, suffix);
      const newCode = `${cleanDesa}_${cleanSpan}_${newNobid}`;
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`
      });
    }
  });

  const logSummary = `Pecah Bidang: No. ${targetRecord.NOBID} (${targetRecord.NAMA || '-'}) dipecah menjadi ${parts.length} bagian (No. ${splitNum} s.d. ${splitNum + insertedCount}) di Desa ${targetDesa} Span ${targetSpan}. Penomoran bidang di atasnya disesuaikan (+${insertedCount}).`;

  return { updatedRecords, logSummary };
}

/**
 * Options for deleting a parcel
 */
export interface DeleteParcelOptions {
  targetRecord: LandRecord;
  adjustNextParcels?: boolean; // Default true: shift subsequent parcels down (n-1)
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
  const { num: targetNum } = parseNobid(targetRecord.NOBID);

  const impactedParcels: { oldNobid: string; newNobid: string; nama: string; code: string }[] = [];

  if (adjustNextParcels) {
    allRecords.forEach(r => {
      if (r.CODE === targetRecord.CODE || (r.ID_UNIK && r.ID_UNIK === targetRecord.ID_UNIK)) {
        return;
      }
      const rDesa = (r.DESA || '').trim().toUpperCase();
      const rSpan = (r.SPAN || '').trim().toUpperCase();
      if (rDesa !== targetDesa || rSpan !== targetSpan) return;

      const { num, suffix } = parseNobid(r.NOBID);
      if (num > targetNum) {
        const newNum = num - 1;
        impactedParcels.push({
          oldNobid: r.NOBID,
          newNobid: formatNobid(newNum, suffix),
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
  const cleanDesa = targetDesa.replace(/[\s-]/g, '_');
  const cleanSpan = targetSpan.replace(/[\s-]/g, '_');
  const { num: targetNum } = parseNobid(targetRecord.NOBID);

  const updatedRecords: LandRecord[] = [];
  let shiftedCount = 0;

  allRecords.forEach(r => {
    // Exclude the target record to delete it
    if (r.CODE === targetRecord.CODE || (r.ID_UNIK && r.ID_UNIK === targetRecord.ID_UNIK)) {
      return;
    }

    const rDesa = (r.DESA || '').trim().toUpperCase();
    const rSpan = (r.SPAN || '').trim().toUpperCase();

    if (rDesa !== targetDesa || rSpan !== targetSpan || !adjustNextParcels) {
      updatedRecords.push(r);
      return;
    }

    const { num, suffix } = parseNobid(r.NOBID);

    if (num > targetNum) {
      // Shift DOWN by 1
      const newNum = num - 1;
      const newNobid = formatNobid(newNum, suffix);
      const newCode = `${cleanDesa}_${cleanSpan}_${newNobid}`;
      updatedRecords.push({
        ...r,
        NOBID: newNobid,
        CODE: newCode,
        ID_UNIK: `ID-${newCode.replace(/[\s-]/g, '_')}`
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
