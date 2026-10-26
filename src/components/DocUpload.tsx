import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, Upload, CheckCircle2, AlertCircle, ExternalLink, 
  Search, Loader2, FolderOpen, Info, ShieldAlert, MapPin, Check,
  FileDown, Cloud, PenTool, Trash2, Layers, FolderCheck, Image as ImageIcon
} from 'lucide-react';
import { type LandRecord } from '../types';
import { 
  findOrCreateFolder, 
  uploadFileToDrive, 
  getOrCreateParcelFolderHierarchy, 
  getCategoryForDocType,
  uploadBase64ImageToDrive,
  buildSanitizedFileName,
  type ParcelSubfolderCategory,
  PARCEL_SUBFOLDERS
} from '../lib/googleApi';
import { generateInventoryPDF } from '../lib/pdfGenerator';

interface DocUploadProps {
  records: LandRecord[];
  accessToken: string;
  onUpdateRecord: (updatedRecord: LandRecord) => Promise<void>;
  uploadsFolderId?: string;
  activeProjectName?: string;
  preselectedRecordId?: string | null;
}

type DocType = 
  | 'KTP' 
  | 'KK' 
  | 'Alas_Hak' 
  | 'Peralihan_Hak'
  | 'Jual_Beli'
  | 'Keterangan_Waris'
  | 'Kuasa_Waris'
  | 'Surat_Kuasa'
  | 'Ket_Beda_Nama'
  | 'Wakaf'
  | 'Klaim_Tanaman'
  | 'Klaim_Bangunan'
  | 'Dokumen_Lain'
  | 'Dokumentasi_Bidang'
  | 'Dokumentasi_Bidang_2'
  | 'Dokumentasi_Bidang_3'
  | 'Wajah_Pemilik'
  | 'TTD_PEMILIK'
  | 'TTD_SAKSI_1'
  | 'TTD_SAKSI_2'
  | 'TTD_TIM_1'
  | 'TTD_TIM_2'
  | 'TTD_KADES'
  | 'CAP_DESA';

interface DocTypeConfig {
  key: keyof LandRecord;
  label: string;
  description: string;
  docType: DocType;
  isSignature?: boolean;
}

export default function DocUpload({ 
  records, 
  accessToken, 
  onUpdateRecord, 
  uploadsFolderId, 
  activeProjectName,
  preselectedRecordId = null
}: DocUploadProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(preselectedRecordId || null);
  const [isSavingPDFToDrive, setIsSavingPDFToDrive] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<ParcelSubfolderCategory>('1. Dokumentasi Lapangan dan Foto Warga');

  useEffect(() => {
    if (preselectedRecordId) {
      setSelectedRecordId(preselectedRecordId);
    }
  }, [preselectedRecordId]);
  
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

  // Loading and error states
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configuration for Category 1: Dokumentasi Lapangan dan Foto Warga
  const photoSlots: DocTypeConfig[] = [
    { key: 'LINK_DOKUMENTASI_BIDANG', label: 'Foto Kondisi Bidang Lahan 1', description: 'Foto/Gambar (JPG, JPEG, PNG) atau PDF kondisi fisik bidang tanah lokasi 1.', docType: 'Dokumentasi_Bidang' },
    { key: 'LINK_DOKUMENTASI_BIDANG_2', label: 'Foto Kondisi Bidang Lahan 2', description: 'Foto/Gambar (JPG, JPEG, PNG) atau PDF kondisi fisik bidang tanah lokasi 2.', docType: 'Dokumentasi_Bidang_2' },
    { key: 'LINK_DOKUMENTASI_BIDANG_3', label: 'Foto Kondisi Bidang Lahan 3', description: 'Foto/Gambar (JPG, JPEG, PNG) atau PDF kondisi fisik bidang tanah lokasi 3.', docType: 'Dokumentasi_Bidang_3' },
    { key: 'LINK_WAJAH_PEMILIK', label: 'Foto Wajah Pemilik / Patok', description: 'Foto/Gambar (JPG, JPEG, PNG) atau PDF wajah dari pemilik lahan / patok batas.', docType: 'Wajah_Pemilik' }
  ];

  const signatureSlots: DocTypeConfig[] = [
    { key: 'TTD_PEMILIK', label: 'Tanda Tangan Pemilik / Pihak Berhak', description: 'Tanda tangan digital Warga / Ahli Waris Pihak Berhak (PNG Transparan).', docType: 'TTD_PEMILIK', isSignature: true },
    { key: 'TTD_SAKSI_1', label: 'Tanda Tangan Saksi 1', description: 'Tanda tangan digital Saksi Batas / Lingkungan 1 (PNG Transparan).', docType: 'TTD_SAKSI_1', isSignature: true },
    { key: 'TTD_SAKSI_2', label: 'Tanda Tangan Saksi 2', description: 'Tanda tangan digital Saksi Batas / Lingkungan 2 (PNG Transparan).', docType: 'TTD_SAKSI_2', isSignature: true },
    { key: 'TTD_TIM_1', label: 'Tanda Tangan Tim Pelaksana 1', description: 'Tanda tangan digital Petugas Satgas Lapangan 1 (PNG Transparan).', docType: 'TTD_TIM_1', isSignature: true },
    { key: 'TTD_TIM_2', label: 'Tanda Tangan Tim Pelaksana 2', description: 'Tanda tangan digital Petugas Satgas Lapangan 2 (PNG Transparan).', docType: 'TTD_TIM_2', isSignature: true },
    { key: 'TTD_KADES', label: 'Tanda Tangan Kepala Desa', description: 'Tanda tangan digital Pengesahan Kepala Desa / Lurah (PNG Transparan).', docType: 'TTD_KADES', isSignature: true },
    { key: 'CAP_DESA', label: 'Cap / Stempel Resmi Desa', description: 'Cap stempel basah pemerintahan desa setempat (PNG Transparan 1:1).', docType: 'CAP_DESA', isSignature: true }
  ];

  // Configuration for Category 2: Berkas (KTP, KK, Alas Hak, Dokumen Peralihan Hak, dsb.)
  const berkasSlots: DocTypeConfig[] = [
    { key: 'LINK_KTP', label: 'Scan KTP / Foto KTP', description: 'File PDF atau Gambar (JPG, JPEG, PNG) bukti identitas Kartu Tanda Penduduk.', docType: 'KTP' },
    { key: 'LINK_KK', label: 'Scan Kartu Keluarga (KK)', description: 'File PDF bukti hubungan keluarga / KK pemilik.', docType: 'KK' },
    { key: 'LINK_ALAS_HAK', label: 'Scan Alas Hak Lahan', description: 'File PDF Sertipikat, Letter C, Seporadik atau bukti kepemilikan hak.', docType: 'Alas_Hak' },
    { key: 'LINK_PERALIHAN_HAK', label: 'Scan Dokumen Peralihan Hak (Umum)', description: 'File PDF dokumen peralihan hak kepemilikan tanah.', docType: 'Peralihan_Hak' },
    { key: 'LINK_JUAL_BELI', label: 'Scan Akta Jual Beli / AJB', description: 'File PDF Akta Jual Beli (AJB) atau pelepasan hak.', docType: 'Jual_Beli' },
    { key: 'LINK_KETERANGAN_WARIS', label: 'Scan Surat Keterangan Waris', description: 'File PDF Surat Keterangan Waris yang sah dari kelurahan/kecamatan.', docType: 'Keterangan_Waris' },
    { key: 'LINK_KUASA_WARIS', label: 'Scan Surat Kuasa Waris', description: 'File PDF Surat Kuasa dari seluruh para ahli waris.', docType: 'Kuasa_Waris' },
    { key: 'LINK_SURAT_KUASA', label: 'Scan Surat Kuasa', description: 'File PDF Surat Kuasa penunjukkan pengurusan berkas.', docType: 'Surat_Kuasa' },
    { key: 'LINK_KET_BEDA_NAMA', label: 'Scan Keterangan Beda Nama', description: 'File PDF Surat Keterangan Beda Nama dari kepala desa.', docType: 'Ket_Beda_Nama' },
    { key: 'LINK_WAKAF', label: 'Scan Akta Wakaf', description: 'File PDF Akta Ikrar Wakaf atau dokumen pelepasan wakaf.', docType: 'Wakaf' },
    { key: 'LINK_KLAIM_TANAMAN', label: 'Scan Surat Klaim Tanaman', description: 'File PDF Surat Pernyataan / Klaim ganti rugi tanaman.', docType: 'Klaim_Tanaman' },
    { key: 'LINK_KLAIM_BANGUNAN', label: 'Scan Surat Klaim Bangunan', description: 'File PDF Surat Pernyataan / Klaim ganti rugi bangunan.', docType: 'Klaim_Bangunan' },
    { key: 'LINK_DOKUMEN_LAIN', label: 'Scan Dokumen Lain / Tambahan', description: 'File PDF dokumen pendukung lainnya yang dibutuhkan.', docType: 'Dokumen_Lain' }
  ];

  // Configuration for Category 3: Dokumen (Khusus TTD Digital dan Cap Resmi Desa)
  const dokumenSlots: DocTypeConfig[] = signatureSlots;

  // Selected Record details
  const selectedRecord = useMemo(() => {
    return records.find(r => r.ID_UNIK === selectedRecordId) || null;
  }, [records, selectedRecordId]);

  // Filtered list of records to select from
  const filteredRecords = useMemo(() => {
    if (searchMethod === 'manual') {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return records;
      return records.filter(r => 
        r.CODE.toLowerCase().includes(query) || 
        r.NAMA.toLowerCase().includes(query)
      );
    } else {
      let list = records;
      if (selectedDesa) list = list.filter(r => r.DESA?.trim() === selectedDesa);
      if (selectedSpan) list = list.filter(r => r.SPAN?.trim() === selectedSpan);
      if (selectedNobid) list = list.filter(r => r.NOBID?.trim() === selectedNobid);
      return list;
    }
  }, [records, searchQuery, searchMethod, selectedDesa, selectedSpan, selectedNobid]);

  // Handle PDF/Image file upload directly into hierarchical Drive folders
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, docType: DocType) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedRecord) {
      setStatusMessage({ type: 'error', text: 'Mohon pilih data lahan terlebih dahulu.' });
      return;
    }

    // Validation
    const isImageOrPdf = docType === 'KTP' || 
      docType.startsWith('Dokumentasi_Bidang') || 
      docType === 'Wajah_Pemilik' ||
      docType.startsWith('TTD_') ||
      docType === 'CAP_DESA';

    if (isImageOrPdf) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        setStatusMessage({ type: 'error', text: `Format ${docType.replace(/_/g, ' ')} harus berupa PDF atau Gambar (JPG, JPEG, PNG).` });
        return;
      }
    } else {
      if (file.type !== 'application/pdf') {
        setStatusMessage({ type: 'error', text: 'Hanya file berformat PDF yang diizinkan untuk diunggah pada slot ini.' });
        return;
      }
    }

    setUploadingType(docType);
    setStatusMessage(null);

    try {
      // 1. Root upload folder
      const mainFolderId = uploadsFolderId || await findOrCreateFolder(accessToken, "SIP_Berkas_Pertanahan_Desa");

      // 2. Resolve hierarchical category folder:
      // [mainFolderId] -> [DESA] -> [SPAN] -> [CODE] -> [targetCategory]
      const category = getCategoryForDocType(docType);
      const hierarchy = await getOrCreateParcelFolderHierarchy(
        accessToken,
        mainFolderId,
        selectedRecord,
        category
      );

      // 3. Upload file to target category folder
      const finalDocTypeLabel = docType === 'Peralihan_Hak' 
        ? `Peralihan_${(selectedRecord.JENIS_PERALIHAN_HAK || 'HAK').replace(/[\s\/\\?%*:|"<>-]/g, '_')}`
        : docType;

      const uploadResult = await uploadFileToDrive(
        accessToken,
        file,
        finalDocTypeLabel,
        selectedRecord,
        hierarchy.targetFolderId
      );

      // 4. Update corresponding link field & save parcel folder ID
      const updatedRecord = { ...selectedRecord };
      updatedRecord.DRIVE_FOLDER_ID = hierarchy.parcelFolderId; // locked to parcel folder
      (updatedRecord as any)[docType === 'Peralihan_Hak' ? 'LINK_PERALIHAN_HAK' : docType.startsWith('TTD_') || docType === 'CAP_DESA' ? docType : `LINK_${docType.toUpperCase()}`] = uploadResult.webViewLink;

      // Handle specific slot keys
      if (docType === 'KTP') updatedRecord.LINK_KTP = uploadResult.webViewLink;
      else if (docType === 'KK') updatedRecord.LINK_KK = uploadResult.webViewLink;
      else if (docType === 'Alas_Hak') updatedRecord.LINK_ALAS_HAK = uploadResult.webViewLink;
      else if (docType === 'Peralihan_Hak') updatedRecord.LINK_PERALIHAN_HAK = uploadResult.webViewLink;
      else if (docType === 'Jual_Beli') updatedRecord.LINK_JUAL_BELI = uploadResult.webViewLink;
      else if (docType === 'Keterangan_Waris') updatedRecord.LINK_KETERANGAN_WARIS = uploadResult.webViewLink;
      else if (docType === 'Kuasa_Waris') updatedRecord.LINK_KUASA_WARIS = uploadResult.webViewLink;
      else if (docType === 'Surat_Kuasa') updatedRecord.LINK_SURAT_KUASA = uploadResult.webViewLink;
      else if (docType === 'Ket_Beda_Nama') updatedRecord.LINK_KET_BEDA_NAMA = uploadResult.webViewLink;
      else if (docType === 'Wakaf') updatedRecord.LINK_WAKAF = uploadResult.webViewLink;
      else if (docType === 'Klaim_Tanaman') updatedRecord.LINK_KLAIM_TANAMAN = uploadResult.webViewLink;
      else if (docType === 'Klaim_Bangunan') updatedRecord.LINK_KLAIM_BANGUNAN = uploadResult.webViewLink;
      else if (docType === 'Dokumen_Lain') updatedRecord.LINK_DOKUMEN_LAIN = uploadResult.webViewLink;
      else if (docType === 'Dokumentasi_Bidang') updatedRecord.LINK_DOKUMENTASI_BIDANG = uploadResult.webViewLink;
      else if (docType === 'Dokumentasi_Bidang_2') updatedRecord.LINK_DOKUMENTASI_BIDANG_2 = uploadResult.webViewLink;
      else if (docType === 'Dokumentasi_Bidang_3') updatedRecord.LINK_DOKUMENTASI_BIDANG_3 = uploadResult.webViewLink;
      else if (docType === 'Wajah_Pemilik') updatedRecord.LINK_WAJAH_PEMILIK = uploadResult.webViewLink;
      else if (docType === 'TTD_PEMILIK') updatedRecord.TTD_PEMILIK = uploadResult.webViewLink;
      else if (docType === 'TTD_SAKSI_1') updatedRecord.TTD_SAKSI_1 = uploadResult.webViewLink;
      else if (docType === 'TTD_SAKSI_2') updatedRecord.TTD_SAKSI_2 = uploadResult.webViewLink;
      else if (docType === 'TTD_TIM_1') updatedRecord.TTD_TIM_1 = uploadResult.webViewLink;
      else if (docType === 'TTD_TIM_2') updatedRecord.TTD_TIM_2 = uploadResult.webViewLink;
      else if (docType === 'TTD_KADES') updatedRecord.TTD_KADES = uploadResult.webViewLink;
      else if (docType === 'CAP_DESA') updatedRecord.CAP_DESA = uploadResult.webViewLink;

      // 5. Update parent records & save to Google Sheets
      await onUpdateRecord(updatedRecord);

      setStatusMessage({ 
        type: 'success', 
        text: `Berkas ${docType.replace(/_/g, ' ')} berhasil diunggah ke Google Drive di folder: ${selectedRecord.DESA} ➔ ${selectedRecord.SPAN} ➔ ${selectedRecord.CODE} ➔ ${category}!` 
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ 
        type: 'error', 
        text: err.message || `Gagal mengunggah berkas ${docType}. Pastikan izin Google Drive aktif.` 
      });
    } finally {
      setUploadingType(null);
      event.target.value = '';
    }
  };

  const handleDownloadPDFDirectly = async () => {
    if (!selectedRecord) return;
    setIsDownloadingPDF(true);
    setStatusMessage(null);
    try {
      const docInstance = await generateInventoryPDF(selectedRecord, activeProjectName || "KOMPENSASI JALUR TRANSMISI");
      const pdfFileName = buildSanitizedFileName('FORM_INVENT', selectedRecord, 'pdf');
      docInstance.save(pdfFileName);
      setStatusMessage({
        type: 'success',
        text: `Formulir Inventarisasi (${pdfFileName}) berhasil diunduh!`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: `Gagal mengunduh PDF: ${err.message}`
      });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleSavePDFToDrive = async () => {
    if (!selectedRecord) return;
    setIsSavingPDFToDrive(true);
    setStatusMessage(null);
    try {
      // 1. Generate PDF blob
      const docInstance = await generateInventoryPDF(selectedRecord, activeProjectName || "KOMPENSASI JALUR TRANSMISI");
      const pdfBlob = docInstance.output('blob');
      const pdfFileName = buildSanitizedFileName('FORM_INVENT', selectedRecord, 'pdf');
      const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });

      // 2. Resolve hierarchical folder in subfolder "4. Form Invent"
      const mainFolderId = uploadsFolderId || await findOrCreateFolder(accessToken, "SIP_Berkas_Pertanahan_Desa");
      const hierarchy = await getOrCreateParcelFolderHierarchy(
        accessToken,
        mainFolderId,
        selectedRecord,
        '4. Form Invent'
      );

      // 3. Upload file to "4. Form Invent" subfolder with sanitized tag FORM_INVENT
      await uploadFileToDrive(
        accessToken,
        pdfFile,
        "FORM_INVENT",
        selectedRecord,
        hierarchy.targetFolderId
      );

      // 4. Update parent records to ensure DRIVE_FOLDER_ID is saved
      const updatedRecord = { ...selectedRecord };
      updatedRecord.DRIVE_FOLDER_ID = hierarchy.parcelFolderId;
      await onUpdateRecord(updatedRecord);

      setStatusMessage({
        type: 'success',
        text: `✨ Formulir Inventarisasi (${pdfFileName}) berhasil disimpan langsung ke Google Drive di folder: ${selectedRecord.DESA} ➔ ${selectedRecord.SPAN} ➔ 4. Form Invent!`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal menyimpan Formulir Inventarisasi ke Google Drive. Periksa izin akses Drive.'
      });
    } finally {
      setIsSavingPDFToDrive(false);
    }
  };

  // Render a document or signature slot
  const renderSlot = (slot: DocTypeConfig) => {
    if (!selectedRecord) return null;
    const linkValue = selectedRecord[slot.key] as string;
    const isUploaded = !!linkValue && String(linkValue).trim() !== '';
    const slotDocType = slot.docType;
    const isSlotUploading = uploadingType === slotDocType;
    
    const isImageAndPdf = slot.key === 'LINK_KTP' || 
      String(slot.key).startsWith('LINK_DOKUMENTASI_BIDANG') || 
      slot.key === 'LINK_WAJAH_PEMILIK' ||
      slot.isSignature;
      
    const acceptTypes = slot.isSignature 
      ? 'image/*' 
      : isImageAndPdf 
        ? 'application/pdf,image/jpeg,image/jpg,image/png' 
        : 'application/pdf';
    
    const uploadLabel = slot.isSignature 
      ? 'Ambil Foto / File HP' 
      : (isImageAndPdf ? 'Unggah Berkas' : 'Unggah PDF');

    return (
      <div key={slot.key} className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900/45 shadow-xs flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 max-w-md">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200 tracking-tight flex items-center gap-1.5">
              {slot.label}
              {isUploaded && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Tersedia
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{slot.description}</p>
          </div>

          <div className="shrink-0 self-end sm:self-auto flex items-center gap-2">

            {isUploaded ? (
              <div className="flex items-center gap-2">
                <a 
                  href={linkValue} 
                  target="_blank" 
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-white/10 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  Buka File
                </a>
                <label className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/25 text-xs font-semibold rounded-lg border flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs">
                  <Upload className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
                  Ganti
                  <input 
                    type="file" 
                    accept={acceptTypes}
                    onChange={(e) => handleFileUpload(e, slotDocType)}
                    className="hidden" 
                    disabled={uploadingType !== null}
                  />
                </label>
              </div>
            ) : (
              <label className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer border shadow-xs transition-all ${
                isSlotUploading 
                  ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-950 dark:text-slate-500 dark:border-white/5 cursor-not-allowed' 
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-amber-500 glow-amber'
              }`}>
                {isSlotUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
                    Mengunggah...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {uploadLabel}
                  </>
                )}
                <input 
                  type="file" 
                  accept={acceptTypes}
                  onChange={(e) => handleFileUpload(e, slotDocType)}
                  className="hidden" 
                  disabled={uploadingType !== null}
                />
              </label>
            )}
          </div>
        </div>

        {/* Mini preview for images & signatures */}
        {isUploaded && (linkValue.startsWith('data:image/') || isImageAndPdf) && (
          <div className="pt-2 border-t border-slate-200 dark:border-white/5 flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Pratinjau:</span>
            <div className="h-10 px-2 py-1 bg-slate-100 dark:bg-white/10 rounded-md border border-slate-200 dark:border-white/10 flex items-center">
              <img 
                src={linkValue} 
                alt={slot.label} 
                className="max-h-full max-w-xs object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="sip_doc_upload">
      {/* Left panel: List of land records to select */}
      {!preselectedRecordId && (
        <div className="lg:col-span-4 glass-card p-5 rounded-2xl shadow-xl flex flex-col h-[640px]">
          <div>
            <h2 className="text-md font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
              <FolderOpen className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              Daftar Berkas Lahan
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Pilih salah satu bidang tanah untuk melengkapi berkas lampiran terstruktur.</p>
          </div>

          {/* Search Method Toggle Tabs */}
          <div className="flex gap-1.5 border-b border-slate-200 dark:border-white/5 pb-2 mt-4">
            <button
              type="button"
              onClick={() => setSearchMethod('dropdown')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                searchMethod === 'dropdown'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-950 border border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-transparent dark:hover:bg-white/10 dark:hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Dropdown
            </button>
            <button
              type="button"
              onClick={() => setSearchMethod('manual')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                searchMethod === 'manual'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-950 border border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-transparent dark:hover:bg-white/10 dark:hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>

          {/* Search Input / Cascading Dropdowns */}
          <div className="space-y-2 mt-3 mb-4">
            {searchMethod === 'dropdown' ? (
              <div className="space-y-2.5">
                <div>
                  <select
                    value={selectedDesa}
                    onChange={(e) => setSelectedDesa(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 rounded-xl text-[11px] text-slate-900 dark:text-slate-200 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer shadow-xs"
                  >
                    <option value="">-- 1. Pilih Desa --</option>
                    {uniqueDesas.map(desa => (
                      <option key={desa} value={desa}>{desa}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={selectedSpan}
                    onChange={(e) => setSelectedSpan(e.target.value)}
                    disabled={!selectedDesa}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 rounded-xl text-[11px] text-slate-900 dark:text-slate-200 font-semibold focus:outline-none focus:border-amber-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                  >
                    <option value="">{selectedDesa ? '-- 2. Pilih Span --' : '-- 2. Pilih Desa Dulu --'}</option>
                    {uniqueSpansForDesa.map(span => (
                      <option key={span} value={span}>{span}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={selectedNobid}
                    onChange={(e) => setSelectedNobid(e.target.value)}
                    disabled={!selectedSpan}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 rounded-xl text-[11px] text-slate-900 dark:text-slate-200 font-semibold focus:outline-none focus:border-amber-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                  >
                    <option value="">{selectedSpan ? '-- 3. Pilih No. Bidang --' : '-- 3. Pilih Span Dulu --'}</option>
                    {uniqueNobidsForDesaAndSpan.map(nobid => (
                      <option key={nobid} value={nobid}>{nobid}</option>
                    ))}
                  </select>
                </div>

                {(selectedDesa || selectedSpan || selectedNobid) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDesa('');
                      setSelectedSpan('');
                      setSelectedNobid('');
                    }}
                    className="w-full py-1 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 dark:bg-white/5 dark:hover:bg-rose-500/10 dark:hover:text-rose-300 text-[10px] font-bold text-slate-600 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-white/5 transition-all cursor-pointer"
                  >
                    Bersihkan Filter Dropdown
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari CODE atau Nama Pemilik..."
                  className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white placeholder-slate-400 animate-fadeIn shadow-xs"
                />
              </div>
            )}
          </div>

          {/* List scroll */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {filteredRecords.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-xs italic">
                Tidak ada data pertanahan ditemukan
              </div>
            ) : (
              filteredRecords.map((r, idx) => {
                const isSelected = r.ID_UNIK === selectedRecordId;
                const docCount = [
                  r.LINK_KTP, r.LINK_KK, r.LINK_ALAS_HAK, r.LINK_PERALIHAN_HAK,
                  r.LINK_JUAL_BELI, r.LINK_KETERANGAN_WARIS, r.LINK_KUASA_WARIS,
                  r.LINK_SURAT_KUASA, r.LINK_KET_BEDA_NAMA, r.LINK_WAKAF,
                  r.LINK_KLAIM_TANAMAN, r.LINK_KLAIM_BANGUNAN, r.LINK_DOKUMEN_LAIN,
                  r.LINK_DOKUMENTASI_BIDANG, r.LINK_DOKUMENTASI_BIDANG_2, r.LINK_DOKUMENTASI_BIDANG_3, r.LINK_WAJAH_PEMILIK,
                  r.TTD_PEMILIK, r.TTD_SAKSI_1, r.TTD_SAKSI_2, r.TTD_TIM_1, r.TTD_TIM_2, r.TTD_KADES, r.CAP_DESA
                ].filter(Boolean).length;
                
                return (
                  <button
                    key={`${r.ID_UNIK || r.CODE || 'row'}-${idx}`}
                    onClick={() => {
                      setSelectedRecordId(r.ID_UNIK);
                      setStatusMessage(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex justify-between items-center cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-100 border-amber-400 dark:bg-amber-500/15 dark:border-amber-500/30 ring-1 ring-amber-400/40 text-slate-950 dark:text-white shadow-xs' 
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10 dark:text-slate-300'
                    }`}
                  >
                    <div className="space-y-1 truncate pr-2">
                      <p className={`font-bold font-mono truncate ${isSelected ? 'text-amber-800 dark:text-amber-200' : 'text-slate-800 dark:text-slate-300'}`}>{r.CODE}</p>
                      <p className={`truncate font-semibold ${isSelected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>{r.NAMA}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold shrink-0 ${
                      docCount > 0 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-white/5'
                    }`}>
                      {docCount} Berkas
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Right panel: Active upload view with 4 Category Folders */}
      <div className={`${preselectedRecordId ? 'lg:col-span-12' : 'lg:col-span-8'} glass-card p-6 rounded-2xl shadow-xl flex flex-col justify-between min-h-[640px]`}>
        {selectedRecord ? (
          <div className="space-y-5 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 border-amber-300 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/25 px-2.5 py-1 rounded-md font-mono border">
                      {selectedRecord.CODE}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 dark:text-slate-400 dark:bg-white/5 dark:border-transparent px-2 py-0.5 rounded">
                      Desa {selectedRecord.DESA} · Span {selectedRecord.SPAN} · No. {selectedRecord.NOBID}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white font-sans mt-2">{selectedRecord.NAMA}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    NIK {selectedRecord.NIK || '-'} · Alas Hak: {selectedRecord.JENIS_ALAS_HAK} ({selectedRecord.NOMER_HAK || 'Tanpa Nomor'})
                  </p>
                </div>

                {selectedRecord.DRIVE_FOLDER_ID && (
                  <a
                    href={`https://drive.google.com/drive/folders/${selectedRecord.DRIVE_FOLDER_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer border border-amber-400/30 shrink-0 self-start sm:self-center"
                    title="Buka Folder Google Drive Bidang ini (berisi 4 subfolder)"
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-950" />
                    Buka Folder Drive Bidang
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>
                )}
              </div>

              {/* Status Banner */}
              {statusMessage && (
                <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
                  statusMessage.type === 'success' 
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20' 
                    : 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/20'
                }`}>
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <p>{statusMessage.text}</p>
                </div>
              )}

              {/* Hierarchical Folder Structure Indicator */}
              <div className="p-3.5 bg-slate-100 dark:bg-gradient-to-r dark:from-slate-950 dark:to-slate-900 rounded-xl border border-slate-300 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                  <FolderCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Struktur Folder Google Drive Otomatis Per Bidang:</span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 pl-6 space-y-0.5">
                  <p className="text-slate-800 dark:text-slate-300">📁 <strong className="text-slate-950 dark:text-white">{activeProjectName || 'PROJECT'}</strong> ➔ 📁 <strong className="text-amber-800 dark:text-amber-300">DESA {selectedRecord.DESA || 'DESA'}</strong> ➔ 📁 <strong className="text-sky-700 dark:text-sky-300">SPAN {selectedRecord.SPAN || 'SPAN'}</strong> ➔ 📁 <strong className="text-emerald-700 dark:text-emerald-300">{selectedRecord.CODE}_{selectedRecord.NAMA || 'PEMILIK'}</strong></p>
                  <p className="text-slate-500 dark:text-slate-400 text-[10px]">└── 📁 1. Dokumentasi Lapangan dan Foto Warga | 📁 2. Berkas | 📁 3. Dokumen | 📁 4. Form Invent</p>
                </div>
              </div>

              {/* 4 Category Navigation Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
                {PARCEL_SUBFOLDERS.map((category) => {
                  const isActive = activeCategoryTab === category;
                  const shortLabel = category === '1. Dokumentasi Lapangan dan Foto Warga' ? '1. Foto Lapangan'
                    : category === '2. Berkas' ? '2. Berkas'
                    : category === '3. Dokumen' ? '3. Dokumen (TTD & Cap)'
                    : '4. Form Invent (PDF)';

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategoryTab(category)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-950/40 dark:text-slate-400 dark:border-white/5 dark:hover:bg-white/5 dark:hover:text-white'
                      }`}
                    >
                      <span className="text-[11px]">{shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category 1: Dokumentasi Lapangan dan Foto Warga */}
              {activeCategoryTab === '1. Dokumentasi Lapangan dan Foto Warga' && (
                <div className="space-y-4 animate-fadeIn max-h-[460px] overflow-y-auto pr-2 scrollbar-thin">
                  <div className="border-b border-slate-200 dark:border-white/5 pb-1">
                    <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Subfolder: 1. Dokumentasi Lapangan dan Foto Warga</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Menyimpan foto dokumentasi kondisi fisik bidang lahan (stempel GPS / raw) dan foto wajah pemilik / patok.</p>
                  </div>
                  {photoSlots.map(renderSlot)}
                </div>
              )}

              {/* Category 2: Berkas */}
              {activeCategoryTab === '2. Berkas' && (
                <div className="space-y-3 animate-fadeIn max-h-[460px] overflow-y-auto pr-2 scrollbar-thin">
                  <div className="border-b border-slate-200 dark:border-white/5 pb-1 mb-2">
                    <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Subfolder: 2. Berkas (KTP, KK, Alas Hak, Surat Kuasa, Waris, dsb.)</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Menyimpan seluruh dokumen identitas kependudukan, sertipikat/alas hak, serta dokumen peralihan hak.</p>
                  </div>
                  {berkasSlots.map(renderSlot)}
                </div>
              )}

              {/* Category 3: Dokumen (Khusus TTD & Cap Desa) */}
              {activeCategoryTab === '3. Dokumen' && (
                <div className="space-y-4 animate-fadeIn max-h-[460px] overflow-y-auto pr-2 scrollbar-thin">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-white/5 pb-2 gap-2">
                    <div>
                      <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Subfolder: 3. Dokumen (7 Tanda Tangan & Cap Desa Resmi)</span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">Tanda tangan ditangkap digital, dicrop ketat (*tightly cropped*), dan diekspor berformat PNG transparan.</p>
                    </div>
                    <span className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20 px-2 py-0.5 rounded self-start sm:self-auto">
                      Matriks 3 × 2 Presisi Android
                    </span>
                  </div>
                  {dokumenSlots.map(renderSlot)}
                </div>
              )}

              {/* Category 4: Form Invent */}
              {activeCategoryTab === '4. Form Invent' && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="p-5 rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 via-white to-amber-50/40 dark:from-amber-500/10 dark:via-slate-900/60 dark:to-slate-900/80 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5">
                        <FileText className="w-6 h-6 text-amber-300" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                          Formulir Inventarisasi Resmi (Hasil Generate PDF)
                          <span className="text-[9px] font-extrabold text-amber-800 bg-amber-100 border border-amber-300 dark:text-amber-400 dark:bg-amber-500/10 px-2 py-0.5 rounded dark:border-amber-500/20">
                            Subfolder: 4. Form Invent
                          </span>
                        </h4>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          Menghasilkan dokumen resmi 4 halaman A4 lengkap dengan identitas pihak berhak, data lahan, rincian bangunan, 30 tanaman produktif, denah sketsa bidang tanah, foto situasi, dan <strong>7 tanda tangan & cap desa resmi</strong> yang telah diinput.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleDownloadPDFDirectly}
                        disabled={isDownloadingPDF || isSavingPDFToDrive}
                        className={`px-4 py-2.5 text-xs font-bold rounded-xl border flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 ${
                          isDownloadingPDF
                            ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-950 dark:text-slate-500 dark:border-white/5 cursor-not-allowed'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-white/20'
                        }`}
                      >
                        {isDownloadingPDF ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
                            Memproses PDF...
                          </>
                        ) : (
                          <>
                            <FileDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            Unduh File PDF Ke Komputer / HP
                          </>
                        )}
                      </button>
                      
                      <button
                        type="button"
                        onClick={handleSavePDFToDrive}
                        disabled={isSavingPDFToDrive}
                        className={`px-5 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 border transition-all cursor-pointer shadow-md active:scale-95 ${
                          isSavingPDFToDrive
                            ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-950 dark:text-slate-500 dark:border-white/5 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-amber-500/40 glow-amber'
                        }`}
                      >
                        {isSavingPDFToDrive ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
                            Menyimpan ke Subfolder Drive...
                          </>
                        ) : (
                          <>
                            <Cloud className="w-4 h-4 text-emerald-950" />
                            Upload Langsung ke Google Drive (Subfolder 4)
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      💡 Informasi Penyimpanan:
                    </span>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                      Ketika Anda menekan tombol <strong>"Upload Langsung ke Google Drive"</strong>, sistem secara otomatis meletakkan file PDF tersebut ke dalam subfolder <code>4. Form Invent</code> di dalam folder bidang ini di Google Drive, sehingga rapi dan siap dicetak kapan saja.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center mt-6">
              * Seluruh berkas otomatis dikelompokkan: <strong>[DESA] ➔ [SPAN] ➔ [KODE BIDANG]</strong> dengan 4 subfolder rapi di Google Drive.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5 shadow-inner">
              <FileText className="w-12 h-12 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Belum Ada Berkas Lahan Terpilih</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Silakan pilih salah satu berkas bidang tanah di daftar sebelah kiri untuk mengunggah dokumen dan tanda tangan ke dalam 4 subfolder Drive yang rapi.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
