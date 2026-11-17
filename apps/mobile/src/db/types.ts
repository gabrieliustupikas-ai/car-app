import type { XpLine } from '@roadclub/core';

export interface ActiveTrip { clientTripId: string; startedAt: number; manual: boolean; carId: string | null; isDemo: boolean }

export interface LocalProgress { totalXp: number; pendingXp: number; distanceM: number; trips: number; hexes: number }

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

