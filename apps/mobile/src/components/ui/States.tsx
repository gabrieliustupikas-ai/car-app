import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { Button } from './Button';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function EmptyState({ icon = 'car-sport-outline', title, body, action }: {
  icon?: IconName; title: string; body?: string; action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={icon} size={40} color={colors.accent} />
      </View>
      <AppText variant="h2" style={styles.center}>{title}</AppText>
      {body ? <AppText color="textMuted" style={styles.center}>{body}</AppText> : null}
      {action ? <Button label={action.label} onPress={action.onPress} style={{ marginTop: space.md }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Ionicons name="warning-outline" size={40} color={colors.danger} />
      <AppText variant="h3" style={styles.center}>{message ?? t('errors.generic')}</AppText>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  iconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  center: { textAlign: 'center' },
});
