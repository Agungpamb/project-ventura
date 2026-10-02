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

export const createDefaultVillageResume = (projectId: string, desaName: string, kecamatan = '', kabupaten = ''): VillageResume => {
  const cleanDesa = desaName.trim().toUpperCase();
  const id = `${projectId}_${cleanDesa.replace(/[^a-zA-Z0-9]/g, '_')}`;
  return {
    id,
    projectId,
    desaName: cleanDesa,
    kecamatan,
    kabupaten,
    baSosialisasiAwal: createEmptyStageDoc(),
    baPengumuman: createEmptyStageDoc(),
    lampiranBapt: createEmptyStageDoc(),
    baPenyampaianNilai: createEmptyStageDoc(),
    baSerahTerimaRekening: createEmptyStageDoc(),
    bushClearing: createEmptyStageDoc(),
    lastUpdated: Date.now(),
    updatedBy: 'Sistem'
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
  // 1. Primary Engine: If Google Sheets connection is available, pull directly from RESUME_SEMUA_JALUR
  if (googleContext?.accessToken && googleContext?.spreadsheetId) {
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
      console.warn("Gagal memuat resumes dari Google Sheets tab RESUME_SEMUA_JALUR:", sheetErr);
    }
  }

  // 2. Firestore Cloud query
  try {
    const resumesRef = collection(db, 'village_resumes');
    const q = query(resumesRef, where('projectId', '==', projectId));
    const snap = await withTimeout(getDocs(q), 10000);
    
    if (!snap.empty) {
      const list: VillageResume[] = [];
      snap.forEach(docSnap => {
        list.push(docSnap.data() as VillageResume);
      });
      // Save to localStorage as backup
      localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Gagal memuat village resumes dari Firestore, beralih ke cache lokal:', err);
  }

  // 3. Fallback to local storage
  const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${projectId}`);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      console.error('Error parsing cached village resumes:', e);
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

  // 1. Save to LocalStorage immediately for instant offline/local UX
  try {
    const cached = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${resume.projectId}`);
    let current: VillageResume[] = [];
    if (cached) {
      try { current = JSON.parse(cached); } catch {}
    }
    const index = current.findIndex(r => r.id === resume.id);
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

  // 2. Persist directly to Google Sheets RESUME_SEMUA_JALUR (1 Workbook)
  let sheetSynced = false;
  if (googleContext?.accessToken && googleContext?.spreadsheetId) {
    try {
      const sheetRes = await saveVillageResumeToSheet(
        googleContext.accessToken,
        googleContext.spreadsheetId,
        updatedResume,
        googleContext.projectName || 'Proyek Ventura',
        googleContext.totalBidang || 0,
        googleContext.totalLuas || 0,
        googleContext.progressPct || 0
      );
      sheetSynced = sheetRes.success;
      if (sheetSynced) {
        console.log(`[1 Workbook Sheet] Desa ${resume.desaName} berhasil disimpan ke tab RESUME_SEMUA_JALUR di Google Sheets!`);
      }
    } catch (sheetErr) {
      console.warn("Gagal simpan ke Google Sheets tab RESUME_SEMUA_JALUR:", sheetErr);
    }
  }

  // 3. Persist to Firestore with safety timeout (Dual Engine)
  let cloudSynced = false;
  let firestoreError: string | undefined;
  try {
    const resumeRef = doc(db, 'village_resumes', resume.id);
    const sanitized = sanitizeForFirestore(updatedResume);
    await withTimeout(setDoc(resumeRef, sanitized, { merge: true }), 12000);
    console.log(`[Resume Project] Desa ${resume.desaName} berhasil disinkronkan ke Firestore Cloud!`);
    cloudSynced = true;
  } catch (err: any) {
    const errMessage = err?.message || String(err);
    console.warn('Gagal menyimpan village resume ke Firestore:', err);
    firestoreError = errMessage.includes('exceeds maximum size') 
      ? 'Ukuran berkas melebihi batas 1MB Firestore.' 
      : 'Firestore dibatasi izin.';
  }

  return {
    success: true,
    cloudSynced,
    sheetSynced,
    error: (!cloudSynced && !sheetSynced) ? firestoreError : undefined
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

    let points = 0;
    const stages = [r.baSosialisasiAwal, r.baPengumuman, r.lampiranBapt, r.baPenyampaianNilai, r.baSerahTerimaRekening, r.bushClearing];
    stages.forEach(s => {
      if (s?.status === 'SELESAI') points += 100 / 6;
      else if (s?.status === 'PROSES') points += 50 / 6;
    });
    const pct = Math.round(points);

    return {
      'NO': idx + 1,
      'JALUR KOMPENSASI': projName,
      'ID JALUR': r.projectId,
      'DESA': r.desaName,
      'KECAMATAN': r.kecamatan || '',
      'KABUPATEN': r.kabupaten || '',
      'PROGRES (%)': `${pct}%`,
      '1. PENDAHULUAN - STATUS': r.baSosialisasiAwal?.status || 'BELUM',
      '1. PENDAHULUAN - TANGGAL': r.baSosialisasiAwal?.date || '',
      '1. PENDAHULUAN - LINK DRIVE': r.baSosialisasiAwal?.pdfUrl || '',
      '1. PENDAHULUAN - CATATAN': r.baSosialisasiAwal?.notes || '',
      '2. PENGUMUMAN INV - STATUS': r.baPengumuman?.status || 'BELUM',
      '2. PENGUMUMAN INV - TANGGAL': r.baPengumuman?.date || '',
      '2. PENGUMUMAN INV - LINK DRIVE': r.baPengumuman?.pdfUrl || '',
      '2. PENGUMUMAN INV - CATATAN': r.baPengumuman?.notes || '',
      '3. BAPT REGISTER - STATUS': r.lampiranBapt?.status || 'BELUM',
      '3. BAPT REGISTER - TANGGAL': r.lampiranBapt?.date || '',
      '3. BAPT REGISTER - LINK DRIVE': r.lampiranBapt?.pdfUrl || '',
      '3. BAPT REGISTER - CATATAN': r.lampiranBapt?.notes || '',
      '4. PENYAMPAIAN NILAI - STATUS': r.baPenyampaianNilai?.status || 'BELUM',
      '4. PENYAMPAIAN NILAI - TANGGAL': r.baPenyampaianNilai?.date || '',
      '4. PENYAMPAIAN NILAI - LINK DRIVE': r.baPenyampaianNilai?.pdfUrl || '',
      '4. PENYAMPAIAN NILAI - CATATAN': r.baPenyampaianNilai?.notes || '',
      '5. PEMBAYARAN KOMP - STATUS': r.baSerahTerimaRekening?.status || 'BELUM',
      '5. PEMBAYARAN KOMP - TANGGAL': r.baSerahTerimaRekening?.date || '',
      '5. PEMBAYARAN KOMP - LINK DRIVE': r.baSerahTerimaRekening?.pdfUrl || '',
      '5. PEMBAYARAN KOMP - CATATAN': r.baSerahTerimaRekening?.notes || '',
      '6. BUSH CLEARING - STATUS': r.bushClearing?.status || 'BELUM',
      '6. BUSH CLEARING - TANGGAL': r.bushClearing?.date || '',
      '6. BUSH CLEARING - LINK DRIVE': r.bushClearing?.pdfUrl || (r.bushClearing?.docPhotos?.[0] || ''),
      '6. BUSH CLEARING - CATATAN': r.bushClearing?.notes || '',
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
 * 1. RESUME_PROYEK (Nama desa otomatis digenerate dari data yang ada di daftar nominatif & resume)
 * 2. SURAT_INSTANSI (Data surat menyurat dinas/instansi untuk jalur ini)
 * 3. DAFTAR_NOMINATIF (Rincian bidang tanah, pemilik, alas hak, dan link drive)
 * 
 * Memenuhi kebutuhan pengguna agar excel dibuat perjalur untuk mempermudah QC,
 * pengamatan, dan maintenance, serta surat instansi langsung diwadahi dalam satu file terpadu.
 */
export function generateJalurWorkbookExcel(
  project: ProjectConfig,
  villageResumes: VillageResume[],
  records: LandRecord[],
  letters: AgencyLetter[] = []
): void {
  const wb = XLSX.utils.book_new();

  // 1. OTOMATIS GENERATE NAMA DESA DARI DATA YANG ADA
  const desasFromRecords = Array.from(new Set(records.map(r => (r.DESA || '').trim().toUpperCase()).filter(Boolean)));
  const desasFromResumes = Array.from(new Set(villageResumes.map(r => (r.desaName || '').trim().toUpperCase()).filter(Boolean)));
  const allUniqueDesas = Array.from(new Set([...desasFromRecords, ...desasFromResumes])).sort((a, b) => a.localeCompare(b));

  const activeStages = (project.resumeStages || DEFAULT_RESUME_STAGES).filter(s => s.active !== false);

  const resumeRows = allUniqueDesas.map((desaName, idx) => {
    const existingResume = villageResumes.find(r => (r.desaName || '').trim().toUpperCase() === desaName);
    const desaRecords = records.filter(r => (r.DESA || '').trim().toUpperCase() === desaName);
    
    const totalBidang = desaRecords.length;
    const totalLuas = desaRecords.reduce((sum, r) => sum + (parseFloat(String(r.LUAS || '0').replace(',', '.')) || 0), 0);
    const kecamatan = existingResume?.kecamatan || desaRecords[0]?.KECAMATAN || '';
    const kabupaten = existingResume?.kabupaten || desaRecords[0]?.KABUPATEN || '';

    // Hitung persentase progres berdasarkan tahapan aktif
    let points = 0;
    activeStages.forEach(st => {
      const stageDoc = existingResume ? (existingResume as any)[st.key] : null;
      if (stageDoc?.status === 'SELESAI') points += 100 / activeStages.length;
      else if (stageDoc?.status === 'PROSES') points += 50 / activeStages.length;
    });
    const pct = Math.min(100, Math.round(points));

    return {
      'NO': idx + 1,
      'JALUR KOMPENSASI': project.name,
      'DESA': desaName,
      'KECAMATAN': kecamatan,
      'KABUPATEN': kabupaten,
      'TOTAL BIDANG': totalBidang > 0 ? totalBidang : (existingResume ? '-' : 0),
      'TOTAL LUAS (M2)': totalLuas > 0 ? Math.round(totalLuas * 100) / 100 : '-',
      'PROGRES (%)': `${pct}%`,
      '1. PENDAHULUAN - STATUS': existingResume?.baSosialisasiAwal?.status || 'BELUM',
      '1. PENDAHULUAN - TANGGAL': existingResume?.baSosialisasiAwal?.date || '',
      '1. PENDAHULUAN - LINK BUKTI DRIVE': existingResume?.baSosialisasiAwal?.pdfUrl || '',
      '1. PENDAHULUAN - CATATAN': existingResume?.baSosialisasiAwal?.notes || '',
      '2. PENGUMUMAN INV - STATUS': existingResume?.baPengumuman?.status || 'BELUM',
      '2. PENGUMUMAN INV - TANGGAL': existingResume?.baPengumuman?.date || '',
      '2. PENGUMUMAN INV - LINK BUKTI DRIVE': existingResume?.baPengumuman?.pdfUrl || '',
      '2. PENGUMUMAN INV - CATATAN': existingResume?.baPengumuman?.notes || '',
      '3. BAPT REGISTER - STATUS': existingResume?.lampiranBapt?.status || 'BELUM',
      '3. BAPT REGISTER - TANGGAL': existingResume?.lampiranBapt?.date || '',
      '3. BAPT REGISTER - LINK BUKTI DRIVE': existingResume?.lampiranBapt?.pdfUrl || '',
      '3. BAPT REGISTER - CATATAN': existingResume?.lampiranBapt?.notes || '',
      '4. PENYAMPAIAN NILAI - STATUS': existingResume?.baPenyampaianNilai?.status || 'BELUM',
      '4. PENYAMPAIAN NILAI - TANGGAL': existingResume?.baPenyampaianNilai?.date || '',
      '4. PENYAMPAIAN NILAI - LINK BUKTI DRIVE': existingResume?.baPenyampaianNilai?.pdfUrl || '',
      '4. PENYAMPAIAN NILAI - CATATAN': existingResume?.baPenyampaianNilai?.notes || '',
      '5. PEMBAYARAN KOMP - STATUS': existingResume?.baSerahTerimaRekening?.status || 'BELUM',
      '5. PEMBAYARAN KOMP - TANGGAL': existingResume?.baSerahTerimaRekening?.date || '',
      '5. PEMBAYARAN KOMP - LINK BUKTI DRIVE': existingResume?.baSerahTerimaRekening?.pdfUrl || '',
      '5. PEMBAYARAN KOMP - CATATAN': existingResume?.baSerahTerimaRekening?.notes || '',
      '6. BUSH CLEARING - STATUS': existingResume?.bushClearing?.status || 'BELUM',
      '6. BUSH CLEARING - TANGGAL': existingResume?.bushClearing?.date || '',
      '6. BUSH CLEARING - LINK BUKTI DRIVE': existingResume?.bushClearing?.pdfUrl || (existingResume?.bushClearing?.docPhotos?.[0] || ''),
      '6. BUSH CLEARING - CATATAN': existingResume?.bushClearing?.notes || '',
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

export async function deleteVillageResume(projectId: string, resumeId: string): Promise<void> {
  // 1. LocalStorage
  try {
    const raw = localStorage.getItem(`${VILLAGE_CACHE_PREFIX}${projectId}`);
    let current: VillageResume[] = [];
    if (raw) {
      try { current = JSON.parse(raw); } catch {}
    }
    const filtered = current.filter(r => r.id !== resumeId);
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
        list.push(d.data() as VillageResume);
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
        updatedLetter,
        options.projectName || ''
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
