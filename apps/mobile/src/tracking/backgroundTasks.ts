/**
 * Background task definitions. Imported from the app entry (index.ts) so they exist even when the OS
 * starts the JS runtime headlessly to deliver locations.
 */
import type { GeoPoint } from '@roadclub/core';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { telemetry } from '@/lib/telemetry';
import { GEOFENCE_TASK, LOCATION_TASK } from './constants';

type LocationTaskData = { locations: Location.LocationObject[] };
type GeofenceTaskData = { eventType: Location.LocationGeofencingEventType; region: Location.LocationRegion };

export function toGeoPoint(l: Location.LocationObject): GeoPoint {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    t: l.timestamp,
    alt: l.coords.altitude,
    acc: l.coords.accuracy,
    speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    ...(l.mocked ? { mocked: true } : {}),
  };
}

TaskManager.defineTask<LocationTaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error) { telemetry.captureException(error, { task: LOCATION_TASK }); return; }
  if (!data?.locations?.length) return;
  const points = data.locations.map(toGeoPoint).sort((a, b) => a.t - b.t);
  // lazy import keeps the headless startup path small
  const { ingestFixes } = await import('./recorder');
  await ingestFixes(points);
});

TaskManager.defineTask<GeofenceTaskData>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) { telemetry.captureException(error, { task: GEOFENCE_TASK }); return; }
  if (data?.eventType === Location.GeofencingEventType.Exit) {
    // We left the parking spot: switch to high-accuracy sampling to catch the trip start.
    const { applyProfile } = await import('./controller');
    await applyProfile('candidate', true);
  }
});
