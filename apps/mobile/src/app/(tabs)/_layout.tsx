import { Tabs } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { FloatingTabBar, type BottomTabBarProps } from '@/components/FloatingTabBar';
import { MapBackdrop } from '@/components/layout/MapBackdrop';
import { useTracking } from '@/stores/tracking';
import { useTheme } from '@/theme/useTheme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Driving mode: hide the tab bar so there is nothing small to tap while moving.
  const driving = useTracking((s) => s.activeTripId != null && (s.lastFix?.speed ?? 0) > 3);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapBackdrop />
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' }, tabBarStyle: { display: driving ? 'none' : 'flex' } }}
        tabBar={(props) => (driving ? null : <FloatingTabBar {...(props as unknown as BottomTabBarProps)} />)}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.map') }} />
        <Tabs.Screen name="discover" options={{ title: t('tabs.discover') }} />
        <Tabs.Screen name="trips" options={{ title: t('tabs.trips') }} />
        <Tabs.Screen name="radio" options={{ title: t('tabs.radio') }} />
        <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
        <Tabs.Screen name="clubs" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
