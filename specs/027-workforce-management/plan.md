# Implementation Plan: P7 Workforce Management

**Branch**: `s70-027-workforce` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/027-workforce-management/spec.md`

## Summary

Specify PO-controlled workforce/payroll and KPI reporting while reusing F10/F12 link and payment facts, F13 refunds, F15/F23 check-ins, F19 immutable productivity events, and F26 retention. Store every new penalty, reversal, correction and manual adjustment in a separate append-only KPI ledger. Compute period projections/snapshots from durable P7 earned facts and append-only adjustment/quality ledgers, never recomputing from client rows that F26 can purge. Apply server-side role projections; before Cairo month-end and PO finalization, Sales may see only its own configured Basic Salary through the existing own-compensation self-read and a not-available state; after both gates, it receives only its own finalized month total. The proposed next-month explanation remains blocked until S74-COPY-01 exact-text approval. The PO's eight-category Sales funnel is a section of the existing report. No code, migrations, stack, payout, or Telegram response-speed implementation is included in this lane.

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

| Principle                                         | Check against S70-PO-16                                                                                                                                                                                                                                                                                                                         | Resolution                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I — Strict Workspace Isolation                    | No conflict. P7 adds tenant workforce facts and gives all Trainers workspace-wide historical Weekly Check-ins.                                                                                                                                                                                                                                  | Enforce workspace scope at app and database boundaries; Trainer history remains same-workspace only.                                                                                                                                               |
| II — Immutable Financial Truth                    | Compatible. P7 requires immutable F19 and append-only workforce history; PO-only external-paid payroll; no LIFTER payouts.                                                                                                                                                                                                                      | Separate append-only KPI/compensation history and immutable snapshots; no salary auto-change.                                                                                                                                                      |
| III — Platform Owner Governance & Least Privilege | No conflict. P7 reinforces PO-only manual point changes, payroll and full detail; staff see own compensation; Sales has a narrow final projection.                                                                                                                                                                                              | Add explicit server-side projections; preserve unrelated D-09 capabilities.                                                                                                                                                                        |
| **IV - Approved Scope Only (NON-NEGOTIABLE)**     | **Conflict**: the unqualified automatic-bonus/deduction exclusion conflicts with approved P7 plan-delay -1, check-in-delay -0.5 and one Sales acquisition-point reversal on any completed partial/full refund; the earlier P7 v1 deferral is superseded. Future Telegram timeliness is PO-approved post-launch only when technically supported. | Proposed narrow amendment below. Separate Constitution 1.20.0 PR, lane s70-gemini-const120; do not edit Constitution here.                                                                                                                         |
| V — Versioned, Non-Retroactive Content            | No conflict. Monthly feedback defaults/history and snapshots are versioned; later settings cannot rewrite earlier records.                                                                                                                                                                                                                      | Store effective month and immutable revision lineage.                                                                                                                                                                                              |
| **VI - Human-Governed People Decisions**          | **Conflict**: the current Nothing-is-automatic rule conflicts with PO-approved automatic point events (including post-launch Telegram only when supported). S70-PO-20 additionally authorizes automatic recording of late initial plan-delivery strike facts, while discipline remains manual.                                                  | Keep money/point corrections, strike corrections and discipline PO-controlled; automate only precisely approved point triggers and the immutable late-delivery source fact. Strike counts are PO-only review signals and never trigger discipline. |
| VII — Privacy & Health-Data Protection            | No conflict; retention and least privilege apply. P7 attribution must survive F26's 30-day client-data purge without depending on audit events or retaining client PII.                                                                                                                                                                         | KPI ledger/snapshot retains minimal staff attribution and point facts; remove client-identifying link on F26 schedule.                                                                                                                             |
| VIII — Bilingual, Accessible, Design-System UI    | No behavior conflict. No new product copy is PO-approved in S70-PO-16 beyond named statuses/terms.                                                                                                                                                                                                                                              | UI work must use existing design gate and obtain PO-approved Egyptian Arabic/English strings before implementation.                                                                                                                                |
| IX — Reliable, Idempotent Operations              | No conflict; idempotency and concurrency are explicit P7 requirements.                                                                                                                                                                                                                                                                          | Deterministic dedup keys, serialization and replay checks; test double-clicks, concurrent PO edits and close races.                                                                                                                                |

### Proposed amendment (not applied; separate Constitution 1.20.0 PR, lane s70-gemini-const120)

**Principle IV** — add: “P7 Workforce Management is approved by S70-PO-16 and supersedes the earlier v1 P7 deferral. Only the automatic KPI events explicitly approved by S70-PO-16 are allowed: plan-delay negative 1 point, check-in-delay negative 0.5 points, and one Sales acquisition-point reversal on any completed refund. Once technically supported and implemented post-launch, the S70-PO-16 Telegram response-speed rule may append negative 0.5 Timeliness points for a response >1 hour during the responsible configured shift. No other automatic bonus, salary deduction, strike consequence or discipline is authorized.” Remove “automatic bonuses/deductions” from the unqualified exclusion example, or qualify it with this explicit P7 exception.

**Principle VI** — revise to: “KPIs are decision support only. Additional/manual incentives, deductions, corrections, reattribution, strikes and termination are explicit, audited PO decisions. The PO-approved P7 rules may automatically append only the defined plan-delay penalty, check-in-delay penalty and one Sales acquisition-point reversal on any completed refund; after launch and technical support, the defined Telegram response-speed penalty may be implemented. These KPI entries do not trigger compensation changes or discipline. Payroll approval means already paid externally and is recorded as an immutable PO action. No other people decision is automatic.”

This proposed text reconciles P7's explicit policy with the human-governance intent. Constitution modification requires its separate governance/approval path; this plan does not amend it.

## Design

### Reuse audit and research

The worktree audit directly checked: BRD/PRD, current Constitution, roadmap, permission/traceability docs, docs/13 production gates, specs 009–013, 015, 019, 020, 023 and 026, plus existing Speckit templates and skills. F19 authorizes a once-per-new-client productivity unit and immutable activation/delivery facts; F10 retains authorized link visibility; F12 supplies approval/confirmed payment facts; F13 owns full refunds; F15/F23 own the form/check-in history; F26 defines retention. The next research document records seams to confirm before implementation. The independent P7 reuse audit at `C:/Users/NEW LAP/.lifter/runs/s70-gemini-p7audit/audit.md` contained only its heartbeat at the last check; no unverified claim from it is relied on.

### Data and security approach

See [data-model.md](data-model.md) and [contracts/authorization-and-projections.md](contracts/authorization-and-projections.md). No KPI behavior is authorized to infer from UI hiding. Role predicates must be rechecked in trusted server code and database policy/RPC. Sales detail denial applies to the raw API shape, RLS, aggregate view, export, replay receipt and error path. The existing `p7_get_own_compensation` read permits Trainer/Sales only for the `auth.uid()` employee id; no access widening is part of T025. T039 extends `get_sales_funnel` from its current three milestone counts to eight categories using existing P7 ledger/refund-reversal/adjustment facts, with Cairo event month, workspace scope, PO-only authorization and non-PII output. The existing F21 `p7_workforce_report` projection supplies staff display names only to the PO. T039 precedes T025.

### Period, event, and concurrency approach

Represent points with exact numeric scale 2; use canonical decimal strings over APIs, no JavaScript floats, and weights with at most two decimal places. Source events are immutable references; separate KPI entries are append-only and idempotent. Snapshots persist formula/version and staff totals. Period writes, manual PO edits, refund reversals and close use one shared workspace+month advisory fence acquired after existing source locks in a fixed order; closed-month corrections route to current open month. A deterministic source key is unique for each rule/source/subject, with argument hash for replay mismatch. Keep source/effective/recorded dates separate where a correction can arrive later.

Initial effective period is the Africa/Cairo month of the category trigger: Trainer activation; Sales approval plus confirmed first payment; check-in 24h deadline; plan deadline. Keep trigger and recorded times separate. Closed-month corrections go to current open month linked to original month and never change the closed snapshot or Sales total.

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

Additional checklists: checklists/requirements.md and checklists/critique.md.

**Structure Decision**: Extend existing application and DB authorization seams; do not add a second Forms or payroll/payout subsystem. Table/function names are deliberately not specified here where they would imply an unverified schema. Resolve exact existing seams in the first implementation slice before migration design.

## Technical Decisions

1. Use exact numeric scale 2 for points and payroll decimals, canonical decimal strings over APIs, and no JavaScript floating-point arithmetic. Quality weights are limited to two decimal places.
2. Keep immutable F19 source events; on qualification append durable P7 earned facts without client FK/PII. A separate append-only signed ledger records deductions, refund reversals and PO adjustments. Use reversals instead of updates/deletes.
3. Snapshots are materialized immutable versions with a unique period/version and staff totals; a current pointer/selection is a derived projection, never an editable historical snapshot.
4. Enforce Sales scope with a database-safe aggregate projection plus RLS/RPC authorization, and independently filter in the server layer. UI hiding is insufficient.
5. Retain staff attribution and non-PII KPI facts independently of `audit_events`; F26 purge removes client-identifying linkage at its required clock while leaving minimal workforce history needed for totals.
6. Use the existing F13 refund transaction boundary for one Sales acquisition reversal on any completed partial or full refund. Ask the PO about staff fault only for a full refund, classified against F13 refundable collected funds for that purchase scope; questionnaire decision is once per acquisition.
7. No Telegram response monitor now. Document post-launch capability findings and the PO-approved future >1 hour / negative 0.5 Timeliness rule; human Trainer reply observability/identity remain unverified.
8. S70-PO-20/R109 authorize immutable strike source facts from persisted F15 D-03; S70-R110 fixes the instant at deadline passage without a successful initial pair, even when no later delivery occurs. Count over exactly 90 x 24 hours with an exclusive lower bound and inclusive upper bound. PO corrections append `void`, `reinstate` latest void, or same-workspace breach-time `reattribute`; latest correction is effective, reason is required, and audit is opaque. These facts do not authorize automatic discipline.
9. S74-PO-2 MCQ1/2 approve the Sales own-total and PO funnel copy batches (draft rows 1–11 and 12–27); MCQ4=B activates all eight funnel categories and T039; MCQ5=B reuses F21's PO-only `p7_workforce_report` name projection; MCQ6=B mounts the funnel in the existing report; MCQ7=A separates `empty` and `not_available`. MCQ3=A is modified to show the employee's own configured Basic Salary before close/finalization. Its proposed message S74-COPY-01 is pending exact-text PO approval and cannot ship until approved.

## Complexity Tracking

| Violation                                   | Why Needed                                                                                                                                              | Simpler Alternative Rejected Because                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Principle IV scope/automatic-change wording | Binding S70-PO-16 adds P7 and names exact automatic KPI entries.                                                                                        | Ignoring P7 would violate PO scope; broad exception would authorize more behavior than PO decided.     |
| Principle VI “Nothing is automatic”         | The P7 automatic point events explicitly authorized by PO-16, plus the post-launch Telegram rule only when supported, are necessary to implement scope. | Manualizing them would change an explicit PO trigger; broad automation would violate human governance. |

## Critique and PO reconciliation

S70-R95 findings SOL-01..24 are dispositioned in [checklists/critique.md](checklists/critique.md). Key implementation decisions: durable non-PII P7 earned-point facts are authoritative after qualification; Sales productivity units reuse issuance-time role and are idempotently backfilled; any completed refund reverses once; revisions count latest effective value only; due evaluator and confirmation share a key; trigger-month uses Cairo occurrence; corrections to a closed month go to current open month; global monthly salary belongs to platform PO; manual money inputs and one-version-bound payroll approval are explicit; F26 purge/hold, protected audit payloads, all channel probes, and the shared period fence are required.

Constitution C1/C2 remain recorded as CRITICAL governance dependencies, resolved by the pending Constitution 1.20.0 amendment PR in lane s70-gemini-const120. This lane only updates proposed wording; it does not edit the Constitution.
