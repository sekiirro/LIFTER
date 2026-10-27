import { readFile } from 'node:fs/promises';
import { parseArgs, requireArgs } from '../backup/lib/args.mjs';
import { isMain, positive, run } from './lib/cli.mjs';
import { projectUsage } from './lib/projection.mjs';

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv, ['per-row', 'volumes', 'limit-mb']);
  requireArgs(args, ['per-row', 'volumes']);
  const usage = JSON.parse(await readFile(args['per-row'], 'utf8'));
  const volumes = JSON.parse(await readFile(args.volumes, 'utf8'));
  const report = projectUsage(usage, volumes, positive(args['limit-mb'], 500));
  console.table(report.tables);
  console.log(
    `${report.complete ? 'Total' : 'Partial total (MISSING volumes)'}: ${report.total_bytes} bytes / ${report.limit_bytes} bytes (${report.pct.toFixed(2)}%, ${report.verdict})`,
  );
  process.exitCode = report.complete ? 0 : 2;
}
if (isMain(import.meta.url)) run(main);
