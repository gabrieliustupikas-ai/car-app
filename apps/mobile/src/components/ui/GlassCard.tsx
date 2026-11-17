import { BlurView } from 'expo-blur';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function GlassCard({ children, style, padded = true }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padded?: boolean }>) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: colors.glassBorder }, style]}>
      <BlurView intensity={40} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
      <View style={padded ? styles.pad : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pad: { padding: space.lg },
});
