import { readFile } from 'node:fs/promises';
import { parseArgs, requireArgs } from '../backup/lib/args.mjs';
import { assertSafeBaseUrl, normalizeRoute } from './lib/routes.mjs';
import { percentile } from './lib/stats.mjs';
import { isMain, output, positive, run } from './lib/cli.mjs';

export async function probe(
  baseUrl,
  routes,
  n = 20,
  concurrency = 2,
  request = fetch,
) {
  const base = assertSafeBaseUrl(baseUrl);
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 200 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 5
  )
    throw new Error('Invalid probe bounds');
  if (!Array.isArray(routes) || !routes.length)
    throw new Error('Invalid routes');
  const targets = routes.map((route) => {
    if (
      typeof route.path !== 'string' ||
      !route.path.startsWith('/') ||
      route.path.startsWith('//')
    )
      throw new Error('Invalid route path');
    const target = assertSafeBaseUrl(new URL(route.path, base).href);
    if (target.origin !== base.origin)
      throw new Error('Route must use base origin');
    return target;
  });
  const report = [];
  for (const target of targets) {
    const samples = [];
    for (let offset = 0; offset < n; offset += concurrency) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(concurrency, n - offset) }, async () => {
          const start = performance.now();
          const response = await request(target, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'omit',
            signal: AbortSignal.timeout(15000),
          });
          let bytes = 0;
          if (response.body)
            for await (const chunk of response.body) bytes += chunk.byteLength;
          return {
            status: response.status,
            ms: performance.now() - start,
            bytes,
          };
        }),
      );
      samples.push(...batch);
    }
    const statuses = {};
    for (const sample of samples)
      statuses[sample.status] = (statuses[sample.status] ?? 0) + 1;
    report.push({
      route: normalizeRoute('GET', target.href),
      count: samples.length,
      statuses,
      p50_ms: percentile(
        samples.map((sample) => sample.ms),
        50,
      ),
      p95_ms: percentile(
        samples.map((sample) => sample.ms),
        95,
      ),
      median_bytes: percentile(
        samples.map((sample) => sample.bytes),
        50,
      ),
    });
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    'base-url',
    'routes',
    'n',
    'concurrency',
    'json',
  ]);
  requireArgs(args, ['base-url', 'routes']);
  assertSafeBaseUrl(args['base-url']);
  const report = await probe(
    args['base-url'],
    JSON.parse(await readFile(args.routes, 'utf8')),
    positive(args.n, 20),
    positive(args.concurrency, 2),
  );
  console.table(
    report.map((row) => ({ ...row, statuses: JSON.stringify(row.statuses) })),
  );
  await output(report, args.json);
}
if (isMain(import.meta.url)) run(main);
