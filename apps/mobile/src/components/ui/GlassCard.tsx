import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, shadow, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function GlassCard({ children, style, padded = true }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padded?: boolean }>) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.wrap, scheme === 'light' && shadow, { borderColor: colors.glassBorder, backgroundColor: scheme === 'light' ? colors.surface : undefined }, style]}>
      <BlurView intensity={40} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
      {/* brushed-silver top edge, like a chrome trim line */}
      <LinearGradient colors={['transparent', scheme === 'dark' ? 'rgba(230,233,238,0.35)' : 'rgba(255,255,255,0.9)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.trim} />
      <View style={padded ? styles.pad : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  pad: { padding: space.lg },
  trim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});
