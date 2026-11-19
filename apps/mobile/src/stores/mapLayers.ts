import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { syncKv } from '@/lib/kv';

type LayerKey = 'drivers' | 'places' | 'reports';

interface MapLayersState {
  drivers: boolean;
  places: boolean;
  reports: boolean;
  toggle: (k: LayerKey) => void;
}

export const useMapLayers = create<MapLayersState>()(
  persist((set) => ({ drivers: true, places: true, reports: true, toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<MapLayersState>) }),
    { name: 'roadclub.map-layers.v2', storage: createJSONStorage(() => syncKv), partialize: (s) => ({ drivers: s.drivers, places: s.places, reports: s.reports }) as MapLayersState }),
);
