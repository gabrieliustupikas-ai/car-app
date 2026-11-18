import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { syncKv } from '@/lib/kv';

export type ChannelKind = 'nearby' | 'friends' | 'club' | 'cruise' | 'private';
export type RadioStatus = 'idle' | 'transmitting' | 'receiving';

export interface Transmission {
  id: string;
  fromId: string; // 'me' for own transmissions
  fromName: string;
  car?: string;
  text?: string;
  durationS: number;
  at: number;
}

interface RadioState {
  channel: ChannelKind;
  radiusKm: 1 | 2 | 5 | 10;
  listenOnly: boolean;
  duckMusic: boolean;
  readAloud: boolean;
  muted: string[];
  status: RadioStatus;
  speaker: { id: string; name: string; car?: string } | null;
  level: number; // 0..1 live audio level (mic when transmitting, synthetic when receiving)
  log: Transmission[];
  set: (p: Partial<Omit<RadioState, 'set' | 'push' | 'toggleMute'>>) => void;
  push: (t: Transmission) => void;
  toggleMute: (id: string) => void;
}

export const useRadio = create<RadioState>()(
  persist(
    (set) => ({
      channel: 'nearby', radiusKm: 5, listenOnly: false, duckMusic: true, readAloud: true, muted: [],
      status: 'idle', speaker: null, level: 0, log: [],
      set: (p) => set(p),
      push: (t) => set((s) => ({ log: [t, ...s.log].slice(0, 30) })),
      toggleMute: (id) => set((s) => ({ muted: s.muted.includes(id) ? s.muted.filter((x) => x !== id) : [...s.muted, id] })),
    }),
    {
      name: 'roadclub.radio.v1', storage: createJSONStorage(() => syncKv),
      partialize: (s) => ({ channel: s.channel, radiusKm: s.radiusKm, listenOnly: s.listenOnly, duckMusic: s.duckMusic, readAloud: s.readAloud, muted: s.muted }) as RadioState,
    },
  ),
);
