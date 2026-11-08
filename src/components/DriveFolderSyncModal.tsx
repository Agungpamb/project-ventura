import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderSync,
  FolderPlus,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  ExternalLink,
  Search,
  ShieldCheck,
  FolderOpen,
  ArrowRight,
  Sparkles,
  Check,
  FileWarning,
  GitMerge,
  CheckSquare,
  Square,
  KeyRound
} from 'lucide-react';
import { type LandRecord } from '../types';
import {
  auditProjectDriveFolders,
  executeUnifiedDriveFolderWorkflow,
  buildSanitizedParcelFolderName,
  extractDriveFolderId,
  type ParcelFolderAuditItem,
  type ParcelFolderAuditStatus
} from '../lib/googleApi';

interface DriveFolderSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: LandRecord[];
  activeProjectName: string;
  uploadsFolderId: string;
  accessToken: string | null;
  initialDesa?: string;
  initialSpan?: string;
  onRequestGoogleAuth?: () => Promise<string | null>;
  onSaveUpdatedRecords: (newRecords: LandRecord[], logSummary: string) => Promise<void>;
}

export default function DriveFolderSyncModal({
  isOpen,
  onClose,
  records,
  activeProjectName,
  uploadsFolderId,
  accessToken,
  initialDesa = '',
  initialSpan = '',
  onRequestGoogleAuth,
  onSaveUpdatedRecords
}: DriveFolderSyncModalProps) {
  const [selectedDesa, setSelectedDesa] = useState<string>(initialDesa && initialDesa !== '__ALL__' ? initialDesa : 'ALL');
  const [selectedSpan, setSelectedSpan] = useState<string>(initialSpan || 'ALL');
  const [createSubfolders, setCreateSubfolders] = useState<boolean>(true);
  // Default 'ID' because the spreadsheet column DRIVE_FOLDER_ID typically stores the raw Folder ID (e.g. 1h1iZXUpLNP8sGXcjei6Ij3hGb1I5RSJV)
  const [linkFormat, setLinkFormat] = useState<'URL' | 'ID'>('ID');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Audit states
  const [auditItems, setAuditItems] = useState<ParcelFolderAuditItem[] | null>(null);
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'ISSUE_ONLY' | ParcelFolderAuditStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Checkbox selection state (stores recordkey: r.CODE || r.ID_UNIK)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set<string>());

  const getRecordKey = (r: LandRecord): string => {
    return r.CODE || r.ID_UNIK || `${r.DESA}_${r.SPAN}_${r.NOBID}`;
  };

  // Extract unique Desas
  const availableDesas = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.DESA && r.DESA.trim()) set.add(r.DESA.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [records]);

  // Extract unique Spans for selected Desa
  const availableSpans = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (selectedDesa !== 'ALL' && (r.DESA || '').trim().toUpperCase() !== selectedDesa) return;
      if (r.SPAN && r.SPAN.trim()) set.add(r.SPAN.trim().toUpperCase());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [records, selectedDesa]);

  // Filtered records based on selected Desa & Span
  const scopedRecords = useMemo(() => {
    return records.filter(r => {
      if (selectedDesa !== 'ALL' && (r.DESA || '').trim().toUpperCase() !== selectedDesa) return false;
      if (selectedSpan !== 'ALL' && (r.SPAN || '').trim().toUpperCase() !== selectedSpan) return false;
      return true;
    });
  }, [records, selectedDesa, selectedSpan]);

  // Default-select all records in scope when Desa/Span changes
  useEffect(() => {
    const initialSet = new Set<string>();
    scopedRecords.forEach(r => {
      initialSet.add(getRecordKey(r));
    });
    setSelectedCodes(initialSet);
  }, [selectedDesa, selectedSpan, scopedRecords.length]);

  // Build display rows: if auditItems is available, use auditItems; otherwise build pre-audit rows from scopedRecords
  const displayItems: ParcelFolderAuditItem[] = useMemo(() => {
    if (auditItems) return auditItems;
    return scopedRecords.map(r => {
      const rawDb = (r.DRIVE_FOLDER_ID || '').trim();
      const cleanId = rawDb ? extractDriveFolderId(rawDb) : '';
      const expectedFolderName = buildSanitizedParcelFolderName(r);
      return {
        record: r,
        code: getRecordKey(r),
        desa: r.DESA || '-',
        span: r.SPAN || '-',
        nobid: r.NOBID || '-',
        nama: r.NAMA || '-',
        expectedFolderName,
        currentDriveFolderId: cleanId,
        currentDriveFolderName: cleanId ? `ID DB: ${cleanId}` : '(Belum Ada ID Folder di DB)',
        duplicateFolderIds: [],
        duplicateFolderNames: [],
        dbFolderValue: rawDb,
        status: cleanId ? 'SYNCED' : 'MISSING_FOLDER',
        reason: cleanId
          ? 'Sudah ada ID Folder di DB. Klik "1. Cek & Pindai Struktur Drive" atau langsung "2. Proses Batch Terpilih" untuk memverifikasi nama & duplikat.'
          : 'Belum ada ID Folder di DB. Siap dicek struktur Desa/Span & dibuatkan otomatis.'
      };
    });
  }, [auditItems, scopedRecords]);

  // Count how many records in scope already have DRIVE_FOLDER_ID vs empty
  const scopeStats = useMemo(() => {
    let filledCount = 0;
    let emptyCount = 0;
    scopedRecords.forEach(r => {
      if ((r.DRIVE_FOLDER_ID || '').trim() !== '') {
        filledCount++;
      } else {
        emptyCount++;
      }
    });
    return {
      total: scopedRecords.length,
      filledCount,
      emptyCount
    };
  }, [scopedRecords]);

  // Summary counts for Audit results
  const auditSummary = useMemo(() => {
    const source = auditItems || displayItems;
    const counts = {
      total: source.length,
      SYNCED: 0,
      NAME_MISMATCH: 0,
      DUPLICATE_FOLDERS: 0,
      MISSING_DB_LINK: 0,
      MISSING_FOLDER: 0,
      BROKEN_LINK: 0,
      issueTotal: 0
    };
    source.forEach(item => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      if (item.status !== 'SYNCED') {
        counts.issueTotal++;
      }
    });
    return counts;
  }, [auditItems, displayItems]);

  const filteredDisplayItems = useMemo(() => {
    return displayItems.filter(item => {
      if (auditFilter === 'ISSUE_ONLY') {
        if (item.status === 'SYNCED') return false;
      } else if (auditFilter !== 'ALL') {
        if (item.status !== auditFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.expectedFolderName.toLowerCase().includes(q) ||
          item.currentDriveFolderName.toLowerCase().includes(q) ||
          item.nama.toLowerCase().includes(q) ||
          item.nobid.toLowerCase().includes(q) ||
          item.desa.toLowerCase().includes(q) ||
          item.span.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [displayItems, auditFilter, searchQuery]);

  if (!isOpen) return null;

  const toggleRowSelection = (item: ParcelFolderAuditItem) => {
    const key = getRecordKey(item.record);
    setSelectedCodes(prev => {
      const next = new Set<string>(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedCodes(prev => {
      const next = new Set<string>(prev);
      filteredDisplayItems.forEach(item => {
        next.add(getRecordKey(item.record));
      });
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedCodes(prev => {
      const next = new Set<string>(prev);
      filteredDisplayItems.forEach(item => {
        next.delete(getRecordKey(item.record));
      });
      return next;
    });
  };

  const handleSelectActionableOnly = () => {
    const next = new Set<string>();
    displayItems.forEach(item => {
      if (item.status !== 'SYNCED') {
        next.add(getRecordKey(item.record));
      }
    });
    setSelectedCodes(next);
  };

  const handleSelectEmptyDbOnly = () => {
    const next = new Set<string>();
    scopedRecords.forEach(r => {
      if (!(r.DRIVE_FOLDER_ID || '').trim()) {
        next.add(getRecordKey(r));
      }
    });
    setSelectedCodes(next);
  };

  const allFilteredSelected =
    filteredDisplayItems.length > 0 &&
    filteredDisplayItems.every(item => selectedCodes.has(getRecordKey(item.record)));

  const ensureValidGoogleToken = async (forceRefresh = false): Promise<string | null> => {
    let validToken = forceRefresh ? null : accessToken;
    if (!validToken || validToken === 'GUEST_BYPASS' || validToken === 'IFRAME_OPERATOR_BYPASS' || validToken === 'null') {
      if (onRequestGoogleAuth) {
        validToken = await onRequestGoogleAuth();
      }
    }
    if (!validToken || validToken === 'GUEST_BYPASS' || validToken === 'IFRAME_OPERATOR_BYPASS' || validToken === 'null') {
      setFeedback({
        type: 'error',
        message: 'Fitur ini memerlukan koneksi Google Drive aktif. Pastikan Anda membuka aplikasi di tab browser utama dan login menggunakan akun Google Admin.'
      });
      return null;
    }
    return validToken;
  };

  // Step 1 Button: Scan & Audit folders in Google Drive vs Database
  const handleRunFolderAudit = async (customToken?: string) => {
    setFeedback(null);
    if (scopedRecords.length === 0) {
      setFeedback({
        type: 'warning',
        message: 'Tidak ada data bidang pada cakupan filter Desa/Span yang dipilih.'
      });
      return;
    }

    const token = customToken || (await ensureValidGoogleToken());
    if (!token) return;

    setIsProcessing(true);
    setProgressInfo({
      current: 0,
      total: scopedRecords.length,
      message: 'Mengecek ID Folder di DB, memindai struktur Desa/Span, & mendeteksi duplikat...'
    });

    try {
      const results = await auditProjectDriveFolders(token, uploadsFolderId, scopedRecords, (current, total, message) => {
        setProgressInfo({ current, total, message });
      });
      setAuditItems(results);

      const mismatchCount = results.filter(r => r.status === 'NAME_MISMATCH').length;
      const duplicateCount = results.filter(r => r.status === 'DUPLICATE_FOLDERS').length;
      const missingLinkCount = results.filter(r => r.status === 'MISSING_DB_LINK').length;
      const missingFolderCount = results.filter(r => r.status === 'MISSING_FOLDER').length;
      const brokenLinkCount = results.filter(r => r.status === 'BROKEN_LINK').length;
      const totalIssues = mismatchCount + duplicateCount + missingLinkCount + missingFolderCount + brokenLinkCount;

      if (totalIssues === 0) {
        setAuditFilter('ALL');
        setFeedback({
          type: 'success',
          message: `Pemeriksaan selesai! Seluruh ${results.length} folder bidang pada cakupan ini sudah 100% sinkron dengan format <DESA>_<SPAN>_<NOBID>_<NAMA> dan tidak ada duplikat.`
        });
      } else {
        setAuditFilter('ALL');
        // Auto-check all items that need action so Admin can immediately click "Proses Batch"
        const actionableSet = new Set<string>();
        results.forEach(item => {
          if (item.status !== 'SYNCED') {
            actionableSet.add(getRecordKey(item.record));
          }
        });
        if (actionableSet.size > 0) {
          setSelectedCodes(actionableSet);
        }

        setFeedback({
          type: brokenLinkCount > 0 ? 'error' : 'warning',
          message: `Hasil Pindai (${results.length} bidang): ${mismatchCount} nama tidak pas, ${duplicateCount} folder duplikat (siap digabung), ${missingLinkCount} folder sudah ada tapi belum masuk DB, ${missingFolderCount} belum ada folder, dan ${brokenLinkCount} ID tidak terbaca/terhapus. (${actionableSet.size} bidang otomatis dicentang, siap diproses batch).`
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Gagal melakukan pemeriksaan folder di Google Drive.'
      });
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  // Step 2 Button: Execute Unified 4-Stage Workflow on Checked/Selected Records (or single record)
  const handleExecuteWorkflowBatch = async (overrideTargetCodes?: Set<string>) => {
    const targetCodes = overrideTargetCodes || selectedCodes;
    if (targetCodes.size === 0) {
      setFeedback({
        type: 'warning',
        message: 'Pilih / centang minimal 1 bidang pada tabel terlebih dahulu untuk diproses.'
      });
      return;
    }

    setFeedback(null);
    const token = await ensureValidGoogleToken();
    if (!token) return;

    setIsProcessing(true);
    setProgressInfo({
      current: 0,
      total: targetCodes.size,
      message: 'Menjalankan workflow otomatis (Cek ID -> Rename Nama -> Gabung Duplikat -> Buat dari 0)...'
    });

    try {
      const result = await executeUnifiedDriveFolderWorkflow(token, uploadsFolderId, records, targetCodes, {
        createSubfolders,
        linkFormat,
        auditCache: auditItems,
        onProgress: (current, total, message) => {
          setProgressInfo({ current, total, message });
        }
      });

      setProgressInfo({
        current: targetCodes.size,
        total: targetCodes.size,
        message: 'Menyimpan ID/Link folder terbaru ke Google Spreadsheet & Cloud Firestore...'
      });

      const summaryLog = `[Admin Workflow Folder] Diproses ${targetCodes.size} bidang: ${result.renamedCount} di-rename, ${result.mergedFolderCount} folder duplikat digabung, ${result.linkedExistingCount} folder lama ditautkan, ${result.createdFromZeroCount} dibuat dari 0.`;

      await onSaveUpdatedRecords(result.updatedRecords, summaryLog);

      // Refresh audit table on current scope
      const scopedSet = new Set<string>(scopedRecords.map(r => getRecordKey(r)));
      const updatedScoped = result.updatedRecords.filter(r => scopedSet.has(getRecordKey(r)));
      const refreshedAudit = await auditProjectDriveFolders(token, uploadsFolderId, updatedScoped);
      setAuditItems(refreshedAudit);

      setFeedback({
        type: 'success',
        message: `Workflow Batch Selesai! Dari ${targetCodes.size} bidang terpilih: ${result.verifiedSyncedCount} sudah pas, ${result.renamedCount} folder di-edit namanya sesuai DESA_SPAN_NOBID_NAMA, ${result.mergedFolderCount} folder duplikat digabungkan, ${result.linkedExistingCount} folder yang sudah ada ditautkan ke DB, dan ${result.createdFromZeroCount} folder dibuat baru dari 0${result.failedCount > 0 ? ` (${result.failedCount} gagal)` : ''}.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Gagal menjalankan pemrosesan batch folder di Google Drive.'
      });
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  // Refresh Google OAuth token with full Drive scope if existing folders showed BROKEN_LINK
  const handleRefreshFullDriveScope = async () => {
    if (!onRequestGoogleAuth) return;
    setFeedback(null);
    const freshToken = await onRequestGoogleAuth();
    if (freshToken) {
      await handleRunFolderAudit(freshToken);
    }
  };

  const renderStatusBadge = (item: ParcelFolderAuditItem) => {
    if (!auditItems) {
      const hasId = Boolean((item.record.DRIVE_FOLDER_ID || '').trim());
      return hasId ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" /> Ada ID di DB
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <FolderPlus className="w-3 h-3" /> Kosong di DB
        </span>
      );
    }

    switch (item.status) {
      case 'SYNCED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Sinkron
          </span>
        );
      case 'NAME_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3 h-3" /> Nama Tidak Pas
          </span>
        );
      case 'DUPLICATE_FOLDERS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-purple-500/25 text-purple-200 border border-purple-400/50">
            <GitMerge className="w-3 h-3" /> Duplikat ({item.duplicateFolderIds.length + 1} Folder)
          </span>
        );
      case 'MISSING_DB_LINK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
            <FolderOpen className="w-3 h-3" /> Ada di Drive (DB Kosong)
          </span>
        );
      case 'MISSING_FOLDER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-white/15">
            <FolderPlus className="w-3 h-3" /> Buat dari 0
          </span>
        );
      case 'BROKEN_LINK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <FileWarning className="w-3 h-3" /> ID Tidak Terbaca / Terhapus
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
        {/* Top Modal Header */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-white/10 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FolderSync className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-md flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> WORKFLOW OTOMATISASI DRIVE ADMIN
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold truncate">
                  {activeProjectName}
                </span>
              </div>
              <h2 className="text-base md:text-lg font-black text-white tracking-tight mt-0.5">
                Cek ID Folder DB, Komparasi & Rename Nama, Gabung Duplikat, & Buat Folder Baru (Batch)
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Alur Kerja 4 Tahap sesuai instruksi user */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-950/90 border border-amber-500/20 rounded-2xl p-3 text-[11px]">
            <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-[10px]">1</span>
              <div>
                <div className="font-black text-amber-300 uppercase">Cek ID Folder di DB</div>
                <p className="text-slate-400 text-[10px] leading-snug mt-0.5">
                  Periksa apakah kolom <code className="text-white">DRIVE_FOLDER_ID</code> sudah terisi & cek struktur foldernya di Drive.
                </p>
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-[10px]">2</span>
              <div>
                <div className="font-black text-amber-300 uppercase">Komparasi & Edit Nama</div>
                <p className="text-slate-400 text-[10px] leading-snug mt-0.5">
                  Bandingkan dengan <code className="text-emerald-300">DESA_SPAN_NOBID_NAMA</code>. Jika tidak pas, otomatis di-rename.
                </p>
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-400 text-slate-950 font-black flex items-center justify-center shrink-0 text-[10px]">3</span>
              <div>
                <div className="font-black text-purple-300 uppercase">Gabungkan Duplikat</div>
                <p className="text-slate-400 text-[10px] leading-snug mt-0.5">
                  Jika di dalam jalur ada folder Desa, Span, atau Bidang bernama sama/ganda, isinya otomatis digabung jadi satu.
                </p>
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-400 text-slate-950 font-black flex items-center justify-center shrink-0 text-[10px]">4</span>
              <div>
                <div className="font-black text-emerald-300 uppercase">Buat dari 0 (Bila Kosong)</div>
                <p className="text-slate-400 text-[10px] leading-snug mt-0.5">
                  Jika belum ada ID Folder, cek dulu struktur Desa & Span yang ada (gabung bila sudah ada), lalu buat folder & isi ke DB.
                </p>
              </div>
            </div>
          </div>

          {/* 1. Scope & Settings Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-950/60 border border-white/10 rounded-2xl p-4">
            {/* Filter Cakupan Desa & Span */}
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4" /> Pilih Cakupan Desa & Span
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Filter Desa</label>
                  <select
                    value={selectedDesa}
                    disabled={isProcessing}
                    onChange={(e) => {
                      setSelectedDesa(e.target.value);
                      setSelectedSpan('ALL');
                      setAuditItems(null);
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">Semua Desa ({availableDesas.length} Desa)</option>
                    {availableDesas.map(desa => (
                      <option key={desa} value={desa}>{desa}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Filter Span</label>
                  <select
                    value={selectedSpan}
                    disabled={isProcessing}
                    onChange={(e) => {
                      setSelectedSpan(e.target.value);
                      setAuditItems(null);
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">Semua Span ({availableSpans.length} Span)</option>
                    {availableSpans.map(span => (
                      <option key={span} value={span}>{span}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Opsi Subfolder & Format Link */}
              <div className="pt-2 space-y-2 border-t border-white/10">
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createSubfolders}
                    disabled={isProcessing}
                    onChange={(e) => setCreateSubfolders(e.target.checked)}
                    className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Pastikan ada <strong>4 Subfolder Standar</strong> di dalam tiap folder bidang</span>
                </label>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                  <span className="text-slate-400 font-semibold">Format Simpan ke DB:</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="drive_link_format"
                      checked={linkFormat === 'ID'}
                      disabled={isProcessing}
                      onChange={() => setLinkFormat('ID')}
                    />
                    <span>ID Folder Saja (<code className="text-emerald-300">1h1iZXUp...</code>)</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="drive_link_format"
                      checked={linkFormat === 'URL'}
                      disabled={isProcessing}
                      onChange={() => setLinkFormat('URL')}
                    />
                    <span>Link Lengkap (<code className="text-amber-300">https://drive...</code>)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Statistik Cakupan & 2 Tombol Utama */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-3 border-t lg:border-t-0 lg:border-l border-white/10 pt-3 lg:pt-0 lg:pl-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Cakupan</span>
                  <span className="text-lg font-black text-white">{scopeStats.total}</span>
                  <span className="text-[10px] text-slate-400 block">Bidang di filter</span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block">Sudah Ada ID DB</span>
                  <span className="text-lg font-black text-emerald-300">{scopeStats.filledCount}</span>
                  <span className="text-[10px] text-emerald-400/80 block">Cek Nama & Duplikat</span>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase block">Belum Ada ID DB</span>
                  <span className="text-lg font-black text-amber-300">{scopeStats.emptyCount}</span>
                  <span className="text-[10px] text-amber-300/80 block">Gabung / Buat dari 0</span>
                </div>
                <div className="bg-sky-500/15 border border-sky-500/35 rounded-xl p-2.5">
                  <span className="text-[10px] font-bold text-sky-300 uppercase block">Dicentang (Batch)</span>
                  <span className="text-lg font-black text-white">{selectedCodes.size}</span>
                  <span className="text-[10px] text-sky-300/90 block">Siap dieksekusi</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Tombol 1: Cek & Pindai Struktur Drive */}
                <button
                  type="button"
                  disabled={isProcessing || scopeStats.total === 0}
                  onClick={() => handleRunFolderAudit()}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 disabled:opacity-50 text-emerald-300 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span>1. Cek & Pindai Struktur Drive ({scopeStats.total} Bidang)</span>
                </button>

                {/* Tombol 2: Eksekusi Batch Terpilih (Menjalankan 4 Tahap Workflow) */}
                <button
                  type="button"
                  disabled={isProcessing || selectedCodes.size === 0}
                  onClick={() => handleExecuteWorkflowBatch()}
                  className="px-4 py-3 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>2. Proses Batch Terpilih ({selectedCodes.size} Dicentang)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Progress Bar when processing */}
          {isProcessing && progressInfo && (
            <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-amber-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  {progressInfo.message}
                </span>
                <span className="text-slate-300 font-mono">
                  {progressInfo.total > 0 ? `${Math.round((progressInfo.current / progressInfo.total) * 100)}%` : ''}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-200"
                  style={{
                    width: `${progressInfo.total > 0 ? Math.min(100, Math.round((progressInfo.current / progressInfo.total) * 100)) : 20}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-4 rounded-2xl border text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : feedback.type === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="leading-relaxed">{feedback.message}</div>
              </div>

              {/* If BROKEN_LINK items exist, offer 1-click Google Drive Full Scope Refresh */}
              {auditSummary.BROKEN_LINK > 0 && onRequestGoogleAuth && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRefreshFullDriveScope}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shrink-0 flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Perbarui Izin Akses Penuh Google Drive</span>
                </button>
              )}
            </div>
          )}

          {/* Tabel Daftar Bidang + Tombol Centang / Pilih Batch */}
          <div className="space-y-3">
            {/* Bar Kontrol Filter Status & Pilihan Centang Cepat */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-2xl border border-white/10">
              {/* Filter Kategori Status */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAuditFilter('ALL')}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    auditFilter === 'ALL'
                      ? 'bg-white text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Semua ({auditSummary.total})
                </button>
                {auditItems && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAuditFilter('ISSUE_ONLY')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        auditFilter === 'ISSUE_ONLY'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-amber-300 hover:bg-slate-800'
                      }`}
                    >
                      Perlu Tindakan ({auditSummary.issueTotal})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditFilter('NAME_MISMATCH')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        auditFilter === 'NAME_MISMATCH'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-amber-300 hover:bg-slate-800'
                      }`}
                    >
                      Nama Tidak Pas ({auditSummary.NAME_MISMATCH})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditFilter('DUPLICATE_FOLDERS')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        auditFilter === 'DUPLICATE_FOLDERS'
                          ? 'bg-purple-400 text-slate-950'
                          : 'bg-slate-900 text-purple-300 hover:bg-slate-800'
                      }`}
                    >
                      Duplikat Folder ({auditSummary.DUPLICATE_FOLDERS})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditFilter('MISSING_DB_LINK')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        auditFilter === 'MISSING_DB_LINK'
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-slate-900 text-sky-300 hover:bg-slate-800'
                      }`}
                    >
                      Belum Masuk DB ({auditSummary.MISSING_DB_LINK})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditFilter('MISSING_FOLDER')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        auditFilter === 'MISSING_FOLDER'
                          ? 'bg-slate-200 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Belum Ada Folder ({auditSummary.MISSING_FOLDER})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditFilter('SYNCED')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        auditFilter === 'SYNCED'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 text-emerald-300 hover:bg-slate-800'
                      }`}
                    >
                      Sudah Sinkron ({auditSummary.SYNCED})
                    </button>
                  </>
                )}
              </div>

              {/* Tombol Centang Cepat & Pencarian */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSelectAllFiltered}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pilih Semua Tampil</span>
                </button>

                {auditItems && auditSummary.issueTotal > 0 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSelectActionableOnly}
                    className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-[11px] font-bold cursor-pointer"
                  >
                    Pilih yang Perlu Tindakan ({auditSummary.issueTotal})
                  </button>
                )}

                {scopeStats.emptyCount > 0 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSelectEmptyDbOnly}
                    className="px-2.5 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 rounded-xl text-[11px] font-bold cursor-pointer"
                  >
                    Pilih yang DB Kosong ({scopeStats.emptyCount})
                  </button>
                )}

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleDeselectAllFiltered}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Batal Pilih</span>
                </button>

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama / nobid..."
                  className="px-3 py-1.5 bg-slate-900 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Tabel Utama dengan Checkbox per Baris */}
            <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-950/50">
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-extrabold sticky top-0 z-10 border-b border-white/10">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          disabled={isProcessing || filteredDisplayItems.length === 0}
                          onChange={() => {
                            if (allFilteredSelected) {
                              handleDeselectAllFiltered();
                            } else {
                              handleSelectAllFiltered();
                            }
                          }}
                          className="rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
                          title="Centang / Batal Centang Semua"
                        />
                      </th>
                      <th className="py-3 px-3">Desa / Span / No</th>
                      <th className="py-3 px-3">Nama Pemilik (DB)</th>
                      <th className="py-3 px-3">Folder di Google Drive / ID di DB</th>
                      <th className="py-3 px-3">Target Standar (DESA_SPAN_NOBID_NAMA)</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right">Aksi Satuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredDisplayItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Tidak ada data bidang pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      filteredDisplayItems.map((item, idx) => {
                        const rowKey = getRecordKey(item.record);
                        const isChecked = selectedCodes.has(rowKey);
                        return (
                          <tr
                            key={`${rowKey}_${idx}`}
                            onClick={() => {
                              if (!isProcessing) toggleRowSelection(item);
                            }}
                            className={`transition-colors cursor-pointer ${
                              isChecked ? 'bg-amber-500/[0.07] hover:bg-amber-500/[0.11]' : 'hover:bg-white/[0.02]'
                            }`}
                          >
                            <td
                              className="py-2.5 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isProcessing}
                                onChange={() => toggleRowSelection(item)}
                                className="rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-200 whitespace-nowrap">
                              <div className="font-bold text-white">{item.desa}</div>
                              <div className="text-slate-400">
                                {item.span} · No. <span className="text-amber-300 font-bold">{item.nobid}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-white">
                              {item.nama}
                            </td>
                            <td
                              className="py-2.5 px-3 font-mono text-[11px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.currentDriveFolderId ? (
                                <div className="space-y-1">
                                  <a
                                    href={`https://drive.google.com/drive/folders/${item.currentDriveFolderId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1.5 hover:underline ${
                                      item.status === 'NAME_MISMATCH'
                                        ? 'text-amber-300 font-bold'
                                        : item.status === 'DUPLICATE_FOLDERS'
                                        ? 'text-purple-300 font-bold'
                                        : 'text-emerald-300'
                                    }`}
                                  >
                                    <span>{item.currentDriveFolderName}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                  {item.duplicateFolderNames && item.duplicateFolderNames.length > 0 && (
                                    <div className="text-[10px] text-purple-300">
                                      + Duplikat: {item.duplicateFolderNames.join(', ')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">{item.currentDriveFolderName}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-300 font-semibold">
                              <div className="flex items-center gap-1.5">
                                <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                                <span>{item.expectedFolderName}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {renderStatusBadge(item)}
                            </td>
                            <td
                              className="py-2.5 px-3 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {auditItems && item.status === 'SYNCED' ? (
                                <span className="text-[11px] text-emerald-400 font-bold inline-flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Sesuai
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => handleExecuteWorkflowBatch(new Set<string>([rowKey]))}
                                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                                >
                                  {item.status === 'NAME_MISMATCH'
                                    ? 'Rename Folder'
                                    : item.status === 'DUPLICATE_FOLDERS'
                                    ? 'Gabung & Sinkron'
                                    : item.status === 'MISSING_DB_LINK'
                                    ? 'Tautkan ke DB'
                                    : 'Proses Workflow'}
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
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/90 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400 shrink-0">
          <div>
            Format Standar Nama Folder Bidang: <code className="text-amber-300 font-mono">&lt;DESA&gt;_&lt;SPAN&gt;_&lt;NOBID&gt;_&lt;NAMA&gt;</code> (Contoh: <code className="text-emerald-300 font-mono">{scopedRecords[0] ? buildSanitizedParcelFolderName(scopedRecords[0]) : 'KEBRAON_T23_LLG1_1_PARTO'}</code>)
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer"
          >
            Tutup Panel
          </button>
        </div>
      </div>
    </div>
  );
}
