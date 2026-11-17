import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function Skeleton({ width = '100%', height = 16, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const o = useSharedValue(0.35);
  useEffect(() => { o.value = withRepeat(withTiming(0.8, { duration: 800 }), -1, true); }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }, anim, style]}
    />
  );
}
