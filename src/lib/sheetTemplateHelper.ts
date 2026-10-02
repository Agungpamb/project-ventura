import * as XLSX from 'xlsx';
import { getSheetHeaders, getAgencyLetterSheetHeaders } from '../types';
import { RESUME_SHEET_HEADERS } from './googleApi';

/**
 * Downloads a spreadsheet template for the 267 columns of Land Record compensation data (File 1).
 */
export function downloadSheetHeaderTemplate(format: 'xlsx' | 'csv' = 'xlsx', projectName: string = 'Jalur_Kompensasi') {
  const headers = getSheetHeaders();
  const safeName = projectName.replace(/[\/\\?%*:|"<>\s]/g, '_');
  
  if (format === 'csv') {
    const csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `Template_Data_Lahan_267_Kolom_${safeName}.csv`);
    return;
  }

  const wb = XLSX.utils.book_new();
  const sampleRow: string[] = headers.map((header) => {
    if (header === 'CODE') return 'KODE_UNIK_01';
    if (header === 'DESA') return 'DESA MAJU';
    if (header === 'SPAN') return 'T.01 - T.02';
    if (header === 'NOBID') return '001';
    if (header === 'LUAS') return '1250';
    if (header === 'STATUS_KEPEMILIKAN') return 'Milik Sendiri';
    if (header === 'NAMA') return 'H. Ahmad Subarjo';
    if (header === 'NIK') return '3501234567890001';
    if (header.startsWith('LUAS BANGUNAN')) return '0';
    if (header.startsWith('JENIS TANAMAN')) return '-';
    if (header === 'KECAMATAN') return 'KECAMATAN SEJAHTERA';
    if (header === 'KABUPATEN') return 'KABUPATEN PASURUAN';
    if (header === 'QC_STATUS') return 'APPROVED';
    return '';
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "DATA_LAHAN");
  XLSX.writeFile(wb, `Template_Data_Lahan_267_Kolom_${safeName}.xlsx`);
}

/**
 * Downloads a spreadsheet template for the 36 columns of Project Resume (File 2).
 */
export function downloadResumeHeaderTemplate(format: 'xlsx' | 'csv' = 'xlsx', projectName: string = 'Jalur_Kompensasi') {
  const headers = RESUME_SHEET_HEADERS;
  const safeName = projectName.replace(/[\/\\?%*:|"<>\s]/g, '_');

  if (format === 'csv') {
    const csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `Template_Resume_Project_36_Kolom_${safeName}.csv`);
    return;
  }

  const wb = XLSX.utils.book_new();
  const sampleRow: string[] = headers.map(h => {
    if (h === 'ID_RESUME') return 'RESUME_DESA_01';
    if (h === 'DESA') return 'BULUKANDANG';
    if (h === 'KECAMATAN') return 'PRIGEN';
    if (h === 'KABUPATEN') return 'PASURUAN';
    if (h === 'TOTAL_BIDANG') return '45';
    if (h === 'TOTAL_LUAS_M2') return '35000';
    if (h === 'PROGRES_PERSEN') return '80';
    if (h.startsWith('STATUS_')) return 'SUDAH';
    return '';
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, "RESUME_DESA");
  XLSX.writeFile(wb, `Template_Resume_Project_36_Kolom_${safeName}.xlsx`);
}

/**
 * Downloads a spreadsheet template for the 13 columns of Agency Letters (File 3).
 */
export function downloadAgencyLetterHeaderTemplate(format: 'xlsx' | 'csv' = 'xlsx', projectName: string = 'Jalur_Kompensasi') {
  const headers = getAgencyLetterSheetHeaders();
  const safeName = projectName.replace(/[\/\\?%*:|"<>\s]/g, '_');

  if (format === 'csv') {
    const csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `Template_Surat_Instansi_13_Kolom_${safeName}.csv`);
    return;
  }

  const wb = XLSX.utils.book_new();
  const sampleRow: string[] = [
    '1',
    'SRT_001',
    'Kantor Kecamatan Bangil',
    '005/142/Kec.Bgl/IV/2026',
    '2026-04-15',
    'Permohonan Izin Sosialisasi Jalur Transmisi SUTT 150 kV',
    'SUDAH_MASUK',
    'Surat sudah di meja Sekcam, menunggu disposisi jadwal',
    'Pak Slamet (Kasi Trantib)',
    'https://drive.google.com/...',
    'https://drive.google.com/...',
    'Operator VSS',
    new Date().toISOString().split('T')[0]
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, "SURAT_INSTANSI");
  XLSX.writeFile(wb, `Template_Surat_Instansi_13_Kolom_${safeName}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copies the 267 headers in Tab-Separated Value (TSV) format to clipboard
 */
export async function copySheetHeadersToClipboard(): Promise<boolean> {
  return copyToClipboard(getSheetHeaders().join('\t'));
}

/**
 * Copies the 36 Resume headers to clipboard
 */
export async function copyResumeHeadersToClipboard(): Promise<boolean> {
  return copyToClipboard(RESUME_SHEET_HEADERS.join('\t'));
}

/**
 * Copies the 13 Agency Letter headers to clipboard
 */
export async function copyAgencyLetterHeadersToClipboard(): Promise<boolean> {
  return copyToClipboard(getAgencyLetterSheetHeaders().join('\t'));
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e) {
      return false;
    }
  }
}
