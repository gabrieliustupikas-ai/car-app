/**
 * Design tokens. Change ACCENT to re-skin the whole app (buttons, route lines, XP bar, map highlights).
 * Dark-first automotive palette: deep charcoal surfaces, glass cards, one neon accent.
 */
export const ACCENT = '#00E5FF'; // neon cyan — try '#B6FF00' (lime) or '#FF2D78' (magenta)
export const ACCENT_2 = '#7C5CFF'; // secondary for gradients/XP

export const palette = {
  dark: {
    bg: '#07090C',
    surface: '#0E1217',
    surfaceAlt: '#151B22',
    glass: 'rgba(20, 26, 34, 0.72)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
    text: '#F2F5F8',
    textMuted: '#93A1B0',
    textFaint: '#5B6773',
    accent: ACCENT,
    accent2: ACCENT_2,
    onAccent: '#001418',
    success: '#3DDC97',
    warning: '#FFC145',
    danger: '#FF4D5E',
    route: ACCENT,
    overlay: 'rgba(0,0,0,0.55)',
  },
  light: {
    bg: '#F4F6F8',
    surface: '#FFFFFF',
    surfaceAlt: '#EBEFF3',
    glass: 'rgba(255, 255, 255, 0.82)',
    glassBorder: 'rgba(0, 0, 0, 0.06)',
    text: '#0B1015',
    textMuted: '#4F5B67',
    textFaint: '#8996A3',
    accent: '#0091A8', // darker accent variant for contrast on light backgrounds (WCAG AA)
    accent2: ACCENT_2,
    onAccent: '#FFFFFF',
    success: '#118A5A',
    warning: '#B57700',
    danger: '#D62839',
    route: '#0091A8',
    overlay: 'rgba(0,0,0,0.35)',
  },
} as const;

export type Colors = { -readonly [K in keyof (typeof palette)['dark']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const type = {
  // large, legible type — scales with the OS font size (allowFontScaling is on everywhere)
  hero: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1 },
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  small: { fontSize: 13, fontWeight: '600' as const },
  mono: { fontSize: 16, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};
/** Minimum touch target. Driving-mode controls use `drivingTarget`. */
export const touch = { min: 48, drivingTarget: 88 } as const;
