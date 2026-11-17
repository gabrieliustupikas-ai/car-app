import { latLngToCell, cellToParent } from 'h3-js';
import { haversine, lerp } from './geo.ts';

/** Resolution used for fog-of-war exploration (~0.74 km² cells, ~460 m edge). */
export const EXPLORE_RES = 8;
/** Resolution used for regional statistics (~36 km² cells). */
export const REGION_RES = 6;

/**
 * Every res-8 cell a route passes through. Segments are densified every `stepM` metres so that a
 * long gap between fixes (tunnels, highway sampling) doesn't skip cells.
 */
export function hexesForRoute(points: readonly { lat: number; lng: number }[], res = EXPLORE_RES, stepM = 150): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (lat: number, lng: number) => {
    const c = latLngToCell(lat, lng, res);
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  };
  if (points.length === 0) return out;
  add(points[0]!.lat, points[0]!.lng);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const d = haversine(a, b);
    // don't densify across huge gaps — we don't know where the car went
    if (d > stepM && d < 5_000) {
      const n = Math.ceil(d / stepM);
      for (let k = 1; k < n; k++) { const p = lerp(a, b, k / n); add(p.lat, p.lng); }
    }
    add(b.lat, b.lng);
  }
  return out;
}

export function regionOf(cell: string, res = REGION_RES): string {
  return cellToParent(cell, res);
}
