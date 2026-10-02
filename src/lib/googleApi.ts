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
                  sheetId: 0,
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
  "STATUS_PENDAHULUAN",
  "TGL_PENDAHULUAN",
  "LINK_DRIVE_PENDAHULUAN",
  "CATATAN_PENDAHULUAN",
  "STATUS_PENGUMUMAN_INV",
  "TGL_PENGUMUMAN_INV",
  "LINK_DRIVE_PENGUMUMAN_INV",
  "CATATAN_PENGUMUMAN_INV",
  "STATUS_BAPT_REGISTER",
  "TGL_BAPT_REGISTER",
  "LINK_DRIVE_BAPT_REGISTER",
  "CATATAN_BAPT_REGISTER",
  "STATUS_PENYAMPAIAN_NILAI",
  "TGL_PENYAMPAIAN_NILAI",
  "LINK_DRIVE_PENYAMPAIAN_NILAI",
  "CATATAN_PENYAMPAIAN_NILAI",
  "STATUS_PEMBAYARAN_KOMP",
  "TGL_PEMBAYARAN_KOMP",
  "LINK_DRIVE_PEMBAYARAN_KOMP",
  "CATATAN_PEMBAYARAN_KOMP",
  "STATUS_BUSH_CLEARING",
  "TGL_BUSH_CLEARING",
  "LINK_DRIVE_BUSH_CLEARING",
  "CATATAN_BUSH_CLEARING",
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
    resume.baSosialisasiAwal?.status || 'BELUM',
    resume.baSosialisasiAwal?.date || '',
    resume.baSosialisasiAwal?.pdfUrl || '',
    resume.baSosialisasiAwal?.notes || '',
    resume.baPengumuman?.status || 'BELUM',
    resume.baPengumuman?.date || '',
    resume.baPengumuman?.pdfUrl || '',
    resume.baPengumuman?.notes || '',
    resume.lampiranBapt?.status || 'BELUM',
    resume.lampiranBapt?.date || '',
    resume.lampiranBapt?.pdfUrl || '',
    resume.lampiranBapt?.notes || '',
    resume.baPenyampaianNilai?.status || 'BELUM',
    resume.baPenyampaianNilai?.date || '',
    resume.baPenyampaianNilai?.pdfUrl || '',
    resume.baPenyampaianNilai?.notes || '',
    resume.baSerahTerimaRekening?.status || 'BELUM',
    resume.baSerahTerimaRekening?.date || '',
    resume.baSerahTerimaRekening?.pdfUrl || '',
    resume.baSerahTerimaRekening?.notes || '',
    resume.bushClearing?.status || 'BELUM',
    resume.bushClearing?.date || '',
    resume.bushClearing?.pdfUrl || (resume.bushClearing?.docPhotos?.[0] || ''),
    resume.bushClearing?.notes || '',
    resume.driveFolderId ? `https://drive.google.com/drive/folders/${resume.driveFolderId}` : '',
    new Date(resume.lastUpdated || Date.now()).toLocaleString('id-ID'),
    resume.updatedBy || 'Operator'
  ];
}

/**
 * Maps a row from Google Sheets back into a VillageResume object.
 */
export function sheetRowToVillageResume(row: any[]): VillageResume {
  const id = row[0] || '';
  const projectId = row[1] || 'proj-1';
  const desaName = row[3] || '';
  const kecamatan = row[4] || '';
  const kabupaten = row[5] || '';

  return {
    id: id || `${projectId}_${desaName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
    projectId,
    desaName: desaName.toUpperCase(),
    kecamatan,
    kabupaten,
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
    ? rawPhotos.split(';').map((s: string) => s.trim()).filter(Boolean)
    : [];
  const updatedBy = row[11] || 'Google Sheet';

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

