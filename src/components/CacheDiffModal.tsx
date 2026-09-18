import React, { useState, useMemo } from 'react';
import { 
  GitCompare, Database, FileSpreadsheet, AlertTriangle, CheckCircle2, 
  XCircle, Search, RefreshCw, X, ArrowRight, Check, Eye, HelpCircle,
  FileCheck, ShieldAlert, Layers
} from 'lucide-react';
import { type LandRecord } from '../types';

interface CacheDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadsheetRecords: LandRecord[];
  cachedRecords: LandRecord[];
  projectName?: string;
  onApplySpreadsheet: () => void;
  onApplyCache: () => void;
  isApplying?: boolean;
}

export type DiffType = 'ONLY_SPREADSHEET' | 'ONLY_CACHE' | 'DIFFERENT_VALUES' | 'IDENTICAL';

export interface DiffItem {
  id: string;
  key: string;
  diffType: DiffType;
  sheetRecord?: LandRecord;
  cacheRecord?: LandRecord;
  differences: {
    field: string;
    label: string;
    sheetVal: string;
    cacheVal: string;
  }[];
}

function getRecordKey(r: LandRecord, indexFallback: number): string {
  if (r.ID_UNIK && r.ID_UNIK.trim()) return r.ID_UNIK.trim().toUpperCase();
  const desa = (r.DESA || '').trim().toUpperCase();
  const span = (r.SPAN || '').trim().toUpperCase();
  const nobid = (r.NOBID || '').trim().toUpperCase();
  if (desa && span && nobid) return `${desa}__${span}__${nobid}`;
  if (r.CODE && r.CODE.trim()) return r.CODE.trim().toUpperCase();
  if (nobid) return `NOBID__${nobid}`;
  const nama = (r.NAMA || '').trim().toUpperCase();
  if (desa && nama) return `${desa}__${nama}`;
  return `ROW__${indexFallback}`;
}

export default function CacheDiffModal({
  isOpen,
  onClose,
  spreadsheetRecords,
  cachedRecords,
  projectName,
  onApplySpreadsheet,
  onApplyCache,
  isApplying = false
}: CacheDiffModalProps) {
  const [activeTab, setActiveTab] = useState<'ALL_DIFF' | 'ONLY_SHEET' | 'ONLY_CACHE' | 'VALUE_DIFF' | 'IDENTICAL' | 'ALL'>('ALL_DIFF');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemDetail, setSelectedItemDetail] = useState<DiffItem | null>(null);

  // Compare Spreadsheet vs Cache
  const comparisonResults = useMemo(() => {
    const sheetMap = new Map<string, { record: LandRecord; index: number }>();
    spreadsheetRecords.forEach((r, idx) => {
      const key = getRecordKey(r, idx);
      sheetMap.set(key, { record: r, index: idx });
    });

    const cacheMap = new Map<string, { record: LandRecord; index: number }>();
    cachedRecords.forEach((r, idx) => {
      const key = getRecordKey(r, idx);
      cacheMap.set(key, { record: r, index: idx });
    });

    const items: DiffItem[] = [];
    const allKeys = new Set([...sheetMap.keys(), ...cacheMap.keys()]);

    allKeys.forEach(key => {
      const sheetEntry = sheetMap.get(key);
      const cacheEntry = cacheMap.get(key);

      if (sheetEntry && !cacheEntry) {
        items.push({
          id: key,
          key,
          diffType: 'ONLY_SPREADSHEET',
          sheetRecord: sheetEntry.record,
          differences: []
        });
      } else if (!sheetEntry && cacheEntry) {
        items.push({
          id: key,
          key,
          diffType: 'ONLY_CACHE',
          cacheRecord: cacheEntry.record,
          differences: []
        });
      } else if (sheetEntry && cacheEntry) {
        const s = sheetEntry.record;
        const c = cacheEntry.record;
        const diffs: DiffItem['differences'] = [];

        // Check key fields
        if ((s.NAMA || '').trim().toLowerCase() !== (c.NAMA || '').trim().toLowerCase()) {
          diffs.push({ field: 'NAMA', label: 'Nama Pemilik', sheetVal: s.NAMA || '-', cacheVal: c.NAMA || '-' });
        }
        if (Number(s.LUAS || 0) !== Number(c.LUAS || 0)) {
          diffs.push({ field: 'LUAS', label: 'Luas (m²)', sheetVal: `${s.LUAS || 0}`, cacheVal: `${c.LUAS || 0}` });
        }
        if ((s.DESA || '').trim().toLowerCase() !== (c.DESA || '').trim().toLowerCase()) {
          diffs.push({ field: 'DESA', label: 'Desa', sheetVal: s.DESA || '-', cacheVal: c.DESA || '-' });
        }
        if ((s.SPAN || '').trim().toLowerCase() !== (c.SPAN || '').trim().toLowerCase()) {
          diffs.push({ field: 'SPAN', label: 'Span', sheetVal: s.SPAN || '-', cacheVal: c.SPAN || '-' });
        }
        if ((s.NOBID || '').trim().toLowerCase() !== (c.NOBID || '').trim().toLowerCase()) {
          diffs.push({ field: 'NOBID', label: 'No. Bidang', sheetVal: s.NOBID || '-', cacheVal: c.NOBID || '-' });
        }
        if ((s.PROGRES_PEMBERKASAN || '').trim().toLowerCase() !== (c.PROGRES_PEMBERKASAN || '').trim().toLowerCase()) {
          diffs.push({ field: 'PROGRES_PEMBERKASAN', label: 'Pemberkasan', sheetVal: s.PROGRES_PEMBERKASAN || '-', cacheVal: c.PROGRES_PEMBERKASAN || '-' });
        }
        if ((s.STATUS_KEPEMILIKAN || '').trim().toLowerCase() !== (c.STATUS_KEPEMILIKAN || '').trim().toLowerCase()) {
          diffs.push({ field: 'STATUS_KEPEMILIKAN', label: 'Status Hak', sheetVal: s.STATUS_KEPEMILIKAN || '-', cacheVal: c.STATUS_KEPEMILIKAN || '-' });
        }
        const sPlantCount = s.plants ? s.plants.filter(p => p.jenis).length : 0;
        const cPlantCount = c.plants ? c.plants.filter(p => p.jenis).length : 0;
        if (sPlantCount !== cPlantCount) {
          diffs.push({ field: 'plants', label: 'Jumlah Item Tanaman', sheetVal: `${sPlantCount} item`, cacheVal: `${cPlantCount} item` });
        }

        if (diffs.length > 0) {
          items.push({
            id: key,
            key,
            diffType: 'DIFFERENT_VALUES',
            sheetRecord: s,
            cacheRecord: c,
            differences: diffs
          });
        } else {
          items.push({
            id: key,
            key,
            diffType: 'IDENTICAL',
            sheetRecord: s,
            cacheRecord: c,
            differences: []
          });
        }
      }
    });

    return items;
  }, [spreadsheetRecords, cachedRecords]);

  // Counts
  const counts = useMemo(() => {
    let onlySheet = 0;
    let onlyCache = 0;
    let valDiff = 0;
    let identical = 0;

    comparisonResults.forEach(item => {
      if (item.diffType === 'ONLY_SPREADSHEET') onlySheet++;
      else if (item.diffType === 'ONLY_CACHE') onlyCache++;
      else if (item.diffType === 'DIFFERENT_VALUES') valDiff++;
      else if (item.diffType === 'IDENTICAL') identical++;
    });

    return {
      onlySheet,
      onlyCache,
      valDiff,
      identical,
      allDiff: onlySheet + onlyCache + valDiff,
      total: comparisonResults.length
    };
  }, [comparisonResults]);

  // Filtered list
  const filteredResults = useMemo(() => {
    let list = comparisonResults;

    if (activeTab === 'ALL_DIFF') {
      list = list.filter(i => i.diffType !== 'IDENTICAL');
    } else if (activeTab === 'ONLY_SHEET') {
      list = list.filter(i => i.diffType === 'ONLY_SPREADSHEET');
    } else if (activeTab === 'ONLY_CACHE') {
      list = list.filter(i => i.diffType === 'ONLY_CACHE');
    } else if (activeTab === 'VALUE_DIFF') {
      list = list.filter(i => i.diffType === 'DIFFERENT_VALUES');
    } else if (activeTab === 'IDENTICAL') {
      list = list.filter(i => i.diffType === 'IDENTICAL');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => {
        const s = item.sheetRecord;
        const c = item.cacheRecord;
        return (
          (s?.NAMA && s.NAMA.toLowerCase().includes(q)) ||
          (c?.NAMA && c.NAMA.toLowerCase().includes(q)) ||
          (s?.DESA && s.DESA.toLowerCase().includes(q)) ||
          (c?.DESA && c.DESA.toLowerCase().includes(q)) ||
          (s?.SPAN && s.SPAN.toLowerCase().includes(q)) ||
          (c?.SPAN && c.SPAN.toLowerCase().includes(q)) ||
          (s?.NOBID && s.NOBID.toLowerCase().includes(q)) ||
          (c?.NOBID && c.NOBID.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [comparisonResults, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div 
      id="cache_diff_modal_backdrop" 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn"
    >
      <div 
        id="cache_diff_modal_container"
        className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-slate-100 text-sm"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-slate-800/80 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl shrink-0">
              <GitCompare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Komparasi Data: Cache vs Google Spreadsheet (Master)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-slate-300">
                  {projectName || 'Proyek Aktif'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Periksa perbedaan data sebelum mengeksekusi apakah menggunakan data dari Google Spreadsheet atau Cache.
              </p>
            </div>
          </div>

          <button
            id="close_cache_diff_modal_btn"
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* METRICS & QUICK SUMMARY */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          {/* SPREADSHEET COUNT */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Spreadsheet (Master)
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-white mt-1">
              {spreadsheetRecords.length} <span className="text-xs font-normal text-slate-400">baris</span>
            </div>
          </div>

          {/* CACHE COUNT */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Data di Cache
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-white mt-1">
              {cachedRecords.length} <span className="text-xs font-normal text-slate-400">baris</span>
            </div>
          </div>

          {/* INCONSISTENCY / DIFF */}
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Total Perbedaan
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-white mt-1">
              {counts.allDiff} <span className="text-xs font-normal text-slate-400">bidang</span>
            </div>
          </div>

          {/* IDENTICAL */}
          <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl">
            <div className="flex items-center justify-between text-teal-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sama Persis
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-mono font-extrabold text-white mt-1">
              {counts.identical} <span className="text-xs font-normal text-slate-400">bidang</span>
            </div>
          </div>
        </div>

        {/* TABS & SEARCH BAR */}
        <div className="p-3 sm:px-5 border-b border-white/10 bg-slate-900/90 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              id="filter_tab_all_diff"
              type="button"
              onClick={() => setActiveTab('ALL_DIFF')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ALL_DIFF'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Semua Perbedaan
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-[10px] font-mono">
                {counts.allDiff}
              </span>
            </button>

            <button
              id="filter_tab_only_sheet"
              type="button"
              onClick={() => setActiveTab('ONLY_SHEET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ONLY_SHEET'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Hanya di Spreadsheet
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-[10px] font-mono">
                {counts.onlySheet}
              </span>
            </button>

            <button
              id="filter_tab_only_cache"
              type="button"
              onClick={() => setActiveTab('ONLY_CACHE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ONLY_CACHE'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Hanya di Cache
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/30 text-[10px] font-mono">
                {counts.onlyCache}
              </span>
            </button>

            <button
              id="filter_tab_value_diff"
              type="button"
              onClick={() => setActiveTab('VALUE_DIFF')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'VALUE_DIFF'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Beda Nilai
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/30 text-[10px] font-mono">
                {counts.valDiff}
              </span>
            </button>

            <button
              id="filter_tab_all"
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ALL'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Semua Data ({counts.total})
            </button>
          </div>

          <div className="relative shrink-0 w-full md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="cache_diff_search_input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, no bidang, desa..."
              className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* COMPARISON TABLE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredResults.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="font-bold text-sm text-slate-200">Tidak ada data untuk kategori ini</p>
              <p className="text-xs mt-1">Semua data pada filter ini telah sesuai atau tidak ditemukan kecocokan pencarian.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[55vh] scrollbar-thin rounded-xl border border-white/10 bg-slate-950/30">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 shadow-sm">
                  <tr className="bg-white/5 text-[10px] uppercase font-bold text-slate-400 border-b border-white/10">
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3 w-36">Status Komparasi</th>
                    <th className="py-2.5 px-3 w-28">No. Bidang</th>
                    <th className="py-2.5 px-3 w-36">Desa / Span</th>
                    <th className="py-2.5 px-3">Data Google Spreadsheet (Master)</th>
                    <th className="py-2.5 px-3">Data di Cache</th>
                    <th className="py-2.5 px-3 w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredResults.map((item, idx) => {
                    const s = item.sheetRecord;
                    const c = item.cacheRecord;

                    return (
                      <tr 
                        key={item.id}
                        className={`hover:bg-white/[0.03] transition-colors ${
                          item.diffType === 'ONLY_SPREADSHEET' ? 'bg-emerald-500/[0.02]' :
                          item.diffType === 'ONLY_CACHE' ? 'bg-amber-500/[0.02]' :
                          item.diffType === 'DIFFERENT_VALUES' ? 'bg-cyan-500/[0.02]' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center text-slate-500 font-mono">
                          {idx + 1}
                        </td>

                        {/* BADGE STATUS */}
                        <td className="py-3 px-3">
                          {item.diffType === 'ONLY_SPREADSHEET' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <FileSpreadsheet className="w-3 h-3 shrink-0" />
                              Hanya di Sheet
                            </span>
                          )}
                          {item.diffType === 'ONLY_CACHE' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Database className="w-3 h-3 shrink-0" />
                              Hanya di Cache
                            </span>
                          )}
                          {item.diffType === 'DIFFERENT_VALUES' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              <GitCompare className="w-3 h-3 shrink-0" />
                              Beda Nilai ({item.differences.length})
                            </span>
                          )}
                          {item.diffType === 'IDENTICAL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                              <Check className="w-3 h-3 shrink-0" />
                              Sama Persis
                            </span>
                          )}
                        </td>

                        {/* NO BIDANG */}
                        <td className="py-3 px-3 font-mono font-bold text-white">
                          {s?.NOBID || c?.NOBID || s?.CODE || c?.CODE || '-'}
                        </td>

                        {/* DESA / SPAN */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-200">{s?.DESA || c?.DESA || '-'}</div>
                          <div className="text-[10px] font-mono text-amber-300 mt-0.5">Span: {s?.SPAN || c?.SPAN || '-'}</div>
                        </td>

                        {/* SPREADSHEET DATA CELL */}
                        <td className="py-3 px-3">
                          {s ? (
                            <div className="space-y-1">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span className="text-emerald-400 font-mono text-[11px]">[Sheet]</span>
                                {s.NAMA || '-'}
                              </div>
                              <div className="text-[11px] text-slate-300 flex items-center gap-2">
                                <span>Luas: <strong className="font-mono text-white">{s.LUAS || 0} m²</strong></span>
                                <span>• Status: <span className="font-mono text-slate-400">{s.PROGRES_PEMBERKASAN || '-'}</span></span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-xs">Tidak ada di Google Spreadsheet</span>
                          )}
                        </td>

                        {/* CACHE DATA CELL */}
                        <td className="py-3 px-3">
                          {c ? (
                            <div className="space-y-1">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span className="text-amber-400 font-mono text-[11px]">[Cache]</span>
                                {c.NAMA || '-'}
                              </div>
                              <div className="text-[11px] text-slate-300 flex items-center gap-2">
                                <span>Luas: <strong className="font-mono text-white">{c.LUAS || 0} m²</strong></span>
                                <span>• Status: <span className="font-mono text-slate-400">{c.PROGRES_PEMBERKASAN || '-'}</span></span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-xs">Belum ada di Cache</span>
                          )}
                        </td>

                        {/* DETAIL BTN */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedItemDetail(item)}
                            className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all cursor-pointer"
                            title="Lihat Detail Komparasi"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DETAIL POPUP IF SELECTED */}
        {selectedItemDetail && (
          <div className="p-4 border-t border-white/10 bg-slate-950/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                Rincian Perbedaan: {selectedItemDetail.sheetRecord?.NOBID || selectedItemDetail.cacheRecord?.NOBID} - {selectedItemDetail.sheetRecord?.NAMA || selectedItemDetail.cacheRecord?.NAMA}
              </span>
              {selectedItemDetail.differences.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {selectedItemDetail.differences.map((d, i) => (
                    <span key={i} className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[10px]">
                      <strong>{d.label}:</strong> Sheet: <span className="font-mono text-white">{d.sheetVal}</span> vs Cache: <span className="font-mono text-white">{d.cacheVal}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 mt-0.5">
                  {selectedItemDetail.diffType === 'ONLY_SPREADSHEET' && 'Data ini hanya tercatat di Google Spreadsheet (Master), belum ada di cache lokal.'}
                  {selectedItemDetail.diffType === 'ONLY_CACHE' && 'Data ini tersimpan di cache lokal/Firestore, tetapi tidak ditemukan di Google Spreadsheet.'}
                  {selectedItemDetail.diffType === 'IDENTICAL' && 'Seluruh data identik antara Spreadsheet dan Cache.'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedItemDetail(null)}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg cursor-pointer shrink-0"
            >
              Tutup Rincian
            </button>
          </div>
        )}

        {/* ACTION EXECUTION FOOTER */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-slate-950 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            <span className="font-bold text-slate-300">Keputusan Eksekusi Administrator:</span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Pilih sumber data yang ingin Anda terapkan ke aplikasi dan sinkronkan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 justify-end">
            {/* OPTION 1: USE SPREADSHEET (MASTER) */}
            <button
              id="execute_use_spreadsheet_btn"
              type="button"
              onClick={onApplySpreadsheet}
              disabled={isApplying || spreadsheetRecords.length === 0}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isApplying ? 'Sedang Memproses...' : `Gunakan Data Spreadsheet (${spreadsheetRecords.length} Baris)`}
            </button>

            {/* OPTION 2: USE CACHE */}
            <button
              id="execute_use_cache_btn"
              type="button"
              onClick={onApplyCache}
              disabled={isApplying || cachedRecords.length === 0}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 border border-amber-500/40 text-slate-950 font-bold text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              {isApplying ? 'Sedang Memproses...' : `Gunakan Data Cache (${cachedRecords.length} Baris)`}
            </button>

            {/* CANCEL / CLOSE */}
            <button
              id="cancel_cache_diff_btn"
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-white/10 transition-all cursor-pointer"
            >
              Tutup / Nanti Dulu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
