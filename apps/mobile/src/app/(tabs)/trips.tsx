import { useTranslation } from 'react-i18next';
import { withTabScene } from '@/components/layout/TabScene';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { TripCard } from '@/components/TripCard';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { seedDemoHistory } from '@/demo/demoMode';
import { useTrips } from '@/features/trips/api';
import { useSettings } from '@/stores/settings';
import { syncPendingTrips } from '@/tracking/sync';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

function TripsScreen() {
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
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl tintColor={colors.accent} refreshing={isRefetching}
        onRefresh={async () => { await syncPendingTrips(); await refetch(); }} />}
      ListEmptyComponent={
        <GlassCard style={{ marginTop: space.xl }}>
          <EmptyState icon="car-sport-outline" title={t('trips.empty')} body={t('trips.emptyBody')}
            action={demoMode ? { label: t('trips.loadDemo'), onPress: () => void seedDemoHistory() } : undefined} />
        </GlassCard>
      }
      initialNumToRender={8}
      windowSize={7}
    />
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={styles.title}><ScreenHeader title={t('trips.title')} subtitle={t('trips.eyebrow')} /></View>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: space.lg, paddingTop: space.sm },
  list: { padding: space.lg, gap: space.md, paddingBottom: 130 },
});

export default withTabScene(TripsScreen);
