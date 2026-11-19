import { Ionicons } from '@expo/vector-icons';
import { KLAIPEDA_ROUTES } from '@roadclub/core';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InviteSheet } from '@/components/community/InviteSheet';
import { REPORT_META, ReportSheet } from '@/components/community/ReportSheet';
import { HoldButton } from '@/components/HoldButton';
import { DriversLayer, PlacesLayer, ReportsLayer, RoadMap, RouteLine, UserPuck } from '@/components/map/RoadMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { Sheet } from '@/components/ui/Sheet';
import { isWebPreview } from '@/config/env';
import { simulateDrive, stopSimulation } from '@/demo/demoMode';
import { KLAIPEDA_CENTER, useInviteActions, useOnlineDrivers, useReportActions, useRoadReports, useSeedDemoReports } from '@/features/community/api';
import { useCommunity } from '@/features/community/store';
import type { OnlineDriver } from '@/features/community/types';
import { KLAIPEDA_MAP_PLACES, placeById } from '@/features/demo/useDemoDrivers';
import { formatDuration, formatKm } from '@/lib/format';
import { useMapLayers } from '@/stores/mapLayers';
import { useSettings } from '@/stores/settings';
import { useTracking } from '@/stores/tracking';
import { applyProfile, requestLocationPermissions } from '@/tracking/controller';
import { startManualTrip, stopTrip } from '@/tracking/recorder';
import { radius, shadow, space, touch } from '@/theme/tokens';
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

/** Re-renders every `ms` so time-based labels (greeting, report age, invite freshness) stay current. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function RoundButton({ icon, label, onPress, active, tint }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; active?: boolean; tint?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={[styles.round, shadow, { backgroundColor: active ? colors.accent : tint ?? colors.surface, borderColor: colors.glassBorder }]}>
      <Ionicons name={icon} size={22} color={active || tint ? colors.onAccent : colors.text} />
    </Pressable>
  );
}

const CAR_DOT: Record<string, string> = { red: '#F04349', silver: '#C9CED6', black: '#16181B' };

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
  const elapsed = useElapsed(startedAt);
  const now = useNow();
  const [showLayers, setShowLayers] = useState(false);
  const [selected, setSelected] = useState<{ kind: 'driver' | 'place' | 'report'; id: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [inviteTo, setInviteTo] = useState<OnlineDriver | null>(null);
  const [dismissedInvite, setDismissedInvite] = useState<string | null>(null);
  const routeIdx = useRef(0);

  const recording = activeTripId != null;
  const simCoord = useMemo<[number, number] | null>(
    () => (simulating && lastFix ? [lastFix.lng, lastFix.lat] : null), [simulating, lastFix]);
  const center: [number, number] = simCoord ?? (lastFix ? [lastFix.lng, lastFix.lat] : KLAIPEDA_CENTER);

  useSeedDemoReports(demoMode);
  const drivers = useOnlineDrivers(demoMode, center, layers.drivers);
  const reports = useRoadReports(demoMode, center);
  const { report, vote } = useReportActions(demoMode);
  const { invite } = useInviteActions(demoMode);
  const invites = useCommunity((s) => s.invites);

  const phaseColor = recording ? colors.accent : phase === 'candidate' ? colors.warning : colors.textFaint;
  const phaseLabel = recording ? t('map.driving') : t(`map.${phase}`);
  const driver = selected?.kind === 'driver' ? drivers.find((d) => d.id === selected.id) : undefined;
  const place = selected?.kind === 'place' ? placeById(selected.id) : undefined;
  const picked = selected?.kind === 'report' ? reports.find((r) => r.id === selected.id) : undefined;
  const accepted = invites.find((i) => i.status === 'accepted' && now - i.createdAt < 120_000 && i.id !== dismissedInvite);
  const tabBarHidden = recording && (lastFix?.speed ?? 0) > 3;
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? t('home.goodMorning') : hour < 18 ? t('home.goodAfternoon') : t('home.goodEvening');

  /** Where "here" is: simulated/last GPS fix, the demo city centre in demo mode, otherwise a fresh GPS reading (null if unavailable). */
  const getHere = async (): Promise<[number, number] | null> => {
    if (simCoord) return simCoord;
    if (lastFix) return [lastFix.lng, lastFix.lat];
    if (demoMode) return KLAIPEDA_CENTER;
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return [p.coords.longitude, p.coords.latitude];
    } catch { return null; }
  };

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

  const closeBtn = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setSelected(null)} hitSlop={12}>
      <Ionicons name="close" size={22} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <RoadMap follow={!simulating} followCoord={simCoord} pitch={recording ? 55 : 45} controlsBottomInset={tabBarHidden ? 250 : 200}>
        {layers.places && <PlacesLayer places={KLAIPEDA_MAP_PLACES} onPress={(id) => setSelected({ kind: 'place', id })} />}
        <RouteLine id="live" coordinates={livePath} />
        {layers.reports && <ReportsLayer reports={reports} onPress={(id) => setSelected({ kind: 'report', id })} />}
        {layers.drivers && <DriversLayer drivers={drivers} onPress={(id) => setSelected({ kind: 'driver', id })} />}
        <UserPuck coord={simCoord} />
      </RoadMap>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <GlassCard style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="small" color="textMuted">{greeting}</AppText>
              <AppText variant="h1" accessibilityRole="header" style={{ lineHeight: 34 }}>{t('home.findDrive')}</AppText>
            </View>
            <View style={[styles.dot, { backgroundColor: phaseColor }]} accessibilityLabel={phaseLabel} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('home.online', { count: drivers.length })} onPress={() => setOnlineOpen(true)}
            style={[styles.onlinePill, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
            <AppText variant="small" style={{ flex: 1 }}>{t('home.online', { count: drivers.length })}</AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
          <AppText variant="small" color="textMuted">
            {simulating ? t('map.simulating', { route: simulating }) : phaseLabel}{' · '}
            {demoMode ? t('map.demoProfile') : `${t('map.autoDetect')}: ${autoDetect ? t('common.on') : t('common.off')}`}
            {' · '}<Ionicons name="eye-off-outline" size={12} /> {t('map.visibilityOff')}
          </AppText>
        </GlassCard>
        {!recording && (
          <View style={styles.sideButtons}>
            <RoundButton icon="layers-outline" label={t('map.layers')} active={showLayers} onPress={() => setShowLayers((v) => !v)} />
            <RoundButton icon="shield" label={t('report.open')} tint="#2F6BFF" onPress={() => setReportOpen(true)} />
          </View>
        )}
        {showLayers && !recording && (
          <GlassCard style={styles.layersPanel}>
            <AppText variant="label" color="textMuted">{t('map.layers').toUpperCase()}</AppText>
            <SettingRow label={t('home.layerOnline')} value={layers.drivers} onValueChange={() => layers.toggle('drivers')} />
            <SettingRow label={t('home.layerReports')} value={layers.reports} onValueChange={() => layers.toggle('reports')} />
            <SettingRow label={t('map.layerPlaces')} value={layers.places} onValueChange={() => layers.toggle('places')} />
          </GlassCard>
        )}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={[styles.bottom, !tabBarHidden && { paddingBottom: 92 }]} pointerEvents="box-none">
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
            {accepted && (
              <GlassCard>
                <View style={styles.cardRow}>
                  <Ionicons name="checkmark-circle" size={26} color={colors.success} />
                  <AppText variant="body" style={{ flex: 1 }}>{t('invite.accepted', { name: accepted.toName })}</AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setDismissedInvite(accepted.id)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>
              </GlassCard>
            )}
            {driver && (
              <GlassCard>
                <View style={styles.cardRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt, borderColor: CAR_DOT[driver.carColor] }]}>
                    <AppText variant="h3">{driver.name.slice(0, 1)}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{driver.name}</AppText>
                    <AppText variant="small" color="textMuted">{[driver.car, driver.level ? t('profile.level', { level: driver.level }) : null].filter(Boolean).join(' · ')}</AppText>
                    <AppText variant="small" color="textFaint">{[driver.club, driver.demo ? t('map.demoProfile') : null].filter(Boolean).join(' · ')}</AppText>
                  </View>
                  {closeBtn}
                </View>
                <View style={styles.actions}>
                  <Button size="md" label={t('invite.action')} style={{ flex: 1 }} icon={<Ionicons name="car-sport" size={18} color={colors.onAccent} />} onPress={() => setInviteTo(driver)} />
                  <Pressable accessibilityRole="button" accessibilityLabel={t('map.talkOnRadio')} onPress={() => router.push('/radio')}
                    style={[styles.radioBtn, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="radio-outline" size={22} color={colors.text} />
                  </Pressable>
                </View>
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
                  {closeBtn}
                </View>
              </GlassCard>
            )}
            {picked && (
              <GlassCard>
                <View style={styles.cardRow}>
                  <View style={[styles.avatar, { backgroundColor: REPORT_META[picked.kind].color, borderColor: 'transparent' }]}>
                    <Ionicons name={REPORT_META[picked.kind].icon} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{t(`report.${picked.kind}`)}</AppText>
                    <AppText variant="small" color="textMuted">
                      {t('report.age', { min: Math.max(0, Math.round((now - picked.createdAt) / 60000)) })} · {t('report.confirmations', { count: picked.confirms })}
                      {picked.id.startsWith('demo-') ? ` · ${t('report.demo')}` : ''}
                    </AppText>
                  </View>
                  {closeBtn}
                </View>
                {!picked.mine && (
                  <View style={styles.actions}>
                    <Button size="md" label={t('report.stillThere')} style={{ flex: 1 }} onPress={() => { void vote(picked.id, true); setSelected(null); }} />
                    <Button size="md" variant="secondary" label={t('report.gone')} style={{ flex: 1 }} onPress={() => { void vote(picked.id, false); setSelected(null); }} />
                  </View>
                )}
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
            <GlassCard>
              <Pressable accessibilityRole="button" accessibilityLabel={demoMode ? t('map.simulate') : t('map.startTrip')} onPress={() => void start()} style={styles.startRow}>
                <View style={[styles.startIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={demoMode ? 'play' : 'car-sport'} size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{demoMode ? t('map.simulate') : t('map.startTrip')}</AppText>
                  <AppText variant="small" color="textMuted">{t('home.hereNow')} · {t('map.autoDetect')}: {autoDetect ? t('common.on') : t('common.off')}</AppText>
                </View>
                <View style={[styles.go, { backgroundColor: colors.accent }]}><Ionicons name="arrow-forward" size={24} color={colors.onAccent} /></View>
              </Pressable>
            </GlassCard>
          </View>
        )}
      </SafeAreaView>

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} onPick={async (kind) => {
        const here = await getHere();
        return here ? report(kind, here[0], here[1]) : false;
      }} />

      <Sheet visible={onlineOpen} onClose={() => setOnlineOpen(false)}>
        <AppText variant="h2">{t('home.online', { count: drivers.length })}</AppText>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: space.sm }}>
          {drivers.map((d) => (
            <View key={d.id} style={[styles.driverRow, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: CAR_DOT[d.carColor] }]}><AppText variant="h3">{d.name.slice(0, 1)}</AppText></View>
              <View style={{ flex: 1 }}>
                <AppText variant="body" numberOfLines={1}>{d.name}</AppText>
                <AppText variant="small" color="textMuted" numberOfLines={1}>{[d.car, d.club].filter(Boolean).join(' · ')}</AppText>
              </View>
              <Button size="md" label={t('invite.action')} onPress={() => { setOnlineOpen(false); setInviteTo(d); }} />
            </View>
          ))}
        </ScrollView>
      </Sheet>

      <InviteSheet visible={inviteTo != null} name={inviteTo?.name ?? ''} onClose={() => setInviteTo(null)} onSend={async (m) => {
        if (!inviteTo) return false;
        const here = await getHere();
        return here ? invite(inviteTo, m, here[0], here[1]) : false;
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg, gap: space.md },
  hero: { marginTop: space.sm, gap: space.sm, padding: space.lg },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 44 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  sideButtons: { alignSelf: 'flex-end', gap: space.sm },
  layersPanel: { alignSelf: 'flex-end', width: 280 },
  round: { width: touch.min + 4, height: touch.min + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.lg },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md, alignItems: 'center' },
  radioBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  startIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  go: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
