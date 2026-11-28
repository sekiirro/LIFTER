# PT-01 coverage-to-evidence map (slice 1)

**Purpose**: map every PRD-13.1 test surface to the existing role/RLS/authorization tests that already exercise it, so the future external assessor supplements rather than duplicates them. This is a mapping, not executed evidence; the external report and retest remain PT-01 requirements.
**Canonical permission source**: `docs/02-architecture.md:35-49` and [the readiness contract](../contracts/readiness-gates-and-permissions.md). No new capability is granted for testing (`S71-R10`: no legacy/historical-data handling).

## Coverage matrix

| Surface                     | Existing test/policy source (reuse, do not duplicate)                                                                                                       | Own-scope positive                             | Foreign/guessed-ID/revoked negative                                              | External assessor evidence to capture              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| APIs (authenticated routes) | `tests/integration/rls-catalog.test.ts`, `client-portal-isolation.test.ts`, `client-directory-assignment.test.ts`                                           | PO/WO/Trainer/Sales/Client own-scope RPC reads | Cross-workspace object, guessed UUID, anon call, revoked membership              | Sanitized request/response reference per role pair |
| Exports                     | `tests/integration/nutrition-export.test.ts`, `client-workout-export.test.ts`, `workout-export-audit.test.ts`, `client-portal-export-audit-overdue.test.ts` | Entitled owner export of own/assigned data     | Foreign workspace export, plan-entitlement denial, artifact access by guessed ID | Redacted artifact metadata + denial reference      |
| Bot                         | `tests/integration/forms-telegram-links.test.ts` and current role/membership policies                                                                       | Linked identity acting in own workspace        | Cross-workspace lookup, unlinked identity, role change                           | Sanitized denial/allow reference                   |
| Storage                     | `tests/integration/branding-storage-policy.test.ts`, `branding-storage-context.test.ts`, `catalog-exercise-version-storage.test.ts`                         | Workspace-scoped signed access                 | Foreign path, revoked membership, expired signature                              | Sanitized path-scope reference (no object content) |
| Background jobs             | `tests/integration/jobs.test.ts`, `plan-delivery-authorization.test.ts`, `forms-alert` job/RPC tests                                                        | Tenant-scoped claim and delivery               | Cross-tenant payload, replay/retry, recipient authorization                      | Sanitized job-log reference (no payload content)   |
| Role / object boundaries    | `tests/integration/rls-catalog.test.ts` (all listed RPCs/policies)                                                                                          | Each role within its documented capability     | Every role outside it, direct table/RPC access, count/existence probes           | Per-role allow/deny matrix with source row         |

## Evidence / remediation / retest lifecycle

1. **Before the engagement** — PO approves a versioned rules-of-engagement and a synthetic target (see [pen-test-readiness.md](pen-test-readiness.md)); vendor and timing are selected only after the pilot (S71-PO-7).
2. **During** — assessor records one sanitized evidence reference per surface/role pair above. Evidence contains no secrets, cookies, tokens, keys, client content or personal data (FR-003/FR-008).
3. **Findings** — each finding gets severity, owner, remediation change reference and a required-retest flag. A required finding without a retest disposition is not closed.
4. **Retest** — remediated surfaces are retested under the same synthetic identities; the retest reference is attached to the finding.
5. **Gate** — PT-01 closes only when PO records the gate update in `docs/13`; the gate stays blocking pre-go-live until then (FR-001/FR-004). Do not mark any other `docs/13` row Done.

## Explicit limits

Mapping only: no vendor, budget, timing, target approval, test execution, production access or real-client data. Existing RLS/authorization tests remain independently required; the external test supplements them and never replaces exact-head CI or `check:secrets`.

## Verified test files (origin/main)

Each path below was verified present on origin/main; the representative test name is the first test in that file. These are the existing role/RLS/authorization tests PT-01 reuses; no new test is created by this spec.

- tests/integration/rls-catalog.test.ts :: forces RLS with no policies and no API privileges
- tests/integration/client-portal-isolation.test.ts :: denies a foreign-workspace trainer with the same error as a nonexistent workspace
- tests/integration/client-directory-assignment.test.ts :: lets the Workspace Owner and Platform Owner filter and see assignment, matching F11 unassigned_clients
- tests/integration/nutrition-export.test.ts :: records exactly one derived-workspace denial for a foreign-workspace coach
- tests/integration/client-workout-export.test.ts :: views the selected revision as the shared F17 payload with the live video and writes no audit event
- tests/integration/workout-export-audit.test.ts :: records one identity-only success event on an authorized export (no content/PII)
- tests/integration/client-portal-export-audit-overdue.test.ts :: drops non-allowlisted keys from workout content
- tests/integration/forms-telegram-links.test.ts :: rejects an active chat owned by another staff user without retrying the update
- tests/integration/branding-storage-policy.test.ts :: keeps F14 buckets private and confines staging writes to the owning upload
- tests/integration/branding-storage-context.test.ts :: a/b: restricted JWT authority and transaction-local claims/headers/operation reach object RLS
- tests/integration/catalog-exercise-version-storage.test.ts :: stores Notes and Defaults on both immutable version tables (T090)
- tests/integration/jobs.test.ts :: scopes generic claims to registered kinds and leaves forms.alert to its dedicated claimant
- tests/integration/plan-delivery-authorization.test.ts :: refuses Sales, foreign-workspace staff, clients and anonymous callers without writes
- tests/integration/forms-alert-channels.test.ts :: catalogs unique per-channel delivery, forced RLS, and alert RPC ACLs
- tests/integration/forms-alert-inbox.test.ts :: does not count setup failures or rollback as a killed mutation
- tests/integration/forms-alert-mutations.test.ts :: kills a trainer batch-starvation mutant and restores the evaluator
- tests/integration/forms-alert-scheduler.test.ts :: uses the inert owner-only F11 cron pattern with restricted grants and advisory locks
- tests/integration/forms-alerts.test.ts :: notifies PO/WO at the client deadline and the responsible Trainer at deadline+24h
