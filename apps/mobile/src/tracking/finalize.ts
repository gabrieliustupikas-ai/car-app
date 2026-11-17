import {
  encodePolyline, levelForXp, levelsGained, localDayStart, processTrip, type GeoPoint, type ProcessedTrip, type TripContext,
} from '@roadclub/core';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import * as local from '@/db/localDb';
import { deviceTimezone, formatKm } from '@/lib/format';
import { telemetry } from '@/lib/telemetry';
import { useTracking } from '@/stores/tracking';

export const localContext: TripContext = {
  filterNewHexes: (cells) => local.filterUnknownHexes(cells),
  recentRouteHexes: (since) => local.recentRouteHexes(since),
  kmCreditedOnDay: (dayStart) => local.kmCreditedBetween(dayStart, dayStart + 24 * 3600_000),
};

export function toLocalTrip(
  clientTripId: string,
  p: ProcessedTrip,
  opts: { manual: boolean; carId: string | null; isPassenger: boolean; isDemo: boolean },
): local.LocalTrip {
  return {
    clientTripId,
    serverId: null,
    startedAt: p.stats.startedAt,
    endedAt: p.stats.endedAt,
    distanceM: p.stats.distanceM,
    durationS: p.stats.durationS,
    movingTimeS: p.stats.movingTimeS,
    elevationGainM: p.stats.elevationGainM,
    route: encodePolyline(p.route, 6),
    routeHexes: p.hexes,
    xpTotal: p.xp.total,
    xpLines: p.xp.lines,
    xpWithheld: p.xp.withheldReason ?? null,
    xpConfirmed: false,
    creditedKm: p.xp.creditedKm,
    newHexes: p.newHexes.length,
    verdict: p.verdict,
    flags: p.flags,
    mode: p.mode.mode,
    isPassenger: opts.isPassenger,
    manual: opts.manual,
    carId: opts.carId,
    syncStatus: opts.isDemo ? 'local_only' : 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    isDemo: opts.isDemo,
    createdAt: Date.now(),
  };
}

/**
 * Turn the raw fixes of a finished trip into a stored trip with a preview of XP/exploration.
 * The server recomputes everything on sync; the preview gives instant feedback offline.
 */
export async function finalizeTrip(
  clientTripId: string,
  opts: { manual: boolean; carId: string | null; isDemo: boolean; points?: GeoPoint[] },
): Promise<local.LocalTrip | null> {
  const points = opts.points ?? (await local.getTripPoints(clientTripId));
  if (points.length < 2) {
    await local.deleteTripPoints(clientTripId);
    return null;
  }
  const before = await local.localProgress();
  const processed = await processTrip(points, localContext, {
    isPassenger: false,
    dayStartMs: localDayStart(points[0]!.t, deviceTimezone()),
  });
  const trip = toLocalTrip(clientTripId, processed, { manual: opts.manual, carId: opts.carId, isPassenger: false, isDemo: opts.isDemo });
  await local.upsertTrip(trip);
  if (processed.newHexes.length) await local.addHexes(processed.newHexes, trip.startedAt);
  if (opts.points) await local.appendPoints(clientTripId, points);

  const gained = levelsGained(before.totalXp, before.totalXp + trip.xpTotal);
  if (gained.length) {
    useTracking.getState().set({ pendingLevelUp: gained[gained.length - 1]! });
    telemetry.track('level_up', { level: gained[gained.length - 1]! });
  }
  telemetry.track('trip_ended', { km: Math.round(trip.distanceM / 1000), verdict: trip.verdict, demo: opts.isDemo });
  void notifyTripSaved(trip, levelForXp(before.totalXp + trip.xpTotal).level);
  return trip;
}

async function notifyTripSaved(trip: local.LocalTrip, level: number) {
  if (Platform.OS === 'web') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('trip.summary'),
        body: `${formatKm(trip.distanceM, i18n.language)} km · +${trip.xpTotal} XP · ${i18n.t('profile.level', { level })}`,
        data: { url: `/trip/${trip.clientTripId}` },
      },
      trigger: null,
    });
  } catch (e) {
    telemetry.captureException(e);
  }
}
