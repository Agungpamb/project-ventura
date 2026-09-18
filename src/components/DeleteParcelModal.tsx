import React, { useState, useMemo } from 'react';
import { Trash2, AlertTriangle, X, Check, ArrowRight, ShieldAlert, Layers } from 'lucide-react';
import { LandRecord } from '../types';
import { previewDeleteParcel, executeDeleteParcel } from '../lib/parcelManagement';

interface DeleteParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRecord: LandRecord;
  allRecords: LandRecord[];
  onConfirmDelete: (updatedRecords: LandRecord[], logMessage: string) => Promise<void>;
}

export default function DeleteParcelModal({
  isOpen,
  onClose,
  targetRecord,
  allRecords,
  onConfirmDelete
}: DeleteParcelModalProps) {
  const [adjustNextParcels, setAdjustNextParcels] = useState<boolean>(true);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calculate live preview of impacted subsequent parcels
  const preview = useMemo(() => {
    return previewDeleteParcel(allRecords, targetRecord, adjustNextParcels);
  }, [allRecords, targetRecord, adjustNextParcels]);

  if (!isOpen) return null;

  const totalBangunan = targetRecord.buildings?.filter(b => b.luas || b.jenis || b.bentuk).length || 0;
  const totalTanaman = targetRecord.plants?.filter(t => t.jenis).length || 0;

  const handleDelete = async () => {
    if (!isConfirmed) {
      setErrorMessage('Harap centang konfirmasi penghapusan sebelum melanjutkan.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const { updatedRecords, logSummary } = executeDeleteParcel(allRecords, {
        targetRecord,
        adjustNextParcels
      });

      await onConfirmDelete(updatedRecords, logSummary);
      onClose();
    } catch (err: any) {
      console.error('Delete parcel error:', err);
      setErrorMessage(err?.message || 'Terjadi kesalahan saat menghapus bidang tanah.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-950/60 to-slate-900 border-b border-rose-500/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Hapus Data Bidang Tanah</h3>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Desa <span className="text-slate-200 font-bold">{targetRecord.DESA}</span> · Span <span className="text-slate-200 font-bold">{targetRecord.SPAN}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Warning Banner */}
          <div className="p-3.5 bg-rose-950/30 border border-rose-500/20 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-rose-300 text-xs">Peringatan Penghapusan Data Lahan</p>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Tindakan ini akan menghapus data bidang dari daftar nominatif, riwayat inventarisasi, dan perhitungan kompensasi. Pastikan bidang ini memang salah input atau dibatalkan.
              </p>
            </div>
          </div>

          {/* Target Parcel Card */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Informasi Bidang yang Akan Dihapus
              </span>
              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-white border border-white/10">
                Bidang No. {targetRecord.NOBID}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Nama Pihak Berhak</span>
                <span className="font-bold text-white uppercase text-sm">{targetRecord.NAMA || '(Tanpa Nama)'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">NIK</span>
                <span className="font-mono text-slate-300">{targetRecord.NIK || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Luas Tanah</span>
                <span className="font-mono font-bold text-emerald-400">{targetRecord.LUAS ? `${targetRecord.LUAS} m²` : '0 m²'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Alas Hak</span>
                <span className="text-slate-300">{targetRecord.JENIS_ALAS_HAK || '-'} {targetRecord.NOMER_HAK ? `(${targetRecord.NOMER_HAK})` : ''}</span>
              </div>
            </div>

            {(totalBangunan > 0 || totalTanaman > 0) && (
              <div className="pt-2 border-t border-white/5 flex items-center gap-3 text-[11px] text-amber-300/90">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Memuat {totalBangunan} unit bangunan dan {totalTanaman} data jenis tanaman yang juga akan ikut terhapus.
                </span>
              </div>
            )}
          </div>

          {/* Option: Re-indexing Next Parcels (n-1) */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3.5 bg-slate-950/40 rounded-xl border border-white/10 hover:border-white/20 transition-all cursor-pointer">
              <input
                type="checkbox"
                checked={adjustNextParcels}
                onChange={(e) => setAdjustNextParcels(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-slate-900 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <div className="space-y-1">
                <span className="font-bold text-white text-xs block">
                  Otomatis sesuaikan nomor bidang berikutnya (n-1) di Span & Desa ini
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Jika dicentang, nomor bidang setelahnya akan dimajukan mundur 1 nomor agar urutan penomoran tetap rapi tanpa ada nomor yang melompat (misal: No. {parseInt(targetRecord.NOBID?.replace(/\D/g, '') || '0', 10) + 1} ➔ No. {targetRecord.NOBID}).
                </p>
              </div>
            </label>

            {/* Impacted Parcels Preview */}
            {adjustNextParcels && (
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">
                    Pratinjau Bidang yang Terdampak (Digeser Mundur n-1):
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {preview.impactedParcels.length} Bidang
                  </span>
                </div>

                {preview.impactedParcels.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto space-y-1.5 scrollbar-thin">
                    {preview.impactedParcels.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-200 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">No. {p.oldNobid}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-emerald-300 font-bold">No. {p.newNobid}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-sans truncate max-w-[200px]">
                          {p.nama}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Bidang ini adalah nomor terakhir di span ini. Tidak ada bidang berikutnya yang terpengaruh.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Explicit Confirmation Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer">
              <input
                type="checkbox"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="rounded border-rose-500/30 bg-slate-900 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-rose-200">
                Saya mengonfirmasi untuk menghapus Bidang No. {targetRecord.NOBID} ini secara permanen.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-white/10 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={!isConfirmed || isSubmitting}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-rose-600/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Menghapus Bidang...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Hapus Bidang Permanen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
