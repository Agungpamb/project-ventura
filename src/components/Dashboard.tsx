import React, { useMemo, useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, FileText, CheckCircle2, Clock, AlertCircle, Map as MapIcon, Home, Sprout,
  ShieldCheck, FolderCheck, CloudUpload, MapPin, Search, X, FileDown, Filter, FileSpreadsheet,
  CheckSquare, Square, Download, ChevronRight, Layers, Mail, Settings, RefreshCw, Eye, Check,
  Calendar, Building2, Briefcase, ChevronDown, Sparkles, Printer, UserCheck, Award, FileCheck,
  AlignLeft, Compass, Info
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { DANANTARA_BASE64, IDSURVEY_BASE64, SURVEYOR_BASE64 } from '../lib/embeddedLogos';
import type { LandRecord, ProjectConfig, VillageResume, AgencyLetter } from '../types';
import { 
  generateIntegratedReportPDF, 
  type ExportReportOptions 
} from '../lib/integratedReportGenerator';
import { 
  loadVillageResumes, 
  loadAgencyLetters, 
  generateJalurWorkbookExcel, 
  createDefaultVillageResume 
} from '../lib/projectResumeStorage';
import { 
  fetchResumesFromPublicCsv, 
  fetchAgencyLettersFromPublicCsv, 
  fetchResumesFromGoogleSheet, 
  fetchAgencyLettersFromGoogleSheet 
} from '../lib/googleApi';

export type AlasHakCategoryKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface AlasHakCategoryItem {
  code: string;
  key: AlasHakCategoryKey;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

const CATEGORY_CONFIG: { [key in AlasHakCategoryKey]: { code: string; label: string; color: string } } = {
  A: { code: 'A', label: 'SERTIPIKAT HAK MILIK', color: '#10B981' }, // Emerald
  B: { code: 'B', label: 'SERTIPIKAT HAK GUNA BANGUNAN', color: '#3B82F6' }, // Blue
  C: { code: 'C', label: 'SERTIPIKAT HAK GUNA USAHA', color: '#06B6D4' }, // Cyan
  D: { code: 'D', label: 'SERTIPIKAT HAK PAKAI', color: '#F59E0B' }, // Amber
  E: { code: 'E', label: 'SERTIPIKAT HAK WAKAF', color: '#8B5CF6' }, // Purple
  F: { code: 'F', label: 'LETTER C', color: '#F97316' }, // Orange
  G: { code: 'G', label: 'SEPORADIK', color: '#14B8A6' }, // Teal
  H: { code: 'H', label: 'SURAT KETERANGAN DINAS TERKAIT', color: '#EC4899' }, // Pink
  I: { code: 'I', label: 'KOSONG / BELUM ADA ISINYA', color: '#64748B' }, // Slate
};

function classifyAlasHakRecord(rawVal: string | null | undefined): AlasHakCategoryKey {
  if (!rawVal) return 'I';
  const val = String(rawVal).trim().toUpperCase();
  if (
    !val || 
    val === '0' || 
    val === '-' || 
    val === 'NULL' || 
    val === 'UNDEFINED' || 
    val === 'KOSONG' ||
    val === 'BELUM ADA ISINYA' ||
    val === 'BELUM'
  ) {
    return 'I';
  }

  // A. SERTIPIKAT HAK MILIK
  if (
    val.includes('MILIK') ||
    val.includes('SHM') ||
    val === 'SERTIPIKAT HAK MILIK' ||
    val === 'SERTIFIKAT HAK MILIK'
  ) {
    return 'A';
  }

  // B. SERTIPIKAT HAK GUNA BANGUNAN
  if (
    val.includes('BANGUNAN') ||
    val.includes('HGB') ||
    val.includes('SHGB') ||
    val === 'SERTIPIKAT HAK GUNA BANGUNAN' ||
    val === 'SERTIFIKAT HAK GUNA BANGUNAN'
  ) {
    return 'B';
  }

  // C. SERTIPIKAT HAK GUNA USAHA
  if (
    val.includes('GUNA USAHA') ||
    val.includes('HGU') ||
    val.includes('SHGU') ||
    val === 'SERTIPIKAT HAK GUNA USAHA' ||
    val === 'SERTIFIKAT HAK GUNA USAHA'
  ) {
    return 'C';
  }

  // D. SERTIPIKAT HAK PAKAI
  if (
    val.includes('PAKAI') ||
    val.includes('SHP') ||
    val === 'SERTIPIKAT HAK PAKAI' ||
    val === 'SERTIFIKAT HAK PAKAI'
  ) {
    return 'D';
  }

  // E. SERTIPIKAT HAK WAKAF
  if (
    val.includes('WAKAF') ||
    val === 'SERTIPIKAT HAK WAKAF' ||
    val === 'SERTIFIKAT HAK WAKAF'
  ) {
    return 'E';
  }

  // F. LETTER C
  if (
    val.includes('LETTER') ||
    val.includes('PETUK C') ||
    val.includes('GIRIK') ||
    val === 'C' ||
    val === 'LETTER C'
  ) {
    return 'F';
  }

  // G. SEPORADIK
  if (
    val.includes('SPORADIK') ||
    val.includes('SEPORADIK')
  ) {
    return 'G';
  }

  // H. SURAT KETERANGAN DINAS TERKAIT
  return 'H';
}

interface DashboardProps {
  records: LandRecord[];
  role?: string | null;
  activeProjectId?: string;
  activeProject?: ProjectConfig;
  activeProjectName?: string;
  hideZeroLuas?: boolean;
  onNavigateToNominatif?: () => void;
  isLiveConnected?: boolean;
  onForceSyncMaster?: () => void;
  onRefreshGoogleToken?: () => void;
  isSyncingMaster?: boolean;
  accessToken?: string;
  spreadsheetId?: string;
  resumeSpreadsheetId?: string;
  resumePublicCsvUrl?: string;
  agencyLetterSpreadsheetId?: string;
  agencyLetterPublicCsvUrl?: string;
}

export default function Dashboard({ 
  records, 
  role, 
  activeProjectId,
  activeProject,
  activeProjectName, 
  hideZeroLuas = false, 
  onNavigateToNominatif,
  isLiveConnected = false,
  onForceSyncMaster,
  onRefreshGoogleToken,
  isSyncingMaster = false,
  accessToken,
  spreadsheetId,
  resumeSpreadsheetId,
  resumePublicCsvUrl,
  agencyLetterSpreadsheetId,
  agencyLetterPublicCsvUrl
}: DashboardProps) {
  // Dashboard Local Filters State (Desa & Span)
  const [selectedDesa, setSelectedDesa] = useState<string>('ALL');
  const [selectedSpan, setSelectedSpan] = useState<string>('ALL');

  // Integrated Report Data State: Resume Project & Surat Instansi
  const [villageResumes, setVillageResumes] = useState<VillageResume[]>([]);
  const [agencyLetters, setAgencyLetters] = useState<AgencyLetter[]>([]);
  const [isLoadingExtraData, setIsLoadingExtraData] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Modular export toggles (defaults to all active so complete report is generated)
  const [exportIncludeLahan, setExportIncludeLahan] = useState<boolean>(true);
  const [exportIncludeResume, setExportIncludeResume] = useState<boolean>(true);
  const [exportIncludeSurat, setExportIncludeSurat] = useState<boolean>(true);

  // Professional customization options (Style, Orientation, Signatures)
  const [exportReportStyle, setExportReportStyle] = useState<'BUMN_OFFICIAL' | 'MODERN_EXECUTIVE'>('BUMN_OFFICIAL');
  const [exportOrientation, setExportOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [exportIncludeSignatures, setExportIncludeSignatures] = useState<boolean>(true);
  const [exportSignCity, setExportSignCity] = useState<string>('Semarang');
  const [exportSignOfficer, setExportSignOfficer] = useState<string>('Tim Pengadaan Tanah & ROW');
  const [exportSignOfficerTitle, setExportSignOfficerTitle] = useState<string>('Koordinator Pelaksana Lapangan');
  const [exportSignApprover, setExportSignApprover] = useState<string>('Darmawan Dwi Sanjaya');
  const [exportSignApproverTitle, setExportSignApproverTitle] = useState<string>('Project Manager / Team Leader');
  const [exportModalTab, setExportModalTab] = useState<'MODULES' | 'FORMAT' | 'PREVIEW'>('MODULES');
  const [exportFeedbackMessage, setExportFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Extra Report Data (Resume Proyek 6 Tahapan & Surat Instansi)
  useEffect(() => {
    let isMounted = true;
    async function loadExtraReportData() {
      if (!activeProjectId) return;
      setIsLoadingExtraData(true);
      try {
        // 1. Load Village Resumes
        let resumes: VillageResume[] = [];
        if (resumePublicCsvUrl) {
          try {
            resumes = await fetchResumesFromPublicCsv(resumePublicCsvUrl, activeProjectId);
          } catch (e) {
            console.warn("Fallback public CSV resumes failed", e);
          }
        }
        if (resumes.length === 0 && resumeSpreadsheetId && accessToken && accessToken !== 'GUEST_BYPASS') {
          try {
            resumes = await fetchResumesFromGoogleSheet(accessToken, resumeSpreadsheetId, activeProjectId);
          } catch (e) {
            console.warn("Fallback google sheet resumes failed", e);
          }
        }
        if (resumes.length === 0) {
          resumes = await loadVillageResumes(activeProjectId, {
            accessToken,
            spreadsheetId: resumeSpreadsheetId || spreadsheetId
          });
        }
        if (isMounted) setVillageResumes(resumes);

        // 2. Load Agency Letters
        let letters: AgencyLetter[] = [];
        if (agencyLetterPublicCsvUrl) {
          try {
            letters = await fetchAgencyLettersFromPublicCsv(agencyLetterPublicCsvUrl, activeProjectId);
          } catch (e) {
            console.warn("Fallback public CSV letters failed", e);
          }
        }
        if (letters.length === 0 && agencyLetterSpreadsheetId && accessToken && accessToken !== 'GUEST_BYPASS') {
          try {
            letters = await fetchAgencyLettersFromGoogleSheet(accessToken, agencyLetterSpreadsheetId, activeProjectId);
          } catch (e) {
            console.warn("Fallback google sheet letters failed", e);
          }
        }
        if (letters.length === 0) {
          letters = await loadAgencyLetters(activeProjectId);
        }
        if (isMounted) setAgencyLetters(letters);
      } catch (err) {
        console.warn("Gagal memuat data resume atau surat instansi untuk laporan:", err);
      } finally {
        if (isMounted) setIsLoadingExtraData(false);
      }
    }

    loadExtraReportData();
    return () => { isMounted = false; };
  }, [activeProjectId, resumePublicCsvUrl, resumeSpreadsheetId, agencyLetterPublicCsvUrl, agencyLetterSpreadsheetId, accessToken, spreadsheetId]);

  // Combined Village Resumes ensuring every village in records is represented
  const combinedVillageResumes = useMemo(() => {
    const recVillages = Array.from(new Set(records.map(r => (r.DESA || '').trim()).filter(Boolean)));
    const map = new Map<string, VillageResume>();

    villageResumes.forEach(vr => {
      if (vr.desaName) {
        map.set(vr.desaName.trim().toUpperCase(), vr);
      }
    });

    recVillages.forEach(vName => {
      const key = vName.toUpperCase();
      if (!map.has(key)) {
        const dummy = createDefaultVillageResume(activeProjectId || 'default', vName);
        map.set(key, dummy);
      }
    });

    return (Array.from(map.values()) as VillageResume[]).sort((a, b) => a.desaName.localeCompare(b.desaName, 'id'));
  }, [villageResumes, records, activeProjectId]);

  // Summary statistics for Resume Proyek
  const resumeSummary = useMemo(() => {
    const totalDesa = combinedVillageResumes.length;
    let tuntasDesa = 0;
    let prosesDesa = 0;
    let belumDesa = 0;
    let totalPct = 0;

    combinedVillageResumes.forEach(vr => {
      const stages = [
        vr.baSosialisasiAwal?.status,
        vr.baPengumuman?.status,
        vr.lampiranBapt?.status,
        vr.baPenyampaianNilai?.status,
        vr.baSerahTerimaRekening?.status,
        vr.bushClearing?.status,
      ];
      let pts = 0;
      stages.forEach(st => {
        if (st === 'SELESAI') pts += 100 / 6;
        else if (st === 'PROSES') pts += 50 / 6;
      });
      const pct = Math.min(100, Math.round(pts));
      totalPct += pct;
      if (pct === 100) tuntasDesa++;
      else if (pct > 0) prosesDesa++;
      else belumDesa++;
    });

    const avgProgress = totalDesa > 0 ? Math.round(totalPct / totalDesa) : 0;
    return { totalDesa, tuntasDesa, prosesDesa, belumDesa, avgProgress };
  }, [combinedVillageResumes]);

  // Summary statistics for Surat Instansi
  const suratSummary = useMemo(() => {
    const total = agencyLetters.length;
    const selesai = agencyLetters.filter(l => l.status === 'SELESAI').length;
    const tindakLanjut = agencyLetters.filter(l => l.status === 'TINDAK_LANJUT').length;
    const onProgress = agencyLetters.filter(l => l.status === 'ON_PROGRESS' || l.status === 'SUDAH_MASUK').length;
    return { total, selesai, tindakLanjut, onProgress };
  }, [agencyLetters]);

  // Unique list of villages for filter dropdown
  const uniqueDesaList = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.DESA && r.DESA.trim()) set.add(r.DESA.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [records]);

  // Unique list of spans for filter dropdown
  const uniqueSpanList = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.SPAN && r.SPAN.trim()) set.add(r.SPAN.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [records]);

  // Active records after applying Dashboard Filters (including global hideZeroLuas setting)
  const activeFilteredRecords = useMemo(() => {
    return records.filter(r => {
      if (hideZeroLuas) {
        const luasVal = parseFloat(r.LUAS);
        if (!r.LUAS || isNaN(luasVal) || luasVal <= 0 || r.LUAS.trim() === '0' || r.LUAS.trim() === '') {
          return false;
        }
      }
      if (selectedDesa !== 'ALL' && (r.DESA || 'Belum Diisi').trim() !== selectedDesa) {
        return false;
      }
      if (selectedSpan !== 'ALL' && (r.SPAN || 'Lainnya').trim() !== selectedSpan) {
        return false;
      }
      return true;
    });
  }, [records, hideZeroLuas, selectedDesa, selectedSpan]);

  // Statistics and Calculations based on activeFilteredRecords
  const stats = useMemo(() => {
    const total = activeFilteredRecords.length;
    const approved = activeFilteredRecords.filter(r => r.QC_STATUS === 'APPROVED').length;
    const pending = activeFilteredRecords.filter(r => r.QC_STATUS === 'PENDING' || !r.QC_STATUS).length;
    const rejected = activeFilteredRecords.filter(r => r.QC_STATUS === 'REJECTED').length;

    // Calculate total area (LUAS)
    const totalLuas = activeFilteredRecords.reduce((sum, r) => {
      const val = parseFloat(r.LUAS) || 0;
      return sum + val;
    }, 0);

    // Document completion rates
    const docsKtp = activeFilteredRecords.filter(r => r.LINK_KTP).length;
    const docsKk = activeFilteredRecords.filter(r => r.LINK_KK).length;
    const docsAlas = activeFilteredRecords.filter(r => r.LINK_ALAS_HAK).length;
    const docsPeralihan = activeFilteredRecords.filter(r => 
      r.LINK_PERALIHAN_HAK ||
      r.LINK_JUAL_BELI ||
      r.LINK_KETERANGAN_WARIS ||
      r.LINK_KUASA_WARIS ||
      r.LINK_SURAT_KUASA ||
      r.LINK_KET_BEDA_NAMA ||
      r.LINK_WAKAF ||
      r.LINK_KLAIM_TANAMAN ||
      r.LINK_KLAIM_BANGUNAN ||
      r.LINK_DOKUMEN_LAIN
    ).length;

    // Buildings stats
    let totalBuildings = 0;
    activeFilteredRecords.forEach(r => {
      r.buildings?.forEach(b => {
        if (b.luas || b.bentuk || b.jenis) {
          totalBuildings++;
        }
      });
    });

    // Plants stats
    let totalPlantsCount = 0;
    activeFilteredRecords.forEach(r => {
      r.plants?.forEach(p => {
        if (p.jenis) {
          const m1 = parseInt(p.sudah_menghasilkan) || 0;
          const m2 = parseInt(p.belum_menghasilkan) || 0;
          totalPlantsCount += (m1 + m2);
        }
      });
    });

    // Primary project progress stats
    const pemberkasanSelesai = activeFilteredRecords.filter(r => r.PROGRES_PEMBERKASAN === 'SELESAI').length;
    const pemberkasanKonsinyasi = activeFilteredRecords.filter(r => r.PROGRES_PEMBERKASAN === 'KONSINYASI').length;
    const pemberkasanBelumSelesai = total - pemberkasanSelesai - pemberkasanKonsinyasi;
    
    const trabasSudah = activeFilteredRecords.filter(r => r.PROGRES_UPLOAD_TRABAS === 'SUDAH').length;
    const trabasBelum = total - trabasSudah;

    return {
      total,
      approved,
      pending,
      rejected,
      totalLuas,
      docsKtp,
      docsKk,
      docsAlas,
      docsPeralihan,
      totalBuildings,
      totalPlantsCount,
      pemberkasanSelesai,
      pemberkasanKonsinyasi,
      pemberkasanBelumSelesai,
      trabasSudah,
      trabasBelum
    };
  }, [activeFilteredRecords]);

  // JENIS ALAS HAK Distribution (9 Categories: A - I)
  const alasHakAnalysis = useMemo(() => {
    const counts: { [key in AlasHakCategoryKey]: number } = {
      A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0
    };

    activeFilteredRecords.forEach(r => {
      const cat = classifyAlasHakRecord(r.JENIS_ALAS_HAK);
      counts[cat] += 1;
    });

    const totalAnalyzed = activeFilteredRecords.length;

    const items: AlasHakCategoryItem[] = (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as AlasHakCategoryKey[]).map(key => {
      const count = counts[key];
      const percentage = totalAnalyzed > 0 ? Math.round((count / totalAnalyzed) * 1000) / 10 : 0;
      return {
        code: key,
        key,
        label: CATEGORY_CONFIG[key].label,
        count,
        percentage,
        color: CATEGORY_CONFIG[key].color
      };
    });

    // Pie chart data
    const pieChartData = items.filter(item => item.count > 0).map(item => ({
      name: `${item.code}. ${item.label}`,
      code: item.code,
      shortLabel: item.label,
      value: item.count,
      percentage: item.percentage,
      color: item.color
    }));

    let dominant = items.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), items[0]);

    const totalFilled = totalAnalyzed - counts.I;
    const percentageFilled = totalAnalyzed > 0 ? Math.round((totalFilled / totalAnalyzed) * 100) : 0;

    return {
      totalAnalyzed,
      totalFilled,
      percentageFilled,
      counts,
      items,
      pieChartData,
      dominant
    };
  }, [activeFilteredRecords]);

  const [selectedCategory, setSelectedCategory] = useState<'SELESAI' | 'KONSINYASI' | 'BELUM' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecordsByCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return activeFilteredRecords.filter(r => {
      if (selectedCategory === 'SELESAI') {
        return r.PROGRES_PEMBERKASAN === 'SELESAI';
      } else if (selectedCategory === 'KONSINYASI') {
        return r.PROGRES_PEMBERKASAN === 'KONSINYASI';
      } else { // 'BELUM'
        return r.PROGRES_PEMBERKASAN !== 'SELESAI' && r.PROGRES_PEMBERKASAN !== 'KONSINYASI';
      }
    });
  }, [activeFilteredRecords, selectedCategory]);

  const searchedRecords = useMemo(() => {
    if (!searchQuery.trim()) return filteredRecordsByCategory;
    const q = searchQuery.toLowerCase();
    return filteredRecordsByCategory.filter(r => {
      return (
        (r.DESA || '').toLowerCase().includes(q) ||
        (r.SPAN || '').toLowerCase().includes(q) ||
        (r.NOBID || '').toLowerCase().includes(q) ||
        (r.NAMA || '').toLowerCase().includes(q) ||
        (r.JENIS_ALAS_HAK || '').toLowerCase().includes(q) ||
        (r.KETERANGAN || '').toLowerCase().includes(q)
      );
    });
  }, [filteredRecordsByCategory, searchQuery]);

  // Chart data: Distribution by DESA
  const desaChartData = useMemo(() => {
    const counts: { [key: string]: { count: number; luas: number } } = {};
    activeFilteredRecords.forEach(r => {
      const d = r.DESA || 'Belum Diisi';
      const l = parseFloat(r.LUAS) || 0;
      if (!counts[d]) {
        counts[d] = { count: 0, luas: 0 };
      }
      counts[d].count += 1;
      counts[d].luas += l;
    });

    return Object.keys(counts).map(name => ({
      name,
      Jumlah: counts[name].count,
      'Luas (m²)': Math.round(counts[name].luas * 100) / 100
    }));
  }, [activeFilteredRecords]);

  // Unified progress data by DESA (Sorted by percentage completed descending)
  const desaProgressData = useMemo(() => {
    const desaGroups: { 
      [key: string]: { 
        total: number; 
        selesai: number; 
        konsinyasi: number; 
        belum: number; 
        trabasSudah: number; 
        trabasBelum: number; 
      } 
    } = {};

    activeFilteredRecords.forEach(r => {
      const d = r.DESA || 'Belum Diisi';
      if (!desaGroups[d]) {
        desaGroups[d] = { total: 0, selesai: 0, konsinyasi: 0, belum: 0, trabasSudah: 0, trabasBelum: 0 };
      }
      desaGroups[d].total += 1;
      
      // Pemberkasan progress
      if (r.PROGRES_PEMBERKASAN === 'SELESAI') {
        desaGroups[d].selesai += 1;
      } else if (r.PROGRES_PEMBERKASAN === 'KONSINYASI') {
        desaGroups[d].konsinyasi += 1;
      } else {
        desaGroups[d].belum += 1;
      }

      // TRABAS progress
      if (r.PROGRES_UPLOAD_TRABAS === 'SUDAH') {
        desaGroups[d].trabasSudah += 1;
      } else {
        desaGroups[d].trabasBelum += 1;
      }
    });

    const list = Object.keys(desaGroups).map(name => {
      const g = desaGroups[name];
      const selesaiPct = g.total > 0 ? (g.selesai / g.total) * 100 : 0;
      return {
        name,
        total: g.total,
        selesai: g.selesai,
        konsinyasi: g.konsinyasi,
        belum: g.belum,
        trabasSudah: g.trabasSudah,
        trabasBelum: g.trabasBelum,
        selesaiPct
      };
    });

    // Sort by completion percentage (highest percentage first)
    return list.sort((a, b) => {
      if (b.selesaiPct !== a.selesaiPct) {
        return b.selesaiPct - a.selesaiPct;
      }
      if (b.selesai !== a.selesai) {
        return b.selesai - a.selesai;
      }
      return a.name.localeCompare(b.name, 'id');
    });
  }, [activeFilteredRecords]);

  // Chart data: Land Cover (Penutup Lahan)
  const penutupLahanChartData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    activeFilteredRecords.forEach(r => {
      const p = r.PENUTUP_LAHAN || 'LAINNYA';
      counts[p] = (counts[p] || 0) + 1;
    });

    const colors = [
      '#10B981', '#3B82F6', '#F59E0B', '#EF4444', 
      '#8B5CF6', '#EC4899', '#6B7280', '#14B8A6', '#F43F5E'
    ];

    return Object.keys(counts).map((name, index) => ({
      name,
      value: counts[name],
      color: colors[index % colors.length]
    }));
  }, [activeFilteredRecords]);

  // Chart data: Document status
  const documentStats = useMemo(() => {
    const total = activeFilteredRecords.length || 1; // avoid division by zero
    return [
      { name: 'KTP', Persentase: Math.round((stats.docsKtp / total) * 100) },
      { name: 'KK', Persentase: Math.round((stats.docsKk / total) * 100) },
      { name: 'Alas Hak', Persentase: Math.round((stats.docsAlas / total) * 100) },
      { name: 'Peralihan Hak', Persentase: Math.round((stats.docsPeralihan / total) * 100) },
    ];
  }, [activeFilteredRecords, stats]);

  const handleExportPDF = async (customOptions?: ExportReportOptions) => {
    setIsExportingPdf(true);
    setExportFeedbackMessage(null);
    try {
      const options: ExportReportOptions = {
        includeLahan: customOptions?.includeLahan !== undefined ? customOptions.includeLahan : exportIncludeLahan,
        includeResume: customOptions?.includeResume !== undefined ? customOptions.includeResume : exportIncludeResume,
        includeSurat: customOptions?.includeSurat !== undefined ? customOptions.includeSurat : exportIncludeSurat,
        reportStyle: customOptions?.reportStyle || exportReportStyle,
        orientation: customOptions?.orientation || exportOrientation,
      };

      const doc = await generateIntegratedReportPDF({
        activeProjectName,
        records: activeFilteredRecords,
        stats,
        combinedVillageResumes,
        resumeSummary,
        agencyLetters,
        suratSummary,
        alasHakAnalysis,
        desaProgressData,
        options,
      });

      const today = new Date();
      const cleanFileName = (activeProjectName || 'Project_Ventura').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const prefix = (options.includeResume && options.includeSurat) ? 'Laporan_Terpadu' : 'Laporan_Progres';
      const orientationSuffix = options.orientation === 'landscape' ? '_landscape' : '_portrait';
      doc.save(`${prefix}_${cleanFileName}_${today.toISOString().split('T')[0]}${orientationSuffix}.pdf`);

      setExportFeedbackMessage({
        type: 'success',
        text: 'Laporan PDF Eksekutif berhasil diunduh!'
      });
    } catch (err: any) {
      console.error("Gagal mengekspor PDF:", err);
      setExportFeedbackMessage({
        type: 'error',
        text: 'Gagal membuat berkas PDF: ' + (err?.message || 'Format tidak sesuai')
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Handler for Excel Workbook 3-in-1 Export
  const handleExportExcel = () => {
    setIsExportingExcel(true);
    setExportFeedbackMessage(null);
    try {
      const projectConfig: ProjectConfig = activeProject || {
        id: activeProjectId || 'proj_default',
        name: activeProjectName || 'Project Ventura',
        spreadsheetId: spreadsheetId || '',
        folderId: '',
        uploadsFolderId: '',
        resumeSpreadsheetId,
        agencyLetterSpreadsheetId,
      };
      generateJalurWorkbookExcel(projectConfig, combinedVillageResumes, records, agencyLetters);
      setExportFeedbackMessage({
        type: 'success',
        text: 'Master Excel Workbook 3-Sheet berhasil diunduh!'
      });
    } catch (err: any) {
      console.error("Gagal mengekspor Excel Workbook:", err);
      setExportFeedbackMessage({
        type: 'error',
        text: 'Gagal membuat berkas Excel: ' + (err?.message || 'Format tidak sesuai')
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-8" id="sip_dashboard">
      {/* Upper Welcome and Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Ringkasan Data Pertanahan Desa</h1>
          <p className="text-slate-300 text-sm mt-1">
            {role === 'GUEST' 
              ? 'Pantau progres berkas pertanahan, luas bidang tanah, bangunan, dan tanaman secara real-time.'
              : 'Pantau progres berkas pertanahan, luas bidang tanah, bangunan, tanaman, dan hasil verifikasi QC.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-start md:self-center">
          {onNavigateToNominatif && (
            <button
              onClick={onNavigateToNominatif}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              title="Buka Daftar Nominatif Resmi Tanah, Bangunan & Tanaman"
            >
              <FileSpreadsheet className="w-4 h-4" />
              DAFTAR NOMINATIF
            </button>
          )}
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-[11px] rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            title="Ekspor Laporan Terpadu (PDF & Excel: Lahan, Resume Proyek & Surat Instansi)"
          >
            <FileDown className="w-4 h-4" />
            <span>EKSPOR LAPORAN</span>
            <span className="px-1.5 py-0.5 text-[9px] bg-slate-950/80 text-amber-300 rounded font-semibold ml-0.5">TERPADU</span>
          </button>
          {isLiveConnected ? (
            <button
              type="button"
              onClick={onForceSyncMaster}
              disabled={isSyncingMaster}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-500/20 shadow-inner hover:bg-emerald-500/20 transition-all cursor-pointer"
              title="Terhubung Live ke Google Sheets. Klik untuk sinkronkan ulang."
            >
              <span className={`w-2 h-2 rounded-full bg-emerald-400 ${isSyncingMaster ? 'animate-ping' : 'animate-pulse'}`}></span>
              <span>{isSyncingMaster ? 'Menyinkronkan...' : 'Terhubung Google Sheets (Live)'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRefreshGoogleToken || onForceSyncMaster}
              disabled={isSyncingMaster}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-300 text-xs font-bold rounded-full border border-amber-500/30 shadow-inner hover:bg-amber-500/25 transition-all cursor-pointer"
              title="Token Google kedaluwarsa atau mode cache. Klik untuk memperbarui sesi Google & hubungkan live ke Google Sheets"
            >
              <span className={`w-2 h-2 rounded-full bg-amber-400 ${isSyncingMaster ? 'animate-ping' : 'animate-pulse'}`}></span>
              <span>{isSyncingMaster ? 'Menghubungkan...' : 'Mode Cadangan (Klik Hubungkan Live)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* FILTER CONTROL BAR */}
      <div className="glass-card p-4 rounded-2xl border border-white/10 shadow-lg space-y-3 bg-slate-900/60 backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Filter Dashboard:</span>
            <span className="text-[11px] text-slate-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-mono">
              Menampilkan {activeFilteredRecords.length} Bidang
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Select Desa Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Desa:</label>
              <select
                value={selectedDesa}
                onChange={(e) => setSelectedDesa(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
              >
                <option value="ALL">Semua Desa ({uniqueDesaList.length})</option>
                {uniqueDesaList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Select Span Filter */}
            {uniqueSpanList.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-slate-400 font-medium">SPAN:</label>
                <select
                  value={selectedSpan}
                  onChange={(e) => setSelectedSpan(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                >
                  <option value="ALL">Semua SPAN</option>
                  {uniqueSpanList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Reset button */}
            {(selectedDesa !== 'ALL' || selectedSpan !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDesa('ALL');
                  setSelectedSpan('ALL');
                }}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold px-2 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Reset Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${role === 'GUEST' ? '' : 'lg:grid-cols-4'} gap-5`}>
        <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
          <div className="p-3.5 rounded-xl bg-white/5 text-slate-300 border border-white/10 shadow-inner">
            <MapIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Bidang</p>
            <h3 className="text-2xl font-bold text-white font-sans mt-0.5">{stats.total}</h3>
            <p className="text-slate-400 text-xs mt-0.5">Lahan terdaftar</p>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
          <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-inner">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Luas Bidang</p>
            <h3 className="text-2xl font-bold text-white font-sans mt-0.5">
              {stats.totalLuas.toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-400">m²</span>
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">Total luas keseluruhan</p>
          </div>
        </div>

        {role !== 'GUEST' && (
          <>
            <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Lolos QC (Approved)</p>
                <h3 className="text-2xl font-bold text-white font-sans mt-0.5">{stats.approved}</h3>
                <p className="text-emerald-400 text-xs font-semibold mt-0.5">
                  {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}% Terverifikasi
                </p>
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:border-white/15 hover:scale-[1.02] transition-all duration-300">
              <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Menunggu QC (Pending)</p>
                <h3 className="text-2xl font-bold text-white font-sans mt-0.5">{stats.pending}</h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {stats.rejected} Bidang ditolak (Reject)
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SECTION: JENIS ALAS HAK CLASSIFICATION (PIE CHART & RESUME DATA) */}
      <div className="glass-card p-6 rounded-2xl shadow-xl space-y-5 border border-amber-500/20 bg-slate-900/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              Klasifikasi Jenis Alas Hak (Bukti Kepemilikan Lahan)
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Statistik distribusi 9 kategori bukti kepemilikan/kepenguasaan tanah ({alasHakAnalysis.totalAnalyzed} bidang dianalisis).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Pie Chart (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950/60 p-5 rounded-2xl border border-white/5 space-y-3 flex flex-col items-center justify-center min-h-[320px]">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider text-center w-full border-b border-white/5 pb-2">
              Diagram Pie Kategori Alas Hak
            </h3>
            {alasHakAnalysis.pieChartData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-slate-500 text-xs italic">
                Tidak ada data bidang untuk ditampilkan
              </div>
            ) : (
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={alasHakAnalysis.pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {alasHakAnalysis.pieChartData.map((entry) => (
                        <Cell key={`cell-${entry.code}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl text-xs text-white space-y-1">
                              <p className="font-bold text-amber-300">{data.name}</p>
                              <p className="text-slate-200">
                                Jumlah: <strong className="text-emerald-400">{data.value} Bidang</strong>
                              </p>
                              <p className="text-slate-400 text-[11px]">
                                Persentase: {data.percentage}% dari total
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2 pt-2 text-[10px]">
              {alasHakAnalysis.pieChartData.map(item => (
                <span key={item.code} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-slate-300 font-mono">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  {item.code}: {item.value} ({item.percentage}%)
                </span>
              ))}
            </div>
          </div>

          {/* Right Column: Resume & Detailed Breakdown (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* KPI Cards Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-white/5 space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Dianalisis</p>
                <p className="text-xl font-extrabold text-white font-mono">{alasHakAnalysis.totalAnalyzed} <span className="text-xs text-slate-400 font-normal">Bidang</span></p>
              </div>
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-white/5 space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Terisi Alas Hak</p>
                <p className="text-xl font-extrabold text-emerald-400 font-mono">{alasHakAnalysis.totalFilled} <span className="text-xs text-slate-400 font-normal">({alasHakAnalysis.percentageFilled}%)</span></p>
              </div>
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-white/5 space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Kategori Dominan</p>
                <p className="text-xs font-bold text-amber-300 truncate" title={alasHakAnalysis.dominant.label}>
                  {alasHakAnalysis.dominant.code}. {alasHakAnalysis.dominant.label}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">{alasHakAnalysis.dominant.count} bidang ({alasHakAnalysis.dominant.percentage}%)</p>
              </div>
            </div>

            {/* List A-I Categories */}
            <div className="bg-slate-950/60 rounded-xl border border-white/5 p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-white/5 pb-2">
                Resume Rincian 9 Kategori Alas Hak (A - I)
              </h4>
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {alasHakAnalysis.items.map((item) => {
                  const barWidth = `${item.percentage}%`;
                  return (
                    <div key={item.code} className="p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span 
                            className="w-5 h-5 rounded-lg text-[10px] font-bold text-white flex items-center justify-center shrink-0 font-mono shadow-sm"
                            style={{ backgroundColor: item.color }}
                          >
                            {item.code}
                          </span>
                          <span className="font-semibold text-slate-200 truncate" title={item.label}>
                            {item.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                          <span className="font-extrabold text-white">{item.count} <span className="text-[9px] font-normal text-slate-400">bidang</span></span>
                          <span className="text-amber-300 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{item.percentage}%</span>
                        </div>
                      </div>
                      {/* Visual mini bar */}
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ width: barWidth, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION A: PROGRES PEMBERKASAN LAPANGAN */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FolderCheck className="w-5 h-5 text-emerald-400" />
              Seksi Pemberkasan Lapangan & Administrasi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Ringkasan status pengumpulan, verifikasi berkas klaim, dan pendaftaran konsinyasi.</p>
          </div>
          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-semibold">
            Status: Aktif Lapangan
          </span>
        </div>

        {/* 3-Column Stats Card for Pemberkasan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Selesai Card */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedCategory(prev => prev === 'SELESAI' ? null : 'SELESAI');
              setSearchQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSelectedCategory(prev => prev === 'SELESAI' ? null : 'SELESAI');
                setSearchQuery('');
              }
            }}
            className={`glass-card p-5 rounded-2xl shadow-lg border flex flex-col justify-between hover:border-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer ${
              selectedCategory === 'SELESAI' ? 'ring-2 ring-emerald-500 bg-emerald-500/10 border-emerald-500/50' : 'border-white/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Berkas Selesai</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-emerald-400 font-medium">Selesai Berkas</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.pemberkasanSelesai} dari {stats.total} bidang tanah
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.pemberkasanSelesai / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
            {selectedCategory === 'SELESAI' && (
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider text-right mt-2 block animate-pulse">▼ Tabel Aktif</span>
            )}
          </div>

          {/* Konsinyasi Card */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedCategory(prev => prev === 'KONSINYASI' ? null : 'KONSINYASI');
              setSearchQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSelectedCategory(prev => prev === 'KONSINYASI' ? null : 'KONSINYASI');
                setSearchQuery('');
              }
            }}
            className={`glass-card p-5 rounded-2xl shadow-lg border flex flex-col justify-between hover:border-amber-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer ${
              selectedCategory === 'KONSINYASI' ? 'ring-2 ring-amber-500 bg-amber-500/10 border-amber-500/50' : 'border-white/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Berkas Konsinyasi</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-amber-400 font-medium">Melalui Konsinyasi</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.pemberkasanKonsinyasi} dari {stats.total} bidang tanah
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.pemberkasanKonsinyasi / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
            {selectedCategory === 'KONSINYASI' && (
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider text-right mt-2 block animate-pulse">▼ Tabel Aktif</span>
            )}
          </div>

          {/* Belum Selesai Card */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedCategory(prev => prev === 'BELUM' ? null : 'BELUM');
              setSearchQuery('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSelectedCategory(prev => prev === 'BELUM' ? null : 'BELUM');
                setSearchQuery('');
              }
            }}
            className={`glass-card p-5 rounded-2xl shadow-lg border flex flex-col justify-between hover:border-rose-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer ${
              selectedCategory === 'BELUM' ? 'ring-2 ring-rose-500 bg-rose-500/10 border-rose-500/40' : 'border-white/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Belum Selesai</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-rose-400 font-medium">Belum Diproses</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.pemberkasanBelumSelesai} dari {stats.total} bidang tanah
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-rose-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.pemberkasanBelumSelesai / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
            {selectedCategory === 'BELUM' && (
              <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider text-right mt-2 block animate-pulse">▼ Tabel Aktif</span>
            )}
          </div>
        </div>

        {/* Interactive Data Table for Guest view with Search */}
        {selectedCategory && (
          <div className="glass-card p-6 rounded-2xl border border-amber-500/20 shadow-xl space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    selectedCategory === 'SELESAI' ? 'bg-emerald-500 animate-pulse' :
                    selectedCategory === 'KONSINYASI' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-pulse'
                  }`} />
                  Tabel Data: {
                    selectedCategory === 'SELESAI' ? 'BERKAS SELESAI' :
                    selectedCategory === 'KONSINYASI' ? 'BERKAS KONSINYASI' : 'BELUM SELESAI'
                  }
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Menampilkan {searchedRecords.length} bidang dari total {filteredRecordsByCategory.length} bidang dalam kategori ini.
                </p>
              </div>
              <button 
                onClick={() => { setSelectedCategory(null); setSearchQuery(''); }}
                className="self-end sm:self-center px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white rounded-xl transition-colors text-[10px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
                Tutup Tabel
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Ketik nama desa, span, no bidang, nama pemilik, alas hak, atau keterangan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Village Details Table */}
            <div className="table-scroll-container max-h-[420px] overflow-y-auto overflow-x-auto border border-white/5 rounded-xl bg-slate-950/40 shadow-inner scrollbar-thin">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900 border-b border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-bold bg-slate-900">Desa</th>
                    <th className="px-4 py-3 font-bold bg-slate-900">SPAN</th>
                    <th className="px-4 py-3 font-bold bg-slate-900">No Bidang</th>
                    <th className="px-4 py-3 font-bold bg-slate-900">Nama Pemilik</th>
                    <th className="px-4 py-3 font-bold bg-slate-900">Jenis Alas Hak</th>
                    <th className="px-4 py-3 font-bold text-right bg-slate-900">Luas (m²)</th>
                    <th className="px-4 py-3 font-bold bg-slate-900">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {searchedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic font-sans">
                        Tidak ada data yang cocok dengan kriteria pencarian
                      </td>
                    </tr>
                  ) : (
                    searchedRecords.map((r, i) => (
                      <tr key={`${r.ID_UNIK || r.CODE || 'row'}-${i}`} className="hover:bg-white/5 transition-colors duration-150">
                        <td className="px-4 py-3 font-medium text-slate-200 font-sans whitespace-nowrap">{r.DESA || '-'}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 font-medium whitespace-nowrap">{r.SPAN || '-'}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">{r.NOBID || '-'}</td>
                        <td className="px-4 py-3 font-medium text-slate-200 font-sans whitespace-nowrap">{r.NAMA || '-'}</td>
                        <td className="px-4 py-3 font-sans text-slate-300 text-xs whitespace-nowrap">
                          {r.JENIS_ALAS_HAK ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 font-mono text-[11px] text-amber-300 font-semibold">
                              {r.JENIS_ALAS_HAK}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300 text-right whitespace-nowrap">
                          {parseFloat(r.LUAS) ? parseFloat(r.LUAS).toLocaleString('id-ID') : r.LUAS || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-sans min-w-[200px] max-w-md whitespace-pre-wrap break-words" title={r.KETERANGAN}>
                          {r.KETERANGAN || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* SECTION B: PROGRES UPLOAD TRABAS */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <CloudUpload className="w-5 h-5 text-blue-400" />
              Seksi Upload TRABAS & Sistem Informasi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Status digitalisasi dan publikasi berkas ke portal aplikasi sistem TRABAS pusat.</p>
          </div>
          <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full font-semibold">
            Status: Integrasi Online
          </span>
        </div>

        {/* 2-Column Stats Card for TRABAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Sudah Upload Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Sudah Upload TRABAS</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <CloudUpload className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.trabasSudah / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-blue-400 font-medium">Selesai Integrasi</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.trabasSudah} dari {stats.total} bidang tanah (SUDAH)
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                style={{ width: `${stats.total > 0 ? Math.round((stats.trabasSudah / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>

          {/* Belum Upload Card */}
          <div className="glass-card p-5 rounded-2xl shadow-lg border border-white/5 flex flex-col justify-between hover:border-slate-500/30 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Belum Upload TRABAS</span>
              <span className="p-2 rounded-xl bg-slate-500/10 text-slate-400 border border-slate-500/20">
                <AlertCircle className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white font-sans">
                  {stats.total > 0 ? Math.round((stats.trabasBelum / stats.total) * 100) : 0}%
                </span>
                <span className="text-xs text-slate-400 font-medium">Tersisa Antrean</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                {stats.trabasBelum} dari {stats.total} bidang tanah (BELUM)
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden border border-white/5">
              <div 
                className="h-full bg-slate-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.total > 0 ? Math.round((stats.trabasBelum / stats.total) * 100) : 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION C: DETAIL PROGRES KOMPARASI PER DESA (PEMBERKASAN VS TRABAS) */}
      <div className="glass-card p-6 rounded-2xl shadow-lg space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-200 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Grafik Komparasi Capaian per Desa (Pemberkasan vs Upload TRABAS)
          </h2>
          <p className="text-[11px] text-slate-400">
            Perbandingan langsung dua indikator utama per desa: Pemberkasan (atas) dan Upload TRABAS (bawah) dengan lebar grafik 100% untuk mempermudah identifikasi wilayah minim progress.
          </p>
        </div>

        {desaProgressData.length === 0 ? (
          <div className="h-32 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
            Belum ada data desa untuk ditampilkan
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-4">
            {desaProgressData.map(desa => {
              const total = desa.total;
              
              const selesaiPct = total > 0 ? (desa.selesai / total) * 100 : 0;
              const konsinyasiPct = total > 0 ? (desa.konsinyasi / total) * 100 : 0;
              const belumPct = total > 0 ? (desa.belum / total) * 100 : 0;
              
              const sudahPct = total > 0 ? (desa.trabasSudah / total) * 100 : 0;
              const belumTrabasPct = total > 0 ? (desa.trabasBelum / total) * 100 : 0;

              return (
                <div key={desa.name} className="p-3.5 bg-slate-900/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors duration-200 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  {/* Left Column: Village Info */}
                  <div className="md:w-36 flex-shrink-0 flex flex-row md:flex-col items-baseline md:items-start justify-between md:justify-center border-b md:border-b-0 md:border-r border-white/5 pb-2 md:pb-0 md:pr-4">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate max-w-[140px] md:max-w-none" title={desa.name}>
                      <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      {desa.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium font-mono whitespace-nowrap">
                        {total} Bidang
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20" title="Capaian Pemberkasan Selesai">
                        {Math.round(selesaiPct)}%
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Two bars stacked */}
                  <div className="flex-1 space-y-2.5">
                    {/* Bar 1: Pemberkasan */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Pemberkasan
                        </span>
                        <div className="flex gap-2 font-mono text-[9px] text-slate-400">
                          <span>Sl: <strong className="text-emerald-400 font-bold">{desa.selesai}</strong></span>
                          <span>Ks: <strong className="text-amber-400 font-bold">{desa.konsinyasi}</strong></span>
                          <span>Bl: <strong className="text-rose-400 font-bold">{desa.belum}</strong></span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden border border-white/5 shadow-inner">
                        {desa.selesai > 0 && (
                          <div 
                            style={{ width: `${selesaiPct}%` }} 
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]"
                            title={`Selesai: ${desa.selesai} (${Math.round(selesaiPct)}%)`}
                          />
                        )}
                        {desa.konsinyasi > 0 && (
                          <div 
                            style={{ width: `${konsinyasiPct}%` }} 
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]"
                            title={`Konsinyasi: ${desa.konsinyasi} (${Math.round(konsinyasiPct)}%)`}
                          />
                        )}
                        {desa.belum > 0 && (
                          <div 
                            style={{ width: `${belumPct}%` }} 
                            className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
                            title={`Belum Selesai: ${desa.belum} (${Math.round(belumPct)}%)`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Bar 2: TRABAS */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          TRABAS
                        </span>
                        <div className="flex gap-2 font-mono text-[9px] text-slate-400">
                          <span>Sd: <strong className="text-blue-400 font-bold">{desa.trabasSudah}</strong></span>
                          <span>Bl: <strong className="text-slate-400 font-bold">{desa.trabasBelum}</strong></span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden border border-white/5 shadow-inner">
                        {desa.trabasSudah > 0 && (
                          <div 
                            style={{ width: `${sudahPct}%` }} 
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]"
                            title={`Sudah Upload: ${desa.trabasSudah} (${Math.round(sudahPct)}%)`}
                          />
                        )}
                        {desa.trabasBelum > 0 && (
                          <div 
                            style={{ width: `${belumTrabasPct}%` }} 
                            className="h-full bg-slate-600 transition-all duration-500"
                            title={`Belum Upload: ${desa.trabasBelum} (${Math.round(belumTrabasPct)}%)`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION D: METRIK PROYEK FISIK & TANAMAN */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-amber-400" />
          Metrik Penghitungan Fisik & Tanaman Lapangan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-lg hover:border-white/15 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-inner">
                <Home className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Total Bangunan Terdata</p>
                <p className="text-xs text-slate-400">Jumlah bangunan berdiri di atas lahan proyek</p>
              </div>
            </div>
            <span className="text-xl font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-3.5 py-1 rounded-xl shadow-inner font-mono">
              {stats.totalBuildings} <span className="text-xs font-normal">Unit</span>
            </span>
          </div>

          <div className="glass-card p-5 rounded-2xl flex items-center justify-between shadow-lg hover:border-white/15 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                <Sprout className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Total Pohon & Tanaman</p>
                <p className="text-xs text-slate-400">Jumlah tanaman produktif/belum menghasilkan</p>
              </div>
            </div>
            <span className="text-xl font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-3.5 py-1 rounded-xl shadow-inner font-mono">
              {stats.totalPlantsCount} <span className="text-xs font-normal">Pohon</span>
            </span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Village Lahan Distribution Chart */}
        <div className="glass-card p-6 rounded-2xl shadow-lg space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-amber-400" />
            Distribusi Jumlah Bidang & Luas per Desa
          </h2>
          {desaChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
              Belum ada data desa untuk ditampilkan
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={desaChartData}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="left" stroke="#818cf8" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="Jumlah" fill="#818cf8" radius={[4, 4, 0, 0]} name="Jumlah Bidang" />
                  <Bar yAxisId="right" dataKey="Luas (m²)" fill="#34d399" radius={[4, 4, 0, 0]} name="Luas Total (m²)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Land Cover Classification */}
        <div className="glass-card p-6 rounded-2xl shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Sprout className="w-5 h-5 text-emerald-400" />
              Klasifikasi Penutup Lahan
            </h2>
            <p className="text-xs text-slate-400">Pembagian tipe pemanfaatan penutup lahan terdaftar.</p>
          </div>
          
          {penutupLahanChartData.length === 0 ? (
            <div className="h-60 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
              Belum ada klasifikasi penutup lahan
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
              <div className="w-full sm:w-1/2 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={penutupLahanChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {penutupLahanChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full sm:w-1/2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {penutupLahanChartData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <span className="text-slate-300 truncate font-medium">
                      {item.name} ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document Completion Progress */}
      {role !== 'GUEST' && (
        <div className="glass-card p-6 rounded-2xl shadow-lg space-y-5">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                Kelengkapan Dokumen Lampiran (Google Drive)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Persentase berkas digital yang sudah terunggah.</p>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="h-28 flex items-center justify-center border border-dashed border-white/10 rounded-xl text-slate-400 text-sm bg-slate-900/10">
              Belum ada data berkas yang terunggah
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {documentStats.map((item, idx) => (
                <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/5 flex flex-col justify-between shadow-inner">
                  <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">{item.name}</span>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-white font-sans">{item.Persentase}%</span>
                    <span className="text-[10px] text-slate-400 font-medium">terisi</span>
                  </div>
                  {/* Visual bar */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-amber-500 rounded-full transition-all duration-500 glow-amber"
                      style={{ width: `${item.Persentase}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL EKSPOR LAPORAN TERPADU (PDF & EXCEL 3-IN-1)        */}
      {/* ======================================================== */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <FileDown className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white tracking-tight">Studio Ekspor Laporan Eksekutif</h2>
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                        3-in-1 Terpadu
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Jalur: <span className="text-amber-400 font-semibold">{activeProjectName || 'Semua Jalur'}</span> · Siap Cetak & Distribusi Resmi
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Segmented Tab Controls */}
              <div className="flex items-center gap-1.5 mt-4 p-1 bg-slate-950/60 rounded-xl border border-white/5 text-xs">
                <button
                  type="button"
                  onClick={() => setExportModalTab('MODULES')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    exportModalTab === 'MODULES'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>1. Modul Data</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportModalTab('FORMAT')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    exportModalTab === 'FORMAT'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>2. Format Laporan</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportModalTab('PREVIEW')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    exportModalTab === 'PREVIEW'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>3. Pratinjau Struktur</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Toast Feedback */}
              {exportFeedbackMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    exportFeedbackMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <span>{exportFeedbackMessage.text}</span>
                  <button
                    type="button"
                    onClick={() => setExportFeedbackMessage(null)}
                    className="text-slate-400 hover:text-white text-xs ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* TAB 1: MODULES */}
              {exportModalTab === 'MODULES' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-indigo-950/40 via-slate-800/40 to-emerald-950/30 border border-white/10 rounded-xl p-4">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Laporan terpadu menggabungkan seluruh tahapan teknis, yuridis, dan tata usaha dalam satu dokumen resmi berstandar korporat / BUMN:
                    </p>
                    <div className="grid grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-white/10">
                      <div className="text-center p-2 rounded-lg bg-slate-900/60 border border-white/5">
                        <span className="text-[10px] text-slate-400 block">Data Lahan</span>
                        <span className="text-sm font-bold text-white">{stats.total} Bidang</span>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-slate-900/60 border border-white/5">
                        <span className="text-[10px] text-slate-400 block">Resume Proyek</span>
                        <span className="text-sm font-bold text-amber-400">{combinedVillageResumes.length} Desa</span>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-slate-900/60 border border-white/5">
                        <span className="text-[10px] text-slate-400 block">Surat Instansi</span>
                        <span className="text-sm font-bold text-emerald-400">{agencyLetters.length} Surat</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2.5">
                      Pilih Modul yang Disertakan dalam Laporan:
                    </label>
                    <div className="space-y-2.5">
                      {/* Module 1: Data Lahan */}
                      <div 
                        onClick={() => setExportIncludeLahan(!exportIncludeLahan)}
                        className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                          exportIncludeLahan 
                            ? 'bg-indigo-500/10 border-indigo-500/40 text-white' 
                            : 'bg-slate-800/40 border-white/5 text-slate-400 hover:border-white/10'
                        }`}
                      >
                        <div className="mt-0.5">
                          {exportIncludeLahan ? (
                            <CheckSquare className="w-5 h-5 text-indigo-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">Bab I - IV: Data Capaian Pertanahan & Nominatif</span>
                            <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-semibold">
                              {stats.total} Bidang ({stats.totalLuas.toLocaleString('id-ID')} m²)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                            KPI Bidang/Luas/Tanaman/Bangunan, Verifikasi Pemberkasan, Integrasi TRABAS PLN, Grafik Komparasi per Desa, dan Diagram Klasifikasi 9 Alas Hak.
                          </p>
                        </div>
                      </div>

                      {/* Module 2: Resume Project */}
                      <div 
                        onClick={() => setExportIncludeResume(!exportIncludeResume)}
                        className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                          exportIncludeResume 
                            ? 'bg-amber-500/10 border-amber-500/40 text-white' 
                            : 'bg-slate-800/40 border-white/5 text-slate-400 hover:border-white/10'
                        }`}
                      >
                        <div className="mt-0.5">
                          {exportIncludeResume ? (
                            <CheckSquare className="w-5 h-5 text-amber-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">Bab V: Resume Tahapan Proyek Kompensasi per Desa</span>
                            <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-semibold">
                              {combinedVillageResumes.length} Desa ({resumeSummary.avgProgress}% Capaian)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                            Rekapitulasi 6 tahapan kompensasi lapangan: Sosialisasi Awal, Pengumuman Inv., BAPT Register, Sos. Nilai, Pembayaran Kompensasi, dan Bush Clearing beserta tanggal legalitas.
                          </p>
                        </div>
                      </div>

                      {/* Module 3: Surat Instansi */}
                      <div 
                        onClick={() => setExportIncludeSurat(!exportIncludeSurat)}
                        className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                          exportIncludeSurat 
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-white' 
                            : 'bg-slate-800/40 border-white/5 text-slate-400 hover:border-white/10'
                        }`}
                      >
                        <div className="mt-0.5">
                          {exportIncludeSurat ? (
                            <CheckSquare className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">Bab VI: Agenda & Monitoring Surat Instansi Terkait</span>
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-semibold">
                              {agencyLetters.length} Surat Masuk/Keluar
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                            Buku agenda koordinasi eksternal ke BPN, Pemda, Dinas Kehutanan, Balai Jalan dll., lengkap dengan no surat, perihal, status proses, dan catatan tindak lanjut PIC.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FORMAT & SIGNATURES */}
              {exportModalTab === 'FORMAT' && (
                <div className="space-y-5">
                  {/* Style Options */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                      Gaya & Kop Dokumen:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        onClick={() => setExportReportStyle('BUMN_OFFICIAL')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          exportReportStyle === 'BUMN_OFFICIAL'
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-slate-800/40 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-amber-400" />
                            Format Resmi BUMN / Instansi
                          </span>
                          {exportReportStyle === 'BUMN_OFFICIAL' && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">
                          Menggunakan Kop Dokumen Resmi dengan logo Danantara Indonesia, ID Survey, dan Surveyor Indonesia serta garis ganda formal.
                        </p>
                      </div>

                      <div
                        onClick={() => setExportReportStyle('MODERN_EXECUTIVE')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          exportReportStyle === 'MODERN_EXECUTIVE'
                            ? 'bg-indigo-500/15 border-indigo-500 text-white'
                            : 'bg-slate-800/40 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-indigo-400" />
                            Format Modern Dashboard
                          </span>
                          {exportReportStyle === 'MODERN_EXECUTIVE' && <Check className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">
                          Tampilan kontemporer, minimalis, dan ringkas dengan aksen warna modern untuk rapat internal tim dan progres visual.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Orientation Options */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                      Orientasi Halaman:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setExportOrientation('portrait')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center gap-3 ${
                          exportOrientation === 'portrait'
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-slate-800/40 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="w-7 h-9 rounded border border-current flex items-center justify-center text-[10px] font-bold">
                          A4
                        </div>
                        <div>
                          <span className="text-xs font-bold block text-slate-200">Portrait (Vertikal)</span>
                          <span className="text-[10px] text-slate-400">Standar berkas laporan dinas</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExportOrientation('landscape')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center gap-3 ${
                          exportOrientation === 'landscape'
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-slate-800/40 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="w-9 h-7 rounded border border-current flex items-center justify-center text-[10px] font-bold">
                          A4
                        </div>
                        <div>
                          <span className="text-xs font-bold block text-slate-200">Landscape (Bentang)</span>
                          <span className="text-[10px] text-emerald-400">Terbaik untuk tabel 6 tahap & surat</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Pure Report Status Notice */}
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-white/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">Status Dokumen: Murni Sebatas Laporan Monitoring</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Dokumen diterbitkan murni sebagai laporan status dan monitoring progres eksekutif tanpa lembar tanda tangan basah. Dilengkapi nomor registrasi otomatis, ringkasan per desa kompak 2-kolom, dan segel verifikasi sistem.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: PREVIEW */}
              {exportModalTab === 'PREVIEW' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="font-bold text-white">Struktur Dokumen yang Akan Dihasilkan:</span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                        {exportOrientation.toUpperCase()} A4
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-slate-300">
                          Kop Surat: <strong className="text-white">{exportReportStyle === 'BUMN_OFFICIAL' ? 'Resmi BUMN PNG (Danantara, IDSurvey, Surveyor)' : 'Modern Executive'}</strong>
                        </span>
                      </div>

                      {exportIncludeLahan && (
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-slate-300">
                            Bab I - IV: Ringkasan KPI, Progres Validasi & TRABAS, Komparasi Desa 2-Kolom ({stats.total} Bidang), Klasifikasi 9 Alas Hak
                          </span>
                        </div>
                      )}

                      {exportIncludeResume && (
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-slate-300">
                            Bab V: Resume Tahapan Kompensasi per Desa ({combinedVillageResumes.length} Desa, 6 Tahap Lapangan Kompak)
                          </span>
                        </div>
                      )}

                      {exportIncludeSurat && (
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-slate-300">
                            Bab VI: Agenda Surat Instansi Mitra ({agencyLetters.length} Berkas Surat)
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-slate-300">
                          Format Dokumen: <strong>Murni Sebatas Laporan</strong> (Tanpa Lembar TTD, Dilengkapi Segel Sistem & Timestamp)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-slate-300 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">
                      Dokumen disusun secara otomatis dengan tata letak ringkas, penomoran bab berurutan, logo resmi PNG beresolusi tinggi, dan footer bertanda waktu real-time.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-white/10 bg-slate-800/60">
              <span className="text-[11px] text-slate-400 italic order-2 sm:order-1 text-center sm:text-left">
                * Format tersinkronisasi otomatis dengan standar BUMN & Pemerintah
              </span>

              <div className="flex items-center gap-2.5 w-full sm:w-auto order-1 sm:order-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-white/10 transition-all cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={isExportingExcel}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                  title="Unduh Master Excel 3-in-1 (Resume Proyek, Surat Instansi, Nominatif)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isExportingExcel ? 'Menyiapkan...' : 'Master Excel (3 Sheet)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportPDF()}
                  disabled={isExportingPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  title="Unduh Dokumen Laporan PDF Eksekutif Resmi"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{isExportingPdf ? 'Menghasilkan PDF...' : 'Unduh PDF Eksekutif'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
