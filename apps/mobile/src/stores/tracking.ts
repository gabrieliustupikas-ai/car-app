import type { DetectionPhase, GeoPoint } from '@roadclub/core';
import { create } from 'zustand';

/** Live, in-memory view of the recorder for the UI (the source of truth is SQLite). */
interface TrackingState {
  phase: DetectionPhase;
  activeTripId: string | null;
  startedAt: number | null;
  distanceM: number;
  /** last ~2000 points of the active trip for drawing the live route */
  livePath: [number, number][];
  lastFix: GeoPoint | null;
  permission: 'unknown' | 'denied' | 'foreground' | 'always';
  simulating: string | null;
  pendingLevelUp: number | null;
  set: (patch: Partial<Omit<TrackingState, 'set'>>) => void;
}

export const useTracking = create<TrackingState>()((set) => ({
  phase: 'idle',
  activeTripId: null,
  startedAt: null,
  distanceM: 0,
  livePath: [],
  lastFix: null,
  permission: 'unknown',
  simulating: null,
  pendingLevelUp: null,
  set: (patch) => set(patch),
}));
