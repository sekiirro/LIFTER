import { deriveBrand, type BrandVariants } from './color';
import { modes, printTokens, scales, type ModeTokens } from './tokens';

const brandKeys = {
  fill: 'fill',
  fillHover: 'fill-hover',
  onFill: 'on-fill',
  text: 'text',
  ring: 'ring',
} as const;
const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const declarations = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');

export function brandToCssVars(
  v: BrandVariants,
): Record<`--${string}`, string> {
  const vars: Record<`--${string}`, string> = {};
  for (const mode of ['light', 'dark'] as const) {
    for (const key of Object.keys(brandKeys) as (keyof typeof brandKeys)[]) {
      vars[`--brand-${brandKeys[key]}-${mode}`] = v[mode][key];
    }
  }
  return vars;
}

function modeCss(tokens: ModeTokens): string {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value === 'string') vars[`--color-${kebab(key)}`] = value;
    else
      for (const [part, hex] of Object.entries(value))
        vars[`--color-${key}-${part}`] = hex;
  }
  return declarations(vars);
}

function mapping(mode: 'light' | 'dark'): string {
  return Object.values(brandKeys)
    .map((name) => `--brand-${name}: var(--brand-${name}-${mode});`)
    .join('\n');
}

export function tokensToCss(): string {
  const vars: Record<string, string> = {
    '--color-print-bg': printTokens.bg,
    '--color-print-text': printTokens.text,
    ...brandToCssVars(deriveBrand(undefined)),
    '--touch-min': `${scales.touchMin}px`,
    '--font-sans':
      'var(--font-plex-arabic), var(--font-geist), system-ui, sans-serif',
  };
  for (const [key, value] of Object.entries(scales.radius))
    vars[`--radius-${key}`] = `${value}px`;
  scales.spacing.forEach((value, index) => {
    vars[`--space-${index + 1}`] = `${value}px`;
  });
  for (const [key, value] of Object.entries(scales.text))
    vars[`--text-${key}`] = value;
  for (const [key, value] of Object.entries(scales.lineHeight))
    vars[`--line-height-${key}`] = value;
  for (const [key, value] of Object.entries(scales.shadow))
    vars[`--shadow-${key}`] = value;
  for (const [key, value] of Object.entries(scales.motion))
    vars[`--motion-${key}`] = `${value}ms`;
  return `:root { color-scheme: light; ${modeCss(modes.light)} ${declarations(vars)} }
:root, [data-brand-scope] { ${mapping('light')} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${modeCss(modes.dark)} }
  :root:not([data-theme="light"]), :root:not([data-theme="light"]) [data-brand-scope] { ${mapping('dark')} }
}
:root[data-theme="dark"] { color-scheme: dark; ${modeCss(modes.dark)} }
:root[data-theme="dark"], :root[data-theme="dark"] [data-brand-scope] { ${mapping('dark')} }`;
}
