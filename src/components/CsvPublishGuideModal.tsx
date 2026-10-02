import React, { useState } from 'react';
import { 
  Globe, FileSpreadsheet, X, CheckCircle2, Copy, 
  ExternalLink, ShieldCheck, Zap, Download, Sparkles, FileText, Check,
  Layers, Mail
} from 'lucide-react';
import { 
  downloadSheetHeaderTemplate, 
  downloadResumeHeaderTemplate,
  downloadAgencyLetterHeaderTemplate,
  copySheetHeadersToClipboard,
  copyResumeHeadersToClipboard,
  copyAgencyLetterHeadersToClipboard
} from '../lib/sheetTemplateHelper';

interface CsvPublishGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSpreadsheetId?: string | null;
  activeProjectName?: string;
}

export function CsvPublishGuideModal({
  isOpen,
  onClose,
  activeSpreadsheetId,
  activeProjectName = 'Jalur_Kompensasi'
}: CsvPublishGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'guide' | 'headers'>('guide');
  const [selectedTemplateTab, setSelectedTemplateTab] = useState<'lahan' | 'resume' | 'surat'>('lahan');
  const [copiedExample, setCopiedExample] = useState(false);
  const [copiedHeaders, setCopiedHeaders] = useState(false);
  const [copiedResumeHeaders, setCopiedResumeHeaders] = useState(false);
  const [copiedAgencyHeaders, setCopiedAgencyHeaders] = useState(false);

  if (!isOpen) return null;

  const exampleUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRxxxx.../pub?output=csv";

  const handleCopyExample = () => {
    navigator.clipboard.writeText(exampleUrl);
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 2000);
  };

  const handleCopyAllHeaders = async () => {
    const ok = await copySheetHeadersToClipboard();
    if (ok) {
      setCopiedHeaders(true);
      setTimeout(() => setCopiedHeaders(false), 2500);
    }
  };

  const handleCopyResumeHeaders = async () => {
    const ok = await copyResumeHeadersToClipboard();
    if (ok) {
      setCopiedResumeHeaders(true);
      setTimeout(() => setCopiedResumeHeaders(false), 2500);
    }
  };

  const handleCopyAgencyHeaders = async () => {
    const ok = await copyAgencyLetterHeadersToClipboard();
    if (ok) {
      setCopiedAgencyHeaders(true);
      setTimeout(() => setCopiedAgencyHeaders(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="glass-card rounded-3xl w-full max-w-2xl border border-sky-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] bg-slate-900/95 text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-sky-950/80 via-slate-900 to-amber-950/40 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-white tracking-wide uppercase font-sans">
                  Panduan Publikasi CSV & Struktur Spreadsheet
                </h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Mode Tamu & Publik
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Arsitektur 1 Google Spreadsheet per jalur transmisi dan akses data tanpa login.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/10 bg-slate-950/40 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'guide'
                ? 'border-sky-500 text-sky-300 bg-sky-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            5 Langkah Publikasi Web CSV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'headers'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Template & Struktur 267 Kolom
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          
          {activeTab === 'guide' && (
            <>
              {/* Mengapa 1 Spreadsheet Per Jalur & Web Publish CSV */}
              <div className="p-4 bg-sky-500/10 border border-sky-500/25 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-sky-300 font-bold text-xs uppercase tracking-wide">
                  <Zap className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Konsep: 1 Spreadsheet Per Jalur + Web Publish CSV</span>
                </div>
                <p className="text-[11px] text-sky-100/90 leading-relaxed">
                  Setiap jalur transmisi (SUTT/SUTET) memiliki <strong>Google Spreadsheet tersendiri</strong> agar proses input lapangan cepat, data terisolasi, dan tidak saling bertabrakan.
                  Untuk <strong>Tamu / Stakeholder</strong> yang tidak memiliki akun Google kerja, Anda cukup mempublikasikan file tersebut ke format <strong>CSV (.csv)</strong> agar data langsung terbaca di web secara aman (read-only).
                </p>
              </div>

              {/* 5 Langkah Mudah */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  5 Langkah Mendapatkan Tautan Web Publish CSV
                </h4>

                {/* Step 1 */}
                <div className="flex items-start gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                    1
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-bold text-white">Buka Google Spreadsheet Jalur Terkait</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Buka dokumen Google Sheets yang menjadi database nominatif jalur transmisi tersebut di Google Drive Anda.
                    </p>
                    {activeSpreadsheetId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-400 hover:text-sky-300 mt-1 underline"
                      >
                        Buka Spreadsheet Jalur Aktif di Tab Baru <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                    2
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-bold text-white">Buka Menu "Publikasikan ke Web"</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Di Google Sheets, klik menu bar atas: 
                      <span className="text-amber-300 font-bold mx-1">File</span> ➔ 
                      <span className="text-amber-300 font-bold mx-1">Bagikan (Share)</span> ➔ 
                      <span className="text-amber-300 font-bold mx-1">Publikasikan ke web (Publish to the web)</span>.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                    3
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-bold text-white">Ubah Format Menjadi "Nilai yang dipisahkan koma (.csv)"</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Pada jendela pop-up Google Sheets:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1">
                      <li>Pilih lembar (sheet) data nominatif, atau pilih <strong className="text-white">Seluruh Dokumen</strong>.</li>
                      <li>Ubah pilihan dropdown dari <strong className="text-rose-400">"Halaman Web"</strong> menjadi <strong className="text-emerald-400">"Nilai yang dipisahkan koma (.csv)"</strong>.</li>
                    </ul>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                    4
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-xs font-bold text-white">Klik Tombol Hijau "Publikasikan" (Publish)</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Klik tombol <strong className="text-emerald-400">Publikasikan</strong> dan konfirmasi dengan klik <strong>OK</strong> saat browser meminta konfirmasi.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex items-start gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-amber-500/30">
                    5
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <p className="text-xs font-bold text-white">Salin Tautan URL & Tempelkan ke Kolom Tautan CSV</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Salin tautan URL yang diberikan oleh Google Sheets. Format URL resmi Google Web Publish CSV adalah:
                    </p>
                    <div className="p-2.5 bg-slate-950 rounded-xl border border-white/10 flex items-center justify-between font-mono text-[10px] text-emerald-300">
                      <span className="truncate max-w-[420px] select-all">{exampleUrl}</span>
                      <button
                        type="button"
                        onClick={handleCopyExample}
                        className="p-1 text-slate-400 hover:text-white rounded transition-colors ml-2 shrink-0 cursor-pointer"
                        title="Salin contoh format URL"
                      >
                        {copiedExample ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Tempelkan tautan tersebut ke kolom <strong className="text-white">Tautan Publik CSV</strong> pada menu <strong>Manajemen Proyek ➔ Edit ID</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Keamanan & Otorisasi Catatan */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-[11px] text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Data Aman (Read-Only):</strong> Tautan Web Publish CSV hanya memberikan izin membaca data (tidak dapat mengubah isi sheet). Tim lapangan tetap menginput melalui akun berizin resmi.
                </p>
              </div>
            </>
          )}

          {activeTab === 'headers' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Sub-tab 3 Files Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateTab('lahan')}
                  className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedTemplateTab === 'lahan'
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>1. Lahan (267 Kolom)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplateTab('resume')}
                  className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedTemplateTab === 'resume'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>2. Resume (36 Kolom)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplateTab('surat')}
                  className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedTemplateTab === 'surat'
                      ? 'bg-sky-500 text-slate-950 font-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>3. Surat (13 Kolom)</span>
                </button>
              </div>

              {/* 1. FILE DATA LAHAN */}
              {selectedTemplateTab === 'lahan' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-4 bg-gradient-to-r from-emerald-500/15 via-slate-900 to-amber-500/10 border border-emerald-500/25 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                          File 1: Data Lahan & Identitas Pemilik
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        267 Kolom Resmi
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Dokumen utama untuk seluruh inventarisasi bidang tanah kompensasi ROW, identitas KTP/KK pemilik, alas hak, 8 blok bangunan, 30 jenis tanaman, dan persetujuan QC.
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyAllHeaders}
                        className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {copiedHeaders ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedHeaders ? '267 Header Disalin!' : 'Salin 267 Header (Paste ke A1)'}
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadSheetHeaderTemplate('xlsx', activeProjectName)}
                        className="px-3.5 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        Unduh Excel (.xlsx)
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadSheetHeaderTemplate('csv', activeProjectName)}
                        className="px-3 py-2 bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs rounded-xl border border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-slate-400" />
                        Unduh CSV (.csv)
                      </button>
                    </div>
                  </div>

                  {/* 4 Blok Kolom */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                        <span>1. Identitas & Alas Hak</span>
                        <span className="font-mono text-slate-400">21 Kolom</span>
                      </div>
                      <p className="text-slate-400">CODE, DESA, SPAN, NOBID, LUAS, NAMA, NIK, TTL, ALAMAT, JENIS_ALAS_HAK, NOMER_HAK, dll.</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                        <span>2. Rincian Bangunan</span>
                        <span className="font-mono text-slate-400">24 Kolom</span>
                      </div>
                      <p className="text-slate-400">8 Slot Bangunan (masing-masing 3 kolom): LUAS, BENTUK, JENIS BANGUNAN 1-8.</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                        <span>3. Rincian Tanaman</span>
                        <span className="font-mono text-slate-400">180 Kolom</span>
                      </div>
                      <p className="text-slate-400">30 Slot Tanaman (masing-masing 6 kolom): JENIS TANAMAN 1-30, MENGHASILKAN, UKURAN.</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-purple-300">
                        <span>4. Berkas & QC</span>
                        <span className="font-mono text-slate-400">42 Kolom</span>
                      </div>
                      <p className="text-slate-400">KECAMATAN, KABUPATEN, KADES, SAKSI, QC_STATUS, QC_NOTES, LINK_KTP, LINK_KK, BATAS_LAHAN.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. FILE RESUME PROYEK */}
              {selectedTemplateTab === 'resume' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-4 bg-gradient-to-r from-amber-500/15 via-slate-900 to-sky-500/10 border border-amber-500/25 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                          File 2: Resume Proyek (36 Kolom)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        36 Kolom Tahapan
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Dokumen rekap monitoring per desa: Sosialisasi Awal, Pengumuman, Lampiran BAPT, Penyampaian Nilai, Serah Terima Rekening, Bush Clearing, dan status administrasi.
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyResumeHeaders}
                        className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {copiedResumeHeaders ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedResumeHeaders ? '36 Header Disalin!' : 'Salin 36 Header (Paste ke A1)'}
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadResumeHeaderTemplate('xlsx', activeProjectName)}
                        className="px-3.5 py-2 bg-amber-600/90 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        Unduh Excel (.xlsx)
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadResumeHeaderTemplate('csv', activeProjectName)}
                        className="px-3 py-2 bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs rounded-xl border border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-slate-400" />
                        Unduh CSV (.csv)
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1 text-[11px] text-slate-400">
                    <p className="font-bold text-amber-300">Struktur 36 Kolom Resume Proyek:</p>
                    <p>ID_RESUME, ID_PROYEK, NAMA_PROYEK, DESA, KECAMATAN, KABUPATEN, TOTAL_BIDANG, TOTAL_LUAS_M2, PROGRES_PERSEN, STATUS_BA_SOSIALISASI_AWAL, TANGGAL_BA_SOSIALISASI_AWAL, LINK_PDF_BA_SOSIALISASI_AWAL, CATATAN_BA_SOSIALISASI_AWAL, ... (berulang untuk 6 tahapan) ..., LINK_FOLDER_DESA_DRIVE, TERAKHIR_DIPERBARUI, OPERATOR.</p>
                  </div>
                </div>
              )}

              {/* 3. FILE SURAT INSTANSI */}
              {selectedTemplateTab === 'surat' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-4 bg-gradient-to-r from-sky-500/15 via-slate-900 to-amber-500/10 border border-sky-500/25 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">
                          File 3: Surat Instansi & Monitoring (13 Kolom)
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        13 Kolom Administrasi
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Dokumen pencatatan surat resmi ke instansi (BPN, Balai Jalan, DLH, Kecamatan, Kepolisian, dll.), tanggal, nomor surat, perihal, status tindak lanjut, link file PDF, dan foto tanda terima.
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyAgencyHeaders}
                        className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {copiedAgencyHeaders ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedAgencyHeaders ? '13 Header Disalin!' : 'Salin 13 Header (Paste ke A1)'}
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadAgencyLetterHeaderTemplate('xlsx', activeProjectName)}
                        className="px-3.5 py-2 bg-sky-600/90 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        Unduh Excel (.xlsx)
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadAgencyLetterHeaderTemplate('csv', activeProjectName)}
                        className="px-3 py-2 bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs rounded-xl border border-white/10 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-slate-400" />
                        Unduh CSV (.csv)
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1 text-[11px] text-slate-400">
                    <p className="font-bold text-sky-300">Struktur 13 Kolom Surat Instansi:</p>
                    <p>NO, ID_SURAT, INSTANSI, NO_SURAT, TANGGAL_SURAT, PERIHAL, STATUS, CATATAN_TINDAK_LANJUT, PIC_INSTANSI, LINK_PDF_SURAT, LINK_FOTO_TANDA_TERIMA, DIPERBARUI_OLEH, TERAKHIR_DIPERBARUI.</p>
                  </div>
                </div>
              )}

              {/* Tips Trik Paste */}
              <div className="p-3.5 bg-slate-950/70 border border-white/10 rounded-xl space-y-1 text-[11px] text-slate-300">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Cara Tempelkan (Paste) Cepat ke Google Sheets:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[10px] text-slate-400 pl-1">
                  <li>Buat Spreadsheet kosong baru di Google Sheets.</li>
                  <li>Pilih tab file di atas, lalu klik tombol <strong className="text-amber-300">"Salin Header (Paste ke A1)"</strong>.</li>
                  <li>Klik sel <strong className="text-white">A1</strong> di Google Sheets, lalu tekan <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-200">Ctrl + V</kbd> (atau <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-200">Cmd + V</kbd>).</li>
                  <li>Seluruh kolom otomatis terisi rapi dalam 1 detik!</li>
                </ol>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/60 border-t border-white/10 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
