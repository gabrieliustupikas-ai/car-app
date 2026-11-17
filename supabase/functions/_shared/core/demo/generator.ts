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

  for (let w = 1; w < route.waypoints.length; w++) {
    const a = { lat: route.waypoints[w - 1]![0], lng: route.waypoints[w - 1]![1] };
    const b = { lat: route.waypoints[w]![0], lng: route.waypoints[w]![1] };
    const legM = haversine(a, b);
    let pos = 0;
    let v = w === 1 ? 0 : route.cruiseMs * 0.6;
    while (pos < legM) {
      const remaining = legM - pos;
      const target = remaining < 250 ? route.cruiseMs * 0.45 : route.cruiseMs * (0.9 + rand() * 0.2);
      const accel = target > v ? 2.2 : -2.8; // gentle, legal driving
      v = Math.max(1.5, accel > 0 ? Math.min(target, v + accel * dt) : Math.max(target, v + accel * dt));
      pos = Math.min(legM, pos + v * dt);
      const p = lerp(a, b, pos / legM);
      push(p.lat, p.lng, v);
    }
  }
  // decelerate to stop at destination
  const last = route.waypoints[route.waypoints.length - 1]!;
  for (let s = 0; s < idle; s += dt) push(last[0], last[1], 0);
  return pts;
}
