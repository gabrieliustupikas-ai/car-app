/**
 * Sentry-style error + analytics hooks. Phase 1 ships a stub that logs in development and keeps a
 * small in-memory ring buffer of breadcrumbs. Swap the bodies for @sentry/react-native and your
 * analytics SDK later — call sites won't change.
 * Privacy: never pass coordinates, emails or free text here.
 */
import { env } from '@/config/env';

type Props = Record<string, string | number | boolean | null | undefined>;
const breadcrumbs: { t: number; message: string; data?: Props }[] = [];
let userId: string | null = null;

export const telemetry = {
  init() {
    if (env.sentryDsn) console.info('[telemetry] DSN configured — connect @sentry/react-native here');
  },
  setUser(id: string | null) { userId = id; },
  breadcrumb(message: string, data?: Props) {
    breadcrumbs.push({ t: Date.now(), message, ...(data ? { data } : {}) });
    if (breadcrumbs.length > 50) breadcrumbs.shift();
  },
  captureException(error: unknown, context?: Props) {
    if (__DEV__) console.error('[telemetry] exception', error, context, { userId, breadcrumbs: breadcrumbs.slice(-5) });
  },
  track(event: AnalyticsEvent, props?: Props) {
    telemetry.breadcrumb(`event:${event}`, props);
    if (__DEV__ && env.analyticsEnabled) console.info('[analytics]', event, props);
  },
};

export type AnalyticsEvent =
  | 'onboarding_completed' | 'sign_in' | 'sign_out' | 'demo_mode_enabled'
  | 'trip_started' | 'trip_ended' | 'trip_discarded' | 'trip_synced' | 'trip_sync_failed'
  | 'trip_marked_passenger' | 'level_up' | 'data_exported' | 'account_deleted' | 'drive_simulated';
