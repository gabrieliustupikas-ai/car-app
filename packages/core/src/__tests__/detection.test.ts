import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTION, detectStep, initialDetectionState, manualStart, manualStop, shouldMergeTrips, type DetectionEvent } from '../tripDetection.ts';
import { generateTrip } from '../demo/generator.ts';
import { DEMO_ROUTES } from '../demo/routes.ts';
import type { GeoPoint } from '../types.ts';

const T0 = Date.UTC(2026, 5, 1, 8, 0, 0);

function run(points: GeoPoint[]) {
  let state = initialDetectionState();
  const events: DetectionEvent[] = [];
  for (const p of points) {
    const r = detectStep(state, p);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe('trip detection', () => {
  it('detects start and end of a drive with idle time on both sides', () => {
    const pts = generateTrip(DEMO_ROUTES[2]!, { startAt: T0, idleS: 300 });
    const { events, state } = run(pts);
    const starts = events.filter((e) => e.type === 'tripStart');
    const ends = events.filter((e) => e.type === 'tripEnd');
    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ reason: 'stopped', valid: true });
    expect(state.phase).toBe('idle');
    // start is detected within the first ~10 s of motion, seeded with the buffered fixes
    const start = starts[0] as Extract<DetectionEvent, { type: 'tripStart' }>;
    expect(start.at - (T0 + 300_000)).toBeLessThan(10_000);
    expect(start.seed.length).toBeGreaterThan(1);
  });

  it('does not end the trip at a 60 s red light', () => {
    const pts = generateTrip(DEMO_ROUTES[2]!, { startAt: T0 });
    const mid = 200;
    const stopP = pts[mid]!;
    const light: GeoPoint[] = Array.from({ length: 60 }, (_, i) => ({ ...stopP, t: stopP.t + (i + 1) * 1000, speed: 0 }));
    const after = pts.slice(mid + 1).map((p) => ({ ...p, t: p.t + 61_000 }));
    const { events } = run([...pts.slice(0, mid + 1), ...light, ...after]);
    expect(events.filter((e) => e.type === 'tripEnd')).toHaveLength(0);
  });

  it('ignores walking and GPS jitter', () => {
    const walk: GeoPoint[] = Array.from({ length: 600 }, (_, i) => ({ lat: 54.68 + i * 0.000012, lng: 25.27, t: T0 + i * 1000, acc: 8, speed: 1.3 }));
    expect(run(walk).events.filter((e) => e.type === 'tripStart')).toHaveLength(0);
  });

  it('ends a trip after a long gap', () => {
    const pts = generateTrip(DEMO_ROUTES[0]!, { startAt: T0 }).slice(0, 400);
    const late = { ...pts[399]!, t: pts[399]!.t + DEFAULT_DETECTION.maxGapMs + 1000 };
    const { events } = run([...pts, late]);
    expect(events.find((e) => e.type === 'tripEnd')).toMatchObject({ reason: 'gap', valid: true });
  });

  it('supports manual start/stop and disables auto-stop', () => {
    let s = initialDetectionState();
    const st = manualStart(s, T0);
    expect(st.events[0]).toMatchObject({ type: 'tripStart', manual: true });
    s = st.state;
    // stationary for 10 minutes must not auto-end a manual trip
    for (let i = 0; i < 600; i++) s = detectStep(s, { lat: 54.68, lng: 25.27, t: T0 + i * 1000, speed: 0 }).state;
    expect(s.phase).not.toBe('idle');
    const end = manualStop(s, T0 + 600_000);
    expect(end.events[0]).toMatchObject({ type: 'tripEnd', reason: 'manual', valid: false });
  });

  it('merges trips split by a long jam', () => {
    expect(shouldMergeTrips({ t: T0, lat: 54.68, lng: 25.27 }, { t: T0 + 240_000, lat: 54.6801, lng: 25.27 })).toBe(true);
    expect(shouldMergeTrips({ t: T0, lat: 54.68, lng: 25.27 }, { t: T0 + 3600_000, lat: 54.68, lng: 25.27 })).toBe(false);
  });
});
