# Implementation Plan: F12 — Registration approval and payments

**Branch**: `012-registration-approval` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Status**: Proposed technical plan and task decomposition for architect/PO review. No implementation approval or verification of future behavior is claimed. The user explicitly authorized this planning unit; the architect remains the technical approver under Constitution 1.2.1.

## Summary

Implement PO/WO approval and rejection, PO reconsideration, initial subscription snapshots, full-installment collections, and PO-only correction reversals. Use session-authenticated Server Actions and narrowly granted database operations, independent app/database authorization, immutable financial events, exact Round Half Up commission, and transactional audit. Emit a durable approval fact for REQ-P2-01 without building form selection, assignment, or intake. P4 supplies activation; later due dates remain undefined before that fact exists.

This plan follows the Spec Kit research → model/contracts/quickstart → tasks workflow using the repository templates. [Research](research.md) records alternatives; [data model](data-model.md) and [contracts](contracts/registration-approval-surface.md) are normative proposals; [verification](quickstart.md) defines future evidence; [tasks](tasks.md) owns execution order and files. PA-F12-1..9 below are Decided (PO, 2026-10-29); remaining technical recommendations are Architect items.

## Baselines and integration

| Input                         | Exact revision / treatment                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Final F12 spec                | `7cc81d52a9ad8bc1d4aa8797122d1bb8162708f7`, all ND-F12/DG-F12 decisions and REQ-P2-01                                             |
| F11 planned against           | `7a1350467cb9cbfd4a5e037d0b0324ecea255f4c`, PR #14 still in review                                                                |
| F11 merge into F12            | `e8f8d1d100b369597739a6f63ec25d54bd12ad86`                                                                                        |
| Main/governance               | `30399301f0f046e78f951aba1cdb564678f6cea5`, Constitution 1.2.1, D-22..D-26                                                        |
| Main merge into F12           | `4ea3a134435df852331a3dca3909a05bb13bcd5c`                                                                                        |
| Stack-B preparation inspected | `infra-second-stack` at `75d4a40def664f0a2cbbd836c593f235ef624e01`; its `docs/11-second-local-stack.md` is not in this branch yet |

The two requested non-rebase merges completed without conflicts and were pushed before planning. Reconcile F11's final reviewed head before implementation; never overwrite installed guards from an older F11 design document. Recheck the latest complete audit body before each migration brief. At this baseline it is `supabase/migrations/20261031122000_client_accounts_signup.sql`.

## Technical Context

| Item                 | Context                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Language/version     | TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1                                                                       |
| Primary dependencies | Existing supabase-js 2.118.0, SSR 0.12.7, server-only, existing i18n and DS; no new dependency                                           |
| Storage              | Supabase PostgreSQL, append-only financial/decision/event records; private receipts; forced RLS on every new table                       |
| Testing              | Future Vitest unit/integration, real session JWT/PostgREST probes, Playwright/axe, catalog checks, deliberate Q-M mutations              |
| Platform/type        | Existing Next.js web app on Cloudflare/OpenNext; request-scoped Supabase session client; no staff service-role bypass                    |
| Performance goals    | Indexed identity/tenant/obligation/event lookups; server pagination default 20 per DESIGN.md; no invented latency or volume SLA          |
| Constraints          | DB-free during planning; stack A locked by F11; future DB execution exclusively on provisioned, selected, owned stack B                  |
| Scope                | Initial approval/subscription and correction ledger; no refund, renewal, activation writer, overdue enforcement, reports, or form engine |

## Constitution Check

Gate assessed before research and after proposed Phase 1 design against version 1.2.1. Requirements are designed for compliance; external dependencies and unresolved architect refinements block only their affected implementation portions; F12 policy is final.

| Principle           | Pre-research obligation → post-design treatment                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I isolation         | Two walls and tenant-composite relations → every new table forced RLS; scoped public operations; direct foreign probes and controlled-grant RLS tests                                                      |
| II financial truth  | Immutable exact money → frozen terms/obligations, append-only event chains, independently constrained single active collection, exact stored-value reversal                                                |
| III governance      | Approved matrix → remove Sales approval at TS and DB walls; PO-only reconsideration/correction; commission PO/WO only                                                                                      |
| IV approved scope   | Trace approved spec → final generic rejection/sequential early-payment/correction-month policy applied; custom issued offsets preserved; Architect items govern missing technical details                  |
| V versioning        | Non-retroactive snapshots → committed client/link/version terms copied unchanged; no current-offer check; P4-only activation fact                                                                          |
| VI people decisions | Human control → responsible recording actor from session, no compensation or discipline automation                                                                                                         |
| VII privacy         | Least privilege/audit → no payment method/reference/free text, narrow client status, allow-listed audit, no raw RPC/provider logs; B4 retention remains production gate                                    |
| VIII design         | DS/gate → full-page review, read-only amount/explicit confirmation, soft semantic badges; missing exact interaction/mapping handled by architect design review; eight rendered matrix cells required later |
| IX reliability      | Atomicity/idempotency → bound private receipts, explicit installment and expected ledger revision, one lock order, authorization after waits, outbox fact and audit commit atomically                      |
| Platform/delivery   | Forward-only changes after latest F11; no cloud/deploy; backup/restore obligations remain; stack selector must fail closed before DB use                                                                   |
| Workflow            | User-authorized plan artifacts only; tests-first future units, disjoint ownership, architect review plus green exact-head CI; main merge gate remains D-26/docs/08                                         |

No constitutional exception is requested. Analyze and independent architect review must confirm this design and the resolved PA items before implementation briefs.

## Phase 0 — Research

The [decision record](research.md) reconciles final spec with installed F11, selects immutable obligation event chains over mutable payment status, specifies receipt binding and lock/revocation behavior, and separates correction from F13 refund. No DB feasibility probe has been run. The selected schema/constraint approach is subject to future stack-B RED→GREEN proof, not an assertion of an existing constraint.

## Phase 1 — Transactions, access, and integration seams

### State and transaction boundaries

- Approve pending → approved (PO/WO), or reconsider rejected → approved (PO only), in one transaction: validate/re-authorize; create initial subscription and obligations; append installment-1 collection; append decision; transition client; append approval fact and receipt; force deferred checks; commit. No schedule means one full-price obligation. A reconsideration uses this same purchase transaction, not an approval-only shortcut. Already-approved clients cannot be reconsidered again.
- Reject pending → rejected (PO/WO): approved reason code, decision, transition, audit and receipt together; no subscription or collection. The sole reason code is `registration_rejected` (PA-F12-1 Decided).
- Collect: explicit obligation/sequence and expected stream revision, full snapshot amount/currency, confirmed payment, past-or-today Cairo date, collection event, audit and receipt together. For seq>=2 require activation and all earlier obligations paid; early payment after activation is allowed (PA-F12-2 Decided).
- Correct: PO only, explicit active original collection and stream revision; append full reversal with exact negated stored amount and commission, audit and receipt together. The obligation derives unpaid and may later be fully collected again. Original approval/subscription/client state does not change; this is a recording correction, not an F13 refund/cancellation. effective_on is the fresh Cairo date of correction recording: book in the correction month (PA-F12-4 Decided), not the original collection month.
- Any failed write, deferred check, or audit aborts the entire operation. Return success only after commit; lost-response retries retain the same key and canonical request.

### Serialization and fresh authorization

Use one target order: client → subscription (when present) → obligation → existing ledger rows in sequence. After these waits, lock/read the actor's current staff row and applicable membership in a consistent order and recheck current role/capability/scope in a new statement. Hold authorization locks through commit so revocation has a defined serialization point; do not trust a pre-wait `STABLE` result or JWT role claim. PO needs an existing target workspace despite membership bypass. Replay undergoes the same authorization before any receipt/state disclosure. Operation-key serialization occurs after target locking; keys bind a single target. Cross-target key races fail the unique actor/key constraint and then compare the original binding without disclosing it.

Approval never locks a consumed registration link just to revalidate expiry. It reads the immutable committed association and snapshots. F11 Auth identity, recovery receipts, claims, consumption markers, and signup/admission behavior remain unchanged.

### Active collection integrity

Each obligation has a single immutable event chain: collection → correction reversal → collection. Unique root/revision and unique predecessor-successor relations prevent branching independently of operation keys. Deferred integrity checks enforce contiguous revisions, alternation, exact obligation/subscription/workspace correspondence, and reversal equality. Active collection is the tail when its kind is collection. There is no mutable paid-event pointer or financial-row status update. See [data-model.md](data-model.md).

### App and database walls

Keep staff `authorize()` and DB `has_workspace_access()` checks in all staff reads/actions, with explicit PO/WO approval and PO-only correction/reconsideration restrictions. Remove only Sales `approve_registration` from both matrices; Sales retains `record_payment`. Reuse `record_refund` as the existing PO-only capability check for correction, additionally limiting this RPC to full recording corrections; it does not expose F13 refunds. Role checks are authoritative at both walls.

Do not grant base-table reads or writes to browser roles. Definer readers return column-limited projections with money as strings. Commission has a separate PO/WO reader; ordinary receipt/result projections contain no commission for any role so replay payloads stay identical. Internal functions revoke EXECUTE from PUBLIC/anon/authenticated/service_role, set `search_path=''`, qualify objects, and are postgres-owned. Only the explicit public RPC inventory grants authenticated EXECUTE. No general anonymous or service-role financial operation.

Client access uses a separate app helper and self-status RPC with no target ID parameter. An indexed `auth_user_id = auth.uid()` lookup provides only the current approval state. An internal client-access helper reads that association directly without recursive client RLS. Per-request memoization only; no cross-request cache/JWT state. Poll/refresh an authenticated status surface; no intake UI, staff role, or other client permissions are created. Its standalone Pending/Approved/Rejected presentation and automatic/manual navigation are decided in PA-F12-6; see the bounded polling/redirect contract.

### Approval and activation handoffs

The immutable `registration_approval_events` fact is inserted once with client/workspace/subscription identity and event ID/version in the approval transaction. P2 later consumes it idempotently and owns automatic assignment, selected form version, mandatory Basic/Workout/Nutrition sections and login presentation (REQ-P2-01). Do not enqueue an unhandled generic job that would exhaust retries before P2 exists; P2 can backfill durable facts when its consumer lands. No delivery guarantee is claimed before that consumer exists.

The [handoff contract](contracts/feature-handoffs.md) defines the P4 activation seam. Installment 1 is upfront at approval regardless of its stored legacy first offset (that raw value stays unchanged). For n>=2, due_on = Cairo activation date + issued offset days; it is payable through that Cairo date's end. Undefined before activation. Default remainder offset is 30 Cairo calendar days, not 720 elapsed hours or a calendar-month increment. Preserve every custom offset, including second offsets other than 30; do not hold, normalize or reissue those agreements. Later collections require activation and all earlier obligations currently paid; early collection before due is allowed after activation. Corrections do not cascade changes to later events.

### Flexible F10 link creation owned by F12

F10 baseline is byte-identical to origin/main `30399301f0f046e78f951aba1cdb564678f6cea5` for its artifacts, registration migration and issuing app/lib/components. See [gap analysis](../010-registration-links/addendum-f12-flexible-installments.md). Storage already supports exact positive amounts, row count, arbitrary ordered offsets and deferred exact total. F12 adds an explicit upfront/count workflow and timing semantics to the existing issuance UI/action, with a forward-only authenticated wrapper RPC and no rewriting of issued rows. Upfront value is explicitly chosen by authorized staff, not an invented percentage. Default two-payment timing is approval/offset 30; remainder = price minus chosen upfront. Custom individual amounts/offsets remain editable before issue, immutable after it. Count includes upfront (technical recommendation AI-F12-2), and more than two payments require explicit individual amounts, not an invented split algorithm. Trainer retains full-payment link generation but cannot configure installments.

U1F owns verification of the already-installed `20261101131000_flexible_registration_link_terms_forward.sql`, plus the link action/service/validation and existing dialog/manager/CSS with targeted tests. T051 verification is pending. Keep the legacy issuer contract valid for issued/legacy callers. The installed wrapper validates upfront/count correspondence and delegates to existing guarded atomic issuance; preserve expiry, rate policy, token/privacy, audit and RLS invariants. No copied parallel schedule table, no retroactive normalization. See the surface contract for versioned input.

### Forward migrations and audit preservation

Proposed F12 files, subject to collision check against the latest merged F11: `20261101120000_registration_approval_model.sql`, `20261101121000_registration_approval_operations.sql`, `20261101122000_payment_operations.sql`, and `20261101123000_registration_approval_reads.sql`. The U1F migration `20261101131000_flexible_registration_link_terms_forward.sql` already exists; its verification is pending under T051. No F12 migration timestamp is at or before `20261031130000_purge_scheduling_pg_cron.sql`. Never edit committed migrations. Model migration adds forced RLS/constraints/guards and replaces only the clients `signup_no_update` protection with a narrow approval transition guard; identity/snapshot fields remain immutable and DELETE/TRUNCATE remain blocked.

All audit changes start from the latest complete `audit_row_change()` body, currently `20261031122000_client_accounts_signup.sql`. Preserve workspace, staff, membership, recovery, package/version/offer, issued/opened/consumed link, signup-success and dead-job mappings, no-op handling, unmapped exception and final append. Preserve F11 separately emitted attempt/failure/cleanup evidence. Extend clients UPDATE and add payment INSERT branches; add UPDATE trigger coverage without duplicating INSERT signup audit. The branch inventory and exact allow-lists are reviewed/tested, not regenerated from an older F4/F9/F10 body.

### UI work and the Frontend Design Gate

Future U7/U8 briefs must include [docs/09-frontend-design-gate.md](../../docs/09-frontend-design-gate.md), whose repository evidence-retention rules supersede the older environment brief's temp-only screenshot wording. The environment brief was read for this plan; DESIGN.md, F2 artifacts and implemented tokens remain authoritative. The design-skills catalog was inspected; this unit changes no rendered UI, so skill application and rendered PASS/FAIL evidence are not claimed. Future UI implementers must record each catalog skill's applicability, load applicable skills, and never persist a generated alternative design system.

Dedicated staff review is a full page (DG-F12-2), not a replacement modal flow. Sales uses separate `/payments` list/detail pages gated by `record_payment`, not the PO/WO approval queue/review. Amount is server-derived/read-only, with explicit external-payment confirmation (DG-F12-3). Status badges use existing soft semantic fg/bg/border tokens (DG-F12-4), with exact feature styling/mapping reviewed under AI-F12-3 and existing semantic tokens only. Reuse Field/Button/Alert/States/ConfirmDialog/Bidi and existing shell/preferences. Do not add colors, layout breakpoints, fonts, navigation tabs or motion on skill authority. Dates must accept any supported historical date, not merely a short calendar range. No editable amount, payment method, reference, rejection free text, form selector, or intake stub.

The future evidence matrix covers Arabic RTL/English LTR × dark/light × mobile 390/desktop 1440, and tablet if layout changes. Cover loading/empty/no-results/error/success/disabled/pending/hover/focus, keyboard names/order/live announcements, axe, mixed-direction exact money/dates, and workspace-brand contrast. Retain CI screenshot artifacts and stable evidence links. Final PO decisions govern these flows. Any missing detailed presentation is an Architect item under the Design Gate, not an open F12 policy vote.

## Project Structure

### Documentation (this feature)

```text
specs/012-registration-approval/
├── spec.md                         # final PO policy and verbatim 2026-10-29 record
├── research/spec-debate-r1.md       # historical debate; unchanged
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── registration-approval-surface.md
│   └── feature-handoffs.md
├── quickstart.md
└── tasks.md
```

### Future source ownership

```text
supabase/migrations/2026110112*       # four new forward migrations only
lib/auth/capabilities.ts             # Sales approval removal
lib/client-access/                   # separate self-status authorization
lib/registration-approval/           # validation, exact money, readers/services/results
lib/registration-links/{validation,service}.ts # F12-owned flexible issuance extension
components/registration-links/       # explicit upfront/count/custom schedule UI
app/(app)/registration-approvals/    # queue, full-page review, actions
app/(app)/payments/                  # record_payment list/detail, including Sales
app/(client)/account/status/         # authenticated narrow status, no form engine
components/registration-approval/    # feature UI, DS reuse
lib/i18n/messages/{ar,en}.ts         # sequential shared ownership
tests/{unit,integration,e2e}/        # named F12 tests in tasks
```

**Structure decision**: Extend existing root-level Next.js layout; do not create a second backend, repository abstraction, native app, or new dependency. Proposed route names are technical endpoints; role navigation placement is not decided here.

## Complexity Tracking

No constitutional violation is proposed; no exception is approved.

| Design cost                                       | Why needed                                                                                                   | Simpler alternative rejected because                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Immutable ledger predecessor/revision constraints | Single active collection with reversible/recollectable obligations, independent of request keys              | Unique obligation forever forbids recollection; mutable paid pointer duplicates truth; unconstrained anti-join alone races |
| Private receipts plus decision records            | Bound replay for both rejection and money changes; reason/transition audit without mutating identity columns | Payment-row-only key cannot represent rejection; client reason overwrite loses history                                     |
| Durable approval and activation facts             | Atomic P2/P4 seams without premature engines or snapshot updates                                             | Unhandled jobs can dead-letter before consumers exist; setting activated_at at approval violates the spec                  |
| Separate client authorization                     | Pending status and live approval without staff membership or PII grants                                      | Reusing staff-only helpers cannot authorize clients safely                                                                 |

## Plan-approval items for the PO

All nine policy entries are **Decided (PO, 2026-10-29)**. The verbatim final record is in [spec.md](spec.md#final-po-decision-record-2026-10-29). Technical plan/implementation approval remains separate.

- **PA-F12-1 - Decided:** One generic `registration_rejected` code; remove the three-code proposal and free-text fallback everywhere.
- **PA-F12-2 - Decided:** Later installments only after activation, sequentially; early payment allowed. Require all earlier obligations currently paid, including after a correction.
- **PA-F12-3 - Decided (CUSTOM):** Flexible installments at F10 link creation: explicit upfront/count/individual amounts/timing, default upfront at approval and remainder at activation +30 Cairo calendar days; exact total; preserve all issued agreements/custom offsets. F12 owns the missing UI/action/forward migration work, U1F.
- **PA-F12-4 - Decided:** Correction month accounting; effective_on = Cairo date of correction recording; original immutable; linked full append-only reversal.
- **PA-F12-5 - Decided:** Status badges reuse existing Design System semantic tokens; no invented palette/shared token change.
- **PA-F12-6 - Decided (CUSTOM):** Standalone Pending/Approved/Rejected page; bounded visibility-aware automatic detection and safe redirect plus Manual Refresh/navigation fallback. Auth and real route checks; approval does not mean activation.
- **PA-F12-7 - Decided:** Approvals/Payments links on existing authorized staff dashboards, no navigation redesign. Future dashboard edit is explicitly owned by T034.
- **PA-F12-8 - Decided:** Default due date is Cairo activation date +30 calendar days, payable through day-end; preserve custom schedules.
- **PA-F12-9 - Decided:** Keep identical request/key on uncertain outcome, warn, permit safe retry; never create a duplicate payment intent.

## Architect items

These are technical recommendations or external dependencies, not unresolved PO policy. Resolve in architect review before the affected implementation; do not claim they are approved product choices.

- **AI-F12-1 - Stack-B integration:** Source records provisioning/start complete and isolation proven at `infra-second-stack` short SHA `d498800`, 861/861 integration. This checkout still lacks selector/harness changes. Recommend reviewed integration of the landed infrastructure through updated main under a separate authorized brief; record full SHA and B-specific lock/env proof. No new provisioning or merge is authorized here, no fallback to A.
- **AI-F12-2 - Flexible editor/count mechanics:** Recommend totalPaymentCount includes upfront, displayed explicitly; require staff-chosen positive upfront, derive one default remainder at offset 30, and require explicit custom amounts/offsets for additional rows. Count reduction/edited-row confirmation and exact UI labels need architect design review; do not invent automatic equal splits or default upfront percentages.
- **AI-F12-3 - Design Gate details:** Recommend existing Field/Button/ConfirmDialog/Bidi and feature badge with warning/pending, success/approved, error/rejected tokens. Review exact copy, date/count controls, badge mapping and focus states against DESIGN.md; any missing DS decision is escalated with A/B/C under docs/09 rather than invented. U1F, U7 and U8 each carry the full gate.
- **AI-F12-4 - Poll/redirect implementation:** Recommend the bounded no-Realtime mechanism in the surface contract (15-second minimum visible interval, 12 automatic attempts per mount, one in flight). Use the actually existing authorized `/` as the current post-approval fallback, no guessed intake/plan route; revalidate auth/self mapping and server allowlist before redirect. Future destination changes need route-contract review.
- **AI-F12-5 - F11 reconciliation/audit source:** F11 planned against `7a1350467cb9cbfd4a5e037d0b0324ecea255f4c`; PR #14 remains unmerged in this session. Reconcile its final reviewed head later. Recheck latest complete audit body before future extension (currently `20261031122000_client_accounts_signup.sql`).
- **AI-F12-6 - P4/P2 handoffs:** P4 derives subscription activation from independent first-delivery records; activation and the productivity unit are recorded in one exactly-once transaction only after both first deliveries succeed. Before that, later due dates remain undefined and later payments denied. P2 owns REQ-P2-01 assignment/intake/Trainer capability. Recommend durable F12 approval facts with later P2 backfill/dedup, no partial form engine.

  > **Superseded by Plan Core (S20 §4 / spec 019):** First workout and nutrition deliveries are independent, idempotent delivery records and may occur on different days. After both succeed, activation, including the productivity unit, happens in one exactly-once transaction. See the `019-plan-core` branch for the canonical contract.

- **AI-F12-7 - Production/evidence:** Correction must be operational before real finance; B4 retention, F11 hosted compatibility, backup/restore and exact-head CI/review gates remain. Recommend preserving all existing readiness gates; no deployment authorized.

## Conflicts for PO

None requiring a new PO decision. Final F12-3/F12-8 explicitly refine the older fixed second-offset-30 wording into a default while preserving custom offsets. F12-4 explicitly selects correction-month accounting over the earlier original-month recommendation. F12-6 assigns the standalone status flow to F12 without transferring P2 intake/assignment. Old D-09/architecture Sales approval is superseded by ND-F12-1/D-23. These are documented precedence resolutions, not reasons to reopen final policy.

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
`20261031130000_purge_scheduling_pg_cron.sql`. Planned F12 model migration
`20261101120000_registration_approval_model.sql` sorts strictly after it.

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
