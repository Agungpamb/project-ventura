import * as pdfjsLib from 'pdfjs-dist';
// Vite native URL worker import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as XLSX from 'xlsx';

// Configure worker for pdfjs in browser environments
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export interface EsdmPlantData {
  namaPenggarap?: string;
  jenis: string;
  belum_menghasilkan: number;
  sudah_menghasilkan: number;
  kecil: number;
  sedang: number;
  besar: number;
  total: number;
}

export interface EsdmBuildingData {
  subBidang?: string;
  pemilik?: string;
  luas?: number;
  bentuk?: string;
  jenis?: string;
}

export interface EsdmBidangData {
  id: string;
  no: number;
  span: string; // e.g. "T.45 - T.46"
  nobid: string; // e.g. "1"
  pihakBerhak: string; // e.g. "Pemilik Diketahui"
  nama: string; // e.g. "MURDANTO" or "PT. Perkebunan Nusantara I Regional 3"
  nik: string; // e.g. "3322083112550030"
  alamat: string;
  jenisAlasHak: string;
  nomerAlasHak: string;
  luasTanah: number; // in m2
  penutupLahan: string;
  statusTanah: string;
  subBidang?: string;
  bangunan: EsdmBuildingData[];
  tanaman: EsdmPlantData[];
  pageNumber: number;
  source?: 'EXCEL' | 'PDF' | 'HYBRID' | 'TEXT' | 'DEMO';
  pdfCrossCheck?: {
    pdfFound: boolean;
    luasTanahPdf?: number;
    namaPdf?: string;
    alasHakPdf?: string;
    statusMatch?: 'MATCH' | 'DIFF_LUAS' | 'DIFF_NAMA' | 'PDF_ONLY' | 'EXCEL_ONLY';
    notes?: string[];
  };
}

export interface EsdmSheetInfo {
  name: string;
  rowCount: number;
  type: 'TANAH' | 'BANGUNAN' | 'TANAMAN' | 'NOMINATIF' | 'REKAP' | 'OTHER';
  bidangCount?: number;
}

export interface EsdmHybridSummary {
  excelFileName: string;
  pdfFileName: string;
  excelBidangCount: number;
  pdfBidangCount: number;
  matchedCount: number;
  enrichedAlasHakCount: number;
  discrepancyCount: number;
  mismatchNotes?: string[];
}

export interface EsdmPdfParseResult {
  metadata: {
    judul: string;
    proyek: string;
    kabupaten: string;
    kecamatan: string;
    desa: string;
    totalPages: number;
    totalBidang: number;
    totalTanamanCount: number;
    sourceType?: 'PDF' | 'EXCEL' | 'TEXT' | 'DEMO' | 'HYBRID';
    isScanned?: boolean;
    fileName?: string;
    excelFileName?: string;
    pdfFileName?: string;
    sheetNames?: string[];
    activeSheet?: string;
    sheetDetails?: EsdmSheetInfo[];
    isMergedFromSheets?: boolean;
    mergeNote?: string;
    hybridSummary?: EsdmHybridSummary;
  };
  bidangList: EsdmBidangData[];
  rawPagesText: string[];
}

/**
 * Normalizes numbers from Indonesian formatting e.g. "6.665,00" -> 6665
 * or standard floats "6665.00" -> 6665
 */
export function parseIndoNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  // Remove non-numeric except digits, commas, dots, and minus
  const cleanStr = str.replace(/[^\d.,-]/g, '');
  if (!cleanStr) return 0;

  // Indonesian format: 1.234,56 (dot thousands, comma decimal)
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    const lastDot = cleanStr.lastIndexOf('.');
    const lastComma = cleanStr.lastIndexOf(',');
    if (lastComma > lastDot) {
      // 1.234,56
      const num = parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
      return isNaN(num) ? 0 : num;
    } else {
      // 1,234.56 (US format)
      const num = parseFloat(cleanStr.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    }
  } else if (cleanStr.includes(',')) {
    // e.g. 110,00 or 110,5
    const num = parseFloat(cleanStr.replace(',', '.'));
    return isNaN(num) ? 0 : num;
  } else {
    // e.g. 6665 or 6665.00
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  }
}

/**
 * Standardize plant names for comparison
 */
export function normalizePlantName(name: string): string {
  if (!name) return '';
  return name
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Universally extract Span string from any variation:
 * - "T.45 - T.46", "T45 - T46", "T45-T46", "Tower 45 - Tower 46", "T.45 - 46", "TWR 45 - TWR 46", "T.45 / T.46"
 */
export function extractSpanPattern(str: string): { span: string; spanRaw: string; t1: string; t2: string } | null {
  if (!str) return null;
  // Match span format:
  // e.g. "T.75 - T.76", "T75 - T76", "Tower 75 - Tower 76", "T.75 - 76", "T75-76", "T.75/T.76", "T75 s/d T76"
  const regex = /\b(?:T(?:OWER|WR)?\.?\s*(\d+[A-Za-z]?))\s*(?:[-–—/]|S\/D|SAMPAI|TO)\s*(?:(T(?:OWER|WR)?\.?\s*)?(\d+[A-Za-z]?))\b/i;
  const match = str.match(regex);
  if (match) {
    const t1 = match[1].toUpperCase();
    const hasT2Prefix = Boolean(match[2]);
    const t2 = match[3].toUpperCase();

    // If second tower does NOT have a "T." / "Tower" prefix, check that t1 and t2 are adjacent in ascending order
    // In transmission lines, spans are between adjacent towers (e.g. T.75 - 76, T.5 - 6).
    // A string like "T.5 - 4" or "T.5 - 1" is NOT a span; "4" or "1" is the No. Bidang!
    const n1 = parseInt(t1, 10);
    const n2 = parseInt(t2, 10);
    if (!hasT2Prefix) {
      if (isNaN(n1) || isNaN(n2) || n2 <= n1 || (n2 - n1) > 2) {
        return null;
      }
    } else if (!isNaN(n1) && !isNaN(n2)) {
      if (Math.abs(n1 - n2) > 3) {
        return null;
      }
    }

    return {
      span: `T.${t1} - T.${t2}`,
      spanRaw: match[0],
      t1,
      t2,
    };
  }
  return null;
}

/**
 * Parse lines into structured Bidang list using an intelligent multiline state-machine.
 * This handles multi-page tables, wrapped headers, and continued plant rows.
 */
export function parseEsdmLines(allLines: Array<{ text: string; pageNumber: number }>, initialDesa = ''): {
  bidangList: EsdmBidangData[];
  metadata: {
    judul: string;
    proyek: string;
    kabupaten: string;
    kecamatan: string;
    desa: string;
    totalPages: number;
    totalBidang: number;
    totalTanamanCount: number;
    sourceType?: 'PDF' | 'EXCEL' | 'TEXT' | 'DEMO';
    isScanned?: boolean;
    fileName?: string;
  };
} {
  const metadata = {
    judul: 'DAFTAR NOMINATIF INVENTARISASI TANAH, BANGUNAN DAN/ATAU TANAMAN',
    proyek: '',
    kabupaten: '',
    kecamatan: '',
    desa: initialDesa,
    totalPages: 1,
    totalBidang: 0,
    totalTanamanCount: 0,
    sourceType: 'PDF' as const,
    isScanned: false,
    fileName: '',
  };

  const bidangList: EsdmBidangData[] = [];
  let currentBidang: EsdmBidangData | null = null;
  let activeSpan = '';

  const startNewBidang = (
    rowNo: number,
    span: string,
    nobid: string,
    namaCandidate: string,
    pageNumber: number
  ): EsdmBidangData => {
    const cleanSpan = span.trim();
    const cleanNobid = nobid.replace(/^0+/, '') || '0';
    activeSpan = cleanSpan;

    let cleanNama = (namaCandidate || '')
      .replace(/^(?:Pemilik(?:\s+(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?)?|Penggarap|Pemerintah(?:\s+Desa|\s+Kabupaten)?)\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const newBidang: EsdmBidangData = {
      id: `ESDM_${metadata.desa || 'DESA'}_${cleanSpan.replace(/[\s.-]/g, '')}_${cleanNobid}_${rowNo}`,
      no: rowNo,
      span: cleanSpan,
      nobid: cleanNobid,
      pihakBerhak: 'Pemilik Diketahui',
      nama: cleanNama,
      nik: '',
      alamat: '',
      jenisAlasHak: '',
      nomerAlasHak: '',
      luasTanah: 0,
      penutupLahan: '',
      statusTanah: '',
      bangunan: [],
      tanaman: [],
      pageNumber,
    };
    bidangList.push(newBidang);
    currentBidang = newBidang;
    return newBidang;
  };

  for (let i = 0; i < allLines.length; i++) {
    const { text, pageNumber } = allLines[i];
    metadata.totalPages = Math.max(metadata.totalPages, pageNumber);
    const line = text.trim();
    if (!line) continue;

    // 1. Detect metadata headers
    if (!metadata.desa || !metadata.kabupaten || !metadata.kecamatan) {
      const mLoc = line.match(/KABUPATEN\/KOTA\s+(.*?)\s+KECAMATAN\s+(.*?)\s+DESA\/KELURAHAN\s+(.*)/i);
      if (mLoc) {
        metadata.kabupaten = mLoc[1].trim();
        metadata.kecamatan = mLoc[2].trim();
        metadata.desa = mLoc[3].trim();
      } else {
        const mDesaOnly = line.match(/DESA(?:\/KELURAHAN)?\s*[:\s]\s*([A-Za-z\s]+)/i);
        if (mDesaOnly && !metadata.desa) metadata.desa = mDesaOnly[1].trim();
        const mKecOnly = line.match(/KECAMATAN\s*[:\s]\s*([A-Za-z\s]+)/i);
        if (mKecOnly && !metadata.kecamatan) metadata.kecamatan = mKecOnly[1].trim();
        const mKabOnly = line.match(/KABUPATEN(?:\/KOTA)?\s*[:\s]\s*([A-Za-z\s]+)/i);
        if (mKabOnly && !metadata.kabupaten) metadata.kabupaten = mKabOnly[1].trim();
      }
    }
    if (!metadata.proyek && /SUTT|SUTET|TRANSMISI|REC\s+2CCT/i.test(line) && !line.includes('DAFTAR NOMINATIF')) {
      metadata.proyek = line.trim();
    }

    // Skip table column headers and page headers
    if (
      /\bNo\s+Span\b/i.test(line) ||
      /\bNo\.\s*Bidang\b/i.test(line) ||
      /\bPihak\s+Yang\s+Berhak\b/i.test(line) ||
      /\bIdentitas\s+Bukti\b/i.test(line) ||
      /\bKepemilikan\s+Penguasaan\b/i.test(line) ||
      /\bPenguasaan\s*\/\s*Kepemilikan\b/i.test(line) ||
      /\bPenutup\s+Lahan\b/i.test(line) ||
      /\bStatus\s+Tanah\b/i.test(line) ||
      /\bPemilik\s+Bangunan\b/i.test(line) ||
      /\bNama\s+Penggarap\b/i.test(line) ||
      /\bJenis\s+Tanaman\b/i.test(line) ||
      /\bBelum\s+Menghasilkan\b/i.test(line) ||
      /\bSudah\s+Menghasilkan\b/i.test(line) ||
      /\bKecil\s+Sedang\s+Besar\b/i.test(line) ||
      /\bTanaman\s+Produksi\b/i.test(line) ||
      /\bTanaman\s+Keras\b/i.test(line) ||
      /\bTanda\s*Tangan\b/i.test(line) ||
      /\bDAFTAR\s+NOMINATIF\b/i.test(line) ||
      /^(?:No|Span|No\.\s*Bidang|Pihak|Identitas|Bukti|Tanah|Bangunan|Tanaman|Tanda\s*Tangan)$/i.test(line) ||
      /^(?:Yang\s*Berhak|Penguasaan|Kepemilikan|Penutup\s*Lahan|Status|Sub\s*Bidang)$/i.test(line) ||
      /^(?:Pemilik\s*Bangunan|Bentuk\s*Jenis|Nama\s*Penggarap|Jenis\s*Tanaman)$/i.test(line) ||
      /^(?:Jumlah\s*Tanaman|Belum\s*Menghasilkan|Sudah\s*Menghasilkan|Kecil\s*Sedang\s*Besar)$/i.test(line)
    ) {
      continue;
    }

    // Skip signature blocks / page footers
    if (
      /\bTenaga\s*Teknik\b/i.test(line) ||
      /\bOperator\s*Madya\b/i.test(line) ||
      /\bPelaksana\s*Madya\b/i.test(line) ||
      /\bTeknisi\s*Muda\b/i.test(line) ||
      /\bAnalis\s*Muda\b/i.test(line) ||
      /\bKepala\s*Desa\b/i.test(line) ||
      /\bLurah\b/i.test(line) ||
      /\bMengetahui\s*,/i.test(line) ||
      /\bArdine\s*Bagus\b/i.test(line) ||
      /\bLukman\s*Dwi\b/i.test(line) ||
      /\bPrastyanto\b/i.test(line) ||
      /\bFernanda\b/i.test(line)
    ) {
      continue;
    }

    // 2. Check Plant line (strictly requiring the 5 standard ESDM category numbers: BM, SM, K, S, B)
    // Example: "GAMAL 0 0 9 14 0" or "KOPI 0 31 0 0 0" or "KEMENTERIAN PU JAMBU 0 1 0 0 0"
    const plantMatch5 = line.match(/(?:(?:(\d{10,20}))?\s*([A-Za-z\s.,'-]+?)\s+)?([A-Za-z\s/'-]+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (plantMatch5) {
      const rawPlant = plantMatch5[3].trim().toUpperCase();
      const forbiddenWords = [
        'JUMLAH', 'TOTAL', 'LUAS', 'KECIL', 'BESAR', 'SEDANG', 'SUB', 'BIDANG',
        'PRODUKSI', 'KERAS', 'BULANAN', 'TAHUNAN', 'NOMOR', 'NO', 'SERTIFIKAT',
        'SERTIPIKAT', 'HAK', 'SPORADIK', 'LETTER', 'DUSUN', 'DESA', 'KECAMATAN',
        'KABUPATEN', 'RT', 'RW', 'TANAH', 'BANGUNAN', 'HALAMAN', 'PAGE'
      ];
      if (!forbiddenWords.includes(rawPlant) && rawPlant.length >= 2 && !/^\d+$/.test(rawPlant)) {
        if (currentBidang) {
          const bm = parseInt(plantMatch5[4], 10) || 0;
          const sm = parseInt(plantMatch5[5], 10) || 0;
          const k = parseInt(plantMatch5[6], 10) || 0;
          const s = parseInt(plantMatch5[7], 10) || 0;
          const b = parseInt(plantMatch5[8], 10) || 0;
          const total = bm + sm + k + s + b;

          currentBidang.tanaman.push({
            namaPenggarap: plantMatch5[2]?.trim(),
            jenis: rawPlant,
            belum_menghasilkan: bm,
            sudah_menghasilkan: sm,
            kecil: k,
            sedang: s,
            besar: b,
            total,
          });
          metadata.totalTanamanCount += total;

          // Reinforce NIK (>= 10 digits) and Owner/Penggarap name if missing or partial
          if (plantMatch5[1] && !currentBidang.nik) {
            currentBidang.nik = plantMatch5[1];
          }
          if (plantMatch5[2]) {
            const pOwner = plantMatch5[2]
              .replace(/^(?:Pemilik(?:\s+(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?)?|Penggarap|Pemerintah(?:\s+Desa|\s+Kabupaten)?)\s*/i, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (pOwner && pOwner.length >= 3 && !forbiddenWords.includes(pOwner.toUpperCase())) {
              const curUpper = (currentBidang.nama || '').toUpperCase();
              const pUpper = pOwner.toUpperCase();
              if (
                !currentBidang.nama ||
                /^Pemilik/i.test(currentBidang.nama) ||
                (pUpper.includes(curUpper) && pOwner.length > currentBidang.nama.length) ||
                (curUpper.includes(pUpper) && /^Pemilik/i.test(currentBidang.nama))
              ) {
                currentBidang.nama = pOwner;
              }
            }
          }
        }
        continue;
      }
    }

    // 2b. Check Building line (Sub Bidang & Bangunan)
    // Examples from PDF:
    // "3A PEMERINTAH DESA KANDANGAN 2,00 GUBUG - Lantai 1 Non Permanen"
    // "15A 3322114904890004 SITI MUSTAINAH 90,00 RUMAH - Lantai 1 Permanen"
    // "20A 3322110802550001 JUMERIN 65,00 RUMAH - Lantai 1 Permanen"
    // "A 3322112410630001 DAMAN 6,00 KANDANG - Lantai 1 Permanen"
    // "9A 3322113003780001 MOKHAMAD AFENDI 5,00 GUBUG - Lantai 1 Non Permanen"
    const buildingMatch = line.match(/^(?:(\d+[A-Za-z]?|[A-Za-z]))?\s*(?:(\d{10,20})\s+)?([A-Za-z\s.,'-]+?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s+((?:GUBUG|RUMAH|KANDANG|TOKO|GUDANG|PAGAR|TERAS|BANGUNAN).*?)\s+(Permanen|Semi\s*Permanen|Non\s*Permanen)$/i);
    if (buildingMatch) {
      const subBidang = buildingMatch[1]?.trim() || '';
      const bNik = buildingMatch[2]?.trim() || '';
      const bPemilik = buildingMatch[3]?.trim() || '';
      const bLuas = parseIndoNumber(buildingMatch[4]) || 0;
      const bBentuk = buildingMatch[5]?.trim() || '';
      const bJenis = buildingMatch[6]?.trim() || '';

      if (currentBidang) {
        currentBidang.bangunan.push({
          pemilik: bPemilik,
          luas: bLuas,
          bentuk: bBentuk,
          jenis: bJenis,
        });
        if (subBidang && !currentBidang.subBidang) {
          currentBidang.subBidang = subBidang;
        }
        if (bNik && !currentBidang.nik) {
          currentBidang.nik = bNik;
        }
      }
      continue;
    }

    // 3. Check Row Start Patterns:
    // Pattern A: Standard grouped row from PDF:
    // e.g. "1 T.75 - 1 Pemilik TOLABUL Sertifikat / 147,00 Perkebunan Tanah Masyarakat"
    // or "19 T.76 - 1 Pemilik Diketahui BASRODIN..."
    // or "1 T.75 - T.76 1 Pemilik TOLABUL..."
    const standardRowRegex = /^(\d+)\s+T\.?\s*(\d+[A-Za-z]?)\s*[-–]\s*(?:T\.?\s*(\d+[A-Za-z]?)\s+)?(\d+[A-Za-z]?)(?:\s+(.*))?$/i;
    const matchStd = line.match(standardRowRegex);
    if (matchStd) {
      const rowNo = parseInt(matchStd[1], 10) || (bidangList.length + 1);
      const t1 = matchStd[2].toUpperCase();
      let t2 = matchStd[3] ? matchStd[3].toUpperCase() : '';
      const nobid = matchStd[4] || '1';
      let remainder = (matchStd[5] || '').trim();

      // 1. Extract Luas + Penutup + Status from end of remainder if present
      let luasTanah = 0;
      let penutupLahan = '';
      let statusTanah = '';

      const luasStatusRegex = /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?:\s+(.*?))?\s+(Tanah Masyarakat|Barang Milik Daerah|Barang Milik Negara|Aset Desa|Aset Badan Usaha Milik Negara|Aset Pemerintah|Tanah Kas Desa|Tanah Wakaf|Aset BUMN)$/i;
      const luasStatusM = remainder.match(luasStatusRegex);
      if (luasStatusM && luasStatusM.index !== undefined) {
        luasTanah = parseIndoNumber(luasStatusM[1]);
        penutupLahan = (luasStatusM[2] || '').trim();
        statusTanah = luasStatusM[3].trim();
        remainder = remainder.substring(0, luasStatusM.index).trim();
      }

      // 2. Extract Pihak Yang Berhak prefix if present
      let pihakBerhak = 'Pemilik Diketahui';
      const mPihak = remainder.match(/^(Pemilik(?:\s+(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?)?|Penggarap|Pemerintah(?:\s+Desa|\s+Kabupaten)?)\s*/i);
      if (mPihak) {
        pihakBerhak = mPihak[1].trim();
        remainder = remainder.substring(mPihak[0].length).trim();
      }
      if (/^Tidak\s+/i.test(remainder)) {
        pihakBerhak = 'Pemilik Tidak Diketahui Keberadaannya';
        remainder = remainder.replace(/^Tidak\s+/i, '').trim();
      }

      // 3. Separate Name Part 1 and Alas Hak Part 1 from remaining string
      let namaPart = remainder;
      let alasPart = '';
      const mAlasSplit = remainder.match(/(?:^|\s+)(Non\s*Sertipikat(?:\s*\/)?|Sertifikat(?:\s*\/)?|Sertipikat(?:\s*\/)?|Sporadik|Letter\s*[-–]?\s*C|Girik|Hak\s*Milik|Hak\s*Guna\s*Bangunan|Surat\s*Keterangan|Lainnya)(.*)/i);
      if (mAlasSplit && mAlasSplit.index !== undefined) {
        const splitIdx = remainder.search(/(?:^|\s+)(Non\s*Sertipikat(?:\s*\/)?|Sertifikat(?:\s*\/)?|Sertipikat(?:\s*\/)?|Sporadik|Letter\s*[-–]?\s*C|Girik|Hak\s*Milik|Hak\s*Guna\s*Bangunan|Surat\s*Keterangan|Lainnya)/i);
        if (splitIdx >= 0) {
          namaPart = remainder.substring(0, splitIdx).trim();
          alasPart = remainder.substring(splitIdx).trim();
        }
      }

      // 4. Look ahead at line i+1 to absorb wrapped tower (t2), pihak, NIK, name, and alas hak
      let extractedNik = '';
      const nextLine = (allLines[i + 1]?.text || '').trim();
      const mNextTower = nextLine.match(/^T\.?\s*(\d+[A-Za-z]?)(?:\s+(.*))?$/i);

      if (mNextTower) {
        // Tower 2 is on line i+1
        if (!t2) {
          t2 = mNextTower[1].toUpperCase();
        }
        let remNext = (mNextTower[2] || '').trim();
        if (remNext) {
          // Check continuation of Pihak (e.g. "Diketahui")
          const mPihakCont = remNext.match(/^(Diketahui(?:\s+Keberadaannya)?|Tidak\s+Diketahui)\s*/i);
          if (mPihakCont) {
            if (/^Pemilik$/i.test(pihakBerhak)) {
              pihakBerhak = `Pemilik ${mPihakCont[1].trim()}`;
            }
            remNext = remNext.substring(mPihakCont[0].length).trim();
          }

          // Check if NIK is in remNext (10-20 consecutive digits)
          const mNikRem = remNext.match(/\b(\d{10,20})\b/);
          if (mNikRem) {
            extractedNik = mNikRem[1];
            remNext = remNext.replace(/\b\d{10,20}\b/, '').trim();
          }

          // Check continuation of Luas / Penutup / Status if line wrapped
          if (luasTanah === 0) {
            const mFullNextLuas = remNext.match(luasStatusRegex);
            if (mFullNextLuas && mFullNextLuas.index !== undefined) {
              luasTanah = parseIndoNumber(mFullNextLuas[1]);
              penutupLahan = (mFullNextLuas[2] || '').trim();
              statusTanah = mFullNextLuas[3].trim();
              remNext = remNext.substring(0, mFullNextLuas.index).trim();
            } else {
              const mPartLuas = remainder.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s+(.*?)\s+(Tanah|Barang\s+Milik|Aset)$/i);
              if (mPartLuas && mPartLuas.index !== undefined) {
                const mNextEnd = remNext.match(/(?:(Tegalan|Sawah|Jalan|Pemukiman|Irigasi|Perkebunan)\s+)?(Masyarakat|Negara|Daerah|Desa|BUMN)$/i);
                if (mNextEnd) {
                  luasTanah = parseIndoNumber(mPartLuas[1]);
                  const p1 = (mPartLuas[2] || '').trim();
                  const p2 = (mNextEnd[1] || '').trim();
                  penutupLahan = [p1, p2].filter(Boolean).join(' ');
                  statusTanah = `${mPartLuas[3].trim()} ${mNextEnd[2].trim()}`.trim();
                  namaPart = namaPart.substring(0, mPartLuas.index).trim();
                  remNext = remNext.substring(0, mNextEnd.index).trim();
                }
              }
            }
          }

          // Check continuation of Alas Hak (e.g. "Sporadik", "Hak Milik", "Lainnya")
          const mAlasCont = remNext.match(/(?:^|\s+)(Sporadik|Hak\s*Milik|Hak\s*Guna\s*Bangunan|Letter\s*[-–]?\s*C|Girik|Sertifikat|Sertipikat|Lainnya|Non\s*Sertipikat)$/i);
          let n2 = '';
          let a2 = '';
          if (mAlasCont) {
            a2 = mAlasCont[1].trim();
            n2 = remNext.substring(0, remNext.length - mAlasCont[0].length).trim();
          } else if (/^(Sporadik|Hak\s*Milik|Hak\s*Guna\s*Bangunan|Letter\s*[-–]?\s*C|Girik|Sertifikat|Sertipikat|Lainnya|Non\s*Sertipikat)/i.test(remNext)) {
            a2 = remNext;
          } else {
            n2 = remNext;
          }

          if (n2) {
            namaPart = namaPart ? `${namaPart} ${n2}` : n2;
          }
          if (a2) {
            alasPart = alasPart ? `${alasPart} ${a2}`.replace(/\/\s+/, '/ ') : a2;
          }
        }
        // Consume line i+1
        i++;
      } else if (/^(?:Diketahui(?:\s+Keberadaannya)?|Tidak\s+Diketahui)\b/i.test(nextLine)) {
        // Wrapped pihak/nama/alas without T. prefix
        const mPihakOnly = nextLine.match(/^(Diketahui(?:\s+Keberadaannya)?|Tidak\s+Diketahui)(?:\s+(.*))?$/i);
        if (mPihakOnly) {
          if (/^Pemilik$/i.test(pihakBerhak)) {
            pihakBerhak = `Pemilik ${mPihakOnly[1].trim()}`;
          }
          let remOnly = (mPihakOnly[2] || '').trim();
          if (remOnly) {
            // Check NIK
            const mNikRem = remOnly.match(/\b(\d{10,20})\b/);
            if (mNikRem) {
              extractedNik = mNikRem[1];
              remOnly = remOnly.replace(/\b\d{10,20}\b/, '').trim();
            }

            const mAlasCont = remOnly.match(/(?:^|\s+)(Sporadik|Hak\s*Milik|Hak\s*Guna\s*Bangunan|Letter\s*[-–]?\s*C|Girik|Sertifikat|Sertipikat|Lainnya|Non\s*Sertipikat)$/i);
            let n2 = '';
            let a2 = '';
            if (mAlasCont) {
              a2 = mAlasCont[1].trim();
              n2 = remOnly.substring(0, remOnly.length - mAlasCont[0].length).trim();
            } else if (/^(Sporadik|Hak\s*Milik|Hak\s*Guna\s*Bangunan|Letter\s*[-–]?\s*C|Girik|Sertifikat|Sertipikat|Lainnya|Non\s*Sertipikat)/i.test(remOnly)) {
              a2 = remOnly;
            } else {
              n2 = remOnly;
            }
            if (n2) namaPart = namaPart ? `${namaPart} ${n2}` : n2;
            if (a2) alasPart = alasPart ? `${alasPart} ${a2}`.replace(/\/\s+/, '/ ') : a2;
          }
          // Consume line i+1
          i++;
        }
      }

      // If t2 was still not found:
      if (!t2) {
        for (let j = 1; j <= 3 && (i + j) < allLines.length; j++) {
          const nextText = allLines[i + j].text.trim();
          const mNextT = nextText.match(/\bT\.?\s*(\d+[A-Za-z]?)\b/i);
          if (mNextT) {
            const cand = mNextT[1].toUpperCase();
            const n1 = parseInt(t1, 10);
            const nCand = parseInt(cand, 10);
            if (!isNaN(n1) && !isNaN(nCand) && Math.abs(nCand - n1) <= 2) {
              t2 = cand;
              break;
            }
          }
        }
        if (!t2 && activeSpan) {
          const activeMatch = extractSpanPattern(activeSpan);
          if (activeMatch && activeMatch.t1 === t1) {
            t2 = activeMatch.t2;
          }
        }
        if (!t2) {
          const n1 = parseInt(t1, 10);
          t2 = !isNaN(n1) ? String(n1 + 1) : t1;
        }
      }

      // Clean namaPart
      namaPart = namaPart
        .replace(/^(?:Pemilik(?:\s+(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?)?|Penggarap|Pemerintah(?:\s+Desa|\s+Kabupaten)?)\s*/i, '')
        .replace(/^Tidak\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      const cleanSpan = `T.${t1} - T.${t2}`;
      const newBid = startNewBidang(rowNo, cleanSpan, nobid, namaPart, pageNumber);
      newBid.pihakBerhak = pihakBerhak;
      if (luasTanah > 0) newBid.luasTanah = luasTanah;
      if (penutupLahan) newBid.penutupLahan = penutupLahan;
      if (statusTanah) newBid.statusTanah = statusTanah;
      if (alasPart) newBid.jenisAlasHak = alasPart.replace(/^[/,\s-]+|[/,\s-]+$/g, '').trim();
      if (extractedNik) newBid.nik = extractedNik;

      // 5. Look ahead at subsequent lines for NIK (>= 10 digits) and Nomor Alas Hak
      for (let j = 1; j <= 5 && (i + j) < allLines.length; j++) {
        const lineAfterJ = (allLines[i + j]?.text || '').trim();
        // Stop if line begins a new standard row
        if (/^\d+\s+T\.?\s*\d+/i.test(lineAfterJ)) break;

        if (!newBid.nik) {
          const mNik = lineAfterJ.match(/\b(\d{10,20})\b/);
          if (mNik) newBid.nik = mNik[1];
        }
        if (!newBid.nomerAlasHak) {
          const mNomor = lineAfterJ.match(/Nomor\s*:\s*([0-9A-Za-z./_\-\s]+)/i);
          if (mNomor) {
            let num = mNomor[1].trim();
            const lineAfterJ2 = (allLines[i + j + 1]?.text || '').trim();
            if (/^(?:19|20)\d{2}\b/i.test(lineAfterJ2) || /^\d+\/[A-Za-z0-9/_-]+/i.test(lineAfterJ2)) {
              num += ' ' + lineAfterJ2;
            }
            if (num && num !== '-') newBid.nomerAlasHak = num;
          }
        }
      }

      continue;
    }

    // Pattern B: Multi-line OCR / text layout:
    // Line i: "1 T.75 -" or "1 T.75 - T.76"
    // Line i+1: "T.76"
    // Line i+2: "1 Pemilik Diketahui"
    // Line i+3: "TOLABUL"
    const ocrRowHeaderMatch = line.match(/^(\d+)\s+T\.?\s*(\d+[A-Za-z]?)\s*[-–]?$/i);
    if (ocrRowHeaderMatch) {
      const rowNo = parseInt(ocrRowHeaderMatch[1], 10) || (bidangList.length + 1);
      const t1 = ocrRowHeaderMatch[2].toUpperCase();
      let t2 = '';
      let nobid = '';
      let namaCandidate = '';

      // Lookahead line i+1 for t2
      const next1 = allLines[i + 1]?.text?.trim() || '';
      const mT2 = next1.match(/^T\.?\s*(\d+[A-Za-z]?)/i);
      if (mT2) {
        t2 = mT2[1].toUpperCase();
      } else {
        const n1 = parseInt(t1, 10);
        t2 = !isNaN(n1) ? String(n1 + 1) : t1;
      }

      // Lookahead line i+2 for nobid (e.g. "1 Pemilik" or "1")
      const next2 = allLines[i + 2]?.text?.trim() || '';
      const mNobid = next2.match(/^(\d+[A-Za-z]?)(?:\s+(.*))?$/);
      if (mNobid) {
        nobid = mNobid[1];
        namaCandidate = mNobid[2] || '';
      }

      // Lookahead line i+3/4 for Nama if needed
      if (!namaCandidate) {
        const next3 = allLines[i + 3]?.text?.trim() || '';
        if (next3 && !/^\d+$/.test(next3) && !/^(T\.|RT|RW|DESA|KECAMATAN)/i.test(next3)) {
          namaCandidate = next3;
        }
      }

      const cleanSpan = `T.${t1} - T.${t2}`;
      startNewBidang(rowNo, cleanSpan, nobid || '1', namaCandidate, pageNumber);
      continue;
    }

    // Pattern C: Full span detected via extractSpanPattern:
    const spanPattern = extractSpanPattern(line);
    if (spanPattern) {
      const cleanSpan = spanPattern.span;
      let cleanNoBid = '';
      let rowNo = bidangList.length + 1;
      let namaCandidate = '';

      const beforeSpan = line.substring(0, line.indexOf(spanPattern.spanRaw)).trim();
      const afterSpan = line.substring(line.indexOf(spanPattern.spanRaw) + spanPattern.spanRaw.length).trim();

      const mRowBefore = beforeSpan.match(/^(\d+)$/);
      if (mRowBefore) {
        rowNo = parseInt(mRowBefore[1], 10) || rowNo;
      }

      const mNobidAfter = afterSpan.match(/^(\d+[A-Za-z]?)(?:\s+(.*))?/);
      if (mNobidAfter) {
        cleanNoBid = mNobidAfter[1];
        namaCandidate = mNobidAfter[2]?.trim() || '';
      } else {
        const next1 = allLines[i + 1]?.text?.trim() || '';
        const mNobidNext = next1.match(/^(\d+[A-Za-z]?)(?:\s+(.*))?$/);
        if (mNobidNext && !extractSpanPattern(next1)) {
          cleanNoBid = mNobidNext[1];
          namaCandidate = mNobidNext[2]?.trim() || '';
          i++;
        }
      }

      if (!cleanNoBid) {
        cleanNoBid = String(rowNo);
      }

      startNewBidang(rowNo, cleanSpan, cleanNoBid, namaCandidate, pageNumber);
      continue;
    }

    // 4. Attribute Extraction for the Active Bidang:
    if (currentBidang) {
      // (a) NIK: Any consecutive sequence of 10 or more digits
      // Per user directive: detects 10+ digits as NIK, and acts as boundary between Nama and other identity data
      const nikM = line.match(/\b(\d{10,20})\b/);
      if (nikM) {
        if (!currentBidang.nik) {
          currentBidang.nik = nikM[1];
        }
        // Extract any name text preceding the NIK on the same line
        const beforeNik = line.substring(0, nikM.index).trim();
        if (
          beforeNik &&
          beforeNik.length >= 3 &&
          !/^(?:T\.|RT|RW|DESA|KEC|KAB|PEMILIK|PENGGARAP|NON|SERTIPI?KAT|SPORADIK)/i.test(beforeNik) &&
          !/^\d+$/.test(beforeNik)
        ) {
          if (!currentBidang.nama || currentBidang.nama === 'PEMILIK BELUM TERIDENTIFIKASI' || /^Pemilik/i.test(currentBidang.nama)) {
            currentBidang.nama = beforeNik;
          } else if (!currentBidang.nama.toUpperCase().includes(beforeNik.toUpperCase())) {
            currentBidang.nama += ' ' + beforeNik;
          }
        }
      }

      // (b) Luas & Penutup Lahan & Status Tanah (single-line combination)
      // e.g. "147,00 Perkebunan Tanah Masyarakat" or "656,00 Ladang atau Tegalan Tanah Masyarakat"
      const luasStatusM = line.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s+(.*?)\s+(Tanah Masyarakat|Barang Milik Daerah|Barang Milik Negara|Aset Desa|Aset Badan Usaha Milik Negara|Aset Pemerintah|Tanah Kas Desa|Tanah Wakaf|Aset BUMN)$/i);
      if (luasStatusM && !/^(RT|RW|NO|SPAN|T\.)/i.test(line)) {
        if (!currentBidang.luasTanah || currentBidang.luasTanah === 0) {
          const lNum = parseIndoNumber(luasStatusM[1]);
          if (lNum > 0) currentBidang.luasTanah = lNum;
        }
        if (luasStatusM[2] && !currentBidang.penutupLahan) {
          currentBidang.penutupLahan = luasStatusM[2].trim();
        }
        if (luasStatusM[3] && !currentBidang.statusTanah) {
          currentBidang.statusTanah = luasStatusM[3].trim();
        }
      }

      // Standalone Luas
      const luasOnlyM = line.match(/^(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:m2|m²)?$/i);
      if (luasOnlyM && (!currentBidang.luasTanah || currentBidang.luasTanah === 0)) {
        const lNum = parseIndoNumber(luasOnlyM[1]);
        if (lNum > 0) currentBidang.luasTanah = lNum;
      }

      // Standalone Status Tanah
      const statusM = line.match(/(Tanah Masyarakat|Barang Milik Daerah|Barang Milik Negara|Aset Desa|Aset Badan Usaha Milik Negara|Aset Pemerintah|Tanah Kas Desa|Tanah Wakaf|Aset BUMN)/i);
      if (statusM && !currentBidang.statusTanah) {
        currentBidang.statusTanah = statusM[1].trim();
      }

      // Standalone Penutup Lahan
      const penutupM = line.match(/(Perkebunan|Saluran Irigasi|Saluran|Sawah|Pekarangan|Ladang atau Tegalan|Tegalan|Hutan|Tanah Kosong|Jaringan jalan|Jalan|Sungai)/i);
      if (penutupM && !currentBidang.penutupLahan) {
        currentBidang.penutupLahan = penutupM[1].trim();
      }

      // (c) Bukti Kepemilikan & Nomor Alas Hak
      if (/Sertifikat|Sertipikat|Hak\s*milik|Hak\s*guna\s*usaha|Non\s*Sertipikat|Sporadik|Letter\s*C|Girik|Lainnya/i.test(line)) {
        if (!currentBidang.jenisAlasHak) {
          let cleanJenis = line
            .replace(/\bT\.?\s*\d+[A-Za-z]?\b/gi, '')
            .replace(/\b(?:Pemilik\s+)?(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?\b/gi, '')
            .replace(/Nomor\s*:.*/i, '')
            .trim();
          if (currentBidang.nama && currentBidang.nama.length >= 3) {
            cleanJenis = cleanJenis.replace(new RegExp(currentBidang.nama, 'gi'), '').trim();
          }
          cleanJenis = cleanJenis.replace(/^[/,\s-]+|[/,\s-]+$/g, '').replace(/\s+/g, ' ').trim();
          if (cleanJenis) {
            currentBidang.jenisAlasHak = cleanJenis;
          }
        }
      }

      // Nomor Alas Hak extraction with next-line continuation (e.g. "Nomor : 27 FEBRUARI" followed by "2026")
      const nomorM = line.match(/Nomor\s*:\s*([0-9A-Za-z./_\-\s]+)/i);
      if (nomorM && !currentBidang.nomerAlasHak) {
        let nomerClean = nomorM[1].trim();
        // Check if next line is year or continuation (e.g. "2026")
        if (i + 1 < allLines.length) {
          const nextL = (allLines[i + 1]?.text || '').trim();
          if (/^(?:19|20)\d{2}\b/i.test(nextL)) {
            nomerClean += ' ' + nextL.match(/^(?:19|20)\d{2}/)![0];
          }
        }
        if (nomerClean && nomerClean !== '-') {
          currentBidang.nomerAlasHak = nomerClean;
        }
      } else if (
        currentBidang.nomerAlasHak &&
        /(?:JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER|\/|-)$/i.test(currentBidang.nomerAlasHak)
      ) {
        const yearM = line.match(/^((?:19|20)\d{2}\b)/);
        if (yearM && !currentBidang.nomerAlasHak.includes(yearM[1])) {
          currentBidang.nomerAlasHak += ' ' + yearM[1];
        }
      }

      // (d) Identitas (Nama vs Alamat / Identitas Lainnya):
      // The NIK (or first address line) acts as the boundary!
      const isAddressLine =
        /^(?:DUSUN|RT\b|RW\b|DESA\b|KELURAHAN\b|KECAMATAN\b|KEC\.|KABUPATEN\b|KAB\.|JL\.|JALAN\b|KP\.|KAMPUNG\b|DK\.|DUKUH\b|DSN\.|BLOK\b)/i.test(line) ||
        /\bRT\b/i.test(line) ||
        /\bRW\b/i.test(line) ||
        /\bDESA\b/i.test(line) ||
        /\bKECAMATAN\b/i.test(line) ||
        /\bKEC\./i.test(line) ||
        /\bKABUPATEN\b/i.test(line) ||
        /\bKAB\./i.test(line) ||
        /\bDUSUN\b/i.test(line) ||
        /\b(?:KUWANGSAN|KALIKUTO|BONGSO|KARANGKAJEN|KARANGTALUN|SAMBUNG|MAGERSARI|POGALAN|KAMBENGAN|KETINTANG|NGENCEK|SECANG|GRABAG|DONOREJO|PAKIS)\b/i.test(line);

      if (isAddressLine) {
        // Collect into alamat
        const cleanAddr = line.replace(/\b(\d{10,20})\b/g, '').trim();
        if (cleanAddr) {
          if (!currentBidang.alamat) {
            currentBidang.alamat = cleanAddr;
          } else if (!currentBidang.alamat.includes(cleanAddr)) {
            currentBidang.alamat += ', ' + cleanAddr;
          }
        }
      } else if (!currentBidang.nik) {
        // NIK has NOT been encountered yet: this line may be a name or name continuation!
        if (
          /PT\.\s*Perkebunan/i.test(line) ||
          /PEMERINTAH\s+(?:KABUPATEN|DESA)/i.test(line) ||
          /PLN/i.test(line) ||
          /DIREKTORAT\s+JENDERAL/i.test(line) ||
          /KEMENTERIAN\s+PU/i.test(line)
        ) {
          currentBidang.nama = line.trim();
        } else if (
          !line.includes('T.') &&
          !line.includes('Nomor') &&
          !line.includes('Sertifikat') &&
          !line.includes('Sertipikat') &&
          !line.includes('Sporadik') &&
          !line.includes('Letter') &&
          !line.includes('Girik') &&
          !line.includes('Pemilik') &&
          !line.includes('Diketahui') &&
          !line.includes('Perkebunan') &&
          !/^\d+$/.test(line) &&
          /^[A-Za-z\s.,'/-]{3,}$/.test(line)
        ) {
          const cand = line.trim();
          if (!currentBidang.nama || currentBidang.nama === 'PEMILIK BELUM TERIDENTIFIKASI') {
            currentBidang.nama = cand;
          } else {
            const curU = currentBidang.nama.toUpperCase();
            const candU = cand.toUpperCase();
            // Only append if it's an agency name that naturally spans multiple lines
            const isAgencyPrefix = /^(?:PEMERINTAH|DIREKTORAT|KEMENTERIAN|PT\.|PLN)/i.test(currentBidang.nama);
            if (isAgencyPrefix && !curU.includes(candU)) {
              currentBidang.nama += ' ' + cand;
            }
          }
        }
      }
      // Note: If currentBidang.nik IS already set, all lines after the NIK line are NOT names (they are alamat/other),
      // preventing any address or other identity data from polluting currentBidang.nama!
    }
  }

  // Final cleanup of bidang names, NIK, and alas hak
  bidangList.forEach(b => {
    // 1. NIK validation: Must be 10 or more consecutive digits; otherwise no NIK
    if (b.nik) {
      const cleanDigits = b.nik.replace(/\D/g, '');
      b.nik = cleanDigits.length >= 10 ? cleanDigits : '';
    }

    // 2. Nama cleanup: Distinguish agency vs personal names
    const isAgency =
      /^PEMERINTAH\s+(?:KABUPATEN|DESA|KOTA|PROVINSI)/i.test(b.nama) ||
      /^KEMENTERIAN\b/i.test(b.nama) ||
      /^DIREKTORAT\s+JENDERAL\b/i.test(b.nama) ||
      /^PT\b/i.test(b.nama) ||
      /^PLN\b/i.test(b.nama);

    if (isAgency) {
      // Clean table headers / footers / signatures from agency name
      b.nama = b.nama
        .replace(/\bNo\s+Span\b.*/gi, '')
        .replace(/\bTenaga\s+Teknik\b.*/gi, '')
        .replace(/\bMadya\/Operator\b.*/gi, '')
        .replace(/\bPelaksana\s+Madya\b.*/gi, '')
        .replace(/\bArdine\s+Bagus\b.*/gi, '')
        .replace(/\bLukman\s+Dwi\b.*/gi, '')
        .replace(/\bMiftahurridlwan\b.*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // For personal names:
      // Strip any table header or signature leaks
      b.nama = b.nama
        .replace(/\bNo\s+Span\b.*/gi, '')
        .replace(/\bTenaga\s+Teknik\b.*/gi, '')
        .replace(/\bMadya\/Operator\b.*/gi, '')
        .replace(/\bPelaksana\s+Madya\b.*/gi, '')
        .replace(/\bArdine\s+Bagus\b.*/gi, '')
        .replace(/\bLukman\s+Dwi\b.*/gi, '')
        .replace(/\bMiftahurridlwan\b.*/gi, '');

      // Strip NIK numbers
      b.nama = b.nama.replace(/\b\d{10,20}\b/g, '');

      // Strip address tokens and everything after them
      const addressCutoffRegex = /\b(?:DUSUN|RT\b|RW\b|DESA\b|KELURAHAN\b|KECAMATAN\b|KEC\.|KABUPATEN\b|KAB\.|KOTA\b|JL\.|JALAN\b|DK\.|DUKUH\b|DSN\.|BLOK\b|KUWANGSAN|KALIKUTO|BONGSO|KARANGKAJEN|KARANGTALUN|SAMBUNG|MAGERSARI|POGALAN|KAMBENGAN|KETINTANG|NGENCEK|SECANG|GRABAG|DONOREJO|PAKIS|MAGELANG)\b.*/gi;
      b.nama = b.nama.replace(addressCutoffRegex, '');

      // Strip Pihak prefixes
      b.nama = b.nama.replace(/^(?:Pemilik(?:\s+(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?)?|Penggarap)\s*/i, '');
      b.nama = b.nama.replace(/^Tidak\s+/i, '');
      b.nama = b.nama.replace(/\s+/g, ' ').trim();
    }

    if (!b.nama) {
      b.nama = 'PEMILIK BELUM TERIDENTIFIKASI';
    }

    // 3. Jenis Alas Hak cleanup
    if (b.jenisAlasHak) {
      let cleanHak = b.jenisAlasHak
        .replace(/\bT\.?\s*\d+[A-Za-z]?\b/gi, '')
        .replace(/\b(?:Pemilik\s+)?(?:Tidak\s+)?Diketahui(?:\s+Keberadaannya)?\b/gi, '')
        .replace(/Nomor\s*:.*/i, '')
        .trim();
      if (b.nama && b.nama.length >= 3 && b.nama !== 'PEMILIK BELUM TERIDENTIFIKASI') {
        const parts = b.nama.split(/\s+/);
        parts.forEach(p => {
          if (p.length >= 3) {
            cleanHak = cleanHak.replace(new RegExp(`\\b${p}\\b`, 'gi'), '').trim();
          }
        });
      }
      cleanHak = cleanHak.replace(/^[/,\s-]+|[/,\s-]+$/g, '').replace(/\s+/g, ' ').trim();
      b.jenisAlasHak = cleanHak;
    }

    // 4. Nomor Alas Hak cleanup
    if (b.nomerAlasHak) {
      b.nomerAlasHak = b.nomerAlasHak
        .replace(/^Nomor\s*:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  });

  metadata.totalBidang = bidangList.length;

  return {
    metadata,
    bidangList,
  };
}

/**
 * Parse an ESDM Nominatif PDF file (ArrayBuffer or File)
 */
export async function parseEsdmPdf(fileOrBuffer: File | ArrayBuffer, selectedDesa = ''): Promise<EsdmPdfParseResult> {
  const arrayBuffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const fileName = fileOrBuffer instanceof File ? fileOrBuffer.name : 'dokumen.pdf';

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const allLines: Array<{ text: string; pageNumber: number }> = [];
  const rawPagesText: string[] = [];
  let totalRawChars = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = textContent.items.map((item: any) => {
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      return {
        str: item.str || '',
        x: transform[4],
        y: transform[5],
      };
    }).filter((i: { str: string }) => i.str.trim().length > 0);

    // Group items into horizontal lines (clustering Y coordinates within 6pt tolerance)
    items.sort((a: any, b: any) => b.y - a.y || a.x - b.x);

    const pageLines: Array<{ y: number; text: string; items: typeof items }> = [];
    items.forEach((item: any) => {
      const existingLine = pageLines.find(l => Math.abs(l.y - item.y) <= 6);
      if (existingLine) {
        existingLine.items.push(item);
      } else {
        pageLines.push({ y: item.y, text: '', items: [item] });
      }
    });

    pageLines.forEach(line => {
      line.items.sort((a: any, b: any) => a.x - b.x);
      line.text = line.items.map((i: any) => i.str).join(' ');
      totalRawChars += line.text.length;
      allLines.push({ text: line.text, pageNumber: pageNum });
    });

    rawPagesText.push(pageLines.map(l => l.text).join('\n'));
  }

  // Check if PDF is a scanned image (0 or negligible text)
  if (totalRawChars < 35 && totalPages >= 1) {
    const error: any = new Error(
      'PDF ini terdeteksi sebagai PDF SCAN / GAMBAR (tidak memiliki lapisan teks digital). ' +
      'Mesin PDF web tidak dapat mengekstrak teks dari foto/scan secara langsung. ' +
      'Silakan konversi PDF scan ini ke Excel (.xlsx / .csv) melalui tool OCR (seperti iLovePDF OCR, Smallpdf, atau Adobe Acrobat), ' +
      'lalu unggah file Excel-nya ke sini, atau unggah file PDF digital asli dari aplikasi ESDM.'
    );
    error.isScanned = true;
    error.totalPages = totalPages;
    throw error;
  }

  // Parse lines via state-machine
  const parsed = parseEsdmLines(allLines, selectedDesa);
  parsed.metadata.sourceType = 'PDF';
  parsed.metadata.fileName = fileName;

  // If no bidang found but text was present, provide a helpful message
  if (parsed.bidangList.length === 0 && totalRawChars >= 35) {
    const error: any = new Error(
      `Berhasil mengekstrak ${allLines.length} baris teks dari PDF (${totalPages} halaman), namun pola baris Bidang/Tower (contoh: "T.45 - T.46") tidak terdeteksi. Silakan periksa apakah dokumen ini adalah Daftar Nominatif ESDM yang sesuai, atau konversikan ke Excel (.xlsx) / salin teks tabelnya.`
    );
    error.isFormatMismatch = true;
    error.extractedLines = allLines.slice(0, 30).map(l => l.text);
    throw error;
  }

  return {
    metadata: parsed.metadata,
    bidangList: parsed.bidangList,
    rawPagesText,
  };
}

/**
 * Detect sheet type based on sheet name and header/cell content
 */
export function detectSheetType(
  sheetName: string,
  rawRows: any[][]
): 'TANAH' | 'BANGUNAN' | 'TANAMAN' | 'NOMINATIF' | 'REKAP' | 'OTHER' {
  const sLower = sheetName.toLowerCase();
  if (/nominatif/i.test(sLower)) return 'NOMINATIF';
  if (/bangun|gedung|rumah|fasilitas/i.test(sLower)) return 'BANGUNAN';
  if (/tanaman|tegakan|pohon/i.test(sLower)) return 'TANAMAN';
  if (/tanah|lahan/i.test(sLower)) return 'TANAH';
  if (/rekap|rekapitulasi|ringkasan|cover/i.test(sLower)) return 'REKAP';

  // Check header text in first 20 rows
  const headerTexts = rawRows.slice(0, 20).map(r => r.join(' ').toLowerCase()).join(' ');
  const hasTanamanCol = /jenis\s*tanaman|belum\s*menghasilkan|sudah\s*menghasilkan|tegakan|\bbm\b|\bsm\b/i.test(headerTexts);
  const hasBangunanCol = /luas\s*bangunan|bentuk\s*bangunan|konstruksi|permanen|gubug|kandang|rumah/i.test(headerTexts);
  const hasTanahCol = /luas\s*tanah|penutup\s*lahan|status\s*tanah|alas\s*hak|penguasaan/i.test(headerTexts);

  if (hasBangunanCol && !hasTanahCol && !hasTanamanCol) return 'BANGUNAN';
  if (hasTanamanCol && !hasTanahCol) return 'TANAMAN';
  if (hasTanahCol && !hasTanamanCol && !hasBangunanCol) return 'TANAH';
  if ((hasTanahCol || /span|tower/i.test(headerTexts)) && (hasTanamanCol || hasBangunanCol)) return 'NOMINATIF';
  if (/span|tower|bidang/i.test(headerTexts)) return 'NOMINATIF';

  return 'OTHER';
}

/**
 * Parse standard nominatif / tanah sheet rows
 */
function parseStandardNominatifRows(
  rawRows: any[][],
  sheetName: string,
  fileName: string,
  initialDesa = ''
): { metadata: EsdmPdfParseResult['metadata']; bidangList: EsdmBidangData[] } {
  const metadata = {
    judul: 'DAFTAR NOMINATIF INVENTARISASI TANAH, BANGUNAN DAN/ATAU TANAMAN (EXCEL)',
    proyek: '',
    kabupaten: '',
    kecamatan: '',
    desa: initialDesa,
    totalPages: 1,
    totalBidang: 0,
    totalTanamanCount: 0,
    sourceType: 'EXCEL' as const,
    fileName,
    activeSheet: sheetName,
  };

  let headerRowIndex = -1;
  let colSpan = -1;
  let colNobid = -1;
  let colNama = -1;
  let colNik = -1;
  let colLuas = -1;
  let colPenutup = -1;
  let colStatus = -1;
  let colAlasHak = -1;
  let colNoAlasHak = -1;
  let colTanamanJenis = -1;
  let colTanamanJumlah = -1;
  let colBM = -1;
  let colSM = -1;
  let colK = -1;
  let colS = -1;
  let colB = -1;
  let colRincianBangunan = -1;
  let colRincianTanaman = -1;

  for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
    const row = rawRows[r].map(c => String(c || '').trim().toLowerCase());
    const rowText = row.join(' ');

    if (!metadata.desa) {
      const mDesa = rowText.match(/desa(?:\/kelurahan)?\s*[:\s]\s*([a-z\s]+)/i);
      if (mDesa) metadata.desa = mDesa[1].trim().toUpperCase();
    }
    if (!metadata.kecamatan) {
      const mKec = rowText.match(/kecamatan\s*[:\s]\s*([a-z\s]+)/i);
      if (mKec) metadata.kecamatan = mKec[1].trim().toUpperCase();
    }
    if (!metadata.kabupaten) {
      const mKab = rowText.match(/kabupaten(?:\/kota)?\s*[:\s]\s*([a-z\s]+)/i);
      if (mKab) metadata.kabupaten = mKab[1].trim().toUpperCase();
    }
    if (!metadata.proyek && /sutt|sutet|transmisi/i.test(rowText)) {
      metadata.proyek = rowText.toUpperCase();
    }

    const hasSpan = row.some(c => /span|tower/i.test(c));
    const hasBidang = row.some(c => /bidang|nobid/i.test(c));
    const hasNama = row.some(c => /nama|pihak|pemilik/i.test(c));

    if ((hasSpan && hasBidang) || (hasSpan && hasNama) || (hasBidang && hasNama)) {
      headerRowIndex = r;
      row.forEach((colStr, cIdx) => {
        if (/span|tower/i.test(colStr) && colSpan === -1) colSpan = cIdx;
        else if (/(?:no\.?\s*)?bidang|nobid/i.test(colStr) && colNobid === -1) colNobid = cIdx;
        else if (/nama|pihak\s*yang\s*berhak|pemilik/i.test(colStr) && colNama === -1) colNama = cIdx;
        else if (/nik|identitas|ktp/i.test(colStr) && colNik === -1) colNik = cIdx;
        else if (/luas|m2|m²/i.test(colStr) && colLuas === -1) colLuas = cIdx;
        else if (/penutup|penggunaan/i.test(colStr) && colPenutup === -1) colPenutup = cIdx;
        else if (/status\s*tanah|penguasaan/i.test(colStr) && colStatus === -1) colStatus = cIdx;
        else if (/alas\s*hak|bukti/i.test(colStr) && colAlasHak === -1) colAlasHak = cIdx;
        else if (/nomor\s*alas\s*hak|no\s*alas/i.test(colStr) && colNoAlasHak === -1) colNoAlasHak = cIdx;
        else if (/rincian\s*bangunan/i.test(colStr) && colRincianBangunan === -1) colRincianBangunan = cIdx;
        else if (/rincian\s*tanaman/i.test(colStr) && colRincianTanaman === -1) colRincianTanaman = cIdx;
        else if (/jenis\s*tanaman|tanaman/i.test(colStr) && colTanamanJenis === -1) colTanamanJenis = cIdx;
        else if (/jumlah\s*tanaman|batang/i.test(colStr) && colTanamanJumlah === -1) colTanamanJumlah = cIdx;
        else if (/belum\s*menghasilkan|\bbm\b/i.test(colStr) && colBM === -1) colBM = cIdx;
        else if (/sudah\s*menghasilkan|\bsm\b/i.test(colStr) && colSM === -1) colSM = cIdx;
        else if (/\bkecil\b|\bk\b/i.test(colStr) && colK === -1) colK = cIdx;
        else if (/\bsedang\b|\bs\b/i.test(colStr) && colS === -1) colS = cIdx;
        else if (/\bbesar\b|\bb\b/i.test(colStr) && colB === -1) colB = cIdx;
      });
      break;
    }
  }

  const bidangList: EsdmBidangData[] = [];
  let currentBidang: EsdmBidangData | null = null;
  let activeSpan = '';
  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    let foundSpan = '';
    let foundNobid = '';

    if (colSpan >= 0 && row[colSpan]) {
      const sp = extractSpanPattern(String(row[colSpan]));
      if (sp) foundSpan = sp.span;
    }
    if (!foundSpan) {
      for (let c = 0; c < row.length; c++) {
        const sp = extractSpanPattern(String(row[c] || ''));
        if (sp) {
          foundSpan = sp.span;
          break;
        }
      }
    }

    if (foundSpan) {
      activeSpan = foundSpan;
    }

    if (colNobid >= 0 && row[colNobid] !== undefined && row[colNobid] !== '') {
      const rawNo = String(row[colNobid]).replace(/[^\w.-]/g, '').trim();
      if (rawNo) foundNobid = rawNo.replace(/^0+/, '') || '0';
    }

    // Support merged / empty span cells in Excel: inherit activeSpan if nobid or nama exists
    if (!foundSpan && activeSpan && foundNobid) {
      const candNama = colNama >= 0 ? String(row[colNama] || '').trim() : '';
      const candLuas = colLuas >= 0 ? parseIndoNumber(row[colLuas]) : 0;
      const candAlas = colAlasHak >= 0 ? String(row[colAlasHak] || '').trim() : '';
      if (candNama || candLuas > 0 || candAlas) {
        foundSpan = activeSpan;
      }
    }

    // If new Bidang row detected
    if (foundSpan) {
      const rowNo = bidangList.length + 1;
      const cleanNoBid = foundNobid || String(rowNo);
      const nama = colNama >= 0 ? String(row[colNama] || '').trim() : '';
      const nik = colNik >= 0 ? String(row[colNik] || '').replace(/[^\d]/g, '').trim() : '';
      const luas = colLuas >= 0 ? parseIndoNumber(row[colLuas]) : 0;
      const penutup = colPenutup >= 0 ? String(row[colPenutup] || '').trim() : '';
      const status = colStatus >= 0 ? String(row[colStatus] || '').trim() : '';
      const alasHak = colAlasHak >= 0 ? String(row[colAlasHak] || '').trim() : '';
      const noAlasHak = colNoAlasHak >= 0 ? String(row[colNoAlasHak] || '').trim() : '';

      currentBidang = {
        id: `ESDM_${metadata.desa || 'DESA'}_${foundSpan.replace(/[\s.-]/g, '')}_${cleanNoBid}_${rowNo}`,
        no: rowNo,
        span: foundSpan,
        nobid: cleanNoBid,
        pihakBerhak: 'Pemilik Diketahui',
        nama,
        nik,
        alamat: '',
        jenisAlasHak: alasHak,
        nomerAlasHak: noAlasHak,
        luasTanah: luas,
        penutupLahan: penutup,
        statusTanah: status,
        bangunan: [],
        tanaman: [],
        pageNumber: 1,
      };

      // Extract embedded Rincian Bangunan if present (e.g. from Sheet 1)
      if (colRincianBangunan >= 0 && row[colRincianBangunan]) {
        const rawBldg = String(row[colRincianBangunan] || '').trim();
        if (rawBldg && rawBldg !== '-') {
          const lines = rawBldg.split(/\r?\n/);
          lines.forEach((bLine, bIdx) => {
            const mLuas = bLine.match(/luas:\s*([\d.,]+)\s*m/i);
            const mBentuk = bLine.match(/bentuk:\s*([^|\n\r]+)/i);
            const isNonPermanen = /non\s*permanen/i.test(bLine);
            const isPermanen = /permanen/i.test(bLine) && !isNonPermanen;
            const jenis = isNonPermanen ? 'Non Permanen' : isPermanen ? 'Permanen' : 'Permanen';
            const luas = mLuas ? parseIndoNumber(mLuas[1]) : 0;
            const bentuk = mBentuk ? mBentuk[1].trim() : 'BANGUNAN';

            if (luas > 0 || bentuk) {
              currentBidang!.bangunan.push({
                subBidang: `${cleanNoBid}${bIdx === 0 ? 'A' : String.fromCharCode(65 + bIdx)}`,
                pemilik: nama,
                luas,
                bentuk,
                jenis,
              });
              (currentBidang as any)._hasSheet1Bangunan = true;
            }
          });
        }
      }

      // Extract embedded Rincian Tanaman if present (e.g. from Sheet 1)
      if (colRincianTanaman >= 0 && row[colRincianTanaman]) {
        const rawPlants = String(row[colRincianTanaman] || '').trim();
        if (rawPlants && rawPlants !== '-') {
          const lines = rawPlants.split(/\r?\n/);
          lines.forEach(pLine => {
            const mSpecies = pLine.match(/(?:^\d+\.\s*)?([^|]+)\|/);
            if (!mSpecies) return;
            const jenis = mSpecies[1].trim().toUpperCase();
            if (!jenis) return;

            const mK = pLine.match(/kecil:\s*(\d+)/i);
            const mS = pLine.match(/sedang:\s*(\d+)/i);
            const mB = pLine.match(/besar:\s*(\d+)/i);
            const mBM = pLine.match(/belum\s*menghasilkan:\s*(\d+)/i);
            const mSM = pLine.match(/sudah\s*menghasilkan:\s*(\d+)/i);

            const k = mK ? parseInt(mK[1], 10) : 0;
            const s = mS ? parseInt(mS[1], 10) : 0;
            const b = mB ? parseInt(mB[1], 10) : 0;
            const bm = mBM ? parseInt(mBM[1], 10) : 0;
            const sm = mSM ? parseInt(mSM[1], 10) : 0;
            const tot = k + s + b + bm + sm;

            if (tot > 0) {
              currentBidang!.tanaman.push({
                jenis,
                belum_menghasilkan: bm,
                sudah_menghasilkan: sm,
                kecil: k,
                sedang: s,
                besar: b,
                total: tot,
              });
              (currentBidang as any)._hasSheet1Tanaman = true;
              metadata.totalTanamanCount += tot;
            }
          });
        }
      }

      // Check if this row also has plant data
      if (colTanamanJenis >= 0 && row[colTanamanJenis]) {
        const jTanaman = String(row[colTanamanJenis]).trim().toUpperCase();
        const bm = colBM >= 0 ? parseIndoNumber(row[colBM]) : 0;
        const sm = colSM >= 0 ? parseIndoNumber(row[colSM]) : 0;
        const k = colK >= 0 ? parseIndoNumber(row[colK]) : 0;
        const s = colS >= 0 ? parseIndoNumber(row[colS]) : 0;
        const b = colB >= 0 ? parseIndoNumber(row[colB]) : 0;
        const parsedSum = bm + sm + k + s + b;
        const fallbackJml = colTanamanJumlah >= 0 ? parseIndoNumber(row[colTanamanJumlah]) : 1;
        const jml = parsedSum > 0 ? parsedSum : fallbackJml;

        if (jTanaman && jTanaman.length >= 2 && !/JUMLAH|TOTAL/i.test(jTanaman)) {
          currentBidang.tanaman.push({
            jenis: jTanaman,
            belum_menghasilkan: bm,
            sudah_menghasilkan: sm || (parsedSum === 0 ? jml : 0),
            kecil: k,
            sedang: s,
            besar: b,
            total: jml,
          });
          metadata.totalTanamanCount += jml;
        }
      }

      bidangList.push(currentBidang);
    } else if (currentBidang) {
      // Sub-row under current bidang (e.g. additional plants or building)
      if (colTanamanJenis >= 0 && row[colTanamanJenis]) {
        const jTanaman = String(row[colTanamanJenis]).trim().toUpperCase();
        const bm = colBM >= 0 ? parseIndoNumber(row[colBM]) : 0;
        const sm = colSM >= 0 ? parseIndoNumber(row[colSM]) : 0;
        const k = colK >= 0 ? parseIndoNumber(row[colK]) : 0;
        const s = colS >= 0 ? parseIndoNumber(row[colS]) : 0;
        const b = colB >= 0 ? parseIndoNumber(row[colB]) : 0;
        const parsedSum = bm + sm + k + s + b;
        const fallbackJml = colTanamanJumlah >= 0 ? parseIndoNumber(row[colTanamanJumlah]) : 1;
        const jml = parsedSum > 0 ? parsedSum : fallbackJml;

        if (jTanaman && jTanaman.length >= 2 && !/JUMLAH|TOTAL/i.test(jTanaman)) {
          currentBidang.tanaman.push({
            jenis: jTanaman,
            belum_menghasilkan: bm,
            sudah_menghasilkan: sm || (parsedSum === 0 ? jml : 0),
            kecil: k,
            sedang: s,
            besar: b,
            total: jml,
          });
          metadata.totalTanamanCount += jml;
        }
      } else {
        // Check if any cell has plant pattern e.g. "KARET 479"
        const rowStr = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');
        const plantM = rowStr.match(/^([A-Za-z\s/'-]{2,25})\s+(\d+)$/);
        if (plantM && !/JUMLAH|TOTAL|LUAS/i.test(plantM[1])) {
          const jml = parseInt(plantM[2], 10) || 0;
          currentBidang.tanaman.push({
            jenis: plantM[1].trim().toUpperCase(),
            belum_menghasilkan: 0,
            sudah_menghasilkan: jml,
            kecil: 0,
            sedang: 0,
            besar: 0,
            total: jml,
          });
          metadata.totalTanamanCount += jml;
        }
      }
    }
  }

  metadata.totalBidang = bidangList.length;
  return { metadata, bidangList };
}

/**
 * Parse Bangunan sheet rows
 */
function parseBangunanSheetRows(rawRows: any[][]): Array<{
  span: string;
  nobid: string;
  subBidang: string;
  pemilik: string;
  nik: string;
  luas: number;
  bentuk: string;
  jenis: string;
}> {
  const results: Array<{
    span: string;
    nobid: string;
    subBidang: string;
    pemilik: string;
    nik: string;
    luas: number;
    bentuk: string;
    jenis: string;
  }> = [];

  let headerRow = -1;
  let colSpan = -1;
  let colNobid = -1;
  let colNama = -1;
  let colNik = -1;
  let colLuas = -1;
  let colBentuk = -1;
  let colJenis = -1;
  let colLantai = -1;
  let colSubBidang = -1;

  for (let r = 0; r < Math.min(rawRows.length, 20); r++) {
    const row = rawRows[r].map(c => String(c || '').toLowerCase().trim());
    if (row.some(c => /luas|bangunan|bentuk|konstruksi|permanen/i.test(c))) {
      headerRow = r;
      row.forEach((col, idx) => {
        if (/span|tower/i.test(col) && colSpan === -1) colSpan = idx;
        else if (/(?:nomor\s*)?sub\s*bidang/i.test(col) && colSubBidang === -1) colSubBidang = idx;
        else if (/(?:no\.?\s*)?bidang|nobid/i.test(col) && colNobid === -1) colNobid = idx;
        else if (/nama\s*pemilik|pemilik|pihak|nama\s*calon/i.test(col) && colNama === -1) colNama = idx;
        else if (/nik|ktp|identitas/i.test(col) && colNik === -1) colNik = idx;
        else if (/luas|m2|m²/i.test(col) && colLuas === -1) colLuas = idx;
        else if (/bentuk|fungsi/i.test(col) && colBentuk === -1) colBentuk = idx;
        else if (/jenis\s*bangunan|konstruksi|permanen/i.test(col) && colJenis === -1) colJenis = idx;
        else if (/lantai/i.test(col) && colLantai === -1) colLantai = idx;
      });
      break;
    }
  }

  let activeSpan = '';
  const startR = headerRow >= 0 ? headerRow + 1 : 0;

  for (let r = startR; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    let span = colSpan >= 0 ? String(row[colSpan] || '').trim() : '';
    if (span) {
      const sp = extractSpanPattern(span);
      if (sp) activeSpan = sp.span;
    }

    let nobid = colNobid >= 0 ? String(row[colNobid] || '').replace(/[^\w.-]/g, '').trim() : '';
    let subBidang = colSubBidang >= 0 ? String(row[colSubBidang] || '').trim() : '';
    
    if (!subBidang && nobid) {
      const mSub = nobid.match(/^(\d+)?([A-Za-z])$/);
      if (mSub) {
        subBidang = nobid;
        nobid = mSub[1] || '';
      }
    }

    const pemilik = colNama >= 0 ? String(row[colNama] || '').trim() : '';
    const nik = colNik >= 0 ? String(row[colNik] || '').replace(/[^\d]/g, '').trim() : '';
    const luas = colLuas >= 0 ? parseIndoNumber(row[colLuas]) : 0;
    const bentukRaw = colBentuk >= 0 ? String(row[colBentuk] || '').trim() : 'BANGUNAN';
    const lantai = colLantai >= 0 ? String(row[colLantai] || '').trim() : '';
    const bentuk = lantai && !bentukRaw.toLowerCase().includes('lantai') ? `${bentukRaw} - ${lantai}` : bentukRaw;
    const jenis = colJenis >= 0 ? String(row[colJenis] || '').trim() : 'Permanen';

    if (luas > 0 || bentuk || pemilik) {
      results.push({
        span: span || activeSpan,
        nobid,
        subBidang,
        pemilik,
        nik,
        luas,
        bentuk,
        jenis,
      });
    }
  }

  return results;
}

/**
 * Parse Tanaman sheet rows
 */
function parseTanamanSheetRows(rawRows: any[][]): Array<{
  span: string;
  nobid: string;
  penggarap: string;
  nik: string;
  jenis: string;
  bm: number;
  sm: number;
  k: number;
  s: number;
  b: number;
  total: number;
}> {
  const results: Array<{
    span: string;
    nobid: string;
    penggarap: string;
    nik: string;
    jenis: string;
    bm: number;
    sm: number;
    k: number;
    s: number;
    b: number;
    total: number;
  }> = [];

  let headerRow = -1;
  let colSpan = -1;
  let colNobid = -1;
  let colNama = -1;
  let colNik = -1;
  let colJenis = -1;
  let colBM = -1;
  let colSM = -1;
  let colK = -1;
  let colS = -1;
  let colB = -1;
  let colTotal = -1;
  let colKategori = -1;

  for (let r = 0; r < Math.min(rawRows.length, 20); r++) {
    const row = rawRows[r].map(c => String(c || '').toLowerCase().trim());
    if (row.some(c => /tanaman|tegakan|pohon|batang|belum\s*menghasilkan|\bbm\b|kategori/i.test(c))) {
      headerRow = r;
      row.forEach((col, idx) => {
        if (/span|tower/i.test(col) && colSpan === -1) colSpan = idx;
        else if (/(?:no\.?\s*)?bidang|nobid/i.test(col) && colNobid === -1) colNobid = idx;
        else if (/nama\s*calon|penggarap|pemilik|pihak/i.test(col) && colNama === -1) colNama = idx;
        else if (/nik|ktp/i.test(col) && colNik === -1) colNik = idx;
        else if (/jenis\s*tanaman|tanaman|tegakan/i.test(col) && colJenis === -1) colJenis = idx;
        else if (/kategori\s*tanaman|kategori/i.test(col) && colKategori === -1) colKategori = idx;
        else if (/belum\s*menghasilkan|\bbm\b/i.test(col) && colBM === -1) colBM = idx;
        else if (/sudah\s*menghasilkan|\bsm\b/i.test(col) && colSM === -1) colSM = idx;
        else if (/\bkecil\b|\bk\b/i.test(col) && colK === -1) colK = idx;
        else if (/\bsedang\b|\bs\b/i.test(col) && colS === -1) colS = idx;
        else if (/\bbesar\b|\bb\b/i.test(col) && colB === -1) colB = idx;
        else if (/total|jumlah|batang/i.test(col) && colTotal === -1) colTotal = idx;
      });
      break;
    }
  }

  let activeSpan = '';
  let activeNobid = '';
  const startR = headerRow >= 0 ? headerRow + 1 : 0;

  for (let r = startR; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    let span = colSpan >= 0 ? String(row[colSpan] || '').trim() : '';
    if (span) {
      const sp = extractSpanPattern(span);
      if (sp) activeSpan = sp.span;
    }

    let nobid = colNobid >= 0 ? String(row[colNobid] || '').replace(/[^\w.-]/g, '').trim() : '';
    if (nobid) activeNobid = nobid;

    const penggarap = colNama >= 0 ? String(row[colNama] || '').trim() : '';
    const nik = colNik >= 0 ? String(row[colNik] || '').replace(/[^\d]/g, '').trim() : '';
    const jenis = colJenis >= 0 ? String(row[colJenis] || '').trim().toUpperCase() : '';

    if (!jenis || /JUMLAH|TOTAL/i.test(jenis)) continue;

    let bm = colBM >= 0 ? parseIndoNumber(row[colBM]) : 0;
    let sm = colSM >= 0 ? parseIndoNumber(row[colSM]) : 0;
    let k = colK >= 0 ? parseIndoNumber(row[colK]) : 0;
    let s = colS >= 0 ? parseIndoNumber(row[colS]) : 0;
    let b = colB >= 0 ? parseIndoNumber(row[colB]) : 0;

    if (colKategori >= 0) {
      const kat = String(row[colKategori] || '').trim().toLowerCase();
      const jml = (colTotal >= 0 ? parseIndoNumber(row[colTotal]) : 0) || 1;
      if (/belum\s*menghasilkan|\bbm\b/i.test(kat)) bm = jml;
      else if (/sudah\s*menghasilkan|\bsm\b/i.test(kat)) sm = jml;
      else if (/kecil|\bk\b/i.test(kat)) k = jml;
      else if (/sedang|\bs\b/i.test(kat)) s = jml;
      else if (/besar|\bb\b/i.test(kat)) b = jml;
      else sm = jml;
    }

    const sum = bm + sm + k + s + b;
    const fallbackTot = colTotal >= 0 ? parseIndoNumber(row[colTotal]) : 1;
    const total = sum > 0 ? sum : fallbackTot;

    results.push({
      span: span || activeSpan,
      nobid: nobid || activeNobid,
      penggarap,
      nik,
      jenis,
      bm,
      sm,
      k,
      s,
      b,
      total,
    });
  }

  return results;
}

/**
 * Parse an ESDM Nominatif Excel file (.xlsx, .xls, .csv)
 * Intelligently handles multi-sheet workbooks (including 3 sheets: Tanah, Bangunan, Tanaman, or multiple Desas)!
 */
export async function parseEsdmExcel(
  fileOrBuffer: File | ArrayBuffer,
  initialDesa = '',
  targetSheet = 'AUTO'
): Promise<EsdmPdfParseResult> {
  const arrayBuffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const fileName = fileOrBuffer instanceof File ? fileOrBuffer.name : 'dokumen.xlsx';

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
  }

  // 1. Inspect all sheets
  const sheetInfos: EsdmSheetInfo[] = [];
  const sheetDataMap = new Map<string, any[][]>();

  for (const sName of sheetNames) {
    const ws = workbook.Sheets[sName];
    const rows: any[][] = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : [];
    sheetDataMap.set(sName, rows);
    const type = detectSheetType(sName, rows);
    sheetInfos.push({
      name: sName,
      rowCount: rows.length,
      type,
    });
  }

  // If user requested a specific sheet (not 'AUTO' and not 'MERGED')
  if (targetSheet !== 'AUTO' && targetSheet !== 'MERGED') {
    const specificSheetName = sheetNames.find(s => s.toLowerCase() === targetSheet.toLowerCase()) || targetSheet;
    const rows = sheetDataMap.get(specificSheetName);
    if (!rows || rows.length === 0) {
      throw new Error(`Lembar Excel "${specificSheetName}" kosong atau tidak ditemukan.`);
    }

    const res = parseStandardNominatifRows(rows, specificSheetName, fileName, initialDesa);
    res.metadata.sheetNames = sheetNames;
    res.metadata.activeSheet = specificSheetName;
    res.metadata.sheetDetails = sheetInfos;
    return {
      metadata: res.metadata,
      bidangList: res.bidangList,
      rawPagesText: [rows.slice(0, 100).map(r => r.join('\t')).join('\n')],
    };
  }

  // Check component-based sheets (Tanah + Bangunan + Tanaman)
  const tanahSheet = sheetInfos.find(s => s.type === 'TANAH');
  const bangunanSheet = sheetInfos.find(s => s.type === 'BANGUNAN');
  const tanamanSheet = sheetInfos.find(s => s.type === 'TANAMAN');
  const nominatifSheets = sheetInfos.filter(s => s.type === 'NOMINATIF');

  const isComponent3Sheets = (tanahSheet || nominatifSheets.length > 0) && (bangunanSheet || tanamanSheet);

  if (isComponent3Sheets) {
    // === AUTO-MERGE 3 SHEETS (TANAH + BANGUNAN + TANAMAN) ===
    const baseSheet = tanahSheet || nominatifSheets[0] || sheetInfos[0];
    const baseRows = sheetDataMap.get(baseSheet.name) || [];
    const { metadata, bidangList } = parseStandardNominatifRows(baseRows, baseSheet.name, fileName, initialDesa);

    // Merge Bangunan
    if (bangunanSheet) {
      const bRows = sheetDataMap.get(bangunanSheet.name) || [];
      const buildingItems = parseBangunanSheetRows(bRows);

      for (const bldg of buildingItems) {
        // Find matching bidang
        let matched = bidangList.find(b => {
          const matchSpan = !bldg.span || b.span === bldg.span;
          const matchNo = bldg.nobid && b.nobid === bldg.nobid;
          return matchSpan && matchNo;
        });

        if (!matched && bldg.subBidang) {
          // Check if nobid matches number prefix of subBidang (e.g. 3A -> 3)
          matched = bidangList.find(b => bldg.subBidang.startsWith(b.nobid));
        }

        if (!matched && bldg.nik) {
          matched = bidangList.find(b => b.nik && b.nik === bldg.nik);
        }

        if (!matched && bldg.pemilik) {
          matched = bidangList.find(b => b.nama && b.nama.toLowerCase() === bldg.pemilik.toLowerCase());
        }

        if (matched) {
          if ((matched as any)._hasSheet1Bangunan) {
            matched.bangunan = [];
            delete (matched as any)._hasSheet1Bangunan;
          }
          matched.bangunan.push({
            subBidang: bldg.subBidang,
            pemilik: bldg.pemilik,
            luas: bldg.luas,
            bentuk: bldg.bentuk,
            jenis: bldg.jenis,
          });
          if (bldg.subBidang && !matched.subBidang) matched.subBidang = bldg.subBidang;
          if (bldg.nik && !matched.nik) matched.nik = bldg.nik;
        } else {
          // If no matching land, create standalone building bidang
          const newNo = bidangList.length + 1;
          bidangList.push({
            id: `ESDM_${metadata.desa || 'DESA'}_${(bldg.span || 'TOWER').replace(/[\s.-]/g, '')}_${bldg.subBidang || bldg.nobid || newNo}_${newNo}`,
            no: newNo,
            span: bldg.span || '-',
            nobid: bldg.subBidang || bldg.nobid || String(newNo),
            subBidang: bldg.subBidang,
            pihakBerhak: 'Pemilik Diketahui',
            nama: bldg.pemilik || 'Pemilik Bangunan',
            nik: bldg.nik,
            alamat: '',
            jenisAlasHak: '',
            nomerAlasHak: '',
            luasTanah: 0,
            penutupLahan: 'Pemukiman / Bangunan',
            statusTanah: 'Tanah Masyarakat',
            bangunan: [{
              subBidang: bldg.subBidang,
              pemilik: bldg.pemilik,
              luas: bldg.luas,
              bentuk: bldg.bentuk,
              jenis: bldg.jenis,
            }],
            tanaman: [],
            pageNumber: 1,
          });
        }
      }
    }

    // Merge Tanaman
    if (tanamanSheet) {
      const tRows = sheetDataMap.get(tanamanSheet.name) || [];
      const plantItems = parseTanamanSheetRows(tRows);

      for (const pl of plantItems) {
        let matched = bidangList.find(b => {
          const matchSpan = !pl.span || b.span === pl.span;
          const matchNo = pl.nobid && b.nobid === pl.nobid;
          return matchSpan && matchNo;
        });

        if (!matched && pl.nik) {
          matched = bidangList.find(b => b.nik && b.nik === pl.nik);
        }

        if (!matched && pl.penggarap) {
          matched = bidangList.find(b => b.nama && b.nama.toLowerCase() === pl.penggarap.toLowerCase());
        }

        if (matched) {
          if ((matched as any)._hasSheet1Tanaman) {
            const oldSum = matched.tanaman.reduce((acc, t) => acc + t.total, 0);
            metadata.totalTanamanCount = Math.max(0, metadata.totalTanamanCount - oldSum);
            matched.tanaman = [];
            delete (matched as any)._hasSheet1Tanaman;
          }

          const existingPlant = matched.tanaman.find(t => t.jenis === pl.jenis);
          if (existingPlant) {
            existingPlant.belum_menghasilkan += pl.bm;
            existingPlant.sudah_menghasilkan += pl.sm;
            existingPlant.kecil += pl.k;
            existingPlant.sedang += pl.s;
            existingPlant.besar += pl.b;
            existingPlant.total += pl.total;
          } else {
            matched.tanaman.push({
              jenis: pl.jenis,
              belum_menghasilkan: pl.bm,
              sudah_menghasilkan: pl.sm,
              kecil: pl.k,
              sedang: pl.s,
              besar: pl.b,
              total: pl.total,
            });
          }
          metadata.totalTanamanCount += pl.total;
        } else {
          // If no matching land, create standalone plant bidang
          const newNo = bidangList.length + 1;
          bidangList.push({
            id: `ESDM_${metadata.desa || 'DESA'}_${(pl.span || 'TOWER').replace(/[\s.-]/g, '')}_${pl.nobid || newNo}_${newNo}`,
            no: newNo,
            span: pl.span || '-',
            nobid: pl.nobid || String(newNo),
            pihakBerhak: 'Penggarap / Pemilik',
            nama: pl.penggarap || 'Pemilik Tanaman',
            nik: pl.nik,
            alamat: '',
            jenisAlasHak: '',
            nomerAlasHak: '',
            luasTanah: 0,
            penutupLahan: 'Kebun / Ladang',
            statusTanah: 'Tanah Masyarakat',
            bangunan: [],
            tanaman: [{
              jenis: pl.jenis,
              belum_menghasilkan: pl.bm,
              sudah_menghasilkan: pl.sm,
              kecil: pl.k,
              sedang: pl.s,
              besar: pl.b,
              total: pl.total,
            }],
            pageNumber: 1,
          });
          metadata.totalTanamanCount += pl.total;
        }
      }
    }

    metadata.totalBidang = bidangList.length;
    metadata.isMergedFromSheets = true;
    metadata.activeSheet = 'Gabungan Otomatis (Tanah + Bangunan + Tanaman)';
    metadata.sheetNames = sheetNames;
    metadata.sheetDetails = sheetInfos;
    metadata.mergeNote = `Otomatis menggabungkan data dari ${sheetNames.length} sheet: ${sheetInfos.map(s => `${s.name} (${s.type})`).join(', ')}`;

    return {
      metadata,
      bidangList,
      rawPagesText: [baseRows.slice(0, 100).map(r => r.join('\t')).join('\n')],
    };
  }

  // If multiple sheets are different Desas / Sections (e.g. Sheet Soborejo, Sheet Kandangan)
  let targetSheetName = sheetNames[0];
  // 1. Try to find a sheet matching initialDesa
  if (initialDesa) {
    const desaMatch = sheetNames.find(s => s.toUpperCase().includes(initialDesa.toUpperCase()));
    if (desaMatch) targetSheetName = desaMatch;
  }
  // 2. Otherwise find nominatif or data sheet
  if (!targetSheetName) {
    const nomMatch = sheetNames.find(s => /nominatif|esdm|data/i.test(s));
    if (nomMatch) targetSheetName = nomMatch;
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error(`Lembar Excel "${targetSheetName}" kosong.`);
  }

  const { metadata, bidangList } = parseStandardNominatifRows(rawRows, targetSheetName, fileName, initialDesa);
  metadata.sheetNames = sheetNames;
  metadata.activeSheet = targetSheetName;
  metadata.sheetDetails = sheetInfos;

  if (sheetNames.length > 1) {
    metadata.mergeNote = `File memiliki ${sheetNames.length} sheet. Menampilkan sheet "${targetSheetName}". Anda dapat beralih sheet melalui tab pilihan di atas tabel.`;
  }

  if (bidangList.length === 0) {
    throw new Error(
      `Tidak ditemukan data Bidang / Span (contoh: "T.45 - T.46") di sheet "${targetSheetName}". ` +
      'Silakan pilih sheet lain atau periksa kolom Span dan Nomor Bidang.'
    );
  }

  return {
    metadata,
    bidangList,
    rawPagesText: [rawRows.slice(0, 100).map(r => r.join('\t')).join('\n')],
  };
}

/**
 * Parse raw text pasted by user
 */
export function parseEsdmRawText(rawText: string, selectedDesa = ''): EsdmPdfParseResult {
  // Check if text is CSV or Tab-separated table with ESDM headers
  const sample = rawText.slice(0, 1500);
  if ((sample.includes(',') || sample.includes('\t')) && /span|bidang|nominatif|penerima|bangunan|tanaman/i.test(sample)) {
    try {
      const workbook = XLSX.read(rawText, { type: 'string' });
      const firstSheet = workbook.SheetNames[0];
      if (firstSheet) {
        const ws = workbook.Sheets[firstSheet];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rawRows && rawRows.length > 1) {
          const sheetType = detectSheetType(firstSheet, rawRows);
          if (sheetType === 'BANGUNAN') {
            const buildings = parseBangunanSheetRows(rawRows);
            const bidangList: EsdmBidangData[] = buildings.map((b, idx) => ({
              id: `ESDM_${selectedDesa || 'DESA'}_${(b.span || 'TOWER').replace(/[\s.-]/g, '')}_${b.subBidang || b.nobid || idx + 1}_${idx + 1}`,
              no: idx + 1,
              span: b.span || '-',
              nobid: b.subBidang || b.nobid || String(idx + 1),
              subBidang: b.subBidang,
              pihakBerhak: 'Pemilik Diketahui',
              nama: b.pemilik || 'Pemilik Bangunan',
              nik: b.nik,
              alamat: '',
              jenisAlasHak: '',
              nomerAlasHak: '',
              luasTanah: 0,
              penutupLahan: 'Bangunan',
              statusTanah: 'Masyarakat',
              bangunan: [{
                subBidang: b.subBidang,
                pemilik: b.pemilik,
                luas: b.luas,
                bentuk: b.bentuk,
                jenis: b.jenis,
              }],
              tanaman: [],
              pageNumber: 1,
            }));
            return {
              metadata: {
                judul: 'DAFTAR BANGUNAN',
                totalPages: 1,
                desa: selectedDesa || '',
                kecamatan: '',
                kabupaten: '',
                proyek: 'ESDM - Daftar Bangunan',
                totalBidang: bidangList.length,
                totalTanamanCount: 0,
                sourceType: 'TEXT',
                activeSheet: 'Daftar Bangunan',
                sheetNames: ['Daftar Bangunan'],
              },
              bidangList,
              rawPagesText: [rawText],
            };
          } else if (sheetType === 'TANAMAN') {
            const plants = parseTanamanSheetRows(rawRows);
            const bidangList: EsdmBidangData[] = plants.map((p, idx) => ({
              id: `ESDM_${selectedDesa || 'DESA'}_${(p.span || 'TOWER').replace(/[\s.-]/g, '')}_${p.nobid || idx + 1}_${idx + 1}`,
              no: idx + 1,
              span: p.span || '-',
              nobid: p.nobid || String(idx + 1),
              pihakBerhak: 'Penggarap / Pemilik',
              nama: p.penggarap || 'Pemilik Tanaman',
              nik: p.nik,
              alamat: '',
              jenisAlasHak: '',
              nomerAlasHak: '',
              luasTanah: 0,
              penutupLahan: 'Tanaman',
              statusTanah: 'Masyarakat',
              bangunan: [],
              tanaman: [{
                jenis: p.jenis,
                belum_menghasilkan: p.bm,
                sudah_menghasilkan: p.sm,
                kecil: p.k,
                sedang: p.s,
                besar: p.b,
                total: p.total,
              }],
              pageNumber: 1,
            }));
            return {
              metadata: {
                judul: 'DAFTAR TANAMAN',
                totalPages: 1,
                desa: selectedDesa || '',
                kecamatan: '',
                kabupaten: '',
                proyek: 'ESDM - Daftar Tanaman',
                totalBidang: bidangList.length,
                totalTanamanCount: plants.reduce((acc, p) => acc + p.total, 0),
                sourceType: 'TEXT',
                activeSheet: 'Daftar Tanaman',
                sheetNames: ['Daftar Tanaman'],
              },
              bidangList,
              rawPagesText: [rawText],
            };
          } else {
            const { metadata, bidangList } = parseStandardNominatifRows(rawRows, 'Pasted_Data', 'Pasted_Text', selectedDesa);
            metadata.sourceType = 'TEXT';
            if (bidangList.length > 0) {
              return {
                metadata,
                bidangList,
                rawPagesText: [rawText],
              };
            }
          }
        }
      }
    } catch {
      // Fallback to text line parser
    }
  }

  const lines = rawText.split('\n').map((text, idx) => ({ text, pageNumber: 1 }));
  const parsed = parseEsdmLines(lines, selectedDesa);
  parsed.metadata.sourceType = 'TEXT';

  if (parsed.bidangList.length === 0) {
    throw new Error('Tidak ada baris data Span & Nomor Bidang yang terdeteksi dari teks yang ditempel.');
  }

  return {
    metadata: parsed.metadata,
    bidangList: parsed.bidangList,
    rawPagesText: [rawText],
  };
}

/**
 * Universal file dispatcher: supports PDF, Excel (.xlsx, .xls), and CSV!
 */
export async function parseEsdmUniversalFile(file: File, selectedDesa = '', targetSheet = 'AUTO'): Promise<EsdmPdfParseResult> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    return await parseEsdmPdf(file, selectedDesa);
  } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
    return await parseEsdmExcel(file, selectedDesa, targetSheet);
  } else {
    throw new Error('Format file tidak didukung. Harap unggah file PDF (.pdf), Excel (.xlsx, .xls), atau CSV (.csv).');
  }
}

/**
 * Merges Excel structured data with PDF legal & address metadata (Hybrid Synergy).
 * - Excel provides: 100% accurate numeric backbone, nobid, NIK, clean building list, grouped plants.
 * - PDF provides: Alas hak / Sertifikat / Sporadik number (often '-' in Excel), full postal address, page numbers, signatures.
 * - Cross-validation: Compares Luas, Nama, and totals to verify that Excel and PDF agree.
 */
export function mergeEsdmExcelAndPdf(
  excelResult: EsdmPdfParseResult,
  pdfResult: EsdmPdfParseResult,
  excelFileName = 'nominatif.xlsx',
  pdfFileName = 'nominatif.pdf'
): EsdmPdfParseResult {
  const cleanKey = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizeSpan = (span: string) => {
    if (!span) return '';
    let s = String(span).toLowerCase().trim();
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
  const normalizeNobid = (nobid: string) => (nobid || '').trim().toLowerCase().replace(/^0+([1-9a-z])/i, '$1').replace(/^0+$/, '0') || '0';

  const matchedPdfIds = new Set<string>();
  let matchedCount = 0;
  let enrichedAlasHakCount = 0;
  let discrepancyCount = 0;
  const mismatchNotes: string[] = [];

  const mergedBidangList: EsdmBidangData[] = excelResult.bidangList.map((eBidang) => {
    const eSpanKey = normalizeSpan(eBidang.span);
    const eNobidKey = normalizeNobid(eBidang.nobid);
    const eNik = cleanKey(eBidang.nik);
    const eNamaKey = cleanKey(eBidang.nama);

    // Find best match in PDF
    // 1. Primary match: Span + No Bidang
    let matchedPdf = pdfResult.bidangList.find(p => {
      if (matchedPdfIds.has(p.id)) return false;
      const pSpanKey = normalizeSpan(p.span);
      const pNobidKey = normalizeNobid(p.nobid);
      return eSpanKey && pSpanKey === eSpanKey && eNobidKey && pNobidKey === eNobidKey;
    });

    // 2. Fallback: Span + NIK (with disambiguation if multiple plots have same NIK in span)
    if (!matchedPdf && eSpanKey && eNik && eNik.length >= 10) {
      const spanNikCandidates = pdfResult.bidangList.filter(p => {
        if (matchedPdfIds.has(p.id)) return false;
        const pSpanKey = normalizeSpan(p.span);
        return pSpanKey === eSpanKey && cleanKey(p.nik) === eNik;
      });
      if (spanNikCandidates.length === 1) {
        matchedPdf = spanNikCandidates[0];
      } else if (spanNikCandidates.length > 1) {
        matchedPdf = spanNikCandidates.find(p => normalizeNobid(p.nobid) === eNobidKey) ||
          spanNikCandidates.find(p => {
            if (eBidang.luasTanah && p.luasTanah) {
              return Math.abs(eBidang.luasTanah - p.luasTanah) <= 0.05;
            }
            return false;
          }) || spanNikCandidates[0];
      }
    }

    // 3. Fallback: Unique NIK across PDF (only if exactly 1 candidate in PDF)
    if (!matchedPdf && eNik && eNik.length >= 12) {
      const allNikCandidates = pdfResult.bidangList.filter(p => {
        if (matchedPdfIds.has(p.id)) return false;
        return cleanKey(p.nik) === eNik;
      });
      if (allNikCandidates.length === 1) {
        matchedPdf = allNikCandidates[0];
      }
    }

    // 4. Fallback: Span + Name similarity
    if (!matchedPdf && eSpanKey && eNamaKey && eNamaKey.length >= 4) {
      const spanNameCandidates = pdfResult.bidangList.filter(p => {
        if (matchedPdfIds.has(p.id)) return false;
        const pSpanKey = normalizeSpan(p.span);
        const pNamaKey = cleanKey(p.nama);
        return pSpanKey === eSpanKey && (pNamaKey.includes(eNamaKey) || eNamaKey.includes(pNamaKey));
      });
      if (spanNameCandidates.length === 1) {
        matchedPdf = spanNameCandidates[0];
      } else if (spanNameCandidates.length > 1) {
        matchedPdf = spanNameCandidates.find(p => normalizeNobid(p.nobid) === eNobidKey) || spanNameCandidates[0];
      }
    }

    if (matchedPdf) {
      matchedPdfIds.add(matchedPdf.id);
      matchedCount++;

      // Legal Alas Hak enrichment from PDF
      let jenisAlasHak = eBidang.jenisAlasHak;
      let nomerAlasHak = eBidang.nomerAlasHak;
      const isExcelAlasEmpty = !jenisAlasHak || jenisAlasHak === '-' || /belum|tidak/i.test(jenisAlasHak);
      const isExcelNoAlasEmpty = !nomerAlasHak || nomerAlasHak === '-';

      if ((isExcelAlasEmpty || isExcelNoAlasEmpty) && (matchedPdf.jenisAlasHak || matchedPdf.nomerAlasHak)) {
        if (matchedPdf.jenisAlasHak && isExcelAlasEmpty) {
          jenisAlasHak = matchedPdf.jenisAlasHak;
        }
        if (matchedPdf.nomerAlasHak && isExcelNoAlasEmpty) {
          nomerAlasHak = matchedPdf.nomerAlasHak;
        }
        enrichedAlasHakCount++;
      }

      // Address enrichment from PDF (PDF has full RT/RW address in Identitas)
      let alamat = eBidang.alamat;
      if ((!alamat || alamat.length < 5) && matchedPdf.alamat && matchedPdf.alamat.length >= 5) {
        alamat = matchedPdf.alamat;
      }

      // Cross-check Luas Tanah
      const diffLuas = Math.abs((eBidang.luasTanah || 0) - (matchedPdf.luasTanah || 0));
      const isLuasMatch = diffLuas <= 0.05;
      const isNamaMatch = !eNamaKey || !cleanKey(matchedPdf.nama) || eNamaKey === cleanKey(matchedPdf.nama) || eNamaKey.includes(cleanKey(matchedPdf.nama)) || cleanKey(matchedPdf.nama).includes(eNamaKey);

      const notes: string[] = [];
      let statusMatch: 'MATCH' | 'DIFF_LUAS' | 'DIFF_NAMA' = 'MATCH';

      if (!isLuasMatch) {
        statusMatch = 'DIFF_LUAS';
        discrepancyCount++;
        const note = `Span ${eBidang.span} No. ${eBidang.nobid} (${eBidang.nama}): Luas Excel ${eBidang.luasTanah} m² vs PDF ${matchedPdf.luasTanah} m² (selisih ${(eBidang.luasTanah - matchedPdf.luasTanah).toFixed(2)} m²)`;
        notes.push(note);
        mismatchNotes.push(note);
      }
      if (!isNamaMatch) {
        if (statusMatch === 'MATCH') statusMatch = 'DIFF_NAMA';
        const note = `Span ${eBidang.span} No. ${eBidang.nobid}: Ejaan Nama Excel "${eBidang.nama}" vs PDF "${matchedPdf.nama}"`;
        notes.push(note);
      }

      if (notes.length === 0) {
        notes.push('Validasi Silang: 100% Cocok antara Excel & PDF');
      }

      return {
        ...eBidang,
        jenisAlasHak: jenisAlasHak || eBidang.jenisAlasHak,
        nomerAlasHak: nomerAlasHak || eBidang.nomerAlasHak,
        alamat: alamat || eBidang.alamat,
        pageNumber: matchedPdf.pageNumber || eBidang.pageNumber,
        source: 'HYBRID',
        pdfCrossCheck: {
          pdfFound: true,
          luasTanahPdf: matchedPdf.luasTanah,
          namaPdf: matchedPdf.nama,
          alasHakPdf: [matchedPdf.jenisAlasHak, matchedPdf.nomerAlasHak].filter(Boolean).join(' - '),
          statusMatch,
          notes,
        },
      };
    }

    // Bidang only found in Excel
    return {
      ...eBidang,
      source: 'EXCEL',
      pdfCrossCheck: {
        pdfFound: false,
        statusMatch: 'EXCEL_ONLY',
        notes: ['Bidang ini tercatat di lembar Excel, namun tidak ditemukan baris yang cocok di berkas PDF.'],
      },
    };
  });

  // Append any bidang present in PDF but not found in Excel
  pdfResult.bidangList.forEach(p => {
    if (!matchedPdfIds.has(p.id)) {
      discrepancyCount++;
      const note = `Bidang di PDF (Span ${p.span} No. ${p.nobid} - ${p.nama}) tidak ditemukan di Excel.`;
      mismatchNotes.push(note);

      mergedBidangList.push({
        ...p,
        no: mergedBidangList.length + 1,
        source: 'PDF',
        pdfCrossCheck: {
          pdfFound: true,
          luasTanahPdf: p.luasTanah,
          namaPdf: p.nama,
          alasHakPdf: [p.jenisAlasHak, p.nomerAlasHak].filter(Boolean).join(' - '),
          statusMatch: 'PDF_ONLY',
          notes: ['Bidang ini tercatat di PDF, namun tidak ditemukan baris yang cocok di berkas Excel.'],
        },
      });
    }
  });

  return {
    metadata: {
      judul: `${excelResult.metadata.judul || 'DAFTAR NOMINATIF'} (Sinergi Hibrida Excel + PDF)`,
      proyek: excelResult.metadata.proyek || pdfResult.metadata.proyek || 'ESDM - Proyek',
      kabupaten: excelResult.metadata.kabupaten || pdfResult.metadata.kabupaten || '',
      kecamatan: excelResult.metadata.kecamatan || pdfResult.metadata.kecamatan || '',
      desa: excelResult.metadata.desa || pdfResult.metadata.desa || '',
      totalPages: pdfResult.metadata.totalPages || 1,
      totalBidang: mergedBidangList.length,
      totalTanamanCount: excelResult.metadata.totalTanamanCount || pdfResult.metadata.totalTanamanCount,
      sourceType: 'HYBRID',
      fileName: `${excelFileName} + ${pdfFileName}`,
      excelFileName,
      pdfFileName,
      sheetNames: excelResult.metadata.sheetNames || [],
      activeSheet: excelResult.metadata.activeSheet,
      sheetDetails: excelResult.metadata.sheetDetails,
      isMergedFromSheets: excelResult.metadata.isMergedFromSheets,
      mergeNote: `Sinergi Hibrida Berhasil: ${matchedCount} bidang disinkronisasi antara Excel & PDF. ${enrichedAlasHakCount} bidang dilengkapi data Alas Hak/Sertifikat resmi dari PDF.`,
      hybridSummary: {
        excelFileName,
        pdfFileName,
        excelBidangCount: excelResult.bidangList.length,
        pdfBidangCount: pdfResult.bidangList.length,
        matchedCount,
        enrichedAlasHakCount,
        discrepancyCount,
        mismatchNotes: mismatchNotes.slice(0, 10),
      },
    },
    bidangList: mergedBidangList,
    rawPagesText: [...(excelResult.rawPagesText || []), ...(pdfResult.rawPagesText || [])],
  };
}

/**
 * Parses both an Excel file and a PDF file concurrently, then fuses them with Hybrid Synergy.
 */
export async function parseEsdmDualFiles(
  excelFileOrBuffer: File | ArrayBuffer,
  pdfFileOrBuffer: File | ArrayBuffer,
  selectedDesa = '',
  targetSheet = 'AUTO',
  excelFileName?: string,
  pdfFileName?: string
): Promise<EsdmPdfParseResult> {
  const eName = excelFileName || (excelFileOrBuffer instanceof File ? excelFileOrBuffer.name : 'Data_ESDM.xlsx');
  const pName = pdfFileName || (pdfFileOrBuffer instanceof File ? pdfFileOrBuffer.name : 'Dokumen_ESDM.pdf');

  // Execute both parsing tasks concurrently
  const [excelResult, pdfResult] = await Promise.all([
    parseEsdmExcel(excelFileOrBuffer, selectedDesa, targetSheet),
    parseEsdmPdf(pdfFileOrBuffer, selectedDesa),
  ]);

  return mergeEsdmExcelAndPdf(excelResult, pdfResult, eName, pName);
}


/**
 * Pre-loaded Demo ESDM Data for Desa Soborejo
 * Exactly matching the 24 Bidang from the official ESDM Nominatif export attached by user!
 */
export function getDemoSoborejoEsdmData(): EsdmPdfParseResult {
  return {
    metadata: {
      judul: "DAFTAR NOMINATIF INVENTARISASI TANAH, BANGUNAN DAN/ATAU TANAMAN",
      proyek: "SUTT 150 KV JELOK - SANGGRAHAN REC 2CCT",
      kabupaten: "KAB. TEMANGGUNG",
      kecamatan: "PRINGSURAT",
      desa: "SOBOREJO",
      totalPages: 13,
      totalBidang: 24,
      totalTanamanCount: 3012
    },
    rawPagesText: [],
    bidangList: [
      {
        id: "ESDM_SOBOREJO_T45T46_1",
        no: 1,
        span: "T.45 - T.46",
        nobid: "1",
        pihakBerhak: "Pemilik Diketahui",
        nama: "PT. Perkebunan Nusantara I Regional 3",
        nik: "",
        alamat: "",
        jenisAlasHak: "Sertifikat / Hak guna usaha",
        nomerAlasHak: "00004",
        luasTanah: 6665.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Aset Badan Usaha Milik Negara",
        bangunan: [],
        tanaman: [
          { jenis: "KARET", belum_menghasilkan: 10, sudah_menghasilkan: 469, kecil: 0, sedang: 0, besar: 0, total: 479 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 1
      },
      {
        id: "ESDM_SOBOREJO_T45T46_2",
        no: 2,
        span: "T.45 - T.46",
        nobid: "2",
        pihakBerhak: "Pemilik Diketahui",
        nama: "MURDANTO",
        nik: "3322083112550030",
        alamat: "WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Sertifikat / Hak milik",
        nomerAlasHak: "11.24.000018832.0",
        luasTanah: 110.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 24, kecil: 0, sedang: 0, besar: 0, total: 24 },
          { jenis: "LAMTORO", belum_menghasilkan: 10, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 11 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 2, besar: 0, total: 2 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 1, total: 1 }
        ],
        pageNumber: 1
      },
      {
        id: "ESDM_SOBOREJO_T45T46_3",
        no: 3,
        span: "T.45 - T.46",
        nobid: "3",
        pihakBerhak: "Pemilik Diketahui",
        nama: "KIRDI AL SOLICHUN",
        nik: "3322080207550003",
        alamat: "WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 198.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "AFRIKA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 2, besar: 3, total: 7 },
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "CENGKIH", belum_menghasilkan: 1, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "DURIAN", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KAYU MANIS", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 0, besar: 0, total: 2 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 43, kecil: 0, sedang: 0, besar: 0, total: 43 },
          { jenis: "LAMTORO", belum_menghasilkan: 79, sudah_menghasilkan: 9, kecil: 0, sedang: 0, besar: 0, total: 88 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 10, sedang: 1, besar: 0, total: 11 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 1, besar: 0, total: 2 },
          { jenis: "NANGKA", belum_menghasilkan: 2, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "SALAM", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 0, besar: 0, total: 2 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 8, sedang: 0, besar: 0, total: 8 },
          { jenis: "SENU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 3, sedang: 0, besar: 0, total: 3 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 1, besar: 0, total: 3 }
        ],
        pageNumber: 1
      },
      {
        id: "ESDM_SOBOREJO_T45T46_4",
        no: 4,
        span: "T.45 - T.46",
        nobid: "4",
        pihakBerhak: "Pemilik Diketahui",
        nama: "SHOLEKHAH",
        nik: "3322084103680001",
        alamat: "DSN WAWAR KIDUL, RT 005/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 883.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 6, sudah_menghasilkan: 8, kecil: 0, sedang: 0, besar: 0, total: 14 },
          { jenis: "DURIAN", belum_menghasilkan: 6, sudah_menghasilkan: 35, kecil: 0, sedang: 0, besar: 0, total: 41 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 9, sedang: 0, besar: 0, total: 9 },
          { jenis: "JENGKOL", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 33, sudah_menghasilkan: 191, kecil: 0, sedang: 0, besar: 0, total: 224 },
          { jenis: "LAMTORO", belum_menghasilkan: 55, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 57 },
          { jenis: "NANGKA", belum_menghasilkan: 2, sudah_menghasilkan: 9, kecil: 0, sedang: 0, besar: 0, total: 11 },
          { jenis: "PETAI", belum_menghasilkan: 0, sudah_menghasilkan: 8, kecil: 0, sedang: 0, besar: 0, total: 8 },
          { jenis: "SALAM", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 3, total: 3 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 2
      },
      {
        id: "ESDM_SOBOREJO_T45T46_5",
        no: 5,
        span: "T.45 - T.46",
        nobid: "5",
        pihakBerhak: "Pemilik Diketahui",
        nama: "SURADI",
        nik: "3322080104640003",
        alamat: "DSN WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 652.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "JENGKOL", belum_menghasilkan: 2, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 4 },
          { jenis: "KOPI", belum_menghasilkan: 9, sudah_menghasilkan: 214, kecil: 0, sedang: 0, besar: 0, total: 223 },
          { jenis: "LAMTORO", belum_menghasilkan: 110, sudah_menghasilkan: 51, kecil: 0, sedang: 0, besar: 0, total: 161 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 3, sedang: 0, besar: 0, total: 3 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 1, besar: 1, total: 4 },
          { jenis: "NANGKA", belum_menghasilkan: 6, sudah_menghasilkan: 9, kecil: 0, sedang: 0, besar: 0, total: 15 },
          { jenis: "PETAI", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "SIRSAK", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 6, sedang: 3, besar: 3, total: 12 }
        ],
        pageNumber: 2
      },
      {
        id: "ESDM_SOBOREJO_T45T46_6",
        no: 6,
        span: "T.45 - T.46",
        nobid: "6",
        pihakBerhak: "Pemilik Diketahui",
        nama: "PEMERINTAH KABUPATEN TEMANGGUNG",
        nik: "",
        alamat: "KABUPATEN TEMANGGUNG",
        jenisAlasHak: "Non Sertipikat / Lainnya",
        nomerAlasHak: "B/193/030/II/2026",
        luasTanah: 15.00,
        penutupLahan: "Saluran Irigasi",
        statusTanah: "Barang Milik Daerah",
        bangunan: [],
        tanaman: [],
        pageNumber: 3
      },
      {
        id: "ESDM_SOBOREJO_T45T46_7",
        no: 7,
        span: "T.45 - T.46",
        nobid: "7",
        pihakBerhak: "Pemilik Diketahui",
        nama: "SARYONO",
        nik: "3323041509680001",
        alamat: "KEMLOKO, RT 002/RW 007 DESA SOBOREJO KECAMATAN PRINGSURAT KABUPATEN TEMANGGUNG",
        jenisAlasHak: "Sertifikat / Hak milik",
        nomerAlasHak: "11.24.000002748.0",
        luasTanah: 773.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "DURIAN", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 7, sedang: 13, besar: 0, total: 20 },
          { jenis: "KAKAO", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 49, kecil: 0, sedang: 0, besar: 0, total: 49 },
          { jenis: "LAMTORO", belum_menghasilkan: 15, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 15 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 1, besar: 1, total: 2 }
        ],
        pageNumber: 3
      },
      {
        id: "ESDM_SOBOREJO_T45T46_8",
        no: 8,
        span: "T.45 - T.46",
        nobid: "8",
        pihakBerhak: "Pemilik Diketahui",
        nama: "MULYONO",
        nik: "3323040812580002",
        alamat: "KEMLOKO, RT 002/RW 002 DESA SOBOREJO KECAMATAN PRINGSURAT KABUPATEN TEMANGGUNG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 30.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KELAPA", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "PETAI", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 2, besar: 0, total: 3 }
        ],
        pageNumber: 4
      },
      {
        id: "ESDM_SOBOREJO_T45T46_9",
        no: 9,
        span: "T.45 - T.46",
        nobid: "9",
        pihakBerhak: "Pemilik Diketahui",
        nama: "SURADI",
        nik: "3322080104640003",
        alamat: "DSN WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 96.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 33, kecil: 0, sedang: 0, besar: 0, total: 33 },
          { jenis: "LAMTORO", belum_menghasilkan: 41, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 41 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 2, total: 2 },
          { jenis: "NANGKA", belum_menghasilkan: 1, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 3 }
        ],
        pageNumber: 4
      },
      {
        id: "ESDM_SOBOREJO_T45T46_10",
        no: 10,
        span: "T.45 - T.46",
        nobid: "10",
        pihakBerhak: "Pemilik Diketahui",
        nama: "SURADI",
        nik: "3322080104640003",
        alamat: "DSN WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 152.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 20, kecil: 0, sedang: 0, besar: 0, total: 20 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 1, total: 1 },
          { jenis: "NANGKA", belum_menghasilkan: 0, sudah_menghasilkan: 3, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 1, total: 1 }
        ],
        pageNumber: 4
      },
      {
        id: "ESDM_SOBOREJO_T45T46_11",
        no: 11,
        span: "T.45 - T.46",
        nobid: "11",
        pihakBerhak: "Pemilik Diketahui",
        nama: "MULYANTO",
        nik: "3322080408820002",
        alamat: "DSN WAWAR KIDUL, RT 009/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 106.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 1, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "DURIAN", belum_menghasilkan: 3, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 5 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 20, kecil: 0, sedang: 0, besar: 0, total: 20 },
          { jenis: "LAMTORO", belum_menghasilkan: 8, sudah_menghasilkan: 4, kecil: 0, sedang: 0, besar: 0, total: 12 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 18, sedang: 6, besar: 0, total: 24 },
          { jenis: "NANGKA", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "PETAI", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 5
      },
      {
        id: "ESDM_SOBOREJO_T45T46_12",
        no: 12,
        span: "T.45 - T.46",
        nobid: "12",
        pihakBerhak: "Pemilik Diketahui",
        nama: "PRIYANTINI",
        nik: "3323044403780002",
        alamat: "KEMLOKO, RT 002/RW 002 DESA SOBOREJO KECAMATAN PRINGSURAT KABUPATEN TEMANGGUNG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 593.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "DUKU", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 16, sedang: 1, besar: 0, total: 17 },
          { jenis: "JENGKOL", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 101, kecil: 0, sedang: 0, besar: 0, total: 101 },
          { jenis: "LAMTORO", belum_menghasilkan: 74, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 74 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "NANGKA", belum_menghasilkan: 2, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "PETAI", belum_menghasilkan: 0, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 3, besar: 0, total: 5 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 4, besar: 0, total: 4 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 0, besar: 0, total: 2 }
        ],
        pageNumber: 5
      },
      {
        id: "ESDM_SOBOREJO_T45T46_13",
        no: 13,
        span: "T.45 - T.46",
        nobid: "13",
        pihakBerhak: "Pemilik Diketahui",
        nama: "ABDI DAMA",
        nik: "3322080112040003",
        alamat: "WAWAR KIDUL, RT 003/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 625.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 4, sudah_menghasilkan: 12, kecil: 0, sedang: 0, besar: 0, total: 16 },
          { jenis: "CENGKIH", belum_menghasilkan: 2, sudah_menghasilkan: 10, kecil: 0, sedang: 0, besar: 0, total: 12 },
          { jenis: "DURIAN", belum_menghasilkan: 1, sudah_menghasilkan: 19, kecil: 0, sedang: 0, besar: 0, total: 20 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 17, sedang: 0, besar: 0, total: 17 },
          { jenis: "JENGKOL", belum_menghasilkan: 5, sudah_menghasilkan: 7, kecil: 0, sedang: 0, besar: 0, total: 12 },
          { jenis: "JERUK", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 13, sudah_menghasilkan: 202, kecil: 0, sedang: 0, besar: 0, total: 215 },
          { jenis: "LAMTORO", belum_menghasilkan: 20, sudah_menghasilkan: 26, kecil: 0, sedang: 0, besar: 0, total: 46 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 22, sedang: 0, besar: 0, total: 22 },
          { jenis: "MELINJO", belum_menghasilkan: 0, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 4, sedang: 0, besar: 1, total: 5 },
          { jenis: "NANGKA", belum_menghasilkan: 4, sudah_menghasilkan: 4, kecil: 0, sedang: 0, besar: 0, total: 8 },
          { jenis: "PETAI", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 3, sedang: 0, besar: 1, total: 4 },
          { jenis: "SONOKELING", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 6
      },
      {
        id: "ESDM_SOBOREJO_T45T46_14",
        no: 14,
        span: "T.45 - T.46",
        nobid: "14",
        pihakBerhak: "Pemilik Diketahui",
        nama: "YASMINAH",
        nik: "3322086703770002",
        alamat: "WAWAR KIDUL, RT 001/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 221.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 3, sudah_menghasilkan: 3, kecil: 0, sedang: 0, besar: 0, total: 6 },
          { jenis: "CENGKIH", belum_menghasilkan: 0, sudah_menghasilkan: 11, kecil: 0, sedang: 0, besar: 0, total: 11 },
          { jenis: "DURIAN", belum_menghasilkan: 0, sudah_menghasilkan: 4, kecil: 0, sedang: 0, besar: 0, total: 4 },
          { jenis: "JENGKOL", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KELENGKENG", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 53, kecil: 0, sedang: 0, besar: 0, total: 53 },
          { jenis: "LAMTORO", belum_menghasilkan: 32, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 32 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "MANGGA", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 1, total: 2 },
          { jenis: "NANGKA", belum_menghasilkan: 2, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 4 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 5, sedang: 0, besar: 0, total: 5 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 1, besar: 0, total: 1 },
          { jenis: "SUREN", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 1, total: 1 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 4, sedang: 3, besar: 0, total: 7 },
          { jenis: "RAMBUTAN", belum_menghasilkan: 0, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "SALAM", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "WURU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 6
      },
      {
        id: "ESDM_SOBOREJO_T46T47_1",
        no: 15,
        span: "T.46 - T.47",
        nobid: "1",
        pihakBerhak: "Pemilik Diketahui",
        nama: "YASMINAH",
        nik: "3322086703770002",
        alamat: "WAWAR KIDUL, RT 001/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 383.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 1, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "CENGKIH", belum_menghasilkan: 1, sudah_menghasilkan: 5, kecil: 0, sedang: 0, besar: 0, total: 6 },
          { jenis: "DURIAN", belum_menghasilkan: 4, sudah_menghasilkan: 5, kecil: 0, sedang: 0, besar: 0, total: 9 },
          { jenis: "JENGKOL", belum_menghasilkan: 4, sudah_menghasilkan: 5, kecil: 0, sedang: 0, besar: 0, total: 9 },
          { jenis: "KAYU MANIS", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 7, sedang: 0, besar: 0, total: 7 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 38, kecil: 0, sedang: 0, besar: 0, total: 38 },
          { jenis: "LAMTORO", belum_menghasilkan: 7, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 7 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 4, sedang: 1, besar: 2, total: 7 },
          { jenis: "NANGKA", belum_menghasilkan: 1, sudah_menghasilkan: 5, kecil: 0, sedang: 0, besar: 0, total: 6 }
        ],
        pageNumber: 7
      },
      {
        id: "ESDM_SOBOREJO_T46T47_2",
        no: 16,
        span: "T.46 - T.47",
        nobid: "2",
        pihakBerhak: "Pemilik Diketahui",
        nama: "MULYADIN",
        nik: "3322082003800002",
        alamat: "WAWAR KIDUL, RT 009/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 2093.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 2, sudah_menghasilkan: 3, kecil: 0, sedang: 0, besar: 0, total: 5 },
          { jenis: "CENGKIH", belum_menghasilkan: 7, sudah_menghasilkan: 10, kecil: 0, sedang: 0, besar: 0, total: 17 },
          { jenis: "DUKU", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "DURIAN", belum_menghasilkan: 8, sudah_menghasilkan: 17, kecil: 0, sedang: 0, besar: 0, total: 25 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 126, sedang: 0, besar: 0, total: 126 },
          { jenis: "JENGKOL", belum_menghasilkan: 2, sudah_menghasilkan: 5, kecil: 0, sedang: 0, besar: 0, total: 7 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 36, sedang: 205, besar: 0, total: 241 },
          { jenis: "KELAPA", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KELENGKENG", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 7, sudah_menghasilkan: 390, kecil: 0, sedang: 0, besar: 0, total: 397 },
          { jenis: "LAMTORO", belum_menghasilkan: 10, sudah_menghasilkan: 15, kecil: 0, sedang: 0, besar: 0, total: 25 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 34, sedang: 1, besar: 1, total: 36 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 4, sedang: 4, besar: 3, total: 11 },
          { jenis: "NANGKA", belum_menghasilkan: 16, sudah_menghasilkan: 17, kecil: 0, sedang: 0, besar: 0, total: 33 },
          { jenis: "RAMBUTAN", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 1, besar: 0, total: 1 },
          { jenis: "SIRSAK", belum_menghasilkan: 0, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "SOGO", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 9, sedang: 17, besar: 2, total: 28 },
          { jenis: "SUREN", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 2, total: 2 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 7, sedang: 0, besar: 0, total: 7 }
        ],
        pageNumber: 8
      },
      {
        id: "ESDM_SOBOREJO_T46T47_3",
        no: 17,
        span: "T.46 - T.47",
        nobid: "3",
        pihakBerhak: "Pemilik Diketahui",
        nama: "DIDIK ASTUTIK",
        nik: "1110122002830001",
        alamat: "KEMBANGSONGO, RT 008/RW 000 KEL/DESA TRIMULYO KECAMATAN JETIS KABUPATEN BANTUL",
        jenisAlasHak: "Sertifikat / Hak milik",
        nomerAlasHak: "11.24.000008015.0",
        luasTanah: 104.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 9, kecil: 0, sedang: 0, besar: 0, total: 9 },
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 3, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 11, sedang: 0, besar: 0, total: 11 },
          { jenis: "PUCUK MERAH", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 9
      },
      {
        id: "ESDM_SOBOREJO_T46T47_4",
        no: 18,
        span: "T.46 - T.47",
        nobid: "4",
        pihakBerhak: "Pemilik Diketahui",
        nama: "DONO PRIYOTO",
        nik: "3322082608630001",
        alamat: "WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Sertifikat / Hak milik",
        nomerAlasHak: "11.24.000018231.0",
        luasTanah: 771.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 3, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "DURIAN", belum_menghasilkan: 4, sudah_menghasilkan: 13, kecil: 0, sedang: 0, besar: 0, total: 17 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 32, sedang: 0, besar: 0, total: 32 },
          { jenis: "JENGKOL", belum_menghasilkan: 4, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 4 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 107, sedang: 0, besar: 0, total: 107 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 198, kecil: 0, sedang: 0, besar: 0, total: 198 },
          { jenis: "LAMTORO", belum_menghasilkan: 31, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 31 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "NANGKA", belum_menghasilkan: 4, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 4 },
          { jenis: "RAMBUTAN", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 9
      },
      {
        id: "ESDM_SOBOREJO_T46T47_5",
        no: 19,
        span: "T.46 - T.47",
        nobid: "5",
        pihakBerhak: "Pemilik Diketahui",
        nama: "MURDANTO",
        nik: "3322083112550030",
        alamat: "WAWAR KIDUL, RT 002/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Sertifikat / Hak milik",
        nomerAlasHak: "11.24.000018230.0",
        luasTanah: 967.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 2, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 4 },
          { jenis: "DURIAN", belum_menghasilkan: 5, sudah_menghasilkan: 15, kecil: 0, sedang: 0, besar: 0, total: 20 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 28, sedang: 0, besar: 0, total: 28 },
          { jenis: "JENGKOL", belum_menghasilkan: 2, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 107, sedang: 0, besar: 0, total: 107 },
          { jenis: "KOPI", belum_menghasilkan: 0, sudah_menghasilkan: 190, kecil: 0, sedang: 0, besar: 0, total: 190 },
          { jenis: "NANGKA", belum_menghasilkan: 1, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 10
      },
      {
        id: "ESDM_SOBOREJO_T46T47_6",
        no: 20,
        span: "T.46 - T.47",
        nobid: "6",
        pihakBerhak: "Pemilik Diketahui",
        nama: "KARNA PRABA JOKO BANDRIYO",
        nik: "3322080304610003",
        alamat: "WAWAR KIDUL, RT 010/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 558.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "DURIAN", belum_menghasilkan: 9, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 9 },
          { jenis: "JENGKOL", belum_menghasilkan: 2, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 41, sedang: 0, besar: 0, total: 41 },
          { jenis: "KOPI", belum_menghasilkan: 2, sudah_menghasilkan: 97, kecil: 0, sedang: 0, besar: 0, total: 99 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 10
      },
      {
        id: "ESDM_SOBOREJO_T46T47_7",
        no: 21,
        span: "T.46 - T.47",
        nobid: "7",
        pihakBerhak: "Pemilik Diketahui",
        nama: "SUMIYAH SURYAWATI",
        nik: "3322086704660001",
        alamat: "DSN WAWAR KIDUL, RT 010/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 1082.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "DURIAN", belum_menghasilkan: 2, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 85, sedang: 5, besar: 0, total: 90 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 4, sedang: 0, besar: 0, total: 4 },
          { jenis: "KELAPA", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 5, sudah_menghasilkan: 225, kecil: 0, sedang: 0, besar: 0, total: 230 },
          { jenis: "LAMTORO", belum_menghasilkan: 2, sudah_menghasilkan: 9, kecil: 0, sedang: 0, besar: 0, total: 11 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "NANGKA", belum_menghasilkan: 1, sudah_menghasilkan: 6, kecil: 0, sedang: 0, besar: 0, total: 7 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 4, sedang: 0, besar: 1, total: 5 },
          { jenis: "WARU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 10
      },
      {
        id: "ESDM_SOBOREJO_T46T47_8",
        no: 22,
        span: "T.46 - T.47",
        nobid: "8",
        pihakBerhak: "Pemilik Diketahui",
        nama: "YUSUP",
        nik: "3322082904830001",
        alamat: "DSN WAWAR KIDUL, RT 010/RW 003 DESA BEDONO KECAMATAN JAMBU KABUPATEN SEMARANG",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 53.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 4, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 6 },
          { jenis: "DURIAN", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 0, besar: 0, total: 2 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 30, sedang: 0, besar: 0, total: 30 },
          { jenis: "KOPI", belum_menghasilkan: 4, sudah_menghasilkan: 14, kecil: 0, sedang: 0, besar: 0, total: 18 }
        ],
        pageNumber: 11
      },
      {
        id: "ESDM_SOBOREJO_T47T48_1",
        no: 23,
        span: "T.47 - T.48",
        nobid: "1",
        pihakBerhak: "Pemilik Diketahui",
        nama: "YUSUP",
        nik: "3322082904830001",
        alamat: "DSN WAWAR KIDUL, RT 010/RW 003 DESA BEDONO KECAMATAN JAMBU",
        jenisAlasHak: "Non Sertipikat / Sporadik",
        nomerAlasHak: "12/03/2026",
        luasTanah: 1036.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 5, sudah_menghasilkan: 7, kecil: 0, sedang: 0, besar: 0, total: 12 },
          { jenis: "BAMBU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 41, sedang: 0, besar: 0, total: 41 },
          { jenis: "CENGKIH", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "DURIAN", belum_menghasilkan: 3, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 5 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 0, besar: 0, total: 2 },
          { jenis: "JENGKOL", belum_menghasilkan: 2, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 2 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 124, sedang: 0, besar: 0, total: 124 },
          { jenis: "KELAPA", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KOPI", belum_menghasilkan: 25, sudah_menghasilkan: 149, kecil: 0, sedang: 0, besar: 0, total: 174 },
          { jenis: "LAMTORO", belum_menghasilkan: 0, sudah_menghasilkan: 16, kecil: 0, sedang: 0, besar: 0, total: 16 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 0, sedang: 1, besar: 0, total: 1 },
          { jenis: "MINDI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "NANGKA", belum_menghasilkan: 2, sudah_menghasilkan: 6, kecil: 0, sedang: 0, besar: 0, total: 8 },
          { jenis: "PETAI", belum_menghasilkan: 2, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 3 },
          { jenis: "SALAM", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 2, sedang: 0, besar: 0, total: 2 },
          { jenis: "SIRSAK", belum_menghasilkan: 2, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 3 }
        ],
        pageNumber: 11
      },
      {
        id: "ESDM_SOBOREJO_T47T48_2",
        no: 24,
        span: "T.47 - T.48",
        nobid: "2",
        pihakBerhak: "Pemilik Diketahui",
        nama: "NURUL KHOLIFAH",
        nik: "3323044803950002",
        alamat: "JAGALAN, RT 002/RW 007 KEL/DESA KRANGGAN KECAMATAN AMBARAWA KABUPATEN SEMARANG",
        jenisAlasHak: "Sertifikat / Hak milik",
        nomerAlasHak: "11.24.000013033.0",
        luasTanah: 716.00,
        penutupLahan: "Perkebunan",
        statusTanah: "Tanah Masyarakat",
        bangunan: [],
        tanaman: [
          { jenis: "ALPUKAT", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "BAMBU", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 93, sedang: 0, besar: 0, total: 93 },
          { jenis: "GAMAL", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 8, sedang: 0, besar: 0, total: 8 },
          { jenis: "JAMBU BIJI", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "JENGKOL", belum_menghasilkan: 0, sudah_menghasilkan: 1, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "KALIANDRA", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 11, sedang: 0, besar: 0, total: 11 },
          { jenis: "KOPI", belum_menghasilkan: 5, sudah_menghasilkan: 2, kecil: 0, sedang: 0, besar: 0, total: 7 },
          { jenis: "MAHONI", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 },
          { jenis: "RAMBUTAN", belum_menghasilkan: 1, sudah_menghasilkan: 0, kecil: 0, sedang: 0, besar: 0, total: 1 },
          { jenis: "SENGON", belum_menghasilkan: 0, sudah_menghasilkan: 0, kecil: 1, sedang: 0, besar: 0, total: 1 }
        ],
        pageNumber: 12
      }
    ]
  };
}

