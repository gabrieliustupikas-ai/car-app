import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Screen } from '@/components/ui/Screen';
import { hasBackend } from '@/config/env';
import { seedDemoHistory } from '@/demo/demoMode';
import { supabase } from '@/lib/supabase';
import { telemetry } from '@/lib/telemetry';
import { useSettings } from '@/stores/settings';
import { radius, space, touch } from '@/theme/tokens';
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

  const input = [styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.glassBorder }];

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={t('auth.title')}>
        <AppText color="textMuted">{t('auth.subtitle')}</AppText>
        {hasBackend ? (
          <GlassCard>
            <View style={{ gap: space.md }}>
              {stage === 'email' ? (
                <>
                  <TextInput style={input} value={email} onChangeText={setEmail} placeholder={t('auth.email')} placeholderTextColor={colors.textFaint}
                    autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
                    accessibilityLabel={t('auth.email')} onSubmitEditing={sendCode} />
                  <Button label={t('auth.sendCode')} onPress={sendCode} loading={busy} />
                </>
              ) : (
                <>
                  {info ? <AppText variant="small" color="success">{info}</AppText> : null}
                  <TextInput style={[...input, styles.code]} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••" placeholderTextColor={colors.textFaint} keyboardType="number-pad" textContentType="oneTimeCode"
                    autoComplete="one-time-code" accessibilityLabel={t('auth.code')} onSubmitEditing={verify} />
                  <Button label={t('auth.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} />
                  <Button label={t('common.back')} variant="ghost" size="md" onPress={() => { setStage('email'); setCode(''); }} />
                </>
              )}
              {error ? <AppText variant="small" color="danger" accessibilityRole="alert">{error}</AppText> : null}
            </View>
          </GlassCard>
        ) : (
          <GlassCard><AppText color="warning">{t('auth.noBackend')}</AppText></GlassCard>
        )}
        <View style={{ gap: space.sm }}>
          <Button label={t('auth.demo')} variant="secondary" onPress={startDemo} loading={busy && stage === 'email' && !email} />
          <AppText variant="small" color="textMuted">{t('auth.demoHint')}</AppText>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: touch.min + 8, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, fontSize: 18 },
  code: { fontSize: 28, letterSpacing: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
