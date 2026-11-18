import { Ionicons } from '@expo/vector-icons';
import { KLAIPEDA_ROUTES } from '@roadclub/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HoldButton } from '@/components/HoldButton';
import { DriversLayer, PlacesLayer, RoadMap, RouteLine, UserPuck } from '@/components/map/RoadMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { isWebPreview } from '@/config/env';
import { simulateDrive, stopSimulation } from '@/demo/demoMode';
import { demoDriver, KLAIPEDA_MAP_PLACES, placeById, useDemoDrivers } from '@/features/demo/useDemoDrivers';
import { formatDuration, formatKm } from '@/lib/format';
import { useMapLayers } from '@/stores/mapLayers';
import { useSettings } from '@/stores/settings';
import { useTracking } from '@/stores/tracking';
import { applyProfile, requestLocationPermissions } from '@/tracking/controller';
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

function RoundButton({ icon, label, onPress, active }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={[styles.round, { backgroundColor: active ? colors.accent : colors.glass, borderColor: colors.glassBorder }]}>
      <Ionicons name={icon} size={22} color={active ? colors.onAccent : colors.text} />
    </Pressable>
  );
}

const CAR_DOT: Record<string, string> = { red: '#E10600', silver: '#C9CED6', black: '#16181B' };

export default function MapHome() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const phase = useTracking((s) => s.phase);
  const activeTripId = useTracking((s) => s.activeTripId);
  const startedAt = useTracking((s) => s.startedAt);
  const distanceM = useTracking((s) => s.distanceM);
  const livePath = useTracking((s) => s.livePath);
  const lastFix = useTracking((s) => s.lastFix);
  const permission = useTracking((s) => s.permission);
  const simulating = useTracking((s) => s.simulating);
  const demoMode = useSettings((s) => s.demoMode) || isWebPreview;
  const autoDetect = useSettings((s) => s.autoDetect);
  const layers = useMapLayers();
  const drivers = useDemoDrivers(demoMode && layers.drivers);
  const elapsed = useElapsed(startedAt);
  const [showLayers, setShowLayers] = useState(false);
  const [selected, setSelected] = useState<{ kind: 'driver' | 'place'; id: string } | null>(null);
  const routeIdx = useRef(0);

  const recording = activeTripId != null;
  const simCoord = useMemo<[number, number] | null>(
    () => (simulating && lastFix ? [lastFix.lng, lastFix.lat] : null), [simulating, lastFix]);
  const phaseColor = recording ? colors.accent : phase === 'candidate' ? colors.warning : colors.textFaint;
  const phaseLabel = recording ? t('map.driving') : t(`map.${phase}`);
  const driver = selected?.kind === 'driver' ? demoDriver(selected.id) : undefined;
  const place = selected?.kind === 'place' ? placeById(selected.id) : undefined;

  const start = async () => {
    setSelected(null);
    if (demoMode) {
      await simulateDrive(routeIdx.current++ % KLAIPEDA_ROUTES.length, 8, KLAIPEDA_ROUTES);
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
      <RoadMap follow={!simulating} followCoord={simCoord} pitch={recording ? 55 : 45} controlsBottomInset={recording ? 250 : 112}>
        {layers.places && <PlacesLayer places={KLAIPEDA_MAP_PLACES} onPress={(id) => setSelected({ kind: 'place', id })} />}
        <RouteLine id="live" coordinates={livePath} />
        {demoMode && <DriversLayer drivers={drivers} onPress={(id) => setSelected({ kind: 'driver', id })} />}
        <UserPuck coord={simCoord} />
      </RoadMap>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <GlassCard padded={false} style={styles.statusCard}>
          <View style={styles.statusRow} accessible accessibilityRole="summary" accessibilityLabel={`${phaseLabel}. ${t('map.visibilityOff')}`}>
            <View style={[styles.dot, { backgroundColor: phaseColor }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{simulating ? t('map.simulating', { route: simulating }) : phaseLabel}</AppText>
              <AppText variant="small" color="textMuted">
                {demoMode ? t('map.driversNearby', { count: drivers.length }) : `${t('map.autoDetect')}: ${autoDetect ? t('common.on') : t('common.off')}`}
                {' · '}<Ionicons name="eye-off-outline" size={12} /> {t('map.visibilityOff')}
              </AppText>
            </View>
            <AppText variant="label" color="textFaint">KLAIPĖDA</AppText>
          </View>
        </GlassCard>
        {!recording && (
          <View style={styles.sideButtons}>
            <RoundButton icon="layers-outline" label={t('map.layers')} active={showLayers} onPress={() => setShowLayers((v) => !v)} />
          </View>
        )}
        {showLayers && !recording && (
          <GlassCard style={styles.layersPanel}>
            <AppText variant="label" color="textMuted">{t('map.layers').toUpperCase()}</AppText>
            {demoMode && <SettingRow label={t('map.layerDrivers')} value={layers.drivers} onValueChange={() => layers.toggle('drivers')} />}
            <SettingRow label={t('map.layerPlaces')} value={layers.places} onValueChange={() => layers.toggle('places')} />
          </GlassCard>
        )}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
        {recording ? (
          <GlassCard style={{ gap: space.md }}>
            <AppText variant="label" color="accent">{t('map.drivingMode').toUpperCase()}</AppText>
            <View style={styles.hudRow}>
              <View>
                <AppText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{formatKm(distanceM, i18n.language)}</AppText>
                <AppText color="textMuted">{t('common.km')}</AppText>
              </View>
              <AppText variant="h1" style={{ fontVariant: ['tabular-nums'] }}>{formatDuration(elapsed)}</AppText>
            </View>
            <AppText variant="body" color="textMuted">{t('map.drivingReminder')}</AppText>
            <HoldButton label={t('map.holdToEnd')} onConfirm={() => void end()} />
          </GlassCard>
        ) : (
          <View style={{ gap: space.sm }}>
            {driver && (
              <GlassCard>
                <View style={styles.cardRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt, borderColor: CAR_DOT[driver.carColor] }]}>
                    <AppText variant="h3">{driver.initials}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{driver.name}</AppText>
                    <AppText variant="small" color="textMuted">{driver.car} · {t('profile.level', { level: driver.level })}</AppText>
                    <AppText variant="small" color="textFaint">{driver.club} · {t('map.demoProfile')}</AppText>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setSelected(null)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Button size="md" variant="secondary" label={t('map.talkOnRadio')} style={{ marginTop: space.md }}
                  icon={<Ionicons name="radio-outline" size={18} color={colors.text} />} onPress={() => router.push('/radio')} />
              </GlassCard>
            )}
            {place && (
              <GlassCard>
                <View style={styles.cardRow}>
                  <Ionicons name="location" size={26} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{place.title}</AppText>
                    <AppText variant="small" color="textMuted">{t(`map.place_${place.category}`)} · © OpenStreetMap</AppText>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setSelected(null)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
              </GlassCard>
            )}
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
  layersPanel: { alignSelf: 'flex-end', width: 260 },
  round: { width: touch.min + 4, height: touch.min + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.lg },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
