import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot 
} from 'firebase/firestore';
import type { VillageResume, AgencyLetter, VillageStageDoc, StageStatus } from '../types';

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
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> {
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

// ----------------- VILLAGE RESUME FUNCTIONS -----------------

export async function loadVillageResumes(projectId: string): Promise<VillageResume[]> {
  try {
    const resumesRef = collection(db, 'village_resumes');
    const q = query(resumesRef, where('projectId', '==', projectId));
    const snap = await withTimeout(getDocs(q), 2500);
    
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

  // Fallback to local storage
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

export async function saveVillageResume(resume: VillageResume): Promise<void> {
  const updatedResume: VillageResume = {
    ...resume,
    lastUpdated: Date.now()
  };

  // 1. Save to LocalStorage immediately for instant UX
  try {
    const current = await loadVillageResumes(resume.projectId);
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

  // 2. Persist to Firestore with safety timeout
  try {
    const resumeRef = doc(db, 'village_resumes', resume.id);
    await withTimeout(setDoc(resumeRef, updatedResume, { merge: true }), 2500);
  } catch (err) {
    console.warn('Gagal menyimpan village resume ke Firestore:', err);
  }
}

export function subscribeVillageResumes(
  projectId: string, 
  callback: (resumes: VillageResume[]) => void
) {
  try {
    const resumesRef = collection(db, 'village_resumes');
    const q = query(resumesRef, where('projectId', '==', projectId));
    return onSnapshot(q, (snapshot) => {
      const list: VillageResume[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as VillageResume);
      });
      if (list.length > 0) {
        localStorage.setItem(`${VILLAGE_CACHE_PREFIX}${projectId}`, JSON.stringify(list));
        callback(list);
      }
    }, (err) => {
      console.warn('Realtime listener error for village resumes:', err);
    });
  } catch (e) {
    console.warn('Could not initialize snapshot listener for village resumes:', e);
    return () => {};
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

export async function saveAgencyLetter(letter: AgencyLetter): Promise<void> {
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

  // 2. Firestore
  try {
    const letterRef = doc(db, 'agency_letters', letter.id);
    await withTimeout(setDoc(letterRef, updatedLetter, { merge: true }), 2500);
  } catch (err) {
    console.warn('Gagal simpan agency letter ke Firestore:', err);
  }
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
