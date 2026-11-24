import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { withTabScene } from '@/components/layout/TabScene';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CarHero } from '@/components/community/CarHero';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { GlassCard } from '@/components/ui/GlassCard';
import { Sheet } from '@/components/ui/Sheet';
import { hasBackend, isWebPreview } from '@/config/env';
import { DEMO_CLUBS, DEMO_DRIVES, DEMO_STORIES, DEMO_VEHICLES } from '@/features/community/demoData';
import { useCommunity } from '@/features/community/store';
import type { Story, Vehicle } from '@/features/community/types';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Tab = 'cars' | 'clubs' | 'drives';
const COLORS: Vehicle['color'][] = ['red', 'silver', 'black', 'white', 'blue'];
const COLOR_HEX: Record<Vehicle['color'], string> = { red: '#F04349', silver: '#B9BEC6', black: '#1A1C20', white: '#FFFFFF', blue: '#2F6BFF' };

function StoryBubble({ label, initials, color, onPress, add }: { label: string; initials?: string; color: string; onPress: () => void; add?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.story}>
      <View style={[styles.ring, { borderColor: add ? colors.glassBorder : colors.accent }]}>
        <View style={[styles.storyFace, { backgroundColor: add ? colors.surfaceAlt : color }]}>
          {add ? <Ionicons name="add" size={28} color={colors.accent} /> : <AppText variant="h3" style={{ color: '#fff' }}>{initials}</AppText>}
        </View>
      </View>
      <AppText variant="small" numberOfLines={1} style={{ maxWidth: 72 }}>{label}</AppText>
    </Pressable>
  );
}

function VehicleCard({ v }: { v: Vehicle }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${v.make} ${v.model}`} onPress={() => router.push(`/car/${v.id}` as never)}
      style={[styles.carCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: StyleSheet.hairlineWidth }]}>
      <CarHero color={v.color} height={170} round={radius.lg - 6} />
      <View style={styles.carMeta}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color="textMuted">{v.make.toUpperCase()}</AppText>
          <AppText variant="h2">{v.model} <AppText variant="small" color="textMuted">{v.year}</AppText></AppText>
          <AppText variant="small" color="textMuted">{v.owner}{v.club ? ` · ${v.club}` : ''}</AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="small"><Ionicons name="star" size={12} color="#F2B33D" /> {v.rating.toFixed(1)}</AppText>
          <AppText variant="small" color="textMuted">{t('discover.km', { value: Math.round(v.km).toLocaleString(i18n.language) })}</AppText>
        </View>
      </View>
    </Pressable>
  );
}

function Discover() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('cars');
  const [story, setStory] = useState<Story | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const mine = useCommunity((s) => s.myVehicles);
  const joined = useCommunity((s) => s.joinedClubs);
  const toggleClub = useCommunity((s) => s.toggleClub);
  const vehicles = useMemo(() => [...mine, ...DEMO_VEHICLES], [mine]);

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: 'transparent' }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title={t('discover.title')} subtitle={t('discover.eyebrow')} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRow}>
          <StoryBubble add label={t('discover.yourStory')} color={colors.surfaceAlt} onPress={() => setPostOpen(true)} />
          {DEMO_STORIES.map((s) => <StoryBubble key={s.id} label={s.user} initials={s.initials} color={s.color} onPress={() => setStory(s)} />)}
        </ScrollView>

        <View style={styles.chips}>
          <Chip label={t('discover.tabCars')} selected={tab === 'cars'} onPress={() => setTab('cars')} />
          <Chip label={t('discover.tabClubs')} selected={tab === 'clubs'} onPress={() => setTab('clubs')} />
          <Chip label={t('discover.tabDrives')} selected={tab === 'drives'} onPress={() => setTab('drives')} />
        </View>

        {tab === 'cars' && (
          <View style={{ gap: space.lg }}>
            <Button label={t('discover.showcase')} onPress={() => setFormOpen(true)} icon={<Ionicons name="add-circle" size={22} color={colors.onAccent} />} />
            <AppText variant="eyebrow" color="textMuted">{t('discover.carsNear').toUpperCase()}</AppText>
            {vehicles.map((v) => <VehicleCard key={v.id} v={v} />)}
          </View>
        )}

        {tab === 'clubs' && (
          <View style={{ gap: space.md }}>
            {DEMO_CLUBS.map((c) => {
              const isIn = joined.includes(c.id);
              return (
                <GlassCard key={c.id}>
                  <View style={styles.clubRow}>
                    <View style={[styles.clubBadge, { backgroundColor: c.color }]}><Ionicons name="people" size={22} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="h3">{c.name}</AppText>
                      <AppText variant="small" color="textMuted">{c.city} · {t('discover.members', { count: c.members + (isIn ? 1 : 0) })}</AppText>
                      <AppText variant="small" color="textMuted" numberOfLines={2}>{c.blurb}</AppText>
                    </View>
                    <Chip label={isIn ? t('discover.joined') : t('discover.join')} selected={isIn} onPress={() => toggleClub(c.id)} />
                  </View>
                </GlassCard>
              );
            })}
          </View>
        )}

        {tab === 'drives' && (
          <View style={{ gap: space.md }}>
            <AppText variant="h3">{t('discover.sharedDrives')}</AppText>
            {DEMO_DRIVES.map((d) => (
              <GlassCard key={d.id}>
                <View style={styles.clubRow}>
                  <View style={[styles.clubBadge, { backgroundColor: colors.accent }]}><AppText variant="h3" style={{ color: '#fff' }}>{d.initials}</AppText></View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{d.title}</AppText>
                    <AppText variant="small" color="textMuted">{d.user} · {d.car} · {t('discover.ago', { h: d.hoursAgo })}</AppText>
                    <AppText variant="small">{t('discover.km', { value: d.km })} · {d.minutes} {t('common.min')} · {t('discover.newHexes', { count: d.newHexes })}</AppText>
                  </View>
                  <View style={{ alignItems: 'center' }}><Ionicons name="heart-outline" size={20} color={colors.accent} /><AppText variant="small">{d.likes}</AppText></View>
                </View>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>

      <Sheet visible={story != null} onClose={() => setStory(null)}>
        {story && (
          <View style={{ gap: space.sm }}>
            <View style={[styles.storyHero, { backgroundColor: story.color }]}><Ionicons name="car-sport" size={90} color="rgba(255,255,255,0.9)" /></View>
            <AppText variant="h2">{story.caption}</AppText>
            <AppText color="textMuted">{story.user} · {story.car} · {t('discover.ago', { h: story.hoursAgo })}</AppText>
          </View>
        )}
      </Sheet>
      <Sheet visible={postOpen} onClose={() => setPostOpen(false)}>
        <AppText variant="h2">{t('discover.postStory')}</AppText>
        <AppText color="textMuted">{t('discover.storySoon')}</AppText>
        <Button label={t('common.close')} variant="secondary" onPress={() => setPostOpen(false)} />
      </Sheet>
      <AddVehicleSheet visible={formOpen} onClose={() => setFormOpen(false)} />
    </SafeAreaView>
  );
}

function AddVehicleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const add = useCommunity((s) => s.addVehicle);
  const userId = useSession((s) => s.session?.user.id);
  const demoMode = useSettings((s) => s.demoMode) || isWebPreview;
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState<Vehicle['color']>('red');
  const valid = make.trim().length > 0 && model.trim().length > 0 && /^(19|20)\d{2}$/.test(year);
  const input = [styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }];

  const save = async () => {
    const v: Vehicle = {
      id: `mine-${Date.now().toString(36)}`, owner: 'You', make: make.trim(), model: model.trim(), year: Number(year), color,
      fuel: '—', seats: 4, power: '—', transmission: '—', engine: '—', rating: 5, reviews: 0, mods: [], km: 0,
    };
    add(v);
    if (hasBackend && supabase && userId && !demoMode) {
      // best effort: the local copy is already shown, the server row makes it visible to others (RLS: owner only writes)
      await supabase.from('cars').insert({ owner_id: userId, make: v.make, model: v.model, year: v.year, color });
    }
    setMake(''); setModel(''); setYear('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="h2">{t('discover.formTitle')}</AppText>
      <AppText variant="small" color="textMuted">{t('discover.formHint')}</AppText>
      <TextInput style={input} value={make} onChangeText={setMake} placeholder={t('discover.make')} placeholderTextColor={colors.textFaint} maxLength={40} accessibilityLabel={t('discover.make')} />
      <TextInput style={input} value={model} onChangeText={setModel} placeholder={t('discover.model')} placeholderTextColor={colors.textFaint} maxLength={60} accessibilityLabel={t('discover.model')} />
      <TextInput style={input} value={year} onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))} placeholder={t('discover.year')} placeholderTextColor={colors.textFaint} keyboardType="number-pad" accessibilityLabel={t('discover.year')} />
      <View style={styles.swatches}>
        {COLORS.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: color === c }} onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: COLOR_HEX[c], borderColor: color === c ? colors.accent : colors.glassBorder, borderWidth: color === c ? 3 : 1 }]} />
        ))}
      </View>
      <Button label={t('discover.save')} onPress={() => void save()} disabled={!valid} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: 140 },
  storyRow: { gap: space.md, paddingVertical: space.xs },
  story: { alignItems: 'center', gap: 6 },
  ring: { width: 68, height: 68, borderRadius: 34, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  storyFace: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  storyHero: { height: 220, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: space.sm },
  carCard: { borderRadius: radius.lg, padding: 10, gap: space.md },
  carMeta: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, paddingBottom: space.sm },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  clubBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.lg, fontSize: 17 },
  swatches: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  swatch: { width: 40, height: 40, borderRadius: 20 },
});

export default withTabScene(Discover);
