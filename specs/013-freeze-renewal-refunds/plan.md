# Implementation Plan: F13 — Freeze, renewal, refunds and expiry

**Branch**: `013-freeze-renewal-refunds` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Plan status**: Plan APPROVED by PO 2026-10-29 (session 13).

**Input**: Feature specification from `specs/013-freeze-renewal-refunds/spec.md`

## Summary

Implement F13 as a forward-only extension of F12's immutable subscription and payment model. Preserve Cairo-day freeze and renewal projections, serialize same-client lifecycle and financial writes, and model partial refunds as append-only allocations under a capped aggregate operation. The first refund transaction atomically records client deactivation and one durable idempotent Auth-lockout outbox row. A synchronous Custom Access Token Postgres hook checks the committed deactivation fact before every token issuance, blocking sign-in and refresh without a commit-to-worker issuance window. App/RPC access helpers deny deactivated clients. A server-side worker retains the supported Auth Admin ban with retry/backoff and records success. After the approved threshold, it records one durable, deduplicated, audited PO/WO alert; delivery/rendering are deferred to Notifications. Existing JWTs may remain valid until natural expiry. Never write Auth-managed tables directly.

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
- **VIII, bilingual accessible UI**: no rendered UI is planned. Any later UI unit must append `C:/Users/NEW LAP/.lifter/briefs/frontend-design-gate.txt` to its brief and follow `DESIGN.md`.
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

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Separate refund allocation event subtype and refund-operation aggregate | Supports multiple partial refunds while retaining exact F12 correction-chain uniqueness and cumulative caps | Reusing one-reversal-per-collection would make legitimate partials impossible or conflate corrections with refunds |
| Cross-cutting client/subscription/obligation/ledger lock sequence | Deactivation is client-wide while balances and renewals are purchase-specific | Narrow independent locks could deadlock or permit concurrent over-refund/activation |
