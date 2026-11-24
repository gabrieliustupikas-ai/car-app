import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

interface Props {
  label: string;
  onPress?: () => void;
  /** primary = solid red · secondary = silver outline · ghost = text only · danger = solid red-orange */
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
  const bg = { primary: colors.accent, secondary: 'transparent', ghost: 'transparent', danger: colors.danger }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : variant === 'secondary' ? colors.accent2 : colors.text;
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
        { backgroundColor: bg, minHeight: height, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderWidth: 1.5, borderColor: colors.accent2 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {icon}
          <AppText variant="button" style={[{ color: fg }, size === 'driving' && { fontSize: 18 }]}>{label.toUpperCase()}</AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
