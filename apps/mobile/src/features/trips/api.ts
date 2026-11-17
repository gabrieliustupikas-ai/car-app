import { decodePolyline, levelForXp } from '@roadclub/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as local from '@/db/localDb';
import { queryClient, qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { useSession } from '@/stores/session';

/** Trips come from the local store (offline-first); remote history is pulled into it on sign-in. */
export function useTrips() {
  return useQuery({ queryKey: qk.trips, queryFn: () => local.listTrips(200) });
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: qk.trip(id),
    queryFn: async () => {
      const t = await local.getTrip(id);
      if (!t) return null;
      return { ...t, coords: decodePolyline(t.route, 6) };
    },
  });
}

export interface Progress extends local.LocalProgress { level: ReturnType<typeof levelForXp>; source: 'server' | 'local' }

/**
 * XP/level: when signed in, the server profile is authoritative (+ preview XP of unsynced trips);
 * otherwise (demo/offline) the local sum is used.
 */
export function useProgress() {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: [...qk.progress, userId ?? 'local'],
    queryFn: async (): Promise<Progress> => {
      const lp = await local.localProgress();
      if (supabase && userId) {
        const { data } = await supabase.from('profiles').select('total_xp, total_distance_m, total_trips, hexes_explored').eq('id', userId).maybeSingle();
        if (data) {
          const total = Number(data.total_xp) + lp.pendingXp;
          return { totalXp: total, pendingXp: lp.pendingXp, distanceM: Number(data.total_distance_m), trips: data.total_trips,
            hexes: data.hexes_explored, level: levelForXp(total), source: 'server' };
        }
      }
      return { ...lp, level: levelForXp(lp.totalXp), source: 'local' };
    },
  });
}

export function useMarkPassenger() {
  return useMutation({
    mutationFn: async (trip: local.LocalTrip) => {
      if (trip.serverId && supabase) {
        const { error } = await supabase.rpc('mark_trip_passenger', { p_trip: trip.serverId });
        if (error) throw error;
      }
      await local.updateTrip(trip.clientTripId, { isPassenger: true, xpTotal: 0, xpWithheld: 'passenger', creditedKm: 0 });
      telemetry.track('trip_marked_passenger');
    },
    onSuccess: (_d, trip) => {
      void queryClient.invalidateQueries({ queryKey: qk.trips });
      void queryClient.invalidateQueries({ queryKey: qk.trip(trip.clientTripId) });
      void queryClient.invalidateQueries({ queryKey: qk.progress });
    },
  });
}
