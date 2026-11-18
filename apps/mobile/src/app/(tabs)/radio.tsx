import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PttButton } from '@/components/PttButton';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { GlassCard } from '@/components/ui/GlassCard';
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

export default function RadioScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const demo = useSettings((s) => s.demoMode) || isWebPreview;
  const r = useRadio();
  const [txAt, setTxAt] = useState<number | null>(null);
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
  const pttLabel = r.status === 'transmitting' ? t('radio.onAir') : r.listenOnly ? t('radio.listenOnly').toUpperCase() : t('radio.holdToTalk');
  const pttSub = r.status === 'transmitting' ? `${elapsed.toFixed(1)} / ${MAX_TRANSMIT_S} s` : Platform.OS === 'web' ? t('radio.spaceHint') : undefined;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="h1" accessibilityRole="header">{t('radio.title')}</AppText>
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: live ? colors.accent : colors.textFaint }]} />
              <AppText variant="small" color="textMuted">{channelTitle} · {t('radio.listening', { count: members.length + 1 })}</AppText>
            </View>
          </View>
          <AppText variant="label" color="textFaint">PTT</AppText>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CHANNELS.map((c) => <Chip key={c} label={t(`radio.ch_${c}`)} selected={r.channel === c} onPress={() => r.set({ channel: c })} />)}
        </ScrollView>
        {r.channel === 'nearby' && (
          <View style={styles.chips}>
            {RADII.map((k) => <Chip key={k} label={`${k} km`} selected={r.radiusKm === k} onPress={() => r.set({ radiusKm: k })} />)}
          </View>
        )}

        {!live ? (
          <EmptyState icon={r.channel === 'cruise' ? 'car-sport-outline' : 'lock-closed-outline'}
            title={t(`radio.empty_${r.channel}`)} body={t('radio.emptyBody')} />
        ) : (
          <>
            <GlassCard>
              {r.status === 'receiving' && r.speaker ? (
                <View style={styles.speaker} accessibilityLiveRegion="polite">
                  <Ionicons name="volume-high" size={22} color={colors.accent2} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{r.speaker.name}</AppText>
                    <AppText variant="small" color="textMuted">{r.speaker.car}</AppText>
                  </View>
                  <Bars level={r.level} color={colors.accent2} />
                </View>
              ) : r.status === 'transmitting' ? (
                <View style={styles.speaker}>
                  <View style={[styles.liveDot, { backgroundColor: colors.accent, width: 12, height: 12, borderRadius: 6 }]} />
                  <AppText variant="h3" style={{ flex: 1 }}>{t('radio.youAreLive', { channel: channelTitle })}</AppText>
                  <Bars level={r.level} color={colors.accent} />
                </View>
              ) : (
                <View style={styles.speaker}>
                  <Ionicons name="radio-outline" size={22} color={colors.textMuted} />
                  <AppText color="textMuted" style={{ flex: 1 }}>{t('radio.channelClear')}</AppText>
                </View>
              )}
            </GlassCard>

            <PttButton
              active={r.status === 'transmitting'}
              receiving={r.status === 'receiving'}
              level={r.level}
              disabled={r.listenOnly}
              label={pttLabel}
              sublabel={pttSub}
              onPressIn={() => void down()}
              onPressOut={up}
            />

            <GlassCard>
              <SettingRow label={t('radio.listenOnly')} hint={t('radio.listenOnlyHint')} value={r.listenOnly} onValueChange={(v) => r.set({ listenOnly: v })} />
              <SettingRow label={t('radio.duck')} hint={t('radio.duckHint')} value={r.duckMusic} onValueChange={(v) => r.set({ duckMusic: v })} />
              <SettingRow label={t('radio.readAloud')} value={r.readAloud} onValueChange={(v) => r.set({ readAloud: v })} />
            </GlassCard>

            <AppText variant="label" color="textMuted">{t('radio.recent').toUpperCase()}</AppText>
            {r.log.length === 0 ? <AppText color="textFaint">{t('radio.noMessages')}</AppText> : r.log.map((m) => (
              <GlassCard key={m.id}>
                <View style={styles.msgRow}>
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
          </>
        )}
        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textFaint} />
          <AppText variant="small" color="textFaint" style={{ flex: 1 }}>{demo ? t('radio.demoNote') : t('radio.privacyNote')}</AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bars({ level, color }: { level: number; color: string }) {
  const heights = [0.5, 0.85, 1, 0.7, 0.45];
  return (
    <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {heights.map((h, i) => <View key={i} style={{ width: 4, borderRadius: 2, backgroundColor: color, height: 4 + 22 * h * Math.max(0.1, level) }} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
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
