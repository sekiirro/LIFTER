# Implementation Plan: P7 Workforce Management

**Branch**: `s70-027-workforce` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/027-workforce-management/spec.md`

## Summary

Specify PO-controlled workforce/payroll and KPI reporting while reusing F10/F12 link and payment facts, F13 refunds, F15/F23 check-ins, F19 immutable productivity events, and F26 retention. Store every new penalty, reversal, correction and manual adjustment in a separate append-only KPI ledger. Compute period projections/snapshots from immutable sources. Apply server-side role projections; Sales receives only its own finalized month total after month-end. No code, migrations, stack, payout, or Telegram response-speed implementation is included in this lane.

## Technical Context

**Language/Version**: Existing Next.js application, TypeScript and PostgreSQL (Supabase); no new runtime choice.
**Primary Dependencies**: Existing Supabase Auth, workspace authorization/RLS, F10/F12/F13, F15/F23, F19, F26.
**Storage**: Existing PostgreSQL/Supabase; tenant-scoped append-only KPI facts and month projections.
**Testing**: Vitest unit/integration, direct RLS/role-matrix requests and current repository gates; this planning lane executes no tests.
**Target Platform**: Existing LIFTER web application and Supabase.
**Project Type**: Existing web application.
**Performance Goals**: No PO volume/latency target supplied; avoid inventing one. Measure bounded month snapshot/finalize reads and writes in implementation.
**Constraints**: workspace isolation, exact authorization at app and database, immutable facts, idempotent money-adjacent writes, month-close serialization, exact-head CI, Cairo dates, F26 retention.
**Scale/Scope**: PO, WO, Trainer and Sales projections for workspace staff; exact capacity remains an implementation measurement, not a new business requirement.

## Constitution Check

| Principle                                         | Check against S70-PO-16                                                                                                                                                                                                                                         | Resolution                                                                                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I — Strict Workspace Isolation                    | No conflict. P7 adds tenant workforce facts and gives all Trainers workspace-wide historical Weekly Check-ins.                                                                                                                                                  | Enforce workspace scope at app and database boundaries; Trainer history remains same-workspace only.                                                                                                            |
| II — Immutable Financial Truth                    | Compatible. P7 requires immutable F19 and append-only workforce history; PO-only external-paid payroll; no LIFTER payouts.                                                                                                                                      | Separate append-only KPI/compensation history and immutable snapshots; no salary auto-change.                                                                                                                   |
| III — Platform Owner Governance & Least Privilege | No conflict. P7 reinforces PO-only manual point changes, payroll and full detail; staff see own compensation; Sales has a narrow final projection.                                                                                                              | Add explicit server-side projections; preserve unrelated D-09 capabilities.                                                                                                                                     |
| **IV — Approved Scope Only (NON-NEGOTIABLE)**     | **Conflict**: current text lists “automatic bonuses/deductions” as excluded and requires approved D-xx decisions; S70-PO-16 adds P7 and explicitly requires deterministic plan/check-in penalties and refund reversals. Its v1-scope P7 deferral is superseded. | Proposed amendment below only. Do not edit Constitution in this feature PR.                                                                                                                                     |
| V — Versioned, Non-Retroactive Content            | No conflict. Monthly feedback defaults/history and snapshots are versioned; later settings cannot rewrite earlier records.                                                                                                                                      | Store effective month and immutable revision lineage.                                                                                                                                                           |
| **VI — Human-Governed People Decisions**          | **Conflict**: “Incentives, deductions, strikes … MUST be explicit … PO decisions. Nothing is automatic” conflicts with PO-authorized −1 plan delay, −0.5 check-in delay and once-only refund reversal.                                                          | Preserve human PO control over manual changes, disputes, additional penalties, compensation and discipline. Automate only the explicitly PO-approved triggers and amounts in S70-PO-16. Proposed wording below. |
| VII — Privacy & Health-Data Protection            | No conflict; retention and least privilege apply. P7 attribution must survive F26's 30-day client-data purge without depending on audit events or retaining client PII.                                                                                         | KPI ledger/snapshot retains minimal staff attribution and point facts; remove client-identifying link on F26 schedule.                                                                                          |
| VIII — Bilingual, Accessible, Design-System UI    | No behavior conflict. No new product copy is PO-approved in S70-PO-16 beyond named statuses/terms.                                                                                                                                                              | UI work must use existing design gate and obtain PO-approved Egyptian Arabic/English strings before implementation.                                                                                             |
| IX — Reliable, Idempotent Operations              | No conflict; idempotency and concurrency are explicit P7 requirements.                                                                                                                                                                                          | Deterministic dedup keys, serialization and replay checks; test double-clicks, concurrent PO edits and close races.                                                                                             |

### Proposed amendment (not applied)

**Principle IV** — add: “P7 Workforce Management is approved by S70-PO-16 and supersedes the earlier v1 P7 deferral. Only the precise automatic KPI entries in that PO decision are allowed; no other automatic bonus, deduction, strike consequence or discipline is authorized.” Remove “automatic bonuses/deductions” from the unqualified exclusion example, or qualify it with this explicit P7 exception.

**Principle VI** — revise to: “KPIs are decision support only. Additional/manual incentives, deductions, corrections, reattribution, strikes and termination are explicit, audited PO decisions. The PO-approved P7 rules may automatically append only the defined plan-delay penalty, check-in-delay penalty and full-refund Sales-point reversal; those entries do not trigger compensation changes or discipline. Payroll approval means already paid externally and is recorded as an immutable PO action. No other people decision is automatic.”

This proposed text reconciles P7's explicit policy with the human-governance intent. Constitution modification requires its separate governance/approval path; this plan does not amend it.

## Design

### Reuse audit and research

The worktree audit directly checked: BRD/PRD, current Constitution, roadmap, permission/traceability docs, docs/13 production gates, specs 009–013, 015, 019, 020, 023 and 026, plus existing Speckit templates and skills. F19 authorizes a once-per-new-client productivity unit and immutable activation/delivery facts; F10 retains authorized link visibility; F12 supplies approval/confirmed payment facts; F13 owns full refunds; F15/F23 own the form/check-in history; F26 defines retention. The next research document records seams to confirm before implementation. The independent P7 reuse audit at `C:/Users/NEW LAP/.lifter/runs/s70-gemini-p7audit/audit.md` contained only its heartbeat at the last check; no unverified claim from it is relied on.

### Data and security approach

See [data-model.md](data-model.md) and [contracts/authorization-and-projections.md](contracts/authorization-and-projections.md). No KPI behavior is authorized to infer from UI hiding. Role predicates must be rechecked in trusted server code and database policy/RPC. Sales detail denial applies to the raw API shape, RLS, aggregate view, export, replay receipt and error path. Create one minimal Sales monthly projection that exposes only own finalized total after Cairo month end.

### Period, event, and concurrency approach

Represent points with exact base-10 numeric arithmetic (never binary floating-point), so the required 0.5 and PO-configured transformation/feedback values are preserved without adding an unapproved point increment limit. Source events are immutable references; separate KPI entries are append-only and idempotent. Snapshots persist formula/version and staff totals. Period writes, manual PO edits, refund reversal and close serialize against the same workspace/staff/month key. A deterministic source key is unique for each rule/source/subject, with argument hash for replay mismatch. Keep source/effective/recorded dates separate where a correction can arrive later.

Month boundary uses Africa/Cairo to match existing F10/F12/F13 money and date conventions. Corrections after finalization are blocked by P7-MCQ-01; no technical default is encoded. Pending item is not a blocker to independent check-in view, basic salary, payroll, open-period ledger, and other PO-approved work.

## Project Structure

### Documentation (this feature)

```text
specs/027-workforce-management/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── copy-table.md
├── traceability.md
├── tasks.md
├── contracts/
│   ├── workforce-rpc-api.md
│   └── authorization-and-projections.md
└── checklists/
    ├── analyze.md
    └── po-mcqs.md
```

### Existing implementation areas to inspect during future slices

```text
app/                      role pages and trusted server actions/routes
lib/                      authorization, RPC/client boundaries, projections
supabase/migrations/      workspace data, RLS and privileged functions
tests/unit/               point rules, period math, idempotency
tests/integration/        database mutation, RLS, role projections and concurrency
```

**Structure Decision**: Extend existing application and DB authorization seams; do not add a second Forms or payroll/payout subsystem. Table/function names are deliberately not specified here where they would imply an unverified schema. Resolve exact existing seams in the first implementation slice before migration design.

## Technical Decisions

1. Use exact base-10 numeric point values, never binary floating-point. This exactly represents +1, −0.5 and PO-configured transformation/feedback values without inventing a maximum decimal scale.
2. Keep immutable F19 source events; a separate append-only signed ledger records deductions, refunds and PO adjustments. Use reversals instead of updates/deletes.
3. Snapshots are materialized immutable versions with a unique period/version and staff totals; a current pointer/selection is a derived projection, never an editable historical snapshot.
4. Enforce Sales scope with a database-safe aggregate projection plus RLS/RPC authorization, and independently filter in the server layer. UI hiding is insufficient.
5. Retain staff attribution and non-PII KPI facts independently of `audit_events`; F26 purge removes client-identifying linkage at its required clock while leaving minimal workforce history needed for totals.
6. Use existing F13 full-refund transaction boundary for once-only Sales reversal and PO fault decision. No new refund state machine or partial-refund path.
7. Add no Telegram response monitor now; document future capability findings only from official Telegram documentation.

## Complexity Tracking

| Violation                                   | Why Needed                                                                    | Simpler Alternative Rejected Because                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Principle IV scope/automatic-change wording | Binding S70-PO-16 adds P7 and names exact automatic KPI entries.              | Ignoring P7 would violate PO scope; broad exception would authorize more behavior than PO decided.     |
| Principle VI “Nothing is automatic”         | The three precise automatic event types are necessary to implement S70-PO-16. | Manualizing them would change an explicit PO trigger; broad automation would violate human governance. |
