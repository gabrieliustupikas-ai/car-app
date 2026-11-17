import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { radius, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './ui/AppText';

/** Long-press-to-confirm button for driving mode: prevents accidental taps on a bumpy road. */
export function HoldButton({ label, onConfirm, holdMs = 1200 }: { label: string; onConfirm: () => void; holdMs?: number }) {
  const { colors } = useTheme();
  const p = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  const start = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    p.value = withTiming(1, { duration: holdMs, easing: Easing.linear });
    timer.current = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirm();
      p.value = 0;
    }, holdMs);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    cancelAnimation(p);
    p.value = withTiming(0, { duration: 150 });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => onConfirm()}
      onPressIn={start}
      onPressOut={cancel}
      style={[styles.base, { backgroundColor: colors.surfaceAlt, borderColor: colors.danger }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: colors.danger }, fill]} />
      <View style={styles.label}><AppText variant="h2">{label}</AppText></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touch.drivingTarget, borderRadius: radius.pill, overflow: 'hidden', borderWidth: 2, justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, opacity: 0.85 },
  label: { alignItems: 'center' },
});
