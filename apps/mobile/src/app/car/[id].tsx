import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CarHero } from '@/components/community/CarHero';
import { InviteSheet } from '@/components/community/InviteSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { isWebPreview } from '@/config/env';
import { DEMO_VEHICLES } from '@/features/community/demoData';
import { KLAIPEDA_CENTER, useInviteActions } from '@/features/community/api';
import { useCommunity } from '@/features/community/store';
import { useSettings } from '@/stores/settings';
import { radius, shadow, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

export default function CarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const mine = useCommunity((s) => s.myVehicles);
  const demoMode = useSettings((s) => s.demoMode) || isWebPreview;
  const { invite } = useInviteActions(demoMode);
  const [open, setOpen] = useState(false);
  const v = [...mine, ...DEMO_VEHICLES].find((x) => x.id === id);
  if (!v) return null;
  const isMine = v.id.startsWith('mine-');

  const specs: [Icon, string, string][] = [
    ['water-outline', t('discover.fuel'), v.fuel], ['people-outline', t('discover.seats'), String(v.seats)], ['flash-outline', t('discover.power'), v.power],
    ['settings-outline', t('discover.gearbox'), v.transmission], ['hardware-chip-outline', t('discover.engine'), v.engine],
    ['navigate-outline', t('discover.distance'), t('discover.km', { value: Math.round(v.km).toLocaleString(i18n.language) })],
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <CarHero color={v.color} height={260} />
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.back, shadow, { backgroundColor: colors.surface }]}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="label" color="textMuted">{v.make.toUpperCase()}</AppText>
          <AppText variant="hero" style={{ fontSize: 38 }}>{v.model}</AppText>
          <AppText color="textMuted">{v.year} · {v.owner}{v.club ? ` · ${v.club}` : ''}</AppText>
          <AppText variant="small"><Ionicons name="star" size={13} color="#F2B33D" /> {t('discover.reviews', { rating: v.rating.toFixed(1), count: v.reviews })}</AppText>
        </View>

        <AppText variant="h3">{t('discover.specs')}</AppText>
        <View style={styles.grid}>
          {specs.map(([icon, label, value]) => (
            <View key={label} style={[styles.spec, { backgroundColor: colors.surface }, shadow]}>
              <View style={[styles.specIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={18} color={colors.accent} /></View>
              <AppText variant="small" color="textMuted">{label}</AppText>
              <AppText variant="h3" numberOfLines={1}>{value}</AppText>
            </View>
          ))}
        </View>

        {v.mods.length > 0 && (
          <View style={{ gap: space.sm }}>
            <AppText variant="h3">{t('discover.mods')}</AppText>
            <View style={styles.mods}>
              {v.mods.map((m) => (
                <View key={m} style={[styles.mod, { backgroundColor: colors.surface }]}><AppText variant="small">{m}</AppText></View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {!isMine && (
        <View style={[styles.bar, shadow, { backgroundColor: colors.surface }]}>
          <View>
            <AppText variant="small" color="textMuted">{t('discover.driven')}</AppText>
            <AppText variant="h2">{t('discover.km', { value: Math.round(v.km).toLocaleString(i18n.language) })}</AppText>
          </View>
          <Button label={t('discover.inviteOwner')} size="md" onPress={() => setOpen(true)} style={{ flex: 1 }} />
        </View>
      )}
      <InviteSheet visible={open} name={v.owner} onClose={() => setOpen(false)}
        onSend={(m) => invite({ id: `owner-${v.id}`, name: v.owner, carColor: 'silver', lng: KLAIPEDA_CENTER[0], lat: KLAIPEDA_CENTER[1], heading: 0, demo: true }, m, KLAIPEDA_CENTER[0], KLAIPEDA_CENTER[1])} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: 150 },
  back: { position: 'absolute', top: 14, left: 14, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  spec: { flexBasis: '30%', flexGrow: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  specIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mod: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  bar: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, borderRadius: radius.xl, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.lg },
});
