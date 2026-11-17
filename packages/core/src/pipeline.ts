import { analyzeTrip, farmingMultiplier, type AntiCheatFlag, type Verdict } from './antiCheat.ts';
import { simplify } from './geo.ts';
import { hexesForRoute } from './hex.ts';
import { classifyMode, type ModeHints, type ModeResult } from './modeClassifier.ts';
import { computeTripStats } from './tripStats.ts';
import type { GeoPoint, TripStats } from './types.ts';
import { computeTripXp, type TripXpResult } from './xp.ts';

/** Everything the pipeline needs from storage. Implemented by Postgres (server) and SQLite (client preview). */
export interface TripContext {
  /** returns the subset of `cells` the user has NOT discovered yet */
  filterNewHexes(cells: string[]): Promise<string[]>;
  /** hex sets of the user's trips in the previous 24 h */
  recentRouteHexes(sinceMs: number): Promise<Set<string>[]>;
  /** km already credited for XP on the trip's local day */
  kmCreditedOnDay(dayStartMs: number): Promise<number>;
  modeHints?(points: GeoPoint[]): Promise<ModeHints>;
}

export interface ProcessedTrip {
  verdict: Verdict;
  flags: AntiCheatFlag[];
  mode: ModeResult;
  stats: TripStats;
  points: GeoPoint[];
  /** simplified route for map display (~5 m tolerance) */
  route: GeoPoint[];
  hexes: string[];
  newHexes: string[];
  xp: TripXpResult;
  farming: { multiplier: number; similarCount: number };
}

export interface ProcessOptions {
  isPassenger: boolean;
  now?: number;
  /** start of the trip's local day (epoch ms) */
  dayStartMs: number;
}

export async function processTrip(raw: readonly GeoPoint[], ctx: TripContext, opts: ProcessOptions): Promise<ProcessedTrip> {
  const ac = analyzeTrip(raw, opts.now);
  const points = ac.cleaned;
  const stats = computeTripStats(points);
  const hints = ctx.modeHints ? await ctx.modeHints(points) : {};
  const mode = classifyMode(points, hints);
  const hexes = hexesForRoute(points);
  const rejected = ac.verdict === 'rejected';
  const excluded = rejected || opts.isPassenger || mode.excludeFromXp;

  // Passenger/train/rejected trips never unlock exploration either.
  const newHexes = excluded ? [] : await ctx.filterNewHexes(hexes);
  const recent = excluded ? [] : await ctx.recentRouteHexes(stats.startedAt - 24 * 3600_000);
  const farming = farmingMultiplier(new Set(hexes), recent);
  const flags = [...ac.flags];
  if (farming.multiplier < 1) flags.push('repeated_route');
  const kmToday = excluded ? 0 : await ctx.kmCreditedOnDay(opts.dayStartMs);

  const xp = computeTripXp({
    distanceM: stats.distanceM,
    newHexCount: newHexes.length,
    kmCreditedToday: kmToday,
    isPassenger: opts.isPassenger,
    excludedByMode: mode.excludeFromXp,
    antiCheatVerdict: ac.verdict,
    farmingMultiplier: farming.multiplier,
  });

  const verdict: Verdict = ac.verdict === 'ok' && farming.multiplier < 1 ? 'flagged' : ac.verdict;
  return { verdict, flags, mode, stats, points, route: simplify(points, 5), hexes, newHexes, xp, farming };
}

/** Start of the local day for `t` in an IANA timezone, without external tz libraries. */
export function localDayStart(t: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(t));
    const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const offset = asUtc - Math.floor(t / 1000) * 1000;
    return Date.UTC(get('year'), get('month') - 1, get('day')) - offset;
  } catch {
    const d = new Date(t);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
}
