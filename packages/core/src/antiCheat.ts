import { haversine } from './geo.ts';
import type { GeoPoint } from './types.ts';

/**
 * Server-authoritative trip validation. The client runs the same code for an instant preview,
 * but only the Edge Function result is trusted for XP.
 */
export type AntiCheatFlag =
  | 'mock_location'
  | 'teleport'
  | 'impossible_acceleration'
  | 'non_monotonic_time'
  | 'future_timestamp'
  | 'synthetic_pattern'
  | 'too_few_points'
  | 'low_accuracy'
  | 'repeated_route';

export type Verdict = 'ok' | 'flagged' | 'rejected';

export interface AntiCheatConfig {
  maxAccuracyM: number;
  /** implied speed above this between fixes is physically implausible for a car (m/s). 85 m/s ≈ 306 km/h */
  teleportSpeedMs: number;
  /** jumps shorter than this are treated as GPS noise rather than teleports */
  teleportMinJumpM: number;
  /** any single jump longer than this rejects the trip outright */
  hardTeleportM: number;
  /** |dv/dt| above this is beyond any road car (m/s²). 12 m/s² ≈ 1.2 g */
  maxAccelMs2: number;
  /** fraction of samples allowed over maxAccel (GPS speed noise) before rejection */
  maxAccelViolationRatio: number;
  clockSkewToleranceMs: number;
  minPoints: number;
}

export const DEFAULT_ANTICHEAT: AntiCheatConfig = {
  maxAccuracyM: 75,
  teleportSpeedMs: 85,
  teleportMinJumpM: 800,
  hardTeleportM: 20_000,
  maxAccelMs2: 12,
  maxAccelViolationRatio: 0.05,
  clockSkewToleranceMs: 5 * 60_000,
  minPoints: 10,
};

export interface AntiCheatResult {
  verdict: Verdict;
  flags: AntiCheatFlag[];
  /** points after accuracy filtering and single-point spike removal */
  cleaned: GeoPoint[];
  details: Record<string, number>;
}

/** Remove single-point GPS spikes: A → B → C where B is far from both A and C but A≈C. */
function removeSpikes(points: GeoPoint[]): GeoPoint[] {
  if (points.length < 3) return points;
  const out: GeoPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!, b = points[i]!, c = points[i + 1]!;
    const ab = haversine(a, b), bc = haversine(b, c), ac = haversine(a, c);
    if (ab > 300 && bc > 300 && ac < Math.min(ab, bc) * 0.3) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function analyzeTrip(raw: readonly GeoPoint[], now = Date.now(), cfg = DEFAULT_ANTICHEAT): AntiCheatResult {
  const flags = new Set<AntiCheatFlag>();
  const details: Record<string, number> = {};
  let rejected = false;

  const mockedCount = raw.filter((p) => p.mocked).length;
  if (mockedCount > 0) { flags.add('mock_location'); details.mockedPoints = mockedCount; rejected = true; }

  for (let i = 1; i < raw.length; i++) {
    if (raw[i]!.t <= raw[i - 1]!.t) { flags.add('non_monotonic_time'); rejected = true; break; }
  }
  if (raw.some((p) => p.t > now + cfg.clockSkewToleranceMs)) { flags.add('future_timestamp'); rejected = true; }

  const accurate = raw.filter((p) => p.acc == null || p.acc <= cfg.maxAccuracyM);
  if (raw.length > 0 && accurate.length / raw.length < 0.5) flags.add('low_accuracy');
  const cleaned = removeSpikes(accurate);
  details.spikesRemoved = accurate.length - cleaned.length;

  if (cleaned.length < cfg.minPoints) {
    flags.add('too_few_points');
    return { verdict: 'rejected', flags: [...flags], cleaned, details };
  }

  // Teleports
  let teleports = 0;
  let accelViolations = 0;
  let prevV: number | null = null;
  const intervals: number[] = [];
  for (let i = 1; i < cleaned.length; i++) {
    const a = cleaned[i - 1]!, b = cleaned[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    intervals.push(b.t - a.t);
    const d = haversine(a, b);
    const v = d / dt;
    if (d >= cfg.hardTeleportM) { flags.add('teleport'); rejected = true; teleports++; continue; }
    if (v > cfg.teleportSpeedMs && d > cfg.teleportMinJumpM) { teleports++; flags.add('teleport'); }
    // acceleration only over short, dense intervals (long gaps say nothing about accel)
    if (prevV != null && dt <= 5) {
      const accel = Math.abs(v - prevV) / dt;
      if (accel > cfg.maxAccelMs2) accelViolations++;
    }
    prevV = dt <= 5 ? v : null;
  }
  details.teleports = teleports;
  details.accelViolations = accelViolations;
  if (teleports > 2) rejected = true;
  const accelRatio = accelViolations / Math.max(1, cleaned.length - 2);
  details.accelViolationRatio = Number(accelRatio.toFixed(4));
  if (accelRatio > cfg.maxAccelViolationRatio) { flags.add('impossible_acceleration'); rejected = true; }

  // Synthetic pattern: spoofing tools often emit perfectly regular timestamps, identical accuracy
  // and constant speed. Real GPS always has jitter in at least one of these.
  if (cleaned.length >= 60) {
    const meanI = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const varI = intervals.reduce((s, x) => s + (x - meanI) ** 2, 0) / intervals.length;
    const accs = cleaned.map((p) => p.acc).filter((x): x is number => x != null);
    const accVaries = new Set(accs).size > 1;
    const speeds = cleaned.map((p) => p.speed).filter((x): x is number => x != null && x >= 0);
    const speedVaries = new Set(speeds.map((s) => s.toFixed(2))).size > 3;
    const altVaries = new Set(cleaned.map((p) => p.alt ?? 0)).size > 1;
    if (varI < 1 && !accVaries && !speedVaries && !altVaries) { flags.add('synthetic_pattern'); rejected = true; }
  }

  const verdict: Verdict = rejected ? 'rejected' : flags.size > 0 ? 'flagged' : 'ok';
  return { verdict, flags: [...flags], cleaned, details };
}

/* ---------- Repeated-route farming ---------- */

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const FARMING_SIMILARITY = 0.85;

/**
 * Distance-XP multiplier for routes that repeat a recent trip. Commuting is legitimate, so the
 * first two repeats in 24 h earn full XP; after that it decays hard so looping a block earns ~nothing.
 */
export function farmingMultiplier(routeHexes: ReadonlySet<string>, recentRoutes: readonly ReadonlySet<string>[]): {
  multiplier: number;
  similarCount: number;
} {
  let similarCount = 0;
  for (const r of recentRoutes) if (jaccard(routeHexes, r) >= FARMING_SIMILARITY) similarCount++;
  const multiplier = similarCount < 2 ? 1 : similarCount < 4 ? 0.25 : 0.05;
  return { multiplier, similarCount };
}
