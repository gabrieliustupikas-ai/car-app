import { levelForXp, rankLabel, xpForLevel } from '@roadclub/core';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTracking } from '@/stores/tracking';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './ui/AppText';
import { Button } from './ui/Button';

export function LevelUpOverlay() {
  const level = useTracking((s) => s.pendingLevelUp);
  const clear = () => useTracking.getState().set({ pendingLevelUp: null });
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const scale = useSharedValue(0.3);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (level == null) return;
    scale.value = withSequence(withSpring(1.15, { damping: 8 }), withSpring(1));
    glow.value = withDelay(150, withSequence(withTiming(1, { duration: 400 }), withTiming(0.4, { duration: 900 })));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(t('levelUp.body', { level }));
  }, [level, scale, glow, t]);

  const badge = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 1 + glow.value * 0.4 }] }));
  if (level == null) return null;
  const info = levelForXp(xpForLevel(level));

  return (
    <Modal transparent animationType="fade" visible onRequestClose={clear}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={clear} accessibilityLabel={t('common.close')}>
        <View style={styles.center}>
          <Animated.View style={[styles.halo, { backgroundColor: colors.accent }, halo]} />
          <Animated.View style={[styles.badge, badge]}>
            <LinearGradient colors={[colors.accent, colors.accent2]} style={StyleSheet.absoluteFill} />
            <AppText variant="hero" style={{ color: colors.onAccent }}>{level}</AppText>
          </Animated.View>
          <AppText variant="h1" style={styles.text}>{t('levelUp.title')}</AppText>
          <AppText variant="h3" color="accent" style={styles.text}>{rankLabel(info, i18n.language)}</AppText>
          <Button label={t('common.continue')} onPress={clear} style={{ marginTop: space.xl, alignSelf: 'stretch' }} />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: space.xxl },
  center: { alignItems: 'center', gap: space.sm },
  halo: { position: 'absolute', top: 0, width: 160, height: 160, borderRadius: 80 },
  badge: { width: 160, height: 160, borderRadius: radius.lg * 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: space.lg },
  text: { textAlign: 'center' },
});
