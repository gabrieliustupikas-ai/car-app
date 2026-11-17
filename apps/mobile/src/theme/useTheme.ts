import { useColorScheme } from 'react-native';
import { useSettings } from '@/stores/settings';
import { palette, type Colors } from './tokens';

export function useTheme(): { colors: Colors; scheme: 'dark' | 'light' } {
  const system = useColorScheme();
  const pref = useSettings((s) => s.themePreference);
  const highContrast = useSettings((s) => s.highContrast);
  const scheme = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  const base: Colors = { ...palette[scheme] };
  if (highContrast) {
    base.textMuted = base.text;
    base.glass = scheme === 'dark' ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.97)';
    base.glassBorder = scheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  }
  return { colors: base, scheme };
}
