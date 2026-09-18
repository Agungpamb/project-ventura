import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  RefreshCw, 
  Eye, 
  ExternalLink, 
  ShieldCheck, 
  GitCompare, 
  ChevronRight, 
  ChevronDown, 
  TreePine, 
  Check, 
  X, 
  Layers,
  Sparkles,
  Info,
  Building,
  HelpCircle,
  FileSpreadsheet,
  ClipboardPaste,
  FileWarning,
  Lightbulb,
  ArrowRight,
  Zap,
  FilePlus,
  Combine,
  CheckCheck,
  MessageSquare,
  Edit3,
  XCircle,
  Clock,
  Shield,
  RotateCcw
} from 'lucide-react';
import { LandRecord } from '../types';
import { 
  parseEsdmPdf, 
  parseEsdmExcel,
  parseEsdmUniversalFile,
  parseEsdmRawText,
  parseEsdmDualFiles,
  mergeEsdmExcelAndPdf,
  getDemoSoborejoEsdmData, 
  EsdmBidangData, 
  EsdmPdfParseResult 
} from '../lib/esdmPdfParser';
import { 
  compareEsdmData, 
  EsdmComparisonItem, 
  EsdmComparisonResult, 
  PlantDiffItem 
} from '../lib/esdmComparison';
import { 
  getStoredEsdmDecisions, 
  saveEsdmDecision, 
  batchSaveEsdmDecisions, 
  getDecisionLabel, 
  EsdmDecisionType, 
  EsdmItemDecision 
} from '../lib/esdmDecisionsStorage';

interface SandingEsdmPanelProps {
  records: LandRecord[];
  role: string;
  activeProjectId?: string;
  activeProjectName?: string;
  userEmail?: string;
  operatorName?: string;
  onNavigateToQC?: () => void;
  onNavigateToSandingGeo?: () => void;
  onNavigateToInput?: (record: LandRecord) => void;
}

export const SandingEsdmPanel: React.FC<SandingEsdmPanelProps> = ({
  records,
  role,
  activeProjectId = 'default',
  activeProjectName = 'Proyek Ventura',
  userEmail = 'operator@ventura.id',
  operatorName = 'Operator',
  onNavigateToQC,
  onNavigateToSandingGeo,
  onNavigateToInput,
}) => {
  // Extract unique Desa list from database records
  const uniqueDesaList = useMemo(() => {
    const desaSet = new Set<string>();
    records.forEach(r => {
      const d = (r.DESA || '').trim();
      if (d) desaSet.add(d.toUpperCase());
    });
    // Ensure SOBOREJO is included if present in sample
    if (desaSet.size === 0) {
      desaSet.add('SOBOREJO');
    }
    return Array.from(desaSet).sort();
  }, [records]);

  // State
  const [selectedDesa, setSelectedDesa] = useState<string>(() => {
    // Default to SOBOREJO if available, otherwise first desa
    if (uniqueDesaList.includes('SOBOREJO')) return 'SOBOREJO';
    return uniqueDesaList[0] || 'SOBOREJO';
  });

  const [esdmData, setEsdmData] = useState<EsdmPdfParseResult | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedExcelBuffer, setUploadedExcelBuffer] = useState<ArrayBuffer | null>(null);
  const [uploadedExcelName, setUploadedExcelName] = useState<string | null>(null);
  const [uploadedPdfBuffer, setUploadedPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
  const [activeExcelSheet, setActiveExcelSheet] = useState<string>('AUTO');
  const [isDragOver, setIsDragOver] = useState(false);

  // Dual/Hybrid File Selection State
  const [hybridExcelFile, setHybridExcelFile] = useState<File | null>(null);
  const [hybridPdfFile, setHybridPdfFile] = useState<File | null>(null);
  
  // Alternative input tab: upload document, hybrid synergy, paste text, or help/OCR guide
  const [activeInputTab, setActiveInputTab] = useState<'upload' | 'hybrid' | 'paste' | 'help'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [errorDetails, setErrorDetails] = useState<{
    isScanned?: boolean;
    isFormatMismatch?: boolean;
    message: string;
    extractedLines?: string[];
  } | null>(null);

  // Filtering states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DISCREPANCY' | 'MATCH' | 'ESDM_ONLY' | 'APP_ONLY' | 'DIFF_LUAS' | 'DIFF_PLANTS'>('ALL');
  const [spanFilter, setSpanFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [tableHeightMode, setTableHeightMode] = useState<'compact' | 'standard' | 'tall'>('standard');

  // Deep inspection modal state
  const [selectedItemForModal, setSelectedItemForModal] = useState<EsdmComparisonItem | null>(null);
  const [modalStatus, setModalStatus] = useState<EsdmDecisionType>('PENDING');
  const [modalNotes, setModalNotes] = useState<string>('');

  // Decisions & Special Notes State
  const [decisions, setDecisions] = useState<Record<string, EsdmItemDecision>>(() => {
    return getStoredEsdmDecisions(activeProjectId, selectedDesa);
  });
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'APPROVED' | 'RETAIN' | 'REJECT' | 'PENDING' | 'HAS_NOTES'>('ALL');

  // Dedicated Note Editing Modal State
  const [editingNoteItem, setEditingNoteItem] = useState<EsdmComparisonItem | null>(null);
  const [noteInputText, setNoteInputText] = useState<string>('');
  const [noteInputStatus, setNoteInputStatus] = useState<EsdmDecisionType>('PENDING');

  // Quick Action Notification Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Reload decisions when selectedDesa or activeProjectId changes
  useEffect(() => {
    setDecisions(getStoredEsdmDecisions(activeProjectId, selectedDesa));
  }, [selectedDesa, activeProjectId]);

  const getItemKey = (item: EsdmComparisonItem): string => {
    return item.id || `${item.span}_${item.nobid}`;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hybridExcelInputRef = useRef<HTMLInputElement>(null);
  const hybridPdfInputRef = useRef<HTMLInputElement>(null);
  const singleAddPdfInputRef = useRef<HTMLInputElement>(null);
  const singleAddExcelInputRef = useRef<HTMLInputElement>(null);

  // Compute comparison whenever selectedDesa, records, or esdmData changes
  const comparisonResult: EsdmComparisonResult | null = useMemo(() => {
    if (!esdmData || !esdmData.bidangList) return null;
    return compareEsdmData(records, esdmData.bidangList, selectedDesa);
  }, [records, esdmData, selectedDesa]);

  // Statistics for Decision Progress
  const decisionStats = useMemo(() => {
    if (!comparisonResult) return { approved: 0, retain: 0, reject: 0, pending: 0, withNotes: 0, total: 0 };
    let approved = 0;
    let retain = 0;
    let reject = 0;
    let pending = 0;
    let withNotes = 0;

    comparisonResult.items.forEach(it => {
      const key = getItemKey(it);
      const d = decisions[key];
      const status = d?.status || 'PENDING';
      if (status === 'APPROVED') approved++;
      else if (status === 'RETAIN') retain++;
      else if (status === 'REJECT') reject++;
      else pending++;

      if (d?.notes && d.notes.trim().length > 0) withNotes++;
    });

    return {
      approved,
      retain,
      reject,
      pending,
      withNotes,
      total: comparisonResult.items.length,
    };
  }, [comparisonResult, decisions]);

  // Handler for setting decision status on a single item (with auto activity log)
  const handleSetDecisionStatus = async (
    item: EsdmComparisonItem,
    newStatus: EsdmDecisionType,
    notesOverride?: string
  ) => {
    const itemKey = getItemKey(item);
    const prev = decisions[itemKey];
    const currentNote = notesOverride !== undefined ? notesOverride : (prev?.notes || '');

    const updated: EsdmItemDecision = {
      itemKey,
      span: item.span,
      nobid: item.nobid,
      desa: item.desa || selectedDesa,
      nama: item.appNama || item.esdmNama || '',
      status: newStatus,
      notes: currentNote,
      updatedAt: Date.now(),
      updatedBy: operatorName || (userEmail ? userEmail.split('@')[0] : 'Operator'),
      userRole: role,
    };

    setDecisions(prevMap => ({
      ...prevMap,
      [itemKey]: updated,
    }));

    await saveEsdmDecision({
      projectId: activeProjectId,
      projectName: activeProjectName,
      decision: updated,
      userEmail,
      operatorName,
      userRole: role,
      logActivity: true,
    });

    const statusLabel = getDecisionLabel(newStatus);
    showToast(`No. Bidang ${item.nobid} (${item.span}) diubah menjadi [${statusLabel}]. Tercatat di Log Aktivitas.`);
  };

  // Open note edit modal
  const handleOpenNoteModal = (item: EsdmComparisonItem) => {
    const itemKey = getItemKey(item);
    const current = decisions[itemKey];
    setEditingNoteItem(item);
    setNoteInputText(current?.notes || '');
    setNoteInputStatus(current?.status || 'PENDING');
  };

  // Save from note edit modal
  const handleSaveNoteModal = async () => {
    if (!editingNoteItem) return;
    const itemKey = getItemKey(editingNoteItem);

    const updated: EsdmItemDecision = {
      itemKey,
      span: editingNoteItem.span,
      nobid: editingNoteItem.nobid,
      desa: editingNoteItem.desa || selectedDesa,
      nama: editingNoteItem.appNama || editingNoteItem.esdmNama || '',
      status: noteInputStatus,
      notes: noteInputText.trim(),
      updatedAt: Date.now(),
      updatedBy: operatorName || (userEmail ? userEmail.split('@')[0] : 'Operator'),
      userRole: role,
    };

    setDecisions(prevMap => ({
      ...prevMap,
      [itemKey]: updated,
    }));

    await saveEsdmDecision({
      projectId: activeProjectId,
      projectName: activeProjectName,
      decision: updated,
      userEmail,
      operatorName,
      userRole: role,
      logActivity: true,
    });

    showToast(`Catatan khusus No. Bidang ${editingNoteItem.nobid} berhasil disimpan dan dicatat ke Log Aktivitas!`);
    setEditingNoteItem(null);
  };

  // Batch approve all items with MATCH status
  const handleBatchApproveMatch = async () => {
    if (!comparisonResult) return;
    const matchItems = comparisonResult.items.filter(it => it.status === 'MATCH');
    if (matchItems.length === 0) {
      showToast('Tidak ada bidang dengan status Cocok Sempurna (MATCH).', 'info');
      return;
    }

    const newDecisions: EsdmItemDecision[] = matchItems.map(it => {
      const itemKey = getItemKey(it);
      const prev = decisions[itemKey];
      return {
        itemKey,
        span: it.span,
        nobid: it.nobid,
        desa: it.desa || selectedDesa,
        nama: it.appNama || it.esdmNama || '',
        status: 'APPROVED',
        notes: prev?.notes || 'Disetujui otomatis: Seluruh parameter (luas, identitas, tanaman) cocok 100%',
        updatedAt: Date.now(),
        updatedBy: operatorName || 'Operator',
        userRole: role,
      };
    });

    const updatedMap = { ...decisions };
    newDecisions.forEach(d => {
      updatedMap[d.itemKey] = d;
    });
    setDecisions(updatedMap);

    await batchSaveEsdmDecisions({
      projectId: activeProjectId,
      projectName: activeProjectName,
      decisions: newDecisions,
      userEmail,
      operatorName,
      userRole: role,
      batchDescription: `Setujui Masal Seluruh Bidang Cocok (${matchItems.length} Bidang) di Desa ${selectedDesa}`,
    });

    showToast(`${matchItems.length} bidang cocok berhasil disetujui (Approved) dan dicatat ke Log Aktivitas!`);
  };

  // Open deep inspection modal with synced decision state
  const handleOpenItemModal = (item: EsdmComparisonItem) => {
    const key = getItemKey(item);
    const existing = decisions[key];
    setModalStatus(existing?.status || 'PENDING');
    setModalNotes(existing?.notes || '');
    setSelectedItemForModal(item);
  };

  // Save decision from deep inspection modal
  const handleSaveModalDecision = async () => {
    if (!selectedItemForModal) return;
    const itemKey = getItemKey(selectedItemForModal);

    const updated: EsdmItemDecision = {
      itemKey,
      span: selectedItemForModal.span,
      nobid: selectedItemForModal.nobid,
      desa: selectedItemForModal.desa || selectedDesa,
      nama: selectedItemForModal.appNama || selectedItemForModal.esdmNama || '',
      status: modalStatus,
      notes: modalNotes.trim(),
      updatedAt: Date.now(),
      updatedBy: operatorName || (userEmail ? userEmail.split('@')[0] : 'Operator'),
      userRole: role,
    };

    setDecisions(prevMap => ({
      ...prevMap,
      [itemKey]: updated,
    }));

    await saveEsdmDecision({
      projectId: activeProjectId,
      projectName: activeProjectName,
      decision: updated,
      userEmail,
      operatorName,
      userRole: role,
      logActivity: true,
    });

    const statusLabel = getDecisionLabel(modalStatus);
    showToast(`Keputusan [${statusLabel}] No. Bidang ${selectedItemForModal.nobid} berhasil disimpan dan dicatat ke Log Aktivitas!`);
  };

  // Available spans in current comparison
  const availableSpans = useMemo(() => {
    if (!comparisonResult) return [];
    const spans = new Set<string>();
    comparisonResult.items.forEach(it => {
      if (it.span && it.span !== '-') spans.add(it.span);
    });
    return Array.from(spans).sort();
  }, [comparisonResult]);

  // Filtered comparison items
  const filteredItems = useMemo(() => {
    if (!comparisonResult) return [];
    return comparisonResult.items.filter(item => {
      // Status filter
      if (statusFilter === 'MATCH' && item.status !== 'MATCH') return false;
      if (statusFilter === 'DISCREPANCY' && item.status !== 'DISCREPANCY') return false;
      if (statusFilter === 'ESDM_ONLY' && item.status !== 'ESDM_ONLY') return false;
      if (statusFilter === 'APP_ONLY' && item.status !== 'APP_ONLY') return false;
      if (statusFilter === 'DIFF_LUAS' && (item.isLuasMatch || item.status === 'APP_ONLY' || item.status === 'ESDM_ONLY')) return false;
      if (statusFilter === 'DIFF_PLANTS' && (item.isTanamanMatch || item.status === 'APP_ONLY' || item.status === 'ESDM_ONLY')) return false;

      // Decision filter
      const itemKey = getItemKey(item);
      const dec = decisions[itemKey];
      const decStatus = dec?.status || 'PENDING';
      if (decisionFilter === 'APPROVED' && decStatus !== 'APPROVED') return false;
      if (decisionFilter === 'RETAIN' && decStatus !== 'RETAIN') return false;
      if (decisionFilter === 'REJECT' && decStatus !== 'REJECT') return false;
      if (decisionFilter === 'PENDING' && decStatus !== 'PENDING') return false;
      if (decisionFilter === 'HAS_NOTES' && (!dec?.notes || !dec.notes.trim())) return false;

      // Span filter
      if (spanFilter !== 'ALL' && item.span !== spanFilter) return false;

      // Keyword search (includes notes)
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase();
        const inSpan = item.span.toLowerCase().includes(q);
        const inNobid = item.nobid.toLowerCase().includes(q);
        const inNamaApp = item.appNama.toLowerCase().includes(q);
        const inNamaEsdm = item.esdmNama.toLowerCase().includes(q);
        const inNikApp = item.appNik.toLowerCase().includes(q);
        const inNikEsdm = item.esdmNik.toLowerCase().includes(q);
        const inNotes = (dec?.notes || '').toLowerCase().includes(q);
        if (!inSpan && !inNobid && !inNamaApp && !inNamaEsdm && !inNikApp && !inNikEsdm && !inNotes) {
          return false;
        }
      }

      return true;
    });
  }, [comparisonResult, statusFilter, spanFilter, searchKeyword, decisionFilter, decisions]);

  // Helper to execute dual file parsing and synergy
  const executeDualSynergy = async (
    excelBuf: ArrayBuffer,
    pdfBuf: ArrayBuffer,
    excelName: string,
    pdfName: string
  ) => {
    setIsLoadingPdf(true);
    setPdfError(null);
    setErrorDetails(null);
    setUploadedFileName(`${excelName} + ${pdfName}`);
    setUploadedExcelBuffer(excelBuf);
    setUploadedExcelName(excelName);
    setUploadedPdfBuffer(pdfBuf);
    setUploadedPdfName(pdfName);

    try {
      const result = await parseEsdmDualFiles(
        excelBuf,
        pdfBuf,
        selectedDesa,
        activeExcelSheet,
        excelName,
        pdfName
      );
      setEsdmData(result);

      if (result.metadata.desa && result.metadata.desa.toUpperCase() !== selectedDesa) {
        const detectedDesaUpper = result.metadata.desa.toUpperCase();
        if (uniqueDesaList.includes(detectedDesaUpper)) {
          setSelectedDesa(detectedDesaUpper);
        }
      }
    } catch (err: any) {
      console.error('Error executing dual synergy:', err);
      const errMsg = err.message || 'Gagal menyandingkan file Excel dan PDF';
      setPdfError(errMsg);
      setErrorDetails({
        isScanned: err.isScanned,
        isFormatMismatch: err.isFormatMismatch,
        message: errMsg,
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Handle document upload (supports single file or multiple files dropped together)
  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files || files.length === 0) return;

    // Check if user dropped / uploaded both an Excel and a PDF file simultaneously!
    const excelFile = files.find(f => {
      const n = f.name.toLowerCase();
      return n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv');
    });
    const pdfFile = files.find(f => f.name.toLowerCase().endsWith('.pdf'));

    if (excelFile && pdfFile) {
      // DUAL SYNERGY UPLOAD DETECTED!
      try {
        const [excelBuf, pdfBuf] = await Promise.all([
          excelFile.arrayBuffer(),
          pdfFile.arrayBuffer()
        ]);
        await executeDualSynergy(excelBuf, pdfBuf, excelFile.name, pdfFile.name);
        return;
      } catch (err: any) {
        console.error('Error reading dual files:', err);
        setPdfError('Gagal membaca file yang diunggah.');
        return;
      }
    }

    // Otherwise handle single file
    const file = files[0];
    const lowerName = file.name.toLowerCase();
    const isValidExt = lowerName.endsWith('.pdf') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');
    if (!isValidExt) {
      setPdfError('Format file tidak didukung. Harap unggah file PDF (.pdf), Excel (.xlsx / .xls), atau CSV (.csv).');
      setErrorDetails(null);
      return;
    }

    setIsLoadingPdf(true);
    setPdfError(null);
    setErrorDetails(null);
    setUploadedFileName(file.name);

    try {
      let result: EsdmPdfParseResult;
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
        const buffer = await file.arrayBuffer();
        setUploadedExcelBuffer(buffer);
        setUploadedExcelName(file.name);
        setActiveExcelSheet('AUTO');

        // If a PDF buffer was previously loaded, automatically fuse them!
        if (uploadedPdfBuffer) {
          result = await parseEsdmDualFiles(
            buffer,
            uploadedPdfBuffer,
            selectedDesa,
            'AUTO',
            file.name,
            uploadedPdfName || 'dokumen.pdf'
          );
        } else {
          result = await parseEsdmExcel(buffer, selectedDesa, 'AUTO');
        }
      } else {
        const buffer = await file.arrayBuffer();
        setUploadedPdfBuffer(buffer);
        setUploadedPdfName(file.name);

        // If an Excel buffer was previously loaded, automatically fuse them!
        if (uploadedExcelBuffer) {
          result = await parseEsdmDualFiles(
            uploadedExcelBuffer,
            buffer,
            selectedDesa,
            activeExcelSheet,
            uploadedExcelName || 'data.xlsx',
            file.name
          );
        } else {
          result = await parseEsdmUniversalFile(file, selectedDesa);
        }
      }

      setEsdmData(result);

      if (result.metadata.desa && result.metadata.desa.toUpperCase() !== selectedDesa) {
        const detectedDesaUpper = result.metadata.desa.toUpperCase();
        if (uniqueDesaList.includes(detectedDesaUpper)) {
          setSelectedDesa(detectedDesaUpper);
        }
      }
    } catch (err: any) {
      console.error('Error parsing ESDM file:', err);
      const errMsg = err.message || 'Format tidak dikenali';
      setPdfError(errMsg);
      setErrorDetails({
        isScanned: err.isScanned,
        isFormatMismatch: err.isFormatMismatch,
        message: errMsg,
        extractedLines: err.extractedLines,
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Add PDF to enrich existing Excel
  const handleFuseWithPdf = async (pdfFile: File) => {
    if (!uploadedExcelBuffer) {
      setPdfError('File Excel belum dimuat.');
      return;
    }
    try {
      const pdfBuf = await pdfFile.arrayBuffer();
      await executeDualSynergy(
        uploadedExcelBuffer,
        pdfBuf,
        uploadedExcelName || 'Data_ESDM.xlsx',
        pdfFile.name
      );
    } catch (err: any) {
      setPdfError(err.message || 'Gagal memproses file PDF pendukung.');
    }
  };

  // Add Excel to strengthen existing PDF
  const handleFuseWithExcel = async (excelFile: File) => {
    if (!uploadedPdfBuffer) {
      setPdfError('File PDF belum dimuat.');
      return;
    }
    try {
      const excelBuf = await excelFile.arrayBuffer();
      await executeDualSynergy(
        excelBuf,
        uploadedPdfBuffer,
        excelFile.name,
        uploadedPdfName || 'Dokumen_ESDM.pdf'
      );
    } catch (err: any) {
      setPdfError(err.message || 'Gagal memproses file Excel pendukung.');
    }
  };

  // Handle switching between sheets in a multi-sheet Excel file
  const handleSwitchSheet = async (sheetTarget: string) => {
    if (!uploadedExcelBuffer) return;
    setIsLoadingPdf(true);
    setPdfError(null);

    try {
      let res: EsdmPdfParseResult;
      if (uploadedPdfBuffer) {
        res = await parseEsdmDualFiles(
          uploadedExcelBuffer,
          uploadedPdfBuffer,
          selectedDesa,
          sheetTarget,
          uploadedExcelName || 'Data_ESDM.xlsx',
          uploadedPdfName || 'Dokumen_ESDM.pdf'
        );
      } else {
        res = await parseEsdmExcel(uploadedExcelBuffer, selectedDesa, sheetTarget);
      }
      setEsdmData(res);
      setActiveExcelSheet(sheetTarget);
    } catch (err: any) {
      console.error('Error switching sheet:', err);
      setPdfError(err.message || 'Gagal memuat sheet yang dipilih.');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Handle processing pasted raw text
  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      setPdfError('Harap masukkan atau tempel teks data ESDM terlebih dahulu ke kotak isian.');
      return;
    }

    setIsLoadingPdf(true);
    setPdfError(null);
    setErrorDetails(null);

    try {
      const result = parseEsdmRawText(pastedText, selectedDesa);
      setEsdmData(result);
      setUploadedFileName('Teks_Ditempel_Manual.txt');
    } catch (err: any) {
      console.error('Error parsing pasted text:', err);
      const errMsg = err.message || 'Format teks tidak dikenali';
      setPdfError(errMsg);
      setErrorDetails({
        message: errMsg,
      });
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Pre-fill sample pasted text
  const handleFillSamplePastedText = () => {
    const sample = `DAFTAR NOMINATIF INVENTARISASI TANAH, BANGUNAN DAN/ATAU TANAMAN
PROYEK: SUTT 150 KV KABUPATEN PURWOREJO KECAMATAN BUTUH DESA SOBOREJO

1 T.45 - T.46 1 Pemilik Diketahui PT. Perkebunan Nusantara I Regional 3
3322083112550030 MURDANTO KARET 10 469 0 0 0
6.665,00 Perkebunan Aset Badan Usaha Milik Negara

2 T.45 - T.46 2 Pemilik Diketahui SUHARNO
3322081504780001 SUHARNO KELAPA 0 5 0 0 0
350,00 Pekarangan Tanah Masyarakat`;
    setPastedText(sample);
  };

  // Load Demo Data for Soborejo
  const handleLoadDemoSoborejo = () => {
    setSelectedDesa('SOBOREJO');
    setPdfError(null);
    setUploadedFileName('DAFTAR_NOMINATIF_ESDM_SOBOREJO_SUTT150KV.pdf');
    setIsLoadingPdf(true);
    setTimeout(() => {
      const demo = getDemoSoborejoEsdmData();
      setEsdmData(demo);
      setIsLoadingPdf(false);
    }, 400);
  };

  // Export CSV of discrepancies
  const handleExportCsv = () => {
    if (!comparisonResult) return;

    const headers = [
      'No',
      'Desa',
      'Span',
      'No Bidang',
      'Status Sanding',
      'Keputusan Crosscheck',
      'Catatan Khusus',
      'Evaluator',
      'Waktu Evaluasi',
      'Catatan Selisih',
      'Nama (Data Kita)',
      'Nama (ESDM)',
      'NIK (Data Kita)',
      'NIK (ESDM)',
      'Luas (Data Kita)',
      'Luas (ESDM)',
      'Selisih Luas (m2)',
      'Alas Hak (Data Kita)',
      'Alas Hak (ESDM)',
      'Total Pohon (Data Kita)',
      'Total Pohon (ESDM)',
      'Selisih Pohon'
    ];

    const rows = comparisonResult.items.map((it, idx) => {
      const key = getItemKey(it);
      const dec = decisions[key];
      const decStatusLabel = getDecisionLabel(dec?.status || 'PENDING');
      const cleanNotes = (dec?.notes || '').replace(/"/g, '""');
      const evaluator = dec?.updatedBy || '-';
      const evalDate = dec?.updatedAt ? new Date(dec.updatedAt).toLocaleString('id-ID') : '-';

      return [
        idx + 1,
        `"${it.desa}"`,
        `"${it.span}"`,
        `"${it.nobid}"`,
        `"${it.status}"`,
        `"${decStatusLabel}"`,
        `"${cleanNotes}"`,
        `"${evaluator}"`,
        `"${evalDate}"`,
        `"${it.discrepancyReasons.join('; ')}"`,
        `"${it.appNama}"`,
        `"${it.esdmNama}"`,
        `'${it.appNik}`,
        `'${it.esdmNik}`,
        it.appLuas,
        it.esdmLuas,
        it.diffLuas,
        `"${it.appJenisHak} - ${it.appNomerHak}"`,
        `"${it.esdmJenisHak} - ${it.esdmNomerHak}"`,
        it.appTotalTanaman,
        it.esdmTotalTanaman,
        it.diffTanaman
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sanding_ESDM_${selectedDesa}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Summary
  const handlePrint = () => {
    window.print();
  };

  // Count records for currently selected Desa in database
  const countInDatabase = useMemo(() => {
    return records.filter(r => (r.DESA || '').trim().toUpperCase() === selectedDesa).length;
  }, [records, selectedDesa]);

  return (
    <div className="space-y-6 pb-12" id="sip_sanding_esdm_panel">
      {/* 1. Header & Navigation breadcrumb */}
      <div className="glass-card p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-white/10 bg-gradient-to-r from-slate-900/90 via-amber-950/20 to-slate-900/90">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Quality Control & Rekonsiliasi Dokumen
            </span>
            <span className="text-xs text-slate-400 font-medium">• {activeProjectName}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5 font-sans">
            <GitCompare className="w-6 h-6 text-amber-400 shrink-0" />
            QC 3.2: Sanding Data ESDM (PDF vs Data Tim)
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
            Komparasi otomatis antara hasil ekspor resmi <strong>Daftar Nominatif Inventarisasi ESDM (PDF)</strong> dengan <strong>Master Data Aplikasi / Google Sheets</strong> per desa untuk mendeteksi selisih luas tanah, nama, NIK, dan jumlah tanaman.
          </p>
        </div>

        {/* Quick links to sibling QC views */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigateToQC && (
            <button
              onClick={onNavigateToQC}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              Menu 3: Verifikasi
            </button>
          )}

          {onNavigateToSandingGeo && (
            <button
              onClick={onNavigateToSandingGeo}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-amber-400" />
              Menu 3.1: Sanding Peta
            </button>
          )}

          <div className="px-3 py-1.5 bg-amber-500/30 text-amber-200 text-xs font-bold rounded-xl border border-amber-500/40 flex items-center gap-1.5 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            3.2: Sanding ESDM (Aktif)
          </div>
        </div>
      </div>

      {/* 2. Step 1 & Step 2: Controls & Upload Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Desa Selection Card */}
        <div className="lg:col-span-4 glass-card p-5 rounded-2xl shadow-xl border border-white/10 bg-slate-900/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 inline-flex items-center justify-center text-xs font-extrabold border border-amber-500/30">1</span>
                Pilih Desa Target
              </span>
              <span className="text-[11px] text-slate-400">PDF ESDM per Desa</span>
            </div>

            <label className="block text-xs font-medium text-slate-300 mb-2">
              Desa yang akan disandingkan:
            </label>

            <select
              value={selectedDesa}
              onChange={(e) => setSelectedDesa(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-white text-sm font-semibold focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all cursor-pointer"
            >
              {uniqueDesaList.map(desa => {
                const count = records.filter(r => (r.DESA || '').trim().toUpperCase() === desa).length;
                return (
                  <option key={desa} value={desa}>
                    Desa {desa} ({count} bidang di aplikasi)
                  </option>
                );
              })}
            </select>

            <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Database Aplikasi:</span>
                <span className="font-bold text-white">{countInDatabase} Bidang</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Status File ESDM:</span>
                <span className={esdmData ? "font-bold text-emerald-400" : "text-amber-400 font-medium"}>
                  {esdmData ? `${esdmData.bidangList.length} Bidang Dimuat` : 'Belum Ada File'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5">
            <button
              onClick={handleLoadDemoSoborejo}
              className="w-full py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-semibold rounded-xl border border-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              title="Gunakan 24 bidang hasil ekspor resmi ESDM Desa Soborejo untuk langsung menguji fitur"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Gunakan Contoh Dokumen ESDM Soborejo (24 Bidang)
            </button>
          </div>
        </div>

        {/* Multi-Format Input Card */}
        <div className="lg:col-span-8 glass-card p-5 rounded-2xl shadow-xl border border-white/10 bg-slate-900/60 flex flex-col justify-between">
          <div>
            {/* Header with Sub-tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/5">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 inline-flex items-center justify-center text-xs font-extrabold border border-amber-500/30">2</span>
                Input Data ESDM (PDF / Excel / Teks)
              </span>

              {/* Mode Selection Tabs */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setActiveInputTab('upload')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeInputTab === 'upload'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload Berkas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputTab('hybrid')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeInputTab === 'hybrid'
                      ? 'bg-gradient-to-r from-emerald-600 to-amber-600 text-white shadow-sm shadow-emerald-500/20'
                      : 'text-emerald-400 hover:text-white hover:bg-emerald-500/10'
                  }`}
                  title="Upload file Excel dan PDF sekaligus untuk mendapatkan presisi angka 100% dan legalitas alas hak resmi"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  Sinergi Hibrida (Excel + PDF)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputTab('paste')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeInputTab === 'paste'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Tempel Teks
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputTab('help')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                    activeInputTab === 'help'
                      ? 'bg-amber-600/40 text-amber-200 border border-amber-500/30'
                      : 'text-slate-400 hover:text-amber-300 hover:bg-white/5'
                  }`}
                  title="Panduan jika file PDF Anda tidak terbaca / hasil scan"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Bantuan
                </button>
              </div>
            </div>

            {/* Hidden Inputs for Adding Companion Files */}
            <input 
              type="file" 
              ref={singleAddPdfInputRef} 
              accept=".pdf" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFuseWithPdf(e.target.files[0]);
                }
              }} 
            />
            <input 
              type="file" 
              ref={singleAddExcelInputRef} 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFuseWithExcel(e.target.files[0]);
                }
              }} 
            />

            {/* TAB 1: File Upload (PDF, Excel, CSV, or Multi-Drop) */}
            {activeInputTab === 'upload' && (
              <div className="space-y-3">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesUpload(e.target.files);
                    }
                  }} 
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesUpload(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    isDragOver 
                      ? 'border-amber-400 bg-amber-500/10 scale-[1.005]' 
                      : 'border-slate-700 hover:border-amber-500 hover:bg-white/5'
                  }`}
                >
                  {isLoadingPdf ? (
                    <div className="py-3 flex flex-col items-center gap-2">
                      <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
                      <span className="text-sm font-semibold text-white">Membaca dan menyandingkan data ESDM...</span>
                      <span className="text-xs text-slate-400">Memproses tower span, nomor bidang, luas tanah, tanaman, dan bangunan...</span>
                    </div>
                  ) : esdmData ? (
                    <div className="py-2 flex flex-col items-center gap-1.5 w-full">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 inline-flex items-center justify-center border border-emerald-500/30">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap justify-center">
                        <span>Data ESDM Berhasil Dimuat:</span>
                        <span className="text-emerald-400 font-mono">{esdmData.bidangList.length} Bidang Terdeteksi</span>
                        {esdmData.metadata.sourceType === 'HYBRID' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-emerald-500/30 to-amber-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-400" />
                            SINERGI HIBRIDA (Excel + PDF)
                          </span>
                        ) : esdmData.metadata.sourceType ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {esdmData.metadata.sourceType}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap items-center justify-center gap-2 mt-0.5">
                        <span>File: <strong className="text-white font-mono">{uploadedFileName || 'dokumen'}</strong></span>
                        <span>•</span>
                        <span>Desa: <strong className="text-amber-300">{esdmData.metadata.desa || selectedDesa}</strong></span>
                        <span>•</span>
                        <span>{esdmData.metadata.totalTanamanCount} tanaman terdata</span>
                      </div>
                      <span className="text-[11px] text-amber-400 underline mt-1.5 font-medium">
                        Klik untuk mengganti berkas atau pilih berkas lain
                      </span>
                    </div>
                  ) : (
                    <div className="py-2 flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 inline-flex items-center justify-center border border-amber-500/30">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-bold text-white">
                        Tarik & Lepas File ke sini, atau <span className="text-amber-400 underline">Pilih File</span>
                      </div>
                      <div className="text-xs text-slate-400 max-w-lg leading-relaxed">
                        Pilih file <strong>PDF (.pdf)</strong> resmi ESDM, file <strong>Excel (.xlsx / .csv)</strong>, atau <strong>pilih kedua file sekaligus</strong> untuk Mode Sinergi Hibrida.
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-slate-300 font-mono">.PDF</span>
                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300 font-mono">.XLSX</span>
                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-300 font-mono">.XLS</span>
                        <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-300 font-mono">.CSV</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Companion File Quick Synergy Action when only one source is currently loaded */}
                {esdmData && esdmData.metadata.sourceType !== 'HYBRID' && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-slate-900/90 via-amber-950/20 to-slate-900/90 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30 shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="text-xs">
                        {esdmData.metadata.sourceType === 'EXCEL' ? (
                          <>
                            <span className="font-bold text-white">Ingin melengkapi Alas Hak & Alamat dari PDF?</span>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                              Gabungkan dengan file PDF resmi ESDM untuk menyematkan nomor sertifikat/sporadik secara otomatis.
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="font-bold text-white">Ingin menjamin akurasi 100% dan meringankan beban PDF?</span>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                              Gabungkan dengan file Excel untuk memastikan angka luas, tanaman, dan bangunan terbaca presisi tanpa distorsi OCR.
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {esdmData.metadata.sourceType === 'EXCEL' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            singleAddPdfInputRef.current?.click();
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs font-bold rounded-lg shadow transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FilePlus className="w-3.5 h-3.5" />
                          + Tambah Berkas PDF
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            singleAddExcelInputRef.current?.click();
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          + Tambah Berkas Excel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Dedicated Dual/Hybrid Synergy Workspace */}
            {activeInputTab === 'hybrid' && (
              <div className="space-y-3.5">
                <input 
                  type="file" 
                  ref={hybridExcelInputRef} 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setHybridExcelFile(e.target.files[0]);
                    }
                  }} 
                />
                <input 
                  type="file" 
                  ref={hybridPdfInputRef} 
                  accept=".pdf" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setHybridPdfFile(e.target.files[0]);
                    }
                  }} 
                />

                <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Konsep Sinergi Hibrida (Sangar & Tanpa Beban):</strong>{' '}
                    File Excel bertindak sebagai <strong>tulang punggung presisi numerik</strong> (luas m², tabel tanaman BM/SM/K/S/B, bangunan) sehingga PDF tidak terbebani membaca jutaan angka. File PDF bertindak sebagai <strong>penguat legalitas</strong> (nomor sertifikat/sporadik & verifikasi silang).
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Slot 1: Excel File */}
                  <div 
                    onClick={() => hybridExcelInputRef.current?.click()}
                    className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center text-center justify-between gap-3 ${
                      hybridExcelFile || uploadedExcelBuffer
                        ? 'border-emerald-500 bg-emerald-950/20'
                        : 'border-slate-700 hover:border-emerald-500/60 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        1. Berkas Excel (Presisi Angka)
                      </span>
                      <p className="text-[11px] text-slate-400 max-w-xs">
                        Format .xlsx / .xls / .csv (Rekap Nominatif, Tanaman, Bangunan)
                      </p>
                    </div>

                    {hybridExcelFile ? (
                      <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs font-mono font-semibold truncate max-w-full">
                        ✓ {hybridExcelFile.name}
                      </div>
                    ) : uploadedExcelBuffer ? (
                      <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs font-mono font-semibold truncate max-w-full">
                        ✓ {uploadedExcelName || 'Excel Telah Dimuat'}
                      </div>
                    ) : (
                      <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-medium">
                        Klik untuk Memilih File Excel
                      </span>
                    )}
                  </div>

                  {/* Slot 2: PDF File */}
                  <div 
                    onClick={() => hybridPdfInputRef.current?.click()}
                    className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center text-center justify-between gap-3 ${
                      hybridPdfFile || uploadedPdfBuffer
                        ? 'border-amber-500 bg-amber-950/20'
                        : 'border-slate-700 hover:border-amber-500/60 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        2. Berkas PDF (Legalitas & Alas Hak)
                      </span>
                      <p className="text-[11px] text-slate-400 max-w-xs">
                        Format .pdf resmi ESDM (Alas Hak, Sertifikat, Alamat RT/RW)
                      </p>
                    </div>

                    {hybridPdfFile ? (
                      <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-300 text-xs font-mono font-semibold truncate max-w-full">
                        ✓ {hybridPdfFile.name}
                      </div>
                    ) : uploadedPdfBuffer ? (
                      <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-300 text-xs font-mono font-semibold truncate max-w-full">
                        ✓ {uploadedPdfName || 'PDF Telah Dimuat'}
                      </div>
                    ) : (
                      <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-medium">
                        Klik untuk Memilih File PDF
                      </span>
                    )}
                  </div>
                </div>

                {/* Execute Hybrid Button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-slate-400">
                    Keduanya akan dipasangkan berdasarkan Span Tower, No Bidang, dan NIK secara otomatis.
                  </span>

                  <button
                    type="button"
                    disabled={
                      isLoadingPdf || 
                      (!hybridExcelFile && !uploadedExcelBuffer) || 
                      (!hybridPdfFile && !uploadedPdfBuffer)
                    }
                    onClick={async () => {
                      try {
                        const excelBuf = hybridExcelFile 
                          ? await hybridExcelFile.arrayBuffer() 
                          : uploadedExcelBuffer!;
                        const pdfBuf = hybridPdfFile 
                          ? await hybridPdfFile.arrayBuffer() 
                          : uploadedPdfBuffer!;
                        const excelName = hybridExcelFile ? hybridExcelFile.name : (uploadedExcelName || 'Data.xlsx');
                        const pdfName = hybridPdfFile ? hybridPdfFile.name : (uploadedPdfName || 'Dokumen.pdf');
                        await executeDualSynergy(excelBuf, pdfBuf, excelName, pdfName);
                      } catch (err: any) {
                        setPdfError(err.message || 'Gagal memproses kedua berkas.');
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-amber-600 to-amber-700 hover:from-emerald-500 hover:to-amber-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    {isLoadingPdf ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 text-amber-300" />
                    )}
                    Jalankan Sinergi Hibrida Sekarang
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Text / Excel Paste */}
            {activeInputTab === 'paste' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                    Tempel Isi Tabel / Teks dari PDF atau Excel:
                  </label>
                  <button
                    type="button"
                    onClick={handleFillSamplePastedText}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer"
                  >
                    Isi Contoh Teks
                  </button>
                </div>

                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Buka PDF di pembaca PDF (Adobe / Chrome) atau buka Excel, salin baris tabel nominatif (Ctrl+A lalu Ctrl+C), kemudian tempel di sini (Ctrl+V)..."
                  rows={5}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none transition-all leading-relaxed"
                />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400">
                    Sistem otomatis mengenali Tower Span (misal T.45 - T.46), nomor bidang, luas tanah, dan pohon.
                  </span>
                  <button
                    type="button"
                    onClick={handleProcessPastedText}
                    disabled={isLoadingPdf || !pastedText.trim()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-md shadow-amber-600/20"
                  >
                    {isLoadingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Proses Teks ESDM
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: Help & OCR Conversion Guide */}
            {activeInputTab === 'help' && (
              <div className="p-4 bg-slate-800/60 rounded-xl border border-white/10 space-y-3.5 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-white text-sm">Apakah PDF Perlu Dikonversi Dulu?</h3>
                    <p className="mt-1 leading-relaxed text-slate-300">
                      Jawabannya tergantung pada <strong>jenis PDF</strong> yang Anda miliki:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      1. PDF Digital Asli (TIDAK PERLU KONVERSI)
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Jika PDF di-download langsung dari website resmi ESDM atau sistem PLN, teks di dalamnya adalah teks digital. Bisa <strong>langsung di-upload</strong> ke tombol Upload tanpa diubah sama sekali.
                    </p>
                  </div>

                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                      <FileWarning className="w-4 h-4" />
                      2. PDF Scan / Foto (PERLU DIKONVERSI)
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Jika PDF merupakan hasil cetakan kertas yang difoto atau di-scan menggunakan scanner/printer fisik, komputer hanya melihatnya sebagai gambar foto tanpa teks. Untuk PDF jenis ini, <strong>konversikan ke Excel (.xlsx)</strong> terlebih dahulu.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5">
                  <div className="font-bold text-amber-300">Cara Cepat Konversi PDF Scan ke Excel (Gratis):</div>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                    <li>Buka browser dan kunjungi <a href="https://www.ilovepdf.com/id/pdf-ke-excel" target="_blank" rel="noreferrer" className="text-amber-400 underline font-semibold">iLovePDF PDF ke Excel</a> atau Adobe Acrobat Converter.</li>
                    <li>Aktifkan fitur OCR (Pengenalan Teks Optik) jika dokumen Anda hasil scan fisik.</li>
                    <li>Download hasil file <strong>.xlsx</strong>-nya, lalu upload langsung ke tab <strong>Upload Dokumen</strong> di aplikasi ini.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          {/* Diagnostic Alert Box */}
          {pdfError && (
            <div className="mt-3.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs space-y-2">
              <div className="flex items-start gap-2.5 text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="font-semibold text-red-200">
                    {errorDetails?.isScanned ? 'Dokumen Terdeteksi Sebagai File Scan / Gambar (Tanpa Teks Digital)' : 'Perhatian Saat Membaca Dokumen ESDM:'}
                  </strong>
                  <p className="mt-0.5 leading-relaxed text-slate-300">
                    {pdfError}
                  </p>
                </div>
              </div>

              {errorDetails?.isScanned && (
                <div className="pl-6.5 pt-2 border-t border-red-500/20 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveInputTab('help')}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold rounded-lg border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    Lihat Cara Konversi ke Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveInputTab('paste')}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Coba Tempel Teks Manual
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadDemoSoborejo}
                    className="px-3 py-1.5 bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 text-xs font-semibold rounded-lg border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Uji dengan Demo Soborejo (24 Bidang)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sinergi Hibrida (Excel + PDF) Status Banner */}
      {esdmData?.metadata?.sourceType === 'HYBRID' && esdmData.metadata.hybridSummary && (
        <div className="glass-card rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-slate-900/95 via-emerald-950/40 to-slate-900/95 p-4.5 space-y-3.5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500/30 to-amber-500/30 text-emerald-300 border border-emerald-500/50 text-xs font-extrabold flex items-center gap-1.5 shadow-sm">
                <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
                Sinergi Hibrida Sukses (Excel + PDF)
              </span>
              <span className="text-xs text-slate-300 hidden sm:inline">
                Akurasi 100% dari Excel • Legalitas & Alas Hak Resmi dari PDF
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-emerald-400 font-bold">
                {esdmData.metadata.hybridSummary.matchedCount} dari {esdmData.metadata.hybridSummary.excelBidangCount} Bidang Terhubung Sempurna
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Box 1: Excel Backbone */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-emerald-500/20 flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Tulang Punggung (Excel)</span>
                <div className="font-semibold text-white truncate text-xs mt-0.5" title={esdmData.metadata.hybridSummary.excelFileName}>
                  {esdmData.metadata.hybridSummary.excelFileName}
                </div>
                <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                  {esdmData.metadata.hybridSummary.excelBidangCount} Bidang Presisi
                </div>
              </div>
            </div>

            {/* Box 2: PDF Legal */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-amber-500/20 flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Legalitas Resmi (PDF)</span>
                <div className="font-semibold text-white truncate text-xs mt-0.5" title={esdmData.metadata.hybridSummary.pdfFileName}>
                  {esdmData.metadata.hybridSummary.pdfFileName}
                </div>
                <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                  {esdmData.metadata.totalPages} Halaman Resmi ESDM
                </div>
              </div>
            </div>

            {/* Box 3: Enriched Alas Hak */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-purple-500/20 flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Alas Hak / Sertifikat</span>
                <div className="font-bold text-purple-200 text-xs mt-0.5">
                  +{esdmData.metadata.hybridSummary.enrichedAlasHakCount} Dilengkapi dari PDF
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Otomatis tersemat ke setiap bidang
                </div>
              </div>
            </div>

            {/* Box 4: Cross-Check Audit */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-amber-500/20 flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                <GitCompare className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Hasil Audit Silang</span>
                <div className="font-bold text-xs mt-0.5">
                  {esdmData.metadata.hybridSummary.discrepancyCount === 0 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5" /> 100% Selaras (Excel = PDF)
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      {esdmData.metadata.hybridSummary.discrepancyCount} Perbedaan Tercatat
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {esdmData.metadata.hybridSummary.discrepancyCount === 0 
                    ? 'Tidak ada anomali angka' 
                    : 'Detail selisih ditandai pada tabel'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Sheet Selector Banner if Excel has multiple sheets (e.g., 3 sheets: Tanah, Bangunan, Tanaman) */}
      {esdmData?.metadata.sheetNames && esdmData.metadata.sheetNames.length > 1 && (
        <div className="glass-card rounded-2xl border border-amber-500/30 bg-gradient-to-r from-slate-900/90 via-amber-950/20 to-slate-900/90 p-4 space-y-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>File Excel Memiliki {esdmData.metadata.sheetNames.length} Lembar Kerja (Sheets)</span>
                  {esdmData.metadata.isMergedFromSheets && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ⚡ Tergabung Otomatis
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {esdmData.metadata.mergeNote || `Sheet aktif: ${esdmData.metadata.activeSheet || 'Semua'}`}
                </p>
              </div>
            </div>

            {/* Interactive Sheet Switcher Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium mr-1">Tampilan:</span>
              <button
                type="button"
                onClick={() => handleSwitchSheet('AUTO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeExcelSheet === 'AUTO' || esdmData.metadata.isMergedFromSheets
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-600/20 ring-1 ring-amber-400'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Gabungan Otomatis
              </button>

              {esdmData.metadata.sheetNames.map((sName) => {
                const detail = esdmData.metadata.sheetDetails?.find(d => d.name === sName);
                const isActive = activeExcelSheet === sName;
                return (
                  <button
                    key={sName}
                    type="button"
                    onClick={() => handleSwitchSheet(sName)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                    }`}
                  >
                    <span>{sName}</span>
                    {detail?.type && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/30 uppercase tracking-wider text-slate-200">
                        {detail.type}
                      </span>
                    )}
                    {detail?.rowCount ? (
                      <span className="text-[9px] opacity-75">
                        ({detail.rowCount} baris)
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Comparison KPI Metric Cards */}
      {comparisonResult && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Card 1: Total Bidang ESDM */}
          <div className="glass-card p-4 rounded-xl border border-white/10 bg-slate-900/70">
            <div className="text-[11px] text-slate-400 font-medium">Total Bidang ESDM</div>
            <div className="text-2xl font-bold text-white mt-1">
              {comparisonResult.summary.totalEsdmBidang}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              PDF Desa {selectedDesa}
            </div>
          </div>

          {/* Card 2: Total Bidang Data Kita */}
          <div className="glass-card p-4 rounded-xl border border-white/10 bg-slate-900/70">
            <div className="text-[11px] text-slate-400 font-medium">Bidang Data Kita</div>
            <div className="text-2xl font-bold text-amber-300 mt-1">
              {comparisonResult.summary.totalAppBidang}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Database Aplikasi
            </div>
          </div>

          {/* Card 3: Cocok Sempurna */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'MATCH' ? 'ALL' : 'MATCH')}
            className={`glass-card p-4 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'MATCH' 
                ? 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500' 
                : 'border-emerald-500/30 bg-emerald-950/10 hover:bg-emerald-950/20'
            }`}
          >
            <div className="text-[11px] text-emerald-300 font-medium flex items-center justify-between">
              <span>Cocok Sempurna</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {comparisonResult.summary.matchCount}
            </div>
            <div className="text-[11px] text-emerald-300/70 mt-0.5">
              100% Identik
            </div>
          </div>

          {/* Card 4: Ada Selisih */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'DISCREPANCY' ? 'ALL' : 'DISCREPANCY')}
            className={`glass-card p-4 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'DISCREPANCY' 
                ? 'border-amber-500 bg-amber-950/40 ring-1 ring-amber-500' 
                : 'border-amber-500/30 bg-amber-950/10 hover:bg-amber-950/20'
            }`}
          >
            <div className="text-[11px] text-amber-300 font-medium flex items-center justify-between">
              <span>Ada Selisih</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {comparisonResult.summary.discrepancyCount}
            </div>
            <div className="text-[11px] text-amber-300/70 mt-0.5">
              Perlu Diteliti
            </div>
          </div>

          {/* Card 5: Hanya di ESDM */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'ESDM_ONLY' ? 'ALL' : 'ESDM_ONLY')}
            className={`glass-card p-4 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'ESDM_ONLY' 
                ? 'border-sky-500 bg-sky-950/40 ring-1 ring-sky-500' 
                : 'border-sky-500/30 bg-sky-950/10 hover:bg-sky-950/20'
            }`}
          >
            <div className="text-[11px] text-sky-300 font-medium flex items-center justify-between">
              <span>Hanya di ESDM</span>
              <Info className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-sky-400 mt-1">
              {comparisonResult.summary.esdmOnlyCount}
            </div>
            <div className="text-[11px] text-sky-300/70 mt-0.5">
              Belum di Aplikasi
            </div>
          </div>

          {/* Card 6: Total Tanaman Rekonsiliasi */}
          <div className="glass-card p-4 rounded-xl border border-white/10 bg-slate-900/70">
            <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>Selisih Tanaman</span>
              <TreePine className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className={`text-2xl font-bold mt-1 ${
              comparisonResult.summary.diffTotalTanaman === 0 
                ? 'text-emerald-400' 
                : 'text-amber-400'
            }`}>
              {comparisonResult.summary.diffTotalTanaman > 0 ? `+${comparisonResult.summary.diffTotalTanaman}` : comparisonResult.summary.diffTotalTanaman}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {comparisonResult.summary.totalTanamanApp} (Data) vs {comparisonResult.summary.totalTanamanEsdm} (ESDM)
            </div>
          </div>
        </div>
      )}

      {/* 4. Filter Bar & Search */}
      {comparisonResult && (
        <div className="glass-card p-4 rounded-2xl shadow-xl border border-white/10 bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status filter tabs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-bold mr-1 shrink-0">Filter:</span>
            {[
              { id: 'ALL', label: 'Semua Bidang', count: comparisonResult.items.length },
              { id: 'DISCREPANCY', label: 'Ada Selisih', count: comparisonResult.summary.discrepancyCount },
              { id: 'MATCH', label: 'Cocok Sempurna', count: comparisonResult.summary.matchCount },
              { id: 'DIFF_LUAS', label: 'Beda Luas' },
              { id: 'DIFF_PLANTS', label: 'Beda Tanaman' },
              { id: 'ESDM_ONLY', label: 'Hanya di ESDM', count: comparisonResult.summary.esdmOnlyCount },
              { id: 'APP_ONLY', label: 'Hanya di Data Kita', count: comparisonResult.summary.appOnlyCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-600/20'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Span & Keyword Search */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Span select */}
            {availableSpans.length > 0 && (
              <select
                value={spanFilter}
                onChange={(e) => setSpanFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="ALL">Semua Span</option>
                {availableSpans.map(s => (
                  <option key={s} value={s}>Span {s}</option>
                ))}
              </select>
            )}

            {/* Keyword Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari nama, NIK, no bidang..."
                className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-48 transition-all"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Export buttons */}
            <button
              onClick={handleExportCsv}
              className="p-1.5 px-3 bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Download rekonsiliasi ke format CSV/Excel"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>

            <button
              onClick={handlePrint}
              className="p-1.5 px-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-all border border-white/10 cursor-pointer"
              title="Cetak Ringkasan"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 4b. Keputusan Crosscheck & Audit Progress Bar */}
      {comparisonResult && (
        <div className="glass-card p-4 rounded-2xl shadow-xl border border-amber-500/20 bg-gradient-to-r from-slate-900/90 via-amber-950/20 to-slate-900/90 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Progress counters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 pr-2 border-r border-white/10">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Keputusan & Tindak Lanjut:
              </span>
            </div>

            {/* Sesuai / Approved */}
            <button
              onClick={() => setDecisionFilter(decisionFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                decisionFilter === 'APPROVED'
                  ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400 ring-1 ring-emerald-400'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
              }`}
              title="Filter hanya bidang yang disetujui (Sesuai)"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sesuai ({decisionStats.approved})</span>
            </button>

            {/* Tetap / Data Aplikasi */}
            <button
              onClick={() => setDecisionFilter(decisionFilter === 'RETAIN' ? 'ALL' : 'RETAIN')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                decisionFilter === 'RETAIN'
                  ? 'bg-sky-500/30 text-sky-200 border-sky-400 ring-1 ring-sky-400'
                  : 'bg-sky-500/10 text-sky-300 border-sky-500/20 hover:bg-sky-500/20'
              }`}
              title="Filter bidang yang tetap mengacu data internal aplikasi"
            >
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>Tetap ({decisionStats.retain})</span>
            </button>

            {/* Reject / Ditolak */}
            <button
              onClick={() => setDecisionFilter(decisionFilter === 'REJECT' ? 'ALL' : 'REJECT')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                decisionFilter === 'REJECT'
                  ? 'bg-rose-500/30 text-rose-200 border-rose-400 ring-1 ring-rose-400'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-rose-500/20'
              }`}
              title="Filter bidang yang ditolak / perlu perbaikan"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Reject ({decisionStats.reject})</span>
            </button>

            {/* Belum Diputuskan */}
            <button
              onClick={() => setDecisionFilter(decisionFilter === 'PENDING' ? 'ALL' : 'PENDING')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                decisionFilter === 'PENDING'
                  ? 'bg-slate-600/40 text-slate-100 border-slate-300 ring-1 ring-slate-300'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
              }`}
              title="Filter bidang yang belum diputuskan"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Belum Diputuskan ({decisionStats.pending})</span>
            </button>

            {/* Catatan Khusus */}
            <button
              onClick={() => setDecisionFilter(decisionFilter === 'HAS_NOTES' ? 'ALL' : 'HAS_NOTES')}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                decisionFilter === 'HAS_NOTES'
                  ? 'bg-amber-500/30 text-amber-200 border-amber-400 ring-1 ring-amber-400'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
              }`}
              title="Filter bidang yang memiliki catatan khusus"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
              <span>Ada Catatan ({decisionStats.withNotes})</span>
            </button>

            {decisionFilter !== 'ALL' && (
              <button
                onClick={() => setDecisionFilter('ALL')}
                className="text-[11px] text-amber-300 hover:text-white underline cursor-pointer ml-1"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* Quick Batch Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchApproveMatch}
              className="px-3 py-1.5 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 hover:text-emerald-100 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Setujui semua bidang dengan status Cocok Sempurna (100% Cocok) secara otomatis dan catat ke Log Aktivitas"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Setujui Semua Cocok ({comparisonResult.summary.matchCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Main Comparison Table */}
      {comparisonResult ? (
        <div className="glass-card rounded-2xl shadow-xl overflow-hidden border border-white/10 bg-slate-900/60 flex flex-col">
          {/* Scroll Control Bar */}
          <div className="px-4 py-2 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-[11px] font-bold text-slate-300">Tampilan Scroll:</span>
              <span className="text-[10px] text-slate-400 font-mono">
                Scroll mandiri dalam tabel (halaman tidak memanjang)
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setTableHeightMode('compact')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  tableHeightMode === 'compact'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Tinggi Ringkas (380px)"
              >
                Ringkas (380px)
              </button>
              <button
                type="button"
                onClick={() => setTableHeightMode('standard')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  tableHeightMode === 'standard'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Tinggi Standar (550px)"
              >
                Standar (550px)
              </button>
              <button
                type="button"
                onClick={() => setTableHeightMode('tall')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  tableHeightMode === 'tall'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Layar Penuh"
              >
                Layar Penuh
              </button>
            </div>
          </div>

          <div className={`table-scroll-container overflow-auto scrollbar-thin bg-slate-950/80 ${
            tableHeightMode === 'compact'
              ? 'max-h-[380px]'
              : tableHeightMode === 'standard'
              ? 'max-h-[550px]'
              : 'max-h-[calc(100vh-250px)]'
          }`}>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-white/10 shadow-md">
                <tr className="border-b border-white/10 bg-white/5 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4 w-28">Status Sanding</th>
                  <th className="py-3 px-4 w-32">Span & No. Bidang</th>
                  <th className="py-3 px-4 min-w-[190px]">Identitas (Data Kita vs ESDM)</th>
                  <th className="py-3 px-4 w-32 text-right">Luas Tanah (m²)</th>
                  <th className="py-3 px-4 min-w-[160px]">Alas Hak / Nomor</th>
                  <th className="py-3 px-4 w-40">Rekap Tanaman</th>
                  <th className="py-3 px-4 min-w-[140px]">Keputusan Crosscheck</th>
                  <th className="py-3 px-4 min-w-[170px]">Catatan Khusus</th>
                  <th className="py-3 px-4 w-20 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      Tidak ada data bidang yang cocok dengan filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const isDiscrepancy = item.status === 'DISCREPANCY';
                    const isMatch = item.status === 'MATCH';
                    const isEsdmOnly = item.status === 'ESDM_ONLY';
                    const isAppOnly = item.status === 'APP_ONLY';
                    const itemKey = getItemKey(item);
                    const itemDecision = decisions[itemKey];

                    return (
                      <tr 
                        key={item.id}
                        className={`transition-colors hover:bg-white/5 ${
                          isDiscrepancy 
                            ? 'bg-amber-950/10' 
                            : isMatch 
                            ? 'bg-emerald-950/5' 
                            : isEsdmOnly 
                            ? 'bg-sky-950/10' 
                            : 'bg-purple-950/10'
                        }`}
                      >
                        {/* No */}
                        <td className="py-3 px-4 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4">
                          {isMatch && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <Check className="w-3 h-3 text-emerald-400" />
                              Cocok
                            </span>
                          )}
                          {isDiscrepancy && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                Selisih
                              </span>
                              <div className="text-[10px] text-amber-400/90 font-medium">
                                {item.discrepancyReasons.length} perbedaan
                              </div>
                            </div>
                          )}
                          {isEsdmOnly && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              Hanya di ESDM
                            </span>
                          )}
                          {isAppOnly && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              Hanya di Data Kita
                            </span>
                          )}
                        </td>

                        {/* Span & No Bidang */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-white font-mono">{item.span}</div>
                          <div className="text-xs text-amber-300 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>Bidang No. {item.nobid}</span>
                            {item.esdmBidang?.source === 'HYBRID' && (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/30"
                                title="Data ESDM disinergikan dari Excel & PDF"
                              >
                                <Zap className="w-2.5 h-2.5 text-amber-300" /> Hibrida
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Identitas (Data Kita vs ESDM) */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {/* Data Kita */}
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] text-slate-400 font-bold uppercase w-10 shrink-0">Data:</span>
                              <div>
                                <div className={`font-semibold ${item.isNamaMatch ? 'text-white' : 'text-amber-300'}`}>
                                  {item.appNama}
                                </div>
                                {item.appNik && item.appNik !== '-' && (
                                  <div className="text-[11px] font-mono text-slate-400">
                                    NIK: {item.appNik}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* ESDM */}
                            <div className="flex items-baseline gap-1.5 pt-1 border-t border-white/5">
                              <span className="text-[10px] text-amber-400 font-bold uppercase w-10 shrink-0">ESDM:</span>
                              <div>
                                <div className={`font-semibold ${item.isNamaMatch ? 'text-slate-300' : 'text-amber-300'}`}>
                                  {item.esdmNama}
                                </div>
                                {item.esdmNik && item.esdmNik !== '-' && (
                                  <div className="text-[11px] font-mono text-slate-400">
                                    NIK: {item.esdmNik}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Luas Tanah (m2) */}
                        <td className="py-3 px-4 text-right">
                          <div className="space-y-1">
                            <div className="font-bold text-white font-mono">
                              {item.appLuas.toLocaleString('id-ID')} m²
                              <span className="text-[10px] text-slate-400 font-normal ml-1">(Data)</span>
                            </div>
                            <div className="font-mono text-slate-300">
                              {item.esdmLuas.toLocaleString('id-ID')} m²
                              <span className="text-[10px] text-amber-400 font-normal ml-1">(ESDM)</span>
                            </div>
                            {item.esdmBidang?.pdfCrossCheck && item.esdmBidang.pdfCrossCheck.diffLuas !== 0 && (
                              <div className="text-[10px] text-amber-400/90 font-mono" title={`Di PDF tercatat luas ${item.esdmBidang.pdfCrossCheck.pdfLuas} m² (selisih ${item.esdmBidang.pdfCrossCheck.diffLuas} m²)`}>
                                PDF: {item.esdmBidang.pdfCrossCheck.pdfLuas} m²
                              </div>
                            )}
                            {!item.isLuasMatch && item.diffLuas !== 0 && (
                              <div className={`text-[11px] font-mono font-bold ${
                                item.diffLuas > 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                                {item.diffLuas > 0 ? `+${item.diffLuas}` : item.diffLuas} m²
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Alas Hak / Bukti Kepemilikan */}
                        <td className="py-3 px-4">
                          <div className="space-y-1 text-[11px]">
                            <div>
                              <span className="text-slate-400">Data: </span>
                              <span className="text-white font-medium">
                                {item.appJenisHak || '-'} {item.appNomerHak ? `No. ${item.appNomerHak}` : ''}
                              </span>
                            </div>
                            <div className="pt-0.5 border-t border-white/5 flex items-center justify-between gap-1 flex-wrap">
                              <div>
                                <span className="text-amber-400">ESDM: </span>
                                <span className="text-slate-300 font-medium">
                                  {item.esdmJenisHak || '-'} {item.esdmNomerHak ? `No. ${item.esdmNomerHak}` : ''}
                                </span>
                                {item.esdmBidang?.source === 'HYBRID' && item.esdmBidang?.pdfCrossCheck?.alasHakSource === 'PDF' && (
                                  <span className="text-[9px] text-purple-300 font-mono font-semibold px-1 py-0.2 rounded bg-purple-500/20 border border-purple-500/30 ml-1" title="Alas hak ini diambil langsung dari pembacaan berkas PDF ESDM">
                                    PDF
                                  </span>
                                )}
                              </div>
                              {item.isHakOverallMatch && (item.appJenisHak || item.appNomerHak) && (item.esdmJenisHak || item.esdmNomerHak) && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0" title="Format dan nomor alas hak ekuivalen / cocok">
                                  <Check className="w-2.5 h-2.5" /> Sesuai
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Rekap Tanaman */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Total Pohon:</span>
                              <span className="font-bold text-white font-mono">
                                {item.appTotalTanaman} (Data) vs {item.esdmTotalTanaman} (ESDM)
                              </span>
                            </div>

                            {item.isTanamanMatch ? (
                              <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                                <Check className="w-3 h-3" />
                                Rincian tanaman cocok
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                {item.diffTanaman > 0 ? `+${item.diffTanaman}` : item.diffTanaman} pohon selisih
                              </div>
                            )}

                            {/* Small pill previews for mismatched plants */}
                            {item.plantDiffs.filter(p => p.status !== 'MATCH').length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.plantDiffs.filter(p => p.status !== 'MATCH').slice(0, 2).map((pd, pidx) => (
                                  <span key={pidx} className="px-1.5 py-0.2 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded text-[9px]">
                                    {pd.jenis} ({pd.diffTotal > 0 ? `+${pd.diffTotal}` : pd.diffTotal})
                                  </span>
                                ))}
                                {item.plantDiffs.filter(p => p.status !== 'MATCH').length > 2 && (
                                  <span className="text-[9px] text-slate-400">
                                    +{item.plantDiffs.filter(p => p.status !== 'MATCH').length - 2} lainnya
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Keputusan Crosscheck */}
                        <td className="py-3 px-4">
                          <div className="space-y-1.5 min-w-[130px]">
                            {/* Current status pill */}
                            <div>
                              {itemDecision?.status === 'APPROVED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Sesuai
                                </span>
                              )}
                              {itemDecision?.status === 'RETAIN' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/40" title="Pertahankan data internal aplikasi">
                                  <Shield className="w-3 h-3 text-sky-400" /> Tetap
                                </span>
                              )}
                              {itemDecision?.status === 'REJECT' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  <XCircle className="w-3 h-3 text-rose-400" /> Reject
                                </span>
                              )}
                              {(!itemDecision?.status || itemDecision?.status === 'PENDING') && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30">
                                  <Clock className="w-2.5 h-2.5 text-slate-400" /> Belum Putus
                                </span>
                              )}
                            </div>

                            {/* Quick Action buttons */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSetDecisionStatus(item, 'APPROVED')}
                                title="Ubah status jadi Sesuai / Approved (Catat ke Log)"
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer flex items-center gap-0.5 ${
                                  itemDecision?.status === 'APPROVED'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-white/5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-white/5'
                                }`}
                              >
                                <Check className="w-2.5 h-2.5" /> Sesuai
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSetDecisionStatus(item, 'RETAIN')}
                                title="Pertahankan data aplikasi / Tetap (Catat ke Log)"
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer flex items-center gap-0.5 ${
                                  itemDecision?.status === 'RETAIN'
                                    ? 'bg-sky-600 text-white shadow-sm'
                                    : 'bg-white/5 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 border border-white/5'
                                }`}
                              >
                                <Shield className="w-2.5 h-2.5" /> Tetap
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSetDecisionStatus(item, 'REJECT')}
                                title="Tolak data / Reject (Catat ke Log)"
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer flex items-center gap-0.5 ${
                                  itemDecision?.status === 'REJECT'
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : 'bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-white/5'
                                }`}
                              >
                                <X className="w-2.5 h-2.5" /> Reject
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Catatan Khusus */}
                        <td className="py-3 px-4 min-w-[170px] max-w-[220px]">
                          {itemDecision?.notes ? (
                            <div 
                              onClick={() => handleOpenNoteModal(item)}
                              className="group p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all space-y-1"
                              title="Klik untuk melihat atau mengubah catatan khusus"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="text-xs text-slate-200 font-medium line-clamp-2 leading-relaxed">
                                  {itemDecision.notes}
                                </span>
                                <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-amber-400 shrink-0 mt-0.5" />
                              </div>
                              {itemDecision.updatedBy && (
                                <div className="text-[9px] text-slate-400 font-mono flex items-center justify-between pt-0.5 border-t border-white/5">
                                  <span>{itemDecision.updatedBy}</span>
                                  {itemDecision.updatedAt && (
                                    <span>{new Date(itemDecision.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenNoteModal(item)}
                              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-amber-500/20 hover:border-amber-500/30 text-slate-400 hover:text-amber-300 border border-dashed border-white/15 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                              title="Tambah catatan khusus untuk bidang ini"
                            >
                              <MessageSquare className="w-3 h-3 text-slate-400" />
                              + Catatan
                            </button>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenItemModal(item)}
                            className="px-2.5 py-1.5 bg-amber-500/80 hover:bg-amber-500 text-slate-950 font-bold font-bold rounded-lg transition-all text-xs flex items-center justify-center gap-1 mx-auto cursor-pointer shadow-sm"
                            title="Buka perbandingan rinci field per field & rekonsiliasi tanaman"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty State before upload */
        <div className="glass-card p-12 rounded-2xl shadow-xl text-center border border-white/10 bg-slate-900/60 max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 inline-flex items-center justify-center border border-amber-500/30 mx-auto">
            <GitCompare className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">
            Belum Ada Dokumen ESDM yang Disandingkan
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Silakan pilih Desa target pada langkah 1, lalu upload file PDF hasil ekspor website ESDM pada langkah 2 untuk langsung memulai komparasi data.
          </p>
          <div className="pt-2">
            <button
              onClick={handleLoadDemoSoborejo}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-600/20 inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Muat Contoh Data ESDM Desa Soborejo (24 Bidang)
            </button>
          </div>
        </div>
      )}

      {/* 6. Modal: Deep Discrepancy & Plant Reconciliation Modal */}
      {selectedItemForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-white/15 bg-slate-900 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Rekonsiliasi Rinci: Span {selectedItemForModal.span} - No. Bidang {selectedItemForModal.nobid}
                    {selectedItemForModal.status === 'MATCH' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Cocok Sempurna
                      </span>
                    )}
                    {selectedItemForModal.status === 'DISCREPANCY' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Ada Selisih Data
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Desa {selectedItemForModal.desa} • {selectedItemForModal.discrepancyReasons.length > 0 ? selectedItemForModal.discrepancyReasons.join(', ') : 'Semua parameter terverifikasi sesuai'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedItemForModal(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body with Scroll */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Side by side field diff table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-400" />
                  Perbandingan Parameter Bidang Tanah
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Data Aplikasi */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-3">
                    <div className="text-xs font-extrabold uppercase text-amber-300 flex items-center justify-between border-b border-amber-500/20 pb-2">
                      <span>Data Aplikasi (Google Sheets)</span>
                      <span className="text-[10px] font-normal text-amber-400">Database Lokal</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Nama Pemilik:</span>
                        <span className="font-bold text-white">{selectedItemForModal.appNama || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">NIK:</span>
                        <span className="font-mono text-slate-200">{selectedItemForModal.appNik || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Luas Tanah:</span>
                        <span className="font-mono text-base font-bold text-white">{selectedItemForModal.appLuas.toLocaleString('id-ID')} m²</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Jenis & Nomor Hak:</span>
                        <span className="text-slate-200">{selectedItemForModal.appJenisHak || '-'} {selectedItemForModal.appNomerHak ? `(${selectedItemForModal.appNomerHak})` : ''}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Penutup Lahan / Status:</span>
                        <span className="text-slate-200">{selectedItemForModal.appPenutup || '-'} / {selectedItemForModal.appStatusTanah || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Data ESDM */}
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-3">
                    <div className="text-xs font-extrabold uppercase text-emerald-300 flex items-center justify-between border-b border-emerald-500/20 pb-2">
                      <span className="flex items-center gap-1.5">
                        {selectedItemForModal.esdmBidang?.source === 'HYBRID' && (
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                        )}
                        Data Ekspor Resmi ESDM
                      </span>
                      <span className="text-[10px] font-normal text-emerald-400 font-mono">
                        {selectedItemForModal.esdmBidang?.source === 'HYBRID' 
                          ? 'Sinergi Hibrida (Excel + PDF)' 
                          : 'Daftar Nominatif ESDM'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Nama Pemilik:</span>
                        <span className="font-bold text-white">{selectedItemForModal.esdmNama || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">NIK:</span>
                        <span className="font-mono text-slate-200">{selectedItemForModal.esdmNik || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Luas Tanah:</span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-base font-bold text-white">{selectedItemForModal.esdmLuas.toLocaleString('id-ID')} m²</span>
                          {selectedItemForModal.esdmBidang?.pdfCrossCheck && selectedItemForModal.esdmBidang.pdfCrossCheck.diffLuas !== 0 && (
                            <span className="text-[10px] text-amber-400 font-mono" title="Luas yang tertera pada versi PDF">
                              (PDF: {selectedItemForModal.esdmBidang.pdfCrossCheck.pdfLuas} m²)
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Jenis & Nomor Hak:</span>
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-slate-200">
                            {selectedItemForModal.esdmJenisHak || '-'} {selectedItemForModal.esdmNomerHak ? `(${selectedItemForModal.esdmNomerHak})` : ''}
                            {selectedItemForModal.esdmBidang?.source === 'HYBRID' && selectedItemForModal.esdmBidang?.pdfCrossCheck?.alasHakSource === 'PDF' && (
                              <span className="ml-1 text-[9px] text-purple-300 font-mono px-1 rounded bg-purple-500/20 border border-purple-500/30">
                                Disematkan dari PDF
                              </span>
                            )}
                          </span>
                          {selectedItemForModal.isHakOverallMatch && (selectedItemForModal.esdmJenisHak || selectedItemForModal.esdmNomerHak) && (
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              <Check className="w-3 h-3" /> Ekuivalen / Cocok
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Penutup Lahan / Status:</span>
                        <span className="text-slate-200">{selectedItemForModal.esdmPenutup || '-'} / {selectedItemForModal.esdmStatusTanah || '-'}</span>
                      </div>

                      {/* Hybrid Audit Notes */}
                      {selectedItemForModal.esdmBidang?.pdfCrossCheck && (
                        <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950/70 border border-emerald-500/20 space-y-1 text-[11px]">
                          <div className="font-bold text-emerald-300 flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-300" />
                            Audit Sinergi PDF & Excel:
                          </div>
                          <div className="text-slate-300 leading-snug">
                            {selectedItemForModal.esdmBidang.pdfCrossCheck.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Plant Reconciliation Matrix */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <TreePine className="w-4 h-4 text-emerald-400" />
                    Matriks Rekonsiliasi Tanaman Lengkap
                  </h4>
                  <div className="text-xs font-semibold text-slate-300">
                    Total Pohon: <strong className="text-amber-300">{selectedItemForModal.appTotalTanaman} (Data)</strong> vs <strong className="text-emerald-300">{selectedItemForModal.esdmTotalTanaman} (ESDM)</strong>
                  </div>
                </div>

                {selectedItemForModal.plantDiffs.length === 0 ? (
                  <div className="p-4 bg-white/5 rounded-xl text-center text-xs text-slate-400">
                    Tidak ada catatan tanaman untuk bidang ini pada kedua sumber data.
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 overflow-auto max-h-[320px] scrollbar-thin bg-slate-950/40">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 shadow-sm">
                        <tr className="bg-white/5 border-b border-white/10 text-slate-300 font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-3">Jenis Tanaman</th>
                          <th className="py-2.5 px-2 text-center">Belum Menghasilkan (BM)</th>
                          <th className="py-2.5 px-2 text-center">Sudah Menghasilkan (SM)</th>
                          <th className="py-2.5 px-2 text-center">Kecil</th>
                          <th className="py-2.5 px-2 text-center">Sedang</th>
                          <th className="py-2.5 px-2 text-center">Besar</th>
                          <th className="py-2.5 px-3 text-center">Total Pohon</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {selectedItemForModal.plantDiffs.map((plant, pIdx) => {
                          const isPlantMatch = plant.status === 'MATCH';
                          return (
                            <tr key={pIdx} className={isPlantMatch ? 'hover:bg-white/5' : 'bg-amber-500/5 hover:bg-amber-500/10'}>
                              {/* Jenis */}
                              <td className="py-2.5 px-3 font-bold text-white">
                                {plant.jenis}
                              </td>

                              {/* BM */}
                              <td className="py-2.5 px-2 text-center font-mono">
                                <span className={plant.appBm !== plant.esdmBm ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                  {plant.appBm} / {plant.esdmBm}
                                </span>
                              </td>

                              {/* SM */}
                              <td className="py-2.5 px-2 text-center font-mono">
                                <span className={plant.appSm !== plant.esdmSm ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                  {plant.appSm} / {plant.esdmSm}
                                </span>
                              </td>

                              {/* Kecil */}
                              <td className="py-2.5 px-2 text-center font-mono">
                                <span className={plant.appK !== plant.esdmK ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                  {plant.appK} / {plant.esdmK}
                                </span>
                              </td>

                              {/* Sedang */}
                              <td className="py-2.5 px-2 text-center font-mono">
                                <span className={plant.appS !== plant.esdmS ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                  {plant.appS} / {plant.esdmS}
                                </span>
                              </td>

                              {/* Besar */}
                              <td className="py-2.5 px-2 text-center font-mono">
                                <span className={plant.appB !== plant.esdmB ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                  {plant.appB} / {plant.esdmB}
                                </span>
                              </td>

                              {/* Total Pohon */}
                              <td className="py-2.5 px-3 text-center font-mono font-bold">
                                <div className="text-white">
                                  {plant.appTotal} (Data) vs {plant.esdmTotal} (ESDM)
                                </div>
                                {plant.diffTotal !== 0 && (
                                  <div className={`text-[10px] ${plant.diffTotal > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {plant.diffTotal > 0 ? `+${plant.diffTotal}` : plant.diffTotal} selisih
                                  </div>
                                )}
                              </td>

                              {/* Status Notes */}
                              <td className="py-2.5 px-3">
                                {isPlantMatch ? (
                                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Cocok
                                  </span>
                                ) : (
                                  <div className="text-[10px] text-amber-300 font-medium">
                                    {plant.discrepancyNotes.join(', ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Form Keputusan Crosscheck & Catatan Khusus */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-amber-950/20 to-slate-950 border border-amber-500/30 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Keputusan Crosscheck & Catatan Khusus
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Pilih status penetapan data untuk bidang ini dan sertakan catatan khusus. Perubahan akan langsung tercatat di Log Aktivitas.
                      </p>
                    </div>
                  </div>

                  {modalStatus !== 'PENDING' && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${
                      modalStatus === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : modalStatus === 'RETAIN'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      {modalStatus === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {modalStatus === 'RETAIN' && <Shield className="w-3.5 h-3.5" />}
                      {modalStatus === 'REJECT' && <XCircle className="w-3.5 h-3.5" />}
                      Status: {getDecisionLabel(modalStatus)}
                    </span>
                  )}
                </div>

                {/* Status Selection Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Sesuai / Approved */}
                  <button
                    type="button"
                    onClick={() => setModalStatus('APPROVED')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      modalStatus === 'APPROVED'
                        ? 'bg-emerald-600/20 border-emerald-400 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-950/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-emerald-300 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Sesuai (Approved)</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${modalStatus === 'APPROVED' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-500'}`}>
                        {modalStatus === 'APPROVED' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 leading-snug">
                      Data disetujui / diselaraskan sesuai dengan dokumen hasil verifikasi.
                    </span>
                  </button>

                  {/* Tetap / Retain */}
                  <button
                    type="button"
                    onClick={() => setModalStatus('RETAIN')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      modalStatus === 'RETAIN'
                        ? 'bg-sky-600/20 border-sky-400 ring-2 ring-sky-500/50 shadow-lg shadow-sky-950/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-sky-300 text-xs">
                        <Shield className="w-4 h-4 text-sky-400" />
                        <span>Tetap (Acuan Aplikasi)</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${modalStatus === 'RETAIN' ? 'border-sky-400 bg-sky-500' : 'border-slate-500'}`}>
                        {modalStatus === 'RETAIN' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 leading-snug">
                      Tetap mempertahankan data internal aplikasi (hasil ukur resmi / berita acara fisik).
                    </span>
                  </button>

                  {/* Reject */}
                  <button
                    type="button"
                    onClick={() => setModalStatus('REJECT')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      modalStatus === 'REJECT'
                        ? 'bg-rose-600/20 border-rose-400 ring-2 ring-rose-500/50 shadow-lg shadow-rose-950/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-rose-300 text-xs">
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span>Reject (Tolak / Revisi)</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${modalStatus === 'REJECT' ? 'border-rose-400 bg-rose-500' : 'border-slate-500'}`}>
                        {modalStatus === 'REJECT' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 leading-snug">
                      Data ditolak karena ketidaksesuaian kritis (perlu pengukuran ulang atau berkas sanggahan).
                    </span>
                  </button>
                </div>

                {/* Notes Input Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                      Catatan Khusus Bidang Ini:
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Tersimpan permanen & tampil pada rekonsiliasi serta ekspor CSV
                    </span>
                  </div>
                  <textarea
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Contoh: Luas fisik telah dikonfirmasi ulang bersama pemilik; tanaman jati 5 batang ditebang sebelum inventarisasi; alas hak terlampir pada warkah No. 42..."
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
                  />

                  {/* Preset quick notes tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold mr-1">Rekomendasi Cepat:</span>
                    {[
                      'Data diselaraskan sesuai ESDM',
                      'Tetap acuan data ukur PLN',
                      'Sengketa batas / perlu klarifikasi kades',
                      'Fisik telah diverifikasi ulang di lapangan',
                      'Terdapat perubahan tanaman pasca inventarisasi'
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (modalNotes.trim()) {
                            setModalNotes(`${modalNotes.trim()}; ${preset}`);
                          } else {
                            setModalNotes(preset);
                          }
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-amber-500/30 text-slate-300 hover:text-amber-200 border border-white/10 transition-colors cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Setiap penetapan status atau catatan akan otomatis tersimpan dan tercatat di <strong>Log Aktivitas</strong>.</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveModalDecision}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/30"
                >
                  <Check className="w-3.5 h-3.5" />
                  Simpan Keputusan & Catat Log
                </button>

                {selectedItemForModal.appRecord && onNavigateToInput && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedItemForModal.appRecord) {
                        onNavigateToInput(selectedItemForModal.appRecord);
                        setSelectedItemForModal(null);
                      }
                    }}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Buka di Form Input
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedItemForModal(null)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Dedicated Quick Note Modal */}
      {editingNoteItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Catatan Khusus Bidang No. {editingNoteItem.nobid}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingNoteItem(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white/5 p-3 rounded-xl space-y-1 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Span & Desa:</span>
                <span className="font-bold text-white">{editingNoteItem.span} • {editingNoteItem.desa}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pemilik / Garapan:</span>
                <span className="font-bold text-white">{editingNoteItem.appNama || editingNoteItem.esdmNama || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Luas Tanah:</span>
                <span className="font-mono text-white">{editingNoteItem.appLuas || editingNoteItem.esdmLuas} m²</span>
              </div>
            </div>

            {/* Decision Status in Note Modal */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Keputusan Crosscheck:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setNoteInputStatus('APPROVED')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    noteInputStatus === 'APPROVED'
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sesuai</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNoteInputStatus('RETAIN')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    noteInputStatus === 'RETAIN'
                      ? 'bg-sky-500/25 border-sky-400 text-sky-200 ring-1 ring-sky-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-sky-400" />
                  <span>Tetap</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNoteInputStatus('REJECT')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    noteInputStatus === 'REJECT'
                      ? 'bg-rose-500/25 border-rose-400 text-rose-200 ring-1 ring-rose-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Reject</span>
                </button>
              </div>
            </div>

            {/* Note input textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Tulis Catatan Khusus:
              </label>
              <textarea
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                placeholder="Tulis alasan, klarifikasi batas, hasil verifikasi fisik, atau catatan tindak lanjut..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
              />

              {/* Preset chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  'Data diselaraskan sesuai ESDM',
                  'Tetap acuan data ukur PLN',
                  'Sengketa batas / perlu klarifikasi',
                  'Luas fisik telah diverifikasi ulang',
                  'Tanaman telah ditebang sebelumnya'
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (noteInputText.trim()) {
                        setNoteInputText(`${noteInputText.trim()}; ${preset}`);
                      } else {
                        setNoteInputText(preset);
                      }
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-amber-500/30 text-slate-300 hover:text-amber-200 border border-white/10 transition-colors cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingNoteItem(null)}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveNoteModal}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                Simpan & Catat ke Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Notification Toast */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-fade-in max-w-md ${
          toastMessage.type === 'error'
            ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
            : toastMessage.type === 'info'
            ? 'bg-sky-950/95 border-sky-500/40 text-sky-200'
            : 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
        }`}>
          {toastMessage.type === 'error' ? (
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : toastMessage.type === 'info' ? (
            <Info className="w-5 h-5 text-sky-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <div className="text-xs font-medium leading-relaxed">
            {toastMessage.text}
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white shrink-0 ml-auto cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default SandingEsdmPanel;
