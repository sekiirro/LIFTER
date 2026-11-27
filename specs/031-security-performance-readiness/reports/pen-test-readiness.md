# PT-01 — External cross-workspace pen-test readiness pack (slice 1)

**Status**: Prepared scaffolding only. Not an engagement, not an authorization, not a gate pass.
**Authority**: S71-PO-1 (P8 external test), S71-PO-7 (vendor/timing deferred until after the pilot; PT-01 stays a blocking pre-go-live gate), S70-PO-1 item N, S71-R10 (no legacy-data handling — LIFTER is not live and has zero real clients), S71-R12.
**Register row**: [PT-01](../../../docs/13-production-readiness.md) — single source of truth; this pack does not create a second register or mark any existing row `Done`.

## 1. What is and is not decided

| Item                       | State                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Need for external test     | PO-approved in principle (S71-PO-1); PT-01 is Open and blocking pre-go-live.                       |
| Vendor / assessor identity | **Deferred until after the pilot** (S71-PO-7). No vendor is named, contacted or shortlisted here.  |
| Timing / window            | **Deferred until after the pilot** (S71-PO-7). No calendar slot is proposed or booked.             |
| Budget / spend             | **PO decision; not requested or estimated here.** No procurement action is authorized.             |
| Target                     | Synthetic, non-production, least-privilege only. Real client data and production targets are out of scope without separate written PO approval. |
| Scope, roles, evidence     | Prepared below; no test has been commissioned or run.                                              |

Nothing in this pack marks PT-01 `Done`, changes another `docs/13` row, or authorizes an engagement.

## 2. Rules of engagement (vendor-neutral draft)

The following fields are the required contents of the future, versioned rules-of-engagement document. They are deliberately left as blanks for the post-pilot PO decision — no values are invented.

- `engagement_id` — assigned by PO after the pilot.
- `vendor` / `lead assessor` — PO-selected after the pilot (no name in this pack).
- `window` and `stop condition` — PO-selected after the pilot; a named stop condition is mandatory.
- `target` — approved non-production environment only, named in the PO approval; never production.
- `allowed methods` — authenticated and anonymous HTTP/API calls against synthetic identities only; no social engineering, no denial-of-service, no third-party systems, no real-account data.
- `excluded` — production hosts, real client records, secret material, third-party services, and any legacy/historical-data path (`S71-R10`: there is no real historical client data to traverse).
- `account lifetime` — synthetic test identities created for the engagement, revoked at close.
- `reporting` — sanitized report with severity, evidence reference, remediation owner and retest disposition; no secrets, cookies, tokens, keys, client content or raw personal data.
- `escalation` — immediate stop on discovery of real data or production access; owner recorded in `docs/13`.

## 3. Synthetic target plan

- Two synthetic workspaces (A and B), with least-privilege identities for each role: Platform Owner (PO), Workspace Owner (WO), Trainer, Sales, Client, plus an anonymous caller.
- Own-scope positive cases and foreign-workspace/object negative cases for every role in §4.
- All records are generated for the test only; no migration, backfill, start-date or pre-feature-data handling is introduced (`S71-R10`). Existing local data is treated as test data.
- Test identities are synthetic (`@example.test`) and carry no production capability; no new permission is granted for the test.

## 4. Role / object coverage map

See [coverage-map.md](coverage-map.md) for the surface-by-surface mapping to existing role/RLS/authorization tests, own/foreign object cases, evidence references and the remediation/retest lifecycle. The canonical permission set is `docs/02-architecture.md:35-49`; the contract is [readiness-gates-and-permissions.md](../contracts/readiness-gates-and-permissions.md).

Surfaces in scope (PRD-13.1): APIs, exports, bot, storage, background jobs, authenticated routes and role/workspace boundaries. Every surface requires a positive own-scope case and a negative foreign-workspace, guessed-ID, revoked-membership and direct-RPC case. Missing or unexecuted evidence stays Open.

## 5. Deliverables, severity and evidence lifecycle

1. Versioned rules of engagement (§2) approved by PO after the pilot.
2. Sanitized report; severity per finding; explicit pass/fail per covered surface.
3. Findings/remediation register with owner, fix evidence and required-retest disposition.
4. Retest evidence for every required finding; PT-01 closes only when PO records the gate update in `docs/13`.
5. Evidence is stored as sanitized references only (no secrets, no client content); see [evidence-index.md](evidence-index.md).

A required finding without verified remediation and retest keeps PT-01 Open. Partial or missing evidence is never a pass.

## 6. Explicit non-scope

No legacy-data handling (`S71-R10`), no implementation change, no duplicate readiness register or benchmark tool (FR-010), no production test, no real client data, no vendor/budget/timing decision, no gate signature. These remain PO decisions after the pilot.
