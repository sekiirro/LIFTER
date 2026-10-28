# Implementation Plan: F12 — Registration approval and payments

**Branch**: `012-registration-approval` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Status**: Proposed technical plan and task decomposition for architect/PO review. No implementation approval or verification of future behavior is claimed. The user explicitly authorized this planning unit; the architect remains the technical approver under Constitution 1.2.1.

## Summary

Implement PO/WO approval and rejection, PO reconsideration, initial subscription snapshots, full-installment collections, and PO-only correction reversals. Use session-authenticated Server Actions and narrowly granted database operations, independent app/database authorization, immutable financial events, exact Round Half Up commission, and transactional audit. Emit a durable approval fact for REQ-P2-01 without building form selection, assignment, or intake. P4 supplies activation; later due dates remain undefined before that fact exists.

This plan follows the Spec Kit research → model/contracts/quickstart → tasks workflow using the repository templates. [Research](research.md) records alternatives; [data model](data-model.md) and [contracts](contracts/registration-approval-surface.md) are normative proposals; [verification](quickstart.md) defines future evidence; [tasks](tasks.md) owns execution order and files. Open PA items below are proposals, never approved defaults.

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

Gate assessed before research and after proposed Phase 1 design against version 1.2.1. Requirements are designed for compliance; unresolved PA items and external dependencies block their affected implementation portions.

| Principle           | Pre-research obligation → post-design treatment                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I isolation         | Two walls and tenant-composite relations → every new table forced RLS; scoped public operations; direct foreign probes and controlled-grant RLS tests                                 |
| II financial truth  | Immutable exact money → frozen terms/obligations, append-only event chains, independently constrained single active collection, exact stored-value reversal                           |
| III governance      | Approved matrix → remove Sales approval at TS and DB walls; PO-only reconsideration/correction; commission PO/WO only                                                                 |
| IV approved scope   | Trace approved spec → no guessed rejection taxonomy, early-payment rule, correction month, UI gaps, or F10 offset reinterpretation; PA register blocks those choices                  |
| V versioning        | Non-retroactive snapshots → committed client/link/version terms copied unchanged; no current-offer check; P4-only activation fact                                                     |
| VI people decisions | Human control → responsible recording actor from session, no compensation or discipline automation                                                                                    |
| VII privacy         | Least privilege/audit → no payment method/reference/free text, narrow client status, allow-listed audit, no raw RPC/provider logs; B4 retention remains production gate               |
| VIII design         | DS/gate → full-page review, read-only amount/explicit confirmation, soft semantic badges; unresolved exact interaction/mapping escalated; eight rendered matrix cells required later  |
| IX reliability      | Atomicity/idempotency → bound private receipts, explicit installment and expected ledger revision, one lock order, authorization after waits, outbox fact and audit commit atomically |
| Platform/delivery   | Forward-only changes after latest F11; no cloud/deploy; backup/restore obligations remain; stack selector must fail closed before DB use                                              |
| Workflow            | User-authorized plan artifacts only; tests-first future units, disjoint ownership, architect review plus green exact-head CI; main merge gate remains D-26/docs/08                    |

No constitutional exception is requested. Analyze and independent architect review must confirm this design and the resolved PA items before implementation briefs.

## Phase 0 — Research

The [decision record](research.md) reconciles final spec with installed F11, selects immutable obligation event chains over mutable payment status, specifies receipt binding and lock/revocation behavior, and separates correction from F13 refund. No DB feasibility probe has been run. The selected schema/constraint approach is subject to future stack-B RED→GREEN proof, not an assertion of an existing constraint.

## Phase 1 — Transactions, access, and integration seams

### State and transaction boundaries

- Approve pending → approved (PO/WO), or reconsider rejected → approved (PO only), in one transaction: validate/re-authorize; create initial subscription and obligations; append installment-1 collection; append decision; transition client; append approval fact and receipt; force deferred checks; commit. No schedule means one full-price obligation. A reconsideration uses this same purchase transaction, not an approval-only shortcut. Already-approved clients cannot be reconsidered again.
- Reject pending → rejected (PO/WO): approved reason code, decision, transition, audit and receipt together; no subscription or collection. Reason-code taxonomy remains PA-F12-1.
- Collect: explicit obligation/sequence and expected stream revision, full snapshot amount/currency, confirmed payment, past-or-today Cairo date, collection event, audit and receipt together. PA-F12-2 gates early-payment/order behavior.
- Correct: PO only, explicit active original collection and stream revision; append full reversal with exact negated stored amount and commission, audit and receipt together. The obligation derives unpaid and may later be fully collected again. Original approval/subscription/client state does not change; this is a recording correction, not an F13 refund/cancellation. Booking month remains PA-F12-4.
- Any failed write, deferred check, or audit aborts the entire operation. Return success only after commit; lost-response retries retain the same key and canonical request.

### Serialization and fresh authorization

Use one target order: client → subscription (when present) → obligation → existing ledger rows in sequence. After these waits, lock/read the actor's current staff row and applicable membership in a consistent order and recheck current role/capability/scope in a new statement. Hold authorization locks through commit so revocation has a defined serialization point; do not trust a pre-wait `STABLE` result or JWT role claim. PO needs an existing target workspace despite membership bypass. Replay undergoes the same authorization before any receipt/state disclosure. Operation-key serialization occurs after target locking; keys bind a single target. Cross-target key races fail the unique actor/key constraint and then compare the original binding without disclosing it.

Approval never locks a consumed registration link just to revalidate expiry. It reads the immutable committed association and snapshots. F11 Auth identity, recovery receipts, claims, consumption markers, and signup/admission behavior remain unchanged.

### Active collection integrity

Each obligation has a single immutable event chain: collection → correction reversal → collection. Unique root/revision and unique predecessor-successor relations prevent branching independently of operation keys. Deferred integrity checks enforce contiguous revisions, alternation, exact obligation/subscription/workspace correspondence, and reversal equality. Active collection is the tail when its kind is collection. There is no mutable paid-event pointer or financial-row status update. See [data-model.md](data-model.md).

### App and database walls

Keep staff `authorize()` and DB `has_workspace_access()` checks in all staff reads/actions, with explicit PO/WO approval and PO-only correction/reconsideration restrictions. Remove only Sales `approve_registration` from both matrices; Sales retains `record_payment`. Reuse `record_refund` as the existing PO-only capability check for correction, additionally limiting this RPC to full recording corrections; it does not expose F13 refunds. Role checks are authoritative at both walls.

Do not grant base-table reads or writes to browser roles. Definer readers return column-limited projections with money as strings. Commission has a separate PO/WO reader; ordinary receipt/result projections contain no commission for any role so replay payloads stay identical. Internal functions revoke EXECUTE from PUBLIC/anon/authenticated/service_role, set `search_path=''`, qualify objects, and are postgres-owned. Only the explicit public RPC inventory grants authenticated EXECUTE. No general anonymous or service-role financial operation.

Client access uses a separate app helper and self-status RPC with no target ID parameter. An indexed `auth_user_id = auth.uid()` lookup provides only the current approval state. An internal client-access helper reads that association directly without recursive client RLS. Per-request memoization only; no cross-request cache/JWT state. Poll/refresh an authenticated status surface; no intake UI, staff role, or other client permissions are created. Its temporary presentation is PA-F12-6.

### Approval and activation handoffs

The immutable `registration_approval_events` fact is inserted once with client/workspace/subscription identity and event ID/version in the approval transaction. P2 later consumes it idempotently and owns automatic assignment, selected form version, mandatory Basic/Workout/Nutrition sections and login presentation (REQ-P2-01). Do not enqueue an unhandled generic job that would exhaust retries before P2 exists; P2 can backfill durable facts when its consumer lands. No delivery guarantee is claimed before that consumer exists.

The [handoff contract](contracts/feature-handoffs.md) defines an append-only activation fact keyed by subscription. F12 reserves the storage/projection seam, with no public writer; P4 must append it atomically with initial workout+nutrition delivery and productivity credit. F12 never activates. Installment 1 is collected at approval regardless of its issued offset. For 2+, due dates are NULL/undefined until activation. The intended formula is Cairo activation date plus issued day offset, using 30 days for month one (D-11); PA-F12-3 reconciles non-30 second offsets and PA-F12-8 settles end-of-day semantics. Never silently rewrite an issued schedule.

### Forward migrations and audit preservation

Proposed future files, subject to collision check against the latest merged F11: `20261101120000_registration_approval_model.sql`, `20261101121000_registration_approval_operations.sql`, `20261101122000_payment_operations.sql`, `20261101123000_registration_approval_reads.sql`. Never edit committed migrations. Model migration adds forced RLS/constraints/guards and replaces only the clients `signup_no_update` protection with a narrow approval transition guard; identity/snapshot fields remain immutable and DELETE/TRUNCATE remain blocked.

All audit changes start from the latest complete `audit_row_change()` body, currently `20261031122000_client_accounts_signup.sql`. Preserve workspace, staff, membership, recovery, package/version/offer, issued/opened/consumed link, signup-success and dead-job mappings, no-op handling, unmapped exception and final append. Preserve F11 separately emitted attempt/failure/cleanup evidence. Extend clients UPDATE and add payment INSERT branches; add UPDATE trigger coverage without duplicating INSERT signup audit. The branch inventory and exact allow-lists are reviewed/tested, not regenerated from an older F4/F9/F10 body.

### UI work and the Frontend Design Gate

Future U7/U8 briefs must include [docs/09-frontend-design-gate.md](../../docs/09-frontend-design-gate.md), whose repository evidence-retention rules supersede the older environment brief's temp-only screenshot wording. The environment brief was read for this plan; DESIGN.md, F2 artifacts and implemented tokens remain authoritative. The design-skills catalog was inspected; this unit changes no rendered UI, so skill application and rendered PASS/FAIL evidence are not claimed. Future UI implementers must record each catalog skill's applicability, load applicable skills, and never persist a generated alternative design system.

Dedicated staff review is a full page (DG-F12-2), not a replacement modal flow. Sales uses separate `/payments` list/detail pages gated by `record_payment`, not the PO/WO approval queue/review. Amount is server-derived/read-only, with explicit external-payment confirmation (DG-F12-3). Status badges use existing soft semantic fg/bg/border tokens (DG-F12-4), with mapping/component choice pending PA-F12-5. Reuse Field/Button/Alert/States/ConfirmDialog/Bidi and existing shell/preferences. Do not add colors, layout breakpoints, fonts, navigation tabs or motion on skill authority. Dates must accept any supported historical date, not merely a short calendar range. No editable amount, payment method, reference, rejection free text, form selector, or intake stub.

The future evidence matrix covers Arabic RTL/English LTR × dark/light × mobile 390/desktop 1440, and tablet if layout changes. Cover loading/empty/no-results/error/success/disabled/pending/hover/focus, keyboard names/order/live announcements, axe, mixed-direction exact money/dates, and workspace-brand contrast. Retain CI screenshot artifacts and stable evidence links. PA-F12-5..7/9 block the affected presentation until PO direction.

## Project Structure

### Documentation (this feature)

```text
specs/012-registration-approval/
├── spec.md                         # approved input; unchanged in this unit
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

All PA items are **OPEN — recommendation only, not approved**. They refine missing policy/design; none reopens the decided ND-F12/DG-F12 outcomes.

- **PA-F12-1 — Rejection codes:** A: `payment_not_verified` / `registration_incorrect` / `client_withdrew` (specific, controlled); B: one `registration_rejected` code (simple, weak audit meaning); C: PO supplies another controlled list (delays rejection). Recommend A; no free text.
- **PA-F12-2 — Later-payment timing/order:** A: any explicit unpaid installment, including before activation (flexible); B: only after activation, in sequence, early before due allowed (predictable); C: only due installments in sequence (strict). Recommend B; no unapproved timing gate is implemented meanwhile.
- **PA-F12-3 — Existing second offsets other than 30:** A: honor their issued offsets (conflicts with fixed month-one wording); B: normalize to 30 at approval (changes issued terms); C: hold affected approvals for explicit PO reconciliation without changing snapshots (blocks those sales). Recommend C pending reconciliation; F10 permits arbitrary nonnegative increasing offsets.
- **PA-F12-4 — Correction reporting month:** A: reverse in the original collection month (restates erroneous history); B: book in the correction month (preserves closed-period totals); C: store both and defer net reporting rules (more ambiguity). Recommend A for recording corrections; F13 cash-refund policy remains separate.
- **PA-F12-5 — Badge presentation:** A: feature badge using existing warning/pending, success/approved, error/rejected semantic tokens (minimal scope); B: PO-approved shared Badge addition (wider DS change); C: existing text/Alert presentation only (less compact). Recommend A; no new token values.
- **PA-F12-6 — Status presentation before P2:** A: narrow status page with neutral approved/pending/rejected wording and refresh (clear, no intake); B: existing login completion feedback only (poor live visibility); C: wait for P2 UI (blocks the F12 live-status journey). Recommend A; exact bilingual copy requires review, no form placeholder.
- **PA-F12-7 — Staff navigation:** A: links from existing authorized landing only (no new role tabs); B: approve role-specific rail/bottom navigation placement (broader design); C: direct URL only until navigation design (low discovery). Recommend A; DESIGN.md §11 leaves PO/WO/Sales tabs unresolved.
- **PA-F12-8 — Due-day boundary:** A: Cairo activation date + 30 days, payable through that date's end (date-based month one); B: exact activation instant + 720 hours (DST-sensitive local time); C: PO defines another 30-day cutoff (blocks P4 due projection). Recommend A; no calendar-month substitution.
- **PA-F12-9 — Uncertain network outcome:** A: retain canonical request/key with explicit retry and pending warning (safe replay, clear recovery); B: refresh status/ledger before offering retry (extra step); C: return to queue with generic warning (weaker context). Recommend A; never automatically issue a new key or claim payment failure/success without evidence.

Open dependencies, with no additional product decision inferred:

- **DEP-F12-1 — F11 PR #14:** Reconcile and merge its final reviewed/green head into F12 under D-26 before implementation. The planned-against SHA above remains evidence, not a claim that F11 is merged to main.
- **DEP-F12-2 — P4 activation:** P4 must implement the atomic plan-pair activation writer and verify the handoff. F12 can ship undefined later due dates; it cannot claim activation/overdue readiness.
- **DEP-F12-3 / AI-F12-1 — Stack-B integration (architect item):** A: after `infra-second-stack` lands, merge updated main into F12 and reconcile harness/e2e selectors (recommended, one source); B: reviewed direct feature merge after green exact-head CI (earlier, larger integration risk); C: wait for stack A release (blocks F12 DB work and requires a new brief). This brief authorizes no infrastructure merge or provisioning. Select B only through the landed selector/harness, project `lifter-stack-b`, ports 25420–25429, and an owned B lock; no fallback to A.
- **DEP-F12-4 — P2 / REQ-P2-01:** Consumer and Trainer form-selection capability belong to P2. F12 approval facts must survive until P2 can consume/backfill them.
- **DEP-F12-5 — Production:** Correction reversal must be operational before real financial use; B4 retention, F11 hosted compatibility, backup/restore and other readiness gates remain. No deployment is authorized.
