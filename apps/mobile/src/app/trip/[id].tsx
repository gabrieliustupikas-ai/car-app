import { bbox, levelForXp, rankLabel } from '@roadclub/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { RoadMap, RouteLine } from '@/components/map/RoadMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { SettingRow } from '@/components/ui/SettingRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { XpBar } from '@/components/ui/XpBar';
import { useMarkPassenger, useProgress, useTrip } from '@/features/trips/api';
import { formatDateTime, formatDuration, formatInt, formatKm } from '@/lib/format';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function TripSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const trip = useTrip(id);
  const progress = useProgress();
  const markPassenger = useMarkPassenger();

  const coords = useMemo(() => (trip.data?.coords ?? []).map((c) => [c.lng, c.lat] as [number, number]), [trip.data]);
  const bounds = useMemo(() => {
    if (!trip.data || trip.data.coords.length < 2) return null;
    const b = bbox(trip.data.coords);
    return { ne: [b.maxLng, b.maxLat] as [number, number], sw: [b.minLng, b.minLat] as [number, number] };
  }, [trip.data]);

  if (trip.isLoading) {
    return <View style={[styles.flex, { backgroundColor: colors.bg, padding: space.lg, paddingTop: 120, gap: space.md }]}>
      <Skeleton height={260} /><Skeleton height={120} /><Skeleton height={160} />
    </View>;
  }
  if (trip.isError) return <ErrorState onRetry={() => void trip.refetch()} />;
  const tr = trip.data;
  if (!tr) return <EmptyState icon="help-circle-outline" title={t('trip.notFound')} />;

  const lang = i18n.language;
  const level = progress.data?.level ?? levelForXp(0);
  const withheld = tr.xpWithheld ?? (tr.isPassenger ? 'passenger' : null);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <View style={styles.map} accessibilityLabel={t('trip.summary')}>
        <RoadMap interactive={false} bounds={bounds} showUser={false} pitch={0} compact>
          <RouteLine id="trip" coordinates={coords} />
        </RoadMap>
      </View>
      <View style={styles.body}>
        <View>
          <AppText variant="small" color="textMuted">{formatDateTime(tr.startedAt, lang)}</AppText>
          <AppText variant="h1" accessibilityRole="header">{t('trip.summary')}</AppText>
        </View>

        <GlassCard>
          <View style={styles.grid}>
            <StatTile label={t('trip.distance')} value={formatKm(tr.distanceM, lang)} unit={t('common.km')} />
            <StatTile label={t('trip.duration')} value={formatDuration(tr.durationS)} />
            <StatTile label={t('trip.moving')} value={formatDuration(tr.movingTimeS)} />
            <StatTile label={t('trip.elevation')} value={formatInt(tr.elevationGainM, lang)} unit="m" />
          </View>
        </GlassCard>

        <GlassCard>
          <View style={{ gap: space.md }}>
            <View style={styles.between}>
              <AppText variant="h3">{t('trip.xpEarned')}</AppText>
              <AppText variant="h1" color={tr.xpTotal > 0 ? 'accent' : 'textFaint'}>+{formatInt(tr.xpTotal, lang)}</AppText>
            </View>
            {tr.xpLines.map((l) => (
              <View key={l.source} style={styles.between}>
                <AppText color="textMuted">{t(`trip.xp_${l.source}`)}</AppText>
                <AppText style={{ fontVariant: ['tabular-nums'] }}>+{formatInt(l.amount, lang)}</AppText>
              </View>
            ))}
            {withheld ? <AppText color="warning">{t(`trip.withheld_${withheld}`, { mode: tr.mode })}</AppText> : null}
            {tr.flags.includes('repeated_route') ? <AppText variant="small" color="warning">{t('trip.repeatedRoute')}</AppText> : null}
            {!tr.xpConfirmed && !tr.isDemo ? <AppText variant="small" color="textFaint">{t('trip.previewNote')}</AppText> : null}
            <View style={styles.between}>
              <AppText color="textMuted">{t('trip.newHexes')}</AppText>
              <AppText variant="h3">⬡ {tr.newHexes}</AppText>
            </View>
          </View>
        </GlassCard>

        <GlassCard>
          <View style={{ gap: space.sm }}>
            <View style={styles.between}>
              <AppText variant="h3">{t('trip.levelProgress')}</AppText>
              <AppText color="accent">{t('profile.level', { level: level.level })} · {rankLabel(level, lang)}</AppText>
            </View>
            <XpBar progress={level.progress} />
          </View>
        </GlassCard>

        <GlassCard>
          <SettingRow label={t('trip.iWasPassenger')} hint={t('trip.passengerHint')} value={tr.isPassenger}
            onValueChange={(v) => { if (v && !tr.isPassenger) markPassenger.mutate(tr); }} />
        </GlassCard>

        <Button variant="secondary" label={t('trip.share')} onPress={() => Alert.alert(t('trip.share'), t('trip.shareSoon'))} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  map: { height: 320, overflow: 'hidden' },
  body: { padding: space.lg, gap: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
