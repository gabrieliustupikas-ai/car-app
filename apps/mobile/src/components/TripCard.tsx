import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LocalTrip } from '@/db/localDb';
import { formatDateTime, formatDuration, formatKm } from '@/lib/format';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './ui/AppText';
import { GlassCard } from './ui/GlassCard';

export function TripCard({ trip }: { trip: LocalTrip }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const status = trip.isDemo ? t('trips.localOnly')
    : trip.syncStatus === 'synced' ? t('trips.synced') : trip.syncStatus === 'failed' ? t('trips.failed') : t('trips.pending');
  const statusIcon = trip.syncStatus === 'synced' ? 'cloud-done-outline' : trip.syncStatus === 'failed' ? 'cloud-offline-outline' : 'cloud-upload-outline';
  const km = formatKm(trip.distanceM, i18n.language);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatDateTime(trip.startedAt, i18n.language)}, ${km} ${t('common.km')}, ${trip.xpTotal} XP`}
      onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.clientTripId } })}
    >
      <GlassCard>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="small" color="textMuted">{formatDateTime(trip.startedAt, i18n.language)}</AppText>
            <View style={styles.row}>
              <AppText variant="h2">{km}</AppText>
              <AppText color="textMuted"> {t('common.km')} · {formatDuration(trip.durationS)}</AppText>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <AppText variant="h3" color={trip.xpTotal > 0 ? 'accent' : 'textFaint'}>+{trip.xpTotal} XP</AppText>
            {trip.isPassenger ? <AppText variant="small" color="warning">{t('trips.passenger')}</AppText>
              : trip.verdict === 'rejected' ? <AppText variant="small" color="danger">{t('trips.rejected')}</AppText> : null}
          </View>
        </View>
        <View style={[styles.row, { marginTop: space.sm, gap: space.xs }]}>
          <Ionicons name={statusIcon} size={14} color={colors.textFaint} />
          <AppText variant="small" color="textFaint">{status}</AppText>
          {trip.newHexes > 0 && <AppText variant="small" color="textFaint"> · {trip.newHexes} ⬡</AppText>}
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' } });
