import { rankLabel } from '@roadclub/core';
import { File, Paths } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { GlassCard } from '@/components/ui/GlassCard';
import { Screen } from '@/components/ui/Screen';
import { SettingRow } from '@/components/ui/SettingRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { ErrorState } from '@/components/ui/States';
import { XpBar } from '@/components/ui/XpBar';
import { BRAND } from '@/config/brand';
import { clearDemoData } from '@/demo/demoMode';
import { wipeLocalData } from '@/db/localDb';
import { useProgress } from '@/features/trips/api';
import { LANGUAGES, initI18n } from '@/i18n';
import { formatInt, formatKm } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { useSession } from '@/stores/session';
import { DEFAULT_RETENTION_DAYS, useSettings } from '@/stores/settings';
import { ensureTracking, stopTracking } from '@/tracking/controller';
import { space } from '@/theme/tokens';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const session = useSession((s) => s.session);
  const progress = useProgress();

  async function exportData() {
    if (!supabase || !session) return;
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    const file = new File(Paths.cache, `${BRAND.slug}-export-${Date.now()}.json`);
    await file.write(JSON.stringify(data, null, 2));
    telemetry.track('data_exported');
    await Share.share({ url: file.uri, title: t('profile.exportData'), message: t('profile.exportDone') });
  }

  function deleteAccount() {
    Alert.alert(t('profile.deleteAccount'), t('profile.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteAccount'), style: 'destructive', onPress: async () => {
          if (supabase && session) {
            const { error } = await supabase.rpc('delete_my_account');
            if (error) { Alert.alert(t('common.error'), error.message); return; }
            await supabase.auth.signOut();
          }
          await stopTracking();
          await wipeLocalData();
          queryClient.clear();
          telemetry.track('account_deleted');
          settings.reset();
        },
      },
    ]);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    telemetry.track('sign_out');
    settings.set({ demoMode: false });
  }

  const p = progress.data;
  return (
    <Screen title={t('profile.title')}>
      {progress.isLoading ? (
        <GlassCard><View style={{ gap: space.md }}><Skeleton width="50%" height={28} /><Skeleton height={12} /><Skeleton height={60} /></View></GlassCard>
      ) : progress.isError || !p ? (
        <ErrorState onRetry={() => void progress.refetch()} />
      ) : (
        <GlassCard>
          <View style={{ gap: space.md }}>
            <AppText variant="small" color="textMuted">{session?.user.email ?? t('profile.guest')}</AppText>
            <View style={styles.levelRow}>
              <AppText variant="hero" color="accent">{p.level.level}</AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="h2">{rankLabel(p.level, i18n.language)}</AppText>
                <AppText variant="small" color="textMuted">{formatInt(p.totalXp, i18n.language)} XP</AppText>
              </View>
            </View>
            <XpBar progress={p.level.progress} />
            <AppText variant="small" color="textMuted">
              {p.level.xpForNext === 0 ? t('profile.maxLevel')
                : t('profile.xpToNext', { xp: formatInt(p.level.xpForNext - p.level.xpIntoLevel, i18n.language), next: p.level.level + 1 })}
            </AppText>
            <View style={styles.stats}>
              <StatTile label={t('profile.totalKm')} value={formatKm(p.distanceM, i18n.language, 0)} unit={t('common.km')} />
              <StatTile label={t('profile.trips')} value={formatInt(p.trips, i18n.language)} />
              <StatTile label={t('profile.hexes')} value={formatInt(p.hexes, i18n.language)} />
            </View>
          </View>
        </GlassCard>
      )}
      <AppText variant="small" color="textFaint">{t('profile.garageSoon')}</AppText>

      <AppText variant="h3" accessibilityRole="header">{t('profile.settings')}</AppText>
      <GlassCard>
        <AppText variant="small" color="textMuted">{t('profile.language')}</AppText>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={settings.language === l.code}
              onPress={() => { settings.set({ language: l.code }); initI18n(l.code); }} />
          ))}
        </View>
        <AppText variant="small" color="textMuted" style={{ marginTop: space.md }}>{t('profile.theme')}</AppText>
        <View style={styles.chips}>
          {(['system', 'dark', 'light'] as const).map((m) => (
            <Chip key={m} label={t(`profile.theme_${m}`)} selected={settings.themePreference === m} onPress={() => settings.set({ themePreference: m })} />
          ))}
        </View>
        <SettingRow label={t('profile.highContrast')} value={settings.highContrast} onValueChange={(v) => settings.set({ highContrast: v })} />
        <SettingRow label={t('profile.autoDetect')} value={settings.autoDetect}
          onValueChange={(v) => { settings.set({ autoDetect: v }); void ensureTracking(); }} />
        <SettingRow label={t('profile.demoMode')} value={settings.demoMode}
          onValueChange={async (v) => { if (!v) await clearDemoData(); settings.set({ demoMode: v }); void ensureTracking(); }} />
      </GlassCard>

      <AppText variant="h3" accessibilityRole="header">{t('profile.privacy')}</AppText>
      <GlassCard>
        <SettingRow label={t('profile.locationSharing')} right={<AppText color="textMuted">{t('common.off')}</AppText>} />
        <SettingRow label={t('profile.retention', { days: DEFAULT_RETENTION_DAYS })} />
        {session ? (
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            <Button size="md" variant="secondary" label={t('profile.exportData')} onPress={() => void exportData()} />
            <Button size="md" variant="danger" label={t('profile.deleteAccount')} onPress={deleteAccount} />
          </View>
        ) : null}
      </GlassCard>

      {session ? <Button variant="ghost" label={t('profile.signOut')} onPress={() => void signOut()} />
        : <Button variant="secondary" label={t('profile.signIn')} onPress={async () => { await clearDemoData(); settings.set({ demoMode: false }); }} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
