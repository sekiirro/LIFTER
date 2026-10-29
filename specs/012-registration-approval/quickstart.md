# Quickstart / Validation: F12 registration approval and payments

**Status**: Future verification instructions, 2026-10-29. No application tests, DB probes, Docker/Supabase commands, migrations or mutation experiments were executed in the plan/tasks unit. All scenarios below remain pending implementation and authorization. [Tasks](tasks.md) assigns each proof to a unit; [plan](plan.md) owns PO/dependency blockers.

## Current artifact-only gates

The only gates for this planning unit are:

```powershell
npm run format:check
npm run lint
git diff --check
```

Do not execute any later block while this brief is DB-free. Do not use stack A to work around an unavailable B. No command in this document authorizes cloud operations, deployment, PR merge, historic migration edits or destructive cleanup.

## Future execution prerequisites

1. Architect/PO accept plan, tasks and the final 2026-10-29 PO decisions and resolved affected Architect items; complete Spec Kit Analyze. Reconcile final F11 PR #14 against planned `7a1350467cb9cbfd4a5e037d0b0324ecea255f4c`, including latest audit body and all guard changes.
2. Complete AI-F12-1: integrate landed `infra-second-stack` selector/harness/provisioner changes by reviewed merge; record infrastructure SHA. This checkout currently lacks that integration. Provision/start B under its separate approved infrastructure brief, not this plan.
3. Acquire exclusive B DB/Storage lock; verify selected project `lifter-stack-b`, config ports 25420–25429, explicit selector b, selected loopback API/DB endpoints and ignored `.env.stack-b`. Do not print keys or reuse `.env.local`/A credentials. Harness must fail before connecting for absent/mismatched selector/config/env/host/port.
4. Use only synthetic fixtures and the reviewed B migration/provisioning procedure from landed docs/11. Do not assume its preparation-only historical `db reset` prohibition has been superseded. Apply only F12 forward migrations using the reviewed procedure, never edit already committed migrations. Provision F11 signup keys on B through the landed selector-aware harness so real signup fixtures work; do not copy A's state or secrets.
5. Confirm e2e app server and runner both use B; old A-only env loading must fail safely. No implicit fallback to A when B is not ready. Separate CI runners use their own ephemeral local stack and do not acquire the workstation's locks.

## Future RED → GREEN commands

Run only in a separately authorized implementation unit, with the selected stack validated first. Use existing Node 24/pinned dependencies and stop at failures. Record exact commands, commit/stack/fixture revision and counts, including expected RED failures before implementation.

```powershell
$env:LIFTER_SUPABASE_STACK = 'b'
npm run typecheck
npm test -- tests/unit/registration-approval-money.test.ts
npm run test:integration -- tests/integration/registration-approval-schema.test.ts
npm run test:integration -- tests/integration/registration-approval-operations.test.ts
npm run test:integration -- tests/integration/registration-approval-payments.test.ts
npm run test:integration -- tests/integration/registration-approval-reads.test.ts
```

These are examples of scoped exits, not permission to skip suite regressions or selector validation. Pure unit checks need no DB; integration/e2e require the owned B lock. The final unit runs relevant full unit/integration suites and F11/F9/F10/audit/matrix/recovery regressions, then existing e2e, axe, edge build, secret check and size gates under the later brief. Do not run these final gates in the current planning unit. Independent push CI is the non-author rerun; architect verifies CI and evidence rather than running git/tests itself.

## Named verification scenarios

| ID    | Required evidence / assertions                                                                                                                                                                                                                                                                                                            | Owner    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Q-V01 | Selector b and B config/env project/ports agree; remote, A, missing and mixed endpoints fail before any connection; B-specific provisioning and e2e env routing verified without key output                                                                                                                                               | U0       |
| Q-V02 | Money vectors: 0/100% rate, exact half-minor ties, maximum bigint, fractional/unsafe/exponent/numeric JSON rejection; SQL and BigInt agree; display does not convert money to number                                                                                                                                                      | U1/U2/U9 |
| Q-V03 | TS and DB capability parity: Sales cannot approve/reject; retains record_payment. PO/WO permitted in scope; Trainer/anon/client/revoked/foreign denied. PO must target an existing workspace                                                                                                                                              | U1/U2/U3 |
| Q-V04 | Every new table forced RLS, no base grants, exact function owner/search_path/EXECUTE inventory; privileged immutability probes; controlled-grant signed role tests show RLS itself denies foreign rows                                                                                                                                    | U2/U5    |
| Q-V05 | Approval creates one immutable initial subscription and exact obligations, first full collection, decision/audit/fact/receipt atomically. No schedule = one full-price obligation; issued schedules copied exactly. Link consumed/expired, offer disabled and newer version remain valid historical binding                               | U3       |
| Q-V06 | Pending rejection creates only controlled reason decision/audit/receipt. Normal approve remains stale for rejected; distinct PO-only reconsider creates the initial graph once, WO/Sales denied. No identity/link/recovery change                                                                                                         | U3       |
| Q-V07 | Full-only collection: explicit obligation/seq/revision, exact amount/currency, any past/today Cairo date, future/invalid rejected after waits. No method/reference or actor/time override. Later collection/recollection requires activation and all earlier obligations paid; early before due allowed                                   | U4       |
| Q-V08 | PO correction negates exact stored amount/commission, references original once, leaves original byte-for-byte unchanged, restores unpaid; full recollection creates next stream revision. WO/Sales/Trainer correction, partial reversal, wrong original, branches and cycles denied                                                       | U4       |
| Q-V09 | Bound receipt replay: changed operation/workspace/target/date/sequence/amount/confirmation/key intent fails; exact authorized replay returns identical receipt without another audit; revoked actor cannot disclose receipt; receipt contains no commission                                                                               | U3/U4/U6 |
| Q-V10 | Competing approve/reject, different-key collection, reverse/reverse, collect/correct/recollect and revoked actor after wait have linearized outcomes; unique chain/root constraints hold even via privileged bypass probes. Force audit/deferred errors and verify zero partial effects                                                   | U3/U4/U9 |
| Q-V11 | Preserve latest audit branch inventory including F11 signup success/consumption and separate attempts/failures/cleanup. New transition/collection/correction audits once, rollback/replay zero, PO/WO scoped audit visibility. No PII/commission/free-text details added                                                                  | U2/U9    |
| Q-V12 | Narrow client self-status after real F11 sign-in: pending/rejected status exception only; next approved refresh works without re-login, auth target forgery ignored/denied, no shared cache. Staff/foreign/anonymous misuse and protected PostgREST/RPC/Storage remain denied                                                             | U5/U8/U9 |
| Q-V13 | One durable approval fact on approval/reconsider commit; none on failure/reject/replay; no form/job engine. Synthetic future consumer duplicate/backfill contract is documented, not claimed implemented. Due_on for seq2+ undefined without activation; synthetic guarded activation fixture tests derivation only, not P4 writer        | U3/U5/U9 |
| Q-V14 | AR/EN RTL/LTR × light/dark × 390/1440 rendered matrix for queue/full review/collections/correction/self-status; loading/empty/no-results/error/success/disabled/pending and focus states; read-only amount/confirmation; keyboard, axe, long names/exact money/date Bidi, contrast under custom brand; retained screenshots and log scrub | U7/U8/U9 |

## Required mutation checks (Q-M IDs)

Each mutant must produce a meaningful assertion failure, then restoration must pass the same check. Mutating the test expectation is not a valid mutant. Run only on disposable owned B or pure module fixtures. Never commit a mutant or edit historical migrations to generate it; use a rolled-back catalog/function replacement or reviewed restore of the disposable B schema. Stop if restoration is uncertain. Save exact failing test/expectation and restored result without secrets.

| ID    | Deliberate defect                                                | Required detector / owner                                                                 |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Q-M01 | Restore Sales approve in TS only                                 | unit role/action denial fails (U1/U9)                                                     |
| Q-M02 | Restore Sales approve in DB only                                 | matrix parity/direct RPC denial fails (U2/U9)                                             |
| Q-M03 | Omit workspace predicate/composite correspondence                | foreign-table/RPC and wrong-parent inserts fail expected denial (U2/U9)                   |
| Q-M04 | Disable forced RLS or admit foreign authenticated reader         | catalog plus controlled-grant RLS detector fails without grant masking (U5/U9)            |
| Q-M05 | Drop unique root/revision/successor protection                   | catalog and competing different-key insert/race assertions fail (U2/U9)                   |
| Q-M06 | Permit ledger/obligation/subscription UPDATE, DELETE or TRUNCATE | privileged immutable-history probes fail (U2/U9)                                          |
| Q-M07 | Round ties down or calculate through JS number                   | half-minor/bigint SQL–TS vectors fail (U1/U9)                                             |
| Q-M08 | Recalculate reversal commission from current rate                | changed-catalog exact-original reversal assertion fails (U4/U9)                           |
| Q-M09 | Allow WO correction or reconsideration                           | direct RPC plus app-mock role denial fails (U4/U6/U9)                                     |
| Q-M10 | Remove argument binding / replay authorization                   | altered date/operation/target and revoked-actor receipt assertions fail (U3/U9)           |
| Q-M11 | Skip authorization after target waits                            | two-session revocation serialization assertion fails (U3/U9)                              |
| Q-M12 | Remove deferred total/chain correspondence                       | malformed totals/sequence/currency/partial reversal constraint probes fail (U2/U9)        |
| Q-M13 | Swallow audit failure or use old audit body                      | rollback and legacy-branch inventory assertions fail (U3/U9)                              |
| Q-M14 | Cache client approval across requests/JWT lifetime               | already-open pending session does not observe approved state and test fails (U5/U8/U9)    |
| Q-M15 | Leak commission through safe reader/receipt/audit                | Sales wildcard/embedding/RPC/projection scans fail (U5/U9)                                |
| Q-M16 | Derive later due date from approval or overwrite issued offset   | undefined-before-activation and immutable-snapshot assertions fail (U5/U9)                |
| Q-M17 | Duplicate/drop approval event or publish it before commit        | event cardinality/rollback/receipt replay assertions fail (U3/U9)                         |
| Q-M18 | Echo request/provider PII or silently edit payment amount in UI  | captured action logs/result scan and read-only/confirmation UI assertions fail (U6/U7/U9) |

## Final policy extension scenarios (2026-10-29)

| ID    | Required evidence                                                                                                                                                                                                                                                                                                                      | Owner  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q-V15 | Link creation exposes explicit upfront/count/custom amounts/timing, default exact residual at offset 30; no guessed upfront amount. Both-wall tamper checks, exact total and historical link/schedule fingerprints unchanged; Trainer null/full payment path unchanged                                                                 | U1F/U9 |
| Q-V16 | Standalone Pending/Approved/Rejected page: visible-only min 15-second polling, max 12 automatic attempts/mount, one in flight; hidden/offline pause, budget exhaustion/error/Auth expiry stops safely; Manual Refresh, safe approved transition redirect to existing authorized root, manual fallback without loop or plan implication | U8/U9  |
| Q-V17 | Cairo month-boundary correction uses effective_on = correction recording date and exact negated original amount/commission; original collection month unchanged, replay next month retains original correction effective date                                                                                                          | U4/U9  |
| Q-V18 | Existing staff landing links Approvals only for PO/WO, Payments for authorized PO/WO/Sales; no Trainer/client staff-link leakage, no role tabs/nav redesign. Client self-status link is Auth/self only                                                                                                                                 | U7/U9  |

| ID    | Additional deliberate defect                                                                                | Required detector / owner                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Q-M19 | Omit upfront/count correspondence or default exact-residual sum validation                                  | flexible action/RPC tamper and exact-total assertions fail (U1F/U9)                               |
| Q-M20 | Normalize/backfill any issued amount/offset, or force every second offset to 30                             | legacy agreement fingerprints/custom-offset due projection assertions fail (U1F/U5/U9)            |
| Q-M21 | Permit later collection before activation or when an earlier obligation is unpaid, including after reversal | explicit sequence/activation tests fail; early after activation before due still succeeds (U4/U9) |
| Q-M22 | Book correction in original month, accept caller effective_on or regenerate reversal on next-month replay   | correction-month/immutable original/idempotent cross-month assertions fail (U4/U9)                |
| Q-M23 | Poll while hidden, exceed budget/one-in-flight, trust arbitrary redirect or treat approved as active        | status budget/Auth/allowlist/fallback/activation-copy assertions fail (U8/U9)                     |
| Q-M24 | Generate new payment key or lose canonical request on uncertain outcome                                     | warning/retry UI-action assertions detect changed key/args or duplicated collection (U6/U7/U9)    |

## Money and isolation exit gates

Money gate requires Q-V02/05/07..11/13/15/17 and Q-M05..08/10..13/16..17/19..22/24: exact minor units, full-only amounts, snapshot integrity, one active unreversed collection, exact reversal/recollection, final correction-month and calendar-date policy, transaction/replay/concurrency and no unaudited change. Correction must pass before real financial use; synthetic approval-only success is not a release candidate.

Isolation gate requires Q-V03/04/09/12/16/18 and Q-M01..04/09..11/14..15/23: every tenant table/RPC/action, denied foreign/nonexistent/revoked actors, owner commission scope, client self-only status, direct API/Storage negatives and independent RLS tests. Server/UI rejection alone is insufficient.

Frontend exit requires all docs/09 checklist entries with PASS/FAIL and evidence, retained eight-cell screenshot artifacts, accessible bilingual feedback and no invented unresolved design detail; all PA-F12 policy is Decided. Temp screenshot paths alone are insufficient. Dependencies and production blockers stay explicit.

## Evidence and CI

Future canonical evidence file: `tests/integration/registration-approval-verification.md`, owned sequentially by each unit and consolidated U9. Record F11/F12/infrastructure SHA, selected stack/project (no credentials), RED/GREEN assertion names/counts, Q-V/Q-M coverage, mutation/restoration, isolation/money verdicts, artifact links and known blockers. No secret/PII or raw request/DB/provider dump. Redact synthetic identifiers when not needed.

Attach exact-head GitHub push CI run ID/conclusion; if a PR is later authorized, also its pull_request merge-result CI and required security checks. A documentation push's CI proves its repository gates only, not unimplemented F12 behavior. U10 independent architect checks actual diff/evidence and cannot mark tests passing based only on author claims. Main merge still requires CodeRabbit approval on the exact head, zero unresolved actionable threads and explicit PO merge approval under D-26/docs/08.
