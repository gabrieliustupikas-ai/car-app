import { haversine } from './geo.ts';
import { segmentSpeed } from './tripStats.ts';
import type { GeoPoint } from './types.ts';

/**
 * Automatic trip start/stop detection as a pure, serialisable reducer.
 * The background location task is headless and may be restarted by the OS at any time,
 * so the state is persisted between invocations (see apps/mobile tracking store).
 */
export interface DetectionConfig {
  /** speed that counts as "driving" (m/s). 4.5 m/s ≈ 16 km/h: faster than walking/most cyclists. */
  startSpeedMs: number;
  /** consecutive fast samples needed to confirm a start */
  startConfirmSamples: number;
  /** straight-line displacement needed from first candidate point to confirm a start (m) */
  startMinDisplacementM: number;
  /** below this speed we consider the car stopped (m/s) */
  stopSpeedMs: number;
  /** stationary time (within stopRadiusM) needed before ending the trip — survives traffic lights */
  stopDurationMs: number;
  stopRadiusM: number;
  /** if no fix arrives for this long while driving, end the trip at the last fix */
  maxGapMs: number;
  /** discard fixes worse than this accuracy (m) */
  maxAccuracyM: number;
  /** trips shorter than these are discarded as noise */
  minTripDistanceM: number;
  minTripDurationMs: number;
}

export const DEFAULT_DETECTION: DetectionConfig = {
  startSpeedMs: 4.5,
  startConfirmSamples: 3,
  startMinDisplacementM: 120,
  stopSpeedMs: 1.5,
  stopDurationMs: 3 * 60_000,
  stopRadiusM: 75,
  maxGapMs: 15 * 60_000,
  maxAccuracyM: 65,
  minTripDistanceM: 500,
  minTripDurationMs: 90_000,
};

export type DetectionPhase = 'idle' | 'candidate' | 'driving' | 'stopping';

export interface DetectionState {
  phase: DetectionPhase;
  lastPoint: GeoPoint | null;
  /** points buffered while confirming a start, so the beginning of the drive isn't lost */
  candidate: GeoPoint[];
  fastCount: number;
  /** where the vehicle first appeared stationary */
  stopAnchor: GeoPoint | null;
  tripStartedAt: number | null;
  tripDistanceM: number;
  /** last point that was clearly moving; the trip ends here */
  lastMoving: GeoPoint | null;
  /** true when the user started the trip by hand — auto-stop is disabled */
  manual: boolean;
}

export type DetectionEvent =
  | { type: 'tripStart'; at: number; seed: GeoPoint[]; manual: boolean }
  | { type: 'point'; point: GeoPoint }
  | { type: 'tripEnd'; at: number; reason: 'stopped' | 'gap' | 'manual'; valid: boolean }
  | { type: 'phase'; phase: DetectionPhase };

export const initialDetectionState = (): DetectionState => ({
  phase: 'idle', lastPoint: null, candidate: [], fastCount: 0, stopAnchor: null,
  tripStartedAt: null, tripDistanceM: 0, lastMoving: null, manual: false,
});

function endTrip(s: DetectionState, at: number, reason: 'stopped' | 'gap' | 'manual', cfg: DetectionConfig) {
  const valid = s.tripStartedAt != null &&
    s.tripDistanceM >= cfg.minTripDistanceM && at - s.tripStartedAt >= cfg.minTripDurationMs;
  const ev: DetectionEvent = { type: 'tripEnd', at, reason, valid };
  return { ev, state: { ...initialDetectionState(), lastPoint: s.lastPoint } };
}

export function manualStart(state: DetectionState, now: number): { state: DetectionState; events: DetectionEvent[] } {
  if (state.phase === 'driving' || state.phase === 'stopping') {
    return { state: { ...state, manual: true }, events: [] };
  }
  return {
    state: { ...initialDetectionState(), phase: 'driving', manual: true, tripStartedAt: now, lastPoint: state.lastPoint },
    events: [{ type: 'tripStart', at: now, seed: [], manual: true }, { type: 'phase', phase: 'driving' }],
  };
}

export function manualStop(state: DetectionState, now: number, cfg = DEFAULT_DETECTION) {
  if (state.phase !== 'driving' && state.phase !== 'stopping') return { state, events: [] as DetectionEvent[] };
  const { ev, state: next } = endTrip(state, state.lastMoving?.t ?? now, 'manual', cfg);
  return { state: next, events: [ev, { type: 'phase', phase: 'idle' } as DetectionEvent] };
}

/** Feed one location fix. Returns the new state plus any events to act on. */
export function detectStep(
  state: DetectionState,
  point: GeoPoint,
  cfg: DetectionConfig = DEFAULT_DETECTION,
): { state: DetectionState; events: DetectionEvent[] } {
  const events: DetectionEvent[] = [];
  if (point.acc != null && point.acc > cfg.maxAccuracyM) return { state, events };
  const prev = state.lastPoint;
  if (prev && point.t <= prev.t) return { state, events }; // out-of-order / duplicate

  let s: DetectionState = { ...state, lastPoint: point };

  // Gap handling: the OS may have suspended us. End an active trip at the last known fix.
  if (prev && (s.phase === 'driving' || s.phase === 'stopping') && !s.manual && point.t - prev.t > cfg.maxGapMs) {
    const { ev, state: next } = endTrip(state, state.lastMoving?.t ?? prev.t, 'gap', cfg);
    events.push(ev, { type: 'phase', phase: 'idle' });
    s = { ...next, lastPoint: point };
  }

  const speed = prev ? segmentSpeed(prev, point) : (point.speed ?? 0);
  const fast = speed >= cfg.startSpeedMs;

  switch (s.phase) {
    case 'idle':
      if (fast) {
        s = { ...s, phase: 'candidate', candidate: prev ? [prev, point] : [point], fastCount: 1 };
        events.push({ type: 'phase', phase: 'candidate' });
      }
      break;
    case 'candidate': {
      const candidate = [...s.candidate, point];
      const fastCount = fast ? s.fastCount + 1 : s.fastCount;
      const displacement = haversine(candidate[0]!, point);
      const tooOld = point.t - candidate[0]!.t > 120_000;
      if (fastCount >= cfg.startConfirmSamples && displacement >= cfg.startMinDisplacementM) {
        let dist = 0;
        for (let i = 1; i < candidate.length; i++) dist += haversine(candidate[i - 1]!, candidate[i]!);
        s = { ...s, phase: 'driving', candidate: [], fastCount: 0, tripStartedAt: candidate[0]!.t,
          tripDistanceM: dist, lastMoving: point, manual: false };
        events.push({ type: 'tripStart', at: candidate[0]!.t, seed: candidate, manual: false },
          { type: 'phase', phase: 'driving' });
      } else if (tooOld || (!fast && speed < cfg.stopSpeedMs && fastCount < 2)) {
        s = { ...s, phase: 'idle', candidate: [], fastCount: 0 };
        events.push({ type: 'phase', phase: 'idle' });
      } else {
        s = { ...s, candidate, fastCount };
      }
      break;
    }
    case 'driving':
    case 'stopping': {
      if (prev) s.tripDistanceM += haversine(prev, point);
      events.push({ type: 'point', point });
      if (speed >= cfg.stopSpeedMs && (!s.stopAnchor || haversine(s.stopAnchor, point) > cfg.stopRadiusM)) {
        if (s.phase === 'stopping') events.push({ type: 'phase', phase: 'driving' });
        s = { ...s, phase: 'driving', stopAnchor: null, lastMoving: point };
      } else {
        const anchor = s.stopAnchor ?? point;
        if (s.phase === 'driving') events.push({ type: 'phase', phase: 'stopping' });
        s = { ...s, phase: 'stopping', stopAnchor: anchor };
        if (!s.manual && point.t - anchor.t >= cfg.stopDurationMs) {
          const { ev, state: next } = endTrip(s, s.lastMoving?.t ?? anchor.t, 'stopped', cfg);
          events.push(ev, { type: 'phase', phase: 'idle' });
          s = next;
        }
      }
      break;
    }
  }
  return { state: s, events };
}

/**
 * Long stationary traffic jams (> stopDuration) split a drive in two. The recorder merges a new
 * trip into the previous one when it resumes close in time and space to where that one ended.
 */
export function shouldMergeTrips(
  prevEnd: { t: number; lat: number; lng: number },
  nextStart: { t: number; lat: number; lng: number },
  maxGapMs = 6 * 60_000,
  maxDistM = 250,
): boolean {
  return nextStart.t - prevEnd.t <= maxGapMs && nextStart.t >= prevEnd.t && haversine(prevEnd, nextStart) <= maxDistM;
}
