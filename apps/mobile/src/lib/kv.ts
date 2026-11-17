import Storage from 'expo-sqlite/kv-store';
import type { StateStorage } from 'zustand/middleware';

/** Synchronous KV for zustand persistence (instant hydration → no onboarding flicker). */
export const syncKv: StateStorage = {
  getItem: (k) => Storage.getItemSync(k),
  setItem: (k, v) => Storage.setItemSync(k, v),
  removeItem: (k) => { Storage.removeItemSync(k); },
};

/** Async KV with the AsyncStorage-like shape Supabase auth expects. */
export const asyncKv = {
  getItem: (k: string) => Storage.getItemAsync(k),
  setItem: (k: string, v: string) => Storage.setItemAsync(k, v),
  removeItem: async (k: string) => { await Storage.removeItemAsync(k); },
};
