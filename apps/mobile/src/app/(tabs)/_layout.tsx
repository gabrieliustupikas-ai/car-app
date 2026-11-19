import { Tabs } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { FloatingTabBar, type BottomTabBarProps } from '@/components/FloatingTabBar';
import { useTracking } from '@/stores/tracking';

export default function TabsLayout() {
  const { t } = useTranslation();
  // Driving mode: hide the tab bar so there is nothing small to tap while moving.
  const driving = useTracking((s) => s.activeTripId != null && (s.lastFix?.speed ?? 0) > 3);
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: driving ? 'none' : 'flex' } }}
      tabBar={(props) => (driving ? null : <FloatingTabBar {...(props as unknown as BottomTabBarProps)} />)}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover') }} />
      <Tabs.Screen name="trips" options={{ title: t('tabs.trips') }} />
      <Tabs.Screen name="radio" options={{ title: t('tabs.radio') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
      <Tabs.Screen name="clubs" options={{ href: null }} />
    </Tabs>
  );
}
