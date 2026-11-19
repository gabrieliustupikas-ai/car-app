import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Bottom sheet: dimmed backdrop, rounded white card, drag-handle look. Close by tapping outside. */
export function Sheet({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.fill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, shadow, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
          <View style={[styles.handle, { backgroundColor: colors.surfaceAlt }]} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: space.xs },
});
