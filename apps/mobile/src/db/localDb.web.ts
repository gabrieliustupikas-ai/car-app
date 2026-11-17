/**
 * Web preview implementation of the local store (same API as localDb.ts, which uses SQLite on
 * iOS/Android). Trips and explored hexes persist in localStorage; raw GPS fixes stay in memory.
 */
import type { DetectionState, GeoPoint } from '@roadclub/core';
import type { ActiveTrip, LocalProgress, LocalTrip } from './types';

export type { ActiveTrip, LocalProgress, LocalTrip, SyncStatus } from './types';

const KEY = 'roadclub.web-db.v1';
interface Store { detector: DetectionState | null; active: ActiveTrip | null; trips: Record<string, LocalTrip>; hexes: Record<string, number> }

const points = new Map<string, GeoPoint[]>();
let store: Store = load();

function load(): Store {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch { /* storage blocked (private mode) → memory only */ }
  return { detector: null, active: null, trips: {}, hexes: {} };
}
function save() {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(store)); } catch { /* quota or blocked */ }
}

export function getDb() { return store; }

export async function loadDetectorState() { return store.detector; }
export async function saveDetectorState(s: DetectionState) { store.detector = s; save(); }

export async function getActiveTrip() { return store.active; }
export async function setActiveTrip(a: ActiveTrip) { store.active = a; save(); }
export async function clearActiveTrip() { store.active = null; save(); }

export async function appendPoints(tripId: string, pts: readonly GeoPoint[]) {
  points.set(tripId, [...(points.get(tripId) ?? []), ...pts]);
}
export async function getTripPoints(tripId: string) { return [...(points.get(tripId) ?? [])].sort((a, b) => a.t - b.t); }
export async function moveTripPoints(from: string, to: string) {
  points.set(to, [...(points.get(to) ?? []), ...(points.get(from) ?? [])]);
  points.delete(from);
}
export async function deleteTripPoints(tripId: string) { points.delete(tripId); }

export async function upsertTrip(t: LocalTrip) { store.trips[t.clientTripId] = t; save(); }
export async function updateTrip(id: string, patch: Partial<LocalTrip>) {
  const cur = store.trips[id];
  if (cur) { store.trips[id] = { ...cur, ...patch }; save(); }
}
export async function getTrip(id: string) { return store.trips[id] ?? null; }
const sorted = () => Object.values(store.trips).sort((a, b) => b.startedAt - a.startedAt);
export async function listTrips(limit = 200) { return sorted().slice(0, limit); }

export const MERGE_WINDOW_MS = 6 * 60_000;
export async function tripsDueForSync(now = Date.now()) {
  return sorted().filter((t) => (t.syncStatus === 'pending' || t.syncStatus === 'failed') && !t.isDemo
    && t.nextAttemptAt <= now && t.endedAt <= now - MERGE_WINDOW_MS && t.clientTripId !== store.active?.clientTripId).slice(0, 20);
}
export async function lastTrip() {
  return Object.values(store.trips).sort((a, b) => b.endedAt - a.endedAt)[0] ?? null;
}
export async function deleteTrip(id: string) { delete store.trips[id]; points.delete(id); save(); }

export async function filterUnknownHexes(cells: string[]) { return cells.filter((c) => !(c in store.hexes)); }
export async function addHexes(cells: string[], at: number) {
  for (const c of cells) if (!(c in store.hexes)) store.hexes[c] = at;
  save();
}
export async function recentRouteHexes(sinceMs: number) {
  return Object.values(store.trips).filter((t) => t.startedAt >= sinceMs && t.verdict !== 'rejected' && !t.isPassenger)
    .map((t) => new Set(t.routeHexes));
}
export async function kmCreditedBetween(fromMs: number, toMs: number) {
  return Object.values(store.trips).filter((t) => t.startedAt >= fromMs && t.startedAt < toMs).reduce((s, t) => s + t.creditedKm, 0);
}
export async function localProgress(): Promise<LocalProgress> {
  const trips = Object.values(store.trips);
  return {
    totalXp: trips.reduce((s, t) => s + t.xpTotal, 0),
    pendingXp: trips.filter((t) => t.syncStatus === 'pending' || t.syncStatus === 'failed').reduce((s, t) => s + t.xpTotal, 0),
    distanceM: trips.filter((t) => t.verdict !== 'rejected' && !t.isPassenger).reduce((s, t) => s + t.distanceM, 0),
    trips: trips.length,
    hexes: Object.keys(store.hexes).length,
  };
}
export async function wipeLocalData() {
  points.clear();
  store = { detector: null, active: null, trips: {}, hexes: {} };
  save();
}
