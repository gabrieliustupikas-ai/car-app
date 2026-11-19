import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { hasBackend, isWebPreview } from '@/config/env';
import { seedDemoHistory } from '@/demo/demoMode';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { useSettings } from '@/stores/settings';
import { radius, shadow, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const Email = z.email();

export default function SignIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const set = useSettings((s) => s.set);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const field = [styles.field, { backgroundColor: colors.surface, borderColor: colors.glassBorder }, shadow];
  const inputText = [styles.input, { color: colors.text }];

  async function sendCode() {
    setError(null);
    const parsed = Email.safeParse(email.trim());
    if (!parsed.success) { setError(t('auth.invalidEmail')); return; }
    if (!supabase) return;
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: true, data: { language: useSettings.getState().language } } });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setInfo(t('auth.codeSent', { email: parsed.data }));
    setStage('code');
  }

  async function verify() {
    if (!supabase) return;
    setBusy(true);
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (e) setError(e.message);
    // success → onAuthStateChange sets the session and the root guard navigates into the app
  }

  async function startDemo() {
    setBusy(true);
    set({ demoMode: true });
    telemetry.track('demo_mode_enabled');
    try { await seedDemoHistory(); } finally { setBusy(false); }
  }

  const social: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string }[] = [
    { icon: 'logo-google', label: 'Google', color: '#EA4335' }, { icon: 'logo-facebook', label: 'Facebook', color: '#1877F2' }, { icon: 'logo-apple', label: 'Apple', color: colors.text },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#BFD4F2', '#E6EEF9', '#F7F8FB']} style={styles.hero}>
            <Ionicons name="car-sport" size={210} color="#F04349"
              style={{ marginBottom: -34, textShadowColor: 'rgba(20,24,40,0.28)', textShadowRadius: 16, textShadowOffset: { width: 0, height: 10 } }} />
          </LinearGradient>

          <View>
            <AppText variant="h1" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38 }}>{t('authNew.titleA')}</AppText>
            <AppText variant="h1" style={{ fontSize: 34, lineHeight: 38, color: colors.accent }}>{t('authNew.titleB')}</AppText>
            <AppText color="textMuted" style={{ marginTop: space.xs }}>{t('authNew.sub')}</AppText>
          </View>

          {isWebPreview ? (
            <GlassCard><AppText>{t('auth.webPreview')}</AppText></GlassCard>
          ) : hasBackend ? (
            <View style={{ gap: space.md }}>
              {stage === 'email' ? (
                <>
                  <View style={field}>
                    <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                    <TextInput style={inputText} value={email} onChangeText={setEmail} placeholder={t('auth.email')} placeholderTextColor={colors.textFaint}
                      autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
                      accessibilityLabel={t('auth.email')} onSubmitEditing={sendCode} />
                  </View>
                  <AppText variant="small" color="textMuted">{t('authNew.terms')}</AppText>
                  <Button label={t('authNew.signUp')} onPress={sendCode} loading={busy} icon={<Ionicons name="arrow-forward" size={20} color={colors.onAccent} />} />
                </>
              ) : (
                <>
                  {info ? <AppText variant="small" color="success">{info}</AppText> : null}
                  <View style={field}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                    <TextInput style={[...inputText, styles.code]} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••" placeholderTextColor={colors.textFaint} keyboardType="number-pad" textContentType="oneTimeCode"
                      autoComplete="one-time-code" accessibilityLabel={t('auth.code')} onSubmitEditing={verify} />
                  </View>
                  <Button label={t('auth.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} />
                  <Button label={t('common.back')} variant="ghost" size="md" onPress={() => { setStage('email'); setCode(''); }} />
                </>
              )}
              {error ? <AppText variant="small" color="danger" accessibilityRole="alert">{error}</AppText> : null}

              <View style={styles.orRow}>
                <View style={[styles.line, { backgroundColor: colors.glassBorder }]} />
                <AppText variant="small" color="textFaint">{t('authNew.or')}</AppText>
                <View style={[styles.line, { backgroundColor: colors.glassBorder }]} />
              </View>
              <View style={styles.socialRow}>
                {social.map((s) => (
                  <Pressable key={s.label} accessibilityRole="button" accessibilityLabel={s.label} onPress={() => setInfo(t('authNew.social'))}
                    style={[styles.socialBtn, shadow, { backgroundColor: colors.surface }]}>
                    <Ionicons name={s.icon} size={24} color={s.color} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <GlassCard><AppText color="warning">{t('auth.noBackend')}</AppText></GlassCard>
          )}

          <View style={{ gap: space.sm }}>
            <Button label={t('auth.demo')} variant="secondary" onPress={startDemo} loading={busy && stage === 'email' && !email} />
            <AppText variant="small" color="textMuted">{t('auth.demoHint')}</AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  hero: { height: 230, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min + 10, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  input: { flex: 1, fontSize: 17, minHeight: touch.min },
  code: { fontSize: 26, letterSpacing: 10, textAlign: 'center', fontVariant: ['tabular-nums'] },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  socialBtn: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});
