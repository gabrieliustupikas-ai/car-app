import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export function SettingRow({ label, hint, value, onValueChange, onPress, right }: {
  label: string; hint?: string; value?: boolean; onValueChange?: (v: boolean) => void; onPress?: () => void; right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const body = (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="body">{label}</AppText>
        {hint ? <AppText variant="small" color="textMuted">{hint}</AppText> : null}
      </View>
      {onValueChange ? (
        <Switch value={!!value} onValueChange={onValueChange} accessibilityLabel={label}
          trackColor={{ true: colors.accent, false: colors.surfaceAlt }} thumbColor="#fff" />
      ) : right}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touch.min, gap: space.md, paddingVertical: space.sm },
  text: { flex: 1, gap: 2 },
});
