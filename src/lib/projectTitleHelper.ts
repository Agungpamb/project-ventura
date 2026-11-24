/**
 * Special per-Desa project title auto-detection helper.
 *
 * Specifically for the combined working folder "KONFIGURASI LLG KEBRAON DAN LLG DRIYOREJO":
 * - Desa/Kelurahan Kebraon        -> "REKONFIGURASI LLG 150 kV KEBRAON"
 * - Desa/Kelurahan Kesamben Wetan -> "LLG 150 kV KRIAN"
 *
 * Applies automatically across Formulir Inventarisasi PDF, Peta Bidang Tanah,
 * and Daftar Nominatif (screen, print, and Excel export) without splitting the workspace.
 */

export interface ResolvedProjectTitle {
  title: string;
  isAutoSplit: boolean;
  matchedDesaRule?: string;
}

function normalizeDesaForMatch(desa?: string | null): string {
  if (!desa) return '';
  return String(desa)
    .toUpperCase()
    .trim()
    .replace(/^(DESA|KELURAHAN|KEL|DSA)\.?\s+/i, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether the active project is the special combined LLG Kebraon & LLG Driyorejo project.
 */
export function isCombinedLlgKebraonDriyorejoProject(
  projectName?: string | null,
  projectId?: string | null
): boolean {
  const combined = `${projectName || ''} ${projectId || ''}`.toUpperCase();
  return (
    combined.includes('KEBRAON') &&
    (combined.includes('DRIYOREJO') || combined.includes('KRIAN') || combined.includes('LLG'))
  );
}

/**
 * Normalizes a project title to uppercase while preserving standard "kV" casing (e.g. "150 kV").
 */
export function formatProjectTitleCase(title: string): string {
  return String(title || '')
    .trim()
    .toUpperCase()
    .replace(/(\d+)\s*KV\b/g, '$1 kV')
    .replace(/\bKV\b/g, 'kV');
}

/**
 * Resolves the effective project title for a given Desa/Kelurahan.
 * Only overrides for the special combined LLG Kebraon & Driyorejo project.
 */
export function resolveProjectTitleByDesa(
  projectName?: string | null,
  desa?: string | null,
  projectId?: string | null
): ResolvedProjectTitle {
  const fallback = formatProjectTitleCase(projectName || '');

  if (!isCombinedLlgKebraonDriyorejoProject(projectName, projectId)) {
    return { title: fallback, isAutoSplit: false };
  }

  const rawDesa = String(desa || '').trim();
  if (!rawDesa || rawDesa === '__ALL__' || rawDesa.toUpperCase() === 'ALL') {
    return { title: fallback, isAutoSplit: false };
  }

  const normDesa = normalizeDesaForMatch(rawDesa);
  const compactDesa = normDesa.replace(/\s+/g, '');

  if (normDesa.includes('KEBRAON')) {
    return {
      title: 'REKONFIGURASI LLG 150 kV KEBRAON',
      isAutoSplit: true,
      matchedDesaRule: 'Kebraon'
    };
  }

  if (normDesa.includes('KESAMBEN WETAN') || compactDesa.includes('KESAMBENWETAN')) {
    return {
      title: 'LLG 150 kV KRIAN',
      isAutoSplit: true,
      matchedDesaRule: 'Kesamben Wetan'
    };
  }

  return { title: fallback, isAutoSplit: false };
}
