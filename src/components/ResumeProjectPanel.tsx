import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  ExternalLink, 
  Eye, 
  X, 
  Plus, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  ShieldCheck, 
  Lock, 
  Edit3, 
  Save, 
  TreePine, 
  Landmark, 
  Layers, 
  RefreshCw,
  FolderOpen,
  Trash2
} from 'lucide-react';
import type { LandRecord, VillageResume, VillageStageDoc, StageStatus } from '../types';
import { 
  loadVillageResumes, 
  saveVillageResume, 
  subscribeVillageResumes, 
  createDefaultVillageResume,
  createEmptyStageDoc,
  fileToBase64 
} from '../lib/projectResumeStorage';
import { uploadFileToDrive } from '../lib/googleApi';

interface ResumeProjectPanelProps {
  records: LandRecord[];
  activeProjectId: string;
  activeProjectName?: string;
  role: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST';
  userEmail?: string;
  operatorName?: string;
  accessToken?: string;
  uploadsFolderId?: string;
  onNavigateToInput?: (record: LandRecord) => void;
}

const STAGES_CONFIG = [
  { key: 'baSosialisasiAwal', label: '1. BA Sos Awal', fullName: 'BA Sosialisasi Awal', hasPdf: true, hasPhoto: true, color: 'text-indigo-400' },
  { key: 'baPengumuman', label: '2. BA Pengumuman', fullName: 'BA Pengumuman & Penetapan', hasPdf: true, hasPhoto: true, color: 'text-sky-400' },
  { key: 'lampiranBapt', label: '3. Lampiran BAPT', fullName: 'Lampiran Berita Acara Pembayaran (BAPT)', hasPdf: true, hasPhoto: false, color: 'text-amber-400' },
  { key: 'baPenyampaianNilai', label: '4. BA Penyampaian Nilai', fullName: 'BA Penyampaian Nilai Kompensasi', hasPdf: true, hasPhoto: true, color: 'text-purple-400' },
  { key: 'baSerahTerimaRekening', label: '5. BA Rekening', fullName: 'BA Serah Terima Buku Rekening Bank', hasPdf: true, hasPhoto: true, color: 'text-emerald-400' },
  { key: 'bushClearing', label: '6. Bush Clearing', fullName: 'Dokumentasi & Progres Bush Clearing', hasPdf: false, hasPhoto: true, color: 'text-rose-400' },
] as const;

export default function ResumeProjectPanel({
  records,
  activeProjectId,
  activeProjectName = 'Proyek Ventura',
  role,
  userEmail = 'operator@ventura.id',
  operatorName = 'Operator',
  accessToken,
  uploadsFolderId
}: ResumeProjectPanelProps) {
  const isGuest = role === 'GUEST';

  // State
  const [resumes, setResumes] = useState<VillageResume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'>('ALL');
  const [activeTab, setActiveTab] = useState<'table' | 'cards'>('table');
  const [tableHeightMode, setTableHeightMode] = useState<'compact' | 'normal' | 'full'>('full');

  // Modals
  const [editingDesa, setEditingDesa] = useState<VillageResume | null>(null);
  const [activeStageTab, setActiveStageTab] = useState<typeof STAGES_CONFIG[number]['key']>('baSosialisasiAwal');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingDesaModal, setIsAddingDesaModal] = useState(false);
  const [newDesaName, setNewDesaName] = useState('');
  const [newKecamatan, setNewKecamatan] = useState('');

  // Preview Modal
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    pdfUrl?: string;
    photos?: string[];
  }>({ isOpen: false, title: '' });

  // Extract unique villages from land records
  const uniqueDesasFromRecords = useMemo(() => {
    const map = new Map<string, { totalBidang: number; totalLuas: number }>();
    records.forEach(r => {
      const d = (r.DESA || '').trim().toUpperCase();
      if (!d) return;
      const current = map.get(d) || { totalBidang: 0, totalLuas: 0 };
      current.totalBidang += 1;
      const luas = parseFloat(r.LUAS ? String(r.LUAS).replace(',', '.') : '0') || 0;
      current.totalLuas += luas;
      map.set(d, current);
    });
    return map;
  }, [records]);

  // Load and sync village resumes
  useEffect(() => {
    let unsubscribe = () => {};
    setIsLoading(true);

    const init = async () => {
      const stored = await loadVillageResumes(activeProjectId);
      
      // Ensure all unique desas from records exist in resumes
      const existingMap = new Map<string, VillageResume>();
      stored.forEach(r => existingMap.set(r.desaName.toUpperCase(), r));

      let hasNew = false;
      const mergedList: VillageResume[] = [...stored];

      uniqueDesasFromRecords.forEach((_, desaName) => {
        if (!existingMap.has(desaName)) {
          const newResume = createDefaultVillageResume(activeProjectId, desaName);
          mergedList.push(newResume);
          existingMap.set(desaName, newResume);
          hasNew = true;
          saveVillageResume(newResume); // Persist background
        }
      });

      setResumes(mergedList);
      setIsLoading(false);

      // Subscribe to realtime updates
      unsubscribe = subscribeVillageResumes(activeProjectId, (updated) => {
        setResumes(prev => {
          const map = new Map<string, VillageResume>();
          prev.forEach(p => map.set(p.desaName.toUpperCase(), p));
          updated.forEach(u => map.set(u.desaName.toUpperCase(), u));
          return Array.from(map.values());
        });
      });
    };

    init();
    return () => unsubscribe();
  }, [activeProjectId, uniqueDesasFromRecords]);

  // Calculate Progress of a single village
  const calculateVillageProgress = (res: VillageResume): number => {
    const stages = [
      res.baSosialisasiAwal,
      res.baPengumuman,
      res.lampiranBapt,
      res.baPenyampaianNilai,
      res.baSerahTerimaRekening,
      res.bushClearing
    ];
    let points = 0;
    stages.forEach(s => {
      if (s?.status === 'SELESAI') points += 100 / 6;
      else if (s?.status === 'PROSES') points += 50 / 6;
    });
    return Math.round(points);
  };

  // Filtered Resumes
  const filteredResumes = useMemo(() => {
    return resumes.filter(res => {
      const matchesSearch = res.desaName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (res.kecamatan || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      const progress = calculateVillageProgress(res);
      if (statusFilter === 'COMPLETED') return progress === 100;
      if (statusFilter === 'IN_PROGRESS') return progress > 0 && progress < 100;
      if (statusFilter === 'NOT_STARTED') return progress === 0;
      return true;
    }).sort((a, b) => a.desaName.localeCompare(b.desaName));
  }, [resumes, searchQuery, statusFilter]);

  // Overall Project Resume Metrics
  const metrics = useMemo(() => {
    const totalDesa = resumes.length;
    if (totalDesa === 0) {
      return { totalDesa: 0, completedCount: 0, inProgressCount: 0, avgProgress: 0, stageStats: {} };
    }

    let totalProgressSum = 0;
    let completedCount = 0;
    let inProgressCount = 0;

    const stageStats: Record<string, { selesai: number; proses: number }> = {
      baSosialisasiAwal: { selesai: 0, proses: 0 },
      baPengumuman: { selesai: 0, proses: 0 },
      lampiranBapt: { selesai: 0, proses: 0 },
      baPenyampaianNilai: { selesai: 0, proses: 0 },
      baSerahTerimaRekening: { selesai: 0, proses: 0 },
      bushClearing: { selesai: 0, proses: 0 }
    };

    resumes.forEach(r => {
      const prog = calculateVillageProgress(r);
      totalProgressSum += prog;
      if (prog === 100) completedCount++;
      else if (prog > 0) inProgressCount++;

      STAGES_CONFIG.forEach(s => {
        const stage = r[s.key];
        if (stage?.status === 'SELESAI') stageStats[s.key].selesai++;
        else if (stage?.status === 'PROSES') stageStats[s.key].proses++;
      });
    });

    return {
      totalDesa,
      completedCount,
      inProgressCount,
      avgProgress: Math.round(totalProgressSum / totalDesa),
      stageStats
    };
  }, [resumes]);

  // Handle Save Edited Village Stage
  const handleSaveVillageChanges = async () => {
    if (!editingDesa) return;
    setIsSaving(true);
    try {
      const updated: VillageResume = {
        ...editingDesa,
        updatedBy: operatorName || userEmail
      };
      await saveVillageResume(updated);
      setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
      setEditingDesa(null);
    } catch (e) {
      console.error('Error saving village resume:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Add Manual Village
  const handleAddManualDesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesaName.trim()) return;
    const newResume = createDefaultVillageResume(activeProjectId, newDesaName.trim(), newKecamatan.trim());
    await saveVillageResume(newResume);
    setResumes(prev => [...prev, newResume]);
    setNewDesaName('');
    setNewKecamatan('');
    setIsAddingDesaModal(false);
  };

  // Upload PDF Handler inside editing modal
  const handleUploadPdf = async (file: File, stageKey: typeof STAGES_CONFIG[number]['key']) => {
    if (!editingDesa) return;
    try {
      let webLink = '';
      if (accessToken && uploadsFolderId) {
        const res = await uploadFileToDrive(accessToken, file, `RESUME_${stageKey.toUpperCase()}`, editingDesa.desaName, uploadsFolderId);
        webLink = res.webViewLink;
      } else {
        webLink = await fileToBase64(file);
      }

      setEditingDesa(prev => {
        if (!prev) return null;
        const currentStage = prev[stageKey] || createEmptyStageDoc();
        return {
          ...prev,
          [stageKey]: {
            ...currentStage,
            pdfUrl: webLink,
            pdfName: file.name,
            status: currentStage.status === 'BELUM' ? 'PROSES' : currentStage.status
          }
        };
      });
    } catch (err) {
      console.error('Failed to upload PDF:', err);
      alert('Gagal mengunggah PDF. Silakan coba kembali.');
    }
  };

  // Upload Documentation Photos Handler inside editing modal
  const handleUploadPhoto = async (file: File, stageKey: typeof STAGES_CONFIG[number]['key']) => {
    if (!editingDesa) return;
    try {
      let photoUrl = '';
      if (accessToken && uploadsFolderId) {
        const res = await uploadFileToDrive(accessToken, file, `DOK_${stageKey.toUpperCase()}`, editingDesa.desaName, uploadsFolderId);
        photoUrl = res.webViewLink;
      } else {
        photoUrl = await fileToBase64(file);
      }

      setEditingDesa(prev => {
        if (!prev) return null;
        const currentStage = prev[stageKey] || createEmptyStageDoc();
        const existingPhotos = currentStage.docPhotos || [];
        return {
          ...prev,
          [stageKey]: {
            ...currentStage,
            docPhotos: [...existingPhotos, photoUrl],
            status: currentStage.status === 'BELUM' ? 'PROSES' : currentStage.status
          }
        };
      });
    } catch (err) {
      console.error('Failed to upload photo:', err);
      alert('Gagal mengunggah foto dokumentasi.');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['No', 'Nama Desa', 'Kecamatan', 'BA Sos Awal', 'BA Pengumuman', 'Lampiran BAPT', 'BA Nilai', 'BA Rekening', 'Bush Clearing', 'Progres (%)'];
    const rows = filteredResumes.map((r, i) => [
      i + 1,
      `"${r.desaName}"`,
      `"${r.kecamatan || '-'}"`,
      r.baSosialisasiAwal.status,
      r.baPengumuman.status,
      r.lampiranBapt.status,
      r.baPenyampaianNilai.status,
      r.baSerahTerimaRekening.status,
      r.bushClearing.status,
      `${calculateVillageProgress(r)}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Resume_Proyek_Desa_${activeProjectName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Status Badge
  const renderStatusBadge = (status: StageStatus) => {
    if (status === 'SELESAI') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" /> Selesai
        </span>
      );
    }
    if (status === 'PROSES') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Clock className="w-3 h-3" /> Proses
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
        Belum
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans" id="resume_project_panel">
      {/* 1. Header Banner & Resume KPI */}
      <div className="glass-card p-6 rounded-3xl border border-indigo-500/20 shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Menu 1.4
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Landmark className="w-5 h-5 text-indigo-400" />
                Resume Proyek: Progres Administrasi & Lapangan Per Desa
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              Matriks resume 6 tahapan utama per desa: BA Sosialisasi Awal, BA Pengumuman, Lampiran BAPT, BA Penyampaian Nilai, BA Serah Terima Rekening, dan Bush Clearing.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              title="Unduh Rekap CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ekspor Rekap</span>
            </button>

            {!isGuest && (
              <button
                onClick={() => setIsAddingDesaModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer"
                title="Tambah Desa Baru ke Resume"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Desa</span>
              </button>
            )}
          </div>
        </div>

        {/* Top KPI Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 pt-2 border-t border-white/5 relative z-10">
          {STAGES_CONFIG.map((stage) => {
            const stat = metrics.stageStats[stage.key] || { selesai: 0, proses: 0 };
            const pct = metrics.totalDesa > 0 ? Math.round((stat.selesai / metrics.totalDesa) * 100) : 0;
            return (
              <div key={stage.key} className="bg-slate-900/60 p-3 rounded-2xl border border-white/5 space-y-2 hover:border-white/10 transition-all">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${stage.color} truncate block`}>
                    {stage.label}
                  </span>
                  <span className="text-[10px] font-mono font-extrabold text-slate-400">
                    {stat.selesai}/{metrics.totalDesa}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-white font-mono">{pct}%</span>
                  <span className="text-[9px] text-slate-500 font-semibold">{stat.proses} Proses</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Overall Status Banner */}
        <div className="bg-indigo-950/40 border border-indigo-500/20 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-sm shrink-0 border border-indigo-500/30">
              {metrics.avgProgress}%
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wide">
                Total Progres Kumulatif Koridor: {metrics.totalDesa} Desa
              </h4>
              <p className="text-[11px] text-slate-400">
                {metrics.completedCount} desa telah 100% tuntas, {metrics.inProgressCount} desa sedang dalam tahap pengerjaan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isGuest && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold">
                <Lock className="w-3.5 h-3.5 text-amber-400" /> Mode Tamu (Hanya Lihat)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Controls & Filter Bar */}
      <div className="glass-card p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari desa atau kecamatan..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({resumes.length})
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tuntas 100%
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'IN_PROGRESS' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              On Progress
            </button>
          </div>

          {/* Table Height Size Switcher */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setTableHeightMode('compact')}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                tableHeightMode === 'compact' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Tinggi Ringkas (Scroll mandiri 420px)"
            >
              Ringkas
            </button>
            <button
              onClick={() => setTableHeightMode('normal')}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                tableHeightMode === 'normal' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Tinggi Standar (Scroll mandiri 620px)"
            >
              Standar
            </button>
            <button
              onClick={() => setTableHeightMode('full')}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                tableHeightMode === 'full' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Layar Penuh (Semua data)"
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      {/* 3. Table Resume View (Self-contained scroll container) */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Horizontal scroll hint bar */}
        <div className="bg-slate-900/80 px-4 py-2.5 border-b border-white/10 flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
            <span>
              <strong>Tip Scroll:</strong> {tableHeightMode === 'full' ? 'Tabel ditampilkan penuh (halaman bebas di-scroll ke bawah). Geser ke samping untuk melihat seluruh tahapan BA & progres.' : 'Geser kursor atau touchpad ke samping untuk melihat seluruh tahapan dokumen.'}
            </span>
          </div>
          <span className="font-mono text-emerald-400 font-bold shrink-0">{filteredResumes.length} Desa Terdata</span>
        </div>

        <div 
          className="table-scroll-container overflow-x-auto transition-all scroll-smooth"
          style={{
            maxHeight: tableHeightMode === 'compact' ? '460px' : tableHeightMode === 'normal' ? '680px' : 'none',
            overflowY: tableHeightMode === 'full' ? 'visible' : 'auto',
            overscrollBehavior: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md border-b border-white/10 text-[10px] font-extrabold text-slate-300 uppercase tracking-wider shadow-sm">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4 w-48">Desa & Info Lahan</th>
                <th className="py-3.5 px-3">1. BA Sos Awal</th>
                <th className="py-3.5 px-3">2. BA Pengumuman</th>
                <th className="py-3.5 px-3">3. Lampiran BAPT</th>
                <th className="py-3.5 px-3">4. BA Nilai</th>
                <th className="py-3.5 px-3">5. BA Rekening</th>
                <th className="py-3.5 px-3">6. Bush Clearing</th>
                <th className="py-3.5 px-3 w-28 text-center">Progres</th>
                <th className="py-3.5 px-4 w-32 text-center">Aksi Dokumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-medium">
              {filteredResumes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-slate-400 space-y-3">
                    <Landmark className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold">Tidak ada data desa yang cocok dengan pencarian.</p>
                  </td>
                </tr>
              ) : (
                filteredResumes.map((res, index) => {
                  const progress = calculateVillageProgress(res);
                  const villageData = uniqueDesasFromRecords.get(res.desaName) || { totalBidang: 0, totalLuas: 0 };

                  return (
                    <tr 
                      key={res.id} 
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* No */}
                      <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-bold">
                        {index + 1}
                      </td>

                      {/* Desa & Info Lahan */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-extrabold text-white text-sm tracking-tight flex items-center gap-1.5">
                            <Landmark className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            {res.desaName}
                          </div>
                          {res.kecamatan && (
                            <span className="text-[10px] text-slate-400 font-semibold block">
                              Kec. {res.kecamatan}
                            </span>
                          )}
                          <div className="flex items-center gap-2 pt-0.5 text-[10px] font-mono text-slate-400">
                            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                              {villageData.totalBidang} Bidang
                            </span>
                            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                              {villageData.totalLuas.toLocaleString('id-ID')} m²
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 1. BA Sos Awal */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {renderStatusBadge(res.baSosialisasiAwal.status)}
                          <div className="flex items-center gap-1">
                            {res.baSosialisasiAwal.pdfUrl && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `BA Sosialisasi Awal - Desa ${res.desaName}`,
                                  pdfUrl: res.baSosialisasiAwal.pdfUrl
                                })}
                                className="p-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Buka PDF BA Sosialisasi Awal"
                              >
                                <FileText className="w-3 h-3" /> PDF
                              </button>
                            )}
                            {(res.baSosialisasiAwal.docPhotos?.length || 0) > 0 && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `Foto BA Sosialisasi Awal - Desa ${res.desaName}`,
                                  photos: res.baSosialisasiAwal.docPhotos
                                })}
                                className="p-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Lihat Foto Dokumentasi"
                              >
                                <ImageIcon className="w-3 h-3" /> {res.baSosialisasiAwal.docPhotos?.length} Foto
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. BA Pengumuman */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {renderStatusBadge(res.baPengumuman.status)}
                          <div className="flex items-center gap-1">
                            {res.baPengumuman.pdfUrl && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `BA Pengumuman - Desa ${res.desaName}`,
                                  pdfUrl: res.baPengumuman.pdfUrl
                                })}
                                className="p-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Buka PDF BA Pengumuman"
                              >
                                <FileText className="w-3 h-3" /> PDF
                              </button>
                            )}
                            {(res.baPengumuman.docPhotos?.length || 0) > 0 && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `Foto Pengumuman - Desa ${res.desaName}`,
                                  photos: res.baPengumuman.docPhotos
                                })}
                                className="p-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Lihat Foto Dokumentasi"
                              >
                                <ImageIcon className="w-3 h-3" /> {res.baPengumuman.docPhotos?.length} Foto
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Lampiran BAPT */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {renderStatusBadge(res.lampiranBapt.status)}
                          {res.lampiranBapt.pdfUrl && (
                            <button
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                title: `Lampiran BAPT - Desa ${res.desaName}`,
                                pdfUrl: res.lampiranBapt.pdfUrl
                              })}
                              className="p-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                              title="Buka PDF Lampiran BAPT"
                            >
                              <FileText className="w-3 h-3" /> PDF
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 4. BA Penyampaian Nilai */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {renderStatusBadge(res.baPenyampaianNilai.status)}
                          <div className="flex items-center gap-1">
                            {res.baPenyampaianNilai.pdfUrl && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `BA Penyampaian Nilai - Desa ${res.desaName}`,
                                  pdfUrl: res.baPenyampaianNilai.pdfUrl
                                })}
                                className="p-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Buka PDF Penyampaian Nilai"
                              >
                                <FileText className="w-3 h-3" /> PDF
                              </button>
                            )}
                            {(res.baPenyampaianNilai.docPhotos?.length || 0) > 0 && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `Foto Penyampaian Nilai - Desa ${res.desaName}`,
                                  photos: res.baPenyampaianNilai.docPhotos
                                })}
                                className="p-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Lihat Foto Dokumentasi"
                              >
                                <ImageIcon className="w-3 h-3" /> {res.baPenyampaianNilai.docPhotos?.length} Foto
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 5. BA Serah Terima Rekening */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {renderStatusBadge(res.baSerahTerimaRekening.status)}
                          <div className="flex items-center gap-1">
                            {res.baSerahTerimaRekening.pdfUrl && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `BA Serah Terima Rekening - Desa ${res.desaName}`,
                                  pdfUrl: res.baSerahTerimaRekening.pdfUrl
                                })}
                                className="p-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Buka PDF Serah Terima Rekening"
                              >
                                <FileText className="w-3 h-3" /> PDF
                              </button>
                            )}
                            {(res.baSerahTerimaRekening.docPhotos?.length || 0) > 0 && (
                              <button
                                onClick={() => setPreviewModal({
                                  isOpen: true,
                                  title: `Foto Serah Terima Rekening - Desa ${res.desaName}`,
                                  photos: res.baSerahTerimaRekening.docPhotos
                                })}
                                className="p-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                                title="Lihat Foto Dokumentasi"
                              >
                                <ImageIcon className="w-3 h-3" /> {res.baSerahTerimaRekening.docPhotos?.length} Foto
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 6. Bush Clearing */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1.5">
                          {renderStatusBadge(res.bushClearing.status)}
                          {(res.bushClearing.docPhotos?.length || 0) > 0 && (
                            <button
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                title: `Foto Bush Clearing - Desa ${res.desaName}`,
                                photos: res.bushClearing.docPhotos
                              })}
                              className="p-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[10px] flex items-center gap-1 cursor-pointer"
                              title="Lihat Foto Dokumentasi Bush Clearing"
                            >
                              <TreePine className="w-3 h-3" /> {res.bushClearing.docPhotos?.length} Foto
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Progress Bar */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="space-y-1">
                          <span className={`text-xs font-mono font-black ${
                            progress === 100 ? 'text-emerald-400' : progress > 0 ? 'text-amber-400' : 'text-slate-500'
                          }`}>
                            {progress}%
                          </span>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                progress === 100 ? 'bg-emerald-500' : progress > 50 ? 'bg-indigo-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-center">
                        {!isGuest ? (
                          <button
                            onClick={() => {
                              setEditingDesa(res);
                              setActiveStageTab('baSosialisasiAwal');
                            }}
                            className="px-3 py-1.5 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full"
                            title="Kelola & Upload Dokumen Desa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Kelola</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingDesa(res);
                              setActiveStageTab('baSosialisasiAwal');
                            }}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-white/10 w-full"
                            title="Tinjau Berkas Detail Desa"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Tinjau</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: EDIT / UPLOAD BERKAS TAHAPAN DESA */}
      {editingDesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Kelola Administrasi & Dokumen: Desa {editingDesa.desaName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Kecamatan {editingDesa.kecamatan || '-'} • Jalur {activeProjectName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditingDesa(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage Tabs */}
            <div className="flex border-b border-white/10 bg-slate-950/50 px-4 overflow-x-auto">
              {STAGES_CONFIG.map((stage) => {
                const stageData = editingDesa[stage.key];
                const isActive = activeStageTab === stage.key;
                return (
                  <button
                    key={stage.key}
                    onClick={() => setActiveStageTab(stage.key)}
                    className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                      isActive 
                        ? 'border-indigo-500 text-indigo-300 bg-white/5' 
                        : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{stage.label}</span>
                    {stageData?.status === 'SELESAI' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Modal Body: Active Stage Details */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {(() => {
                const currentStageConfig = STAGES_CONFIG.find(s => s.key === activeStageTab)!;
                const stageData = editingDesa[activeStageTab] || createEmptyStageDoc();

                return (
                  <div className="space-y-6">
                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-extrabold text-white">
                          {currentStageConfig.fullName}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Status kelengkapan berkas fisik, berita acara, serta foto dokumentasi lapangan.
                        </p>
                      </div>

                      {/* Status Selector */}
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-300 uppercase">Status:</label>
                        <select
                          disabled={isGuest}
                          value={stageData.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as StageStatus;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: {
                                  ...stageData,
                                  status: newStatus
                                }
                              };
                            });
                          }}
                          className="bg-slate-950 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-50"
                        >
                          <option value="BELUM">Belum Dilaksanakan</option>
                          <option value="PROSES">Sedang Proses</option>
                          <option value="SELESAI">Selesai & Lengkap</option>
                        </select>
                      </div>
                    </div>

                    {/* Date & Manual Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                          Tanggal Pelaksanaan
                        </label>
                        <input
                          type="date"
                          disabled={isGuest}
                          value={stageData.date || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: { ...stageData, date: val }
                              };
                            });
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                          Catatan / Keterangan Khusus
                        </label>
                        <input
                          type="text"
                          disabled={isGuest}
                          value={stageData.notes || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: { ...stageData, notes: val }
                              };
                            });
                          }}
                          placeholder="Contoh: Telah dihadiri Kepala Desa dan perwakilan warga..."
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* PDF Section (If applicable) */}
                    {currentStageConfig.hasPdf && (
                      <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                            <FileText className="w-4 h-4 text-indigo-400" />
                            Dokumen Berita Acara (PDF)
                          </h5>
                          {stageData.pdfUrl && (
                            <button
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                title: `${currentStageConfig.fullName} - ${editingDesa.desaName}`,
                                pdfUrl: stageData.pdfUrl
                              })}
                              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Buka PDF
                            </button>
                          )}
                        </div>

                        {stageData.pdfUrl ? (
                          <div className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-indigo-500/20">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                              <span className="text-xs font-bold text-white truncate">
                                {stageData.pdfName || 'Dokumen_Berita_Acara.pdf'}
                              </span>
                            </div>
                            {!isGuest && (
                              <button
                                onClick={() => {
                                  setEditingDesa(prev => {
                                    if (!prev) return null;
                                    return {
                                      ...prev,
                                      [activeStageTab]: {
                                        ...stageData,
                                        pdfUrl: undefined,
                                        pdfName: undefined
                                      }
                                    };
                                  });
                                }}
                                className="p-1 text-slate-400 hover:text-rose-400 rounded-lg cursor-pointer"
                                title="Hapus Berkas PDF"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          !isGuest ? (
                            <label className="border-2 border-dashed border-white/10 hover:border-indigo-500/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all bg-white/[0.01] hover:bg-indigo-500/5">
                              <UploadCloud className="w-8 h-8 text-indigo-400" />
                              <span className="text-xs font-bold text-white">Unggah Berkas PDF</span>
                              <span className="text-[10px] text-slate-400">Klik atau seret file PDF berita acara ke sini</span>
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadPdf(file, activeStageTab);
                                }}
                              />
                            </label>
                          ) : (
                            <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 text-center text-xs text-slate-400">
                              Belum ada berkas PDF yang diunggah.
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Photo Documentation Section (If applicable) */}
                    {currentStageConfig.hasPhoto && (
                      <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                            <ImageIcon className="w-4 h-4 text-purple-400" />
                            Dokumentasi Foto Lapangan
                          </h5>
                          <span className="text-[10px] font-mono text-slate-400">
                            {(stageData.docPhotos || []).length} Foto Terunggah
                          </span>
                        </div>

                        {/* Photos Grid */}
                        {(stageData.docPhotos || []).length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {(stageData.docPhotos || []).map((photoUrl, idx) => (
                              <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/10 aspect-video bg-slate-950">
                                <img
                                  src={photoUrl}
                                  alt={`Dokumentasi ${idx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setPreviewModal({
                                      isOpen: true,
                                      title: `Dokumentasi Foto ${idx + 1} - Desa ${editingDesa.desaName}`,
                                      photos: [photoUrl]
                                    })}
                                    className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs cursor-pointer"
                                    title="Lihat Lebih Besar"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {!isGuest && (
                                    <button
                                      onClick={() => {
                                        setEditingDesa(prev => {
                                          if (!prev) return null;
                                          const photos = [...(stageData.docPhotos || [])];
                                          photos.splice(idx, 1);
                                          return {
                                            ...prev,
                                            [activeStageTab]: {
                                              ...stageData,
                                              docPhotos: photos
                                            }
                                          };
                                        });
                                      }}
                                      className="p-1.5 bg-rose-500/30 hover:bg-rose-500/50 rounded-lg text-rose-300 text-xs cursor-pointer"
                                      title="Hapus Foto"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Upload Photo Button */}
                        {!isGuest && (
                          <label className="border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-2xl p-4 flex items-center justify-center gap-2 cursor-pointer transition-all bg-white/[0.01] hover:bg-purple-500/5">
                            <UploadCloud className="w-5 h-5 text-purple-400" />
                            <span className="text-xs font-bold text-white">Tambah Foto Dokumentasi</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadPhoto(file, activeStageTab);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-900/90 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">
                Terakhir diperbarui: {editingDesa.updatedBy || 'Sistem'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDesa(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Tutup
                </button>

                {!isGuest && (
                  <button
                    type="button"
                    onClick={handleSaveVillageChanges}
                    disabled={isSaving}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: PREVIEW PDF ATAU FOTO DOKUMENTASI */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900">
              <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                {previewModal.title}
              </h4>
              <button
                onClick={() => setPreviewModal({ isOpen: false, title: '' })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1 flex flex-col items-center justify-center bg-slate-950">
              {previewModal.pdfUrl ? (
                <iframe
                  src={previewModal.pdfUrl}
                  title="PDF Viewer"
                  className="w-full h-[70vh] rounded-xl border border-white/10"
                />
              ) : previewModal.photos && previewModal.photos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full p-2">
                  {previewModal.photos.map((photo, i) => (
                    <div key={i} className="rounded-xl overflow-hidden border border-white/10 bg-slate-900">
                      <img src={photo} alt={`Dokumentasi ${i + 1}`} className="w-full h-auto object-contain max-h-[60vh] mx-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-xs">Tidak ada lampiran yang dapat ditampilkan.</p>
              )}
            </div>

            <div className="p-3 border-t border-white/10 bg-slate-900 flex justify-end">
              <button
                onClick={() => setPreviewModal({ isOpen: false, title: '' })}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: TAMBAH DESA MANUAL */}
      {isAddingDesaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-md border border-white/20 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Tambah Desa Baru ke Resume
              </h3>
              <button
                onClick={() => setIsAddingDesaModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddManualDesa} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Nama Desa
                </label>
                <input
                  type="text"
                  required
                  value={newDesaName}
                  onChange={(e) => setNewDesaName(e.target.value)}
                  placeholder="Contoh: SOBOREJO"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Kecamatan (Opsional)
                </label>
                <input
                  type="text"
                  value={newKecamatan}
                  onChange={(e) => setNewKecamatan(e.target.value)}
                  placeholder="Contoh: SUKOREJO"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsAddingDesaModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/25 cursor-pointer"
                >
                  Tambahkan Desa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
