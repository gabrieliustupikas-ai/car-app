import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { useSettings } from '@/stores/settings';

export default function AgeGate() {
  const { t } = useTranslation();
  const set = useSettings((s) => s.set);
  const [blocked, setBlocked] = useState(false);
  return (
    <OnboardingFrame step={2} title={t('onboarding.ageTitle')} body={t('onboarding.ageBody')}
      footer={blocked ? null : (
        <>
          <Button label={t('onboarding.ageYes')} onPress={() => { set({ ageConfirmed: true }); router.push('/onboarding/consent'); }} />
          <Button label={t('onboarding.ageNo')} variant="ghost" onPress={() => { set({ ageConfirmed: false }); setBlocked(true); }} />
        </>
      )}>
      {blocked && (
        <GlassCard><AppText variant="h3" color="warning" accessibilityRole="alert">{t('onboarding.ageBlocked')}</AppText></GlassCard>
      )}
    </OnboardingFrame>
  );
}
