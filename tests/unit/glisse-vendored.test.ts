import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vendored Glisse performance patch', () => {
  it('keeps both map density caps at 0.75 in ESM and CJS bundles', () => {
    for (const bundle of ['index.js', 'index.cjs']) {
      const source = readFileSync(`vendor/glisse/dist/${bundle}`, 'utf8');
      expect(
        source.match(
          /const density = Math\.min\(devicePixelRatio \|\| 1, 0\.75\);/g,
        ),
      ).toHaveLength(2);
    }
  });
});
