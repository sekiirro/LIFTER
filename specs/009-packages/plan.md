# Implementation Plan: Packages & Package Versions (P1-F9)

**Branch**: `speckit-009-markets` | **Created**: 2026-10-27 | **S31 Update**: 2026-11-04 | **Spec**: [spec.md](spec.md)
**Input**: Binding architect/reviewer design supplied by Claude; BRD 30/40–41/53–54/102/196/317, D-09/D-10/D-11/D-13/D-17, Constitution v1.4.0, and S31-PO-4/S31-PO-5. This run produces artifacts only; implementation and independent review remain pending.

## Summary

F9 gives PO a canonical package catalog and workspace-specific duration offers with immutable numbered terms. The shipped implementation is PR #9 merge `b565d4c` (implementation tip `b359985`): three tables, hardened mutation RPCs, a safe staff projection, a narrow PO/WO commission reader, audit extensions, shared pure validation/money formatting, JWT-backed actions and a PO-only `/packages` page.

The S31 amendment adds an explicit workspace-package market (`Egypt | International`), type
(`Year-round | Promotional`), a market-conditional currency set (Egypt = EGP only; International =
EGP/USD/SAR), a no-conversion/no-cross-currency-total rule, and unlimited distinct packages per
workspace. Platform Owner remains the only package creator/pricer; WO/Sales/Trainer remain denied,
and Sales/Trainer commission remains denied. The implementation delta is additive: a new forward
migration plus versioned application/read/UI contracts. The shipped F9 migration and every existing
package-version term remain immutable. No legacy market/type classification, default, conversion,
promotional behavior, display copy or downstream currency interpretation is guessed; those remain
explicit PO gates below.

## Technical Context

- **Language/Version**: TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1, as pinned in `package.json`.
- **Primary Dependencies**: Existing supabase-js 2.118.0, supabase/ssr 0.12.7, server-only 0.0.1, Design System/i18n. No new dependencies or lockfile changes.
- **Storage**: Existing Supabase Postgres 17, CLI 2.122.0. The S31 delta adds one new forward migration, provisionally `supabase/migrations/20261106125000_f9_package_markets_types_currency.sql`; it never edits shipped `20261029120000_packages.sql`. User JWT for app calls.
- **Testing**: Existing Vitest 5.0.5 unit/local integration, postgres harness, Playwright 1.64.1 and axe 4.14.0, RLS-catalog/matrix parity and mutation checks. New work is RED-first unit/integration/e2e and permission/RLS mutation coverage.
- **Target Platform / Project Type**: Existing Next web app on Cloudflare Workers/OpenNext; local builds/dry runs only. No new service or public API server.
- **Performance Goals**: Preserve indexed offer serialization and current-version replay. No package-count cap and no invented latency/capacity SLA; pilot volumes remain ND-F8-1.
- **Constraints**: Exact bigint money transport; market-conditional currency; own-currency display only; no exchange rate/conversion/cross-currency total; no console; deny by default; immutable versions for all DML roles; no browser Supabase/admin imports; no unreviewed bilingual copy; $0 hosting direction unchanged.
- **Scale/Scope**: Existing three package tables, safe view, three mutation RPCs, one commission reader and one PO screen. S31 adds two attributes (four values), one currency matrix, unlimited independent packages and the associated read/UI/verification surface. Only synthetic local fixtures.

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
implementation or production. S31 closes ND-F9-1 and ND-F9-4 and resolves the authorship conflict;
SK-009-05..SK-009-09 remain explicit implementation blockers. Technical interpretations in research
R4/R5/R9 remain visible for review.

## S31 shipped-baseline delta (2026-11-04)

### Evidence read from current `main`

| Surface | Shipped behavior | S31 delta |
|---|---|---|
| `public.packages` | Global immutable canonical code; no market/type/count quota | Keep global identity immutable. Do not add market/type here unless SK-009-06 explicitly selects this owner. |
| `public.package_offers` | Workspace/package/duration offer; availability + current version; unique `(workspace_id, package_id, duration_days)` | Candidate owner for market/type, conditional on SK-009-06. No package-count cap is added. |
| `public.package_versions` | Immutable AR/EN terms, `price_minor`, `currency`, commission and duration | Keep every existing version's identifier and stored price/currency/commission/duration terms unchanged (SC-011). Currency remains version-owned. Add no historical backfill. |
| `publish_package_version(...)` | PO-only; accepts any format-valid three-letter currency; no market/type input | Add approved market/type inputs at the selected owner and enforce the market/currency matrix in both validation walls. Preserve replay/concurrency semantics. |
| `package_versions_safe` / app reads | Returns each version's own price and currency | Add approved market/type projections if they belong to an existing immutable/read surface; never calculate or join a converted amount. |
| `/packages` | PO-only publish form and one price per offer row | Add approved market/type controls and own-currency display; labels come only from the PO-approved copy record. |
| F10/F12 | Registration links copy package price/currency; subscriptions/installments/payments/refunds preserve that currency and exact totals | Final S31 propagation wording is blocked by SK-009-09. No conversion option may be assumed. |

### Forward-only design boundary

1. **New migration only.** Create
   `supabase/migrations/20261106125000_f9_package_markets_types_currency.sql`; never edit
   `20261029120000_packages.sql` or any later shipped migration. Add schema/constraints/RPC
   replacements in that new file.
2. **No historical rewrite.** Existing `package_versions` rows and their identifiers/terms are not
   updated, deleted, truncated or assigned an inferred market/type. The migration design must encode
   the PO-approved SK-009-05 treatment before non-null/check constraints are activated.
3. **PO-only mutation wall.** Market/type/currency publication remains behind the existing PO
   `set_package_pricing` capability in the app and signed-identity DB checks. WO/Sales/Trainer cannot
   create, name, price or control packages in any workspace.
4. **Market/currency invariant.** Egypt accepts only EGP; International accepts EGP/USD/SAR. Every
   other currency is invalid even when it matches the former three-letter format check. Currency is
   never inferred from market or market inferred from currency.
5. **No conversion.** Store and display the exact minor-unit amount with its own code. No rate
   table, converted field, mixed-currency arithmetic or cross-currency total is added.
6. **Independent packages.** Distinct canonical package codes remain independent inside a
   workspace. No count cap/quota or one-package-per-workspace constraint is introduced.
7. **Bilingual/UI gate.** Exact Arabic/English market/type strings come only from the PO-approved
   SK-009-08 record. The future UI must pass the Frontend Design Gate (AR-RTL/EN-LTR × light/dark ×
   mobile/desktop, required states and accessibility).

### PO gates before implementation

| Open item | Blocks | Independent work that may proceed after approval |
|---|---|---|
| SK-009-05 legacy classification | NOT NULL/check activation, legacy rows/UI/tests | Inventory and migration tests can be drafted without choosing a mapping. |
| SK-009-06 owner/mutability | Column placement, keys, guards, replay and read contract | Currency/no-conversion/role test design and evidence can proceed independently. |
| SK-009-07 promotional behavior | Any date/visibility/availability behavior | Explicit classification-only tests can be prepared but not asserted as final. |
| SK-009-08 bilingual copy | i18n keys, UI and exact-copy fixtures | Layout/accessibility scenarios can use PO-approved placeholders only in test design. |
| SK-009-09 downstream currency | F10/F12 contract/test changes | Current same-currency evidence can be documented; no new propagation rule is asserted. |

**Implementation readiness**: BLOCKED until SK-009-05..SK-009-09 are explicitly answered. This
plan does not make those product decisions.

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
- **Authorship and package count**: closed by S31-PO-5 — PO only; unlimited distinct packages means
  no package-count cap/quota.

### Open implementation blockers

- **SK-009-05**: classification of existing package rows.
- **SK-009-06**: market/type owning entity and mutability.
- **SK-009-07**: behavior of `Promotional` beyond classification.
- **SK-009-08**: exact approved Arabic/English market/type copy.
- **SK-009-09**: currency propagation through F10/F12 financial surfaces.

### Retained open items

- **ND-F9-2**: custom-duration policy bounds; ≥1 day only meanwhile.
- **ND-F9-3**: actual tier/duration catalog, names/prices/rates — NEEDS SOURCE CONFIRMATION; entered by PO.
- **ND-F9-5**: final PO navigation/F2 ND-5; landing link only meanwhile.

The S31 open items block the affected implementation and are not resolved in this plan. Existing
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
