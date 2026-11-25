import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  FileDown,
  Cloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileText,
  Lock
} from 'lucide-react';
import { type LandRecord, type InventoryFormPdfConfig } from '../types';
import { generateInventoryPDF, getVendorPresetDefaults } from '../lib/pdfGenerator';
import { getCoordinateProjectionOption } from '../lib/geoUtils';
import { resolveProjectTitleByDesa } from '../lib/projectTitleHelper';
import {
  buildSanitizedFileName,
  findOrCreateFolder,
  getOrCreateParcelFolderHierarchy,
  uploadFileToDrive
} from '../lib/googleApi';

interface InventoryFormExportModalProps {
  record: LandRecord | null;
  onClose: () => void;
  activeProjectId?: string;
  activeProjectName?: string;
  inventoryPdfConfig?: InventoryFormPdfConfig;
  loadedGeoJSONs?: any[];
  uploadsFolderId?: string;
  accessToken?: string | null;
  role?: 'ADMIN' | 'FIELD' | 'QC' | 'GUEST' | null;
  onRequestGoogleAuth?: () => Promise<string | null>;
  onUpdateRecord?: (updatedRecord: LandRecord) => Promise<void>;
}

export default function InventoryFormExportModal({
  record,
  onClose,
  activeProjectId,
  activeProjectName,
  inventoryPdfConfig,
  loadedGeoJSONs,
  uploadsFolderId,
  accessToken,
  role,
  onRequestGoogleAuth,
  onUpdateRecord
}: InventoryFormExportModalProps) {
  const [busyAction, setBusyAction] = useState<'idle' | 'download' | 'drive'>('idle');
  const [stepLabel, setStepLabel] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    driveFileUrl?: string;
    driveFolderUrl?: string;
  } | null>(null);

  // Synchronous ref guard prevents rapid double-clicks before React re-renders
  const processingLockRef = useRef<boolean>(false);

  useEffect(() => {
    setBusyAction('idle');
    setStepLabel('');
    setFeedback(null);
    processingLockRef.current = false;
  }, [record?.ID_UNIK, record?.CODE]);

  if (!record) return null;

  const isBusy = busyAction !== 'idle';
  const pdfFileName = buildSanitizedFileName('FORM_INVENT', record, 'pdf');
  const kopName =
    inventoryPdfConfig?.headerCompanyName ||
    getVendorPresetDefaults(inventoryPdfConfig?.vendorPreset).headerCompanyName ||
    'PT SURVEYOR INDONESIA';
  const projOpt = getCoordinateProjectionOption(inventoryPdfConfig?.coordinateProjection);
  const autoTitle = resolveProjectTitleByDesa(activeProjectName, record.DESA, activeProjectId);

  const handleSafeClose = () => {
    if (processingLockRef.current || isBusy) return;
    onClose();
  };

  const handleDownloadDirect = async () => {
    if (processingLockRef.current || isBusy) return;
    processingLockRef.current = true;
    setBusyAction('download');
    setFeedback(null);
    setStepLabel('Menyusun 4 halaman PDF, peta sketsa bidang & tanda tangan...');

    try {
      const docInstance = await generateInventoryPDF(
        record,
        activeProjectName || 'KOMPENSASI JALUR TRANSMISI',
        {
          pdfConfig: inventoryPdfConfig,
          projectId: activeProjectId,
          projectGeoJSONs: loadedGeoJSONs,
          accessToken
        }
      );

      setStepLabel('Menyiapkan unduhan berkas PDF...');
      docInstance.save(pdfFileName);

      setFeedback({
        type: 'success',
        text: `Berhasil! Formulir Inventarisasi "${pdfFileName}" telah diunduh ke perangkat Anda.`
      });
    } catch (err: any) {
      console.error('Gagal generate PDF dari Daftar Nominatif:', err);
      setFeedback({
        type: 'error',
        text: `Gagal membuat PDF: ${err?.message || 'Terjadi kesalahan saat generate dokumen.'}`
      });
    } finally {
      processingLockRef.current = false;
      setBusyAction('idle');
      setStepLabel('');
    }
  };

  const handlePushToDrive = async () => {
    if (processingLockRef.current || isBusy) return;
    processingLockRef.current = true;
    setBusyAction('drive');
    setFeedback(null);

    try {
      // 1. Ensure valid Google OAuth access token
      let validToken =
        accessToken && accessToken !== 'GUEST_BYPASS' && accessToken !== 'null'
          ? accessToken
          : null;

      if (!validToken && onRequestGoogleAuth) {
        setStepLabel('Meminta izin koneksi Google Drive...');
        validToken = await onRequestGoogleAuth();
      }

      if (!validToken || validToken === 'GUEST_BYPASS' || validToken === 'null') {
        throw new Error(
          'Koneksi Google Drive belum aktif. Silakan hubungkan akun Google terlebih dahulu untuk mengunggah PDF ke Drive.'
        );
      }

      // 2. Generate PDF blob
      setStepLabel('1/3 Menyusun 4 halaman PDF Formulir Inventarisasi...');
      const docInstance = await generateInventoryPDF(
        record,
        activeProjectName || 'KOMPENSASI JALUR TRANSMISI',
        {
          pdfConfig: inventoryPdfConfig,
          projectId: activeProjectId,
          projectGeoJSONs: loadedGeoJSONs,
          accessToken
        }
      );
      const pdfBlob = docInstance.output('blob');
      const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });

      // 3. Resolve folder hierarchy ("4. Form Invent")
      setStepLabel('2/3 Menyiapkan folder bidang & Subfolder "4. Form Invent"...');
      const mainFolderId =
        uploadsFolderId && uploadsFolderId !== 'guest_bypass'
          ? uploadsFolderId
          : await findOrCreateFolder(validToken, 'SIP_Berkas_Pertanahan_Desa');

      const hierarchy = await getOrCreateParcelFolderHierarchy(
        validToken,
        mainFolderId,
        record,
        '4. Form Invent'
      );

      // 4. Upload PDF to Drive
      setStepLabel('3/3 Mengunggah PDF ke Google Drive (Subfolder 4. Form Invent)...');
      const uploadRes = await uploadFileToDrive(
        validToken,
        pdfFile,
        'FORM_INVENT',
        record,
        hierarchy.targetFolderId
      );

      // 5. Persist DRIVE_FOLDER_ID if changed/missing
      if (onUpdateRecord && hierarchy.parcelFolderId && record.DRIVE_FOLDER_ID !== hierarchy.parcelFolderId) {
        try {
          await onUpdateRecord({
            ...record,
            DRIVE_FOLDER_ID: hierarchy.parcelFolderId
          });
        } catch (syncErr) {
          console.warn('PDF berhasil diunggah, namun pembaruan DRIVE_FOLDER_ID gagal:', syncErr);
        }
      }

      setFeedback({
        type: 'success',
        text: `Berhasil! "${pdfFileName}" sudah tersimpan ke Google Drive (Subfolder 4. Form Invent).`,
        driveFileUrl: uploadRes?.webViewLink || undefined,
        driveFolderUrl: hierarchy.targetFolderId
          ? `https://drive.google.com/drive/folders/${hierarchy.targetFolderId}`
          : undefined
      });
    } catch (err: any) {
      console.error('Gagal upload Form Invent PDF ke Drive:', err);
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal mengunggah PDF ke Google Drive. Silakan coba lagi.'
      });
    } finally {
      processingLockRef.current = false;
      setBusyAction('idle');
      setStepLabel('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print"
      onClick={handleSafeClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                Cetak / Ekspor Formulir Inventarisasi (PDF)
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Langsung dari Daftar Nominatif • 4 Halaman A4
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            disabled={isBusy}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            title={isBusy ? 'Menunggu proses selesai...' : 'Tutup'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Parcel Summary Card */}
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/10 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                  BIDANG TERPILIH
                </span>
                <h4 className="text-sm font-black text-white truncate">
                  {record.NAMA || 'Tanpa Nama Pemilik'}
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-black font-mono shrink-0">
                No. {record.NOBID || '-'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1 border-t border-white/5">
              <div>
                <span className="text-slate-500">Desa:</span>{' '}
                <strong className="text-white">{record.DESA || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Span:</span>{' '}
                <strong className="text-sky-300 font-mono">{record.SPAN || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Luas:</span>{' '}
                <strong className="text-emerald-300 font-mono">{record.LUAS || '0'} m²</strong>
              </div>
              <div className="truncate">
                <span className="text-slate-500">Kode:</span>{' '}
                <strong className="text-slate-200 font-mono">{record.CODE || '-'}</strong>
              </div>
            </div>

            {/* Active PDF Kop & Auto-Title badges */}
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
              <span className="text-[10px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 rounded-md">
                Kop: {kopName} • {projOpt.shortName}
              </span>
              {autoTitle.isAutoSplit && (
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  Judul Otomatis: {autoTitle.title}
                </span>
              )}
            </div>

            <div className="text-[10px] text-slate-400 font-mono truncate">
              Nama File: <span className="text-slate-200">{pdfFileName}</span>
            </div>
          </div>

          {/* Processing Lock Banner */}
          {isBusy && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 animate-fadeIn">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Sedang Memproses — Tombol Dikunci Sementara
                </div>
                <p className="text-[11px] text-amber-100/90 mt-0.5">{stepLabel}</p>
              </div>
            </div>
          )}

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl border space-y-2 animate-fadeIn ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5 text-xs font-semibold">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>

              {(feedback.driveFileUrl || feedback.driveFolderUrl) && (
                <div className="flex flex-wrap gap-2 pl-6">
                  {feedback.driveFileUrl && (
                    <a
                      href={feedback.driveFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-[11px] font-bold transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Buka File PDF di Drive
                    </a>
                  )}
                  {feedback.driveFolderUrl && (
                    <a
                      href={feedback.driveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15 text-[11px] font-bold transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Buka Subfolder 4. Form Invent
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleDownloadDirect}
              disabled={isBusy}
              className="w-full px-4 py-3 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-100 text-xs font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {busyAction === 'download' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-sky-300" />
                  <span>Sedang Membuat &amp; Mengunduh PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-sky-300" />
                  <span>Unduh Langsung PDF ke Komputer / HP</span>
                </>
              )}
            </button>

            {role !== 'GUEST' && (
              <button
                type="button"
                onClick={handlePushToDrive}
                disabled={isBusy}
                className="w-full px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {busyAction === 'drive' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Sedang Push PDF ke Google Drive...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4 text-slate-950" />
                    <span>Push Langsung ke Google Drive (Subfolder 4. Form Invent)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950/90 border-t border-white/10 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">
            {isBusy ? 'Jangan tutup jendela hingga proses selesai.' : 'Pilih salah satu metode ekspor di atas.'}
          </span>
          <button
            type="button"
            onClick={handleSafeClose}
            disabled={isBusy}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
