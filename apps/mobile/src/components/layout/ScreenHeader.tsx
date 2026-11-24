import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { BRAND } from '@/config/brand';
import { useSession } from '@/stores/session';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/components/ui/AppText';

/**
 * Screen title block: brand line, a big heavy title and a tracked uppercase subtitle,
 * with the driver badge on the right (opens Profile).
 */
export function ScreenHeader({ title, subtitle, right, showBadge = true }: { title: string; subtitle?: string; right?: React.ReactNode; showBadge?: boolean }) {
  const { colors } = useTheme();
  const email = useSession((s) => s.session?.user.email);
  const initials = (email?.[0] ?? 'R').toUpperCase();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: colors.accent }]} />
          <AppText variant="eyebrow" color="accent2">{BRAND.name}</AppText>
        </View>
        <AppText variant="display" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>{title}</AppText>
        {subtitle ? <AppText variant="eyebrow" color="textMuted">{subtitle.toUpperCase()}</AppText> : null}
      </View>
      {right ?? (showBadge ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.navigate('/profile')}
          style={[styles.badge, { borderColor: colors.accent2, backgroundColor: colors.surfaceAlt }]}>
          <AppText variant="h3">{initials}</AppText>
          <View style={[styles.badgeDot, { backgroundColor: colors.accent, borderColor: colors.bg }]} />
        </Pressable>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: space.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 10, height: 3, borderRadius: 1 },
  badge: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', right: 1, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2.5 },
});
