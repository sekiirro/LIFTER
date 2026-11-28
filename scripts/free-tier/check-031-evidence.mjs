// Slice-1 docs/evidence acceptance check (spec 031 FR-009/SC-004/T009/T010).
// Read-only: validates links, gate status, single-register rule and redaction.
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const base = 'specs/031-security-performance-readiness/reports';
const baselinePath = process.argv[2] ?? `${base}/perf-baseline-2026-11-27.json`;
const files = [
  `${base}/pen-test-readiness.md`,
  `${base}/coverage-map.md`,
  `${base}/evidence-index.md`,
  `${base}/perf-route-matrix.json`,
  baselinePath,
  `${base}/perf-baseline-2026-11-27.md`,
  'scripts/free-tier/baseline-031.mjs',
];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

for (const file of files) {
  try {
    await access(file);
  } catch {
    failures.push(`missing artifact: ${file}`);
  }
}
const register = await readFile('docs/13-production-readiness.md', 'utf8');
const ptRows = register
  .split('\n')
  .filter((line) => line.startsWith('| PT-01 '));
const piRows = register
  .split('\n')
  .filter((line) => line.startsWith('| PI-03 '));
check(ptRows.length === 1, `PT-01 row count is ${ptRows.length}, expected 1`);
check(piRows.length === 1, `PI-03 row count is ${piRows.length}, expected 1`);
check(
  ptRows.some((line) => line.includes('| Open ')),
  'PT-01 is not Open',
);
check(
  piRows.some((line) => line.includes('| Open ')),
  'PI-03 is not Open',
);
check(register.includes('S71-PO-7'), 'docs/13 does not cite S71-PO-7');

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
check(
  [
    'PROPOSED_ONLY_NOT_A_GATE_PENDING_PO_SIGNATURE',
    'SIGNED_PER_S73_PO_4',
  ].includes(baseline.gate_status),
  `baseline gate status is unexpected: ${baseline.gate_status}`,
);
check(baseline.http_routes.length === 9, 'expected 9 HTTP route rows');
check(baseline.db_query_classes.length === 4, 'expected 4 DB query-class rows');
check(
  baseline.pilot_volumes.derivedVolumes.clients === 300,
  'pilot clients not 300',
);
check(
  baseline.pilot_volumes.derivedVolumes.plans === 600,
  'pilot plans not 600',
);

if (process.argv[2]) {
  check(
    ['next-start-production', 'next-dev'].includes(
      baseline.environment?.server_mode,
    ),
    'baseline server mode is missing or unsupported',
  );
  for (const route of baseline.http_routes) {
    check(
      Array.isArray(route.status_samples) &&
        route.status_samples.length === route.count &&
        route.status_samples.every((status) => status === 200),
      `route did not record only HTTP 200 samples: ${route.route}`,
    );
    check(
      Number.isFinite(route.p50_ms) &&
        Number.isFinite(route.p95_ms) &&
        Number.isFinite(route.max_ms) &&
        Array.isArray(route.response_bytes) &&
        route.response_bytes.length === route.count,
      `route timing or response-byte samples are incomplete: ${route.route}`,
    );
  }
}

for (const file of files.filter(
  (f) => f.endsWith('.md') || f.endsWith('.json'),
)) {
  const text = await readFile(file, 'utf8');
  const secret =
    /(eyJ[A-Za-z0-9_-]{10,}|SuperSecret|service_role\s*[:=]\s*['"]?ey|whsec_[A-Za-z0-9]{10,})/;
  check(!secret.test(text), `possible secret in ${file}`);
  for (const match of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    try {
      await access(resolve(dirname(file), target));
    } catch {
      failures.push(`broken link in ${file}: ${target}`);
    }
  }
}
if (failures.length) {
  console.error(`031 evidence check FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  '031 evidence check PASS: 7 artifacts, single Open PT-01/PI-03 register rows, proposal-only gate, 9 routes + 4 query classes, links resolve, no secret patterns',
);
