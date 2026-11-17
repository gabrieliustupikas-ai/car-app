import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { BRAND } from '@/config/brand';
import { LANGUAGES, initI18n } from '@/i18n';
import { useSettings } from '@/stores/settings';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Welcome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const language = useSettings((s) => s.language);
  const set = useSettings((s) => s.set);
  return (
    <OnboardingFrame step={1} title={t('onboarding.welcomeTitle')} body={t('onboarding.welcomeBody')}
      footer={<Button label={t('common.continue')} onPress={() => router.push('/onboarding/age')} />}>
      <View style={styles.logo}>
        <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <AppText variant="hero" style={{ color: colors.onAccent, letterSpacing: 4 }}>{BRAND.name}</AppText>
      </View>
      <AppText variant="h3">{t('onboarding.chooseLanguage')}</AppText>
      <View style={styles.chips}>
        {LANGUAGES.map((l) => (
          <Chip key={l.code} label={l.label} selected={language === l.code}
            onPress={() => { set({ language: l.code }); initI18n(l.code); }} />
        ))}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  logo: { height: 160, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
