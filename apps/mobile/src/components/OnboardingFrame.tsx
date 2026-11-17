import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './ui/AppText';

export function OnboardingFrame({ step, total = 5, title, body, footer, children }: PropsWithChildren<{
  step: number; total?: number; title: string; body?: string; footer: React.ReactNode;
}>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
      <View style={styles.dots} accessibilityLabel={`${step} / ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i < step ? colors.accent : colors.surfaceAlt, flex: i === step - 1 ? 2 : 1 }]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="h1" accessibilityRole="header">{title}</AppText>
        {body ? <AppText color="textMuted">{body}</AppText> : null}
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dots: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.xl, paddingTop: space.md },
  dot: { height: 4, borderRadius: radius.pill },
  content: { padding: space.xl, gap: space.lg },
  footer: { padding: space.xl, gap: space.md },
});
