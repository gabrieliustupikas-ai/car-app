import type { StateStorage } from 'zustand/middleware';

const ls = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export const syncKv: StateStorage = {
  getItem: (k) => ls()?.getItem(k) ?? null,
  setItem: (k, v) => { try { ls()?.setItem(k, v); } catch { /* blocked */ } },
  removeItem: (k) => { ls()?.removeItem(k); },
};

export const asyncKv = {
  getItem: async (k: string) => ls()?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => { try { ls()?.setItem(k, v); } catch { /* blocked */ } },
  removeItem: async (k: string) => { ls()?.removeItem(k); },
};
