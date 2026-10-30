import { 
  type LandRecord, 
  type DataIntegrityLog, 
  type VillageResume, 
  type AgencyLetter, 
  getSheetHeaders, 
  getAgencyLetterSheetHeaders, 
  recordToRow, 
  rowToRecord 
} from '../types';

// Constants
export const SPREADSHEET_NAME = "Data_Pertanahan_Desa_SIP";
export const MAIN_FOLDER_NAME = "SIP_Berkas_Pertanahan_Desa";

type TokenRefreshHandler = () => Promise<string | null>;
let globalTokenRefreshHandler: TokenRefreshHandler | null = null;
let activeRefreshPromise: Promise<string | null> | null = null;

/**
 * Registers a token refresh handler callback (e.g. handleRefreshGoogleAuth from App.tsx)
 * so that any 401 Unauthorized response from Google APIs can automatically acquire a fresh
 * access token and retry the API call seamlessly without user manual intervention.
 */
export function registerTokenRefreshHandler(handler: TokenRefreshHandler | null) {
  globalTokenRefreshHandler = handler;
}

/**
 * Helper to safely refresh token with request deduplication (mutex pattern).
 * Popups can only be invoked if there is an active user gesture; otherwise, browsers block them.
 */
async function requestFreshToken(): Promise<string | null> {
  if (!globalTokenRefreshHandler) return null;
  // If the browser supports userActivation and there is no active user interaction,
  // do not invoke a popup-based refresh handler because the browser will block the popup.
  if (typeof navigator !== 'undefined' && 'userActivation' in navigator) {
    if (!navigator.userActivation.isActive) {
      console.warn("[GoogleApi Interceptor] Tidak ada interaksi pengguna aktif saat 401; melewati pemanggilan popup otomatis di latar belakang.");
      return null;
    }
  }
  if (!activeRefreshPromise) {
    activeRefreshPromise = globalTokenRefreshHandler().finally(() => {
      activeRefreshPromise = null;
    });
  }
  return activeRefreshPromise;
}

/**
 * Fetch wrapper with built-in timeout and automatic 401/UNAUTHENTICATED interceptor.
 * If a 401 Unauthorized status is received, it automatically triggers the registered
 * token refresher, updates the Authorization header with the fresh token, and replays the request.
 */
export async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = 30000,
  retryAuthCount: number = 0
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    // 401 Unauthorized Interceptor: automatically refresh token and retry request once
    if (response.status === 401 && retryAuthCount < 1 && globalTokenRefreshHandler) {
      try {
        const freshToken = await requestFreshToken();
        if (freshToken && freshToken !== 'GUEST_BYPASS') {
          console.log(`[GoogleApi Interceptor] Token baru berhasil diperoleh. Mengulang permintaan API ke: ${url}`);
          
          const newHeaders = new Headers(options.headers || {});
          newHeaders.set('Authorization', `Bearer ${freshToken}`);
          
          const retryOptions: RequestInit = {
            ...options,
            headers: newHeaders
          };
          
          return await fetchWithTimeout(url, retryOptions, timeoutMs, retryAuthCount + 1);
        }
      } catch (refreshErr: any) {
        const isPopupBlocked = refreshErr?.code === 'auth/popup-blocked' || String(refreshErr?.message || '').includes('popup-blocked');
        const isPopupCancelled = refreshErr?.code === 'auth/cancelled-popup-request' || refreshErr?.code === 'auth/popup-closed-by-user';
        if (isPopupBlocked || isPopupCancelled) {
          console.warn("[GoogleApi Interceptor] Sesi Google memerlukan tindakan manual pengguna (popup diblokir atau dibatalkan).");
        } else {
          console.warn("[GoogleApi Interceptor] Gagal memperbarui token otomatis saat 401:", refreshErr?.message || refreshErr);
        }
      }
    }

    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const timeoutErr: any = new Error(`Koneksi Google API timeout (${timeoutMs / 1000} detik).`);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      // If network failure / token issue and auth handler is available, try refreshing once
      if (retryAuthCount < 1 && globalTokenRefreshHandler) {
        try {
          const freshToken = await requestFreshToken();
          if (freshToken && freshToken !== 'GUEST_BYPASS') {
            const newHeaders = new Headers(options.headers || {});
            newHeaders.set('Authorization', `Bearer ${freshToken}`);
            return await fetchWithTimeout(url, { ...options, headers: newHeaders }, timeoutMs, retryAuthCount + 1);
          }
        } catch (refreshErr: any) {
          const isPopupBlocked = refreshErr?.code === 'auth/popup-blocked' || String(refreshErr?.message || '').includes('popup-blocked');
          if (isPopupBlocked) {
            console.warn("[GoogleApi Interceptor] Pembaruan token dilewati karena popup diblokir peramban.");
          } else {
            console.warn("[GoogleApi Interceptor] Gagal refresh saat Failed to fetch:", refreshErr?.message || refreshErr);
          }
        }
      }

      const authErr: any = new Error(`Koneksi ke Google API terputus (Failed to fetch). Token Google mungkin telah kedaluwarsa atau terjadi gangguan koneksi.`);
      authErr.isAuthError = true;
      authErr.code = 'UNAUTHENTICATED';
      throw authErr;
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Extracts and throws detailed error messages from Google API response bodies
 */
async function handleResponseError(response: Response, defaultMessage: string): Promise<never> {
  let detail = "";
  let errorCode = "";
  try {
    const data = await response.json();
    if (data && data.error) {
      if (data.error.message) detail = data.error.message;
      if (data.error.status) errorCode = data.error.status;
    }
  } catch (e) {
    // ignore non-json errors
  }

  const isAuthIssue = response.status === 401 || 
    errorCode === 'UNAUTHENTICATED' || 
    detail.toLowerCase().includes('invalid authentication credentials') ||
    detail.toLowerCase().includes('oauth 2 access token') ||
    detail.toLowerCase().includes('unauthenticated');

  let errorMessage: string;
  if (isAuthIssue) {
    errorMessage = `Sesi Google Drive / Sheets telah kedaluwarsa (Token Expired). Silakan klik "Perbarui Sesi Google" untuk memperbarui izin dan menyimpan data tanpa kehilangan isian form.`;
  } else {
    errorMessage = detail ? `${defaultMessage}: ${detail}` : `${defaultMessage} (${response.statusText || 'HTTP ' + response.status})`;
  }

  const err: any = new Error(errorMessage);
  if (isAuthIssue) {
    err.isAuthError = true;
    err.code = 'UNAUTHENTICATED';
  }
  throw err;
}

/**
 * Searches for the master spreadsheet in Drive.
 * If not found, creates it and initializes headers.
 */
export async function findOrCreateSpreadsheet(accessToken: string, spreadsheetName: string = SPREADSHEET_NAME, parentFolderId?: string): Promise<string> {
  try {
    let query = `name='${spreadsheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    
    const response = await fetchWithTimeout(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      await handleResponseError(response, "Gagal mencari spreadsheet");
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    
    // Create new spreadsheet inside specific folder using Drive API v3
    const body: any = {
      name: spreadsheetName,
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };
    if (parentFolderId) {
      body.parents = [parentFolderId];
    }
    
    const createResponse = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!createResponse.ok) {
      await handleResponseError(createResponse, "Gagal membuat spreadsheet baru di Drive");
    }
    
    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.id;
    
    // Initialize headers in the first row
    const headers = getSheetHeaders();
    const updateResponse = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [headers]
      })
    });
    
    if (!updateResponse.ok) {
      console.error("Gagal mengisi header spreadsheet:", await updateResponse.text());
    }
    
    return spreadsheetId;
  } catch (err) {
    console.error("Error findOrCreateSpreadsheet:", err);
    throw err;
  }
}

/**
 * Automates the creation of Google Drive folders and spreadsheet for a given project.
 */
export async function setupProjectDriveStructure(
  accessToken: string,
  projectName: string
): Promise<{ folderId: string; spreadsheetId: string; uploadsFolderId: string }> {
  try {
    // 1. Find or create the root app folder "PROJECT_VENTURA"
    const rootFolderId = await findOrCreateFolder(accessToken, "PROJECT_VENTURA");
    
    // 2. Find or create the specific project folder under "PROJECT_VENTURA"
    const projectFolderId = await findOrCreateFolder(accessToken, projectName, rootFolderId);
    
    // 3. Find or create the spreadsheet inside the project folder
    const spreadsheetName = `Data_Lahan_${projectName.replace(/[\/\\?%*:|"<>\s]/g, '_')}`;
    const spreadsheetId = await findOrCreateSpreadsheet(accessToken, spreadsheetName, projectFolderId);
    
    // 4. Find or create the upload files subfolder inside the project folder
    const uploadsFolderId = await findOrCreateFolder(accessToken, "SIP_Berkas_Pertanahan_Desa", projectFolderId);
    
    return {
      folderId: projectFolderId,
      spreadsheetId,
      uploadsFolderId
    };
  } catch (err: any) {
    console.warn("Info setupProjectDriveStructure:", err?.message || err);
    throw err;
  }
}

/**
 * Fetches all records from the spreadsheet atomically.
 * Supports expectedMinCount validation, auto-retry, and data integrity logging against Firestore/local cache.
 */
export async function fetchSpreadsheetRecords(
  accessToken: string,
  spreadsheetId: string,
  options?: {
    expectedMinCount?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    projectId?: string;
    cachedFirestoreCount?: number;
    onIntegrityCheck?: (log: DataIntegrityLog) => void;
  }
): Promise<LandRecord[]> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 450;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // Read entire sheet range A:ZZ atomically
      const range = "A:ZZ";
      const response = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        },
        30000
      );
      
      if (!response.ok) {
        await handleResponseError(response, "Gagal mengambil data dari spreadsheet");
      }
      
      const data = await response.json();
      const allRows: any[][] = data.values || [];
      
      if (allRows.length === 0) {
        return [];
      }
      
      const headers = allRows[0];
      const dataRows = allRows.slice(1);
      
      // Construct data records for the client ensuring exact spreadsheet rowNumber alignment
      const seenIdsForClient = new Set<string>();
      const records: LandRecord[] = [];
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const sheetRowNumber = i + 2; // EXACT spreadsheet 1-based row number (row 1 is header)
        
        // Skip completely empty rows
        if (!row || row.length === 0 || !row.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== "")) {
          continue;
        }

        const record = rowToRecord(row, i);
        record.rowNumber = sheetRowNumber;

        // Auto-heal missing CODE in memory if DESA, SPAN, and NOBID are present
        if (!record.CODE || record.CODE.trim() === "") {
          const cleanDesa = (record.DESA || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
          const cleanSpan = (record.SPAN || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
          const cleanNobid = (record.NOBID || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
          if (cleanDesa && cleanSpan && cleanNobid) {
            record.CODE = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
          } else if (cleanDesa || cleanNobid) {
            record.CODE = `BIDANG_${sheetRowNumber}`;
          }
        }
        
        let uniqueId = record.ID_UNIK;
        if (!uniqueId || seenIdsForClient.has(uniqueId)) {
          uniqueId = `ID-${(record.CODE || 'REC').replace(/[\s-]/g, '_')}_R${sheetRowNumber}`;
          record.ID_UNIK = uniqueId;
        }
        seenIdsForClient.add(uniqueId);

        records.push(record);
      }

      // Atomic verification: If an expected minimum count was requested (e.g. right after an append)
      if (options?.expectedMinCount && records.length < options.expectedMinCount && attempt < maxRetries) {
        attempt++;
        console.warn(`[fetchSpreadsheetRecords] Data belum tersinkronisasi penuh (didapat ${records.length}, diharapkan minimal ${options.expectedMinCount}). Mencoba ulang ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
        continue;
      }

      // Data Integrity Logging: Compare row count with Firestore cache if provided
      if (options?.cachedFirestoreCount !== undefined && options.cachedFirestoreCount >= 0) {
        const sheetCount = records.length;
        const cacheCount = options.cachedFirestoreCount;
        const diff = sheetCount - cacheCount;
        const isConsistent = diff === 0;

        const integrityLog: DataIntegrityLog = {
          timestamp: Date.now(),
          projectId: options.projectId || 'active-project',
          spreadsheetCount: sheetCount,
          cacheCount: cacheCount,
          difference: diff,
          status: isConsistent ? 'CONSISTENT' : 'INCONSISTENT',
          message: isConsistent 
            ? `[Log Integritas Data] Sinkron: Jumlah baris Spreadsheet (${sheetCount}) sama dengan Cache (${cacheCount}).`
            : `[Log Integritas Data] Terdeteksi selisih: Spreadsheet memiliki ${sheetCount} baris, sedangkan Cache memiliki ${cacheCount} baris (${diff > 0 ? `+${diff}` : diff} baris).`
        };

        if (isConsistent) {
          console.log(integrityLog.message);
        } else {
          console.warn(integrityLog.message);
        }

        if (options.onIntegrityCheck) {
          options.onIntegrityCheck(integrityLog);
        }
      }

      return records;
    } catch (err: any) {
      if (attempt < maxRetries && !err?.isAuthError) {
        attempt++;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
        continue;
      }
      console.warn("Catatan fetchSpreadsheetRecords:", err?.message || err);
      throw err;
    }
  }

  return [];
}

/**
 * Saves a record (either appending a new row or updating an existing one) using an Idempotency Key mechanism.
 * Performs a pre-flight database lookup on ID_UNIK and CODE columns to prevent duplicate row creation.
 * If the record already exists in the Google Sheet database, it safely overwrites (PUT) that exact row.
 */
export async function saveRecordToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  record: LandRecord,
  isEdit: boolean,
  existingRecords: LandRecord[],
  originalRecord?: LandRecord | null
): Promise<LandRecord> {
  try {
    // 1. Ensure CODE is fully computed
    if (!record.CODE || record.CODE.trim() === '') {
      const cleanDesa = (record.DESA || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
      const cleanSpan = (record.SPAN || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
      const cleanNobid = (record.NOBID || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
      if (cleanDesa && cleanSpan && cleanNobid) {
        record.CODE = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
      }
    }

    // 2. Ensure Idempotency Key (ID_UNIK) is deterministically set (inherit from original if editing)
    if (!record.ID_UNIK || record.ID_UNIK.trim() === '') {
      if (originalRecord?.ID_UNIK && originalRecord.ID_UNIK.trim() !== '') {
        record.ID_UNIK = originalRecord.ID_UNIK;
      } else {
        const codeIdentifier = (record.CODE || 'REC').replace(/[\s-]/g, '_');
        record.ID_UNIK = `ID-${codeIdentifier}`;
      }
    }

    // 3. Locate Target Row in Google Sheets
    // Priority:
    // A. originalRecord.rowNumber or record.rowNumber (if valid > 1)
    // B. Match in existingRecords (by original ID_UNIK, original CODE, current ID_UNIK, current CODE, or Desa/Span/Nobid)
    let targetRowIndex: number | undefined = isEdit ? (originalRecord?.rowNumber || record.rowNumber) : undefined;
    
    if (isEdit && (!targetRowIndex || targetRowIndex <= 1)) {
      const origId = originalRecord?.ID_UNIK?.trim();
      const origCode = originalRecord?.CODE?.trim().toUpperCase();
      const currId = record.ID_UNIK?.trim();
      const currCode = record.CODE?.trim().toUpperCase();

      const match = existingRecords.find(r => 
        (origId && r.ID_UNIK && r.ID_UNIK === origId) ||
        (origCode && r.CODE && r.CODE.trim().toUpperCase() === origCode) ||
        (currId && r.ID_UNIK && r.ID_UNIK === currId) ||
        (currCode && r.CODE && r.CODE.trim().toUpperCase() === currCode) ||
        (originalRecord?.DESA && originalRecord?.SPAN && originalRecord?.NOBID && 
         r.DESA?.toUpperCase() === originalRecord.DESA.toUpperCase() && 
         r.SPAN?.toUpperCase() === originalRecord.SPAN.toUpperCase() && 
         r.NOBID?.toUpperCase() === originalRecord.NOBID.toUpperCase()) ||
        (record.DESA && record.SPAN && record.NOBID && 
         r.DESA?.toUpperCase() === record.DESA.toUpperCase() && 
         r.SPAN?.toUpperCase() === record.SPAN.toUpperCase() && 
         r.NOBID?.toUpperCase() === record.NOBID.toUpperCase())
      );
      
      if (match && match.rowNumber && match.rowNumber > 1) {
        targetRowIndex = match.rowNumber;
      }
    }

    // 4. Live Idempotency Verification directly in Google Sheets Database
    // Query columns A (CODE) and IO (ID_UNIK) before executing an append/update if row is still unknown
    if (!targetRowIndex && isEdit) {
      try {
        const checkResponse = await fetchWithTimeout(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=A:A&ranges=IO:IO`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          },
          10000
        );

        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          const codeRows: string[][] = checkData.valueRanges?.[0]?.values || [];
          const idUnikRows: string[][] = checkData.valueRanges?.[1]?.values || [];
          const maxRows = Math.max(codeRows.length, idUnikRows.length);

          const searchCodes = [
            originalRecord?.CODE?.trim().toUpperCase(),
            record.CODE?.trim().toUpperCase()
          ].filter(Boolean) as string[];

          const searchIds = [
            originalRecord?.ID_UNIK?.trim(),
            record.ID_UNIK?.trim()
          ].filter(Boolean) as string[];

          // Row 0 is the header (Row 1 in spreadsheet) -> check data rows starting at index 1
          for (let r = 1; r < maxRows; r++) {
            const sheetRow = r + 1; // 1-based spreadsheet row index
            const currentCode = (codeRows[r]?.[0] || '').trim().toUpperCase();
            const currentIdUnik = (idUnikRows[r]?.[0] || '').trim();

            const idMatch = currentIdUnik && searchIds.includes(currentIdUnik);
            const codeMatch = currentCode && searchCodes.includes(currentCode);

            if (idMatch || codeMatch) {
              targetRowIndex = sheetRow;
              console.log(`[Idempotency Key] Ditemukan baris existing ke-${sheetRow} (CODE: ${currentCode}, ID: ${currentIdUnik}). Target overwrite update.`);
              break;
            }
          }
        }
      } catch (lookupErr) {
        console.warn("[Idempotency Key] Pengecekan database langsung dilewati:", lookupErr);
      }
    }

    // Assign final row number back to the record for future operations
    if (targetRowIndex) {
      record.rowNumber = targetRowIndex;
    }

    const rowValues = recordToRow(record);

    // 5. Execute Idempotent Overwrite (PUT) if row exists, or Append (POST) if truly new
    if (targetRowIndex && targetRowIndex > 1) {
      // Overwrite/Update specific existing row in Google Sheets
      const range = `A${targetRowIndex}`;
      
      const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [rowValues]
        })
      });
      
      if (!response.ok) {
        await handleResponseError(response, `Gagal mengupdate baris ${targetRowIndex} spreadsheet`);
      }
    } else {
      // Append a new row to Google Sheets
      const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [rowValues]
        })
      });
      
      if (!response.ok) {
        await handleResponseError(response, "Gagal menyisipkan baris baru ke spreadsheet");
      }

      // Parse updatedRange from response to ensure precise rowNumber
      try {
        const appendResult = await response.json();
        const updatedRange = appendResult?.updates?.updatedRange || '';
        const match = updatedRange.match(/!?[A-Z]+(\d+):/i) || updatedRange.match(/(\d+)/);
        if (match && match[1]) {
          record.rowNumber = parseInt(match[1], 10);
        }
      } catch (parseErr) {
        console.warn("Info parse append response:", parseErr);
      }
    }

    return record;
  } catch (err) {
    console.error("Error saveRecordToSpreadsheet:", err);
    throw err;
  }
}

/**
 * Searches for a folder or creates it under the specified parent.
 */
export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string,
  idUnik?: string
): Promise<string> {
  try {
    const validParentId = parentId && /^[a-zA-Z0-9_-]{15,60}$/.test(parentId.trim()) ? parentId.trim() : undefined;
    const parentQuery = validParentId ? `'${validParentId}' in parents` : "'root' in parents";
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
    
    // If idUnik is provided, search by idUnik prefix instead of exact name to keep it persistent even after renames!
    if (idUnik) {
      query = `name contains '${idUnik}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
    }
    
    const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      await handleResponseError(response, "Gagal mencari folder");
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      const folderId = data.files[0].id;
      const currentName = data.files[0].name || "";
      const expectedName = idUnik ? `${idUnik}_${folderName}` : folderName;
      
      // If the folder name is outdated (e.g. they changed the display CODE), rename it on the fly!
      if (idUnik && currentName !== expectedName) {
        try {
          await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: expectedName })
          });
        } catch (renameErr) {
          console.warn("Failed to rename folder, continuing anyway:", renameErr);
        }
      }
      return folderId;
    }
    
    // Create the folder
    const finalFolderName = idUnik ? `${idUnik}_${folderName}` : folderName;
    const createResponse = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: finalFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: validParentId ? [validParentId] : ['root']
      })
    });
    
    if (!createResponse.ok) {
      await handleResponseError(createResponse, "Gagal membuat folder baru");
    }
    
    const folder = await createResponse.json();
    return folder.id;
  } catch (err) {
    console.error("Error findOrCreateFolder:", err);
    throw err;
  }
}

/**
 * Sanitizes text components for Google Drive naming according to Android ROW PLN spec:
 * 1. Dot (.) is completely removed from all text components (DESA, SPAN, NOBID, NAMA).
 * 2. Forbidden characters (/ \ : * ? " < > | % # & + = ; @) are stripped.
 * 3. Hyphen/strip (-) is converted to underscore (_).
 * 4. Whitespaces converted to underscore, uppercase.
 */
export function sanitizeTextForDrive(text: string): string {
  if (!text) return '';
  return text
    .toUpperCase()
    .replace(/\./g, '') // 1. Dot (.) dihilangkan total
    .replace(/[\/\\?%*:|"<>#&+;=@]/g, '') // 2. Karakter terlarang dibuang
    .replace(/[-]/g, '_') // 3. Pemisah strip (-) dikonversi menjadi (_)
    .replace(/\s+/g, '_') // Spasi jadi underscore
    .replace(/_+/g, '_') // Hindari double underscore
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscore
}

/**
 * Builds standard sanitized file name according to Android ROW PLN spec:
 * <TAG>_<DESA>_<SPAN>_<NOBID>_<NAMA_PEMILIK>.<ext>
 * e.g. KTP_BURU_T12_T14_12_SUTRISNO.jpg
 */
export function buildSanitizedFileName(
  tag: string,
  recordOrCode: string | Partial<LandRecord> | { DESA?: string; SPAN?: string; NOBID?: string; NAMA?: string; CODE?: string },
  ext: string
): string {
  const cleanTag = sanitizeTextForDrive(tag) || 'DOKUMEN';
  const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'pdf';

  if (typeof recordOrCode === 'object' && recordOrCode !== null) {
    const cleanDesa = sanitizeTextForDrive(recordOrCode.DESA || 'DESA');
    const cleanSpan = sanitizeTextForDrive(recordOrCode.SPAN || 'SPAN');
    const cleanNobid = sanitizeTextForDrive(recordOrCode.NOBID || '001');
    const cleanNama = sanitizeTextForDrive(recordOrCode.NAMA || 'PEMILIK');
    return `${cleanTag}_${cleanDesa}_${cleanSpan}_${cleanNobid}_${cleanNama}.${cleanExt}`;
  }

  // Fallback if only string code is provided (e.g. "BURU_T.12-T.14_12")
  const rawCode = String(recordOrCode || 'BIDANG_001');
  const cleanCode = sanitizeTextForDrive(rawCode);
  return `${cleanTag}_${cleanCode}.${cleanExt}`;
}

/**
 * Builds standard parcel main folder name according to Android ROW PLN spec:
 * <KODE_BIDANG>_<NAMA_PEMILIK>
 * e.g. BURU_T12_T14_12_SUTRISNO
 */
export function buildSanitizedParcelFolderName(
  record: Partial<LandRecord> | { DESA?: string; SPAN?: string; NOBID?: string; NAMA?: string; CODE?: string }
): string {
  const cleanDesa = sanitizeTextForDrive(record.DESA || '');
  const cleanSpan = sanitizeTextForDrive(record.SPAN || '');
  const cleanNobid = sanitizeTextForDrive(record.NOBID || '');
  const cleanNama = sanitizeTextForDrive(record.NAMA || 'PEMILIK');

  let codeBase = '';
  if (cleanDesa && cleanSpan && cleanNobid) {
    codeBase = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
  } else if (record.CODE) {
    codeBase = sanitizeTextForDrive(record.CODE);
  } else {
    codeBase = `BIDANG_${cleanNobid || '001'}`;
  }

  return cleanNama ? `${codeBase}_${cleanNama}` : codeBase;
}

/**
 * Renames a folder or file in Google Drive
 */
export async function renameFolderInDrive(
  accessToken: string,
  folderId: string,
  newName: string
): Promise<boolean> {
  try {
    if (!folderId || !newName) return false;
    const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to rename folder in Drive:", e);
    return false;
  }
}

/**
 * Uploads a binary file to a specific Drive folder, with sanitized naming convention:
 * <TAG>_<DESA>_<SPAN>_<NOBID>_<NAMA_PEMILIK>.<ext>
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File,
  docType: string, // KTP, KK, ALAS_HAK, PERALIHAN_HAK, etc.
  recordOrCode: string | Partial<LandRecord>,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  try {
    const ext = file.name.split('.').pop() || 'pdf';
    const customFileName = buildSanitizedFileName(docType, recordOrCode, ext);
    
    // Validate folderId: must look like a valid Google Drive ID
    const isValidFolderId = folderId && typeof folderId === 'string' && /^[a-zA-Z0-9_-]{15,60}$/.test(folderId.trim());
    const validFolderId = isValidFolderId ? folderId.trim() : undefined;

    const metadata: any = {
      name: customFileName,
      mimeType: file.type || 'application/pdf',
    };
    if (validFolderId) {
      metadata.parents = [validFolderId];
    }

    const boundary = 'sip_upload_boundary_delimiter';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    // Convert file to base64
    const base64Promise = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
    const base64Data = await base64Promise;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type || 'application/pdf'}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      closeDelimiter;

    let response = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }, 15000);
    
    if (!response.ok && validFolderId) {
      console.warn("Upload with parent folder failed, retrying without parent folder...");
      delete metadata.parents;
      const retryBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${file.type || 'application/pdf'}\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        base64Data +
        closeDelimiter;

      response = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: retryBody
      }, 15000);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload gagal: ${response.statusText} - ${errorText}`);
    }
    
    const fileInfo = await response.json();
    return {
      fileId: fileInfo.id,
      webViewLink: fileInfo.webViewLink || `https://drive.google.com/file/d/${fileInfo.id}/view`
    };
  } catch (err) {
    console.error("Error uploadFileToDrive:", err);
    throw err;
  }
}

export type ParcelSubfolderCategory = 
  | '1. Dokumentasi Lapangan dan Foto Warga'
  | '2. Berkas'
  | '3. Dokumen'
  | '4. Form Invent';

export const PARCEL_SUBFOLDERS: ParcelSubfolderCategory[] = [
  '1. Dokumentasi Lapangan dan Foto Warga',
  '2. Berkas',
  '3. Dokumen',
  '4. Form Invent'
];

/**
 * Maps document tag/type to one of the 4 standard Google Drive subfolders
 * strictly compliant with Android ROW PLN specification:
 * 
 * 1. Dokumentasi Lapangan dan Foto Warga:
 *    - BIDANG_1, BIDANG_1_RAW, BIDANG_2, BIDANG_3, WAJAH_PATOK, WAJAH_PEMILIK
 * 2. Berkas:
 *    - KTP, KK, ALAS_HAK, PERALIHAN_HAK, JUAL_BELI, KETERANGAN_WARIS, KUASA_WARIS,
 *      SURAT_KUASA, KET_BEDA_NAMA, WAKAF, KLAIM_TANAMAN, KLAIM_BANGUNAN, DOKUMEN_LAIN
 * 3. Dokumen:
 *    - TTD_TIM_1, TTD_TIM_2, TTD_PEMILIK, TTD_SAKSI_1, TTD_SAKSI_2, TTD_KADES, CAP_DESA
 * 4. Form Invent:
 *    - FORM_INVENT (PDF Formulir Resmi Inventarisasi)
 */
export function getCategoryForDocType(docType: string): ParcelSubfolderCategory {
  const dt = docType.toUpperCase().trim();

  // Subfolder 1: Dokumentasi Lapangan dan Foto Warga
  if (
    dt.includes('BIDANG_1') || 
    dt.includes('BIDANG_2') || 
    dt.includes('BIDANG_3') || 
    dt.includes('WAJAH') || 
    dt.includes('PATOK') || 
    dt.includes('DOKUMENTASI')
  ) {
    return '1. Dokumentasi Lapangan dan Foto Warga';
  }

  // Subfolder 3: Dokumen (KHUSUS TTD Digital dan Cap Resmi Desa)
  if (
    dt.startsWith('TTD_') || 
    dt.includes('CAP_DESA') ||
    dt.includes('STEMPEL')
  ) {
    return '3. Dokumen';
  }

  // Subfolder 4: Form Invent (PDF Formulir Laporan)
  if (dt.includes('INVENT') || dt.includes('FORMULIR')) {
    return '4. Form Invent';
  }

  // Subfolder 2: Berkas (Seluruh berkas kepemilikan, peralihan, dan kependudukan)
  return '2. Berkas';
}

/**
 * Builds the neat hierarchical Google Drive structure for a parcel:
 * [uploadsFolderId] -> [DESA <NAMA_DESA>] -> [SPAN <NOMOR_SPAN>] -> [<KODE_BIDANG>_<NAMA_PEMILIK>] -> 4 Subfolders:
 * 1. Dokumentasi Lapangan dan Foto Warga
 * 2. Berkas
 * 3. Dokumen
 * 4. Form Invent
 */
export async function getOrCreateParcelFolderHierarchy(
  accessToken: string,
  uploadsFolderId: string,
  record: LandRecord,
  targetCategory?: ParcelSubfolderCategory
): Promise<{
  desaFolderId: string;
  spanFolderId: string;
  parcelFolderId: string;
  targetFolderId: string;
}> {
  try {
    // 1. Desa Folder: e.g. "DESA KUTA"
    const desaName = sanitizeTextForDrive(record.DESA || 'DESA_LAIN');
    const desaFolderName = `DESA ${desaName}`;
    const desaFolderId = await findOrCreateFolder(accessToken, desaFolderName, uploadsFolderId);

    // 2. Span Folder: e.g. "SPAN T12_T14"
    const spanName = sanitizeTextForDrive(record.SPAN || 'SPAN_LAIN');
    const spanFolderName = `SPAN ${spanName}`;
    const spanFolderId = await findOrCreateFolder(accessToken, spanFolderName, desaFolderId);

    // 3. Parcel Main Folder: standard Android format "<KODE_BIDANG>_<NAMA_PEMILIK>"
    // e.g. "BURU_T12_T14_12_SUTRISNO"
    const parcelFolderName = buildSanitizedParcelFolderName(record);
    const parcelFolderId = await findOrCreateFolder(accessToken, parcelFolderName, spanFolderId, record.ID_UNIK);

    // 4. Ensure target subfolder or all 4 subfolders exist inside parcelFolderId
    let targetFolderId = parcelFolderId;
    if (targetCategory) {
      targetFolderId = await findOrCreateFolder(accessToken, targetCategory, parcelFolderId);
    }

    return {
      desaFolderId,
      spanFolderId,
      parcelFolderId,
      targetFolderId
    };
  } catch (err) {
    console.error("Error getOrCreateParcelFolderHierarchy:", err);
    throw err;
  }
}

/**
 * Uploads a Base64 Image (e.g. transparent PNG signature, scan stamp, or canvas output) directly to Drive
 * with sanitized naming convention: <TAG>_<DESA>_<SPAN>_<NOBID>_<NAMA_PEMILIK>.png
 */
export async function uploadBase64ImageToDrive(
  accessToken: string,
  dataUrl: string,
  docType: string,
  recordOrCode: string | Partial<LandRecord>,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  try {
    const fileName = buildSanitizedFileName(docType, recordOrCode, 'png');
    
    // Extract raw base64 data from Data URL (data:image/png;base64,xxxx)
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    
    const isValidFolderId = folderId && typeof folderId === 'string' && /^[a-zA-Z0-9_-]{15,60}$/.test(folderId.trim());
    const validFolderId = isValidFolderId ? folderId.trim() : undefined;

    const metadata: any = {
      name: fileName,
      mimeType: 'image/png',
    };
    if (validFolderId) {
      metadata.parents = [validFolderId];
    }

    const boundary = 'sip_upload_boundary_sig_delimiter';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: image/png\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      closeDelimiter;

    const response = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }, 15000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload TTD gagal: ${response.statusText} - ${errorText}`);
    }

    const fileInfo = await response.json();
    return {
      fileId: fileInfo.id,
      webViewLink: fileInfo.webViewLink || `https://drive.google.com/file/d/${fileInfo.id}/view`
    };
  } catch (err) {
    console.error("Error uploadBase64ImageToDrive:", err);
    throw err;
  }
}

/**
 * Deletes a specific row in Google Sheets if rowNumber or record is provided.
 */
export async function deleteSpreadsheetRow(
  accessToken: string,
  spreadsheetId: string,
  rowNumber: number
): Promise<boolean> {
  if (!accessToken || accessToken === 'GUEST_BYPASS' || !spreadsheetId || !rowNumber || rowNumber <= 1) {
    return false;
  }
  try {
    const startIndex = rowNumber - 1; // 0-based inclusive
    const endIndex = rowNumber;       // 0-based exclusive

    // Dynamically resolve the first sheet's sheetId (in case gid != 0)
    let firstSheetId = 0;
    try {
      const metaRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        },
        8000
      );
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        const foundId = metaData?.sheets?.[0]?.properties?.sheetId;
        if (typeof foundId === 'number') {
          firstSheetId = foundId;
        }
      }
    } catch (metaErr) {
      console.warn("Could not fetch sheetId metadata, defaulting to 0:", metaErr);
    }

    const response = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: firstSheetId,
                  dimension: 'ROWS',
                  startIndex,
                  endIndex
                }
              }
            }
          ]
        })
      },
      10000
    );

    if (!response.ok) {
      console.warn("Gagal menghapus baris dari Google Sheets:", await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn("deleteSpreadsheetRow error:", err);
    return false;
  }
}

/**
 * Overwrites the entire Google Spreadsheet records table cleanly (used for structural mutations:
 * Merge / Gabung Bidang, Split / Pecah Bidang, Delete / Hapus Bidang with n-1 re-indexing).
 * Ensures all re-indexed NOBID/CODE values and row counts in Google Sheets match the application state.
 */
export async function overwriteSpreadsheetRecords(
  accessToken: string,
  spreadsheetId: string,
  records: LandRecord[]
): Promise<LandRecord[]> {
  if (!accessToken || accessToken === 'GUEST_BYPASS' || !spreadsheetId || spreadsheetId === 'guest_bypass') {
    throw new Error('Token Google OAuth atau ID Spreadsheet belum terhubung.');
  }

  const headers = getSheetHeaders();
  const normalizedRecords: LandRecord[] = records.map((r, idx) => {
    const cleanDesa = (r.DESA || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
    const cleanSpan = (r.SPAN || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
    const cleanNobid = (r.NOBID || '').trim().toUpperCase().replace(/[\s\/\\?%*:|"]/g, '_');
    const code = (r.CODE && r.CODE.trim())
      ? r.CODE.trim()
      : (cleanDesa && cleanSpan && cleanNobid ? `${cleanDesa}_${cleanSpan}_${cleanNobid}` : `BIDANG_${idx + 2}`);
    const idUnik = (r.ID_UNIK && r.ID_UNIK.trim())
      ? r.ID_UNIK.trim()
      : `ID-${code.replace(/[\s-]/g, '_')}`;

    return {
      ...r,
      CODE: code,
      ID_UNIK: idUnik,
      rowNumber: idx + 2,
      _needsSheetSync: false
    };
  });

  const rows = normalizedRecords.map(r => recordToRow(r));
  const allValues = [headers, ...rows];

  // 1. Write header + all current records starting at A1
  const putRes = await fetchWithTimeout(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: allValues
      })
    },
    30000
  );

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Gagal memperbarui tabel Google Spreadsheet: ${putRes.status} ${errText}`);
  }

  // 2. Clear any trailing rows below the new record count (critical when Merge or Delete reduces row count)
  const firstTrailingRow = normalizedRecords.length + 2;
  const lastTrailingRow = firstTrailingRow + 500;
  try {
    await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A${firstTrailingRow}:ZZ${lastTrailingRow}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      },
      15000
    );
  } catch (clearErr) {
    console.warn("Trailing rows clear warning:", clearErr);
  }

  return normalizedRecords;
}

// ----------------- RESUME PROYEK 1 WORKBOOK (GOOGLE SHEETS) -----------------

export const RESUME_SHEET_TAB_NAME = "RESUME_SEMUA_JALUR";

export const RESUME_SHEET_HEADERS = [
  "ID_RESUME",
  "ID_JALUR",
  "NAMA_JALUR",
  "DESA",
  "KECAMATAN",
  "KABUPATEN",
  "TOTAL_BIDANG",
  "TOTAL_LUAS_M2",
  "PROGRES_PERSEN",
  // 1. Sosialisasi Pendahuluan
  "STATUS_PENDAHULUAN",
  "TGL_PENDAHULUAN",
  "LINK_PDF_PENDAHULUAN",
  "FOTO_DOKUMENTASI_PENDAHULUAN",
  "CATATAN_PENDAHULUAN",
  // 2. Sosialisasi Pengumuman Inv
  "STATUS_PENGUMUMAN_INV",
  "TGL_PENGUMUMAN_INV",
  "LINK_PDF_PENGUMUMAN_INV",
  "FOTO_DOKUMENTASI_PENGUMUMAN_INV",
  "CATATAN_PENGUMUMAN_INV",
  // 3. BAPT Register
  "STATUS_BAPT_REGISTER",
  "TGL_BAPT_REGISTER",
  "LINK_PDF_BAPT_REGISTER",
  "FOTO_DOKUMENTASI_BAPT_REGISTER",
  "CATATAN_BAPT_REGISTER",
  // 4. Sosialisasi Penyampaian Nilai
  "STATUS_PENYAMPAIAN_NILAI",
  "TGL_PENYAMPAIAN_NILAI",
  "LINK_PDF_PENYAMPAIAN_NILAI",
  "FOTO_DOKUMENTASI_PENYAMPAIAN_NILAI",
  "CATATAN_PENYAMPAIAN_NILAI",
  // 5. Sosialisasi Pembayaran Kompensasi
  "STATUS_PEMBAYARAN_KOMP",
  "TGL_PEMBAYARAN_KOMP",
  "LINK_PDF_PEMBAYARAN_KOMP",
  "FOTO_DOKUMENTASI_PEMBAYARAN_KOMP",
  "CATATAN_PEMBAYARAN_KOMP",
  // 6. Bush Clearing
  "STATUS_BUSH_CLEARING",
  "TGL_BUSH_CLEARING",
  "LINK_PDF_BUSH_CLEARING",
  "FOTO_DOKUMENTASI_BUSH_CLEARING",
  "CATATAN_BUSH_CLEARING",
  // Link Folder Google Drive Desa & Metadata
  "LINK_FOLDER_DESA_DRIVE",
  "TERAKHIR_DIPERBARUI",
  "OPERATOR"
];

/**
 * Creates a brand new dedicated Google Spreadsheet for Project Resumes with all 36 headers
 */
export async function createDedicatedResumeSpreadsheet(
  accessToken: string,
  projectName: string,
  folderId?: string | null
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const cleanName = projectName.replace(/[\/\\?%*:|"<>]/g, '_');
  const title = `RESUME_PROYEK_${cleanName}`;

  const createRes = await fetchWithTimeout(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title
        },
        sheets: [
          {
            properties: {
              title: RESUME_SHEET_TAB_NAME,
              gridProperties: {
                frozenRowCount: 1
              },
              tabColor: { red: 0.95, green: 0.6, blue: 0.1 }
            }
          }
        ]
      })
    },
    20000
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Gagal membuat Spreadsheet: ${errText}`);
  }

  const data = await createRes.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write the 36 headers to row 1
  await fetchWithTimeout(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(RESUME_SHEET_TAB_NAME)}'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [RESUME_SHEET_HEADERS]
      })
    },
    15000
  );

  // If folderId is provided, move file into folder
  if (folderId && folderId !== 'guest_bypass') {
    try {
      await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        },
        10000
      );
    } catch (moveErr) {
      console.warn("Unable to move resume spreadsheet into folder:", moveErr);
    }
  }

  return { spreadsheetId, spreadsheetUrl };
}

export const AGENCY_LETTER_SHEET_TAB_NAME = "SURAT_INSTANSI";

/**
 * Creates a brand new dedicated Google Spreadsheet for Agency Letters with all 13 headers (File 3)
 */
export async function createDedicatedAgencyLetterSpreadsheet(
  accessToken: string,
  projectName: string,
  folderId?: string | null
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const cleanName = projectName.replace(/[\/\\?%*:|"<>]/g, '_');
  const title = `SURAT_INSTANSI_${cleanName}`;
  const headers = getAgencyLetterSheetHeaders();

  const createRes = await fetchWithTimeout(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title
        },
        sheets: [
          {
            properties: {
              title: AGENCY_LETTER_SHEET_TAB_NAME,
              gridProperties: {
                frozenRowCount: 1
              },
              tabColor: { red: 0.15, green: 0.55, blue: 0.95 }
            }
          }
        ]
      })
    },
    20000
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Gagal membuat Spreadsheet Surat Instansi: ${errText}`);
  }

  const data = await createRes.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write the 13 headers to row 1
  await fetchWithTimeout(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(AGENCY_LETTER_SHEET_TAB_NAME)}'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [headers]
      })
    },
    15000
  );

  // If folderId is provided, move file into folder
  if (folderId && folderId !== 'guest_bypass') {
    try {
      await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        },
        10000
      );
    } catch (moveErr) {
      console.warn("Unable to move agency letter spreadsheet into folder:", moveErr);
    }
  }

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Ensures that the RESUME_SEMUA_JALUR tab exists in the active Google Sheets workbook.
 */
export async function ensureResumeSheetTab(accessToken: string, spreadsheetId: string): Promise<boolean> {
  try {
    const metaRes = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      12000
    );
    if (!metaRes.ok) return false;
    const metaData = await metaRes.json();
    const sheets: any[] = metaData.sheets || [];
    const exists = sheets.some((s: any) => s.properties?.title === RESUME_SHEET_TAB_NAME);

    if (!exists) {
      // Create new tab inside the same workbook
      const addSheetRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: RESUME_SHEET_TAB_NAME,
                    tabColor: { red: 0.95, green: 0.6, blue: 0.1 }
                  }
                }
              }
            ]
          })
        },
        15000
      );
      if (!addSheetRes.ok) return false;

      // Write column headers
      await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(RESUME_SHEET_TAB_NAME)}'!A1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [RESUME_SHEET_HEADERS]
          })
        },
        15000
      );
    }
    return true;
  } catch (err) {
    console.warn("ensureResumeSheetTab error:", err);
    return false;
  }
}

/**
 * Maps a VillageResume object to an array of cell values for Google Sheets.
 */
export function villageResumeToSheetRow(
  resume: VillageResume, 
  projectName: string, 
  totalBidang = 0, 
  totalLuas = 0,
  progressPct = 0
): any[] {
  return [
    resume.id,
    resume.projectId,
    projectName,
    resume.desaName,
    resume.kecamatan || '',
    resume.kabupaten || '',
    totalBidang > 0 ? totalBidang : '',
    totalLuas > 0 ? totalLuas : '',
    `${progressPct}%`,
    // 1. Sosialisasi Pendahuluan
    resume.baSosialisasiAwal?.status || 'BELUM',
    resume.baSosialisasiAwal?.date || '',
    resume.baSosialisasiAwal?.pdfUrl || '',
    (resume.baSosialisasiAwal?.docPhotos || []).join(' ; '),
    resume.baSosialisasiAwal?.notes || '',
    // 2. Sosialisasi Pengumuman Inv
    resume.baPengumuman?.status || 'BELUM',
    resume.baPengumuman?.date || '',
    resume.baPengumuman?.pdfUrl || '',
    (resume.baPengumuman?.docPhotos || []).join(' ; '),
    resume.baPengumuman?.notes || '',
    // 3. BAPT Register
    resume.lampiranBapt?.status || 'BELUM',
    resume.lampiranBapt?.date || '',
    resume.lampiranBapt?.pdfUrl || '',
    (resume.lampiranBapt?.docPhotos || []).join(' ; '),
    resume.lampiranBapt?.notes || '',
    // 4. Sosialisasi Penyampaian Nilai
    resume.baPenyampaianNilai?.status || 'BELUM',
    resume.baPenyampaianNilai?.date || '',
    resume.baPenyampaianNilai?.pdfUrl || '',
    (resume.baPenyampaianNilai?.docPhotos || []).join(' ; '),
    resume.baPenyampaianNilai?.notes || '',
    // 5. Sosialisasi Pembayaran Komp
    resume.baSerahTerimaRekening?.status || 'BELUM',
    resume.baSerahTerimaRekening?.date || '',
    resume.baSerahTerimaRekening?.pdfUrl || '',
    (resume.baSerahTerimaRekening?.docPhotos || []).join(' ; '),
    resume.baSerahTerimaRekening?.notes || '',
    // 6. Bush Clearing
    resume.bushClearing?.status || 'BELUM',
    resume.bushClearing?.date || '',
    resume.bushClearing?.pdfUrl || '',
    (resume.bushClearing?.docPhotos || []).join(' ; '),
    resume.bushClearing?.notes || '',
    // Folder Drive Desa & Metadata
    resume.driveFolderId ? (resume.driveFolderId.startsWith('http') ? resume.driveFolderId : `https://drive.google.com/drive/folders/${resume.driveFolderId}`) : '',
    new Date(resume.lastUpdated || Date.now()).toLocaleString('id-ID'),
    resume.updatedBy || 'Operator'
  ];
}

/**
 * Maps a row from Google Sheets back into a VillageResume object.
 * Supports both new 42-column format and legacy 36-column format seamlessly.
 */
export function sheetRowToVillageResume(row: any[]): VillageResume {
  const id = row[0] || '';
  const projectId = row[1] || 'proj-1';
  const desaName = row[3] || '';
  const kecamatan = row[4] || '';
  const kabupaten = row[5] || '';

  const parsePhotos = (val: any): string[] => {
    if (!val || typeof val !== 'string') return [];
    return val.split(/[;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  };

  const isNewFormat = row.length >= 40;

  if (isNewFormat) {
    return {
      id: id || `${projectId}_${desaName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
      projectId,
      desaName: desaName.toUpperCase(),
      kecamatan,
      kabupaten,
      driveFolderId: row[39] || undefined,
      baSosialisasiAwal: {
        status: (row[9] as any) || 'BELUM',
        date: row[10] || '',
        pdfUrl: row[11] || undefined,
        docPhotos: parsePhotos(row[12]),
        notes: row[13] || ''
      },
      baPengumuman: {
        status: (row[14] as any) || 'BELUM',
        date: row[15] || '',
        pdfUrl: row[16] || undefined,
        docPhotos: parsePhotos(row[17]),
        notes: row[18] || ''
      },
      lampiranBapt: {
        status: (row[19] as any) || 'BELUM',
        date: row[20] || '',
        pdfUrl: row[21] || undefined,
        docPhotos: parsePhotos(row[22]),
        notes: row[23] || ''
      },
      baPenyampaianNilai: {
        status: (row[24] as any) || 'BELUM',
        date: row[25] || '',
        pdfUrl: row[26] || undefined,
        docPhotos: parsePhotos(row[27]),
        notes: row[28] || ''
      },
      baSerahTerimaRekening: {
        status: (row[29] as any) || 'BELUM',
        date: row[30] || '',
        pdfUrl: row[31] || undefined,
        docPhotos: parsePhotos(row[32]),
        notes: row[33] || ''
      },
      bushClearing: {
        status: (row[34] as any) || 'BELUM',
        date: row[35] || '',
        pdfUrl: row[36] || undefined,
        docPhotos: parsePhotos(row[37]),
        notes: row[38] || ''
      },
      lastUpdated: Date.now(),
      updatedBy: row[41] || 'Google Sheet'
    };
  }

  // Legacy format (36 columns)
  return {
    id: id || `${projectId}_${desaName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
    projectId,
    desaName: desaName.toUpperCase(),
    kecamatan,
    kabupaten,
    driveFolderId: row[33] || undefined,
    baSosialisasiAwal: {
      status: (row[9] as any) || 'BELUM',
      date: row[10] || '',
      pdfUrl: row[11] || undefined,
      notes: row[12] || '',
      docPhotos: []
    },
    baPengumuman: {
      status: (row[13] as any) || 'BELUM',
      date: row[14] || '',
      pdfUrl: row[15] || undefined,
      notes: row[16] || '',
      docPhotos: []
    },
    lampiranBapt: {
      status: (row[17] as any) || 'BELUM',
      date: row[18] || '',
      pdfUrl: row[19] || undefined,
      notes: row[20] || '',
      docPhotos: []
    },
    baPenyampaianNilai: {
      status: (row[21] as any) || 'BELUM',
      date: row[22] || '',
      pdfUrl: row[23] || undefined,
      notes: row[24] || '',
      docPhotos: []
    },
    baSerahTerimaRekening: {
      status: (row[25] as any) || 'BELUM',
      date: row[26] || '',
      pdfUrl: row[27] || undefined,
      notes: row[28] || '',
      docPhotos: []
    },
    bushClearing: {
      status: (row[29] as any) || 'BELUM',
      date: row[30] || '',
      pdfUrl: row[31] || undefined,
      notes: row[32] || '',
      docPhotos: []
    },
    lastUpdated: Date.now(),
    updatedBy: row[35] || 'Google Sheet'
  };
}

/**
 * Fetches all village resumes from the Google Sheets workbook tab RESUME_SEMUA_JALUR.
 */
export async function fetchResumesFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  projectId?: string
): Promise<VillageResume[]> {
  try {
    const range = `'${RESUME_SHEET_TAB_NAME}'!A:ZZ`;
    const response = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      15000
    );
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    const rows: any[][] = data.values || [];
    if (rows.length <= 1) return [];

    const dataRows = rows.slice(1);
    const result: VillageResume[] = [];
    for (const r of dataRows) {
      if (!r || r.length === 0 || !r[3]) continue;
      if (projectId && r[1] && r[1] !== projectId) continue;
      result.push(sheetRowToVillageResume(r));
    }
    return result;
  } catch (err) {
    console.warn("fetchResumesFromGoogleSheet error:", err);
    return [];
  }
}

/**
 * Fetches village resumes from a publicly published Google Sheets CSV URL.
 */
export async function fetchResumesFromPublicCsv(
  publicCsvUrl: string,
  projectId: string
): Promise<VillageResume[]> {
  try {
    const csvText = await fetchPublicCsvContent(publicCsvUrl);
    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return [];

    const dataRows = parsed.slice(1);
    const result: VillageResume[] = [];
    for (const r of dataRows) {
      if (!r || r.length === 0 || !r[3]) continue;
      if (projectId && r[1] && r[1] !== projectId) continue;
      result.push(sheetRowToVillageResume(r));
    }
    return result;
  } catch (err) {
    console.warn("fetchResumesFromPublicCsv error:", err);
    return [];
  }
}

/**
 * Saves a single village resume row to the Google Sheets workbook tab RESUME_SEMUA_JALUR.
 */
export async function saveVillageResumeToSheet(
  accessToken: string,
  spreadsheetId: string,
  resume: VillageResume,
  projectName: string,
  totalBidang = 0,
  totalLuas = 0,
  progressPct = 0
): Promise<{ success: boolean; rowNumber?: number; error?: string }> {
  try {
    await ensureResumeSheetTab(accessToken, spreadsheetId);

    // Read column A to check existing rows
    const rangeA = `'${RESUME_SHEET_TAB_NAME}'!A:D`;
    const checkRes = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeA)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      15000
    );

    let targetRow = -1;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const existingRows: string[][] = checkData.values || [];
      for (let i = 1; i < existingRows.length; i++) {
        const idVal = existingRows[i]?.[0];
        const projVal = existingRows[i]?.[1];
        const desaVal = existingRows[i]?.[3];

        if (idVal === resume.id || (projVal === resume.projectId && desaVal?.trim().toUpperCase() === resume.desaName.trim().toUpperCase())) {
          targetRow = i + 1;
          break;
        }
      }
    }

    const rowData = villageResumeToSheetRow(resume, projectName, totalBidang, totalLuas, progressPct);

    if (targetRow > 1) {
      const updateRange = `'${RESUME_SHEET_TAB_NAME}'!A${targetRow}:AJ${targetRow}`;
      const putRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [rowData] })
        },
        15000
      );
      if (putRes.ok) return { success: true, rowNumber: targetRow };
    } else {
      const appendRange = `'${RESUME_SHEET_TAB_NAME}'!A1`;
      const postRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [rowData] })
        },
        15000
      );
      if (postRes.ok) return { success: true };
    }
    return { success: false, error: 'Gagal memperbarui Google Sheet' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Ensures that the SURAT_INSTANSI tab exists in the active Google Sheets workbook.
 */
export async function ensureAgencyLetterSheetTab(accessToken: string, spreadsheetId: string): Promise<boolean> {
  try {
    const metaRes = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      12000
    );
    if (!metaRes.ok) return false;
    const metaData = await metaRes.json();
    const sheets: any[] = metaData.sheets || [];
    const exists = sheets.some((s: any) => s.properties?.title === AGENCY_LETTER_SHEET_TAB_NAME);

    if (!exists) {
      const addSheetRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: AGENCY_LETTER_SHEET_TAB_NAME,
                    tabColor: { red: 0.15, green: 0.55, blue: 0.95 }
                  }
                }
              }
            ]
          })
        },
        12000
      );
      if (!addSheetRes.ok) return false;

      // Write headers
      const headers = getAgencyLetterSheetHeaders();
      await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(AGENCY_LETTER_SHEET_TAB_NAME)}'!A1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [headers]
          })
        },
        12000
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function agencyLetterToSheetRow(letter: AgencyLetter, index: number = 1): any[] {
  return [
    index,
    letter.id,
    letter.instansiName,
    letter.noSurat,
    letter.tanggalSurat || '',
    letter.perihal,
    letter.status,
    letter.catatanTindakLanjut || '',
    letter.picInstansi || '',
    letter.suratPdfUrl || '',
    (letter.docPhotos && letter.docPhotos.length > 0) ? letter.docPhotos.join(' ; ') : '',
    letter.driveFolderId ? (letter.driveFolderUrl || (letter.driveFolderId.startsWith('http') ? letter.driveFolderId : `https://drive.google.com/drive/folders/${letter.driveFolderId}`)) : (letter.driveFolderUrl || ''),
    letter.updatedBy || 'Operator',
    new Date(letter.updatedAt || Date.now()).toLocaleString('id-ID')
  ];
}

export function sheetRowToAgencyLetter(row: any[], projectId: string): AgencyLetter {
  const id = row[1] || `${projectId}_letter_${Date.now()}`;
  const instansiName = row[2] || '';
  const noSurat = row[3] || '';
  const tanggalSurat = row[4] || '';
  const perihal = row[5] || '';
  const rawStatus = (row[6] || '').trim().toUpperCase();
  const status = ['SUDAH_MASUK', 'ON_PROGRESS', 'TINDAK_LANJUT', 'SELESAI'].includes(rawStatus)
    ? rawStatus as any
    : 'SUDAH_MASUK';
  const catatanTindakLanjut = row[7] || '';
  const picInstansi = row[8] || '';
  const suratPdfUrl = row[9] || undefined;
  const rawPhotos = row[10] || '';
  const docPhotos = typeof rawPhotos === 'string' && rawPhotos.trim()
    ? rawPhotos.split(/[;\n]/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  const driveFolderUrl = row.length >= 14 ? (row[11] || undefined) : undefined;
  const updatedBy = (row.length >= 14 ? row[12] : row[11]) || 'Google Sheet';

  return {
    id,
    projectId,
    instansiName,
    noSurat,
    tanggalSurat,
    perihal,
    status,
    catatanTindakLanjut,
    picInstansi,
    suratPdfUrl,
    docPhotos,
    driveFolderUrl,
    updatedBy,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export async function fetchAgencyLettersFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  projectId: string
): Promise<AgencyLetter[]> {
  try {
    const range = `'${AGENCY_LETTER_SHEET_TAB_NAME}'!A:M`;
    const response = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      15000
    );
    if (!response.ok) {
      // Fallback: check first sheet
      const fallbackRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:M?valueRenderOption=FORMATTED_VALUE`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        15000
      );
      if (!fallbackRes.ok) return [];
      const fbData = await fallbackRes.json();
      const fbRows: any[][] = fbData.values || [];
      if (fbRows.length <= 1) return [];
      return fbRows.slice(1).filter(r => r && r[2]).map(r => sheetRowToAgencyLetter(r, projectId));
    }
    const data = await response.json();
    const rows: any[][] = data.values || [];
    if (rows.length <= 1) return [];

    return rows.slice(1).filter(r => r && r[2]).map(r => sheetRowToAgencyLetter(r, projectId));
  } catch (err) {
    console.warn("fetchAgencyLettersFromGoogleSheet error:", err);
    return [];
  }
}

export async function fetchAgencyLettersFromPublicCsv(
  publicCsvUrl: string,
  projectId: string
): Promise<AgencyLetter[]> {
  try {
    const csvText = await fetchPublicCsvContent(publicCsvUrl);
    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return [];

    const dataRows = parsed.slice(1);
    return dataRows.filter(r => r && r.length > 2 && r[2]?.trim()).map(r => sheetRowToAgencyLetter(r, projectId));
  } catch (err) {
    console.warn("fetchAgencyLettersFromPublicCsv error:", err);
    return [];
  }
}

export async function saveAgencyLetterToSheet(
  accessToken: string,
  spreadsheetId: string,
  letter: AgencyLetter
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAgencyLetterSheetTab(accessToken, spreadsheetId);

    // Read column B (ID_SURAT)
    const rangeB = `'${AGENCY_LETTER_SHEET_TAB_NAME}'!B:B`;
    const checkRes = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeB)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      12000
    );

    let targetRow = -1;
    let nextIndex = 1;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const existingRows: string[][] = checkData.values || [];
      nextIndex = Math.max(1, existingRows.length);
      for (let i = 1; i < existingRows.length; i++) {
        if (existingRows[i]?.[0] === letter.id) {
          targetRow = i + 1;
          nextIndex = i;
          break;
        }
      }
    }

    const rowData = agencyLetterToSheetRow(letter, nextIndex);

    if (targetRow > 1) {
      const updateRange = `'${AGENCY_LETTER_SHEET_TAB_NAME}'!A${targetRow}:M${targetRow}`;
      const putRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [rowData] })
        },
        15000
      );
      if (putRes.ok) return { success: true };
    } else {
      const appendRange = `'${AGENCY_LETTER_SHEET_TAB_NAME}'!A1`;
      const postRes = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [rowData] })
        },
        15000
      );
      if (postRes.ok) return { success: true };
    }
    return { success: false, error: 'Gagal memperbarui Google Sheet Surat Instansi' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// RFC-compliant CSV Parser
export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  
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
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(cell);
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (row.length > 0 || cell !== '') {
    row.push(cell);
    result.push(row);
  }
  return result;
}

// Helper to transform Google Sheets URL to direct CSV export URL
export function formatGoogleCsvUrl(url: string): string {
  if (!url) return url;
  let clean = url.trim();
  
  // Case 1: Already has /pub?output=csv or contains output=csv
  if (clean.includes('output=csv')) {
    return clean;
  }
  
  // Case 2: Google web pubhtml format
  if (clean.includes('/pubhtml')) {
    return clean.replace(/\/pubhtml.*$/, '/pub?output=csv');
  }
  
  // Case 3: Google web /pub without query
  if (clean.includes('/pub')) {
    return clean.replace(/\/pub.*$/, '/pub?output=csv');
  }
  
  // Case 4: Standard Google Sheet edit URL (convert to direct export CSV)
  const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    const sheetId = match[1];
    const gidMatch = clean.match(/gid=([0-9]+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
  }
  
  return clean;
}

// Resilient CSV fetch with timeout and multi-proxy CORS fallback
export async function fetchPublicCsvContent(url: string): Promise<string> {
  const formattedUrl = formatGoogleCsvUrl(url);
  
  // 1. Direct fetch
  try {
    const res = await fetchWithTimeout(formattedUrl, { mode: 'cors' }, 12000);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (directErr) {
    // Ignore direct fetch error
  }

  // 2. AllOrigins proxy fallback
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(formattedUrl)}`;
    const res = await fetchWithTimeout(proxyUrl, {}, 12000);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (proxyErr) {
    // Ignore proxy error
  }

  // 3. CodeTabs proxy fallback
  try {
    const proxyUrl2 = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(formattedUrl)}`;
    const res = await fetchWithTimeout(proxyUrl2, {}, 12000);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        return text;
      }
    }
  } catch (proxyErr2) {
    // Ignore proxy error 2
  }

  throw new Error("Tautan CSV publik tidak dapat diakses atau spreadsheet belum dipublikasikan ke web. Pastikan Anda telah memilih menu File ➔ Bagikan ➔ Publikasikan ke Web (format .CSV).");
}

/**
 * Sends inventory record and photos to Google Apps Script Webhook
 * matching Android ROW PLN specification (Section 4):
 * {
 *   action: "appendInventory",
 *   spreadsheetId,
 *   targetFolderId,
 *   code,
 *   idUnik,
 *   csvRow,
 *   photos: [{ tag, fileName, base64 }]
 * }
 */
export interface InventoryWebhookPayload {
  action?: string;
  spreadsheetId: string;
  targetFolderId: string;
  code: string;
  idUnik?: string;
  csvRow: string;
  photos?: Array<{
    tag: string;
    fileName: string;
    base64: string;
  }>;
}

export async function sendInventoryWebhook(
  webhookUrl: string,
  payload: InventoryWebhookPayload
): Promise<{ status: 'success' | 'error'; message: string; [key: string]: any }> {
  try {
    const finalPayload = {
      action: payload.action || 'appendInventory',
      ...payload
    };

    const response = await fetchWithTimeout(
      webhookUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // Apps Script handles text/plain with no CORS preflight blocks
        },
        body: JSON.stringify(finalPayload)
      },
      30000
    );

    if (!response.ok) {
      throw new Error(`Webhook error: HTTP ${response.status} - ${response.statusText}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { status: 'success', message: text };
    }
  } catch (err: any) {
    console.error("sendInventoryWebhook Error:", err);
    throw err;
  }
}

/**
 * Safely extracts clean Drive folder ID even if the user pastes a complete URL.
 */
export function extractDriveFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  
  // 1. Google Drive folder link: /folders/<ID>
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];

  // 2. Google Drive /d/<ID> link (file or folder)
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];

  // 3. Query param id: ?id=<ID> or &id=<ID>
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];

  // 4. Clean trailing slashes and queries if bare ID or URL path
  const clean = trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const lastSegment = clean.split('/').pop() || '';
  if (lastSegment && /^[a-zA-Z0-9_-]{15,}$/.test(lastSegment)) {
    return lastSegment;
  }

  return clean || trimmed;
}

export interface DetectedDriveGeoJSON {
  id: string;
  name: string;
  type: 'bidang' | 'jalur' | 'tower';
  data: any;
  featureCount: number;
  geometryType: string;
}

/**
 * Scans a Google Drive folder for GeoJSON files, automatically downloads them,
 * and detects their layer type ('bidang' | 'jalur' | 'tower') based on filename keywords
 * and geometric feature types.
 */
export async function fetchDriveGeoJSONFiles(
  accessToken: string,
  folderIdOrUrl: string
): Promise<DetectedDriveGeoJSON[]> {
  const folderId = extractDriveFolderId(folderIdOrUrl);
  if (!folderId) {
    throw new Error('ID atau Tautan Folder Google Drive tidak valid.');
  }

  // 1. Inspect target item metadata to check if it exists, is a folder, or a single file
  let targetMeta: any = null;
  let targetName = 'Folder Google Drive';
  let isSingleFile = false;

  try {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true`;
    const metaRes = await fetchWithTimeout(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }, 12000);

    if (metaRes.ok) {
      targetMeta = await metaRes.json();
      targetName = targetMeta?.name || 'Folder Google Drive';
      isSingleFile = targetMeta?.mimeType !== 'application/vnd.google-apps.folder';
    } else if (metaRes.status === 404) {
      throw new Error(`Folder atau file dengan ID "${folderId}" tidak ditemukan di akun Google Drive Anda. Pastikan folder tersebut ada di Google Drive Anda atau telah dibagikan.`);
    } else if (metaRes.status === 403 || metaRes.status === 401) {
      await handleResponseError(metaRes, 'Izin akses Google Drive ditolak');
    }
  } catch (metaErr: any) {
    if (metaErr?.message && metaErr.message.includes('tidak ditemukan')) {
      throw metaErr;
    }
    console.warn("Could not retrieve target metadata, falling back to direct search:", metaErr);
  }

  const candidateFiles: any[] = [];

  // If the user provided a link to a specific GeoJSON file directly
  if (isSingleFile && targetMeta) {
    candidateFiles.push(targetMeta);
    // Also search parent folder for companion GeoJSON files if available
    if (targetMeta.parents && targetMeta.parents.length > 0) {
      const parentFolderId = targetMeta.parents[0];
      try {
        const siblingQuery = `'${parentFolderId}' in parents and trashed = false`;
        const siblingUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(siblingQuery)}&fields=files(id,name,mimeType,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const sibRes = await fetchWithTimeout(siblingUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }, 12000);
        if (sibRes.ok) {
          const sibData = await sibRes.json();
          for (const s of (sibData.files || [])) {
            if (s.id !== targetMeta.id) {
              candidateFiles.push(s);
            }
          }
        }
      } catch (e) {
        console.warn("Could not query siblings:", e);
      }
    }
  } else {
    // Normal folder search
    const query = `'${folderId}' in parents and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,parents)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await fetchWithTimeout(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }, 15000);

    if (!response.ok) {
      await handleResponseError(response, `Gagal mengakses folder "${targetName}" di Google Drive`);
    }

    const data = await response.json();
    const allFiles: any[] = data.files || [];
    candidateFiles.push(...allFiles);

    // If folder contains subfolders and no direct geojson files, search immediate subfolders
    const directGeojson = allFiles.filter(f => {
      const n = (f.name || '').toLowerCase();
      return n.endsWith('.geojson') || n.endsWith('.json');
    });

    if (directGeojson.length === 0) {
      const subfolders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      for (const sf of subfolders.slice(0, 5)) {
        try {
          const subQuery = `'${sf.id}' in parents and trashed = false`;
          const subUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subQuery)}&fields=files(id,name,mimeType,size,parents)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
          const subRes = await fetchWithTimeout(subUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }, 12000);
          if (subRes.ok) {
            const subData = await subRes.json();
            if (subData.files) {
              candidateFiles.push(...subData.files);
            }
          }
        } catch (subErr) {
          console.warn(`Could not read subfolder ${sf.name}:`, subErr);
        }
      }
    }
  }

  // Filter geojson or json files
  const geojsonFiles = candidateFiles.filter(f => {
    if (f.mimeType === 'application/vnd.google-apps.folder') return false;
    const name = (f.name || '').toLowerCase();
    return (
      name.endsWith('.geojson') ||
      name.endsWith('.json') ||
      name.includes('.geojson') ||
      f.mimeType === 'application/geo+json' ||
      f.mimeType === 'application/json' ||
      (name.includes('geojson') && (f.mimeType === 'application/octet-stream' || f.mimeType === 'text/plain'))
    );
  });

  if (geojsonFiles.length === 0) {
    const nonFolderFiles = candidateFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    if (nonFolderFiles.length === 0) {
      throw new Error(
        `Folder Google Drive "${targetName}" berhasil terhubung, namun folder ini masih KOSONG (0 file di Google Drive).\n\n` +
        `Solusi:\n` +
        `1. Buka folder "${targetName}" di Google Drive Anda.\n` +
        `2. Unggah/seret 3 berkas .geojson ke dalam folder tersebut:\n` +
        `   • Bidang Tanah: KOMPENSASI_ROW_BIDANG_WARGA.geojson\n` +
        `   • Jalur ROW: KOMPENSASI_ROW_JALUR_TRANSMISI.geojson\n` +
        `   • Tapak Tower: KOMPENSASI_ROW_TITIK_TOWER.geojson\n` +
        `3. Setelah berkas selesai terunggah di Drive, klik kembali tombol "Tarik 3 GeoJSON Sekarang".`
      );
    } else {
      const sampleNames = nonFolderFiles.slice(0, 5).map(f => `"${f.name}"`).join(', ');
      throw new Error(
        `Folder Google Drive "${targetName}" berisi ${nonFolderFiles.length} berkas: [${sampleNames}], namun tidak ditemukan berkas berformat .geojson atau .json.\n\n` +
        `Solusi: Pastikan nama berkas berakhiran .geojson (misalnya: KOMPENSASI_ROW_BIDANG_WARGA.geojson).`
      );
    }
  }

  const results: DetectedDriveGeoJSON[] = [];

  for (const file of geojsonFiles) {
    try {
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
      const fileRes = await fetchWithTimeout(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }, 30000);

      if (!fileRes.ok) {
        console.warn(`Gagal mengunduh ${file.name} dari Drive`);
        continue;
      }

      const parsedData = await fileRes.json();
      if (!parsedData || (parsedData.type !== 'FeatureCollection' && !Array.isArray(parsedData.features))) {
        console.warn(`File ${file.name} bukan format GeoJSON yang valid`);
        continue;
      }

      const features: any[] = Array.isArray(parsedData.features) ? parsedData.features : [];
      
      // Determine geometry types present
      const geomTypes = new Set<string>();
      for (const feat of features.slice(0, 30)) {
        if (feat?.geometry?.type) {
          geomTypes.add(feat.geometry.type);
        }
      }
      const geomTypeStr = Array.from(geomTypes).join(', ') || 'Unknown';

      // Smart classification based on Filename Keywords + Geometry Fallback
      const lowerName = file.name.toLowerCase();
      let layerType: 'bidang' | 'jalur' | 'tower' = 'bidang';

      if (
        lowerName.includes('bidang') || 
        lowerName.includes('warga') || 
        lowerName.includes('persil') || 
        lowerName.includes('tanah') || 
        lowerName.includes('lahan') || 
        lowerName.includes('parcel') ||
        lowerName.includes('polygon')
      ) {
        layerType = 'bidang';
      } else if (
        lowerName.includes('jalur') || 
        lowerName.includes('row') || 
        lowerName.includes('koridor') || 
        lowerName.includes('corridor') || 
        lowerName.includes('span') || 
        lowerName.includes('line') || 
        lowerName.includes('kabel') ||
        lowerName.includes('polyline')
      ) {
        layerType = 'jalur';
      } else if (
        lowerName.includes('tower') || 
        lowerName.includes('tapak') || 
        lowerName.includes('tiang') || 
        lowerName.includes('titik') || 
        lowerName.includes('point')
      ) {
        layerType = 'tower';
      } else {
        // Fallback by geometry type
        if (geomTypes.has('Polygon') || geomTypes.has('MultiPolygon')) {
          layerType = 'bidang';
        } else if (geomTypes.has('LineString') || geomTypes.has('MultiLineString')) {
          layerType = 'jalur';
        } else if (geomTypes.has('Point') || geomTypes.has('MultiPoint')) {
          layerType = 'tower';
        }
      }

      results.push({
        id: file.id,
        name: file.name,
        type: layerType,
        data: parsedData,
        featureCount: features.length,
        geometryType: geomTypeStr
      });
    } catch (fileErr) {
      console.warn(`Error parsing GeoJSON file ${file.name}:`, fileErr);
    }
  }

  return results;
}


