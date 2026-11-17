import { z } from 'zod';

const EnvSchema = z.object({
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(20).optional(),
  mapboxToken: z.string().startsWith('pk.').optional(),
  mapboxStyleDark: z.string().optional(),
  mapboxStyleLight: z.string().optional(),
  sentryDsn: z.string().optional(),
  analyticsEnabled: z.boolean(),
});

const blank = (v: string | undefined) => (v && v.trim().length > 0 ? v.trim() : undefined);

// EXPO_PUBLIC_* must be referenced statically so Metro can inline them.
const parsed = EnvSchema.safeParse({
  supabaseUrl: blank(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: blank(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  mapboxToken: blank(process.env.EXPO_PUBLIC_MAPBOX_TOKEN),
  mapboxStyleDark: blank(process.env.EXPO_PUBLIC_MAPBOX_STYLE_DARK),
  mapboxStyleLight: blank(process.env.EXPO_PUBLIC_MAPBOX_STYLE_LIGHT),
  sentryDsn: blank(process.env.EXPO_PUBLIC_SENTRY_DSN),
  analyticsEnabled: process.env.EXPO_PUBLIC_ANALYTICS_ENABLED === 'true',
});

if (!parsed.success) {
  // Misconfigured env should be loud in development but never crash a release build.
  console.warn('[env] invalid environment, falling back to offline demo configuration', parsed.error.issues);
}

export const env = parsed.success ? parsed.data : { analyticsEnabled: false };
export const hasBackend = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const hasMapbox = Boolean(env.mapboxToken);
