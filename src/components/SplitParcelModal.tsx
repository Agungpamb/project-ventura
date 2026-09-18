import React, { useState, useMemo } from 'react';
import { 
  Scissors, X, AlertTriangle, CheckCircle2, 
  Plus, Trash2, ShieldAlert, ArrowRight
} from 'lucide-react';
import { LandRecord } from '../types';
import { 
  previewSplitParcel, 
  executeSplitParcel, 
  parseNobid, 
  SplitPartInput 
} from '../lib/parcelManagement';

interface SplitParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRecord: LandRecord;
  allRecords: LandRecord[];
  onConfirmSplit: (updatedRecords: LandRecord[], logSummary: string) => Promise<void>;
}

export default function SplitParcelModal({
  isOpen,
  onClose,
  targetRecord,
  allRecords,
  onConfirmSplit
}: SplitParcelModalProps) {
  const originalLuas = useMemo(() => {
    return parseFloat((targetRecord.LUAS || '0').replace(',', '.')) || 0;
  }, [targetRecord.LUAS]);

  const pTarget = useMemo(() => parseNobid(targetRecord.NOBID), [targetRecord.NOBID]);
  const splitNum = pTarget.num;

  // Initial 2 parts
  const halfLuas = Math.round((originalLuas / 2) * 100) / 100;
  const remLuas = Math.round((originalLuas - halfLuas) * 100) / 100;

  const [parts, setParts] = useState<SplitPartInput[]>([
    {
      luas: halfLuas,
      nama: targetRecord.NAMA || '',
      nik: targetRecord.NIK || '',
      keterangan: 'Bagian 1 yang dipertahankan pemilik asal'
    },
    {
      luas: remLuas,
      nama: '',
      nik: '',
      keterangan: 'Bagian pecahan baru (dapat dilengkapi tim lapangan)'
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Total allocated luas
  const totalAllocatedLuas = useMemo(() => {
    return Math.round(parts.reduce((sum, p) => sum + (Number(p.luas) || 0), 0) * 100) / 100;
  }, [parts]);

  const luasDifference = Math.round((originalLuas - totalAllocatedLuas) * 100) / 100;

  // Preview calculations
  const preview = useMemo(() => {
    return previewSplitParcel(allRecords, targetRecord, parts);
  }, [allRecords, targetRecord, parts]);

  if (!isOpen) return null;

  const handleUpdatePart = (index: number, field: keyof SplitPartInput, value: any) => {
    setParts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddPart = () => {
    setParts(prev => [
      ...prev,
      {
        luas: 0,
        nama: '',
        nik: '',
        keterangan: `Bagian pecahan ke-${prev.length + 1}`
      }
    ]);
  };

  const handleRemovePart = (index: number) => {
    if (parts.length <= 2) {
      alert('Pecah bidang minimal harus memiliki 2 bagian.');
      return;
    }
    setParts(prev => prev.filter((_, i) => i !== index));
  };

  const handleExecute = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Validate luas
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i].luas || Number(parts[i].luas) <= 0) {
          throw new Error(`Luas untuk bagian ${i + 1} harus lebih besar dari 0.`);
        }
      }

      const { updatedRecords, logSummary } = executeSplitParcel(allRecords, targetRecord, parts);

      await onConfirmSplit(updatedRecords, logSummary);
      onClose();
    } catch (err: any) {
      console.error('Split error:', err);
      setErrorMessage(err.message || 'Terjadi kesalahan saat memecah bidang.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-950/60 to-slate-900 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Pecah Bidang Tanah (Split)
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                  No. {targetRecord.NOBID} ➔ {parts.map((_, i) => splitNum + i).join(', ')}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Desa <span className="text-slate-200 font-bold">{targetRecord.DESA}</span> · Span <span className="text-slate-200 font-bold">{targetRecord.SPAN}</span> · Pemilik Asal: <span className="text-slate-200 font-bold uppercase">{targetRecord.NAMA || '(Tanpa Nama)'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Target Parcel Summary Box */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Bidang Asal yang Dipecah</span>
              <p className="text-sm font-bold text-white uppercase mt-0.5">
                No. {targetRecord.NOBID} — {targetRecord.NAMA || '(Tanpa Nama)'}
              </p>
              <p className="text-xs text-slate-400 font-mono">
                NIK: {targetRecord.NIK || '-'} · Hak: {targetRecord.JENIS_ALAS_HAK || '-'} ({targetRecord.NOMER_HAK || '-'})
              </p>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Luas Asal</span>
                <span className="text-base font-bold font-mono text-amber-400">{originalLuas} m²</span>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Alokasi</span>
                <span className={`text-base font-bold font-mono ${
                  Math.abs(luasDifference) < 0.01 ? 'text-emerald-400' : 'text-amber-300'
                }`}>
                  {totalAllocatedLuas} m²
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Parts Allocation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">1</span>
                Tentukan Pembagian Hasil Pecahan ({parts.length} Bagian):
              </label>
              <button
                type="button"
                onClick={handleAddPart}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Pecahan</span>
              </button>
            </div>

            <div className="space-y-3">
              {parts.map((part, idx) => {
                const assignedNum = splitNum + idx;
                const isPart1 = idx === 0;

                return (
                  <div 
                    key={idx} 
                    className="p-4 bg-slate-950/70 rounded-xl border border-white/10 space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {isPart1 ? `Bagian 1 (Tetap No. ${assignedNum})` : `Bagian ${idx + 1} (Menjadi No. ${assignedNum})`}
                        </span>
                        {isPart1 && (
                          <span className="text-[10px] text-slate-400 italic">
                            (Menyimpan identitas & alas hak asal)
                          </span>
                        )}
                      </div>

                      {!isPart1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePart(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Hapus bagian ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Luas */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Luas Bagian (m²) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={part.luas || ''}
                          onChange={(e) => handleUpdatePart(idx, 'luas', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      {/* Nama Pemilik */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Nama Pemilik {isPart1 ? '(Asal)' : '(Baru / Boleh Kosong)'}
                        </label>
                        <input
                          type="text"
                          value={part.nama}
                          onChange={(e) => handleUpdatePart(idx, 'nama', e.target.value)}
                          placeholder={isPart1 ? targetRecord.NAMA : 'Dapat dilengkapi tim lapangan'}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      {/* NIK */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          NIK {isPart1 ? '(Asal)' : '(Opsional)'}
                        </label>
                        <input
                          type="text"
                          value={part.nik || ''}
                          onChange={(e) => handleUpdatePart(idx, 'nik', e.target.value)}
                          placeholder={isPart1 ? targetRecord.NIK : '16 Digit NIK'}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Keterangan */}
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        Keterangan Khusus Bagian Ini:
                      </label>
                      <input
                        type="text"
                        value={part.keterangan || ''}
                        onChange={(e) => handleUpdatePart(idx, 'keterangan', e.target.value)}
                        placeholder="Contoh: Tanah pekarangan depan / Dibeli pihak kedua"
                        className="w-full bg-slate-900/60 border border-white/5 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {Math.abs(luasDifference) > 0.01 && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs flex items-center justify-between">
                <span>Total luas bagian ({totalAllocatedLuas} m²) berbeda dengan luas asal ({originalLuas} m²). Selisih: {luasDifference} m²</span>
                <button
                  type="button"
                  onClick={() => {
                    // Automatically balance last part
                    setParts(prev => {
                      const next = [...prev];
                      const lastIdx = next.length - 1;
                      const sumOthers = next.slice(0, lastIdx).reduce((s, p) => s + (Number(p.luas) || 0), 0);
                      const balanced = Math.max(0, Math.round((originalLuas - sumOthers) * 100) / 100);
                      next[lastIdx] = { ...next[lastIdx], luas: balanced };
                      return next;
                    });
                  }}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded text-[11px] font-bold"
                >
                  Sesuaikan Otomatis
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Renumbering Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">2</span>
                Pratinjau Pergeseran Nomor Bidang di Span ini (Otomatis n+1):
              </label>
              <span className="text-[11px] text-amber-400 font-mono">
                {preview.previewList.length} Bidang Terkait
              </span>
            </div>

            <div className="bg-slate-950/80 rounded-xl border border-white/10 overflow-hidden">
              <div className="max-h-48 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-slate-900 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2 px-3">No. Lama</th>
                      <th className="py-2 px-3 text-center">➔</th>
                      <th className="py-2 px-3">No. Baru</th>
                      <th className="py-2 px-3">Status / Keterangan Penomoran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {preview.previewList.map((item, idx) => {
                      const isPart1 = item.status === 'SPLIT_PART_1';
                      const isNewPart = item.status === 'SPLIT_NEW_PART';
                      const isShifted = item.status === 'SHIFTED_UP';

                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-white/5 ${
                            isNewPart ? 'bg-emerald-950/30 text-emerald-300 font-bold' : 
                            isPart1 ? 'bg-amber-950/30 text-amber-300 font-bold' :
                            isShifted ? 'bg-sky-950/20 text-sky-200 font-medium' : ''
                          }`}
                        >
                          <td className="py-1.5 px-3 font-mono">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-white/5">
                              {item.oldNobid}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-center text-slate-500">➔</td>
                          <td className="py-1.5 px-3 font-mono">
                            <span className={`px-1.5 py-0.5 rounded font-bold ${
                              isNewPart ? 'bg-emerald-600 text-white' :
                              isPart1 ? 'bg-amber-600 text-white' :
                              isShifted ? 'bg-sky-600/30 text-sky-200 border border-sky-500/30' :
                              'bg-slate-800 text-slate-300'
                            }`}>
                              {item.newNobid}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-400">
                            {item.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Nomor setelah bidang {splitNum} otomatis maju +{parts.length - 1} agar nomor span tetap urut <strong>n+1</strong>.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-amber-600/20 cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Scissors className="w-4 h-4" />
              <span>{isSubmitting ? 'Memproses Pemecahan...' : 'Eksekusi Pecah Bidang'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
