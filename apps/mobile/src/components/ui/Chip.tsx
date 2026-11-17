import { Pressable, StyleSheet } from 'react-native';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.accent : colors.surfaceAlt }]}
    >
      <AppText variant="small" style={{ color: selected ? colors.onAccent : colors.text }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.pill, minHeight: 40, justifyContent: 'center' },
});
