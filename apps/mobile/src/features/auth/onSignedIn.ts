import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { CONSENT_VERSION, useSettings } from '@/stores/settings';
import { pullRemoteTrips, requestSync } from '@/tracking/sync';

/** First-sign-in housekeeping: persist onboarding choices server-side, pull history, flush the queue. */
export async function onSignedIn(session: Session): Promise<void> {
  if (!supabase) return;
  const s = useSettings.getState();
  try {
    await supabase.from('profiles').update({
      language: s.language,
      ...(s.ageConfirmed ? { age_confirmed_at: new Date().toISOString() } : {}),
    }).eq('id', session.user.id);

    if (s.consents && !s.consentsSynced) {
      const c = s.consents;
      const { error } = await supabase.from('consents').insert([
        { user_id: session.user.id, kind: 'terms', version: CONSENT_VERSION, granted: c.terms },
        { user_id: session.user.id, kind: 'privacy', version: CONSENT_VERSION, granted: c.terms },
        { user_id: session.user.id, kind: 'location_background', version: CONSENT_VERSION, granted: c.locationBackground },
        { user_id: session.user.id, kind: 'analytics', version: CONSENT_VERSION, granted: c.analytics },
      ]);
      if (!error) s.set({ consentsSynced: true });
    }
    await pullRemoteTrips();
  } catch (e) {
    telemetry.captureException(e, { scope: 'onSignedIn' });
  }
  telemetry.track('sign_in');
  requestSync(300);
}
