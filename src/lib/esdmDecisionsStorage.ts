import { saveActivityLog } from './activityStorage';

export type EsdmDecisionType = 'PENDING' | 'APPROVED' | 'RETAIN' | 'REJECT';

export interface EsdmItemDecision {
  itemKey: string; // e.g. `${span}_${nobid}` or item.id
  span: string;
  nobid: string;
  desa: string;
  nama: string;
  status: EsdmDecisionType;
  notes: string;
  updatedAt: number;
  updatedBy: string;
  userRole?: string;
}

const STORAGE_PREFIX = 'project_ventura_esdm_decisions_';

function getStorageKey(projectId: string, desa: string): string {
  const p = (projectId || 'default').trim();
  const d = (desa || 'ALL').trim().toUpperCase();
  return `${STORAGE_PREFIX}${p}_${d}`;
}

/**
 * Get all stored decisions for a project and desa
 */
export function getStoredEsdmDecisions(
  projectId: string,
  desa: string
): Record<string, EsdmItemDecision> {
  try {
    const key = getStorageKey(projectId, desa);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.warn('Gagal membaca keputusan crosscheck ESDM dari localStorage:', err);
    return {};
  }
}

/**
 * Human-readable label for a decision status
 */
export function getDecisionLabel(status: EsdmDecisionType): string {
  switch (status) {
    case 'APPROVED':
      return 'SESUAI (APPROVED)';
    case 'RETAIN':
      return 'TETAP (DATA APLIKASI)';
    case 'REJECT':
      return 'REJECT (DITOLAK)';
    case 'PENDING':
    default:
      return 'BELUM DIPUTUSKAN';
  }
}

/**
 * Save or update a single decision and log to Activity Logs
 */
export async function saveEsdmDecision({
  projectId,
  projectName,
  decision,
  userEmail,
  operatorName,
  userRole,
  logActivity = true,
}: {
  projectId: string;
  projectName: string;
  decision: EsdmItemDecision;
  userEmail: string;
  operatorName: string;
  userRole: string;
  logActivity?: boolean;
}): Promise<void> {
  try {
    // 1. Save to localStorage
    const key = getStorageKey(projectId, decision.desa);
    const existing = getStoredEsdmDecisions(projectId, decision.desa);
    existing[decision.itemKey] = {
      ...decision,
      updatedAt: Date.now(),
      updatedBy: operatorName || userEmail.split('@')[0] || 'Operator',
      userRole: userRole || 'FIELD',
    };
    localStorage.setItem(key, JSON.stringify(existing));

    // 2. Log to Activity Log
    if (logActivity) {
      const statusLabel = getDecisionLabel(decision.status);
      const noteSnippet = decision.notes && decision.notes.trim() 
        ? ` | Catatan: "${decision.notes.trim()}"` 
        : '';
      const namaSnippet = decision.nama ? ` (${decision.nama})` : '';

      await saveActivityLog({
        projectId: projectId || 'default',
        projectName: projectName || 'Proyek Ventura',
        timestamp: Date.now(),
        userEmail: userEmail || 'operator@ventura.id',
        operatorName: operatorName || 'Operator',
        userRole: userRole || 'FIELD',
        actionType: 'ESDM_APPROVAL',
        recordCode: `No. ${decision.nobid} (${decision.span})`,
        details: `[Crosscheck ESDM - Desa ${decision.desa}] Bidang No. ${decision.nobid}${namaSnippet} Span ${decision.span}: Status ditetapkan menjadi [${statusLabel}]${noteSnippet}`,
      });
    }
  } catch (err) {
    console.error('Error saving ESDM decision:', err);
  }
}

/**
 * Batch update decisions (e.g. approve all matching rows)
 */
export async function batchSaveEsdmDecisions({
  projectId,
  projectName,
  decisions,
  userEmail,
  operatorName,
  userRole,
  batchDescription,
}: {
  projectId: string;
  projectName: string;
  decisions: EsdmItemDecision[];
  userEmail: string;
  operatorName: string;
  userRole: string;
  batchDescription: string;
}): Promise<void> {
  if (decisions.length === 0) return;

  try {
    // Group by desa
    const byDesa: Record<string, EsdmItemDecision[]> = {};
    decisions.forEach(d => {
      const desaUpper = (d.desa || 'ALL').toUpperCase();
      if (!byDesa[desaUpper]) byDesa[desaUpper] = [];
      byDesa[desaUpper].push(d);
    });

    const now = Date.now();
    const op = operatorName || userEmail.split('@')[0] || 'Operator';

    for (const [desaUpper, list] of Object.entries(byDesa)) {
      const key = getStorageKey(projectId, desaUpper);
      const existing = getStoredEsdmDecisions(projectId, desaUpper);
      list.forEach(d => {
        existing[d.itemKey] = {
          ...d,
          updatedAt: now,
          updatedBy: op,
          userRole: userRole || 'FIELD',
        };
      });
      localStorage.setItem(key, JSON.stringify(existing));
    }

    // Single summary log entry for the batch action
    await saveActivityLog({
      projectId: projectId || 'default',
      projectName: projectName || 'Proyek Ventura',
      timestamp: now,
      userEmail: userEmail || 'operator@ventura.id',
      operatorName: op,
      userRole: userRole || 'FIELD',
      actionType: 'ESDM_APPROVAL',
      recordCode: `BATCH (${decisions.length} Bidang)`,
      details: `[Batch Crosscheck ESDM] ${batchDescription} (${decisions.length} bidang diperbarui)`,
    });
  } catch (err) {
    console.error('Error in batchSaveEsdmDecisions:', err);
  }
}
