import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { syncKv } from '@/lib/kv';
import type { CruiseInvite, RoadReport, Vehicle } from './types';

/** Local (demo / offline) copy of the community data. When signed in, reports and invites go through Supabase instead. */
interface CommunityState {
  reports: RoadReport[];
  invites: CruiseInvite[];
  myVehicles: Vehicle[];
  joinedClubs: string[];
  addReport: (r: RoadReport) => void;
  voteReport: (id: string, stillThere: boolean) => void;
  addInvite: (i: CruiseInvite) => void;
  setInviteStatus: (id: string, status: CruiseInvite['status']) => void;
  addVehicle: (v: Vehicle) => void;
  toggleClub: (id: string) => void;
}

export const REPORT_TTL_MS = 90 * 60 * 1000;

export const useCommunity = create<CommunityState>()(
  persist(
    (set) => ({
      reports: [],
      invites: [],
      myVehicles: [],
      joinedClubs: [],
      addReport: (r) => set((s) => ({ reports: [r, ...s.reports].filter((x) => x.expiresAt > Date.now()).slice(0, 100) })),
      voteReport: (id, stillThere) => set((s) => ({
        reports: s.reports.flatMap((r) => {
          if (r.id !== id) return [r];
          // each confirmation extends the report by 15 min (max 4 h from creation); a "gone" vote ends it
          if (!stillThere) return [];
          return [{ ...r, confirms: r.confirms + 1, expiresAt: Math.min(r.expiresAt + 15 * 60 * 1000, r.createdAt + 4 * 3600 * 1000) }];
        }),
      })),
      addInvite: (i) => set((s) => ({ invites: [i, ...s.invites].slice(0, 50) })),
      setInviteStatus: (id, status) => set((s) => ({ invites: s.invites.map((i) => (i.id === id ? { ...i, status } : i)) })),
      addVehicle: (v) => set((s) => ({ myVehicles: [v, ...s.myVehicles] })),
      toggleClub: (id) => set((s) => ({ joinedClubs: s.joinedClubs.includes(id) ? s.joinedClubs.filter((c) => c !== id) : [...s.joinedClubs, id] })),
    }),
    {
      name: 'roadclub.community.v1', storage: createJSONStorage(() => syncKv),
      partialize: (s) => ({ reports: s.reports, invites: s.invites, myVehicles: s.myVehicles, joinedClubs: s.joinedClubs }) as CommunityState,
    },
  ),
);
