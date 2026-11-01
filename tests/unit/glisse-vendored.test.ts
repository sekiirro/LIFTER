import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vendored Glisse performance patch', () => {
  it('keeps the package manifest limited to runtime metadata', () => {
    const packageManifest = JSON.parse(
      readFileSync('vendor/glisse/package.json', 'utf8'),
    ) as Record<string, unknown>;

    expect(packageManifest).not.toHaveProperty('devDependencies');
    expect(packageManifest).not.toHaveProperty('scripts');
    expect(packageManifest).not.toHaveProperty('packageManager');
    expect(packageManifest).not.toHaveProperty('devEngines');
  });

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

  it('exports the in-place refraction hook from both runtime bundles and types', () => {
    for (const bundle of ['index.js', 'index.cjs']) {
      const source = readFileSync(`vendor/glisse/dist/${bundle}`, 'utf8');
      expect(source).toContain('useGlisseRefraction');
    }
    expect(readFileSync('vendor/glisse/dist/index.d.ts', 'utf8')).toContain(
      'useGlisseRefraction',
    );
    expect(readFileSync('vendor/glisse/dist/index.d.cts', 'utf8')).toContain(
      'useGlisseRefraction',
    );
  });
});
