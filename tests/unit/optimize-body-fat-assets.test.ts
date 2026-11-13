import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const script = join(
  process.cwd(),
  'scripts/media/optimize-body-fat-assets.mjs',
);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'body-fat-media-'));
  tempDirs.push(root);
  const sourceRoot = join(root, 'source');
  const imagePath = join(sourceRoot, 'female/18.png');
  const outputRoot = join(root, 'output');
  const provenancePath = join(root, 'PROVENANCE.md');
  await mkdir(join(sourceRoot, 'female'), { recursive: true });
  const image = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=128x96:rate=1',
      '-frames:v',
      '1',
      '-threads',
      '1',
      '-y',
      imagePath,
    ],
    { encoding: 'utf8' },
  );
  expect(image.status, image.stderr).toBe(0);
  const bytes = await readFile(imagePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(
    provenancePath,
    `| Relative source path | Bytes | SHA-256 |\n| --- | ---: | --- |\n| \`female/18.png\` | ${bytes.length} | \`${sha256}\` |\n`,
    'utf8',
  );

  return { imagePath, outputRoot, provenancePath, sourceRoot };
}

function generate(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

describe('body-fat derivative generator', () => {
  it('rejects empty and repeated format names', async () => {
    const item = await fixture();
    for (const formats of [',', 'webp,webp']) {
      const result = generate([
        '--source-root',
        item.sourceRoot,
        '--output-root',
        join(item.outputRoot, formats === ',' ? 'empty' : 'repeated'),
        '--provenance',
        item.provenancePath,
        '--formats',
        formats,
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--formats');
    }
  });

  it('requires an explicit source root instead of a machine-local default', async () => {
    const item = await fixture();
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--output-root',
        join(item.outputRoot, 'no-source'),
        '--provenance',
        item.provenancePath,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, BODY_FAT_SOURCE_ROOT: '' },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--source-root');
  });

  it('emits the same bytes on repeated runs and reports output size against the budget', async () => {
    const item = await fixture();
    const common = [
      '--source-root',
      item.sourceRoot,
      '--provenance',
      item.provenancePath,
      '--max-width',
      '64',
      '--formats',
      'webp,avif',
    ];
    const first = generate([
      ...common,
      '--output-root',
      join(item.outputRoot, 'first'),
    ]);
    const second = generate([
      ...common,
      '--output-root',
      join(item.outputRoot, 'second'),
    ]);

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    const firstReport = JSON.parse(first.stdout);
    const secondReport = JSON.parse(second.stdout);
    expect(firstReport.derivatives).toHaveLength(2);
    expect(
      firstReport.derivatives.map((entry: { sha256: string }) => entry.sha256),
    ).toEqual(
      secondReport.derivatives.map((entry: { sha256: string }) => entry.sha256),
    );
    expect(firstReport.derivatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ format: 'webp', withinBudget: true }),
        expect.objectContaining({ format: 'avif', withinBudget: true }),
      ]),
    );
    expect(
      firstReport.derivatives.every(
        (entry: { bytes: number }) => entry.bytes <= 150_000,
      ),
    ).toBe(true);
  });

  it('caps derivative width and writes the declared WebP and AVIF formats', async () => {
    const item = await fixture();
    const result = generate([
      '--source-root',
      item.sourceRoot,
      '--output-root',
      item.outputRoot,
      '--provenance',
      item.provenancePath,
      '--max-width',
      '64',
      '--formats',
      'webp,avif',
    ]);

    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    for (const derivative of report.derivatives as Array<{
      format: string;
      height: number;
      path: string;
      width: number;
    }>) {
      expect(derivative.width).toBeLessThanOrEqual(64);
      expect(derivative.height).toBeGreaterThan(0);
      expect(derivative.path).toMatch(new RegExp(`\\.${derivative.format}$`));
      const probe = spawnSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height,codec_name',
          '-of',
          'json',
          join(item.outputRoot, derivative.path),
        ],
        { encoding: 'utf8' },
      );
      expect(probe.status, probe.stderr).toBe(0);
      const stream = JSON.parse(probe.stdout).streams[0];
      expect(stream.width).toBe(derivative.width);
      expect(stream.height).toBe(derivative.height);
      expect(stream.codec_name).toBe(
        derivative.format === 'webp' ? 'webp' : 'av1',
      );
    }
  });

  it('rejects a source whose bytes do not match the provenance SHA-256', async () => {
    const item = await fixture();
    const changedImage = spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:size=128x96',
        '-frames:v',
        '1',
        '-threads',
        '1',
        '-y',
        item.imagePath,
      ],
      { encoding: 'utf8' },
    );
    expect(changedImage.status, changedImage.stderr).toBe(0);
    const result = generate([
      '--source-root',
      item.sourceRoot,
      '--output-root',
      item.outputRoot,
      '--provenance',
      item.provenancePath,
      '--formats',
      'webp',
    ]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Source verification failed',
    );
    expect(`${result.stdout}${result.stderr}`).toContain('SHA-256');
  });

  it('refuses to place generated files inside the read-only source tree', async () => {
    const item = await fixture();
    const outputRoot = join(item.sourceRoot, 'generated');
    const result = generate([
      '--source-root',
      item.sourceRoot,
      '--output-root',
      outputRoot,
      '--provenance',
      item.provenancePath,
      '--formats',
      'webp',
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Output directory must be separate');
  });
});
