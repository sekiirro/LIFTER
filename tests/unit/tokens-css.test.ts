import { describe, expect, it } from 'vitest';
import { deriveBrand } from '../../lib/design/color';
import { brandToCssVars, tokensToCss } from '../../lib/design/tokens-css';

describe('token CSS', () => {
  it('declares every contract variable', () => {
    const css = tokensToCss();
    const names = [
      ...[
        'bg',
        'card',
        'card-raised',
        'border',
        'border-strong',
        'text',
        'text-muted',
        'text-disabled',
        'overlay',
      ].map((v) => `color-${v}`),
      ...['success', 'warning', 'error', 'info'].flatMap((tone) =>
        ['fg', 'bg', 'border'].map((part) => `color-${tone}-${part}`),
      ),
      ...['fill', 'fill-hover', 'on-fill', 'text', 'ring'].map(
        (v) => `brand-${v}`,
      ),
      ...['sm', 'button', 'card', 'full'].map((v) => `radius-${v}`),
      ...Array.from({ length: 10 }, (_, i) => `space-${i + 1}`),
      ...['xs', 'sm', 'base', 'lg', 'xl', '2xl'].map((v) => `text-${v}`),
      'font-sans',
      'shadow-sm',
      'shadow-md',
      'motion-fast',
      'motion-base',
      'motion-slow',
      'touch-min',
    ];
    for (const name of names) expect(css).toContain(`--${name}:`);
  });
  it('maps scopes in light, system dark, and explicit dark modes', () => {
    const css = tokensToCss();
    expect(css).toContain(':root, [data-brand-scope]');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"]) {');
    expect(css).toContain(':root:not([data-theme="light"]) [data-brand-scope]');
    expect(css).toContain(':root[data-theme="dark"] {');
    expect(css).toContain(':root[data-theme="dark"] [data-brand-scope]');
    for (const part of ['fill', 'fill-hover', 'on-fill', 'text', 'ring']) {
      expect(
        css.match(
          new RegExp(`--brand-${part}: var\\(--brand-${part}-dark\\);`, 'g'),
        ),
      ).toHaveLength(2);
      expect(css).toContain(`--brand-${part}: var(--brand-${part}-light);`);
    }
    expect(css).toContain('color-scheme: light;');
    expect(css).toContain('color-scheme: dark;');
  });
  it('exports only the ten scoped brand values', () => {
    const brand = deriveBrand('#FFFF00');
    const vars = brandToCssVars(brand);
    expect(Object.keys(vars)).toHaveLength(10);
    for (const mode of ['light', 'dark'] as const) {
      expect(vars[`--brand-fill-${mode}`]).toBe(brand[mode].fill);
      expect(vars[`--brand-fill-hover-${mode}`]).toBe(brand[mode].fillHover);
      expect(vars[`--brand-on-fill-${mode}`]).toBe(brand[mode].onFill);
      expect(vars[`--brand-text-${mode}`]).toBe(brand[mode].text);
      expect(vars[`--brand-ring-${mode}`]).toBe(brand[mode].ring);
    }
  });
});
