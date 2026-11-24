import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

/**
 * Standard screen. `overMap` = transparent background over the shared map backdrop (tab screens),
 * with the big ScreenHeader; otherwise a solid background and a plain title (stack screens, onboarding).
 */
export function Screen({ title, subtitle, children, scroll = true, edges = ['top'], refreshControl, overMap = false }: PropsWithChildren<{
  title?: string; subtitle?: string; scroll?: boolean; edges?: Edge[]; refreshControl?: React.ReactElement<RefreshControlProps>; overMap?: boolean;
}>) {
  const { colors } = useTheme();
  const header = !title ? null : overMap
    ? <ScreenHeader title={title} subtitle={subtitle} />
    : <AppText variant="h1" accessibilityRole="header" style={styles.title}>{title}</AppText>;
  const content = [styles.content, overMap && { paddingBottom: 140 }];
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: overMap ? 'transparent' : colors.bg }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} refreshControl={refreshControl}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, ...content]}>{header}{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  title: { marginTop: space.sm },
});
