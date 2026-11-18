import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { CHROME } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './ui/AppText';

const SIZE = 216;

/**
 * Big push-to-talk button: brushed-chrome bezel, red core that lights up while transmitting,
 * and level rings driven by the live audio level. Hold to talk, release to send.
 */
export function PttButton({ active, receiving, level, disabled, label, sublabel, onPressIn, onPressOut }: {
  active: boolean; receiving: boolean; level: number; disabled?: boolean; label: string; sublabel?: string;
  onPressIn: () => void; onPressOut: () => void;
}) {
  const { colors } = useTheme();
  const press = useSharedValue(1);
  const ring = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => { press.value = withSpring(active ? 0.94 : 1, { damping: 14 }); }, [active, press]);
  useEffect(() => { ring.value = withTiming(active || receiving ? level : 0, { duration: 90 }); }, [level, active, receiving, ring]);
  useEffect(() => { breathe.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true); }, [breathe]);

  const core = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const ring1 = useAnimatedStyle(() => ({ opacity: 0.15 + ring.value * 0.5, transform: [{ scale: 1.04 + ring.value * 0.22 }] }));
  const ring2 = useAnimatedStyle(() => ({ opacity: ring.value * 0.35, transform: [{ scale: 1.1 + ring.value * 0.45 }] }));
  const idleGlow = useAnimatedStyle(() => ({ opacity: active || receiving ? 0 : 0.12 + breathe.value * 0.12 }));
  const ringColor = receiving ? colors.accent2 : colors.accent;

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: ringColor }, ring2]} />
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: ringColor, borderWidth: 3 }, ring1]} />
      <Animated.View pointerEvents="none" style={[styles.ring, { backgroundColor: colors.accent }, idleGlow]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={sublabel}
        accessibilityState={{ disabled: !!disabled, selected: active }}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View style={[styles.bezel, core]}>
          <LinearGradient colors={[...CHROME]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.core, { backgroundColor: disabled ? colors.surfaceAlt : active ? '#FF1A0F' : '#B00400' }]}>
            <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.gloss} />
            <Ionicons name={active ? 'radio' : 'mic'} size={44} color="#FFFFFF" />
            <AppText variant="label" style={{ color: '#FFFFFF', marginTop: 6 }}>{label}</AppText>
            {sublabel ? <AppText variant="small" style={{ color: 'rgba(255,255,255,0.8)' }}>{sublabel}</AppText> : null}
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 1.5, height: SIZE * 1.3, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
  bezel: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  core: { width: SIZE - 26, height: SIZE - 26, borderRadius: (SIZE - 26) / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
});
