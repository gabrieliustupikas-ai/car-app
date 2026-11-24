import { BlurView } from 'expo-blur';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { shadow, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Dark graphite panel that floats over the map: frosted, hairline silver edge, no glow. */
export function GlassCard({ children, style, padded = true }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padded?: boolean }>) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.wrap, scheme === 'light' && shadow, { borderColor: colors.glassBorder, backgroundColor: scheme === 'light' ? colors.surface : undefined }, style]}>
      {scheme === 'dark' && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
      <View style={padded ? styles.pad : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pad: { padding: space.lg },
});

