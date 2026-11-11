# Implementation Plan: Registration Links (P1-F10)

**Branch**: `010-registration-links` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Base**: `origin/009-packages` (PR #9 unmerged at artifact creation).

**Input**: Supplied binding Claude architect/reviewer design, transcribed by Codex under explicit user authorization. No application code in this run.

## Summary

Add immutable tenant-bound hashed links and ordered installment snapshots, issue atomically from available/current F9 offers, show URL once, and support a narrow anonymous first-open/validate RPC. A staff screen selects approved terms and a public screen shows only workspace name/validity. F11 consumption is a documented atomic contract, not implemented here. F10 decisions are not all open: ND-F10-1 and ND-F10-2 are decided, ND-F10-3 is recorded but not implemented, and ND-F10-4 and ND-F10-5 remain open; relevant F9 decisions remain as carried below.

## Technical Context

- **Language/Version**: Existing TypeScript 6.0.3, Node 24, Next.js 16.4.3 App Router, React 19.3.1.
- **Dependencies**: Existing supabase-js 2.118.0, supabase/ssr 0.12.7, server-only, native node:crypto, DS/i18n. No new dependency/lockfile changes.
- **Storage**: Supabase Postgres 17; local Docker only. One new forward migration `20261030120000_registration_links.sql`; pgcrypto digest available in `extensions` confirmed read-only locally (research R4). Re-confirm fresh migrations during implementation.
- **Testing**: Vitest unit/integration with signed-session fixture harness; Playwright/axe, catalog/parity and mutation tests. Required meaningful tests precede implementation.
- **Target/Type**: Existing Next web app on Cloudflare Workers/OpenNext; edge build and secret scan locally, no deployment.
- **Performance**: Indexed hash lookup, scoped recent list, actor advisory and offer/link row locks. No invented latency or business volume target; ND-F8-1 remains open.
- **Constraints**: $0 direction, exact string/bigint money, 24-hour fixed lifetime, strict first-open grace, no logging of token/hash/path, no cross-user caching, no service-key F10 application calls.
- **Scope**: Two tenant tables, two invoker-safe views, issuer/open/commission RPCs and internal guard/time/schedule/limit functions; staff/public routes and one-time dialog. No signup, payments, branding, revocation, SMTP or new capabilities.

## Constitution Check

Pre-research and post-design check against v1.1.0:

| Principle                    | Design evidence                                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I isolation                  | Composite tenant FKs, forced RLS, verified actor + capability and independent DB guard, foreign negatives for every staff path; public only explicit workspace name projection.                                                                                 |
| II financial truth           | Immutable price/currency/duration/rate/schedule, exact minor units and DB total; no payment/commission earning calculations.                                                                                                                                    |
| III least privilege          | Existing D-09 capability matrix unchanged; Trainer schedule denied; rates only PO/WO; hashes absent from all staff reads.                                                                                                                                       |
| IV approved scope            | Explicit BRD/PRD + D-12/D-17 precedence; ND-F10-1 and ND-F10-2 are decided, ND-F10-3 is recorded but not implemented, ND-F10-4 and ND-F10-5 remain open; carried ND-F9 decisions remain as recorded; no fixed 50/50, revocation or invented installment bounds. |
| V versioning                 | Current-version snapshot at issuance, restrictive references, guards for all DML roles; later versions/availability changes do not alter links.                                                                                                                 |
| VI people governance         | No people/payroll actions.                                                                                                                                                                                                                                      |
| VII privacy                  | One-time raw token, hash only, no-referrer/no-store, no token path logs, safe transactional audit, existing audit RLS.                                                                                                                                          |
| VIII bilingual/accessibility | Arabic-first/EN DS, neutral public state, staff loading/empty/error, responsive/theme/keyboard/axe.                                                                                                                                                             |
| IX reliability               | Atomic parent/schedule/audit, exact totals, actor limits under locks, first-open row serialization, pure time parity; future signup claim contract.                                                                                                             |
| Platform                     | Local Docker only under D-20; forward-only migration, $0, production gates/backup requirements unchanged; no cloud migration/deploy.                                                                                                                            |
| Workflow                     | User-authorized artifact transcription from Claude binding plan; Codex implementation/final verification execution, independent Claude audit and approval retained. No self-approval.                                                                           |

**Result**: PASS for design, with explicit open decisions/contract tension in research. No Constitution exception requested. This is not a claim of implementation/test or production acceptance.

## Phase 0 — Research decisions

[research.md](research.md) records source precedence, existing capability/read patterns, R10-1 displayed-version issuance decision, verified pgcrypto schema, schedule JSON and deferred checks, grace/open locking, deferred child-count audit, local-only rate placeholder and logging/UI boundaries. Every technical interpretation is flagged there for review.

## Phase 1 — Design

Normative details: [data-model.md](data-model.md) and [contract](contracts/registration-links-surface.md). Issuance (R10-1): authorize both capabilities as applicable, resolve the displayed same-workspace version (unknown/foreign -> not_permitted), actor lock/count, derived offer row lock, available/current comparison (otherwise stale_terms), exact-version schedule/hash validation, link + rows, deferred totals/audit, UUID. Server alone generates the raw 32-byte token/hash and returns the URL after commit. Stale terms show translated refresh/reload guidance; failures never return a URL.

Open: hash in SQL, row lock, consumed/time check, first-open timestamp set only once before expiry; minimal JSON. TS and private SQL pure functions share strict `max(expiry, first-open+30m)` rule and fixtures. No client-controlled DB clock. No IP blocking. Marker UPDATE grants remain absent; only open definer changes opened_at and F11 will later own consumption.

Both tables force RLS; safe invoker views expose exact money text and omit hash/rate. Column grants + explicit role-gated commission reader mirror F9, with no new capability. Extend the latest full audit body; parent deferred issue trigger counts final schedule, update trigger emits only first opened. No child/audit duplicates.

Public UI decision for this increment: valid workspace name and validity message; generic invalid otherwise. No feature flag or Continue area is needed because no action/form is rendered. This is the minimal option explicitly allowed by binding design, not resolution of ND-F10-4. No price or package internals. Add exact public route shape to middleware; preserve no-referrer after response recreation and do not log request paths. Dynamic/no-store prevents secret-bearing request cache artifacts. Host logging verification remains a production obligation under the never-log rule.

Staff UI uses accessible-workspace selector and F9 available/current terms, exact-money schedule editor for PO/WO/Sales, Copy-only show-once dialog and scoped recent statuses. Interim binding default: Sales/Trainer price visibility is yes while ND-F10-5 remains open; PO confirmation remains required. Commission stays omitted for Sales/Trainer under S31-PO-4 SK-009-04. Existing landing-link pattern only pending final navigation decision.

## Phase 2 — Tasks and gates

[tasks.md](tasks.md) phases: setup → foundational schema/pure helpers → US1 issuance → US2 anonymous open → US3 reads/staff UI → cross-cutting gates → Codex final verification, audited by Claude. Required tests are explicit and unchecked. All FRs/SCs map in Analyze; future mutation checks are in [quickstart.md](quickstart.md).

The current documentation-only run: fetch → branch from origin/009-packages → npm ci → read/transcribe → format/check/artifact analyze → set local feature pointer → commit only new feature artifacts. No app tests are represented as run, no implementation task checked. Local feature state is deliberately outside the requested commit.

## NEEDS DECISION

ND-F10-1 no revocation (S31-PO-3); ND-F10-2 no business maximum (S31-PO-4); ND-F10-3 50 per authorized issuing account per rolling 24 hours, Trainer/WO/PO included (S31-PO-3), recorded but not implemented; ND-F10-4 public content beyond name and ND-F10-5 price visibility remain open. ND-F9-1 currencies is decided by S31-PO-4 SK-009-01 and S31-PO-5 (Egypt = EGP only; International = EGP/USD/SAR; no assumed conversion); carry ND-F9-2 duration bounds, ND-F9-3 actual catalog, ND-F9-4 commission visibility remains denied (S31-PO-4), and ND-F9-5 final navigation. Existing [production readiness gates](../../docs/13-production-readiness.md) remain.

## Project Structure

Documentation: `specs/010-registration-links/{spec,research,data-model,quickstart,plan,tasks}.md`, `checklists/requirements.md`, `contracts/registration-links-surface.md`.

Future implementation:

```text
supabase/migrations/20261030120000_registration_links.sql
lib/registration-links/{token,validation,grace,results,service,read,open}.ts
app/(app)/registration-links/{page,RegistrationLinksManager,loading,error}.tsx
app/(app)/registration-links/actions.ts
app/(app)/registration-links/registration-links.module.css
app/register/[token]/{page,loading,error}.tsx
components/registration-links/RegistrationLinkDialog.tsx (+ .module.css)
app/(app)/page.tsx
middleware.ts
lib/i18n/messages/{ar,en}.ts
eslint.config.mjs
tests/unit/registration-links-{validation,grace,token,actions,read,open,page,dialog}.test.ts
tests/integration/registration-links-fixture.ts
tests/integration/registration-links-{issue,integrity,open,reads,audit}.test.ts
tests/integration/{rls-catalog,matrix-parity}.test.ts
tests/e2e/registration-links.spec.ts
```

Extend existing harness/DS; no new service or project layout. Keep pure validation/time separate from server-only token/read/orchestration. Safe view source is F9; do not modify package terms/matrix to accommodate F10.

## Complexity Tracking

No constitutional violation. Specific binding definer RPCs are a controlled exception to the architecture's generic invoker preference, using existing hardened pattern. Deferred parent audit is necessary for final installment count; column grants plus gated reader are necessary with a shared authenticated SQL role. Transaction provenance guard prevents schedule extension after issuance. R10-1 binds package_version_id and requires available/current under offer lock after authorization; stale_terms is translated with reload and tested for no writes/events. Strict source decisions and workflow ownership remain intact.

## S33-PO-4 test hygiene

The S33 registration-links acceptance adjustment captures response status and rendered route content in heading-failure diagnostics. No product behavior or UI changes are in scope.

The S33 unit-page test uses an explicit unauthenticated public-session mock to avoid coupling unit tests to local Stack environment variables.
