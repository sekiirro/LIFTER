import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const integrationFiles = [
  'branding-banner-pipeline.test.ts',
  'branding-owner-gc.test.ts',
  'branding-proxy-resolution.test.ts',
  'branding-storage-context.test.ts',
  'branding-storage-policy.test.ts',
  'branding-upload-recovery.test.ts',
  'branding-validator.test.ts',
];
const browserFiles = [
  'branding-banner-loaded.spec.ts',
  'client-accounts-storage.spec.ts',
];

function skippedStatus(status) {
  return ['pending', 'skipped', 'skip'].includes(String(status).toLowerCase());
}

export function assertVitestStorageReport(
  report,
  requiredFiles = integrationFiles,
) {
  const testResults = Array.isArray(report?.testResults)
    ? report.testResults
    : [];
  const matched = new Map();
  for (const result of testResults) {
    const name = String(result?.name ?? '').replaceAll('\\', '/');
    const required = requiredFiles.find((file) => name.endsWith(file));
    if (!required) continue;
    matched.set(required, result);
  }
  const missing = requiredFiles.filter((file) => !matched.has(file));
  const assertions = [...matched.values()].flatMap((result) =>
    Array.isArray(result.assertionResults) ? result.assertionResults : [],
  );
  const skipped = assertions.filter((test) =>
    skippedStatus(test.status),
  ).length;
  const failed = assertions.filter((test) => test.status === 'failed').length;
  const passed = assertions.filter((test) => test.status === 'passed').length;
  if (missing.length || skipped || failed || !passed)
    throw new Error(
      `Storage integration guard failed: missing=${missing.join(',') || 'none'} skipped=${skipped} failed=${failed} passed=${passed}`,
    );
  return { files: matched.size, passed, skipped, failed };
}

function collectFiles(value, files = new Set()) {
  if (!value || typeof value !== 'object') return files;
  if (typeof value.file === 'string')
    files.add(value.file.replaceAll('\\', '/'));
  for (const child of Object.values(value)) {
    if (Array.isArray(child))
      child.forEach((item) => collectFiles(item, files));
    else if (child && typeof child === 'object') collectFiles(child, files);
  }
  return files;
}

export function assertPlaywrightStorageReport(
  report,
  requiredFiles = browserFiles,
) {
  const files = collectFiles(report);
  const missing = requiredFiles.filter(
    (required) => ![...files].some((file) => file.endsWith(required)),
  );
  const stats = report?.stats ?? {};
  const result = {
    files: requiredFiles.length - missing.length,
    passed: Number(stats.expected ?? 0),
    skipped: Number(stats.skipped ?? 0),
    failed: Number(stats.unexpected ?? 0),
    flaky: Number(stats.flaky ?? 0),
  };
  if (
    missing.length ||
    result.skipped ||
    result.failed ||
    result.flaky ||
    !result.passed
  )
    throw new Error(
      `Storage Playwright guard failed: missing=${missing.join(',') || 'none'} skipped=${result.skipped} failed=${result.failed} flaky=${result.flaky} passed=${result.passed}`,
    );
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [kind, reportPath] = process.argv.slice(2);
  if (!reportPath || !['integration', 'playwright'].includes(kind)) {
    console.error(
      'Usage: node scripts/assert-storage-suite-zero-skips.mjs <integration|playwright> <json-report>',
    );
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const summary =
    kind === 'integration'
      ? assertVitestStorageReport(report)
      : assertPlaywrightStorageReport(report);
  console.log(JSON.stringify({ acceptable: true, ...summary }));
}
