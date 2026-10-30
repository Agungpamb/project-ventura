import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Map as MapIcon,
  FileSpreadsheet,
  FolderKanban,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Sparkles,
  HelpCircle,
  Download,
  Loader2,
  GitCompare,
  FileSearch,
  Scissors,
  Merge,
  Trash2,
  Compass,
  Building2,
  FileCheck2,
  Activity,
  Settings,
  Database,
  Printer,
  Camera,
  MousePointerClick,
  Search,
  Plus,
  Upload,
  Eye,
  Check,
  AlertTriangle,
  Smartphone,
  Navigation,
  RotateCw,
  FileText,
  UserCheck,
} from 'lucide-react';
import { generateTutorialPdf } from '../lib/tutorialPdfGenerator';
import { ProjectConfig } from '../types';

interface TutorialGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: ProjectConfig;
}

type TabId =
  | 'mulai'
  | 'dashboard_nominatif'
  | 'peta_gis'
  | 'resume_surat'
  | 'input_lahan'
  | 'qc_sanding'
  | 'admin_qgis';

/* ============================================================================
 * KOMPONEN BANTUAN: SIMULASI SCREENSHOT ANTARMUKA (UI MOCKUP DENGAN CALLOUT)
 * ============================================================================ */
const CalloutBadge: React.FC<{ num: number; className?: string }> = ({ num, className = '' }) => (
  <span
    className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-600 text-white font-black text-xs shadow-lg ring-2 ring-white animate-pulse select-none ${className}`}
  >
    {num}
  </span>
);

const LegendStep: React.FC<{ num: number; title: string; desc: string }> = ({ num, title, desc }) => (
  <div className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
    <span className="w-6 h-6 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
      {num}
    </span>
    <div>
      <h5 className="text-xs font-extrabold text-slate-900">{title}</h5>
      <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{desc}</p>
    </div>
  </div>
);

const ScreenFrame: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="rounded-2xl border-2 border-slate-300 bg-slate-100 overflow-hidden shadow-md my-4">
    {/* Browser / Window Top Bar */}
    <div className="bg-slate-800 px-4 py-2.5 flex items-center justify-between border-b border-slate-700">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
        <span className="ml-2 text-[11px] font-bold text-slate-200 tracking-wide uppercase flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-sky-400" />
          Tampilan Layar: {title}
        </span>
      </div>
      {subtitle && (
        <span className="text-[10px] font-semibold bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-md">
          {subtitle}
        </span>
      )}
    </div>
    {/* Screen Content */}
    <div className="p-4 sm:p-5 bg-slate-50">{children}</div>
  </div>
);

export const TutorialGuideModal: React.FC<TutorialGuideModalProps> = ({
  isOpen,
  onClose,
  activeProject,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('mulai');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      generateTutorialPdf(activeProject);
    } catch (err) {
      console.error('Gagal mengunduh PDF Panduan v4.0:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const tabs: { id: TabId; label: string; badge: string; icon: React.ReactNode }[] = [
    {
      id: 'mulai',
      label: 'Cara Login & Navigasi Awal',
      badge: 'Langkah Awal',
      icon: <MousePointerClick className="w-4 h-4" />,
    },
    {
      id: 'dashboard_nominatif',
      label: 'Dashboard & Daftar Nominatif',
      badge: 'Menu 1 & 1.1',
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      id: 'peta_gis',
      label: 'Peta GIS & Peta Bidang Tanah',
      badge: 'Menu 1.2 & 1.3',
      icon: <MapIcon className="w-4 h-4" />,
    },
    {
      id: 'resume_surat',
      label: 'Resume Desa & Surat Instansi',
      badge: 'Menu 1.4 & 1.5',
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: 'input_lahan',
      label: 'Input Lahan, TTD HP & Berkas',
      badge: 'Menu 2',
      icon: <FolderKanban className="w-4 h-4" />,
    },
    {
      id: 'qc_sanding',
      label: 'Verifikasi QC & Sanding Data',
      badge: 'Menu 3, 3.1, 3.2 & 4',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      id: 'admin_qgis',
      label: 'Pengaturan Proyek & Update Peta',
      badge: 'Menu 5 & QGIS',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight">
                  Buku Panduan Pengguna (Bergambar) — SIP VSS
                </h2>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-400/30">
                  Edisi Pengguna v4.0
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Panduan praktis langkah demi langkah dilengkapi simulasi tampilan layar &amp; petunjuk nomor klik (① ② ③) untuk Operator, Tim Lapangan, dan Admin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all cursor-pointer border border-emerald-400/30"
              title="Unduh Buku Panduan Bergambar dalam format PDF siap cetak"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyiapkan PDF Bergambar...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Unduh PDF Panduan Bergambar (v4.0)</span>
                  <span className="sm:hidden">PDF v4.0</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Tutup Panduan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Layout */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-full md:w-72 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0">
            <div className="hidden md:block px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Pilih Bab Panduan
            </div>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-between gap-2.5 px-3.5 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap md:whitespace-normal text-left cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0">{tab.icon}</span>
                    <span className="truncate">{tab.label}</span>
                  </div>
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                </button>
              );
            })}

            <div className="hidden md:block mt-auto pt-4">
              <div className="bg-gradient-to-br from-rose-50 to-amber-50 border border-rose-200/80 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-xs mb-1.5">
                  <Sparkles className="w-4 h-4 text-rose-600" />
                  <span>Cara Membaca Panduan</span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed mb-3">
                  Perhatikan bulatan angka merah{' '}
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px]">
                    1
                  </span>{' '}
                  pada gambar layar, lalu baca penjelasan nomor yang sama di bawahnya.
                </p>
                <button
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Cetak / Download PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 bg-white">
            {/* ================================================================
             * TAB 1: CARA LOGIN & NAVIGASI AWAL
             * ================================================================ */}
            {activeTab === 'mulai' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 1 — Persiapan &amp; Pengenalan Layar Utama
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Masuk (Login) &amp; Mengenal Bagian Layar Aplikasi
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Ikuti langkah di bawah ini saat pertama kali membuka aplikasi agar Anda bisa melihat peta, menginput data warga, dan mengunggah foto ke Google Drive.
                  </p>
                </div>

                {/* VISUAL SCREENSHOT 1: LAYAR UTAMA & SIDEBAR */}
                <ScreenFrame
                  title="Layar Utama & Sidebar Navigasi Kiri"
                  subtitle="Pengenalan Tombol Utama"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Mock Sidebar */}
                    <div className="lg:col-span-5 bg-slate-900 text-white rounded-xl p-4 space-y-3 border border-slate-700">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div>
                          <div className="text-xs font-black tracking-wide text-blue-400">
                            SIP VSS — PANEL MENU
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Sistem Inventarisasi Lahan
                          </div>
                        </div>
                      </div>

                      {/* Pilih Proyek */}
                      <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700 relative">
                        <div className="text-[9px] text-slate-400 uppercase font-bold">
                          Proyek Aktif Saat Ini:
                        </div>
                        <div className="text-xs font-extrabold text-amber-300 mt-0.5 flex items-center justify-between">
                          <span>SUTET 500 kV / SUTT 150 kV ▼</span>
                          <CalloutBadge num={1} />
                        </div>
                      </div>

                      {/* Menu Items */}
                      <div className="space-y-1 text-[11px] font-semibold relative">
                        <div className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white flex items-center justify-between">
                          <span>1. Dashboard Utama</span>
                          <CalloutBadge num={2} />
                        </div>
                        <div className="px-2.5 py-1.5 rounded-lg text-slate-300 bg-slate-800/50">
                          1.1. Daftar Nominatif
                        </div>
                        <div className="px-2.5 py-1.5 rounded-lg text-slate-300 bg-slate-800/50">
                          1.2. Peta Spasial (GIS)
                        </div>
                        <div className="px-2.5 py-1.5 rounded-lg text-slate-300 bg-slate-800/50">
                          1.3. Peta Bidang Tanah
                        </div>
                        <div className="px-2.5 py-1.5 rounded-lg text-slate-300 bg-slate-800/50">
                          1.4. Resume Project &amp; 1.5. Surat
                        </div>
                        <div className="px-2.5 py-1.5 rounded-lg text-emerald-300 bg-emerald-950/50 border border-emerald-700/40">
                          2. Input &amp; Edit Lahan
                        </div>
                      </div>

                      {/* Google Connect & Sync */}
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between shadow-sm">
                          <span>🔗 Hubungkan Google Drive &amp; Sheets</span>
                          <CalloutBadge num={3} />
                        </div>
                        <div className="bg-slate-800 text-slate-200 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between border border-slate-700">
                          <span>🔄 Sinkronisasi Data Master</span>
                          <CalloutBadge num={4} />
                        </div>
                      </div>
                    </div>

                    {/* Langkah Penjelasan */}
                    <div className="lg:col-span-7 space-y-2.5 flex flex-col justify-center">
                      <LegendStep
                        num={1}
                        title="Pilih Jalur Proyek Terlebih Dahulu"
                        desc="Pastikan nama jalur proyek di pojok kiri atas sudah sesuai dengan wilayah kerja Anda sebelum mulai melihat atau menginput data."
                      />
                      <LegendStep
                        num={2}
                        title="Daftar Menu Kerja (Urut Nomor 1 s/d 5)"
                        desc="Gunakan menu di sebelah kiri untuk berpindah halaman: mulai dari melihat tabel (1.1), melihat peta (1.2 & 1.3), hingga mengisi data lahan baru (Menu 2)."
                      />
                      <LegendStep
                        num={3}
                        title="WAJIB: Klik 'Hubungkan Google' Saat ingin Edit/Upload"
                        desc="Jika Anda ingin menyimpan data, mengunggah foto KTP/lokasi, atau menggabung bidang, klik tombol ini sekali dan pilih akun Google Anda."
                      />
                      <LegendStep
                        num={4}
                        title="Tombol Sinkronisasi (Tarik Data Terbaru)"
                        desc="Klik tombol ini jika teman tim Anda baru saja menginput data dari HP/laptop lain agar tampilan di layar Anda ikut ter-update."
                      />
                    </div>
                  </div>
                </ScreenFrame>

                {/* Perbedaan Peran Pengguna */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-5">
                  <h4 className="text-sm font-black text-blue-950 mb-3 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    <span>Kenali Hak Akses Akun Anda</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-3.5 rounded-xl border border-blue-100">
                      <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-extrabold text-[10px]">
                        VIEWER (Tamu / Pengawas)
                      </span>
                      <p className="text-slate-600 mt-2 leading-relaxed">
                        Bisa melihat Dashboard, mencari nama di Daftar Nominatif, membuka Peta GIS, dan mencetak PDF, namun <b>tidak bisa mengubah atau menghapus data</b>.
                      </p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-blue-100">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold text-[10px]">
                        OPERATOR (Tim Lapangan)
                      </span>
                      <p className="text-slate-600 mt-2 leading-relaxed">
                        Bisa <b>menginput data lahan baru, mengedit data warga, memotret tanda tangan dari HP, upload foto lokasi</b>, serta menggabung/memecah bidang.
                      </p>
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-blue-100">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                        ADMIN (Koordinator / QC)
                      </span>
                      <p className="text-slate-600 mt-2 leading-relaxed">
                        Memiliki seluruh akses Operator ditambah menu <b>Verifikasi QC (Approve/Reject)</b> dan <b>Menu 5 Manajemen Proyek</b>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================
             * TAB 2: MENU 1 (DASHBOARD) & MENU 1.1 (DAFTAR NOMINATIF)
             * ================================================================ */}
            {activeTab === 'dashboard_nominatif' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 2 — Menu 1 &amp; Menu 1.1
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Memakai Dashboard &amp; Mengelola Daftar Nominatif (Gabung, Pecah, Hapus)
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Menu <b>1.1. Daftar Nominatif</b> adalah halaman yang paling sering digunakan untuk mencari data warga, mencetak tabel resmi, serta melakukan <b>Gabung Bidang</b>, <b>Pecah Bidang</b>, atau <b>Hapus Bidang</b>.
                  </p>
                </div>

                {/* SCREENSHOT 2: DAFTAR NOMINATIF TOOLBAR & TABEL */}
                <ScreenFrame
                  title="Menu 1.1 — Daftar Nominatif & Tombol Aksi Bidang"
                  subtitle="Pencarian, Cetak & Modifikasi Bidang"
                >
                  <div className="space-y-4">
                    {/* Mock Toolbar Atas */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Search & Filter */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600">
                            <Search className="w-3.5 h-3.5 text-slate-400" />
                            <span>Cari Nama / No. Bidang / Desa...</span>
                            <CalloutBadge num={1} className="ml-1" />
                          </div>
                          <div className="bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700">
                            Filter Span: Semua Span ▼
                          </div>
                          <div className="bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700">
                            Filter Desa: Semua Desa ▼
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs">
                            <Merge className="w-3.5 h-3.5" />
                            <span>Gabung Bidang</span>
                            <CalloutBadge num={2} />
                          </div>
                          <div className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs">
                            <Scissors className="w-3.5 h-3.5" />
                            <span>Pecah Bidang</span>
                            <CalloutBadge num={3} />
                          </div>
                          <div className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs">
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus Bidang</span>
                            <CalloutBadge num={4} />
                          </div>
                          <div className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs">
                            <Printer className="w-3.5 h-3.5" />
                            <span>Cetak / Excel</span>
                            <CalloutBadge num={5} />
                          </div>
                        </div>
                      </div>

                      {/* Mock Table Row */}
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-800 text-white">
                              <th className="p-2">No. Bidang</th>
                              <th className="p-2">Span Tower</th>
                              <th className="p-2">Nama Pemilik</th>
                              <th className="p-2">Desa</th>
                              <th className="p-2">Luas (m²)</th>
                              <th className="p-2 text-center">Aksi Baris</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            <tr>
                              <td className="p-2 font-bold text-blue-700">012</td>
                              <td className="p-2">T.01 - T.02</td>
                              <td className="p-2 font-semibold">H. AHMAD SUBANDI</td>
                              <td className="p-2">SUKAMAJU</td>
                              <td className="p-2 font-mono">450,00</td>
                              <td className="p-2">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">
                                    Edit
                                  </span>
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">
                                    Lihat Peta
                                  </span>
                                  <CalloutBadge num={6} />
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Penjelasan Nomor Klik */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <LegendStep
                        num={1}
                        title="Kotak Pencarian & Filter Cepat"
                        desc="Ketik nama pemilik atau nomor bidang (misal: 012), atau saring berdasarkan Span Tower dan Desa untuk menampilkan daftar warga di lokasi tersebut saja."
                      />
                      <LegendStep
                        num={2}
                        title="Cara Pakai Tombol 'Gabung Bidang'"
                        desc="Klik tombol ini jika ada 2 atau lebih bidang milik 1 orang yang ingin disatukan. Pilih Bidang Induk, centang bidang yang digabung, lalu klik Proses. Luas tanah, tanaman, dan bangunan otomatis dijumlahkan ke Bidang Induk!"
                      />
                      <LegendStep
                        num={3}
                        title="Cara Pakai Tombol 'Pecah Bidang'"
                        desc="Klik jika 1 bidang tanah terbagi menjadi beberapa pemilik/waris. Pilih bidang asal, tentukan jumlah pecahan (misal menjadi 012A dan 012B), lalu bagi luas m²-nya."
                      />
                      <LegendStep
                        num={4}
                        title="Cara Pakai Tombol 'Hapus Bidang' (Otomatis Geser Nomor n-1)"
                        desc="Klik untuk menghapus bidang yang batal/ganda. Nomor bidang setelahnya di dalam Span yang sama akan otomatis bergeser mundur (contoh: 015 dihapus -> 016 otomatis turun menjadi 015) dan langsung tersimpan ke Google Sheets!"
                      />
                      <LegendStep
                        num={5}
                        title="Cetak Daftar Nominatif Resmi / Unduh Excel"
                        desc="Gunakan tombol ini untuk mencetak lampiran Daftar Nominatif resmi lengkap dengan KOP Proyek atau mengunduh file Excel (.xlsx)."
                      />
                      <LegendStep
                        num={6}
                        title="Tombol 'Edit' & 'Lihat Peta' di Setiap Baris"
                        desc="Klik 'Edit' pada baris warga untuk langsung membuka formulir edit datanya, atau klik 'Lihat Peta' untuk langsung melompat ke poligon tanah milik warga tersebut."
                      />
                    </div>
                  </div>
                </ScreenFrame>
              </div>
            )}

            {/* ================================================================
             * TAB 3: MENU 1.2 (PETA SPASIAL GIS) & MENU 1.3 (PETA BIDANG TANAH)
             * ================================================================ */}
            {activeTab === 'peta_gis' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 3 — Menu 1.2 &amp; Menu 1.3
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Menggunakan Peta Spasial (GIS) &amp; Mencetak Peta Bidang Tanah
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Terdapat 2 menu peta dengan fungsi berbeda: <b>Menu 1.2</b> untuk navigasi lapangan dan mengecek poligon secara menyeluruh, sedangkan <b>Menu 1.3</b> untuk mencetak Peta Bidang Tanah resmi per Span &amp; Desa.
                  </p>
                </div>

                {/* SCREENSHOT 3A: MENU 1.2 PETA SPASIAL GIS */}
                <ScreenFrame
                  title="Menu 1.2 — Peta Spasial Interaktif (GIS)"
                  subtitle="Cek Poligon, Dokumen & Navigasi Rute ke Lokasi"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Mock Map View */}
                    <div className="lg:col-span-7 bg-slate-800 rounded-xl p-4 relative overflow-hidden min-h-[250px] flex flex-col justify-between border border-slate-700">
                      {/* Layer Controls Top */}
                      <div className="flex items-center justify-between gap-2 z-10">
                        <div className="bg-white/95 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-800 flex items-center gap-2 shadow-md">
                          <span>☑ Bidang Tanah</span>
                          <span>☑ Jalur ROW</span>
                          <span>☑ Titik Tower</span>
                          <CalloutBadge num={1} />
                        </div>
                        <div className="bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md">
                          <RotateCw className="w-3 h-3" />
                          <span>Refresh Peta</span>
                          <CalloutBadge num={4} />
                        </div>
                      </div>

                      {/* Simulated Polygons */}
                      <div className="my-4 flex items-center justify-center relative">
                        {/* Corridor Line */}
                        <div className="absolute w-full h-1 bg-amber-400/70 border-y border-dashed border-amber-300" />
                        <div className="flex items-center gap-3 z-10">
                          <div className="w-24 h-16 bg-emerald-500/40 border-2 border-emerald-400 rounded flex flex-col items-center justify-center text-white">
                            <span className="text-[11px] font-black drop-shadow">011</span>
                            <span className="text-[9px] text-emerald-100">SUHERMAN</span>
                          </div>
                          <div className="w-28 h-20 bg-blue-500/50 border-2 border-yellow-300 rounded flex flex-col items-center justify-center text-white shadow-lg relative">
                            <span className="text-xs font-black drop-shadow">012</span>
                            <span className="text-[9px] text-yellow-200 font-bold">H. AHMAD</span>
                            <CalloutBadge num={2} className="absolute -top-2 -right-2" />
                          </div>
                          <div className="w-24 h-16 bg-emerald-500/40 border-2 border-emerald-400 rounded flex flex-col items-center justify-center text-white">
                            <span className="text-[11px] font-black drop-shadow">013</span>
                            <span className="text-[9px] text-emerald-100">WAWAN</span>
                          </div>
                        </div>
                      </div>

                      {/* Popup Detail Card */}
                      <div className="bg-white rounded-xl p-3 shadow-xl border border-slate-200 z-10 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-extrabold text-blue-600">
                            BIDANG NO. 012 • SPAN T.01 - T.02
                          </div>
                          <div className="text-xs font-black text-slate-900">
                            H. AHMAD SUBANDI (450 m²)
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1">
                            <Navigation className="w-3 h-3" /> Rute Maps
                          </span>
                          <span className="px-2 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold">
                            Buka Berkas
                          </span>
                          <CalloutBadge num={3} />
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-5 space-y-2.5 flex flex-col justify-center">
                      <LegendStep
                        num={1}
                        title="Saklar Layer Peta (Bidang, Jalur, Tower)"
                        desc="Centang atau matikan layer yang ingin ditampilkan, serta ganti latar peta antara Citra Satelit atau Peta Jalan."
                      />
                      <LegendStep
                        num={2}
                        title="Klik Poligon Bidang Tanah di Peta"
                        desc="Nomor bidang dan nama pemilik tampil tepat di tengah poligon. Klik bidang mana saja untuk memunculkan kartu informasi pemiliknya."
                      />
                      <LegendStep
                        num={3}
                        title="Navigasi Rute Google Maps & Lihat Berkas"
                        desc="Pada kartu yang muncul, klik 'Rute Maps' untuk memandu perjalanan ke lokasi bidang, atau klik 'Buka Berkas' untuk melihat foto KTP & lokasi."
                      />
                      <LegendStep
                        num={4}
                        title="Tombol Refresh Peta"
                        desc="Klik jika tim pemetaan baru saja meng-update file GeoJSON di Google Drive agar gambar poligon terbaru langsung dimuat."
                      />
                    </div>
                  </div>
                </ScreenFrame>

                {/* SCREENSHOT 3B: MENU 1.3 PETA BIDANG TANAH */}
                <ScreenFrame
                  title="Menu 1.3 — Peta Bidang Tanah (Split-View Siap Cetak A3/A4)"
                  subtitle="Peta Kartografi + Satelit + Tabel Nominatif + Rotasi Kompas"
                >
                  <div className="space-y-4">
                    {/* Top Control Bar */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700">
                          Span: T.01 - T.02 ▼
                        </span>
                        <span className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700">
                          Desa: SUKAMAJU ▼
                        </span>
                        <CalloutBadge num={1} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-900">
                          <Compass className="w-3.5 h-3.5 text-amber-600" />
                          <span>Rotasi Peta: 0° ──●── 360°</span>
                          <CalloutBadge num={2} />
                        </div>
                        <div className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <Printer className="w-3.5 h-3.5" />
                          <span>Cetak PDF Peta Bidang</span>
                          <CalloutBadge num={3} />
                        </div>
                      </div>
                    </div>

                    {/* Split Layout Preview */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white p-3 rounded-xl border border-slate-300 text-center">
                        <div className="text-[10px] font-extrabold uppercase text-slate-500 mb-2">
                          Panel Kiri: Peta Kartografi Teknis
                        </div>
                        <div className="h-24 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-xs font-bold text-slate-600">
                          [Garis Poligon &amp; Koordinat Grid]
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-300 text-center">
                        <div className="text-[10px] font-extrabold uppercase text-slate-500 mb-2">
                          Panel Tengah: Citra Satelit
                        </div>
                        <div className="h-24 bg-emerald-950/90 rounded-lg border border-emerald-700 flex items-center justify-center text-xs font-bold text-emerald-200">
                          [Overlay Poligon di Atas Foto Udara]
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-300 text-center">
                        <div className="text-[10px] font-extrabold uppercase text-slate-500 mb-2">
                          Panel Kanan: Tabel Nominatif &amp; Kompas
                        </div>
                        <div className="h-24 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                          [Daftar Pemilik + Legenda + KOP]
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <LegendStep
                        num={1}
                        title="Pilih Span Tower & Desa"
                        desc="Pilih Span dan Desa yang akan dicetak. Peta otomatis memfokuskan zoom hanya pada deretan bidang di Span & Desa tersebut."
                      />
                      <LegendStep
                        num={2}
                        title="Putar Kemiringan Jalur (Rotasi 0°–360°)"
                        desc="Geser slider rotasi agar koridor jalur SUTT/SUTET yang miring menjadi lurus mendatar/tegak lurus mengikuti bingkai kertas, arah panah Utara kompas akan ikut berputar otomatis!"
                      />
                      <LegendStep
                        num={3}
                        title="Cetak PDF Peta Bidang Tanah"
                        desc="Klik untuk mengunduh lembar Peta Bidang Tanah resmi lengkap dengan KOP proyek, arah mata angin, legenda, dan daftar pemilik."
                      />
                    </div>
                  </div>
                </ScreenFrame>
              </div>
            )}

            {/* ================================================================
             * TAB 4: MENU 1.4 (RESUME PROJECT) & MENU 1.5 (SURAT INSTANSI)
             * ================================================================ */}
            {activeTab === 'resume_surat' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 4 — Menu 1.4 &amp; Menu 1.5
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Mengisi Resume Kegiatan Desa (Wajib 4 Foto) &amp; Arsip Surat Instansi
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Gunakan <b>Menu 1.4</b> untuk melaporkan tahapan kegiatan di setiap Desa (Sosialisasi, Inventarisasi, Musyawarah, Pembayaran), dan <b>Menu 1.5</b> untuk menyimpan surat keluar/masuk instansi.
                  </p>
                </div>

                {/* SCREENSHOT 4: MENU 1.4 RESUME PROJECT (4 FOTO WAJIB) */}
                <ScreenFrame
                  title="Menu 1.4 — Input Kegiatan Resume Project per Desa"
                  subtitle="Otomatis Buat Folder Desa & Validasi Minimal 4 Foto Dokumentasi"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-7 bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-black text-slate-800">
                          FORMULIR KEGIATAN DESA (RESUME PROJECT)
                        </span>
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          Auto-Folder Drive
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs">
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold">Nama Desa</div>
                            <div className="font-bold text-slate-800">DESA SUKAMAJU</div>
                          </div>
                          <CalloutBadge num={1} />
                        </div>
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold">Tahapan Kegiatan</div>
                            <div className="font-bold text-slate-800">Sosialisasi Desa ▼</div>
                          </div>
                          <CalloutBadge num={2} />
                        </div>
                      </div>

                      {/* 4 Photo Slots */}
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-amber-900 flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5 text-amber-600" />
                            Foto Dokumentasi Kegiatan (Wajib Minimal 4 Foto)
                          </span>
                          <CalloutBadge num={3} />
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[1, 2, 3, 4].map((idx) => (
                            <div
                              key={idx}
                              className="h-14 rounded-lg bg-white border border-emerald-300 flex flex-col items-center justify-center text-[10px] font-bold text-emerald-700 shadow-2xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mb-0.5" />
                              <span>Foto #{idx}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500 font-medium">
                          📁 Tersimpan ke: <b>Drive / SUKAMAJU / Sosialisasi Desa</b>
                        </span>
                        <div className="bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <span>Simpan Resume Kegiatan</span>
                          <CalloutBadge num={4} />
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-5 space-y-2.5 flex flex-col justify-center">
                      <LegendStep
                        num={1}
                        title="Pilih atau Ketik Nama Desa"
                        desc="Sistem otomatis membuatkan folder Google Drive dengan nama Desa tersebut jika belum ada."
                      />
                      <LegendStep
                        num={2}
                        title="Pilih Tahapan Kegiatan"
                        desc="Pilih jenis kegiatan (Sosialisasi, Inventarisasi, Pengumuman, Musyawarah, atau Pembayaran) beserta tanggal dan statusnya."
                      />
                      <LegendStep
                        num={3}
                        title="Unggah Minimal 4 Foto Dokumentasi"
                        desc="Sistem mewajibkan minimal 4 foto kegiatan (bisa lebih) serta Berita Acara agar laporan progres desa dinyatakan sah."
                      />
                      <LegendStep
                        num={4}
                        title="Klik Simpan Resume Kegiatan"
                        desc="Seluruh foto otomatis masuk ke sub-folder <Nama Desa>/<Nama Kegiatan> di Google Drive dan rekapnya tercatat di Spreadsheet."
                      />
                    </div>
                  </div>
                </ScreenFrame>

                {/* Menu 1.5 Surat Instansi Summary Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs">
                      Menu 1.5
                    </span>
                    <h4 className="text-sm font-black text-slate-900">
                      Cara Mengarsipkan Surat Instansi (Pemda, BPN, Kehutanan, Kecamatan/Desa)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Buka <b>Menu 1.5. Surat Instansi</b> &rarr; klik <b>+ Tambah Surat Instansi</b> &rarr; isi Nomor Surat, Tanggal, Perihal, dan Nama Instansi Tujuan/Pengirim &rarr; unggah scan PDF/Foto suratnya &rarr; klik <b>Simpan</b>. Aplikasi akan otomatis membuat folder Google Drive sesuai <b>Nama Instansi</b> tersebut sehingga seluruh surat tersusun rapi per instansi.
                  </p>
                </div>
              </div>
            )}

            {/* ================================================================
             * TAB 5: MENU 2 (INPUT & EDIT LAHAN + TTD HP & CAP DESA)
             * ================================================================ */}
            {activeTab === 'input_lahan' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 5 — Menu 2 (Input &amp; Edit Lahan)
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Mengisi Data Lahan, Mengambil Foto Tanda Tangan dari HP, &amp; Upload Berkas
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Formulir <b>Menu 2. Input &amp; Edit Lahan</b> dibagi menjadi <b>5 Tab berurutan</b> agar pengisian rapi. Anda juga bisa menekan tombol keyboard <b>Ctrl + S</b> kapan saja untuk langsung menyimpan.
                  </p>
                </div>

                {/* SCREENSHOT 5A: 5 TAB FORM INPUT */}
                <ScreenFrame
                  title="Menu 2 — Navigasi 5 Tab Formulir Input Lahan"
                  subtitle="Mendukung Simpan Cepat (Ctrl + S)"
                >
                  <div className="space-y-4">
                    {/* 5 Tabs Bar */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-200">
                      <span className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5">
                        1. Identitas &amp; Lokasi <CalloutBadge num={1} />
                      </span>
                      <span className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5">
                        2. Bangunan &amp; Benda Lain <CalloutBadge num={2} />
                      </span>
                      <span className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5">
                        3. Tanaman <CalloutBadge num={3} />
                      </span>
                      <span className="px-3 py-2 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5">
                        4. Berkas Digital &amp; TTD HP <CalloutBadge num={4} />
                      </span>
                      <span className="px-3 py-2 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-bold flex items-center gap-1.5">
                        5. Ringkasan &amp; Simpan <CalloutBadge num={5} />
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <LegendStep
                        num={1}
                        title="Tab 1 — Identitas Pemilik, Saksi & Lokasi Tanah"
                        desc="Isi No. Bidang, Span Tower, Desa, Nama Pemilik, NIK, Alas Hak, Luas m², Koordinat X/Y, serta Nama Saksi, Tim Pelaksana, dan Kepala Desa. Nama yang Anda ketik di sini otomatis muncul pada kotak Tanda Tangan!"
                      />
                      <LegendStep
                        num={2}
                        title="Tab 2 — Daftar Bangunan / Struktur"
                        desc="Klik '+ Tambah Bangunan' jika di atas lahan warga terdapat rumah, pondasi, pagar, atau sumur yang terdampak jalur."
                      />
                      <LegendStep
                        num={3}
                        title="Tab 3 — Daftar Tanaman (Kecil, Sedang, Besar)"
                        desc="Masukkan jenis pohon/tanaman produktif beserta jumlah batangnya berdasarkan ukuran Kecil, Sedang, dan Besar."
                      />
                      <LegendStep
                        num={4}
                        title="Tab 4 — Upload 4 Kategori Berkas & 7 Tanda Tangan HP"
                        desc="Unggah KTP/KK/Alas Hak, Foto Lapangan, Berita Acara, serta ambil foto 7 Tanda Tangan & Cap Desa langsung dari kamera HP."
                      />
                    </div>
                  </div>
                </ScreenFrame>

                {/* SCREENSHOT 5B: TANDA TANGAN & CAP DESA RESMI (PERSIS SEPERTI GAMBAR USER) */}
                <ScreenFrame
                  title="Bagian Tanda Tangan & Cap Desa Resmi (7 Pengesahan Form Inventarisasi)"
                  subtitle="Ambil Langsung dari Kamera HP atau Galeri Perangkat"
                >
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                      {/* Header Persis UI Asli */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                            <span className="text-amber-600">🏷️</span>
                            <span>
                              Tanda Tangan &amp; Cap Desa Resmi (7 Pengesahan Form Inventarisasi)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Ambil foto tanda tangan fisik secara langsung dari kamera HP atau unggah gambar dari penyimpanan perangkat.
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold flex items-center gap-1">
                          <Smartphone className="w-3 h-3" /> Kamera / Galeri HP
                        </span>
                      </div>

                      {/* Grid Kartu Tanda Tangan */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Card 1 */}
                        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-700 uppercase">
                              TANDA TANGAN PEMILIK LAHAN
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              Sudah Ada ✓
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold text-slate-800 flex items-center justify-between">
                            <span>H. AHMAD SUBANDI</span>
                            <CalloutBadge num={1} />
                          </div>
                          <div className="h-16 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/40 flex items-center justify-center text-[11px] font-bold text-emerald-700">
                            [Pratinjau Tanda Tangan]
                          </div>
                          <div className="w-full py-1.5 rounded-lg bg-amber-500 text-white font-bold text-[11px] flex items-center justify-center gap-1">
                            <Upload className="w-3 h-3" /> Ambil dari HP
                          </div>
                        </div>

                        {/* Card 2 */}
                        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-700 uppercase">
                              TANDA TANGAN SAKSI 1 &amp; 2
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              Belum Ada
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">Otomatis dari Nama Saksi</div>
                          <div className="h-16 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-[10px] text-slate-400">
                            <Upload className="w-3.5 h-3.5 mb-0.5" />
                            <span>Klik untuk Ambil dari HP</span>
                          </div>
                          <div className="w-full py-1.5 rounded-lg bg-amber-500 text-white font-bold text-[11px] flex items-center justify-center gap-1">
                            <Upload className="w-3 h-3" /> Ambil dari HP
                            <CalloutBadge num={2} />
                          </div>
                        </div>

                        {/* Card 3: Cap / Stempel Desa */}
                        <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/30 space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-purple-900 uppercase">
                              CAP / STEMPEL RESMI DESA
                            </span>
                            <CalloutBadge num={3} />
                          </div>
                          <div className="text-[11px] text-purple-700 font-semibold">
                            Pemerintah Desa &amp; TTD Kades
                          </div>
                          <div className="h-16 rounded-lg border-2 border-dashed border-purple-200 bg-white flex flex-col items-center justify-center text-[10px] text-slate-400">
                            <Upload className="w-3.5 h-3.5 mb-0.5" />
                            <span>Foto Stempel Basah Desa</span>
                          </div>
                          <div className="w-full py-1.5 rounded-lg bg-amber-500 text-white font-bold text-[11px] flex items-center justify-center gap-1">
                            <Upload className="w-3 h-3" /> Ambil dari HP
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <LegendStep
                        num={1}
                        title="Isi Nama Terlebih Dahulu di Tab 1"
                        desc="Agar tulisan 'Nama Pemilik Belum Diisi' atau 'Nama Saksi Belum Diisi' berubah menjadi nama asli, pastikan Anda sudah mengetik nama Pemilik, Saksi 1 & 2, Tim Pelaksana, dan Kepala Desa pada bagian identitas."
                      />
                      <LegendStep
                        num={2}
                        title="Klik Tombol Oranye 'Ambil dari HP'"
                        desc="Saat dibuka melalui HP di lapangan, klik tombol oranye 'Ambil dari HP' untuk langsung memotret tanda tangan warga di atas kertas putih, atau pilih foto tanda tangan dari galeri perangkat."
                      />
                      <LegendStep
                        num={3}
                        title="Otomatis Masuk ke Cetak Form Inventarisasi"
                        desc="Ketujuh tanda tangan (Pemilik, Saksi 1, Saksi 2, Tim 1, Tim 2, Kepala Desa) beserta Cap/Stempel Resmi Desa akan otomatis menempel rapi pada lembar PDF Form Inventarisasi saat dicetak!"
                      />
                    </div>
                  </div>
                </ScreenFrame>
              </div>
            )}

            {/* ================================================================
             * TAB 6: MENU 3 (QC), 3.1 (SANDING PETA), 3.2 (SANDING ESDM) & 4 (LOG)
             * ================================================================ */}
            {activeTab === 'qc_sanding' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 6 — Menu 3, 3.1, 3.2 &amp; Menu 4
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Melakukan Verifikasi QC &amp; Menyandingkan Data Peta / PDF ESDM
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Gunakan fitur ini untuk memeriksa kualitas data yang diinput tim lapangan serta memastikan tidak ada selisih antara tabel nominatif, poligon peta, dan dokumen PDF pengumuman ESDM.
                  </p>
                </div>

                {/* SCREENSHOT 6: VERIFIKASI QC & SANDING DATA */}
                <ScreenFrame
                  title="Menu 3 (Verifikasi QC) & Menu 3.1 / 3.2 (Sanding Data Otomatis)"
                  subtitle="Pemeriksaan Kualitas & Audit Selisih Data"
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Panel Kiri: Menu 3 QC */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            MENU 3 — PANEL VERIFIKASI &amp; QC
                          </span>
                          <CalloutBadge num={1} />
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
                          <div className="font-bold text-slate-800">
                            Bidang 012 — H. AHMAD SUBANDI (Desa Sukamaju)
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Catatan Revisi QC: &ldquo;Foto KTP agak buram, mohon difoto ulang.&rdquo;
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[10px]">
                              ✓ Setujui (APPROVED)
                            </span>
                            <span className="px-2.5 py-1 rounded bg-rose-600 text-white font-bold text-[10px]">
                              ✕ Perlu Revisi (REJECTED)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Panel Kanan: Menu 3.1 & 3.2 Sanding */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            MENU 3.1 &amp; 3.2 — SANDING PETA &amp; PDF ESDM
                          </span>
                          <CalloutBadge num={2} />
                        </div>
                        <div className="space-y-2 text-[11px]">
                          <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-center justify-between">
                            <span>✓ Bidang 012: Nama &amp; Luas Cocok (450 m²)</span>
                            <span className="text-[10px] font-black">MATCH</span>
                          </div>
                          <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold flex items-center justify-between">
                            <span>⚠ Bidang 014: Ada di Peta, Belum Diinput di Form</span>
                            <CalloutBadge num={3} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <LegendStep
                        num={1}
                        title="Menu 3 — Cara Approve atau Minta Revisi Data"
                        desc="Buka Menu 3, klik baris bidang warga untuk mengecek kelengkapan foto dan angka. Jika sudah benar klik 'APPROVED'. Jika ada yang kurang, tulis catatan perbaikan lalu klik 'REJECTED' agar operator lapangan tahu bagian mana yang harus diperbaiki."
                      />
                      <LegendStep
                        num={2}
                        title="Menu 3.1 — Sanding Peta vs Data Input"
                        desc="Buka Menu 3.1 untuk melihat otomatis bidang mana yang gambarnya sudah ada di Peta GIS tetapi datanya belum diinput oleh tim lapangan (atau sebaliknya)."
                      />
                      <LegendStep
                        num={3}
                        title="Menu 3.2 — Sanding PDF ESDM vs Data Input"
                        desc="Buka Menu 3.2, klik 'Pilih File PDF ESDM' dari komputer Anda. Aplikasi akan membaca tabel di dalam PDF secara otomatis dan memberi tanda warna merah/kuning jika ada ejaan nama atau luas m² yang berbeda."
                      />
                    </div>
                  </div>
                </ScreenFrame>
              </div>
            )}

            {/* ================================================================
             * TAB 7: MENU 5 (MANAJEMEN PROYEK, KOMPARASI CACHE & UPDATE PETA QGIS)
             * ================================================================ */}
            {activeTab === 'admin_qgis' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Bab 7 — Menu 5, Komparasi Database &amp; Update Peta via QGIS
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Cara Mengatur Proyek Baru &amp; Meng-update Gambar Peta dari QGIS Desktop
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    Khusus pengguna <b>Admin</b>: gunakan <b>Menu 5. Manajemen Proyek</b> untuk menghubungkan Google Spreadsheet &amp; Folder Google Drive, serta ikuti langkah mudah di bawah jika ingin mengubah poligon peta menggunakan aplikasi <b>QGIS</b>.
                  </p>
                </div>

                {/* SCREENSHOT 7: MENU 5 & INTEGRASI FOLDER GEOJSON */}
                <ScreenFrame
                  title="Menu 5 — Manajemen Proyek & Aturan 3 File Peta GeoJSON di Google Drive"
                  subtitle="Cukup Tempel 1 ID Folder Google Drive untuk Seluruh Layer Peta"
                >
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-6 space-y-2.5">
                        <div className="text-xs font-black text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                          <span>PENGATURAN LINK DATABASE &amp; DRIVE PROYEK</span>
                          <CalloutBadge num={1} />
                        </div>
                        <div className="p-2 bg-slate-50 rounded border border-slate-200 text-[11px]">
                          <div className="text-slate-400 font-bold text-[9px]">
                            ID SPREADSHEET MASTER:
                          </div>
                          <div className="font-mono text-slate-700 truncate">
                            1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
                          </div>
                        </div>
                        <div className="p-2 bg-blue-50 rounded border border-blue-200 text-[11px] flex items-center justify-between">
                          <div>
                            <div className="text-blue-600 font-bold text-[9px]">
                              ID FOLDER GOOGLE DRIVE PETA GEOJSON:
                            </div>
                            <div className="font-mono text-blue-900 font-bold">
                              1A2B3C4D5E_FolderPetaGeoJSON
                            </div>
                          </div>
                          <CalloutBadge num={2} />
                        </div>
                      </div>

                      <div className="md:col-span-6 bg-slate-900 text-white p-3.5 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-amber-300">
                            📂 Isi di Dalam Folder Google Drive Peta:
                          </span>
                          <CalloutBadge num={3} />
                        </div>
                        <div className="space-y-1.5 text-[11px] font-mono">
                          <div className="px-2.5 py-1 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                            📄 BIDANG_SUTET.geojson (Poligon Lahan)
                          </div>
                          <div className="px-2.5 py-1 rounded bg-slate-800 text-sky-300 border border-slate-700">
                            📄 TOWER_SUTET.geojson (Titik Tower)
                          </div>
                          <div className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 border border-slate-700">
                            📄 JALUR_SUTET.geojson (Garis Koridor ROW)
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <LegendStep
                        num={1}
                        title="Pengaturan Spreadsheet & KOP Proyek"
                        desc="Di Menu 5, Anda bisa mengganti judul KOP cetak, menambah jalur proyek baru, serta mengatur akun Operator."
                      />
                      <LegendStep
                        num={2}
                        title="Cukup Masukkan 1 ID Folder Google Drive Peta"
                        desc="Anda tidak perlu repot meng-copy ID file peta satu per satu. Cukup masukkan 1 ID Folder Google Drive tempat menyimpan file GeoJSON."
                      />
                      <LegendStep
                        num={3}
                        title="Cara Update Peta dari QGIS Desktop"
                        desc="Saat mengedit peta di QGIS, Export ke format GeoJSON (CRS: EPSG:4326 - WGS 84), beri awalan nama BIDANG_, TOWER_, atau JALUR_, lalu upload ke folder Drive tersebut dan klik 'Refresh Peta' di aplikasi!"
                      />
                    </div>
                  </div>
                </ScreenFrame>

                {/* Komparasi Cache vs Master */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-amber-700" />
                      <h4 className="text-sm font-black text-amber-950">
                        Menu Komparasi Cache vs Master (Cek Kesamaan Data)
                      </h4>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      Jika Anda merasa jumlah baris di aplikasi berbeda dengan isi tabel di Google Sheets, buka menu <b>Komparasi Cache vs Master</b> di bagian bawah sidebar lalu klik <b>Paksa Sinkronisasi</b> agar keduanya 100% sama persis.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Modal */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Tip: Klik tombol hijau <b>Unduh PDF Panduan Bergambar (v4.0)</b> di kanan atas untuk menyimpan buku panduan ini lengkap dengan ilustrasi layarnya.
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Mengerti &amp; Tutup Panduan
          </button>
        </div>
      </div>
    </div>
  );
};
