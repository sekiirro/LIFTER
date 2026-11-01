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
  'branding-production-ui.spec.ts',
  'client-accounts-storage.spec.ts',
];

function skippedStatus(status) {
  return ['pending', 'skipped', 'skip', 'todo'].includes(
    String(status).toLowerCase(),
  );
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
  const failedFiles = [...matched.values()].filter(
    (result) => result.status === 'failed',
  ).length;
  const passedTests = assertions.filter((test) => test.status === 'passed');
  const passed = passedTests.length;
  const noPassedFiles = requiredFiles.filter(
    (file) =>
      !matched
        .get(file)
        ?.assertionResults?.some((test) => test.status === 'passed'),
  );
  if (
    report?.success === false ||
    missing.length ||
    skipped ||
    failed ||
    failedFiles ||
    noPassedFiles.length
  )
    throw new Error(
      `Storage integration guard failed: reportFailed=${report?.success === false} missing=${missing.join(',') || 'none'} skipped=${skipped} failed=${failed} failedFiles=${failedFiles} noPassed=${noPassedFiles.join(',') || 'none'} passed=${passed}`,
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

function collectPlaywrightTests(value, file = '', tests = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPlaywrightTests(item, file, tests));
    return tests;
  }
  if (!value || typeof value !== 'object') return tests;

  const currentFile =
    typeof value.file === 'string' ? value.file.replaceAll('\\', '/') : file;
  if (Array.isArray(value.tests)) {
    for (const test of value.tests) tests.push({ file: currentFile, test });
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'tests') collectPlaywrightTests(child, currentFile, tests);
  }
  return tests;
}

export function assertPlaywrightStorageReport(
  report,
  requiredFiles = browserFiles,
) {
  const files = collectFiles(report);
  const missing = requiredFiles.filter(
    (required) => ![...files].some((file) => file.endsWith(required)),
  );
  const tests = collectPlaywrightTests(report);
  const fileTests = new Map(
    requiredFiles.map((file) => [
      file,
      tests
        .filter((entry) => entry.file.endsWith(file))
        .map(({ test }) => test),
    ]),
  );
  const expectedFailures = requiredFiles.filter((file) =>
    fileTests.get(file).some((test) => test.expectedStatus === 'failed'),
  );
  const noPassedFiles = requiredFiles.filter(
    (file) =>
      !fileTests
        .get(file)
        .some((test) =>
          test.results?.some((result) => result.status === 'passed'),
        ),
  );
  const stats = report?.stats ?? {};
  const result = {
    files: requiredFiles.length - missing.length,
    passed: requiredFiles.reduce(
      (count, file) =>
        count +
        fileTests
          .get(file)
          .filter((test) =>
            test.results?.some((item) => item.status === 'passed'),
          ).length,
      0,
    ),
    skipped: Number(stats.skipped ?? 0),
    failed: Number(stats.unexpected ?? 0),
    flaky: Number(stats.flaky ?? 0),
    errors: Array.isArray(report?.errors) ? report.errors.length : 0,
  };
  if (
    missing.length ||
    expectedFailures.length ||
    noPassedFiles.length ||
    result.skipped ||
    result.failed ||
    result.flaky ||
    result.errors ||
    !result.passed
  )
    throw new Error(
      `Storage Playwright guard failed: missing=${missing.join(',') || 'none'} expectedFailures=${expectedFailures.join(',') || 'none'} noPassed=${noPassedFiles.join(',') || 'none'} skipped=${result.skipped} failed=${result.failed} flaky=${result.flaky} errors=${result.errors} passed=${result.passed}`,
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
