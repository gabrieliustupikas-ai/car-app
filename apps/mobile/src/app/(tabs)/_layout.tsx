import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { useTracking } from '@/stores/tracking';
import { useTheme } from '@/theme/useTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Driving mode: hide the tab bar so there is nothing small to tap while moving.
  const driving = useTracking((s) => s.activeTripId != null && (s.lastFix?.speed ?? 0) > 3);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.glassBorder, display: driving ? 'none' : 'flex' },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.map'), tabBarIcon: icon('map') }} />
      <Tabs.Screen name="trips" options={{ title: t('tabs.trips'), tabBarIcon: icon('git-branch-outline') }} />
      <Tabs.Screen name="radio" options={{ title: t('tabs.radio'), tabBarIcon: icon('radio-outline') }} />
      <Tabs.Screen name="clubs" options={{ title: t('tabs.clubs'), tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
