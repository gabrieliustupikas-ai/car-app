import { DEMO_DRIVERS, KLAIPEDA_CENTER } from '@roadclub/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasBackend } from '@/config/env';
import { useDemoDrivers } from '@/features/demo/useDemoDrivers';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { useSession } from '@/stores/session';
import { REPORT_TTL_MS, useCommunity } from './store';
import type { CruiseInvite, OnlineDriver, RoadReport, RoadReportKind } from './types';

export { KLAIPEDA_CENTER };

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
function useRemote(): boolean {
  const userId = useSession((s) => s.session?.user.id);
  return Boolean(hasBackend && supabase && userId);
}

/* ------------------------------ online drivers ------------------------------ */

/** Drivers who are driving right now and chose to be visible (server filters by visibility, blocks and Safe Areas). */
export function useOnlineDrivers(demoMode: boolean, center: [number, number], enabled = true): OnlineDriver[] {
  const remote = useRemote() && !demoMode;
  const demo = useDemoDrivers(demoMode && enabled);
  const { data } = useQuery({
    queryKey: ['online-drivers', Math.round(center[0] * 50), Math.round(center[1] * 50)],
    enabled: remote && enabled,
    refetchInterval: 20_000,
    queryFn: async (): Promise<OnlineDriver[]> => {
      const { data: rows, error } = await supabase!.rpc('online_drivers', { p_lng: center[0], p_lat: center[1], p_radius_m: 25000 });
      if (error) throw error;
      return (rows ?? []).map((r: { user_id: string; display_name: string | null; lng: number; lat: number; heading: number | null; car: string | null }) => ({
        id: r.user_id, name: r.display_name ?? 'Driver', carColor: 'silver' as const, lng: r.lng, lat: r.lat, heading: r.heading ?? 0, car: r.car ?? undefined,
      }));
    },
  });
  return useMemo(() => {
    if (!enabled) return [];
    if (!remote) {
      return demo.map((d) => {
        const info = DEMO_DRIVERS.find((x) => x.id === d.id);
        return { ...d, car: info?.car, level: info?.level, club: info?.club, demo: true };
      });
    }
    return data ?? [];
  }, [enabled, remote, demo, data]);
}

/* ------------------------------ police / checkpoint reports ------------------------------ */

export function useRoadReports(demoMode: boolean, center: [number, number]) {
  const remote = useRemote() && !demoMode;
  const local = useCommunity((s) => s.reports);
  const { data } = useQuery({
    queryKey: ['road-reports', Math.round(center[0] * 50), Math.round(center[1] * 50)],
    enabled: remote,
    refetchInterval: 45_000,
    queryFn: async (): Promise<RoadReport[]> => {
      const { data: rows, error } = await supabase!.rpc('road_reports_near', { p_lng: center[0], p_lat: center[1], p_radius_m: 30000 });
      if (error) throw error;
      return (rows ?? []).map((r: { id: string; kind: RoadReportKind; lng: number; lat: number; confirms: number; created_at: string; expires_at: string }) => ({
        id: r.id, kind: r.kind, lng: r.lng, lat: r.lat, confirms: r.confirms, createdAt: Date.parse(r.created_at), expiresAt: Date.parse(r.expires_at),
      }));
    },
  });
  // expire locally too, so a pin disappears on time even between refetches
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => (remote ? (data ?? []) : local).filter((r) => r.expiresAt > now), [remote, data, local, now]);
}

export function useReportActions(demoMode: boolean) {
  const remote = useRemote() && !demoMode;
  const qc = useQueryClient();
  const addReport = useCommunity((s) => s.addReport);
  const voteLocal = useCommunity((s) => s.voteReport);

  const report = useCallback(async (kind: RoadReportKind, lng: number, lat: number): Promise<boolean> => {
    if (remote) {
      const { error } = await supabase!.rpc('report_road', { p_kind: kind, p_lng: lng, p_lat: lat });
      if (error) return false; // e.g. rate limit (6 per hour)
      void qc.invalidateQueries({ queryKey: ['road-reports'] });
    } else {
      const t = Date.now();
      addReport({ id: uid(), kind, lng, lat, confirms: 0, createdAt: t, expiresAt: t + REPORT_TTL_MS, mine: true });
    }
    telemetry.track('road_report_created', { kind });
    return true;
  }, [remote, qc, addReport]);

  const vote = useCallback(async (id: string, stillThere: boolean) => {
    if (remote) {
      await supabase!.rpc('vote_road_report', { p_report: id, p_still_there: stillThere });
      void qc.invalidateQueries({ queryKey: ['road-reports'] });
    } else voteLocal(id, stillThere);
  }, [remote, qc, voteLocal]);

  return { report, vote };
}

/** A few fictional pins so the demo map shows what reports look like. They are labelled demo in the UI and expire like real ones. */
export function useSeedDemoReports(demoMode: boolean) {
  const reports = useCommunity((s) => s.reports);
  const add = useCommunity((s) => s.addReport);
  useEffect(() => {
    if (!demoMode || reports.some((r) => r.id.startsWith('demo-'))) return;
    const t = Date.now();
    const mk = (n: number, kind: RoadReportKind, lng: number, lat: number): RoadReport => ({ id: `demo-${n}-${t}`, kind, lng, lat, confirms: 2, createdAt: t, expiresAt: t + REPORT_TTL_MS });
    add(mk(1, 'police', 21.1531, 55.7152));
    add(mk(2, 'checkpoint', 21.1122, 55.6838));
    add(mk(3, 'hidden_police', 21.1743, 55.7311));
  }, [demoMode, reports, add]);
}

/* ------------------------------ cruise invites ------------------------------ */

export function useInviteActions(demoMode: boolean) {
  const remote = useRemote() && !demoMode;
  const addInvite = useCommunity((s) => s.addInvite);
  const setStatus = useCommunity((s) => s.setInviteStatus);

  const invite = useCallback(async (driver: OnlineDriver, message: string, lng: number, lat: number): Promise<boolean> => {
    if (remote && !driver.demo) {
      const { error } = await supabase!.rpc('send_cruise_invite', { p_to: driver.id, p_message: message, p_lng: lng, p_lat: lat });
      if (error) return false;
    }
    const inv: CruiseInvite = { id: uid(), toId: driver.id, toName: driver.name, message, createdAt: Date.now(), status: 'pending' };
    addInvite(inv);
    // demo drivers answer after a few seconds so the flow can be tried end to end
    if (driver.demo) setTimeout(() => setStatus(inv.id, 'accepted'), 4000);
    telemetry.track('cruise_invite_sent');
    return true;
  }, [remote, addInvite, setStatus]);

  return { invite };
}
