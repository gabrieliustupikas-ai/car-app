import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { useSettings } from '@/stores/settings';
import { refreshPermissionState, requestLocationPermissions } from '@/tracking/controller';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Status = 'idle' | 'granted' | 'partial' | 'denied';

function PermissionCard({ icon, title, body, status, onAllow }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string; status: Status; onAllow?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <GlassCard>
      <View style={styles.row}>
        <Ionicons name={icon} size={28} color={colors.accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="h3">{title}</AppText>
          <AppText variant="small" color="textMuted">{body}</AppText>
        </View>
      </View>
      {onAllow && (
        <View style={{ marginTop: space.md }}>
          {status === 'granted' ? <AppText color="success">✓ {t('onboarding.allowed')}</AppText>
            : status === 'denied' ? <Button size="md" variant="ghost" label={t('onboarding.denied')} onPress={() => void Linking.openSettings()} />
            : <Button size="md" label={t('onboarding.allow')} onPress={onAllow} />}
        </View>
      )}
    </GlassCard>
  );
}

export default function Permissions() {
  const { t } = useTranslation();
  const backgroundConsent = useSettings((s) => s.consents?.locationBackground ?? false);
  const [loc, setLoc] = useState<Status>('idle');
  const [motion, setMotion] = useState<Status>('idle');
  const [notif, setNotif] = useState<Status>('idle');

  useEffect(() => {
    void refreshPermissionState().then((p) => setLoc(p === 'always' ? 'granted' : p === 'foreground' ? 'partial' : 'idle'));
  }, []);

  return (
    <OnboardingFrame step={4} title={t('onboarding.permissionsTitle')}
      footer={<Button label={t('common.continue')} onPress={() => router.push('/onboarding/safety')} />}>
      <PermissionCard icon="navigate-circle-outline" title={t('onboarding.permLocationTitle')} body={t('onboarding.permLocationBody')} status={loc}
        onAllow={async () => {
          if (!backgroundConsent) {
            const fg = await Location.requestForegroundPermissionsAsync();
            setLoc(fg.granted ? 'partial' : 'denied');
            return;
          }
          const p = await requestLocationPermissions();
          setLoc(p === 'always' ? 'granted' : p === 'foreground' ? 'partial' : 'denied');
        }} />
      <PermissionCard icon="walk-outline" title={t('onboarding.permMotionTitle')} body={t('onboarding.permMotionBody')} status={motion}
        onAllow={async () => {
          const r = await Location.requestMotionActivityPermissionsAsync().catch(() => null);
          setMotion(r?.granted ? 'granted' : 'denied');
        }} />
      <PermissionCard icon="notifications-outline" title={t('onboarding.permNotifTitle')} body={t('onboarding.permNotifBody')} status={notif}
        onAllow={async () => {
          const r = await Notifications.requestPermissionsAsync();
          setNotif(r.granted ? 'granted' : 'denied');
        }} />
      <PermissionCard icon="mic-outline" title={t('onboarding.permMicTitle')} body={t('onboarding.permMicBody')} status="idle" />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' } });
