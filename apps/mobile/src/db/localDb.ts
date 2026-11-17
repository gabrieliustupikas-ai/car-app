/**
 * Offline-first local store (expo-sqlite). Trips are recorded and processed here first and synced
 * later; the server is authoritative for XP once a trip is synced.
 */
import * as SQLite from 'expo-sqlite';
import type { DetectionState, GeoPoint, XpLine } from '@roadclub/core';

let db: SQLite.SQLiteDatabase | null = null;

const MIGRATIONS: string[] = [
  `
  create table if not exists detector (id integer primary key check (id = 1), state text not null);
  create table if not exists active_trip (
    id integer primary key check (id = 1), client_trip_id text not null, started_at integer not null,
    manual integer not null default 0, car_id text, is_demo integer not null default 0);
  create table if not exists points (
    id integer primary key autoincrement, client_trip_id text not null, t integer not null,
    lat real not null, lng real not null, alt real, acc real, speed real, mocked integer not null default 0);
  create index if not exists points_trip_idx on points (client_trip_id, t);
  create table if not exists trips (
    client_trip_id text primary key, server_id text,
    started_at integer not null, ended_at integer not null,
    distance_m real not null, duration_s integer not null, moving_time_s integer not null, elevation_gain_m integer not null,
    route text not null, route_hexes text not null default '[]',
    xp_total integer not null default 0, xp_lines text not null default '[]', xp_withheld text, xp_confirmed integer not null default 0,
    credited_km real not null default 0, new_hexes integer not null default 0,
    verdict text not null, flags text not null default '[]', mode text not null,
    is_passenger integer not null default 0, manual integer not null default 0, car_id text,
    sync_status text not null default 'pending', attempts integer not null default 0, next_attempt_at integer not null default 0,
    last_error text, is_demo integer not null default 0, created_at integer not null);
  create index if not exists trips_started_idx on trips (started_at desc);
  create index if not exists trips_sync_idx on trips (sync_status, next_attempt_at);
  create table if not exists hexes (h3 text primary key, first_seen_at integer not null);
  `,
];

export function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync('roadclub.db');
  db.execSync('pragma journal_mode = wal; pragma foreign_keys = on;');
  const row = db.getFirstSync<{ user_version: number }>('pragma user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db!.execSync(MIGRATIONS[v]!);
      db!.execSync(`pragma user_version = ${v + 1}`);
    });
  }
  return db;
}

/* ---------------- detector & active trip ---------------- */

export async function loadDetectorState(): Promise<DetectionState | null> {
  const r = await getDb().getFirstAsync<{ state: string }>('select state from detector where id = 1');
  return r ? (JSON.parse(r.state) as DetectionState) : null;
}

export async function saveDetectorState(s: DetectionState): Promise<void> {
  await getDb().runAsync('insert into detector (id, state) values (1, ?) on conflict (id) do update set state = excluded.state', JSON.stringify(s));
}

export interface ActiveTrip { clientTripId: string; startedAt: number; manual: boolean; carId: string | null; isDemo: boolean }

export async function getActiveTrip(): Promise<ActiveTrip | null> {
  const r = await getDb().getFirstAsync<{ client_trip_id: string; started_at: number; manual: number; car_id: string | null; is_demo: number }>(
    'select * from active_trip where id = 1');
  return r ? { clientTripId: r.client_trip_id, startedAt: r.started_at, manual: !!r.manual, carId: r.car_id, isDemo: !!r.is_demo } : null;
}

export async function setActiveTrip(a: ActiveTrip): Promise<void> {
  await getDb().runAsync(
    'insert or replace into active_trip (id, client_trip_id, started_at, manual, car_id, is_demo) values (1, ?, ?, ?, ?, ?)',
    a.clientTripId, a.startedAt, a.manual ? 1 : 0, a.carId, a.isDemo ? 1 : 0);
}

export async function clearActiveTrip(): Promise<void> {
  await getDb().runAsync('delete from active_trip where id = 1');
}

/* ---------------- raw points ---------------- */

export async function appendPoints(tripId: string, pts: readonly GeoPoint[]): Promise<void> {
  if (pts.length === 0) return;
  const d = getDb();
  await d.withTransactionAsync(async () => {
    for (let i = 0; i < pts.length; i += 100) {
      const batch = pts.slice(i, i + 100);
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params = batch.flatMap((p) => [tripId, p.t, p.lat, p.lng, p.alt ?? null, p.acc ?? null, p.speed ?? null, p.mocked ? 1 : 0]);
      await d.runAsync(`insert into points (client_trip_id, t, lat, lng, alt, acc, speed, mocked) values ${placeholders}`, params);
    }
  });
}

export async function getTripPoints(tripId: string): Promise<GeoPoint[]> {
  const rows = await getDb().getAllAsync<{ t: number; lat: number; lng: number; alt: number | null; acc: number | null; speed: number | null; mocked: number }>(
    'select t, lat, lng, alt, acc, speed, mocked from points where client_trip_id = ? order by t', tripId);
  return rows.map((r) => ({ t: r.t, lat: r.lat, lng: r.lng, alt: r.alt, acc: r.acc, speed: r.speed, ...(r.mocked ? { mocked: true } : {}) }));
}

export async function moveTripPoints(fromTripId: string, toTripId: string): Promise<void> {
  await getDb().runAsync('update points set client_trip_id = ? where client_trip_id = ?', toTripId, fromTripId);
}

export async function deleteTripPoints(tripId: string): Promise<void> {
  await getDb().runAsync('delete from points where client_trip_id = ?', tripId);
}

/* ---------------- trips ---------------- */

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'local_only';

export interface LocalTrip {
  clientTripId: string;
  serverId: string | null;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number;
  movingTimeS: number;
  elevationGainM: number;
  /** encoded polyline (precision 6) of the simplified route */
  route: string;
  routeHexes: string[];
  xpTotal: number;
  xpLines: XpLine[];
  xpWithheld: string | null;
  xpConfirmed: boolean;
  creditedKm: number;
  newHexes: number;
  verdict: 'ok' | 'flagged' | 'rejected';
  flags: string[];
  mode: string;
  isPassenger: boolean;
  manual: boolean;
  carId: string | null;
  syncStatus: SyncStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  isDemo: boolean;
  createdAt: number;
}

type TripRow = {
  client_trip_id: string; server_id: string | null; started_at: number; ended_at: number; distance_m: number; duration_s: number;
  moving_time_s: number; elevation_gain_m: number; route: string; route_hexes: string; xp_total: number; xp_lines: string;
  xp_withheld: string | null; xp_confirmed: number; credited_km: number; new_hexes: number; verdict: LocalTrip['verdict']; flags: string; mode: string;
  is_passenger: number; manual: number; car_id: string | null; sync_status: SyncStatus; attempts: number; next_attempt_at: number;
  last_error: string | null; is_demo: number; created_at: number;
};

const fromRow = (r: TripRow): LocalTrip => ({
  clientTripId: r.client_trip_id, serverId: r.server_id, startedAt: r.started_at, endedAt: r.ended_at, distanceM: r.distance_m,
  durationS: r.duration_s, movingTimeS: r.moving_time_s, elevationGainM: r.elevation_gain_m, route: r.route,
  routeHexes: JSON.parse(r.route_hexes) as string[], xpTotal: r.xp_total, xpLines: JSON.parse(r.xp_lines) as XpLine[],
  xpWithheld: r.xp_withheld, xpConfirmed: !!r.xp_confirmed, creditedKm: r.credited_km, newHexes: r.new_hexes, verdict: r.verdict,
  flags: JSON.parse(r.flags) as string[], mode: r.mode, isPassenger: !!r.is_passenger, manual: !!r.manual, carId: r.car_id,
  syncStatus: r.sync_status, attempts: r.attempts, nextAttemptAt: r.next_attempt_at, lastError: r.last_error, isDemo: !!r.is_demo,
  createdAt: r.created_at,
});

export async function upsertTrip(t: LocalTrip): Promise<void> {
  await getDb().runAsync(
    `insert or replace into trips (client_trip_id, server_id, started_at, ended_at, distance_m, duration_s, moving_time_s, elevation_gain_m,
      route, route_hexes, xp_total, xp_lines, xp_withheld, xp_confirmed, credited_km, new_hexes, verdict, flags, mode, is_passenger, manual,
      car_id, sync_status, attempts, next_attempt_at, last_error, is_demo, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.clientTripId, t.serverId, t.startedAt, t.endedAt, t.distanceM, t.durationS, t.movingTimeS, t.elevationGainM, t.route,
      JSON.stringify(t.routeHexes), t.xpTotal, JSON.stringify(t.xpLines), t.xpWithheld, t.xpConfirmed ? 1 : 0, t.creditedKm, t.newHexes,
      t.verdict, JSON.stringify(t.flags), t.mode, t.isPassenger ? 1 : 0, t.manual ? 1 : 0, t.carId, t.syncStatus, t.attempts,
      t.nextAttemptAt, t.lastError, t.isDemo ? 1 : 0, t.createdAt]);
}

export async function updateTrip(id: string, patch: Partial<LocalTrip>): Promise<void> {
  const cur = await getTrip(id);
  if (cur) await upsertTrip({ ...cur, ...patch });
}

export async function getTrip(id: string): Promise<LocalTrip | null> {
  const r = await getDb().getFirstAsync<TripRow>('select * from trips where client_trip_id = ?', id);
  return r ? fromRow(r) : null;
}

export async function listTrips(limit = 200): Promise<LocalTrip[]> {
  const rows = await getDb().getAllAsync<TripRow>('select * from trips order by started_at desc limit ?', limit);
  return rows.map(fromRow);
}

/** Trips ready to upload. Freshly ended trips wait out the merge window (a jam may resume the same drive). */
export const MERGE_WINDOW_MS = 6 * 60_000;
export async function tripsDueForSync(now = Date.now()): Promise<LocalTrip[]> {
  const rows = await getDb().getAllAsync<TripRow>(
    `select * from trips where sync_status in ('pending', 'failed') and next_attempt_at <= ? and is_demo = 0
       and ended_at <= ? and client_trip_id not in (select client_trip_id from active_trip)
     order by started_at limit 20`, now, now - MERGE_WINDOW_MS);
  return rows.map(fromRow);
}

export async function lastTrip(): Promise<LocalTrip | null> {
  const r = await getDb().getFirstAsync<TripRow>('select * from trips order by ended_at desc limit 1');
  return r ? fromRow(r) : null;
}

export async function deleteTrip(id: string): Promise<void> {
  await getDb().runAsync('delete from trips where client_trip_id = ?', id);
  await deleteTripPoints(id);
}

/* ---------------- exploration (client preview) ---------------- */

export async function filterUnknownHexes(cells: string[]): Promise<string[]> {
  if (cells.length === 0) return [];
  const known = new Set<string>();
  const d = getDb();
  for (let i = 0; i < cells.length; i += 500) {
    const chunk = cells.slice(i, i + 500);
    const rows = await d.getAllAsync<{ h3: string }>(`select h3 from hexes where h3 in (${chunk.map(() => '?').join(',')})`, chunk);
    rows.forEach((r) => known.add(r.h3));
  }
  return cells.filter((c) => !known.has(c));
}

export async function addHexes(cells: string[], at: number): Promise<void> {
  if (cells.length === 0) return;
  const d = getDb();
  await d.withTransactionAsync(async () => {
    for (let i = 0; i < cells.length; i += 300) {
      const chunk = cells.slice(i, i + 300);
      await d.runAsync(`insert or ignore into hexes (h3, first_seen_at) values ${chunk.map(() => '(?, ?)').join(', ')}`, chunk.flatMap((c) => [c, at]));
    }
  });
}

export async function recentRouteHexes(sinceMs: number): Promise<Set<string>[]> {
  const rows = await getDb().getAllAsync<{ route_hexes: string }>(
    "select route_hexes from trips where started_at >= ? and verdict <> 'rejected' and is_passenger = 0", sinceMs);
  return rows.map((r) => new Set(JSON.parse(r.route_hexes) as string[]));
}

export async function kmCreditedBetween(fromMs: number, toMs: number): Promise<number> {
  const r = await getDb().getFirstAsync<{ km: number | null }>('select sum(credited_km) as km from trips where started_at >= ? and started_at < ?', fromMs, toMs);
  return r?.km ?? 0;
}

export interface LocalProgress { totalXp: number; pendingXp: number; distanceM: number; trips: number; hexes: number }

export async function localProgress(): Promise<LocalProgress> {
  const d = getDb();
  const t = await d.getFirstAsync<{ xp: number | null; pxp: number | null; dist: number | null; n: number }>(
    `select sum(xp_total) as xp,
            sum(case when sync_status in ('pending', 'failed') then xp_total else 0 end) as pxp,
            sum(case when verdict <> 'rejected' and is_passenger = 0 then distance_m else 0 end) as dist,
            count(*) as n from trips`);
  const h = await d.getFirstAsync<{ n: number }>('select count(*) as n from hexes');
  return { totalXp: t?.xp ?? 0, pendingXp: t?.pxp ?? 0, distanceM: t?.dist ?? 0, trips: t?.n ?? 0, hexes: h?.n ?? 0 };
}

export async function wipeLocalData(): Promise<void> {
  await getDb().execAsync('delete from points; delete from trips; delete from hexes; delete from detector; delete from active_trip;');
}
