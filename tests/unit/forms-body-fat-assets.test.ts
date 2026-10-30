import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const manifestPath = join(
  root,
  'tests/fixtures/forms/body-fat-derivative-manifest.json',
);
const provenancePath = join(
  root,
  'specs/015-forms-intake/assets/body-fat/PROVENANCE.md',
);
const publicAssetRoot = join(root, 'public/images/body-fat');
const expectedPercentages = {
  male: [10, 12, 15, 18, 20, 22, 25, 28, 30, 32, 35, 40],
  female: [18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 50],
};

type DerivativeEntry = {
  percentage: number;
  source: string;
  sourceSha256: string;
  width: number;
  height: number;
  derivatives: {
    webp: { path: string; bytes: number; sha256: string };
    avif?: { path: string; bytes: number; sha256: string };
  };
};

type DerivativeManifest = {
  seriesBySexAnswer: Record<string, string>;
  unusedSeries: string[];
  sizeBudgetBytes: number;
  maxDisplayWidth: number;
  maxWidth: number;
  series: Record<string, DerivativeEntry[]>;
};

function parseSourceHashes(markdown: string) {
  const result = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*\d+\s*\|\s*`([a-f\d]{64})`\s*\|$/i,
    );
    if (match) result.set(match[1]!, match[2]!.toLowerCase());
  }
  return result;
}

describe('N12 body-fat derivative catalog', () => {
  it('resolves every approved percentage to a source-verified WebP and AVIF derivative', async () => {
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as DerivativeManifest;
    const provenance = parseSourceHashes(
      await readFile(provenancePath, 'utf8'),
    );
    expect(manifest.sizeBudgetBytes).toBe(150_000);
    expect(manifest.maxWidth).toBe(manifest.maxDisplayWidth * 2);

    for (const [series, percentages] of Object.entries(expectedPercentages)) {
      const entries = manifest.series[series];
      if (!entries)
        throw new Error(`Missing ${series} series in derivative manifest`);
      expect(entries.map(({ percentage }) => percentage)).toEqual(percentages);
      for (const entry of entries) {
        expect(entry.source).toBe(`${series}/${entry.percentage}.png`);
        expect(entry.sourceSha256).toBe(provenance.get(entry.source));
        expect(entry.sourceSha256).toMatch(/^[a-f\d]{64}$/);
        expect(entry.width).toBeLessThanOrEqual(manifest.maxWidth);
        for (const format of ['webp', 'avif'] as const) {
          const derivative = entry.derivatives[format];
          expect(derivative).toBeDefined();
          const assetPath = derivative!.path;
          expect(assetPath).toBe(
            `public/images/body-fat/${series}-${entry.percentage}.${format}`,
          );
          const file = join(root, assetPath);
          const [fileBytes, fileStat] = await Promise.all([
            readFile(file),
            stat(file),
          ]);
          expect(fileStat.size).toBeGreaterThan(0);
          expect(fileStat.size).toBeLessThanOrEqual(manifest.sizeBudgetBytes);
          expect(fileStat.size).toBe(derivative!.bytes);
          expect(createHash('sha256').update(fileBytes).digest('hex')).toBe(
            derivative!.sha256,
          );
        }
      }
    }
  });

  it('maps only standard male/female series and keeps originals and male-cinematic out of tracked paths', async () => {
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as DerivativeManifest;
    expect(manifest.seriesBySexAnswer).toEqual({
      male: 'male',
      female: 'female',
    });
    expect(manifest.unusedSeries).toContain('male-cinematic');
    expect(Object.keys(manifest.series).sort()).toEqual(['female', 'male']);

    const publicFiles = await readdir(publicAssetRoot);
    expect(
      publicFiles.every((name) =>
        /^(male|female)-\d+\.(webp|avif)$/.test(name),
      ),
    ).toBe(true);
    expect(publicFiles.some((name) => name.includes('cinematic'))).toBe(false);

    const tracked = execFileSync(
      'git',
      ['ls-files', 'public/images/body-fat'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    expect(
      tracked.every((path) => !/male-cinematic|\.(png|jpe?g)$/i.test(path)),
    ).toBe(true);
  });

  it('limits every generated file to the manifest maximum display density', async () => {
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as DerivativeManifest;
    const maxSourceWidth = manifest.maxWidth;
    expect(maxSourceWidth).toBe(manifest.maxDisplayWidth * 2);
    for (const entries of Object.values(manifest.series)) {
      for (const entry of entries) {
        expect(entry.width).toBeLessThanOrEqual(maxSourceWidth);
        expect(entry.height).toBeGreaterThan(0);
      }
    }
  });
});
