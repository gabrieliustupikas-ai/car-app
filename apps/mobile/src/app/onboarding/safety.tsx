import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { telemetry } from '@/lib/telemetry';
import { useSettings } from '@/stores/settings';
import { ensureTracking } from '@/tracking/controller';
import { useTheme } from '@/theme/useTheme';

export default function Safety() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const set = useSettings((s) => s.set);
  const [pledge, setPledge] = useState(false);
  return (
    <OnboardingFrame step={5} title={t('onboarding.safetyTitle')} body={t('onboarding.safetyBody')}
      footer={
        <Button label={t('onboarding.start')} disabled={!pledge} onPress={() => {
          // Stack.Protected guards move us to sign-in automatically once onboarded flips.
          set({ safetyPledged: true, onboarded: true });
          telemetry.track('onboarding_completed');
          void ensureTracking();
        }} />
      }>
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Ionicons name="shield-checkmark-outline" size={96} color={colors.accent} />
      </View>
      <GlassCard>
        <SettingRow label={t('onboarding.safetyPledge')} value={pledge} onValueChange={setPledge} />
      </GlassCard>
    </OnboardingFrame>
  );
}
