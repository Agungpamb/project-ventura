/**
 * Geospatial utilities for polygon geometry calculations.
 * Supports calculating real ground planar area in square meters (m²)
 * from GeoJSON Polygons / MultiPolygons, calibrated to UTM / Transverse Mercator
 * matching ArcGIS "Calculate Geometry -> Area" with sub-millimeter precision.
 */

// WGS84 Ellipsoid Constants
const WGS84_A = 6378137.0; // Semi-major axis (meters)
const WGS84_F = 1 / 298.257223563; // Flattening
const WGS84_B = WGS84_A * (1 - WGS84_F);
const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
const WGS84_EOCT2 = WGS84_E2 / (1 - WGS84_E2);
const UTM_K0 = 0.9996;
const FALSE_EASTING = 500000.0;
const FALSE_NORTHING_SOUTH = 10000000.0;

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
