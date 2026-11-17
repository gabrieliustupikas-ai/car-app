import { samplingProfile, type DetectionPhase, type SamplingProfile } from '@roadclub/core';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { BRAND } from '@/config/brand';
import i18n from '@/i18n';
import { telemetry } from '@/lib/telemetry';
import { useSettings } from '@/stores/settings';
import { useTracking } from '@/stores/tracking';
import { palette } from '@/theme/tokens';
import { GEOFENCE_TASK, LOCATION_TASK } from './constants';
import { onPhaseChange } from './recorder';

/**
 * Owns the OS location subscription. Battery-aware: high-accuracy fixes only while driving,
 * coarse updates + a departure geofence while parked, and a saver profile on low battery.
 */
let currentProfile: SamplingProfile['name'] | null = null;

const ACCURACY: Record<SamplingProfile['accuracy'], Location.Accuracy> = {
  high: Location.Accuracy.BestForNavigation,
  balanced: Location.Accuracy.Balanced,
  low: Location.Accuracy.Low,
};

export async function refreshPermissionState(): Promise<'denied' | 'foreground' | 'always'> {
  const fg = await Location.getForegroundPermissionsAsync();
  let perm: 'denied' | 'foreground' | 'always' = 'denied';
  if (fg.granted) {
    const bg = await Location.getBackgroundPermissionsAsync();
    perm = bg.granted ? 'always' : 'foreground';
  }
  useTracking.getState().set({ permission: perm });
  return perm;
}

export async function requestLocationPermissions(): Promise<'denied' | 'foreground' | 'always'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.granted) await Location.requestBackgroundPermissionsAsync();
  return refreshPermissionState();
}

async function energy() {
  try {
    const [level, state, lowPower] = await Promise.all([
      Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync(), Battery.isLowPowerModeEnabledAsync(),
    ]);
    return {
      batteryLevel: level >= 0 ? level : null,
      charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
      lowPowerMode: lowPower,
    };
  } catch {
    return { batteryLevel: null, charging: false, lowPowerMode: false };
  }
}

export async function applyProfile(phase: DetectionPhase, force = false): Promise<void> {
  const { autoDetect, demoMode } = useSettings.getState();
  const perm = useTracking.getState().permission;
  const manualTrip = useTracking.getState().activeTripId != null;
  if (demoMode || perm === 'denied' || perm === 'unknown' || (!autoDetect && !manualTrip)) return stopTracking();
  // without "Always" permission we can only track a trip the user started (foreground service on Android)
  if (perm === 'foreground' && !manualTrip) return stopTracking();

  const profile = samplingProfile(phase, await energy());
  if (!force && profile.name === currentProfile && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) return;

  const active = profile.name.startsWith('active');
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: ACCURACY[profile.accuracy],
    timeInterval: profile.timeIntervalMs,
    distanceInterval: profile.distanceIntervalM,
    deferredUpdatesDistance: profile.deferredDistanceM,
    deferredUpdatesInterval: profile.deferredIntervalMs,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: active,
    foregroundService: {
      notificationTitle: active ? i18n.t('map.driving') : BRAND.name,
      notificationBody: active ? i18n.t('map.drivingReminder') : i18n.t('map.idle'),
      notificationColor: palette.dark.accent,
      killServiceOnDestroy: false,
    },
  });
  currentProfile = profile.name;
  telemetry.breadcrumb('sampling_profile', { profile: profile.name });

  // Departure geofence around where we parked: wakes the app when the car leaves even if coarse
  // updates are being throttled by the OS.
  const last = useTracking.getState().lastFix;
  if (profile.geofenceRadiusM && last) {
    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      { identifier: 'parked', latitude: last.lat, longitude: last.lng, radius: profile.geofenceRadiusM, notifyOnEnter: false, notifyOnExit: true },
    ]).catch((e) => telemetry.captureException(e));
  } else if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
  }
}

export async function stopTracking(): Promise<void> {
  currentProfile = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
}

let wired = false;
/** Start (or re-evaluate) tracking at app launch and whenever settings change. */
export async function ensureTracking(): Promise<void> {
  if (!wired) {
    wired = true;
    onPhaseChange((phase) => { void applyProfile(phase).catch((e) => telemetry.captureException(e)); });
  }
  if (Platform.OS === 'web') return;
  await refreshPermissionState();
  await applyProfile(useTracking.getState().phase, true).catch((e) => telemetry.captureException(e));
}
