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
