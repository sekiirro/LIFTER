# Research: F12 — Registration approval and payments

**Date**: 2026-10-29 | **Status**: Proposed design, pending architect/PO plan approval. Repository inspection only; no database or runtime feasibility claim.

## Source precedence and evidence

Read [final spec](spec.md), [debate record](research/spec-debate-r1.md), Constitution 1.2.1, architecture, D-01..D-26, docs/08–12, DESIGN.md, environment Frontend Design Gate, F11 plan/model/contract and installed `20261031*` migrations. Current F11 implementation baseline is `7a1350467cb9cbfd4a5e037d0b0324ecea255f4c`. Stack-B documentation was inspected using `git show origin/infra-second-stack:docs/11-second-local-stack.md` at `75d4a40def664f0a2cbbd836c593f235ef624e01`; its selector changes are not merged here.

Final spec/PO decisions override historical v0 and architect r1 where PO subsequently added F12 correction reversal, reconsideration and full installments. D-23 and ND-F12-1 override old D-09/architecture Sales-approval wording. Do not silently update those shared governance documents in this unit.

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

Missing policy: correction effective reporting month, early collection/order and offset reconciliation are PA-F12-2..4/8. Technical representation does not decide them. Full-only correction does not refund cash, cancel subscription/obligations or revoke approval.

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

An immutable approval fact is inserted atomically once per initial subscription, including reconsideration's first successful approval. P2 later adds an idempotent consumer/inbox or job delivery keyed by event ID. Durable facts permit backfill; an unknown generic job is not enqueued now. Alternatives: browser redirect/event only is lossy; F12 partial form assignment duplicates P2 policy; an unhandled outbox job drains before P2. Client fallback presentation is PA-F12-6, not approval to invent onboarding content.

## R7 — P4 activation seam and schedule conflict

Decision: immutable subscription snapshot and separate append-only activation fact, unique per subscription; no public activation writer in F12. P4 will append its fact in the same transaction as both initial plans and productivity credit. Due projection stays undefined for installment 2+ until that fact exists. P4 must use the same subscription serialization and be reviewed before adding write grants.

D-11 defines month as 30 days, not calendar-month arithmetic. ND-F12-2 says installment 2 is due at month-one end, while F10 permits any nonnegative strictly increasing offsets and has no first-offset-zero requirement. Thus no safe silent normalization can reconcile all historical schedules. PA-F12-3 and PA-F12-8 are explicit blockers to the affected due projection/approvals. No restriction, notification, expiration, renewal, or freeze algorithm is implemented in F12.

## R8 — Audit source and transaction guard

Decision: begin with the complete installed audit function in `20261031122000_client_accounts_signup.sql`, rechecked after future F11 merges. Keep all existing branches and F11 separate operational/audit semantics. Extend clients UPDATE for approved/rejected/reconsidered transitions; payment event INSERT for collected/corrected. Reason comes from immutable decision metadata, not free text or unsigned GUC. Link each decision to the current transaction and signed actor; the client transition guard permits only the matching transition and leaves all other columns immutable.

Audit is trigger-owned once per actual transition/event. No manual RPC duplicate inserts. All new metadata is allow-listed: IDs, state transition, controlled reason, text minor amounts, currency, installment/revision and dates. Commission is not included in common audit detail because broader financial readers must not recover it; owner commission remains gated. Audit failure rolls back business records, approval fact and receipt. Replays do not insert decision/ledger rows and therefore emit no audit.

## R9 — Stack-B and verification constraints

Inspected preparation identifies `lifter-stack-b`, explicit ports 25420–25429, `LIFTER_SUPABASE_STACK=b`, ignored `.env.stack-b`, one canonical migrations directory, and a later approved junction into stack-B config. Its harness/provisioner fail before connections for non-loopback/mismatched selected endpoints. The current branch lacks those changes. AI-F12-1 requires reviewed integration after the infrastructure lands; do not cherry-pick only a config while keeping the A-only harness. E2E app env and provisioner must select the same B endpoints; never default to A when B is missing. F11 Vault compatibility provisioning is required for real signup fixtures on B, without copying A's keys.

No Docker, Supabase CLI, DB connection, test authoring, integration/e2e, provisioning or migration occurred in this unit. Future units must own the B lock and explicit provisioning authorization. Mutation checks operate only on disposable B data/catalog inside rollback or a reviewed restore procedure, never by editing historical migrations. CI runners use their own isolated ephemeral stack; they do not touch the local lock.

## R10 — UI authority and unresolved design

Use the approved full-page review, automatic read-only amounts/confirmation and existing semantic token family. Exact badge mapping/component, role navigation, interim self-status content and network-uncertainty interaction remain PA items. No actual rendered UI, screenshot or skill-based design selection is claimed in this artifact unit. Future UI tasks must apply the full Frontend Design Gate, including catalog applicability, bilingual copy, eight rendered matrix cells and retained evidence. Repo gate's retained CI evidence is authoritative over the older local brief's temp-path suggestion.

## Conflicts / drift to report

- Old D-09/architecture grants Sales approval; D-23/final F12 removes it. Plan follows the later decision and includes both-wall parity tests; shared doc correction waits for its authorized owner.
- F12 US2 calls rejection terminal and scenario 2 denies repeat approve, while ND-F12-5/US2 scenario 3 explicitly permit PO reconsideration. Plan uses a distinct reconsider operation; generic approve remains stale for rejected clients.
- F12 US7 and some historical text say one collection ever; FR-009/ND-F12-6/SC-002 require one active unreversed collection and recollection after correction. The latter explicit policy controls.
- Installment 2 month-one rule versus arbitrary issued F10 offset is unresolved PA-F12-3; no schedule rewrite is inferred.
- Spec sources mention Constitution 1.1.0 and a pending governance merge, and workflow text says no plan/tasks exist. This plan uses merged Constitution 1.2.1 and current docs/09; final input spec is left unchanged for its owner to update.
- Rejection code values, early payments/order, correction month, due-day cutoff and residual UI choices are not decided by the final spec. Plan records them rather than using v0 defaults.
