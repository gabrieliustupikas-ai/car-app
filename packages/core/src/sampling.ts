/**
 * Battery-aware location sampling policy (platform-agnostic; the app maps it to expo-location options).
 *  - idle: low-power, coarse updates + a geofence around the last stop to wake us when the car leaves.
 *  - candidate/driving: high-accuracy, 1–2 s fixes for a good polyline.
 *  - low battery: halve the rate and drop to balanced accuracy.
 */
export type SamplingAccuracy = 'high' | 'balanced' | 'low';

export interface SamplingProfile {
  name: 'idle' | 'active' | 'active_saver' | 'idle_saver';
  accuracy: SamplingAccuracy;
  timeIntervalMs: number;
  distanceIntervalM: number;
  /** iOS: batch delivery while in background */
  deferredDistanceM: number;
  deferredIntervalMs: number;
  /** geofence radius (m) placed at the last stop while idle */
  geofenceRadiusM: number | null;
}

export interface DeviceEnergy {
  batteryLevel: number | null; // 0..1
  charging: boolean;
  lowPowerMode: boolean;
}

export function samplingProfile(phase: 'idle' | 'candidate' | 'driving' | 'stopping', energy: DeviceEnergy): SamplingProfile {
  const saver = !energy.charging && (energy.lowPowerMode || (energy.batteryLevel != null && energy.batteryLevel < 0.2));
  if (phase === 'idle') {
    return saver
      ? { name: 'idle_saver', accuracy: 'low', timeIntervalMs: 120_000, distanceIntervalM: 400, deferredDistanceM: 1_000, deferredIntervalMs: 300_000, geofenceRadiusM: 200 }
      : { name: 'idle', accuracy: 'balanced', timeIntervalMs: 30_000, distanceIntervalM: 150, deferredDistanceM: 300, deferredIntervalMs: 60_000, geofenceRadiusM: 150 };
  }
  return saver
    ? { name: 'active_saver', accuracy: 'balanced', timeIntervalMs: 5_000, distanceIntervalM: 25, deferredDistanceM: 500, deferredIntervalMs: 60_000, geofenceRadiusM: null }
    : { name: 'active', accuracy: 'high', timeIntervalMs: 2_000, distanceIntervalM: 10, deferredDistanceM: 250, deferredIntervalMs: 30_000, geofenceRadiusM: null };
}

/** Upload batching: only sync on Wi-Fi/charging for big backlogs, otherwise whenever online. */
export function shouldSyncNow(opts: { pendingTrips: number; pendingBytes: number; online: boolean; unmetered: boolean; charging: boolean }): boolean {
  if (!opts.online || opts.pendingTrips === 0) return false;
  if (opts.pendingBytes < 2_000_000) return true;
  return opts.unmetered || opts.charging;
}
