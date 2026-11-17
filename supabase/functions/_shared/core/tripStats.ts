import { haversine } from './geo.ts';
import type { GeoPoint, TripStats } from './types.ts';

export const MOVING_SPEED_MS = 1.0;

/** Speed for segment i-1 → i, preferring the OS-reported Doppler speed when present. */
export function segmentSpeed(prev: GeoPoint, cur: GeoPoint): number {
  if (cur.speed != null && cur.speed >= 0) return cur.speed;
  const dt = (cur.t - prev.t) / 1000;
  if (dt <= 0) return 0;
  return haversine(prev, cur) / dt;
}

/**
 * Elevation gain/loss with a moving-average filter plus a hysteresis threshold,
 * because raw GPS altitude is noisy (±10 m) and would massively overstate climbing.
 */
export function elevationProfile(points: readonly GeoPoint[], window = 5, thresholdM = 3) {
  const alts = points.map((p) => p.alt).filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
  if (alts.length < 2) return { gain: 0, loss: 0, max: alts[0] ?? null, min: alts[0] ?? null };
  const smooth: number[] = [];
  let sum = 0;
  for (let i = 0; i < alts.length; i++) {
    sum += alts[i]!;
    if (i >= window) sum -= alts[i - window]!;
    smooth.push(sum / Math.min(i + 1, window));
  }
  let gain = 0, loss = 0;
  let anchor = smooth[0]!;
  for (const a of smooth) {
    const diff = a - anchor;
    if (diff >= thresholdM) { gain += diff; anchor = a; }
    else if (diff <= -thresholdM) { loss -= diff; anchor = a; }
  }
  return { gain, loss, max: Math.max(...smooth), min: Math.min(...smooth) };
}

export function computeTripStats(points: readonly GeoPoint[]): TripStats {
  if (points.length === 0) {
    return { distanceM: 0, durationS: 0, movingTimeS: 0, elevationGainM: 0, elevationLossM: 0,
      maxAltitudeM: null, minAltitudeM: null, startedAt: 0, endedAt: 0, pointCount: 0 };
  }
  let distanceM = 0;
  let movingMs = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    distanceM += haversine(a, b);
    const dt = b.t - a.t;
    // gaps longer than 2 min are not counted as moving time even if positions differ
    if (dt > 0 && dt < 120_000 && segmentSpeed(a, b) >= MOVING_SPEED_MS) movingMs += dt;
  }
  const elev = elevationProfile(points);
  const first = points[0]!, last = points[points.length - 1]!;
  return {
    distanceM,
    durationS: Math.round((last.t - first.t) / 1000),
    movingTimeS: Math.round(movingMs / 1000),
    elevationGainM: Math.round(elev.gain),
    elevationLossM: Math.round(elev.loss),
    maxAltitudeM: elev.max == null ? null : Math.round(elev.max),
    minAltitudeM: elev.min == null ? null : Math.round(elev.min),
    startedAt: first.t,
    endedAt: last.t,
    pointCount: points.length,
  };
}
