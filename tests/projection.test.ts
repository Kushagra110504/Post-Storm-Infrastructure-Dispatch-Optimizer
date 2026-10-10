import { describe, it, expect } from 'vitest';
import { projectLatLon, unprojectXY, computeBBox } from '../src/core/graph/projection';
import { haversineDistance } from '../src/core/graph/haversine';

describe('Equirectangular Projection', () => {
  const minLat = 26.89;
  const minLon = 75.79;
  const maxLat = 26.94;
  const maxLon = 75.84;

  it('projects top-left bbox corner to (0, 0)', () => {
    const pt = projectLatLon(maxLat, minLon, minLat, minLon, maxLat, maxLon);
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(0);
  });

  it('projects bottom-right corner to positive (maxX, maxY)', () => {
    const pt = projectLatLon(minLat, maxLon, minLat, minLon, maxLat, maxLon);
    expect(pt.x).toBeGreaterThan(4000); // ~5 km width
    expect(pt.y).toBeGreaterThan(4000); // ~5.5 km height
  });

  it('computes correct BBox dimensions in meters', () => {
    const bbox = computeBBox(minLat, minLon, maxLat, maxLon);
    expect(bbox.minX).toBe(0);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxX).toBeGreaterThan(4500);
    expect(bbox.maxY).toBeGreaterThan(5000);
    expect(bbox.minLat).toBe(minLat);
    expect(bbox.maxLat).toBe(maxLat);
  });

  it('unprojects (x, y) back to original (lat, lon) within micro-degree tolerance', () => {
    const testCases = [
      { lat: 26.9124, lon: 75.8012 },
      { lat: 26.9001, lon: 75.8234 },
      { lat: 26.9388, lon: 75.8391 },
      { lat: maxLat, lon: minLon },
      { lat: minLat, lon: maxLon },
    ];

    for (const tc of testCases) {
      const proj = projectLatLon(tc.lat, tc.lon, minLat, minLon, maxLat, maxLon);
      const unproj = unprojectXY(proj.x, proj.y, minLat, minLon, maxLat);
      expect(unproj.lat).toBeCloseTo(tc.lat, 4);
      expect(unproj.lon).toBeCloseTo(tc.lon, 4);
    }
  });

  it('projected Euclidean distance closely matches Haversine distance', () => {
    const lat1 = 26.91;
    const lon1 = 75.81;
    const lat2 = 26.92;
    const lon2 = 75.82;

    const p1 = projectLatLon(lat1, lon1, minLat, minLon, maxLat, maxLon);
    const p2 = projectLatLon(lat2, lon2, minLat, minLon, maxLat, maxLon);

    const euclideanDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const haversineDist = haversineDistance(lat1, lon1, lat2, lon2);

    // Within 1% difference for a ~1.5 km span
    const relativeDiff = Math.abs(euclideanDist - haversineDist) / haversineDist;
    expect(relativeDiff).toBeLessThan(0.01);
  });
});
