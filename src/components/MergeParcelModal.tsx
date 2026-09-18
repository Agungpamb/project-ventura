import React, { useState, useMemo } from 'react';
import { 
  GitMerge, X, AlertTriangle, CheckCircle2, 
  ArrowRight, Building2, Trees, ShieldAlert, FileText, Check
} from 'lucide-react';
import { LandRecord } from '../types';
import { 
  previewMergeParcels, 
  executeMergeParcels, 
  autoSumPlants, 
  autoJoinBuildings,
  parseNobid
} from '../lib/parcelManagement';

interface MergeParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordA: LandRecord;
  recordB: LandRecord;
  allRecords: LandRecord[];
  onConfirmMerge: (updatedRecords: LandRecord[], logSummary: string) => Promise<void>;
}

export default function MergeParcelModal({
  isOpen,
  onClose,
  recordA,
  recordB,
  allRecords,
  onConfirmMerge
}: MergeParcelModalProps) {
  const [keepIdentityFrom, setKeepIdentityFrom] = useState<'A' | 'B'>('A');
  const [customLuas, setCustomLuas] = useState<string>('');
  const [catatanMerge, setCatatanMerge] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parse numbers
  const pA = useMemo(() => parseNobid(recordA.NOBID), [recordA.NOBID]);
  const pB = useMemo(() => parseNobid(recordB.NOBID), [recordB.NOBID]);
  const minNum = Math.min(pA.num, pB.num);
  const maxNum = Math.max(pA.num, pB.num);

  // Preview calculations
  const preview = useMemo(() => {
    return previewMergeParcels(allRecords, {
      recordA,
      recordB,
      keepIdentityFrom
    });
  }, [allRecords, recordA, recordB, keepIdentityFrom]);

  // Combined plants preview
  const mergedPlants = useMemo(() => {
    return autoSumPlants(recordA.plants, recordB.plants).filter(p => p.jenis && p.jenis.trim());
  }, [recordA.plants, recordB.plants]);

  // Combined buildings preview
  const mergedBuildings = useMemo(() => {
    return autoJoinBuildings(recordA.buildings, recordB.buildings).filter(b => b.luas?.trim() || b.bentuk?.trim() || b.jenis?.trim());
  }, [recordA.buildings, recordB.buildings]);

  if (!isOpen) return null;

  const handleExecute = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const parsedLuas = customLuas.trim() ? parseFloat(customLuas.replace(',', '.')) : undefined;

      const { updatedRecords, logSummary } = executeMergeParcels(allRecords, {
        recordA,
        recordB,
        keepIdentityFrom,
        customLuas: parsedLuas,
        catatanMerge: catatanMerge.trim() || undefined
      });

      await onConfirmMerge(updatedRecords, logSummary);
      onClose();
    } catch (err: any) {
      console.error('Merge error:', err);
      setErrorMessage(err.message || 'Terjadi kesalahan saat menggabungkan bidang.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/60 to-slate-900 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Gabung Bidang Tanah (Merge)
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  No. {recordA.NOBID} + No. {recordB.NOBID} ➔ No. {minNum}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Desa <span className="text-slate-200 font-bold">{recordA.DESA}</span> · Span <span className="text-slate-200 font-bold">{recordA.SPAN}</span>
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

          {/* Section 1: Identity Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                Pilih Data Identitas & Alas Hak yang Dipertahankan:
              </label>
              <span className="text-[11px] text-slate-400">
                Data yang dipilih menjadi identitas utama Bidang No. {minNum}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A */}
              <div 
                onClick={() => setKeepIdentityFrom('A')}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  keepIdentityFrom === 'A'
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500'
                    : 'bg-slate-950/40 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-white border border-white/10">
                      Bidang No. {recordA.NOBID}
                    </span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      keepIdentityFrom === 'A' ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-600'
                    }`}>
                      {keepIdentityFrom === 'A' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div className="pt-1">
                    <p className="font-bold text-white text-sm uppercase">{recordA.NAMA || '(Tanpa Nama)'}</p>
                    <p className="font-mono text-slate-400 text-[11px]">NIK: {recordA.NIK || '-'}</p>
                    <p className="text-slate-400 text-[11px]">Alas Hak: {recordA.JENIS_ALAS_HAK || '-'} ({recordA.NOMER_HAK || '-'})</p>
                    <p className="text-slate-400 text-[11px]">Luas: <span className="text-emerald-400 font-bold font-mono">{recordA.LUAS || '0'} m²</span></p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 text-[10px] text-slate-400">
                  {keepIdentityFrom === 'A' ? '✅ Identitas & Alas Hak ini akan disimpan' : 'Klik untuk memilih identitas ini'}
                </div>
              </div>

              {/* Option B */}
              <div 
                onClick={() => setKeepIdentityFrom('B')}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  keepIdentityFrom === 'B'
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500'
                    : 'bg-slate-950/40 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-white border border-white/10">
                      Bidang No. {recordB.NOBID}
                    </span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      keepIdentityFrom === 'B' ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-600'
                    }`}>
                      {keepIdentityFrom === 'B' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div className="pt-1">
                    <p className="font-bold text-white text-sm uppercase">{recordB.NAMA || '(Tanpa Nama)'}</p>
                    <p className="font-mono text-slate-400 text-[11px]">NIK: {recordB.NIK || '-'}</p>
                    <p className="text-slate-400 text-[11px]">Alas Hak: {recordB.JENIS_ALAS_HAK || '-'} ({recordB.NOMER_HAK || '-'})</p>
                    <p className="text-slate-400 text-[11px]">Luas: <span className="text-emerald-400 font-bold font-mono">{recordB.LUAS || '0'} m²</span></p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 text-[10px] text-slate-400">
                  {keepIdentityFrom === 'B' ? '✅ Identitas & Alas Hak ini akan disimpan' : 'Klik untuk memilih identitas ini'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Luas, Tanaman & Bangunan Auto-Join */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
              Luas & Data Tanaman / Bangunan Gabungan:
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Luas Total */}
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/10 space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">Luas Tanah Gabungan (m²)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={String(preview.sumLuas)}
                    value={customLuas}
                    onChange={(e) => setCustomLuas(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Otomatis penjumlahan: {recordA.LUAS || '0'} + {recordB.LUAS || '0'} = <strong className="text-emerald-400">{preview.sumLuas} m²</strong> (kosongkan jika ingin pakai default).
                </p>
              </div>

              {/* Tanaman Auto-Sum */}
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                  <Trees className="w-4 h-4" />
                  <span>Tanaman (Auto-Sum Cerdas)</span>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 scrollbar-thin">
                  {mergedPlants.length > 0 ? (
                    mergedPlants.map((p, idx) => {
                      const totalBatang = (parseInt(p.sudah_menghasilkan || '0') || 0) +
                        (parseInt(p.belum_menghasilkan || '0') || 0) +
                        (parseInt(p.kecil || '0') || 0) +
                        (parseInt(p.sedang || '0') || 0) +
                        (parseInt(p.besar || '0') || 0);
                      return (
                        <div key={idx} className="flex items-center justify-between text-[11px] bg-white/5 px-2 py-1 rounded">
                          <span className="font-medium text-slate-200">{p.jenis}</span>
                          <span className="font-mono text-emerald-400 font-bold">{totalBatang} btg</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">Tidak ada data tanaman</p>
                  )}
                </div>
              </div>

              {/* Bangunan Auto-Join */}
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center gap-1.5 text-sky-400 font-bold text-[11px]">
                  <Building2 className="w-4 h-4" />
                  <span>Bangunan (Auto-Join)</span>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1 scrollbar-thin">
                  {mergedBuildings.length > 0 ? (
                    mergedBuildings.map((b, idx) => (
                      <div key={idx} className="text-[11px] bg-white/5 px-2 py-1 rounded text-slate-200">
                        {b.jenis || b.bentuk || 'Bangunan'} {b.luas ? `(${b.luas} m²)` : ''}
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">Tidak ada data bangunan</p>
                  )}
                </div>
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Catatan Tambahan Penggabungan (Opsional):</label>
              <input
                type="text"
                value={catatanMerge}
                onChange={(e) => setCatatanMerge(e.target.value)}
                placeholder="Contoh: Disepakati pemilik pada musyawarah ganti kerugian"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 3: Renumbering Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
                Pratinjau Penyesuaian Nomor Bidang di Span ini (Otomatis n+1):
              </label>
              <span className="text-[11px] text-emerald-400 font-mono">
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
                      const isMergedResult = item.status === 'MERGED_RESULT';
                      const isRemoved = item.status === 'REMOVED';
                      const isShifted = item.status === 'SHIFTED_DOWN';

                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-white/5 ${
                            isMergedResult ? 'bg-emerald-950/30 text-emerald-300 font-bold' : 
                            isRemoved ? 'bg-rose-950/20 text-slate-500 line-through' :
                            isShifted ? 'bg-amber-950/20 text-amber-300 font-medium' : ''
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
                              isMergedResult ? 'bg-emerald-600 text-white' :
                              isRemoved ? 'bg-rose-900/60 text-rose-300' :
                              isShifted ? 'bg-amber-600/30 text-amber-200 border border-amber-500/30' :
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
            <span>Nomor bidang &gt; {maxNum} otomatis mundur -1 agar urutan span tetap <strong>n+1</strong>.</span>
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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-emerald-600/20 cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <GitMerge className="w-4 h-4" />
              <span>{isSubmitting ? 'Memproses Penggabungan...' : 'Eksekusi Gabung Bidang'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
