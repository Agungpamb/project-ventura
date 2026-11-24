import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Upload,
  Trash2,
  Compass,
  Building2,
  Save,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Eye
} from 'lucide-react';
import {
  type ProjectConfig,
  type InventoryFormPdfConfig,
  type VendorHeaderPreset,
  type HeaderLayoutMode,
  type CoordinateProjectionId
} from '../types';
import { getVendorPresetDefaults } from '../lib/pdfGenerator';
import {
  COORDINATE_PROJECTION_OPTIONS,
  getCoordinateProjectionOption,
  formatProjectedCoordinate
} from '../lib/geoUtils';
import { isCombinedLlgKebraonDriyorejoProject } from '../lib/projectTitleHelper';

interface ProjectPdfConfigModalProps {
  project: ProjectConfig | null;
  onClose: () => void;
  onSave: (projectId: string, config: InventoryFormPdfConfig) => Promise<void> | void;
}

const PRESET_CARDS: {
  id: VendorHeaderPreset;
  title: string;
  subtitle: string;
  badgeColor: string;
}[] = [
  {
    id: 'SURVEYOR_INDONESIA',
    title: 'PT Surveyor Indonesia',
    subtitle: '3 Logo (Danantara, ID Survey, SI) & Footer PTSI',
    badgeColor: 'text-sky-300 border-sky-500/30 bg-sky-500/10'
  },
  {
    id: 'PLN',
    title: 'PT PLN (Persero)',
    subtitle: 'Kop Teks PLN + Slot Logo Kiri/Kanan & Footer PLN',
    badgeColor: 'text-amber-300 border-amber-500/30 bg-amber-500/10'
  },
  {
    id: 'VENTURA',
    title: 'PT Ventura Skala Simetris',
    subtitle: 'Kop Ventura + Slot Logo & Footer Ventura',
    badgeColor: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
  },
  {
    id: 'CUSTOM',
    title: 'Vendor Lainnya / Custom',
    subtitle: 'Bebas atur logo, nama vendor, judul & footer',
    badgeColor: 'text-purple-300 border-purple-500/30 bg-purple-500/10'
  }
];

async function resizeLogoFileToDataUrl(file: File, maxWidth: number = 280): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let w = img.naturalWidth || img.width || 240;
          let h = img.naturalHeight || img.height || 100;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const maxHeight = 140;
          if (h > maxHeight) {
            w = Math.round((w * maxHeight) / h);
            h = maxHeight;
          }
          canvas.width = Math.max(w, 1);
          canvas.height = Math.max(h, 1);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result || ''));
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export default function ProjectPdfConfigModal({
  project,
  onClose,
  onSave
}: ProjectPdfConfigModalProps) {
  const [config, setConfig] = useState<InventoryFormPdfConfig>(() => ({
    ...getVendorPresetDefaults('SURVEYOR_INDONESIA')
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    const saved = project.inventoryPdfConfig;
    const base = getVendorPresetDefaults(saved?.vendorPreset || 'SURVEYOR_INDONESIA');
    setConfig({
      ...base,
      ...(saved || {})
    });
    setUploadErr(null);
  }, [project]);

  if (!project) return null;

  const handleSelectPreset = (preset: VendorHeaderPreset) => {
    const presetDefaults = getVendorPresetDefaults(preset);
    setConfig(prev => ({
      ...presetDefaults,
      // Preserve projection & any uploaded custom logos when switching presets
      coordinateProjection: prev.coordinateProjection || presetDefaults.coordinateProjection,
      coordinateLabelOverride: prev.coordinateLabelOverride || '',
      headerLeftLogoUrl: preset === 'SURVEYOR_INDONESIA' ? '' : (prev.headerLeftLogoUrl || ''),
      headerCenterLogoUrl: preset === 'SURVEYOR_INDONESIA' ? '' : (prev.headerCenterLogoUrl || ''),
      headerRightLogoUrl: preset === 'SURVEYOR_INDONESIA' ? '' : (prev.headerRightLogoUrl || '')
    }));
  };

  const handleLogoUpload = async (
    field: 'headerLeftLogoUrl' | 'headerCenterLogoUrl' | 'headerRightLogoUrl',
    file?: File
  ) => {
    if (!file) return;
    setUploadErr(null);
    if (!file.type.startsWith('image/')) {
      setUploadErr('File harus berupa gambar (PNG, JPG, WebP, atau SVG).');
      return;
    }
    try {
      const dataUrl = await resizeLogoFileToDataUrl(file);
      setConfig(prev => ({ ...prev, [field]: dataUrl }));
    } catch (err: any) {
      setUploadErr(err?.message || 'Gagal memproses gambar logo.');
    }
  };

  const handleResetToDefault = () => {
    setConfig(getVendorPresetDefaults('SURVEYOR_INDONESIA'));
    setUploadErr(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(project.id, config);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const selectedProjOpt = getCoordinateProjectionOption(config.coordinateProjection || 'UTM_49S');
  const sampleCoord = formatProjectedCoordinate(110.343969, -7.289667, config.coordinateProjection || 'UTM_49S', false);
  const previewHeaderMode: HeaderLayoutMode = config.headerMode || 'THREE_LOGOS';
  const previewLine1 =
    (config.footerLine1 || '').trim() ||
    [
      config.footerPhone?.trim() ? `Telp: ${config.footerPhone.trim()}` : '',
      config.footerEmail?.trim() ? `Email: ${config.footerEmail.trim()}` : ''
    ]
      .filter(Boolean)
      .join('   |   ');
  const previewLine2 = (config.footerLine2 || '').trim() || (config.footerWebsite || '').trim();

  const utmSouthOptions = COORDINATE_PROJECTION_OPTIONS.filter(o => o.group === 'UTM' && o.id.endsWith('S'));
  const utmNorthOptions = COORDINATE_PROJECTION_OPTIONS.filter(o => o.group === 'UTM' && o.id.endsWith('N'));
  const tm3Options = COORDINATE_PROJECTION_OPTIONS.filter(o => o.group === 'TM3');
  const geoOptions = COORDINATE_PROJECTION_OPTIONS.filter(o => o.group === 'GEOGRAPHIC');

  const renderLogoSlot = (
    title: string,
    field: 'headerLeftLogoUrl' | 'headerCenterLogoUrl' | 'headerRightLogoUrl',
    fallbackHint: string
  ) => {
    const val = config[field] || '';
    return (
      <div className="p-3 bg-slate-950/70 rounded-xl border border-white/10 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-200">{title}</span>
          {val && (
            <button
              type="button"
              onClick={() => setConfig(prev => ({ ...prev, [field]: '' }))}
              className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              title="Hapus logo kustom"
            >
              <Trash2 className="w-3 h-3" />
              Hapus
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-10 rounded-lg bg-white flex items-center justify-center p-1 border border-slate-300 shrink-0 overflow-hidden">
            {val ? (
              <img src={val} alt={title} className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[8px] text-slate-400 text-center leading-tight px-1">
                {fallbackHint}
              </span>
            )}
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold cursor-pointer">
              <Upload className="w-3 h-3" />
              Unggah PNG/JPG
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  void handleLogoUpload(field, f);
                  e.target.value = '';
                }}
              />
            </label>
            <input
              type="text"
              value={val.startsWith('data:image/') ? '' : val}
              onChange={(e) => setConfig(prev => ({ ...prev, [field]: e.target.value }))}
              placeholder={val.startsWith('data:image/') ? 'Logo terunggah (Base64 PNG tersimpan)' : 'Atau tempel URL / Link Drive gambar...'}
              className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-950/90 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                Pengaturan Kop PDF, Footer &amp; Proyeksi Koordinat
              </h3>
              <p className="text-[11px] text-amber-300 font-semibold truncate">
                Jalur: {project.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5 flex-1">
          {uploadErr && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {uploadErr}
            </div>
          )}

          {isCombinedLlgKebraonDriyorejoProject(project.name, project.id) && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs space-y-1">
              <div className="font-black text-emerald-300 uppercase tracking-wide text-[11px]">
                ✨ Mode Khusus Auto-Detect Judul per Desa Aktif untuk Jalur Ini
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Judul Formulir Inventarisasi PDF, Peta Bidang Tanah, dan Daftar Nominatif otomatis menyesuaikan Desa/Kelurahan bidang:
                <span className="block mt-1 font-mono text-[10px] text-emerald-300">
                  • Desa/Kelurahan <strong>Kebraon</strong> → <strong>REKONFIGURASI LLG 150 kV KEBRAON</strong>
                </span>
                <span className="block font-mono text-[10px] text-emerald-300">
                  • Desa/Kelurahan <strong>Kesamben Wetan</strong> → <strong>LLG 150 kV KRIAN</strong>
                </span>
              </p>
            </div>
          )}

          {/* 1. Preset Vendor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                1. Pilih Template Vendor (Preset Cepat)
              </label>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Default SI
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {PRESET_CARDS.map(card => {
                const isSelected = (config.vendorPreset || 'SURVEYOR_INDONESIA') === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectPreset(card.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/10'
                        : 'border-white/10 bg-slate-950/60 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-bold text-white">{card.title}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">{card.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Header / Kop Form */}
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                2. Header / Kop Formulir Inventarisasi
              </label>
              <select
                value={config.headerMode || 'THREE_LOGOS'}
                onChange={(e) => setConfig(prev => ({ ...prev, headerMode: e.target.value as HeaderLayoutMode }))}
                className="px-3 py-1.5 bg-slate-900 border border-white/15 rounded-xl text-xs font-bold text-sky-200 focus:outline-none focus:border-sky-500"
              >
                <option value="THREE_LOGOS">Layout 3 Logo (Kiri - Tengah - Kanan)</option>
                <option value="TWO_LOGOS_WITH_TEXT">Layout Logo Kiri/Kanan + Teks Kop di Tengah</option>
                <option value="CUSTOM_TEXT_ONLY">Layout Teks Kop Saja (Tanpa Logo)</option>
              </select>
            </div>

            {previewHeaderMode !== 'CUSTOM_TEXT_ONLY' && (
              <div className={`grid grid-cols-1 ${previewHeaderMode === 'THREE_LOGOS' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3`}>
                {renderLogoSlot(
                  'Logo Kiri',
                  'headerLeftLogoUrl',
                  (config.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA' ? 'Default Danantara' : 'Opsional'
                )}
                {previewHeaderMode === 'THREE_LOGOS' &&
                  renderLogoSlot(
                    'Logo Tengah',
                    'headerCenterLogoUrl',
                    (config.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA' ? 'Default ID Survey' : 'Opsional'
                  )}
                {renderLogoSlot(
                  'Logo Kanan',
                  'headerRightLogoUrl',
                  (config.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA' ? 'Default SI' : 'Opsional'
                )}
              </div>
            )}

            {previewHeaderMode !== 'THREE_LOGOS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Nama Perusahaan / Instansi (Kop Atas)
                  </label>
                  <input
                    type="text"
                    value={config.headerCompanyName || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, headerCompanyName: e.target.value }))}
                    placeholder="Contoh: PT PLN (PERSERO)"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Sub-Judul / Unit / Divisi
                  </label>
                  <input
                    type="text"
                    value={config.headerSubTitle || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, headerSubTitle: e.target.value }))}
                    placeholder="Contoh: UNIT INDUK PEMBANGUNAN JAWA BAGIAN TENGAH"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Alamat / Keterangan Kop (Opsional)
                  </label>
                  <input
                    type="text"
                    value={config.headerAddress || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, headerAddress: e.target.value }))}
                    placeholder="Contoh: Jl. Karawitan No. 32, Bandung — Telp. (022) 731xxxx"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-white/5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Judul Formulir Baris 1 (Lembar 1)
                </label>
                <input
                  type="text"
                  value={config.docTitleLine1 || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, docTitleLine1: e.target.value }))}
                  placeholder="FORMULIR INVENTARISASI"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Judul Formulir Baris 2 (Lembar 1)
                </label>
                <input
                  type="text"
                  value={config.docTitleLine2 || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, docTitleLine2: e.target.value }))}
                  placeholder="PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Footer Form */}
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/10 space-y-3">
            <label className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              3. Footer Halaman PDF (Semua Halaman)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Nomor Telepon</label>
                <input
                  type="text"
                  value={config.footerPhone || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, footerPhone: e.target.value }))}
                  placeholder="(62-24) 845 0918"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Email Kontak</label>
                <input
                  type="text"
                  value={config.footerEmail || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, footerEmail: e.target.value }))}
                  placeholder="kontak@vendor.co.id"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Website</label>
                <input
                  type="text"
                  value={config.footerWebsite || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, footerWebsite: e.target.value }))}
                  placeholder="www.pln.co.id"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Teks Kustom Footer Baris 1 <span className="text-slate-500 font-normal">(opsional, menggantikan Telp | Email)</span>
                </label>
                <input
                  type="text"
                  value={config.footerLine1 || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, footerLine1: e.target.value }))}
                  placeholder="Kosongkan untuk otomatis pakai Telp | Email di atas"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Label Kode Kiri Bawah
                </label>
                <input
                  type="text"
                  value={config.footerLeftPrefix || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, footerLeftPrefix: e.target.value }))}
                  placeholder="Kode Lahan"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 4. Setting Proyeksi Koordinat (Lembar 1 & Lembar 3) */}
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-amber-500/25 space-y-3">
            <label className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              4. Proyeksi Koordinat (Lembar 1 &amp; Perhitungan Titik Lembar 3)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Pilih Sistem Proyeksi / Zona Koordinat
                </label>
                <select
                  value={config.coordinateProjection || 'UTM_49S'}
                  onChange={(e) =>
                    setConfig(prev => ({
                      ...prev,
                      coordinateProjection: e.target.value as CoordinateProjectionId
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-slate-900 border border-amber-500/30 rounded-xl text-xs font-bold text-amber-200 focus:outline-none focus:border-amber-400"
                >
                  <optgroup label="Otomatis">
                    <option value="AUTO_UTM">Auto-Detect UTM Zone (Otomatis dari Koordinat Bidang)</option>
                  </optgroup>
                  <optgroup label="UTM WGS84 — Belahan Selatan (46S – 54S)">
                    {utmSouthOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.regionHint}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="UTM WGS84 — Belahan Utara (46N – 54N)">
                    {utmNorthOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.regionHint}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="TM-3° BPN / DGN95 (Zona 46.2 – 54.1)">
                    {tm3Options.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} ({o.regionHint})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Geografis WGS84 (Lintang / Bujur)">
                    {geoOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Cakupan wilayah: <span className="text-amber-300">{selectedProjOpt.regionHint}</span>
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Override Teks Proyeksi di Lembar 1 <span className="text-slate-500 font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={config.coordinateLabelOverride || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, coordinateLabelOverride: e.target.value }))}
                  placeholder={`Default: ${selectedProjOpt.sheetRowValue}`}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Contoh output titik P1 Lembar 3: <code className="text-emerald-300">{sampleCoord.primaryText}</code>
                </p>
              </div>
            </div>
          </div>

          {/* 5. Mini Live Preview */}
          <div className="space-y-2">
            <div className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              Pratinjau Mini (Header, Lembar 1 Proyeksi &amp; Footer PDF)
            </div>
            <div className="bg-white text-slate-900 rounded-xl p-4 shadow-inner border border-slate-300 space-y-3">
              {/* Preview Header */}
              <div className="border-b border-slate-300 pb-2.5">
                {previewHeaderMode === 'THREE_LOGOS' ? (
                  <div className="grid grid-cols-3 items-center gap-2 min-h-[38px]">
                    <div className="flex items-center justify-start">
                      {config.headerLeftLogoUrl ? (
                        <img src={config.headerLeftLogoUrl} alt="Left" className="max-h-9 max-w-[110px] object-contain" />
                      ) : (config.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA' ? (
                        <span className="text-[10px] font-black text-slate-700 tracking-wide">DANANTARA</span>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic">[Logo Kiri]</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center">
                      {config.headerCenterLogoUrl ? (
                        <img src={config.headerCenterLogoUrl} alt="Center" className="max-h-9 max-w-[110px] object-contain" />
                      ) : (config.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA' ? (
                        <span className="text-[11px] font-extrabold text-sky-700">idsurvey</span>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic">[Logo Tengah]</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end">
                      {config.headerRightLogoUrl ? (
                        <img src={config.headerRightLogoUrl} alt="Right" className="max-h-9 max-w-[110px] object-contain" />
                      ) : (config.vendorPreset || 'SURVEYOR_INDONESIA') === 'SURVEYOR_INDONESIA' ? (
                        <span className="text-[10px] font-black text-sky-700 text-right leading-tight">SURVEYOR<br/>INDONESIA</span>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic">[Logo Kanan]</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 min-h-[42px]">
                    {previewHeaderMode === 'TWO_LOGOS_WITH_TEXT' && (
                      <div className="w-20 flex items-center justify-start shrink-0">
                        {config.headerLeftLogoUrl ? (
                          <img src={config.headerLeftLogoUrl} alt="Left" className="max-h-10 max-w-[76px] object-contain" />
                        ) : (
                          <span className="text-[8px] text-slate-300 border border-dashed border-slate-300 px-1.5 py-1 rounded">Logo Kiri</span>
                        )}
                      </div>
                    )}
                    <div className="flex-1 text-center">
                      <div className="text-xs font-black text-slate-900">
                        {config.headerCompanyName || 'NAMA VENDOR / INSTANSI'}
                      </div>
                      {config.headerSubTitle && (
                        <div className="text-[10px] font-bold text-sky-700">{config.headerSubTitle}</div>
                      )}
                      {config.headerAddress && (
                        <div className="text-[9px] text-slate-500">{config.headerAddress}</div>
                      )}
                    </div>
                    {previewHeaderMode === 'TWO_LOGOS_WITH_TEXT' && (
                      <div className="w-20 flex items-center justify-end shrink-0">
                        {config.headerRightLogoUrl ? (
                          <img src={config.headerRightLogoUrl} alt="Right" className="max-h-10 max-w-[76px] object-contain" />
                        ) : (
                          <span className="text-[8px] text-slate-300 border border-dashed border-slate-300 px-1.5 py-1 rounded">Logo Kanan</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Preview Title & Lembar 1 Coordinate Row */}
              <div className="text-center space-y-0.5">
                <div className="text-[11px] font-black text-slate-900">
                  {(config.docTitleLine1 || 'FORMULIR INVENTARISASI').toUpperCase()}
                </div>
                <div className="text-[10px] font-bold text-slate-800">
                  {(config.docTitleLine2 || 'PEMERIKSAAN RENCANA JALUR TRANSMISI TENAGA LISTRIK').toUpperCase()}
                </div>
                <div className="text-[10px] font-bold text-slate-700">{project.name.toUpperCase()}</div>
              </div>

              <div className="border border-slate-700 rounded text-[10px] grid grid-cols-[1fr_auto_1fr] bg-slate-50">
                <div className="px-2 py-1 text-slate-600 border-r border-slate-400">
                  1. {selectedProjOpt.sheetRowLabel}
                </div>
                <div className="px-1.5 py-1 text-slate-600 border-r border-slate-400">:</div>
                <div className="px-2 py-1 font-bold text-slate-900">
                  {(config.coordinateLabelOverride || '').trim() || selectedProjOpt.sheetRowValue}
                </div>
              </div>

              {/* Preview Footer */}
              <div className="border-t border-slate-300 pt-1.5 text-[9px] text-slate-500">
                {previewLine1 && <div className="text-center">{previewLine1}</div>}
                <div className="flex items-center justify-between mt-0.5">
                  <span>{(config.footerLeftPrefix || 'Kode Lahan').trim()}: DESA_SPAN_01</span>
                  <span className="font-bold text-slate-700">{previewLine2}</span>
                  <span>Halaman 1 dari 4</span>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan PDF Jalur Ini'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
