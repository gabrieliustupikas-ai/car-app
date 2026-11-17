import { decodeInts, decodePolyline, encodeInts, encodePolyline } from './geo.ts';
import type { GeoPoint } from './types.ts';

/**
 * Compact track encoding for upload and storage (~10–14 bytes per fix instead of ~120 as JSON).
 * Every channel is delta-encoded with the polyline varint scheme:
 *   coords  : precision 1e-6 (≈ 11 cm)
 *   t       : 100 ms units relative to t0
 *   alt     : decimetres, NULL_SENTINEL when unknown
 *   acc     : metres (rounded), NULL_SENTINEL when unknown
 *   speed   : dm/s, NULL_SENTINEL when unknown
 */
export const NULL_SENTINEL = -32768;

export interface EncodedTrack {
  v: 1;
  t0: number;
  n: number;
  coords: string;
  t: string;
  alt: string;
  acc: string;
  speed: string;
  /** indexes of fixes reported as mocked by the OS */
  mocked: number[];
}

const enc = (x: number | null | undefined, scale: number) =>
  x == null || !Number.isFinite(x) || x < -3000 ? NULL_SENTINEL : Math.round(x * scale);
const dec = (x: number, scale: number) => (x === NULL_SENTINEL ? null : x / scale);

export function encodeTrack(points: readonly GeoPoint[]): EncodedTrack {
  const t0 = points[0]?.t ?? 0;
  return {
    v: 1,
    t0,
    n: points.length,
    coords: encodePolyline(points, 6),
    t: encodeInts(points.map((p) => Math.round((p.t - t0) / 100))),
    alt: encodeInts(points.map((p) => enc(p.alt, 10))),
    acc: encodeInts(points.map((p) => enc(p.acc, 1))),
    speed: encodeInts(points.map((p) => (p.speed == null || p.speed < 0 ? NULL_SENTINEL : Math.round(p.speed * 10)))),
    mocked: points.flatMap((p, i) => (p.mocked ? [i] : [])),
  };
}

export class TrackDecodeError extends Error {}

export function decodeTrack(track: EncodedTrack): GeoPoint[] {
  const coords = decodePolyline(track.coords, 6);
  const t = decodeInts(track.t);
  const alt = decodeInts(track.alt);
  const acc = decodeInts(track.acc);
  const speed = decodeInts(track.speed);
  const n = track.n;
  if ([coords.length, t.length, alt.length, acc.length, speed.length].some((len) => len !== n)) {
    throw new TrackDecodeError(`channel length mismatch (expected ${n})`);
  }
  const mocked = new Set(track.mocked);
  const out: GeoPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = coords[i]!;
    out[i] = {
      lat: c.lat,
      lng: c.lng,
      t: track.t0 + t[i]! * 100,
      alt: dec(alt[i]!, 10),
      acc: dec(acc[i]!, 1),
      speed: dec(speed[i]!, 10),
      ...(mocked.has(i) ? { mocked: true } : {}),
    };
  }
  return out;
}

/** Split a track into storage chunks (trip_points rows). */
export function chunkPoints<T>(points: readonly T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < points.length; i += size) out.push(points.slice(i, i + size));
  return out;
}
