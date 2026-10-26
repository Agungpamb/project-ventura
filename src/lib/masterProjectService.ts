import { ProjectConfig, DEFAULT_RESUME_STAGES } from '../types';

export const MASTER_SPREADSHEET_ID = '13BNOqw9jH9cXaNF253zq43GdqFIzP-hJFDFirIqZ3h8';
export const MASTER_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/13BNOqw9jH9cXaNF253zq43GdqFIzP-hJFDFirIqZ3h8/edit?usp=drive_link';
export const MASTER_CSV_EXPORT_URL = 'https://docs.google.com/spreadsheets/d/13BNOqw9jH9cXaNF253zq43GdqFIzP-hJFDFirIqZ3h8/export?format=csv&id=13BNOqw9jH9cXaNF253zq43GdqFIzP-hJFDFirIqZ3h8';

// Extract Google Sheet ID from URL
export function extractSpreadsheetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Extract Google Drive Folder ID from URL
export function extractDriveFolderId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Extract Google Drive File ID from URL
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Generate direct CSV export URL for standard Google Sheets
export function getExportCsvUrl(sheetIdOrUrl: string | null | undefined): string | null {
  if (!sheetIdOrUrl) return null;
  const id = extractSpreadsheetId(sheetIdOrUrl) || (sheetIdOrUrl.length > 20 && !sheetIdOrUrl.includes('/') ? sheetIdOrUrl : null);
  if (!id) return null;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
}

// Pre-baked Fallback Projects configured from Master Spreadsheet
export const FALLBACK_MASTER_PROJECTS: ProjectConfig[] = [
  {
    id: 'JELOK-SANGGRAHAN',
    name: 'SUTT 150 KV JELOK - SANGGRAHAN',
    folderId: '1giTA3wZRTyktF_X1chgLmpha4M96PtmW',
    uploadsFolderId: null,
    spreadsheetId: '1UI9dhI5IkYXL4CARrSuQaM5Zx58jK8s2oQtyzK1WuhU',
    publicCsvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRur_bmc96zWOV-d5vtqTUH6T5bcpPrNhQbG9uzSPqfMX1xUwQplHo8XQbALIFuunS_giBHcVanyL-m/pub?gid=0&single=true&output=csv',
    resumeSpreadsheetId: '1b44L4Xa7G6ig3nPTKGgtKQ4kOYr5MK2BruxHAAogM5Q',
    resumePublicCsvUrl: 'https://docs.google.com/spreadsheets/d/1b44L4Xa7G6ig3nPTKGgtKQ4kOYr5MK2BruxHAAogM5Q/export?format=csv',
    agencyLetterSpreadsheetId: '1NoE42RumeLRIm2JNPTj9_F6rbPoR8BVdt7sHRE4gpH0',
    agencyLetterPublicCsvUrl: 'https://docs.google.com/spreadsheets/d/1NoE42RumeLRIm2JNPTj9_F6rbPoR8BVdt7sHRE4gpH0/export?format=csv',
    status: 'AKTIF',
    webhookUrl: 'https://script.google.com/macros/s/AKfycbwYLbnSmp0DfmYlDXnEtzTdpp8IR1Tj27jIZ6O7lbWsdEZoZbeWmXG8eSgbn4s8F1tP/exec',
    geojsonPolylineUrl: 'https://drive.google.com/file/d/1IbxJAvOnBiHjt7JJlUh4JjEXd7zjc6AO/view?usp=drive_link',
    geojsonPolygonUrl: 'https://drive.google.com/file/d/1kHNLJ8rXZ3ETHxcwnCZTOKWnWT6UDnL3/view?usp=drive_link',
    geojsonTowerUrl: 'https://drive.google.com/file/d/1dHchAahql3WshuYwSBA6ONaEt5oPzU4H/view?usp=drive_link',
    rawSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1UI9dhI5IkYXL4CARrSuQaM5Zx58jK8s2oQtyzK1WuhU/edit?usp=drive_link',
    rawDriveFolderUrl: 'https://drive.google.com/drive/folders/1giTA3wZRTyktF_X1chgLmpha4M96PtmW?usp=drive_link',
    resumeStages: DEFAULT_RESUME_STAGES
  },
  {
    id: 'JALUR DUMMY',
    name: 'JALUR DUMMY COBA',
    folderId: '18NzOd1GbknDDQtEJsOn8KL6cc7C5-jD7',
    uploadsFolderId: null,
    spreadsheetId: '1INnTZ-CNAQ_eLHrjhEbLobk90KNLNn0SKuWc9YODQHs',
    publicCsvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRSZoqDkjQAqGJoBCtEQTujWteZ1QNbhGMRUFWQr9LM-9XnejRy5CQuil6c-tIo4KyyRTGYzMKB4ik1/pub?gid=0&single=true&output=csv',
    resumeSpreadsheetId: '1PTdVv5JgmYVxyRcCSzyVnAlJ6_rwrdM4VVCP3stsLzU',
    resumePublicCsvUrl: 'https://docs.google.com/spreadsheets/d/1PTdVv5JgmYVxyRcCSzyVnAlJ6_rwrdM4VVCP3stsLzU/export?format=csv',
    agencyLetterSpreadsheetId: '1GaAWpLiN8xv2JDtg_FcMmNsqcwyt0oTx-SE5G__puUo',
    agencyLetterPublicCsvUrl: 'https://docs.google.com/spreadsheets/d/1GaAWpLiN8xv2JDtg_FcMmNsqcwyt0oTx-SE5G__puUo/export?format=csv',
    status: 'AKTIF',
    webhookUrl: 'https://script.google.com/macros/s/AKfycbwhUhZneI2gYuGvIyKGA92zTYC2wVfOU4cpmsVoFvqc21zPfF5lsoltrbucqW7iKH3K4g/exec',
    geojsonPolylineUrl: 'https://drive.google.com/file/d/1IbxJAvOnBiHjt7JJlUh4JjEXd7zjc6AO/view?usp=drive_link',
    geojsonPolygonUrl: 'https://drive.google.com/file/d/1kHNLJ8rXZ3ETHxcwnCZTOKWnWT6UDnL3/view?usp=drive_link',
    geojsonTowerUrl: 'https://drive.google.com/file/d/1dHchAahql3WshuYwSBA6ONaEt5oPzU4H/view?usp=drive_link',
    rawSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1INnTZ-CNAQ_eLHrjhEbLobk90KNLNn0SKuWc9YODQHs/edit?usp=drive_link',
    rawDriveFolderUrl: 'https://drive.google.com/drive/folders/18NzOd1GbknDDQtEJsOn8KL6cc7C5-jD7?usp=drive_link',
    resumeStages: DEFAULT_RESUME_STAGES
  }
];

// RFC-compliant CSV Parser that can handle both commas and semicolons
function parseMasterCsv(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  
  // Detect primary delimiter: if first non-empty line has more semicolons than commas, use semicolon
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(cell.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        result.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (row.length > 0 || cell !== '') {
    row.push(cell.trim());
    result.push(row);
  }
  return result;
}

// Multi-proxy resilient fetch for Master Spreadsheet CSV
async function fetchMasterCsvText(): Promise<string> {
  const targetUrl = MASTER_CSV_EXPORT_URL;
  
  // 1. Direct fetch
  try {
    const res = await fetch(targetUrl, { mode: 'cors' });
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (err) {
    // continue to proxies
  }

  // 2. AllOrigins Proxy
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (err) {
    // continue to proxy 2
  }

  // 3. CodeTabs Proxy
  try {
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (err) {
    // fallback
  }

  throw new Error("Tidak dapat mengambil CSV dari Master Spreadsheet.");
}

/**
 * Fetches and parses all Jalur from the Master Google Spreadsheet.
 * Automatically synchronizes with any local modifications (like created folders/uploads).
 */
export async function fetchMasterProjects(existingProjects?: ProjectConfig[]): Promise<ProjectConfig[]> {
  try {
    const csvText = await fetchMasterCsvText();
    const rows = parseMasterCsv(csvText);

    if (rows.length < 2) {
      console.warn("Master spreadsheet rows is less than 2, using fallback");
      return mergeWithExisting(FALLBACK_MASTER_PROJECTS, existingProjects);
    }

    const header = rows[0].map(h => h.trim().toUpperCase());
    const kodeJalurIdx = header.findIndex(h => h === 'KODE_JALUR');
    const namaJalurIdx = header.findIndex(h => h === 'NAMA_JALUR');
    const urlSpreadsheetIdx = header.findIndex(h => h === 'URL_SPREADSHEET_DATABASE');
    const urlFolderIdx = header.findIndex(h => h === 'URL_FOLDER_INDUK_DRIVE');
    const urlGeoPolylineIdx = header.findIndex(h => h === 'URL_GEOJSON_POLYLINE');
    const urlGeoPolygonIdx = header.findIndex(h => h === 'URL_GEOJSON_POLYGON');
    const urlGeoTowerIdx = header.findIndex(h => h === 'URL_GEOJSON_POINT_TOWER');
    const urlWebCsvIdx = header.findIndex(h => h === 'URL_WEB_EXPORT_CSV');
    const urlResumeIdx = header.findIndex(h => h === 'URL_RESUME_PROJECT');
    const urlSuratIdx = header.findIndex(h => h === 'URL_TRACKING_SURAT_INSTANSI');
    const statusIdx = header.findIndex(h => h === 'STATUS');
    const webhookIdx = header.findIndex(h => h === 'WEBHOOK_URL');

    const parsedProjects: ProjectConfig[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const kodeJalur = (row[kodeJalurIdx >= 0 ? kodeJalurIdx : 0] || '').trim();
      if (!kodeJalur || kodeJalur.startsWith('aku mau') || kodeJalur.length > 50) {
        // Skip scratch notes or empty lines
        continue;
      }

      const namaJalur = (row[namaJalurIdx >= 0 ? namaJalurIdx : 1] || kodeJalur).trim();
      const rawSpreadsheetUrl = (row[urlSpreadsheetIdx >= 0 ? urlSpreadsheetIdx : 2] || '').trim();
      const rawDriveFolderUrl = (row[urlFolderIdx >= 0 ? urlFolderIdx : 3] || '').trim();
      const geoPolyline = (row[urlGeoPolylineIdx >= 0 ? urlGeoPolylineIdx : 4] || '').trim();
      const geoPolygon = (row[urlGeoPolygonIdx >= 0 ? urlGeoPolygonIdx : 5] || '').trim();
      const geoTower = (row[urlGeoTowerIdx >= 0 ? urlGeoTowerIdx : 6] || '').trim();
      const publicCsv = (row[urlWebCsvIdx >= 0 ? urlWebCsvIdx : 7] || '').trim();
      const rawResumeUrl = (row[urlResumeIdx >= 0 ? urlResumeIdx : 8] || '').trim();
      const rawSuratUrl = (row[urlSuratIdx >= 0 ? urlSuratIdx : 9] || '').trim();
      const status = (row[statusIdx >= 0 ? statusIdx : 10] || 'AKTIF').trim().toUpperCase();
      const webhook = (row[webhookIdx >= 0 ? webhookIdx : 11] || '').trim();

      const spreadsheetId = extractSpreadsheetId(rawSpreadsheetUrl) || (rawSpreadsheetUrl.length > 20 && !rawSpreadsheetUrl.includes('/') ? rawSpreadsheetUrl : null);
      const folderId = extractDriveFolderId(rawDriveFolderUrl) || (rawDriveFolderUrl.length > 20 && !rawDriveFolderUrl.includes('/') ? rawDriveFolderUrl : null);
      const resumeSpreadsheetId = extractSpreadsheetId(rawResumeUrl);
      const agencyLetterSpreadsheetId = extractSpreadsheetId(rawSuratUrl);

      parsedProjects.push({
        id: kodeJalur,
        name: namaJalur,
        spreadsheetId,
        folderId,
        uploadsFolderId: null,
        publicCsvUrl: publicCsv || (spreadsheetId ? getExportCsvUrl(spreadsheetId) : null),
        resumeSpreadsheetId,
        resumePublicCsvUrl: getExportCsvUrl(resumeSpreadsheetId),
        agencyLetterSpreadsheetId,
        agencyLetterPublicCsvUrl: getExportCsvUrl(agencyLetterSpreadsheetId),
        status,
        webhookUrl: webhook || null,
        geojsonPolylineUrl: geoPolyline || null,
        geojsonPolygonUrl: geoPolygon || null,
        geojsonTowerUrl: geoTower || null,
        rawSpreadsheetUrl: rawSpreadsheetUrl || null,
        rawDriveFolderUrl: rawDriveFolderUrl || null,
        resumeStages: DEFAULT_RESUME_STAGES
      });
    }

    if (parsedProjects.length > 0) {
      return mergeWithExisting(parsedProjects, existingProjects);
    }
    return mergeWithExisting(FALLBACK_MASTER_PROJECTS, existingProjects);
  } catch (err) {
    console.warn("Gagal menyinkronkan master spreadsheet, menggunakan fallback:", err);
    return mergeWithExisting(FALLBACK_MASTER_PROJECTS, existingProjects);
  }
}

// Preserve local configurations like uploadsFolderId if already set in existing projects
function mergeWithExisting(masterList: ProjectConfig[], existing?: ProjectConfig[]): ProjectConfig[] {
  if (!existing || existing.length === 0) return masterList;

  const existingMap = new Map(existing.map(p => [p.id, p]));

  // Also include any user-created custom projects that are not yet in Master Sheet
  const result: ProjectConfig[] = masterList.map(m => {
    const matched = existingMap.get(m.id);
    if (matched) {
      return {
        ...m,
        uploadsFolderId: matched.uploadsFolderId || m.uploadsFolderId,
        // If local user specifically configured a custom upload folder or stages
        resumeStages: matched.resumeStages || m.resumeStages
      };
    }
    return m;
  });

  // Keep existing custom projects if any
  for (const [id, proj] of existingMap.entries()) {
    if (!result.some(r => r.id === id)) {
      result.push(proj);
    }
  }

  return result;
}

/**
 * Dispatch QC verification or update directly to the Jalur's Apps Script Webhook.
 * Allows QC verifiers or Field staff to push updates to Google Sheets without logging in with Google OAuth.
 */
export async function dispatchToAppsScriptWebhook(
  webhookUrl: string, 
  payload: {
    action: string;
    recordCode: string;
    qcStatus?: string;
    qcNotes?: string;
    qcBy?: string;
    qcDate?: string;
    kekuranganBerkas?: string;
    data?: any;
  }
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl) {
    return { success: false, message: 'Webhook URL tidak dikonfigurasi untuk jalur ini.' };
  }

  try {
    // Send as POST request with JSON
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      mode: 'cors'
    });

    if (response.ok) {
      const resData = await response.json().catch(() => ({}));
      return { 
        success: true, 
        message: resData?.message || 'Data berhasil dikirim ke Webhook Google Apps Script.' 
      };
    } else {
      // If CORS or redirect occurred, try fallback with no-cors form submission
      return await dispatchNoCorsFallback(webhookUrl, payload);
    }
  } catch (corsErr) {
    // Google Apps Script redirects often fail standard CORS in browser; dispatch via no-cors fallback
    return await dispatchNoCorsFallback(webhookUrl, payload);
  }
}

async function dispatchNoCorsFallback(webhookUrl: string, payload: any): Promise<{ success: boolean; message: string }> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    return {
      success: true,
      message: 'Perubahan QC berhasil dikirimkan ke Google Apps Script (Mode Direct Webhook).'
    };
  } catch (err: any) {
    console.error("Webhook dispatch failed:", err);
    return {
      success: false,
      message: `Gagal mengirim ke Webhook: ${err?.message || 'Koneksi terputus'}`
    };
  }
}
