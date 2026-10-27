# Implementation Plan: Packages & Package Versions (P1-F9)

**Branch**: `009-packages` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)
**Input**: Binding architect/reviewer design supplied by Claude; BRD 30/40–41/53–54/102/196/317, D-09/D-10/D-11/D-13/D-17, Constitution v1.1.0. This run produces artifacts only; implementation and independent review remain pending.

## Summary

F9 gives PO a canonical package catalog and workspace-specific duration offers with immutable numbered terms. One forward migration adds three tables, hardened mutation RPCs, a safe staff projection, a narrow PO/WO commission reader and audit extensions. Shared pure validation/money formatting and JWT-backed actions support a PO-only `/packages` page linked from the signed-in landing. All catalog/financial values are explicitly authored data; no seed/default catalog is approved. F10 tokens and F12 subscriptions will reference version ids and snapshot terms; their implementation is excluded.

## Technical Context

- **Language/Version**: TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1, as pinned in `package.json`.
- **Primary Dependencies**: Existing supabase-js 2.118.0, supabase/ssr 0.12.7, server-only 0.0.1, Design System/i18n. No new dependencies or lockfile changes.
- **Storage**: Local Supabase Postgres 17, CLI 2.122.0; one additive forward migration `20261029120000_packages.sql`; user JWT for app calls.
- **Testing**: Vitest 5.0.5 unit/local integration; existing postgres harness; Playwright 1.64.1 and axe 4.14.0; extend existing RLS-catalog/matrix parity.
- **Target Platform / Project Type**: Existing Next web app on Cloudflare Workers/OpenNext; local builds/dry runs only. No new service or public API server.
- **Performance Goals**: Serialize conflicting offer publications using indexed natural keys; unrelated offers have no intentional shared lock. No invented latency/capacity SLA; pilot volumes remain ND-F8-1.
- **Constraints**: Exact bigint money transport, no console, deny by default, immutable versions for all DML roles, no browser Supabase/admin imports, $0 hosting direction unchanged.
- **Scale/Scope**: Three tables, one invoker-safe view, three mutation RPCs and one narrow commission reader, one PO management screen and landing link. Only synthetic local fixtures.

## Constitution Check

Gate before research, rechecked after design against v1.1.0:

| Principle / gate      | Status and evidence                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I — Isolation         | PASS in design: workspace-composite relations plus same-offer pointer FK; server actor/capability and DB authorization; every RPC/read path has own/foreign negatives. Canonical packages are platform-owned. |
| II — Financial truth  | PASS: positive bigint minor units + currency, explicit basis points, duration snapshots and exact string transport. D-13/D-17 remain F10/F12 contracts.                                                       |
| III — PO governance   | PASS: reuse PO-only set_package_pricing; WO rates in scope; Sales/Trainer rates denied. No unapproved capability change.                                                                                      |
| IV — Scope            | PASS: BRD catalog/availability/terms only; no YBS values, seed catalog, gateway or other finance flow; ND-F9-3 remains NEEDS SOURCE CONFIRMATION.                                                             |
| V — Versioning        | PASS: UPDATE/DELETE/TRUNCATE guards even for service_role/postgres DML; restrictive references; changes append.                                                                                               |
| VI — Human governance | PASS: explicit PO actions only; no automated people/payroll decisions.                                                                                                                                        |
| VII — Privacy/audit   | PASS: business-field allow-lists, exactly one event per actual change, no PII/labels/provider logging; existing audit RLS retained.                                                                           |
| VIII — UI             | PASS: Design System, Arabic-first RTL/EN LTR, dark/light, responsive keyboard controls, confirmation and required states. Authored content preserved.                                                         |
| IX — Reliability      | PASS: advisory lock before first offer, row lock, exact-payload replay, atomic pointer/audit and 30-day presets. Fixed-signature replay limitation explicit.                                                  |
| Platform/delivery     | PASS: forward-only migration, local Docker under D-20, existing backup/production gates unchanged; no deployment/cloud migration/YBS access.                                                                  |
| Workflow              | PASS for artifact scope: supplied Claude decisions transcribed through Spec → Plan → Tasks → Analyze; future Codex implementation and independent Claude review are separate.                                 |

**Post-design re-check**: no constitutional exception. Document validation does not approve implementation or production. Five policy NDs remain open; technical interpretations in research R4/R5/R9 remain visible for review.

## Design

Normative details: [data-model.md](data-model.md), [contract](contracts/packages-surface.md). Rationale: [research.md](research.md) R1–R10. Verification: [quickstart.md](quickstart.md).

### Database transactions and reads

Publication checks signed PO/pricing authority, validates, locks workspace/package/day key, creates or locks the offer, checks fixed duration representation and exact historical payload equality, then returns an existing id unchanged or inserts N+1 and advances current atomically. New offers start unavailable; publication never changes availability on an existing offer. Availability RPC locks the offer and no-ops same-state requests. Code creation deduplicates in the DB.

Version guards are independent of RLS/grants and contain no privileged exception. Insert guard checks duration snapshot parity. Composite FKs prevent tenant mismatch and a triple FK prevents a wrong-offer current pointer in the same workspace. Audit AFTER triggers extend the latest complete body; pointer maintenance/offer insert do not duplicate publication events.

All three tables force RLS. Column grants plus a security-invoker safe view exclude commission. The safe view casts price_minor to text for exact JavaScript transport. PO/WO get rates through a role/workspace-checked definer RPC because every staff role shares PostgreSQL authenticated. No full version SELECT grant or admin-key application path.

### Application and UI

Pure validation mirrors database constraints. Money stays decimal integer strings/bigints; currency-aware display uses exact arithmetic and raw-minor-unit fallback when metadata is unknown. Actions re-derive actor, check `authorize(actor,'set_package_pricing',ws)`, call session RPCs, map generic results and revalidate only on success. Read helpers check registration-link capability and role-gate rates.

`/packages` checks PO before data reads. Workspace selector, code creation, offers table, publication form and ConfirmDialog toggles reuse existing primitives/translations. Page loading/error states reveal no protected data before authorization. Login/public-state markup receives AR/EN axe checks; full authenticated states run with local fixtures. Final PO navigation stays undecided: PO landing link only.

### Validation phases

Foundation establishes schema/grants/guards. US1 tests canonical identity, publication, concurrency and history; US2 availability; US3 scoped reads/rate secrecy; US4 management access/UI. Catalog/parity/log gates and independent reviewer mutation checks finish the work. Every FR/SC is mapped in [tasks.md](tasks.md#analyze).

## NEEDS DECISION

- ND-F9-1: allowed currencies; format-only validation meanwhile.
- ND-F9-2: custom-duration policy bounds; ≥1 day only meanwhile.
- ND-F9-3: actual tier/duration catalog, names/prices/rates — NEEDS SOURCE CONFIRMATION; entered by PO.
- ND-F9-4: Sales/Trainer commission access; denied meanwhile.
- ND-F9-5: final PO navigation/F2 ND-5; landing link only meanwhile.

These do not block local work. Existing [production readiness](../../docs/07-production-readiness.md) gates remain open. Fixtures do not settle policy.

## Project Structure

### Documentation (this run)

```text
specs/009-packages/
├── spec.md
├── checklists/requirements.md
├── research.md
├── data-model.md
├── contracts/packages-surface.md
├── quickstart.md
├── plan.md
└── tasks.md
```

### Source code (future implementation)

```text
supabase/migrations/20261029120000_packages.sql
lib/packages/{validation,money,results,service,read}.ts
app/(app)/page.tsx
app/(app)/packages/
├── page.tsx
├── actions.ts
├── PackagesManager.tsx
├── loading.tsx
├── error.tsx
└── packages.module.css
lib/i18n/messages/{ar,en}.ts
eslint.config.mjs
tests/unit/packages-{validation,money,actions,read,page}.test.ts
tests/integration/
├── packages-fixture.ts
├── packages-publish.test.ts
├── packages-availability.test.ts
├── packages-reads.test.ts
├── rls-catalog.test.ts
└── matrix-parity.test.ts
tests/e2e/packages.spec.ts
```

**Structure Decision**: Extend the existing app/harness; separate pure library from server-only orchestration. Reuse components/ui, auth and Supabase modules without new dependencies or services. Fixture helper imports existing harness and never produces production seed data.

## Complexity Tracking

No Constitution violation or exemption. Safe view plus narrow commission RPC is required by shared SQL-role grants; a full-table grant leaks rates. Same-offer composite FK prevents a pointer bug the workspace pair alone permits. Replay identity, initial unavailability and duration representation are explicit technical interpretations, not policy resolutions.
