import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  ExternalLink, 
  Eye, 
  X, 
  Plus, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  ShieldCheck, 
  Lock, 
  Edit3, 
  Save, 
  TreePine, 
  Landmark, 
  Layers, 
  RefreshCw,
  FolderOpen,
  Settings,
  Info,
  Copy,
  Check,
  Trash2,
  Share2,
  FileDown,
  FileUp,
  HelpCircle,
  Globe
} from 'lucide-react';
import { CsvPublishGuideModal } from './CsvPublishGuideModal';
import type { LandRecord, VillageResume, VillageStageDoc, StageStatus, ResumeStageConfig, ProjectConfig } from '../types';
import { DEFAULT_RESUME_STAGES } from '../types';
import { 
  loadVillageResumes, 
  saveVillageResume, 
  subscribeVillageResumes, 
  createDefaultVillageResume,
  createEmptyStageDoc,
  compressImageFile,
  testCloudConnection,
  fileToBase64,
  exportVillageResumesJson,
  importVillageResumesJson,
  generateMasterWorkbookExcel,
  importMasterWorkbookExcel
} from '../lib/projectResumeStorage';
import { 
  uploadFileToDrive, 
  findOrCreateFolder, 
  ensureResumeSheetTab, 
  fetchResumesFromGoogleSheet, 
  saveVillageResumeToSheet, 
  RESUME_SHEET_TAB_NAME,
  createDedicatedResumeSpreadsheet,
  parseCSV,
  fetchPublicCsvContent
} from '../lib/googleApi';

interface ResumeProjectPanelProps {
  records: LandRecord[];
  activeProjectId: string;
  activeProjectName?: string;
  role: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST';
  userEmail?: string;
  operatorName?: string;
  accessToken?: string;
  spreadsheetId?: string;
  allProjects?: ProjectConfig[];
  uploadsFolderId?: string;
  publicCsvUrl?: string;
  onRefreshGoogleToken?: () => Promise<string | null>;
  onNavigateToInput?: (record: LandRecord) => void;
  resumeStages?: ResumeStageConfig[];
  onUpdateResumeStages?: (newStages: ResumeStageConfig[]) => Promise<void>;
  onUpdateProjectSpreadsheetId?: (newSpreadsheetId: string) => Promise<void>;
  onUpdateProjectPublicCsvUrl?: (newCsvUrl: string) => Promise<void>;
}

export default function ResumeProjectPanel({
  records,
  activeProjectId,
  activeProjectName = 'Proyek Ventura',
  role,
  userEmail = 'operator@ventura.id',
  operatorName = 'Operator',
  accessToken,
  spreadsheetId,
  allProjects,
  uploadsFolderId,
  publicCsvUrl,
  onRefreshGoogleToken,
  resumeStages,
  onUpdateResumeStages,
  onUpdateProjectSpreadsheetId,
  onUpdateProjectPublicCsvUrl
}: ResumeProjectPanelProps) {
  const isGuest = role === 'GUEST';

  // Configured stages for this specific project
  const stagesConfig = useMemo<ResumeStageConfig[]>(() => {
    if (resumeStages && resumeStages.length > 0) return resumeStages;
    return DEFAULT_RESUME_STAGES;
  }, [resumeStages]);

  // Only the active stages that should be shown on tables & KPIs
  const activeStages = useMemo<ResumeStageConfig[]>(() => {
    const filtered = stagesConfig.filter(s => s.active !== false);
    return filtered.length > 0 ? filtered : DEFAULT_RESUME_STAGES;
  }, [stagesConfig]);

  // State
  const [resumes, setResumes] = useState<VillageResume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'>('ALL');
  const [activeTab, setActiveTab] = useState<'table' | 'cards'>('table');
  const [tableHeightMode, setTableHeightMode] = useState<'compact' | 'standard' | 'tall'>('standard');

  // Cloud and feedback states
  const [isCloudConnected, setIsCloudConnected] = useState(true);
  const [cloudErrorDetail, setCloudErrorDetail] = useState<{ code?: string; message?: string } | null>(null);
  const [isCloudHelpModalOpen, setIsCloudHelpModalOpen] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  // Settings Modal for Points / Stages
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempStages, setTempStages] = useState<ResumeStageConfig[]>(stagesConfig);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Share & Import Modal (Antar Rekan Tim)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareTab, setShareTab] = useState<'export' | 'import' | 'excel'>('export');
  const [importJsonText, setImportJsonText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // 1 Workbook Excel Modal & Sync state
  const [isWorkbookModalOpen, setIsWorkbookModalOpen] = useState(false);
  const [isSyncingAllToSheet, setIsSyncingAllToSheet] = useState(false);

  // Dedicated Resume Spreadsheet Generator & CSV Web Publish state
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
  const [generatedSheetInfo, setGeneratedSheetInfo] = useState<{ id: string; url: string } | null>(null);
  const [editCsvUrl, setEditCsvUrl] = useState(publicCsvUrl || '');
  const [isSavingCsvUrl, setIsSavingCsvUrl] = useState(false);
  const [isTestingCsv, setIsTestingCsv] = useState(false);
  const [csvTestFeedback, setCsvTestFeedback] = useState<{ success: boolean; message: string; rows?: number } | null>(null);
  const [isCsvGuideModalOpen, setIsCsvGuideModalOpen] = useState(false);

  useEffect(() => {
    if (publicCsvUrl) {
      setEditCsvUrl(publicCsvUrl);
    }
  }, [publicCsvUrl]);

  // Handler to auto-create Google Spreadsheet Resume with all 36 headers
  const handleAutoGenerateResumeSheet = async () => {
    let currentToken = accessToken;
    if (!currentToken || currentToken === 'GUEST_BYPASS' || currentToken === 'null') {
      if (onRefreshGoogleToken) {
        try {
          const fresh = await onRefreshGoogleToken();
          if (fresh) currentToken = fresh;
        } catch (e) {
          console.warn("Gagal refresh token:", e);
        }
      }
    }
    if (!currentToken) {
      alert("Silakan hubungkan akun Google Anda terlebih dahulu untuk membuat Spreadsheet di Google Drive.");
      return;
    }

    setIsGeneratingSheet(true);
    try {
      const result = await createDedicatedResumeSpreadsheet(
        currentToken,
        activeProjectName,
        uploadsFolderId
      );

      // Now sync existing resumes if any
      if (resumes && resumes.length > 0) {
        for (const res of resumes) {
          const stats = uniqueDesasFromRecords.get(res.desaName.toUpperCase());
          const prog = calculateVillageProgress(res);
          await saveVillageResumeToSheet(
            currentToken,
            result.spreadsheetId,
            res,
            activeProjectName,
            stats?.totalBidang || 0,
            stats?.totalLuas || 0,
            prog
          );
        }
      }

      setGeneratedSheetInfo({ id: result.spreadsheetId, url: result.spreadsheetUrl });

      if (onUpdateProjectSpreadsheetId) {
        await onUpdateProjectSpreadsheetId(result.spreadsheetId);
      }

      setSaveFeedback({
        type: 'success',
        text: `✨ Berhasil membuat Google Spreadsheet Resume "${activeProjectName}" di Google Drive Anda!`
      });
      setIsWorkbookModalOpen(true);
    } catch (err: any) {
      console.error("Gagal membuat Spreadsheet Resume:", err);
      alert("Gagal membuat Google Spreadsheet: " + (err?.message || err));
    } finally {
      setIsGeneratingSheet(false);
    }
  };

  // Handler to test CSV URL
  const handleTestCsvUrl = async () => {
    if (!editCsvUrl || !editCsvUrl.trim()) {
      setCsvTestFeedback({
        success: false,
        message: 'Masukkan tautan CSV terlebih dahulu sebelum menguji.'
      });
      return;
    }
    setIsTestingCsv(true);
    setCsvTestFeedback(null);
    try {
      const raw = await fetchPublicCsvContent(editCsvUrl.trim());
      const parsed = parseCSV(raw);
      const validRows = parsed.filter(r => r && r.length > 0 && r.some(c => c && String(c).trim() !== ''));
      if (validRows.length <= 1) {
        setCsvTestFeedback({
          success: false,
          message: 'Tautan CSV berhasil diakses, namun dokumen ini belum memiliki baris data (hanya header atau kosong).'
        });
      } else {
        setCsvTestFeedback({
          success: true,
          message: `✅ Berhasil terkoneksi! Ditemukan ${validRows.length - 1} data baris yang siap dibaca oleh Tamu/Publik.`,
          rows: validRows.length - 1
        });
      }
    } catch (err: any) {
      setCsvTestFeedback({
        success: false,
        message: `❌ Gagal mengakses: ${err?.message || 'Pastikan file Google Sheet telah di-Publikasikan ke Web dalam format CSV (.csv).'}`
      });
    } finally {
      setIsTestingCsv(false);
    }
  };

  // Handler to save CSV URL
  const handleSaveCsvUrl = async () => {
    if (!onUpdateProjectPublicCsvUrl) return;
    setIsSavingCsvUrl(true);
    try {
      await onUpdateProjectPublicCsvUrl(editCsvUrl.trim());
      setSaveFeedback({
        type: 'success',
        text: 'Tautan Web Publish CSV berhasil disimpan untuk jalur ini!'
      });
    } catch (e: any) {
      alert("Gagal menyimpan tautan CSV: " + (e?.message || e));
    } finally {
      setIsSavingCsvUrl(false);
    }
  };

  useEffect(() => {
    setTempStages(stagesConfig);
  }, [stagesConfig]);

  // Modals
  const [editingDesa, setEditingDesa] = useState<VillageResume | null>(null);
  const [activeStageTab, setActiveStageTab] = useState<string>('baSosialisasiAwal');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingDesaModal, setIsAddingDesaModal] = useState(false);
  const [newDesaName, setNewDesaName] = useState('');
  const [newKecamatan, setNewKecamatan] = useState('');

  // Synchronize activeStageTab with available active stages
  useEffect(() => {
    if (activeStages.length > 0 && !activeStages.some(s => s.key === activeStageTab)) {
      setActiveStageTab(activeStages[0].key);
    }
  }, [activeStages, activeStageTab]);

  // Preview Modal
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    pdfUrl?: string;
    photos?: string[];
  }>({ isOpen: false, title: '' });

  // Extract unique villages from land records
  const uniqueDesasFromRecords = useMemo(() => {
    const map = new Map<string, { totalBidang: number; totalLuas: number }>();
    records.forEach(r => {
      const d = (r.DESA || '').trim().toUpperCase();
      if (!d) return;
      const current = map.get(d) || { totalBidang: 0, totalLuas: 0 };
      current.totalBidang += 1;
      const luas = parseFloat(r.LUAS ? String(r.LUAS).replace(',', '.') : '0') || 0;
      current.totalLuas += luas;
      map.set(d, current);
    });
    return map;
  }, [records]);

  // Load and sync village resumes with Cloud Firestore
  useEffect(() => {
    let unsubscribe = () => {};
    setIsLoading(true);

    const init = async () => {
      const stored = await loadVillageResumes(activeProjectId, { accessToken, spreadsheetId });
      
      // Ensure all unique desas from records are represented in view
      const existingMap = new Map<string, VillageResume>();
      stored.forEach(r => existingMap.set(r.desaName.toUpperCase(), r));

      const mergedList: VillageResume[] = [...stored];

      uniqueDesasFromRecords.forEach((_, desaName) => {
        if (!existingMap.has(desaName)) {
          // Display default placeholder in UI without overwriting Firestore
          const defaultResume = createDefaultVillageResume(activeProjectId, desaName);
          mergedList.push(defaultResume);
          existingMap.set(desaName, defaultResume);
        }
      });

      setResumes(mergedList);
      setIsLoading(false);

      // Subscribe to realtime push updates from Cloud Firestore
      unsubscribe = subscribeVillageResumes(
        activeProjectId, 
        (updated) => {
          setIsCloudConnected(true);
          setCloudErrorDetail(null);
          setResumes(prev => {
            const map = new Map<string, VillageResume>();
            // Keep local placeholders
            prev.forEach(p => map.set(p.desaName.toUpperCase(), p));
            // Apply live Firestore updates
            updated.forEach(u => map.set(u.desaName.toUpperCase(), u));
            return Array.from(map.values());
          });
        },
        (connected, err) => {
          setIsCloudConnected(connected);
          if (err) {
            setCloudErrorDetail(err);
          } else if (connected) {
            setCloudErrorDetail(null);
          }
        }
      );
    };

    init();
    return () => unsubscribe();
  }, [activeProjectId, uniqueDesasFromRecords, accessToken, spreadsheetId]);

  // Manual pull from Google Sheets & Cloud Firestore
  const handleManualRefreshCloud = async () => {
    setIsRefreshingCloud(true);
    try {
      // 1. If Google Sheets 1 Workbook connection is available, fetch from RESUME_SEMUA_JALUR tab
      if (accessToken && spreadsheetId) {
        try {
          const sheetResumes = await fetchResumesFromGoogleSheet(accessToken, spreadsheetId, activeProjectId);
          if (sheetResumes.length > 0) {
            setResumes(prev => {
              const map = new Map<string, VillageResume>();
              prev.forEach(p => map.set(p.desaName.toUpperCase(), p));
              sheetResumes.forEach(u => map.set(u.desaName.toUpperCase(), u));
              return Array.from(map.values());
            });
            setSaveFeedback({ 
              type: 'success', 
              text: `Data Resume berhasil disinkronkan langsung dari 1 Workbook Google Sheets (${sheetResumes.length} desa)!` 
            });
            setTimeout(() => setSaveFeedback(null), 4000);
            return;
          }
        } catch (sheetErr) {
          console.warn("Pull from Google Sheet warning:", sheetErr);
        }
      }

      // 2. Cloud Firestore check
      const connTest = await testCloudConnection();
      if (!connTest.connected) {
        setIsCloudConnected(false);
        if (connTest.error) {
          setCloudErrorDetail({ message: connTest.error });
        }
        setSaveFeedback({ 
          type: 'warning', 
          text: 'Koneksi Cloud Firestore belum aktif / izin rules ditolak. Data tetap aman di penyimpanan lokal.' 
        });
        setTimeout(() => setSaveFeedback(null), 5000);
        return;
      }

      const fresh = await loadVillageResumes(activeProjectId, { accessToken, spreadsheetId });
      setResumes(prev => {
        const map = new Map<string, VillageResume>();
        prev.forEach(p => map.set(p.desaName.toUpperCase(), p));
        fresh.forEach(u => map.set(u.desaName.toUpperCase(), u));
        return Array.from(map.values());
      });
      setIsCloudConnected(true);
      setCloudErrorDetail(null);
      setSaveFeedback({ type: 'success', text: 'Data Resume Proyek berhasil disinkronkan langsung dari Cloud Firestore!' });
      setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err: any) {
      setIsCloudConnected(false);
      setCloudErrorDetail({ message: err?.message || String(err) });
      setSaveFeedback({ type: 'warning', text: 'Gagal menarik data cloud. Tetap menggunakan data tersimpan lokal.' });
      setTimeout(() => setSaveFeedback(null), 5000);
    } finally {
      setIsRefreshingCloud(false);
    }
  };

  // Calculate Progress of a single village dynamically based on active stages
  const calculateVillageProgress = (res: VillageResume): number => {
    if (activeStages.length === 0) return 0;
    const stageWeight = 100 / activeStages.length;
    let points = 0;
    activeStages.forEach(s => {
      const stage = (res as any)[s.key] as VillageStageDoc | undefined;
      if (stage?.status === 'SELESAI') points += stageWeight;
      else if (stage?.status === 'PROSES') points += stageWeight / 2;
    });
    return Math.round(points);
  };

  // Filtered Resumes
  const filteredResumes = useMemo(() => {
    return resumes.filter(res => {
      const matchesSearch = res.desaName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (res.kecamatan || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      const progress = calculateVillageProgress(res);
      if (statusFilter === 'COMPLETED') return progress === 100;
      if (statusFilter === 'IN_PROGRESS') return progress > 0 && progress < 100;
      if (statusFilter === 'NOT_STARTED') return progress === 0;
      return true;
    }).sort((a, b) => a.desaName.localeCompare(b.desaName));
  }, [resumes, searchQuery, statusFilter, activeStages]);

  // Overall Project Resume Metrics
  const metrics = useMemo(() => {
    const totalDesa = resumes.length;
    if (totalDesa === 0) {
      return { totalDesa: 0, completedCount: 0, inProgressCount: 0, avgProgress: 0, stageStats: {} };
    }

    let totalProgressSum = 0;
    let completedCount = 0;
    let inProgressCount = 0;

    const stageStats: Record<string, { selesai: number; proses: number }> = {};
    activeStages.forEach(s => {
      stageStats[s.key] = { selesai: 0, proses: 0 };
    });

    resumes.forEach(r => {
      const prog = calculateVillageProgress(r);
      totalProgressSum += prog;
      if (prog === 100) completedCount++;
      else if (prog > 0) inProgressCount++;

      activeStages.forEach(s => {
        const stage = (r as any)[s.key] as VillageStageDoc | undefined;
        if (stage?.status === 'SELESAI') stageStats[s.key].selesai++;
        else if (stage?.status === 'PROSES') stageStats[s.key].proses++;
      });
    });

    return {
      totalDesa,
      completedCount,
      inProgressCount,
      avgProgress: Math.round(totalProgressSum / totalDesa),
      stageStats
    };
  }, [resumes, activeStages]);

  // Handle Save Edited Village Stage
  const handleSaveVillageChanges = async () => {
    if (!editingDesa) return;
    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const updated: VillageResume = {
        ...editingDesa,
        updatedBy: operatorName || userEmail
      };
      const desaStats = uniqueDesasFromRecords.get(updated.desaName.toUpperCase());
      const progress = calculateVillageProgress(updated);
      const result = await saveVillageResume(updated, {
        accessToken,
        spreadsheetId,
        projectName: activeProjectName,
        totalBidang: desaStats?.totalBidang || 0,
        totalLuas: desaStats?.totalLuas || 0,
        progressPct: progress
      });
      setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
      setEditingDesa(null);

      if (result.sheetSynced) {
        setSaveFeedback({
          type: 'success',
          text: `Progres Desa ${updated.desaName} berhasil disimpan ke 1 Workbook Google Sheets (Tab RESUME_SEMUA_JALUR) & otomatis muncul di komputer rekan!`
        });
      } else if (result.cloudSynced) {
        setSaveFeedback({
          type: 'success',
          text: `Progres Desa ${updated.desaName} berhasil disimpan ke Cloud Firestore & otomatis tersinkron ke semua perangkat tim!`
        });
      } else {
        setSaveFeedback({
          type: 'warning',
          text: `Data tersimpan di perangkat ini. ${result.error || 'Belum tersinkron ke cloud'}.`
        });
      }
      setTimeout(() => setSaveFeedback(null), 6000);
    } catch (e: any) {
      console.error('Error saving village resume:', e);
      setSaveFeedback({
        type: 'error',
        text: `Gagal menyimpan: ${e?.message || 'Terjadi kesalahan sistem'}`
      });
      setTimeout(() => setSaveFeedback(null), 6000);
    } finally {
      setIsSaving(false);
    }
  };

  // Add Manual Village
  const handleAddManualDesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesaName.trim()) return;
    const newResume = createDefaultVillageResume(activeProjectId, newDesaName.trim(), newKecamatan.trim());
    const res = await saveVillageResume(newResume);
    setResumes(prev => [...prev, newResume]);
    setNewDesaName('');
    setNewKecamatan('');
    setIsAddingDesaModal(false);

    if (res.cloudSynced) {
      setSaveFeedback({
        type: 'success',
        text: `Desa ${newResume.desaName} berhasil ditambahkan dan disinkronkan ke Cloud Firestore!`
      });
      setTimeout(() => setSaveFeedback(null), 5000);
    }
  };

  // Helper to ensure a dedicated Google Drive folder exists for the village
  const getOrCreateDesaFolder = async (desaName: string): Promise<string | null> => {
    let currentToken = accessToken;
    if (!currentToken && onRefreshGoogleToken) {
      currentToken = (await onRefreshGoogleToken()) || undefined;
    }
    if (!currentToken) return null;

    try {
      // 1. Root / master upload folder in Drive
      const mainFolderId = uploadsFolderId || await findOrCreateFolder(currentToken, "SIP_Berkas_Pertanahan_Desa");
      // 2. Dedicated master folder for Resume Proyek
      const resumeMasterFolderId = await findOrCreateFolder(currentToken, "RESUME_PROYEK_DESA", mainFolderId);
      // 3. Subfolder dedicated for this specific Desa: RESUME_DESA_[NAMA_DESA]
      const cleanDesaName = desaName.trim().toUpperCase().replace(/[\/\\?%*:|"<>\s]/g, '_');
      const desaFolderId = await findOrCreateFolder(currentToken, `RESUME_DESA_${cleanDesaName}`, resumeMasterFolderId);
      return desaFolderId;
    } catch (err) {
      console.warn("Gagal membuat/mencari folder desa di Google Drive:", err);
      return null;
    }
  };

  // Upload PDF Handler inside editing modal
  const handleUploadPdf = async (file: File, stageKey: string) => {
    if (!editingDesa) return;
    setIsUploadingFile(true);
    setUploadProgressText('Menghubungkan ke Google Drive...');
    try {
      let webLink = '';
      let currentToken = accessToken;
      if (!currentToken && onRefreshGoogleToken) {
        currentToken = (await onRefreshGoogleToken()) || undefined;
      }

      if (currentToken) {
        setUploadProgressText(`Membuat folder Google Drive untuk Desa ${editingDesa.desaName}...`);
        const desaFolderId = await getOrCreateDesaFolder(editingDesa.desaName);
        if (desaFolderId) {
          setUploadProgressText(`Mengunggah file PDF "${file.name}" langsung ke Google Drive...`);
          const res = await uploadFileToDrive(
            currentToken, 
            file, 
            `BA_${stageKey.toUpperCase()}`, 
            editingDesa.desaName, 
            desaFolderId
          );
          webLink = res.webViewLink;
          setEditingDesa(prev => prev ? { ...prev, driveFolderId: desaFolderId } : null);
        } else {
          webLink = await fileToBase64(file);
        }
      } else {
        if (file.size > 800 * 1024) {
          alert(`Perhatian: File PDF ini cukup besar (${Math.round(file.size / 1024)} KB). Disarankan sambungkan Google Drive agar berkas otomatis masuk ke folder Google Drive dan tidak membebani database.`);
        }
        webLink = await fileToBase64(file);
      }

      setEditingDesa(prev => {
        if (!prev) return null;
        const currentStage = (prev as any)[stageKey] || createEmptyStageDoc();
        return {
          ...prev,
          [stageKey]: {
            ...currentStage,
            pdfUrl: webLink,
            pdfName: file.name,
            status: currentStage.status === 'BELUM' ? 'PROSES' : currentStage.status
          }
        };
      });

      setSaveFeedback({
        type: 'success',
        text: `Berkas PDF "${file.name}" berhasil diunggah langsung ke folder Google Drive Desa ${editingDesa.desaName}!`
      });
      setTimeout(() => setSaveFeedback(null), 5000);
    } catch (err: any) {
      console.error('Failed to upload PDF:', err);
      alert('Gagal mengunggah PDF ke Google Drive: ' + (err?.message || 'Cek koneksi internet.'));
    } finally {
      setIsUploadingFile(false);
      setUploadProgressText('');
    }
  };

  // Upload Documentation Photos Handler inside editing modal
  const handleUploadPhoto = async (file: File, stageKey: string) => {
    if (!editingDesa) return;
    setIsUploadingFile(true);
    setUploadProgressText('Menghubungkan ke Google Drive...');
    try {
      let photoUrl = '';
      let currentToken = accessToken;
      if (!currentToken && onRefreshGoogleToken) {
        currentToken = (await onRefreshGoogleToken()) || undefined;
      }

      if (currentToken) {
        setUploadProgressText(`Membuat folder Google Drive untuk Desa ${editingDesa.desaName}...`);
        const desaFolderId = await getOrCreateDesaFolder(editingDesa.desaName);
        if (desaFolderId) {
          setUploadProgressText(`Mengunggah foto dokumentasi ke Google Drive...`);
          const res = await uploadFileToDrive(
            currentToken, 
            file, 
            `DOK_${stageKey.toUpperCase()}`, 
            editingDesa.desaName, 
            desaFolderId
          );
          photoUrl = res.webViewLink;
          setEditingDesa(prev => prev ? { ...prev, driveFolderId: desaFolderId } : null);
        } else {
          photoUrl = await compressImageFile(file, 1000, 1000, 0.65);
        }
      } else {
        // Auto compress camera photos to ~60-90KB for safe Firestore storage if offline
        photoUrl = await compressImageFile(file, 1000, 1000, 0.65);
      }

      setEditingDesa(prev => {
        if (!prev) return null;
        const currentStage = (prev as any)[stageKey] || createEmptyStageDoc();
        const existingPhotos = currentStage.docPhotos || [];
        return {
          ...prev,
          [stageKey]: {
            ...currentStage,
            docPhotos: [...existingPhotos, photoUrl],
            status: currentStage.status === 'BELUM' ? 'PROSES' : currentStage.status
          }
        };
      });

      setSaveFeedback({
        type: 'success',
        text: `Foto dokumentasi berhasil diunggah langsung ke folder Google Drive Desa ${editingDesa.desaName}!`
      });
      setTimeout(() => setSaveFeedback(null), 5000);
    } catch (err: any) {
      console.error('Failed to upload photo:', err);
      alert('Gagal mengunggah foto dokumentasi: ' + (err?.message || 'Cek koneksi internet.'));
    } finally {
      setIsUploadingFile(false);
      setUploadProgressText('');
    }
  };

  // Export CSV dynamically according to active stages
  const handleExportCSV = () => {
    const headers = ['No', 'Nama Desa', 'Kecamatan', ...activeStages.map(s => s.fullName), 'Progres (%)'];
    const rows = filteredResumes.map((r, i) => [
      i + 1,
      `"${r.desaName}"`,
      `"${r.kecamatan || '-'}"`,
      ...activeStages.map(s => {
        const stage = (r as any)[s.key] as VillageStageDoc | undefined;
        return stage?.status || 'BELUM';
      }),
      `${calculateVillageProgress(r)}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Resume_Proyek_Desa_${activeProjectName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Status Badge
  const renderStatusBadge = (status: StageStatus) => {
    if (status === 'SELESAI') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" /> Selesai
        </span>
      );
    }
    if (status === 'PROSES') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Clock className="w-3 h-3" /> Proses
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">
        Belum
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans" id="resume_project_panel">
      {/* 1. Header Banner & Resume KPI */}
      <div className="glass-card p-6 rounded-3xl border border-amber-500/20 shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Menu 1.4
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Landmark className="w-5 h-5 text-amber-400" />
                Resume Proyek: Progres Administrasi & Lapangan Per Desa
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              Matriks resume {activeStages.length} tahapan proyek per desa: {activeStages.map(s => s.fullName).join(', ')}.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Realtime Cloud Sync Status */}
            <button
              type="button"
              onClick={() => setIsCloudHelpModalOpen(true)}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 cursor-pointer transition-all ${
                isCloudConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/20'
              }`}
              title="Klik untuk melihat status sinkronisasi & panduan Cloud Firestore"
            >
              <span className={`w-2 h-2 rounded-full ${isCloudConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span>{isCloudConnected ? 'Cloud Firestore (Real-time)' : 'Mode Lokal (Klik Info)'}</span>
              <Info className="w-3.5 h-3.5 opacity-70 shrink-0" />
            </button>

            {/* Manual Refresh from Cloud */}
            <button
              onClick={handleManualRefreshCloud}
              disabled={isRefreshingCloud}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              title="Tarik data terbaru dari Cloud Firestore jika rekan kerja baru saja menyimpan pembaruan"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
              <span>{isRefreshingCloud ? 'Menyinkronkan...' : 'Sinkronkan Cloud'}</span>
            </button>

            {/* Settings: Atur Poin Tahapan Proyek */}
            {!isGuest && (
              <button
                onClick={() => {
                  setTempStages(JSON.parse(JSON.stringify(stagesConfig)));
                  setIsSettingsModalOpen(true);
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:border-amber-500/40"
                title="Atur poin tahapan apa saja yang aktif pada proyek ini"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                <span>Atur Poin ({activeStages.length}/{stagesConfig.length})</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              title="Unduh Rekap CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Ekspor Rekap</span>
            </button>

            {/* Generate Otomatis Google Sheet Resume */}
            {!isGuest && (
              <button
                type="button"
                disabled={isGeneratingSheet}
                onClick={handleAutoGenerateResumeSheet}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                title="Buat Google Spreadsheet baru khusus Resume Proyek ini langsung di Google Drive Anda dengan 36 header"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isGeneratingSheet ? 'animate-spin' : ''}`} />
                <span>{isGeneratingSheet ? 'Membuat Spreadsheet...' : '⚡ Buat Google Sheet Resume'}</span>
              </button>
            )}

            {/* 1 File Excel Workbook (Semua Jalur + Status + Link Drive) */}
            <button
              onClick={() => setIsWorkbookModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 hover:text-white rounded-xl border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02]"
              title="1 File Excel Workbook (Semua Jalur + Status Tahapan + Link Google Drive)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>1 Workbook Excel (Semua Jalur)</span>
            </button>

            {/* Bagikan / Impor Data Antar Rekan */}
            <button
              onClick={() => {
                setImportJsonText('');
                setImportResult(null);
                setShareTab('export');
                setIsShareModalOpen(true);
              }}
              className="px-3.5 py-2 bg-sky-950/60 hover:bg-sky-900/80 text-sky-200 hover:text-white rounded-xl border border-sky-500/30 hover:border-sky-500/60 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              title="Kirim atau terima data resume proyek antar rekan kerja (Cadangan / Sinkronisasi Cepat)"
            >
              <Share2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Bagikan / Impor Data</span>
            </button>

            {!isGuest && (
              <button
                onClick={() => setIsAddingDesaModal(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 cursor-pointer"
                title="Tambah Desa Baru ke Resume"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Desa</span>
              </button>
            )}
          </div>
        </div>

        {/* Save Feedback Alert Banner */}
        {saveFeedback && (
          <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fadeIn ${
            saveFeedback.type === 'success' 
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
              : saveFeedback.type === 'warning'
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}>
            <div className="flex items-center gap-2.5">
              {saveFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : saveFeedback.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{saveFeedback.text}</span>
            </div>
            <button 
              onClick={() => setSaveFeedback(null)} 
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Top KPI Metrics Bar */}
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${
          activeStages.length <= 4 ? 'lg:grid-cols-4' : activeStages.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-6'
        } gap-3.5 pt-2 border-t border-white/5 relative z-10`}>
          {activeStages.map((stage) => {
            const stat = metrics.stageStats[stage.key] || { selesai: 0, proses: 0 };
            const pct = metrics.totalDesa > 0 ? Math.round((stat.selesai / metrics.totalDesa) * 100) : 0;
            return (
              <div key={stage.key} className="bg-slate-900/60 p-3 rounded-2xl border border-white/5 space-y-2 hover:border-white/10 transition-all">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${stage.color || 'text-amber-400'} truncate block`}>
                    {stage.label}
                  </span>
                  <span className="text-[10px] font-mono font-extrabold text-slate-400">
                    {stat.selesai}/{metrics.totalDesa}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-white font-mono">{pct}%</span>
                  <span className="text-[9px] text-slate-500 font-semibold">{stat.proses} Proses</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Overall Status Banner */}
        <div className="bg-amber-950/40 border border-amber-500/20 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-sm shrink-0 border border-amber-500/30">
              {metrics.avgProgress}%
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wide">
                Total Progres Kumulatif Koridor: {metrics.totalDesa} Desa
              </h4>
              <p className="text-[11px] text-slate-400">
                {metrics.completedCount} desa telah 100% tuntas, {metrics.inProgressCount} desa sedang dalam tahap pengerjaan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isGuest && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold">
                <Lock className="w-3.5 h-3.5 text-amber-400" /> Mode Tamu (Hanya Lihat)
              </span>
            )}
          </div>
        </div>

        {/* Notifikasi Cepat Sinkronisasi Antar Rekan */}
        <div className="bg-slate-900/80 border border-sky-500/25 p-3.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-200 block">Rekan kerja sudah mengisi di laptopnya tapi di layar Anda masih kosong?</span>
              <span className="text-[11px] text-slate-400">
                Jika Firebase Rules di Google Cloud belum diizinkan, data rekan tersimpan di browser lokalnya. Anda bisa langsung mengambil datanya melalui tombol <strong className="text-sky-300">Impor Data</strong> atau klik tombol <strong className="text-sky-300">Sinkronkan Cloud</strong>.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => {
                setImportJsonText('');
                setImportResult(null);
                setShareTab('import');
                setIsShareModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow cursor-pointer whitespace-nowrap"
            >
              Impor Data Rekan
            </button>
            <button
              onClick={() => setIsCloudHelpModalOpen(true)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-white/10 transition-all cursor-pointer whitespace-nowrap"
            >
              Solusi & Status Cloud
            </button>
          </div>
        </div>
      </div>

      {/* 2. Controls & Filter Bar */}
      <div className="glass-card p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari desa atau kecamatan..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ALL' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({resumes.length})
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tuntas 100%
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'IN_PROGRESS' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              On Progress
            </button>
          </div>
        </div>
      </div>

      {/* 3. Table Resume View (Self-contained scroll container like 3.1) */}
      <div className="glass-card rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
        {/* Scroll Control Bar */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
            <span className="text-[11px] font-bold text-slate-300">Tampilan Scroll:</span>
            <span className="text-[10px] text-slate-400 font-mono">
              {tableHeightMode === 'tall' 
                ? 'Layar Penuh (Scroll mandiri luas viewport)' 
                : 'Scroll mandiri dalam tabel (halaman tidak memanjang)'}
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono hidden md:inline">
              Shift + Scroll untuk geser samping
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-emerald-400 font-bold text-[11px] mr-1 hidden sm:inline">
              {filteredResumes.length} Desa Terdata
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setTableHeightMode('compact')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  tableHeightMode === 'compact'
                    ? 'bg-emerald-600 text-white shadow-sm'
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
                    ? 'bg-emerald-600 text-white shadow-sm'
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
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Layar Penuh"
              >
                Layar Penuh
              </button>
            </div>
          </div>
        </div>

        <div 
          className={`table-scroll-container overflow-auto scrollbar-thin bg-slate-950/80 ${
            tableHeightMode === 'compact'
              ? 'max-h-[380px]'
              : tableHeightMode === 'standard'
              ? 'max-h-[550px]'
              : 'max-h-[calc(100vh-250px)]'
          }`}
        >
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-white/10 shadow-md">
              <tr className="bg-slate-950/90 border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">
                <th className="py-3 px-3 w-12 text-center">No</th>
                <th className="py-3 px-3 w-48">Desa & Info Lahan</th>
                {activeStages.map((stage) => (
                  <th key={stage.key} className="py-3 px-3 min-w-[130px]">
                    <span className={stage.color || 'text-slate-300'}>{stage.label}</span>
                  </th>
                ))}
                <th className="py-3 px-3 w-28 text-center">Progres</th>
                <th className="py-3 px-4 w-36 text-center">Aksi Dokumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-medium">
              {filteredResumes.length === 0 ? (
                <tr>
                  <td colSpan={activeStages.length + 4} className="text-center py-16 text-slate-400 space-y-3">
                    <Landmark className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold">Tidak ada data desa yang cocok dengan pencarian.</p>
                  </td>
                </tr>
              ) : (
                filteredResumes.map((res, index) => {
                  const progress = calculateVillageProgress(res);
                  const villageData = uniqueDesasFromRecords.get(res.desaName) || { totalBidang: 0, totalLuas: 0 };

                  return (
                    <tr 
                      key={res.id} 
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* No */}
                      <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-bold">
                        {index + 1}
                      </td>

                      {/* Desa & Info Lahan */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-extrabold text-white text-sm tracking-tight flex items-center gap-1.5">
                            <Landmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            {res.desaName}
                          </div>
                          {res.kecamatan && (
                            <span className="text-[10px] text-slate-400 font-semibold block">
                              Kec. {res.kecamatan}
                            </span>
                          )}
                          <div className="flex items-center gap-2 pt-0.5 text-[10px] font-mono text-slate-400">
                            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                              {villageData.totalBidang} Bidang
                            </span>
                            <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                              {villageData.totalLuas.toLocaleString('id-ID')} m²
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Dynamic Stage Columns */}
                      {activeStages.map((stage) => {
                        const stageData = (res as any)[stage.key] as VillageStageDoc | undefined || createEmptyStageDoc();
                        return (
                          <td key={stage.key} className="py-3.5 px-3">
                            <div className="space-y-1.5">
                              {renderStatusBadge(stageData.status)}
                              <div className="flex items-center gap-1 flex-wrap">
                                {stageData.pdfUrl && (
                                  <button
                                    onClick={() => setPreviewModal({
                                      isOpen: true,
                                      title: `${stage.fullName} - Desa ${res.desaName}`,
                                      pdfUrl: stageData.pdfUrl
                                    })}
                                    className="p-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    title={`Buka Berkas PDF ${stage.fullName}`}
                                  >
                                    <FileText className="w-3 h-3 text-amber-400" /> PDF
                                  </button>
                                )}
                                {(stageData.docPhotos?.length || 0) > 0 && (
                                  <button
                                    onClick={() => setPreviewModal({
                                      isOpen: true,
                                      title: `Foto ${stage.fullName} - Desa ${res.desaName}`,
                                      photos: stageData.docPhotos
                                    })}
                                    className="p-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Lihat Foto Dokumentasi"
                                  >
                                    <ImageIcon className="w-3 h-3 text-purple-400" /> {stageData.docPhotos?.length} Foto
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}

                      {/* Progress Bar */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="space-y-1">
                          <span className={`text-xs font-mono font-black ${
                            progress === 100 ? 'text-emerald-400' : progress > 0 ? 'text-amber-400' : 'text-slate-500'
                          }`}>
                            {progress}%
                          </span>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Action Button & Drive Folder Link */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isGuest ? (
                            <button
                              onClick={() => {
                                setEditingDesa(res);
                                setActiveStageTab(activeStages[0]?.key || 'baSosialisasiAwal');
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm flex-1"
                              title="Kelola & Upload Dokumen Desa"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Kelola</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingDesa(res);
                                setActiveStageTab(activeStages[0]?.key || 'baSosialisasiAwal');
                              }}
                              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-white/10 flex-1"
                              title="Tinjau Berkas Detail Desa"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Tinjau</span>
                            </button>
                          )}

                          {res.driveFolderId ? (
                            <a
                              href={`https://drive.google.com/drive/folders/${res.driveFolderId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-sky-500/15 hover:bg-sky-500/30 text-sky-400 hover:text-sky-300 border border-sky-500/30 rounded-xl transition-all cursor-pointer"
                              title={`Buka Folder Google Drive Desa ${res.desaName}`}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <button
                              onClick={async () => {
                                const folderId = await getOrCreateDesaFolder(res.desaName);
                                if (folderId) {
                                  const updated = { ...res, driveFolderId: folderId };
                                  await saveVillageResume(updated);
                                  window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
                                } else {
                                  alert('Sambungkan Google Drive pada Menu 1: Dashboard Utama agar folder otomatis dibuat di Google Drive.');
                                }
                              }}
                              className="p-1.5 bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white border border-white/10 rounded-xl transition-all cursor-pointer"
                              title={`Buat Folder Google Drive Desa ${res.desaName}`}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
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

      {/* 4. MODAL: EDIT / UPLOAD BERKAS TAHAPAN DESA */}
      {editingDesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Kelola Administrasi & Dokumen: Desa {editingDesa.desaName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Kecamatan {editingDesa.kecamatan || '-'} • Jalur {activeProjectName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editingDesa.driveFolderId ? (
                  <a
                    href={`https://drive.google.com/drive/folders/${editingDesa.driveFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Buka Folder Google Drive Desa ini di tab baru"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                    <span>Folder Drive Desa</span>
                    <ExternalLink className="w-3 h-3 text-sky-400" />
                  </a>
                ) : (
                  <button
                    onClick={async () => {
                      const folderId = await getOrCreateDesaFolder(editingDesa.desaName);
                      if (folderId) {
                        const updated = { ...editingDesa, driveFolderId: folderId };
                        setEditingDesa(updated);
                        await saveVillageResume(updated);
                        window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
                      } else {
                        alert('Sambungkan Google Drive pada Menu 1: Dashboard Utama agar folder otomatis dibuat di Google Drive.');
                      }
                    }}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Buat & Buka Folder Google Drive Desa ini di tab baru"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Buat Folder Drive</span>
                  </button>
                )}

                <button
                  onClick={() => setEditingDesa(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Stage Tabs */}
            <div className="flex border-b border-white/10 bg-slate-950/50 px-4 overflow-x-auto">
              {activeStages.map((stage) => {
                const stageData = (editingDesa as any)[stage.key];
                const isActive = activeStageTab === stage.key;
                return (
                  <button
                    key={stage.key}
                    onClick={() => setActiveStageTab(stage.key)}
                    className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                      isActive 
                        ? 'border-amber-500 text-amber-300 bg-white/5' 
                        : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{stage.label}</span>
                    {stageData?.status === 'SELESAI' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Modal Body: Active Stage Details */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {isUploadingFile && (
                <div className="bg-sky-950/80 border border-sky-500/40 p-4 rounded-2xl flex items-center gap-3 animate-pulse text-xs font-bold text-sky-200">
                  <RefreshCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                  <span>{uploadProgressText || 'Sedang membuat folder desa di Google Drive & mengunggah berkas...'}</span>
                </div>
              )}
              {(() => {
                const currentStageConfig = activeStages.find(s => s.key === activeStageTab) || stagesConfig.find(s => s.key === activeStageTab) || stagesConfig[0];
                const stageData = (editingDesa as any)[activeStageTab] || createEmptyStageDoc();

                return (
                  <div className="space-y-6">
                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-extrabold text-white">
                          {currentStageConfig.fullName}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Status kelengkapan berkas fisik, berita acara, serta foto dokumentasi lapangan.
                        </p>
                      </div>

                      {/* Status Selector */}
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-300 uppercase">Status:</label>
                        <select
                          disabled={isGuest}
                          value={stageData.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as StageStatus;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: {
                                  ...stageData,
                                  status: newStatus
                                }
                              };
                            });
                          }}
                          className="bg-slate-950 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
                        >
                          <option value="BELUM">Belum Dilaksanakan</option>
                          <option value="PROSES">Sedang Proses</option>
                          <option value="SELESAI">Selesai & Lengkap</option>
                        </select>
                      </div>
                    </div>

                    {/* Date & Manual Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                          Tanggal Pelaksanaan
                        </label>
                        <input
                          type="date"
                          disabled={isGuest}
                          value={stageData.date || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: { ...stageData, date: val }
                              };
                            });
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                          Catatan / Keterangan Khusus
                        </label>
                        <input
                          type="text"
                          disabled={isGuest}
                          value={stageData.notes || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: { ...stageData, notes: val }
                              };
                            });
                          }}
                          placeholder="Contoh: Telah dihadiri Kepala Desa dan perwakilan warga..."
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* PDF Section (If applicable) */}
                    {currentStageConfig.hasPdf && (
                      <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                            <FileText className="w-4 h-4 text-amber-400" />
                            Dokumen Berita Acara (PDF)
                          </h5>
                          {stageData.pdfUrl && (
                            <button
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                title: `${currentStageConfig.fullName} - ${editingDesa.desaName}`,
                                pdfUrl: stageData.pdfUrl
                              })}
                              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Buka PDF
                            </button>
                          )}
                        </div>

                        {stageData.pdfUrl ? (
                          <div className="flex items-center justify-between p-3 bg-slate-950/80 rounded-xl border border-amber-500/20">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <FileText className="w-5 h-5 text-amber-400 shrink-0" />
                              <span className="text-xs font-bold text-white truncate">
                                {stageData.pdfName || 'Dokumen_Berita_Acara.pdf'}
                              </span>
                            </div>
                            {!isGuest && (
                              <button
                                onClick={() => {
                                  setEditingDesa(prev => {
                                    if (!prev) return null;
                                    return {
                                      ...prev,
                                      [activeStageTab]: {
                                        ...stageData,
                                        pdfUrl: undefined,
                                        pdfName: undefined
                                      }
                                    };
                                  });
                                }}
                                className="p-1 text-slate-400 hover:text-rose-400 rounded-lg cursor-pointer"
                                title="Hapus Berkas PDF"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          !isGuest ? (
                            <label className="border-2 border-dashed border-white/10 hover:border-amber-500/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all bg-white/[0.01] hover:bg-amber-500/5">
                              <UploadCloud className="w-8 h-8 text-amber-400" />
                              <span className="text-xs font-bold text-white">Unggah Berkas PDF</span>
                              <span className="text-[10px] text-slate-400">Klik atau seret file PDF berita acara ke sini</span>
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadPdf(file, activeStageTab);
                                }}
                              />
                            </label>
                          ) : (
                            <div className="p-4 bg-slate-950/40 rounded-xl border border-white/5 text-center text-xs text-slate-400">
                              Belum ada berkas PDF yang diunggah.
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Photo Documentation Section (If applicable) */}
                    {currentStageConfig.hasPhoto && (
                      <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                            <ImageIcon className="w-4 h-4 text-purple-400" />
                            Dokumentasi Foto Lapangan
                          </h5>
                          <span className="text-[10px] font-mono text-slate-400">
                            {(stageData.docPhotos || []).length} Foto Terunggah
                          </span>
                        </div>

                        {/* Photos Grid */}
                        {(stageData.docPhotos || []).length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {(stageData.docPhotos || []).map((photoUrl, idx) => (
                              <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/10 aspect-video bg-slate-950">
                                <img
                                  src={photoUrl}
                                  alt={`Dokumentasi ${idx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setPreviewModal({
                                      isOpen: true,
                                      title: `Dokumentasi Foto ${idx + 1} - Desa ${editingDesa.desaName}`,
                                      photos: [photoUrl]
                                    })}
                                    className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs cursor-pointer"
                                    title="Lihat Lebih Besar"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {!isGuest && (
                                    <button
                                      onClick={() => {
                                        setEditingDesa(prev => {
                                          if (!prev) return null;
                                          const photos = [...(stageData.docPhotos || [])];
                                          photos.splice(idx, 1);
                                          return {
                                            ...prev,
                                            [activeStageTab]: {
                                              ...stageData,
                                              docPhotos: photos
                                            }
                                          };
                                        });
                                      }}
                                      className="p-1.5 bg-rose-500/30 hover:bg-rose-500/50 rounded-lg text-rose-300 text-xs cursor-pointer"
                                      title="Hapus Foto"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Upload Photo Button */}
                        {!isGuest && (
                          <label className="border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-2xl p-4 flex items-center justify-center gap-2 cursor-pointer transition-all bg-white/[0.01] hover:bg-purple-500/5">
                            <UploadCloud className="w-5 h-5 text-purple-400" />
                            <span className="text-xs font-bold text-white">Tambah Foto Dokumentasi</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadPhoto(file, activeStageTab);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-900/90 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">
                Terakhir diperbarui: {editingDesa.updatedBy || 'Sistem'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDesa(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Tutup
                </button>

                {!isGuest && (
                  <button
                    type="button"
                    onClick={handleSaveVillageChanges}
                    disabled={isSaving}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: PREVIEW PDF ATAU FOTO DOKUMENTASI */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900">
              <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
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
                      <img src={photo} alt={`Dokumentasi ${i + 1}`} className="w-full h-auto object-contain max-h-[60vh] mx-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-xs">Tidak ada lampiran yang dapat ditampilkan.</p>
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

      {/* 6. MODAL: TAMBAH DESA MANUAL */}
      {isAddingDesaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-md border border-white/20 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                Tambah Desa Baru ke Resume
              </h3>
              <button
                onClick={() => setIsAddingDesaModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddManualDesa} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                  Nama Desa
                </label>
                <input
                  type="text"
                  required
                  value={newDesaName}
                  onChange={(e) => setNewDesaName(e.target.value)}
                  placeholder="Contoh: SOBOREJO"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                  Kecamatan (Opsional)
                </label>
                <input
                  type="text"
                  value={newKecamatan}
                  onChange={(e) => setNewKecamatan(e.target.value)}
                  placeholder="Contoh: SUKOREJO"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsAddingDesaModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 cursor-pointer"
                >
                  Tambahkan Desa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: PENGATURAN POIN TAHAPAN RESUME PROYEK */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-2xl border border-amber-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/95">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    Atur Poin Tahapan Resume Proyek
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Proyek: <span className="text-amber-300 font-bold">{activeProjectName}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-950/60">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Setiap jalur transmisi / proyek dapat memiliki tahapan pekerjaan yang berbeda. Poin tahapan yang dinonaktifkan di bawah ini <strong>tidak akan dihitung dalam persentase progres rekap desa</strong> dan disembunyikan dari tabel resume proyek ini.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Pilihan Cepat (Presets):
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setTempStages(tempStages.map(s => ({ ...s, active: true })));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Aktifkan Semua (6 Tahap)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempStages(tempStages.map(s => ({
                        ...s,
                        active: s.key !== 'bushClearing'
                      })));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Standar ROW (5 Tahap tanpa Bush Clearing)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempStages(tempStages.map(s => ({
                        ...s,
                        active: s.key === 'baSosialisasiAwal' || s.key === 'baPengumuman' || s.key === 'lampiranBapt'
                      })));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Tahap Awal (Sos. Pendahuluan, Pengumuman & BAPT)
                  </button>
                </div>
              </div>

              {/* Stage Items List */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Daftar Poin Tahapan ({tempStages.filter(s => s.active !== false).length} Aktif dari {tempStages.length}):
                </span>
                <div className="space-y-2">
                  {tempStages.map((stage, idx) => {
                    const isChecked = stage.active !== false;
                    return (
                      <div
                        key={stage.key}
                        onClick={() => {
                          setTempStages(prev => prev.map(s => s.key === stage.key ? { ...s, active: !isChecked } : s));
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isChecked 
                            ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' 
                            : 'bg-slate-900/40 border-white/5 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-white/20 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-white">
                                {stage.label}
                              </span>
                              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                                ({stage.fullName})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400">
                              {stage.hasPdf && (
                                <span className="bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                  Ada Berkas BA (PDF)
                                </span>
                              )}
                              {stage.hasPhoto && (
                                <span className="bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded font-bold">
                                  Ada Foto Dokumentasi
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded-full shrink-0 ${
                          isChecked
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          {isChecked ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-900 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setTempStages(JSON.parse(JSON.stringify(DEFAULT_RESUME_STAGES)));
                }}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                Reset ke Standar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSavingSettings}
                  onClick={async () => {
                    setIsSavingSettings(true);
                    try {
                      if (onUpdateResumeStages) {
                        await onUpdateResumeStages(tempStages);
                      }
                      setIsSettingsModalOpen(false);
                      setSaveFeedback({
                        type: 'success',
                        text: `Pengaturan poin tahapan resume proyek "${activeProjectName}" berhasil disimpan!`
                      });
                      setTimeout(() => setSaveFeedback(null), 5000);
                    } catch (err: any) {
                      alert('Gagal menyimpan pengaturan: ' + (err?.message || 'Terjadi kesalahan.'));
                    } finally {
                      setIsSavingSettings(false);
                    }
                  }}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-black shadow-lg shadow-amber-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Poin'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: STATUS SINKRONISASI DATABASE & PANDUAN RULES */}
      {isCloudHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-xl border border-amber-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/95">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${
                  isCloudConnected 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    Status Sinkronisasi Database
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Proyek: <span className="text-amber-300 font-bold">{activeProjectName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCloudHelpModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-950/60 text-xs text-slate-300">
              {/* Dual Engine Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Penyimpanan Browser (Lokal)</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Aktif 100%. Seluruh data resume, status berita acara, dan foto tersimpan aman di browser Anda (LocalStorage).
                  </p>
                </div>

                <div className={`p-3.5 rounded-2xl border space-y-1 ${
                  isCloudConnected 
                    ? 'bg-emerald-500/10 border-emerald-500/20' 
                    : 'bg-amber-500/10 border-amber-500/20'
                }`}>
                  <div className={`flex items-center gap-2 font-bold ${
                    isCloudConnected ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {isCloudConnected ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span>Cloud Firestore Real-time</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {isCloudConnected 
                      ? 'Terhubung! Seluruh perubahan tersinkronisasi otomatis ke semua rekan tim.' 
                      : 'Belum Terhubung. Database menunggu aktivasi Security Rules di Firebase Console.'}
                  </p>
                </div>
              </div>

              {!isCloudConnected && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2">
                    <h4 className="font-extrabold text-white text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Apakah Aplikasi Ini Offline?
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <strong>Tidak, bukan offline atau rusak bro!</strong> Aplikasi Anda dan koneksi internet berjalan normal. Tulisan <em>Mode Lokal</em> hanya menandakan bahwa Firebase Firestore di akun Google Anda (<span className="text-amber-300 font-mono">proyek-ventura</span>) mengunci akses pembacaan database ke publik secara bawaan (*Security Rules* default Google).
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Agar sinkronisasi antar perangkat tim aktif secara *real-time*, Anda cukup mengizinkan akses Rules di Firebase Console (hanya butuh 30 detik).
                    </p>
                    {cloudErrorDetail?.message && (
                      <div className="p-2 rounded-xl bg-black/40 font-mono text-[10px] text-amber-300 border border-white/5">
                        Status error: {cloudErrorDetail.message}
                      </div>
                    )}
                  </div>

                  {/* 3 Steps Guide */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                      3 Langkah Mengaktifkan Cloud Firestore (Hanya 30 Detik):
                    </span>
                    <ol className="list-decimal list-inside space-y-2 text-[11px] text-slate-300 bg-slate-900/60 p-3.5 rounded-2xl border border-white/5">
                      <li>
                        Buka halaman rules:{' '}
                        <a 
                          href="https://console.firebase.google.com/project/proyek-ventura/firestore/rules" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sky-400 underline font-bold hover:text-sky-300 inline-flex items-center gap-1"
                        >
                          Firebase Console ➔ Firestore Database ➔ Rules
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                      <li>
                        Hapus aturan yang ada di editor tersebut dan tempelkan (*paste*) aturan ini:
                      </li>
                      <li className="list-none pt-1">
                        <div className="relative bg-slate-950 p-3 rounded-xl border border-white/10 font-mono text-[10px] text-emerald-300 overflow-x-auto">
                          <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}</pre>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`);
                              setCopiedRules(true);
                              setTimeout(() => setCopiedRules(false), 3000);
                            }}
                            className="absolute top-2 right-2 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                          >
                            {copiedRules ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedRules ? 'Tersalin!' : 'Salin Rules'}</span>
                          </button>
                        </div>
                      </li>
                      <li>
                        Klik tombol <strong>Publish</strong> di sudut kanan atas halaman Firebase Console. Selesai!
                      </li>
                    </ol>
                  </div>

                  {/* Penjelasan Kenapa di Komputer Teman Sudah Ada tapi di Sini Masih Kosong */}
                  <div className="p-4 bg-sky-950/40 rounded-2xl border border-sky-500/30 space-y-2">
                    <h4 className="font-extrabold text-sky-300 text-xs flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-sky-400" />
                      Rekan Sudah Mengisi tapi di Layar Anda Masih Kosong?
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Hal ini terjadi karena:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                      <li><strong>Mode Penyimpanan Lokal:</strong> Saat rekan Anda menyimpan, database Cloud Firestore di akun Google Anda menolak akses karena Rules belum diaktifkan (Publish). Data rekan Anda aman tersimpan di browser miliknya, namun belum terkirim ke Cloud.</li>
                      <li><strong>Solusi Cepat 1 Detik:</strong> Minta rekan Anda klik tombol <strong>"Bagikan / Impor Data"</strong> di atas ➔ Salin Kode JSON ➔ Kirim ke Anda via WA/Chat. Anda tinggal klik <strong>"Impor Data"</strong>, dan semua data langsung muncul lengkap!</li>
                      <li><strong>Solusi Permanen:</strong> Buka Rules di Firebase Console seperti langkah di atas agar setiap klik "Simpan" langsung terdistribusi otomatis ke semua komputer.</li>
                      <li><strong>Periksa Proyek:</strong> Pastikan Anda dan rekan Anda memilih proyek yang sama di menu pilihan proyek bilah atas.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-900 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  await handleManualRefreshCloud();
                  const testRes = await testCloudConnection();
                  if (testRes.connected) {
                    setIsCloudConnected(true);
                    setCloudErrorDetail(null);
                  }
                }}
                disabled={isRefreshingCloud}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
                <span>{isRefreshingCloud ? 'Mengecek...' : 'Cek Ulang Koneksi Sekarang'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCloudHelpModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: BAGIKAN & IMPOR DATA RESUME ANTAR REKAN KERJA */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-xl border border-sky-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/95">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    Bagikan & Impor Data Resume Proyek
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Proyek: <span className="text-amber-300 font-bold">{activeProjectName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 bg-slate-950/60 p-2 gap-2">
              <button
                type="button"
                onClick={() => { setShareTab('export'); setImportResult(null); }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  shareTab === 'export'
                    ? 'bg-sky-500 text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileDown className="w-4 h-4" />
                <span>Ekspor / Salin Data (Kirim ke Rekan)</span>
              </button>
              <button
                type="button"
                onClick={() => { setShareTab('import'); setImportResult(null); }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  shareTab === 'import'
                    ? 'bg-sky-500 text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileUp className="w-4 h-4" />
                <span>Impor Data dari Rekan</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-950/60 text-xs text-slate-300">
              {shareTab === 'export' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2">
                    <h4 className="font-extrabold text-white text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky-400" />
                      Kirimkan Data Anda ke Rekan Kerja
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Jika rekan kerja Anda membuka aplikasi di laptopnya dan melihat resume proyek masih kosong, Anda bisa langsung membagikan data yang sudah Anda isi di laptop ini tanpa perlu menunggu konfigurasi cloud.
                    </p>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Total data desa siap dikirim:</span>
                      <span className="text-sm font-extrabold text-amber-400 font-mono">{resumes.length} Desa</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-300 block">Pilihan Pengiriman:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const json = exportVillageResumesJson(activeProjectId);
                          navigator.clipboard.writeText(json);
                          setCopiedJson(true);
                          setTimeout(() => setCopiedJson(false), 3000);
                        }}
                        className="p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-sky-500/30 text-left space-y-2 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <Copy className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
                          {copiedJson && <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg">Tersalin!</span>}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs">Salin Kode JSON</div>
                          <div className="text-[10px] text-slate-400">Salin teks dan tempel ke WhatsApp / Chat tim</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const json = exportVillageResumesJson(activeProjectId);
                          const blob = new Blob([json], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `resume_proyek_${activeProjectId}_${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-amber-500/30 text-left space-y-2 transition-all cursor-pointer group"
                      >
                        <Download className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                        <div>
                          <div className="font-bold text-white text-xs">Unduh Berkas .JSON</div>
                          <div className="text-[10px] text-slate-400">Simpan sebagai file cadangan & kirim via email/flashdisk</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2">
                    <h4 className="font-extrabold text-white text-xs flex items-center gap-2">
                      <FileUp className="w-4 h-4 text-sky-400" />
                      Masukkan Data dari Rekan Kerja
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Tempelkan kode JSON atau unggah berkas .json yang dikirim oleh rekan Anda. Seluruh progres tahapan desa akan otomatis langsung terisi di layar Anda.
                    </p>
                  </div>

                  {/* File Upload Option */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-300 block">Unggah Berkas .JSON:</label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const content = event.target?.result as string;
                            setImportJsonText(content);
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-sky-500/20 file:text-sky-300 hover:file:bg-sky-500/30 cursor-pointer"
                    />
                  </div>

                  {/* Textarea Paste */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-300 block">Atau Tempelkan Kode Teks JSON di Sini:</label>
                    <textarea
                      rows={6}
                      value={importJsonText}
                      onChange={(e) => setImportJsonText(e.target.value)}
                      placeholder='[{"id":"proj-1_DESA_A", "desaName":"DESA A", ...}]'
                      className="w-full p-3 bg-slate-900 border border-white/10 rounded-2xl font-mono text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none"
                    />
                  </div>

                  {/* Result Feedback */}
                  {importResult && (
                    <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
                      importResult.success
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    }`}>
                      {importResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                      <span>{importResult.message}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!importJsonText.trim() || isImporting}
                    onClick={async () => {
                      setIsImporting(true);
                      setImportResult(null);
                      const res = await importVillageResumesJson(activeProjectId, importJsonText.trim());
                      setIsImporting(false);
                      if (res.success) {
                        setImportResult({
                          success: true,
                          message: `Berhasil mengimpor ${res.count} data desa! Data langsung diperbarui di layar Anda${res.cloudSyncedCount > 0 ? ` & tersinkronkan ${res.cloudSyncedCount} dokumen ke Cloud Firestore` : ''}.`
                        });
                        // Reload local resumes
                        const fresh = await loadVillageResumes(activeProjectId);
                        setResumes(prev => {
                          const map = new Map<string, VillageResume>();
                          prev.forEach(p => map.set(p.desaName.toUpperCase(), p));
                          fresh.forEach(u => map.set(u.desaName.toUpperCase(), u));
                          return Array.from(map.values());
                        });
                      } else {
                        setImportResult({
                          success: false,
                          message: res.error || 'Gagal memproses data JSON.'
                        });
                      }
                    }}
                    className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{isImporting ? 'Memproses Impor...' : 'Impor & Terapkan Data Sekarang'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-900 flex justify-end">
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. MODAL: 1 FILE EXCEL WORKBOOK (SEMUA JALUR + STATUS + LINK DRIVE) */}
      {isWorkbookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-2xl border border-emerald-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/95">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    <span>1 File Excel Workbook (Semua Jalur)</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold uppercase tracking-wider">
                      Database Terpadu
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    1 File Excel / Google Sheets mengakomodasi seluruh jalur, tahapan, dan tautan berkas Google Drive.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkbookModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-950/60 text-xs text-slate-300">
              
              {/* Highlight Manfaat */}
              <div className="p-4 bg-gradient-to-r from-emerald-950/40 to-slate-900/80 rounded-2xl border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Praktis & Tidak Membebani Firebase</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Semua jalur kompensasi (misal: <em>Payakumbuh</em>, <em>Pasuruan</em>, dll.) memiliki database dan barisnya masing-masing, namun seluruhnya <strong>terpadu dalam 1 Workbook Excel / Google Sheets</strong>. Setiap berkas PDF dan foto dokumentasi otomatis tersimpan ke Google Drive dan linknya tertulis rapi di kolom Excel.
                </p>
              </div>

              {/* Bagian 1: Status Google Sheets 1 Workbook Live */}
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Koneksi Google Sheets Live (Tab RESUME_SEMUA_JALUR)
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    spreadsheetId 
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' 
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}>
                    {spreadsheetId ? 'Spreadsheet Terhubung' : 'Belum Ada Spreadsheet ID'}
                  </span>
                </div>

                {spreadsheetId ? (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-400">
                      ID Spreadsheet Aktif: <span className="font-mono text-amber-300 select-all">{spreadsheetId}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Spreadsheet di Google Drive</span>
                      </a>

                      <button
                        type="button"
                        disabled={isSyncingAllToSheet}
                        onClick={async () => {
                          if (!accessToken) {
                            alert("Silakan masuk akun Google terlebih dahulu.");
                            return;
                          }
                          setIsSyncingAllToSheet(true);
                          try {
                            await ensureResumeSheetTab(accessToken, spreadsheetId);
                            let count = 0;
                            for (const res of resumes) {
                              const stats = uniqueDesasFromRecords.get(res.desaName.toUpperCase());
                              const prog = calculateVillageProgress(res);
                              await saveVillageResumeToSheet(
                                accessToken,
                                spreadsheetId,
                                res,
                                activeProjectName,
                                stats?.totalBidang || 0,
                                stats?.totalLuas || 0,
                                prog
                              );
                              count++;
                            }
                            setSaveFeedback({
                              type: 'success',
                              text: `Sukses menyinkronkan seluruh ${count} desa ke tab RESUME_SEMUA_JALUR di Google Sheets!`
                            });
                          } catch (err: any) {
                            alert("Gagal sinkronisasi ke Google Sheets: " + (err?.message || err));
                          } finally {
                            setIsSyncingAllToSheet(false);
                          }
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncingAllToSheet ? 'animate-spin' : ''}`} />
                        <span>{isSyncingAllToSheet ? 'Menyinkronkan...' : `Kirim Seluruh Data Desa (${resumes.length}) ke Google Sheets`}</span>
                      </button>

                      {!isGuest && (
                        <button
                          type="button"
                          disabled={isGeneratingSheet}
                          onClick={handleAutoGenerateResumeSheet}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold border border-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          title="Buat Google Spreadsheet baru terpisah khusus Resume Proyek ini"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${isGeneratingSheet ? 'animate-spin' : 'text-amber-400'}`} />
                          <span>Buat Sheet Baru Terpisah</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Jalur ini belum memiliki Google Spreadsheet. Anda bisa membuatnya secara otomatis langsung di Google Drive Anda dengan seluruh 36 header resmi!
                    </p>
                    {!isGuest && (
                      <button
                        type="button"
                        disabled={isGeneratingSheet}
                        onClick={handleAutoGenerateResumeSheet}
                        className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className={`w-4 h-4 ${isGeneratingSheet ? 'animate-spin' : 'text-slate-950'}`} />
                        <span>{isGeneratingSheet ? 'Sedang Membuat Spreadsheet di Google Drive...' : '⚡ Buat Otomatis Google Spreadsheet Resume di Drive'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Bagian Baru: Tautan Web Publish CSV Resume (Mode Tamu) */}
              <div className="p-4 bg-sky-950/40 rounded-2xl border border-sky-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-400" />
                    Tautan Web Publish CSV Google Sheet (Untuk Mode Tamu)
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCsvGuideModalOpen(true)}
                    className="text-[10px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Panduan Publikasi CSV
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Publikasikan file Google Spreadsheet Anda ke web format CSV agar Tamu/Stakeholder dapat memantau progres resume tanpa akun Google.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={editCsvUrl}
                    onChange={(e) => setEditCsvUrl(e.target.value)}
                    placeholder="Contoh: https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {editCsvUrl && (
                      <button
                        type="button"
                        disabled={isTestingCsv}
                        onClick={handleTestCsvUrl}
                        className="px-3 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span>{isTestingCsv ? 'Menguji...' : '🧪 Uji CSV'}</span>
                      </button>
                    )}
                    {!isGuest && onUpdateProjectPublicCsvUrl && (
                      <button
                        type="button"
                        disabled={isSavingCsvUrl}
                        onClick={handleSaveCsvUrl}
                        className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs transition-all cursor-pointer shadow-md disabled:opacity-50"
                      >
                        <span>{isSavingCsvUrl ? 'Menyimpan...' : 'Simpan Tautan'}</span>
                      </button>
                    )}
                  </div>
                </div>
                {csvTestFeedback && (
                  <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                    csvTestFeedback.success 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {csvTestFeedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{csvTestFeedback.message}</span>
                  </div>
                )}
              </div>

              {/* Bagian 2: Unduh Master File Excel (.xlsx) */}
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-3">
                <span className="text-xs font-extrabold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  Unduh 1 File Workbook Excel (.xlsx) Offline
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Menghasilkan 1 berkas Microsoft Excel (.xlsx) komprehensif berisi 2 Sheet:
                  <br />• <strong>Sheet 1 (RESUME_SEMUA_JALUR):</strong> Seluruh tahapan desa, status, persentase tuntas, dan link Google Drive langsung ke file PDF.
                  <br />• <strong>Sheet 2 (DAFTAR_BIDANG_MASTER):</strong> Seluruh data nominatif bidang tanah, pemilik, luas m², dan nomor identitas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    generateMasterWorkbookExcel(
                      allProjects && allProjects.length > 0 ? allProjects : [{ id: activeProjectId, name: activeProjectName, spreadsheetId: null, folderId: null, uploadsFolderId: null }],
                      resumes,
                      records
                    );
                  }}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Master Excel 1 Workbook (.xlsx) Sekarang</span>
                </button>
              </div>

              {/* Bagian 3: Impor dari File Excel (.xlsx) */}
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-3">
                <span className="text-xs font-extrabold text-white flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-sky-400" />
                  Impor Data dari Berkas Excel (.xlsx)
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Punya file Excel master yang sudah diisi secara offline atau oleh rekan kerja? Unggah di sini dan sistem akan otomatis membaca seluruh jalur dan status tahapan desa.
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsImporting(true);
                    const res = await importMasterWorkbookExcel(file, activeProjectId);
                    setIsImporting(false);
                    if (res.success) {
                      const fresh = await loadVillageResumes(activeProjectId, { accessToken, spreadsheetId });
                      setResumes(prev => {
                        const map = new Map<string, VillageResume>();
                        prev.forEach(p => map.set(p.desaName.toUpperCase(), p));
                        fresh.forEach(u => map.set(u.desaName.toUpperCase(), u));
                        return Array.from(map.values());
                      });
                      alert(`Berhasil mengimpor ${res.count} data desa dari file Excel Workbook!`);
                    } else {
                      alert(`Gagal membaca Excel: ${res.error || 'Format tidak cocok'}`);
                    }
                  }}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-500/20 file:text-emerald-300 hover:file:bg-emerald-500/30 cursor-pointer"
                />
              </div>

            </div>

            <div className="p-4 border-t border-white/10 bg-slate-900 flex justify-end">
              <button
                type="button"
                onClick={() => setIsWorkbookModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panduan Publikasi Google Sheets ke Web (CSV) Modal */}
      <CsvPublishGuideModal 
        isOpen={isCsvGuideModalOpen} 
        onClose={() => setIsCsvGuideModalOpen(false)} 
        activeSpreadsheetId={spreadsheetId} 
      />
    </div>
  );
}
