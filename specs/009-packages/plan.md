# Implementation Plan: Packages & Package Versions (P1-F9)

**Branch**: `speckit-009-markets` | **Created**: 2026-10-27 | **S31 Update**: 2026-11-04 | **Spec**: [spec.md](spec.md)
**Input**: Binding architect/reviewer design supplied by Claude; BRD 30/40–41/53–54/102/196/317, D-09/D-10/D-11/D-13/D-17, Constitution v1.4.0, and S31-PO-4/S31-PO-5. This run produces artifacts only; implementation and independent review remain pending.

## Summary

F9 gives PO a canonical package catalog, four immutable market/type category identities per workspace, and workspace-specific duration offers with immutable numbered commercial terms. The shipped implementation is PR #9 merge `b565d4c` (implementation tip `b359985`): three tables, hardened mutation RPCs, a safe staff projection, a narrow PO/WO commission reader, audit extensions, shared pure validation/money formatting, JWT-backed actions and a PO-only `/packages` page.

The S31 amendment adds an explicit workspace-package market (`Egypt | International`), type
(`Year-round | Promotional`), a market-conditional currency set (Egypt = EGP only; International =
EGP/USD/SAR), no package-price conversion/cross-currency totals, and four fixed category identities per workspace.
Platform Owner remains the only package creator/pricer; WO/Sales/Trainer remain denied,
and Sales/Trainer commission remains denied. The implementation delta is additive: a new forward
migration plus versioned application/read/UI contracts. The shipped F9 migration and every existing
package-version term remain immutable. S33-PO-6 and S34-PO-1 settle classification, conversion,
promotional behavior, dashboard semantics and downstream currency interpretation. S34-PO-2 approves
only Egypt, International, Promotional and Year-Round as English market/type labels. Category persistence
identity remains blocked by PD-S34-NEW-01; all other dashboard/Installments/empty/error/help copy remains
BLOCKED-COPY.

## Technical Context

- **Language/Version**: TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1, as pinned in `package.json`.
- **Primary Dependencies**: Existing supabase-js 2.118.0, supabase/ssr 0.12.7, server-only 0.0.1, Design System/i18n. No new dependencies or lockfile changes.
- **Storage**: Existing Supabase Postgres 17, CLI 2.122.0. The S31 delta adds one new forward migration, provisionally `supabase/migrations/20261106125000_f9_package_markets_types_currency.sql`; it never edits shipped `20261029120000_packages.sql`. User JWT for app calls.
- **Testing**: Existing Vitest 5.0.5 unit/local integration, postgres harness, Playwright 1.64.1 and axe 4.14.0, RLS-catalog/matrix parity and mutation checks. New work is RED-first unit/integration/e2e and permission/RLS mutation coverage.
- **Target Platform / Project Type**: Existing Next web app on Cloudflare Workers/OpenNext; local builds/dry runs only. No new service or public API server.
- **Performance Goals**: Preserve indexed offer serialization and current-version replay. Exactly four category identities; no invented latency/capacity SLA; pilot volumes remain ND-F8-1.
- **Constraints**: Exact bigint money transport; market-conditional currency; package prices remain in own currency; reporting-only S33-PO-6 FX conversion; no cross-currency totals; no console; deny by default; immutable versions for all DML roles; no browser Supabase/admin imports; no unreviewed copy; $0 hosting direction unchanged.
- **Scale/Scope**: Existing package schema and PO screen. S34 specifies four immutable category pairs per workspace, reporting/installment requirements, and safe removal of synthetic mocks. Only synthetic local fixtures.

## Constitution Check

Gate before research, rechecked after design against Constitution v1.4.0 and the S31 PO decisions:

| Principle / gate      | Status and evidence                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I — Isolation         | PASS in design: workspace-composite relations plus same-offer pointer FK; server actor/capability and DB authorization; every RPC/read path has own/foreign negatives. Canonical packages are platform-owned. |
| II — Financial truth  | PASS in design: positive bigint minor units + own currency, explicit basis points, duration snapshots and exact string transport. S31 adds a market-conditional currency matrix and forbids conversion/cross-currency totals. D-13/D-17 remain F10/F12 contracts. |
| III — PO governance   | PASS: reuse PO-only set_package_pricing; WO rates in scope; Sales/Trainer rates denied. S31-PO-5 explicitly keeps package creation/naming/pricing PO-only. No unapproved capability change.             |
| IV — Scope            | PASS: BRD catalog/availability/terms only; no YBS values, seed catalog, gateway or other finance flow; ND-F9-3 remains NEEDS SOURCE CONFIRMATION.                                                             |
| V — Versioning        | PASS: UPDATE/DELETE/TRUNCATE guards even for service_role/postgres DML; restrictive references; changes append. S31 is a new forward migration and cannot rewrite existing package versions.          |
| VI — Human governance | PASS: explicit PO actions only; no automated people/payroll decisions.                                                                                                                                        |
| VII — Privacy/audit   | PASS: business-field allow-lists, exactly one event per actual change, no PII/labels/provider logging; existing audit RLS retained.                                                                           |
| VIII — UI             | PASS in design: Design System, Arabic-first RTL/EN LTR, dark/light, responsive keyboard controls, confirmation and required states. Authored content preserved; market/type copy awaits PO approval and Frontend Design Gate. |
| IX — Reliability      | PASS: advisory lock before first offer, row lock, exact current-payload replay; older-term revert appends N+1, atomic pointer/audit and 30-day presets. Fixed-signature replay limitation explicit.                                                  |
| Platform/delivery     | PASS: forward-only migration, local Docker under D-20, existing backup/production gates unchanged; no deployment/cloud migration/YBS access.                                                                  |
| Workflow              | PASS for artifact scope: S31 decisions transcribed through Specify → Clarify → Plan → Tasks → Analyze; future delegated implementation and independent architect review are separate. Implementation is blocked by the listed PO gates. |

**Post-design re-check**: no constitutional exception. Document validation does not approve
implementation or production. S33-PO-6, S34-PO-1 and S34-PO-2 settle the recorded product choices and four label pairs. PD-S34-NEW-01 blocks category persistence identity and dependent tasks T042/T055/T066. Other dashboard/Installments/empty/error/help copy remains BLOCKED-COPY. Technical implementation and production gates remain mandatory.

## S31 shipped-baseline delta (2026-11-04)

### Evidence read from current `main`

| Surface | Shipped behavior | S31 delta |
|---|---|---|
| `public.packages` | Global immutable canonical code | Keep identity historically recoverable; commercial edits follow FR-021/FR-029 and S33-11. |
| `public.package_offers` | Workspace/category/duration offer; availability + current version | Exactly four immutable category pairs per workspace; market/type snapshots follow S33-11. |
| `public.package_versions` | Immutable AR/EN terms, `price_minor`, `currency`, commission and duration | Keep every existing version's identifier and stored price/currency/commission/duration terms unchanged (SC-011). Currency remains version-owned. Add no historical backfill. |
| `publish_package_version(...)` | PO-only; accepts any format-valid three-letter currency; no market/type input | Add approved market/type inputs at the selected owner and enforce the market/currency matrix in both validation walls. Preserve replay/concurrency semantics. |
| `package_versions_safe` / app reads | Returns each version's own price and currency | Add approved market/type projections if they belong to an existing immutable/read surface; never calculate or join a converted amount. |
| `/packages` | PO-only publish form and one price per offer row | Add approved market/type controls and own-currency display; labels come only from the PO-approved copy record. |
| F10/F12 | Registration links copy package price/currency; subscriptions/installments/payments/refunds preserve snapshots | S33-PO-6 governs reporting-only FX and settlement remains separate; no package price conversion. |

### Forward-only design boundary

1. **New migration only.** Create
   `supabase/migrations/20261106125000_f9_package_markets_types_currency.sql`; never edit
   `20261029120000_packages.sql` or any later shipped migration. Add schema/constraints/RPC
   replacements in that new file.
2. **C5 mock disposition.** Verify synthetic-only status and enumerate all target-stack dependencies
   (FKs, registration links, subscriptions, payments, audit rows and all other refs). Any
   non-synthetic row, required financial/audit dependency or unknown state refuses/escalates with
   zero writes. After a clean preflight, obsolete mocks may be deleted and four empty categories
   initialized. Preserve required client, financial and audit history; assign no inferred values.
3. **PO-only mutation wall.** Market/type/currency publication remains behind the existing PO
   `set_package_pricing` capability in the app and signed-identity DB checks. WO/Sales/Trainer cannot
   create, name, price or control packages in any workspace.
4. **Market/currency invariant.** Egypt accepts only EGP; International accepts EGP/USD/SAR. Every
   other currency is invalid even when it matches the former three-letter format check. Currency is
   never inferred from market or market inferred from currency.
5. **Reporting conversion exception.** Package prices remain in own currency; transaction-date FX
   to EGP is limited to approved collection/commission reporting. No package-price conversion or
   cross-currency total is added.
6. **Fixed categories.** Exactly four immutable market/type pairs exist per workspace; both markets
   may operate simultaneously. This supersedes the S31 unlimited-package interpretation.
7. **Arabic/UI gate.** Use exactly «مصر» / «دولي» / «وقت العـروض» / «طول السنـة» for market/type.
   The four mapped English/Arabic market/type labels are approved; other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY. The future UI must pass the Frontend Design Gate (AR-RTL/EN-LTR × light/dark ×
   mobile/desktop, required states and accessibility).

### Historical S32 PO gates and current disposition

| Historical gate | Current decision/status | Work that remains open or may proceed |
|---|---|---|
| SK-009-05 legacy classification | C5 supersedes mapping for existing mocks; no legacy classification/default is applied. | T064 verifies synthetic-only status and all dependencies before deletion; no writes on unsafe/unknown state. |
| SK-009-06 owner/mutability | C1 fixes market/type immutability; physical category identity remains BLOCKED by PD-S34-NEW-01; no option is selected. | Currency/no-conversion/role test design and evidence can proceed independently. |
| SK-009-07 promotional behavior | S33-PO-6 settles Africa/Cairo half-open periods, expiry blocks new links only, and issued links retain snapshots. | Implementation tests remain future RED-first work. |
| SK-009-08 bilingual copy | LABELS and S34-PO-2 approve the four exact English/Arabic market/type label pairs. | Other dashboard/Installments/empty/error/help copy remains BLOCKED-COPY. |
| SK-009-09 downstream currency | S33-PO-6/C4 settle reporting and separate settlement/accounting records; this F9 delta changes no F10/F12 schema. | Any later downstream currency change needs its applicable PO decision and feature contract. |

**Implementation readiness**: S33-PO-6, S34-PO-1 and S34-PO-2 settle the recorded product choices and four English/Arabic label pairs. PD-S34-NEW-01 remains pending for category persistence identity; dependent work is blocked. Other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY. Future implementation must pass the C5 preflight, RED-first tests, fresh Analyze, design and security reviews.

## S34-PO-1 / S33-PO-6 plan delta (specification only)

- Each workspace has exactly four immutable market × type category identities: Egypt × Year-Round, Egypt × Promotional, International × Year-Round, International × Promotional. Both markets may operate concurrently.
- Only the PO configures workspace-specific names, prices, and package-specific commissions. Commercial edits append immutable versions; client/assignment snapshots remain unchanged. Market/type cannot be changed; WOs cannot configure terms.
- Promotional categories are available only within approved Africa/Cairo start-inclusive/end-exclusive periods. Expiry stops new links; already-issued links retain snapshots.
- C5 starts with a read-only target-stack preflight verifying synthetic-only status and enumerating FKs, registration links, subscriptions, payments, audit rows and every other package dependency. Non-synthetic data, required financial/audit dependencies or unknown state refuse/escalate before writes. After a complete clean preflight, safely delete obsolete mock packages while preserving required client, financial and audit history; do not accept partial completion. Four-category initialization remains BLOCKED by PD-S34-NEW-01 until persistence identity is decided; initialize without names, prices or commissions, and PO configures real packages manually.
- Dashboard reporting means actual monthly collections and package-specific commission with installment detail; settlement/accounting events stay separate. FX follows settled S33-PO-6 semantics; commission is PO/WO-only.
- Installments requires due date, paid amount and remaining amount. The four English/Arabic market/type label pairs are approved by LABELS and S34-PO-2; all other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY.
- Future tasks are RED-first, preserve S32-R1 all-origin-reference uniqueness, create forward migrations only, never edit pushed migrations, and include Frontend Design Gate plus independent security review of mock deletion.

## Design

Normative details: [data-model.md](data-model.md), [contract](contracts/packages-surface.md). Rationale: [research.md](research.md) R1–R14. Verification: [quickstart.md](quickstart.md).

### Database transactions and reads

Publication checks signed PO/pricing authority, validates, locks workspace/package/day key, creates or locks the offer, checks fixed duration representation and exact current-version payload equality, then returns current id unchanged or inserts N+1 and advances current atomically. New offers start unavailable; publication never changes availability on an existing offer. Availability RPC locks the offer and no-ops same-state requests. Code creation deduplicates in the DB.

Version guards are independent of RLS/grants and contain no privileged exception. Insert guard checks duration snapshot parity. Composite FKs prevent tenant mismatch and a triple FK prevents a wrong-offer current pointer in the same workspace. Audit AFTER triggers extend the latest complete body; pointer maintenance/offer insert do not duplicate publication events.

All three tables force RLS. Column grants plus a security-invoker safe view exclude commission. The safe view casts price_minor to text for exact JavaScript transport. PO/WO get rates through a role/workspace-checked definer RPC because every staff role shares PostgreSQL authenticated. No full version SELECT grant or admin-key application path.

### Application and UI

Pure validation mirrors database constraints. Money stays decimal integer strings/bigints; under S31
only EGP/USD/SAR can enter a package version and currency-aware display uses exact arithmetic in the
amount's own currency. Actions re-derive actor, check `authorize(actor,'set_package_pricing',ws)`,
call session RPCs, map generic results and revalidate only on success. Read helpers check
registration-link capability and role-gate rates.

`/packages` checks PO before data reads. Workspace selector, code creation, offers table, publication form and ConfirmDialog toggles reuse existing primitives/translations. Page loading/error states reveal no protected data before authorization. Login/public-state markup receives AR/EN axe checks; full authenticated states run with local fixtures. Final PO navigation stays undecided: PO landing link only.

### Validation phases

Foundation establishes schema/grants/guards. US1 tests canonical identity, publication, concurrency and history; US2 availability; US3 scoped reads/rate secrecy; US4 management access/UI. S31 US5 adds independent market/type packages; US6 adds market-conditional currency, exact own-currency display and no conversion. Catalog/parity/log gates and independent reviewer mutation checks finish the work. Every FR/SC is mapped in [tasks.md](tasks.md#analyze).

## PO decision status

### Closed by S31

- **ND-F9-1 / allowed currencies**: closed by S31-PO-4 SK-009-01 and S31-PO-5 — Egypt = EGP only;
  International = EGP/USD/SAR; no assumed conversion.
- **ND-F9-4 / Sales-Trainer commission**: closed by S31-PO-4 SK-009-04 — both denied.
- **Authorship and category count**: S31-PO-5 establishes PO-only control; S34-PO-1 supersedes the unlimited package model with four fixed category identities per workspace.

### Historical implementation blockers (superseded where covered by S33-PO-6 / S34-PO-1)

- **SK-009-05 / SK-009-07 / SK-009-09**: resolved by S33-PO-6 and S34-PO-1 for this scope. **SK-009-06**: C1 resolves market/type mutability, but physical category persistence identity remains pending PD-S34-NEW-01.
- **SK-009-08**: Arabic category labels resolved by LABELS; the four mapped English labels are resolved by S34-PO-2; all other UI copy remains BLOCKED-COPY.

### Retained open items

- **ND-F9-2**: custom-duration policy bounds; ≥1 day only meanwhile.
- **ND-F9-3**: actual tier/duration catalog, names/prices/rates — NEEDS SOURCE CONFIRMATION; entered by PO.
- **ND-F9-5**: final PO navigation/F2 ND-5; landing link only meanwhile.

The retained ND-F9 items and BLOCKED-COPY scope remain explicit; S33-PO-6/S34-PO-1/S34-PO-2 decisions are settled. PD-S34-NEW-01 remains pending for category persistence identity. Existing
[production readiness](../../docs/07-production-readiness.md) gates remain open. Fixtures do not
settle policy.

## Project Structure

### Documentation (this run)

```text
specs/009-packages/
├── spec.md
├── checklists/requirements.md
├── checklists/analyze.md
├── research.md
├── data-model.md
├── contracts/packages-surface.md
├── quickstart.md
├── traceability.md
├── plan.md
└── tasks.md
```

### Source code (shipped baseline plus future S31 implementation)

```text
supabase/migrations/20261029120000_packages.sql              # shipped; immutable
supabase/migrations/20261106125000_f9_package_markets_types_currency.sql  # new forward delta
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
tests/unit/packages-market-type.test.ts                       # future RED-first unit coverage
tests/integration/
├── packages-fixture.ts
├── packages-publish.test.ts
├── packages-availability.test.ts
├── packages-reads.test.ts
├── packages-markets-types.test.ts                           # future RED-first DB coverage
├── rls-catalog.test.ts
└── matrix-parity.test.ts
tests/e2e/packages.spec.ts
```

**Structure Decision**: Extend the existing app/harness; separate pure library from server-only orchestration. Reuse components/ui, auth and Supabase modules without new dependencies or services. Fixture helper imports existing harness and never produces production seed data.

## Complexity Tracking

No Constitution violation or exemption. Safe view plus narrow commission RPC is required by shared SQL-role grants; a full-table grant leaks rates. Same-offer composite FK prevents a pointer bug the workspace pair alone permits. Replay identity, initial unavailability and duration representation are explicit technical interpretations, not policy resolutions.

## S32-PO-4 design delta (conditional on Clarifications MCQs)

S33-PO-6, S34-PO-1 and S34-PO-2 settle the product details below except category persistence identity (PD-S34-NEW-01). C1 and S33-11 fix immutable market/type; no S33 product MCQ remains open. The four English/Arabic label pairs are approved; other interface copy remains BLOCKED-COPY.

- **Legacy mock disposition:** C5 supersedes S32 row mapping for existing mock packages; target-stack dependency preflight and fail-closed behavior are required before safe deletion and empty-category initialization.
- **Versioned management:** PO-only commercial name/price/commission edits append versions; market/type are immutable; previous client/assignment snapshots are preserved. S33-02 retirement applies to future real packages.
- **Promotional lifecycle:** Africa/Cairo start-inclusive/end-exclusive periods; expiry stops new links only and issued links retain snapshots.
- **Historical FX:** immutable transaction-date snapshots; previous published business-day rate; verified Frankfurter; exact EGP identity rate; rate-pending/idempotent retry excluded until fetched. Never recompute snapshots.
- **Security:** outbound provider request is server-only, least-data, no client/workspace/transaction payload; add security review of egress, response validation, secret handling, retention and provider provenance. Constitution S31-PO-8 constrains development AI data only and does not prohibit the runtime FX API; no real client data is used in development fixtures.
- **Reporting:** actual monthly collections and package-specific commission with installment details; preserve original transaction/settlement currency and separate settlement records. PO/WO commission access only. The four English/Arabic market/type label pairs are approved; all other dashboard/Installments/empty/error/help copy remains BLOCKED-COPY.

No migration file, SQL, application implementation, test, build or stack operation is part of this artifact-only cycle.
