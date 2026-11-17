import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TripCard } from '@/components/TripCard';
import { AppText } from '@/components/ui/AppText';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { seedDemoHistory } from '@/demo/demoMode';
import { useTrips } from '@/features/trips/api';
import { useSettings } from '@/stores/settings';
import { syncPendingTrips } from '@/tracking/sync';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function TripsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const demoMode = useSettings((s) => s.demoMode);
  const { data, isLoading, isError, refetch, isRefetching } = useTrips();

  const body = isLoading ? (
    <View style={styles.list}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} style={{ borderRadius: 24 }} />)}</View>
  ) : isError ? (
    <ErrorState onRetry={() => void refetch()} />
  ) : (
    <FlatList
      data={data}
      keyExtractor={(trip) => trip.clientTripId}
      renderItem={({ item }) => <TripCard trip={item} />}
      contentContainerStyle={[styles.list, (data?.length ?? 0) === 0 && { flex: 1 }]}
      refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching}
        onRefresh={async () => { await syncPendingTrips(); await refetch(); }} />}
      ListEmptyComponent={
        <EmptyState icon="car-sport-outline" title={t('trips.empty')} body={t('trips.emptyBody')}
          action={demoMode ? { label: t('trips.loadDemo'), onPress: () => void seedDemoHistory() } : undefined} />
      }
      initialNumToRender={8}
      windowSize={7}
    />
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppText variant="h1" accessibilityRole="header" style={styles.title}>{t('trips.title')}</AppText>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: space.lg, paddingTop: space.md },
  list: { padding: space.lg, gap: space.md },
});
