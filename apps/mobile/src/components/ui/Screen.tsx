import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export function Screen({ title, children, scroll = true, edges = ['top'], refreshControl }: PropsWithChildren<{
  title?: string; scroll?: boolean; edges?: Edge[]; refreshControl?: React.ReactElement<RefreshControlProps>;
}>) {
  const { colors } = useTheme();
  const header = title ? <AppText variant="h1" accessibilityRole="header" style={styles.title}>{title}</AppText> : null;
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.bg }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.content]}>{header}{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  title: { marginTop: space.sm },
});
