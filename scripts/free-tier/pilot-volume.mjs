// Offline S31-PO-4 pilot-unit -> relation volume projection (no DB, no network).
import { isMain, run } from './lib/cli.mjs';
import { projectPilotVolumes } from './lib/pilot-volumes.mjs';

export async function main() {
  const report = projectPilotVolumes();
  console.log('S31-PO-4 pilot inputs:', report.inputs);
  console.log('Derived volumes:', report.derivedVolumes);
  console.table(
    report.tables.map(
      ({ table, unit, expectedRows, basis, source, status }) => ({
        table,
        unit,
        expectedRows,
        status,
        basis,
        source,
      }),
    ),
  );
  for (const entry of report.unverified) {
    console.log(
      `UNVERIFIED: ${entry.input} — ${entry.reason} [${entry.source}]`,
    );
  }
  console.log(
    'Complete byte projection: NO (per-row byte basis not verified offline)',
  );
  process.exitCode = 0;
}

if (isMain(import.meta.url)) run(main);
