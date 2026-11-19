import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/components/ui/AppText';

/** The subset of react-navigation's bottom-tab props this bar uses. */
export interface BottomTabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<string, { options: { title?: string } } | undefined>;
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  discover: ['compass', 'compass-outline'],
  trips: ['git-branch', 'git-branch-outline'],
  radio: ['radio', 'radio-outline'],
  profile: ['person', 'person-outline'],
};

/** Floating pill tab bar: the active tab expands into a red pill with its label (see design reference). */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => ICONS[r.name]);
  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bar, shadow, { backgroundColor: scheme === 'light' ? '#FFFFFF' : colors.surfaceAlt, borderColor: colors.glassBorder }]}>
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
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={[styles.item, focused && { backgroundColor: colors.accent, paddingHorizontal: space.lg }]}
            >
              <Ionicons name={focused ? on : off} size={22} color={focused ? colors.onAccent : colors.textMuted} />
              {focused ? <AppText variant="small" style={{ color: colors.onAccent }} numberOfLines={1}>{label}</AppText> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: space.lg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, minWidth: 48, paddingHorizontal: 13, borderRadius: radius.pill, justifyContent: 'center' },
});
