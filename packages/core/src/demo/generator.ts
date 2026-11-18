import { haversine, lerp } from '../geo.ts';
import type { GeoPoint } from '../types.ts';
import type { DemoRoute } from './routes.ts';

/** Deterministic PRNG (mulberry32) so demo data and tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  startAt: number;
  seed?: number;
  /** seconds between fixes */
  intervalS?: number;
  /** stationary seconds to add before and after the drive (to exercise trip detection) */
  idleS?: number;
}

/**
 * Generate a realistic 1 Hz GPS trace along a route: acceleration/braking near waypoints,
 * GPS noise (±3 m), accuracy jitter and smooth terrain altitude.
 */
export function generateTrip(route: DemoRoute, opts: GenerateOptions): GeoPoint[] {
  const rand = rng(opts.seed ?? 42);
  const dt = opts.intervalS ?? 1;
  const idle = opts.idleS ?? 0;
  const pts: GeoPoint[] = [];
  let t = opts.startAt;
  const jitter = (m: number) => (rand() - 0.5) * 2 * m;
  // gentle Baltic terrain: long, low hills (a few tens of metres over ~10 km)
  const altAt = (lat: number, lng: number) => 120 + 18 * Math.sin(lat * 60) + 12 * Math.cos(lng * 35);
  const push = (lat: number, lng: number, speed: number) => {
    const n = { lat: lat + jitter(3) / 111_320, lng: lng + jitter(3) / 70_000 };
    pts.push({ lat: n.lat, lng: n.lng, t, alt: altAt(lat, lng) + jitter(2), acc: Math.round(4 + rand() * 6), speed: Math.max(0, speed + jitter(0.4)) });
    t += dt * 1000;
  };
  const [lat0, lng0] = route.waypoints[0]!;
  for (let s = 0; s < idle; s += dt) push(lat0, lng0, 0);

  // Treat waypoints as a polyline (works for sparse waypoints and dense road geometry alike).
  const path = route.waypoints.map(([lat, lng]) => ({ lat, lng }));
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + haversine(path[i - 1]!, path[i]!));
  const total = cum[cum.length - 1]!;
  const segAt = (d: number) => {
    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid]! <= d) lo = mid; else hi = mid; }
    return lo;
  };
  const pointAt = (d: number) => {
    const i = segAt(Math.min(d, total));
    const len = cum[i + 1]! - cum[i]!;
    return lerp(path[i]!, path[i + 1]!, len > 0 ? (Math.min(d, total) - cum[i]!) / len : 0);
  };
  const bearing = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat);
  /** Safe speed for the road ahead: slow down for corners (heading change over the next ~60 m). */
  const cornerLimit = (d: number) => {
    const h1 = bearing(pointAt(d), pointAt(d + 15));
    const h2 = bearing(pointAt(d + 40), pointAt(d + 70));
    let turn = Math.abs(h2 - h1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const deg = (turn * 180) / Math.PI;
    return deg > 70 ? 5.5 : deg > 40 ? 8.5 : deg > 20 ? 12 : Infinity;
  };

  let pos = 0;
  let v = 0;
  let cruise = route.cruiseMs * (0.9 + rand() * 0.2);
  while (pos < total) {
    if (rand() < 0.01) cruise = route.cruiseMs * (0.9 + rand() * 0.2);
    const remaining = total - pos;
    const target = Math.min(cruise, cornerLimit(pos), remaining < 250 ? Math.max(3, remaining / 20) : Infinity);
    const accel = target > v ? 2.2 : -2.8; // gentle, legal driving
    v = Math.max(1.5, accel > 0 ? Math.min(target, v + accel * dt) : Math.max(target, v + accel * dt));
    pos = Math.min(total, pos + v * dt);
    const p = pointAt(pos);
    push(p.lat, p.lng, v);
  }
  // decelerate to stop at destination
  const last = route.waypoints[route.waypoints.length - 1]!;
  for (let s = 0; s < idle; s += dt) push(last[0], last[1], 0);
  return pts;
}
