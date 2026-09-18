import React from 'react';
import { 
  Loader2, 
  LayoutDashboard, 
  Table, 
  MapPin, 
  FileEdit, 
  ShieldCheck, 
  GitCompare, 
  FileSpreadsheet, 
  History,
  Layers,
  Sparkles
} from 'lucide-react';

interface ModuleLoadingFallbackProps {
  activeMenu?: string;
  isLightMode?: boolean;
}

const MENU_INFO: Record<string, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
  dashboard: {
    title: 'Dashboard Analitik & Inventarisasi',
    subtitle: 'Menyiapkan visualisasi data, metrik kompensasi, dan ringkasan progres lapangan...',
    icon: LayoutDashboard
  },
  nominatif: {
    title: 'Daftar Nominatif Kompensasi ROW',
    subtitle: 'Menguraikan data nominatif, pemilikan tanah, tanam tumbuh, dan perhitungan...',
    icon: Table
  },
  input: {
    title: 'Formulir Inventarisasi & Input Lapangan',
    subtitle: 'Menyiapkan modul validasi berkas fisik, koordinat spasial, dan sinkronisasi berkas...',
    icon: FileEdit
  },
  qc: {
    title: 'Pusat Kendali Mutu (Quality Control)',
    subtitle: 'Memuat data audit kepatuhan, verifikasi berkas, dan histori persetujuan...',
    icon: ShieldCheck
  },
  qc_sanding: {
    title: 'Sanding Data Spasial & Atribut',
    subtitle: 'Mengintegrasikan perbandingan poligon peta bidang dan rekaman input lapangan...',
    icon: GitCompare
  },
  qc_sanding_esdm: {
    title: 'Sanding Dokumen Kepmen ESDM 2024',
    subtitle: 'Menyiapkan mesin telaah kepatuhan Kepmen ESDM, selisih luasan, dan komparasi pohon...',
    icon: FileSpreadsheet
  },
  map: {
    title: 'Peta Spasial Interaktif GIS',
    subtitle: 'Memuat layer koridor ROW, titik tower, batas poligon, dan citra satelit...',
    icon: MapPin
  },
  map_span: {
    title: 'Peta Bidang Tanah & Span Visualizer',
    subtitle: 'Menyiapkan kanvas geometri bidang tanah, buffer ruang bebas, dan rincian span...',
    icon: Layers
  },
  resume_project: {
    title: '1.4. Resume Proyek (Resume Dokumen Per Desa)',
    subtitle: 'Memuat matriks progres 6 tahapan desa, berkas Berita Acara, dan foto dokumentasi...',
    icon: Layers
  },
  surat_instansi: {
    title: '1.5. Surat Instansi & Monitoring Tindak Lanjut',
    subtitle: 'Mengambil daftar korespondensi instansi vertikal, tanda terima, dan catatan tindak lanjut...',
    icon: FileSpreadsheet
  },
  logs: {
    title: 'Log Aktivitas & Riwayat Audit',
    subtitle: 'Mengambil riwayat transaksi operator, sinkronisasi master, dan integritas data...',
    icon: History
  }
};

export default function ModuleLoadingFallback({ activeMenu = 'dashboard', isLightMode = false }: ModuleLoadingFallbackProps) {
  const currentMenu = MENU_INFO[activeMenu] || {
    title: 'Memuat Antarmuka Modul...',
    subtitle: 'Menghubungkan pustaka dan komponen sistem Ventura...',
    icon: Sparkles
  };
  const IconComponent = currentMenu.icon;

  return (
    <div className="w-full space-y-6 animate-fadeIn transition-all duration-300">
      {/* Header Banner Skeleton with dynamic info */}
      <div className={`p-6 rounded-2xl border transition-all ${
        isLightMode 
          ? 'bg-white/80 border-slate-200/80 shadow-sm' 
          : 'bg-slate-900/60 border-white/10 shadow-xl'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
              isLightMode ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-amber-950/80 text-amber-400 border border-amber-500/20'
            }`}>
              <IconComponent className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className={`text-lg font-bold tracking-tight ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                  {currentMenu.title}
                </h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                  isLightMode ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}>
                  <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                  Memuat Modul
                </span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {currentMenu.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`h-8 w-24 rounded-xl animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/5'}`} />
            <div className={`h-8 w-28 rounded-xl animate-pulse ${isLightMode ? 'bg-amber-100' : 'bg-amber-900/20'}`} />
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div className="mt-5 w-full bg-slate-200/40 dark:bg-white/5 h-1.5 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-emerald-400 to-amber-500 rounded-full w-2/3 animate-[shimmer_1.5s_infinite_linear] bg-[length:200%_100%]" />
        </div>
      </div>

      {/* KPI Cards Placeholder Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
              isLightMode 
                ? 'bg-white/60 border-slate-200/80 shadow-xs' 
                : 'bg-slate-900/40 border-white/5 shadow-md'
            }`}
          >
            <div className="space-y-2 flex-1">
              <div className={`h-3 w-20 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className={`h-6 w-28 rounded-lg animate-pulse ${isLightMode ? 'bg-slate-300' : 'bg-white/20'}`} />
              <div className={`h-2.5 w-16 rounded-md animate-pulse ${isLightMode ? 'bg-slate-100' : 'bg-white/5'}`} />
            </div>
            <div className={`w-10 h-10 rounded-xl animate-pulse shrink-0 ${isLightMode ? 'bg-slate-100' : 'bg-white/5'}`} />
          </div>
        ))}
      </div>

      {/* Filter / Action Bar Skeleton */}
      <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
        isLightMode 
          ? 'bg-white/60 border-slate-200/80' 
          : 'bg-slate-900/40 border-white/5'
      }`}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`h-9 w-48 rounded-xl animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
          <div className={`h-9 w-36 rounded-xl animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
          <div className={`h-9 w-32 rounded-xl animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-9 w-24 rounded-xl animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
          <div className={`h-9 w-28 rounded-xl animate-pulse ${isLightMode ? 'bg-amber-100' : 'bg-amber-900/30'}`} />
        </div>
      </div>

      {/* Main Table / Visual Panel Skeleton */}
      <div className={`rounded-2xl border overflow-hidden ${
        isLightMode 
          ? 'bg-white border-slate-200 shadow-sm' 
          : 'bg-slate-950/80 border-white/10 shadow-2xl'
      }`}>
        {/* Mock Header Row */}
        <div className={`px-4 py-3 border-b flex items-center justify-between ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-white/10'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`h-3.5 w-24 rounded-md animate-pulse ${isLightMode ? 'bg-slate-300' : 'bg-white/20'}`} />
            <div className={`h-3 w-40 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
          </div>
          <div className={`h-3.5 w-16 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
        </div>

        {/* Mock Rows */}
        <div className="p-4 space-y-3.5">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div 
              key={row} 
              className={`flex items-center justify-between gap-4 p-3 rounded-xl border ${
                isLightMode 
                  ? 'bg-slate-50/50 border-slate-100' 
                  : 'bg-slate-900/30 border-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg animate-pulse shrink-0 ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
                <div className="space-y-1.5">
                  <div className={`h-3.5 w-32 sm:w-48 rounded-md animate-pulse ${isLightMode ? 'bg-slate-300' : 'bg-white/20'}`} />
                  <div className={`h-2.5 w-20 sm:w-32 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-6">
                <div className={`h-3.5 w-20 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/15'}`} />
                <div className={`h-3.5 w-28 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/15'}`} />
                <div className={`h-3.5 w-16 rounded-md animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/15'}`} />
              </div>

              <div className="flex items-center gap-2">
                <div className={`h-6 w-16 rounded-full animate-pulse ${isLightMode ? 'bg-emerald-100' : 'bg-emerald-950/40'}`} />
                <div className={`h-7 w-7 rounded-lg animate-pulse ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
