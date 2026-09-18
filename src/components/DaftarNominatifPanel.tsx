import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, Printer, Download, Filter, Search, 
  FileText, Edit3, Layers, User, MapPin, CheckCircle2, 
  Clock, AlertCircle, Building2, Trees, RefreshCw, X, ChevronRight, Eye,
  ArrowRight, Zap, GitMerge, Scissors, CheckSquare, Square, ShieldAlert, Trash2
} from 'lucide-react';
import { type LandRecord } from '../types';
import MergeParcelModal from './MergeParcelModal';
import SplitParcelModal from './SplitParcelModal';
import QuickParcelPickerModal from './QuickParcelPickerModal';
import DeleteParcelModal from './DeleteParcelModal';

interface DaftarNominatifPanelProps {
  records: LandRecord[];
  role?: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST' | null;
  activeProjectName?: string;
  onNavigateToInput?: (record: LandRecord) => void;
  onBatchUpdateRecords?: (newRecords: LandRecord[], logDetails: string) => Promise<void>;
  onDeleteRecord?: (record: LandRecord, adjustNextParcels: boolean) => Promise<void>;
}

export default function DaftarNominatifPanel({
  records,
  role,
  activeProjectName = 'SUTT 150 KV JELOK - SANGGRAHAN',
  onNavigateToInput,
  onBatchUpdateRecords,
  onDeleteRecord
}: DaftarNominatifPanelProps) {
  // Table Container Height Mode for "Scroll dalam scroll" (Compact, Normal, Full)
  const [tableHeightMode, setTableHeightMode] = useState<'compact' | 'standard' | 'tall'>('standard');

  // Filters - Default desa is empty, user must pick a desa first to prevent browser lag!
  const [selectedDesa, setSelectedDesa] = useState<string>('');
  const [selectedSpan, setSelectedSpan] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [desaSearch, setDesaSearch] = useState<string>('');
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<LandRecord | null>(null);

  // Selection state for Merge / Split
  const [selectedRecordCodes, setSelectedRecordCodes] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState<boolean>(false);
  const [isQuickPickerOpen, setIsQuickPickerOpen] = useState<boolean>(false);
  const [quickPickerMode, setQuickPickerMode] = useState<'MERGE' | 'SPLIT'>('MERGE');
  const [mergePair, setMergePair] = useState<[LandRecord, LandRecord] | null>(null);
  const [splitTarget, setSplitTarget] = useState<LandRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<LandRecord | null>(null);

  // Toggle selection for a record
  const toggleSelectRecord = (record: LandRecord) => {
    setSelectedRecordCodes(prev => {
      const next = new Set(prev);
      if (next.has(record.CODE)) {
        next.delete(record.CODE);
      } else {
        // Max 2 items can be selected at a time
        if (next.size >= 2) {
          const first = Array.from(next)[0];
          next.delete(first);
        }
        next.add(record.CODE);
      }
      return next;
    });
  };

  const handleQuickMergeClick = (record: LandRecord) => {
    if (selectedRecordCodes.size === 0) {
      setSelectedRecordCodes(new Set([record.CODE]));
    } else if (selectedRecordCodes.size === 1) {
      const existingCode = Array.from(selectedRecordCodes)[0];
      if (existingCode === record.CODE) {
        setSelectedRecordCodes(new Set());
        return;
      }
      const existingRec = records.find(r => r.CODE === existingCode);
      if (existingRec) {
        if (existingRec.DESA !== record.DESA || existingRec.SPAN !== record.SPAN) {
          alert('Kedua bidang yang digabung harus berada di Desa dan Span yang sama!');
          return;
        }
        setMergePair([existingRec, record]);
        setIsMergeModalOpen(true);
      }
    } else {
      setSelectedRecordCodes(new Set([record.CODE]));
    }
  };

  // Extract unique Desas
  const availableDesas = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.DESA && r.DESA.trim()) {
        set.add(r.DESA.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [records]);

  // Statistics per Desa to display on the Village Selector Cards & Dropdown
  const desaStats = useMemo(() => {
    const map = new Map<string, { count: number; totalLuas: number; spans: Set<string>; kecamatan: string; kabupaten: string }>();
    records.forEach(r => {
      const desa = (r.DESA || '').trim().toUpperCase();
      if (!desa) return;
      const existing = map.get(desa) || { count: 0, totalLuas: 0, spans: new Set<string>(), kecamatan: '', kabupaten: '' };
      existing.count += 1;
      const luas = parseFloat((r.LUAS || '0').toString().replace(',', '.')) || 0;
      existing.totalLuas += luas;
      if (r.SPAN && r.SPAN.trim()) existing.spans.add(r.SPAN.trim());
      if (r.KECAMATAN && !existing.kecamatan) existing.kecamatan = r.KECAMATAN.trim().toUpperCase();
      if (r.KABUPATEN && !existing.kabupaten) existing.kabupaten = r.KABUPATEN.trim().toUpperCase();
      map.set(desa, existing);
    });
    return map;
  }, [records]);

  // Extract Spans for selected Desa (or all Spans)
  const availableSpans = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.SPAN && r.SPAN.trim()) {
        if (!selectedDesa || selectedDesa === '__ALL__' || (r.DESA && r.DESA.trim().toUpperCase() === selectedDesa)) {
          set.add(r.SPAN.trim());
        }
      }
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
  }, [records, selectedDesa]);

  // Filtered Records - Only load when Desa is selected to avoid rendering thousands of rows & causing lag!
  const filteredRecords = useMemo(() => {
    if (!selectedDesa) return []; // User requested: require selecting a desa first!

    return records.filter(r => {
      // Filter Desa
      if (selectedDesa !== '__ALL__') {
        if (!r.DESA || r.DESA.trim().toUpperCase() !== selectedDesa) return false;
      }

      // Filter Span
      if (selectedSpan) {
        if (!r.SPAN || r.SPAN.trim() !== selectedSpan) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullAlamat = [
          r.ALAMAT_KTP_BARIS_1,
          r.ALAMAT_KTP_BARIS_2,
          r.ALAMAT_KTP_BARIS_3,
          r.ALAMAT_KTP_BARIS_4
        ].filter(Boolean).join(' ').toLowerCase();

        const match = 
          (r.NAMA || '').toLowerCase().includes(q) ||
          (r.NIK || '').toLowerCase().includes(q) ||
          (r.NOBID || '').toLowerCase().includes(q) ||
          (r.SPAN || '').toLowerCase().includes(q) ||
          (r.DESA || '').toLowerCase().includes(q) ||
          (r.NOMER_HAK || '').toLowerCase().includes(q) ||
          (r.PENUTUP_LAHAN || '').toLowerCase().includes(q) ||
          (r.KETERANGAN || '').toLowerCase().includes(q) ||
          fullAlamat.includes(q);

        if (!match) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by Desa -> Span -> NoBid numeric
      if (a.DESA !== b.DESA) return (a.DESA || '').localeCompare(b.DESA || '');
      if (a.SPAN !== b.SPAN) return (a.SPAN || '').localeCompare(b.SPAN || '');
      const numA = parseInt(a.NOBID || '0') || 0;
      const numB = parseInt(b.NOBID || '0') || 0;
      return numA - numB;
    });
  }, [records, selectedDesa, selectedSpan, searchQuery]);

  // Aggregate Info for Location Header
  const activeKecamatan = useMemo(() => {
    if (selectedDesa && selectedDesa !== '__ALL__') {
      const stat = desaStats.get(selectedDesa);
      if (stat?.kecamatan) return stat.kecamatan;
    }
    const rec = filteredRecords.find(r => r.KECAMATAN);
    return rec ? rec.KECAMATAN.toUpperCase() : '..........';
  }, [filteredRecords, selectedDesa, desaStats]);

  const activeKabupaten = useMemo(() => {
    if (selectedDesa && selectedDesa !== '__ALL__') {
      const stat = desaStats.get(selectedDesa);
      if (stat?.kabupaten) return stat.kabupaten;
    }
    const rec = filteredRecords.find(r => r.KABUPATEN);
    return rec ? rec.KABUPATEN.toUpperCase() : '..........';
  }, [filteredRecords, selectedDesa, desaStats]);

  // Summary Totals
  const totalLuas = useMemo(() => {
    return filteredRecords.reduce((acc, r) => {
      const val = parseFloat((r.LUAS || '0').toString().replace(',', '.')) || 0;
      return acc + val;
    }, 0);
  }, [filteredRecords]);

  // Helper functions to get non-empty plants and buildings
  const getActivePlants = (record: LandRecord) => {
    if (!record.plants || !Array.isArray(record.plants)) return [];
    return record.plants.filter(p => {
      const hasName = Boolean(p.jenis && p.jenis.trim() !== '');
      const sudah = parseInt(p.sudah_menghasilkan || '0') || 0;
      const belum = parseInt(p.belum_menghasilkan || '0') || 0;
      const kecil = parseInt(p.kecil || '0') || 0;
      const sedang = parseInt(p.sedang || '0') || 0;
      const besar = parseInt(p.besar || '0') || 0;
      const total = sudah + belum + kecil + sedang + besar;
      return hasName || total > 0;
    });
  };

  const getActiveBuildings = (record: LandRecord) => {
    if (!record.buildings || !Array.isArray(record.buildings)) return [];
    return record.buildings.filter(b => {
      const hasLuas = Boolean(b.luas && b.luas.trim() !== '');
      const hasBentuk = Boolean(b.bentuk && b.bentuk.trim() !== '');
      const hasJenis = Boolean(b.jenis && b.jenis.trim() !== '');
      return hasLuas || hasBentuk || hasJenis;
    });
  };

  // Helper function to calculate plant counts per record
  const getPlantTotals = (record: LandRecord) => {
    let jenisList: string[] = [];
    let sudahMengrasilkan = 0;
    let belumMengrasilkan = 0;
    let kecil = 0;
    let sedang = 0;
    let besar = 0;

    if (record.plants && Array.isArray(record.plants)) {
      record.plants.forEach(p => {
        if (p.jenis && p.jenis.trim()) {
          jenisList.push(p.jenis.trim());
        }
        sudahMengrasilkan += parseInt(p.sudah_menghasilkan || '0') || 0;
        belumMengrasilkan += parseInt(p.belum_menghasilkan || '0') || 0;
        kecil += parseInt(p.kecil || '0') || 0;
        sedang += parseInt(p.sedang || '0') || 0;
        besar += parseInt(p.besar || '0') || 0;
      });
    }

    return {
      jenisStr: Array.from(new Set(jenisList)).join(', ') || '-',
      sudahMengrasilkan,
      belumMengrasilkan,
      kecil,
      sedang,
      besar,
      totalTanaman: sudahMengrasilkan + belumMengrasilkan + kecil + sedang + besar
    };
  };

  // Helper function to format building details per record
  const getBuildingDetails = (record: LandRecord) => {
    let bentukList: string[] = [];
    let jenisList: string[] = [];

    if (record.buildings && Array.isArray(record.buildings)) {
      record.buildings.forEach(b => {
        if (b.bentuk && b.bentuk.trim()) bentukList.push(b.bentuk.trim());
        if (b.jenis && b.jenis.trim()) jenisList.push(b.jenis.trim());
      });
    }

    return {
      bentukStr: Array.from(new Set(bentukList)).join(', ') || '-',
      jenisStr: Array.from(new Set(jenisList)).join(', ') || '-',
      count: record.buildings ? record.buildings.length : 0
    };
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!selectedDesa) {
      alert('Silakan pilih Desa terlebih dahulu sebelum mengekspor data nominatif.');
      return;
    }
    if (filteredRecords.length === 0) {
      alert('Belum ada data nominatif yang sesuai filter.');
      return;
    }

    const headers = [
      'NO',
      'SPAN',
      'NO BIDANG',
      'PIHAK YANG BERHAK ATAS TANAH',
      'NAMA',
      'NIK',
      'TTL',
      'JENIS KELAMIN',
      'ALAMAT KTP',
      'PEKERJAAN',
      'JENIS ALAS HAK',
      'NOMER HAK',
      'NAMA PADA ALAS HAK',
      'LUAS ALAS HAK (M2)',
      'PENUTUP LAHAN',
      'STATUS TANAH',
      'LUAS TANAH (M2)',
      'LUAS BANGUNAN (M2)',
      'BENTUK BANGUNAN',
      'JENIS BANGUNAN',
      'JENIS TANAMAN',
      'TANAMAN PRODUKSI - BELUM MENGHASILKAN',
      'TANAMAN PRODUKSI - SUDAH MENGHASILKAN',
      'TANAMAN KERAS - KECIL',
      'TANAMAN KERAS - SEDANG',
      'TANAMAN KERAS - BESAR',
      'PERALIHAN HAK',
      'PROGRES',
      'KONFIRMASI BPN',
      'UPLOAD TRABAS',
      'KEKURANGAN BERKAS',
      'KETERANGAN'
    ];

    const csvRows = [headers.join(',')];

    filteredRecords.forEach((r, idx) => {
      const activePlants = getActivePlants(r);
      const activeBuildings = getActiveBuildings(r);
      const plantsList = activePlants.length > 0 ? activePlants : null;
      const buildingsList = activeBuildings.length > 0 ? activeBuildings : null;
      const subRowsCount = Math.max(1, plantsList?.length || 0, buildingsList?.length || 0);

      const fullAlamat = [
        r.ALAMAT_KTP_BARIS_1,
        r.ALAMAT_KTP_BARIS_2,
        r.ALAMAT_KTP_BARIS_3,
        r.ALAMAT_KTP_BARIS_4
      ].filter(Boolean).join(', ');

      for (let sIdx = 0; sIdx < subRowsCount; sIdx++) {
        const isFirstSub = sIdx === 0;
        const currentPlant = plantsList ? plantsList[sIdx] : null;
        const currentBuilding = buildingsList ? buildingsList[sIdx] : null;

        const valBelum = currentPlant ? parseInt(currentPlant.belum_menghasilkan || '0') || 0 : 0;
        const valSudah = currentPlant ? parseInt(currentPlant.sudah_menghasilkan || '0') || 0 : 0;
        const valKecil = currentPlant ? parseInt(currentPlant.kecil || '0') || 0 : 0;
        const valSedang = currentPlant ? parseInt(currentPlant.sedang || '0') || 0 : 0;
        const valBesar = currentPlant ? parseInt(currentPlant.besar || '0') || 0 : 0;

        const row = [
          isFirstSub ? idx + 1 : '',
          isFirstSub ? `"${r.SPAN || ''}"` : '""',
          isFirstSub ? `"${r.NOBID || ''}"` : '""',
          isFirstSub ? `"${r.STATUS_KEPEMILIKAN || 'PEMILIK DIKETAHUI'}"` : '""',
          isFirstSub ? `"${r.NAMA || ''}"` : '""',
          isFirstSub ? `"${r.NIK || ''}"` : '""',
          isFirstSub ? `"${r.TTL || ''}"` : '""',
          isFirstSub ? `"${r.JENIS_KELAMIN || ''}"` : '""',
          isFirstSub ? `"${fullAlamat}"` : '""',
          isFirstSub ? `"${r.PEKERJAAN || ''}"` : '""',
          isFirstSub ? `"${r.JENIS_ALAS_HAK || ''}"` : '""',
          isFirstSub ? `"${r.NOMER_HAK || ''}"` : '""',
          isFirstSub ? `"${r.NAMA_ALAS_HAK || ''}"` : '""',
          isFirstSub ? `"${r.LUAS_YANG_ADA_PADA_ALAS_HAK || ''}"` : '""',
          isFirstSub ? `"${r.PENUTUP_LAHAN || ''}"` : '""',
          isFirstSub ? `"${r.STATUS_PENUTUP_LAHAN || r.STATUS_KEPEMILIKAN || 'TANAH MASYARAKAT'}"` : '""',
          isFirstSub ? (r.LUAS || '0') : '""',
          `"${currentBuilding?.luas || ''}"`,
          `"${currentBuilding?.bentuk || ''}"`,
          `"${currentBuilding?.jenis || ''}"`,
          `"${currentPlant?.jenis || ''}"`,
          valBelum > 0 ? valBelum : '-',
          valSudah > 0 ? valSudah : '-',
          valKecil > 0 ? valKecil : '-',
          valSedang > 0 ? valSedang : '-',
          valBesar > 0 ? valBesar : '-',
          isFirstSub ? `"${r.JENIS_PERALIHAN_HAK || 'SESUAI'}"` : '""',
          isFirstSub ? `"${r.PROGRES_PEMBERKASAN || 'SELESAI'}"` : '""',
          isFirstSub ? `"${r.KONFIRMASI_BPN || 'TIDAK'}"` : '""',
          isFirstSub ? `"${r.PROGRES_UPLOAD_TRABAS || 'SUDAH'}"` : '""',
          isFirstSub ? `"${r.KEKURANGAN_BERKAS || ''}"` : '""',
          isFirstSub ? `"${r.KETERANGAN || ''}"` : '""'
        ];
        csvRows.push(row.join(','));
      }
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const downloadDesaName = selectedDesa === '__ALL__' ? 'Semua_Desa' : (selectedDesa || 'Semua_Desa');
    link.setAttribute('download', `Daftar_Nominatif_${downloadDesaName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print view trigger
  const handlePrint = () => {
    if (!selectedDesa) {
      alert('Silakan pilih Desa terlebih dahulu sebelum mencetak Daftar Nominatif.');
      return;
    }
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Printable Area Styling */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-nominatif, #printable-nominatif * {
            visibility: visible;
          }
          #printable-nominatif {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 10px;
          }
          .no-print {
            display: none !important;
          }
          table {
            font-size: 8px !important;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #000 !important;
            padding: 2px 4px !important;
            color: black !important;
          }
          th {
            background-color: #f0f0f0 !important;
          }
        }
      `}</style>

      {/* Header Panel (Screen Only) */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 shadow-xl space-y-4 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-widest block font-mono">
                  DOKUMEN RESMI INVENTARISASI ROW
                </span>
                <h1 className="text-lg md:text-xl font-black text-white tracking-tight font-sans">
                  Daftar Nominatif Ground Inventory (1 Bidang = 1 Baris)
                </h1>
              </div>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl font-sans">
              Menampilkan rincian nominatif lengkap tanah, identitas pemilik, alas hak, penutup lahan, data bangunan, serta daftar tanaman secara komprehensif per bidang lahan.
            </p>
          </div>

          {/* Top Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            {/* Tombol Gabung Bidang (Merge) */}
            <button
              onClick={() => {
                if (selectedRecordCodes.size === 2) {
                  const codes = Array.from(selectedRecordCodes);
                  const recA = records.find(r => r.CODE === codes[0]);
                  const recB = records.find(r => r.CODE === codes[1]);
                  if (recA && recB) {
                    if (recA.DESA !== recB.DESA || recA.SPAN !== recB.SPAN) {
                      alert('Kedua bidang yang digabung harus berada di Desa dan Span yang sama!');
                      return;
                    }
                    setMergePair([recA, recB]);
                    setIsMergeModalOpen(true);
                    return;
                  }
                }
                setQuickPickerMode('MERGE');
                setIsQuickPickerOpen(true);
              }}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-700/20 border border-emerald-500/30 flex items-center gap-2 cursor-pointer"
              title="Gabung 2 Bidang Tanah dan sesuaikan nomor urut n+1"
            >
              <GitMerge className="w-4 h-4" />
              <span>Gabung Bidang</span>
              {selectedRecordCodes.size === 2 && (
                <span className="w-4 h-4 rounded-full bg-white text-emerald-800 text-[10px] font-black flex items-center justify-center">
                  2
                </span>
              )}
            </button>

            {/* Tombol Pecah Bidang (Split) */}
            <button
              onClick={() => {
                if (selectedRecordCodes.size === 1) {
                  const code = Array.from(selectedRecordCodes)[0];
                  const rec = records.find(r => r.CODE === code);
                  if (rec) {
                    setSplitTarget(rec);
                    setIsSplitModalOpen(true);
                    return;
                  }
                }
                setQuickPickerMode('SPLIT');
                setIsQuickPickerOpen(true);
              }}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-600/20 border border-amber-500/30 flex items-center gap-2 cursor-pointer"
              title="Pecah 1 Bidang Tanah menjadi nomor-nomor berurutan"
            >
              <Scissors className="w-4 h-4" />
              <span>Pecah Bidang</span>
              {selectedRecordCodes.size === 1 && (
                <span className="w-4 h-4 rounded-full bg-white text-amber-800 text-[10px] font-black flex items-center justify-center">
                  1
                </span>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all shadow-md border border-white/10 flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-sky-400" />
              Cetak / PDF
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all shadow-md border border-white/10 flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              CSV
            </button>
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Filter Desa */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1 font-mono flex items-center justify-between">
              <span>1. PILIH DESA <span className="text-emerald-400">*</span></span>
              {selectedDesa && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDesa('');
                    setSelectedSpan('');
                  }}
                  className="text-amber-400 hover:text-amber-300 text-[10px] font-mono normal-case underline cursor-pointer"
                >
                  Ganti Desa
                </button>
              )}
            </label>
            <select
              value={selectedDesa}
              onChange={(e) => {
                setSelectedDesa(e.target.value);
                setSelectedSpan('');
              }}
              className={`w-full px-3 py-2 bg-slate-900 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${
                !selectedDesa 
                  ? 'border-amber-500/50 text-amber-200 bg-amber-950/20 shadow-sm shadow-amber-500/10' 
                  : 'border-emerald-500/40 text-emerald-300'
              }`}
            >
              <option value="">-- Silakan Pilih Desa Terlebih Dahulu --</option>
              {availableDesas.map(d => {
                const stat = desaStats.get(d);
                return (
                  <option key={d} value={d}>
                    {d} {stat ? `(${stat.count} Bidang)` : ''}
                  </option>
                );
              })}
              <option value="__ALL__">-- Tampilkan Semua Desa (Dapat Menyebabkan Lag) --</option>
            </select>
          </div>

          {/* Filter Span */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1 font-mono">
              2. FILTER SPAN DI DESA
            </label>
            <select
              value={selectedSpan}
              disabled={!selectedDesa}
              onChange={(e) => setSelectedSpan(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-900 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                !selectedDesa 
                  ? 'border-white/5 text-slate-600 cursor-not-allowed bg-slate-950/40' 
                  : 'border-white/10 text-white'
              }`}
            >
              <option value="">Semua Span ({availableSpans.length} Span)</option>
              {availableSpans.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Search Bar */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1 font-mono">
              3. PENCARIAN CEPAT
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                disabled={!selectedDesa}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={selectedDesa ? "Cari Nama, NIK, No Bidang, NIB..." : "Pilih desa terlebih dahulu..."}
                className={`w-full pl-9 pr-3 py-2 bg-slate-900 border rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  !selectedDesa 
                    ? 'border-white/5 text-slate-600 placeholder-slate-600 cursor-not-allowed bg-slate-950/40' 
                    : 'border-white/10 text-white placeholder-slate-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Filter Summary Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="flex items-center gap-2">
            {!selectedDesa ? (
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg text-[11px] font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Status: Silakan Pilih Desa Terlebih Dahulu ({availableDesas.length} Desa Tersedia)
              </span>
            ) : (
              <>
                <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-lg text-[11px] font-bold">
                  Desa: {selectedDesa === '__ALL__' ? 'Semua Desa' : selectedDesa}
                </span>
                <span className="px-2.5 py-1 bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-lg text-[11px] font-bold">
                  Total Bidang: {filteredRecords.length}
                </span>
                <span className="px-2.5 py-1 bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-lg text-[11px] font-bold">
                  Total Luas: {Math.round(totalLuas * 100) / 100} m²
                </span>
              </>
            )}
          </div>

          {(selectedDesa || selectedSpan || searchQuery) && (
            <button
              onClick={() => {
                setSelectedDesa('');
                setSelectedSpan('');
                setSearchQuery('');
              }}
              className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
            >
              Ganti / Reset Filter Desa
            </button>
          )}
        </div>
      </div>

      {/* MAIN DAFTAR NOMINATIF SHEET CONTAINER */}
      <div id="printable-nominatif" className="glass-card rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* OFFICIAL SPREADSHEET TITLE HEADER */}
        <div className="p-6 bg-slate-950 border-b border-white/10 text-center space-y-1">
          <h2 className="text-base md:text-lg font-black text-white tracking-wide uppercase font-sans">
            DAFTAR NOMINATIF INVENTARISASI TANAH, BANGUNAN, DAN/ATAU TANAMAN
          </h2>
          <h3 className="text-xs md:text-sm font-bold text-emerald-400 font-mono tracking-wider">
            {activeProjectName.toUpperCase()}
          </h3>
          <p className="text-xs text-slate-300 font-semibold pt-1 font-mono">
            KABUPATEN: <strong className="text-white underline">{activeKabupaten}</strong> &nbsp; | &nbsp; 
            KECAMATAN: <strong className="text-white underline">{activeKecamatan}</strong> &nbsp; | &nbsp; 
            DESA: <strong className="text-emerald-300 underline">{selectedDesa === '__ALL__' ? 'SEMUA DESA' : (selectedDesa || 'BELUM DIPILIH')}</strong>
            {selectedSpan && (
              <span> &nbsp; | &nbsp; SPAN: <strong className="text-sky-300 underline">{selectedSpan}</strong></span>
            )}
          </p>
        </div>

        {/* VILLAGE SELECTOR (IF NO DESA CHOSEN) OR SCROLLABLE TABLE */}
        {!selectedDesa ? (
          <div className="p-8 md:p-12 bg-slate-950/70 border-t border-white/5 space-y-6">
            {/* Guide & Prompt Header */}
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                Mode Cepat &amp; Bebas Lag (Per-Desa)
              </div>
              <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">
                Pilih Desa untuk Membuka Daftar Nominatif
              </h3>
              <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
                Untuk menjaga performa aplikasi tetap cepat dan lancar tanpa lag, data nominatif ditampilkan per wilayah desa. Silakan pilih salah satu desa di bawah ini:
              </p>
            </div>

            {/* Quick Search for Villages */}
            {availableDesas.length > 6 && (
              <div className="max-w-md mx-auto">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={desaSearch}
                    onChange={(e) => setDesaSearch(e.target.value)}
                    placeholder="Cari nama desa..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                  />
                </div>
              </div>
            )}

            {/* Village Grid Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
              {availableDesas
                .filter(d => !desaSearch.trim() || d.toLowerCase().includes(desaSearch.toLowerCase().trim()))
                .map(desa => {
                  const stat = desaStats.get(desa);
                  return (
                    <div
                      key={desa}
                      onClick={() => {
                        setSelectedDesa(desa);
                        setSelectedSpan('');
                      }}
                      className="group relative p-4 bg-slate-900/80 hover:bg-slate-800/90 border border-white/10 hover:border-emerald-500/50 rounded-2xl transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider block">
                            DESA
                          </span>
                          <h4 className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors">
                            {desa}
                          </h4>
                          {stat?.kecamatan && (
                            <p className="text-[11px] text-slate-400">
                              Kec. {stat.kecamatan}
                            </p>
                          )}
                        </div>
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 group-hover:scale-110 transition-transform">
                          <MapPin className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Total Bidang</span>
                          <span className="font-bold text-white font-mono">{stat?.count || 0} Bidang</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Total Luas</span>
                          <span className="font-bold text-slate-200 font-mono">{Math.round(stat?.totalLuas || 0).toLocaleString('id-ID')} m²</span>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between text-xs text-emerald-400 font-semibold group-hover:text-emerald-300">
                        <span>Buka Data Nominatif</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Option to load all if explicitly desired */}
            <div className="text-center pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setSelectedDesa('__ALL__')}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer"
              >
                Atau klik di sini untuk menampilkan seluruh desa sekaligus ({records.length} total bidang) — Dapat menyebabkan lag
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Scroll within Scroll Control Bar */}
            <div className="px-4 py-2 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-[11px] font-bold text-slate-300">Tampilan Scroll:</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Scroll mandiri vertikal &amp; horizontal di dalam tabel (halaman tidak memanjang)
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setTableHeightMode('compact')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    tableHeightMode === 'compact'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Tinggi Ringkas (400px)"
                >
                  Ringkas (400px)
                </button>
                <button
                  type="button"
                  onClick={() => setTableHeightMode('standard')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    tableHeightMode === 'standard'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Tinggi Standar (580px)"
                >
                  Standar (580px)
                </button>
                <button
                  type="button"
                  onClick={() => setTableHeightMode('tall')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    tableHeightMode === 'tall'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Layar Penuh"
                >
                  Layar Penuh
                </button>
              </div>
            </div>

            {/* SCROLLABLE TABLE */}
            <div className={`table-scroll-container overflow-auto border-t-0 border border-white/10 rounded-b-2xl scrollbar-thin scrollbar-thumb-slate-700 bg-slate-950/80 shadow-2xl ${
              tableHeightMode === 'compact'
                ? 'max-h-[400px]'
                : tableHeightMode === 'standard'
                ? 'max-h-[580px]'
                : 'max-h-[calc(100vh-220px)]'
            }`}>
            <table className="w-full text-left text-xs border-collapse min-w-[2200px]">
            <thead className="sticky top-0 z-20 bg-slate-900 border-b border-white/10 shadow-lg">
              {/* HEADER ROW 1 */}
              <tr className="bg-slate-900 border-b border-white/10 text-[10px] font-black uppercase text-slate-300 text-center font-mono tracking-wider">
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 w-10 text-center no-print">
                  <span className="text-[9px] block">PILIH</span>
                </th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 w-10">NO</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[100px]">SPAN</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 w-14">NO BIDANG</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[120px]">PIHAK YANG BERHAK ATAS TANAH</th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-white/10 min-w-[220px]">IDENTITAS PEMILIK</th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-white/10 min-w-[200px]">BUKTI PENGUASAAN / KEPEMILIKAN</th>
                
                {/* TANAH GROUP */}
                <th colSpan={3} className="py-1 px-2 border-r border-white/10 bg-emerald-950/40 text-emerald-300">TANAH</th>
                
                {/* BANGUNAN GROUP */}
                <th colSpan={3} className="py-1 px-2 border-r border-white/10 bg-sky-950/40 text-sky-300">BANGUNAN</th>
                
                {/* TANAMAN GROUP */}
                <th colSpan={6} className="py-1 px-2 border-r border-white/10 bg-amber-950/40 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-200">TANAMAN</th>

                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[90px]">PERALIHAN HAK</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[90px]">PROGRES</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[90px]">KONFIRMASI BPN</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[90px]">UPLOAD TRABAS</th>
                <th rowSpan={2} className="py-2.5 px-2 border-r border-white/10 min-w-[120px]">KEKURANGAN BERKAS</th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-white/10 min-w-[160px]">KETERANGAN</th>
                <th rowSpan={2} className="py-2.5 px-2 w-28 no-print">AKSI</th>
              </tr>

              {/* HEADER ROW 2 (SUB-HEADERS) */}
              <tr className="bg-slate-900/95 border-b border-white/10 text-[9px] font-black uppercase text-slate-400 text-center font-mono">
                {/* TANAH */}
                <th className="py-1.5 px-2 border-r border-white/10 min-w-[110px] bg-emerald-950/20">PENUTUP LAHAN</th>
                <th className="py-1.5 px-2 border-r border-white/10 min-w-[110px] bg-emerald-950/20">STATUS</th>
                <th className="py-1.5 px-2 border-r border-white/10 w-20 bg-emerald-950/20">LUAS (M²)</th>

                {/* BANGUNAN */}
                <th className="py-1.5 px-2 border-r border-white/10 w-20 bg-sky-950/20">LUAS (M²)</th>
                <th className="py-1.5 px-2 border-r border-white/10 min-w-[100px] bg-sky-950/20">BENTUK</th>
                <th className="py-1.5 px-2 border-r border-white/10 min-w-[100px] bg-sky-950/20">JENIS</th>

                {/* TANAMAN */}
                <th className="py-1.5 px-2 border-r border-white/10 min-w-[130px] bg-amber-950/20 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-100">JENIS TANAMAN</th>
                <th className="py-1.5 px-1 border-r border-white/10 w-16 bg-amber-950/20 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-100">BELUM MGH.</th>
                <th className="py-1.5 px-1 border-r border-white/10 w-16 bg-amber-950/20 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-100">SUDAH MGH.</th>
                <th className="py-1.5 px-1 border-r border-white/10 w-12 bg-amber-950/20 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-100">KECIL</th>
                <th className="py-1.5 px-1 border-r border-white/10 w-12 bg-amber-950/20 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-100">SEDANG</th>
                <th className="py-1.5 px-1 border-r border-white/10 w-12 bg-amber-950/20 text-white [html.light_&]:!text-slate-900 [html.light_&]:!bg-slate-100">BESAR</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 font-sans">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={26} className="py-12 text-center text-slate-400 space-y-2">
                    <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-300">Belum ada data nominatif yang sesuai filter</p>
                    <p className="text-xs text-slate-500">Silakan ubah filter Desa/Span atau masukkan data bidang baru melalui menu Input Lahan.</p>
                  </td>
                </tr>
              ) : (
                filteredRecords.flatMap((r, idx) => {
                  const activePlants = getActivePlants(r);
                  const activeBuildings = getActiveBuildings(r);
                  const plantsList = activePlants.length > 0 ? activePlants : null;
                  const buildingsList = activeBuildings.length > 0 ? activeBuildings : null;
                  const subRowsCount = Math.max(1, plantsList?.length || 0, buildingsList?.length || 0);

                  const fullAlamat = [
                    r.ALAMAT_KTP_BARIS_1,
                    r.ALAMAT_KTP_BARIS_2,
                    r.ALAMAT_KTP_BARIS_3,
                    r.ALAMAT_KTP_BARIS_4
                  ].filter(Boolean).join('\n');

                  const subRows = [];

                  for (let sIdx = 0; sIdx < subRowsCount; sIdx++) {
                    const isFirstSub = sIdx === 0;
                    const currentPlant = plantsList ? plantsList[sIdx] : null;
                    const currentBuilding = buildingsList ? buildingsList[sIdx] : null;
                    const valBelum = currentPlant ? (parseInt(currentPlant.belum_menghasilkan || '0') || 0) : 0;
                    const valSudah = currentPlant ? (parseInt(currentPlant.sudah_menghasilkan || '0') || 0) : 0;
                    const valKecil = currentPlant ? (parseInt(currentPlant.kecil || '0') || 0) : 0;
                    const valSedang = currentPlant ? (parseInt(currentPlant.sedang || '0') || 0) : 0;
                    const valBesar = currentPlant ? (parseInt(currentPlant.besar || '0') || 0) : 0;

                    subRows.push(
                      <tr 
                        key={`nom-rec-${idx}-sub-${sIdx}`} 
                        className={`hover:bg-white/5 transition-all text-xs ${!isFirstSub ? 'bg-slate-900/30' : ''} ${sIdx === subRowsCount - 1 ? 'border-b border-white/10' : 'border-b border-white/5'} ${
                          selectedRecordCodes.has(r.CODE) ? 'bg-emerald-950/20' : ''
                        }`}
                      >
                        {/* MAIN PARCEL COLUMNS (RowSpan for first sub-row) */}
                        {isFirstSub && (
                          <>
                            {/* CHECKBOX PILIH UNTUK MUTASI (PECAH / GABUNG) */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 text-center border-r border-white/5 align-top no-print">
                              <button
                                type="button"
                                onClick={() => toggleSelectRecord(r)}
                                className={`p-1 rounded-md transition-all cursor-pointer inline-flex items-center justify-center ${
                                  selectedRecordCodes.has(r.CODE)
                                    ? 'text-emerald-300 bg-emerald-500/20 ring-1 ring-emerald-500/50 scale-105'
                                    : 'text-slate-600 hover:text-slate-300 hover:bg-white/5'
                                }`}
                                title={
                                  selectedRecordCodes.has(r.CODE)
                                    ? 'Batalkan pilihan bidang ini'
                                    : 'Pilih bidang ini untuk digabung atau dipecah'
                                }
                              >
                                {selectedRecordCodes.has(r.CODE) ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>

                            {/* NO */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 text-center border-r border-white/5 font-mono text-slate-400 align-top">
                              {idx + 1}
                            </td>

                            {/* SPAN */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 font-mono font-bold text-sky-300 text-center align-top">
                              {r.SPAN || '-'}
                            </td>

                            {/* NO BIDANG DENGAN BADGE MUTASI */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 text-center border-r border-white/5 align-top">
                              <div className="flex flex-col items-center gap-1">
                                <span className="px-1.5 py-0.5 bg-slate-900 border border-white/10 rounded font-mono font-bold text-white">
                                  {r.NOBID || '-'}
                                </span>
                                {r.KETERANGAN?.includes('Penggabungan Bidang') && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap" title={r.KETERANGAN}>
                                    GABUNG
                                  </span>
                                )}
                                {r.KETERANGAN?.includes('pecahan') && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap" title={r.KETERANGAN}>
                                    PECAH
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* PIHAK YANG BERHAK ATAS TANAH */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 font-bold text-slate-200 text-center text-[11px] align-top">
                              <span className={`px-2 py-1 rounded text-[10px] font-mono block ${
                                (r.STATUS_KEPEMILIKAN || '').includes('TKD') || (r.STATUS_KEPEMILIKAN || '').includes('PEMDES')
                                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              }`}>
                                {r.STATUS_KEPEMILIKAN || 'PEMILIK DIKETAHUI'}
                              </span>
                            </td>

                            {/* IDENTITAS PEMILIK (Clean stacked values without labels) */}
                            <td rowSpan={subRowsCount} className="py-3 px-3 border-r border-white/5 space-y-0.5 align-top">
                              <div className="font-bold text-white text-xs uppercase leading-snug">
                                {r.NAMA || '-'}
                              </div>
                              {r.NIK && (
                                <div className="text-[11px] font-mono text-slate-300">
                                  {r.NIK}
                                </div>
                              )}
                              {r.TTL && (
                                <div className="text-[11px] text-slate-300 uppercase">
                                  {r.TTL}
                                </div>
                              )}
                              {r.JENIS_KELAMIN && (
                                <div className="text-[11px] text-slate-300 uppercase">
                                  {r.JENIS_KELAMIN}
                                </div>
                              )}
                              {fullAlamat && (
                                <div className="text-[11px] text-slate-300 uppercase whitespace-pre-line leading-tight pt-0.5">
                                  {fullAlamat}
                                </div>
                              )}
                              {r.PEKERJAAN && (
                                <div className="text-[11px] text-slate-300 uppercase font-medium pt-0.5">
                                  {r.PEKERJAAN}
                                </div>
                              )}
                            </td>

                            {/* BUKTI PENGUASAAN / KEPEMILIKAN */}
                            <td rowSpan={subRowsCount} className="py-3 px-3 border-r border-white/5 space-y-0.5 align-top">
                              <span className="text-[10px] font-extrabold uppercase text-amber-400 block font-mono">
                                {r.JENIS_ALAS_HAK || 'LAINNYA'}
                              </span>
                              {r.NOMER_HAK && (
                                <div className="text-xs font-mono font-bold text-white">
                                  {r.NOMER_HAK}
                                </div>
                              )}
                              {r.NAMA_ALAS_HAK && (
                                <div className="text-[10px] text-slate-300">
                                  {r.NAMA_ALAS_HAK}
                                </div>
                              )}
                              {r.LUAS_YANG_ADA_PADA_ALAS_HAK && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {r.LUAS_YANG_ADA_PADA_ALAS_HAK} M²
                                </div>
                              )}
                            </td>

                            {/* TANAH: PENUTUP LAHAN */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 font-semibold text-slate-200 uppercase align-top">
                              {r.PENUTUP_LAHAN || '-'}
                            </td>

                            {/* TANAH: STATUS */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 font-mono text-[10px] text-slate-300 uppercase align-top">
                              {r.STATUS_PENUTUP_LAHAN || r.STATUS_KEPEMILIKAN || 'TANAH MASYARAKAT'}
                            </td>

                            {/* TANAH: LUAS (M2) */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 font-mono font-black text-emerald-400 text-right align-top">
                              {r.LUAS ? `${r.LUAS} M²` : '0 M²'}
                            </td>
                          </>
                        )}

                        {/* BANGUNAN: LUAS (M2) */}
                        <td className="py-2.5 px-2 border-r border-white/5 font-mono font-bold text-sky-300 text-right align-middle">
                          {currentBuilding?.luas ? `${currentBuilding.luas} M²` : '-'}
                        </td>

                        {/* BANGUNAN: BENTUK */}
                        <td className="py-2.5 px-2 border-r border-white/5 text-slate-300 align-middle">
                          {currentBuilding?.bentuk || '-'}
                        </td>

                        {/* BANGUNAN: JENIS */}
                        <td className="py-2.5 px-2 border-r border-white/5 text-slate-300 align-middle">
                          {currentBuilding?.jenis || '-'}
                        </td>

                        {/* TANAMAN: JENIS TANAMAN */}
                        <td className={`py-2.5 px-2 border-r border-white/5 uppercase text-[11px] align-middle ${
                          currentPlant?.jenis 
                            ? 'text-white [html.light_&]:!text-slate-900 font-bold' 
                            : 'text-slate-500 [html.light_&]:!text-slate-400 font-normal'
                        }`}>
                          {currentPlant?.jenis || '-'}
                        </td>

                        {/* TANAMAN: BELUM MENGHASILKAN (Swapped to come first) */}
                        <td className={`py-2.5 px-1 border-r border-white/5 text-center font-mono align-middle ${
                          valBelum > 0 
                            ? 'font-bold text-white [html.light_&]:!text-slate-900' 
                            : 'font-normal text-slate-500 [html.light_&]:!text-slate-400'
                        }`}>
                          {valBelum > 0 ? valBelum : '-'}
                        </td>

                        {/* TANAMAN: SUDAH MENGHASILKAN (Swapped to come second) */}
                        <td className={`py-2.5 px-1 border-r border-white/5 text-center font-mono align-middle ${
                          valSudah > 0 
                            ? 'font-bold text-white [html.light_&]:!text-slate-900' 
                            : 'font-normal text-slate-500 [html.light_&]:!text-slate-400'
                        }`}>
                          {valSudah > 0 ? valSudah : '-'}
                        </td>

                        {/* TANAMAN KERAS: KECIL */}
                        <td className={`py-2.5 px-1 border-r border-white/5 text-center font-mono align-middle ${
                          valKecil > 0 
                            ? 'font-bold text-white [html.light_&]:!text-slate-900' 
                            : 'font-normal text-slate-500 [html.light_&]:!text-slate-400'
                        }`}>
                          {valKecil > 0 ? valKecil : '-'}
                        </td>

                        {/* TANAMAN KERAS: SEDANG */}
                        <td className={`py-2.5 px-1 border-r border-white/5 text-center font-mono align-middle ${
                          valSedang > 0 
                            ? 'font-bold text-white [html.light_&]:!text-slate-900' 
                            : 'font-normal text-slate-500 [html.light_&]:!text-slate-400'
                        }`}>
                          {valSedang > 0 ? valSedang : '-'}
                        </td>

                        {/* TANAMAN KERAS: BESAR */}
                        <td className={`py-2.5 px-1 border-r border-white/5 text-center font-mono align-middle ${
                          valBesar > 0 
                            ? 'font-bold text-white [html.light_&]:!text-slate-900' 
                            : 'font-normal text-slate-500 [html.light_&]:!text-slate-400'
                        }`}>
                          {valBesar > 0 ? valBesar : '-'}
                        </td>

                        {/* TRAILING PARCEL COLUMNS (RowSpan for first sub-row) */}
                        {isFirstSub && (
                          <>
                            {/* PERALIHAN HAK */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 text-center align-top">
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-bold rounded">
                                {r.JENIS_PERALIHAN_HAK || 'SESUAI'}
                              </span>
                            </td>

                            {/* PROGRES */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 text-center align-top">
                              <span className="px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[10px] font-bold rounded">
                                {r.PROGRES_PEMBERKASAN || 'SELESAI'}
                              </span>
                            </td>

                            {/* KONFIRMASI BPN */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 text-center font-mono text-[10px] text-slate-300 align-top">
                              {r.KONFIRMASI_BPN || 'TIDAK'}
                            </td>

                            {/* UPLOAD TRABAS */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 text-center align-top">
                              <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold text-[10px] rounded shadow-sm">
                                {r.PROGRES_UPLOAD_TRABAS || 'SUDAH'}
                              </span>
                            </td>

                            {/* KEKURANGAN BERKAS */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 border-r border-white/5 text-slate-400 text-[10px] align-top">
                              {r.KEKURANGAN_BERKAS || '-'}
                            </td>

                            {/* KETERANGAN */}
                            <td rowSpan={subRowsCount} className="py-3 px-3 border-r border-white/5 font-mono text-[10px] text-slate-300 align-top">
                              {r.KETERANGAN || '-'}
                            </td>

                            {/* AKSI */}
                            <td rowSpan={subRowsCount} className="py-3 px-2 text-center no-print align-top">
                              <div className="flex items-center justify-center gap-1">
                                {/* Tombol Pecah Bidang (Split) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSplitTarget(r);
                                    setIsSplitModalOpen(true);
                                  }}
                                  className="p-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg transition-all cursor-pointer border border-amber-500/30"
                                  title={`Pecah Bidang No. ${r.NOBID} (Split)`}
                                >
                                  <Scissors className="w-3.5 h-3.5" />
                                </button>

                                {/* Tombol Gabung Bidang (Merge) */}
                                <button
                                  type="button"
                                  onClick={() => handleQuickMergeClick(r)}
                                  className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                                    selectedRecordCodes.has(r.CODE)
                                      ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-500/50'
                                      : 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border-emerald-500/30'
                                  }`}
                                  title={
                                    selectedRecordCodes.has(r.CODE)
                                      ? `Bidang No. ${r.NOBID} sedang dipilih. Klik bidang lain untuk digabung.`
                                      : `Pilih Bidang No. ${r.NOBID} untuk digabung`
                                  }
                                >
                                  <GitMerge className="w-3.5 h-3.5" />
                                </button>

                                {onNavigateToInput && (
                                  <button
                                    onClick={() => onNavigateToInput(r)}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer border border-white/10"
                                    title="Edit Data Bidang Ini"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedRecordDetail(r)}
                                  className="p-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold rounded-lg transition-all cursor-pointer border border-amber-500/30"
                                  title="Lihat Detil Modal"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {/* Tombol Hapus Bidang (Khusus Admin) */}
                                {role === 'ADMIN' && (
                                  <button
                                    type="button"
                                    onClick={() => setRecordToDelete(r)}
                                    className="p-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg transition-all cursor-pointer border border-rose-500/30"
                                    title={`Hapus Bidang No. ${r.NOBID} (Khusus Admin)`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  }

                  if (idx < filteredRecords.length - 1) {
                    subRows.push(
                      <tr key={`nom-rec-${idx}-sep`} className="bg-slate-950/90 border-t border-b border-white/10 h-3">
                        <td colSpan={26} className="py-1 px-0 bg-slate-900/40 text-center font-mono text-[9px] text-slate-600 border-none">
                          <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent w-full" />
                        </td>
                      </tr>
                    );
                  }

                  return subRows;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
      </div>

      {/* MODAL DETIL NOMINATIF INDIVIDUAL */}
      {selectedRecordDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="glass-card max-w-2xl w-full rounded-3xl border border-white/15 shadow-2xl overflow-hidden my-8 animate-scaleUp">
            <div className="p-5 bg-slate-950 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Detil Nominatif — Bidang No. {selectedRecordDetail.NOBID || '-'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Desa {selectedRecordDetail.DESA} • Span {selectedRecordDetail.SPAN}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedRecordDetail(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin text-xs">
              <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 font-mono block">
                  IDENTITAS PEMILIK
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>Nama: <strong className="text-white">{selectedRecordDetail.NAMA}</strong></div>
                  <div>NIK: <strong className="text-white font-mono">{selectedRecordDetail.NIK}</strong></div>
                  <div>TTL: <span className="text-slate-200">{selectedRecordDetail.TTL}</span></div>
                  <div>Pekerjaan: <span className="text-slate-200">{selectedRecordDetail.PEKERJAAN}</span></div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 font-mono block">
                  BUKTI ALAS HAK & TANAH
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>Jenis Alas Hak: <strong className="text-white">{selectedRecordDetail.JENIS_ALAS_HAK}</strong></div>
                  <div>No. Hak: <strong className="text-white font-mono">{selectedRecordDetail.NOMER_HAK}</strong></div>
                  <div>Penutup Lahan: <span className="text-emerald-300 font-bold">{selectedRecordDetail.PENUTUP_LAHAN}</span></div>
                  <div>Luas Lahan: <strong className="text-emerald-400 font-mono">{selectedRecordDetail.LUAS} M²</strong></div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-white [html.light_&]:!text-slate-900 font-mono block">
                  INVENTARISASI BANGUNAN & TANAMAN
                </span>
                <div className="space-y-1 text-slate-300">
                  <div>Bangunan: <span className="text-white [html.light_&]:!text-slate-900 font-semibold">{getBuildingDetails(selectedRecordDetail).bentukStr}</span></div>
                  <div>Daftar Tanaman: <span className="text-white [html.light_&]:!text-slate-900 font-semibold">{getPlantTotals(selectedRecordDetail).jenisStr}</span></div>
                  <div>Total Tanaman: <strong className="text-white [html.light_&]:!text-slate-900 font-mono font-bold">{getPlantTotals(selectedRecordDetail).totalTanaman} Batang/Pohon</strong></div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono">Kode Record: {selectedRecordDetail.CODE}</span>
              <div className="flex items-center gap-2">
                {role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      const rec = selectedRecordDetail;
                      setSelectedRecordDetail(null);
                      setRecordToDelete(rec);
                    }}
                    className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold rounded-xl transition-all border border-rose-500/30 flex items-center gap-1.5 cursor-pointer"
                    title="Hapus data bidang ini secara permanen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Bidang</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRecordDetail(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ACTION BANNER UNTUK PECAH & GABUNG BIDANG */}
      {selectedRecordCodes.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-emerald-500/30 shadow-2xl backdrop-blur-xl px-5 py-3 rounded-2xl flex items-center gap-4 text-xs animate-fadeIn max-w-xl w-11/12 sm:w-auto">
          <div className="flex items-center gap-2 text-white">
            <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30 shrink-0">
              {selectedRecordCodes.size}
            </span>
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span>{selectedRecordCodes.size === 1 ? '1 Bidang Dipilih' : '2 Bidang Dipilih'}</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  ({Array.from(selectedRecordCodes).map(c => records.find(r => r.CODE === c)?.NOBID).filter(Boolean).map(n => `No. ${n}`).join(' & ')})
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {selectedRecordCodes.size === 1 
                  ? 'Pilih 1 bidang lagi untuk digabung, atau pecah bidang ini.' 
                  : 'Siap untuk digabungkan menjadi 1 nomor induk.'}
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-white/10 shrink-0 hidden sm:block" />

          <div className="flex items-center gap-2 shrink-0">
            {selectedRecordCodes.size === 1 && (
              <button
                type="button"
                onClick={() => {
                  const code = Array.from(selectedRecordCodes)[0];
                  const rec = records.find(r => r.CODE === code);
                  if (rec) {
                    setSplitTarget(rec);
                    setIsSplitModalOpen(true);
                  }
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/20 cursor-pointer"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Pecah Bidang Ini</span>
              </button>
            )}

            {role === 'ADMIN' && selectedRecordCodes.size === 1 && (
              <button
                type="button"
                onClick={() => {
                  const code = Array.from(selectedRecordCodes)[0];
                  const rec = records.find(r => r.CODE === code);
                  if (rec) setRecordToDelete(rec);
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Bidang</span>
              </button>
            )}

            {selectedRecordCodes.size === 2 && (
              <button
                type="button"
                onClick={() => {
                  const codes = Array.from(selectedRecordCodes);
                  const recA = records.find(r => r.CODE === codes[0]);
                  const recB = records.find(r => r.CODE === codes[1]);
                  if (recA && recB) {
                    if (recA.DESA !== recB.DESA || recA.SPAN !== recB.SPAN) {
                      alert('Penggabungan bidang harus berada dalam Desa dan Span yang sama!');
                      return;
                    }
                    setMergePair([recA, recB]);
                    setIsMergeModalOpen(true);
                  }
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>Gabung 2 Bidang Ini</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedRecordCodes(new Set())}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 text-xs cursor-pointer"
              title="Batalkan pilihan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL GABUNG BIDANG (MERGE) */}
      {isMergeModalOpen && mergePair && (
        <MergeParcelModal
          isOpen={isMergeModalOpen}
          onClose={() => {
            setIsMergeModalOpen(false);
            setMergePair(null);
          }}
          recordA={mergePair[0]}
          recordB={mergePair[1]}
          allRecords={records}
          onConfirmMerge={async (updatedRecords, logMsg) => {
            setSelectedRecordCodes(new Set());
            setIsMergeModalOpen(false);
            setMergePair(null);
            if (onBatchUpdateRecords) {
              await onBatchUpdateRecords(updatedRecords, logMsg);
            }
          }}
        />
      )}

      {/* MODAL PECAH BIDANG (SPLIT) */}
      {isSplitModalOpen && splitTarget && (
        <SplitParcelModal
          isOpen={isSplitModalOpen}
          onClose={() => {
            setIsSplitModalOpen(false);
            setSplitTarget(null);
          }}
          targetRecord={splitTarget}
          allRecords={records}
          onConfirmSplit={async (updatedRecords, logMsg) => {
            setSelectedRecordCodes(new Set());
            setIsSplitModalOpen(false);
            setSplitTarget(null);
            if (onBatchUpdateRecords) {
              await onBatchUpdateRecords(updatedRecords, logMsg);
            }
          }}
        />
      )}

      {/* MODAL QUICK PICKER (DARI TOMBOL HEADER) */}
      {isQuickPickerOpen && (
        <QuickParcelPickerModal
          isOpen={isQuickPickerOpen}
          onClose={() => setIsQuickPickerOpen(false)}
          mode={quickPickerMode}
          allRecords={records}
          initialDesa={selectedDesa !== '__ALL__' ? selectedDesa : ''}
          initialSpan={selectedSpan !== '__ALL__' ? selectedSpan : ''}
          onSelectForMerge={(recA, recB) => {
            setMergePair([recA, recB]);
            setIsMergeModalOpen(true);
          }}
          onSelectForSplit={(target) => {
            setSplitTarget(target);
            setIsSplitModalOpen(true);
          }}
        />
      )}

      {/* MODAL HAPUS BIDANG (KHUSUS ADMIN) */}
      {recordToDelete && (
        <DeleteParcelModal
          isOpen={!!recordToDelete}
          onClose={() => setRecordToDelete(null)}
          targetRecord={recordToDelete}
          allRecords={records}
          onConfirmDelete={async (updatedRecords, logMsg) => {
            const target = recordToDelete;
            setSelectedRecordCodes(prev => {
              const next = new Set(prev);
              next.delete(target.CODE);
              return next;
            });
            setRecordToDelete(null);
            if (onDeleteRecord) {
              await onDeleteRecord(target, true);
            } else if (onBatchUpdateRecords) {
              await onBatchUpdateRecords(updatedRecords, logMsg);
            }
          }}
        />
      )}
    </div>
  );
}
