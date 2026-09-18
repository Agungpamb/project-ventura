import React, { useState, useMemo } from 'react';
import { GitMerge, Scissors, X, ArrowRight, AlertCircle } from 'lucide-react';
import { LandRecord } from '../types';

interface QuickParcelPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'MERGE' | 'SPLIT';
  allRecords: LandRecord[];
  initialDesa?: string;
  initialSpan?: string;
  onSelectForMerge: (recordA: LandRecord, recordB: LandRecord) => void;
  onSelectForSplit: (record: LandRecord) => void;
}

export default function QuickParcelPickerModal({
  isOpen,
  onClose,
  mode,
  allRecords,
  initialDesa = '',
  initialSpan = '',
  onSelectForMerge,
  onSelectForSplit
}: QuickParcelPickerModalProps) {
  // Available Desas
  const availableDesas = useMemo(() => {
    const set = new Set<string>();
    allRecords.forEach(r => {
      if (r.DESA && r.DESA.trim()) set.add(r.DESA.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [allRecords]);

  const [selectedDesa, setSelectedDesa] = useState<string>(initialDesa || (availableDesas[0] || ''));

  // Available Spans for selected Desa
  const availableSpans = useMemo(() => {
    const set = new Set<string>();
    allRecords.forEach(r => {
      if (r.DESA?.trim().toUpperCase() === selectedDesa && r.SPAN?.trim()) {
        set.add(r.SPAN.trim());
      }
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
  }, [allRecords, selectedDesa]);

  const [selectedSpan, setSelectedSpan] = useState<string>(initialSpan || (availableSpans[0] || ''));

  // When desa changes, reset or pick first span
  React.useEffect(() => {
    if (availableSpans.length > 0 && !availableSpans.includes(selectedSpan)) {
      setSelectedSpan(availableSpans[0]);
    }
  }, [selectedDesa, availableSpans]);

  // Parcels in this Desa & Span
  const availableParcels = useMemo(() => {
    return allRecords.filter(r => 
      r.DESA?.trim().toUpperCase() === selectedDesa &&
      r.SPAN?.trim() === selectedSpan
    ).sort((a, b) => {
      const numA = parseInt((a.NOBID || '').replace(/\D/g, '')) || 0;
      const numB = parseInt((b.NOBID || '').replace(/\D/g, '')) || 0;
      if (numA !== numB) return numA - numB;
      return (a.NOBID || '').localeCompare(b.NOBID || '');
    });
  }, [allRecords, selectedDesa, selectedSpan]);

  const [parcelCodeA, setParcelCodeA] = useState<string>('');
  const [parcelCodeB, setParcelCodeB] = useState<string>('');
  const [targetSplitCode, setTargetSplitCode] = useState<string>('');

  React.useEffect(() => {
    if (availableParcels.length > 0) {
      setParcelCodeA(availableParcels[0]?.CODE || '');
      setParcelCodeB(availableParcels[1]?.CODE || '');
      setTargetSplitCode(availableParcels[0]?.CODE || '');
    } else {
      setParcelCodeA('');
      setParcelCodeB('');
      setTargetSplitCode('');
    }
  }, [availableParcels]);

  if (!isOpen) return null;

  const handleProceed = () => {
    if (mode === 'MERGE') {
      if (!parcelCodeA || !parcelCodeB) {
        alert('Silakan pilih kedua bidang yang ingin digabungkan.');
        return;
      }
      if (parcelCodeA === parcelCodeB) {
        alert('Bidang yang digabungkan tidak boleh sama! Pilih 2 nomor bidang berbeda.');
        return;
      }
      const recA = availableParcels.find(r => r.CODE === parcelCodeA);
      const recB = availableParcels.find(r => r.CODE === parcelCodeB);
      if (recA && recB) {
        onClose();
        onSelectForMerge(recA, recB);
      }
    } else {
      if (!targetSplitCode) {
        alert('Silakan pilih bidang yang ingin dipecah.');
        return;
      }
      const target = availableParcels.find(r => r.CODE === targetSplitCode);
      if (target) {
        onClose();
        onSelectForSplit(target);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b border-white/10 flex items-center justify-between ${
          mode === 'MERGE' ? 'bg-emerald-950/40' : 'bg-amber-950/40'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              mode === 'MERGE' 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {mode === 'MERGE' ? <GitMerge className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {mode === 'MERGE' ? 'Pilih 2 Bidang untuk Digabung' : 'Pilih Bidang untuk Dipecah'}
              </h3>
              <p className="text-xs text-slate-400">
                Pilih lokasi Desa, Span, dan nomor bidang yang dituju
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300">
          {/* Desa & Span Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Desa
              </label>
              <select
                value={selectedDesa}
                onChange={(e) => setSelectedDesa(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                {availableDesas.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Span
              </label>
              <select
                value={selectedSpan}
                onChange={(e) => setSelectedSpan(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
              >
                {availableSpans.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {availableParcels.length === 0 ? (
            <div className="p-4 bg-slate-950/60 rounded-xl border border-white/10 text-center text-slate-400 space-y-1">
              <AlertCircle className="w-5 h-5 mx-auto text-amber-400" />
              <p>Tidak ada bidang tanah yang tercatat di Desa {selectedDesa} Span {selectedSpan}.</p>
            </div>
          ) : mode === 'MERGE' ? (
            /* Merge Selectors */
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-emerald-400 uppercase mb-1">
                  Bidang Pertama (A)
                </label>
                <select
                  value={parcelCodeA}
                  onChange={(e) => setParcelCodeA(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 font-mono"
                >
                  {availableParcels.map(p => (
                    <option key={p.CODE} value={p.CODE}>
                      No. {p.NOBID} — {p.NAMA || '(Tanpa Nama)'} ({p.LUAS || 0} m²)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-400 uppercase mb-1">
                  Bidang Kedua (B)
                </label>
                <select
                  value={parcelCodeB}
                  onChange={(e) => setParcelCodeB(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 font-mono"
                >
                  {availableParcels.map(p => (
                    <option key={p.CODE} value={p.CODE}>
                      No. {p.NOBID} — {p.NAMA || '(Tanpa Nama)'} ({p.LUAS || 0} m²)
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-slate-400">
                Bidang dengan nomor terkecil akan dipertahankan sebagai nomor induk, dan urutan nomor di atasnya otomatis disesuaikan <strong>n+1</strong>.
              </p>
            </div>
          ) : (
            /* Split Selector */
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1">
                  Pilih Bidang yang Ingin Dipecah
                </label>
                <select
                  value={targetSplitCode}
                  onChange={(e) => setTargetSplitCode(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
                >
                  {availableParcels.map(p => (
                    <option key={p.CODE} value={p.CODE}>
                      No. {p.NOBID} — {p.NAMA || '(Tanpa Nama)'} ({p.LUAS || 0} m²)
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-slate-400">
                Bidang ini akan dipecah menjadi beberapa nomor berurutan murni (contoh No. 3 menjadi 3, 4, dst), dan bidang seterusnya otomatis digeser maju <strong>n+1</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleProceed}
            disabled={availableParcels.length === 0}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-40 text-white ${
              mode === 'MERGE' 
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20' 
                : 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/20'
            }`}
          >
            <span>Lanjutkan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
