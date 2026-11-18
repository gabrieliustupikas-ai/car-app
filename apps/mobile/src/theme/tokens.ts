/**
 * Design tokens — "silver car on black" automotive palette: piano-black surfaces, brushed-silver
 * text and chrome, one racing-red accent. Change ACCENT to re-skin buttons, routes, XP and highlights.
 */
export const ACCENT = '#E10600'; // racing red
export const ACCENT_2 = '#C9CED6'; // brushed silver (gradients, chrome details)

/** Brushed-metal gradient stops used for chrome surfaces (logo, level badge, cards' top edge). */
export const CHROME = ['#F4F6F8', '#B9BEC6', '#8A9099', '#D6DAE0'] as const;

export const palette = {
  dark: {
    bg: '#050506',
    surface: '#0E0F11',
    surfaceAlt: '#1A1C20',
    glass: 'rgba(18, 19, 22, 0.78)',
    glassBorder: 'rgba(214, 218, 224, 0.14)',
    text: '#F2F3F5',
    textMuted: '#A3A9B2',
    textFaint: '#6B717A',
    accent: ACCENT,
    accent2: ACCENT_2,
    onAccent: '#FFFFFF',
    success: '#34C77B',
    warning: '#F2B33D',
    danger: '#FF3B30',
    route: '#FF2A1F',
    overlay: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#EEF0F2',
    surface: '#FFFFFF',
    surfaceAlt: '#E2E5E9',
    glass: 'rgba(255, 255, 255, 0.84)',
    glassBorder: 'rgba(20, 22, 26, 0.10)',
    text: '#0B0C0E',
    textMuted: '#4A5059',
    textFaint: '#868C95',
    accent: '#C40500', // deeper red for contrast on light surfaces (WCAG AA)
    accent2: '#7D838C',
    onAccent: '#FFFFFF',
    success: '#118A4E',
    warning: '#A86A00',
    danger: '#C8231B',
    route: '#D40800',
    overlay: 'rgba(0,0,0,0.35)',
  },
} as const;

export type Colors = { -readonly [K in keyof (typeof palette)['dark']]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const type = {
  // large, legible type — scales with the OS font size (allowFontScaling is on everywhere)
  hero: { fontSize: 46, fontWeight: '800' as const, letterSpacing: -1.5 },
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  small: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.6 },
  mono: { fontSize: 16, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
};
/** Minimum touch target. Driving-mode controls use `drivingTarget`. */
export const touch = { min: 48, drivingTarget: 88 } as const;
