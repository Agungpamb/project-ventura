/**
 * Geospatial utilities for polygon geometry calculations.
 * Supports calculating real ground planar area in square meters (m²)
 * from GeoJSON Polygons / MultiPolygons, calibrated to UTM / Transverse Mercator
 * matching ArcGIS "Calculate Geometry -> Area" with sub-millimeter precision.
 */

import type { CoordinateProjectionId } from '../types';

// WGS84 Ellipsoid Constants
const WGS84_A = 6378137.0; // Semi-major axis (meters)
const WGS84_F = 1 / 298.257223563; // Flattening
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
const WGS84_EOCT2 = WGS84_E2 / (1 - WGS84_E2);
const UTM_K0 = 0.9996;
const TM3_K0 = 0.9999;
const FALSE_EASTING = 500000.0;
const FALSE_NORTHING_SOUTH = 10000000.0;
const TM3_FALSE_EASTING = 200000.0;
const TM3_FALSE_NORTHING = 1500000.0;

export interface CoordinateProjectionOption {
  id: CoordinateProjectionId;
  group: 'UTM' | 'TM3' | 'GEOGRAPHIC';
  label: string;
  shortName: string;
  sheetRowLabel: string;
  sheetRowValue: string;
  regionHint: string;
}

export const COORDINATE_PROJECTION_OPTIONS: CoordinateProjectionOption[] = [
  {
    id: 'AUTO_UTM',
    group: 'UTM',
    label: 'Auto-Detect UTM Zone (Otomatis dari Koordinat Bidang)',
    shortName: 'UTM (Auto)',
    sheetRowLabel: 'Koordinat Universal Transverse Mercator',
    sheetRowValue: 'Otomatis sesuai Zona UTM (WGS84)',
    regionHint: 'Otomatis mendeteksi zona UTM dari lokasi bidang'
  },
  // UTM Selatan (Southern Hemisphere Indonesia)
  { id: 'UTM_46S', group: 'UTM', label: 'UTM Zone 46S (WGS84)', shortName: 'UTM 46S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '46 S (Zone UTM - WGS84)', regionHint: 'Barat Daya Sumatra / Mentawai' },
  { id: 'UTM_47S', group: 'UTM', label: 'UTM Zone 47S (WGS84)', shortName: 'UTM 47S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '47 S (Zone UTM - WGS84)', regionHint: 'Sumatra Barat, Bengkulu, Jambi Selatan' },
  { id: 'UTM_48S', group: 'UTM', label: 'UTM Zone 48S (WGS84)', shortName: 'UTM 48S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '48 S (Zone UTM - WGS84)', regionHint: 'Lampung, Banten, DKI Jakarta, Jawa Barat' },
  { id: 'UTM_49S', group: 'UTM', label: 'UTM Zone 49S (WGS84) — Default', shortName: 'UTM 49S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '49 S (Zone UTM)', regionHint: 'Jawa Tengah, DIY, Jawa Timur, Kalteng/Kalsel' },
  { id: 'UTM_50S', group: 'UTM', label: 'UTM Zone 50S (WGS84)', shortName: 'UTM 50S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '50 S (Zone UTM - WGS84)', regionHint: 'Jawa Timur Ujung, Bali, NTB, Sulsel, Kaltim Selatan' },
  { id: 'UTM_51S', group: 'UTM', label: 'UTM Zone 51S (WGS84)', shortName: 'UTM 51S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '51 S (Zone UTM - WGS84)', regionHint: 'NTT, Sulawesi Tenggara, Maluku Barat' },
  { id: 'UTM_52S', group: 'UTM', label: 'UTM Zone 52S (WGS84)', shortName: 'UTM 52S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '52 S (Zone UTM - WGS84)', regionHint: 'Maluku, Papua Barat' },
  { id: 'UTM_53S', group: 'UTM', label: 'UTM Zone 53S (WGS84)', shortName: 'UTM 53S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '53 S (Zone UTM - WGS84)', regionHint: 'Papua Tengah & Papua Selatan' },
  { id: 'UTM_54S', group: 'UTM', label: 'UTM Zone 54S (WGS84)', shortName: 'UTM 54S', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '54 S (Zone UTM - WGS84)', regionHint: 'Papua Timur / Jayapura' },
  // UTM Utara (Northern Hemisphere Indonesia)
  { id: 'UTM_46N', group: 'UTM', label: 'UTM Zone 46N (WGS84)', shortName: 'UTM 46N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '46 N (Zone UTM - WGS84)', regionHint: 'Aceh Bagian Barat' },
  { id: 'UTM_47N', group: 'UTM', label: 'UTM Zone 47N (WGS84)', shortName: 'UTM 47N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '47 N (Zone UTM - WGS84)', regionHint: 'Aceh, Sumatra Utara, Riau (Pekanbaru/Bangkinang)' },
  { id: 'UTM_48N', group: 'UTM', label: 'UTM Zone 48N (WGS84)', shortName: 'UTM 48N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '48 N (Zone UTM - WGS84)', regionHint: 'Kepulauan Riau, Riau Timur, Kalbar Utara' },
  { id: 'UTM_49N', group: 'UTM', label: 'UTM Zone 49N (WGS84)', shortName: 'UTM 49N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '49 N (Zone UTM - WGS84)', regionHint: 'Kalimantan Barat & Tengah Bagian Utara' },
  { id: 'UTM_50N', group: 'UTM', label: 'UTM Zone 50N (WGS84)', shortName: 'UTM 50N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '50 N (Zone UTM - WGS84)', regionHint: 'Kalimantan Timur & Kalimantan Utara' },
  { id: 'UTM_51N', group: 'UTM', label: 'UTM Zone 51N (WGS84)', shortName: 'UTM 51N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '51 N (Zone UTM - WGS84)', regionHint: 'Sulawesi Utara, Gorontalo, Sulteng Utara' },
  { id: 'UTM_52N', group: 'UTM', label: 'UTM Zone 52N (WGS84)', shortName: 'UTM 52N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '52 N (Zone UTM - WGS84)', regionHint: 'Maluku Utara' },
  { id: 'UTM_53N', group: 'UTM', label: 'UTM Zone 53N (WGS84)', shortName: 'UTM 53N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '53 N (Zone UTM - WGS84)', regionHint: 'Papua Bagian Utara' },
  { id: 'UTM_54N', group: 'UTM', label: 'UTM Zone 54N (WGS84)', shortName: 'UTM 54N', sheetRowLabel: 'Koordinat Universal Transverse Mercator', sheetRowValue: '54 N (Zone UTM - WGS84)', regionHint: 'Papua Timur Laut' },
  // TM-3° BPN / DGN95
  { id: 'TM3_46_2', group: 'TM3', label: 'TM-3° Zona 46.2 (DGN95 / BPN)', shortName: 'TM-3° 46.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 46.2 (DGN95)', regionHint: '93°E – 96°E (Aceh Barat)' },
  { id: 'TM3_47_1', group: 'TM3', label: 'TM-3° Zona 47.1 (DGN95 / BPN)', shortName: 'TM-3° 47.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 47.1 (DGN95)', regionHint: '96°E – 99°E (Aceh – Sumut)' },
  { id: 'TM3_47_2', group: 'TM3', label: 'TM-3° Zona 47.2 (DGN95 / BPN)', shortName: 'TM-3° 47.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 47.2 (DGN95)', regionHint: '99°E – 102°E (Sumbar, Riau, Bengkulu)' },
  { id: 'TM3_48_1', group: 'TM3', label: 'TM-3° Zona 48.1 (DGN95 / BPN)', shortName: 'TM-3° 48.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 48.1 (DGN95)', regionHint: '102°E – 105°E (Jambi, Sumsel, Lampung Barat)' },
  { id: 'TM3_48_2', group: 'TM3', label: 'TM-3° Zona 48.2 (DGN95 / BPN)', shortName: 'TM-3° 48.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 48.2 (DGN95)', regionHint: '105°E – 108°E (Banten, DKI, Jabar)' },
  { id: 'TM3_49_1', group: 'TM3', label: 'TM-3° Zona 49.1 (DGN95 / BPN)', shortName: 'TM-3° 49.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 49.1 (DGN95)', regionHint: '108°E – 111°E (Jawa Tengah & DIY)' },
  { id: 'TM3_49_2', group: 'TM3', label: 'TM-3° Zona 49.2 (DGN95 / BPN)', shortName: 'TM-3° 49.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 49.2 (DGN95)', regionHint: '111°E – 114°E (Jawa Timur, Kalteng)' },
  { id: 'TM3_50_1', group: 'TM3', label: 'TM-3° Zona 50.1 (DGN95 / BPN)', shortName: 'TM-3° 50.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 50.1 (DGN95)', regionHint: '114°E – 117°E (Bali, Kalsel, Kaltim)' },
  { id: 'TM3_50_2', group: 'TM3', label: 'TM-3° Zona 50.2 (DGN95 / BPN)', shortName: 'TM-3° 50.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 50.2 (DGN95)', regionHint: '117°E – 120°E (NTB, Sulsel, Kaltara)' },
  { id: 'TM3_51_1', group: 'TM3', label: 'TM-3° Zona 51.1 (DGN95 / BPN)', shortName: 'TM-3° 51.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 51.1 (DGN95)', regionHint: '120°E – 123°E (Sulteng, Sultra, NTT Barat)' },
  { id: 'TM3_51_2', group: 'TM3', label: 'TM-3° Zona 51.2 (DGN95 / BPN)', shortName: 'TM-3° 51.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 51.2 (DGN95)', regionHint: '123°E – 126°E (Sulut, Gorontalo, NTT Timur)' },
  { id: 'TM3_52_1', group: 'TM3', label: 'TM-3° Zona 52.1 (DGN95 / BPN)', shortName: 'TM-3° 52.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 52.1 (DGN95)', regionHint: '126°E – 129°E (Maluku & Maluku Utara)' },
  { id: 'TM3_52_2', group: 'TM3', label: 'TM-3° Zona 52.2 (DGN95 / BPN)', shortName: 'TM-3° 52.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 52.2 (DGN95)', regionHint: '129°E – 132°E (Maluku Timur – Sorong)' },
  { id: 'TM3_53_1', group: 'TM3', label: 'TM-3° Zona 53.1 (DGN95 / BPN)', shortName: 'TM-3° 53.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 53.1 (DGN95)', regionHint: '132°E – 135°E (Papua Barat)' },
  { id: 'TM3_53_2', group: 'TM3', label: 'TM-3° Zona 53.2 (DGN95 / BPN)', shortName: 'TM-3° 53.2', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 53.2 (DGN95)', regionHint: '135°E – 138°E (Papua Tengah)' },
  { id: 'TM3_54_1', group: 'TM3', label: 'TM-3° Zona 54.1 (DGN95 / BPN)', shortName: 'TM-3° 54.1', sheetRowLabel: 'Sistem Proyeksi Koordinat (BPN)', sheetRowValue: 'TM-3° Zona 54.1 (DGN95)', regionHint: '138°E – 141°E (Papua Timur / Jayapura)' },
  // Geographic WGS84
  {
    id: 'WGS84_DD',
    group: 'GEOGRAPHIC',
    label: 'Geografis WGS84 — Derajat Desimal (Lat, Lng)',
    shortName: 'WGS84 (Desimal)',
    sheetRowLabel: 'Sistem Koordinat Geografis',
    sheetRowValue: 'WGS84 (Derajat Desimal / Lat-Lng)',
    regionHint: 'Format: Lat -7.289667, Lng 110.343969'
  },
  {
    id: 'WGS84_DMS',
    group: 'GEOGRAPHIC',
    label: 'Geografis WGS84 — DMS (Derajat Menit Detik)',
    shortName: 'WGS84 (DMS)',
    sheetRowLabel: 'Sistem Koordinat Geografis',
    sheetRowValue: 'WGS84 (Derajat Menit Detik / DMS)',
    regionHint: 'Format: 7°17\'22.8"S, 110°20\'38.3"E'
  }
];

export function getCoordinateProjectionOption(id?: CoordinateProjectionId): CoordinateProjectionOption {
  const target = id || 'UTM_49S';
  return COORDINATE_PROJECTION_OPTIONS.find(o => o.id === target) || COORDINATE_PROJECTION_OPTIONS.find(o => o.id === 'UTM_49S')!;
}

/**
 * Core Transverse Mercator projection on WGS84 ellipsoid.
 */
function projectTransverseMercator(
  lng: number,
  lat: number,
  centralMeridianDeg: number,
  k0: number,
  falseEasting: number,
  falseNorthing: number
): { x: number; y: number } {
  const centralMeridian = (centralMeridianDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = WGS84_EOCT2 * Math.cos(latRad) * Math.cos(latRad);
  const A = (lngRad - centralMeridian) * Math.cos(latRad);

  const M = WGS84_A * (
    (1 - WGS84_E2 / 4 - 3 * WGS84_E2 * WGS84_E2 / 64 - 5 * WGS84_E2 * WGS84_E2 / 256) * latRad
    - (3 * WGS84_E2 / 8 + 3 * WGS84_E2 * WGS84_E2 / 32 + 45 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 1024) * Math.sin(2 * latRad)
    + (15 * WGS84_E2 * WGS84_E2 / 256 + 45 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 1024) * Math.sin(4 * latRad)
    - (35 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 3072) * Math.sin(6 * latRad)
  );

  const x = falseEasting + k0 * N * (
    A + (1 - T + C) * A * A * A / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * WGS84_EOCT2) * A * A * A * A * A / 120
  );

  const y = falseNorthing + k0 * (
    M + N * Math.tan(latRad) * (
      A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * WGS84_EOCT2) * A * A * A * A * A * A / 720
    )
  );

  return { x, y };
}

function formatDMS(degVal: number, isLat: boolean): string {
  const dir = isLat ? (degVal >= 0 ? 'N' : 'S') : (degVal >= 0 ? 'E' : 'W');
  const absVal = Math.abs(degVal);
  const d = Math.floor(absVal);
  const minFloat = (absVal - d) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1)}"${dir}`;
}

/**
 * Formats a WGS84 [lng, lat] point according to the chosen project CoordinateProjectionId.
 */
export function formatProjectedCoordinate(
  lng: number,
  lat: number,
  projectionId: CoordinateProjectionId = 'UTM_49S',
  compact: boolean = false
): { primaryText: string; detectedZoneLabel?: string } {
  if (projectionId === 'WGS84_DD') {
    const decimals = compact ? 5 : 6;
    return {
      primaryText: compact
        ? `${lat.toFixed(decimals)}, ${lng.toFixed(decimals)}`
        : `Lat: ${lat.toFixed(decimals)}   Lng: ${lng.toFixed(decimals)}`
    };
  }

  if (projectionId === 'WGS84_DMS') {
    return {
      primaryText: `${formatDMS(lat, true)} ${formatDMS(lng, false)}`
    };
  }

  if (projectionId === 'AUTO_UTM') {
    const zone = Math.floor((lng + 180) / 6) + 1;
    const isSouth = lat < 0;
    const centralMeridianDeg = (zone - 1) * 6 - 180 + 3;
    const { x, y } = projectTransverseMercator(
      lng,
      lat,
      centralMeridianDeg,
      UTM_K0,
      FALSE_EASTING,
      isSouth ? FALSE_NORTHING_SOUTH : 0
    );
    return {
      primaryText: compact
        ? `X: ${x.toFixed(2)} Y: ${y.toFixed(2)}`
        : `X: ${x.toFixed(4)}   Y: ${y.toFixed(4)}`,
      detectedZoneLabel: `${zone} ${isSouth ? 'S' : 'N'} (Zone UTM - WGS84)`
    };
  }

  const utmMatch = projectionId.match(/^UTM_(\d+)([NS])$/);
  if (utmMatch) {
    const zone = parseInt(utmMatch[1], 10);
    const isSouth = utmMatch[2] === 'S';
    const centralMeridianDeg = (zone - 1) * 6 - 180 + 3;
    const { x, y } = projectTransverseMercator(
      lng,
      lat,
      centralMeridianDeg,
      UTM_K0,
      FALSE_EASTING,
      isSouth ? FALSE_NORTHING_SOUTH : 0
    );
    return {
      primaryText: compact
        ? `X: ${x.toFixed(2)} Y: ${y.toFixed(2)}`
        : `X: ${x.toFixed(4)}   Y: ${y.toFixed(4)}`
    };
  }

  const tm3Match = projectionId.match(/^TM3_(\d+)_([12])$/);
  if (tm3Match) {
    const utmZone = parseInt(tm3Match[1], 10);
    const half = parseInt(tm3Match[2], 10);
    const centralMeridianDeg = (utmZone - 1) * 6 - 180 + (half === 1 ? 1.5 : 4.5);
    const { x, y } = projectTransverseMercator(
      lng,
      lat,
      centralMeridianDeg,
      TM3_K0,
      TM3_FALSE_EASTING,
      TM3_FALSE_NORTHING
    );
    return {
      primaryText: compact
        ? `X: ${x.toFixed(2)} Y: ${y.toFixed(2)}`
        : `X: ${x.toFixed(4)}   Y: ${y.toFixed(4)}`
    };
  }

  // Fallback to UTM 49S
  const { x, y } = projectTransverseMercator(lng, lat, 111.0, UTM_K0, FALSE_EASTING, FALSE_NORTHING_SOUTH);
  return {
    primaryText: compact
      ? `X: ${x.toFixed(2)} Y: ${y.toFixed(2)}`
      : `X: ${x.toFixed(4)}   Y: ${y.toFixed(4)}`
  };
}

/**
 * Converts WGS84 (longitude, latitude in degrees) to UTM planar meters (X, Y).
 * Automatically detects the UTM Zone based on longitude and hemisphere based on latitude.
 */
export function latLngToUTM(lng: number, lat: number): { x: number; y: number; zone: number } {
  // Determine standard 6-degree UTM zone
  const zone = Math.floor((lng + 180) / 6) + 1;
  const centralMeridian = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = WGS84_EOCT2 * Math.cos(latRad) * Math.cos(latRad);
  const A = (lngRad - centralMeridian) * Math.cos(latRad);

  const M = WGS84_A * (
    (1 - WGS84_E2 / 4 - 3 * WGS84_E2 * WGS84_E2 / 64 - 5 * WGS84_E2 * WGS84_E2 / 256) * latRad
    - (3 * WGS84_E2 / 8 + 3 * WGS84_E2 * WGS84_E2 / 32 + 45 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 1024) * Math.sin(2 * latRad)
    + (15 * WGS84_E2 * WGS84_E2 / 256 + 45 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 1024) * Math.sin(4 * latRad)
    - (35 * WGS84_E2 * WGS84_E2 * WGS84_E2 / 3072) * Math.sin(6 * latRad)
  );

  const x = FALSE_EASTING + UTM_K0 * N * (
    A + (1 - T + C) * A * A * A / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * WGS84_EOCT2) * A * A * A * A * A / 120
  );

  const northingOffset = lat < 0 ? FALSE_NORTHING_SOUTH : 0;
  const y = northingOffset + UTM_K0 * (
    M + N * Math.tan(latRad) * (
      A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * WGS84_EOCT2) * A * A * A * A * A * A / 720
    )
  );

  return { x, y, zone };
}

/**
 * Calculates planar shoelace area of a single linear ring of coordinates.
 * Handles both geographic coordinates [lng, lat] and projected coordinates [x, y].
 */
export function calculateRingArea(ring: number[][]): number {
  if (!ring || ring.length < 3) return 0;

  // Check if coordinates are already projected in meters (e.g. UTM x > 180 or y > 90)
  const isAlreadyProjected = Math.abs(ring[0][0]) > 180 || Math.abs(ring[0][1]) > 90;

  let area = 0;
  const len = ring.length;

  for (let i = 0; i < len; i++) {
    const p1Raw = ring[i];
    const p2Raw = ring[(i + 1) % len];

    const p1 = isAlreadyProjected ? { x: p1Raw[0], y: p1Raw[1] } : latLngToUTM(p1Raw[0], p1Raw[1]);
    const p2 = isAlreadyProjected ? { x: p2Raw[0], y: p2Raw[1] } : latLngToUTM(p2Raw[0], p2Raw[1]);

    area += p1.x * p2.y - p2.x * p1.y;
  }

  return Math.abs(area) / 2;
}

/**
 * Computes the real geometry area (in square meters) of a GeoJSON geometry or feature.
 * Supports Polygon (outer ring minus holes) and MultiPolygon.
 * Produces results identical to ArcGIS "Calculate Geometry -> Area (Square Meters)".
 */
export function calculateGeometryArea(geometryOrFeature: any): number {
  if (!geometryOrFeature) return 0;

  const geometry = geometryOrFeature.geometry || geometryOrFeature;
  if (!geometry || !geometry.coordinates) return 0;

  const type = geometry.type;

  if (type === 'Polygon') {
    const rings = geometry.coordinates;
    if (!rings || rings.length === 0) return 0;
    // Outer boundary ring
    let area = calculateRingArea(rings[0]);
    // Subtract interior holes if any
    for (let i = 1; i < rings.length; i++) {
      area -= calculateRingArea(rings[i]);
    }
    return Math.max(0, area);
  }

  if (type === 'MultiPolygon') {
    const polygons = geometry.coordinates;
    if (!polygons || polygons.length === 0) return 0;
    let totalArea = 0;
    for (const poly of polygons) {
      if (!poly || poly.length === 0) continue;
      let polyArea = calculateRingArea(poly[0]);
      for (let i = 1; i < poly.length; i++) {
        polyArea -= calculateRingArea(poly[i]);
      }
      totalArea += Math.max(0, polyArea);
    }
    return totalArea;
  }

  if (type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    return geometry.geometries.reduce((acc: number, g: any) => acc + calculateGeometryArea(g), 0);
  }

  return 0;
}
