// Ultra-minimal, one-bit design system: pure black and white only — no
// hues, no gradients, no shadows. Status/state is conveyed through text,
// weight, and fill-vs-outline, never color. Every screen and component
// pulls from this file rather than hardcoding a value, so the whole app
// reads as one consistent, flat, high-contrast system.
export const colors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  ink: '#000000', // text, icons, borders, fills
  inkMuted: 'rgba(0,0,0,0.55)',
  inkFaint: 'rgba(0,0,0,0.28)',
  inverse: '#FFFFFF', // content on a black fill
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// Sharp corners throughout — no rounding. A one-bit system reads as flat
// rectangles, not soft cards.
export const radii = {
  sm: 0,
  md: 0,
  lg: 0,
};

export const borderWidth = {
  thin: 1,
  thick: 2,
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: 0.2 },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, fontWeight: '400', color: colors.ink },
  caption: { fontSize: 13, fontWeight: '400', color: colors.inkMuted },
  label: { fontSize: 12, fontWeight: '700', color: colors.ink, textTransform: 'uppercase', letterSpacing: 0.6 },
};
