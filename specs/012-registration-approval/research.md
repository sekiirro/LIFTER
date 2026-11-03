# Research: F12 — Registration approval and payments

**Date**: 2026-10-29 | **Status**: Proposed design, pending architect/PO plan approval. Repository inspection only; no database or runtime feasibility claim.

## Source precedence and evidence

Read [final spec](spec.md), [debate record](research/spec-debate-r1.md), Constitution 1.2.1, architecture, D-01..D-26, docs/08–12, DESIGN.md, environment Frontend Design Gate, F11 plan/model/contract and installed `20261031*` migrations. Current F11 implementation baseline is `7a1350467cb9cbfd4a5e037d0b0324ecea255f4c`. Stack-B documentation was inspected using `git show origin/infra-second-stack:docs/11-second-local-stack.md` at `75d4a40def664f0a2cbbd836c593f235ef624e01`; its selector changes are not merged here.

The final 2026-10-29 F12 block is copied verbatim into spec.md. Its decisions override earlier PA recommendations (now all Decided), historical v0 and architect r1 where PO subsequently added F12 correction reversal, reconsideration and full installments. D-23 and ND-F12-1 override old D-09/architecture Sales-approval wording. Do not silently update those shared governance documents in this unit.

## R1 — Installed F11 constraints and permitted changes

Observed: `public.clients.approval_state` has a pending-only check; `signup_no_update` rejects all updates; insert/deferred guards pin client/link/version/Auth/claims; all client grants are revoked and RLS forced. `auth_user_id` is unique/indexed. `recovery_target_workspace()` in `20261031124000` resolves that client association. `authorize()`/`has_workspace_access()` are staff-oriented; both capability matrices still grant Sales approval.

Decision: additive forward migrations widen only approval state and replace only the client update guard. Preserve identity/snapshot immutability, insert/deferred/signup/consumption guards, recovery lookup/receipts and Auth identity. Remove Sales approval in TS and DB, retaining payment recording. Separate client helper/status projection rather than adding staff memberships or broad client SELECT.

Alternative rejected: editing F11 migrations changes historical replay and conflicts with its review. Reusing staff authorization for clients cannot satisfy self-status with current grants. Proof obligation: full F11 signup/recovery regressions and no state change on recovery after every F12 transition.

## R2 — Ledger and active-collection uniqueness

Decision: immutable obligations plus a unified collection/correction-reversal event stream per obligation. Each event has a revision and immutable predecessor; root revision is 1 and collection. Unique obligation/revision, unique root and unique successor prevent two active branches independently of idempotency keys. A deferred constraint trigger verifies predecessor revision, alternation, tenant/obligation correspondence, full amount and exact stored reversal. At most one tail exists; its collection kind means paid. A reversal tail means unpaid; the next full collection advances the same chain.

Alternatives: permanent unique obligation collection prohibits the approved recollection. Mutable `paid_event_id` or ledger `reversed_at` violates append-only truth and creates duplicate state. Trigger-only anti-join without unique revision/successor constraints can admit write-skew; it is insufficient. A mutable reservation table would be simpler to query but adds a second payment truth. Selected chain costs indexed joins and deferred checks; stack-B tests must prove root races, branching, malformed chains and full rollback with privileged insert probes.

Clients/subscriptions serialize before ledger access. Independent constraints remain required even if two callers use different keys. A recollection request supplies expected stream revision and predecessor, so it cannot accidentally become a second collection after a concurrent correction.

## R3 — Exact money and date treatment

Decision: snapshot rate is integer basis points in 0..10000; amount is positive bigint minor units. For positive collection amount A and basis points R, commission is integer quotient `floor((A * R + 5000) / 10000)`, with numeric intermediate multiplication and explicit bound checking before bigint conversion. TypeScript uses BigInt for any corresponding pure calculation and sends only canonical decimal strings, never JS number money. UI formatting splits/groups the decimal string without rounding a floating amount. Currency formatting follows the inherited F9/F10 currency contract, without inventing a currency list.

For example, A=1 and R=5000 produces commission 1; A=3 and R=5000 produces 2. R=0 gives 0 and R=10000 gives A, including bigint maximum. Reversal uses negated stored values, never recomputes rounding, price or current rate. Aggregate validation uses wide numeric sums before comparison/storage bounds.

`collected_on` is a finite ISO date, any supported historical date through fresh Cairo today; no signup lower bound. `recorded_at` is DB time and `recorded_by`/responsible staff is the signed actor, not a caller override. Avoid a time-dependent CHECK tied to transaction-start date: mutation guard checks fresh Cairo date after lock waits. Reject invalid/non-finite date inputs and future dates. Calendar presentation must allow typing historical dates.

Final policy: correction effective_on is the Cairo date of correction recording, booked in the correction month. Later installments require activation and sequential payment, early allowed. Default remainder offset is 30 Cairo calendar days through day-end; every custom issued offset is retained. Full-only correction does not refund cash, cancel subscription/obligations or revoke approval.

## R4 — Bound replay and non-disclosure

Decision: private immutable receipts, unique per actor/key, include operation, workspace, client/subscription/obligation/original event identities, installment sequence, expected stream revision/predecessor, canonical argument hash, receipt/result IDs and DB recording timestamp sampled inside the transaction; success is acknowledged only after commit. Operation-specific canonicalization has a version and fixed ordered typed fields; dates ISO, UUIDs canonical, money canonical strings, absent fields explicit null. Hash all allowed business arguments, including expected state, confirmation and reason/date fields; reject unknown fields rather than hashing opaque JSON.

Authorize target scope/capability before receipt lookup/disclosure, then lock target, recheck authorization after waits, and handle exact replay before stale-state checks. A repeated key with changed operation/date/target/sequence/confirmation is `key_conflict`; unauthorized callers get `not_permitted` before discovering a receipt. Successful receipt is role-safe and commission-free; owner commission is a separate read. This avoids a previously authorized WO replay leaking commission after becoming Sales. Failed operations leave no committed success receipt/audit. No secret or PII is hashed into a public receipt.

Alternatives rejected: actor/key alone permits cross-operation intent drift; payment-row key cannot hold rejection/reconsideration; fresh keys on response-loss retry can create unintended effects. Replay status is not a second result shape: return the identical original successful receipt.

## R5 — Authorization, RLS, and revocation

Decision: no authenticated base-table grant. New tables have ENABLE and FORCE RLS, default deny; signed-user definer RPCs repeat `has_workspace_access(ws, capability)` and role checks and return explicit projections. Catalog tests enumerate every new relation, function owner/search_path and EXECUTE grant; controlled authenticated grants inside rolled-back tests prove RLS separately from grants. Private tables have no browser-facing policies. Definer code must explicitly check authorization because its owner can bypass RLS; forced RLS does not replace those checks.

Use approval capability for PO/WO decisions; existing PO-only `record_refund` capability plus explicit PO role for recording corrections/reconsideration where applicable (reconsideration additionally needs approval). This reuses the matrix without granting a new right to WO/Sales. It is a technical mapping, not F13 refund implementation. Role/membership rows are read/locked after target waits and their current values are used; a separate fresh statement rechecks helpers. Revocation either precedes the operation's authorization lock and denies it, or follows the serialized commit. Maintain target → actor ordering consistently with existing recovery code.

Alternative rejected: app-only permission, broad service role, unqualified definer object resolution, role claims in JWT, owner-visible base view exposing commission through embedding/wildcards. Explicit negative tests include anon, Trainer, Sales approval, WO correction/reconsideration, wrong workspace, removed role, revoked membership and nonexistent target.

## R6 — Client status and P2 event

Decision: self-status RPC takes no target/workspace ID; resolves by signed auth.uid and unique client association, returns only state. App helper binds the same signed user and does not use staff `requireActor()`. Future client policies call a narrow private helper with direct indexed association lookup, preventing recursive clients-table RLS. Pending/rejected users gain only this status exception to F11 denial. Approved state alone grants no plan/intake/storage rights. Refresh/poll uses fresh requests and no shared cache; pause background polling while hidden and handle sign-out.

An immutable approval fact is inserted atomically once per initial subscription, including reconsideration's first successful approval. P2 later adds an idempotent consumer/inbox or job delivery keyed by event ID. Durable facts permit backfill; an unknown generic job is not enqueued now. Alternatives: browser redirect/event only is lossy; F12 partial form assignment duplicates P2 policy; an unhandled outbox job drains before P2. The standalone three-state page, automatic detection/redirect, Manual Refresh and navigation fallback are final policy. The surface contract recommends bounded no-Realtime polling and an authenticated allowlisted `/` fallback, with no invented intake route or activation implication.

## R7 — P4 activation seam and schedule conflict

Decision: immutable subscription snapshot and separate append-only activation fact, unique per subscription; no public activation writer in F12. P4 will append its fact in the same transaction as both initial plans and productivity credit. Due projection stays undefined for installment 2+ until that fact exists. P4 must use the same subscription serialization and be reviewed before adding write grants.

> **Superseded by Plan Core (S20 §4 / spec 019):** First workout and nutrition deliveries are independent, idempotent delivery records and may occur on different days. After both succeed, activation, including the productivity unit, happens in one exactly-once transaction. See the `019-plan-core` branch for the canonical contract.

Final F12-3/F12-8 resolve the older fixed-offset interpretation: default remainder is 30 Cairo calendar days, but each custom issued offset is authoritative and never normalized. Seq1 is upfront at approval; seq>=2 due date is Cairo activation date plus its issued offset, payable through the entire due day. This uses calendar-date arithmetic, not 720 elapsed hours, including DST. Later collections and recollections require activation and all earlier obligations currently paid. Correction of an earlier row leaves later immutable events unchanged; sequence is re-evaluated for the next collection.

## R8 — Audit source and transaction guard

Decision: begin with the complete installed audit function in `20261031122000_client_accounts_signup.sql`, rechecked after future F11 merges. Keep all existing branches and F11 separate operational/audit semantics. Extend clients UPDATE for approved/rejected/reconsidered transitions; payment event INSERT for collected/corrected. Reason comes from immutable decision metadata, not free text or unsigned GUC. Link each decision to the current transaction and signed actor; the client transition guard permits only the matching transition and leaves all other columns immutable.

Audit is trigger-owned once per actual transition/event. No manual RPC duplicate inserts. All new metadata is allow-listed: IDs, state transition, controlled reason, text minor amounts, currency, installment/revision and dates. Commission is not included in common audit detail because broader financial readers must not recover it; owner commission remains gated. Audit failure rolls back business records, approval fact and receipt. Replays do not insert decision/ledger rows and therefore emit no audit.

## R9 — Stack-B and verification constraints

Inspected preparation identifies `lifter-stack-b`, explicit ports 25420–25429, `LIFTER_SUPABASE_STACK=b`, ignored `.env.stack-b`, one canonical migrations directory, and a later approved junction into stack-B config. Its harness/provisioner fail before connections for non-loopback/mismatched selected endpoints. The final source records provisioning/start complete, isolation proven and 861/861 integration on B at short infrastructure SHA d498800. This branch still lacks those selector/harness changes and this unit does not independently verify or restart B. AI-F12-1 requires reviewed integration after the infrastructure lands; do not cherry-pick only a config while keeping the A-only harness. E2E app env and provisioner must select the same B endpoints; never default to A when B is missing. F11 Vault compatibility provisioning is required for real signup fixtures on B, without copying A's keys.

No Docker, Supabase CLI, DB connection, test authoring, integration/e2e, provisioning or migration occurred in this unit. Future units must own the B lock and explicit provisioning authorization. Mutation checks operate only on disposable B data/catalog inside rollback or a reviewed restore procedure, never by editing historical migrations. CI runners use their own isolated ephemeral stack; they do not touch the local lock.

## R10 - UI authority and final workflow

Final policy fixes the standalone Pending/Approved/Rejected page and automatic/manual navigation, existing semantic status tokens, staff dashboard links only and identical-key uncertain-outcome retry. Recommend visibility-aware 15-second-minimum polling, maximum 12 automatic attempts per mount, one in flight, no Realtime; details and server-checked existing-root navigation are in the contract. Approved is not activated and no route/copy may promise plan access. Exact control/copy/focus details remain Architect items under DESIGN.md and docs/09, not open F12 policy. All future issuing/approval/status UI units carry the full gate and retained AR/EN light/dark mobile/desktop evidence; none is rendered in this unit.

## R11 - F10 reconciliation and chosen extension

Read the merged main F10 artifacts and installed schedule/issuer SQL, action/service/validator, dialog/manager, and actual root/Auth route behavior. Git comparison to origin/main `30399301f0f046e78f951aba1cdb564678f6cea5` showed no differences for the relevant F10 paths. The [F10 addendum](../010-registration-links/addendum-f12-flexible-installments.md) records the supported/missing/work table without rewriting its historical spec.

Already supported: immutable positive bigint schedule amounts, contiguous row count, arbitrary ordered nonnegative offsets, UI add/remove rows, live BigInt sum and authoritative/deferred exact-total enforcement. Missing: explicit upfront/count UX, default remainder construction and approval/activation/date-end semantics. Select a new hardened issuance wrapper plus existing UI/action changes, F12-owned U1F, rather than a new schedule store, historical UPDATE, or broad rewrite of the old issuer. Reuse its offer lock/snapshot/rate/token/audit invariants; validate upfront/count correspondence and capabilities independently. Keep legacy callers/issued agreements valid. Default staff-chosen upfront has no guessed percentage; one remainder uses exact residual and offset 30. More payments require explicit custom values.

Alternatives rejected: normalizing old offsets changes contracts; silently treating all second payments as offset 30 ignores final policy; only renaming existing fields fails the explicit upfront/count workflow; duplicate mutable terms tables create competing financial truth. No data migration is needed merely to restate existing rows. The future forward migration adds the wrapper/function grants, with new table RLS obligations only if a separately reviewed design actually introduces a table.

## Architect items and conflicts

AI-F12-1..7 in plan.md are the complete remaining technical/dependency register with recommendations: stack integration, count/editor mechanics, design details, polling/route safeguards, F11/audit reconciliation, P4/P2 handoffs and production evidence. No PA-F12 policy remains open. Source workflows approve B provisioning already; integration availability in this checkout remains an architect dependency, not a new PO provisioning question.

Conflicts for PO: none requiring new policy. Final decisions expressly settle custom-offset/default, correction-month and F12 status/P2 intake boundaries. Existing older Sales-approval wording is superseded by ND-F12-1/D-23. Historical debate text stays historical; former PA alternatives are not approved or executable defaults. F11 PR #14 is not merged in this session.


## Session 12 — final F11 reconciliation (T001)

PR #14 reviewed head `12036e26fb5e23da22af4ddf0e8d33de800779a2` merged as
`1f4d2359bbfcef605e371e29b81a59b2a48d8ed4`; fetched main is
`a8c7ae569e1ae1380740230b90817679b22d465b`. The no-conflict F12 merge is
`ea5e872816244579285f7fefc59834c2ea57d399`, pushed before the local Sales
cherry-pick. Merge gates: typecheck/lint/format passed; unit 66 files / 1,436 tests.

Grep across all migrations confirms the latest complete `app_private.audit_row_change()`
body remains `20261031122000_client_accounts_signup.sql`; no later migration
redefines it. Preserve every existing workspace/staff/membership/recovery/package/
offer/link/signup/job branch, including F11 consumption. The new admission-before-bcrypt
and purge scheduling migrations introduce no replacement audit body. Latest main migration:
`20261031130000_purge_scheduling_pg_cron.sql`. The four U2–U5 F12 migrations run
from `20261101120000_registration_approval_model.sql` through
`20261101123000_registration_approval_reads.sql`, strictly after it. The planned
U1F wrapper migration is `20261101131000_flexible_registration_link_terms_forward.sql`,
after those four migrations.

Session-12 architect/user instruction supersedes historical Stack-B prerequisites:
use default Stack A (`lifter`, API 54321 / DB 54322), no selector variable; never
operate Stack B. The A-for-B substitution and actual checks are recorded in
`tests/integration/registration-approval-verification.md`. U1F SQL/UI remain separate
pending tasks; the current instruction explicitly authorizes U2 model work now.

Installed guard reconciliation: F11 clients have a pending-only CHECK and an
unconditional `signup_no_update`; U2 intentionally widens only that CHECK and
replaces only that UPDATE trigger with a transaction-bound decision guard. F11
INSERT, deferred identity/consumption correspondence, DELETE/TRUNCATE, Auth,
admission and recovery behavior remain authoritative. No new F11/F12 product
policy conflict was found; the historical claim that PR #14 is unmerged and the
B-only execution assumption above are superseded by these recorded facts.


## U3 architect carry-forward (accepted U2)

`f12_guard_client_transition` intentionally blocks every clients UPDATE except
an authorized approval-state transition with a matching decision. Keep it intact.
F13 closure/pseudonymization and other later client lifecycle writers require a
separately reviewed forward amendment; U3 adds no bypass or caller-writable flag.

The installed SQL capability helpers are `app_private.role_has_capability` and
`app_private.has_workspace_access`; earlier shorthand `has_capability` refers to
these functions. PO's global membership bypass does not prove workspace existence.
Every U3 authorization path joins an existing `public.workspaces` row, and returns
the same `not_permitted` response for nonexistent and foreign targets. Authorization
is repeated after target and operation-key waits before any receipt disclosure.


### U3 observed U2 subtransaction compatibility correction

The first implementation run returned `unavailable` on approvals. A disposable,
rolled-back diagnostic rethrow identified SQLSTATE 23514,
`immutable_installment_schedule`: subscriptions inserted within the operation's
exception subtransaction have a sub-XID xmin, not `pg_current_xact_id()`'s top XID.
An exception boundary is needed to return a generic result while rolling back the
entire financial graph. The new U3 migration therefore forward-replaces only
`f12_guard_installment`: require the immutable private approve/reconsider decision
for this subscription's client, current top transaction and signed actor, plus
matching subscription creator/transaction timestamp. The decision insert guard
and deferred exact schedule/total checks remain. No GUC or supplied boolean grants
insertion, and an explicit fresh-transaction late-obligation probe remains denied.
The accepted client UPDATE guard, base grants, RLS, audit body and financial
immutability guards are unchanged. This is a technical compatibility correction,
not an amendment to a PO decision or a historical migration.
