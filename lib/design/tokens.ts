import type { Hex } from './color';

export type SemanticTokens = { fg: Hex; bg: Hex; border: Hex };
export const printTokens = {
  bg: '#FFFFFF',
  text: '#000000',
} as const satisfies Record<string, Hex>;
export type ModeTokens = {
  bg: Hex;
  shellGradient: string;
  card: Hex;
  cardRaised: Hex;
  border: Hex;
  borderStrong: Hex;
  text: Hex;
  textMuted: Hex;
  textDisabled: Hex;
  overlay: string;
  success: SemanticTokens;
  warning: SemanticTokens;
  error: SemanticTokens;
  info: SemanticTokens;
};

export const modes = {
  light: {
    bg: '#F6F7F8',
    shellGradient:
      'radial-gradient(86% 42% at 50% 0%, color-mix(in srgb, #059669 3%, transparent), transparent 100%), linear-gradient(180deg, var(--color-card) 0%, var(--color-bg) 82%)',
    card: '#FFFFFF',
    cardRaised: '#FFFFFF',
    border: '#E5E7EB',
    borderStrong: '#80858F',
    text: '#17191D',
    textMuted: '#555B65',
    textDisabled: '#9298A1',
    overlay: 'rgb(11 12 14 / 0.48)',
    success: { fg: '#166534', bg: '#F0FDF4', border: '#86EFAC' },
    warning: { fg: '#854D0E', bg: '#FEFCE8', border: '#FDE047' },
    error: { fg: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
    info: { fg: '#1E40AF', bg: '#EFF6FF', border: '#93C5FD' },
  },
  dark: {
    bg: '#101113',
    shellGradient:
      'radial-gradient(86% 42% at 50% 0%, color-mix(in srgb, #059669 2%, transparent), transparent 100%), linear-gradient(180deg, var(--color-card) 0%, var(--color-bg) 82%)',
    card: '#1B1D20',
    cardRaised: '#24272B',
    border: '#303237',
    borderStrong: '#707680',
    text: '#F4F5F6',
    textMuted: '#A8AFBA',
    textDisabled: '#626975',
    overlay: 'rgb(11 12 14 / 0.72)',
    success: { fg: '#86EFAC', bg: '#142D20', border: '#276749' },
    warning: { fg: '#FDE047', bg: '#332B14', border: '#80621C' },
    error: { fg: '#FCA5A5', bg: '#361D20', border: '#8C3841' },
    info: { fg: '#93C5FD', bg: '#192C43', border: '#345C88' },
  },
} as const satisfies Record<'light' | 'dark', ModeTokens>;

export const scales = {
  radius: { sm: 6, button: 8, card: 14, full: 9999 },
  spacing: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40],
  text: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  lineHeight: { body: '1.6', heading: '1.3' },
  shadow: {
    sm: '0 1px 2px rgb(0 0 0 / 0.06)',
    md: '0 4px 12px rgb(0 0 0 / 0.10)',
  },
  motion: { fast: 150, base: 200, slow: 250 },
  touchMin: 44,
} as const;
