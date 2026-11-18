import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { syncKv } from '@/lib/kv';

interface MapLayersState {
  drivers: boolean;
  places: boolean;
  toggle: (k: 'drivers' | 'places') => void;
}

export const useMapLayers = create<MapLayersState>()(
  persist((set) => ({ drivers: true, places: true, toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<MapLayersState>) }),
    { name: 'roadclub.map-layers.v1', storage: createJSONStorage(() => syncKv), partialize: (s) => ({ drivers: s.drivers, places: s.places }) as MapLayersState }),
);
