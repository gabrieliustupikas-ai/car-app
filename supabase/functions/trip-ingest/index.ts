// Supabase Edge Function: trip-ingest
// Receives an encoded trip from the app, re-runs anti-cheat + transport-mode + exploration + XP with the
// shared core (server-authoritative), and stores everything atomically via public.ingest_trip().
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  chunkPoints, encodeTrack, ingestTrip, IngestError, regionOf, XP_RULES,
  type IngestStore, type ProcessedTrip, type TripIngestResponse, type TripUpload,
} from '../_shared/core/index.ts';
import { corsHeaders, json, requireEnv } from '../_shared/http.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const MAX_BODY_BYTES = 6_000_000;
const MAX_UPLOADS_PER_HOUR = 60;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function isoDay(ms: number, tz: string): string {
  const fmt = (timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  try { return fmt(tz); } catch { return fmt('Europe/Vilnius'); }
}

class PostgresStore implements IngestStore {
  #day: string;
  constructor(private db: SupabaseClient, private userId: string, private upload: { startedAt: number; timezone: string }) {
    this.#day = isoDay(upload.startedAt, upload.timezone);
  }

  async #ctx(cells: string[], sinceMs: number) {
    const { data, error } = await this.db.rpc('trip_context', {
      p_user: this.userId, p_cells: cells, p_since: new Date(sinceMs).toISOString(), p_day: this.#day,
    });
    if (error) throw error;
    return data as { new_hexes: string[]; recent_routes: string[][]; km_today: number };
  }
  async filterNewHexes(cells: string[]) { return cells.length ? (await this.#ctx(cells, Date.now())).new_hexes : []; }
  async recentRouteHexes(sinceMs: number) { return (await this.#ctx([], sinceMs)).recent_routes.map((r) => new Set(r)); }
  async kmCreditedOnDay(_dayStartMs: number) { return Number((await this.#ctx([], Date.now())).km_today); }

  async findTripByClientId(clientTripId: string) {
    const { data } = await this.db.from('trips')
      .select('id, verdict, flags, mode, distance_m, duration_s, moving_time_s, elevation_gain_m, new_hexes, xp_total')
      .eq('user_id', this.userId).eq('client_trip_id', clientTripId).maybeSingle();
    if (!data) return null;
    const { data: p } = await this.db.from('profiles').select('total_xp, level').eq('id', this.userId).single();
    const { data: lines } = await this.db.from('xp_events').select('source, amount, meta').eq('trip_id', data.id);
    const response: TripIngestResponse = {
      tripId: data.id, duplicate: true, verdict: data.verdict, flags: data.flags, mode: data.mode,
      stats: { distanceM: data.distance_m, durationS: data.duration_s, movingTimeS: data.moving_time_s, elevationGainM: data.elevation_gain_m },
      newHexes: data.new_hexes,
      xp: { total: data.xp_total, lines: lines ?? [] },
      profile: { totalXp: Number(p?.total_xp ?? 0), level: p?.level ?? 1 },
    };
    return { tripId: data.id, response };
  }

  async saveTrip(u: TripUpload, t: ProcessedTrip) {
    const counts = t.newHexes.length > 0 || (t.verdict !== 'rejected' && !u.isPassenger && !t.mode.excludeFromXp);
    const chunks = chunkPoints(t.points, 1000).map((pts, seq) => ({ seq, started_at: pts[0]!.t, n: pts.length, track: encodeTrack(pts) }));
    const p = {
      client_trip_id: u.clientTripId, car_id: u.carId,
      started_at: t.stats.startedAt || u.startedAt, ended_at: t.stats.endedAt || u.endedAt,
      local_day: this.#day, timezone: u.timezone,
      distance_m: Math.round(t.stats.distanceM), duration_s: t.stats.durationS, moving_time_s: t.stats.movingTimeS,
      elevation_gain_m: t.stats.elevationGainM, elevation_loss_m: t.stats.elevationLossM, point_count: t.stats.pointCount,
      route_geojson: { type: 'LineString', coordinates: t.route.map((q) => [Number(q.lng.toFixed(6)), Number(q.lat.toFixed(6))]) },
      mode: t.mode.mode, mode_confidence: t.mode.confidence, verdict: t.verdict, flags: t.flags,
      is_passenger: u.isPassenger, manual: u.manual, credited_km: t.xp.creditedKm,
      platform: u.platform, app_version: u.appVersion,
      count_exploration: counts, hexes: t.hexes, hex_regions: t.hexes.map((h) => regionOf(h)),
      chunks, xp_lines: t.xp.lines, xp_per_hex: XP_RULES.newHex, hex_cap: XP_RULES.newHexPerTripCap,
    };
    const { data, error } = await this.db.rpc('ingest_trip', { p_user: this.userId, p });
    if (error) throw error;
    return { tripId: data.trip_id as string, totalXp: Number(data.total_xp), xpTotal: data.xp_total as number | undefined, newHexes: data.new_hexes as number | undefined };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);

  // Rate limit (per user, sliding hour) — protects against scripted farming and abuse.
  const { count } = await admin.from('trips').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= MAX_UPLOADS_PER_HOUR) return json({ error: 'rate_limited' }, 429);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const b = body as { startedAt?: number; timezone?: string };
  const store = new PostgresStore(admin, user.id, {
    startedAt: typeof b?.startedAt === 'number' ? b.startedAt : Date.now(),
    timezone: typeof b?.timezone === 'string' ? b.timezone : 'Europe/Vilnius',
  });

  try {
    const result = await ingestTrip(body, store);
    return json(result, result.duplicate ? 200 : 201);
  } catch (e) {
    if (e instanceof IngestError) return json({ error: e.code, message: e.message }, e.status);
    console.error('trip-ingest failed', e);
    return json({ error: 'internal' }, 500);
  }
});
