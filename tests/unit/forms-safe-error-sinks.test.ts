import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { mapFormsPublicError } from '../../lib/forms/privacy-contract';

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(path)
        : entry.name.endsWith('.ts')
          ? [path]
          : [];
    },
  );
}

const formsRuntimeFiles = [
  ...sourceFiles('app/api/forms'),
  ...sourceFiles('app/api/internal/forms'),
  'app/api/telegram/webhook/route.ts',
  ...sourceFiles('lib/forms'),
];
const jobsMigration = readFileSync(
  join(root, 'supabase/migrations/20261027160000_jobs.sql'),
  'utf8',
);
const jobsAllowlistMigration = readFileSync(
  join(
    root,
    'supabase/migrations/20261112025800_f15_allowlisted_job_error_codes.sql',
  ),
  'utf8',
);
const auditMigration = readFileSync(
  join(
    root,
    'supabase/migrations/20261102139000_workspace_branding_audit_extension.sql',
  ),
  'utf8',
);
const sinkPatterns = [
  /\bconsole\.(?:debug|error|info|log|trace|warn)\s*\(/i,
  /\b(?:captureException|captureMessage|trackException|emitTelemetry|recordTrace)\s*\(/i,
  /\btracer\.(?:recordException|error|exception)\s*\(/i,
  /\b(?:error|failure)\.message\b/i,
  /\bJSON\.stringify\(\s*(?:error|failure)\s*\)/i,
  /\berror_code\s*:\s*(?:error|failure|String\s*\(|JSON\.stringify)/i,
];
const unsafeClientPatterns = [
  /SERVICE_ROLE_KEY/i,
  /createServiceRoleClient|createAdminClient/i,
  /\b(?:localStorage|sessionStorage)\b/i,
];

function unsafeSink(source: string) {
  return sinkPatterns.some((pattern) => pattern.test(source));
}

function answerRouteIsPrivate(source: string) {
  return (
    /requestUsesHttps\(/.test(source) &&
    /formsPrivateNoStoreHeaders\(/.test(source) &&
    /createSessionClient\(/.test(source) &&
    !unsafeClientPatterns.some((pattern) => pattern.test(source))
  );
}

it('T005 keeps Forms and Telegram routes free of raw-error logging, tracing and telemetry sinks', () => {
  for (const path of formsRuntimeFiles) {
    const source = readFileSync(join(root, path), 'utf8');
    expect(unsafeSink(source), path).toBe(false);
  }
});

it('T005 keeps answer routes HTTPS-only, private/no-store, server-session based, and storage-free', () => {
  const answerRoutes = sourceFiles('app/api/forms/assignments');
  expect(answerRoutes.length).toBeGreaterThan(0);
  for (const path of answerRoutes) {
    const source = readFileSync(join(root, path), 'utf8');
    expect(answerRouteIsPrivate(source), path).toBe(true);
  }
});

it('T005 catches an answer-route no-store header removal mutant', () => {
  const source = readFileSync(
    join(root, 'app/api/forms/assignments/[assignmentId]/draft/route.ts'),
    'utf8',
  );
  const mutant = source.replaceAll('formsPrivateNoStoreHeaders()', '');
  expect(mutant).not.toBe(source);
  expect(answerRouteIsPrivate(source)).toBe(true);
  expect(answerRouteIsPrivate(mutant)).toBe(false);
});

it.each([
  ['job error canary', 'error_code: error.message'],
  ['server log canary', 'console.error(error)'],
  ['trace canary', 'tracer.recordException(error)'],
  ['telemetry canary', 'captureException(error)'],
  ['service-role path', 'createServiceRoleClient()'],
  ['browser storage path', 'localStorage.setItem("answer", canary)'],
] as const)('T005 detects a %s sink mutant', (_name, mutant) => {
  const source = `const canary = 'forms-private-canary';\n${mutant};`;
  if (_name === 'service-role path' || _name === 'browser storage path')
    expect(unsafeClientPatterns.some((pattern) => pattern.test(source))).toBe(
      true,
    );
  else expect(unsafeSink(source)).toBe(true);
});

it('T005 maps a provider canary to an allow-listed public error', () => {
  const canary = 'forms-private-canary-db-provider-token';
  const mapped = mapFormsPublicError(new Error(canary));
  expect(mapped).toEqual({ code: 'unavailable' });
  expect(JSON.stringify(mapped)).not.toContain(canary);
  const rawErrorMutant = { code: canary };
  expect(JSON.stringify(rawErrorMutant)).toContain(canary);
});

it('T005 stores only validated error codes in jobs and projects only that code into dead-letter audit', () => {
  const persistenceIsSafe = (jobSource: string, auditSource: string) =>
    jobSource.includes("error_code !~ '^[a-z0-9_.:-]{1,64}$'") &&
    jobSource.includes('last_error = error_code') &&
    auditSource.includes(
      "event_details := jsonb_build_object('kind', new.kind, 'error', new.last_error, 'attempts', new.attempts);",
    );
  expect(persistenceIsSafe(jobsMigration, auditMigration)).toBe(true);
  expect(
    persistenceIsSafe(
      jobsMigration,
      auditMigration.replace(
        'new.last_error',
        "new.payload->>'private_answer'",
      ),
    ),
  ).toBe(false);
});

it('T005 maps unapproved job diagnostics to handler_error before persistence', () => {
  const storesOnlyAllowlistedErrors = (source: string) =>
    source.includes("else 'handler_error'") &&
    source.includes('last_error = safe_error_code');
  expect(storesOnlyAllowlistedErrors(jobsAllowlistMigration)).toBe(true);
  expect(
    storesOnlyAllowlistedErrors(
      jobsAllowlistMigration.replace(
        'last_error = safe_error_code',
        'last_error = error_code',
      ),
    ),
  ).toBe(false);
});
