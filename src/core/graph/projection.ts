import { BBox } from '../model/schema';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Projects (lat, lon) to a 2D plane (x, y in meters from top-left bbox corner)
 * using equirectangular projection.
 */
export function projectLatLon(
  lat: number,
  lon: number,
  minLat: number,
  minLon: number,
  maxLat: number,
  _maxLon: number,
): { x: number; y: number } {
  const toRad = Math.PI / 180;
  const lat0 = ((minLat + maxLat) / 2) * toRad;
  const x = (lon - minLon) * toRad * Math.cos(lat0) * EARTH_RADIUS_METERS;
  const y = (maxLat - lat) * toRad * EARTH_RADIUS_METERS;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

/**
 * Computes bounding box dimensions and bounds in meters.
 */
export function computeBBox(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
): BBox {
  const topLeft = projectLatLon(maxLat, minLon, minLat, minLon, maxLat, maxLon);
  const bottomRight = projectLatLon(minLat, maxLon, minLat, minLon, maxLat, maxLon);

  return {
    minLat,
    minLon,
    maxLat,
    maxLon,
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y,
  };
}
