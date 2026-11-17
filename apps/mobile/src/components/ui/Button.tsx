import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'driving';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', size = 'lg', disabled, loading, icon, style, accessibilityHint }: Props) {
  const { colors } = useTheme();
  const bg = { primary: colors.accent, secondary: colors.surfaceAlt, ghost: 'transparent', danger: colors.danger }[variant];
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? '#fff' : colors.text;
  const height = size === 'driving' ? touch.drivingTarget : size === 'lg' ? 56 : touch.min;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, minHeight: height, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.glassBorder },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {icon}
          <AppText variant={size === 'driving' ? 'h2' : 'h3'} style={{ color: fg }}>{label}</AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
