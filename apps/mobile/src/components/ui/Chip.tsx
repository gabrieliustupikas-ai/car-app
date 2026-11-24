import { Pressable, StyleSheet } from 'react-native';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

/** Selected = solid red; unselected = silver hairline outline on a dark panel. */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected
        ? { backgroundColor: colors.accent, borderColor: colors.accent }
        : { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
    >
      <AppText variant="label" style={{ color: selected ? '#FFFFFF' : colors.accent2 }}>{label.toUpperCase()}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.pill, minHeight: 40, justifyContent: 'center', borderWidth: 1 },
});
