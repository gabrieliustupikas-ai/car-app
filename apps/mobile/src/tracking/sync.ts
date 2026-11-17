import { encodeTrack, TripIngestResponseSchema, type TripUpload } from '@roadclub/core';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { Platform } from 'react-native';
import * as local from '@/db/localDb';
import { deviceTimezone } from '@/lib/format';
import { queryClient, qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { createMutex } from './mutex';

/**
 * Upload queue. Trips are always saved locally first; this pushes them to the trip-ingest Edge
 * Function with exponential backoff and replaces the local XP preview with the server's result.
 * Idempotent: the server dedupes on client_trip_id, so retries after a timeout are safe.
 */
const exclusive = createMutex();
const MAX_BACKOFF_MS = 6 * 3600_000;
let scheduled: ReturnType<typeof setTimeout> | null = null;

export function requestSync(delayMs = 1500) {
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => { scheduled = null; void syncPendingTrips(); }, delayMs);
}

function backoff(attempts: number) {
  return Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** attempts);
}

async function httpStatus(e: unknown): Promise<number | null> {
  const ctx = (e as { context?: Response })?.context;
  return ctx && typeof ctx.status === 'number' ? ctx.status : null;
}

export function syncPendingTrips(): Promise<{ synced: number; failed: number }> {
  return exclusive(async () => {
    const result = { synced: 0, failed: 0 };
    if (!supabase) return result;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return result;
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.isInternetReachable === false) return result;

    for (const trip of await local.tripsDueForSync()) {
      const points = await local.getTripPoints(trip.clientTripId);
      if (points.length < 2) {
        await local.updateTrip(trip.clientTripId, { syncStatus: 'failed', lastError: 'no_points', nextAttemptAt: Number.MAX_SAFE_INTEGER });
        continue;
      }
      const body: TripUpload = {
        clientTripId: trip.clientTripId,
        carId: trip.carId,
        startedAt: points[0]!.t,
        endedAt: points[points.length - 1]!.t,
        isPassenger: trip.isPassenger,
        manual: trip.manual,
        timezone: deviceTimezone(),
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
        track: encodeTrack(points),
      };
      try {
        const { data, error } = await supabase.functions.invoke('trip-ingest', { body });
        if (error) throw error;
        const res = TripIngestResponseSchema.parse(data);
        await local.updateTrip(trip.clientTripId, {
          serverId: res.tripId,
          xpTotal: res.xp.total,
          xpLines: res.xp.lines.map((l) => ({ ...l, source: l.source as never })),
          xpWithheld: res.xp.withheldReason ?? null,
          xpConfirmed: true,
          verdict: res.verdict,
          flags: res.flags,
          mode: res.mode,
          newHexes: res.newHexes,
          syncStatus: 'synced',
          lastError: null,
        });
        // raw fixes now live on the server (and expire there per retention); free local space
        await local.deleteTripPoints(trip.clientTripId);
        result.synced++;
        telemetry.track('trip_synced', { xp: res.xp.total });
      } catch (e) {
        const status = await httpStatus(e);
        const permanent = status != null && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
        await local.updateTrip(trip.clientTripId, {
          syncStatus: 'failed',
          attempts: trip.attempts + 1,
          nextAttemptAt: Date.now() + (permanent ? 24 * 3600_000 : backoff(trip.attempts)),
          lastError: status ? `http_${status}` : String((e as Error)?.message ?? e).slice(0, 120),
        });
        result.failed++;
        telemetry.track('trip_sync_failed', { status: status ?? 0 });
      }
    }
    if (result.synced || result.failed) {
      void queryClient.invalidateQueries({ queryKey: qk.trips });
      void queryClient.invalidateQueries({ queryKey: qk.progress });
    }
    return result;
  });
}

/** After sign-in on a new device: pull recent server trips into the local cache. */
export async function pullRemoteTrips(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('trips_api')
    .select('id, client_trip_id, car_id, started_at, ended_at, distance_m, duration_s, moving_time_s, elevation_gain_m, mode, verdict, flags, is_passenger, manual, xp_total, new_hexes, route_geojson')
    .order('started_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const { encodePolyline } = await import('@roadclub/core');
  let n = 0;
  for (const r of data ?? []) {
    const existing = await local.getTrip(r.client_trip_id);
    if (existing && existing.syncStatus !== 'synced') continue;
    const coords = ((r.route_geojson as { coordinates?: [number, number][] } | null)?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
    await local.upsertTrip({
      clientTripId: r.client_trip_id, serverId: r.id, startedAt: Date.parse(r.started_at), endedAt: Date.parse(r.ended_at),
      distanceM: r.distance_m, durationS: r.duration_s, movingTimeS: r.moving_time_s, elevationGainM: r.elevation_gain_m,
      route: encodePolyline(coords, 6), routeHexes: existing?.routeHexes ?? [], xpTotal: r.xp_total, xpLines: existing?.xpLines ?? [],
      xpWithheld: null, xpConfirmed: true, creditedKm: existing?.creditedKm ?? 0, newHexes: r.new_hexes, verdict: r.verdict,
      flags: r.flags ?? [], mode: r.mode, isPassenger: r.is_passenger, manual: r.manual, carId: r.car_id, syncStatus: 'synced',
      attempts: 0, nextAttemptAt: 0, lastError: null, isDemo: false, createdAt: Date.now(),
    });
    n++;
  }
  void queryClient.invalidateQueries({ queryKey: qk.trips });
  return n;
}
