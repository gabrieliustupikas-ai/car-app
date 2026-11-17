/**
 * Web preview: no background GPS in browsers. Drives are simulated in demo mode instead.
 * Same exports as controller.ts so shared screens work unchanged.
 */
import type { DetectionPhase } from '@roadclub/core';
import { useTracking } from '@/stores/tracking';

export async function refreshPermissionState(): Promise<'denied' | 'foreground' | 'always'> {
  useTracking.getState().set({ permission: 'denied' });
  return 'denied';
}
export const requestLocationPermissions = refreshPermissionState;
export async function applyProfile(_phase: DetectionPhase, _force = false): Promise<void> {}
export async function stopTracking(): Promise<void> {}
export async function ensureTracking(): Promise<void> { await refreshPermissionState(); }
