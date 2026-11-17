import {
  DEFAULT_DETECTION, detectStep, haversine, initialDetectionState, manualStart, manualStop, shouldMergeTrips,
  type DetectionEvent, type DetectionPhase, type DetectionState, type GeoPoint,
} from '@roadclub/core';
import { randomUUID } from 'expo-crypto';
import * as local from '@/db/localDb';
import { telemetry } from '@/lib/telemetry';
import { useTracking } from '@/stores/tracking';
import { finalizeTrip } from './finalize';
import { createMutex } from './mutex';

/**
 * The recorder turns a stream of location fixes into trips. It is used by the background location
 * task, by manual start/stop and by the demo simulator — one code path for all three.
 */
const exclusive = createMutex();
let cached: DetectionState | null = null;
type PhaseListener = (phase: DetectionPhase) => void;
const phaseListeners = new Set<PhaseListener>();

export function onPhaseChange(fn: PhaseListener): () => void {
  phaseListeners.add(fn);
  return () => phaseListeners.delete(fn);
}

async function state(): Promise<DetectionState> {
  if (!cached) cached = (await local.loadDetectorState()) ?? initialDetectionState();
  return cached;
}

async function persist(s: DetectionState) {
  cached = s;
  await local.saveDetectorState(s);
}

const MAX_LIVE_PATH = 2000;

function pushLive(points: GeoPoint[], distanceDelta: number) {
  const st = useTracking.getState();
  const path = st.livePath.concat(points.map((p) => [p.lng, p.lat] as [number, number]));
  st.set({
    livePath: path.length > MAX_LIVE_PATH ? path.slice(path.length - MAX_LIVE_PATH) : path,
    distanceM: st.distanceM + distanceDelta,
    lastFix: points[points.length - 1] ?? st.lastFix,
  });
}

async function handleEvents(events: DetectionEvent[], ctx: { isDemo: boolean }) {
  let pending: GeoPoint[] = [];
  let delta = 0;
  const flush = async () => {
    const active = await local.getActiveTrip();
    if (active && pending.length) await local.appendPoints(active.clientTripId, pending);
    if (pending.length) pushLive(pending, delta);
    pending = [];
    delta = 0;
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'tripStart': {
        await flush();
        // A long jam can split one drive in two: re-open the previous (unsynced) trip instead.
        const last = await local.lastTrip();
        const first = ev.seed[0];
        let clientTripId: string = randomUUID();
        let startedAt = ev.at;
        if (last && first && last.syncStatus !== 'synced' && last.isDemo === ctx.isDemo) {
          const lastPts = await local.getTripPoints(last.clientTripId);
          const end = lastPts[lastPts.length - 1];
          if (end && shouldMergeTrips(end, first)) {
            clientTripId = last.clientTripId;
            startedAt = last.startedAt;
            await local.deleteTrip(last.clientTripId).then(() => local.appendPoints(clientTripId, lastPts));
          }
        }
        await local.setActiveTrip({ clientTripId, startedAt, manual: ev.manual, carId: null, isDemo: ctx.isDemo });
        if (ev.seed.length) await local.appendPoints(clientTripId, ev.seed);
        const seedPath = ev.seed.map((p) => [p.lng, p.lat] as [number, number]);
        useTracking.getState().set({ activeTripId: clientTripId, startedAt, distanceM: 0, livePath: seedPath });
        telemetry.track('trip_started', { manual: ev.manual, demo: ctx.isDemo });
        break;
      }
      case 'point': {
        const prev = pending[pending.length - 1] ?? useTracking.getState().lastFix;
        if (prev) delta += haversine(prev, ev.point);
        pending.push(ev.point);
        break;
      }
      case 'tripEnd': {
        await flush();
        const active = await local.getActiveTrip();
        await local.clearActiveTrip();
        useTracking.getState().set({ activeTripId: null, startedAt: null, distanceM: 0, livePath: [] });
        if (!active) break;
        if (ev.valid || ev.reason === 'manual') {
          const trip = await finalizeTrip(active.clientTripId, { manual: active.manual, carId: active.carId, isDemo: active.isDemo });
          if (!trip || (!ev.valid && trip.distanceM < DEFAULT_DETECTION.minTripDistanceM)) {
            // too short to be meaningful (e.g. manual start then immediate stop)
            if (trip) await local.deleteTrip(trip.clientTripId);
            telemetry.track('trip_discarded', { reason: 'too_short' });
          } else {
            const { requestSync } = await import('./sync');
            requestSync(local.MERGE_WINDOW_MS + 30_000);
          }
        } else {
          await local.deleteTripPoints(active.clientTripId);
          telemetry.track('trip_discarded', { reason: ev.reason });
        }
        break;
      }
      case 'phase':
        useTracking.getState().set({ phase: ev.phase });
        phaseListeners.forEach((fn) => fn(ev.phase));
        break;
    }
  }
  await flush();
}

/** Feed fixes (in time order). Safe to call concurrently; work is serialised. */
export function ingestFixes(points: GeoPoint[], ctx: { isDemo?: boolean } = {}): Promise<void> {
  return exclusive(async () => {
    let s = await state();
    const events: DetectionEvent[] = [];
    for (const p of points) {
      const r = detectStep(s, p);
      s = r.state;
      events.push(...r.events);
    }
    await persist(s);
    if (!events.length && points.length) useTracking.getState().set({ lastFix: points[points.length - 1]! });
    await handleEvents(events, { isDemo: ctx.isDemo ?? false });
  });
}

export function startManualTrip(ctx: { isDemo?: boolean } = {}): Promise<void> {
  return exclusive(async () => {
    const r = manualStart(await state(), Date.now());
    await persist(r.state);
    await handleEvents(r.events, { isDemo: ctx.isDemo ?? false });
  });
}

export function stopTrip(ctx: { isDemo?: boolean } = {}): Promise<void> {
  return exclusive(async () => {
    const r = manualStop(await state(), Date.now());
    await persist(r.state);
    await handleEvents(r.events, { isDemo: ctx.isDemo ?? false });
  });
}

/** Restore the UI view of an in-progress trip after a cold start. */
export async function hydrateTrackingUi(): Promise<void> {
  const s = await state();
  const active = await local.getActiveTrip();
  if (!active) { useTracking.getState().set({ phase: s.phase }); return; }
  const pts = await local.getTripPoints(active.clientTripId);
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1]!, pts[i]!);
  useTracking.getState().set({
    phase: s.phase, activeTripId: active.clientTripId, startedAt: active.startedAt, distanceM: d,
    livePath: pts.slice(-MAX_LIVE_PATH).map((p) => [p.lng, p.lat]), lastFix: pts[pts.length - 1] ?? null,
  });
}

/** Used by demo mode to start from a clean detector. */
export function resetDetector(): Promise<void> {
  return exclusive(async () => { await persist(initialDetectionState()); });
}
