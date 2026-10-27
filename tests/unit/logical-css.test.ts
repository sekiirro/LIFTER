import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbidden =
  /(?:\b(?:margin|padding|border)-(?:left|right)\b|\b(?:text-align|float)\s*:\s*(?:left|right)\b|(?:^|[;{}\s])(?:left|right)\s*:)/gim;
const violations = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').match(forbidden) ?? [];

describe('logical CSS', () => {
  it('scans all application and component styles', () => {
    const files = globSync(['app/**/*.css', 'components/**/*.css']);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files)
      expect(violations(readFileSync(file, 'utf8')), file).toEqual([]);
  });
  it.each([
    'margin-left: 0',
    'margin-right: 0',
    'padding-left: 0',
    'padding-right: 0',
    'border-left: 0',
    'border-right-color: red',
    'text-align: left',
    'text-align: right',
    'float: left',
    'float: right',
    'left: 0',
    'right: 0',
  ])('rejects %s', (css) => {
    expect(violations(`a { ${css}; }`).length).toBeGreaterThan(0);
  });
  it('allows logical properties and ignores comments', () => {
    expect(
      violations(
        'a { inset-inline-start: 0; inset-inline-end: 0; margin-inline: 0; text-align: start; } /* left: 0 */',
      ),
    ).toEqual([]);
  });
});
