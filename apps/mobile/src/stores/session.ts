import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

interface SessionState {
  session: Session | null;
  ready: boolean;
  setSession: (s: Session | null) => void;
  setReady: () => void;
}

export const useSession = create<SessionState>()((set) => ({
  session: null,
  ready: false,
  setSession: (session) => set({ session }),
  setReady: () => set({ ready: true }),
}));
