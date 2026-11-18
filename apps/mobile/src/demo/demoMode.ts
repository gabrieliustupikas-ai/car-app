/**
 * Demo mode: try everything without driving. Seeds a believable history of Lithuanian drives and can
 * replay a full drive through the real recorder → detector → pipeline path at high speed.
 * Demo trips are flagged is_demo and never uploaded.
 */
import { generateTrip, KLAIPEDA_ROUTES, type DemoRoute, type GeoPoint } from '@roadclub/core';
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
  // Klaipėda history: [route index, days ago, hour of day]
  const plan: [number, number, number][] = [
    [0, 13, 9], [3, 11, 22], [1, 9, 19], [2, 7, 8], [4, 5, 17], [5, 4, 12], [3, 2, 23], [0, 1, 18],
  ];
  let n = 0;
  for (const [i, [routeIdx, daysAgo, hour]] of plan.entries()) {
    const route = KLAIPEDA_ROUTES[routeIdx % KLAIPEDA_ROUTES.length]!;
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
export async function simulateDrive(routeIdx = 0, speedup = 8, routes: readonly DemoRoute[] = KLAIPEDA_ROUTES): Promise<void> {
  if (timer) return;
  const route = routes[routeIdx % routes.length]!;
  // generate in the past so timestamps are realistic; parked time at both ends triggers auto start/stop
  const draft = generateTrip(route, { startAt: 0, seed: Date.now() % 1000, idleS: 200 });
  const duration = draft[draft.length - 1]!.t;
  const offset = Date.now() - duration - 60_000;
  const points: GeoPoint[] = draft.map((p) => ({ ...p, t: p.t + offset }));

  await resetDetector();
  const lang = (await import('@/i18n')).default.language;
  useTracking.getState().set({ simulating: lang === 'lt' ? route.name.lt : route.name.en, livePath: [], distanceM: 0 });
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
