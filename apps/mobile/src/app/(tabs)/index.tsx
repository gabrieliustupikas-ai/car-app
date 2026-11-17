import { Ionicons } from '@expo/vector-icons';
import { DEMO_ROUTES } from '@roadclub/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HoldButton } from '@/components/HoldButton';
import { RoadMap, RouteLine } from '@/components/map/RoadMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { simulateDrive, stopSimulation } from '@/demo/demoMode';
import { formatDuration, formatKm } from '@/lib/format';
import { useSettings } from '@/stores/settings';
import { useTracking } from '@/stores/tracking';
import { requestLocationPermissions, applyProfile } from '@/tracking/controller';
import { startManualTrip, stopTrip } from '@/tracking/recorder';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
}

function RoundButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={[styles.round, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <Ionicons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}

export default function MapHome() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const phase = useTracking((s) => s.phase);
  const activeTripId = useTracking((s) => s.activeTripId);
  const startedAt = useTracking((s) => s.startedAt);
  const distanceM = useTracking((s) => s.distanceM);
  const livePath = useTracking((s) => s.livePath);
  const permission = useTracking((s) => s.permission);
  const simulating = useTracking((s) => s.simulating);
  const demoMode = useSettings((s) => s.demoMode);
  const autoDetect = useSettings((s) => s.autoDetect);
  const elapsed = useElapsed(startedAt);
  const [follow, setFollow] = useState(true);
  const routeIdx = useRef(0);

  const recording = activeTripId != null;
  const phaseColor = recording ? colors.success : phase === 'candidate' ? colors.warning : colors.textFaint;
  const phaseLabel = recording ? t('map.driving') : t(`map.${phase}`);

  const start = async () => {
    if (demoMode) {
      const idx = routeIdx.current++ % DEMO_ROUTES.length;
      await simulateDrive(idx);
      return;
    }
    if (permission === 'denied' || permission === 'unknown') {
      const p = await requestLocationPermissions();
      if (p === 'denied') return;
    }
    await startManualTrip();
    await applyProfile('driving', true);
  };
  const end = async () => {
    if (simulating) await stopSimulation();
    else await stopTrip();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <RoadMap follow={follow || recording} pitch={recording ? 55 : 35}>
        <RouteLine id="live" coordinates={livePath} />
      </RoadMap>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <GlassCard padded={false} style={styles.statusCard}>
          <View style={styles.statusRow} accessible accessibilityRole="summary"
            accessibilityLabel={`${phaseLabel}. ${t('map.visibilityOff')}`}>
            <View style={[styles.dot, { backgroundColor: phaseColor }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{simulating ? t('map.simulating', { route: simulating }) : phaseLabel}</AppText>
              <AppText variant="small" color="textMuted">
                {t('map.autoDetect')}: {autoDetect && !demoMode ? t('common.on') : t('common.off')} · <Ionicons name="eye-off-outline" size={12} /> {t('map.visibilityOff')}
              </AppText>
            </View>
          </View>
        </GlassCard>
        {!recording && (
          <View style={styles.sideButtons}>
            <RoundButton icon="layers-outline" label={t('map.layers')} onPress={() => Alert.alert(t('map.layers'), t('map.layersSoon'))} />
            <RoundButton icon="locate-outline" label={t('map.recenter')} onPress={() => setFollow(true)} />
          </View>
        )}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
        {recording ? (
          <GlassCard style={{ gap: space.md }}>
            <AppText variant="small" color="accent">{t('map.drivingMode').toUpperCase()}</AppText>
            <View style={styles.hudRow}>
              <View>
                <AppText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{formatKm(distanceM, i18n.language)}</AppText>
                <AppText color="textMuted">{t('common.km')}</AppText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="h1" style={{ fontVariant: ['tabular-nums'] }}>{formatDuration(elapsed)}</AppText>
              </View>
            </View>
            <AppText variant="body" color="textMuted">{t('map.drivingReminder')}</AppText>
            <HoldButton label={t('map.holdToEnd')} onConfirm={() => void end()} />
          </GlassCard>
        ) : (
          <View style={{ gap: space.sm }}>
            {!demoMode && permission !== 'always' && (
              <GlassCard>
                <View style={styles.permRow}>
                  <Ionicons name="warning-outline" size={20} color={colors.warning} />
                  <AppText variant="small" style={{ flex: 1 }}>{t('map.permissionNeeded')}</AppText>
                  <Button size="md" variant="secondary" label={t('map.grant')} onPress={() => void requestLocationPermissions().then(() => applyProfile(phase, true))} />
                </View>
              </GlassCard>
            )}
            <Button size="driving" label={demoMode ? t('map.simulate') : t('map.startTrip')} onPress={() => void start()}
              icon={<Ionicons name={demoMode ? 'play' : 'car-sport'} size={26} color={colors.onAccent} />} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg, gap: space.md },
  statusCard: { marginTop: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  sideButtons: { alignSelf: 'flex-end', gap: space.sm },
  round: { width: touch.min + 4, height: touch.min + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.lg },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
