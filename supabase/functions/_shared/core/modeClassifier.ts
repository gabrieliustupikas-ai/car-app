import { haversine } from './geo.ts';
import { segmentSpeed } from './tripStats.ts';
import type { GeoPoint, TransportMode } from './types.ts';

export interface ModeResult {
  mode: TransportMode;
  /** 0..1 */
  confidence: number;
  /** true when XP must not be awarded */
  excludeFromXp: boolean;
  reasons: string[];
}

export interface ModeHints {
  /** fraction of points within ~30 m of a railway line (computed server-side in PostGIS when rail data is loaded) */
  nearRailFraction?: number;
  /** fraction of stops that occurred at known bus stops */
  stopsAtBusStopsFraction?: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx]!;
}

/**
 * Heuristic transport-mode classifier. Deliberately conservative: only excludes XP when confident.
 * The user can always self-declare "I was a passenger".
 */
export function classifyMode(points: readonly GeoPoint[], hints: ModeHints = {}): ModeResult {
  const reasons: string[] = [];
  if (points.length < 5) return { mode: 'unknown', confidence: 0, excludeFromXp: false, reasons };

  const speeds: number[] = [];
  let sustainedFastMs = 0;
  let stops = 0;
  let inStop = false;
  let stopStart = 0;
  const dwellTimes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const v = segmentSpeed(a, b);
    speeds.push(v);
    const dt = b.t - a.t;
    if (v > 44 && dt < 30_000) sustainedFastMs += dt; // > ~160 km/h
    if (v < 1) {
      if (!inStop) { inStop = true; stopStart = a.t; }
    } else if (inStop) {
      inStop = false;
      const dwell = b.t - stopStart;
      if (dwell > 8_000) { stops++; dwellTimes.push(dwell); }
    }
  }
  const sorted = [...speeds].sort((x, y) => x - y);
  const p85 = percentile(sorted, 0.85);
  const max = percentile(sorted, 0.99);
  const maxAlt = Math.max(...points.map((p) => p.alt ?? 0));
  const dist = haversine(points[0]!, points[points.length - 1]!);
  let path = 0;
  for (let i = 1; i < points.length; i++) path += haversine(points[i - 1]!, points[i]!);
  const straightness = path > 0 ? dist / path : 0;

  if (max > 70 || maxAlt > 2_500) {
    reasons.push(max > 70 ? 'speed>250kmh' : 'altitude>2500m');
    return { mode: 'plane', confidence: 0.95, excludeFromXp: true, reasons };
  }
  if (p85 < 3 && max < 7) {
    reasons.push('walking-speed');
    return { mode: 'walk', confidence: 0.85, excludeFromXp: true, reasons };
  }
  if ((hints.nearRailFraction ?? 0) > 0.85) {
    reasons.push('follows-railway');
    return { mode: 'train', confidence: 0.9, excludeFromXp: true, reasons };
  }
  if (sustainedFastMs > 5 * 60_000 && straightness > 0.8) {
    // No public road in the Baltics allows > 160 km/h for 5 minutes; most likely a train.
    reasons.push('sustained>160kmh', 'straight');
    return { mode: 'train', confidence: 0.75, excludeFromXp: true, reasons };
  }
  const km = path / 1000;
  const stopsPerKm = km > 0 ? stops / km : 0;
  const medianDwell = percentile([...dwellTimes].sort((a, b) => a - b), 0.5);
  if ((hints.stopsAtBusStopsFraction ?? 0) > 0.7 && stopsPerKm > 1.2) {
    reasons.push('stops-at-bus-stops');
    return { mode: 'bus', confidence: 0.85, excludeFromXp: true, reasons };
  }
  if (stopsPerKm > 1.5 && medianDwell > 15_000 && medianDwell < 60_000 && p85 < 14) {
    reasons.push('regular-dwell-stops');
    // Not confident enough to exclude without bus-stop data; flag only.
    return { mode: 'bus', confidence: 0.55, excludeFromXp: false, reasons };
  }
  return { mode: 'car', confidence: 0.8, excludeFromXp: false, reasons };
}
