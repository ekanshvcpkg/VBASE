import { FONT } from './fonts';

// Two deliberate palettes instead of "dark glass + neon". Pick per scene with props.palette.
//   paper: warm off-white editorial (panels, comparisons, diagrams) — sits well on warm footage
//   ink:   deep charcoal (terminals, dark product UIs)
// Product replicas (chat, repo, ...) use the *product's own* colours, not these.
export const PAPER = {
  bg: '#F4F1EA', surface: '#FBFAF6', ink: '#1A1916', sub: '#6B675E', rule: 'rgba(26,25,22,0.12)',
  accent: '#C2603F', highlight: 'rgba(194,96,63,0.16)',
};
export const INK = {
  bg: '#0D0E11', surface: '#16171B', ink: '#ECEAE4', sub: 'rgba(236,234,228,0.56)', rule: 'rgba(255,255,255,0.09)',
  accent: '#E08A66', highlight: 'rgba(224,138,102,0.18)',
};

export const THEME = {
  bg: INK.bg,
  panel: 'rgba(22,23,27,0.94)',
  panelSolid: INK.surface,
  line: INK.rule,
  text: INK.ink,
  dim: INK.sub,
  accent: '#C96442',  // clay; scenes accept props.accent to match the creator's brand
  ok: '#3FB950',
  warn: '#D29922',
  info: '#58A6FF',
  font: `${FONT.sans}, "SF Pro Text", system-ui, sans-serif`,
  serif: `${FONT.serif}, Georgia, serif`,
  mono: `${FONT.mono}, "SF Mono", Menlo, monospace`,
  radius: 14,
  // a real lens shadow: tight contact + long soft falloff (not a glow)
  shadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 4px rgba(0,0,0,0.18), 0 24px 48px -12px rgba(0,0,0,0.45), 0 60px 120px -40px rgba(0,0,0,0.5)',
};
