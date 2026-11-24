import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { withTabScene } from '@/components/layout/TabScene';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { RadioUnit } from '@/components/radio/RadioUnit';
import { AppText } from '@/components/ui/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { Sheet } from '@/components/ui/Sheet';
import { SettingRow } from '@/components/ui/SettingRow';
import { EmptyState } from '@/components/ui/States';
import { isWebPreview } from '@/config/env';
import { channelMembers, MAX_TRANSMIT_S, startTransmit, stopTransmit, useDemoChatter } from '@/features/radio/engine';
import { useRadio, type ChannelKind } from '@/features/radio/radioStore';
import { telemetry } from '@/lib/telemetry';
import { useSettings } from '@/stores/settings';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const CHANNELS: ChannelKind[] = ['nearby', 'friends', 'club', 'cruise', 'private'];
const RADII = [1, 2, 5, 10] as const;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function RadioScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const demo = useSettings((s) => s.demoMode) || isWebPreview;
  const r = useRadio();
  const [txAt, setTxAt] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const now = useNow(r.status === 'transmitting');
  const members = channelMembers(r.channel, r.radiusKm); // cheap: 8 demo drivers
  const live = r.channel === 'nearby' || r.channel === 'friends' || r.channel === 'club';
  useDemoChatter(demo && focused && live);

  const down = async () => {
    const res = await startTransmit();
    if (res === 'listen_only') { Alert.alert(t('radio.listenOnly'), t('radio.listenOnlyHint')); return; }
    setTxAt(Date.now());
    telemetry.breadcrumb('ptt_down', { channel: r.channel });
  };
  const up = () => { setTxAt(null); void stopTransmit(); };

  // Hands-free on web: hold Space to talk (also how a steering-wheel / Bluetooth button can map in).
  useEffect(() => {
    if (Platform.OS !== 'web' || !focused || !live) return;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const kd = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typing(e)) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.(); // so releasing Space doesn't "click" a focused chip
      void down();
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e)) { e.preventDefault(); up(); } };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, live]);

  const elapsed = txAt ? Math.min(MAX_TRANSMIT_S, (now - txAt) / 1000) : 0;
  const channelTitle = r.channel === 'nearby' ? `${t('radio.ch_nearby')} · ${r.radiusKm} km` : t(`radio.ch_${r.channel}`);

  const display = !live ? t('radio.lcdNoSignal')
    : r.status === 'transmitting' ? `TX ${elapsed.toFixed(1).padStart(4, '0')}`
    : r.status === 'receiving' && r.speaker ? `RX ${r.speaker.name.toUpperCase()}`
    : r.listenOnly ? t('radio.lcdListen') : t('radio.lcdReady');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={t('radio.title')} subtitle={t('radio.subtitle')} />

        <View style={[styles.strip, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('radio.range')} ${r.radiusKm} km`} style={styles.stripItem}
            onPress={() => r.set({ radiusKm: RADII[(RADII.indexOf(r.radiusKm) + 1) % RADII.length]! })}>
            <Ionicons name="radio-outline" size={18} color={colors.accent} />
            <AppText variant="eyebrow" color="textMuted">{t('radio.range').toUpperCase()}</AppText>
            <AppText variant="eyebrow">{r.channel === 'nearby' ? `${r.radiusKm} KM` : '—'}</AppText>
          </Pressable>
          <View style={[styles.stripDivider, { backgroundColor: colors.glassBorder }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('radio.channel')}: ${channelTitle}`} style={styles.stripItem} onPress={() => setPicker(true)}>
            <Ionicons name="people-outline" size={18} color={colors.accent2} />
            <AppText variant="eyebrow" numberOfLines={1} style={{ flexShrink: 1 }}>{t(`radio.ch_${r.channel}`).toUpperCase()}</AppText>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* leave room so the range ring on the map shows above the unit */}
        <View style={{ height: 150 }} />

        <RadioUnit
          status={r.status}
          channel={r.channel}
          channelLabel={t(`radio.ch_${r.channel}`)}
          radiusKm={r.radiusKm}
          level={r.level}
          inRange={live ? members.length : 0}
          display={display}
          listenOnly={r.listenOnly || !live}
          labels={{ range: t('radio.range'), ptt: t('radio.ptt'), inRange: t('radio.inRange'),
            presets: { nearby: t('radio.ch_nearby'), friends: t('radio.ch_friends'), club: t('radio.ch_club') } }}
          onRadius={(km) => r.set({ radiusKm: km })}
          onChannel={(c) => r.set({ channel: c })}
          onPttIn={() => void down()}
          onPttOut={up}
        />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <AppText variant="eyebrow">{t('radio.caption').toUpperCase()}</AppText>
          <AppText variant="small" color="textMuted">{Platform.OS === 'web' ? t('radio.spaceHint') : t('radio.listening', { count: members.length + 1 })}</AppText>
        </View>

        {!live && <EmptyState icon={r.channel === 'cruise' ? 'car-sport-outline' : 'lock-closed-outline'} title={t(`radio.empty_${r.channel}`)} body={t('radio.emptyBody')} />}

        <AppText variant="eyebrow" color="textMuted" style={{ marginTop: space.md }}>{t('radio.recent').toUpperCase()}</AppText>
        {r.log.length === 0 ? <AppText color="textFaint">{t('radio.noMessages')}</AppText> : r.log.slice(0, 8).map((m) => (
          <GlassCard key={m.id}>
            <View style={styles.msgRow}>
              <View style={[styles.msgMark, { backgroundColor: m.fromId === 'me' ? colors.accent : colors.accent2 }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="small" color={m.fromId === 'me' ? 'accent' : 'text'}>
                  {m.fromName}{m.car ? ` · ${m.car}` : ''} · {m.durationS.toFixed(1)} s
                </AppText>
                <AppText color="textMuted">{m.text ?? t('radio.voiceOnly')}</AppText>
              </View>
              {m.fromId !== 'me' && (
                <View style={styles.modRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel={r.muted.includes(m.fromId) ? t('radio.unmute') : t('radio.mute')} hitSlop={10}
                    onPress={() => r.toggleMute(m.fromId)}>
                    <Ionicons name={r.muted.includes(m.fromId) ? 'volume-mute' : 'volume-mute-outline'} size={20} color={r.muted.includes(m.fromId) ? colors.accent : colors.textMuted} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('radio.report')} hitSlop={10}
                    onPress={() => Alert.alert(t('radio.report'), t('radio.reported', { name: m.fromName }))}>
                    <Ionicons name="flag-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              )}
            </View>
          </GlassCard>
        ))}

        <AppText variant="eyebrow" color="textMuted" style={{ marginTop: space.md }}>{t('radio.settings').toUpperCase()}</AppText>
        <GlassCard>
          <SettingRow label={t('radio.listenOnly')} hint={t('radio.listenOnlyHint')} value={r.listenOnly} onValueChange={(v) => r.set({ listenOnly: v })} />
          <SettingRow label={t('radio.duck')} hint={t('radio.duckHint')} value={r.duckMusic} onValueChange={(v) => r.set({ duckMusic: v })} />
          <SettingRow label={t('radio.readAloud')} value={r.readAloud} onValueChange={(v) => r.set({ readAloud: v })} />
        </GlassCard>
        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textFaint} />
          <AppText variant="small" color="textFaint" style={{ flex: 1 }}>{demo ? t('radio.demoNote') : t('radio.privacyNote')}</AppText>
        </View>
      </ScrollView>

      <Sheet visible={picker} onClose={() => setPicker(false)}>
        <AppText variant="eyebrow" color="textMuted">{t('radio.channel').toUpperCase()}</AppText>
        {CHANNELS.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: r.channel === c }}
            onPress={() => { r.set({ channel: c }); setPicker(false); }}
            style={[styles.pickRow, { borderColor: r.channel === c ? colors.accent : colors.glassBorder }]}>
            <AppText variant="h3" style={{ flex: 1 }}>{t(`radio.ch_${c}`)}</AppText>
            {r.channel === c && <Ionicons name="checkmark" size={20} color={colors.accent} />}
          </Pressable>
        ))}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 140 },
  strip: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, minHeight: 54, paddingHorizontal: space.sm },
  stripItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: space.sm },
  stripDivider: { width: StyleSheet.hairlineWidth, height: 26 },
  msgMark: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: space.lg, borderRadius: 14, borderWidth: 1.5 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  speaker: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 28 },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  modRow: { flexDirection: 'row', gap: space.lg },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});

export default withTabScene(RadioScreen);
