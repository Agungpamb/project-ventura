import React, { useState, useMemo, useEffect } from 'react';
import {
  Sprout,
  AlertTriangle,
  CheckCircle2,
  Search,
  GitMerge,
  Edit3,
  Download,
  Briefcase,
  ShieldCheck,
  GitCompare,
  FileText,
  ArrowRight,
  CheckSquare,
  Square,
  RefreshCw,
  Layers
} from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { type LandRecord, type ProjectConfig } from '../types';
import {
  analyzeRecordPlantRepetition,
  consolidateRepeatedPlantsInRecord,
  isSameRecord,
  type ParcelPlantRepetitionReport
} from '../lib/parcelManagement';

interface QCPlantRepetitionPanelProps {
  records: LandRecord[];
  role?: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST' | null;
  activeProjectId?: string;
  activeProjectName?: string;
  projects?: ProjectConfig[];
  onSwitchProject?: (newId: string) => void;
  onNavigateToQC?: () => void;
  onNavigateToSanding?: () => void;
  onNavigateToSandingEsdm?: () => void;
  onNavigateToInput?: (record: LandRecord) => void;
  onUpdateRecord?: (record: LandRecord) => Promise<void>;
  onBatchUpdateRecords?: (newRecords: LandRecord[], logSummary: string) => Promise<void>;
}

export default function QCPlantRepetitionPanel({
  records,
  role,
  activeProjectId,
  activeProjectName = 'JALUR TRANSMISI',
  projects,
  onSwitchProject,
  onNavigateToQC,
  onNavigateToSanding,
  onNavigateToSandingEsdm,
  onNavigateToInput,
  onUpdateRecord,
  onBatchUpdateRecords
}: QCPlantRepetitionPanelProps) {
  const [selectedDesa, setSelectedDesa] = useState<string>('ALL');
  const [selectedSpan, setSelectedSpan] = useState<string>('ALL');
  const [viewFilter, setViewFilter] = useState<'REPETITION_ONLY' | 'WITH_PLANTS' | 'ALL'>('REPETITION_ONLY');
  const [looseMode, setLooseMode] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set<string>());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Reset filters when project changes
  useEffect(() => {
    setSelectedDesa('ALL');
    setSelectedSpan('ALL');
    setSearchQuery('');
    setFeedback(null);
  }, [activeProjectId, activeProjectName]);

  // Unique Desas
  const availableDesas = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.DESA && r.DESA.trim()) set.add(r.DESA.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [records]);

  // Unique Spans for selected Desa
  const availableSpans = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (selectedDesa !== 'ALL' && (r.DESA || '').trim().toUpperCase() !== selectedDesa) return;
      if (r.SPAN && r.SPAN.trim()) set.add(r.SPAN.trim().toUpperCase());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [records, selectedDesa]);

  // Analyze all records in Desa/Span scope
  const allReports: ParcelPlantRepetitionReport[] = useMemo(() => {
    return records
      .filter(r => {
        if (selectedDesa !== 'ALL' && (r.DESA || '').trim().toUpperCase() !== selectedDesa) return false;
        if (selectedSpan !== 'ALL' && (r.SPAN || '').trim().toUpperCase() !== selectedSpan) return false;
        return true;
      })
      .map(r => analyzeRecordPlantRepetition(r, looseMode));
  }, [records, selectedDesa, selectedSpan, looseMode]);

  // Stats
  const stats = useMemo(() => {
    let withPlantsCount = 0;
    let repetitionParcelCount = 0;
    let totalDuplicateSlots = 0;

    allReports.forEach(rep => {
      if (rep.totalPopulatedSlots > 0) withPlantsCount++;
      if (rep.repetitionGroups.length > 0) {
        repetitionParcelCount++;
        totalDuplicateSlots += rep.duplicateSlotCount;
      }
    });

    return {
      totalParcels: allReports.length,
      withPlantsCount,
      repetitionParcelCount,
      totalDuplicateSlots,
      cleanParcelsCount: allReports.length - repetitionParcelCount
    };
  }, [allReports]);

  // Auto-select all parcels with repetition when scope or reports change
  useEffect(() => {
    const next = new Set<string>();
    allReports.forEach(rep => {
      if (rep.repetitionGroups.length > 0) {
        next.add(rep.recordKey);
      }
    });
    setSelectedKeys(next);
  }, [selectedDesa, selectedSpan, looseMode, stats.repetitionParcelCount]);

  // Filtered reports for table display
  const filteredReports = useMemo(() => {
    return allReports.filter(rep => {
      if (viewFilter === 'REPETITION_ONLY' && rep.repetitionGroups.length === 0) return false;
      if (viewFilter === 'WITH_PLANTS' && rep.totalPopulatedSlots === 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const plantMatch = rep.repetitionGroups.some(g => g.displayJenis.toLowerCase().includes(q)) ||
          (rep.record.plants || []).some(p => (p.jenis || '').toLowerCase().includes(q));
        return (
          rep.code.toLowerCase().includes(q) ||
          rep.nama.toLowerCase().includes(q) ||
          rep.desa.toLowerCase().includes(q) ||
          rep.span.toLowerCase().includes(q) ||
          rep.nobid.toLowerCase().includes(q) ||
          plantMatch
        );
      }
      return true;
    });
  }, [allReports, viewFilter, searchQuery]);

  const toggleSelectRow = (recordKey: string) => {
    setSelectedKeys(prev => {
      const next = new Set<string>(prev);
      if (next.has(recordKey)) {
        next.delete(recordKey);
      } else {
        next.add(recordKey);
      }
      return next;
    });
  };

  const handleSelectAllRepetition = () => {
    const next = new Set<string>();
    filteredReports.forEach(rep => {
      if (rep.repetitionGroups.length > 0) {
        next.add(rep.recordKey);
      }
    });
    setSelectedKeys(next);
  };

  const handleDeselectAll = () => {
    setSelectedKeys(new Set<string>());
  };

  // Consolidate single record
  const handleFixSingleRecord = async (report: ParcelPlantRepetitionReport) => {
    if (report.repetitionGroups.length === 0) return;
    setFeedback(null);
    setIsProcessing(true);

    try {
      const { updatedRecord, mergedSlotsCount } = consolidateRepeatedPlantsInRecord(report.record, looseMode);
      const plantNames = report.repetitionGroups.map(g => g.displayJenis).join(', ');
      const logMsg = `[QC Repetisi Tanaman] Menggabungkan ${mergedSlotsCount} slot tanaman duplikat (${plantNames}) pada Bidang No. ${report.nobid} (${report.nama}) di Desa ${report.desa} Span ${report.span}.`;

      if (onBatchUpdateRecords) {
        const nextRecords = records.map(r => (isSameRecord(r, report.record) ? updatedRecord : r));
        await onBatchUpdateRecords(nextRecords, logMsg);
      } else if (onUpdateRecord) {
        await onUpdateRecord(updatedRecord);
      }

      setFeedback({
        type: 'success',
        message: `Berhasil menggabungkan repetisi tanaman (${plantNames}) pada Bidang No. ${report.nobid} (${report.nama}). Jumlah pohon & keterangan otomatis dijumlahkan.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Gagal menggabungkan repetisi tanaman.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Consolidate batch of selected records
  const handleFixBatchSelected = async () => {
    const targetReports = allReports.filter(
      rep => selectedKeys.has(rep.recordKey) && rep.repetitionGroups.length > 0
    );
    if (targetReports.length === 0) {
      setFeedback({
        type: 'warning',
        message: 'Pilih minimal 1 bidang yang memiliki repetisi tanaman untuk digabungkan.'
      });
      return;
    }

    setFeedback(null);
    setIsProcessing(true);

    try {
      let totalMergedSlots = 0;
      let fixedParcelCount = 0;

      const updatedRecords = records.map(r => {
        const matchingReport = targetReports.find(rep => isSameRecord(rep.record, r));
        if (!matchingReport) return r;

        const { updatedRecord, mergedSlotsCount } = consolidateRepeatedPlantsInRecord(r, looseMode);
        if (mergedSlotsCount > 0) {
          totalMergedSlots += mergedSlotsCount;
          fixedParcelCount++;
        }
        return updatedRecord;
      });

      const logSummary = `[QC Batch Repetisi Tanaman] Berhasil menggabungkan ${totalMergedSlots} slot tanaman berulang pada ${fixedParcelCount} bidang lahan.`;

      if (onBatchUpdateRecords) {
        await onBatchUpdateRecords(updatedRecords, logSummary);
      } else if (onUpdateRecord) {
        for (const rep of targetReports) {
          const { updatedRecord } = consolidateRepeatedPlantsInRecord(rep.record, looseMode);
          await onUpdateRecord(updatedRecord);
        }
      }

      setFeedback({
        type: 'success',
        message: `Selesai! ${totalMergedSlots} slot tanaman berulang pada ${fixedParcelCount} bidang berhasil digabungkan (Auto-Sum) dan tersinkron ke Database.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Gagal memproses penggabungan batch repetisi tanaman.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Export QC Plant Repetition report to Excel
  const handleExportExcel = () => {
    const rowsToExport: any[] = [];
    filteredReports.forEach((rep, idx) => {
      if (rep.repetitionGroups.length === 0) {
        rowsToExport.push({
          NO: idx + 1,
          CODE: rep.code,
          DESA: rep.desa,
          SPAN: rep.span,
          NO_BIDANG: rep.nobid,
          NAMA_PEMILIK: rep.nama,
          TOTAL_SLOT_TANAMAN: rep.totalPopulatedSlots,
          STATUS_QC_TANAMAN: 'BERSIH (TIDAK ADA REPETISI)',
          JENIS_TANAMAN_BERULANG: '-',
          DETAIL_SLOT_DUPLIKAT: '-',
          HASIL_GABUNGAN_OTOMATIS: '-'
        });
      } else {
        rep.repetitionGroups.forEach((grp, gIdx) => {
          const detailSlots = grp.occurrences
            .map(
              o =>
                `Tanaman #${o.slotNumber} (${o.rawJenis}: SM=${o.sudah_menghasilkan}, BM=${o.belum_menghasilkan}, K=${o.kecil}, S=${o.sedang}, B=${o.besar}${o.keterangan ? `, Ket: ${o.keterangan}` : ''})`
            )
            .join(' + ');
          const mergedStr = `${grp.mergedPreview.jenis}: Total ${grp.mergedPreview.totalBatang} Btg (SM=${grp.mergedPreview.sudah_menghasilkan}, BM=${grp.mergedPreview.belum_menghasilkan}, K=${grp.mergedPreview.kecil}, S=${grp.mergedPreview.sedang}, B=${grp.mergedPreview.besar})`;

          rowsToExport.push({
            NO: gIdx === 0 ? idx + 1 : '',
            CODE: rep.code,
            DESA: rep.desa,
            SPAN: rep.span,
            NO_BIDANG: rep.nobid,
            NAMA_PEMILIK: rep.nama,
            TOTAL_SLOT_TANAMAN: rep.totalPopulatedSlots,
            STATUS_QC_TANAMAN: `REPETISI (${grp.occurrences.length}x)`,
            JENIS_TANAMAN_BERULANG: grp.displayJenis,
            DETAIL_SLOT_DUPLIKAT: detailSlots,
            HASIL_GABUNGAN_OTOMATIS: mergedStr
          });
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'QC_Repetisi_Tanaman');
    const cleanName = (activeProjectName || 'Jalur').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `QC_Repetisi_Tanaman_${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header Card */}
      <div className="glass-card p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider font-mono">
              MENU 3.3 · QUALITY CONTROL TANAMAN
            </span>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2 mt-1">
            <Sprout className="w-6 h-6 text-emerald-400" />
            QC Repetisi Inputan Tanaman Per Bidang
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Mendeteksi apakah di dalam 1 bidang yang sama terdapat jenis tanaman yang terinput berulang/ganda pada beberapa kolom tanaman (<code className="text-amber-300">TANAMAN_1</code> s.d. <code className="text-amber-300">TANAMAN_30</code>), serta menyediakan fitur penggabungan otomatis (Auto-Sum).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Jalur Selector */}
          {projects && projects.length > 0 && onSwitchProject && (
            <div className="flex items-center gap-2 bg-slate-900 border border-emerald-500/40 px-3 py-1.5 rounded-xl">
              <Briefcase className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider font-mono">JALUR:</span>
              <select
                value={activeProjectId}
                onChange={(e) => onSwitchProject(e.target.value)}
                className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer max-w-[240px] truncate"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id} className="bg-slate-950 text-white font-semibold">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onNavigateToQC && (
            <button
              type="button"
              onClick={onNavigateToQC}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Menu 3: Verifikasi QC</span>
            </button>
          )}

          {onNavigateToSanding && (
            <button
              type="button"
              onClick={onNavigateToSanding}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <GitCompare className="w-4 h-4 text-amber-400" />
              <span>Menu 3.1: Sanding Peta</span>
            </button>
          )}

          {onNavigateToSandingEsdm && (
            <button
              type="button"
              onClick={onNavigateToSandingEsdm}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Menu 3.2: Sanding ESDM</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Bidang Cakupan</span>
            <span className="text-2xl font-black text-white font-mono">{stats.totalParcels}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">{stats.withPlantsCount} bidang memiliki data tanaman</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-800/80 text-slate-300 border border-white/10">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className={`glass-card p-4 rounded-2xl border flex items-center justify-between ${
          stats.repetitionParcelCount > 0
            ? 'bg-amber-500/10 border-amber-500/40'
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div>
            <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider block">Bidang Terdeteksi Repetisi</span>
            <span className={`text-2xl font-black font-mono ${
              stats.repetitionParcelCount > 0 ? 'text-amber-300' : 'text-emerald-300'
            }`}>
              {stats.repetitionParcelCount}
            </span>
            <span className="text-[11px] text-slate-300 block mt-0.5">
              {stats.repetitionParcelCount > 0 ? 'Perlu digabungkan (Auto-Sum)' : '100% Bebas Repetisi'}
            </span>
          </div>
          <div className={`p-3 rounded-2xl border ${
            stats.repetitionParcelCount > 0
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-purple-300 uppercase tracking-wider block">Total Baris Slot Berulang</span>
            <span className="text-2xl font-black text-purple-200 font-mono">{stats.totalDuplicateSlots}</span>
            <span className="text-[11px] text-purple-300/80 block mt-0.5">Slot tanaman ekstra yang dapat diringkas</span>
          </div>
          <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <GitMerge className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-wider block">Bidang Bersih (Unik)</span>
            <span className="text-2xl font-black text-emerald-300 font-mono">{stats.cleanParcelsCount}</span>
            <span className="text-[11px] text-emerald-300/80 block mt-0.5">Tidak ada pengulangan jenis tanaman</span>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : feedback.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
        </div>
      )}

      {/* Filter & Batch Action Bar */}
      <div className="glass-card p-5 rounded-2xl border border-white/10 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Desa Filter */}
          <div className="lg:col-span-3">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Filter Desa</label>
            <select
              value={selectedDesa}
              onChange={(e) => {
                setSelectedDesa(e.target.value);
                setSelectedSpan('ALL');
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Semua Desa ({availableDesas.length} Desa)</option>
              {availableDesas.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Span Filter */}
          <div className="lg:col-span-3">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Filter Span</label>
            <select
              value={selectedSpan}
              onChange={(e) => setSelectedSpan(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/15 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Semua Span ({availableSpans.length} Span)</option>
              {availableSpans.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="lg:col-span-3">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Cari Bidang / Tanaman</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama pemilik, nobid, atau tanaman..."
                className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Batch Merge Button & Export Button */}
          <div className="lg:col-span-3 flex items-center gap-2">
            {role !== 'GUEST' && (
              <button
                type="button"
                disabled={isProcessing || selectedKeys.size === 0 || stats.repetitionParcelCount === 0}
                onClick={handleFixBatchSelected}
                className="flex-1 px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <GitMerge className="w-4 h-4 shrink-0" />
                )}
                <span>Gabung Batch ({selectedKeys.size} Bidang)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-white/10 flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Ekspor Laporan QC Repetisi Tanaman ke Excel"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Sub-bar: View filter tabs + Loose Mode checkbox + Quick selection */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewFilter('REPETITION_ONLY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewFilter === 'REPETITION_ONLY'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 text-amber-300 hover:bg-slate-800'
              }`}
            >
              Ada Repetisi Tanaman ({stats.repetitionParcelCount})
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('WITH_PLANTS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewFilter === 'WITH_PLANTS'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900 text-emerald-300 hover:bg-slate-800'
              }`}
            >
              Semua Bidang Bertanaman ({stats.withPlantsCount})
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewFilter === 'ALL'
                  ? 'bg-white text-slate-950'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Semua Bidang ({stats.totalParcels})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={looseMode}
                onChange={(e) => setLooseMode(e.target.checked)}
                className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
              />
              <span>Deteksi juga variasi awalan (contoh: <code className="text-amber-300">POHON JATI</code> = <code className="text-emerald-300">JATI</code>)</span>
            </label>

            {stats.repetitionParcelCount > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllRepetition}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pilih Semua Repetisi</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Batal Pilih</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Results Table */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="max-h-[580px] overflow-auto scrollbar-thin bg-slate-950/80">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 text-[10px] font-extrabold uppercase text-slate-300 tracking-wider">
              <tr>
                <th className="py-3.5 px-3 w-10 text-center">Pilih</th>
                <th className="py-3.5 px-4">Desa / Span / No. Bidang</th>
                <th className="py-3.5 px-4">Nama Pemilik</th>
                <th className="py-3.5 px-4 text-center">Slot Terisi</th>
                <th className="py-3.5 px-4">Rincian Slot Tanaman yang Berulang (Repetisi)</th>
                <th className="py-3.5 px-4">Pratinjau Hasil Penggabungan (Auto-Sum)</th>
                <th className="py-3.5 px-4 text-right">Aksi QC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-6 text-center">
                    <div className="max-w-md mx-auto space-y-2">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                      <p className="text-sm font-bold text-white">
                        {viewFilter === 'REPETITION_ONLY'
                          ? 'Tidak Ditemukan Repetisi Tanaman pada Cakupan Ini!'
                          : 'Tidak ada data bidang yang sesuai filter pencarian.'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {viewFilter === 'REPETITION_ONLY'
                          ? 'Seluruh jenis tanaman pada tiap bidang sudah tercatat unik (1 jenis tanaman = 1 baris slot per bidang).'
                          : 'Silakan ubah kata kunci pencarian atau pilih filter Desa/Span lainnya.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((rep, idx) => {
                  const hasRepetition = rep.repetitionGroups.length > 0;
                  const isChecked = selectedKeys.has(rep.recordKey);

                  return (
                    <tr
                      key={`${rep.recordKey}_${idx}`}
                      className={`transition-colors ${
                        hasRepetition
                          ? isChecked
                            ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.12]'
                            : 'hover:bg-white/[0.03]'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-3 px-3 text-center align-top">
                        {hasRepetition ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isProcessing}
                            onChange={() => toggleSelectRow(rep.recordKey)}
                            className="rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer mt-1"
                          />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500/60 mx-auto mt-1" />
                        )}
                      </td>

                      <td className="py-3 px-4 align-top font-mono">
                        <div className="font-bold text-white">{rep.desa}</div>
                        <div className="text-slate-400 text-[11px]">
                          {rep.span} · No. <span className="text-amber-300 font-bold">{rep.nobid}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{rep.code}</div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-white uppercase">{rep.nama}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Luas: {rep.record.LUAS || '0'} m²
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/10 font-mono font-bold text-slate-200 text-[11px]">
                          {rep.totalPopulatedSlots} / 30 Slot
                        </span>
                        {hasRepetition && (
                          <div className="text-[10px] text-amber-300 font-bold mt-1">
                            -{rep.duplicateSlotCount} Slot Duplikat
                          </div>
                        )}
                      </td>

                      {/* Rincian Slot Berulang */}
                      <td className="py-3 px-4 align-top">
                        {!hasRepetition ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Tidak ada repetisi ({rep.uniquePlantCount} jenis tanaman unik)
                          </span>
                        ) : (
                          <div className="space-y-2.5">
                            {rep.repetitionGroups.map((grp, gIdx) => (
                              <div
                                key={gIdx}
                                className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-black text-amber-300 uppercase text-xs flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    {grp.displayJenis}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 text-[10px] font-black font-mono">
                                    Muncul {grp.occurrences.length}x di Bidang Ini
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {grp.occurrences.map((occ, oIdx) => (
                                    <div
                                      key={oIdx}
                                      className="text-[11px] bg-slate-950/80 px-2.5 py-1 rounded-lg border border-white/5 flex flex-wrap items-center justify-between gap-2 font-mono"
                                    >
                                      <span className="text-slate-300">
                                        <strong className="text-amber-400">Tanaman #{occ.slotNumber}</strong>: &quot;{occ.rawJenis}&quot;
                                      </span>
                                      <span className="text-slate-300">
                                        {[
                                          occ.sudah_menghasilkan > 0 ? `SM:${occ.sudah_menghasilkan}` : '',
                                          occ.belum_menghasilkan > 0 ? `BM:${occ.belum_menghasilkan}` : '',
                                          occ.kecil > 0 ? `K:${occ.kecil}` : '',
                                          occ.sedang > 0 ? `S:${occ.sedang}` : '',
                                          occ.besar > 0 ? `B:${occ.besar}` : ''
                                        ]
                                          .filter(Boolean)
                                          .join(' · ') || '0 Pohon'}
                                        {occ.keterangan ? ` (${occ.keterangan})` : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Pratinjau Hasil Penggabungan */}
                      <td className="py-3 px-4 align-top">
                        {!hasRepetition ? (
                          <span className="text-slate-500 italic text-[11px]">-</span>
                        ) : (
                          <div className="space-y-2.5">
                            {rep.repetitionGroups.map((grp, gIdx) => (
                              <div
                                key={gIdx}
                                className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1 font-mono text-[11px]"
                              >
                                <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                                  <span>{grp.mergedPreview.jenis} (1 Slot Gabungan)</span>
                                </div>
                                <div className="text-slate-200 text-[10px] pl-5">
                                  Total: <strong className="text-white">{grp.mergedPreview.totalBatang} Pohon</strong> (
                                  {[
                                    grp.mergedPreview.sudah_menghasilkan > 0 ? `SM:${grp.mergedPreview.sudah_menghasilkan}` : '',
                                    grp.mergedPreview.belum_menghasilkan > 0 ? `BM:${grp.mergedPreview.belum_menghasilkan}` : '',
                                    grp.mergedPreview.kecil > 0 ? `K:${grp.mergedPreview.kecil}` : '',
                                    grp.mergedPreview.sedang > 0 ? `S:${grp.mergedPreview.sedang}` : '',
                                    grp.mergedPreview.besar > 0 ? `B:${grp.mergedPreview.besar}` : ''
                                  ]
                                    .filter(Boolean)
                                    .join(', ') || '0'}
                                  )
                                </div>
                                {grp.mergedPreview.keterangan && (
                                  <div className="text-[10px] text-amber-200/90 pl-5">
                                    Ket: {grp.mergedPreview.keterangan}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Aksi QC */}
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex flex-col items-end gap-1.5">
                          {hasRepetition && role !== 'GUEST' && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleFixSingleRecord(rep)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                            >
                              <GitMerge className="w-3.5 h-3.5" />
                              <span>Gabungkan Otomatis</span>
                            </button>
                          )}

                          {onNavigateToInput && role !== 'GUEST' && (
                            <button
                              type="button"
                              onClick={() => onNavigateToInput(rep.record)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1 border border-white/10 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3 text-emerald-400" />
                              <span>Edit di Form Input</span>
                            </button>
                          )}
                        </div>
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
  );
}
