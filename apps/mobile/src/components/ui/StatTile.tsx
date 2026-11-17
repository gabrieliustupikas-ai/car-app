import { StyleSheet, View } from 'react-native';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';

export function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${unit ? ' ' + unit : ''}`}>
      <AppText variant="small" color="textMuted">{label.toUpperCase()}</AppText>
      <View style={styles.row}>
        <AppText variant="h1" style={{ fontVariant: ['tabular-nums'] }}>{value}</AppText>
        {unit ? <AppText variant="body" color="textMuted"> {unit}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexBasis: '47%', flexGrow: 1, gap: space.xs, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'baseline' },
});
