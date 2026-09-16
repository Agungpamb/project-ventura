import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, orderBy, limit, onSnapshot, getFirestore 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  Clock, Search, User, FileText, CheckCircle2, AlertTriangle, 
  MapPin, RefreshCw, Calendar, ArrowUpDown, ChevronDown, ListFilter, Trash2,
  ShieldCheck, ShieldAlert, Database, Layers, GitCompare
} from 'lucide-react';
import { type DataIntegrityLog, type ActivityLog } from '../types';
import { getLocalActivityLogs, getLocalIntegrityLogs } from '../lib/activityStorage';

interface ActivityLogsPanelProps {
  activeProjectId: string;
  projects: { id: string; name: string }[];
  latestIntegrityLog?: DataIntegrityLog | null;
  onForceSyncMaster?: () => void;
  onOpenDiffModal?: () => void;
  isSyncingMaster?: boolean;
}

export default function ActivityLogsPanel({ 
  activeProjectId, 
  projects,
  latestIntegrityLog,
  onForceSyncMaster,
  onOpenDiffModal,
  isSyncingMaster = false
}: ActivityLogsPanelProps) {
  const [activeTab, setActiveTab] = useState<'activity' | 'integrity'>('activity');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [integrityLogs, setIntegrityLogs] = useState<DataIntegrityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | 'active' | string>('active');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Real-time subscribe to activity logs and integrity logs with local fallback
  useEffect(() => {
    // 1. Immediately hydrate with local logs so UI shows records without waiting
    const localLogs = getLocalActivityLogs();
    if (localLogs.length > 0) {
      setLogs(localLogs);
      setIsLoading(false);
    }

    const localIntegrity = getLocalIntegrityLogs();
    if (localIntegrity.length > 0) {
      setIntegrityLogs(localIntegrity);
    }

    if (localLogs.length === 0) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const logsRef = collection(db, 'activity_logs');
      // Limit to 250 logs for performance and quota control
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(250));

      const unsubscribeActivity = onSnapshot(q, (snapshot) => {
        const remoteLogs: ActivityLog[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          remoteLogs.push({
            id: doc.id,
            projectId: data.projectId || '',
            projectName: data.projectName || '',
            timestamp: data.timestamp || Date.now(),
            userEmail: data.userEmail || '',
            operatorName: data.operatorName || '',
            userRole: data.userRole || '',
            actionType: data.actionType || 'UPDATE',
            details: data.details || '',
            recordCode: data.recordCode || '',
          });
        });

        // Merge remote logs with local logs
        const currentLocal = getLocalActivityLogs();
        const combined = [...remoteLogs];
        // Add any local logs not yet in remoteLogs
        currentLocal.forEach(loc => {
          if (!combined.some(r => (r.id === loc.id) || (r.recordCode === loc.recordCode && Math.abs(r.timestamp - loc.timestamp) < 5000))) {
            combined.push(loc);
          }
        });
        combined.sort((a, b) => b.timestamp - a.timestamp);

        setLogs(combined);
        setIsLoading(false);
      }, (err) => {
        console.warn("Firestore activity logs warning, using offline/local storage:", err);
        // Fallback to local logs without showing blocker error
        const cached = getLocalActivityLogs();
        setLogs(cached);
        setIsLoading(false);
      });

      // Subscribe to integrity logs
      const integrityRef = collection(db, 'integrity_logs');
      const qIntegrity = query(integrityRef, orderBy('timestamp', 'desc'), limit(100));
      const unsubscribeIntegrity = onSnapshot(qIntegrity, (snapshot) => {
        const loaded: DataIntegrityLog[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loaded.push({
            timestamp: data.timestamp || Date.now(),
            projectId: data.projectId || '',
            spreadsheetCount: data.spreadsheetCount || 0,
            cacheCount: data.cacheCount || 0,
            difference: data.difference || 0,
            status: data.status || 'CONSISTENT',
            message: data.message || ''
          });
        });

        const currentLocalIntegrity = getLocalIntegrityLogs();
        const combinedIntegrity = [...loaded];
        currentLocalIntegrity.forEach(loc => {
          if (!combinedIntegrity.some(r => r.projectId === loc.projectId && Math.abs(r.timestamp - loc.timestamp) < 5000)) {
            combinedIntegrity.push(loc);
          }
        });
        combinedIntegrity.sort((a, b) => b.timestamp - a.timestamp);

        setIntegrityLogs(combinedIntegrity);
      }, (err) => {
        console.warn("Firestore integrity logs warning, using local storage:", err);
        setIntegrityLogs(getLocalIntegrityLogs());
      });

      return () => {
        unsubscribeActivity();
        unsubscribeIntegrity();
      };
    } catch (err: any) {
      console.warn("Error in logs subscription setup, using local logs:", err);
      setLogs(getLocalActivityLogs());
      setIntegrityLogs(getLocalIntegrityLogs());
      setIsLoading(false);
    }
  }, []);

  // Extract unique operator names from logs
  const uniqueOperators = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.operatorName && l.operatorName !== 'unknown') {
        set.add(l.operatorName);
      }
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filter & sort logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        // Project Filter
        if (projectFilter === 'active') {
          if (log.projectId !== activeProjectId) return false;
        } else if (projectFilter !== 'all') {
          if (log.projectId !== projectFilter) return false;
        }

        // Operator Filter
        if (operatorFilter !== 'ALL') {
          if ((log.operatorName || 'unknown') !== operatorFilter) {
            return false;
          }
        }

        // Action Filter
        if (actionFilter !== 'ALL' && log.actionType !== actionFilter) {
          return false;
        }

        // Search Query (filters by user, operator name, code, or details)
        if (searchQuery.trim()) {
          const queryLower = searchQuery.toLowerCase().trim();
          return (
            log.recordCode.toLowerCase().includes(queryLower) ||
            log.userEmail.toLowerCase().includes(queryLower) ||
            (log.operatorName && log.operatorName.toLowerCase().includes(queryLower)) ||
            log.details.toLowerCase().includes(queryLower)
          );
        }

        return true;
      })
      .sort((a, b) => {
        return sortOrder === 'desc' 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      });
  }, [logs, projectFilter, activeProjectId, operatorFilter, actionFilter, searchQuery, sortOrder]);

  // Format date helper
  const formatLogDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return '-';
    }
  };

  // Get Action Badge Style helper
  const getActionBadge = (type: string) => {
    switch (type) {
      case 'CREATE':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          label: 'TAMBAH',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />
        };
      case 'UPLOAD':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          label: 'UPLOAD',
          icon: <FileText className="w-3.5 h-3.5" />
        };
      case 'QC':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          label: 'QC / VERIFIKASI',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />
        };
      case 'ESDM_APPROVAL':
        return {
          bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          label: 'CROSSCHECK ESDM',
          icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        };
      case 'UPDATE':
      default:
        return {
          bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          label: 'EDIT',
          icon: <RefreshCw className="w-3.5 h-3.5" />
        };
    }
  };

  // Get Role Badge Style
  const getRoleBadge = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'ADMIN':
        return 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20';
      case 'FIELD':
        return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20';
      case 'QC':
        return 'bg-amber-500/15 text-amber-300 border border-amber-500/20';
      default:
        return 'bg-slate-500/15 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6" id="activity_logs_panel">
      {/* 1. Header Area & Tab Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight uppercase">
            LOG SISTEM & INTEGRITAS DATA
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Melacak riwayat perubahan data lahan, pengunggahan berkas fisik, serta audit integritas Spreadsheet vs Cache Firestore.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center p-1 bg-white/5 border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Log Aktivitas ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrity')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'integrity'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Log Integritas Data {integrityLogs.some(l => l.status === 'INCONSISTENT') && (
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'integrity' ? (
        /* INTEGRITY LOGS TAB */
        <div className="space-y-6 animate-fadeIn">
          {/* Header Action Banner */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-4 shadow-lg">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-4 h-4" />
                  Audit Integritas Data: Google Sheets (Master) vs Firestore Cache
                </span>
                <p className="text-xs text-slate-300">
                  Sistem otomatis mencatat perbandingan jumlah baris data saat fungsi <code className="text-indigo-300 bg-white/5 px-1.5 py-0.5 rounded font-mono">fetchSpreadsheetRecords</code> dieksekusi.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {onOpenDiffModal && (
                  <button
                    id="open_diff_modal_from_logs_btn"
                    type="button"
                    onClick={onOpenDiffModal}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 border border-indigo-400/30 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <GitCompare className="w-4 h-4" />
                    Bandingkan Cache vs Spreadsheet
                  </button>
                )}

                {onForceSyncMaster && (
                  <button
                    type="button"
                    onClick={onForceSyncMaster}
                    disabled={isSyncingMaster}
                    className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingMaster ? 'animate-spin' : ''}`} />
                    {isSyncingMaster ? 'Sedang Menyinkronkan...' : 'Sinkronkan Paksa dari Master'}
                  </button>
                )}
              </div>
            </div>

            {/* Quick Status Bar */}
            {latestIntegrityLog && (
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                latestIntegrityLog.status === 'CONSISTENT'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
              }`}>
                <div className="flex items-center gap-3">
                  {latestIntegrityLog.status === 'CONSISTENT' ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider block">
                      Status Terkini: {latestIntegrityLog.status === 'CONSISTENT' ? 'Data Konsisten (Sinkron Sempurna)' : 'Data Inkonsisten (Ada Selisih Baris)'}
                    </span>
                    <p className="text-xs text-slate-200 mt-0.5 font-sans">
                      {latestIntegrityLog.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <span className="px-2.5 py-1 rounded bg-white/10 text-white font-bold">
                    Sheet: {latestIntegrityLog.spreadsheetCount}
                  </span>
                  <span className="text-slate-400">vs</span>
                  <span className="px-2.5 py-1 rounded bg-white/10 text-white font-bold">
                    Cache: {latestIntegrityLog.cacheCount}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Integrity Logs Table */}
          {integrityLogs.length === 0 ? (
            <div className="glass-card p-12 rounded-2xl text-center space-y-3 shadow-lg">
              <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-xs font-bold text-slate-300 uppercase">Belum Ada Riwayat Audit Integritas</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Log integritas akan otomatis tercatat setiap kali data diambil dari Google Sheets.
              </p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl shadow-xl overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[380px] scrollbar-thin bg-slate-950/80">
                <table className="w-full border-collapse text-left text-xs text-slate-300">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 shadow-md">
                    <tr className="bg-white/5 border-b border-white/10 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Waktu Audit</th>
                      <th className="py-3 px-4">Jalur Proyek</th>
                      <th className="py-3 px-4">Jumlah di Spreadsheet</th>
                      <th className="py-3 px-4">Jumlah di Cache</th>
                      <th className="py-3 px-4">Selisih</th>
                      <th className="py-3 px-4">Status Integritas</th>
                      <th className="py-3 px-4">Rincian / Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {integrityLogs.map((log, idx) => {
                      const isConsistent = log.status === 'CONSISTENT';
                      const projName = projects.find(p => p.id === log.projectId)?.name || log.projectId;
                      return (
                        <tr key={idx} className="hover:bg-white/2 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-300">
                            {formatLogDate(log.timestamp)}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-200 truncate max-w-[200px]" title={projName}>
                            {projName}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-indigo-300">
                            {log.spreadsheetCount} Baris
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-300">
                            {log.cacheCount} Baris
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold">
                            {log.difference === 0 ? (
                              <span className="text-emerald-400">0</span>
                            ) : log.difference > 0 ? (
                              <span className="text-amber-400">+{log.difference}</span>
                            ) : (
                              <span className="text-rose-400">{log.difference}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                              isConsistent
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                              {isConsistent ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                              {isConsistent ? 'KONSISTEN' : 'INKONSISTEN'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-300 min-w-[250px] leading-relaxed">
                            {log.message}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-white/5 px-5 py-3 border-t border-white/10 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                <span>Total Audit: {integrityLogs.length} Riwayat</span>
                <span>Audit Otomatis Setiap Sinkronisasi Spreadsheet</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ACTIVITY LOGS TAB */
        <div className="space-y-6 animate-fadeIn">
          {/* 2. Filters Grid */}
          <div className="glass-card p-5 rounded-2xl border border-white/10 space-y-4 shadow-lg">
            <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <ListFilter className="w-4 h-4" />
              Filter & Pencarian Log
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search bar */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari CODE, email, detail..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-400"
                />
              </div>

              {/* Project select */}
              <div>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="active">Jalur Aktif Saja</option>
                  <option value="all">Semua Jalur Proyek</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                </select>
              </div>

              {/* Operator Filter */}
              <div>
                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="ALL">Semua Operator ({uniqueOperators.length})</option>
                  {uniqueOperators.map((op) => (
                    <option key={op} value={op}>Operator: {op}</option>
                  ))}
                </select>
              </div>

              {/* Action Filter */}
              <div>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="ALL">Semua Jenis Tindakan</option>
                  <option value="ESDM_APPROVAL">CROSSCHECK / APPROVAL ESDM</option>
                  <option value="CREATE">TAMBAH DATA LAHAN</option>
                  <option value="UPDATE">EDIT DATA LAHAN</option>
                  <option value="UPLOAD">UPLOAD BERKAS PDF</option>
                  <option value="QC">QC / VERIFIKASI</option>
                </select>
              </div>

              {/* Sort Order */}
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4 text-indigo-400" />
                Urutan: {sortOrder === 'desc' ? 'Terbaru' : 'Terlama'}
              </button>
            </div>
          </div>

          {/* 3. Log Output */}
          {isLoading ? (
            <div className="glass-card p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 min-h-[300px]">
              <div className="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-semibold text-slate-300">Menghubungkan ke database log aktivitas...</p>
            </div>
          ) : error ? (
            <div className="glass-card p-8 rounded-2xl flex flex-col items-center justify-center text-center text-rose-300 border-rose-500/20 bg-rose-500/5">
              <AlertTriangle className="w-8 h-8 text-rose-400 mb-2" />
              <p className="text-xs font-bold">{error}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="glass-card p-12 rounded-2xl text-center space-y-3 shadow-lg">
              <Clock className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-xs font-bold text-slate-300 uppercase">Tidak Ada Log Aktivitas Ditemukan</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Belum ada aktivitas terekam yang cocok dengan filter saat ini.
              </p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl shadow-xl overflow-hidden">
              {/* Scrollable Timeline Table view */}
              <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[480px] scrollbar-thin bg-slate-950/80">
                <table className="w-full border-collapse text-left text-xs text-slate-300">
                  <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 shadow-md">
                    <tr className="bg-white/5 border-b border-white/10 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Waktu</th>
                      <th className="py-3 px-4">Pengguna (Role)</th>
                      <th className="py-3 px-4">Tindakan</th>
                      <th className="py-3 px-4">Kode Lahan</th>
                      <th className="py-3 px-4">Rincian Aktivitas</th>
                      {projectFilter === 'all' && <th className="py-3 px-4">Proyek / Jalur</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredLogs.map((log) => {
                      const badge = getActionBadge(log.actionType);
                      return (
                        <tr key={log.id} className="hover:bg-white/2 transition-colors">
                          {/* Timestamp */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-semibold font-mono text-slate-300 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                            {formatLogDate(log.timestamp)}
                          </td>

                          {/* User Email, Operator Name & Role */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <div className="p-1 bg-white/5 rounded-md text-slate-400 shrink-0">
                                  <User className="w-3 h-3" />
                                </div>
                                <span className="font-extrabold text-slate-200 truncate max-w-[180px] block uppercase text-[11px]" title={log.operatorName || log.userEmail}>
                                  {log.operatorName && log.operatorName !== 'unknown' ? log.operatorName : log.userEmail.split('@')[0]}
                                </span>
                              </div>
                              {log.operatorName && log.operatorName !== 'unknown' && (
                                <span className="text-[9px] text-slate-400 font-mono pl-6 truncate max-w-[180px] block" title={log.userEmail}>
                                  {log.userEmail}
                                </span>
                              )}
                              <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-extrabold tracking-wider self-start uppercase mt-1 ${getRoleBadge(log.userRole)}`}>
                                {log.userRole || 'GUEST'}
                              </span>
                            </div>
                          </td>

                          {/* Action Type */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold border px-2 py-0.5 rounded-full uppercase tracking-wider ${badge.bg}`}>
                              {badge.icon}
                              {badge.label}
                            </span>
                          </td>

                          {/* Record Code */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-100 font-mono">
                            {log.recordCode || '-'}
                          </td>

                          {/* Details */}
                          <td className="py-3.5 px-4 text-xs font-semibold text-slate-200 min-w-[280px] max-w-[420px] leading-relaxed">
                            {log.details}
                          </td>

                          {/* Project Name (if in all-project view) */}
                          {projectFilter === 'all' && (
                            <td className="py-3.5 px-4 text-[10px] font-bold text-indigo-300 max-w-[150px] truncate" title={log.projectName}>
                              {log.projectName || '-'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer stats */}
              <div className="bg-white/5 px-5 py-3 border-t border-white/10 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                <span>Total Terekam: {filteredLogs.length} Aktivitas</span>
                <span>Riwayat Sinkron Secara Real-time</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
