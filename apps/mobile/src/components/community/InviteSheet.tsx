import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** "Invite on a cruise" — a short message to one driver. They never see your exact location. */
export function InviteSheet({ visible, name, onClose, onSend }: { visible: boolean; name: string; onClose: () => void; onSend: (message: string) => Promise<boolean> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [message, setMessage] = useState(() => t('invite.defaultMessage'));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'sent' | 'failed'>('idle');
  const close = () => { setState('idle'); setMessage(t('invite.defaultMessage')); onClose(); };

  const send = async () => {
    setBusy(true);
    const ok = await onSend(message.trim());
    setBusy(false);
    setState(ok ? 'sent' : 'failed');
    if (ok) setTimeout(close, 1400);
  };

  return (
    <Sheet visible={visible} onClose={close}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.accent }]}><Ionicons name="car-sport" size={22} color={colors.onAccent} /></View>
        <AppText variant="h2" style={{ flex: 1 }}>{t('invite.title', { name })}</AppText>
      </View>
      <TextInput
        value={message} onChangeText={setMessage} multiline maxLength={200}
        placeholder={t('invite.placeholder')} placeholderTextColor={colors.textFaint} accessibilityLabel={t('invite.placeholder')}
        style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
      />
      <AppText variant="small" color="textMuted">{t('invite.note')}</AppText>
      {state === 'sent' ? <AppText variant="small" color="success">{t('invite.sent', { name })}</AppText> : null}
      {state === 'failed' ? <AppText variant="small" color="danger" accessibilityRole="alert">{t('invite.failed')}</AppText> : null}
      <Button label={t('invite.send')} onPress={send} loading={busy} disabled={state === 'sent'} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: touch.min + 32, borderRadius: radius.md, padding: space.lg, fontSize: 16, textAlignVertical: 'top' },
});
