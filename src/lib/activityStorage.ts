import { collection, addDoc, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { type ActivityLog, type DataIntegrityLog } from '../types';

const LOCAL_STORAGE_ACTIVITY_KEY = 'project_ventura_activity_logs';
const LOCAL_STORAGE_INTEGRITY_KEY = 'project_ventura_integrity_logs';

/**
 * Get all cached activity logs from localStorage
 */
export function getLocalActivityLogs(): ActivityLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Gagal membaca log aktivitas dari localStorage:', e);
    return [];
  }
}

/**
 * Save an activity log both locally (instant & offline safe) and to Firestore
 */
export async function saveActivityLog(log: Omit<ActivityLog, 'id'>): Promise<ActivityLog> {
  const newLog: ActivityLog = {
    ...log,
    id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
  };

  // 1. Immediately store to localStorage
  try {
    const existing = getLocalActivityLogs();
    // Keep last 300 logs in local storage
    const updated = [newLog, ...existing.filter(item => item.id !== newLog.id)].slice(0, 300);
    localStorage.setItem(LOCAL_STORAGE_ACTIVITY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Gagal menyimpan log ke localStorage:', e);
  }

  // 2. Asynchronously save to Firestore collection 'activity_logs'
  try {
    const docRef = await addDoc(collection(db, 'activity_logs'), {
      projectId: newLog.projectId,
      projectName: newLog.projectName,
      timestamp: newLog.timestamp,
      userEmail: newLog.userEmail,
      operatorName: newLog.operatorName || 'unknown',
      userRole: newLog.userRole,
      actionType: newLog.actionType,
      recordCode: newLog.recordCode,
      details: newLog.details
    });
    newLog.id = docRef.id;
    console.log('[Log Aktivitas] Berhasil dicatat:', newLog.details);
  } catch (err) {
    console.warn('[Log Aktivitas] Firestore sync warning (tersimpan di penyimpanan lokal):', err);
  }

  return newLog;
}

/**
 * Get all cached integrity logs from localStorage
 */
export function getLocalIntegrityLogs(): DataIntegrityLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_INTEGRITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Gagal membaca log integritas dari localStorage:', e);
    return [];
  }
}

/**
 * Save an integrity log locally and in Firestore
 */
export async function saveIntegrityLog(log: DataIntegrityLog): Promise<void> {
  // 1. Save locally
  try {
    const existing = getLocalIntegrityLogs();
    const updated = [log, ...existing].slice(0, 150);
    localStorage.setItem(LOCAL_STORAGE_INTEGRITY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Gagal menyimpan log integritas ke localStorage:', e);
  }

  // 2. Push to Firestore
  try {
    await addDoc(collection(db, 'integrity_logs'), log);
  } catch (err) {
    console.warn('Gagal mencatat log integritas ke Firestore:', err);
  }
}
