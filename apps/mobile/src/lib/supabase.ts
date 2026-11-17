import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env, hasBackend } from '@/config/env';
import { asyncKv } from './kv';

export const supabase: SupabaseClient | null = hasBackend
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { storage: asyncKv, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

// Refresh tokens only while the app is in the foreground (recommended for React Native).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
