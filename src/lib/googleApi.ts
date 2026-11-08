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
  // Auto-normalize if a full Google Sheets URL was accidentally passed as spreadsheetId
  if (url.includes('sheets.googleapis.com/v4/spreadsheets/http')) {
    url = url.replace(
      /sheets\.googleapis\.com\/v4\/spreadsheets\/https?:\/\/[^/]+\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9_-]+)[^/]*(?:\/[^/?#]*)?/,
      'sheets.googleapis.com/v4/spreadsheets/$1'
    );
  }
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

  const isPermissionIssue = response.status === 403 ||
    errorCode === 'PERMISSION_DENIED' ||
    detail.toLowerCase().includes('caller does not have permission') ||
    detail.toLowerCase().includes('insufficient permission');

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
  if (isPermissionIssue) {
    err.isPermissionError = true;
    err.code = 'PERMISSION_DENIED';
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

        const record = rowToRecord(row, i, headers);
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
      if (attempt < maxRetries && !err?.isAuthError && !err?.isPermissionError) {
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
    const escapedFolderName = folderName.replace(/'/g, "\\'");
    let query = `name='${escapedFolderName}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
    
    // If idUnik is provided, search by either clean folderName OR legacy idUnik prefix so existing folders are found and healed
    if (idUnik) {
      const escapedIdUnik = idUnik.replace(/'/g, "\\'");
      query = `(name='${escapedFolderName}' or name contains '${escapedIdUnik}') and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
    }
    
    const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name, description, appProperties)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      await handleResponseError(response, "Gagal mencari folder");
    }
    
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      const folderId = data.files[0].id;
      const currentName = data.files[0].name || "";
      const expectedName = folderName;
      
      // If the folder name is outdated or still has a legacy ID-..._ prefix, rename it on the fly to the clean name!
      if (currentName !== expectedName) {
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
    
    // Create the folder using the clean folderName directly (without ID prefix)
    const finalFolderName = folderName;
    const createResponse = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: finalFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: validParentId ? [validParentId] : ['root'],
        ...(idUnik ? { appProperties: { idUnik } } : {})
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
  const rawCode = String(recordOrCode || 'BIDANG_001').replace(/^ID[-_][A-Za-z0-9]+_/i, '');
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
    const strippedCode = record.CODE.replace(/^ID[-_][A-Za-z0-9]+_/i, '');
    codeBase = sanitizeTextForDrive(strippedCode);
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
  const cleanSpreadsheetId = extractDriveFolderId(spreadsheetId);
  if (
    !accessToken ||
    accessToken === 'GUEST_BYPASS' ||
    accessToken === 'IFRAME_OPERATOR_BYPASS' ||
    !cleanSpreadsheetId ||
    cleanSpreadsheetId === 'guest_bypass'
  ) {
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
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}/values/A1?valueInputOption=USER_ENTERED`,
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
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanSpreadsheetId}/values/A${firstTrailingRow}:ZZ${lastTrailingRow}:clear`,
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
  "TARGET_SPAN_AWAL",
  "ESTIMASI_BIDANG_AWAL",
  "REALISASI_BIDANG",
  "TOTAL_LUAS_M2",
  "NAMA_KADES_LURAH",
  "NAMA_CAMAT",
  "NAMA_PJT",
  "NO_SERTIFIKAT_PJT",
  "PROGRES_PERSEN",
  // 1. Pendataan Awal (Pasal 16 & Lampiran V)
  "STATUS_PENDATAAN_AWAL",
  "TGL_PENDATAAN_AWAL",
  "LINK_PDF_PENDATAAN_AWAL",
  "FOTO_DOKUMENTASI_PENDATAAN_AWAL",
  "CATATAN_PENDATAAN_AWAL",
  // 2. Sosialisasi Rencana Jalur (Pasal 17 & Lampiran VI)
  "STATUS_SOSIALISASI_DESA",
  "TGL_SOSIALISASI_DESA",
  "LINK_PDF_BA_SOSIALISASI",
  "FOTO_DOKUMENTASI_SOSIALISASI",
  "CATATAN_SOSIALISASI_DESA",
  // 3. Survei, Pemotretan Udara & Patok ROW (Pasal 18)
  "STATUS_SURVEI_PEMETAAN",
  "TGL_SURVEI_PEMETAAN",
  "LINK_PDF_PETA_UDARA",
  "FOTO_DOKUMENTASI_PATOK_ROW",
  "CATATAN_SURVEI_PEMETAAN",
  // 4. Inventarisasi, Peta Bidang & Daftar Nominatif (Pasal 19-26 & Lampiran VII-IX)
  "STATUS_INVENTARISASI_NOMINATIF",
  "TGL_INVENTARISASI_NOMINATIF",
  "LINK_PDF_PETA_DAN_NOMINATIF",
  "FOTO_DOKUMENTASI_INVENTARISASI",
  "CATATAN_INVENTARISASI_NOMINATIF",
  // 5. Pengumuman 7 Hari Kerja & BA Inventarisasi Ulang (Pasal 27-28 & Lampiran X-XII)
  "STATUS_PENGUMUMAN_7HK",
  "TGL_MULAI_PENGUMUMAN",
  "TGL_SELESAI_PENGUMUMAN",
  "JUMLAH_KEBERATAN_WARGA",
  "LINK_PDF_PENGUMUMAN_LAMP_X",
  "FOTO_DOKUMENTASI_PENGUMUMAN",
  "CATATAN_PENGUMUMAN_7HK",
  // 6. Penyusunan & Penandatanganan BAPT (Pasal 29 & Lampiran XIII)
  "STATUS_PENYUSUNAN_BAPT",
  "TGL_TTD_BAPT",
  "LINK_PDF_BAPT_LAMP_XIII",
  "FOTO_DOKUMENTASI_TTD_BAPT",
  "CATATAN_PENYUSUNAN_BAPT",
  // 7. Permohonan & Nomor Register BAPT ESDM (Pasal 30 & Lampiran XIV)
  "STATUS_REGISTRASI_BAPT_ESDM",
  "TGL_PENGAJUAN_REGISTER_BAPT",
  "NOMOR_REGISTER_BAPT_ESDM",
  "LINK_PDF_REGISTER_BAPT_LAMP_XIV",
  "CATATAN_REGISTRASI_BAPT_ESDM",
  // Link Folder Google Drive Desa & Metadata
  "LINK_FOLDER_DESA_DRIVE",
  "TERAKHIR_DIPERBARUI",
  "OPERATOR"
];

/**
 * Creates a brand new dedicated Google Spreadsheet for Project Resumes with Permen ESDM No. 13 Tahun 2025 headers
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

  // Write the headers to row 1
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
 * Maps a VillageResume object to an array of cell values for Google Sheets (55 columns Permen ESDM 13/2025).
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
    resume.targetSpan ?? '',
    resume.estimasiBidangAwal ?? '',
    totalBidang > 0 ? totalBidang : '',
    totalLuas > 0 ? totalLuas : '',
    resume.namaKades || '',
    resume.namaCamat || '',
    resume.namaPjt || '',
    resume.noSertifikatPjt || '',
    `${progressPct}%`,
    // 1. Pendataan Awal (Pasal 16 & Lampiran V)
    resume.pendataanAwal?.status || 'BELUM',
    resume.pendataanAwal?.date || '',
    resume.pendataanAwal?.pdfUrl || '',
    (resume.pendataanAwal?.docPhotos || []).join(' ; '),
    resume.pendataanAwal?.notes || '',
    // 2. Sosialisasi Rencana Jalur (Pasal 17 & Lampiran VI)
    resume.baSosialisasiAwal?.status || 'BELUM',
    resume.baSosialisasiAwal?.date || '',
    resume.baSosialisasiAwal?.pdfUrl || '',
    (resume.baSosialisasiAwal?.docPhotos || []).join(' ; '),
    resume.baSosialisasiAwal?.notes || '',
    // 3. Survei, Pemotretan Udara & Patok ROW (Pasal 18)
    resume.surveiPemetaan?.status || 'BELUM',
    resume.surveiPemetaan?.date || '',
    resume.surveiPemetaan?.pdfUrl || '',
    (resume.surveiPemetaan?.docPhotos || []).join(' ; '),
    resume.surveiPemetaan?.notes || '',
    // 4. Inventarisasi, Peta Bidang & Daftar Nominatif (Pasal 19-26 & Lampiran VII-IX)
    resume.inventarisasiNominatif?.status || 'BELUM',
    resume.inventarisasiNominatif?.date || '',
    resume.inventarisasiNominatif?.pdfUrl || '',
    (resume.inventarisasiNominatif?.docPhotos || []).join(' ; '),
    resume.inventarisasiNominatif?.notes || '',
    // 5. Pengumuman 7 Hari Kerja & BA Inventarisasi Ulang (Pasal 27-28 & Lampiran X-XII)
    resume.baPengumuman?.status || 'BELUM',
    resume.baPengumuman?.date || '',
    resume.baPengumuman?.endDate || '',
    resume.baPengumuman?.jumlahKeberatan ?? 0,
    resume.baPengumuman?.pdfUrl || '',
    (resume.baPengumuman?.docPhotos || []).join(' ; '),
    resume.baPengumuman?.notes || '',
    // 6. Penyusunan & Penandatanganan BAPT (Pasal 29 & Lampiran XIII)
    resume.lampiranBapt?.status || 'BELUM',
    resume.lampiranBapt?.date || '',
    resume.lampiranBapt?.pdfUrl || '',
    (resume.lampiranBapt?.docPhotos || []).join(' ; '),
    resume.lampiranBapt?.notes || '',
    // 7. Permohonan & Nomor Register BAPT ESDM (Pasal 30 & Lampiran XIV)
    resume.registrasiBapt?.status || 'BELUM',
    resume.registrasiBapt?.date || '',
    resume.registrasiBapt?.nomorDokumen || '',
    resume.registrasiBapt?.pdfUrl || '',
    resume.registrasiBapt?.notes || '',
    // Folder Drive Desa & Metadata
    resume.driveFolderId ? (resume.driveFolderId.startsWith('http') ? resume.driveFolderId : `https://drive.google.com/drive/folders/${resume.driveFolderId}`) : '',
    new Date(resume.lastUpdated || Date.now()).toLocaleString('id-ID'),
    resume.updatedBy || 'Operator'
  ];
}

/**
 * Maps a row from Google Sheets back into a VillageResume object.
 * Supports 55-column Permen ESDM 13/2025 format, 42-column format, and legacy 36-column format seamlessly.
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

  // Permen ESDM 13/2025 55-column format
  if (row.length >= 50) {
    return {
      id: id || `${projectId}_${desaName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
      projectId,
      desaName: desaName.toUpperCase(),
      kecamatan,
      kabupaten,
      targetSpan: row[6] ? Number(row[6]) || undefined : undefined,
      estimasiBidangAwal: row[7] ? Number(row[7]) || undefined : undefined,
      namaKades: row[10] || '',
      namaCamat: row[11] || '',
      namaPjt: row[12] || '',
      noSertifikatPjt: row[13] || '',
      driveFolderId: row[52] || undefined,
      pendataanAwal: {
        status: (row[15] as any) || 'BELUM',
        date: row[16] || '',
        pdfUrl: row[17] || undefined,
        docPhotos: parsePhotos(row[18]),
        notes: row[19] || ''
      },
      baSosialisasiAwal: {
        status: (row[20] as any) || 'BELUM',
        date: row[21] || '',
        pdfUrl: row[22] || undefined,
        docPhotos: parsePhotos(row[23]),
        notes: row[24] || ''
      },
      surveiPemetaan: {
        status: (row[25] as any) || 'BELUM',
        date: row[26] || '',
        pdfUrl: row[27] || undefined,
        docPhotos: parsePhotos(row[28]),
        notes: row[29] || ''
      },
      inventarisasiNominatif: {
        status: (row[30] as any) || 'BELUM',
        date: row[31] || '',
        pdfUrl: row[32] || undefined,
        docPhotos: parsePhotos(row[33]),
        notes: row[34] || ''
      },
      baPengumuman: {
        status: (row[35] as any) || 'BELUM',
        date: row[36] || '',
        endDate: row[37] || '',
        jumlahKeberatan: row[38] ? Number(row[38]) || 0 : 0,
        pdfUrl: row[39] || undefined,
        docPhotos: parsePhotos(row[40]),
        notes: row[41] || ''
      },
      lampiranBapt: {
        status: (row[42] as any) || 'BELUM',
        date: row[43] || '',
        pdfUrl: row[44] || undefined,
        docPhotos: parsePhotos(row[45]),
        notes: row[46] || ''
      },
      registrasiBapt: {
        status: (row[47] as any) || 'BELUM',
        date: row[48] || '',
        nomorDokumen: row[49] || '',
        pdfUrl: row[50] || undefined,
        notes: row[51] || '',
        docPhotos: []
      },
      baPenyampaianNilai: { status: 'BELUM', docPhotos: [] },
      baSerahTerimaRekening: { status: 'BELUM', docPhotos: [] },
      bushClearing: { status: 'BELUM', docPhotos: [] },
      lastUpdated: Date.now(),
      updatedBy: row[54] || 'Google Sheet'
    };
  }

  const is42Format = row.length >= 40;

  if (is42Format) {
    return {
      id: id || `${projectId}_${desaName.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_')}`,
      projectId,
      desaName: desaName.toUpperCase(),
      kecamatan,
      kabupaten,
      driveFolderId: row[39] || undefined,
      pendataanAwal: { status: 'BELUM', docPhotos: [] },
      baSosialisasiAwal: {
        status: (row[9] as any) || 'BELUM',
        date: row[10] || '',
        pdfUrl: row[11] || undefined,
        docPhotos: parsePhotos(row[12]),
        notes: row[13] || ''
      },
      surveiPemetaan: { status: 'BELUM', docPhotos: [] },
      inventarisasiNominatif: { status: 'BELUM', docPhotos: [] },
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
      registrasiBapt: { status: 'BELUM', docPhotos: [] },
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
    pendataanAwal: { status: 'BELUM', docPhotos: [] },
    baSosialisasiAwal: {
      status: (row[9] as any) || 'BELUM',
      date: row[10] || '',
      pdfUrl: row[11] || undefined,
      notes: row[12] || '',
      docPhotos: []
    },
    surveiPemetaan: { status: 'BELUM', docPhotos: [] },
    inventarisasiNominatif: { status: 'BELUM', docPhotos: [] },
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
    registrasiBapt: { status: 'BELUM', docPhotos: [] },
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
      const updateRange = `'${RESUME_SHEET_TAB_NAME}'!A${targetRow}:BC${targetRow}`;
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

export type ParcelFolderAuditStatus =
  | 'SYNCED'             // DRIVE_FOLDER_ID sudah ada, folder valid di Drive, struktur & nama sudah pas, tidak ada duplikat
  | 'NAME_MISMATCH'      // Folder ditemukan di Drive (dari ID DB atau di dalam Span), tetapi namanya belum sesuai <DESA>_<SPAN>_<NOBID>_<NAMA>
  | 'DUPLICATE_FOLDERS'  // Ditemukan >1 folder kembar untuk bidang/Desa/Span yang sama di dalam jalur -> perlu digabungkan (merge)
  | 'MISSING_DB_LINK'    // Folder sudah ada di Drive di dalam struktur Desa/Span, tetapi kolom DRIVE_FOLDER_ID di DB masih kosong
  | 'MISSING_FOLDER'     // Kolom DRIVE_FOLDER_ID kosong dan belum ada folder untuk bidang ini -> perlu dibuat dari 0 ke dalam Desa/Span
  | 'BROKEN_LINK';       // Kolom DRIVE_FOLDER_ID di DB ada isinya, tetapi tidak terbaca / terhapus di Drive (atau butuh izin akses penuh Drive)

export interface ParcelFolderAuditItem {
  record: LandRecord;
  code: string;
  desa: string;
  span: string;
  nobid: string;
  nama: string;
  expectedFolderName: string;
  currentDriveFolderId: string;
  currentDriveFolderName: string;
  duplicateFolderIds: string[];
  duplicateFolderNames: string[];
  dbFolderValue: string;
  status: ParcelFolderAuditStatus;
  reason: string;
}

/**
 * Normalizes a Desa folder name so "DESA KEBRAON", "KEBRAON", "DESA_KEBRAON" all match "KEBRAON".
 */
export function normalizeDesaFolderKey(folderOrDesaName: string): string {
  const clean = sanitizeTextForDrive(folderOrDesaName || '');
  return clean.replace(/^DESA_+/i, '').trim() || 'DESA_LAIN';
}

/**
 * Normalizes a Span folder name so "SPAN T.23 - LLG1", "T.23 - LLG1", "SPAN T23_LLG1", "T23_LLG1" all match "T23_LLG1".
 */
export function normalizeSpanFolderKey(folderOrSpanName: string): string {
  const clean = sanitizeTextForDrive(folderOrSpanName || '');
  return clean.replace(/^SPAN_+/i, '').trim() || 'SPAN_LAIN';
}

/**
 * Helper to list all non-trashed subfolders inside a specific Google Drive parent folder.
 */
async function listDriveSubfoldersInParent(
  accessToken: string,
  parentId: string
): Promise<Array<{ id: string; name: string; parents?: string[]; appProperties?: Record<string, string> }>> {
  const cleanParent = extractDriveFolderId(parentId);
  if (!cleanParent) return [];
  const allFolders: Array<{ id: string; name: string; parents?: string[]; appProperties?: Record<string, string> }> = [];
  let pageToken = '';

  do {
    const query = `'${cleanParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,parents,appProperties)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      await handleResponseError(res, 'Gagal membaca daftar subfolder di Google Drive');
    }
    const data = await res.json();
    if (Array.isArray(data.files)) {
      allFolders.push(...data.files);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allFolders;
}

/**
 * Helper to list ALL non-trashed children (both files and subfolders) inside a Drive folder.
 */
async function listAllDriveChildren(
  accessToken: string,
  parentId: string
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const cleanParent = extractDriveFolderId(parentId);
  if (!cleanParent) return [];
  const items: Array<{ id: string; name: string; mimeType: string }> = [];
  let pageToken = '';

  do {
    const query = `'${cleanParent}' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) break;
    const data = await res.json();
    if (Array.isArray(data.files)) {
      items.push(...data.files);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return items;
}

/**
 * Recursively merges all contents (files and subfolders) from `duplicateFolderId` into `primaryFolderId`,
 * and moves the emptied `duplicateFolderId` to Trash so no duplicate folders remain in Google Drive.
 */
export async function mergeDriveFoldersRecursively(
  accessToken: string,
  primaryFolderId: string,
  duplicateFolderId: string
): Promise<boolean> {
  if (!primaryFolderId || !duplicateFolderId || primaryFolderId === duplicateFolderId) return false;
  try {
    const dupChildren = await listAllDriveChildren(accessToken, duplicateFolderId);
    const primChildren = await listAllDriveChildren(accessToken, primaryFolderId);

    const primSubfolderMap = new Map<string, string>();
    for (const pc of primChildren) {
      if (pc.mimeType === 'application/vnd.google-apps.folder') {
        primSubfolderMap.set(sanitizeTextForDrive(pc.name), pc.id);
      }
    }

    for (const child of dupChildren) {
      if (child.mimeType === 'application/vnd.google-apps.folder') {
        const normKey = sanitizeTextForDrive(child.name);
        const existingTargetSubId = primSubfolderMap.get(normKey);
        if (existingTargetSubId && existingTargetSubId !== child.id) {
          // Recursively merge matching subfolders (e.g. "1. Dokumentasi...", "2. Berkas", or Span folders)
          await mergeDriveFoldersRecursively(accessToken, existingTargetSubId, child.id);
          continue;
        }
      }

      // Move file or non-colliding subfolder from duplicateFolderId into primaryFolderId
      try {
        await fetchWithTimeout(
          `https://www.googleapis.com/drive/v3/files/${child.id}?addParents=${encodeURIComponent(primaryFolderId)}&removeParents=${encodeURIComponent(duplicateFolderId)}&supportsAllDrives=true`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          },
          15000
        );
      } catch (moveErr) {
        console.warn(`Gagal memindahkan item ${child.name} saat penggabungan folder:`, moveErr);
      }
    }

    // Trash the emptied duplicate folder
    await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${duplicateFolderId}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      },
      10000
    );
    return true;
  } catch (err) {
    console.warn(`Gagal menggabungkan folder duplikat ${duplicateFolderId} ke ${primaryFolderId}:`, err);
    return false;
  }
}

/**
 * Checks if a parcel folder name in Google Drive belongs to a given record (either by exact expected name,
 * legacy ID-xxx_ prefix, or matching <DESA>_<SPAN>_<NOBID>_ prefix).
 */
function doesFolderMatchRecord(
  folder: { id: string; name: string; appProperties?: Record<string, string> },
  record: LandRecord,
  expectedFolderName: string,
  codePrefix: string,
  exactCodeOnly: string
): boolean {
  const pfNameUpper = (folder.name || '').trim().toUpperCase();
  if (pfNameUpper === expectedFolderName.toUpperCase()) return true;

  const idUnikUpper = (record.ID_UNIK || '').trim().toUpperCase();
  if (idUnikUpper && folder.appProperties?.idUnik?.toUpperCase() === idUnikUpper) return true;

  const strippedRaw = pfNameUpper.replace(/^ID[-_][A-Z0-9]+_/i, '').replace(/^R\d+_/i, '');
  const sanitizedStripped = sanitizeTextForDrive(strippedRaw);
  if (sanitizedStripped === expectedFolderName.toUpperCase()) return true;
  if (sanitizedStripped === exactCodeOnly.toUpperCase() || sanitizedStripped.startsWith(codePrefix.toUpperCase())) {
    return true;
  }
  return false;
}

/**
 * Audits all target records following the exact 4-step workflow:
 * 1. Check if DRIVE_FOLDER_ID already exists in DB -> inspect its actual Drive folder & parent Span/Desa structure.
 * 2. Compare folder name with <DESA>_<SPAN>_<NOBID>_<NAMA>.
 * 3. Detect duplicate folders with the same name/parcel in the Span/Jalur so they can be merged.
 * 4. If DRIVE_FOLDER_ID is empty, check existing Desa & Span structure to see if the folder already exists or needs creation from 0.
 */
export async function auditProjectDriveFolders(
  accessToken: string,
  uploadsFolderId: string,
  records: LandRecord[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<ParcelFolderAuditItem[]> {
  let cleanUploadsRootId = extractDriveFolderId(uploadsFolderId);

  // Maps to store discovered Desa, Span, and Parcel folders
  const desaFoldersByNormKey = new Map<string, Array<{ id: string; name: string }>>();
  const spanFoldersByDesaAndSpanKey = new Map<string, Array<{ id: string; name: string }>>();
  const parcelFoldersBySpanId = new Map<string, Array<{ id: string; name: string; appProperties?: Record<string, string> }>>();
  const directFolderMetaById = new Map<string, { id: string; name: string; parents?: string[]; trashed?: boolean }>();

  // Step A: For records that ALREADY have DRIVE_FOLDER_ID in the database, inspect their folder directly first!
  // This also discovers the true Span & Desa parent folders even if uploadsFolderId wasn't set or used custom Desa/Span names.
  const recordsWithDbId = records.filter(r => (r.DRIVE_FOLDER_ID || '').trim() !== '');
  for (let i = 0; i < recordsWithDbId.length; i++) {
    const r = recordsWithDbId[i];
    const cleanDbId = extractDriveFolderId((r.DRIVE_FOLDER_ID || '').trim());
    if (!cleanDbId || directFolderMetaById.has(cleanDbId)) continue;

    if (i % 5 === 0 || i === recordsWithDbId.length - 1) {
      onProgress?.(
        i + 1,
        records.length,
        `Memeriksa ID folder existing di Google Drive (${i + 1}/${recordsWithDbId.length})...`
      );
    }

    try {
      const checkRes = await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files/${cleanDbId}?fields=id,name,parents,trashed&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
        10000
      );
      if (checkRes.ok) {
        const meta = await checkRes.json();
        if (meta && meta.id && !meta.trashed) {
          directFolderMetaById.set(cleanDbId, meta);
          const parentSpanId = meta.parents?.[0];
          if (parentSpanId && !parcelFoldersBySpanId.has(parentSpanId)) {
            try {
              const siblings = await listDriveSubfoldersInParent(accessToken, parentSpanId);
              parcelFoldersBySpanId.set(parentSpanId, siblings);
              for (const sib of siblings) {
                if (!directFolderMetaById.has(sib.id)) {
                  directFolderMetaById.set(sib.id, { id: sib.id, name: sib.name, parents: [parentSpanId] });
                }
              }
              const desaKey = normalizeDesaFolderKey(r.DESA || 'DESA_LAIN');
              const spanKey = normalizeSpanFolderKey(r.SPAN || 'SPAN_LAIN');
              const compositeKey = `${desaKey}__${spanKey}`;
              const existingSpans = spanFoldersByDesaAndSpanKey.get(compositeKey) || [];
              if (!existingSpans.some(s => s.id === parentSpanId)) {
                existingSpans.push({ id: parentSpanId, name: `SPAN ${spanKey}` });
                spanFoldersByDesaAndSpanKey.set(compositeKey, existingSpans);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  // Step B: Scan uploadsFolderId hierarchy (Desa -> Span -> Parcel folders) using normalized Desa & Span keys
  if (cleanUploadsRootId && cleanUploadsRootId !== 'guest_bypass') {
    try {
      onProgress?.(0, records.length, 'Memindai struktur folder Desa & Span di Google Drive...');
      const desaFolders = await listDriveSubfoldersInParent(accessToken, cleanUploadsRootId);
      for (const df of desaFolders) {
        const normDesa = normalizeDesaFolderKey(df.name);
        const list = desaFoldersByNormKey.get(normDesa) || [];
        list.push({ id: df.id, name: df.name });
        desaFoldersByNormKey.set(normDesa, list);
      }

      const targetDesaKeys = Array.from(new Set(records.map(r => normalizeDesaFolderKey(r.DESA || 'DESA_LAIN'))));
      for (const desaKey of targetDesaKeys) {
        const matchingDesaFolders = desaFoldersByNormKey.get(desaKey) || [];
        for (const df of matchingDesaFolders) {
          const spanFolders = await listDriveSubfoldersInParent(accessToken, df.id);
          for (const sf of spanFolders) {
            const normSpan = normalizeSpanFolderKey(sf.name);
            const compositeKey = `${desaKey}__${normSpan}`;
            const list = spanFoldersByDesaAndSpanKey.get(compositeKey) || [];
            if (!list.some(existing => existing.id === sf.id)) {
              list.push({ id: sf.id, name: sf.name });
              spanFoldersByDesaAndSpanKey.set(compositeKey, list);
            }
          }
        }
      }

      const targetCompositeKeys = Array.from(
        new Set(
          records.map(r => `${normalizeDesaFolderKey(r.DESA || 'DESA_LAIN')}__${normalizeSpanFolderKey(r.SPAN || 'SPAN_LAIN')}`)
        )
      );

      for (const compKey of targetCompositeKeys) {
        const matchingSpanFolders = spanFoldersByDesaAndSpanKey.get(compKey) || [];
        for (const sf of matchingSpanFolders) {
          if (!parcelFoldersBySpanId.has(sf.id)) {
            const pFolders = await listDriveSubfoldersInParent(accessToken, sf.id);
            parcelFoldersBySpanId.set(sf.id, pFolders);
            for (const pf of pFolders) {
              if (!directFolderMetaById.has(pf.id)) {
                directFolderMetaById.set(pf.id, { id: pf.id, name: pf.name, parents: [sf.id] });
              }
            }
          }
        }
      }
    } catch (scanErr) {
      console.warn('Peringatan saat memindai root folder proyek:', scanErr);
    }
  }

  // Step C: Evaluate each record according to the 4-stage workflow
  const auditResults: ParcelFolderAuditItem[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const expectedFolderName = buildSanitizedParcelFolderName(r);
    const cleanDesa = normalizeDesaFolderKey(r.DESA || 'DESA_LAIN');
    const cleanSpan = normalizeSpanFolderKey(r.SPAN || 'SPAN_LAIN');
    const cleanNobid = sanitizeTextForDrive(r.NOBID || '001');
    const codePrefix = `${cleanDesa}_${cleanSpan}_${cleanNobid}_`;
    const exactCodeOnly = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
    const compKey = `${cleanDesa}__${cleanSpan}`;

    const rawDbVal = (r.DRIVE_FOLDER_ID || '').trim();
    const cleanDbFolderId = rawDbVal ? extractDriveFolderId(rawDbVal) : '';

    // Gather all candidate parcel folders in all Span folders for this Desa+Span
    const candidateSpanFolders = spanFoldersByDesaAndSpanKey.get(compKey) || [];
    const allSpanParcelFolders: Array<{ id: string; name: string; appProperties?: Record<string, string> }> = [];
    const seenFolderIds = new Set<string>();

    for (const sf of candidateSpanFolders) {
      const pList = parcelFoldersBySpanId.get(sf.id) || [];
      for (const pf of pList) {
        if (!seenFolderIds.has(pf.id)) {
          seenFolderIds.add(pf.id);
          allSpanParcelFolders.push(pf);
        }
      }
    }

    // Find all folders in the Span that match this parcel (to detect duplicates!)
    const matchingFoldersInSpan = allSpanParcelFolders.filter(pf =>
      doesFolderMatchRecord(pf, r, expectedFolderName, codePrefix, exactCodeOnly)
    );

    let primaryFolder: { id: string; name: string } | null = null;
    let duplicateFolders: Array<{ id: string; name: string }> = [];
    let dbIdBroken = false;

    if (cleanDbFolderId) {
      const directMeta = directFolderMetaById.get(cleanDbFolderId);
      if (directMeta && !directMeta.trashed) {
        primaryFolder = { id: directMeta.id, name: directMeta.name };
        duplicateFolders = matchingFoldersInSpan.filter(mf => mf.id !== primaryFolder!.id);
      } else if (matchingFoldersInSpan.length > 0) {
        // DB ID was old/moved, but we found the parcel's folder inside the Span!
        primaryFolder = matchingFoldersInSpan[0];
        duplicateFolders = matchingFoldersInSpan.slice(1);
      } else {
        dbIdBroken = true;
      }
    } else if (matchingFoldersInSpan.length > 0) {
      // No DB ID yet, but folder(s) already exist in the Span!
      const exactMatch = matchingFoldersInSpan.find(mf => mf.name.trim() === expectedFolderName);
      primaryFolder = exactMatch || matchingFoldersInSpan[0];
      duplicateFolders = matchingFoldersInSpan.filter(mf => mf.id !== primaryFolder!.id);
    }

    const dupIds = duplicateFolders.map(d => d.id);
    const dupNames = duplicateFolders.map(d => d.name);

    if (primaryFolder) {
      const isNameExact = primaryFolder.name.trim() === expectedFolderName;
      const isDbIdSynced = cleanDbFolderId === primaryFolder.id;

      if (dupIds.length > 0) {
        auditResults.push({
          record: r,
          code: r.CODE || exactCodeOnly,
          desa: r.DESA || '-',
          span: r.SPAN || '-',
          nobid: r.NOBID || '-',
          nama: r.NAMA || '-',
          expectedFolderName,
          currentDriveFolderId: primaryFolder.id,
          currentDriveFolderName: primaryFolder.name,
          duplicateFolderIds: dupIds,
          duplicateFolderNames: dupNames,
          dbFolderValue: rawDbVal,
          status: 'DUPLICATE_FOLDERS',
          reason: `Ditemukan ${dupIds.length + 1} folder kembar di jalur ini (${[primaryFolder.name, ...dupNames].join(', ')}). Akan digabungkan menjadi 1 folder "${expectedFolderName}".`
        });
      } else if (!isNameExact) {
        auditResults.push({
          record: r,
          code: r.CODE || exactCodeOnly,
          desa: r.DESA || '-',
          span: r.SPAN || '-',
          nobid: r.NOBID || '-',
          nama: r.NAMA || '-',
          expectedFolderName,
          currentDriveFolderId: primaryFolder.id,
          currentDriveFolderName: primaryFolder.name,
          duplicateFolderIds: [],
          duplicateFolderNames: [],
          dbFolderValue: rawDbVal,
          status: 'NAME_MISMATCH',
          reason: `Nama folder di Drive ("${primaryFolder.name}") berbeda dengan data database ("${expectedFolderName}").`
        });
      } else if (!isDbIdSynced) {
        auditResults.push({
          record: r,
          code: r.CODE || exactCodeOnly,
          desa: r.DESA || '-',
          span: r.SPAN || '-',
          nobid: r.NOBID || '-',
          nama: r.NAMA || '-',
          expectedFolderName,
          currentDriveFolderId: primaryFolder.id,
          currentDriveFolderName: primaryFolder.name,
          duplicateFolderIds: [],
          duplicateFolderNames: [],
          dbFolderValue: rawDbVal,
          status: 'MISSING_DB_LINK',
          reason: 'Folder sudah ada di struktur Desa & Span Google Drive, tinggal menautkan ID/Link ke database.'
        });
      } else {
        auditResults.push({
          record: r,
          code: r.CODE || exactCodeOnly,
          desa: r.DESA || '-',
          span: r.SPAN || '-',
          nobid: r.NOBID || '-',
          nama: r.NAMA || '-',
          expectedFolderName,
          currentDriveFolderId: primaryFolder.id,
          currentDriveFolderName: primaryFolder.name,
          duplicateFolderIds: [],
          duplicateFolderNames: [],
          dbFolderValue: rawDbVal,
          status: 'SYNCED',
          reason: 'ID Folder di database, struktur folder, dan nama <DESA>_<SPAN>_<NOBID>_<NAMA> sudah 100% sesuai.'
        });
      }
    } else if (dbIdBroken) {
      auditResults.push({
        record: r,
        code: r.CODE || exactCodeOnly,
        desa: r.DESA || '-',
        span: r.SPAN || '-',
        nobid: r.NOBID || '-',
        nama: r.NAMA || '-',
        expectedFolderName,
        currentDriveFolderId: cleanDbFolderId,
        currentDriveFolderName: `ID: ${cleanDbFolderId.slice(0, 12)}... (Tidak Terbaca / Terhapus)`,
        duplicateFolderIds: [],
        duplicateFolderNames: [],
        dbFolderValue: rawDbVal,
        status: 'BROKEN_LINK',
        reason: 'ID Folder ada di database, tetapi belum terbaca (klik "Perbarui Izin Akses Penuh Drive" jika folder dibuat dari luar web app, atau proses untuk buat/gabung ke Desa & Span).'
      });
    } else {
      auditResults.push({
        record: r,
        code: r.CODE || exactCodeOnly,
        desa: r.DESA || '-',
        span: r.SPAN || '-',
        nobid: r.NOBID || '-',
        nama: r.NAMA || '-',
        expectedFolderName,
        currentDriveFolderId: '',
        currentDriveFolderName: '(Belum Ada ID Folder)',
        duplicateFolderIds: [],
        duplicateFolderNames: [],
        dbFolderValue: '',
        status: 'MISSING_FOLDER',
        reason: 'Belum ada ID Folder di database. Akan dicek struktur Desa & Span yang sudah ada lalu dibuatkan/digabungkan otomatis.'
      });
    }
  }

  return auditResults;
}

/**
 * Ensures the Desa and Span folder hierarchy exists under `uploadsRootId`,
 * automatically merging any duplicate Desa or Span folders with the same normalized name!
 */
export async function consolidateAndResolveDesaSpanHierarchy(
  accessToken: string,
  uploadsRootId: string,
  desaRaw: string,
  spanRaw: string,
  knownSpanFolderId?: string
): Promise<{
  desaFolderId: string;
  spanFolderId: string;
  mergedDesaFolders: number;
  mergedSpanFolders: number;
}> {
  const cleanDesaKey = normalizeDesaFolderKey(desaRaw || 'DESA_LAIN');
  const cleanSpanKey = normalizeSpanFolderKey(spanRaw || 'SPAN_LAIN');
  const targetDesaFolderName = `DESA ${cleanDesaKey}`;
  const targetSpanFolderName = `SPAN ${cleanSpanKey}`;

  let mergedDesaFolders = 0;
  let mergedSpanFolders = 0;

  // If we already know the exact Span folder ID from an existing record in the same Desa+Span and uploadsRootId is missing
  const cleanRoot = extractDriveFolderId(uploadsRootId);
  if (!cleanRoot || cleanRoot === 'guest_bypass') {
    if (knownSpanFolderId) {
      return {
        desaFolderId: '',
        spanFolderId: knownSpanFolderId,
        mergedDesaFolders: 0,
        mergedSpanFolders: 0
      };
    }
    throw new Error('ID Folder Utama Berkas Proyek (uploadsFolderId) belum diatur di Manajemen Proyek.');
  }

  // 1. Check all existing Desa folders in cleanRoot and merge duplicates for cleanDesaKey
  const allDesaFolders = await listDriveSubfoldersInParent(accessToken, cleanRoot);
  const matchingDesas = allDesaFolders.filter(df => normalizeDesaFolderKey(df.name) === cleanDesaKey);

  let desaFolderId = '';
  if (matchingDesas.length === 0) {
    desaFolderId = await findOrCreateFolder(accessToken, targetDesaFolderName, cleanRoot);
  } else {
    // Pick the one already named "DESA <DESA>" if present, else first
    const primaryDesa = matchingDesas.find(d => d.name.trim().toUpperCase() === targetDesaFolderName) || matchingDesas[0];
    desaFolderId = primaryDesa.id;
    if (primaryDesa.name.trim() !== targetDesaFolderName) {
      await renameFolderInDrive(accessToken, desaFolderId, targetDesaFolderName);
    }
    // Merge any duplicate Desa folders into primaryDesa
    for (const dupDesa of matchingDesas) {
      if (dupDesa.id !== desaFolderId) {
        const merged = await mergeDriveFoldersRecursively(accessToken, desaFolderId, dupDesa.id);
        if (merged) mergedDesaFolders++;
      }
    }
  }

  // 2. Check all existing Span folders inside desaFolderId and merge duplicates for cleanSpanKey
  const allSpanFolders = await listDriveSubfoldersInParent(accessToken, desaFolderId);
  const matchingSpans = allSpanFolders.filter(sf => normalizeSpanFolderKey(sf.name) === cleanSpanKey);

  let spanFolderId = '';
  if (matchingSpans.length === 0) {
    spanFolderId = await findOrCreateFolder(accessToken, targetSpanFolderName, desaFolderId);
  } else {
    const primarySpan = matchingSpans.find(s => s.name.trim().toUpperCase() === targetSpanFolderName) || matchingSpans[0];
    spanFolderId = primarySpan.id;
    if (primarySpan.name.trim() !== targetSpanFolderName) {
      await renameFolderInDrive(accessToken, spanFolderId, targetSpanFolderName);
    }
    // Merge any duplicate Span folders into primarySpan
    for (const dupSpan of matchingSpans) {
      if (dupSpan.id !== spanFolderId) {
        const merged = await mergeDriveFoldersRecursively(accessToken, spanFolderId, dupSpan.id);
        if (merged) mergedSpanFolders++;
      }
    }
  }

  return {
    desaFolderId,
    spanFolderId,
    mergedDesaFolders,
    mergedSpanFolders
  };
}

/**
 * Executes the complete 4-stage unified workflow on the selected (checked) records:
 * 1. Check if DB already has DRIVE_FOLDER_ID -> verify folder structure & compare name against <DESA>_<SPAN>_<NOBID>_<NAMA>.
 * 2. If name differs, rename it automatically.
 * 3. If duplicate folders exist in the same Desa/Span/Parcel, merge their contents into 1 folder and trash the empty duplicate.
 * 4. If DB does NOT have DRIVE_FOLDER_ID, check existing Desa & Span structure (join/merge if already existing), then create from 0 if needed and save ID/Link to DB.
 */
export async function executeUnifiedDriveFolderWorkflow(
  accessToken: string,
  uploadsFolderId: string,
  allRecords: LandRecord[],
  selectedCodes: Set<string>,
  options?: {
    createSubfolders?: boolean;
    linkFormat?: 'URL' | 'ID';
    auditCache?: ParcelFolderAuditItem[] | null;
    onProgress?: (current: number, total: number, message: string) => void;
  }
): Promise<{
  updatedRecords: LandRecord[];
  renamedCount: number;
  mergedFolderCount: number;
  createdFromZeroCount: number;
  linkedExistingCount: number;
  verifiedSyncedCount: number;
  failedCount: number;
}> {
  const createSubfolders = options?.createSubfolders ?? true;
  const linkFormat = options?.linkFormat ?? 'ID';
  const cleanUploadsRootId = extractDriveFolderId(uploadsFolderId);

  const updatedRecords = [...allRecords];
  const targetIndices: number[] = [];

  updatedRecords.forEach((r, idx) => {
    const codeKey = r.CODE || `${normalizeDesaFolderKey(r.DESA)}_${normalizeSpanFolderKey(r.SPAN)}_${sanitizeTextForDrive(r.NOBID)}`;
    if (selectedCodes.has(codeKey) || selectedCodes.has(r.ID_UNIK)) {
      targetIndices.push(idx);
    }
  });

  let renamedCount = 0;
  let mergedFolderCount = 0;
  let createdFromZeroCount = 0;
  let linkedExistingCount = 0;
  let verifiedSyncedCount = 0;
  let failedCount = 0;

  // Cache consolidated Desa+Span folder IDs so each Desa+Span is consolidated once per batch
  const resolvedSpanCache = new Map<string, string>();

  // Also discover any known parent Span folder IDs from auditCache or records with existing DRIVE_FOLDER_ID
  const auditByCode = new Map<string, ParcelFolderAuditItem>();
  if (options?.auditCache) {
    for (const item of options.auditCache) {
      auditByCode.set(item.code, item);
      if (item.record.CODE) auditByCode.set(item.record.CODE, item);
    }
  }

  for (let step = 0; step < targetIndices.length; step++) {
    const recIdx = targetIndices[step];
    const r = updatedRecords[recIdx];
    const expectedFolderName = buildSanitizedParcelFolderName(r);
    const cleanDesa = normalizeDesaFolderKey(r.DESA || 'DESA_LAIN');
    const cleanSpan = normalizeSpanFolderKey(r.SPAN || 'SPAN_LAIN');
    const cleanNobid = sanitizeTextForDrive(r.NOBID || '001');
    const codePrefix = `${cleanDesa}_${cleanSpan}_${cleanNobid}_`;
    const exactCodeOnly = `${cleanDesa}_${cleanSpan}_${cleanNobid}`;
    const compKey = `${cleanDesa}__${cleanSpan}`;

    options?.onProgress?.(
      step + 1,
      targetIndices.length,
      `Memproses (${step + 1}/${targetIndices.length}): ${expectedFolderName}...`
    );

    try {
      const rawDbVal = (r.DRIVE_FOLDER_ID || '').trim();
      const cleanDbId = rawDbVal ? extractDriveFolderId(rawDbVal) : '';

      // 1. First, if the record ALREADY has a DRIVE_FOLDER_ID in the database, check it directly in Google Drive!
      let existingDirectMeta: { id: string; name: string; parents?: string[]; trashed?: boolean } | null = null;
      if (cleanDbId) {
        try {
          const checkRes = await fetchWithTimeout(
            `https://www.googleapis.com/drive/v3/files/${cleanDbId}?fields=id,name,parents,trashed&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
            10000
          );
          if (checkRes.ok) {
            const meta = await checkRes.json();
            if (meta && meta.id && !meta.trashed) {
              existingDirectMeta = meta;
            }
          }
        } catch {}
      }

      // 2. Resolve & Consolidate Desa -> Span structure (merging any duplicate Desa/Span folders if uploadsRootId is available)
      let spanFolderId = resolvedSpanCache.get(compKey) || '';
      if (!spanFolderId) {
        const knownParentSpanId = existingDirectMeta?.parents?.[0];
        if (cleanUploadsRootId && cleanUploadsRootId !== 'guest_bypass') {
          const hierarchy = await consolidateAndResolveDesaSpanHierarchy(
            accessToken,
            cleanUploadsRootId,
            r.DESA,
            r.SPAN,
            knownParentSpanId
          );
          spanFolderId = hierarchy.spanFolderId;
          mergedFolderCount += hierarchy.mergedDesaFolders + hierarchy.mergedSpanFolders;
          resolvedSpanCache.set(compKey, spanFolderId);
        } else if (knownParentSpanId) {
          spanFolderId = knownParentSpanId;
          resolvedSpanCache.set(compKey, spanFolderId);
        }
      }

      // 3. List all parcel folders inside spanFolderId to check for existing or duplicate parcel folders
      const spanParcelFolders = spanFolderId
        ? await listDriveSubfoldersInParent(accessToken, spanFolderId)
        : [];

      const matchingInSpan = spanParcelFolders.filter(pf =>
        doesFolderMatchRecord(pf, r, expectedFolderName, codePrefix, exactCodeOnly)
      );

      // CASE A: Database ALREADY has a valid DRIVE_FOLDER_ID (existingDirectMeta != null)
      if (existingDirectMeta) {
        const primaryId = existingDirectMeta.id;
        let currentName = existingDirectMeta.name || '';

        // If the folder is not inside our consolidated spanFolderId yet, move it into spanFolderId
        if (spanFolderId && existingDirectMeta.parents && !existingDirectMeta.parents.includes(spanFolderId)) {
          try {
            const oldParent = existingDirectMeta.parents[0];
            await fetchWithTimeout(
              `https://www.googleapis.com/drive/v3/files/${primaryId}?addParents=${encodeURIComponent(spanFolderId)}&removeParents=${encodeURIComponent(oldParent)}&supportsAllDrives=true`,
              {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({})
              },
              12000
            );
          } catch {}
        }

        // Merge any duplicate parcel folders found in the Span into primaryId
        const duplicates = matchingInSpan.filter(mf => mf.id !== primaryId);
        for (const dup of duplicates) {
          const merged = await mergeDriveFoldersRecursively(accessToken, primaryId, dup.id);
          if (merged) mergedFolderCount++;
        }

        // Compare folder name with <DESA>_<SPAN>_<NOBID>_<NAMA> and rename if different
        if (currentName.trim() !== expectedFolderName) {
          const ok = await renameFolderInDrive(accessToken, primaryId, expectedFolderName);
          if (ok) renamedCount++;
        } else if (duplicates.length === 0) {
          verifiedSyncedCount++;
        }

        // Ensure 4 standard subfolders exist inside primaryId
        if (createSubfolders) {
          for (const subCat of PARCEL_SUBFOLDERS) {
            await findOrCreateFolder(accessToken, subCat, primaryId);
          }
        }

        const finalDbVal =
          rawDbVal ||
          (linkFormat === 'URL' ? `https://drive.google.com/drive/folders/${primaryId}` : primaryId);

        updatedRecords[recIdx] = {
          ...r,
          DRIVE_FOLDER_ID: finalDbVal,
          _lastModified: Date.now()
        };
        continue;
      }

      // CASE B: Database does NOT have a valid DRIVE_FOLDER_ID (or old ID was broken),
      // BUT matching folder(s) ALREADY exist inside the Desa -> Span structure!
      if (matchingInSpan.length > 0) {
        const exactMatch = matchingInSpan.find(mf => mf.name.trim() === expectedFolderName);
        const primaryFolder = exactMatch || matchingInSpan[0];
        const primaryId = primaryFolder.id;

        // Merge any duplicates in the Span into primaryId
        const duplicates = matchingInSpan.filter(mf => mf.id !== primaryId);
        for (const dup of duplicates) {
          const merged = await mergeDriveFoldersRecursively(accessToken, primaryId, dup.id);
          if (merged) mergedFolderCount++;
        }

        // Rename if name does not match expected <DESA>_<SPAN>_<NOBID>_<NAMA>
        if (primaryFolder.name.trim() !== expectedFolderName) {
          const ok = await renameFolderInDrive(accessToken, primaryId, expectedFolderName);
          if (ok) renamedCount++;
        }

        // Ensure 4 standard subfolders exist inside primaryId
        if (createSubfolders) {
          for (const subCat of PARCEL_SUBFOLDERS) {
            await findOrCreateFolder(accessToken, subCat, primaryId);
          }
        }

        const finalDbVal =
          linkFormat === 'URL' ? `https://drive.google.com/drive/folders/${primaryId}` : primaryId;

        updatedRecords[recIdx] = {
          ...r,
          DRIVE_FOLDER_ID: finalDbVal,
          _lastModified: Date.now()
        };
        linkedExistingCount++;
        continue;
      }

      // CASE C: Workflow Terakhir — No folder exists yet -> Create from 0 inside the consolidated Desa -> Span structure!
      if (!spanFolderId) {
        throw new Error('Folder Span tidak dapat ditemukan atau dibuat. Pastikan ID Folder Utama Berkas Proyek sudah diisi.');
      }

      const newParcelFolderId = await findOrCreateFolder(accessToken, expectedFolderName, spanFolderId, r.ID_UNIK);
      if (createSubfolders) {
        for (const subCat of PARCEL_SUBFOLDERS) {
          await findOrCreateFolder(accessToken, subCat, newParcelFolderId);
        }
      }

      const finalDbVal =
        linkFormat === 'URL' ? `https://drive.google.com/drive/folders/${newParcelFolderId}` : newParcelFolderId;

      updatedRecords[recIdx] = {
        ...r,
        DRIVE_FOLDER_ID: finalDbVal,
        _lastModified: Date.now()
      };
      createdFromZeroCount++;
    } catch (err) {
      console.error(`Gagal memproses workflow folder untuk ${expectedFolderName}:`, err);
      failedCount++;
    }
  }

  return {
    updatedRecords,
    renamedCount,
    mergedFolderCount,
    createdFromZeroCount,
    linkedExistingCount,
    verifiedSyncedCount,
    failedCount
  };
}

/**
 * Legacy wrapper for batch provisioning missing folders
 */
export async function batchProvisionMissingParcelFolders(
  accessToken: string,
  uploadsFolderId: string,
  allRecords: LandRecord[],
  options?: {
    targetSubsetCodes?: Set<string>;
    createSubfolders?: boolean;
    linkFormat?: 'URL' | 'ID';
    onlyEmptyDb?: boolean;
    onProgress?: (current: number, total: number, message: string) => void;
  }
): Promise<{
  updatedRecords: LandRecord[];
  createdCount: number;
  SkippedExistingCount: number;
  failedCount: number;
}> {
  const onlyEmptyDb = options?.onlyEmptyDb ?? true;
  const selectedCodes = new Set<string>();
  let skippedExistingCount = 0;

  allRecords.forEach(r => {
    if (options?.targetSubsetCodes && !options.targetSubsetCodes.has(r.CODE)) return;
    if (onlyEmptyDb && (r.DRIVE_FOLDER_ID || '').trim() !== '') {
      skippedExistingCount++;
      return;
    }
    selectedCodes.add(r.CODE || r.ID_UNIK);
  });

  const res = await executeUnifiedDriveFolderWorkflow(accessToken, uploadsFolderId, allRecords, selectedCodes, {
    createSubfolders: options?.createSubfolders,
    linkFormat: options?.linkFormat,
    onProgress: options?.onProgress
  });

  return {
    updatedRecords: res.updatedRecords,
    createdCount: res.createdFromZeroCount + res.linkedExistingCount,
    SkippedExistingCount: skippedExistingCount,
    failedCount: res.failedCount
  };
}

/**
 * Legacy wrapper for batch syncing mismatched folders
 */
export async function batchSyncMismatchedParcelFolders(
  accessToken: string,
  uploadsFolderId: string,
  allRecords: LandRecord[],
  itemsToFix: ParcelFolderAuditItem[],
  options?: {
    linkFormat?: 'URL' | 'ID';
    createSubfoldersForBroken?: boolean;
    onProgress?: (current: number, total: number, message: string) => void;
  }
): Promise<{
  updatedRecords: LandRecord[];
  renamedCount: number;
  linkedCount: number;
  recreatedCount: number;
  failedCount: number;
}> {
  const selectedCodes = new Set<string>(itemsToFix.map(i => i.record.CODE || i.code));
  const res = await executeUnifiedDriveFolderWorkflow(accessToken, uploadsFolderId, allRecords, selectedCodes, {
    createSubfolders: options?.createSubfoldersForBroken,
    linkFormat: options?.linkFormat,
    auditCache: itemsToFix,
    onProgress: options?.onProgress
  });

  return {
    updatedRecords: res.updatedRecords,
    renamedCount: res.renamedCount + res.mergedFolderCount,
    linkedCount: res.linkedExistingCount,
    recreatedCount: res.createdFromZeroCount,
    failedCount: res.failedCount
  };
}




