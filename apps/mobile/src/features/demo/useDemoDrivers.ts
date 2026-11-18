import { DEMO_DRIVERS, demoDriverPosition, KLAIPEDA_PLACES, type DemoDriver } from '@roadclub/core';
import { useEffect, useState } from 'react';
import type { MapDriver, MapPlace } from '@/components/map/types';

/** Live positions of the Klaipėda demo drivers, refreshed twice a second while `enabled`. */
export function useDemoDrivers(enabled: boolean, intervalMs = 500): MapDriver[] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  if (!enabled) return [];
  return DEMO_DRIVERS.flatMap((d) => {
    const p = demoDriverPosition(d, now);
    return p ? [{ id: d.id, name: d.name, carColor: d.carColor, lng: p.lng, lat: p.lat, heading: p.heading }] : [];
  });
}

export function demoDriver(id: string | null): DemoDriver | undefined {
  return DEMO_DRIVERS.find((d) => d.id === id);
}

export const KLAIPEDA_MAP_PLACES: MapPlace[] = KLAIPEDA_PLACES.map((p, i) => ({ id: `p${i}`, title: p.title, category: p.category, lng: p.lng, lat: p.lat }));
export const placeById = (id: string | null) => KLAIPEDA_MAP_PLACES.find((p) => p.id === id);
