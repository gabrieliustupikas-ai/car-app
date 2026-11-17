import type { GeoPoint } from './types.ts';

const R = 6_371_008.8; // mean Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLength(points: readonly { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1]!, points[i]!);
  return d;
}

/** Linear interpolation between two coordinates (good enough below ~10 km). */
export function lerp(a: { lat: number; lng: number }, b: { lat: number; lng: number }, f: number) {
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

/* ---------- Google encoded polyline (precision 5 or 6) ---------- */

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

/** Encode a list of integers as delta-encoded polyline chars (used for coords, timestamps, altitudes). */
export function encodeInts(values: readonly number[]): string {
  let prev = 0;
  let out = '';
  for (const v of values) {
    out += encodeSigned(v - prev);
    prev = v;
  }
  return out;
}

export function decodeInts(str: string): number[] {
  const raw = decodeIntsRaw(str);
  let acc = 0;
  return raw.map((d) => (acc += d));
}

export function encodePolyline(coords: readonly { lat: number; lng: number }[], precision = 6): string {
  const f = 10 ** precision;
  let pLat = 0;
  let pLng = 0;
  let out = '';
  for (const c of coords) {
    const lat = Math.round(c.lat * f);
    const lng = Math.round(c.lng * f);
    out += encodeSigned(lat - pLat) + encodeSigned(lng - pLng);
    pLat = lat;
    pLng = lng;
  }
  return out;
}

export function decodePolyline(str: string, precision = 6): { lat: number; lng: number }[] {
  const ints = decodeIntsRaw(str);
  const f = 10 ** precision;
  const out: { lat: number; lng: number }[] = [];
  let lat = 0;
  let lng = 0;
  for (let i = 0; i + 1 < ints.length; i += 2) {
    lat += ints[i]!;
    lng += ints[i + 1]!;
    out.push({ lat: lat / f, lng: lng / f });
  }
  return out;
}

/** Decode raw (non-accumulated) signed varints. */
function decodeIntsRaw(str: string): number[] {
  const out: number[] = [];
  let index = 0;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    out.push(result & 1 ? ~(result >> 1) : result >> 1);
  }
  return out;
}

/* ---------- Douglas–Peucker simplification (planar approximation in metres) ---------- */

function perpendicularDistance(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const kx = Math.cos(toRad(a.lat)) * 111_320;
  const ky = 110_540;
  const ax = a.lng * kx, ay = a.lat * ky;
  const bx = b.lng * kx, by = b.lat * ky;
  const px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Iterative Douglas–Peucker (no recursion → safe for 100k+ points). */
export function simplify<T extends GeoPoint>(points: readonly T[], toleranceM: number): T[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistance(points[i]!, points[s]!, points[e]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export function bbox(points: readonly { lat: number; lng: number }[]) {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}
