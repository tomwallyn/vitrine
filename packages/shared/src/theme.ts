/**
 * Design tokens VITRINE — charte N&B « chaud » de la maquette.
 * Consommés par apps/mobile (NativeWind + styles inline) ; les couleurs
 * sont dupliquées dans apps/mobile/tailwind.config.js (garder en phase).
 */

export const colors = {
  ink: '#111111',
  paper: '#f5f3ec',
  paper2: '#eeece4',
  paper3: '#e3e1d9',
  white: '#ffffff',
  offwhite: '#fafafa',
  gray: '#8a8a8a',
  gray2: '#6b6b6b',
  gray3: '#484848',
} as const;
export type ThemeColor = keyof typeof colors;

export const fonts = {
  heading: 'Space Grotesk',
  body: 'Manrope',
} as const;

/** Noms de familles chargées via @expo-google-fonts (useFonts). */
export const fontFamilies = {
  heading: 'SpaceGrotesk_600SemiBold',
  headingBold: 'SpaceGrotesk_700Bold',
  headingMedium: 'SpaceGrotesk_500Medium',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const theme = { colors, fonts, fontFamilies, spacing, radii } as const;
export type Theme = typeof theme;
