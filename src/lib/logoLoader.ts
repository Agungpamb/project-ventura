import { DANANTARA_BASE64, IDSURVEY_BASE64, SURVEYOR_BASE64 } from './embeddedLogos';

export interface ReportLogos {
  danantara: string;
  idsurvey: string;
  surveyor: string;
}

let cachedLogos: ReportLogos | null = null;

async function fetchPngAsDataUrl(url: string, fallbackBase64: string): Promise<string> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return fallbackBase64;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          resolve(fallbackBase64);
        }
      };
      reader.onerror = () => resolve(fallbackBase64);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`[LogoLoader] Could not load ${url} from public, using embedded fallback`, error);
    return fallbackBase64;
  }
}

/**
 * Loads the official high-resolution PNG logos directly from /public directory.
 * Caches them in memory for instant reuse across Executive Reports and Inventory Forms.
 */
export async function getOfficialLogos(): Promise<ReportLogos> {
  if (cachedLogos) {
    return cachedLogos;
  }

  try {
    const [danantara, idsurvey, surveyor] = await Promise.all([
      fetchPngAsDataUrl('/danantara.png', DANANTARA_BASE64),
      fetchPngAsDataUrl('/idsurvey.png', IDSURVEY_BASE64),
      fetchPngAsDataUrl('/surveyor.png', SURVEYOR_BASE64),
    ]);

    cachedLogos = {
      danantara,
      idsurvey,
      surveyor,
    };
    return cachedLogos;
  } catch (err) {
    console.warn('[LogoLoader] Fallback to embedded base64 logos', err);
    return {
      danantara: DANANTARA_BASE64,
      idsurvey: IDSURVEY_BASE64,
      surveyor: SURVEYOR_BASE64,
    };
  }
}
