/**
 * Design tokens — graphite + brushed silver + one racing red.
 * Rules of thumb: red is for "live / act now" (PTT, active tab, recording, primary action) and nothing
 * else; silver is for metal, outlines and secondary text; surfaces are dark graphite panels over the map.
 */
export const ACCENT = '#E3262C'; // racing red
export const ACCENT_2 = '#C7CCD3'; // brushed silver

/** Brushed-metal gradient stops (radio faceplate, level badge, logo). */
export const CHROME = ['#EEF0F3', '#B6BBC3', '#8C929B', '#D3D7DD'] as const;

export const palette = {
  dark: {
    bg: '#0B0D10',
    surface: '#14171B',
    surfaceAlt: '#1E2227',
    glass: 'rgba(16, 18, 22, 0.86)',
    glassBorder: 'rgba(199, 204, 211, 0.14)',
    text: '#F1F3F5',
    textMuted: '#A9AFB8',
    textFaint: '#6E747D',
    accent: ACCENT,
    accent2: ACCENT_2,
    onAccent: '#FFFFFF',
    success: '#3CCB7F',
    warning: '#F2B33D',
    danger: '#FF453A',
    route: '#FF3B3F',
    overlay: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#F3F4F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F2F6',
    glass: 'rgba(255, 255, 255, 0.94)',
    glassBorder: 'rgba(20, 22, 26, 0.06)',
    text: '#0E0F13',
    textMuted: '#5B616B',
    textFaint: '#9AA0AA',
    accent: '#EE3B41', // red on white — large/bold text only, button labels are white on it
    accent2: '#7D838C',
    onAccent: '#FFFFFF',
    success: '#118A4E',
    warning: '#A86A00',
    danger: '#C8231B',
    route: '#EE3B41',
    overlay: 'rgba(0,0,0,0.35)',
  },
} as const;

export type Colors = { -readonly [K in keyof (typeof palette)['dark']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 18, lg: 26, xl: 32, pill: 999 } as const;
/** Soft card shadow used by the light design (iOS shadow + Android elevation). */
export const shadow = { shadowColor: '#1B2030', shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 6 } as const;
export const type = {
  // large, legible type — scales with the OS font size (allowFontScaling is on everywhere)
  display: { fontSize: 40, fontWeight: '900' as const, letterSpacing: -1 },
  hero: { fontSize: 46, fontWeight: '800' as const, letterSpacing: -1.5 },
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  small: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.6 },
  /** tracked uppercase subtitle under big titles and section headings */
  eyebrow: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 2.4 },
  /** button labels: uppercase, tracked */
  button: { fontSize: 14, fontWeight: '800' as const, letterSpacing: 1.6 },
  mono: { fontSize: 16, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};
/** Minimum touch target. Driving-mode controls use `drivingTarget`. */
export const touch = { min: 48, drivingTarget: 88 } as const;
