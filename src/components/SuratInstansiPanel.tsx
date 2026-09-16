import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, 
  Send, 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  ExternalLink, 
  Eye, 
  X, 
  Trash2, 
  Edit3, 
  Save, 
  Building2, 
  Image as ImageIcon, 
  ShieldAlert, 
  Lock, 
  Calendar, 
  UserCheck, 
  ArrowRight,
  Sparkles,
  ClipboardList,
  RefreshCw
} from 'lucide-react';
import type { AgencyLetter, AgencyLetterStatus } from '../types';
import { 
  loadAgencyLetters, 
  saveAgencyLetter, 
  deleteAgencyLetter, 
  subscribeAgencyLetters, 
  fileToBase64 
} from '../lib/projectResumeStorage';
import { uploadFileToDrive } from '../lib/googleApi';

interface SuratInstansiPanelProps {
  activeProjectId: string;
  activeProjectName?: string;
  role: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST';
  userEmail?: string;
  operatorName?: string;
  accessToken?: string;
  uploadsFolderId?: string;
}

const COMMON_INSTANSI_SUGGESTIONS = [
  'BPN / ATR Kantor Pertanahan',
  'Balai Besar Pelaksanaan Jalan Nasional (BBPJN)',
  'Dinas Lingkungan Hidup (DLH)',
  'Dinas Kehutanan / KPH Perhutani',
  'Kantor Camat & Tim Forkopimcam',
  'Balai Besar Wilayah Sungai (BBWS)',
  'PT PLN (Persero) UIP JBTB',
  'Kantor Desa / Kelurahan',
  'Dinas Pekerjaan Umum & Penataan Ruang (PUPR)',
  'Polres / Polsek Setempat',
  'Kodim / Koramil Setempat'
];

export default function SuratInstansiPanel({
  activeProjectId,
  activeProjectName = 'Proyek Ventura',
  role,
  userEmail = 'operator@ventura.id',
  operatorName = 'Operator',
  accessToken,
  uploadsFolderId
}: SuratInstansiPanelProps) {
  const isGuest = role === 'GUEST';

  // State
  const [letters, setLetters] = useState<AgencyLetter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AgencyLetterStatus>('ALL');
  const [selectedInstansiFilter, setSelectedInstansiFilter] = useState<string>('ALL');
  const [tableHeightMode, setTableHeightMode] = useState<'compact' | 'normal' | 'full'>('full');

  // Deletion Confirmation Modal State
  const [letterToDelete, setLetterToDelete] = useState<AgencyLetter | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal Form State (Add/Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLetter, setEditingLetter] = useState<AgencyLetter | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formInstansi, setFormInstansi] = useState('');
  const [formNoSurat, setFormNoSurat] = useState('');
  const [formTanggal, setFormTanggal] = useState('');
  const [formPerihal, setFormPerihal] = useState('');
  const [formStatus, setFormStatus] = useState<AgencyLetterStatus>('SUDAH_MASUK');
  const [formTindakLanjut, setFormTindakLanjut] = useState('');
  const [formPic, setFormPic] = useState('');
  const [formPdfUrl, setFormPdfUrl] = useState<string | undefined>();
  const [formPdfName, setFormPdfName] = useState<string | undefined>();
  const [formDocPhotos, setFormDocPhotos] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview Modal
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    pdfUrl?: string;
    photos?: string[];
  }>({ isOpen: false, title: '' });

  // Load Letters
  useEffect(() => {
    let unsubscribe = () => {};
    setIsLoading(true);

    const init = async () => {
      const data = await loadAgencyLetters(activeProjectId);
      setLetters(data);
      setIsLoading(false);

      unsubscribe = subscribeAgencyLetters(activeProjectId, (updated) => {
        setLetters(updated);
      });
    };

    init();
    return () => unsubscribe();
  }, [activeProjectId]);

  // Unique Agencies List for Filter
  const uniqueAgencies = useMemo(() => {
    const set = new Set<string>();
    letters.forEach(l => {
      if (l.instansiName) set.add(l.instansiName.trim());
    });
    return Array.from(set).sort();
  }, [letters]);

  // Metrics / Resume
  const metrics = useMemo(() => {
    const total = letters.length;
    let sudahMasuk = 0;
    let onProgress = 0;
    let tindakLanjut = 0;
    let selesai = 0;

    letters.forEach(l => {
      if (l.status === 'SUDAH_MASUK') sudahMasuk++;
      else if (l.status === 'ON_PROGRESS') onProgress++;
      else if (l.status === 'TINDAK_LANJUT') tindakLanjut++;
      else if (l.status === 'SELESAI') selesai++;
    });

    return {
      total,
      sudahMasuk,
      onProgress,
      tindakLanjut,
      selesai,
      uniqueAgenciesCount: uniqueAgencies.length
    };
  }, [letters, uniqueAgencies]);

  // Filtered Letters
  const filteredLetters = useMemo(() => {
    return letters.filter(l => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        l.instansiName.toLowerCase().includes(q) ||
        l.noSurat.toLowerCase().includes(q) ||
        l.perihal.toLowerCase().includes(q) ||
        (l.catatanTindakLanjut || '').toLowerCase().includes(q) ||
        (l.picInstansi || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (selectedInstansiFilter !== 'ALL' && l.instansiName !== selectedInstansiFilter) return false;
      return true;
    }).sort((a, b) => (b.tanggalSurat || '').localeCompare(a.tanggalSurat || '') || b.updatedAt - a.updatedAt);
  }, [letters, searchQuery, statusFilter, selectedInstansiFilter]);

  // Open Form for Adding New Letter
  const handleOpenAdd = () => {
    setEditingLetter(null);
    setFormInstansi('');
    setFormNoSurat('');
    setFormTanggal(new Date().toISOString().split('T')[0]);
    setFormPerihal('');
    setFormStatus('SUDAH_MASUK');
    setFormTindakLanjut('');
    setFormPic('');
    setFormPdfUrl(undefined);
    setFormPdfName(undefined);
    setFormDocPhotos([]);
    setFormError(null);
    setIsFormOpen(true);
  };

  // Open Form for Editing Existing Letter
  const handleOpenEdit = (letter: AgencyLetter) => {
    setEditingLetter(letter);
    setFormInstansi(letter.instansiName);
    setFormNoSurat(letter.noSurat);
    setFormTanggal(letter.tanggalSurat || '');
    setFormPerihal(letter.perihal);
    setFormStatus(letter.status);
    setFormTindakLanjut(letter.catatanTindakLanjut || '');
    setFormPic(letter.picInstansi || '');
    setFormPdfUrl(letter.suratPdfUrl);
    setFormPdfName(letter.suratPdfName);
    setFormDocPhotos(letter.docPhotos || []);
    setFormError(null);
    setIsFormOpen(true);
  };

  // Upload PDF for Form
  const handleUploadPdf = async (file: File) => {
    try {
      let webLink = '';
      if (accessToken && uploadsFolderId) {
        const res = await uploadFileToDrive(accessToken, file, 'SURAT_INSTANSI', formInstansi || 'INSTANSI', uploadsFolderId);
        webLink = res.webViewLink;
      } else {
        webLink = await fileToBase64(file);
      }
      setFormPdfUrl(webLink);
      setFormPdfName(file.name);
      setFormError(null);
    } catch (err) {
      console.error('Gagal upload file PDF surat:', err);
      setFormError('Gagal mengunggah file PDF. Silakan coba lagi.');
    }
  };

  // Upload Photos for Form
  const handleUploadPhoto = async (file: File) => {
    try {
      let photoUrl = '';
      if (accessToken && uploadsFolderId) {
        const res = await uploadFileToDrive(accessToken, file, 'DOK_SURAT', formInstansi || 'INSTANSI', uploadsFolderId);
        photoUrl = res.webViewLink;
      } else {
        photoUrl = await fileToBase64(file);
      }
      setFormDocPhotos(prev => [...prev, photoUrl]);
      setFormError(null);
    } catch (err) {
      console.error('Gagal upload dokumentasi surat:', err);
      setFormError('Gagal mengunggah foto dokumentasi.');
    }
  };

  // Save Letter
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInstansi.trim() || !formNoSurat.trim() || !formPerihal.trim()) {
      setFormError('Harap lengkapi Instansi Tujuan, Nomor Surat, dan Perihal.');
      return;
    }

    setFormError(null);
    const letterToSave: AgencyLetter = {
      id: editingLetter ? editingLetter.id : `${activeProjectId}_letter_${Date.now()}`,
      projectId: activeProjectId,
      instansiName: formInstansi.trim(),
      noSurat: formNoSurat.trim(),
      tanggalSurat: formTanggal,
      perihal: formPerihal.trim(),
      suratPdfUrl: formPdfUrl,
      suratPdfName: formPdfName,
      docPhotos: formDocPhotos,
      status: formStatus,
      catatanTindakLanjut: formTindakLanjut.trim(),
      picInstansi: formPic.trim(),
      createdAt: editingLetter ? editingLetter.createdAt : Date.now(),
      updatedAt: Date.now(),
      updatedBy: operatorName || userEmail
    };

    // 1. Optimistic instant UI update
    setLetters(prev => {
      const idx = prev.findIndex(l => l.id === letterToSave.id);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = letterToSave;
        return cp;
      }
      return [letterToSave, ...prev];
    });

    setIsFormOpen(false);
    setActionFeedback({ 
      type: 'success', 
      message: editingLetter ? 'Perubahan surat berhasil disimpan.' : 'Surat instansi baru berhasil ditambahkan.' 
    });
    setTimeout(() => setActionFeedback(null), 3500);

    // 2. Persist in background with timeout safety
    try {
      await saveAgencyLetter(letterToSave);
    } catch (err) {
      console.warn('Background save agency letter failed:', err);
    }
  };

  // Delete Letter Request
  const handleRequestDelete = (letter: AgencyLetter) => {
    setLetterToDelete(letter);
  };

  // Confirm Delete Letter execution (Instant Optimistic UI)
  const handleConfirmDelete = async () => {
    if (!letterToDelete) return;
    const targetId = letterToDelete.id;
    const targetInstansi = letterToDelete.instansiName;

    // 1. Optimistic removal from UI immediately - closes modal instantly
    setLetters(prev => prev.filter(l => l.id !== targetId));
    setLetterToDelete(null);
    setActionFeedback({ type: 'success', message: `Surat ${targetInstansi} berhasil dihapus dari daftar.` });
    setTimeout(() => setActionFeedback(null), 3500);

    // 2. Perform background deletion with safety timeout
    try {
      await deleteAgencyLetter(activeProjectId, targetId);
    } catch (err) {
      console.warn('Gagal menghapus surat di background:', err);
    }
  };

  // Quick Status Change directly from row (Operator only)
  const handleQuickStatusChange = async (letter: AgencyLetter, newStatus: AgencyLetterStatus) => {
    if (isGuest) return;
    const updated: AgencyLetter = {
      ...letter,
      status: newStatus,
      updatedAt: Date.now(),
      updatedBy: operatorName || userEmail
    };
    // Instant UI update
    setLetters(prev => prev.map(l => l.id === letter.id ? updated : l));
    // Background persist
    saveAgencyLetter(updated).catch(err => console.warn('Background status update failed:', err));
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['No', 'Instansi', 'No Surat', 'Tanggal', 'Perihal', 'Status', 'Catatan Tindak Lanjut', 'PIC', 'Diperbarui Oleh'];
    const rows = filteredLetters.map((l, i) => [
      i + 1,
      `"${l.instansiName}"`,
      `"${l.noSurat}"`,
      l.tanggalSurat || '-',
      `"${l.perihal}"`,
      l.status,
      `"${l.catatanTindakLanjut || '-'}"`,
      `"${l.picInstansi || '-'}"`,
      `"${l.updatedBy || '-'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_Surat_Instansi_${activeProjectName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Status Badge Helper
  const renderStatusPill = (status: AgencyLetterStatus, interactive = false, onSelect?: (s: AgencyLetterStatus) => void) => {
    const configs = {
      SUDAH_MASUK: {
        label: 'Sudah Masuk',
        color: 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25',
        icon: Mail
      },
      ON_PROGRESS: {
        label: 'On Progress',
        color: 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',
        icon: Clock
      },
      TINDAK_LANJUT: {
        label: 'Tindak Lanjut',
        color: 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25',
        icon: AlertCircle
      },
      SELESAI: {
        label: 'Selesai',
        color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25',
        icon: CheckCircle2
      }
    };

    const cfg = configs[status] || configs.SUDAH_MASUK;
    const IconComponent = cfg.icon;

    if (!interactive) {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.color}`}>
          <IconComponent className="w-3 h-3" />
          <span>{cfg.label}</span>
        </span>
      );
    }

    return (
      <select
        value={status}
        disabled={isGuest}
        onChange={(e) => onSelect && onSelect(e.target.value as AgencyLetterStatus)}
        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.color} bg-slate-950 focus:outline-none cursor-pointer disabled:opacity-75`}
      >
        <option value="SUDAH_MASUK" className="bg-slate-900 text-sky-400">Sudah Masuk</option>
        <option value="ON_PROGRESS" className="bg-slate-900 text-amber-400">On Progress</option>
        <option value="TINDAK_LANJUT" className="bg-slate-900 text-rose-400">Tindak Lanjut</option>
        <option value="SELESAI" className="bg-slate-900 text-emerald-400">Selesai</option>
      </select>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans" id="surat_instansi_panel">
      {/* 1. Header Banner & Resume Cards */}
      <div className="glass-card p-6 rounded-3xl border border-sky-500/20 shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Menu 1.5
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-400" />
                Daftar & Monitoring Surat Instansi
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              Pencatatan korespondensi resmi ke instansi vertikal (BPN, Balai Jalan, DLH, Kecamatan, Kepolisian, dll.), upload surat masuk/keluar, lampiran tanda terima, serta status dan catatan tindak lanjut lapangan.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              title="Unduh Rekap CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Ekspor Rekap</span>
            </button>

            {!isGuest && (
              <button
                onClick={handleOpenAdd}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-sky-600/25 cursor-pointer"
                title="Tambah Surat Baru ke Instansi"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Surat Baru</span>
              </button>
            )}
          </div>
        </div>

        {/* Resume KPI Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 pt-2 border-t border-white/5 relative z-10">
          {/* Total */}
          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Total Surat</span>
              <Mail className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-white font-mono">{metrics.total}</div>
            <div className="text-[10px] text-slate-500 font-semibold">{metrics.uniqueAgenciesCount} Instansi Terlibat</div>
          </div>

          {/* Sudah Masuk */}
          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-sky-400">
              <span>Sudah Masuk</span>
              <Send className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-2xl font-black text-sky-300 font-mono">{metrics.sudahMasuk}</div>
            <div className="text-[10px] text-slate-500 font-semibold">Menunggu disposisi</div>
          </div>

          {/* On Progress */}
          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
              <span>On Progress</span>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono">{metrics.onProgress}</div>
            <div className="text-[10px] text-slate-500 font-semibold">Dalam pembahasan/rapat</div>
          </div>

          {/* Tindak Lanjut */}
          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-rose-500/20 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-rose-400">
              <span>Tindak Lanjut</span>
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-2xl font-black text-rose-300 font-mono">{metrics.tindakLanjut}</div>
            <div className="text-[10px] text-rose-400/80 font-semibold">Perlu atensi lapangan</div>
          </div>

          {/* Selesai */}
          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
              <span>Selesai</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-300 font-mono">{metrics.selesai}</div>
            <div className="text-[10px] text-slate-500 font-semibold">Rekomendasi/izin terbit</div>
          </div>
        </div>

        {/* Attention Callout if letters need Follow-Up (Tindak Lanjut) */}
        {metrics.tindakLanjut > 0 && (
          <div className="bg-rose-950/30 border border-rose-500/30 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-rose-200 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>
                Terdapat <strong>{metrics.tindakLanjut} surat instansi</strong> yang membutuhkan tindakan segera (misal: peninjauan lapangan teknis, kelengkapan berkas baru, atau audiensi lanjutan).
              </span>
            </div>
            <button
              onClick={() => setStatusFilter('TINDAK_LANJUT')}
              className="px-3 py-1 bg-rose-600/50 hover:bg-rose-600 text-white rounded-lg font-bold text-[11px] shrink-0 cursor-pointer"
            >
              Lihat Yang Perlu Tindak Lanjut
            </button>
          </div>
        )}
      </div>

      {/* 2. Controls & Search Bar */}
      <div className="glass-card p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari instansi, no. surat, perihal, atau catatan..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Instansi Filter */}
          <select
            value={selectedInstansiFilter}
            onChange={(e) => setSelectedInstansiFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-900/90 border border-white/10 rounded-xl text-xs text-slate-300 font-bold focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="ALL">Semua Instansi</option>
            {uniqueAgencies.map((agency) => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ALL' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('SUDAH_MASUK')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'SUDAH_MASUK' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Masuk
            </button>
            <button
              onClick={() => setStatusFilter('ON_PROGRESS')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ON_PROGRESS' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Proses
            </button>
            <button
              onClick={() => setStatusFilter('TINDAK_LANJUT')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'TINDAK_LANJUT' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tindak Lanjut
            </button>
            <button
              onClick={() => setStatusFilter('SELESAI')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'SELESAI' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Selesai
            </button>
          </div>

          {/* Height Switcher */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setTableHeightMode('compact')}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                tableHeightMode === 'compact' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Ringkas
            </button>
            <button
              onClick={() => setTableHeightMode('normal')}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                tableHeightMode === 'normal' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Standar
            </button>
            <button
              onClick={() => setTableHeightMode('full')}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                tableHeightMode === 'full' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      {/* 3. Table Surat Instansi View */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Horizontal scroll hint bar */}
        <div className="bg-slate-900/80 px-4 py-2.5 border-b border-white/10 flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0"></span>
            <span>
              <strong>Tip Scroll:</strong> {tableHeightMode === 'full' ? 'Tabel ditampilkan penuh (halaman bebas di-scroll ke bawah). Geser ke samping untuk melihat kolom lengkap.' : 'Geser kursor atau touchpad ke samping untuk melihat seluruh kolom status & catatan.'}
            </span>
          </div>
          <span className="font-mono text-sky-400 font-bold shrink-0">{filteredLetters.length} Surat Terdata</span>
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
          <table className="w-full text-left border-collapse min-w-[1150px]">
            <thead className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md border-b border-white/10 text-[10px] font-extrabold text-slate-300 uppercase tracking-wider shadow-sm">
              <tr>
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4 w-64">Instansi Tujuan & PIC</th>
                <th className="py-3.5 px-4 w-52">No. Surat & Tanggal</th>
                <th className="py-3.5 px-4">Perihal Surat</th>
                <th className="py-3.5 px-3 w-36 text-center">Dokumen & Bukti</th>
                <th className="py-3.5 px-3 w-36 text-center">Status</th>
                <th className="py-3.5 px-4 w-64">Catatan Tindak Lanjut</th>
                <th className="py-3.5 px-4 w-28 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-medium">
              {filteredLetters.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400 space-y-3">
                    <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold">Tidak ada data surat yang cocok dengan kriteria filter.</p>
                  </td>
                </tr>
              ) : (
                filteredLetters.map((letter, index) => (
                  <tr 
                    key={letter.id} 
                    className="hover:bg-white/[0.03] transition-colors group"
                  >
                    {/* No */}
                    <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-bold">
                      {index + 1}
                    </td>

                    {/* Instansi & PIC */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div className="font-extrabold text-white text-sm tracking-tight flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          {letter.instansiName}
                        </div>
                        {letter.picInstansi && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
                            <UserCheck className="w-3 h-3 text-slate-500" />
                            <span>PIC: {letter.picInstansi}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* No Surat & Tanggal */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <span className="font-mono font-bold text-slate-200 block text-xs">
                          {letter.noSurat}
                        </span>
                        {letter.tanggalSurat && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {letter.tanggalSurat}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Perihal */}
                    <td className="py-3.5 px-4">
                      <p className="text-slate-200 text-xs leading-relaxed line-clamp-2" title={letter.perihal}>
                        {letter.perihal}
                      </p>
                    </td>

                    {/* Dokumen & Bukti Tanda Terima */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        {letter.suratPdfUrl ? (
                          <button
                            onClick={() => setPreviewModal({
                              isOpen: true,
                              title: `Surat: ${letter.noSurat} (${letter.instansiName})`,
                              pdfUrl: letter.suratPdfUrl
                            })}
                            className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                            title="Buka Berkas PDF Surat"
                          >
                            <FileText className="w-3 h-3" /> Berkas PDF
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Tanpa PDF</span>
                        )}

                        {(letter.docPhotos || []).length > 0 && (
                          <button
                            onClick={() => setPreviewModal({
                              isOpen: true,
                              title: `Dokumentasi / Tanda Terima - ${letter.instansiName}`,
                              photos: letter.docPhotos
                            })}
                            className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                            title="Lihat Foto Dokumentasi / Bukti Tanda Terima"
                          >
                            <ImageIcon className="w-3 h-3" /> {letter.docPhotos?.length} Bukti
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Status (Interactive for Operator) */}
                    <td className="py-3.5 px-3 text-center">
                      {renderStatusPill(
                        letter.status, 
                        !isGuest, 
                        (newSt) => handleQuickStatusChange(letter, newSt)
                      )}
                    </td>

                    {/* Catatan Tindak Lanjut */}
                    <td className="py-3.5 px-4">
                      {letter.catatanTindakLanjut ? (
                        <div className={`p-2.5 rounded-xl border text-[11px] leading-snug space-y-1 ${
                          letter.status === 'TINDAK_LANJUT' 
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' 
                            : 'bg-slate-900/60 border-white/5 text-slate-300'
                        }`}>
                          <div className="flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider text-slate-400">
                            <ClipboardList className="w-3 h-3 text-slate-400" /> Catatan:
                          </div>
                          <p>{letter.catatanTindakLanjut}</p>
                        </div>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">Belum ada catatan</span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!isGuest ? (
                          <>
                            <button
                              onClick={() => handleOpenEdit(letter)}
                              className="p-1.5 bg-sky-600/80 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm"
                              title="Edit Surat / Update Tindak Lanjut"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRequestDelete(letter)}
                              className="p-1.5 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded-lg text-xs transition-all cursor-pointer"
                              title="Hapus Surat"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setPreviewModal({
                                isOpen: true,
                                title: `Surat ${letter.noSurat} - ${letter.instansiName}`,
                                pdfUrl: letter.suratPdfUrl,
                                photos: letter.docPhotos
                              });
                            }}
                            className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs border border-white/10 cursor-pointer"
                            title="Tinjau Detail Surat"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: TAMBAH / EDIT SURAT INSTANSI */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {editingLetter ? 'Edit Surat Instansi' : 'Tambah Surat Instansi Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Proyek {activeProjectName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto flex-1 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}
              {/* Instansi & Suggestion Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                  Instansi Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={formInstansi}
                  onChange={(e) => setFormInstansi(e.target.value)}
                  placeholder="Contoh: BPN / ATR Kantor Pertanahan Pasuruan"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold"
                />
                {/* Quick chip suggestions */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[9px] text-slate-500 self-center">Pilihan Cepat:</span>
                  {COMMON_INSTANSI_SUGGESTIONS.slice(0, 4).map((sugg) => (
                    <button
                      type="button"
                      key={sugg}
                      onClick={() => setFormInstansi(sugg)}
                      className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] cursor-pointer"
                    >
                      {sugg}
                    </button>
                  ))}
                </div>
              </div>

              {/* No Surat & Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                    Nomor Surat *
                  </label>
                  <input
                    type="text"
                    required
                    value={formNoSurat}
                    onChange={(e) => setFormNoSurat(e.target.value)}
                    placeholder="Contoh: 120/VTR/ROW-PLN/III/2026"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                    Tanggal Surat
                  </label>
                  <input
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Perihal */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                  Perihal / Pokok Surat *
                </label>
                <textarea
                  required
                  rows={2}
                  value={formPerihal}
                  onChange={(e) => setFormPerihal(e.target.value)}
                  placeholder="Contoh: Permohonan izin survei penetapan lokasi dan crossing koridor SUTT..."
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                />
              </div>

              {/* PIC Instansi & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                    PIC / Kontak di Instansi
                  </label>
                  <input
                    type="text"
                    value={formPic}
                    onChange={(e) => setFormPic(e.target.value)}
                    placeholder="Contoh: Bpk. Syaiful (Bidang Perizinan)"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                    Status Surat Saat Ini
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AgencyLetterStatus)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold cursor-pointer"
                  >
                    <option value="SUDAH_MASUK">1. Sudah Masuk (Menunggu respons/disposisi)</option>
                    <option value="ON_PROGRESS">2. On Progress (Dalam proses review teknis)</option>
                    <option value="TINDAK_LANJUT">3. Tindak Lanjut (Butuh aksi lanjutan)</option>
                    <option value="SELESAI">4. Selesai (Rekomendasi/Izin terbit)</option>
                  </select>
                </div>
              </div>

              {/* Catatan Tindak Lanjut (Isian manual yang diminta user) */}
              <div className="space-y-1.5 bg-slate-900/50 p-3.5 rounded-2xl border border-white/5">
                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 block">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  Catatan Tindak Lanjut (Isian Manual)
                </label>
                <textarea
                  rows={2}
                  value={formTindakLanjut}
                  onChange={(e) => setFormTindakLanjut(e.target.value)}
                  placeholder="Contoh: Harus turun lapangan bersama tim teknis Balai Jalan pada tgl 22, atau perlu memasukkan surat revisi penetapan..."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-400">
                  Tuliskan instruksi langkah berikutnya agar seluruh tim operasional dan pimpinan mengetahui tindak lanjut yang harus dilakukan.
                </p>
              </div>

              {/* Upload PDF Surat */}
              <div className="space-y-2 bg-slate-900/40 p-3.5 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-sky-400" />
                    Berkas Surat (PDF)
                  </span>
                  {formPdfUrl && (
                    <span className="text-[10px] font-mono text-emerald-400">Berkas Siap</span>
                  )}
                </div>

                {formPdfUrl ? (
                  <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-sky-500/20">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">
                        {formPdfName || 'Dokumen_Surat.pdf'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPdfUrl(undefined);
                        setFormPdfName(undefined);
                      }}
                      className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-white/10 hover:border-sky-500/50 rounded-xl p-3.5 flex items-center justify-center gap-2 text-center cursor-pointer transition-all bg-white/[0.01]">
                    <UploadCloud className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-white">Unggah PDF Surat</span>
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPdf(f);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Upload Foto Dokumentasi / Bukti Tanda Terima */}
              <div className="space-y-2 bg-slate-900/40 p-3.5 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-purple-400" />
                    Bukti Tanda Terima / Dokumentasi Foto (Cap Basah, Ekspedisi, Pertemuan)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {formDocPhotos.length} Foto
                  </span>
                </div>

                {formDocPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {formDocPhotos.map((photo, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-white/10 aspect-video bg-slate-950">
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const cp = [...formDocPhotos];
                            cp.splice(i, 1);
                            setFormDocPhotos(cp);
                          }}
                          className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <label className="border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-xl p-3 flex items-center justify-center gap-2 text-center cursor-pointer transition-all bg-white/[0.01]">
                  <UploadCloud className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white">Tambah Foto Tanda Terima / Dokumentasi</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadPhoto(f);
                    }}
                  />
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Surat'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PREVIEW MODAL */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900">
              <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
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
                      <img src={photo} alt={`Bukti ${i + 1}`} className="w-full h-auto object-contain max-h-[60vh] mx-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-xs">Tidak ada lampiran berkas yang dapat ditampilkan.</p>
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

      {/* 6. MODAL KONFIRMASI HAPUS SURAT (In-App Dialog, Tanpa window.confirm) */}
      {letterToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLetterToDelete(null);
          }}
        >
          <div className="glass-card rounded-3xl w-full max-w-md border border-rose-500/30 shadow-2xl p-6 space-y-4 bg-slate-900 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/20 rounded-2xl border border-rose-500/30">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Hapus Surat Instansi?</h3>
                <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/10 text-xs space-y-1.5">
              <div className="text-slate-400">Instansi: <strong className="text-white">{letterToDelete.instansiName}</strong></div>
              <div className="text-slate-400">Nomor Surat: <strong className="text-white">{letterToDelete.noSurat}</strong></div>
              <div className="text-slate-400">Perihal: <span className="text-slate-200">{letterToDelete.perihal}</span></div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Surat ini akan segera dihapus permanen dari antarmuka, cache lokal, dan basis data cloud.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setLetterToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-600/30 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Ya, Hapus Surat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. NOTIFIKASI TOAST / FEEDBACK AKSI */}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 z-50 animate-fadeIn">
          <div className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-2.5 text-xs font-bold ${
            actionFeedback.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' 
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          }`}>
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
