import { type LandRecord, type DataIntegrityLog, getSheetHeaders, recordToRow, rowToRecord } from '../types';

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
  existingRecords: LandRecord[]
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

    // 2. Ensure Idempotency Key (ID_UNIK) is deterministically set
    if (!record.ID_UNIK || record.ID_UNIK.trim() === '') {
      const codeIdentifier = (record.CODE || 'REC').replace(/[\s-]/g, '_');
      record.ID_UNIK = `ID-${codeIdentifier}`;
    }

    // 3. Check locally known records first for rapid matching
    let targetRowIndex: number | undefined = record.rowNumber;
    
    if (!targetRowIndex || !isEdit) {
      const match = existingRecords.find(r => 
        (record.ID_UNIK && r.ID_UNIK && r.ID_UNIK === record.ID_UNIK) ||
        (record.CODE && r.CODE && r.CODE.toUpperCase() === record.CODE.toUpperCase()) ||
        (record.DESA && record.SPAN && record.NOBID && 
         r.DESA?.toUpperCase() === record.DESA.toUpperCase() && 
         r.SPAN?.toUpperCase() === record.SPAN.toUpperCase() && 
         r.NOBID?.toUpperCase() === record.NOBID.toUpperCase())
      );
      
      if (match && match.rowNumber) {
        targetRowIndex = match.rowNumber;
      }
    }

    // 4. Live Idempotency Verification directly in Google Sheets Database
    // Query columns A (CODE) and IO (ID_UNIK) before executing an append
    if (!targetRowIndex) {
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

          // Row 0 is the header (Row 1 in spreadsheet) -> check data rows starting at index 1
          for (let r = 1; r < maxRows; r++) {
            const sheetRow = r + 1; // 1-based spreadsheet row index
            const currentCode = (codeRows[r]?.[0] || '').trim().toUpperCase();
            const currentIdUnik = (idUnikRows[r]?.[0] || '').trim();

            if (
              (record.ID_UNIK && currentIdUnik && currentIdUnik === record.ID_UNIK) ||
              (record.CODE && currentCode && currentCode === record.CODE.trim().toUpperCase())
            ) {
              targetRowIndex = sheetRow;
              console.log(`[Idempotency Key] Ditemukan record existing pada baris ${sheetRow} dengan ID_UNIK: ${record.ID_UNIK}. Mengalihkan append ke overwrite update.`);
              break;
            }
          }
        }
      } catch (lookupErr) {
        console.warn("[Idempotency Key] Pengecekan database langsung dilewati, menggunakan fallback state:", lookupErr);
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
 * Uploads a binary file to a specific Drive folder, with metadata and custom name.
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File,
  docType: string, // KTP, KK, ALAS_HAK, PERALIHAN_HAK
  recordCode: string,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  try {
    // Generate custom file name
    const ext = file.name.split('.').pop() || 'pdf';
    const cleanCode = recordCode.replace(/[\/\\?%*:|"<>\s]/g, '-');
    const customFileName = `${docType}_${cleanCode}.${ext}`;
    
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
      // If upload failed (e.g. 404 Folder not found), retry uploading without parent folder!
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
