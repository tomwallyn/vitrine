/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Garder en phase avec packages/shared/src/theme.ts (@vitrine/shared)
      colors: {
        ink: '#111111',
        paper: '#f5f3ec',
        paper2: '#eeece4',
        paper3: '#e3e1d9',
        white: '#ffffff',
        offwhite: '#fafafa',
        gray: '#8a8a8a',
        gray2: '#6b6b6b',
        gray3: '#484848',
      },
      fontFamily: {
        heading: ['SpaceGrotesk_600SemiBold'],
        'heading-bold': ['SpaceGrotesk_700Bold'],
        'heading-medium': ['SpaceGrotesk_500Medium'],
        body: ['Manrope_400Regular'],
        'body-medium': ['Manrope_500Medium'],
        'body-semibold': ['Manrope_600SemiBold'],
        'body-bold': ['Manrope_700Bold'],
      },
    },
  },
  plugins: [],
};
