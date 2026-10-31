# F12 Spec Debate — Round 1

**Date**: 2026-10-28<br>
**Architect**: Claude Opus 5.5<br>
**Critic**: gpt-6.1-sol medium (read-only)<br>
**Codex thread**: `01a183d4-033c-7a43-8074-f7963dc20bec`<br>
**Outcome**: closed after one round; 10/10 accepted (#1 with qualification).

This file preserves the full debate record for traceability. The architect response r1 supersedes the v0 draft where they conflict.
## Architect v0 draft

# F12 — Registration approval, payment recording, subscription record and payment ledger (Claude initial draft v0)

Status: architect draft for Sol critique. Not PO-approved. Base: F11 (`011-client-accounts`, unmerged, head a14bc72) + F9 packages + F10 links. Sources: BRD-03/04, PRD-02/07, PRD-14 Journey A/D, D-08..D-17, ND-F11-6/6a, constitution I/II/III/IV/IX.

## 1. Problem and scope
F11 creates `public.clients` rows in `pending-approval` with zero access. F12 lets authorized staff verify the external payment and approve (or reject) the registration, records confirmed collected payments in an immutable ledger with per-payment commission (D-13), and creates the subscription record from the link's immutable snapshot. Journey A stops at "owner confirms payment/approves".

**In scope**
- S1 Approval queue: list pending-approval clients of accessible workspaces (safe columns: name, issued offer/version label, price snapshot, schedule snapshot, signup time). PO platform-wide; staff per workspace.
- S2 Approve: atomic, idempotent transaction: verify actor + capability `approve_registration` + workspace scope; record the FIRST confirmed payment (full price, or installment #1 when a schedule exists) with explicit "payment verified" confirmation; create `subscriptions` row (state `awaiting_activation`) bound to the link's package_version snapshot (price, currency, duration, commission rate); copy schedule rows into `subscription_installments`; set client `approved`; audit.
- S3 Reject: terminal `rejected` state, no access, no ledger rows, audit with reason code (no free text PII).
- S4 Record later installment payment (`record_payment`): exact scheduled amount against the next unpaid installment; idempotent; ledger + commission.
- S5 Ledger: append-only `payment_events` (kind `collected`), bigint minor units, currency from snapshot, `collected_on` (Africa/Cairo date → collection month per D-13), commission computed at snapshot rate, recorded_by/at. No update/delete/truncate for any role (installed guards like F9 versions).
- S6 Approved clients get live access WITHOUT re-login (BRD-04.4): access is derived from DB state per request (app `authorize()` + RLS read `clients.state`), never from JWT claims minted at sign-in.
- S7 Staff UI: approval queue, approve/reject dialogs, record-installment action; bilingual, Design System, frontend design gate.

**Out of scope** (later features): refunds (F13; D-10 PO-only, D-15 full only), freeze, renewal, activation after both initial plans are delivered (P4), overdue restriction enforcement and notifications (P4/P6), finance reporting (P4), client portal content beyond the approval-state landing, intake (P2), client deletion/closure (ND-F5-1).

## 2. Requirements (draft)
- FR-01 Two walls on every mutation/read: app `authorize()` capability + DB `has_workspace_access()`/actor checks inside SECURITY DEFINER RPCs (`search_path=''`, postgres-owned, EXECUTE only to `authenticated`). No capability-matrix change (uses existing `approve_registration`, `record_payment`).
- FR-02 Approve/reject only from `pending-approval`; concurrent approve/reject/approve → exactly one outcome (row lock on client, then link, then subscription; idempotency key unique per (actor, key)). Replays return the original result.
- FR-03 All money from the immutable link snapshot; caller cannot supply price, currency, rate or schedule. First payment amount = snapshot full price or installment #1 amount exactly. Installment totals already = price (D-17, F10).
- FR-04 Commission per payment = f(amount_minor, snapshot rate) with a single tested rounding rule (NEEDS SOURCE CONFIRMATION; conservative default: round half-up to minor unit per payment, documented as not PO-approved). Unpaid balance earns nothing.
- FR-05 `collected_on` is a Cairo calendar date, not in the future; backdating bound NEEDS PO (default: ≥ client signup date).
- FR-06 Ledger and subscription snapshot immutable; corrections only via future reversal events (F13).
- FR-07 Rejected/pending clients: zero access (F11 invariants kept); approved clients: access only to what later features grant — F12 itself grants only the approval-state landing.
- FR-08 Audit: new structured events `client.approved`, `client.rejected`, `payment.collected` (ids, minor amounts as text, currency, installment seq; no PII/free text) via extension of `app_private.audit_row_change()` from its latest complete body (F11 `20261031122000` or later).
- FR-09 Generic `not_permitted` for unauthorized/foreign/nonexistent targets (no existence disclosure); `stale_state` for already-decided clients.
- FR-10 No bulk actions (BRD-06): one client per operation.

## 3. Key entities
`subscriptions` (id, workspace_id, client_id unique for first subscription, package_version_id, price_minor, currency, duration_days/months, commission_rate snapshot, state `awaiting_activation`, created_by/at) · `subscription_installments` (subscription_id, seq, amount_minor, day_offset, paid_event_id null) · `payment_events` (id, workspace_id, subscription_id, installment_seq null|n, amount_minor, currency, commission_minor, collected_on, method, recorded_by/at, idempotency_key) · `clients.state` gains `approved`, `rejected` (forward migration; state machine guard trigger).

## 4. Architecture notes
- Option chosen: DB-centric SECURITY DEFINER RPCs (same pattern as F9/F10/F11) called from Server Actions with the user's session client; no service role.
- State machine enforced by trigger + RPC; direct table writes denied (zero grants, forced RLS).
- Live access: app reads `clients.state` per request (cached per request only); RLS client policies check state via a STABLE SECURITY DEFINER helper.
- Money gate and isolation gate apply; property tests for commission/rounding and installment sequencing.

## 5. Open decisions for PO (do not assume)
1. **Approvers:** D-09 says PO, WO **and Sales** approve registrations and record payments (matrix already grants Sales); ND-F11-6a says approvers are workspace PO/WO. Which is binding for F12?
2. **Installment anchor:** BRD says installment #2 is due "end of month one from activation"; F10 stores day offsets. Are offsets relative to activation (P4), to approval, or to signup? Is installment #1 always paid at approval?
3. **Commission rounding** rule on minor units (DR-02 NEEDS SOURCE CONFIRMATION).
4. **Payment fields:** method enum values (cash / bank transfer / mobile wallet / other?) and whether a reference text is allowed (PII risk).
5. **Rejection semantics:** does rejection release the email/phone identity claims and/or the consumed link (ND-F5-1/ND-F11-9 interplay)? Reason codes list?
6. **Backdating window** for `collected_on`.
7. **Approved client landing:** what does an approved client see before intake exists (P2)? Generic "approved — next steps" page (design gap) vs nothing until P2.
8. Partial payment of an installment: forbidden (default) or allowed?

## Sol Medium critique — round 1 (verbatim)

1. **[BLOCKER] Approval authority is already decided.** Draft §5.1 reopens ND-F11-6a despite its later PO decision restricting approvers to PO/WO (`specs/011-client-accounts/spec.md`, decision register; decision register DR-03 precedence). Apply that restriction at both walls; reconcile the existing Sales capability explicitly. Preserve Sales’ separately approved installment-recording right under D-09.

2. **[BLOCKER] Live access lacks an implementable authorization contract.** Existing `authorize.ts` accepts staff roles only; `has_workspace_access()` is staff-only; F11 clients have no SELECT grant. Draft S6 cannot work merely by reading state. Define a narrow self-status projection and separate client authorization helper, avoiding recursive clients-table RLS. Use indexed `auth_user_id` lookup, statement/request-only caching, and refresh/poll behavior for an already-open page. `STABLE` alone guarantees neither one lookup nor browser updates. Evidence: BRD-04.4; `lib/auth/authorize.ts`; `20261027140000_access_capability_for_po.sql`; F11 data-model §RLS.

3. **[MAJOR] Read permissions could disclose commission.** Draft FR-01/§4 specifies neither column projections nor role-specific financial visibility. Commission amounts reveal rates to Sales. Preserve PO/WO-only commission readers, exact-money safe views, and denied wildcard/embedded reads (`specs/009-packages/data-model.md`, RLS/projections; F10 FR-008). Explicitly revoke default function EXECUTE, grant only public RPCs, qualify objects, and authorize before replay/state disclosure. PO still requires a real target workspace; its helper bypasses membership checks.

4. **[BLOCKER] Idempotency does not bind intent.** `(actor,key)` alone permits reuse across approve/reject, clients, workspaces or payment dates; reject has no payment row to hold its receipt. “Next unpaid” also allows two requests with different keys to collect successive installments accidentally. Require a private transactional operation receipt binding operation, workspace, target, expected installment and canonical arguments; mismatched reuse fails. Reauthorize replays, return identical receipts without audit duplication, and enforce payment uniqueness independently of keys. Evidence: draft FR-02/S4/§3; Constitution II/IX.

5. **[BLOCKER] Tenant and payment invariants are missing.** Draft §3 omits `workspace_id` on installments and specifies no composite relationship for `paid_event_id`. Require tenant-composite FKs, event-to-installment/subscription correspondence, one collection per scheduled obligation, exact amount/currency checks and deferred total/sequence validation. Scope client uniqueness to the initial subscription so F13 renewals remain possible. Evidence: Constitution I/II; F10 data-model §§Installment rows/Integrity; D-04.

6. **[MAJOR] Approval must honor the issued sale after availability changes.** Explicitly allow approval after link expiry, consumption, offer disablement or newer-version publication; use the client’s committed link/version binding. F10 data-model §RLS states later versions/unavailability do not invalidate historical links. Remove the link lock unless a concrete invariant needs it; establish one order for client/subscription/payment locks and define revocation serialization after waits. Preserve recovery receipts, Auth identity and consumed markers during approval/rejection (`011-client-accounts/contracts/client-signup-surface.md`, F4 recovery dependency).

7. **[MAJOR] Money arithmetic is underspecified.** Draft FR-04 attributes rounding uncertainty to DR-02, which contains no rounding rule. Record this as a missing financial policy. Specify integer basis points, overflow-safe numeric multiplication, exact decimal-string transport, and bounded commission before conversion to bigint; prohibit JavaScript `number` arithmetic. Cover zero/100% rates, half-minor ties and bigint extremes. Evidence: F9 data-model §§Package version/Safe projection; D-13; Constitution II.

8. **[MAJOR] The backdating default contradicts the sale sequence.** FR-05’s signup-date lower bound excludes legitimate payments received before link issuance/signup (BRD-01, BRD-04.1, PRD-14 Journey A). Remove it. Distinguish immutable recording timestamp from staff-attested collection date; derive month from that date, and compare future dates against fresh Cairo-local time. Obtain policy for historical entry and corrections. Evidence: D-13; architecture §Money.

9. **[BLOCKER] Refund compatibility needs an explicit seam.** A collected-only ledger plus mutable paid pointer leaves F13’s reversal/cancellation rules undefined. Preserve stable original-payment IDs and stored commission, allow additive reversal events referencing originals, and define shared subscription serialization for collection versus refund. F13 must reverse stored amounts exactly, cancel unpaid obligations and prevent subsequent collection atomically. Evidence: D-15; architecture §Money, full-refund transaction.

10. **[MAJOR] The proposed migration targets the wrong state field and misses installed guards.** F11 uses `clients.approval_state`, constrained to pending, with unconditional `signup_no_update`; draft repeatedly specifies `clients.state`. Replace these protections narrowly while retaining identity/snapshot immutability. Extend the existing INSERT-only client audit branch and trigger coverage for actual transitions, with rollback on audit failure and no replay events. Preserve every latest audit mapping and existing PO/WO audit visibility. Evidence: `20261031121000_client_accounts_model.sql`; `20261031122000_client_accounts_signup.sql`, `audit_row_change()`.

**Preferred alternative**

Use immutable installment obligations plus a unified append-only collection/reversal ledger; derive paid status from uniquely linked collection events instead of `paid_event_id`. This removes bidirectional mutable bookkeeping and directly supports D-15. The trade-off is indexed joins. Prefer this over duplicating payment truth; keep activation, overdue enforcement, reporting and intake in their assigned features (roadmap P2/P4).

**Open-decision corrections**

#1 is settled. #2 retains activation as the documented anchor; clarify first-payment treatment, early payments and offset-zero/nonzero schedules without invalidating F10 schedules. #3 needs PO-confirmed financial policy; arithmetic is technical. #4 should first establish whether method/reference collection is required. #5 separates rejection policy from deferred identity/link release (ND-F5-1, ND-F11-9). #6 and #8 remain genuine PO decisions. #7’s wording/layout is design work; approval visibility is mandatory. Add rejection authority, rejected-account recovery/reconsideration policy, and historical-payment correction rules. Do not invent archived-workspace/client behavior or closure workflows.

## Architect response r1

# F12 — Spec debate round 1: architect response (Claude) → v1 decisions

Sol Medium critique (thread 01a183d4-033c-7a43-8074-f7963dc20bec) verified against a14bc72 (`clients.approval_state` + `signup_no_update` confirmed; ND-F11-6a confirmed decided). Debate closed after one round: all 10 findings ACCEPTED; one qualification (#1). These override the v0 draft (`f12-draft-claude.md`) wherever they differ.

1. ACCEPT with qualification. ND-F11-6a is binding: approve/reject = PO (platform-wide, real target workspace required) and WO only. Consequence: Sales currently holds `approve_registration` in `lib/auth/capabilities.ts`; enforcing ND-F11-6a removes it → **capability-matrix change, listed for PO confirmation (not a re-ask of ND-F11-6a)**. Sales keeps `record_payment` for later installments (D-09).
2. ACCEPT. Define a client authorization path separate from staff `authorize()`: narrow self-status projection by indexed `auth_user_id`, a dedicated SECURITY DEFINER client-access helper (no recursive clients RLS), per-request caching only, and refresh/poll for an already-open pending page so approval is visible without re-login. Detailed design is a plan-phase item (Sol Medium, security).
3. ACCEPT. Column-level projections; commission amounts/rates readable only by PO/WO (F9 pattern); Sales sees amounts due/collected without commission; revoke default EXECUTE, grant only the public RPCs, schema-qualify everything, authorize before any replay/state disclosure.
4. ACCEPT. Private operation receipts binding (operation, workspace, target, expected installment seq, canonical args hash); mismatched key reuse fails; replay re-authorizes, returns the identical receipt, no duplicate audit. Payment uniqueness per obligation enforced by constraint independent of keys. Requests name the expected installment explicitly ("next unpaid" removed).
5. ACCEPT. `workspace_id` on every row with tenant-composite FKs; one collection per obligation; exact amount/currency checks; deferred sequence/total validation; client uniqueness scoped to the initial subscription (renewals in F13 remain possible).
6. ACCEPT. Approval honors the committed client→link→version binding even after link expiry/consumption, offer disablement or newer versions. No link lock unless an invariant needs it; single lock order client → subscription → obligations/ledger; staff revocation re-checked after lock waits. Recovery receipts, Auth identity and consumed markers untouched.
7. ACCEPT. Rounding is a missing financial policy (not in DR-02). Technical: integer basis points, numeric multiplication, exact decimal-string transport, bounded result before bigint; no JS `number` money math; tests for 0%/100%, half-minor ties, bigint extremes.
8. ACCEPT. Remove the signup-date lower bound. Separate immutable `recorded_at` from staff-attested `collected_on` (Cairo date, not future vs fresh Cairo time; collection month from it). Historical entry/correction policy → PO.
9. ACCEPT (adopt Sol's preferred alternative). Immutable installment obligations + unified append-only ledger of `collection` and (F13) `reversal` events referencing originals; paid status derived from uniquely linked collection events (no mutable `paid_event_id`); stored commission per event so F13 reverses exact stored amounts; shared per-subscription serialization for collect vs refund.
10. ACCEPT. Forward migration widens `approval_state` check to pending-approval/approved/rejected with a transition guard replacing `signup_no_update` narrowly (identity/snapshot columns stay immutable); extend the existing clients audit branch for UPDATE transitions from the latest `audit_row_change()` body; audit failure rolls back; no replay events; PO/WO audit visibility preserved.

## Final PO decision list (F12)
- P1 Confirm capability-matrix change: remove `approve_registration` from Sales (consequence of ND-F11-6a); Sales keeps `record_payment`.
- P2 Installment anchor/first payment: offsets measured from activation (BRD)? Is installment #1 always collected at approval? Early payment of later installments allowed? How are offset-0 vs non-zero schedules interpreted?
- P3 Commission rounding policy on minor units (missing financial policy).
- P4 Payment details: is a method required (values?) and is a reference text allowed (PII risk)?
- P5 Rejection: who may reject (default = same as approvers), reason codes, can a rejected client be reconsidered/re-approved, and can a rejected client use password recovery? (Identity/link release stays deferred to ND-F5-1/ND-F11-9.)
- P6 Collection-date policy: how far back may `collected_on` be, and how are mistaken payment entries corrected before F13 (reversal-only, PO-only)?
- P7 Partial payment of an installment: forbidden (default) or allowed?
- Design (escalate with A/B/C at spec time): approved-client landing before intake exists; approval queue/dialog layout; money display/entry component; client state badges.
