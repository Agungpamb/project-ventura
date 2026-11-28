import React, { useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  Link2,
  CheckCircle2,
  Trash2,
  Loader2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { ProjectConfig } from '../types';
import {
  COG_CRS_OVERRIDE_OPTIONS,
  probeCogDriveMetadata,
  resolveEffectiveDriveApiKey,
  type CogLayerMetadata
} from '../lib/cogDriveLayer';
import {
  extractGoogleDriveFileId,
  getAllLocalAerialCogConfigs,
  getLocalCustomDriveApiKey,
  normalizeCogProjectKey,
  saveAerialCogConfigToCloud,
  saveCustomDriveApiKeyToCloud,
  subscribeAllAerialCogConfigs,
  type AerialCogConfig
} from '../lib/aerialCogStorage';

interface AerialCogManagerPanelProps {
  projects: ProjectConfig[];
  activeProjectId: string;
  accessToken?: string;
  userEmail?: string;
}

export default function AerialCogManagerPanel({
  projects,
  activeProjectId,
  accessToken,
  userEmail
}: AerialCogManagerPanelProps) {
  const [targetProjectId, setTargetProjectId] = useState<string>(
    activeProjectId || projects[0]?.id || ''
  );
  const [allConfigs, setAllConfigs] = useState<Record<string, AerialCogConfig>>(() =>
    getAllLocalAerialCogConfigs()
  );
  const [customApiKey, setCustomApiKey] = useState<string>(() => getLocalCustomDriveApiKey());
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getLocalCustomDriveApiKey());
  const [showApiKeySettings, setShowApiKeySettings] = useState<boolean>(false);

  const [driveUrlInput, setDriveUrlInput] = useState<string>('');
  const [epsgInput, setEpsgInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [probeMeta, setProbeMeta] = useState<CogLayerMetadata | null>(null);

  // Keep targetProjectId valid when projects load/change
  useEffect(() => {
    if (!targetProjectId && (activeProjectId || projects[0]?.id)) {
      setTargetProjectId(activeProjectId || projects[0].id);
    }
  }, [activeProjectId, projects, targetProjectId]);

  // Realtime Firestore sync for ALL projects' COG configs + custom API key
  useEffect(() => {
    const unsub = subscribeAllAerialCogConfigs((state) => {
      setAllConfigs(state.byProject);
      setCustomApiKey(state.customDriveApiKey);
      setApiKeyInput(state.customDriveApiKey);
    });
    return () => unsub();
  }, []);

  // Populate inputs when selected jalur changes
  useEffect(() => {
    const key = normalizeCogProjectKey(targetProjectId);
    const existing = allConfigs[key];
    setDriveUrlInput(existing?.driveUrl || '');
    setEpsgInput(existing?.epsgOverride || '');
    setProbeMeta(null);
    setErrorMsg(null);
    setStatusMsg(null);
  }, [targetProjectId, allConfigs]);

  const effectiveKey = resolveEffectiveDriveApiKey(customApiKey);
  const selectedKey = normalizeCogProjectKey(targetProjectId);
  const currentProjectConfig = allConfigs[selectedKey] || null;

  const formatSize = (bytes?: number) => {
    if (!bytes || !Number.isFinite(bytes)) return '';
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const handleSaveLink = async () => {
    if (!targetProjectId) {
      setErrorMsg('Pilih jalur proyek terlebih dahulu.');
      return;
    }
    const trimmed = driveUrlInput.trim();
    if (!trimmed) {
      setErrorMsg('Tempel link Google Drive file Foto Udara (.tif COG) terlebih dahulu.');
      return;
    }
    const fileId = extractGoogleDriveFileId(trimmed);
    if (!fileId) {
      setErrorMsg(
        'Format link Google Drive tidak dikenali. Contoh: https://drive.google.com/file/d/FILE_ID/view?usp=sharing'
      );
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const nextCfg: AerialCogConfig = {
        driveUrl: trimmed,
        fileId,
        enabled: currentProjectConfig ? currentProjectConfig.enabled : true,
        opacity: currentProjectConfig ? currentProjectConfig.opacity : 1,
        epsgOverride: epsgInput,
        updatedAt: Date.now(),
        updatedBy: userEmail || ''
      };
      await saveAerialCogConfigToCloud(targetProjectId, nextCfg);
      const projName = projects.find((p) => p.id === targetProjectId)?.name || targetProjectId;
      setStatusMsg(
        `Link Foto Udara COG untuk jalur "${projName}" berhasil disimpan! Semua akun (termasuk Tamu) otomatis tersinkronisasi.`
      );
    } catch (err: any) {
      setErrorMsg(`Gagal menyimpan link COG: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLink = async (projId: string) => {
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await saveAerialCogConfigToCloud(projId, null);
      if (projId === targetProjectId) {
        setDriveUrlInput('');
        setEpsgInput('');
        setProbeMeta(null);
      }
      setStatusMsg('Link Foto Udara COG untuk jalur tersebut telah dihapus.');
    } catch (err: any) {
      setErrorMsg(`Gagal menghapus link COG: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (projId: string, cfg: AerialCogConfig) => {
    try {
      await saveAerialCogConfigToCloud(projId, {
        ...cfg,
        enabled: !cfg.enabled,
        updatedAt: Date.now(),
        updatedBy: userEmail || cfg.updatedBy || ''
      });
    } catch (err: any) {
      setErrorMsg(`Gagal mengubah status aktif COG: ${err?.message || err}`);
    }
  };

  const handleProbeCog = async (testGuestMode: boolean) => {
    const fileId = extractGoogleDriveFileId(driveUrlInput) || currentProjectConfig?.fileId;
    if (!fileId) {
      setErrorMsg('Tempel link Google Drive atau File ID terlebih dahulu sebelum menguji koneksi.');
      return;
    }

    setIsProbing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setProbeMeta(null);
    try {
      const meta = await probeCogDriveMetadata({
        fileId,
        accessToken: testGuestMode ? undefined : accessToken,
        googleApiKey: customApiKey,
        preferApiKey: testGuestMode,
        epsgOverride: epsgInput
      });
      setProbeMeta(meta);
      setStatusMsg(
        testGuestMode
          ? 'Berhasil! File COG dapat diakses langsung oleh TAMU (Guest) via Google Drive API Key.'
          : 'Berhasil! File COG valid dan siap di-stream via HTTP Range Request.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    } finally {
      setIsProbing(false);
    }
  };

  const handleSaveApiKey = async () => {
    setIsSavingKey(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await saveCustomDriveApiKeyToCloud(apiKeyInput);
      setStatusMsg(
        apiKeyInput.trim()
          ? 'Google Drive API Key khusus untuk akses Tamu berhasil disimpan.'
          : 'Kembali menggunakan Google Cloud / Firebase API Key bawaan proyek.'
      );
    } catch (err: any) {
      setErrorMsg(`Gagal menyimpan API Key: ${err?.message || err}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  // List configured projects matched with project display names
  const configuredEntries = (Object.entries(allConfigs) as Array<[string, AerialCogConfig]>).map(([projKey, cfg]) => {
    const matchedProj = projects.find((p) => normalizeCogProjectKey(p.id) === projKey);
    return {
      projKey,
      projectId: matchedProj?.id || projKey,
      projectName: matchedProj?.name || projKey,
      config: cfg
    };
  });

  return (
    <div className="glass-card p-6 rounded-2xl border border-sky-500/30 shadow-xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2 text-sky-300 text-sm font-bold uppercase tracking-wider">
          <ImageIcon className="w-5 h-5 text-sky-400" />
          Manajemen Foto Udara / Drone (COG Google Drive)
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Akses Tamu Aktif (Opsi A · API Key)
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
            0 MB Kuota Firebase
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Tempel link Google Drive file foto udara berformat <strong className="text-sky-200">COG (.tif WebP / JPEG / UTM)</strong> untuk setiap jalur proyek. File tetap berada di Google Drive dan di-stream per potongan tile (<span className="font-mono text-slate-300">HTTP Range</span>) di menu <strong className="text-white">1.3. Peta Bidang Tanah</strong> — Firestore hanya menyimpan tautannya (~200 byte).
      </p>

      {/* Main Form Card */}
      <div className="p-4 bg-sky-500/10 rounded-2xl border border-sky-500/30 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center border border-sky-500/30 shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-sky-200 uppercase tracking-wide">
                Pasang Link Google Drive Foto Udara (COG) Per Jalur
              </h4>
              <p className="text-[10px] text-slate-400">
                Agar <strong>Tamu (tanpa login Google)</strong> bisa ikut melihat, set izin file di Google Drive ke <em>"Siapa saja yang memiliki link → Pelihat (Viewer)"</em>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400">Untuk Jalur:</span>
            <select
              value={targetProjectId}
              onChange={(e) => setTargetProjectId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-900 border border-white/10 text-sky-300 rounded-lg text-xs font-bold focus:outline-none focus:border-sky-400 max-w-[230px] truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-end">
          <div className="lg:col-span-6">
            <label className="text-[10px] font-bold text-slate-300 block mb-1">
              Link Google Drive File COG (.tif) atau File ID:
            </label>
            <input
              type="text"
              value={driveUrlInput}
              onChange={(e) => setDriveUrlInput(e.target.value)}
              placeholder="https://drive.google.com/file/d/1AbC.../view?usp=sharing"
              className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-sky-200 font-mono focus:outline-none focus:border-sky-400 placeholder:text-slate-600"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="text-[10px] font-bold text-slate-300 block mb-1">
              Proyeksi / Zona UTM COG:
            </label>
            <select
              value={epsgInput}
              onChange={(e) => setEpsgInput(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-sky-400"
            >
              {COG_CRS_OVERRIDE_OPTIONS.map((opt) => (
                <option key={opt.value || 'auto'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveLink}
              disabled={isSaving}
              className="flex-1 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-xl cursor-pointer flex items-center justify-center gap-1.5 shadow-lg transition-all"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Simpan COG</span>
            </button>
            {currentProjectConfig && (
              <button
                type="button"
                onClick={() => handleDeleteLink(targetProjectId)}
                disabled={isSaving}
                className="px-2.5 py-2 bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-500/30 rounded-xl cursor-pointer transition"
                title="Hapus link COG jalur ini"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Test Connection Buttons (Admin OAuth + Guest API Key Mode) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleProbeCog(true)}
            disabled={isProbing || (!driveUrlInput.trim() && !currentProjectConfig?.fileId)}
            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 text-emerald-300 border border-emerald-500/40 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            {isProbing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Uji Akses Tamu (API Key)</span>
          </button>

          <button
            type="button"
            onClick={() => handleProbeCog(false)}
            disabled={isProbing || (!driveUrlInput.trim() && !currentProjectConfig?.fileId)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            {isProbing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>Uji Akses Akun Login</span>
          </button>

          <button
            type="button"
            onClick={() => setShowApiKeySettings((prev) => !prev)}
            className="ml-auto px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>API Key Tamu {customApiKey ? '(Khusus)' : '(Default Proyek)'}</span>
            {showApiKeySettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Optional Custom Google Drive API Key Drawer */}
        {showApiKeySettings && (
          <div className="p-3.5 bg-slate-950/90 border border-amber-500/30 rounded-xl space-y-2.5">
            <div className="text-[11px] text-slate-300 space-y-1">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Pengaturan Google Drive API Key untuk Mode Tamu (Opsional)
              </div>
              <p className="text-[10px] text-slate-400">
                Secara otomatis web app memakai API Key bawaan Google Cloud / Firebase proyek ini (
                <span className="font-mono text-slate-300">
                  {effectiveKey ? `${effectiveKey.slice(0, 8)}••••${effectiveKey.slice(-4)}` : 'Belum diset'}
                </span>
                ). Jika kamu membuat API Key terpisah di Google Cloud Console yang dibatasi khusus untuk <strong>Google Drive API</strong>, tempel di bawah ini (kosongkan untuk kembali ke default):
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Kosongkan untuk pakai default proyek, atau tempel AIzaSy..."
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-amber-200 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={isSavingKey}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-lg cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {isSavingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Simpan API Key</span>
              </button>
            </div>
          </div>
        )}

        {/* Probe Result Metadata Card */}
        {probeMeta && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              ✓ {probeMeta.authMode === 'API_KEY' ? 'MODE TAMU (API KEY) OK' : 'OAUTH DRIVE OK'}
            </span>
            {probeMeta.fileName && (
              <span className="px-2 py-0.5 rounded bg-slate-900 text-white border border-white/10">
                {probeMeta.fileName} {probeMeta.fileSizeBytes ? `(${formatSize(probeMeta.fileSizeBytes)})` : ''}
              </span>
            )}
            <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-500/30">
              {probeMeta.crsLabel}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-white/10">
              {probeMeta.width.toLocaleString('id-ID')} × {probeMeta.height.toLocaleString('id-ID')} px
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-white/10">
              {probeMeta.compressionName} · {probeMeta.overviewCount} Overviews
            </span>
          </div>
        )}

        {/* Status & Error Banners */}
        {statusMsg && !errorMsg && (
          <div className="text-[11px] text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="text-[11px] text-rose-200 bg-rose-950/60 border border-rose-500/40 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Configured Jalur List */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
          Daftar Jalur yang Terhubung Foto Udara COG ({configuredEntries.length})
        </h4>
        {configuredEntries.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 text-center text-xs text-slate-500">
            Belum ada jalur yang terhubung dengan Foto Udara COG. Pilih jalur di atas lalu tempel link Google Drive file <span className="font-mono">.tif</span> COG.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {configuredEntries.map((item) => (
              <div
                key={item.projKey}
                className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">{item.projectName}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        item.config.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.config.enabled ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5" title={item.config.driveUrl}>
                    ID: {item.config.fileId} · CRS: {item.config.epsgOverride || 'Otomatis'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(item.projectId, item.config)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    title={item.config.enabled ? 'Nonaktifkan layer COG' : 'Aktifkan layer COG'}
                  >
                    {item.config.enabled ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetProjectId(item.projectId)}
                    className="px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-[10px] font-bold border border-sky-500/30 transition cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLink(item.projectId)}
                    className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                    title="Hapus link COG"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
