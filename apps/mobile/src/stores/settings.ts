import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { detectLanguage, type LanguageCode } from '@/i18n';
import { syncKv } from '@/lib/kv';

export interface Consents {
  terms: boolean;
  locationBackground: boolean;
  analytics: boolean;
  version: string;
  at: number;
}

interface SettingsState {
  language: LanguageCode;
  themePreference: 'system' | 'dark' | 'light';
  highContrast: boolean;
  ageConfirmed: boolean;
  consents: Consents | null;
  safetyPledged: boolean;
  onboarded: boolean;
  /** demo mode: local-only data + simulated drives, no account needed */
  demoMode: boolean;
  autoDetect: boolean;
  /** consents not yet written to the server (written after sign-in) */
  consentsSynced: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const CONSENT_VERSION = '2026-11';
export const DEFAULT_RETENTION_DAYS = 365;

const initial = {
  language: detectLanguage(),
  themePreference: 'light' as const,
  highContrast: false,
  ageConfirmed: false,
  consents: null,
  safetyPledged: false,
  onboarded: false,
  demoMode: false,
  autoDetect: true,
  consentsSynced: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      reset: () => set(initial),
    }),
    { name: 'roadclub.settings.v1', storage: createJSONStorage(() => syncKv), version: 1 },
  ),
);
