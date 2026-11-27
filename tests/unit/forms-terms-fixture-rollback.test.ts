import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T088 (FR-039): Terms policy fixtures are append-only
 * (`terms_policy_versions_immutable`), so any row committed by a test stacks
 * up forever and can flip `app_private.f15_current_terms_policy()` or the
 * `order by created_at desc` latest-policy pick for unrelated later tests.
 *
 * This static guard pins the current state of the suite:
 *
 * 1. Every `terms_policy_versions(version ...)` insert in an integration/e2e
 *    test or fixture helper must sit inside a transaction that is thrown away
 *    (a rollback-scoped `db.begin` whose callback throws a rollback sentinel,
 *    a `probe(...)`/`rollbackProbe(...)` helper, `withFormsPolicyF13Fixtures`,
 *    a mutation harness, or an enclosing `it(...)` block that asserts a
 *    rollback), OR
 *
 * 2. Be a named cross-connection fixture that cannot be rolled back because
 *    its dependent assertions run on separate connections (Playwright browser
 *    server, PostgREST RPC calls, advisory-lock workers, or the pg_cron
 *    scheduler). Those are enumerated below with their reason and a distinctive
 *    signature; anything else fails the suite.
 *
 * If you add a new Terms policy fixture, keep it rollback-scoped. If a fixture
 * genuinely requires committed visibility, add it to COMMIT_REQUIRED with a
 * reason — and expect an architect question about it.
 */
const ROOTS = ['tests/integration', 'tests/e2e'];
const INSERT = /terms_policy_versions\(version/g;
const ROLLBACK_MARKER =
  /rollback|probe\(|withFormsPolicyF13Fixtures|withCrashSafeFunctionMutant|runTermsMutation|runSignupMutation/i;
const BOUNDARY = /^\s*(it|test|describe)\s*\(/;

const COMMIT_REQUIRED = [
  {
    file: 'tests/integration/forms-builder-persistence.test.ts',
    signature: /t151-builder-/,
    reason:
      'T151 authorization recheck: worker advisory-lock connections must see the committed policy/form fixture',
  },
  {
    file: 'tests/integration/forms-builder-persistence.test.ts',
    signature: /first-save-/,
    reason:
      'first-save mutant probe: assertion failure aborts the tx (rollback); commits only when the invariant is already broken and the test is red',
  },
  {
    file: 'tests/integration/forms-r3-corrections.test.ts',
    signature: /t151-correction-/,
    reason:
      'T151 correction revocation race: concurrent worker connections must see the committed fixture',
  },
  {
    file: 'tests/integration/forms-r3-client-route.test.ts',
    signature: /T022 client route/,
    reason:
      'T022 client route: dependent assertions run on separate qualified worker connections (clientA/clientB)',
  },
  {
    file: 'tests/integration/forms-r3-submissions.test.ts',
    signature: /T013 submit race/,
    reason:
      'T013 submit race: concurrent submit workers are separate connections and must see the committed fixture',
  },
  {
    file: 'tests/integration/forms-r3-assignment-races.test.ts',
    signature: /createSelection\(/,
    reason:
      'T008 selection race: dependent assertions are PostgREST RPC calls on separate HTTP connections',
  },
  {
    file: 'tests/integration/forms-r3-assignment-consumer.test.ts',
    signature: /createSelectionFixture\(/,
    reason:
      'createSelectionFixture helper: rollback-scoped in every caller except the S41-PO-12 concurrent-approve test, which commits for separate connections',
  },
  {
    file: 'tests/integration/forms-r3-assignment-consumer.test.ts',
    signature: /t143-race-/,
    reason:
      'S41-PO-12 concurrent approve retries: separate connections must see the committed current policy',
  },
  {
    file: 'tests/integration/forms-draft-concurrency.test.ts',
    signature: /t012-race-/,
    reason:
      'T012 cross-session draft race: writer/reader connections are separate and must see the committed fixture',
  },
  {
    file: 'tests/integration/forms-cohort-assignment.test.ts',
    signature: /async function createForm/,
    reason:
      'createForm helper for RPC-over-HTTP configure calls: separate HTTP connections must see the committed policy',
  },
  {
    file: 'tests/integration/forms-cohort-assignment.test.ts',
    signature: /sharedTerms/,
    reason:
      'S25-R2 shared onboarding/manual/active forms: dependent assertions are PostgREST RPC calls',
  },
  {
    file: 'tests/integration/forms-r3-assignment-consumer.test.ts',
    signature: /t143-current-/,
    reason:
      'T143 current-policy replacement fixture inside a rollback-scoped block (belt-and-braces pin; block marker also covers it)',
  },
  {
    file: 'tests/integration/forms-s14-privacy.test.ts',
    signature: /R18 synthetic form/,
    reason:
      'R18 raw-answer denial: dependent assertions are supabase-js PostgREST calls from separate clients',
  },
  {
    file: 'tests/integration/forms-r3-correction-matrix.test.ts',
    signature: /t014-/,
    reason:
      'seedAssignment helper: called only from rollback-scoped matrix transactions; pinned so the helper is not mistaken for a committer',
  },
  {
    file: 'tests/integration/forms-r3-assignment-invariants.test.ts',
    signature: /assignmentFixture/,
    reason:
      'assignmentFixture helper: called only from rollback-scoped T007/T010 transactions',
  },
  {
    file: 'tests/integration/forms-alerts.test.ts',
    signature: /async function formAssignment/,
    reason:
      'formAssignment helper: called only from rollback-scoped alert transactions',
  },
  {
    file: 'tests/integration/forms-alert-inbox.test.ts',
    signature: /inbox-\$\{randomUUID|Synthetic alert inbox/,
    reason:
      'fixture helper: called only from rollback-scoped inbox transactions',
  },
  {
    file: 'tests/integration/forms-alert-mutations.test.ts',
    signature: /makeAssignment\(/,
    reason:
      'makeAssignment helper: called only from rollbackProbe-wrapped mutation transactions',
  },
  {
    file: 'tests/integration/forms-assignment-mutations.test.ts',
    signature: /async function createForm/,
    reason:
      'createForm helper: called only from rollback-scoped/withFormsPolicyF13Fixtures transactions',
  },
  {
    file: 'tests/integration/forms-recurring-assignment.test.ts',
    signature: /async function createForm/,
    reason:
      'createForm helper: called only inside withFormsPolicyF13Fixtures (probe rollback)',
  },
  {
    file: 'tests/integration/forms-renewal-assignment.test.ts',
    signature: /async function createForm/,
    reason:
      'createForm helper: called only inside withFormsPolicyF13Fixtures (probe rollback)',
  },
  {
    file: 'tests/integration/forms-correction-context.test.ts',
    signature: /terms_policy_versions\(version/,
    reason:
      'single fixture insert inside the rollback-scoped correction-context transaction',
  },
  {
    file: 'tests/integration/f17-plan-publish-fixture.ts',
    signature: /seedSubmittedIntake/,
    reason:
      'shared F17 submitted-intake seed: callers commit for F17/F19 HTTP RPC dependents; cannot be rolled back',
  },
  {
    file: 'tests/integration/f15-scheduler-activation.test.ts',
    signature: /insertAlertAssignment\(/,
    reason:
      'Stack-D-only pg_cron E2E (LIFTER_F15_SCHEDULER_E2E=1): scheduler reads committed deadline rows; cleanup uses session_replication_role',
  },
  {
    file: 'tests/e2e/forms-authorized-route.spec.ts',
    signature: /T022 browser fixture/,
    reason:
      'Playwright fixture: the running Next server reads committed rows on separate connections; cannot be rolled back',
  },
  {
    file: 'tests/e2e/progress-coaching-screenshots.spec.ts',
    signature: /f23-e2e-/,
    reason:
      'F23 Playwright fixture: the running Next server reads the committed check-in form and terms rows on separate connections; cannot be rolled back',
  },
  {
    file: 'tests/integration/workforce-checkins.test.ts',
    signature: /P7 synthetic check-in/,
    reason:
      'P7 cross-connection confirmation and revocation races require the committed F15 form/terms fixture',
  },
  {
    file: 'tests/integration/workforce-checkin-delay.test.ts',
    signature: /p7-delay-/,
    reason:
      'P7 delay evaluator and confirmer race assertions use separate connections and require the committed synthetic check-in terms fixture',
  },
];

type Site = { file: string; index: number; source: string };

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) return listFiles(absolute);
    return /\.(test\.ts|spec\.ts|fixture\.ts)$/.test(entry) ? [absolute] : [];
  });
}

function enclosingBlock(source: string, index: number): string | null {
  const lines = source.split('\n');
  let offset = 0;
  let startLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    offset += line.length + 1;
    if (offset <= index) {
      if (BOUNDARY.test(line)) startLine = i;
      continue;
    }
    if (startLine === -1) return null;
    let endLine = lines.length;
    for (let j = i; j < lines.length; j += 1) {
      const candidate = lines[j];
      if (candidate !== undefined && BOUNDARY.test(candidate)) {
        endLine = j;
        break;
      }
    }
    return lines.slice(startLine, endLine).join('\n');
  }
  if (startLine === -1) return null;
  return lines.slice(startLine).join('\n');
}

function findSites(): Site[] {
  return ROOTS.flatMap((root) =>
    listFiles(root).flatMap((absolute) => {
      const source = readFileSync(absolute, 'utf8');
      const file = relative(process.cwd(), absolute).replaceAll('\\', '/');
      const matches: Site[] = [];
      for (const match of source.matchAll(INSERT))
        matches.push({ file, index: match.index ?? 0, source });
      return matches;
    }),
  );
}

describe('T088 Terms policy fixtures stay rollback-scoped', () => {
  const all = findSites();

  it('finds Terms policy fixture inserts to guard', () => {
    // Guard against the scan silently matching nothing (path or pattern drift).
    expect(all.length).toBeGreaterThan(20);
  });

  it('no commit-required exemption is stale', () => {
    for (const entry of COMMIT_REQUIRED) {
      const source = readFileSync(entry.file, 'utf8');
      const windowMatches = [...source.matchAll(INSERT)].some((match) =>
        entry.signature.test(
          source.slice(
            Math.max(0, (match.index ?? 0) - 600),
            (match.index ?? 0) + 600,
          ),
        ),
      );
      expect(
        windowMatches,
        `COMMIT_REQUIRED entry never matches an insert site in ${entry.file} (signature ${entry.signature}); the exemption is stale`,
      ).toBe(true);
    }
  });

  it('every Terms policy fixture insert is rollback-scoped or explicitly commit-required', () => {
    const violations: string[] = [];
    for (const site of all) {
      const window = site.source.slice(
        Math.max(0, site.index - 600),
        site.index + 600,
      );
      const exempt = COMMIT_REQUIRED.some(
        (entry) => entry.file === site.file && entry.signature.test(window),
      );
      if (exempt) continue;
      const block = enclosingBlock(site.source, site.index);
      if (block && ROLLBACK_MARKER.test(block)) continue;
      violations.push(
        `${site.file}:${site.source.slice(0, site.index).split('\n').length} insert not rollback-scoped and not commit-required`,
      );
    }
    expect(violations).toEqual([]);
  });
});
