import React, { useState, useMemo } from 'react';
import { 
  GitCompare, CheckCircle2, AlertTriangle, XCircle, Search, 
  Filter, Download, ArrowRightLeft, Layers, FileSpreadsheet, 
  User, MapPin, ExternalLink, RefreshCw, SlidersHorizontal, 
  Edit3, HelpCircle, FileCheck2, Info, ChevronRight, Check, X
} from 'lucide-react';
import { type LandRecord } from '../types';

interface SandingDataPanelProps {
  records: LandRecord[];
  loadedGeoJSONs: any[];
  role: string | null;
  activeProjectName?: string;
  onNavigateToInput?: (record: LandRecord) => void;
  onNavigateToMap?: (span?: string) => void;
  onNavigateToQC?: () => void;
  onNavigateToSandingEsdm?: () => void;
}

export interface ComparisonItem {
  id: string;
  key: string;
  
  // 1. Nama Desa
  desaGeo: string;
  desaInput: string;
  isDesaMatch: boolean;

  // 2. Span
  spanGeo: string;
  spanInput: string;
  isSpanMatch: boolean;

  // 3. Nomer Bidang
  nobidGeo: string;
  nobidInput: string;
  isNobidMatch: boolean;

  // 4. Nama Pemilik
  namaGeo: string;
  namaAwalGeo: string;
  namaInput: string;
  isNamaMatch: boolean;
  isNamaGanti: boolean; // Case where owner changed (e.g. TKD -> Pemdes / new owner)

  // 5. Luas
  luasGeo: number;
  luasInput: number;
  luasDiff: number;
  luasDiffPercent: number;
  isLuasMatch: boolean;

  // 6. Obyek
  obyekGeo: string;
  obyekInput: string;
  isObyekMatch: boolean;

  // Composite Status
  status: 'MATCH' | 'BEDA_NAMA' | 'BEDA_LUAS' | 'MISMATCH_BOTH' | 'PETA_ONLY' | 'INPUT_ONLY' | 'GABUNGAN';
  statusLabel: string;
  statusBadgeColor: string;

  geoFeature?: any;
  inputRecord?: LandRecord;
  inputRecordsCount?: number;
  allMatchingInputs?: LandRecord[];
}

export const normalizeDesa = (val: any): string => {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .trim()
    .replace(/^(desa|kelurahan|kel|dsa)\.?\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
};

export const normalizeSpan = (val: any): string => {
  if (!val) return '';
  let s = String(val).toLowerCase().trim();
  s = s.replace(/^span\s*/i, '');
  const m = s.match(/(?:t(?:ower|wr)?\.?\s*)?(\d+)([a-z]?)\s*(?:[-–—/]|s\/d|sampai|to)\s*(?:t(?:ower|wr)?\.?\s*)?(\d+)([a-z]?)/i);
  if (m) {
    const t1Num = m[1].replace(/^0+/, '') || '0';
    const t1Suffix = m[2] || '';
    let t2Num = m[3].replace(/^0+/, '') || '0';
    const t2Suffix = m[4] || '';
    if (t2Num.length < t1Num.length && /^\d+$/.test(t1Num) && /^\d+$/.test(t2Num)) {
      t2Num = t1Num.substring(0, t1Num.length - t2Num.length) + t2Num;
    }
    return `t${t1Num}${t1Suffix}t${t2Num}${t2Suffix}`;
  }
  return s.replace(/\b0+(\d+)/g, '$1').replace(/[^a-z0-9]/g, '');
};

export const normalizeNobid = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  let str = String(val).trim().replace(/^0+([1-9a-z])/i, '$1').replace(/^0+$/, '0');
  return str.toLowerCase() || '0';
};

export default function SandingDataPanel({
  records,
  loadedGeoJSONs,
  role,
  activeProjectName,
  onNavigateToInput,
  onNavigateToMap,
  onNavigateToQC,
  onNavigateToSandingEsdm
}: SandingDataPanelProps) {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDesaFilter, setSelectedDesaFilter] = useState('');
  const [selectedSpanFilter, setSelectedSpanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DISCREPANCY' | 'MATCH' | 'BEDA_NAMA' | 'BEDA_LUAS' | 'PETA_ONLY' | 'INPUT_ONLY' | 'GABUNGAN'>('ALL');
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false);
  const [tableHeightMode, setTableHeightMode] = useState<'compact' | 'standard' | 'tall'>('standard');

  // Selected item for modal detailed comparison
  const [inspectItem, setInspectItem] = useState<ComparisonItem | null>(null);

  // Find bidang GeoJSON layer
  const bidangGeoJSONLayer = useMemo(() => {
    if (!loadedGeoJSONs || loadedGeoJSONs.length === 0) return null;
    return loadedGeoJSONs.find(g => 
      g.type === 'bidang' || 
      g.name?.toLowerCase().includes('bidang') || 
      g.id?.includes('bidang')
    ) || loadedGeoJSONs[0];
  }, [loadedGeoJSONs]);

  // Extract all features from GeoJSON
  const geoFeatures = useMemo(() => {
    if (!bidangGeoJSONLayer?.data?.features) return [];
    return bidangGeoJSONLayer.data.features;
  }, [bidangGeoJSONLayer]);

  // Build list of all unique Desas and Spans across both datasets for filter dropdowns
  const availableDesas = useMemo(() => {
    const set = new Set<string>();
    geoFeatures.forEach((f: any) => {
      const p = f.properties || {};
      const d = p.desa || p.DESA;
      if (d) set.add(String(d).trim().toUpperCase());
    });
    records.forEach(r => {
      if (r.DESA) set.add(r.DESA.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [geoFeatures, records]);

  const availableSpans = useMemo(() => {
    const set = new Set<string>();
    geoFeatures.forEach((f: any) => {
      const p = f.properties || {};
      const d = p.desa || p.DESA;
      const s = p.span || p.SPAN;
      if (s) {
        if (!selectedDesaFilter || (d && String(d).trim().toUpperCase() === selectedDesaFilter)) {
          set.add(String(s).trim());
        }
      }
    });
    records.forEach(r => {
      if (r.SPAN) {
        if (!selectedDesaFilter || (r.DESA && r.DESA.trim().toUpperCase() === selectedDesaFilter)) {
          set.add(r.SPAN.trim());
        }
      }
    });
    return Array.from(set).sort();
  }, [geoFeatures, records, selectedDesaFilter]);

  // Main Comparison Algorithm: Sanding GeoJSON Peta vs Spreadsheet Input
  const comparisonItems = useMemo<ComparisonItem[]>(() => {
    const geoMap = new Map<string, any[]>();
    const inputMap = new Map<string, LandRecord[]>();

    // 1. Populate GeoJSON Map by composite key
    geoFeatures.forEach((feat: any) => {
      const p = feat.properties || {};
      const desaRaw = p.desa || p.DESA || '';
      const spanRaw = p.span || p.SPAN || '';
      const nobidRaw = p.nobiddis || p.NOBIDDC || p.nobid || p.NOBID || p.Field || '';

      const normKey = `${normalizeDesa(desaRaw)}|${normalizeSpan(spanRaw)}|${normalizeNobid(nobidRaw)}`;
      if (!geoMap.has(normKey)) {
        geoMap.set(normKey, []);
      }
      geoMap.get(normKey)!.push(feat);
    });

    // 2. Populate Input Records Map by composite key
    records.forEach(rec => {
      const normKey = `${normalizeDesa(rec.DESA)}|${normalizeSpan(rec.SPAN)}|${normalizeNobid(rec.NOBID)}`;
      if (!inputMap.has(normKey)) {
        inputMap.set(normKey, []);
      }
      inputMap.get(normKey)!.push(rec);
    });

    // 3. Union of all keys
    const allKeys = new Set<string>([...geoMap.keys(), ...inputMap.keys()]);
    const items: ComparisonItem[] = [];

    allKeys.forEach(key => {
      // Ignore completely blank key
      if (key === '||') return;

      const geoList = geoMap.get(key) || [];
      const inputList = inputMap.get(key) || [];

      const geoFeat = geoList[0];
      const geoProps = geoFeat?.properties || {};

      const inputRec = inputList[0];

      // Field 1: Nama Desa
      const desaGeo = String(geoProps.desa || geoProps.DESA || (inputRec ? inputRec.DESA : '')).trim();
      const desaInput = String(inputRec ? inputRec.DESA : (geoProps.desa || geoProps.DESA || '')).trim();
      const isDesaMatch = !desaGeo || !desaInput || normalizeDesa(desaGeo) === normalizeDesa(desaInput);

      // Field 2: Span
      const spanGeo = String(geoProps.span || geoProps.SPAN || (inputRec ? inputRec.SPAN : '')).trim();
      const spanInput = String(inputRec ? inputRec.SPAN : (geoProps.span || geoProps.SPAN || '')).trim();
      const isSpanMatch = !spanGeo || !spanInput || normalizeSpan(spanGeo) === normalizeSpan(spanInput);

      // Field 3: Nomer Bidang
      const nobidGeo = String(geoProps.nobiddis || geoProps.NOBIDDC || geoProps.nobid || geoProps.NOBID || (inputRec ? inputRec.NOBID : '')).trim();
      const nobidInput = String(inputRec ? inputRec.NOBID : (geoProps.nobiddis || geoProps.NOBIDDC || '')).trim();
      const isNobidMatch = !nobidGeo || !nobidInput || normalizeNobid(nobidGeo) === normalizeNobid(nobidInput);

      // Field 4: Nama Pemilik
      const namaGeo = String(geoProps.namafinal || geoProps.nama || geoProps.PEMILIK || '').trim();
      const namaAwalGeo = String(geoProps.namaawal || '').trim();
      const namaInput = String(inputRec ? inputRec.NAMA : '').trim();

      const normNamaGeo = (namaGeo || namaAwalGeo).toLowerCase().replace(/[^a-z0-9]/g, '');
      const normNamaInput = namaInput.toLowerCase().replace(/[^a-z0-9]/g, '');

      let isNamaMatch = true;
      let isNamaGanti = false;

      if (geoList.length > 0 && inputList.length > 0) {
        if (normNamaGeo && normNamaInput) {
          if (normNamaGeo === normNamaInput) {
            isNamaMatch = true;
          } else if (normNamaGeo.includes(normNamaInput) || normNamaInput.includes(normNamaGeo)) {
            isNamaMatch = true;
          } else {
            isNamaMatch = false;
            isNamaGanti = true;
          }
        }
      }

      // Field 5: Luas
      const luasGeoVal = parseFloat(geoProps.luas || geoProps.Shape_Area || '0') || 0;
      let luasInputVal = 0;
      if (inputList.length > 0) {
        luasInputVal = inputList.reduce((acc, r) => {
          const val = parseFloat((r.LUAS || '0').toString().replace(',', '.')) || 0;
          return acc + val;
        }, 0);
      }

      const luasDiff = Math.abs(luasGeoVal - luasInputVal);
      const luasMax = Math.max(luasGeoVal, luasInputVal) || 1;
      const luasDiffPercent = (luasDiff / luasMax) * 100;

      // Match if diff <= 1.5 m² or percentage <= 2%
      const isLuasMatch = (geoList.length === 0 || inputList.length === 0) 
        ? true 
        : (luasDiff <= 1.5 || luasDiffPercent <= 2);

      // Field 6: Obyek Kompensasi
      const obyekGeo = String(geoProps.jenisbang || geoProps.penggunaan || geoProps.obyek || '-').trim();
      
      let obyekInput = '-';
      if (inputRec) {
        obyekInput = (inputRec.PENUTUP_LAHAN || '-').trim();
      }

      const isObyekMatch = true; // Informational comparison

      // Status determination
      let status: ComparisonItem['status'] = 'MATCH';
      let statusLabel = '🟢 Sesuai Sempurna';
      let statusBadgeColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';

      if (geoList.length === 0 && inputList.length > 0) {
        status = 'INPUT_ONLY';
        statusLabel = '🟣 Input Tim (Tanpa Peta)';
        statusBadgeColor = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
      } else if (geoList.length > 0 && inputList.length === 0) {
        status = 'PETA_ONLY';
        statusLabel = '🔵 Peta GeoJSON (Belum Diinput)';
        statusBadgeColor = 'bg-sky-500/10 text-sky-300 border-sky-500/20';
      } else if (inputList.length > 1) {
        status = 'GABUNGAN';
        statusLabel = `🧩 Bidang Gabungan (${inputList.length} Input)`;
        statusBadgeColor = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      } else if (!isNamaMatch && !isLuasMatch) {
        status = 'MISMATCH_BOTH';
        statusLabel = '🔴 Beda Nama & Beda Luas';
        statusBadgeColor = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      } else if (!isNamaMatch) {
        status = 'BEDA_NAMA';
        statusLabel = '⚠️ Perbedaan Nama / Ganti Pemilik';
        statusBadgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      } else if (!isLuasMatch) {
        status = 'BEDA_LUAS';
        statusLabel = `⚠️ Selisih Luas (${Math.round(luasDiff)} m²)`;
        statusBadgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      }

      items.push({
        id: `sand-${key}`,
        key,
        desaGeo,
        desaInput,
        isDesaMatch,
        spanGeo,
        spanInput,
        isSpanMatch,
        nobidGeo,
        nobidInput,
        isNobidMatch,
        namaGeo,
        namaAwalGeo,
        namaInput,
        isNamaMatch,
        isNamaGanti,
        luasGeo: Math.round(luasGeoVal * 10) / 10,
        luasInput: Math.round(luasInputVal * 10) / 10,
        luasDiff: Math.round(luasDiff * 10) / 10,
        luasDiffPercent: Math.round(luasDiffPercent * 10) / 10,
        isLuasMatch,
        obyekGeo,
        obyekInput,
        isObyekMatch,
        status,
        statusLabel,
        statusBadgeColor,
        geoFeature: geoFeat,
        inputRecord: inputRec,
        inputRecordsCount: inputList.length,
        allMatchingInputs: inputList
      });
    });

    // Sort by Desa -> Span -> NoBid numeric
    return items.sort((a, b) => {
      if (a.desaGeo !== b.desaGeo) return (a.desaGeo || '').localeCompare(b.desaGeo || '');
      if (a.spanGeo !== b.spanGeo) return (a.spanGeo || '').localeCompare(b.spanGeo || '');
      const numA = parseInt(a.nobidGeo) || 0;
      const numB = parseInt(b.nobidGeo) || 0;
      return numA - numB;
    });
  }, [geoFeatures, records]);

  // Filtered comparison items
  const filteredItems = useMemo(() => {
    return comparisonItems.filter(item => {
      // Filter Desa
      if (selectedDesaFilter) {
        const d = (item.desaGeo || item.desaInput).toUpperCase();
        if (d !== selectedDesaFilter) return false;
      }

      // Filter Span
      if (selectedSpanFilter) {
        const s = (item.spanGeo || item.spanInput).trim();
        if (s !== selectedSpanFilter) return false;
      }

      // Filter Status
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'DISCREPANCY') {
          if (item.status === 'MATCH') return false;
        } else if (item.status !== statusFilter) {
          return false;
        }
      }

      // Quick toggle Discrepancies only
      if (onlyDiscrepancies && item.status === 'MATCH') {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSearch = 
          item.namaGeo.toLowerCase().includes(q) ||
          item.namaAwalGeo.toLowerCase().includes(q) ||
          item.namaInput.toLowerCase().includes(q) ||
          item.nobidGeo.toLowerCase().includes(q) ||
          item.nobidInput.toLowerCase().includes(q) ||
          item.spanGeo.toLowerCase().includes(q) ||
          item.spanInput.toLowerCase().includes(q) ||
          item.desaGeo.toLowerCase().includes(q) ||
          item.desaInput.toLowerCase().includes(q);
        
        if (!matchSearch) return false;
      }

      return true;
    });
  }, [comparisonItems, selectedDesaFilter, selectedSpanFilter, statusFilter, onlyDiscrepancies, searchQuery]);

  // Statistics KPI
  const stats = useMemo(() => {
    const totalGeo = comparisonItems.filter(i => i.geoFeature).length;
    const totalInput = records.length;
    const totalMatched = comparisonItems.filter(i => i.status === 'MATCH').length;
    const totalBedaNama = comparisonItems.filter(i => i.status === 'BEDA_NAMA' || i.status === 'MISMATCH_BOTH').length;
    const totalBedaLuas = comparisonItems.filter(i => i.status === 'BEDA_LUAS' || i.status === 'MISMATCH_BOTH').length;
    const totalPetaOnly = comparisonItems.filter(i => i.status === 'PETA_ONLY').length;
    const totalGabungan = comparisonItems.filter(i => i.status === 'GABUNGAN').length;

    return {
      totalGeo,
      totalInput,
      totalMatched,
      totalBedaNama,
      totalBedaLuas,
      totalPetaOnly,
      totalGabungan,
      discrepancyCount: comparisonItems.length - totalMatched
    };
  }, [comparisonItems, records]);

  // Export comparison data to CSV
  const handleExportCSV = () => {
    if (filteredItems.length === 0) return;

    const headers = [
      'STATUS SANDING',
      'DESA (PETA)',
      'DESA (INPUT)',
      'SPAN (PETA)',
      'SPAN (INPUT)',
      'NO. BIDANG (PETA)',
      'NO. BIDANG (INPUT)',
      'NAMA PEMILIK (PETA)',
      'NAMA PEMILIK AWAL (PETA)',
      'NAMA PEMILIK (INPUT TIM)',
      'STATUS NAMA',
      'LUAS PETA (m2)',
      'LUAS INPUT TIM (m2)',
      'SELISIH LUAS (m2)',
      'OBYEK (PETA)',
      'OBYEK (INPUT TIM)'
    ];

    const csvRows = [headers.join(',')];

    filteredItems.forEach(item => {
      const row = [
        `"${item.statusLabel}"`,
        `"${item.desaGeo}"`,
        `"${item.desaInput}"`,
        `"${item.spanGeo}"`,
        `"${item.spanInput}"`,
        `"${item.nobidGeo}"`,
        `"${item.nobidInput}"`,
        `"${item.namaGeo}"`,
        `"${item.namaAwalGeo}"`,
        `"${item.namaInput}"`,
        `"${item.isNamaMatch ? 'Sama' : 'Perbedaan Nama/Ganti'}"`,
        item.luasGeo,
        item.luasInput,
        item.luasDiff,
        `"${item.obyekGeo}"`,
        `"${item.obyekInput}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sanding_Data_Peta_vs_Input_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <GitCompare className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest block font-mono">
                  MENU 3.1 — QC & REKONSILIASI
                </span>
                <h1 className="text-lg md:text-xl font-black text-white tracking-tight font-sans">
                  Penyandingan Data (Peta GeoJSON vs Input Tim)
                </h1>
              </div>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl font-sans">
              Menyandingkan dan membandingkan secara langsung 6 parameter kunci antara data spasial Peta GeoJSON dan data administratif Spreadsheet Input Tim untuk mendeteksi perbedaan nama, selisih luas, maupun bidang gabungan.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {onNavigateToQC && (
              <button
                onClick={onNavigateToQC}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
              >
                Menu 3: Verifikasi QC
              </button>
            )}

            {onNavigateToSandingEsdm && (
              <button
                onClick={onNavigateToSandingEsdm}
                className="px-3.5 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer border border-emerald-400/30"
              >
                Menu 3.2: Sanding ESDM (PDF)
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Ekspor Hasil Sanding (CSV)
            </button>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          {/* Total Peta */}
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">1. Total Peta GeoJSON</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-sky-400 font-mono">{stats.totalGeo}</span>
              <span className="text-[10px] text-slate-500">bidang</span>
            </div>
          </div>

          {/* Total Input Tim */}
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-white/5 space-y-1">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">2. Total Input Tim</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-indigo-400 font-mono">{stats.totalInput}</span>
              <span className="text-[10px] text-slate-500">record</span>
            </div>
          </div>

          {/* Sesuai Sempurna */}
          <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 space-y-1">
            <span className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-wider block">3. Sesuai (Matched)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-emerald-400 font-mono">{stats.totalMatched}</span>
              <span className="text-[10px] text-emerald-300/70">bidang</span>
            </div>
          </div>

          {/* Beda Nama */}
          <div className={`p-3 rounded-2xl border space-y-1 transition-all ${
            stats.totalBedaNama > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/80 border-white/5'
          }`}>
            <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-wider block">4. Beda Nama</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-amber-400 font-mono">{stats.totalBedaNama}</span>
              <span className="text-[10px] text-amber-300/70">bidang</span>
            </div>
          </div>

          {/* Beda Luas */}
          <div className={`p-3 rounded-2xl border space-y-1 transition-all ${
            stats.totalBedaLuas > 0 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-900/80 border-white/5'
          }`}>
            <span className="text-[9px] font-extrabold text-rose-400 uppercase tracking-wider block">5. Selisih Luas</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-rose-400 font-mono">{stats.totalBedaLuas}</span>
              <span className="text-[10px] text-rose-300/70">bidang</span>
            </div>
          </div>

          {/* Belum Input */}
          <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20 space-y-1">
            <span className="text-[9px] font-extrabold text-sky-400 uppercase tracking-wider block">6. Belum Inisialisasi</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-sky-400 font-mono">{stats.totalPetaOnly}</span>
              <span className="text-[10px] text-sky-300/70">peta</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-card p-4 rounded-2xl border border-white/10 shadow-lg space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, no. bidang, span, desa..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Filter Desa */}
          <div>
            <select
              value={selectedDesaFilter}
              onChange={(e) => {
                setSelectedDesaFilter(e.target.value);
                setSelectedSpanFilter('');
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="">Semua Desa ({availableDesas.length})</option>
              {availableDesas.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Filter Span */}
          <div>
            <select
              value={selectedSpanFilter}
              onChange={(e) => setSelectedSpanFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="">Semua Span ({availableSpans.length})</option>
              {availableSpans.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filter Status Sanding */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
            >
              <option value="ALL">Semua Status Hasil Sanding</option>
              <option value="DISCREPANCY">⚠️ Hanya Ketidakcocokan (Mismatch)</option>
              <option value="MATCH">🟢 Sesuai Sempurna</option>
              <option value="BEDA_NAMA">⚠️ Beda Nama Pemilik / Ganti Nama</option>
              <option value="BEDA_LUAS">⚠️ Beda Luas Tanah</option>
              <option value="PETA_ONLY">🔵 Peta GeoJSON (Belum Diinput)</option>
              <option value="INPUT_ONLY">🟣 Input Tim (Tanpa Peta)</option>
              <option value="GABUNGAN">🧩 Bidang Gabungan / Split</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOnlyDiscrepancies(!onlyDiscrepancies)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                onlyDiscrepancies 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-md' 
                  : 'bg-slate-900 text-slate-400 border-white/10 hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Tampilkan Hanya Ketidakcocokan ({stats.discrepancyCount})
            </button>

            {(selectedDesaFilter || selectedSpanFilter || statusFilter !== 'ALL' || searchQuery || onlyDiscrepancies) && (
              <button
                onClick={() => {
                  setSelectedDesaFilter('');
                  setSelectedSpanFilter('');
                  setStatusFilter('ALL');
                  setSearchQuery('');
                  setOnlyDiscrepancies(false);
                }}
                className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            Menampilkan <strong className="text-white">{filteredItems.length}</strong> dari {comparisonItems.length} pasang data
          </div>
        </div>
      </div>

      {/* Main Comparison Table */}
      <div className="glass-card rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col">
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
                  ? 'bg-indigo-600 text-white shadow-sm'
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
                  ? 'bg-indigo-600 text-white shadow-sm'
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
                  ? 'bg-indigo-600 text-white shadow-sm'
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
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-white/10 shadow-md">
              <tr className="bg-slate-950/90 border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">
                <th className="py-3 px-3 w-12 text-center">NO</th>
                <th className="py-3 px-3">IDENTITAS (DESA & SPAN)</th>
                <th className="py-3 px-3 w-20 text-center">NO. BID</th>
                <th className="py-3 px-3 min-w-[200px]">1 & 4. NAMA PEMILIK</th>
                <th className="py-3 px-3 min-w-[140px] text-right">5. LUAS (m²)</th>
                <th className="py-3 px-3 min-w-[160px]">6. OBYEK KOMPENSASI</th>
                <th className="py-3 px-3 min-w-[160px]">STATUS SANDING</th>
                <th className="py-3 px-3 w-24 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 space-y-2">
                    <FileCheck2 className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-300">Tidak ada data hasil sanding yang cocok dengan filter</p>
                    <p className="text-xs text-slate-500">Coba ubah kata kunci pencarian atau reset filter di atas</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr 
                    key={item.id}
                    className={`hover:bg-white/5 transition-all ${
                      inspectItem?.id === item.id ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Identitas (Desa, Span) */}
                    <td className="py-3 px-3">
                      <div className="space-y-0.5">
                        <span className="font-bold text-white text-xs block">
                          {item.desaGeo || item.desaInput || '-'}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                          <Layers className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>{item.spanGeo || item.spanInput || '-'}</span>
                        </div>
                      </div>
                    </td>

                    {/* No Bidang */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-1 rounded-md bg-slate-900 border border-white/10 font-mono font-bold text-slate-200 text-xs">
                        {item.nobidGeo || item.nobidInput || '-'}
                      </span>
                    </td>

                    {/* 1 & 4. Nama Pemilik (Peta vs Tim Input) */}
                    <td className="py-3 px-3">
                      <div className="space-y-1.5">
                        {/* PETA GEOJSON */}
                        <div className="flex items-start gap-1.5">
                          <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase shrink-0 font-mono">
                            PETA
                          </span>
                          <div className="text-xs">
                            <span className={`font-semibold ${!item.namaGeo ? 'text-slate-500 italic' : 'text-slate-200'}`}>
                              {item.namaGeo || item.namaAwalGeo || '(Belum terisi)'}
                            </span>
                            {item.namaAwalGeo && item.namaGeo && item.namaAwalGeo !== item.namaGeo && (
                              <span className="text-[9px] text-slate-500 block">Awal: {item.namaAwalGeo}</span>
                            )}
                          </div>
                        </div>

                        {/* INPUT TIM SPREADSHEET */}
                        <div className="flex items-start gap-1.5">
                          <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase shrink-0 font-mono">
                            TIM
                          </span>
                          <span className={`text-xs font-semibold ${
                            !item.namaInput 
                              ? 'text-slate-500 italic' 
                              : item.isNamaMatch 
                                ? 'text-emerald-300' 
                                : 'text-amber-300 font-bold'
                          }`}>
                            {item.namaInput || '(Belum diinput)'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 5. Luas (m2) */}
                    <td className="py-3 px-3 text-right font-mono">
                      <div className="space-y-1">
                        <div className="text-xs">
                          <span className="text-slate-400 text-[10px]">Peta: </span>
                          <span className="font-bold text-sky-300">{item.luasGeo ? `${item.luasGeo} m²` : '-'}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-slate-400 text-[10px]">Tim: </span>
                          <span className={`font-bold ${item.isLuasMatch ? 'text-emerald-300' : 'text-rose-400'}`}>
                            {item.luasInput ? `${item.luasInput} m²` : '-'}
                          </span>
                        </div>
                        {!item.isLuasMatch && item.luasGeo > 0 && item.luasInput > 0 && (
                          <span className="text-[9px] text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 block font-semibold">
                            Δ {item.luasDiff} m² ({item.luasDiffPercent}%)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 6. Obyek Kompensasi */}
                    <td className="py-3 px-3">
                      <div className="space-y-1 text-xs">
                        <div className="text-slate-300">
                          <span className="text-[9px] text-slate-500 block uppercase font-mono">Peta</span>
                          <span className="font-medium text-slate-200">{item.obyekGeo}</span>
                        </div>
                        <div className="text-slate-300">
                          <span className="text-[9px] text-slate-500 block uppercase font-mono">Input Tim</span>
                          <span className="font-medium text-indigo-300">{item.obyekInput}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status Sanding Badge */}
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${item.statusBadgeColor}`}>
                          {item.statusLabel}
                        </span>

                        {/* Extra indicators */}
                        {item.isNamaGanti && (
                          <span className="text-[9px] text-amber-300 font-semibold block bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            ⚠️ Nama Berbeda / Ganti
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setInspectItem(item)}
                          className="p-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg transition-all cursor-pointer border border-indigo-500/30"
                          title="Buka Lembar Detil Sanding 6 Parameter"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                        </button>

                        {item.inputRecord && onNavigateToInput && (
                          <button
                            onClick={() => onNavigateToInput(item.inputRecord!)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer border border-white/10"
                            title="Edit Data Input Tim di Form"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DETIL SANDING 6 PARAMETER */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card max-w-3xl w-full rounded-3xl border border-white/15 shadow-2xl overflow-hidden my-8 animate-scaleUp">
            {/* Modal Header */}
            <div className="p-5 bg-slate-950 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Penyandingan Parameter — Bidang No. {inspectItem.nobidGeo || inspectItem.nobidInput}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {inspectItem.desaGeo || inspectItem.desaInput} • Span {inspectItem.spanGeo || inspectItem.spanInput}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInspectItem(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Side-by-side comparison cards */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-thin">
              {/* Overall Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${inspectItem.statusBadgeColor}`}>
                <Info className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider">Hasil Evaluasi Sanding Data</h4>
                  <p className="text-xs mt-0.5">{inspectItem.statusLabel}</p>
                </div>
              </div>

              {/* Side-by-Side 6 Parameters Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LEFT: PETA GEOJSON */}
                <div className="p-4 bg-slate-900/90 rounded-2xl border border-sky-500/30 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-black text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4" /> Data Peta GeoJSON
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Kebenaran Spasial</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">1. NAMA DESA</span>
                      <strong className="text-white font-sans">{inspectItem.desaGeo || '-'}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">2. SPAN</span>
                      <strong className="text-white font-sans">{inspectItem.spanGeo || '-'}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">3. NOMER BIDANG</span>
                      <strong className="text-sky-300 font-mono font-bold">{inspectItem.nobidGeo || '-'}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">4. NAMA PEMILIK</span>
                      <strong className="text-slate-200 block">{inspectItem.namaGeo || inspectItem.namaAwalGeo || '(Belum terisi)'}</strong>
                      {inspectItem.namaAwalGeo && inspectItem.namaGeo && inspectItem.namaAwalGeo !== inspectItem.namaGeo && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">Nama Awal: {inspectItem.namaAwalGeo}</span>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">5. LUAS (m²)</span>
                      <strong className="text-sky-300 font-mono text-sm">{inspectItem.luasGeo ? `${inspectItem.luasGeo} m²` : '-'}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">6. OBYEK KOMPENSASI</span>
                      <strong className="text-slate-200">{inspectItem.obyekGeo}</strong>
                    </div>
                  </div>
                </div>

                {/* RIGHT: SPREADSHEET INPUT TIM */}
                <div className="p-4 bg-slate-900/90 rounded-2xl border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4" /> Data Input Tim
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Spreadsheet / Form</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">1. NAMA DESA</span>
                      <strong className={`font-sans ${inspectItem.isDesaMatch ? 'text-white' : 'text-rose-400 font-bold'}`}>
                        {inspectItem.desaInput || '(Belum diinput)'}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">2. SPAN</span>
                      <strong className={`font-sans ${inspectItem.isSpanMatch ? 'text-white' : 'text-rose-400 font-bold'}`}>
                        {inspectItem.spanInput || '(Belum diinput)'}
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">3. NOMER BIDANG</span>
                      <strong className="text-indigo-300 font-mono font-bold">{inspectItem.nobidInput || '(Belum diinput)'}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">4. NAMA PEMILIK</span>
                      <strong className={`block ${
                        !inspectItem.namaInput 
                          ? 'text-slate-500 italic' 
                          : inspectItem.isNamaMatch 
                            ? 'text-emerald-300 font-bold' 
                            : 'text-amber-300 font-extrabold bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 mt-1'
                      }`}>
                        {inspectItem.namaInput || '(Belum diinput)'}
                      </strong>
                      {!inspectItem.isNamaMatch && inspectItem.namaInput && inspectItem.namaGeo && (
                        <p className="text-[10px] text-amber-400/80 mt-1 italic">
                          ⚠️ Terjadi perbedaan nama antara Peta ({inspectItem.namaGeo}) dan Tim ({inspectItem.namaInput})
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">5. LUAS (m²)</span>
                      <strong className={`font-mono text-sm block ${
                        inspectItem.isLuasMatch ? 'text-emerald-300' : 'text-rose-400 font-bold'
                      }`}>
                        {inspectItem.luasInput ? `${inspectItem.luasInput} m²` : '(Belum diinput)'}
                      </strong>
                      {!inspectItem.isLuasMatch && (
                        <span className="text-[10px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 block mt-1 font-semibold">
                          Selisih: {inspectItem.luasDiff} m² ({inspectItem.luasDiffPercent}%)
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">6. OBYEK KOMPENSASI</span>
                      <strong className="text-indigo-300">{inspectItem.obyekInput}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-white/10 flex items-center justify-between">
              <div className="text-[10px] text-slate-400">
                Sistem Verifikasi Sanding QC Auto-Check
              </div>
              <div className="flex gap-2">
                {inspectItem.inputRecord && onNavigateToInput && (
                  <button
                    onClick={() => {
                      const rec = inspectItem.inputRecord!;
                      setInspectItem(null);
                      onNavigateToInput(rec);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Data Input Tim
                  </button>
                )}
                <button
                  onClick={() => setInspectItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
