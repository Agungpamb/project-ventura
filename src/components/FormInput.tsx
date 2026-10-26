import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Trash2, Check, ArrowRight, ArrowLeft, Save, 
  MapPin, Landmark, Home, Sprout, ShieldAlert, Edit3, X, FileText, Key, RefreshCw, ExternalLink,
  PenTool, CheckCircle2, Briefcase, Lock
} from 'lucide-react';
import { type LandRecord, createEmptyRecord, type ProjectConfig } from '../types';
import DocUpload from './DocUpload';
import DeleteParcelModal from './DeleteParcelModal';
import SignatureModal, { type SignatureType, SIGNATURE_CONFIGS } from './SignatureModal';
import { getOrCreateParcelFolderHierarchy, uploadBase64ImageToDrive } from '../lib/googleApi';

const PREDEFINED_PENUTUP_LAHAN = [
  'SAWAH',
  'LADANG ATAU TEGALAN',
  'PERKEBUNAN',
  'PEMUKIMAN',
  'PADANG RUMPUT',
  'SUNGAI',
  'JARINGAN JALAN',
  'SALURAN IRIGASI'
];

const PREDEFINED_JENIS_ALAS_HAK = [
  'SERTIPIKAT HAK MILIK',
  'SERTIPIKAT HAK GUNA BANGUNAN',
  'SERTIPIKAT HAK GUNA USAHA',
  'SERTIPIKAT HAK PAKAI',
  'SERTIPIKAT HAK WAKAF',
  'LETTER C',
  'SEPORADIK',
  'SURAT KETERANGAN'
];
interface FormInputProps {
  records: LandRecord[];
  role?: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST' | null;
  onSave: (record: LandRecord, isEdit: boolean, originalRecord?: LandRecord | null) => Promise<void>;
  accessToken?: string;
  onUpdateRecord?: (updatedRecord: LandRecord) => Promise<void>;
  onDeleteRecord?: (record: LandRecord, adjustNextParcels: boolean) => Promise<void>;
  uploadsFolderId?: string;
  activeProjectName?: string;
  projects?: ProjectConfig[];
  activeProjectId?: string;
  onSwitchProject?: (projectId: string) => void;
  initialSelectedRecord?: LandRecord | null;
  onClearInitialRecord?: () => void;
  onRefreshGoogleToken?: () => Promise<string | null>;
}

export default function FormInput({ 
  records, 
  role,
  onSave, 
  accessToken, 
  onUpdateRecord, 
  onDeleteRecord,
  uploadsFolderId, 
  activeProjectName,
  projects,
  activeProjectId,
  onSwitchProject,
  initialSelectedRecord,
  onClearInitialRecord,
  onRefreshGoogleToken
}: FormInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEditRecord, setSelectedEditRecord] = useState<LandRecord | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Search state for cascading dropdowns
  const [searchMethod, setSearchMethod] = useState<'dropdown' | 'manual'>('dropdown');
  const [selectedDesa, setSelectedDesa] = useState('');
  const [selectedSpan, setSelectedSpan] = useState('');
  const [selectedNobid, setSelectedNobid] = useState('');

  // Reset child selectors when parent changes
  useEffect(() => {
    setSelectedSpan('');
    setSelectedNobid('');
  }, [selectedDesa]);

  useEffect(() => {
    setSelectedNobid('');
  }, [selectedSpan]);

  // Reset dropdown selectors when active project or records change
  useEffect(() => {
    setSelectedDesa('');
    setSelectedSpan('');
    setSelectedNobid('');
    setSearchQuery('');
  }, [records, activeProjectId, activeProjectName]);

  // Compute unique values for dropdowns
  const uniqueDesas = useMemo(() => {
    const desas = records.map(r => r.DESA?.trim()).filter(Boolean);
    return Array.from(new Set(desas)).sort();
  }, [records]);

  const uniqueSpansForDesa = useMemo(() => {
    if (!selectedDesa) return [];
    const spans = records
      .filter(r => r.DESA?.trim() === selectedDesa)
      .map(r => r.SPAN?.trim())
      .filter(Boolean);
    return Array.from(new Set(spans)).sort();
  }, [records, selectedDesa]);

  const uniqueNobidsForDesaAndSpan = useMemo(() => {
    if (!selectedDesa || !selectedSpan) return [];
    const nobids = records
      .filter(r => r.DESA?.trim() === selectedDesa && r.SPAN?.trim() === selectedSpan)
      .map(r => r.NOBID?.trim())
      .filter(Boolean);
    return Array.from(new Set(nobids)).sort();
  }, [records, selectedDesa, selectedSpan]);

  // Find matched record
  const matchingRecord = useMemo(() => {
    if (!selectedDesa || !selectedSpan || !selectedNobid) return null;
    return records.find(r => 
      r.DESA?.trim() === selectedDesa && 
      r.SPAN?.trim() === selectedSpan && 
      r.NOBID?.trim() === selectedNobid
    ) || null;
  }, [records, selectedDesa, selectedSpan, selectedNobid]);
  
  // Form State
  const [formData, setFormData] = useState<LandRecord>(createEmptyRecord());
  const [activeTab, setActiveTab] = useState<'lahan_pemilik' | 'alas_bangunan' | 'tanaman' | 'administrasi' | 'cetak_unggah'>('lahan_pemilik');
  
  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string; isAuthError?: boolean } | null>(null);

  // Digital Signature Modal states
  const [activeSignatureType, setActiveSignatureType] = useState<SignatureType | null>(null);
  const [isUploadingSig, setIsUploadingSig] = useState(false);

  // Signature handler: immediately updates form state and uploads transparent PNG to Drive subfolder if connected
  const handleSaveSignature = async (type: SignatureType, dataUrl: string) => {
    // 1. Immediately update local state
    setFormData(prev => ({ ...prev, [type]: dataUrl }));

    // 2. If Google Drive is connected, asynchronously upload into subfolder "1. Dokumentasi Lapangan dan Foto Warga"
    if (accessToken && accessToken !== 'GUEST_BYPASS' && accessToken !== 'null') {
      try {
        setIsUploadingSig(true);
        const hierarchy = await getOrCreateParcelFolderHierarchy(
          accessToken,
          uploadsFolderId || 'root',
          formData,
          '3. Dokumen'
        );

        const uploadRes = await uploadBase64ImageToDrive(
          accessToken,
          dataUrl,
          type,
          formData,
          hierarchy.targetFolderId
        );

        setFormData(prev => ({
          ...prev,
          [type]: uploadRes.webViewLink,
          DRIVE_FOLDER_ID: hierarchy.parcelFolderId
        }));
      } catch (err) {
        console.warn("Gagal unggah TTD ke Google Drive, menggunakan Data URL lokal:", err);
      } finally {
        setIsUploadingSig(false);
      }
    }
  };

  // Filter records based on search query for loading to edit
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return [];
    return records.filter(r => 
      r.CODE.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.NAMA.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.NIK.includes(searchQuery)
    ).slice(0, 5); // Limit search results to 5
  }, [searchQuery, records]);

  // Handle Edit Action from search
  const handleSelectForEdit = (record: LandRecord) => {
    setSelectedEditRecord(record);
    // Deep copy record to avoid mutating parent state
    setFormData(JSON.parse(JSON.stringify(record)));
    setSearchQuery('');
    setSubmitMessage({ type: 'success', text: `Berhasil memuat No. Bidang ${record.NOBID || record.CODE} (${record.NAMA || 'Tanpa Nama'}) untuk diedit` });
    setTimeout(() => setSubmitMessage(null), 4000);
  };

  // Auto load initialSelectedRecord if passed from PetaBidangTanah table or other navigation
  useEffect(() => {
    if (initialSelectedRecord) {
      handleSelectForEdit(initialSelectedRecord);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [initialSelectedRecord]);

  // Cancel edit mode
  const handleCancelEdit = () => {
    setSelectedEditRecord(null);
    setFormData(createEmptyRecord());
    setErrors({});
    if (onClearInitialRecord) onClearInitialRecord();
  };

  // Generate CODE automatically from DESA/SPAN/NOBID
  useEffect(() => {
    const cleanDesa = (formData.DESA || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
    const cleanSpan = (formData.SPAN || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
    const cleanNobid = (formData.NOBID || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
    
    if (cleanDesa && cleanSpan && cleanNobid) {
      const generatedCode = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
      if (!selectedEditRecord || !formData.CODE || (selectedEditRecord && (formData.DESA !== selectedEditRecord.DESA || formData.SPAN !== selectedEditRecord.SPAN || formData.NOBID !== selectedEditRecord.NOBID))) {
        setFormData(prev => ({ ...prev, CODE: generatedCode }));
      }
    }
  }, [formData.DESA, formData.SPAN, formData.NOBID, selectedEditRecord]);

  // Form Change Handler
  const handleChange = (field: keyof LandRecord, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors(prev => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  // Buildings Dynamic Management
  const [activeBuildingsCount, setActiveBuildingsCount] = useState<number>(1);

  // Sync count of active buildings with populated ones from record when editing
  useEffect(() => {
    if (formData.buildings) {
      const populatedCount = formData.buildings.filter(b => b.luas.trim() !== '' || b.bentuk.trim() !== '' || b.jenis.trim() !== '').length;
      setActiveBuildingsCount(Math.max(1, populatedCount));
    }
  }, [selectedEditRecord, formData.CODE]);

  // Building Field Change Handler (8 buildings max)
  const handleBuildingChange = (index: number, field: 'luas' | 'bentuk' | 'jenis', value: string) => {
    const updatedBuildings = [...formData.buildings];
    if (!updatedBuildings[index]) {
      updatedBuildings[index] = { luas: '', bentuk: '', jenis: '' };
    }
    updatedBuildings[index][field] = value;
    setFormData(prev => ({ ...prev, buildings: updatedBuildings }));
  };

  const removeBuildingAt = (index: number) => {
    const updatedBuildings = [...formData.buildings];
    // Reset fields in the 8 slots
    updatedBuildings[index] = { luas: '', bentuk: '', jenis: '' };
    setFormData(prev => ({ ...prev, buildings: updatedBuildings }));
    if (activeBuildingsCount > 1) {
      setActiveBuildingsCount(prev => prev - 1);
    }
  };

  // Plants Dynamic Management
  // Filter active plants (non-empty jenis) for UI display and input editing.
  // We'll map them back to the 30 elements of `formData.plants` on save.
  const [activePlantsCount, setActivePlantsCount] = useState<number>(1);

  // Sync count of active plants with populated ones from record when editing
  useEffect(() => {
    if (formData.plants) {
      const populatedCount = formData.plants.filter(p => p.jenis.trim() !== '').length;
      setActivePlantsCount(Math.max(1, populatedCount));
    }
  }, [selectedEditRecord, formData.CODE]);

  const handlePlantChange = (index: number, field: 'jenis' | 'sudah_menghasilkan' | 'belum_menghasilkan' | 'kecil' | 'sedang' | 'besar', value: string) => {
    const updatedPlants = [...formData.plants];
    if (!updatedPlants[index]) {
      updatedPlants[index] = { jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' };
    }
    updatedPlants[index][field] = value;
    setFormData(prev => ({ ...prev, plants: updatedPlants }));
  };

  const removePlantAt = (index: number) => {
    const updatedPlants = [...formData.plants];
    // Reset fields in the 30 slots
    updatedPlants[index] = { jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' };
    setFormData(prev => ({ ...prev, plants: updatedPlants }));
    if (activePlantsCount > 1) {
      setActivePlantsCount(prev => prev - 1);
    }
  };

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // 1. Check Identification Fields
    if (!formData.DESA.trim()) newErrors.DESA = 'Desa wajib diisi';
    if (!formData.SPAN.trim()) newErrors.SPAN = 'Span wajib diisi';
    if (!formData.NOBID.trim()) newErrors.NOBID = 'Nomor Bidang wajib diisi';
    
    // Luas bersifat opsional / boleh kosong atau 0 (untuk mengakomodir kepemilikan tanaman atau bangunan saja tanpa tanah)
    if (formData.LUAS && formData.LUAS.trim()) {
      const parsedLuas = parseFloat(formData.LUAS.replace(',', '.'));
      if (isNaN(parsedLuas) || parsedLuas < 0) {
        newErrors.LUAS = 'Luas harus berupa angka non-negatif (>= 0)';
      }
    }

    // 2. Check Owner identity
    if (!formData.NAMA.trim()) newErrors.NAMA = 'Nama pemilik wajib diisi';
    if (formData.NIK.trim() && !/^\d{16}$/.test(formData.NIK.trim())) {
      newErrors.NIK = 'NIK harus terdiri dari 16 digit angka';
    }

    if (formData.LUAS_YANG_ADA_PADA_ALAS_HAK && isNaN(parseFloat(formData.LUAS_YANG_ADA_PADA_ALAS_HAK))) {
      newErrors.LUAS_YANG_ADA_PADA_ALAS_HAK = 'Luas alas hak harus berupa angka';
    }

    // Check buildings numbers
    formData.buildings.forEach((b, i) => {
      if (b.luas && isNaN(parseFloat(b.luas))) {
        newErrors[`building_luas_${i}`] = 'Luas bangunan harus berupa angka';
      }
    });

    // Check plants numbers
    formData.plants.forEach((p, i) => {
      if (p.jenis) {
        if (p.sudah_menghasilkan && isNaN(parseInt(p.sudah_menghasilkan))) newErrors[`plant_sm_${i}`] = 'Harus angka';
        if (p.belum_menghasilkan && isNaN(parseInt(p.belum_menghasilkan))) newErrors[`plant_bm_${i}`] = 'Harus angka';
        if (p.kecil && isNaN(parseInt(p.kecil))) newErrors[`plant_kc_${i}`] = 'Harus angka';
        if (p.sedang && isNaN(parseInt(p.sedang))) newErrors[`plant_sd_${i}`] = 'Harus angka';
        if (p.besar && isNaN(parseInt(p.besar))) newErrors[`plant_bs_${i}`] = 'Harus angka';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form Submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitMessage(null);

    if (!validateForm()) {
      setSubmitMessage({ 
        type: 'error', 
        text: 'Validasi gagal. Mohon periksa isian data yang diberi tanda merah pada tab formulir.' 
      });
      // Scroll to top of form
      document.getElementById('sip_form_card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      const isEdit = !!selectedEditRecord;
      
      // If it's a new record, let's verify if the code already exists
      if (!isEdit) {
        const codeExists = records.some(r => r.CODE === formData.CODE);
        if (codeExists) {
          throw new Error(`Data dengan CODE '${formData.CODE}' sudah terdaftar. Gunakan kolom pencarian di atas jika ingin mengedit data ini.`);
        }
      }

      try {
        await onSave(formData, isEdit, selectedEditRecord);
      } catch (saveErr: any) {
        const errStr = saveErr?.message || String(saveErr);
        const isAuthIssue = saveErr?.isAuthError || 
          saveErr?.code === 'UNAUTHENTICATED' || 
          errStr.includes('Token Expired') || 
          errStr.includes('invalid authentication credentials') ||
          errStr.includes('OAuth 2') ||
          errStr.includes('Google Drive terputus') ||
          errStr.includes('Koneksi Google Drive');

        if (isAuthIssue && onRefreshGoogleToken) {
          const hasUserGesture = typeof navigator !== 'undefined' && 'userActivation' in navigator 
            ? navigator.userActivation.isActive 
            : false;
          if (hasUserGesture) {
            setIsRefreshingAuth(true);
            const freshToken = await onRefreshGoogleToken();
            if (freshToken) {
              await onSave(formData, isEdit, selectedEditRecord);
            } else {
              throw saveErr;
            }
          } else {
            throw saveErr;
          }
        } else {
          throw saveErr;
        }
      }
      
      // Keep the saved record loaded so they can print/upload immediately
      const savedRecord = JSON.parse(JSON.stringify(formData));
      if (!savedRecord.ID_UNIK) {
        const origId = selectedEditRecord?.ID_UNIK;
        const found = records.find(r => r.CODE === formData.CODE);
        savedRecord.ID_UNIK = origId || found?.ID_UNIK || `LOCAL_${Date.now()}`;
      }
      if (selectedEditRecord?.rowNumber && !savedRecord.rowNumber) {
        savedRecord.rowNumber = selectedEditRecord.rowNumber;
      }

      const isLiveConnected = accessToken && accessToken !== 'GUEST_BYPASS' && accessToken !== 'null';
      setSubmitMessage({
        type: 'success',
        text: isEdit 
          ? (isLiveConnected 
              ? `✅ Data dengan CODE ${formData.CODE} berhasil diperbarui di Google Sheets & Database Cloud!`
              : `✅ Data dengan CODE ${formData.CODE} berhasil diperbarui dan tersimpan aman di Database Cloud Firestore & Cache Lokal!`)
          : (isLiveConnected 
              ? `✅ Data baru dengan CODE ${formData.CODE} berhasil ditambahkan ke Google Sheets & Database Cloud!`
              : `✅ Data baru dengan CODE ${formData.CODE} berhasil disimpan di Database Cloud Firestore & Cache Lokal!`)
      });

      setSelectedEditRecord(savedRecord);
      setFormData(JSON.parse(JSON.stringify(savedRecord)));
      setActiveTab('cetak_unggah');
    } catch (err: any) {
      const errStr = err.message || String(err);
      const isAuthIssue = err.isAuthError || 
        err.code === 'UNAUTHENTICATED' || 
        errStr.includes('Token Expired') || 
        errStr.includes('invalid authentication credentials') ||
        errStr.includes('OAuth 2') ||
        errStr.includes('Google Drive terputus') ||
        errStr.includes('Koneksi Google Drive');

      setSubmitMessage({
        type: 'error',
        text: errStr || 'Gagal menyimpan data ke Google Sheets.',
        isAuthError: isAuthIssue
      });
    } finally {
      setIsSubmitting(false);
      setIsRefreshingAuth(false);
      document.getElementById('sip_form_card')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Ergonomic keyboard shortcut listener: Ctrl+S (Windows/Linux) or Cmd+S (Mac)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); // Stop native browser "Save webpage" dialog
        if (activeTab !== 'cetak_unggah' && !isSubmitting) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [formData, selectedEditRecord, records, activeTab, isSubmitting, onSave, onRefreshGoogleToken]);

  return (
    <div className="space-y-6" id="sip_form_input">
      {/* Jalur Transmisi / Proyek Selector Bar */}
      {projects && projects.length > 0 && onSwitchProject && (
        <div className="p-4 bg-gradient-to-r from-amber-500/15 via-slate-900 to-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block font-mono">JALUR TRANSMISI AKTIF:</span>
              <span className="text-sm font-black text-white font-sans">{activeProjectName || 'Pilih Jalur'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label htmlFor="form_input_jalur_select" className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Ganti Jalur:</label>
            <select
              id="form_input_jalur_select"
              value={activeProjectId}
              onChange={(e) => onSwitchProject(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-amber-500/50 hover:border-amber-400 text-amber-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer max-w-[280px] sm:max-w-[360px] truncate shadow-inner"
              title="Pilih Jalur Transmisi untuk input/edit data"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-950 text-white font-semibold">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Search/Load Record to Edit section */}
      <div className="glass-card p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="text-md font-bold text-white tracking-tight flex items-center gap-1.5">
              <Edit3 className="w-5 h-5 text-amber-400" />
              Edit Data Terdaftar (Search)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cari data lahan berdasarkan pilihan berjenjang atau ketik nama/CODE secara manual.
            </p>
          </div>
          {selectedEditRecord && (
            <button 
              type="button"
              onClick={handleCancelEdit}
              className="px-3.5 py-1.5 bg-rose-500/10 text-rose-300 text-xs font-semibold rounded-lg border border-rose-500/20 flex items-center gap-1.5 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              Batal Edit (Buat Baru)
            </button>
          )}
        </div>

        {/* Search Method Toggle Tabs */}
        <div className="flex gap-2 border-b border-white/5 pb-2">
          <button
            type="button"
            onClick={() => setSearchMethod('dropdown')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              searchMethod === 'dropdown'
                ? 'bg-amber-500 text-slate-950 font-bold text-white shadow-md shadow-amber-600/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Dropdown Bertingkat (Desa &gt; Span &gt; No Bidang)
          </button>
          <button
            type="button"
            onClick={() => setSearchMethod('manual')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              searchMethod === 'manual'
                ? 'bg-amber-500 text-slate-950 font-bold text-white shadow-md shadow-amber-600/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Ketik Pencarian Manual
          </button>
        </div>

        {searchMethod === 'dropdown' ? (
          <div className="space-y-4 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Select DESA */}
              <div>
                <label className="block text-[10px] font-extrabold text-amber-300 uppercase tracking-wider mb-1.5">
                  1. Pilih Desa
                </label>
                <select
                  value={selectedDesa}
                  onChange={(e) => setSelectedDesa(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="">-- Pilih Desa --</option>
                  {uniqueDesas.map(desa => (
                    <option key={desa} value={desa}>{desa}</option>
                  ))}
                </select>
              </div>

              {/* Select SPAN */}
              <div>
                <label className="block text-[10px] font-extrabold text-amber-300 uppercase tracking-wider mb-1.5">
                  2. Pilih Span
                </label>
                <select
                  value={selectedSpan}
                  onChange={(e) => setSelectedSpan(e.target.value)}
                  disabled={!selectedDesa}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">{selectedDesa ? '-- Pilih Span --' : '-- Pilih Desa Dulu --'}</option>
                  {uniqueSpansForDesa.map(span => (
                    <option key={span} value={span}>{span}</option>
                  ))}
                </select>
              </div>

              {/* Select NOBID */}
              <div>
                <label className="block text-[10px] font-extrabold text-amber-300 uppercase tracking-wider mb-1.5">
                  3. Pilih No. Bidang (NOBID)
                </label>
                <select
                  value={selectedNobid}
                  onChange={(e) => setSelectedNobid(e.target.value)}
                  disabled={!selectedSpan}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <option value="">{selectedSpan ? '-- Pilih No. Bidang --' : '-- Pilih Span Dulu --'}</option>
                  {uniqueNobidsForDesaAndSpan.map(nobid => (
                    <option key={nobid} value={nobid}>{nobid}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Matched Record Preview box */}
            {matchingRecord ? (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold font-mono text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-lg border border-amber-500/30">
                      {matchingRecord.CODE}
                    </span>
                    <span className="text-sm font-extrabold text-slate-100">{matchingRecord.NAMA}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    Desa <span className="text-slate-200 font-bold">{matchingRecord.DESA}</span> · Span <span className="text-slate-200 font-bold">{matchingRecord.SPAN}</span> · No. Bidang <span className="text-slate-200 font-bold">{matchingRecord.NOBID}</span> · NIK: <span className="text-slate-200 font-bold font-mono">{matchingRecord.NIK || '-'}</span> · Luas: <span className="text-slate-200 font-bold">{matchingRecord.LUAS} m²</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectForEdit(matchingRecord);
                    // Reset dropdown states so they are clear for next time
                    setSelectedDesa('');
                    setSelectedSpan('');
                    setSelectedNobid('');
                  }}
                  className="px-4.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-white text-white-keep font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/10 hover:shadow-amber-600/20 active:scale-98 transition-all cursor-pointer border border-amber-400/30 shrink-0"
                >
                  <Check className="w-4 h-4 text-emerald-300" />
                  Muat Data ke Formulir Edit
                </button>
              </div>
            ) : (
              selectedDesa && selectedSpan && selectedNobid && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs font-semibold animate-fadeIn">
                  ⚠️ Data lahan tidak ditemukan dengan kombinasi terpilih. Silakan periksa kembali desa, span, dan nomor bidang Anda.
                </div>
              )
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-fadeIn">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik CODE, NAMA, atau NIK..."
                className="w-full pl-11 pr-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 transition-all text-white placeholder-slate-400"
              />
            </div>

            {filteredRecords.length > 0 && (
              <div className="bg-slate-900/40 rounded-xl border border-white/10 p-2 divide-y divide-white/5 animate-fadeIn">
                {filteredRecords.map((rec, idx) => (
                  <button
                    key={`${rec.ID_UNIK || rec.CODE || 'row'}-${idx}`}
                    type="button"
                    onClick={() => handleSelectForEdit(rec)}
                    className="w-full text-left px-4 py-3 hover:bg-amber-500/10 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-white cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-bold font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                        {rec.CODE}
                      </span>
                      <span className="ml-3 text-sm font-semibold text-slate-200">{rec.NAMA}</span>
                      <span className="ml-3 text-xs text-slate-400 font-mono">NIK: {rec.NIK}</span>
                    </div>
                    <span className="text-xs text-slate-300 italic shrink-0">
                      Desa {rec.DESA} · Luas {rec.LUAS} m²
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Form Entry Card */}
      <div className="glass-card rounded-2xl shadow-xl overflow-hidden" id="sip_form_card">
        {/* Banner Indicator for Mode */}
        {selectedEditRecord ? (
          <div className="bg-amber-100 dark:bg-amber-500/10 text-slate-900 dark:text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-300 dark:border-amber-500/20">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-200 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30">
                <Edit3 className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">Mode Edit Data Lahan</p>
                <h3 className="text-sm font-bold mt-0.5 text-slate-900 dark:text-white">
                  Mengedit: <span className="font-mono text-amber-800 dark:text-amber-300 font-extrabold">{selectedEditRecord.CODE}</span>
                  {selectedEditRecord.NAMA && <span className="text-slate-700 dark:text-slate-300 font-normal"> · {selectedEditRecord.NAMA}</span>}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="px-3.5 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold border border-rose-500/30 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  title="Hapus data bidang ini dari database (Khusus Admin)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Bidang (Admin)</span>
                </button>
              )}
              <span className="text-xs font-mono bg-amber-200/60 text-amber-950 border-amber-300 dark:bg-white/10 dark:text-slate-300 dark:border-white/10 px-2.5 py-1 rounded-md border hidden sm:inline-block">
                Baris spreadsheet otomatis diperbarui
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 text-slate-900 dark:bg-slate-900/60 dark:text-white px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-white">
                <Plus className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Mode Input Data Baru</p>
                <h3 className="text-sm font-bold mt-0.5 font-sans text-slate-900 dark:text-white">Formulir Lahan Baru</h3>
              </div>
            </div>
            <span className="text-xs font-mono bg-slate-200 text-slate-700 border-slate-300 dark:bg-white/10 dark:text-slate-300 dark:border-white/10 px-2.5 py-1 rounded-md border">
              Menambahkan baris baru ke Google Sheets
            </span>
          </div>
        )}

        {/* Message Banner */}
        {submitMessage && (
          <div className={`p-4 border-b text-sm font-medium flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            submitMessage.type === 'success' 
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' 
              : 'bg-rose-500/15 text-rose-300 border-rose-500/20'
          }`}>
            <div className="flex items-start gap-2.5">
              <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${submitMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`} />
              <div>
                <p className="font-semibold leading-relaxed">{submitMessage.text}</p>
                {submitMessage.isAuthError && (
                  <p className="text-xs text-rose-200/80 mt-1">
                    Seluruh isian formulir Anda tetap aman di halaman ini. Klik tombol di samping untuk memperbarui izin Google Anda dan langsung melanjutkan penyimpanan data.
                  </p>
                )}
              </div>
            </div>
            {submitMessage.isAuthError && (
              <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                {onRefreshGoogleToken && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setIsRefreshingAuth(true);
                        await onRefreshGoogleToken();
                        // Automatically retry save after refresh!
                        setIsSubmitting(true);
                        const isEdit = !!selectedEditRecord;
                        await onSave(formData, isEdit);
                        
                        const savedRecord = JSON.parse(JSON.stringify(formData));
                        if (!savedRecord.ID_UNIK) {
                          const found = records.find(r => r.CODE === formData.CODE);
                          if (found) savedRecord.ID_UNIK = found.ID_UNIK;
                          else savedRecord.ID_UNIK = `TEMP_${Date.now()}`;
                        }

                        setSubmitMessage({
                          type: 'success',
                          text: isEdit 
                            ? `Sesi diperbarui & Data ${formData.CODE} berhasil disimpan ke Google Sheets!` 
                            : `Sesi diperbarui & Data baru ${formData.CODE} berhasil ditambahkan!`
                        });
                        setSelectedEditRecord(savedRecord);
                        setFormData(JSON.parse(JSON.stringify(savedRecord)));
                        setActiveTab('cetak_unggah');
                      } catch (e: any) {
                        const isBlocked = e?.code === 'auth/popup-blocked' || String(e?.message || '').includes('popup-blocked');
                        const isCancelled = e?.code === 'auth/cancelled-popup-request' || e?.code === 'auth/popup-closed-by-user';
                        setSubmitMessage({
                          type: 'error',
                          text: isBlocked 
                            ? 'Jendela Google Sign-In diblokir oleh peramban atau iframe. Silakan izinkan pop-up pada bilah peramban atau klik "Buka di Tab Baru".'
                            : isCancelled
                            ? 'Pembaruan sesi Google dibatalkan oleh pengguna.'
                            : `Gagal memperbarui izin Google: ${e.message || e}`,
                          isAuthError: true
                        });
                      } finally {
                        setIsRefreshingAuth(false);
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isRefreshingAuth || isSubmitting}
                    className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-white rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {isRefreshingAuth || isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Key className="w-3.5 h-3.5" />
                    )}
                    {isRefreshingAuth || isSubmitting ? 'Menyimpan Ulang...' : 'Perbarui Sesi Google & Simpan'}
                  </button>
                )}
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold text-xs border border-white/20 flex items-center gap-1.5 transition-all shrink-0"
                  title="Buka aplikasi langsung di tab baru untuk mencegah pemblokiran pop-up"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka di Tab Baru</span>
                </a>
              </div>
            )}
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Automatically Generated CODE View */}
          {activeTab !== 'cetak_unggah' && (
            <div className="bg-slate-100 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Kode Pengenal (CODE)</span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Dihasilkan otomatis dari gabungan DESA, SPAN, dan NOBID.</p>
              </div>
              <span className="text-base font-bold font-mono text-slate-900 bg-white dark:text-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 px-4 py-2 rounded-xl shadow-xs">
                {formData.CODE || 'BELUM LENGKAP (DESA/SPAN/NOBID)'}
              </span>
            </div>
          )}

          {/* Form Navigation Tabs & Quick Action */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-white/10 gap-2 pb-1">
            <div className="flex overflow-x-auto scrollbar-none gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('lahan_pemilik')}
                className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  activeTab === 'lahan_pemilik' 
                    ? 'border-amber-500 text-amber-800 dark:border-amber-400 dark:text-amber-300 font-extrabold' 
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Lahan & Pemilik
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('alas_bangunan')}
                className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  activeTab === 'alas_bangunan' 
                    ? 'border-amber-500 text-amber-800 dark:border-amber-400 dark:text-amber-300 font-extrabold' 
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Home className="w-4 h-4" />
                Alas Hak & Bangunan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tanaman')}
                className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  activeTab === 'tanaman' 
                    ? 'border-amber-500 text-amber-800 dark:border-amber-400 dark:text-amber-300 font-extrabold' 
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Sprout className="w-4 h-4" />
                Tanaman Lahan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('administrasi')}
                className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  activeTab === 'administrasi' 
                    ? 'border-amber-500 text-amber-800 dark:border-amber-400 dark:text-amber-300 font-extrabold' 
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Landmark className="w-4 h-4" />
                Administrasi & Status
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cetak_unggah')}
                className={`pb-3 px-4 text-xs font-bold border-b-2 tracking-wide uppercase transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  activeTab === 'cetak_unggah' 
                    ? 'border-amber-500 text-amber-800 dark:border-amber-400 dark:text-amber-300 font-extrabold' 
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                Cetak & Unggah Berkas
              </button>
            </div>

            {activeTab !== 'cetak_unggah' && (
              <div className="flex items-center gap-2 pb-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[11px] font-medium text-slate-300">
                  <span className="text-amber-400">⚡ Pintasan:</span>
                  <kbd className="px-1.5 py-0.5 bg-slate-950 border border-white/20 rounded text-[10px] font-mono text-amber-300 font-extrabold">Ctrl+S</kbd>
                </span>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Simpan data formulir sekarang tanpa perlu ke tab terakhir (Shortcut: Ctrl+S)"
                >
                  {isSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Simpan Cepat</span>
                  <kbd className="hidden md:inline-block px-1 py-0.5 bg-emerald-800/80 rounded text-[9px] font-mono">Ctrl+S</kbd>
                </button>
              </div>
            )}
          </div>

          {activeTab !== 'cetak_unggah' ? (
            <form onSubmit={handleSubmit} className="space-y-6">

          {/* Form Content - TAB 1: LAHAN & PEMILIK */}
          {activeTab === 'lahan_pemilik' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">DESA *</label>
                  <input
                    type="text"
                    value={formData.DESA}
                    onChange={(e) => handleChange('DESA', e.target.value)}
                    disabled={!!selectedEditRecord}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                      errors.DESA ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-amber-500'
                    }`}
                    placeholder="Contoh: KUTA"
                  />
                  {errors.DESA && <p className="text-xs text-rose-600 mt-1">{errors.DESA}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">SPAN *</label>
                  <input
                    type="text"
                    value={formData.SPAN}
                    onChange={(e) => handleChange('SPAN', e.target.value)}
                    disabled={!!selectedEditRecord}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                      errors.SPAN ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-amber-500'
                    }`}
                    placeholder="Contoh: SPAN_A"
                  />
                  {errors.SPAN && <p className="text-xs text-rose-600 mt-1">{errors.SPAN}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NOBID (Nomor Bidang) *</label>
                  <input
                    type="text"
                    value={formData.NOBID}
                    onChange={(e) => handleChange('NOBID', e.target.value)}
                    disabled={!!selectedEditRecord}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                      errors.NOBID ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-amber-500'
                    }`}
                    placeholder="Contoh: 0014"
                  />
                  {errors.NOBID && <p className="text-xs text-rose-600 mt-1">{errors.NOBID}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-600 uppercase">LUAS TANAH (m²)</label>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Boleh Kosong / 0</span>
                  </div>
                  <input
                    type="text"
                    value={formData.LUAS}
                    onChange={(e) => handleChange('LUAS', e.target.value)}
                    className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                      errors.LUAS ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-amber-500'
                    }`}
                    placeholder="0 atau kosong (jika hanya tanaman/bangunan)"
                  />
                  {errors.LUAS && <p className="text-xs text-rose-600 mt-1">{errors.LUAS}</p>}
                  
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = formData.LUAS === '0' ? '' : '0';
                        handleChange('LUAS', nextVal);
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                        formData.LUAS === '0'
                          ? 'bg-amber-500/15 text-amber-700 border-amber-300 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Klik untuk set luas 0 m² jika pihak berhak hanya memiliki tanaman atau bangunan tanpa tanah"
                    >
                      <span>🌲 / 🏠</span>
                      <span>Hanya Tanaman / Bangunan (Set 0 m²)</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                    *Kosongkan atau isi 0 jika pihak berhak hanya memiliki tanaman atau bangunan (tanpa tanah).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PENUTUP LAHAN</label>
                  <select
                    value={
                      PREDEFINED_PENUTUP_LAHAN.includes((formData.PENUTUP_LAHAN || '').toUpperCase())
                        ? (formData.PENUTUP_LAHAN || '').toUpperCase()
                        : 'LAINNYA'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'LAINNYA') {
                        if (PREDEFINED_PENUTUP_LAHAN.includes((formData.PENUTUP_LAHAN || '').toUpperCase())) {
                          handleChange('PENUTUP_LAHAN', '');
                        }
                      } else {
                        handleChange('PENUTUP_LAHAN', val);
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                  >
                    <option value="SAWAH" className="text-slate-800 bg-white">SAWAH</option>
                    <option value="LADANG ATAU TEGALAN" className="text-slate-800 bg-white">LADANG ATAU TEGALAN</option>
                    <option value="PERKEBUNAN" className="text-slate-800 bg-white">PERKEBUNAN</option>
                    <option value="PEMUKIMAN" className="text-slate-800 bg-white">PEMUKIMAN</option>
                    <option value="PADANG RUMPUT" className="text-slate-800 bg-white">PADANG RUMPUT</option>
                    <option value="SUNGAI" className="text-slate-800 bg-white">SUNGAI</option>
                    <option value="JARINGAN JALAN" className="text-slate-800 bg-white">JARINGAN JALAN</option>
                    <option value="SALURAN IRIGASI" className="text-slate-800 bg-white">SALURAN IRIGASI</option>
                    <option value="LAINNYA" className="text-slate-800 bg-white">LAINNYA (Ketik Sendiri)</option>
                  </select>

                  {(!PREDEFINED_PENUTUP_LAHAN.includes((formData.PENUTUP_LAHAN || '').toUpperCase())) && (
                    <div className="mt-2 animate-fadeIn">
                      <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                        Ketik Spesifikasi Penutup Lahan (misal: MAKAM, TAMAN, FASUM):
                      </label>
                      <input
                        type="text"
                        value={formData.PENUTUP_LAHAN || ''}
                        onChange={(e) => handleChange('PENUTUP_LAHAN', e.target.value.toUpperCase())}
                        placeholder="Contoh: MAKAM"
                        className="w-full px-3 py-2 border border-amber-400/30 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 bg-amber-500/10 text-amber-200 placeholder:text-slate-400 placeholder:font-normal"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS PENUTUP LAHAN</label>
                  <select
                    value={formData.STATUS_PENUTUP_LAHAN}
                    onChange={(e) => handleChange('STATUS_PENUTUP_LAHAN', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                  >
                    <option value="TANAH MASYARAKAT" className="text-slate-800 bg-white">TANAH MASYARAKAT</option>
                    <option value="KAWASAN HUTAN" className="text-slate-800 bg-white">KAWASAN HUTAN</option>
                    <option value="BMN" className="text-slate-800 bg-white">BMN</option>
                    <option value="BMD" className="text-slate-800 bg-white">BMD</option>
                    <option value="ASET BUMN" className="text-slate-800 bg-white">ASET BUMN</option>
                    <option value="ASET BUMD" className="text-slate-800 bg-white">ASET BUMD</option>
                    <option value="ASET DESA" className="text-slate-800 bg-white">ASET DESA</option>
                    <option value="TANAH NEGARA" className="text-slate-800 bg-white">TANAH NEGARA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS KEPEMILIKAN</label>
                  <select
                    value={formData.STATUS_KEPEMILIKAN}
                    onChange={(e) => handleChange('STATUS_KEPEMILIKAN', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                  >
                    <option value="PEMILIK DIKETAHUI" className="text-slate-800 bg-white">PEMILIK DIKETAHUI</option>
                    <option value="PEMILIK TIDAK DIKETAHUI KEBERADAANNYA" className="text-slate-800 bg-white">PEMILIK TIDAK DIKETAHUI KEBERADAANNYA</option>
                    <option value="PEMILIK MENOLAK KOMPENSASI" className="text-slate-800 bg-white">PEMILIK MENOLAK KOMPENSASI</option>
                    <option value="PEMILIK TIDAK DIKETAHUI" className="text-slate-800 bg-white">PEMILIK TIDAK DIKETAHUI</option>
                  </select>
                </div>
              </div>

              {/* Owner Info */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100/80 space-y-5">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  Identitas Pemilik Lahan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA PEMILIK *</label>
                    <input
                      type="text"
                      value={formData.NAMA}
                      onChange={(e) => handleChange('NAMA', e.target.value)}
                      className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                        errors.NAMA ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-amber-500'
                      }`}
                      placeholder="Contoh: AHMAD SUBAGJO"
                    />
                    {errors.NAMA && <p className="text-xs text-rose-600 mt-1">{errors.NAMA}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NIK (16 Digit - Opsional)</label>
                    <input
                      type="text"
                      value={formData.NIK}
                      onChange={(e) => handleChange('NIK', e.target.value)}
                      maxLength={16}
                      className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                        errors.NIK ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' : 'border-slate-200 focus:border-amber-500'
                      }`}
                      placeholder="Contoh: 3501xxxxxxxxxxxx"
                    />
                    {errors.NIK && <p className="text-xs text-rose-600 mt-1">{errors.NIK}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">JENIS KELAMIN</label>
                    <select
                      value={formData.JENIS_KELAMIN}
                      onChange={(e) => handleChange('JENIS_KELAMIN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="Laki-laki" className="text-slate-800 bg-white">Laki-laki</option>
                      <option value="Perempuan" className="text-slate-800 bg-white">Perempuan</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">TEMPAT TANGGAL LAHIR (TTL)</label>
                    <input
                      type="text"
                      value={formData.TTL}
                      onChange={(e) => handleChange('TTL', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: Sleman, 12-05-1980"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PEKERJAAN</label>
                    <input
                      type="text"
                      value={formData.PEKERJAAN}
                      onChange={(e) => handleChange('PEKERJAAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: PETANI"
                    />
                  </div>
                </div>

                {/* Alamat Baris 1-4 */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-600 uppercase">ALAMAT KTP</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 1 (RT/RW, Dusun)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_1}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_1', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        placeholder="RT 03 RW 01, Dusun Krajan"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 2 (Desa/Kelurahan)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_2}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_2', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        placeholder="Desa Kuta"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 3 (Kecamatan)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_3}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_3', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        placeholder="Kecamatan Baturaden"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">Baris 4 (Kabupaten & Provinsi)</span>
                      <input
                        type="text"
                        value={formData.ALAMAT_KTP_BARIS_4}
                        onChange={(e) => handleChange('ALAMAT_KTP_BARIS_4', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        placeholder="Banyumas, Jawa Tengah"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Batas-Batas Tanah */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100/80 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  Batas-Batas Tanah
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Utara Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_UTARA || ''}
                      onChange={(e) => handleChange('BATAS_UTARA', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Sri Suyani)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Selatan Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_SELATAN || ''}
                      onChange={(e) => handleChange('BATAS_SELATAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Sri Suyani)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Timur Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_TIMUR || ''}
                      onChange={(e) => handleChange('BATAS_TIMUR', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Sri Suyani)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Barat Berbatasan Dengan</label>
                    <input
                      type="text"
                      value={formData.BATAS_BARAT || ''}
                      onChange={(e) => handleChange('BATAS_BARAT', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                      placeholder="Nama Tetangga / Fasilitas (contoh: Tumirah)"
                    />
                  </div>
                </div>
              </div>

              {/* Navigation button */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  {role === 'ADMIN' && selectedEditRecord && (
                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-rose-500/30 transition-all cursor-pointer"
                      title="Hapus bidang data ini (Khusus Admin)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Bidang</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-emerald-600/90 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Simpan data saat ini tanpa harus ke tab terakhir (Shortcut: Ctrl+S)"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan (Ctrl+S)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('alas_bangunan')}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    Tab Berikutnya
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Form Content - TAB 2: ALAS HAK & BANGUNAN */}
          {activeTab === 'alas_bangunan' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Alas Hak */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100/80 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  Detail Kepemilikan & Alas Hak Lahan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">JENIS ALAS HAK</label>
                    <select
                      value={
                        PREDEFINED_JENIS_ALAS_HAK.includes((formData.JENIS_ALAS_HAK || '').toUpperCase())
                          ? (formData.JENIS_ALAS_HAK || '').toUpperCase()
                          : 'LAINNYA'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'LAINNYA') {
                          if (PREDEFINED_JENIS_ALAS_HAK.includes((formData.JENIS_ALAS_HAK || '').toUpperCase())) {
                            handleChange('JENIS_ALAS_HAK', '');
                          }
                        } else {
                          handleChange('JENIS_ALAS_HAK', val);
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="SERTIPIKAT HAK MILIK" className="text-slate-800 bg-white">SERTIPIKAT HAK MILIK</option>
                      <option value="SERTIPIKAT HAK GUNA BANGUNAN" className="text-slate-800 bg-white">SERTIPIKAT HAK GUNA BANGUNAN</option>
                      <option value="SERTIPIKAT HAK GUNA USAHA" className="text-slate-800 bg-white">SERTIPIKAT HAK GUNA USAHA</option>
                      <option value="SERTIPIKAT HAK PAKAI" className="text-slate-800 bg-white">SERTIPIKAT HAK PAKAI</option>
                      <option value="SERTIPIKAT HAK WAKAF" className="text-slate-800 bg-white">SERTIPIKAT HAK WAKAF</option>
                      <option value="LETTER C" className="text-slate-800 bg-white">LETTER C</option>
                      <option value="SEPORADIK" className="text-slate-800 bg-white">SEPORADIK</option>
                      <option value="SURAT KETERANGAN" className="text-slate-800 bg-white">SURAT KETERANGAN</option>
                      <option value="LAINNYA" className="text-slate-800 bg-white">LAINNYA (Ketik Sendiri)</option>
                    </select>

                    {(!PREDEFINED_JENIS_ALAS_HAK.includes((formData.JENIS_ALAS_HAK || '').toUpperCase())) && (
                      <div className="mt-2 animate-fadeIn">
                        <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                          Ketik Jenis Alas Hak Lainnya:
                        </label>
                        <input
                          type="text"
                          value={formData.JENIS_ALAS_HAK || ''}
                          onChange={(e) => handleChange('JENIS_ALAS_HAK', e.target.value.toUpperCase())}
                          placeholder="Contoh: KETERANGAN DESA / GIRIK"
                          className="w-full px-3 py-2 border border-amber-400/30 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 bg-amber-500/10 text-amber-200 placeholder:text-slate-400 placeholder:font-normal"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NOMER HAK</label>
                    <input
                      type="text"
                      value={formData.NOMER_HAK}
                      onChange={(e) => handleChange('NOMER_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                      placeholder="Contoh: No. 1205"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA ALAS HAK</label>
                    <input
                      type="text"
                      value={formData.NAMA_ALAS_HAK}
                      onChange={(e) => handleChange('NAMA_ALAS_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800"
                      placeholder="Contoh: H. SUBUR"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">LUAS PADA ALAS HAK (m²)</label>
                    <input
                      type="text"
                      value={formData.LUAS_YANG_ADA_PADA_ALAS_HAK}
                      onChange={(e) => handleChange('LUAS_YANG_ADA_PADA_ALAS_HAK', e.target.value)}
                      className={`w-full px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-800 ${
                        errors.LUAS_YANG_ADA_PADA_ALAS_HAK ? 'border-rose-300 font-medium' : 'border-slate-200 font-medium'
                      }`}
                      placeholder="Contoh: 1500"
                    />
                    {errors.LUAS_YANG_ADA_PADA_ALAS_HAK && <p className="text-xs text-rose-600 mt-1">{errors.LUAS_YANG_ADA_PADA_ALAS_HAK}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">JENIS DOKUMEN PERALIHAN</label>
                    <select
                      value={formData.JENIS_PERALIHAN_HAK || 'JUAL-BELI'}
                      onChange={(e) => handleChange('JENIS_PERALIHAN_HAK', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white font-medium text-slate-800"
                    >
                      <option value="SESUAI" className="text-slate-800 bg-white">SESUAI</option>
                      <option value="JUAL-BELI" className="text-slate-800 bg-white">JUAL-BELI</option>
                      <option value="KETERANGAN WARIS" className="text-slate-800 bg-white">KETERANGAN WARIS</option>
                      <option value="KUASA WARIS" className="text-slate-800 bg-white">KUASA WARIS</option>
                      <option value="SURAT KUASA" className="text-slate-800 bg-white">SURAT KUASA</option>
                      <option value="KET. BEDA NAMA" className="text-slate-800 bg-white">KET. BEDA NAMA</option>
                      <option value="WAKAF" className="text-slate-800 bg-white">WAKAF</option>
                      <option value="SURAT KLAIM TANAMAN" className="text-slate-800 bg-white">SURAT KLAIM TANAMAN</option>
                      <option value="SURAT KLAIM BANGUNAN" className="text-slate-800 bg-white">SURAT KLAIM BANGUNAN</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 8 Buildings */}
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                    <Home className="w-4 h-4 text-amber-400" />
                    Data Bangunan Di Atas Lahan (Maksimal 8 Bangunan)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Isi rincian bangunan yang berdiri di atas lahan ini.</p>
                </div>

                <div className="space-y-4">
                  {Array.from({ length: activeBuildingsCount }).map((_, i) => {
                    const b = formData.buildings?.[i] || { luas: '', bentuk: '', jenis: '' };
                    return (
                      <div key={i} className="p-5 rounded-2xl border border-amber-500/20 bg-slate-900/60 relative space-y-4 shadow-lg shadow-black/10">
                        {/* Close button to reset */}
                        <button
                          type="button"
                          onClick={() => removeBuildingAt(i)}
                          className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                          title="Hapus baris bangunan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">
                              Bangunan #{i + 1} - JENIS BANGUNAN
                            </label>
                            <input
                              type="text"
                              value={b.jenis}
                              onChange={(e) => handleBuildingChange(i, 'jenis', e.target.value)}
                              className="w-full px-3 py-2 bg-slate-950 border border-white/20 rounded-xl text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 font-semibold text-white placeholder:text-slate-500"
                              placeholder="Contoh: RUMAH / TOKO / GUDANG"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">
                              BENTUK BANGUNAN
                            </label>
                            <input
                              type="text"
                              value={b.bentuk}
                              onChange={(e) => handleBuildingChange(i, 'bentuk', e.target.value)}
                              className="w-full px-3 py-2 bg-slate-950 border border-white/20 rounded-xl text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 font-semibold text-white placeholder:text-slate-500"
                              placeholder="Contoh: PERMANEN / SEMI PERMANEN"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">
                              LUAS BANGUNAN (m²)
                            </label>
                            <input
                              type="text"
                              value={b.luas}
                              onChange={(e) => handleBuildingChange(i, 'luas', e.target.value)}
                              className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`building_luas_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-amber-400 focus:ring-amber-400/30'
                              }`}
                              placeholder="Contoh: 120"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {activeBuildingsCount < 8 && (
                    <button
                      type="button"
                      onClick={() => setActiveBuildingsCount(prev => prev + 1)}
                      className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/15 text-amber-300 rounded-xl text-xs font-extrabold border border-dashed border-amber-500/30 hover:border-amber-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Tambah Kolom Bangunan (Maksimal 8 Bangunan)
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('lahan_pemilik')}
                  className="px-5 py-2.5 border border-white/10 text-slate-300 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-emerald-600/90 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Simpan data saat ini tanpa harus ke tab terakhir (Shortcut: Ctrl+S)"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan (Ctrl+S)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tanaman')}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    Tab Berikutnya
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Form Content - TAB 3: PLANTS (30 plants slots) */}
          {activeTab === 'tanaman' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border-b border-white/10 pb-2">
                <h3 className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                  <Sprout className="w-4 h-4 text-emerald-400" />
                  Pohon & Tanaman Produktif Di Atas Lahan (Hingga 30 Jenis)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Isi jenis tanaman serta rincian usia produktif dan ukuran tanaman di bawah ini.</p>
              </div>

              <div className="space-y-4">
                {Array.from({ length: activePlantsCount }).map((_, i) => {
                  const p = formData.plants?.[i] || { jenis: '', sudah_menghasilkan: '', belum_menghasilkan: '', kecil: '', sedang: '', besar: '' };
                  return (
                    <div key={i} className="p-5 rounded-2xl border border-emerald-500/20 bg-slate-900/60 relative space-y-4 shadow-lg shadow-black/10">
                      {/* Close button to reset */}
                      <button
                        type="button"
                        onClick={() => removePlantAt(i)}
                        className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                        title="Hapus baris tanaman"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 pt-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-emerald-300 uppercase mb-1.5 tracking-wide">
                            Tanaman #{i + 1} - JENIS TANAMAN
                          </label>
                          <input
                            type="text"
                            value={p.jenis}
                            onChange={(e) => handlePlantChange(i, 'jenis', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-white/20 rounded-xl text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 font-semibold text-white placeholder:text-slate-500"
                            placeholder="Contoh: KELAPA / ALPUKAT"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">SUDAH MENGHASILKAN</label>
                          <input
                            type="number"
                            min="0"
                            value={p.sudah_menghasilkan}
                            onChange={(e) => handlePlantChange(i, 'sudah_menghasilkan', e.target.value)}
                            className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                              errors[`plant_sm_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                            }`}
                            placeholder="Pohon"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">BELUM MENGHASILKAN</label>
                          <input
                            type="number"
                            min="0"
                            value={p.belum_menghasilkan}
                            onChange={(e) => handlePlantChange(i, 'belum_menghasilkan', e.target.value)}
                            className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                              errors[`plant_bm_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                            }`}
                            placeholder="Pohon"
                          />
                        </div>

                        <div>
                          <div className="grid grid-cols-3 gap-1">
                            <div className="col-span-3">
                              <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1.5 tracking-wide">UKURAN (K / S / B)</label>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={p.kecil}
                              onChange={(e) => handlePlantChange(i, 'kecil', e.target.value)}
                              className={`w-full px-2 py-2 bg-slate-950 border rounded-xl text-xs text-center focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`plant_kc_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                              }`}
                              placeholder="Kcl"
                              title="Jumlah tanaman ukuran Kecil"
                            />
                            <input
                              type="number"
                              min="0"
                              value={p.sedang}
                              onChange={(e) => handlePlantChange(i, 'sedang', e.target.value)}
                              className={`w-full px-2 py-2 bg-slate-950 border rounded-xl text-xs text-center focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`plant_sd_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                              }`}
                              placeholder="Sdg"
                              title="Jumlah tanaman ukuran Sedang"
                            />
                            <input
                              type="number"
                              min="0"
                              value={p.besar}
                              onChange={(e) => handlePlantChange(i, 'besar', e.target.value)}
                              className={`w-full px-2 py-2 bg-slate-950 border rounded-xl text-xs text-center focus:outline-none focus:ring-1 font-semibold text-white placeholder:text-slate-500 ${
                                errors[`plant_bs_${i}`] ? 'border-rose-500/40 bg-rose-500/10 focus:border-rose-500 focus:ring-rose-500/30' : 'border-white/20 focus:border-emerald-400 focus:ring-emerald-400/30'
                              }`}
                              placeholder="Bsr"
                              title="Jumlah tanaman ukuran Besar"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activePlantsCount < 30 && (
                  <button
                    type="button"
                    onClick={() => setActivePlantsCount(prev => prev + 1)}
                    className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 rounded-xl text-xs font-extrabold border border-dashed border-emerald-500/30 hover:border-emerald-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Kolom Tanaman (Maksimal 30 Tanaman)
                  </button>
                )}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('alas_bangunan')}
                  className="px-5 py-2.5 border border-white/10 text-slate-300 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-emerald-600/90 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Simpan data saat ini tanpa harus ke tab terakhir (Shortcut: Ctrl+S)"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan (Ctrl+S)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('administrasi')}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    Tab Berikutnya
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Form Content - TAB 4: ADMINISTRASI & STATUS */}
          {activeTab === 'administrasi' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight border-b border-slate-200 pb-2">
                  Penanggung Jawab & Saksi Lahan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS DESA</label>
                    <input
                      type="text"
                      value={formData.STATUS_DESA}
                      onChange={(e) => handleChange('STATUS_DESA', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: AKTIF / PERSUASIF"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">STATUS KEPALA DESA</label>
                    <input
                      type="text"
                      value={formData.STATUS_KEPALA}
                      onChange={(e) => handleChange('STATUS_KEPALA', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: PLT / DEFINITIF"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA KEPALA DESA (KADES)</label>
                    <input
                      type="text"
                      value={formData.NAMA_KADES}
                      onChange={(e) => handleChange('NAMA_KADES', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: SUPRAYITNO"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA SAKSI 1</label>
                    <input
                      type="text"
                      value={formData.NAMA_SAKSI_1}
                      onChange={(e) => handleChange('NAMA_SAKSI_1', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: SAKSI_A"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA SAKSI 2</label>
                    <input
                      type="text"
                      value={formData.NAMA_SAKSI_2}
                      onChange={(e) => handleChange('NAMA_SAKSI_2', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: SAKSI_B"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA TIM PELAKSANA 1</label>
                    <input
                      type="text"
                      value={formData.nama_tim_1}
                      onChange={(e) => handleChange('nama_tim_1', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: TIM_1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">NAMA TIM PELAKSANA 2</label>
                    <input
                      type="text"
                      value={formData.nama_tim_2}
                      onChange={(e) => handleChange('nama_tim_2', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: TIM_2"
                    />
                  </div>
                </div>
              </div>

              {/* 7 Pengesahan Tanda Tangan & Cap Desa Resmi */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 tracking-tight flex items-center gap-2">
                      <PenTool className="w-4 h-4 text-amber-500" />
                      Tanda Tangan & Cap Desa Resmi (7 Pengesahan Form Inventarisasi)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Goreskan tanda tangan langsung lewat layar (HP/Tablet/Laptop) atau unggah foto/scan. Hasil otomatis berformat PNG transparan.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200 self-start sm:self-auto">
                    Ukuran Pas Cetak A4
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { type: 'TTD_PEMILIK' as SignatureType, label: 'Tanda Tangan Pemilik Lahan', person: formData.NAMA || 'Nama Pemilik Belum Diisi', isCap: false },
                    { type: 'TTD_SAKSI_1' as SignatureType, label: 'Tanda Tangan Saksi 1', person: formData.NAMA_SAKSI_1 || 'Nama Saksi 1 Belum Diisi', isCap: false },
                    { type: 'TTD_SAKSI_2' as SignatureType, label: 'Tanda Tangan Saksi 2', person: formData.NAMA_SAKSI_2 || 'Nama Saksi 2 Belum Diisi', isCap: false },
                    { type: 'TTD_TIM_1' as SignatureType, label: 'Tanda Tangan Tim Pelaksana 1', person: formData.nama_tim_1 || 'Nama Tim 1 Belum Diisi', isCap: false },
                    { type: 'TTD_TIM_2' as SignatureType, label: 'Tanda Tangan Tim Pelaksana 2', person: formData.nama_tim_2 || 'Nama Tim 2 Belum Diisi', isCap: false },
                    { type: 'TTD_KADES' as SignatureType, label: 'Tanda Tangan Kepala Desa', person: formData.NAMA_KADES || 'Nama Kades Belum Diisi', isCap: false },
                    { type: 'CAP_DESA' as SignatureType, label: 'Cap / Stempel Resmi Desa', person: `Pemerintah Desa ${formData.DESA || ''}`, isCap: true },
                  ].map((sig) => {
                    const val = formData[sig.type];
                    const hasSig = !!val && String(val).trim() !== '';
                    return (
                      <div 
                        key={sig.type}
                        className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          hasSig 
                            ? 'bg-emerald-500/5 border-emerald-500/30 shadow-xs' 
                            : sig.isCap 
                              ? 'bg-purple-500/5 border-purple-500/20' 
                              : 'bg-white border-slate-200 shadow-xs'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                              {sig.label}
                            </span>
                            {hasSig ? (
                              <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Tersedia
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                Belum Ada
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium truncate">
                            {sig.person}
                          </p>
                        </div>

                        {/* Signature Preview or Empty Box */}
                        <div className="h-24 bg-slate-50 rounded-lg border border-dashed border-slate-300 flex items-center justify-center p-2 overflow-hidden relative group">
                          {hasSig ? (
                            <img 
                              src={val} 
                              alt={sig.label} 
                              className="max-h-full max-w-full object-contain filter drop-shadow-sm"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-400 text-center">
                              <PenTool className="w-5 h-5 mb-1 opacity-40 text-slate-500" />
                              <span className="text-[10px]">Klik untuk TTD / Cap</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveSignatureType(sig.type)}
                            className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                          >
                            <PenTool className="w-3.5 h-3.5" />
                            <span>{hasSig ? 'Ganti TTD' : 'Tanda Tangan'}</span>
                          </button>
                          {hasSig && (
                            <button
                              type="button"
                              onClick={() => handleChange(sig.type, '')}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus tanda tangan ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress & Locations */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-700 tracking-tight border-b border-slate-200 pb-2">
                  Wilayah, Tanggal & Progres Berkas
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KECAMATAN</label>
                    <input
                      type="text"
                      value={formData.KECAMATAN}
                      onChange={(e) => handleChange('KECAMATAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: BATURADEN"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KABUPATEN</label>
                    <input
                      type="text"
                      value={formData.KABUPATEN}
                      onChange={(e) => handleChange('KABUPATEN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Contoh: BANYUMAS"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">TANGGAL PELAKSANAAN</label>
                    <input
                      type="date"
                      value={formData.TANGGAL_PELAKSANAAN}
                      onChange={(e) => handleChange('TANGGAL_PELAKSANAAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KONFIRMASI BPN</label>
                    <select
                      value={formData.KONFIRMASI_BPN || 'TIDAK'}
                      onChange={(e) => handleChange('KONFIRMASI_BPN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="IYA" className="text-slate-800 bg-white">IYA</option>
                      <option value="TIDAK" className="text-slate-800 bg-white">TIDAK</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PROGRES PEMBERKASAN</label>
                    <select
                      value={formData.PROGRES_PEMBERKASAN || 'BELUM SELESAI'}
                      onChange={(e) => handleChange('PROGRES_PEMBERKASAN', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="BELUM SELESAI" className="text-slate-800 bg-white">BELUM SELESAI</option>
                      <option value="SELESAI" className="text-slate-800 bg-white">SELESAI</option>
                      <option value="KONSINYASI" className="text-slate-800 bg-white">KONSINYASI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">PROGRES UPLOAD TRABAS</label>
                    <select
                      value={formData.PROGRES_UPLOAD_TRABAS || 'BELUM'}
                      onChange={(e) => handleChange('PROGRES_UPLOAD_TRABAS', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white text-slate-800 font-medium"
                    >
                      <option value="SUDAH" className="text-slate-800 bg-white">SUDAH</option>
                      <option value="BELUM" className="text-slate-800 bg-white">BELUM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">KETERANGAN TAMBAHAN</label>
                  <textarea
                    value={formData.KETERANGAN}
                    onChange={(e) => handleChange('KETERANGAN', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="Masukkan catatan tambahan mengenai kondisi lahan atau pemilik..."
                  />
                </div>
              </div>

              {/* Navigation and Submit Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('tanaman')}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <div className="flex items-center gap-3">
                  {role === 'ADMIN' && selectedEditRecord && (
                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="px-4 py-2.5 bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl text-sm font-bold flex items-center gap-2 border border-rose-300 hover:border-rose-600 transition-all cursor-pointer"
                      title="Hapus data bidang ini dari basis data (Khusus Admin)"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Hapus Bidang</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                    title="Simpan data lahan (Shortcut: Ctrl+S)"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>{selectedEditRecord ? 'Simpan Perubahan Lahan' : 'Daftarkan Lahan Baru'}</span>
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 bg-emerald-800/80 rounded text-[10px] font-mono">Ctrl+S</kbd>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {selectedEditRecord ? (
            accessToken ? (
              <DocUpload
                records={records}
                accessToken={accessToken}
                onUpdateRecord={onUpdateRecord || (async () => {})}
                uploadsFolderId={uploadsFolderId}
                activeProjectName={activeProjectName}
                preselectedRecordId={selectedEditRecord.ID_UNIK}
              />
            ) : (
              <div className="p-8 bg-slate-900/50 border border-white/5 rounded-2xl text-center space-y-4">
                <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Koneksi Google Drive Belum Aktif</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Hubungkan Google Drive Anda menggunakan tombol <strong>Hubungkan Drive</strong> di bagian atas layar untuk mengaktifkan cetak dokumen resmi dan unggah lampiran berkas langsung ke Google Drive.
                </p>
              </div>
            )
          ) : (
            <div className="p-10 bg-slate-900/40 rounded-2xl border border-white/5 text-center space-y-4">
              <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">Data Lahan Belum Dipilih / Dimuat</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Silakan cari dan muat data lahan terlebih dahulu menggunakan panel pencarian di bagian atas, atau simpan data lahan baru untuk mencetak Formulir Inventarisasi resmi (PDF) atau mengunggah lampiran berkas ke Google Drive.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MODAL HAPUS BIDANG (KHUSUS ADMIN) */}
      {isDeleteModalOpen && selectedEditRecord && (
        <DeleteParcelModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          targetRecord={selectedEditRecord}
          allRecords={records}
          onConfirmDelete={async (updatedRecords, logMsg) => {
            const target = selectedEditRecord;
            setIsDeleteModalOpen(false);
            handleCancelEdit();
            if (onDeleteRecord) {
              await onDeleteRecord(target, true);
            }
          }}
        />
      )}

      {/* MODAL TANDA TANGAN & CAP DIGITAL */}
      {activeSignatureType && (
        <SignatureModal
          isOpen={!!activeSignatureType}
          onClose={() => setActiveSignatureType(null)}
          type={activeSignatureType}
          title={SIGNATURE_CONFIGS[activeSignatureType]?.label || 'Tanda Tangan'}
          personName={
            activeSignatureType === 'TTD_PEMILIK' ? (formData.NAMA || undefined) :
            activeSignatureType === 'TTD_SAKSI_1' ? (formData.NAMA_SAKSI_1 || undefined) :
            activeSignatureType === 'TTD_SAKSI_2' ? (formData.NAMA_SAKSI_2 || undefined) :
            activeSignatureType === 'TTD_TIM_1' ? (formData.nama_tim_1 || undefined) :
            activeSignatureType === 'TTD_TIM_2' ? (formData.nama_tim_2 || undefined) :
            activeSignatureType === 'TTD_KADES' ? (formData.NAMA_KADES || undefined) :
            `Pemerintah Desa ${formData.DESA || ''}`
          }
          initialImage={formData[activeSignatureType]}
          onSave={handleSaveSignature}
        />
      )}
    </div>
  </div>
</div>
  );
}
