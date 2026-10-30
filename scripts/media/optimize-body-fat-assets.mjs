#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, rename, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SOURCE = 'C:/Users/NEW LAP/Desktop/YBS SYSTEM/public/body-fat';
const DEFAULT_OUTPUT = join(REPO_ROOT, 'public/images/body-fat');
const DEFAULT_PROVENANCE = join(
  REPO_ROOT,
  'specs/015-forms-intake/assets/body-fat/PROVENANCE.md',
);
const SIZE_BUDGET_BYTES = 150_000;
const MAX_DISPLAY_WIDTH = 384;
const DEFAULT_MAX_WIDTH = MAX_DISPLAY_WIDTH * 2;
const SUPPORTED_GROUPS = ['female', 'male', 'male-cinematic'];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const FORMAT_SETTINGS = {
  webp: {
    extension: '.webp',
    codec: 'libwebp',
    qualitySteps: [78, 70, 62, 54, 46, 40],
    args: (quality) => ['-quality', String(quality), '-compression_level', '6'],
  },
  avif: {
    extension: '.avif',
    codec: 'libaom-av1',
    qualitySteps: [32, 36, 40, 44, 48, 52],
    args: (crf) => [
      '-still-picture',
      '1',
      '-cpu-used',
      '6',
      '-crf',
      String(crf),
      '-b:v',
      '0',
    ],
  },
};

function parseArgs(argv) {
  const result = {
    sourceRoot: DEFAULT_SOURCE,
    outputRoot: DEFAULT_OUTPUT,
    provenancePath: DEFAULT_PROVENANCE,
    maxWidth: DEFAULT_MAX_WIDTH,
    formats: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help' || key === '-h') {
      result.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${key}`);
    if (key === '--source-root') result.sourceRoot = value;
    else if (key === '--output-root') result.outputRoot = value;
    else if (key === '--provenance') result.provenancePath = value;
    else if (key === '--max-width') result.maxWidth = Number(value);
    else if (key === '--formats')
      result.formats = value.split(',').filter(Boolean);
    else throw new Error(`Unknown option: ${key}`);
    index += 1;
  }

  if (
    !Number.isInteger(result.maxWidth) ||
    result.maxWidth < 2 ||
    result.maxWidth > DEFAULT_MAX_WIDTH
  ) {
    throw new Error(
      `--max-width must be an integer from 2 to ${DEFAULT_MAX_WIDTH} pixels`,
    );
  }
  if (
    result.formats &&
    result.formats.some((format) => !FORMAT_SETTINGS[format])
  ) {
    throw new Error('--formats accepts only webp and avif');
  }
  return result;
}

function displayHelp() {
  return [
    'Generate deterministic body-fat image derivatives from the read-only YBS originals.',
    '',
    'Options:',
    `  --source-root PATH   Source directory (default: ${DEFAULT_SOURCE})`,
    `  --output-root PATH   Derivative directory (default: ${DEFAULT_OUTPUT})`,
    `  --provenance PATH    Source hash table (default: ${DEFAULT_PROVENANCE})`,
    `  --max-width PIXELS   Maximum derivative width (default: ${DEFAULT_MAX_WIDTH})`,
    '  --formats LIST       Comma-separated webp,avif; defaults to available encoders',
  ].join('\n');
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    const detail = [error.stderr, error.stdout, error.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(`${command} failed: ${detail}`);
  }
}

function availableEncoders() {
  const encoders = run('ffmpeg', ['-hide_banner', '-encoders']);
  const muxers = run('ffmpeg', ['-hide_banner', '-muxers']);
  const available = ['webp'];
  if (/\blibwebp\b/.test(encoders) && /\bwebp\b/.test(muxers)) {
    available.splice(available.indexOf('webp'), 1, 'webp');
  } else {
    throw new Error('FFmpeg must provide the libwebp encoder and WebP muxer');
  }
  if (/\blibaom-av1\b/.test(encoders) && /\bavif\b/.test(muxers))
    available.push('avif');
  return available;
}

function parseProvenance(markdown) {
  const entries = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*`([a-f\d]{64})`\s*\|$/i,
    );
    if (!match) continue;
    const [, sourcePath, bytes, sha256] = match;
    const normalizedPath = sourcePath.replaceAll('\\', '/');
    if (entries.has(normalizedPath))
      throw new Error(`Duplicate provenance path: ${normalizedPath}`);
    entries.set(normalizedPath, {
      bytes: Number(bytes),
      sha256: sha256.toLowerCase(),
    });
  }
  if (entries.size === 0)
    throw new Error('No source hashes found in PROVENANCE.md');
  return entries;
}

async function imageFiles(sourceRoot) {
  const results = [];
  for (const group of SUPPORTED_GROUPS) {
    const groupPath = join(sourceRoot, group);
    let names;
    try {
      names = await readdir(groupPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of names) {
      if (
        !entry.isFile() ||
        !IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())
      )
        continue;
      const absolutePath = join(groupPath, entry.name);
      const sourcePath = relative(sourceRoot, absolutePath)
        .split(sep)
        .join('/');
      results.push({ absolutePath, sourcePath });
    }
  }
  return results.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath, 'en'),
  );
}

async function verifySources(sourceRoot, provenance) {
  const files = await imageFiles(sourceRoot);
  const actualPaths = new Set(files.map(({ sourcePath }) => sourcePath));
  const recordedPaths = new Set(provenance.keys());
  const missing = [...recordedPaths].filter(
    (sourcePath) => !actualPaths.has(sourcePath),
  );
  const unrecorded = [...actualPaths].filter(
    (sourcePath) => !recordedPaths.has(sourcePath),
  );
  if (missing.length || unrecorded.length) {
    throw new Error(
      `Source inventory differs from PROVENANCE.md; missing: ${missing.join(', ') || 'none'}; unrecorded: ${unrecorded.join(', ') || 'none'}`,
    );
  }

  for (const file of files) {
    const bytes = await readFile(file.absolutePath);
    const record = provenance.get(file.sourcePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== record.bytes || sha256 !== record.sha256) {
      throw new Error(
        `Source verification failed for ${file.sourcePath}: expected ${record.bytes} bytes and SHA-256 ${record.sha256}; received ${bytes.length} bytes and SHA-256 ${sha256}`,
      );
    }
  }
  return files;
}

function selectedFiles(files) {
  return files.filter(({ sourcePath }) => /^(female|male)\//.test(sourcePath));
}

function makeScaleFilter(maxWidth) {
  return `scale=w='min(${maxWidth},iw)':h=-2:flags=lanczos`;
}

async function encodeDerivative(source, outputRoot, format, maxWidth) {
  const settings = FORMAT_SETTINGS[format];
  const group = source.sourcePath.split('/')[0];
  const name = basename(source.sourcePath, extname(source.sourcePath));
  const relativeOutput = `${group}-${name}${settings.extension}`;
  const outputPath = join(outputRoot, relativeOutput);
  const temporaryPath = `${outputPath}.tmp${settings.extension}`;
  const widthSteps = [
    ...new Set(
      [maxWidth, 640, 512, 384, 256, 192].filter((n) => n <= maxWidth),
    ),
  ];
  let attempt;

  try {
    for (const width of widthSteps) {
      for (const quality of settings.qualitySteps) {
        await rmIfPresent(temporaryPath);
        run('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-threads',
          '1',
          '-i',
          source.absolutePath,
          '-map_metadata',
          '-1',
          '-frames:v',
          '1',
          '-vf',
          makeScaleFilter(width),
          '-pix_fmt',
          'yuv420p',
          '-c:v',
          settings.codec,
          ...settings.args(quality),
          '-threads',
          '1',
          '-y',
          temporaryPath,
        ]);
        const fileStat = await stat(temporaryPath);
        attempt = { width, quality, bytes: fileStat.size };
        if (fileStat.size <= SIZE_BUDGET_BYTES) {
          await rename(temporaryPath, outputPath);
          const sha256 = createHash('sha256')
            .update(await readFile(outputPath))
            .digest('hex');
          const probe = JSON.parse(
            run('ffprobe', [
              '-v',
              'error',
              '-select_streams',
              'v:0',
              '-show_entries',
              'stream=width,height,codec_name',
              '-of',
              'json',
              outputPath,
            ]),
          ).streams[0];
          return {
            source: source.sourcePath,
            sourceSha256: (await source.sourceSha256) ?? undefined,
            path: relative(outputRoot, outputPath).split(sep).join('/'),
            format,
            codec: probe.codec_name,
            width: probe.width,
            height: probe.height,
            bytes: fileStat.size,
            sizeBudgetBytes: SIZE_BUDGET_BYTES,
            withinBudget: fileStat.size <= SIZE_BUDGET_BYTES,
            maxWidth,
            quality,
            sha256,
          };
        }
      }
    }
    throw new Error(
      `Unable to meet ${SIZE_BUDGET_BYTES}-byte budget for ${source.sourcePath} (${format}); last attempt ${JSON.stringify(attempt)}`,
    );
  } finally {
    await rmIfPresent(temporaryPath);
  }
}

async function rmIfPresent(path) {
  await rm(path, { force: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${displayHelp()}\n`);
    return;
  }

  const sourceRoot = resolve(options.sourceRoot);
  const outputRoot = resolve(options.outputRoot);
  const provenancePath = resolve(options.provenancePath);
  if (
    outputRoot === sourceRoot ||
    outputRoot.startsWith(`${sourceRoot}${sep}`)
  ) {
    throw new Error(
      'Output directory must be separate from the read-only source tree',
    );
  }
  const available = availableEncoders();
  const formats = options.formats ?? available;
  for (const format of formats) {
    if (!available.includes(format))
      throw new Error(`Requested ${format} encoder is not available`);
  }

  const provenance = parseProvenance(await readFile(provenancePath, 'utf8'));
  const sources = await verifySources(sourceRoot, provenance);
  const selected = selectedFiles(sources);
  if (selected.length === 0)
    throw new Error('No male/ or female/ source images found');
  await mkdir(outputRoot, { recursive: true });

  const derivatives = [];
  for (const source of selected) {
    source.sourceSha256 = provenance.get(source.sourcePath).sha256;
    for (const format of formats) {
      derivatives.push(
        await encodeDerivative(source, outputRoot, format, options.maxWidth),
      );
    }
  }
  process.stdout.write(
    `${JSON.stringify({ sourceCount: sources.length, derivativeCount: derivatives.length, sizeBudgetBytes: SIZE_BUDGET_BYTES, formats, derivatives }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
