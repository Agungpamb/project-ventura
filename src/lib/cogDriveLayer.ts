import L from 'leaflet';
import proj4 from 'proj4';
import {
  BaseClient,
  BaseResponse,
  fromCustomClient,
  type GeoTIFF,
  type GeoTIFFImage
} from 'geotiff';
import { fetchWithTimeout } from './googleApi';
import { getAccessToken } from './firebase';

export interface CogLayerMetadata {
  fileId: string;
  fileName?: string;
  fileSizeBytes?: number;
  width: number;
  height: number;
  epsgCode: string;
  crsLabel: string;
  overviewCount: number;
  compressionName: string;
  samplesPerPixel: number;
  boundsLatLng: L.LatLngBounds;
}

export interface CogDriveLayerOptions extends L.GridLayerOptions {
  fileId: string;
  accessToken?: string;
  epsgOverride?: string;
  onMetadataLoaded?: (meta: CogLayerMetadata) => void;
  onError?: (message: string) => void;
  onTileActivity?: (activeCount: number) => void;
}

export const COG_CRS_OVERRIDE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Otomatis dari Metadata COG (Disarankan)' },
  { value: 'EPSG:32647', label: 'UTM Zone 47N — Riau / Bangkinang / Petapahan / Sumut' },
  { value: 'EPSG:32648', label: 'UTM Zone 48N — Kepri / Riau Timur / Kalbar Utara' },
  { value: 'EPSG:32646', label: 'UTM Zone 46N — Aceh Barat' },
  { value: 'EPSG:32747', label: 'UTM Zone 47S — Sumbar / Bengkulu / Jambi Selatan' },
  { value: 'EPSG:32748', label: 'UTM Zone 48S — Lampung / Banten / DKI / Jabar' },
  { value: 'EPSG:32749', label: 'UTM Zone 49S — Jateng / DIY / Jatim / Kalteng' },
  { value: 'EPSG:32750', label: 'UTM Zone 50S — Jatim Ujung / Bali / Sulsel / Kaltim' },
  { value: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
  { value: 'EPSG:4326', label: 'Geografis WGS84 (EPSG:4326)' }
];

// ============================================================================
// PROJ4 DYNAMIC EPSG REGISTRATION (Supports ALL UTM N/S, TM-3°, 3857, 4326)
// ============================================================================
const registeredEpsg = new Set<string>(['EPSG:4326', 'EPSG:3857']);

function ensureProj4Registered(epsg: string): string {
  const clean = epsg.trim().toUpperCase();
  if (registeredEpsg.has(clean)) return clean;

  const utmNorth = clean.match(/^EPSG:326(\d{2})$/);
  if (utmNorth) {
    const zone = parseInt(utmNorth[1], 10);
    if (zone >= 1 && zone <= 60) {
      proj4.defs(clean, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`);
      registeredEpsg.add(clean);
      return clean;
    }
  }

  const utmSouth = clean.match(/^EPSG:327(\d{2})$/);
  if (utmSouth) {
    const zone = parseInt(utmSouth[1], 10);
    if (zone >= 1 && zone <= 60) {
      proj4.defs(clean, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`);
      registeredEpsg.add(clean);
      return clean;
    }
  }

  // Indonesian DGN95 / TM-3° zones (EPSG:23830 .. 23845)
  const tm3Match = clean.match(/^EPSG:238(\d{2})$/);
  if (tm3Match) {
    const idx = parseInt(tm3Match[1], 10) - 30; // 0 = 46.2 (94.5E), step +3°
    if (idx >= 0 && idx <= 15) {
      const lon0 = 94.5 + idx * 3;
      proj4.defs(
        clean,
        `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=0.9999 +x_0=200000 +y_0=1500000 +datum=WGS84 +units=m +no_defs`
      );
      registeredEpsg.add(clean);
      return clean;
    }
  }

  if (clean === 'EPSG:900913') {
    return 'EPSG:3857';
  }

  return clean;
}

function formatCrsLabel(epsg: string): string {
  const clean = epsg.toUpperCase();
  const n = clean.match(/^EPSG:326(\d{2})$/);
  if (n) return `UTM ${parseInt(n[1], 10)}N (${clean})`;
  const s = clean.match(/^EPSG:327(\d{2})$/);
  if (s) return `UTM ${parseInt(s[1], 10)}S (${clean})`;
  if (clean === 'EPSG:3857') return 'Web Mercator (EPSG:3857)';
  if (clean === 'EPSG:4326') return 'WGS84 Lat/Lng (EPSG:4326)';
  return clean;
}

function detectEpsgFromImage(image: GeoTIFFImage, epsgOverride?: string): string {
  if (epsgOverride && epsgOverride.trim()) {
    return ensureProj4Registered(epsgOverride.trim());
  }

  const geoKeys: Record<string, any> = (image.getGeoKeys() || {}) as Record<string, any>;
  const projected = Number(geoKeys.ProjectedCSTypeGeoKey);
  if (Number.isFinite(projected) && projected > 0 && projected !== 32767) {
    return ensureProj4Registered(`EPSG:${projected}`);
  }

  // Fallback: parse citation text like "WGS 84 / UTM zone 47N"
  const citation = String(geoKeys.PCSCitationGeoKey || geoKeys.GTCitationGeoKey || '');
  const utmTextMatch = citation.match(/UTM\s*(?:zone\s*)?(\d{1,2})\s*([NS])/i);
  if (utmTextMatch) {
    const zoneNum = String(parseInt(utmTextMatch[1], 10)).padStart(2, '0');
    const hemi = utmTextMatch[2].toUpperCase();
    const code = hemi === 'N' ? `EPSG:326${zoneNum}` : `EPSG:327${zoneNum}`;
    return ensureProj4Registered(code);
  }

  const geographic = Number(geoKeys.GeographicTypeGeoKey);
  if (Number.isFinite(geographic) && geographic === 4326) {
    return 'EPSG:4326';
  }

  // Last-resort heuristic from bounding box coordinates
  try {
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    if (Math.abs(minX) <= 180 && Math.abs(maxX) <= 180 && Math.abs(minY) <= 90 && Math.abs(maxY) <= 90) {
      return 'EPSG:4326';
    }
    if (Math.abs(minX) > 2000000 || Math.abs(maxX) > 2000000) {
      return 'EPSG:3857';
    }
  } catch {
    // ignore
  }

  // Fallback for Indonesia Sumatra/Riau if user-defined UTM without GeoKey
  return ensureProj4Registered('EPSG:32647');
}

function getCompressionLabel(compressionId: number | undefined): string {
  switch (compressionId) {
    case 1: return 'Uncompressed';
    case 5: return 'LZW';
    case 7: return 'JPEG';
    case 8:
    case 32946: return 'DEFLATE';
    case 32773: return 'PackBits';
    case 34887: return 'LERC';
    case 50000: return 'ZSTD';
    case 50001: return 'WebP';
    default: return compressionId ? `Codec #${compressionId}` : 'Standard';
  }
}

// ============================================================================
// GOOGLE DRIVE API V3 HTTP RANGE CLIENT (NEVER DOWNLOADS FULL 2.5 GB FILE!)
// ============================================================================
class DriveFetchResponse extends BaseResponse {
  private response: Response;
  private cachedBuffer?: ArrayBuffer;

  constructor(response: Response) {
    super();
    this.response = response;
  }

  get status(): number {
    return this.response.status;
  }

  getHeader(headerName: string): string | undefined {
    return this.response.headers.get(headerName) || undefined;
  }

  async getData(): Promise<ArrayBuffer> {
    if (!this.cachedBuffer) {
      this.cachedBuffer = await this.response.arrayBuffer();
    }
    return this.cachedBuffer;
  }
}

class GoogleDriveRangeClient extends BaseClient {
  private fallbackToken?: string;

  constructor(fileId: string, fallbackToken?: string) {
    super(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    this.fallbackToken = fallbackToken;
  }

  private async resolveToken(): Promise<string> {
    const liveToken = await getAccessToken();
    const token = (liveToken && liveToken !== 'GUEST_BYPASS')
      ? liveToken
      : (this.fallbackToken && this.fallbackToken !== 'GUEST_BYPASS' ? this.fallbackToken : '');
    if (!token) {
      throw new Error('Akun Google belum login penuh (OAuth Drive). Silakan login Google terlebih dahulu untuk membaca Foto Udara COG dari Google Drive.');
    }
    return token;
  }

  async request(options: RequestInit = {}): Promise<BaseResponse> {
    const token = await this.resolveToken();
    const reqHeaders = new Headers(options.headers || {});
    reqHeaders.set('Authorization', `Bearer ${token}`);

    const requestedRange = reqHeaders.get('Range');

    const response = await fetchWithTimeout(
      this.url,
      {
        method: 'GET',
        headers: reqHeaders,
        signal: options.signal
      },
      45000
    );

    if (response.status === 401) {
      throw new Error('Sesi token Google Drive habis (401). Silakan klik segarkan / login ulang akun Google.');
    }
    if (response.status === 403) {
      throw new Error('Akses Google Drive ditolak (403). Pastikan file COG sudah dibagikan minimal sebagai Viewer ke akun ini (atau Anyone with the link → Viewer).');
    }
    if (response.status === 404) {
      throw new Error('File COG tidak ditemukan di Google Drive (404). Periksa kembali link Google Drive yang ditempel.');
    }

    // Safety guard: NEVER download an entire multi-GB file if Range header was ignored
    if (requestedRange && response.status === 200) {
      const len = Number(response.headers.get('content-length') || 0);
      if (len > 25 * 1024 * 1024) {
        try {
          await response.body?.cancel();
        } catch {
          // ignore
        }
        throw new Error('Server mengembalikan file penuh (bukan potongan Range). Streaming dibatalkan demi keamanan memori browser.');
      }
    }

    return new DriveFetchResponse(response);
  }
}

async function fetchDriveFileMeta(fileId: string, fallbackToken?: string): Promise<{ name?: string; size?: number }> {
  try {
    const liveToken = await getAccessToken();
    const token = (liveToken && liveToken !== 'GUEST_BYPASS') ? liveToken : fallbackToken;
    if (!token || token === 'GUEST_BYPASS') return {};
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
      15000
    );
    if (!res.ok) return {};
    const data = await res.json();
    return {
      name: typeof data?.name === 'string' ? data.name : undefined,
      size: data?.size ? Number(data.size) : undefined
    };
  } catch {
    return {};
  }
}

// ============================================================================
// CONCURRENCY QUEUE (Prevents Google Drive API Burst / Rate-Limit on Pan/Zoom)
// ============================================================================
class ConcurrencyLimiter {
  private maxConcurrent: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const idx = this.queue.indexOf(entry);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        const entry = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        this.queue.push(entry);
      });
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// Web Mercator tile (x, y, z) -> EPSG:3857 bounding box [minX, minY, maxX, maxY]
const MERCATOR_HALF_WORLD = 20037508.342789244;

function tileCoordsToMercatorBbox(x: number, y: number, z: number): [number, number, number, number] {
  const n = Math.pow(2, z);
  const tileSizeM = (2 * MERCATOR_HALF_WORLD) / n;
  const minX = -MERCATOR_HALF_WORLD + x * tileSizeM;
  const maxX = minX + tileSizeM;
  const maxY = MERCATOR_HALF_WORLD - y * tileSizeM;
  const minY = maxY - tileSizeM;
  return [minX, minY, maxX, maxY];
}

interface OverviewEntry {
  index: number;
  image: GeoTIFFImage;
  width: number;
  height: number;
  resX: number; // world units per pixel (positive)
  resY: number; // world units per pixel (positive)
}

interface ParsedCogContext {
  tiff: GeoTIFF;
  mainImage: GeoTIFFImage;
  overviews: OverviewEntry[];
  cogEpsg: string;
  cogBbox: [number, number, number, number]; // [minX, minY, maxX, maxY] in cogEpsg
  noDataValue: number | null;
  samplesPerPixel: number;
  metadata: CogLayerMetadata;
  mercatorToCog: proj4.Converter;
}

// ============================================================================
// LEAFLET GRID LAYER FOR GOOGLE DRIVE COG (WebP / JPEG / LZW + UTM / Mercator)
// ============================================================================
export class CogDriveGridLayer extends L.GridLayer {
  private cogOptions: CogDriveLayerOptions;
  private contextPromise: Promise<ParsedCogContext> | null = null;
  private limiter = new ConcurrencyLimiter(4);
  private tileAbortControllers = new Map<string, AbortController>();
  private activeTileCount = 0;
  private disposed = false;

  constructor(options: CogDriveLayerOptions) {
    super({
      tileSize: 256,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
      zIndex: 200,
      minZoom: 10,
      maxZoom: 21,
      maxNativeZoom: 21,
      ...options
    });
    this.cogOptions = options;

    this.on('tileunload', (ev: any) => {
      const coords = ev?.coords;
      if (coords) {
        const key = `${coords.z}/${coords.x}/${coords.y}`;
        const ctrl = this.tileAbortControllers.get(key);
        if (ctrl) {
          ctrl.abort();
          this.tileAbortControllers.delete(key);
        }
      }
    });
  }

  private bumpActivity(delta: number) {
    this.activeTileCount = Math.max(0, this.activeTileCount + delta);
    this.cogOptions.onTileActivity?.(this.activeTileCount);
  }

  public initMetadata(): Promise<CogLayerMetadata> {
    return this.getContext().then((ctx) => ctx.metadata);
  }

  private getContext(): Promise<ParsedCogContext> {
    if (!this.contextPromise) {
      this.contextPromise = this.loadCogContext().catch((err) => {
        this.contextPromise = null;
        const msg = err instanceof Error ? err.message : String(err);
        this.cogOptions.onError?.(msg);
        throw err;
      });
    }
    return this.contextPromise;
  }

  private async loadCogContext(): Promise<ParsedCogContext> {
    const { fileId, accessToken, epsgOverride } = this.cogOptions;
    const client = new GoogleDriveRangeClient(fileId, accessToken);

    // maxRanges: 0 ensures single HTTP Range requests (Google Drive API v3 compliant)
    // allowFullFile: false guarantees we NEVER buffer the entire 2.5 GB file
    const [tiff, driveMeta] = await Promise.all([
      fromCustomClient(client, {
        allowFullFile: false,
        maxRanges: 0,
        blockSize: 262144, // 256 KB per cached chunk
        cacheSize: 200 // ~50 MB LRU chunk cache in browser memory
      } as any),
      fetchDriveFileMeta(fileId, accessToken)
    ]);

    const mainImage = await tiff.getImage(0);
    const width = mainImage.getWidth();
    const height = mainImage.getHeight();
    const rawBbox = mainImage.getBoundingBox(); // [minX, minY, maxX, maxY]
    const cogBbox: [number, number, number, number] = [
      Math.min(rawBbox[0], rawBbox[2]),
      Math.min(rawBbox[1], rawBbox[3]),
      Math.max(rawBbox[0], rawBbox[2]),
      Math.max(rawBbox[1], rawBbox[3])
    ];

    const cogEpsg = detectEpsgFromImage(mainImage, epsgOverride);
    const cogToWgs84 = proj4(cogEpsg, 'EPSG:4326');
    const mercatorToCog = proj4('EPSG:3857', cogEpsg);

    // Sample perimeter points to compute accurate WGS84 LatLngBounds
    const sampleCoords: Array<[number, number]> = [
      [cogBbox[0], cogBbox[1]],
      [cogBbox[2], cogBbox[1]],
      [cogBbox[2], cogBbox[3]],
      [cogBbox[0], cogBbox[3]],
      [(cogBbox[0] + cogBbox[2]) / 2, cogBbox[1]],
      [(cogBbox[0] + cogBbox[2]) / 2, cogBbox[3]],
      [cogBbox[0], (cogBbox[1] + cogBbox[3]) / 2],
      [cogBbox[2], (cogBbox[1] + cogBbox[3]) / 2]
    ];

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const [cx, cy] of sampleCoords) {
      const [lng, lat] = cogToWgs84.forward([cx, cy]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }

    const boundsLatLng = L.latLngBounds(
      L.latLng(minLat, minLng),
      L.latLng(maxLat, maxLng)
    );

    // Inspect internal COG overviews (skipping internal transparency bitmask IFDs)
    const imageCount = await tiff.getImageCount();
    const overviews: OverviewEntry[] = [];
    const mainSpanX = cogBbox[2] - cogBbox[0];
    const mainSpanY = cogBbox[3] - cogBbox[1];

    for (let idx = 0; idx < imageCount; idx++) {
      try {
        const img = idx === 0 ? mainImage : await tiff.getImage(idx);
        const fd: any = img.fileDirectory || {};
        const subfileType = Number(fd.NewSubfileType || 0);
        const photometric = Number(fd.PhotometricInterpretation ?? -1);

        // Skip GDAL transparency mask IFDs (bit 2 = 4, or Photometric = 4 Transparency Mask)
        if (idx > 0 && ((subfileType & 4) !== 0 || photometric === 4)) {
          continue;
        }

        const w = img.getWidth();
        const h = img.getHeight();
        if (w <= 0 || h <= 0) continue;

        overviews.push({
          index: idx,
          image: img,
          width: w,
          height: h,
          resX: mainSpanX / w,
          resY: mainSpanY / h
        });
      } catch (ovErr) {
        console.warn(`[CogDriveLayer] Melewati overview #${idx}:`, ovErr);
      }
    }

    // Sort from finest (smallest resX) to coarsest (largest resX)
    overviews.sort((a, b) => a.resX - b.resX);

    const fdMain: any = mainImage.fileDirectory || {};
    const compressionName = getCompressionLabel(Number(fdMain.Compression));
    const samplesPerPixel = mainImage.getSamplesPerPixel();
    const noDataValue = mainImage.getGDALNoData();

    const metadata: CogLayerMetadata = {
      fileId,
      fileName: driveMeta.name,
      fileSizeBytes: driveMeta.size,
      width,
      height,
      epsgCode: cogEpsg,
      crsLabel: formatCrsLabel(cogEpsg),
      overviewCount: Math.max(0, overviews.length - 1),
      compressionName,
      samplesPerPixel,
      boundsLatLng
    };

    this.cogOptions.onMetadataLoaded?.(metadata);

    return {
      tiff,
      mainImage,
      overviews,
      cogEpsg,
      cogBbox,
      noDataValue,
      samplesPerPixel,
      metadata,
      mercatorToCog
    };
  }

  onRemove(map: L.Map): this {
    this.disposed = true;
    this.tileAbortControllers.forEach((ctrl) => ctrl.abort());
    this.tileAbortControllers.clear();
    return super.onRemove(map);
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    const size = this.getTileSize();
    canvas.width = size.x;
    canvas.height = size.y;

    const key = `${coords.z}/${coords.x}/${coords.y}`;
    const prevCtrl = this.tileAbortControllers.get(key);
    if (prevCtrl) prevCtrl.abort();
    const controller = new AbortController();
    this.tileAbortControllers.set(key, controller);

    this.renderTile(coords, canvas, controller.signal)
      .then(() => {
        this.tileAbortControllers.delete(key);
        done(undefined, canvas);
      })
      .catch((err) => {
        this.tileAbortControllers.delete(key);
        if (err?.name === 'AbortError' || this.disposed) {
          done(undefined, canvas);
          return;
        }
        console.warn(`[CogDriveLayer] Tile ${key} gagal dimuat:`, err);
        done(undefined, canvas);
      });

    return canvas;
  }

  private async renderTile(
    coords: L.Coords,
    canvas: HTMLCanvasElement,
    signal: AbortSignal
  ): Promise<void> {
    const ctx = await this.getContext();
    if (signal.aborted || this.disposed) return;

    const tileW = canvas.width;
    const tileH = canvas.height;
    const [mMinX, mMinY, mMaxX, mMaxY] = tileCoordsToMercatorBbox(coords.x, coords.y, coords.z);
    const [cogMinX, cogMinY, cogMaxX, cogMaxY] = ctx.cogBbox;

    // Project 9x9 control grid across the tile from EPSG:3857 -> COG CRS (e.g., UTM 47N)
    // Only 81 proj4 transforms (<0.1ms) gives sub-millimeter bilinear warp accuracy per 256px tile!
    const GRID = 8;
    const gridCount = GRID + 1;
    const gridCogX = new Float64Array(gridCount * gridCount);
    const gridCogY = new Float64Array(gridCount * gridCount);

    let reqMinX = Infinity;
    let reqMaxX = -Infinity;
    let reqMinY = Infinity;
    let reqMaxY = -Infinity;

    for (let gy = 0; gy <= GRID; gy++) {
      const ty = gy / GRID;
      const my = mMaxY - ty * (mMaxY - mMinY); // top to bottom
      for (let gx = 0; gx <= GRID; gx++) {
        const tx = gx / GRID;
        const mx = mMinX + tx * (mMaxX - mMinX);
        const [cx, cy] = ctx.mercatorToCog.forward([mx, my]);
        const idx = gy * gridCount + gx;
        gridCogX[idx] = cx;
        gridCogY[idx] = cy;
        if (cx < reqMinX) reqMinX = cx;
        if (cx > reqMaxX) reqMaxX = cx;
        if (cy < reqMinY) reqMinY = cy;
        if (cy > reqMaxY) reqMaxY = cy;
      }
    }

    // Fast skip: if this Leaflet tile does NOT intersect the COG aerial photo at all -> 0 bytes fetched!
    const interMinX = Math.max(reqMinX, cogMinX);
    const interMaxX = Math.min(reqMaxX, cogMaxX);
    const interMinY = Math.max(reqMinY, cogMinY);
    const interMaxY = Math.min(reqMaxY, cogMaxY);

    if (interMinX >= interMaxX || interMinY >= interMaxY) {
      return;
    }

    // Choose optimal overview level matching current tile ground resolution
    const tileResX = (reqMaxX - reqMinX) / tileW;
    const tileResY = (reqMaxY - reqMinY) / tileH;
    const desiredRes = Math.min(tileResX, tileResY);

    let chosen = ctx.overviews[0];
    for (let i = 0; i < ctx.overviews.length; i++) {
      const ov = ctx.overviews[i];
      if (ov.resX <= desiredRes * 1.15) {
        chosen = ov;
      } else {
        break;
      }
    }
    // If zoomed far out beyond the coarsest overview, use the coarsest overview
    if (desiredRes > ctx.overviews[ctx.overviews.length - 1].resX) {
      chosen = ctx.overviews[ctx.overviews.length - 1];
    }

    const cogSpanX = cogMaxX - cogMinX;
    const cogSpanY = cogMaxY - cogMinY;

    // Pixel window inside chosen overview (with 1px margin for smooth edge sampling)
    const rawWinX0 = Math.floor(((interMinX - cogMinX) / cogSpanX) * chosen.width) - 1;
    const rawWinX1 = Math.ceil(((interMaxX - cogMinX) / cogSpanX) * chosen.width) + 1;
    const rawWinY0 = Math.floor(((cogMaxY - interMaxY) / cogSpanY) * chosen.height) - 1;
    const rawWinY1 = Math.ceil(((cogMaxY - interMinY) / cogSpanY) * chosen.height) + 1;

    const winX0 = Math.max(0, Math.min(chosen.width - 1, rawWinX0));
    const winX1 = Math.max(winX0 + 1, Math.min(chosen.width, rawWinX1));
    const winY0 = Math.max(0, Math.min(chosen.height - 1, rawWinY0));
    const winY1 = Math.max(winY0 + 1, Math.min(chosen.height, rawWinY1));

    const srcWinW = winX1 - winX0;
    const srcWinH = winY1 - winY0;
    if (srcWinW <= 0 || srcWinH <= 0) return;

    // Limit decoded readout dimensions when zoomed very far out
    const maxReadDim = 384;
    const scaleDown = Math.min(1, maxReadDim / Math.max(srcWinW, srcWinH));
    const outW = Math.max(1, Math.round(srcWinW * scaleDown));
    const outH = Math.max(1, Math.round(srcWinH * scaleDown));

    this.bumpActivity(1);
    let raster: any;
    try {
      raster = await this.limiter.run(
        () =>
          chosen.image.readRasters({
            window: [winX0, winY0, winX1, winY1],
            width: outW,
            height: outH,
            interleave: true,
            resampleMethod: 'bilinear',
            signal
          }),
        signal
      );
    } finally {
      this.bumpActivity(-1);
    }

    if (signal.aborted || this.disposed || !raster) return;

    const spp = chosen.image.getSamplesPerPixel();
    const noData = ctx.noDataValue;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const imgData = ctx2d.createImageData(tileW, tileH);
    const dst = imgData.data;

    // Map COG world coordinate -> pixel index in our fetched [outW x outH] buffer
    const invSpanX = chosen.width / cogSpanX;
    const invSpanY = chosen.height / cogSpanY;
    const bufScaleX = outW / srcWinW;
    const bufScaleY = outH / srcWinH;
    const cellStep = tileW / GRID; // 32 pixels per grid cell

    for (let gy = 0; gy < GRID; gy++) {
      const pyStart = gy * cellStep;
      const pyEnd = pyStart + cellStep;
      const rowOffset0 = gy * gridCount;
      const rowOffset1 = (gy + 1) * gridCount;

      for (let gx = 0; gx < GRID; gx++) {
        const pxStart = gx * cellStep;
        const pxEnd = pxStart + cellStep;

        const c00x = gridCogX[rowOffset0 + gx];
        const c10x = gridCogX[rowOffset0 + gx + 1];
        const c01x = gridCogX[rowOffset1 + gx];
        const c11x = gridCogX[rowOffset1 + gx + 1];

        const c00y = gridCogY[rowOffset0 + gx];
        const c10y = gridCogY[rowOffset0 + gx + 1];
        const c01y = gridCogY[rowOffset1 + gx];
        const c11y = gridCogY[rowOffset1 + gx + 1];

        for (let py = pyStart; py < pyEnd; py++) {
          const v = (py - pyStart + 0.5) / cellStep;
          const oneMinusV = 1 - v;
          const leftX = c00x * oneMinusV + c01x * v;
          const rightX = c10x * oneMinusV + c11x * v;
          const leftY = c00y * oneMinusV + c01y * v;
          const rightY = c10y * oneMinusV + c11y * v;

          let dstIdx = (py * tileW + pxStart) * 4;

          for (let px = pxStart; px < pxEnd; px++, dstIdx += 4) {
            const u = (px - pxStart + 0.5) / cellStep;
            const cx = leftX + (rightX - leftX) * u;
            const cy = leftY + (rightY - leftY) * u;

            if (cx < cogMinX || cx > cogMaxX || cy < cogMinY || cy > cogMaxY) {
              continue;
            }

            const ovPx = (cx - cogMinX) * invSpanX - winX0;
            const ovPy = (cogMaxY - cy) * invSpanY - winY0;
            const sx = Math.floor(ovPx * bufScaleX);
            const sy = Math.floor(ovPy * bufScaleY);

            if (sx < 0 || sx >= outW || sy < 0 || sy >= outH) {
              continue;
            }

            const srcIdx = (sy * outW + sx) * spp;

            if (spp >= 4) {
              const a = raster[srcIdx + 3];
              if (a === 0) continue;
              dst[dstIdx] = raster[srcIdx];
              dst[dstIdx + 1] = raster[srcIdx + 1];
              dst[dstIdx + 2] = raster[srcIdx + 2];
              dst[dstIdx + 3] = a;
            } else if (spp === 3) {
              const r = raster[srcIdx];
              const g = raster[srcIdx + 1];
              const b = raster[srcIdx + 2];
              if (noData !== null && r === noData && g === noData && b === noData) {
                continue;
              }
              dst[dstIdx] = r;
              dst[dstIdx + 1] = g;
              dst[dstIdx + 2] = b;
              dst[dstIdx + 3] = 255;
            } else {
              const val = raster[srcIdx];
              if (noData !== null && val === noData) continue;
              dst[dstIdx] = val;
              dst[dstIdx + 1] = val;
              dst[dstIdx + 2] = val;
              dst[dstIdx + 3] = 255;
            }
          }
        }
      }
    }

    ctx2d.putImageData(imgData, 0, 0);
  }
}
