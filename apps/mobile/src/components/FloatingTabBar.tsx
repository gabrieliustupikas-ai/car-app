import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/components/ui/AppText';

type TabPressEvent = { type: 'tabPress'; target: string; canPreventDefault: true };

/**
 * The subset of bottom-tab props this bar uses. Expo Router 58 passes `emitter` + `navigateToTab`
 * (React Navigation 7 style passes `navigation`); both are supported.
 */
export interface BottomTabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<string, { options: { title?: string } } | undefined>;
  emitter?: { emit: (e: TabPressEvent) => { defaultPrevented: boolean } };
  navigateToTab?: (routeKey: string) => void;
  navigation?: {
    emit: (e: TabPressEvent) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['map', 'map-outline'],
  discover: ['compass', 'compass-outline'],
  trips: ['git-branch', 'git-branch-outline'],
  radio: ['radio', 'radio-outline'],
  profile: ['person', 'person-outline'],
};

/**
 * Floating dock: graphite capsule, icon over a tracked uppercase label. The active tab lights its
 * icon red with a short red indicator above it — like a lit switch on a dashboard.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => ICONS[r.name]);
  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
      <View style={[styles.bar, { backgroundColor: 'rgba(14,16,19,0.96)', borderColor: colors.glassBorder }]}>
        {routes.map((route) => {
          const focused = state.routes[state.index]?.key === route.key;
          const label = descriptors[route.key]?.options.title ?? route.name;
          const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                void Haptics.selectionAsync();
                const ev: TabPressEvent = { type: 'tabPress', target: route.key, canPreventDefault: true };
                const e = (emitter ?? navigation)?.emit(ev);
                if (focused || e?.defaultPrevented) return;
                if (navigateToTab) navigateToTab(route.key);
                else navigation?.navigate(route.name, route.params);
              }}
              style={styles.item}
            >
              <View style={[styles.indicator, { backgroundColor: focused ? colors.accent : 'transparent' }]} />
              <Ionicons name={focused ? on : off} size={23} color={focused ? colors.accent : colors.accent2} />
              <AppText style={[styles.label, { color: focused ? colors.text : colors.textMuted }]} numberOfLines={1}>{label.toUpperCase()}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md },
  bar: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, paddingBottom: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', minHeight: 62, gap: 4 },
  indicator: { width: 22, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, marginBottom: 6 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
});
