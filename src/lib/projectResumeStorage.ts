import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  limit,
  onSnapshot 
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { fetchResumesFromGoogleSheet, saveVillageResumeToSheet, saveAgencyLetterToSheet } from './googleApi';
import type { VillageResume, AgencyLetter, VillageStageDoc, StageStatus, LandRecord, ProjectConfig } from '../types';
import { DEFAULT_RESUME_STAGES } from '../types';

/**
 * Remove undefined values recursively before saving to Firestore
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return null as any;
  if (Array.isArray(data)) {
    return data.map(sanitizeForFirestore) as any;
  }
  if (typeof data === 'object') {
    const clean: any = {};
    for (const [key, value] of Object.entries(data as any)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean;
  }
  return data;
}

export const createEmptyStageDoc = (status: StageStatus = 'BELUM'): VillageStageDoc => ({
  status,
  pdfUrl: undefined,
  pdfName: undefined,
  docPhotos: [],
  date: '',
  notes: ''
});

export const createDefaultVillageResume = (
  projectId: string,
  desaName: string,
  kecamatan = '',
  kabupaten = '',
  extra?: Partial<VillageResume>
): VillageResume => {
  const cleanDesa = desaName.trim().toUpperCase();
  const id = `${projectId}_${cleanDesa.replace(/[^a-zA-Z0-9]/g, '_')}`;
  return {
    id,
    projectId,
    desaName: cleanDesa,
    kecamatan,
    kabupaten,
    targetSpan: extra?.targetSpan,
    daftarSpan: extra?.daftarSpan || '',
    estimasiBidangAwal: extra?.estimasiBidangAwal,
    jadwalMulai: extra?.jadwalMulai || '',
    jadwalSelesai: extra?.jadwalSelesai || '',
    namaKades: extra?.namaKades || '',
    namaCamat: extra?.namaCamat || '',
    namaPjt: extra?.namaPjt || '',
    okupasiPjt: extra?.okupasiPjt || 'Analis Utama / Teknisi Utama',
    noSertifikatPjt: extra?.noSertifikatPjt || '',
    pendataanAwal: extra?.pendataanAwal || createEmptyStageDoc(),
    baSosialisasiAwal: extra?.baSosialisasiAwal || createEmptyStageDoc(),
    surveiPemetaan: extra?.surveiPemetaan || createEmptyStageDoc(),
    inventarisasiNominatif: extra?.inventarisasiNominatif || createEmptyStageDoc(),
    baPengumuman: extra?.baPengumuman || createEmptyStageDoc(),
    lampiranBapt: extra?.lampiranBapt || createEmptyStageDoc(),
    registrasiBapt: extra?.registrasiBapt || createEmptyStageDoc(),
    baPenyampaianNilai: extra?.baPenyampaianNilai || createEmptyStageDoc(),
    baSerahTerimaRekening: extra?.baSerahTerimaRekening || createEmptyStageDoc(),
    bushClearing: extra?.bushClearing || createEmptyStageDoc(),
    lastUpdated: Date.now(),
    updatedBy: extra?.updatedBy || 'Sistem'
  };
};

const VILLAGE_CACHE_PREFIX = 'project_ventura_village_resumes_';
const LETTERS_CACHE_PREFIX = 'project_ventura_agency_letters_';

// Safety wrapper so Firestore promises (network lag, offline, or rule delays) never hang indefinitely
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Operasi Firestore melebihi batas waktu (timeout)')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// ----------------- IMAGE COMPRESSION HELPER -----------------

/**
 * Compress image before storing locally or to Firestore to avoid exceeding 1MB limit
 */
export function compressImageFile(file: File, maxWidth = 1000, maxHeight = 1000, quality = 0.65): Promise<string> {
  return new Promise((resolve) => {
    // If not an image, fallback to standard reader
    if (!file.type.startsWith('image/')) {
      fileToBase64(file).then(resolve).catch(() => resolve(''));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = () => resolve(event.target?.result as string);
    };
    reader.onerror = () => resolve('');
  });
}

// ----------------- VILLAGE RESUME FUNCTIONS -----------------

export async function loadVillageResumes(
  projectId: string,
  googleContext?: { accessToken?: string; spreadsheetId?: string }
): Promise<VillageResume[]> {
  // 1. Immediately read from LocalStorage cache (fastest response, no network latency)
  let localResumes: VillageResume[] = [];
  const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${projectId}`);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localResumes = parsed.filter((r: VillageResume) => !r.projectId || r.projectId === projectId);
      }
    } catch (e) {
      console.error('Error parsing cached village resumes:', e);
    }
  }

  // 2. Fetch from Cloud Firestore collection 'village_resumes'
  try {
    const resumesRef = collection(db, 'village_resumes');
    const q = query(resumesRef, where('projectId', '==', projectId));
    const snap = await withTimeout(getDocs(q), 6000);
    
    if (!snap.empty) {
      const list: VillageResume[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as VillageResume;
        if (!data.projectId || data.projectId === projectId) {
          list.push(data);
        }
      });
      // Merge Firestore data with local cache for this projectId only
      const mergedMap = new Map<string, VillageResume>();
      localResumes.forEach(r => mergedMap.set(r.desaName.toUpperCase(), r));
      list.forEach(r => mergedMap.set(r.desaName.toUpperCase(), r));
      const combined = Array.from(mergedMap.values());
      localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(combined));
      return combined;
    }
  } catch (err) {
    console.warn('Gagal memuat village resumes dari Firestore, tetap menggunakan cache lokal:', err);
  }

  // 3. Fallback to local storage if Firestore had no records yet
  if (localResumes.length > 0) {
    return localResumes;
  }

  // 4. Optional: If user configured a dedicated Google Sheet for this project's resumes
  if (googleContext?.accessToken && googleContext?.spreadsheetId && googleContext.accessToken !== 'GUEST_BYPASS') {
    try {
      const sheetResumes = await fetchResumesFromGoogleSheet(
        googleContext.accessToken,
        googleContext.spreadsheetId,
        projectId
      );
      if (sheetResumes.length > 0) {
        localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(sheetResumes));
        return sheetResumes;
      }
    } catch (sheetErr) {
      console.warn("Gagal memuat resumes dari Google Sheets:", sheetErr);
    }
  }

  return [];
}

export async function saveVillageResume(
  resume: VillageResume,
  googleContext?: { 
    accessToken?: string; 
    spreadsheetId?: string; 
    projectName?: string; 
    totalBidang?: number; 
    totalLuas?: number; 
    progressPct?: number; 
  }
): Promise<{ success: boolean; cloudSynced: boolean; sheetSynced?: boolean; error?: string }> {
  const updatedResume: VillageResume = {
    ...resume,
    lastUpdated: Date.now()
  };

  // 1. Save to LocalStorage immediately (instant & guaranteed offline safe)
  try {
    const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${resume.projectId}`);
    let current: VillageResume[] = [];
    if (cached) {
      try { current = JSON.parse(cached); } catch {}
    }
    const index = current.findIndex(r => r.id === resume.id || r.desaName.toUpperCase() === resume.desaName.toUpperCase());
    let updatedList: VillageResume[];
    if (index >= 0) {
      updatedList = [...current];
      updatedList[index] = updatedResume;
    } else {
      updatedList = [...current, updatedResume];
    }
    localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${resume.projectId}`, JSON.stringify(updatedList));
  } catch (err) {
    console.warn('Gagal menyimpan ke cache lokal:', err);
  }

  // 2. Persist to Firestore with safety timeout (Realtime Cloud Sync)
  let cloudSynced = false;
  let firestoreError: string | undefined;
  try {
    const resumeRef = doc(db, 'village_resumes', resume.id);
    const sanitized = sanitizeForFirestore(updatedResume);
    await withTimeout(setDoc(resumeRef, sanitized, { merge: true }), 8000);
    console.log(`[Resume Project] Desa ${resume.desaName} berhasil disinkronkan ke Firestore Cloud!`);
    cloudSynced = true;
  } catch (err: any) {
    const errMessage = err?.message || String(err);
    console.warn('Gagal menyimpan village resume ke Firestore:', err);
    firestoreError = errMessage.includes('exceeds maximum size') 
      ? 'Ukuran berkas melebihi batas 1MB Firestore.' 
      : 'Firestore dibatasi izin.';
  }

  // 3. Optional: Persist to dedicated Google Sheet if configured for this project (non-blocking)
  let sheetSynced = false;
  if (googleContext?.accessToken && googleContext?.spreadsheetId && googleContext.accessToken !== 'GUEST_BYPASS') {
    saveVillageResumeToSheet(
      googleContext.accessToken,
      googleContext.spreadsheetId,
      updatedResume,
      googleContext.projectName || 'Proyek Ventura',
      googleContext.totalBidang || 0,
      googleContext.totalLuas || 0,
      googleContext.progressPct || 0
    ).then((res) => {
      if (res.success) {
        console.log(`[Resume Sheet] Desa ${resume.desaName} berhasil disimpan ke Google Sheet!`);
      }
    }).catch((err) => {
      console.warn("Gagal simpan ke Google Sheet:", err);
    });
  }

  return {
    success: true,
    cloudSynced,
    sheetSynced,
    error: (!cloudSynced) ? firestoreError : undefined
  };
}

/**
 * Export all resumes for a specific project as JSON string
 */
export function exportVillageResumesJson(projectId: string): string {
  const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${projectId}`);
  if (!cached) return JSON.stringify([], null, 2);
  try {
    const list = JSON.parse(cached);
    return JSON.stringify(list, null, 2);
  } catch {
    return JSON.stringify([], null, 2);
  }
}

/**
 * Import resumes for a project from JSON string, saving to local cache and pushing to Firestore
 */
export async function importVillageResumesJson(
  projectId: string, 
  jsonString: string
): Promise<{ success: boolean; count: number; cloudSyncedCount: number; error?: string }> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return { success: false, count: 0, cloudSyncedCount: 0, error: 'Format data JSON tidak valid (harus berupa daftar array desa)' };
    }

    const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${projectId}`);
    let current: VillageResume[] = [];
    if (cached) {
      try { current = JSON.parse(cached); } catch {}
    }

    const currentMap = new Map<string, VillageResume>();
    current.forEach(item => currentMap.set(item.id, item));

    let cloudSyncedCount = 0;
    const now = Date.now();

    for (const rawItem of parsed) {
      if (!rawItem.id || !rawItem.desaName) continue;
      const item: VillageResume = {
        ...rawItem,
        projectId,
        lastUpdated: rawItem.lastUpdated || now
      };
      currentMap.set(item.id, item);

      // Attempt push to Firestore
      try {
        const resumeRef = doc(db, 'village_resumes', item.id);
        const sanitized = sanitizeForFirestore(item);
        await withTimeout(setDoc(resumeRef, sanitized, { merge: true }), 5000);
        cloudSyncedCount++;
      } catch (e) {
        // Continue even if Firestore push fails for individual item
      }
    }

    const mergedList = Array.from(currentMap.values());
    localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(mergedList));

    return { 
      success: true, 
      count: parsed.length, 
      cloudSyncedCount 
    };
  } catch (err: any) {
    return { 
      success: false, 
      count: 0, 
      cloudSyncedCount: 0, 
      error: `Gagal membaca format JSON: ${err?.message || String(err)}` 
    };
  }
}

/**
 * Generates and downloads 1 Master Excel Workbook (.xlsx)
 * accommodating ALL JALUR (Projects), Village Resumes, Status, Google Drive Links, and Land Parcels.
 */
export function generateMasterWorkbookExcel(
  projects: ProjectConfig[],
  allResumes: VillageResume[],
  allRecords: LandRecord[] = []
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: RESUME_SEMUA_JALUR
  const resumeRows = allResumes.map((r, idx) => {
    const proj = projects.find(p => p.id === r.projectId);
    const projName = proj?.name || r.projectId;
    const desaRecords = allRecords.filter(rec => (rec.DESA || '').trim().toUpperCase() === (r.desaName || '').trim().toUpperCase());
    const totalBidang = desaRecords.length;
    const berkasSelesai = desaRecords.filter(rec => (rec.PROGRES_PEMBERKASAN || '').trim().toUpperCase() === 'SELESAI').length;
    const berkasPct = totalBidang > 0 ? Math.round((berkasSelesai / totalBidang) * 100) : 0;

    let points = 0;
    const manualStages = [
      r.pendataanAwal,
      r.baSosialisasiAwal,
      r.surveiPemetaan,
      r.baPengumuman,
      r.lampiranBapt,
      r.registrasiBapt,
      r.baPenyampaianNilai,
      r.baSerahTerimaRekening,
      r.bushClearing
    ];
    const totalStagesCount = 10;
    manualStages.forEach(s => {
      if (s?.status === 'SELESAI') points += 100 / totalStagesCount;
      else if (s?.status === 'PROSES') points += 50 / totalStagesCount;
    });
    points += (berkasPct / 100) * (100 / totalStagesCount);
    const pct = Math.min(100, Math.round(points));

    return {
      'NO': idx + 1,
      'JALUR TRANSMISI': projName,
      'ID JALUR': r.projectId,
      'DESA / KELURAHAN': r.desaName,
      'KECAMATAN': r.kecamatan || '',
      'KABUPATEN / KOTA': r.kabupaten || '',
      'TARGET SPAN (PRA-AKUISISI)': r.targetSpan || '',
      'ESTIMASI BIDANG AWAL': r.estimasiBidangAwal || '',
      'KEPALA DESA / LURAH': r.namaKades || '',
      'CAMAT': r.namaCamat || '',
      'PJT (ANALIS UTAMA)': r.namaPjt || '',
      'NO SERTIFIKAT PJT': r.noSertifikatPjt || '',
      'TOTAL PROGRES (%)': `${pct}%`,
      '1. PENDATAAN AWAL - STATUS': r.pendataanAwal?.status || 'BELUM',
      '1. PENDATAAN AWAL - TANGGAL': r.pendataanAwal?.date || '',
      '1. PENDATAAN AWAL - LINK DOKUMEN': r.pendataanAwal?.pdfUrl || '',
      '1. PENDATAAN AWAL - CATATAN': r.pendataanAwal?.notes || '',
      '2. SOSIALISASI DESA - STATUS': r.baSosialisasiAwal?.status || 'BELUM',
      '2. SOSIALISASI DESA - TANGGAL': r.baSosialisasiAwal?.date || '',
      '2. SOSIALISASI DESA - NO BA': r.baSosialisasiAwal?.nomorDokumen || '',
      '2. SOSIALISASI DESA - LINK BA': r.baSosialisasiAwal?.pdfUrl || '',
      '2. SOSIALISASI DESA - CATATAN': r.baSosialisasiAwal?.notes || '',
      '3. SURVEI & PEMETAAN - STATUS': r.surveiPemetaan?.status || 'BELUM',
      '3. SURVEI & PEMETAAN - TANGGAL': r.surveiPemetaan?.date || '',
      '3. SURVEI & PEMETAAN - LINK PETA': r.surveiPemetaan?.pdfUrl || '',
      '3. SURVEI & PEMETAAN - CATATAN': r.surveiPemetaan?.notes || '',
      '4. INVENTARISASI & NOMINATIF (OTOMATIS DB) - PERSENTASE': `${berkasPct}%`,
      '4. INVENTARISASI & NOMINATIF (OTOMATIS DB) - BERKAS SELESAI': `${berkasSelesai}/${totalBidang} Bidang`,
      '5. PENGUMUMAN - STATUS': r.baPengumuman?.status || 'BELUM',
      '5. PENGUMUMAN - TGL MULAI': r.baPengumuman?.date || '',
      '5. PENGUMUMAN - TGL SELESAI': r.baPengumuman?.endDate || '',
      '5. PENGUMUMAN - JML KEBERATAN': r.baPengumuman?.jumlahKeberatan ?? 0,
      '5. PENGUMUMAN - LINK DOKUMEN': r.baPengumuman?.pdfUrl || '',
      '6. PENYUSUNAN BAPT - STATUS': r.lampiranBapt?.status || 'BELUM',
      '6. PENYUSUNAN BAPT - TANGGAL TTD': r.lampiranBapt?.date || '',
      '6. PENYUSUNAN BAPT - LINK BAPT': r.lampiranBapt?.pdfUrl || '',
      '6. PENYUSUNAN BAPT - CATATAN': r.lampiranBapt?.notes || '',
      '7. REGISTRASI BAPT - STATUS': r.registrasiBapt?.status || 'BELUM',
      '7. REGISTRASI BAPT - TGL PENGAJUAN': r.registrasiBapt?.date || '',
      '7. REGISTRASI BAPT - NOMOR REGISTER': r.registrasiBapt?.nomorDokumen || '',
      '7. REGISTRASI BAPT - LINK SURAT REGISTER': r.registrasiBapt?.pdfUrl || '',
      '7. REGISTRASI BAPT - CATATAN': r.registrasiBapt?.notes || '',
      '8. SOSIALISASI PENYAMPAIAN NILAI - STATUS': r.baPenyampaianNilai?.status || 'BELUM',
      '8. SOSIALISASI PENYAMPAIAN NILAI - TANGGAL': r.baPenyampaianNilai?.date || '',
      '8. SOSIALISASI PENYAMPAIAN NILAI - LINK BA': r.baPenyampaianNilai?.pdfUrl || '',
      '8. SOSIALISASI PENYAMPAIAN NILAI - CATATAN': r.baPenyampaianNilai?.notes || '',
      '9. SOSIALISASI PEMBAYARAN - STATUS': r.baSerahTerimaRekening?.status || 'BELUM',
      '9. SOSIALISASI PEMBAYARAN - TANGGAL': r.baSerahTerimaRekening?.date || '',
      '9. SOSIALISASI PEMBAYARAN - LINK BA': r.baSerahTerimaRekening?.pdfUrl || '',
      '9. SOSIALISASI PEMBAYARAN - CATATAN': r.baSerahTerimaRekening?.notes || '',
      '10. BUSH CLEARING - STATUS': r.bushClearing?.status || 'BELUM',
      '10. BUSH CLEARING - TANGGAL': r.bushClearing?.date || '',
      '10. BUSH CLEARING - LINK BA': r.bushClearing?.pdfUrl || '',
      '10. BUSH CLEARING - CATATAN': r.bushClearing?.notes || '',
      'FOLDER DRIVE DESA': r.driveFolderId ? `https://drive.google.com/drive/folders/${r.driveFolderId}` : '',
      'TERAKHIR DIPERBARUI': new Date(r.lastUpdated || Date.now()).toLocaleDateString('id-ID'),
      'PETUGAS': r.updatedBy || 'Operator'
    };
  });

  const wsResume = XLSX.utils.json_to_sheet(resumeRows);
  XLSX.utils.book_append_sheet(wb, wsResume, "RESUME_SEMUA_JALUR");

  // Sheet 2: DAFTAR_BIDANG_MASTER (if records exist)
  if (allRecords.length > 0) {
    const recordRows = allRecords.map((r, idx) => ({
      'NO': idx + 1,
      'DESA': r.DESA || '',
      'SPAN': r.SPAN || '',
      'NO BIDANG': r.NOBID || '',
      'KODE BIDANG': r.CODE || '',
      'NAMA PEMILIK': r.NAMA || '',
      'NIK': r.NIK || '',
      'LUAS (M2)': r.LUAS || '',
      'PENUTUP LAHAN': r.PENUTUP_LAHAN || '',
      'STATUS HAK': r.STATUS_KEPEMILIKAN || '',
      'QC STATUS': r.QC_STATUS || '',
      'LINK ALAS HAK DRIVE': r.LINK_ALAS_HAK || '',
      'LINK KTP DRIVE': r.LINK_KTP || '',
      'FOLDER DRIVE': r.DRIVE_FOLDER_ID ? `https://drive.google.com/drive/folders/${r.DRIVE_FOLDER_ID}` : ''
    }));
    const wsRecords = XLSX.utils.json_to_sheet(recordRows);
    XLSX.utils.book_append_sheet(wb, wsRecords, "DAFTAR_BIDANG_MASTER");
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `SIP_Master_Database_1_Workbook_${dateStr}.xlsx`);
}

/**
 * Generates and downloads 1 Excel Workbook (.xlsx) dedicated to a SINGLE JALUR (Project).
 * Accommodates:
 * 1. RESUME_PROYEK (Tahapan 1-10 + Data Pra-Akuisisi)
 * 2. SURAT_INSTANSI (Data surat menyurat dinas/instansi untuk jalur ini)
 * 3. DAFTAR_NOMINATIF (Rincian bidang tanah, pemilik, alas hak, dan link drive)
 */
export function generateJalurWorkbookExcel(
  project: ProjectConfig,
  villageResumes: VillageResume[],
  records: LandRecord[],
  letters: AgencyLetter[] = []
): void {
  const wb = XLSX.utils.book_new();

  // 1. OTOMATIS GABUNGKAN NAMA DESA DARI PRA-AKUISISI (RESUME) & DATABASE AKUISISI
  const desasFromRecords = Array.from(new Set(records.map(r => (r.DESA || '').trim().toUpperCase()).filter(Boolean)));
  const desasFromResumes = Array.from(new Set(villageResumes.map(r => (r.desaName || '').trim().toUpperCase()).filter(Boolean)));
  const allUniqueDesas = Array.from(new Set([...desasFromResumes, ...desasFromRecords])).sort((a, b) => a.localeCompare(b));

  const activeStages = DEFAULT_RESUME_STAGES.filter(s => s.active !== false);

  const resumeRows = allUniqueDesas.map((desaName, idx) => {
    const existingResume = villageResumes.find(r => (r.desaName || '').trim().toUpperCase() === desaName);
    const desaRecords = records.filter(r => (r.DESA || '').trim().toUpperCase() === desaName);
    
    const totalBidang = desaRecords.length;
    const berkasSelesai = desaRecords.filter(r => (r.PROGRES_PEMBERKASAN || '').trim().toUpperCase() === 'SELESAI').length;
    const berkasPct = totalBidang > 0 ? Math.round((berkasSelesai / totalBidang) * 100) : 0;
    const totalSpanRealisasi = new Set(desaRecords.map(r => (r.SPAN || '').trim()).filter(Boolean)).size;
    const totalLuas = desaRecords.reduce((sum, r) => sum + (parseFloat(String(r.LUAS || '0').replace(',', '.')) || 0), 0);
    const kecamatan = existingResume?.kecamatan || desaRecords[0]?.KECAMATAN || '';
    const kabupaten = existingResume?.kabupaten || desaRecords[0]?.KABUPATEN || '';
    const kades = existingResume?.namaKades || desaRecords.find(r => r.NAMA_KADES)?.NAMA_KADES || '';

    // Hitung persentase progres berdasarkan tahapan aktif (1-10)
    let points = 0;
    activeStages.forEach(st => {
      if (st.key === 'inventarisasiNominatif') {
        points += (berkasPct / 100) * (100 / activeStages.length);
      } else {
        const stageDoc = existingResume ? (existingResume as any)[st.key] : null;
        if (stageDoc?.status === 'SELESAI') points += 100 / activeStages.length;
        else if (stageDoc?.status === 'PROSES') points += 50 / activeStages.length;
      }
    });
    const pct = Math.min(100, Math.round(points));

    return {
      'NO': idx + 1,
      'JALUR TRANSMISI': project.name,
      'DESA / KELURAHAN': desaName,
      'KECAMATAN': kecamatan,
      'KABUPATEN / KOTA': kabupaten,
      'TARGET SPAN (PRA-AKUISISI)': existingResume?.targetSpan || (totalSpanRealisasi > 0 ? totalSpanRealisasi : '-'),
      'ESTIMASI BIDANG AWAL': existingResume?.estimasiBidangAwal || '-',
      'REALISASI BIDANG TERAKUISISI': totalBidang,
      'TOTAL LUAS TERAKUISISI (M2)': totalLuas > 0 ? Math.round(totalLuas * 100) / 100 : 0,
      'KEPALA DESA / LURAH': kades,
      'CAMAT': existingResume?.namaCamat || '',
      'PJT (ANALIS UTAMA)': existingResume?.namaPjt || '',
      'NO SERTIFIKAT PJT': existingResume?.noSertifikatPjt || '',
      'TOTAL PROGRES (%)': `${pct}%`,
      '1. PENDATAAN AWAL - STATUS': existingResume?.pendataanAwal?.status || 'BELUM',
      '1. PENDATAAN AWAL - TANGGAL': existingResume?.pendataanAwal?.date || '',
      '1. PENDATAAN AWAL - LINK DOKUMEN': existingResume?.pendataanAwal?.pdfUrl || '',
      '1. PENDATAAN AWAL - CATATAN': existingResume?.pendataanAwal?.notes || '',
      '2. SOSIALISASI DESA - STATUS': existingResume?.baSosialisasiAwal?.status || 'BELUM',
      '2. SOSIALISASI DESA - TANGGAL': existingResume?.baSosialisasiAwal?.date || '',
      '2. SOSIALISASI DESA - NO BA': existingResume?.baSosialisasiAwal?.nomorDokumen || '',
      '2. SOSIALISASI DESA - LINK BA': existingResume?.baSosialisasiAwal?.pdfUrl || '',
      '2. SOSIALISASI DESA - CATATAN': existingResume?.baSosialisasiAwal?.notes || '',
      '3. SURVEI & PEMETAAN - STATUS': existingResume?.surveiPemetaan?.status || 'BELUM',
      '3. SURVEI & PEMETAAN - TANGGAL': existingResume?.surveiPemetaan?.date || '',
      '3. SURVEI & PEMETAAN - LINK PETA': existingResume?.surveiPemetaan?.pdfUrl || '',
      '3. SURVEI & PEMETAAN - CATATAN': existingResume?.surveiPemetaan?.notes || '',
      '4. INVENTARISASI & NOMINATIF (OTOMATIS DB) - PERSENTASE': `${berkasPct}%`,
      '4. INVENTARISASI & NOMINATIF (OTOMATIS DB) - BERKAS SELESAI': `${berkasSelesai}/${totalBidang} Bidang`,
      '5. PENGUMUMAN - STATUS': existingResume?.baPengumuman?.status || 'BELUM',
      '5. PENGUMUMAN - TGL MULAI': existingResume?.baPengumuman?.date || '',
      '5. PENGUMUMAN - TGL SELESAI': existingResume?.baPengumuman?.endDate || '',
      '5. PENGUMUMAN - JML KEBERATAN': existingResume?.baPengumuman?.jumlahKeberatan ?? 0,
      '5. PENGUMUMAN - LINK DOKUMEN': existingResume?.baPengumuman?.pdfUrl || '',
      '6. PENYUSUNAN BAPT - STATUS': existingResume?.lampiranBapt?.status || 'BELUM',
      '6. PENYUSUNAN BAPT - TANGGAL TTD': existingResume?.lampiranBapt?.date || '',
      '6. PENYUSUNAN BAPT - LINK BAPT': existingResume?.lampiranBapt?.pdfUrl || '',
      '6. PENYUSUNAN BAPT - CATATAN': existingResume?.lampiranBapt?.notes || '',
      '7. REGISTRASI BAPT - STATUS': existingResume?.registrasiBapt?.status || 'BELUM',
      '7. REGISTRASI BAPT - TGL PENGAJUAN': existingResume?.registrasiBapt?.date || '',
      '7. REGISTRASI BAPT - NOMOR REGISTER': existingResume?.registrasiBapt?.nomorDokumen || '',
      '7. REGISTRASI BAPT - LINK SURAT REGISTER': existingResume?.registrasiBapt?.pdfUrl || '',
      '7. REGISTRASI BAPT - CATATAN': existingResume?.registrasiBapt?.notes || '',
      '8. SOSIALISASI PENYAMPAIAN NILAI - STATUS': existingResume?.baPenyampaianNilai?.status || 'BELUM',
      '8. SOSIALISASI PENYAMPAIAN NILAI - TANGGAL': existingResume?.baPenyampaianNilai?.date || '',
      '8. SOSIALISASI PENYAMPAIAN NILAI - LINK BA': existingResume?.baPenyampaianNilai?.pdfUrl || '',
      '8. SOSIALISASI PENYAMPAIAN NILAI - CATATAN': existingResume?.baPenyampaianNilai?.notes || '',
      '9. SOSIALISASI PEMBAYARAN - STATUS': existingResume?.baSerahTerimaRekening?.status || 'BELUM',
      '9. SOSIALISASI PEMBAYARAN - TANGGAL': existingResume?.baSerahTerimaRekening?.date || '',
      '9. SOSIALISASI PEMBAYARAN - LINK BA': existingResume?.baSerahTerimaRekening?.pdfUrl || '',
      '9. SOSIALISASI PEMBAYARAN - CATATAN': existingResume?.baSerahTerimaRekening?.notes || '',
      '10. BUSH CLEARING - STATUS': existingResume?.bushClearing?.status || 'BELUM',
      '10. BUSH CLEARING - TANGGAL': existingResume?.bushClearing?.date || '',
      '10. BUSH CLEARING - LINK BA': existingResume?.bushClearing?.pdfUrl || '',
      '10. BUSH CLEARING - CATATAN': existingResume?.bushClearing?.notes || '',
      'LINK FOLDER DESA DRIVE': existingResume?.driveFolderId ? `https://drive.google.com/drive/folders/${existingResume.driveFolderId}` : '',
      'TERAKHIR DIPERBARUI': existingResume?.lastUpdated ? new Date(existingResume.lastUpdated).toLocaleDateString('id-ID') : new Date().toLocaleDateString('id-ID'),
      'PETUGAS': existingResume?.updatedBy || 'Operator'
    };
  });

  const wsResume = XLSX.utils.json_to_sheet(resumeRows.length > 0 ? resumeRows : [{
    'NO': 1,
    'JALUR KOMPENSASI': project.name,
    'DESA': 'Belum ada data desa',
    'PROGRES (%)': '0%'
  }]);
  XLSX.utils.book_append_sheet(wb, wsResume, "RESUME_PROYEK");

  // Sheet 2: SURAT_INSTANSI (Terintegrasi langsung dalam workbook jalur ini)
  const suratRows = letters.map((l, idx) => ({
    'NO': idx + 1,
    'JALUR': project.name,
    'INSTANSI TUJUAN': l.instansiName,
    'NO SURAT': l.noSurat,
    'TANGGAL SURAT': l.tanggalSurat,
    'PERIHAL': l.perihal,
    'STATUS': l.status,
    'PIC INSTANSI': l.picInstansi || '',
    'CATATAN TINDAK LANJUT': l.catatanTindakLanjut || '',
    'LINK DOKUMEN / PDF SURAT': l.suratPdfUrl || (l.docPhotos?.[0] || ''),
    'NAMA BERKAS': l.suratPdfName || '',
    'TANGGAL INPUT': new Date(l.createdAt || Date.now()).toLocaleDateString('id-ID'),
    'PETUGAS': l.updatedBy || 'Operator'
  }));

  const wsSurat = XLSX.utils.json_to_sheet(suratRows.length > 0 ? suratRows : [{
    'NO': 1,
    'JALUR': project.name,
    'INSTANSI TUJUAN': 'BPN / Balai Jalan / DLH / Camat / Desa',
    'NO SURAT': 'Contoh: 120/VTR/ROW/2026',
    'TANGGAL SURAT': new Date().toISOString().slice(0, 10),
    'PERIHAL': 'Permohonan Data Alas Hak dan Inventarisasi',
    'STATUS': 'SUDAH_MASUK',
    'CATATAN TINDAK LANJUT': 'Menunggu konfirmasi audiensi',
    'LINK DOKUMEN / PDF SURAT': ''
  }]);
  XLSX.utils.book_append_sheet(wb, wsSurat, "SURAT_INSTANSI");

  // Sheet 3: DAFTAR_NOMINATIF (Data Bidang Tanah Jalur Ini)
  const nominatifRows = records.map((r, idx) => ({
    'NO': idx + 1,
    'KODE BIDANG': r.CODE || '',
    'DESA': r.DESA || '',
    'SPAN': r.SPAN || '',
    'NO BIDANG': r.NOBID || '',
    'NAMA PEMILIK': r.NAMA || '',
    'NIK': r.NIK || '',
    'LUAS (M2)': r.LUAS || '',
    'PENUTUP LAHAN': r.PENUTUP_LAHAN || '',
    'STATUS HAK': r.STATUS_KEPEMILIKAN || '',
    'STATUS DESA': r.STATUS_DESA || '',
    'PROGRES PEMBERKASAN': r.PROGRES_PEMBERKASAN || '',
    'PROGRES UPLOAD TRABAS': r.PROGRES_UPLOAD_TRABAS || '',
    'QC STATUS': r.QC_STATUS || 'PENDING',
    'CATATAN QC': r.QC_NOTES || '',
    'LINK ALAS HAK DRIVE': r.LINK_ALAS_HAK || '',
    'LINK KTP DRIVE': r.LINK_KTP || '',
    'LINK KK DRIVE': r.LINK_KK || '',
    'FOLDER DRIVE BIDANG': r.DRIVE_FOLDER_ID ? `https://drive.google.com/drive/folders/${r.DRIVE_FOLDER_ID}` : '',
    'TANGGAL PELAKSANAAN': r.TANGGAL_PELAKSANAAN || ''
  }));

  const wsNominatif = XLSX.utils.json_to_sheet(nominatifRows.length > 0 ? nominatifRows : [{
    'NO': 1,
    'KODE BIDANG': 'Belum ada data bidang',
    'DESA': '',
    'NAMA PEMILIK': ''
  }]);
  XLSX.utils.book_append_sheet(wb, wsNominatif, "DAFTAR_NOMINATIF");

  const cleanProjName = project.name.replace(/[\/\\?%*:|"<>\s]/g, '_').substring(0, 40);
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `QC_Database_${cleanProjName}_${dateStr}.xlsx`);
}

/**
 * Convenience helper to download the full 3-sheet Excel workbook for a project,
 * automatically retrieving resumes and agency letters if not passed.
 */
export async function downloadJalurWorkbook(
  project: ProjectConfig,
  records: LandRecord[],
  passedResumes?: VillageResume[],
  passedLetters?: AgencyLetter[]
): Promise<void> {
  const resumes = passedResumes || await loadVillageResumes(project.id);
  const letters = passedLetters || await loadAgencyLetters(project.id);
  generateJalurWorkbookExcel(project, resumes, records, letters);
}

/**
 * Imports village resumes from an uploaded Excel Workbook (.xlsx)
 */
export async function importMasterWorkbookExcel(
  file: File,
  activeProjectId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('RESUME')) || wb.SheetNames[0];
    if (!sheetName) {
      return { success: false, count: 0, error: 'Tidak ditemukan sheet resume di dalam workbook Excel.' };
    }

    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (rows.length <= 1) {
      return { success: false, count: 0, error: 'Sheet resume tidak memiliki baris data.' };
    }

    const dataRows = rows.slice(1);
    const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${activeProjectId}`);
    let current: VillageResume[] = [];
    if (cached) {
      try { current = JSON.parse(cached); } catch {}
    }
    const currentMap = new Map<string, VillageResume>();
    current.forEach(item => currentMap.set(item.id, item));

    let importedCount = 0;
    const now = Date.now();

    for (const row of dataRows) {
      if (!row || row.length === 0) continue;
      const desaName = String(row[3] || row[2] || '').trim().toUpperCase();
      if (!desaName) continue;

      const projId = String(row[2] || activeProjectId).trim() || activeProjectId;
      const id = `${projId}_${desaName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      const resume: VillageResume = {
        id,
        projectId: projId,
        desaName,
        kecamatan: String(row[4] || ''),
        kabupaten: String(row[5] || ''),
        baSosialisasiAwal: {
          status: (row[7] as any) || 'BELUM',
          date: String(row[8] || ''),
          pdfUrl: row[9] ? String(row[9]) : undefined,
          notes: String(row[10] || ''),
          docPhotos: []
        },
        baPengumuman: {
          status: (row[11] as any) || 'BELUM',
          date: String(row[12] || ''),
          pdfUrl: row[13] ? String(row[13]) : undefined,
          notes: String(row[14] || ''),
          docPhotos: []
        },
        lampiranBapt: {
          status: (row[15] as any) || 'BELUM',
          date: String(row[16] || ''),
          pdfUrl: row[17] ? String(row[17]) : undefined,
          notes: String(row[18] || ''),
          docPhotos: []
        },
        baPenyampaianNilai: {
          status: (row[19] as any) || 'BELUM',
          date: String(row[20] || ''),
          pdfUrl: row[21] ? String(row[21]) : undefined,
          notes: String(row[22] || ''),
          docPhotos: []
        },
        baSerahTerimaRekening: {
          status: (row[23] as any) || 'BELUM',
          date: String(row[24] || ''),
          pdfUrl: row[25] ? String(row[25]) : undefined,
          notes: String(row[26] || ''),
          docPhotos: []
        },
        bushClearing: {
          status: (row[27] as any) || 'BELUM',
          date: String(row[28] || ''),
          pdfUrl: row[29] ? String(row[29]) : undefined,
          notes: String(row[30] || ''),
          docPhotos: []
        },
        lastUpdated: now,
        updatedBy: 'Excel Import'
      };

      currentMap.set(id, resume);
      importedCount++;
    }

    const merged = Array.from(currentMap.values());
    localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${activeProjectId}`, JSON.stringify(merged));

    return { success: true, count: importedCount };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteVillageResume(projectId: string, resumeId: string, desaName?: string): Promise<void> {
  // 1. LocalStorage
  try {
    const raw = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${projectId}`);
    let current: VillageResume[] = [];
    if (raw) {
      try { current = JSON.parse(raw); } catch {}
    }
    const cleanTargetDesa = (desaName || '').trim().toUpperCase();
    const filtered = current.filter(r => {
      if (r.id === resumeId) return false;
      if (cleanTargetDesa && (r.desaName || '').trim().toUpperCase() === cleanTargetDesa) return false;
      return true;
    });
    localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Gagal delete local village resume:', err);
  }

  // 2. Firestore
  try {
    const resumeRef = doc(db, 'village_resumes', resumeId);
    await withTimeout(deleteDoc(resumeRef), 10000);
  } catch (err) {
    console.warn('Gagal delete village resume dari Firestore:', err);
  }
}

export function subscribeVillageResumes(
  projectId: string, 
  callback: (resumes: VillageResume[]) => void,
  onStatusChange?: (isConnected: boolean, error?: { code?: string; message?: string }) => void
) {
  try {
    const resumesRef = collection(db, 'village_resumes');
    const q = query(resumesRef, where('projectId', '==', projectId));
    return onSnapshot(q, (snapshot) => {
      const list: VillageResume[] = [];
      snapshot.forEach(d => {
        const data = d.data() as VillageResume;
        if (!data.projectId || data.projectId === projectId) {
          list.push(data);
        }
      });
      localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(list));
      callback(list);
      if (onStatusChange) onStatusChange(true);
    }, (err) => {
      console.warn('Realtime listener error for village resumes:', err);
      if (onStatusChange) onStatusChange(false, { code: err?.code, message: err?.message });
    });
  } catch (e: any) {
    console.warn('Could not initialize snapshot listener for village resumes:', e);
    if (onStatusChange) onStatusChange(false, { code: e?.code, message: e?.message });
    return () => {};
  }
}

export async function testCloudConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const resumesRef = collection(db, 'village_resumes');
    await withTimeout(getDocs(query(resumesRef, limit(1))), 6000);
    return { connected: true };
  } catch (err: any) {
    return { connected: false, error: err?.code || err?.message || String(err) };
  }
}

// ----------------- AGENCY LETTERS FUNCTIONS -----------------

const DEFAULT_AGENCY_SEEDS = (projectId: string): AgencyLetter[] => [
  {
    id: `${projectId}_sample_1`,
    projectId,
    instansiName: 'BPN / Kantor Pertanahan Kab. Pasuruan',
    noSurat: '120/VTR/ROW-PLN/III/2026',
    tanggalSurat: '2026-03-02',
    perihal: 'Permohonan Data Alas Hak dan Penetapan Lokasi Jalur ROW',
    status: 'SELESAI',
    catatanTindakLanjut: 'Data peta pendaftaran tanah sudah diterima lengkap dari Seksi Penetapan Hak.',
    picInstansi: 'Bpk. Hendrawan (Seksi Survei & Pemetaan)',
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 5,
    updatedBy: 'Andi Bangun S.'
  },
  {
    id: `${projectId}_sample_2`,
    projectId,
    instansiName: 'Balai Besar Pelaksanaan Jalan Nasional (BBPJN)',
    noSurat: '125/VTR/ROW-PLN/III/2026',
    tanggalSurat: '2026-03-08',
    perihal: 'Permohonan Izin Pemanfaatan dan Crossing Jalur SUTT 150 kV',
    status: 'TINDAK_LANJUT',
    catatanTindakLanjut: 'Harus turun lapangan bersama tim teknis Balai Jalan untuk cek clearance jalan nasional.',
    picInstansi: 'Ibu Ratna (Bidang Preservasi Jalan)',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 1,
    updatedBy: 'agung763'
  },
  {
    id: `${projectId}_sample_3`,
    projectId,
    instansiName: 'Dinas Lingkungan Hidup Kab. Pasuruan',
    noSurat: '131/VTR/ROW-PLN/III/2026',
    tanggalSurat: '2026-03-12',
    perihal: 'Penyampaian Dokumen RKL-RPL dan Rencana Bush Clearing',
    status: 'ON_PROGRESS',
    catatanTindakLanjut: 'Menunggu tanda terima berkas dan jadwal audiensi teknis AMDAL.',
    picInstansi: 'Bpk. Syaiful (Bidang Tata Lingkungan)',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 2,
    updatedBy: 'Andi Bangun S.'
  },
  {
    id: `${projectId}_sample_4`,
    projectId,
    instansiName: 'Kantor Kecamatan & Desa Koridor',
    noSurat: '135/VTR/ROW-PLN/III/2026',
    tanggalSurat: '2026-03-14',
    perihal: 'Pemberitahuan Sosialisasi Awal dan Inventarisasi Tanam Tumbuh',
    status: 'SUDAH_MASUK',
    catatanTindakLanjut: 'Surat sudah masuk di meja Sekcam, menunggu disposisi jadwal pertemuan warga desa.',
    picInstansi: 'Sekretaris Camat',
    createdAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 1,
    updatedBy: 'agung763'
  }
];

export async function loadAgencyLetters(projectId: string): Promise<AgencyLetter[]> {
  const isInitialized = localStorage.getItem(`${LETTERS_CACHE_PREFIX}${projectId}_init`) === 'true';

  // 1. Check Firestore
  try {
    const lettersRef = collection(db, 'agency_letters');
    const q = query(lettersRef, where('projectId', '==', projectId));
    const snap = await withTimeout(getDocs(q), 2500);
    
    if (!snap.empty) {
      const list: AgencyLetter[] = [];
      snap.forEach(docSnap => {
        list.push(docSnap.data() as AgencyLetter);
      });
      localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}`, JSON.stringify(list));
      localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}_init`, 'true');
      return list;
    } else if (isInitialized) {
      // Genuinely 0 records (user deleted them)
      localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}`, JSON.stringify([]));
      return [];
    }
  } catch (err) {
    console.warn('Gagal memuat agency letters dari Firestore, beralih ke cache lokal:', err);
  }

  // 2. Fallback to local storage
  const cached = localStorage.getItem(`${LETTERS_CACHE_PREFIX}${projectId}`);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 || isInitialized) return parsed;
      }
    } catch (e) {
      console.error('Error parsing cached agency letters:', e);
    }
  }

  // 3. If completely first time ever, seed initial defaults
  const seeds = DEFAULT_AGENCY_SEEDS(projectId);
  localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}`, JSON.stringify(seeds));
  localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}_init`, 'true');
  
  // Asynchronously seed Firestore
  seeds.forEach(s => {
    try {
      const letterRef = doc(db, 'agency_letters', s.id);
      setDoc(letterRef, s, { merge: true }).catch(() => {});
    } catch {}
  });

  return seeds;
}

export async function saveAgencyLetter(
  letter: AgencyLetter,
  options?: {
    accessToken?: string;
    spreadsheetId?: string;
    projectName?: string;
  }
): Promise<{ cloudSynced: boolean; sheetSynced: boolean; error?: string }> {
  const updatedLetter: AgencyLetter = {
    ...letter,
    updatedAt: Date.now()
  };

  // 1. LocalStorage
  try {
    const raw = localStorage.getItem(`${LETTERS_CACHE_PREFIX}${letter.projectId}`);
    let current: AgencyLetter[] = [];
    if (raw) {
      try { current = JSON.parse(raw); } catch {}
    }
    const index = current.findIndex(l => l.id === letter.id);
    let updatedList: AgencyLetter[];
    if (index >= 0) {
      updatedList = [...current];
      updatedList[index] = updatedLetter;
    } else {
      updatedList = [updatedLetter, ...current];
    }
    localStorage.setItem(`${LETTERS_CACHE_PREFIX}${letter.projectId}`, JSON.stringify(updatedList));
    localStorage.setItem(`${LETTERS_CACHE_PREFIX}${letter.projectId}_init`, 'true');
  } catch (err) {
    console.warn('Gagal update local agency letters:', err);
  }

  let cloudSynced = false;
  let sheetSynced = false;
  let lastError: string | undefined;

  // 2. Firestore
  try {
    const letterRef = doc(db, 'agency_letters', letter.id);
    await withTimeout(setDoc(letterRef, updatedLetter, { merge: true }), 2500);
    cloudSynced = true;
  } catch (err: any) {
    console.warn('Gagal simpan agency letter ke Firestore:', err);
    lastError = err?.message || 'Gagal menyimpan ke Firestore';
  }

  // 3. Google Sheets (1 Workbook - Tab SURAT_INSTANSI)
  if (options?.accessToken && options?.spreadsheetId) {
    try {
      const sheetRes = await saveAgencyLetterToSheet(
        options.accessToken,
        options.spreadsheetId,
        updatedLetter
      );
      if (sheetRes.success) {
        sheetSynced = true;
      }
    } catch (err: any) {
      console.warn('Gagal simpan surat instansi ke Google Sheets:', err);
    }
  }

  return { cloudSynced, sheetSynced, error: lastError };
}

export async function deleteAgencyLetter(projectId: string, letterId: string): Promise<void> {
  // 1. LocalStorage
  try {
    const raw = localStorage.getItem(`${LETTERS_CACHE_PREFIX}${projectId}`);
    let current: AgencyLetter[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) current = parsed;
      } catch {}
    }
    const filtered = current.filter(l => l.id !== letterId);
    localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}`, JSON.stringify(filtered));
    localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}_init`, 'true');
  } catch (err) {
    console.warn('Gagal delete local agency letter:', err);
  }

  // 2. Firestore
  try {
    const letterRef = doc(db, 'agency_letters', letterId);
    await withTimeout(deleteDoc(letterRef), 2500);
  } catch (err) {
    console.warn('Gagal delete agency letter dari Firestore:', err);
  }
}

export function subscribeAgencyLetters(
  projectId: string, 
  callback: (letters: AgencyLetter[]) => void
) {
  try {
    const lettersRef = collection(db, 'agency_letters');
    const q = query(lettersRef, where('projectId', '==', projectId));
    return onSnapshot(q, (snapshot) => {
      const list: AgencyLetter[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as AgencyLetter);
      });
      localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}`, JSON.stringify(list));
      localStorage.setItem(`${LETTERS_CACHE_PREFIX}${projectId}_init`, 'true');
      callback(list);
    }, (err) => {
      console.warn('Realtime listener error for agency letters:', err);
    });
  } catch (e) {
    console.warn('Could not initialize snapshot listener for agency letters:', e);
    return () => {};
  }
}

// Utility: Convert File to Base64 data URL
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
