import React, { useState } from 'react';
import { 
  X, 
  Download, 
  BookOpen, 
  ShieldCheck, 
  MapPin, 
  FileText, 
  Keyboard, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  Eye,
  Edit3,
  Layers,
  Save,
  Printer,
  UploadCloud,
  ChevronRight
} from 'lucide-react';
import { generateTutorialPDF } from '../lib/tutorialPdfGenerator';
import { ProjectConfig } from '../types';

interface TutorialGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: ProjectConfig;
  userRole?: string;
}

type GuideTab = 'overview' | 'guest' | 'field' | 'qc' | 'gallery' | 'faq';

export const TutorialGuideModal: React.FC<TutorialGuideModalProps> = ({
  isOpen,
  onClose,
  activeProject,
  userRole
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('overview');
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      // Small timeout to allow UI spinner to show
      setTimeout(() => {
        generateTutorialPDF({
          projectName: activeProject?.name || 'Jalur SUTT/SUTET',
          generatedBy: userRole || 'Petugas'
        });
        setIsDownloading(false);
      }, 300);
    } catch (error) {
      console.error('Gagal membuat PDF:', error);
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Buku Panduan & Tutorial Sistem (SIP-VSS)
                </h2>
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold rounded-full">
                  v2.4 Resmi
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Panduan praktis operasional untuk Pengguna Tamu, Petugas Lapangan, dan Tim QC Validator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/10 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
              title="Unduh seluruh buku panduan dalam format PDF lengkap dengan screenshot menu"
            >
              {isDownloading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isDownloading ? 'Membuat PDF...' : 'Unduh Buku Panduan (PDF)'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Tutup panduan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-950/60 border-b border-slate-800 overflow-x-auto scrollbar-none text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Ringkasan & Matriks Peran
          </button>
          <button
            onClick={() => setActiveTab('guest')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'guest'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Pengguna Tamu (Guest)
          </button>
          <button
            onClick={() => setActiveTab('field')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'field'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Petugas Lapangan (Field)
            <span className="px-1.5 py-0.2 bg-amber-400 text-slate-950 text-[10px] font-black rounded font-mono">
              Ctrl+S
            </span>
          </button>
          <button
            onClick={() => setActiveTab('qc')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'qc'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Tim QC (Validator)
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Galeri Screenshot Menu
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
              activeTab === 'faq'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Troubleshooting & FAQ
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 flex-1">

          {/* TAB 1: OVERVIEW & MATRIKS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-xl">
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Tentang Aplikasi SIP-VSS
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">
                  Sistem Informasi Pertanahan (SIP - Ventura System Solution) adalah platform hibrida terintegrasi untuk
                  pengadaan tanah jalur transmisi ketenagalistrikan (ROW & Tapak Tower SUTT/SUTET). Sistem menghubungkan 
                  Google Spreadsheet berkapasitas tak terbatas dengan repositori Google Drive terenkripsi, peta spasial GIS Leaflet, 
                  serta modul validasi yuridis multi-peran.
                </p>
              </div>

              {/* Matriks Peran Cards */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Matriks Hak Akses & Wewenang 3 Peran Utama
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Guest Card */}
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" />
                          Pengguna Tamu
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Read-Only</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">Stakeholder & Pimpinan</h4>
                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        Bebas memantau progres lapangan, melihat peta GIS, memfilter desa, mengekspor Excel, tanpa risiko merusak data.
                      </p>
                    </div>
                    <ul className="text-[11px] space-y-1.5 text-slate-300 border-t border-slate-800/80 pt-3">
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Dashboard Progres Real-time
                      </li>
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Peta GIS & Navigasi Google Maps
                      </li>
                      <li className="flex items-center gap-1.5 text-rose-400">
                        <X className="w-3.5 h-3.5 shrink-0" />
                        Tidak bisa mengedit/menghapus
                      </li>
                    </ul>
                  </div>

                  {/* Field Operator Card */}
                  <div className="bg-slate-950/60 border border-emerald-500/30 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-600 text-slate-950 text-[9px] font-black rounded-bl">
                      OPERATOR
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5" />
                          Petugas Lapangan
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono">Input & Upload</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">Surveyor & Identifikasi</h4>
                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        Mendata tanah, bangunan, tanaman (30 slot), batas fisik, dan upload scan dokumen serta foto patok batas langsung ke Drive.
                      </p>
                    </div>
                    <ul className="text-[11px] space-y-1.5 text-slate-300 border-t border-slate-800/80 pt-3">
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Form Input 5 Tab Lengkap
                      </li>
                      <li className="flex items-center gap-1.5 text-amber-400 font-bold">
                        <Zap className="w-3.5 h-3.5 shrink-0" />
                        Pintasan Simpan Cepat (Ctrl+S)
                      </li>
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Cetak Formulir Inventarisasi
                      </li>
                    </ul>
                  </div>

                  {/* QC Validator Card */}
                  <div className="bg-slate-950/60 border border-amber-500/30 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Tim QC (Validator)
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono">Verifikasi Yuridis</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">Legal & Quality Control</h4>
                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        Memeriksa kelengkapan 7 berkas yuridis, menetapkan status (APPROVED / PENDING / REJECTED), catatan koreksi, dan verifikasi kompensasi.
                      </p>
                    </div>
                    <ul className="text-[11px] space-y-1.5 text-slate-300 border-t border-slate-800/80 pt-3">
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Modul QC Validasi Berkas
                      </li>
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Sandingan Data Kepmen ESDM
                      </li>
                      <li className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Cetak Kwitansi Kompensasi
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Step Workflow */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                  Alur Kerja Standar Dari Lapangan Hingga Pembayaran
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-amber-400 font-bold mb-1">Tahap 1: Pengukuran</div>
                    <p className="text-slate-400 text-[11px]">Surveyor ukur koordinat, batas lahan, data pemilik via Form Input (Tab 1-4).</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-amber-400 font-bold mb-1">Tahap 2: Pengarsipan</div>
                    <p className="text-slate-400 text-[11px]">Upload scan KTP, KK, Sertifikat, SPPT ke Drive pada Tab 5 Form Input.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-amber-400 font-bold mb-1">Tahap 3: Verifikasi QC</div>
                    <p className="text-slate-400 text-[11px]">QC cek keabsahan surat & tetapkan status APPROVED bila berkas lengkap.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-amber-400 font-bold mb-1">Tahap 4: Kwitansi & BA</div>
                    <p className="text-slate-400 text-[11px]">Cetak Kwitansi kompensasi dan Berita Acara untuk proses serah terima.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PENGGUNA TAMU (GUEST) */}
          {activeTab === 'guest' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-950/30 border border-blue-500/30 rounded-xl">
                <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4" />
                  Panduan Khusus Pengguna Tamu (Mode Pantau)
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Mode Tamu didesain bagi Anda yang memerlukan akses cepat untuk memantau kemajuan proyek, melihat peta jalur SUTT/SUTET, 
                  mencari status bidang tanah milik warga tertentu, atau mengunduh ringkasan laporan tanpa perlu masuk menggunakan akun Google resmi.
                </p>
              </div>

              {/* Cara Main Tamu */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Cara Masuk & Eksplorasi Fitur Tamu
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px]">1</span>
                      Langkah Masuk Portal
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Pada layar awal (Gate Portal), pilih nama proyek jalur transmisi, kemudian klik tombol <strong className="text-blue-400">"Akses Tamu (Mode Pantau)"</strong>. Anda langsung diarahkan ke Dashboard.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px]">2</span>
                      Memfilter Data Desa & Span
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Gunakan bilah pencarian dan dropdown filter di bagian atas halaman Nominatif untuk memfilter desa tertentu atau mengetikkan nama warga/NIK/nomor bidang.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px]">3</span>
                      Navigasi Peta GIS & Google Maps
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Buka menu <strong className="text-emerald-400">"Peta Bidang Spasial"</strong>. Klik poligon tanah untuk melihat kartu identitas lahan, dan klik tombol <strong className="text-emerald-400">"Buka di Google Maps"</strong> untuk mendapatkan rute arah jalan ke lokasi bidang tanah.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px]">4</span>
                      Ekspor Laporan Excel
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Di halaman Nominatif, klik tombol <strong className="text-emerald-400">"Export Excel"</strong> untuk mengunduh rekapitulasi data lengkap ke komputer atau smartphone Anda.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PETUGAS LAPANGAN (FIELD) */}
          {activeTab === 'field' && (
            <div className="space-y-6">
              {/* Highlight Ctrl+S Banner */}
              <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-transparent border border-amber-500/40 rounded-xl">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                  <Keyboard className="w-5 h-5" />
                  FITUR BARU ERGONOMIS: PINTASAN KEYBOARD "Ctrl + S"
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Berdasarkan masukan tim lapangan agar pengisian data lebih cepat: <strong>Anda TIDAK PERLU lagi berpindah tab sampai ke tab terakhir untuk menyimpan!</strong>
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-amber-400/40 rounded-lg text-xs font-mono text-amber-300">
                    <kbd className="font-extrabold">Ctrl</kbd> + <kbd className="font-extrabold">S</kbd>
                    <span className="text-[10px] text-slate-400 font-sans ml-1">(Windows/Linux)</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-amber-400/40 rounded-lg text-xs font-mono text-amber-300">
                    <kbd className="font-extrabold">Cmd</kbd> + <kbd className="font-extrabold">S</kbd>
                    <span className="text-[10px] text-slate-400 font-sans ml-1">(macOS)</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Atau klik tombol hijau <strong className="text-emerald-400">"💾 Simpan Cepat"</strong> di bilah navigasi formulir kapan saja.
                  </span>
                </div>
              </div>

              {/* 5 Tab Step Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Urutan Pengisian 5 Tab Formulir Inventarisasi
                </h4>

                <div className="space-y-2.5">
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 font-bold text-xs rounded-lg shrink-0">Tab 1</span>
                    <div>
                      <h5 className="text-xs font-bold text-white mb-0.5">Lahan & Pemilik</h5>
                      <p className="text-[11px] text-slate-400">
                        Isi nama Desa, Span Tower (contoh: <code>01-02</code>), No Bidang, Luas ROW/Tapak, Nama Pemilik, NIK KTP (16 Digit), Alamat KTP 4 baris, dan Batas Lahan (Utara/Selatan/Timur/Barat).
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 font-bold text-xs rounded-lg shrink-0">Tab 2</span>
                    <div>
                      <h5 className="text-xs font-bold text-white mb-0.5">Alas Hak & Bangunan</h5>
                      <p className="text-[11px] text-slate-400">
                        Pilih jenis alas hak (SHM, Letter C, Girik, SKT), nomor sertifikat, tahun, luas bangunan terdampak, jenis konstruksi, dan rincian slot bangunan (hingga 8 bangunan).
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 font-bold text-xs rounded-lg shrink-0">Tab 3</span>
                    <div>
                      <h5 className="text-xs font-bold text-white mb-0.5">Tanaman Lahan (30 Slot)</h5>
                      <p className="text-[11px] text-slate-400">
                        Input jenis tegakan tanaman, kategori Sudah Menghasilkan (SM), Belum Menghasilkan (BM), serta ukuran (Kecil/Sedang/Besar).
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 font-bold text-xs rounded-lg shrink-0">Tab 4</span>
                    <div>
                      <h5 className="text-xs font-bold text-white mb-0.5">Administrasi & Tim Pelaksana</h5>
                      <p className="text-[11px] text-slate-400">
                        Nama Kepala Desa, Saksi 1 & 2, Tim Pengukur Lapangan, status TRABAS (SUDAH/BELUM), dan catatan penting kondisi lapangan.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 font-bold text-xs rounded-lg shrink-0">Tab 5</span>
                    <div>
                      <h5 className="text-xs font-bold text-white mb-0.5">Cetak & Unggah Berkas Fisik</h5>
                      <p className="text-[11px] text-slate-400">
                        Cetak Formulir Inventarisasi resmi (PDF), dan unggah scan KTP, KK, Sertifikat, SPPT, foto patok batas langsung ke Google Drive proyek.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TIM QC (VALIDATOR) */}
          {activeTab === 'qc' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl">
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  Panduan Tim Quality Control (QC) & Validator Yuridis
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tim QC bertugas meneliti keabsahan bukti kepemilikan tanah, kesesuaian identitas subjek dan objek, 
                  memvalidasi dokumen fisik sebelum diajukan ke tahap pembayaran kompensasi atau ganti rugi.
                </p>
              </div>

              {/* Status Decision Guide */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Pedoman Penetapan 3 Status Verifikasi QC
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                    <div className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-md w-fit mb-2">
                      APPROVED
                    </div>
                    <h5 className="text-xs font-bold text-emerald-300 mb-1">Disetujui & Siap Bayar</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Dokumen KTP, KK, Bukti Alas Hak, PBB lunas, dan Berita Acara pengukuran lengkap tanpa sengketa. Tombol cetak kwitansi akan aktif.
                    </p>
                  </div>

                  <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl">
                    <div className="px-2.5 py-1 bg-amber-500 text-slate-950 font-black text-xs rounded-md w-fit mb-2">
                      PENDING
                    </div>
                    <h5 className="text-xs font-bold text-amber-300 mb-1">Ditahan / Menunggu Kelengkapan</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Ada dokumen pendukung yang kurang (misal: surat keterangan waris, SPPT PBB tahun berjalan belum dilampirkan). Beri catatan agar surveyor melengkapi.
                    </p>
                  </div>

                  <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl">
                    <div className="px-2.5 py-1 bg-rose-500 text-white font-black text-xs rounded-md w-fit mb-2">
                      REJECTED
                    </div>
                    <h5 className="text-xs font-bold text-rose-300 mb-1">Ditolak / Sengketa Batas</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Terjadi tumpang tindih kepemilikan, nomor sertifikat tidak terdaftar di BPN, atau penolakan ganti rugi oleh pemilik. Wajib tulis alasan detail.
                    </p>
                  </div>
                </div>
              </div>

              {/* Fitur Sandingan ESDM */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Fitur Sandingan Data Kepmen ESDM
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Pada menu <strong>"QC Verifikasi"</strong>, Anda dapat mencocokkan data tanaman dan tanah dengan standar kompensasi Kepmen ESDM No. 27 K/DJL.3/2021. 
                  Sistem menghitung otomatis selisih nilai dan memberikan validasi apakah kompensasi berada di dalam ambang batas legalitas.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: GALERI SCREENSHOT MENU */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Peta Visual Antarmuka Seluruh Menu Sistem
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Menu 1 Mockup */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      1. Dashboard Progres & Ringkasan
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">Semua Peran</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2 text-[11px]">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Lahan: 142 Bidang</span>
                      <span className="text-emerald-400 font-bold">88% Lengkap</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[88%]" />
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Pantau progress pengadaan tanah, rekapitulasi desa, dan status sinkronisasi live Google Sheets.
                    </p>
                  </div>
                </div>

                {/* Menu 2 Mockup */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      2. Master Data Nominatif
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">Tabel Induk</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2 text-[11px]">
                    <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-slate-400">
                      <span className="text-[10px]">🔍 Cari NIK / Nama / No Bidang...</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-400 pt-1">
                      <span className="font-bold text-slate-300">#042 - H. Achmad</span>
                      <span>SHM 480m2</span>
                      <span className="text-emerald-400 font-bold">APPROVED</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Tabel induk seluruh data pemilik, filter multi-kolom, dan tombol Ekspor Excel / CSV.
                    </p>
                  </div>
                </div>

                {/* Menu 3 Mockup */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      3. Form Input & Pintasan Ctrl+S
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded">Lapangan</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 text-[9px]">
                        <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 font-bold rounded">1. Lahan</span>
                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">2. Alas</span>
                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">3. Tnm</span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold text-[9px] rounded flex items-center gap-1">
                        <Save className="w-2.5 h-2.5" /> Simpan (Ctrl+S)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Formulir 5 Tab cepat dengan tombol Simpan Cepat di setiap tab tanpa perlu sampai akhir.
                    </p>
                  </div>
                </div>

                {/* Menu 4 Mockup */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                      4. Peta Spasial GIS & Google Maps
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded">Interaktif</span>
                  </div>
                  <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-lg space-y-2 text-[11px]">
                    <div className="flex items-center justify-between text-indigo-300 text-[10px]">
                      <span>⚡ Jalur Span Tower: T.01 - T.02</span>
                      <span className="text-emerald-400 font-bold">14 Poligon</span>
                    </div>
                    <div className="px-2 py-1 bg-emerald-600/90 text-white rounded text-[9px] font-bold text-center">
                      🗺 Buka Rute di Google Maps Presisi
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Visualisasi poligon tanah, tower transmisi, dan navigasi langsung ke lokasi warga.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: FAQ & TROUBLESHOOTING */}
          {activeTab === 'faq' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Pertanyaan Yang Sering Ditanyakan (FAQ) & Solusi Kendala
              </h4>

              <div className="space-y-3">
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Koneksi Google Sheets terputus / Token Expired?
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Klik tombol <strong>"Live Sheets"</strong> di sudut kanan atas aplikasi, lalu klik <strong>"Otorisasi Ulang / Refresh Token"</strong>. Pastikan Anda masuk dengan akun Google yang memiliki hak edit pada Spreadsheet proyek.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Bagaimana jika sinyal internet di lokasi pengukuran terputus (Offline)?
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Aplikasi dilengkapi teknologi sinkronisasi lokal pintar. Anda tetap dapat menginput data dan menekan tombol Simpan Cepat (Ctrl+S). Begitu perangkat kembali mendapat sinyal internet, klik tombol <strong>"Sync"</strong> di bilah atas untuk mendorong seluruh data ke Google Sheets.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Bagaimana cara mencetak Kwitansi Pembayaran Kompensasi?
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pastikan bidang tanah tersebut telah mendapatkan status <strong>APPROVED</strong> dari tim QC. Buka modul Berkas Fisik atau QC Validasi, pilih bidang tersebut, klik tombol <strong>"Cetak Kwitansi"</strong>, isi tanggal pembayaran, lalu cetak PDF.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Kontak Bantuan & Dukungan Teknis Administrator
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Bila mengalami kendala teknis, error formula spreadsheet, atau membutuhkan penambahan jalur baru, hubungi administrator melalui WhatsApp: <strong>+62 812-2508-5742</strong> atau email: <strong>agungpambudi763@gmail.com</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Dokumen Panduan Pengguna v2.4 (Terintegrasi PDF)</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'Membuat PDF...' : 'Download PDF Tutorial'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
