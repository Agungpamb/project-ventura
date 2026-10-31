import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
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
  deleteVillageResume,
  subscribeVillageResumes, 
  createDefaultVillageResume,
  createEmptyStageDoc,
  compressImageFile,
  testCloudConnection,
  fileToBase64,
  exportVillageResumesJson,
  importVillageResumesJson,
  downloadJalurWorkbook,
  generateJalurWorkbookExcel
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
  loadedGeoJSONs?: Array<{ id?: string; name: string; type: 'bidang' | 'jalur' | 'tower'; projectId?: string; isDefault?: boolean; data: any }>;
  activeProjectId: string;
  activeProjectName?: string;
  role: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST';
  userEmail?: string;
  operatorName?: string;
  accessToken?: string;
  spreadsheetId?: string;
  allProjects?: ProjectConfig[];
  uploadsFolderId?: string;
  resumeUploadsFolderId?: string;
  publicCsvUrl?: string;
  onRefreshGoogleToken?: () => Promise<string | null>;
  onNavigateToInput?: (record: LandRecord) => void;
  resumeStages?: ResumeStageConfig[];
  onUpdateResumeStages?: (newStages: ResumeStageConfig[]) => Promise<void>;
  onUpdateProjectSpreadsheetId?: (newSpreadsheetId: string) => Promise<void>;
  onUpdateProjectPublicCsvUrl?: (newCsvUrl: string) => Promise<void>;
}

// Helper to add N working days (Mon-Fri) to a YYYY-MM-DD date string (for Pasal 27: 7 Hari Kerja Pengumuman)
function addWorkingDays(startDateStr: string, workingDays: number): string {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '';
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  let added = 0;
  while (added < workingDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ResumeProjectPanel({
  records,
  loadedGeoJSONs = [],
  activeProjectId,
  activeProjectName = 'Proyek Ventura',
  role,
  userEmail = 'operator@ventura.id',
  operatorName = 'Operator',
  accessToken,
  spreadsheetId,
  allProjects,
  uploadsFolderId,
  resumeUploadsFolderId,
  publicCsvUrl,
  onRefreshGoogleToken,
  resumeStages,
  onUpdateResumeStages,
  onUpdateProjectSpreadsheetId,
  onUpdateProjectPublicCsvUrl
}: ResumeProjectPanelProps) {
  const isGuest = role === 'GUEST';

  // Configured stages for this specific project (Upgrades legacy stage lists to the 10 standard stages)
  const stagesConfig = useMemo<ResumeStageConfig[]>(() => {
    if (resumeStages && resumeStages.length > 0) {
      const hasAllStages =
        resumeStages.some(s => s.key === 'pendataanAwal') &&
        resumeStages.some(s => s.key === 'registrasiBapt') &&
        resumeStages.some(s => s.key === 'baPenyampaianNilai') &&
        resumeStages.some(s => s.key === 'baSerahTerimaRekening') &&
        resumeStages.some(s => s.key === 'bushClearing');
      if (hasAllStages) {
        return DEFAULT_RESUME_STAGES.map(def => {
          const saved = resumeStages.find(st => st.key === def.key);
          return saved ? { ...def, active: saved.active } : def;
        });
      }
    }
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

  // Handler to auto-create Google Spreadsheet Resume with all Permen ESDM 13/2025 headers
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
  const [activeStageTab, setActiveStageTab] = useState<string>('pendataanAwal');
  const [isSaving, setIsSaving] = useState(false);

  // Pra-Akuisisi Village Initializer Modal State (Single, Batch Lampiran V, & GeoJSON Auto-Detect)
  const [isAddingDesaModal, setIsAddingDesaModal] = useState(false);
  const [addDesaTab, setAddDesaTab] = useState<'batch' | 'geojson' | 'manual'>('batch');
  const [newDesaName, setNewDesaName] = useState('');
  const [newKecamatan, setNewKecamatan] = useState('');
  const [newKabupaten, setNewKabupaten] = useState('');
  const [newTargetSpan, setNewTargetSpan] = useState('');
  const [newEstimasiBidang, setNewEstimasiBidang] = useState('');
  const [newNamaKades, setNewNamaKades] = useState('');
  const [newNamaCamat, setNewNamaCamat] = useState('');
  const [newNamaPjt, setNewNamaPjt] = useState('');
  const [newNoSertifikatPjt, setNewNoSertifikatPjt] = useState('');
  const [batchDesaText, setBatchDesaText] = useState('');
  const [batchDefaultKabupaten, setBatchDefaultKabupaten] = useState('');
  const [batchDefaultPjt, setBatchDefaultPjt] = useState('');
  const [batchDefaultSertifikatPjt, setBatchDefaultSertifikatPjt] = useState('');
  const [isProcessingBatchDesa, setIsProcessingBatchDesa] = useState(false);

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

  // 1. Extract unique villages from land records (Realisasi Akuisisi Lapangan & Otomatisasi Point 4)
  const uniqueDesasFromRecords = useMemo(() => {
    const map = new Map<string, {
      totalBidang: number;
      berkasSelesai: number;
      berkasPct: number;
      totalLuas: number;
      qcApproved: number;
      spans: Set<string>;
      kecamatan: string;
      kabupaten: string;
      namaKades: string;
    }>();
    records.forEach(r => {
      const d = (r.DESA || '').trim().toUpperCase();
      if (!d) return;
      const current = map.get(d) || {
        totalBidang: 0,
        berkasSelesai: 0,
        berkasPct: 0,
        totalLuas: 0,
        qcApproved: 0,
        spans: new Set<string>(),
        kecamatan: '',
        kabupaten: '',
        namaKades: ''
      };
      current.totalBidang += 1;
      if ((r.PROGRES_PEMBERKASAN || '').trim().toUpperCase() === 'SELESAI') {
        current.berkasSelesai += 1;
      }
      current.berkasPct = current.totalBidang > 0
        ? Math.round((current.berkasSelesai / current.totalBidang) * 100)
        : 0;
      const luas = parseFloat(r.LUAS ? String(r.LUAS).replace(',', '.') : '0') || 0;
      current.totalLuas += luas;
      if (r.QC_STATUS === 'APPROVED') current.qcApproved += 1;
      if (r.SPAN && r.SPAN.trim()) current.spans.add(r.SPAN.trim().toUpperCase());
      if (!current.kecamatan && r.KECAMATAN) current.kecamatan = r.KECAMATAN.trim().toUpperCase();
      if (!current.kabupaten && r.KABUPATEN) current.kabupaten = r.KABUPATEN.trim().toUpperCase();
      if (!current.namaKades && r.NAMA_KADES) current.namaKades = r.NAMA_KADES.trim();
      map.set(d, current);
    });
    return map;
  }, [records]);

  // 2. Extract unique villages from Spatial GeoJSON layers STRICTLY belonging to this activeProjectId
  const uniqueDesasFromGeoJSON = useMemo(() => {
    const map = new Map<string, {
      desaName: string;
      kecamatan: string;
      kabupaten: string;
      polygonCount: number;
      spans: Set<string>;
    }>();

    if (!loadedGeoJSONs || loadedGeoJSONs.length === 0) return map;

    const isJelokProject = activeProjectId === 'proj-1' || (activeProjectName || '').toUpperCase().includes('JELOK');
    const scopedLayers = loadedGeoJSONs.filter(layer => {
      if (layer.projectId === activeProjectId) return true;
      if (layer.isDefault && isJelokProject) return true;
      return false;
    });

    scopedLayers.forEach(layer => {
      const features: any[] = layer?.data?.features || [];
      features.forEach(feat => {
        const props = feat?.properties || {};
        // Look for village name in common GeoJSON attribute keys
        const rawDesa = props.DESA || props.desa || props.Desa || props.KELURAHAN || props.kelurahan || props.WADMKD || props.NAMOBJ_DESA || '';
        const cleanDesa = String(rawDesa).trim().toUpperCase();
        if (!cleanDesa || cleanDesa === 'NULL' || cleanDesa === '-') return;

        const rawKec = props.KECAMATAN || props.kecamatan || props.Kecamatan || props.WADMKC || '';
        const rawKab = props.KABUPATEN || props.kabupaten || props.Kabupaten || props.KOTA || props.WADMKK || '';
        const rawSpan = props.SPAN || props.span || props.Span || props.NO_SPAN || '';

        const existing = map.get(cleanDesa) || {
          desaName: cleanDesa,
          kecamatan: String(rawKec).trim().toUpperCase(),
          kabupaten: String(rawKab).trim().toUpperCase(),
          polygonCount: 0,
          spans: new Set<string>()
        };

        if (!existing.kecamatan && rawKec) existing.kecamatan = String(rawKec).trim().toUpperCase();
        if (!existing.kabupaten && rawKab) existing.kabupaten = String(rawKab).trim().toUpperCase();
        if (layer.type === 'bidang' || feat?.geometry?.type?.includes('Polygon')) {
          existing.polygonCount += 1;
        }
        if (rawSpan && String(rawSpan).trim()) {
          existing.spans.add(String(rawSpan).trim().toUpperCase());
        }
        map.set(cleanDesa, existing);
      });
    });

    return map;
  }, [loadedGeoJSONs, activeProjectId, activeProjectName]);

  // Ensure every VillageResume object has all 10 stage fields initialized
  const normalizeResumeStages = (res: VillageResume): VillageResume => ({
    ...res,
    projectId: activeProjectId,
    pendataanAwal: res.pendataanAwal || createEmptyStageDoc(),
    baSosialisasiAwal: res.baSosialisasiAwal || createEmptyStageDoc(),
    surveiPemetaan: res.surveiPemetaan || createEmptyStageDoc(),
    inventarisasiNominatif: res.inventarisasiNominatif || createEmptyStageDoc(),
    baPengumuman: res.baPengumuman || createEmptyStageDoc(),
    lampiranBapt: res.lampiranBapt || createEmptyStageDoc(),
    registrasiBapt: res.registrasiBapt || createEmptyStageDoc(),
    baPenyampaianNilai: res.baPenyampaianNilai || createEmptyStageDoc(),
    baSerahTerimaRekening: res.baSerahTerimaRekening || createEmptyStageDoc(),
    bushClearing: res.bushClearing || createEmptyStageDoc()
  });

  // Load and sync village resumes strictly scoped to activeProjectId
  useEffect(() => {
    let isCancelled = false;
    let unsubscribe = () => {};
    setIsLoading(true);
    setResumes([]);

    const init = async () => {
      const stored = await loadVillageResumes(activeProjectId, { accessToken, spreadsheetId });
      if (isCancelled) return;
      
      const existingMap = new Map<string, VillageResume>();
      stored.forEach(r => {
        if (r.projectId && r.projectId !== activeProjectId) return;
        // Skip unedited auto-generated system placeholders if they don't belong to this jalur's records or GeoJSON
        const desaKey = r.desaName.toUpperCase();
        const isAutoSystem = !r.updatedBy || r.updatedBy === 'Sistem';
        const hasAnyStageProgress = [
          r.pendataanAwal, r.baSosialisasiAwal, r.surveiPemetaan,
          r.inventarisasiNominatif, r.baPengumuman, r.lampiranBapt, r.registrasiBapt,
          r.baPenyampaianNilai, r.baSerahTerimaRekening, r.bushClearing
        ].some(st => st && (st.status !== 'BELUM' || st.pdfUrl || (st.docPhotos && st.docPhotos.length > 0) || st.notes || st.date));

        if (isAutoSystem && !hasAnyStageProgress && !uniqueDesasFromRecords.has(desaKey) && !uniqueDesasFromGeoJSON.has(desaKey)) {
          return;
        }
        existingMap.set(desaKey, normalizeResumeStages(r));
      });

      const mergedList: VillageResume[] = Array.from(existingMap.values());

      // Ensure all unique desas from THIS jalur's database records are represented
      uniqueDesasFromRecords.forEach((recStats, desaName) => {
        const existing = existingMap.get(desaName);
        if (!existing) {
          const defaultResume = createDefaultVillageResume(activeProjectId, desaName, recStats.kecamatan, recStats.kabupaten, {
            namaKades: recStats.namaKades,
            targetSpan: recStats.spans.size > 0 ? recStats.spans.size : undefined
          });
          mergedList.push(defaultResume);
          existingMap.set(desaName, defaultResume);
        } else {
          // Enrich missing kecamatan/kabupaten/kades if empty
          if (!existing.kecamatan && recStats.kecamatan) existing.kecamatan = recStats.kecamatan;
          if (!existing.kabupaten && recStats.kabupaten) existing.kabupaten = recStats.kabupaten;
          if (!existing.namaKades && recStats.namaKades) existing.namaKades = recStats.namaKades;
        }
      });

      setResumes(mergedList);
      setIsLoading(false);

      // Subscribe to realtime push updates from Cloud Firestore for activeProjectId ONLY
      unsubscribe = subscribeVillageResumes(
        activeProjectId, 
        (updated) => {
          if (isCancelled) return;
          setIsCloudConnected(true);
          setCloudErrorDetail(null);
          setResumes(prev => {
            const map = new Map<string, VillageResume>();
            prev.forEach(p => {
              if (!p.projectId || p.projectId === activeProjectId) {
                map.set(p.desaName.toUpperCase(), normalizeResumeStages(p));
              }
            });
            updated.forEach(u => {
              if (!u.projectId || u.projectId === activeProjectId) {
                map.set(u.desaName.toUpperCase(), normalizeResumeStages(u));
              }
            });
            return Array.from(map.values());
          });
        },
        (connected, err) => {
          if (isCancelled) return;
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
    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [activeProjectId]);

  // Keep village list updated if new unique villages appear in THIS jalur's land records
  useEffect(() => {
    if (uniqueDesasFromRecords.size === 0) return;
    setResumes(prev => {
      const map = new Map<string, VillageResume>();
      prev.forEach(p => {
        if (!p.projectId || p.projectId === activeProjectId) {
          map.set(p.desaName.toUpperCase(), normalizeResumeStages(p));
        }
      });
      let changed = false;

      uniqueDesasFromRecords.forEach((recStats, desaName) => {
        if (!map.has(desaName)) {
          map.set(desaName, createDefaultVillageResume(activeProjectId, desaName, recStats.kecamatan, recStats.kabupaten, {
            namaKades: recStats.namaKades,
            targetSpan: recStats.spans.size > 0 ? recStats.spans.size : undefined
          }));
          changed = true;
        }
      });

      return changed ? Array.from(map.values()) : prev;
    });
  }, [uniqueDesasFromRecords, activeProjectId]);

  // Manual pull from Cloud Firestore
  const handleManualRefreshCloud = async () => {
    setIsRefreshingCloud(true);
    try {
      const connTest = await testCloudConnection();
      if (!connTest.connected) {
        setIsCloudConnected(false);
        if (connTest.error) {
          setCloudErrorDetail({ message: connTest.error });
        }
        setSaveFeedback({ 
          type: 'warning', 
          text: 'Koneksi Cloud Firestore belum aktif. Data tetap aman di penyimpanan lokal.' 
        });
        setTimeout(() => setSaveFeedback(null), 5000);
        return;
      }

      const fresh = await loadVillageResumes(activeProjectId, { accessToken, spreadsheetId });
      setResumes(prev => {
        const map = new Map<string, VillageResume>();
        prev.forEach(p => map.set(p.desaName.toUpperCase(), normalizeResumeStages(p)));
        fresh.forEach(u => map.set(u.desaName.toUpperCase(), normalizeResumeStages(u)));
        return Array.from(map.values());
      });
      setIsCloudConnected(true);
      setCloudErrorDetail(null);
      setSaveFeedback({ type: 'success', text: `Data Resume Proyek berhasil disinkronkan langsung (${fresh.length} desa)!` });
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
  // Point 4 (inventarisasiNominatif) is computed AUTOMATICALLY from the database berkas completion ratio
  const calculateVillageProgress = (res: VillageResume): number => {
    if (activeStages.length === 0) return 0;
    const stageWeight = 100 / activeStages.length;
    let points = 0;
    const recStat = uniqueDesasFromRecords.get(res.desaName.toUpperCase());
    activeStages.forEach(s => {
      if (s.key === 'inventarisasiNominatif') {
        if (recStat && recStat.totalBidang > 0) {
          points += stageWeight * (recStat.berkasSelesai / recStat.totalBidang);
        }
        return;
      }
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
        (res.kecamatan || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (res.kabupaten || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (res.registrasiBapt?.nomorDokumen || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      const progress = calculateVillageProgress(res);
      if (statusFilter === 'COMPLETED') return progress === 100;
      if (statusFilter === 'IN_PROGRESS') return progress > 0 && progress < 100;
      if (statusFilter === 'NOT_STARTED') return progress === 0;
      return true;
    }).sort((a, b) => a.desaName.localeCompare(b.desaName));
  }, [resumes, searchQuery, statusFilter, activeStages, uniqueDesasFromRecords]);

  // Overall Project Resume Metrics
  const metrics = useMemo(() => {
    const totalDesa = resumes.length;
    if (totalDesa === 0) {
      return {
        totalDesa: 0,
        completedCount: 0,
        inProgressCount: 0,
        avgProgress: 0,
        registeredBaptCount: 0,
        praAkuisisiCount: 0,
        totalBerkasSelesai: 0,
        totalBidangKoridor: 0,
        corridorBerkasPct: 0,
        stageStats: {} as Record<string, { selesai: number; proses: number }>
      };
    }

    let totalProgressSum = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let registeredBaptCount = 0;
    let praAkuisisiCount = 0;
    let totalBerkasSelesai = 0;
    let totalBidangKoridor = 0;

    const stageStats: Record<string, { selesai: number; proses: number }> = {};
    activeStages.forEach(s => {
      stageStats[s.key] = { selesai: 0, proses: 0 };
    });

    resumes.forEach(r => {
      const prog = calculateVillageProgress(r);
      totalProgressSum += prog;
      if (prog === 100) completedCount++;
      else if (prog > 0) inProgressCount++;
      if (r.registrasiBapt?.status === 'SELESAI') registeredBaptCount++;
      const recStat = uniqueDesasFromRecords.get(r.desaName.toUpperCase());
      if (!recStat || recStat.totalBidang === 0) {
        praAkuisisiCount++;
      } else {
        totalBerkasSelesai += recStat.berkasSelesai;
        totalBidangKoridor += recStat.totalBidang;
      }

      activeStages.forEach(s => {
        if (s.key === 'inventarisasiNominatif') {
          if (recStat && recStat.totalBidang > 0) {
            if (recStat.berkasSelesai === recStat.totalBidang) {
              stageStats[s.key].selesai++;
            } else {
              stageStats[s.key].proses++;
            }
          }
          return;
        }
        const stage = (r as any)[s.key] as VillageStageDoc | undefined;
        if (stage?.status === 'SELESAI') stageStats[s.key].selesai++;
        else if (stage?.status === 'PROSES') stageStats[s.key].proses++;
      });
    });

    const corridorBerkasPct = totalBidangKoridor > 0
      ? Math.round((totalBerkasSelesai / totalBidangKoridor) * 100)
      : 0;

    return {
      totalDesa,
      completedCount,
      inProgressCount,
      registeredBaptCount,
      praAkuisisiCount,
      totalBerkasSelesai,
      totalBidangKoridor,
      corridorBerkasPct,
      avgProgress: Math.round(totalProgressSum / totalDesa),
      stageStats
    };
  }, [resumes, activeStages, uniqueDesasFromRecords]);

  // Delete a single village from this jalur's Resume Project
  const handleDeleteVillage = async (res: VillageResume) => {
    const recStat = uniqueDesasFromRecords.get(res.desaName.toUpperCase());
    if (recStat && recStat.totalBidang > 0) {
      alert(`Desa "${res.desaName}" memiliki ${recStat.totalBidang} bidang tanah aktif di Database Akuisisi jalur "${activeProjectName}". Desa yang memiliki bidang aktif di database tidak dapat dihapus dari Resume Jalur.`);
      return;
    }
    if (!confirm(`Hapus Desa "${res.desaName}" dari Resume Proyek jalur "${activeProjectName}"?`)) {
      return;
    }
    await deleteVillageResume(activeProjectId, res.id, res.desaName);
    setResumes(prev => prev.filter(p => p.id !== res.id && p.desaName.toUpperCase() !== res.desaName.toUpperCase()));
    if (editingDesa?.id === res.id) {
      setEditingDesa(null);
    }
    setSaveFeedback({
      type: 'success',
      text: `Desa "${res.desaName}" berhasil dihapus dari Resume Proyek jalur ${activeProjectName}.`
    });
    setTimeout(() => setSaveFeedback(null), 4000);
  };

  // Clean up all villages in this jalur that are NOT in this jalur's database records (e.g. if cross-project villages were previously mixed in)
  const handleCleanNonDatabaseVillages = async () => {
    const toRemove = resumes.filter(r => {
      const recStat = uniqueDesasFromRecords.get(r.desaName.toUpperCase());
      return !recStat || recStat.totalBidang === 0;
    });
    if (toRemove.length === 0) {
      alert('Seluruh desa yang tampil saat ini sudah sesuai dengan Database Akuisisi jalur ini.');
      return;
    }
    if (!confirm(`Ditemukan ${toRemove.length} desa tanpa bidang akuisisi pada jalur "${activeProjectName}".\n\nApakah Anda ingin membersihkan ${toRemove.length} desa tersebut agar Resume Proyek hanya menampilkan desa dari jalur "${activeProjectName}"?`)) {
      return;
    }
    for (const item of toRemove) {
      await deleteVillageResume(activeProjectId, item.id, item.desaName);
    }
    setResumes(prev => prev.filter(r => {
      const recStat = uniqueDesasFromRecords.get(r.desaName.toUpperCase());
      return recStat && recStat.totalBidang > 0;
    }));
    setSaveFeedback({
      type: 'success',
      text: `✅ Berhasil membersihkan ${toRemove.length} desa luar jalur dari Resume Proyek "${activeProjectName}".`
    });
    setTimeout(() => setSaveFeedback(null), 5000);
  };

  // Handle Save Edited Village Stage
  const handleSaveVillageChanges = async () => {
    if (!editingDesa) return;

    // Validate minimal 4 photos for active stages that require photos (excluding auto-computed Point 4)
    const stageWarnings: string[] = [];
    for (const stage of activeStages) {
      if (stage.key === 'inventarisasiNominatif') continue;
      if (stage.hasPhoto && stage.active !== false) {
        const stageDoc = (editingDesa as any)[stage.key];
        const count = stageDoc?.docPhotos?.length || 0;
        if (stageDoc?.status !== 'BELUM' && count < 4) {
          stageWarnings.push(`• ${stage.fullName}: ${count} foto (kurang ${4 - count} foto)`);
        }
      }
    }

    if (stageWarnings.length > 0) {
      const msg = `Perhatian: Setiap tahapan kegiatan lapangan disarankan mengunggah MINIMAL 4 FOTO dokumentasi:\n\n${stageWarnings.join('\n')}\n\nApakah Anda yakin ingin tetap menyimpan perubahan sekarang?`;
      if (!confirm(msg)) {
        return;
      }
    }

    setIsSaving(true);
    setSaveFeedback(null);
    try {
      const updated: VillageResume = normalizeResumeStages({
        ...editingDesa,
        updatedBy: operatorName || userEmail
      });
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

      if (result.cloudSynced) {
        setSaveFeedback({
          type: 'success',
          text: `Progres Desa ${updated.desaName} berhasil disimpan ke Cloud Firestore & tersinkron ke semua perangkat tim!`
        });
      } else {
        setSaveFeedback({
          type: 'success',
          text: `Progres Desa ${updated.desaName} berhasil disimpan di penyimpanan lokal perangkat ini!`
        });
      }
      setTimeout(() => setSaveFeedback(null), 5000);
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

  // Add Single Manual Village (Pra-Akuisisi)
  const handleAddManualDesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesaName.trim()) return;
    const cleanName = newDesaName.trim().toUpperCase();
    const newResume = createDefaultVillageResume(
      activeProjectId,
      cleanName,
      newKecamatan.trim().toUpperCase(),
      newKabupaten.trim().toUpperCase(),
      {
        targetSpan: newTargetSpan ? Number(newTargetSpan) || undefined : undefined,
        estimasiBidangAwal: newEstimasiBidang ? Number(newEstimasiBidang) || undefined : undefined,
        namaKades: newNamaKades.trim(),
        namaCamat: newNamaCamat.trim(),
        namaPjt: newNamaPjt.trim(),
        noSertifikatPjt: newNoSertifikatPjt.trim(),
        updatedBy: operatorName || userEmail
      }
    );
    const res = await saveVillageResume(newResume, {
      accessToken,
      spreadsheetId,
      projectName: activeProjectName,
      totalBidang: 0,
      totalLuas: 0,
      progressPct: 0
    });
    setResumes(prev => {
      const filtered = prev.filter(p => p.desaName.toUpperCase() !== cleanName);
      return [...filtered, newResume];
    });
    setNewDesaName('');
    setNewKecamatan('');
    setNewKabupaten('');
    setNewTargetSpan('');
    setNewEstimasiBidang('');
    setNewNamaKades('');
    setNewNamaCamat('');
    setIsAddingDesaModal(false);

    setSaveFeedback({
      type: 'success',
      text: `Desa Pra-Akuisisi "${newResume.desaName}" berhasil diinisialisasi ke Resume Proyek${res.cloudSynced ? ' & Cloud Firestore!' : '!'}`
    });
    setTimeout(() => setSaveFeedback(null), 5000);
  };

  // Batch Initialize Multiple Villages (Pra-Akuisisi Lampiran V / Copy-Paste Excel)
  const handleBatchAddDesas = async () => {
    const lines = batchDesaText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setIsProcessingBatchDesa(true);
    try {
      let addedCount = 0;
      const updatedMap = new Map<string, VillageResume>();
      resumes.forEach(r => updatedMap.set(r.desaName.toUpperCase(), r));

      for (const line of lines) {
        // Supports Tab (Excel copy-paste), Semicolon, Pipe, or Comma separation:
        // Format: NAMA_DESA | KECAMATAN | KABUPATEN | TARGET_SPAN | ESTIMASI_BIDANG | NAMA_KADES | NAMA_CAMAT
        const parts = line.includes('\t')
          ? line.split('\t').map(s => s.trim())
          : line.includes(';')
          ? line.split(';').map(s => s.trim())
          : line.includes('|')
          ? line.split('|').map(s => s.trim())
          : line.split(',').map(s => s.trim());

        const rawDesa = (parts[0] || '').replace(/^[0-9]+[\.\)\s-]+/, '').trim().toUpperCase();
        if (!rawDesa || rawDesa === 'DESA' || rawDesa === 'NAMA DESA' || rawDesa === 'KELURAHAN') continue;

        const kec = (parts[1] || '').toUpperCase();
        const kab = (parts[2] || batchDefaultKabupaten || '').toUpperCase();
        const tSpan = parts[3] ? Number(parts[3].replace(/[^0-9]/g, '')) || undefined : undefined;
        const estBidang = parts[4] ? Number(parts[4].replace(/[^0-9]/g, '')) || undefined : undefined;
        const kades = parts[5] || '';
        const camat = parts[6] || '';

        const existing = updatedMap.get(rawDesa);
        const merged = existing
          ? {
              ...existing,
              kecamatan: kec || existing.kecamatan,
              kabupaten: kab || existing.kabupaten,
              targetSpan: tSpan ?? existing.targetSpan,
              estimasiBidangAwal: estBidang ?? existing.estimasiBidangAwal,
              namaKades: kades || existing.namaKades,
              namaCamat: camat || existing.namaCamat,
              namaPjt: batchDefaultPjt.trim() || existing.namaPjt,
              noSertifikatPjt: batchDefaultSertifikatPjt.trim() || existing.noSertifikatPjt,
              updatedBy: operatorName || userEmail
            }
          : createDefaultVillageResume(activeProjectId, rawDesa, kec, kab, {
              targetSpan: tSpan,
              estimasiBidangAwal: estBidang,
              namaKades: kades,
              namaCamat: camat,
              namaPjt: batchDefaultPjt.trim(),
              noSertifikatPjt: batchDefaultSertifikatPjt.trim(),
              updatedBy: operatorName || userEmail
            });

        await saveVillageResume(merged, {
          accessToken,
          spreadsheetId,
          projectName: activeProjectName,
          totalBidang: uniqueDesasFromRecords.get(rawDesa)?.totalBidang || 0,
          totalLuas: uniqueDesasFromRecords.get(rawDesa)?.totalLuas || 0,
          progressPct: calculateVillageProgress(merged)
        });
        updatedMap.set(rawDesa, merged);
        addedCount++;
      }

      setResumes(Array.from(updatedMap.values()));
      setBatchDesaText('');
      setIsAddingDesaModal(false);
      setSaveFeedback({
        type: 'success',
        text: `✅ Berhasil menginisialisasi ${addedCount} Desa Koridor Pra-Akuisisi ke dalam Resume Proyek!`
      });
      setTimeout(() => setSaveFeedback(null), 6000);
    } finally {
      setIsProcessingBatchDesa(false);
    }
  };

  // Sync & Persist All GeoJSON Villages into Cloud Firestore / Sheet (Pra-Akuisisi)
  const handleSyncGeoJSONDesasToCloud = async () => {
    if (uniqueDesasFromGeoJSON.size === 0) return;
    setIsProcessingBatchDesa(true);
    try {
      const updatedMap = new Map<string, VillageResume>();
      resumes.forEach(r => updatedMap.set(r.desaName.toUpperCase(), r));
      let syncedCount = 0;

      for (const [desaName, geoStats] of uniqueDesasFromGeoJSON.entries()) {
        const existing = updatedMap.get(desaName);
        const merged = existing
          ? {
              ...existing,
              kecamatan: existing.kecamatan || geoStats.kecamatan,
              kabupaten: existing.kabupaten || geoStats.kabupaten,
              targetSpan: existing.targetSpan ?? (geoStats.spans.size > 0 ? geoStats.spans.size : undefined),
              daftarSpan: existing.daftarSpan || (geoStats.spans.size > 0 ? Array.from(geoStats.spans).join(', ') : ''),
              estimasiBidangAwal: existing.estimasiBidangAwal ?? (geoStats.polygonCount > 0 ? geoStats.polygonCount : undefined),
              updatedBy: operatorName || userEmail
            }
          : createDefaultVillageResume(activeProjectId, desaName, geoStats.kecamatan, geoStats.kabupaten, {
              targetSpan: geoStats.spans.size > 0 ? geoStats.spans.size : undefined,
              daftarSpan: geoStats.spans.size > 0 ? Array.from(geoStats.spans).join(', ') : '',
              estimasiBidangAwal: geoStats.polygonCount > 0 ? geoStats.polygonCount : undefined,
              updatedBy: operatorName || userEmail
            });

        await saveVillageResume(merged, {
          accessToken,
          spreadsheetId,
          projectName: activeProjectName,
          totalBidang: uniqueDesasFromRecords.get(desaName)?.totalBidang || 0,
          totalLuas: uniqueDesasFromRecords.get(desaName)?.totalLuas || 0,
          progressPct: calculateVillageProgress(merged)
        });
        updatedMap.set(desaName, merged);
        syncedCount++;
      }

      setResumes(Array.from(updatedMap.values()));
      setIsAddingDesaModal(false);
      setSaveFeedback({
        type: 'success',
        text: `✅ Berhasil menarik & menyimpan ${syncedCount} Desa dari Peta GeoJSON ke Database Resume Pra-Akuisisi!`
      });
      setTimeout(() => setSaveFeedback(null), 6000);
    } finally {
      setIsProcessingBatchDesa(false);
    }
  };

  // Helper to ensure dedicated Google Drive folders exist: Folder Desa -> Folder Desa/Kegiatan
  const getOrCreateDesaFolder = async (desaName: string, stageName?: string): Promise<{ desaFolderId: string; stageFolderId?: string; stageFolderUrl?: string } | null> => {
    let currentToken = accessToken;
    if (!currentToken && onRefreshGoogleToken) {
      currentToken = (await onRefreshGoogleToken()) || undefined;
    }
    if (!currentToken) return null;

    try {
      // 1. Root / master upload folder in Drive specifically for Resume Proyek
      const mainFolderId = resumeUploadsFolderId || uploadsFolderId || await findOrCreateFolder(currentToken, "SIP_RESUME_PROYEK_DESA");
      // 2. Dedicated folder for this Desa: DESA_[NAMA_DESA]
      const cleanDesaName = desaName.trim().toUpperCase().replace(/[\/\\?%*:|"<>\s]/g, '_');
      const desaFolderId = await findOrCreateFolder(currentToken, `DESA_${cleanDesaName}`, mainFolderId);

      // 3. Subfolder per kegiatan jika disediakan: [NAMA_DESA] - [NAMA_KEGIATAN]
      let stageFolderId: string | undefined = undefined;
      let stageFolderUrl: string | undefined = undefined;
      if (stageName) {
        const cleanStageName = stageName.trim().toUpperCase().replace(/[\/\\?%*:|"<>\s]/g, '_');
        stageFolderId = await findOrCreateFolder(currentToken, `${cleanDesaName}_${cleanStageName}`, desaFolderId);
        stageFolderUrl = `https://drive.google.com/drive/folders/${stageFolderId}`;
      }

      return { desaFolderId, stageFolderId, stageFolderUrl };
    } catch (err) {
      console.warn("Gagal membuat/mencari folder desa/kegiatan di Google Drive:", err);
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

      const stageObj = activeStages.find(s => s.key === stageKey);
      const stageLabel = stageObj?.fullName || stageKey;

      if (currentToken) {
        setUploadProgressText(`Membuat folder Google Drive untuk Desa ${editingDesa.desaName} / ${stageLabel}...`);
        const folderResult = await getOrCreateDesaFolder(editingDesa.desaName, stageLabel);
        const targetUploadFolderId = folderResult?.stageFolderId || folderResult?.desaFolderId;
        if (targetUploadFolderId) {
          setUploadProgressText(`Mengunggah berkas PDF "${file.name}" langsung ke Google Drive...`);
          const res = await uploadFileToDrive(
            currentToken, 
            file, 
            `BA_${stageKey.toUpperCase()}`, 
            editingDesa.desaName, 
            targetUploadFolderId
          );
          webLink = res.webViewLink;
          setEditingDesa(prev => prev ? { 
            ...prev, 
            driveFolderId: folderResult?.desaFolderId || prev.driveFolderId 
          } : null);
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

  // Upload Documentation Photos Handler inside editing modal (Multiple support & Min 4 Photos)
  const handleUploadPhotos = async (files: FileList | File[], stageKey: string) => {
    if (!editingDesa) return;
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploadingFile(true);
    setUploadProgressText(`Menyiapkan ${fileArray.length} foto dokumentasi...`);
    try {
      let currentToken = accessToken;
      if (!currentToken && onRefreshGoogleToken) {
        currentToken = (await onRefreshGoogleToken()) || undefined;
      }

      const stageObj = activeStages.find(s => s.key === stageKey);
      const stageLabel = stageObj?.fullName || stageKey;
      let targetUploadFolderId: string | undefined = undefined;

      if (currentToken) {
        setUploadProgressText(`Membuat folder Google Drive untuk Desa ${editingDesa.desaName} / ${stageLabel}...`);
        const folderResult = await getOrCreateDesaFolder(editingDesa.desaName, stageLabel);
        targetUploadFolderId = folderResult?.stageFolderId || folderResult?.desaFolderId;
      }

      const uploadedPhotoUrls: string[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgressText(`Mengunggah foto ${i + 1} dari ${fileArray.length} ke Google Drive...`);
        let photoUrl = '';
        if (currentToken && targetUploadFolderId) {
          const res = await uploadFileToDrive(
            currentToken, 
            file, 
            `DOK_${stageKey.toUpperCase()}_FOTO_${i + 1}`, 
            editingDesa.desaName, 
            targetUploadFolderId
          );
          photoUrl = res.webViewLink;
        } else {
          photoUrl = await compressImageFile(file, 1000, 1000, 0.65);
        }
        if (photoUrl) {
          uploadedPhotoUrls.push(photoUrl);
        }
      }

      setEditingDesa(prev => {
        if (!prev) return null;
        const currentStage = (prev as any)[stageKey] || createEmptyStageDoc();
        const existingPhotos = currentStage.docPhotos || [];
        const combined = [...existingPhotos, ...uploadedPhotoUrls];
        return {
          ...prev,
          [stageKey]: {
            ...currentStage,
            docPhotos: combined,
            status: currentStage.status === 'BELUM' ? 'PROSES' : currentStage.status
          }
        };
      });

      setSaveFeedback({
        type: 'success',
        text: `✅ ${uploadedPhotoUrls.length} foto dokumentasi berhasil diunggah ke Google Drive!`
      });
      setTimeout(() => setSaveFeedback(null), 5000);
    } catch (err: any) {
      console.error('Failed to upload photos:', err);
      alert('Gagal mengunggah foto dokumentasi: ' + (err?.message || 'Cek koneksi internet.'));
    } finally {
      setIsUploadingFile(false);
      setUploadProgressText('');
    }
  };

  // Export CSV dynamically according to active stages (Point 4 automatically exports completed berkas/total & %)
  const handleExportCSV = () => {
    const headers = ['No', 'Nama Desa', 'Kecamatan', ...activeStages.map(s => s.fullName), 'Progres (%)'];
    const rows = filteredResumes.map((r, i) => {
      const vStat = uniqueDesasFromRecords.get(r.desaName.toUpperCase());
      return [
        i + 1,
        `"${r.desaName}"`,
        `"${r.kecamatan || '-'}"`,
        ...activeStages.map(s => {
          if (s.key === 'inventarisasiNominatif') {
            const selesai = vStat?.berkasSelesai || 0;
            const total = vStat?.totalBidang || 0;
            const pct = vStat?.berkasPct || 0;
            return `"${selesai}/${total} Bidang (${pct}%)"`;
          }
          const stage = (r as any)[s.key] as VillageStageDoc | undefined;
          return stage?.status || 'BELUM';
        }),
        `${calculateVillageProgress(r)}%`
      ];
    });

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
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Menu 1.4
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Monitoring Per Jalur
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Siap Pra-Akuisisi & Lapangan
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2 pt-0.5">
              <Landmark className="w-5 h-5 text-amber-400" />
              Resume Proyek: Monitoring Tahapan Desa per Jalur Transmisi
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">
              Monitoring terpadu {activeStages.length} tahapan proyek (mulai dari <span className="text-sky-300">Pendataan Awal</span>, <span className="text-amber-300">Sosialisasi Desa</span>, <span className="text-cyan-300">Survei & Pemetaan</span>, <span className="text-emerald-300">Inventarisasi & Nominatif (Otomatis Database)</span>, <span className="text-sky-300">Pengumuman</span>, <span className="text-purple-300">Penyusunan BAPT</span>, <span className="text-rose-300">Registrasi BAPT</span>, <span className="text-indigo-300">Sosialisasi Penyampaian Nilai</span>, <span className="text-teal-300">Sosialisasi Pembayaran</span>, hingga <span className="text-lime-300">Bush Clearing</span>).
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
                title="Atur poin tahapan yang aktif pada proyek ini"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                <span>Atur Tahapan ({activeStages.length}/{stagesConfig.length})</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              title="Unduh Rekap CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Ekspor CSV</span>
            </button>

            {/* Generate Otomatis Google Sheet Resume */}
            {!isGuest && (
              <button
                type="button"
                disabled={isGeneratingSheet}
                onClick={handleAutoGenerateResumeSheet}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                title="Buat Google Spreadsheet baru khusus Resume Proyek ini langsung di Google Drive Anda"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isGeneratingSheet ? 'animate-spin' : ''}`} />
                <span>{isGeneratingSheet ? 'Membuat Spreadsheet...' : '⚡ Buat Google Sheet Resume'}</span>
              </button>
            )}

            {/* Unduh Excel Buku Laporan Jalur (.xlsx) */}
            <button
              onClick={async () => {
                const currentProj = allProjects?.find(p => p.id === activeProjectId) || {
                  id: activeProjectId,
                  name: activeProjectName || 'Proyek Jalur',
                  spreadsheetId: null,
                  folderId: null,
                  uploadsFolderId: null
                };
                await downloadJalurWorkbook(currentProj, records, resumes);
              }}
              className="px-3.5 py-2 bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 hover:text-white rounded-xl border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02]"
              title="Unduh Buku Excel Lengkap Jalur Ini (Resume Desa, Surat Instansi, & Daftar Nominatif)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Unduh Excel Jalur (.xlsx)</span>
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
                onClick={() => {
                  setAddDesaTab(uniqueDesasFromGeoJSON.size > 0 && records.length === 0 ? 'geojson' : 'batch');
                  setIsAddingDesaModal(true);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 cursor-pointer"
                title="Inisialisasi Daftar Desa Koridor Sebelum Akuisisi Lapangan (Copy-Paste Excel / Peta GeoJSON / Input Manual)"
              >
                <Plus className="w-4 h-4" />
                <span>Inisialisasi / Tambah Desa Pra-Akuisisi</span>
              </button>
            )}
          </div>
        </div>

        {/* Pra-Akuisisi Info Banner when field acquisition hasn't started or GeoJSON villages exist */}
        {(records.length === 0 || uniqueDesasFromGeoJSON.size > 0) && (
          <div className="bg-gradient-to-r from-sky-950/70 via-slate-900/90 to-emerald-950/60 border border-sky-500/30 p-4 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-500/40 text-sky-300 flex items-center justify-center shrink-0 font-black text-xs">
                PRA
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-white">
                    Mode Pra-Akuisisi Aktif — Resume Proyek Dapat Dimulai Sejak Tahap Pendataan Awal
                  </span>
                  {records.length === 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      Akuisisi Lapangan: 0 Bidang
                    </span>
                  )}
                  {uniqueDesasFromGeoJSON.size > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      Terdeteksi {uniqueDesasFromGeoJSON.size} Desa dari Peta Spasial (GeoJSON)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Daftar desa di Resume Project <strong>tidak harus menunggu akuisisi lapangan dimulai</strong>. Sistem menggabungkan desa dari: <strong>(1) Daftar Desa Pra-Akuisisi</strong> yang Anda input/paste, <strong>(2) Layer Peta Spasial GeoJSON Jalur Ini</strong>, dan <strong>(3) Database Akuisisi Lapangan</strong> saat tim mulai turun ke lapangan nanti.
                </p>
              </div>
            </div>
            {!isGuest && (
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {uniqueDesasFromGeoJSON.size > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncGeoJSONDesasToCloud}
                    className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all cursor-pointer shadow-md"
                  >
                    🗺️ Simpan {uniqueDesasFromGeoJSON.size} Desa Peta ke Resume Cloud
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAddDesaTab('batch');
                    setIsAddingDesaModal(true);
                  }}
                  className="px-3.5 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  📋 Input Massal Daftar Desa
                </button>
              </div>
            )}
          </div>
        )}

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

        {/* Top KPI Metrics Bar (10 Stages) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2 border-t border-white/5 relative z-10">
          {activeStages.map((stage) => {
            const isAutoPoint4 = stage.key === 'inventarisasiNominatif';
            const stat = metrics.stageStats[stage.key] || { selesai: 0, proses: 0 };
            const pct = isAutoPoint4
              ? metrics.corridorBerkasPct
              : (metrics.totalDesa > 0 ? Math.round((stat.selesai / metrics.totalDesa) * 100) : 0);
            return (
              <div key={stage.key} className="bg-slate-900/60 p-3 rounded-2xl border border-white/5 space-y-1.5 hover:border-white/15 transition-all">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-extrabold ${stage.color || 'text-amber-400'} truncate block`} title={stage.fullName}>
                    {stage.label}
                  </span>
                  <span className="text-[10px] font-mono font-extrabold text-slate-400 shrink-0">
                    {isAutoPoint4
                      ? `${metrics.totalBerkasSelesai}/${metrics.totalBidangKoridor}`
                      : `${stat.selesai}/${metrics.totalDesa}`}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-0.5">
                  <span className="text-lg font-black text-white font-mono">{pct}%</span>
                  <span className="text-[9px] text-slate-500 font-semibold">
                    {isAutoPoint4 ? 'Otomatis DB' : `${stat.proses} Proses`}
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div 
                    className={`${isAutoPoint4 ? 'bg-emerald-500' : 'bg-amber-500'} h-full rounded-full transition-all duration-500`}
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
              <h4 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2 flex-wrap">
                <span>Total Progres Koridor: {metrics.totalDesa} Desa</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                  Berkas Selesai (Poin 4): {metrics.totalBerkasSelesai}/{metrics.totalBidangKoridor} Bidang ({metrics.corridorBerkasPct}%)
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono">
                  Registrasi BAPT: {metrics.registeredBaptCount}/{metrics.totalDesa} Desa
                </span>
                {metrics.praAkuisisiCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-mono">
                    Pra-Akuisisi: {metrics.praAkuisisiCount} Desa
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {metrics.completedCount} desa telah 100% tuntas seluruh tahapan, {metrics.inProgressCount} desa sedang berjalan.
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
              placeholder="Cari desa, kecamatan, kabupaten, atau nama Kades..."
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
              Tuntas BAPT ({metrics.completedCount})
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'IN_PROGRESS' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              On Progress ({metrics.inProgressCount})
            </button>
          </div>

          {!isGuest && metrics.praAkuisisiCount > 0 && (
            <button
              type="button"
              onClick={handleCleanNonDatabaseVillages}
              className="px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Bersihkan desa luar jalur / desa yang tidak memiliki bidang di database jalur ini"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Bersihkan Desa Luar Jalur ({metrics.praAkuisisiCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Table Resume View */}
      <div className="glass-card rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
        {/* Scroll Control Bar */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
            <span className="text-[11px] font-bold text-slate-300">Matriks Tahapan Resume Proyek:</span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono hidden md:inline">
              Shift + Scroll untuk geser samping
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-emerald-400 font-bold text-[11px] mr-1 hidden sm:inline">
              {filteredResumes.length} Desa Koridor
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
          <table className="w-full text-left border-collapse min-w-[1600px]">
            <thead className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-white/10 shadow-md">
              <tr className="bg-slate-950/90 border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">
                <th className="py-3 px-3 w-10 text-center">No</th>
                <th className="py-3 px-3 w-60">Desa, Span & Data Bidang</th>
                {activeStages.map((stage) => (
                  <th key={stage.key} className="py-3 px-3 min-w-[140px]">
                    <div className="space-y-0.5">
                      <span className={`${stage.color || 'text-slate-300'} block`}>{stage.label}</span>
                      {stage.key === 'inventarisasiNominatif' && (
                        <span className="text-[9px] text-emerald-400/80 font-normal block normal-case">
                          Otomatis Database
                        </span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="py-3 px-3 w-24 text-center">Progres</th>
                <th className="py-3 px-4 w-36 text-center">Aksi Dokumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-medium">
              {filteredResumes.length === 0 ? (
                <tr>
                  <td colSpan={activeStages.length + 4} className="text-center py-14 text-slate-400 space-y-4">
                    <Landmark className="w-10 h-10 text-amber-400/60 mx-auto" />
                    <div className="space-y-1 max-w-lg mx-auto">
                      <p className="text-sm font-extrabold text-white">
                        Belum Ada Daftar Desa pada Resume Proyek Ini
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Anda dapat langsung menginisialisasi daftar desa rencana jalur transmisi <strong>sebelum akuisisi lapangan dimulai</strong>.
                      </p>
                    </div>
                    {!isGuest && (
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAddDesaTab('batch');
                            setIsAddingDesaModal(true);
                          }}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer shadow-lg"
                        >
                          + Inisialisasi Daftar Desa Pra-Akuisisi
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredResumes.map((res, index) => {
                  const progress = calculateVillageProgress(res);
                  const villageData = uniqueDesasFromRecords.get(res.desaName.toUpperCase()) || {
                    totalBidang: 0,
                    berkasSelesai: 0,
                    berkasPct: 0,
                    totalLuas: 0,
                    qcApproved: 0,
                    spans: new Set<string>(),
                  };
                  const geoData = uniqueDesasFromGeoJSON.get(res.desaName.toUpperCase());
                  const spanCount = res.targetSpan || villageData.spans.size || geoData?.spans.size || 0;
                  const estBidang = res.estimasiBidangAwal || geoData?.polygonCount || 0;
                  const isPraAkuisisi = villageData.totalBidang === 0;

                  return (
                    <tr 
                      key={res.id} 
                      className="hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* No */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-500 font-bold">
                        {index + 1}
                      </td>

                      {/* Desa & Info Lahan (Pra-Akuisisi + Realisasi Lapangan) */}
                      <td className="py-3.5 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Landmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-extrabold text-white text-sm tracking-tight">
                              {res.desaName}
                            </span>
                            {isPraAkuisisi ? (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[9px] font-extrabold uppercase">
                                Pra-Akuisisi
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-extrabold uppercase">
                                Akuisisi Aktif
                              </span>
                            )}
                          </div>

                          {(res.kecamatan || res.kabupaten) && (
                            <span className="text-[10px] text-slate-400 font-semibold block">
                              {res.kecamatan ? `Kec. ${res.kecamatan}` : ''}{res.kecamatan && res.kabupaten ? ' • ' : ''}{res.kabupaten || ''}
                            </span>
                          )}

                          {/* Target Span & Estimasi vs Realisasi Akuisisi */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px] font-mono">
                            {spanCount > 0 && (
                              <span className="bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20" title={res.daftarSpan || 'Jumlah Span pada Desa ini'}>
                                {spanCount} Span
                              </span>
                            )}
                            {isPraAkuisisi ? (
                              <span className="bg-sky-500/10 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/20" title="Target / Estimasi Bidang Pra-Akuisisi (Sebelum turun lapangan)">
                                Est: {estBidang > 0 ? `${estBidang} Bidang` : 'Belum diinput'}
                              </span>
                            ) : (
                              <>
                                <span className="bg-white/5 text-slate-200 px-1.5 py-0.5 rounded border border-white/10" title="Realisasi Bidang Terakuisisi di Database">
                                  {villageData.totalBidang}{estBidang > 0 ? `/${estBidang}` : ''} Bidang
                                </span>
                                <span className="bg-white/5 text-slate-300 px-1.5 py-0.5 rounded border border-white/10">
                                  {villageData.totalLuas.toLocaleString('id-ID')} m²
                                </span>
                              </>
                            )}
                          </div>

                          {res.namaKades && (
                            <span className="text-[10px] text-slate-400 block truncate" title={`Kepala Desa/Lurah: ${res.namaKades}`}>
                              Kades: <strong className="text-slate-300">{res.namaKades}</strong>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Dynamic Stage Columns (10 Stages, Point 4 Auto from Database) */}
                      {activeStages.map((stage) => {
                        if (stage.key === 'inventarisasiNominatif') {
                          const autoStatus: StageStatus =
                            villageData.totalBidang === 0
                              ? 'BELUM'
                              : villageData.berkasSelesai === villageData.totalBidang
                              ? 'SELESAI'
                              : 'PROSES';
                          return (
                            <td key={stage.key} className="py-3.5 px-3 align-top">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1.5">
                                  {renderStatusBadge(autoStatus)}
                                  <span className={`text-xs font-mono font-black ${
                                    villageData.berkasPct === 100
                                      ? 'text-emerald-400'
                                      : villageData.berkasPct > 0
                                      ? 'text-amber-400'
                                      : 'text-slate-500'
                                  }`}>
                                    {villageData.berkasPct}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      villageData.berkasPct === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${villageData.berkasPct}%` }}
                                  />
                                </div>
                                <div className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded inline-block">
                                  {villageData.berkasSelesai}/{villageData.totalBidang} Berkas Selesai
                                </div>
                              </div>
                            </td>
                          );
                        }

                        const stageData = ((res as any)[stage.key] as VillageStageDoc | undefined) || createEmptyStageDoc();
                        return (
                          <td key={stage.key} className="py-3.5 px-3 align-top">
                            <div className="space-y-1.5">
                              {renderStatusBadge(stageData.status)}

                              {/* Stage-specific metadata badges */}
                              {stageData.nomorDokumen && (
                                <div className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded truncate max-w-[145px]" title={`No. Dokumen / Register: ${stageData.nomorDokumen}`}>
                                  {stage.key === 'registrasiBapt' ? `Reg: ${stageData.nomorDokumen}` : stageData.nomorDokumen}
                                </div>
                              )}

                              {stageData.date && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  {stageData.date}{stageData.endDate ? ` s/d ${stageData.endDate}` : ''}
                                </div>
                              )}

                              {stage.key === 'baPengumuman' && (stageData.jumlahKeberatan || 0) > 0 && (
                                <div className="text-[9px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded inline-block">
                                  {stageData.jumlahKeberatan} Keberatan ({stageData.statusKeberatan || 'PROSES'})
                                </div>
                              )}

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
                                setActiveStageTab(activeStages[0]?.key || 'pendataanAwal');
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm flex-1"
                              title="Kelola Tahapan & Upload Dokumen Desa"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Kelola</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingDesa(res);
                                setActiveStageTab(activeStages[0]?.key || 'pendataanAwal');
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
                                const folderRes = await getOrCreateDesaFolder(res.desaName);
                                if (folderRes?.desaFolderId) {
                                  const updated = { ...res, driveFolderId: folderRes.desaFolderId };
                                  await saveVillageResume(updated);
                                  window.open(`https://drive.google.com/drive/folders/${folderRes.desaFolderId}`, '_blank');
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

                          {!isGuest && isPraAkuisisi && (
                            <button
                              type="button"
                              onClick={() => handleDeleteVillage(res)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 border border-rose-500/25 rounded-xl transition-all cursor-pointer"
                              title={`Hapus Desa ${res.desaName} dari Resume Jalur Ini`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* 4. MODAL: EDIT / UPLOAD BERKAS TAHAPAN DESA (PERMEN ESDM NO. 13 TAHUN 2025) */}
      {editingDesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-white/20 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-extrabold text-white">
                      Kelola Tahapan Desa {editingDesa.desaName}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      Progres: {calculateVillageProgress(editingDesa)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Kec. {editingDesa.kecamatan || '-'} • {editingDesa.kabupaten || '-'} • Jalur {activeProjectName}
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

            {/* Profil Pra-Akuisisi & Pejabat Penandatangan */}
            <div className="px-5 py-3 bg-slate-950/90 border-b border-white/10">
              <details className="group">
                <summary className="text-xs font-bold text-sky-300 cursor-pointer flex items-center justify-between select-none">
                  <span>📋 Data Pra-Akuisisi Desa, Target Span & Pejabat Penandatangan — Klik untuk Edit</span>
                  <span className="text-[10px] font-mono text-slate-400 group-open:text-amber-300">
                    Span: {editingDesa.targetSpan || 0} | Est. Bidang: {editingDesa.estimasiBidangAwal || 0} | Kades: {editingDesa.namaKades || '-'}
                  </span>
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 pb-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kecamatan</label>
                    <input
                      type="text"
                      disabled={isGuest}
                      value={editingDesa.kecamatan || ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, kecamatan: e.target.value.toUpperCase() } : null)}
                      placeholder="Nama Kecamatan"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kabupaten / Kota</label>
                    <input
                      type="text"
                      disabled={isGuest}
                      value={editingDesa.kabupaten || ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, kabupaten: e.target.value.toUpperCase() } : null)}
                      placeholder="Nama Kabupaten/Kota"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-amber-400 uppercase block mb-1">Target Jumlah Span</label>
                    <input
                      type="number"
                      min={0}
                      disabled={isGuest}
                      value={editingDesa.targetSpan ?? ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, targetSpan: Number(e.target.value) || 0 } : null)}
                      placeholder="Contoh: 4"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-sky-400 uppercase block mb-1">Estimasi Bidang Pra-Akuisisi</label>
                    <input
                      type="number"
                      min={0}
                      disabled={isGuest}
                      value={editingDesa.estimasiBidangAwal ?? ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, estimasiBidangAwal: Number(e.target.value) || 0 } : null)}
                      placeholder="Contoh: 35"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Daftar Span Tower</label>
                    <input
                      type="text"
                      disabled={isGuest}
                      value={editingDesa.daftarSpan || ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, daftarSpan: e.target.value } : null)}
                      placeholder="Contoh: T.01-T.02, T.02-T.03"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nama Kepala Desa / Lurah</label>
                    <input
                      type="text"
                      disabled={isGuest}
                      value={editingDesa.namaKades || ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, namaKades: e.target.value } : null)}
                      placeholder="Penandatangan BA & BAPT"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nama Camat</label>
                    <input
                      type="text"
                      disabled={isGuest}
                      value={editingDesa.namaCamat || ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, namaCamat: e.target.value } : null)}
                      placeholder="Penandatangan BA Sosialisasi & BAPT"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-emerald-400 uppercase block mb-1">Penanggung Jawab Teknik (PJT)</label>
                    <input
                      type="text"
                      disabled={isGuest}
                      value={editingDesa.namaPjt || ''}
                      onChange={(e) => setEditingDesa(prev => prev ? { ...prev, namaPjt: e.target.value } : null)}
                      placeholder="Penanggung Jawab Teknik"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>
              </details>
            </div>

            {/* Stage Tabs */}
            <div className="flex border-b border-white/10 bg-slate-950/50 px-4 overflow-x-auto">
              {activeStages.map((stage) => {
                const stageData = (editingDesa as any)[stage.key];
                const isActive = activeStageTab === stage.key;
                const vStat = uniqueDesasFromRecords.get(editingDesa.desaName.toUpperCase());
                const isCompleted = stage.key === 'inventarisasiNominatif'
                  ? (vStat && vStat.totalBidang > 0 && vStat.berkasSelesai === vStat.totalBidang)
                  : stageData?.status === 'SELESAI';
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
                    {isCompleted && (
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
                const stageData = ((editingDesa as any)[activeStageTab] as VillageStageDoc | undefined) || createEmptyStageDoc();
                const editDesaStats = uniqueDesasFromRecords.get(editingDesa.desaName.toUpperCase()) || {
                  totalBidang: 0,
                  berkasSelesai: 0,
                  berkasPct: 0,
                  totalLuas: 0,
                  qcApproved: 0
                };

                if (activeStageTab === 'inventarisasiNominatif') {
                  return (
                    <div className="space-y-4">
                      <div className="bg-emerald-950/40 p-6 rounded-2xl border border-emerald-500/30 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Terhitung Otomatis dari Database
                            </span>
                            <h4 className="text-base font-extrabold text-white pt-1">
                              {currentStageConfig.fullName}
                            </h4>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              Tahap ini dihitung otomatis dari jumlah bidang di Desa <strong>{editingDesa.desaName}</strong> yang berstatus <strong>PROGRES PEMBERKASAN = SELESAI</strong> pada Database Lahan.
                            </p>
                          </div>
                          <div className="bg-slate-950/90 px-5 py-3.5 rounded-2xl border border-emerald-500/30 text-center shrink-0">
                            <span className="text-2xl font-black text-emerald-400 font-mono block">
                              {editDesaStats.berkasPct}%
                            </span>
                            <span className="text-[11px] font-mono font-bold text-slate-300">
                              {editDesaStats.berkasSelesai} / {editDesaStats.totalBidang} Berkas Selesai
                            </span>
                          </div>
                        </div>

                        <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-white/10">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${editDesaStats.berkasPct}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          <div className="p-3 bg-slate-900/80 rounded-xl border border-white/10">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Bidang di Database</span>
                            <span className="text-base font-black text-white font-mono">{editDesaStats.totalBidang} Bidang</span>
                          </div>
                          <div className="p-3 bg-slate-900/80 rounded-xl border border-emerald-500/20">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase block">Selesai Pemberkasan</span>
                            <span className="text-base font-black text-emerald-300 font-mono">{editDesaStats.berkasSelesai} Bidang</span>
                          </div>
                          <div className="p-3 bg-slate-900/80 rounded-xl border border-amber-500/20">
                            <span className="text-[10px] font-bold text-amber-400 uppercase block">Belum Selesai Berkas</span>
                            <span className="text-base font-black text-amber-300 font-mono">
                              {Math.max(0, editDesaStats.totalBidang - editDesaStats.berkasSelesai)} Bidang
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Stage Header */}
                    <div className="bg-slate-900/70 p-4 rounded-2xl border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-extrabold text-white">
                            {currentStageConfig.fullName}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {currentStageConfig.description || 'Status kelengkapan berkas, berita acara, serta foto dokumentasi lapangan.'}
                        </p>
                      </div>

                      {/* Status Selector */}
                      <div className="flex items-center gap-2 shrink-0">
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

                    {/* Nomor Dokumen, Tanggal Pelaksanaan, & Catatan */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                          {activeStageTab === 'registrasiBapt'
                            ? 'Nomor Register BAPT'
                            : activeStageTab === 'lampiranBapt'
                            ? 'Nomor BAPT'
                            : activeStageTab === 'baPengumuman'
                            ? 'Nomor Pengumuman'
                            : 'Nomor Dokumen / Berita Acara / Surat'}
                        </label>
                        <input
                          type="text"
                          disabled={isGuest}
                          value={stageData.nomorDokumen || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeStageTab]: { ...stageData, nomorDokumen: val }
                              };
                            });
                          }}
                          placeholder={
                            activeStageTab === 'registrasiBapt'
                              ? 'Contoh: REG-BAPT/2025/001'
                              : 'Contoh: 005/BA-SOS/VSS/2025'
                          }
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                          {activeStageTab === 'baPengumuman' ? 'Tanggal Mulai Pengumuman' : 'Tanggal Pelaksanaan / Dokumen'}
                        </label>
                        <input
                          type="date"
                          disabled={isGuest}
                          value={stageData.date || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDesa(prev => {
                              if (!prev) return null;
                              const nextEndDate = activeStageTab === 'baPengumuman' && val && !stageData.endDate
                                ? addWorkingDays(val, 7)
                                : stageData.endDate;
                              return {
                                ...prev,
                                [activeStageTab]: { ...stageData, date: val, endDate: nextEndDate }
                              };
                            });
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                          Catatan / Keterangan Pelaksanaan
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
                          placeholder="Contoh: Dihadiri PJT, Camat, Kepala Desa & perwakilan warga..."
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* Special Fields for Stage 5: Pengumuman & Inventarisasi Ulang */}
                    {activeStageTab === 'baPengumuman' && (
                      <div className="bg-orange-950/30 border border-orange-500/30 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-orange-300 uppercase block">
                            Tanggal Berakhir Pengumuman
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              disabled={isGuest}
                              value={stageData.endDate || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditingDesa(prev => prev ? {
                                  ...prev,
                                  baPengumuman: { ...stageData, endDate: val }
                                } : null);
                              }}
                              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white"
                            />
                            {!isGuest && stageData.date && (
                              <button
                                type="button"
                                onClick={() => {
                                  const calc = addWorkingDays(stageData.date!, 7);
                                  setEditingDesa(prev => prev ? {
                                    ...prev,
                                    baPengumuman: { ...stageData, endDate: calc }
                                  } : null);
                                }}
                                className="px-2.5 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-xl text-[10px] font-bold shrink-0 cursor-pointer"
                                title="Hitung otomatis +7 Hari Kerja (Senin-Jumat)"
                              >
                                +7 HK
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-orange-300 uppercase block">
                            Jumlah Pengajuan Keberatan Warga
                          </label>
                          <input
                            type="number"
                            min={0}
                            disabled={isGuest}
                            value={stageData.jumlahKeberatan ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setEditingDesa(prev => prev ? {
                                ...prev,
                                baPengumuman: {
                                  ...stageData,
                                  jumlahKeberatan: val,
                                  statusKeberatan: val === 0 ? 'TIDAK_ADA' : (stageData.statusKeberatan || 'DITERIMA')
                                }
                              } : null);
                            }}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-orange-300 uppercase block">
                            Hasil BA Inventarisasi Ulang
                          </label>
                          <select
                            disabled={isGuest}
                            value={stageData.statusKeberatan || 'TIDAK_ADA'}
                            onChange={(e) => {
                              const val = e.target.value as 'TIDAK_ADA' | 'DITERIMA' | 'DITOLAK';
                              setEditingDesa(prev => prev ? {
                                ...prev,
                                baPengumuman: { ...stageData, statusKeberatan: val }
                              } : null);
                            }}
                            className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white font-bold"
                          >
                            <option value="TIDAK_ADA">Tidak Ada Keberatan Warga</option>
                            <option value="DITERIMA">Keberatan Diterima (Inventarisasi Ulang)</option>
                            <option value="DITOLAK">Keberatan Ditolak (Inventarisasi Ulang)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* PDF Section (If applicable) */}
                    {currentStageConfig.hasPdf && (
                      <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                            <FileText className="w-4 h-4 text-amber-400" />
                            Dokumen Resmi / Berita Acara (PDF)
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
                              <span className="text-xs font-bold text-white">Unggah Berkas PDF ({currentStageConfig.label})</span>
                              <span className="text-[10px] text-slate-400">Klik atau seret file PDF berita acara / dokumen ke sini</span>
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                              <ImageIcon className="w-4 h-4 text-purple-400" />
                              Dokumentasi Foto Lapangan (Wajib Minimal 4 Foto)
                            </h5>
                          </div>
                          <div>
                            {(stageData.docPhotos || []).length >= 4 ? (
                              <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                Lengkap ({(stageData.docPhotos || []).length}/4 Foto)
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                                Wajib Min. 4 Foto (Saat ini: {(stageData.docPhotos || []).length}/4)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* SOP Info Box */}
                        <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-[11px] text-purple-200 flex items-start gap-2">
                          <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">
                            Sesuai standar operasional, setiap tahapan kegiatan wajib mengunggah <strong>minimal 4 foto dokumentasi</strong> (tampak lokasi, pelaksanaan kegiatan, daftar hadir/peserta, dan penandatanganan berkas). Foto otomatis tersimpan rapi di Google Drive dalam folder <code>[Nama Desa] - [Nama Kegiatan]</code>.
                          </p>
                        </div>

                        {/* Photos Grid & Empty Slots */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {(stageData.docPhotos || []).map((photoUrl, idx) => (
                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-purple-500/30 aspect-video bg-slate-950 shadow-sm">
                              <img
                                src={photoUrl}
                                alt={`Dokumentasi ${idx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-white border border-white/10">
                                Foto {idx + 1}
                              </span>
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

                          {!isGuest && Array.from({ length: Math.max(0, 4 - (stageData.docPhotos || []).length) }).map((_, slotIdx) => {
                            const slotNumber = (stageData.docPhotos || []).length + slotIdx + 1;
                            return (
                              <label key={`empty-${slotIdx}`} className="border-2 border-dashed border-purple-500/30 hover:border-purple-400 rounded-xl aspect-video flex flex-col items-center justify-center gap-1.5 p-2 bg-purple-500/5 hover:bg-purple-500/10 cursor-pointer transition-all text-center">
                                <UploadCloud className="w-5 h-5 text-purple-400" />
                                <span className="text-[10px] font-bold text-purple-200">Slot Foto {slotNumber}</span>
                                <span className="text-[8px] text-slate-400">+ Unggah</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files) handleUploadPhotos(e.target.files, activeStageTab);
                                  }}
                                />
                              </label>
                            );
                          })}
                        </div>

                        {!isGuest && (
                          <label className="border border-purple-500/30 hover:border-purple-400 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-all bg-purple-500/10 hover:bg-purple-500/20">
                            <UploadCloud className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-bold text-purple-200">
                              Unggah Foto Dokumentasi (Bisa Pilih Sekaligus dari Galeri HP / Komputer)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) handleUploadPhotos(e.target.files, activeStageTab);
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

      {/* 6. MODAL: INISIALISASI DESA PRA-AKUISISI */}
      {isAddingDesaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card rounded-3xl w-full max-w-2xl border border-amber-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-900/95">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-amber-400" />
                  Inisialisasi Daftar Desa Koridor (Pra-Akuisisi)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mulai Resume Proyek dari awal <strong>sebelum akuisisi lapangan dimulai</strong>.
                </p>
              </div>
              <button
                onClick={() => setIsAddingDesaModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 bg-slate-950 px-5 gap-2">
              <button
                type="button"
                onClick={() => setAddDesaTab('batch')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  addDesaTab === 'batch'
                    ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                📋 1. Input Massal Daftar Desa (Copy-Paste Excel)
              </button>
              <button
                type="button"
                onClick={() => setAddDesaTab('geojson')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  addDesaTab === 'geojson'
                    ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                🗺️ 2. Tarik dari Peta Spasial GeoJSON ({uniqueDesasFromGeoJSON.size} Desa)
              </button>
              <button
                type="button"
                onClick={() => setAddDesaTab('manual')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  addDesaTab === 'manual'
                    ? 'border-sky-500 text-sky-300 bg-sky-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                ➕ 3. Tambah 1 Desa Detail
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-950/70 space-y-4">
              {addDesaTab === 'batch' && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-200 space-y-1">
                    <p className="font-bold text-amber-300">
                      Solusi Cepat Pra-Akuisisi (Daftar Desa Rencana Jalur):
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Tempelkan (Copy-Paste) daftar desa rencana jalur transmisi dari Excel atau ketik 1 baris per desa. Format per baris (dipisahkan koma, titik koma, atau Tab Excel):<br />
                      <code className="text-amber-300 font-mono">Nama Desa, Kecamatan, Kabupaten, Target Span, Estimasi Bidang, Nama Kades</code>
                    </p>
                  </div>

                  <textarea
                    rows={7}
                    value={batchDesaText}
                    onChange={(e) => setBatchDesaText(e.target.value)}
                    placeholder={`Contoh (bisa langsung Copy-Paste dari kolom Excel):\nSOBOREJO, SUKOREJO, PASURUAN, 4, 38, H. SULAIMAN\nGLAGAHWANGI, SUKOREJO, PASURUAN, 3, 25, SUPRIYADI\nMOJOTENGAH, SUKOREJO, PASURUAN, 5, 42, AHMAD FAUZI`}
                    className="w-full p-3.5 bg-slate-900 border border-white/15 rounded-2xl text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingDesaModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchAddDesas}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg cursor-pointer"
                    >
                      Simpan Daftar Desa Koridor ke Resume
                    </button>
                  </div>
                </div>
              )}

              {addDesaTab === 'geojson' && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-xs text-emerald-200 space-y-2">
                    <p className="font-extrabold text-emerald-300">
                      Ekstraksi Otomatis Desa dari Peta Rencana Jalur (GeoJSON) Sebelum Akuisisi Lapangan
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Jika tim GIS sudah memuat layer peta poligon indikatif / batas desa di <strong>Menu 1.2 (Peta Spasial GIS)</strong>, sistem langsung mendeteksi nama desa, kecamatan, jumlah poligon estimasi awal, dan daftar span tanpa perlu menunggu input akuisisi lapangan.
                    </p>
                  </div>

                  {uniqueDesasFromGeoJSON.size === 0 ? (
                    <div className="p-6 bg-slate-900/80 border border-white/10 rounded-2xl text-center space-y-2">
                      <p className="text-xs font-bold text-slate-300">
                        Belum ada atribut DESA yang terdeteksi dari layer GeoJSON aktif.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Anda dapat mengunggah file GeoJSON rencana jalur di Menu 1.2 (Peta Spasial) atau gunakan tab <strong>1. Input Massal Daftar Desa</strong> di samping untuk menempelkan daftar desa dari Excel.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="max-h-56 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5 bg-slate-900/70">
                        {Array.from(uniqueDesasFromGeoJSON.entries()).map(([desa, info], idx) => (
                          <div key={desa} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-mono text-slate-500 mr-2">{idx + 1}.</span>
                              <span className="font-extrabold text-white">{desa}</span>
                              {info.kecamatan && (
                                <span className="text-slate-400 ml-2">Kec. {info.kecamatan}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[10px]">
                              <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300">
                                {info.polygonCount} Poligon Peta
                              </span>
                              {info.spans.size > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                  {info.spans.size} Span
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleSyncGeoJSONDesasToCloud}
                          className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg cursor-pointer"
                        >
                          🗺️ Simpan Semua ({uniqueDesasFromGeoJSON.size} Desa) ke Resume Proyek
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {addDesaTab === 'manual' && (
                <form onSubmit={handleAddManualDesa} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                        Nama Desa / Kelurahan *
                      </label>
                      <input
                        type="text"
                        required
                        value={newDesaName}
                        onChange={(e) => setNewDesaName(e.target.value)}
                        placeholder="Contoh: SOBOREJO"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white uppercase font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                        Kecamatan
                      </label>
                      <input
                        type="text"
                        value={newKecamatan}
                        onChange={(e) => setNewKecamatan(e.target.value)}
                        placeholder="Contoh: SUKOREJO"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white uppercase font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                        Kabupaten / Kota
                      </label>
                      <input
                        type="text"
                        value={newKabupaten}
                        onChange={(e) => setNewKabupaten(e.target.value)}
                        placeholder="Contoh: PASURUAN"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white uppercase font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                        Nama Kepala Desa / Lurah
                      </label>
                      <input
                        type="text"
                        value={newNamaKades}
                        onChange={(e) => setNewNamaKades(e.target.value)}
                        placeholder="Penandatangan BA & BAPT"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                        Target Jumlah Span
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newTargetSpan}
                        onChange={(e) => setNewTargetSpan(e.target.value)}
                        placeholder="Contoh: 4"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                        Estimasi Jumlah Bidang Awal (Pra-Akuisisi)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newEstimasiBidang}
                        onChange={(e) => setNewEstimasiBidang(e.target.value)}
                        placeholder="Contoh: 35"
                        className="w-full px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setIsAddingDesaModal(false)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg cursor-pointer"
                    >
                      Tambahkan Desa ke Resume
                    </button>
                  </div>
                </form>
              )}
            </div>
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
                    Atur Tahapan Resume Proyek
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
                  Pilih tahapan yang aktif untuk jalur proyek ini. Tahapan yang dinonaktifkan tidak dihitung dalam persentase progres desa. <strong>Tahap 4 (Inventarisasi & Nominatif)</strong> dihitung otomatis dari persentase berkas selesai di Database.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Pilihan Cepat (Presets Tahapan):
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setTempStages(DEFAULT_RESUME_STAGES.map(s => ({ ...s, active: true })));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-200 transition-all cursor-pointer"
                  >
                    Semua Tahapan Lengkap (10 Tahap)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempStages(DEFAULT_RESUME_STAGES.map(s => ({
                        ...s,
                        active: ['pendataanAwal', 'baSosialisasiAwal', 'surveiPemetaan', 'inventarisasiNominatif', 'baPengumuman', 'lampiranBapt', 'registrasiBapt'].includes(s.key)
                      })));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Sampai Registrasi BAPT (Tahap 1–7)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempStages(DEFAULT_RESUME_STAGES.map(s => ({
                        ...s,
                        active: ['baSosialisasiAwal', 'baPengumuman', 'lampiranBapt', 'baPenyampaianNilai', 'baSerahTerimaRekening', 'bushClearing'].includes(s.key)
                      })));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Ringkas Berita Acara & Pembayaran (6 Tahap)
                  </button>
                </div>
              </div>

              {/* Stage Items List */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Daftar Tahapan ({tempStages.filter(s => s.active !== false).length} Aktif dari {tempStages.length}):
                </span>
                <div className="space-y-2">
                  {tempStages.map((stage) => {
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
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-white/20 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-extrabold text-white">
                                {stage.label}
                              </span>
                              <span className="text-xs text-slate-300 font-medium">
                                ({stage.fullName})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400 flex-wrap">
                              {stage.key === 'inventarisasiNominatif' ? (
                                <span className="bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                  Otomatis dari Database (Berkas Selesai per Bidang)
                                </span>
                              ) : (
                                <>
                                  {stage.hasPdf && (
                                    <span className="bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                      Dokumen PDF
                                    </span>
                                  )}
                                  {stage.hasPhoto && (
                                    <span className="bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded font-bold">
                                      Foto Dokumentasi
                                    </span>
                                  )}
                                </>
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


      {/* Panduan Publikasi Google Sheets ke Web (CSV) Modal */}
      <CsvPublishGuideModal 
        isOpen={isCsvGuideModalOpen} 
        onClose={() => setIsCsvGuideModalOpen(false)} 
        activeSpreadsheetId={spreadsheetId} 
      />
    </div>
  );
}
