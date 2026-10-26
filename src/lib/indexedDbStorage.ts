import type { LandRecord } from '../types';

const DB_NAME = 'project_ventura_db';
const DB_VERSION = 1;
const STORE_NAME = 'records_store';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveRecordsToIDB(projectId: string, records: LandRecord[]): Promise<boolean> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const data = {
        projectId,
        records,
        timestamp: Date.now(),
        count: records.length
      };

      const request = store.put(data);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Gagal menyimpan cache data:', err);
    return false;
  }
}

export async function getRecordsFromIDB(projectId: string): Promise<LandRecord[] | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(projectId);

      request.onsuccess = () => {
        if (request.result && Array.isArray(request.result.records)) {
          resolve(request.result.records);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('[IndexedDB] Gagal membaca cache data:', err);
    return null;
  }
}

export async function removeRecordsFromIDB(projectId: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[IndexedDB] Gagal menghapus cache data:', err);
  }
}
