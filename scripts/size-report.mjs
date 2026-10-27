import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { evaluate } from './size-limit.mjs';

// https://developers.cloudflare.com/workers/platform/limits/
// checked 2026-10-27: no compressed size limit; 64 MiB uncompressed (Free and Paid)
const defaultLimitKiB = 65536;

async function bundleSizeBytes(directory) {
  let bytes = 0;
  let gzipBytes = 0;
  let files = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await bundleSizeBytes(path);
      bytes += nested.bytes;
      gzipBytes += nested.gzipBytes;
      files += nested.files;
    } else if (
      entry.isFile() &&
      !/\.map$/i.test(entry.name) &&
      !/^README(?:\.md)?$/i.test(entry.name)
    ) {
      const content = await readFile(path);
      bytes += content.byteLength;
      gzipBytes += gzipSync(content, { level: 9 }).byteLength;
      files += 1;
    }
  }
  return { bytes, gzipBytes, files };
}

async function main() {
  const configuredLimit = process.env.WORKER_SIZE_LIMIT_KIB;
  const limitKiB =
    configuredLimit === undefined ? defaultLimitKiB : Number(configuredLimit);
  evaluate(0, limitKiB);

  const outdir = await mkdtemp(join(tmpdir(), 'lifter-worker-size-'));
  try {
    const args = ['wrangler', 'deploy', '--dry-run', '--outdir', outdir];
    // Run npx's JS entry point on Windows to avoid cmd.exe quoting and .cmd
    // execution restrictions. npm run supplies npm_execpath; standalone Node
    // installations also ship npx alongside npm under node_modules/npm/bin.
    const windows = process.platform === 'win32';
    const npxCli = process.env.npm_execpath
      ? join(dirname(process.env.npm_execpath), 'npx-cli.js')
      : join(
          dirname(process.execPath),
          'node_modules',
          'npm',
          'bin',
          'npx-cli.js',
        );
    const result = spawnSync(
      windows ? process.execPath : 'npx',
      windows ? [npxCli, ...args] : args,
      {
        stdio: 'inherit',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Wrangler dry-run failed (${result.signal ?? result.status})`,
      );
    }

    const { bytes, gzipBytes, files } = await bundleSizeBytes(outdir);
    if (files === 0)
      throw new Error('Wrangler emitted no uploaded module files');
    const sizeKiB = bytes / 1024;
    const gzipKiB = gzipBytes / 1024;
    const { pct, over } = evaluate(sizeKiB, limitKiB);
    console.log(
      `Worker size: ${sizeKiB.toFixed(2)} KiB uncompressed (gzip ${gzipKiB.toFixed(2)} KiB) / limit ${limitKiB} KiB (${pct.toFixed(2)}%)`,
    );
    process.exitCode = over ? 1 : 0;
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Worker size report failed: ${error.message}`);
  process.exitCode = 1;
});
