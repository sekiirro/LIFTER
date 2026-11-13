# Implementation Plan: F13 — Freeze, renewal, refunds and expiry

**Branch**: `013-freeze-renewal-refunds` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Plan status**: Plan APPROVED by PO 2026-10-29 (session 13).

**Input**: Feature specification from `specs/013-freeze-renewal-refunds/spec.md`

## Summary

Implement F13 as a forward-only extension of F12's immutable subscription and payment model. Preserve Cairo-day freeze and renewal projections, serialize same-client lifecycle and financial writes, and model partial refunds as append-only allocations under a capped aggregate operation. The first refund transaction atomically records client deactivation and one durable idempotent Auth-lockout outbox row. A synchronous Custom Access Token Postgres hook checks the committed deactivation fact before every token issuance, blocking sign-in and refresh without a commit-to-worker issuance window. App/RPC access helpers deny deactivated clients. A server-side worker retains the supported Auth Admin ban with retry/backoff and records success. After the approved threshold, it records one durable, deduplicated, audited PO/WO alert; delivery/rendering are deferred to Notifications. Existing JWTs may remain valid until natural expiry. Never write Auth-managed tables directly.

**Historical S22-PO-5 implementation seam (superseded where incompatible by S43-PO-5):** Existing code records a renewal activation at recording and has successor-lineage/reflow guards. Treat these as implementation inventory only. Current product rules use one continuous subscription; active/expired renewal, frozen-operation refusal, freeze extension, and upgrade/point rules are defined by FR-037..042 and architect mapping (S43-R6/R7/R8). The existing installment recording-date anchor remains only where compatible.

Supabase allows one `custom_access_token` hook per project; all future claim customization must compose into this function, whose unchanged-claims behavior is covered for staff and active clients. Hook errors fail token issuance closed. Hosted Supabase requires enabling the hook in project dashboard settings and verifying it on a non-production hosted project before production; production enablement is a change requiring PO approval.

## Technical Context

**Language/Version**: TypeScript, Next.js and PostgreSQL/Supabase as established by the repository.
**Primary Dependencies**: Existing date/time zone library, Supabase Auth, F12 subscription/payment operations, existing capability and audit systems.
**Storage**: PostgreSQL/Supabase; immutable tenant rows and private operation receipts.
**Testing**: Existing Vitest unit/contract suites and isolated Supabase integration tests; F13 requires a verified isolated stack before DB tests.
**Target Platform**: Cloudflare-hosted Next.js with Supabase; no production activity in this plan.
**Project Type**: Web application with server operations and database migrations.
**Performance Goals**: No new numeric latency target. Keep per-client lock scope bounded and avoid cross-client serialization.
**Constraints**: Cairo calendar boundaries, integer minor-unit arithmetic, forward-only migrations, immutable financial/audit facts, no payment gateway, transaction-safe idempotency, tenant isolation, and PO approval before implementation.
**Scale/Scope**: Freeze lifecycle, renewals, entitlement/expiry projection, PO refunds, F12 capability parity, audit and required integration seams; no client UI or P4/P5 engine.

## Constitution Check

- **I, workspace isolation**: pass by design; every tenant relation uses workspace-scoped composite keys, server authorization plus forced RLS, with foreign-workspace tests.
- **II, immutable financial truth**: pass subject to F13's approved partial-refund decisions; append allocations/cancellation facts and preserve F12 correction semantics.
- **III, least privilege**: pass; PO refund authority is explicit, existing role grants are preserved, and TS/SQL parity is checked bidirectionally.
- **IV, approved scope**: pass; no gateway, new policy, client UI, P4 notices/enforcement or P5 check-in engine.
- **V, versioned content**: pass; purchase snapshots and issued obligations are not rewritten.
- **VI, human-governed decisions**: pass; no automatic compensation or discipline.
- **VII, privacy**: pass; narrow audit fields, no PII/secrets/free text in logs; legal/technical retention is a pre-production blocker.
- **VIII, bilingual accessible UI**: no rendered UI is planned. Any later UI unit must follow the repository's [Frontend Design Gate](../../docs/09-frontend-design-gate.md) and [DESIGN.md](../../DESIGN.md).
- **IX, reliable operations**: pass subject to proving the PO-1 transaction boundary and F12 lock/replay contract before dependent implementation.

No constitutional exception is requested. Recheck after design: no exception; Auth atomicity and F12 U4 remain blocking gates for dependent units.

## Project Structure

```text
specs/013-freeze-renewal-refunds/{plan,research,data-model,quickstart,tasks}.md
specs/013-freeze-renewal-refunds/contracts/*.md
lib/auth/capabilities.ts
lib/subscriptions/**
lib/payments/**
lib/time/**
supabase/migrations/<timestamp-after-all-F12-and-F14-migrations>_f13_*.sql
tests/unit/**
tests/contract/**
tests/integration/**
```

**Structure Decision**: Extend existing application modules and F12 database seams. Exact migration names/timestamps and function bodies are selected only after F12 U4 and all F12/F14 migrations are integrated.

## Complexity Tracking

| Violation                                                               | Why Needed                                                                                                  | Simpler Alternative Rejected Because                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Separate refund allocation event subtype and refund-operation aggregate | Supports multiple partial refunds while retaining exact F12 correction-chain uniqueness and cumulative caps | Reusing one-reversal-per-collection would make legitimate partials impossible or conflate corrections with refunds |
| Cross-cutting client/subscription/obligation/ledger lock sequence       | Deactivation is client-wide while balances and renewals are purchase-specific                               | Narrow independent locks could deadlock or permit concurrent over-refund/activation                                |

## S43-PO-5/6 decision encoding (2026-11-10)

PO source wording is preserved byte-exact in spec.md under Clarifications / PO-decision register. Architect interpretation is separately labelled **architect mapping (S43-R6/R7/R8)**.

**architect mapping (S43-R6/R7/R8/R9):** Execute FR-037..042 and SC-015..034: same-row continuity; refuse renewal before initial activation with no writes or queued duration; eligible upgrade price and term rules; active/expired renewal arithmetic; freeze extension and frozen-operation refusal; pre-activation versus expired upgrade; full-package refund basis; original-package-only credit after renewal then upgrade, including when an earlier upgrade occurred; renewal duration preservation; and one point per new client. S43-PO-6 resolves S43-F13-MCQ-7..11. S43-PO-8 resolves tier structure, post-lapse renewal-start anchor, and same-currency-only eligibility. S45-PO-2 resolves S45-F13-MCQ-1. Implementation and tests remain unstarted.

Plan slices: (1) same-row renewal and upgrade with immutable operation facts, revision checks, exact replay, stale-request refusal, and renewal-before-initial-activation refusal with zero writes/no queued duration; (2) full-credit upgrade price/term branches with equal/lower boundaries and all PO-6 resolved anchors; (3) active and expired renewal, frozen refusal, and freeze-day expiry extension; (4) full-package refund semantics, renewal-then-upgrade payment/duration preservation, and additional-payment-only revenue; (5) Platform Owner date edits with audit/no revenue; (6) new-client point uniqueness and unlimited plan publications. No task is complete by this documentation amendment.

**Code/test/migration inventory (Sol-6; implementation scope):** inspect the effective renewal/entitlement seams through migration `20261103130700`: `lib/subscriptions/entitlement.ts`, `lib/subscriptions/renewal-service.ts`, `lib/subscriptions/renewal-dates.ts`; entitlement unit/integration tests; renewal service/projection/integration tests; migration `20261103127000`, the body at `20261103130000:48-169`, replacement writers `20261103130300` through `20261103130700` including `20261103130500`, plus renewal package-lookup tests. Refund seams: `lib/payments/refund-service.ts`, migrations `20261103125000` and `20261103128000`, refund service/operations/race tests. Freeze seams: `lib/subscriptions/freeze-service.ts`, `lib/subscriptions/freeze-dates.ts`, freeze lifecycle unit/integration tests. Forward-replacement tasks must identify effective readers/writers and cover clean fresh replay plus upgrade replay; do not treat historical chained-renewal writers as current behavior. Read-only search found no upgrade writer/test path and no points writer/test path.

**architect mapping (S43-R8):** Activation is recorded once; renewal and upgrade append lifecycle/ledger events without new activation rows. New writes do not use activation_source = 'renewal'. No migration is authored in this lane.

- **Upgrade execution (T042):** preserve the existing one-subscription writer and projection readers; compute the upgraded service boundary from current effective date state and carry only unconsumed event-stream renewal/freeze extension; use the original subscription commission rate for additional upgrade revenue. Add unit/integration coverage for upgrade-after-renewal, counted-freeze-then-upgrade, partial extension consumption, and ledger commission source. No historical migration rewrite or data migration is authorized.

## S51 settled-only upgrade execution (T048)

S51-PO-1 supersedes S50-PO-6 F13=C. T048 implements an upgrade only when all existing installments are settled and no payment is pending/in flight; the check follows subscription/obligation lock acquisition. The full price difference is collected upfront before activation, and the upgrade creates no installments or schedule. Preserve financial history and the single subscription; write one upgrade-linked audit fact with bounded non-PII IDs/amount/currency. Platform Owner commission uses the original stored `commission_rate_bp` on actual collection only; trainers receive none. Reject an unreachable over-balance condition before writes. S51-PO-2 resolves required successful receipt fields (operation/upgrade IDs, package/version, full price difference, currency, effective dates) and excludes commission rate/amount; commission remains stored on the upgrade row. S51-PO-5 resolves MCQ-11: retain the six existing compatibility receipt fields. Pre-change operation replays return their stored receipts unchanged. S51-F13-MCQ-12 is resolved B by S51-PO-9 as mapped by S51-R3/S52-R3; no independent renewal refund selection exists.

## S52 projection and payment queue clarifications

S51-PO-9 as mapped by S51-R3/S52-R3 resolves S51-F13-MCQ-12=B; there is no independent renewal refund selection. S52-PO-3/4 and S52-R5/R8/R9 resolve the projection and queue item shape: post-upgrade removal subtracts only unconsumed freeze contribution, leaves elapsed coverage consumed, recomputes later renewal boundaries, and preserves history; queue totals are a currency-sorted array of `{currency, unpaid_minor}` string amounts. S52-PO-7 `MCQ17B`, mapped by S52-R20, resolves pagination scope: totals cover all unpaid obligations matching workspace queue filters independent of page/cursor/page size, so unchanged queue data yields the same totals on each page.

- **T049 [U-upgrade-freeze-removal]** Add RED/GREEN integration coverage and a forward migration so post-upgrade removal subtracts only unconsumed freeze contribution, keeps elapsed coverage consumed, recomputes later renewal boundaries, and preserves append-only freeze/upgrade/audit facts and existing function hardening. **FR-039; SC-037.**
- **T050 [U-currency-queue-totals]** Add per-currency unpaid totals across all workspace queue obligations matching existing filters, independent of cursor/page size; return the same sorted `{currency, unpaid_minor}` decimal-string entries on every page, keep obligations currency-tagged, and verify no cross-currency sum. **FR-044; SC-038.** S52-PO-7 MCQ-17=B; architect mapping S52-R20.
