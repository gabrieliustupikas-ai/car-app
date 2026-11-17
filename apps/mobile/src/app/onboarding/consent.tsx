import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { CONSENT_VERSION, DEFAULT_RETENTION_DAYS, useSettings } from '@/stores/settings';

/** GDPR: explicit, granular, unticked by default; only terms are required. */
export default function Consent() {
  const { t } = useTranslation();
  const set = useSettings((s) => s.set);
  const [terms, setTerms] = useState(false);
  const [location, setLocation] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  return (
    <OnboardingFrame step={3} title={t('onboarding.consentTitle')} body={t('onboarding.consentBody')}
      footer={
        <Button label={t('common.continue')} disabled={!terms} onPress={() => {
          set({ consents: { terms, locationBackground: location, analytics, version: CONSENT_VERSION, at: Date.now() }, autoDetect: location, consentsSynced: false });
          router.push('/onboarding/permissions');
        }} />
      }>
      <GlassCard>
        <SettingRow label={t('onboarding.consentTerms')} value={terms} onValueChange={setTerms} />
        <SettingRow label={t('onboarding.consentLocation')} value={location} onValueChange={setLocation} />
        <SettingRow label={t('onboarding.consentAnalytics')} value={analytics} onValueChange={setAnalytics} />
      </GlassCard>
      <AppText variant="small" color="textMuted">{t('onboarding.consentDefaults', { days: DEFAULT_RETENTION_DAYS })}</AppText>
    </OnboardingFrame>
  );
}
