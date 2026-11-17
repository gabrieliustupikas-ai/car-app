/**
 * Demo mode: try everything without driving. Seeds a believable history of Lithuanian drives and can
 * replay a full drive through the real recorder → detector → pipeline path at high speed.
 * Demo trips are flagged is_demo and never uploaded.
 */
import { DEMO_ROUTES, generateTrip, type GeoPoint } from '@roadclub/core';
import { randomUUID } from 'expo-crypto';
import * as local from '@/db/localDb';
import { queryClient, qk } from '@/lib/queryClient';
import { telemetry } from '@/lib/telemetry';
import { finalizeTrip } from '@/tracking/finalize';
import { ingestFixes, resetDetector, stopTrip } from '@/tracking/recorder';
import { useTracking } from '@/stores/tracking';

const DAY = 24 * 3600_000;

export async function seedDemoHistory(): Promise<number> {
  const now = Date.now();
  // [route index, days ago, hour of day]
  const plan: [number, number, number][] = [
    [0, 13, 9], [2, 11, 18], [3, 9, 7], [0, 7, 17], [2, 5, 21], [1, 4, 10], [0, 2, 8], [2, 1, 19],
  ];
  let n = 0;
  for (const [i, [routeIdx, daysAgo, hour]] of plan.entries()) {
    const route = DEMO_ROUTES[routeIdx]!;
    const start = new Date(now - daysAgo * DAY);
    start.setHours(hour, (i * 7) % 60, 0, 0);
    const points = generateTrip(route, { startAt: start.getTime(), seed: 100 + i });
    const trip = await finalizeTrip(randomUUID(), { manual: false, carId: null, isDemo: true, points });
    if (trip) n++;
  }
  // drop the level-up animation for seeded history
  useTracking.getState().set({ pendingLevelUp: null });
  await queryClient.invalidateQueries({ queryKey: qk.trips });
  await queryClient.invalidateQueries({ queryKey: qk.progress });
  return n;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Replays a demo route through the live recorder. `speedup` fixes are fed per 100 ms tick. */
export async function simulateDrive(routeIdx = 0, speedup = 12): Promise<void> {
  if (timer) return;
  const route = DEMO_ROUTES[routeIdx % DEMO_ROUTES.length]!;
  // generate in the past so timestamps are realistic; 4 min parked at both ends triggers auto start/stop
  const draft = generateTrip(route, { startAt: 0, seed: Date.now() % 1000, idleS: 240 });
  const duration = draft[draft.length - 1]!.t;
  const offset = Date.now() - duration - 60_000;
  const points: GeoPoint[] = draft.map((p) => ({ ...p, t: p.t + offset }));

  await resetDetector();
  useTracking.getState().set({ simulating: route.name.en, livePath: [], distanceM: 0 });
  telemetry.track('drive_simulated', { route: route.id });
  let i = 0;
  timer = setInterval(() => {
    const batch = points.slice(i, i + speedup);
    i += speedup;
    if (batch.length) void ingestFixes(batch, { isDemo: true });
    if (i >= points.length) void stopSimulation();
  }, 100);
}

export async function stopSimulation(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  if (useTracking.getState().activeTripId) await stopTrip({ isDemo: true });
  useTracking.getState().set({ simulating: null });
  await queryClient.invalidateQueries({ queryKey: qk.trips });
  await queryClient.invalidateQueries({ queryKey: qk.progress });
}

export async function clearDemoData(): Promise<void> {
  await stopSimulation();
  await local.wipeLocalData();
  await queryClient.invalidateQueries();
}
