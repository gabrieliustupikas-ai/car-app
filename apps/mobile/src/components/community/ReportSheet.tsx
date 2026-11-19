import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { RoadReportKind } from '@/components/map/types';
import { AppText } from '@/components/ui/AppText';
import { Sheet } from '@/components/ui/Sheet';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export const REPORT_META: Record<RoadReportKind, { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  police: { color: '#2F6BFF', icon: 'shield' },
  hidden_police: { color: '#7A3CFF', icon: 'eye-off' },
  checkpoint: { color: '#F2B33D', icon: 'flag' },
};

/** Big, one-tap report buttons. A report is placed at your current position. */
export function ReportSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (kind: RoadReportKind) => Promise<boolean> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');

  const pick = async (kind: RoadReportKind) => {
    setState('busy');
    const ok = await onPick(kind);
    setState(ok ? 'sent' : 'failed');
    if (ok) setTimeout(() => { setState('idle'); onClose(); }, 1100);
  };

  return (
    <Sheet visible={visible} onClose={() => { setState('idle'); onClose(); }}>
      <AppText variant="h2">{t('report.title')}</AppText>
      <AppText color="textMuted">{t('report.body')}</AppText>
      <View style={styles.row}>
        {(Object.keys(REPORT_META) as RoadReportKind[]).map((k) => (
          <Pressable key={k} accessibilityRole="button" accessibilityLabel={t(`report.${k}`)} disabled={state === 'busy' || state === 'sent'} onPress={() => void pick(k)}
            style={({ pressed }) => [styles.btn, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}>
            <View style={[styles.dot, { backgroundColor: REPORT_META[k].color }]}><Ionicons name={REPORT_META[k].icon} size={26} color="#FFFFFF" /></View>
            <AppText variant="small" style={{ textAlign: 'center' }}>{t(`report.${k}`)}</AppText>
          </Pressable>
        ))}
      </View>
      {state === 'sent' ? <AppText color="success">{t('report.sent')}</AppText> : null}
      {state === 'failed' ? <AppText color="danger" accessibilityRole="alert">{t('report.failed')}</AppText> : null}
      <AppText variant="small" color="textFaint">{t('report.legal')}</AppText>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  btn: { flex: 1, minHeight: 112, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.sm },
  dot: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
