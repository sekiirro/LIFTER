# Implementation Plan: F17 Workout Templates & Workout Planner

**Spec**: `spec.md` (same folder) | **Status**: Updated spec-only draft (S43, 2026-11-10); implementation not authorized.
**Base**: `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`.
**Depends on**: F16 merged contracts; **pending F19 PR** (Plan Core) — cited, never assumed merged; F13 entitlement; P4 access surface.

## 1. Summary

F17 supplies workout plan content and editing, library-default copying at add time, global/workspace workout templates with PO-only manual assignment into independent workspace copies, draft/publish integration through the shared Plan Core, working-set volume, and published-revision PDF/Excel/`Copy AI Prompt` exports. It deliberately contains no plan lifecycle, delivery, activation, productivity, subscription or client-projection implementation.

## 2. Technical context

Same stack as F16: Next.js on OpenNext Workers, Supabase Postgres with forced RLS, invoker-rights reads and SECURITY DEFINER mutation RPCs, `authorize()` at the app layer plus RLS at the database, audit events, next-intl, Design System tokens, Vitest/Playwright/axe. Browser-side exports (print CSS for PDF, ExcelJS in the browser). All DB work is deferred; this plan reserves no stack, no migration version and no runner.

## 3. Constitution check

| Principle           | Plan position                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I Isolation         | Composite tenant keys on every F17 row; two walls; foreign-workspace and revoked-membership negatives are release gates (SC-010).                               |
| II Financial truth  | Not applicable.                                                                                                                                                 |
| III PO governance   | Global template create/manage and assignment are PO-only; role matrix explicit; no unlisted rights.                                                             |
| IV Approved scope   | Traced to PRD-04/12, D17-1..D17-9, PO A1–A4; exclusions explicit (Hevy, AI alternatives, logging, bulk assignment).                                             |
| V Versioned content | Immutable template/plan revisions and `ExerciseSnapshotV2`; Video live only; no retroactive rewrite.                                                            |
| VI People decisions | Not applicable.                                                                                                                                                 |
| VII Privacy         | No plan content in audit/logs; exports audited without content/PII; synthetic data only.                                                                        |
| VIII Bilingual UI   | AR/EN, RTL, keyboard reorder, Design Gate; prompt bodies match the approved byte-exact locale contract; export labels/text/names follow resolved S42/S43 rules. |
| IX Idempotency      | Operation keys + CAS for save/publish/template/assign; assignment retry/concurrency design in `data-model.md` §5.                                               |

Deviations: none proposed. Prompt bodies and program-day week grouping are decided by S43-PO-5 (architect mapping (S43-R6)); no calendar start date is required.

## 4. Design

### 4.1 Plan Core consumption (no duplication)

F17 consumes the **pending F19 PR** contract for Plan ID, private draft, autosave, Save as Draft, Ready & Publish, delivery, subscription binding, activation, productivity and client projection. F17 contributes only the workout document payload and its `ExerciseSnapshotV2` values. F17 uses the F19 lock order (authorize → plan-root lock → idempotency ledger → draft lock → expected revision → recheck authorization → validate/write → one audit event). If F19's final lock order differs when merged, F17 follows the merged contract; this plan does not freeze it.

`Ready & Publish` gates: current authorization, expected draft version, submitted client intake (D17-5=A), and a current subscription (pending F19 SC-003; S42-PO-4). Refusal writes neither revision nor delivery.

### 4.2 Workout document and references

Document schema v1 with `schema_version` and a registry of immutable parsers. References are `{source, identity, version}`; no `variation`. Effective resolution uses F16 FR-026, canonical-only for Global Template authoring. Publication freezes non-video values as `ExerciseSnapshotV2`; Video is resolved on each authorized read/export and never stored. Defaults copy at add time (three F16 defaults). A fresh exercise begins with zero set rows; editable Notes/Alternatives are copied on add (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-1=C, MCQ-2=B).

### 4.3 Templates and assignment

Separate global and workspace template identities with append-only versions. Assignment is a PO-only server operation with a run ledger, per-workspace distribution state, and one-copy-per-(workspace, template identity) uniqueness. All Workspaces eligibility is a single durable flag: never set → eligible (including own-templates-only workspaces); set → skipped forever. Specific Workspaces skips and reports every held template identity regardless of source version; it adds only missing identities and never overwrites. A zero-copy Assign is rejected before writes. Copies carry provenance to the origin global template/version for PO governance only and are not live links. Retry/concurrency/cancellation semantics are in `data-model.md` §5.2. Zero-copy Assign is rejected before writes (MCQ-3=C). A held copy from any source version is skipped and reported (S43-PO-1, architect mapping (S43-R1)); promotion is allowed and unresolved exercise references are flagged RED and block loading (MCQ-5).

### 4.4 Volume

Pure function over document + snapshot muscle data. Working sets only; primary 1.0, secondary 0.5, warm-up 0; per session and per plan week. Week grouping uses 7-program-day blocks (days 1?7, 8?14, etc.), including rest days and a final partial block (S43-PO-5; architect mapping (S43-R6)); no calendar start is required. No configurable weights.

### 4.5 Exports

Shared export module: print route rendering one explicitly selected published revision with RTL print CSS; ExcelJS workbook built in the browser from the same authorized response; both render the same FR-018 field set, including alternatives and live-resolved video URLs. All coach-authored cells are strings; leading `=`, `+`, `-`, `@` are neutralised. Success and denial are audited without content/PII. `Copy AI Prompt` is generated from the same authorized payload with the FR-019 constraints; export-authorized roles may use it (F17-MCQ-6=A); exact action and confirmation strings are approved per UI language. Prompt bodies EN/AR are byte-exact in contracts/copy-ai-prompt.md (S43-PO-5; architect mapping (S43-R6)). Export labels use UI language, authored text stays as authored, and exercise names are English (F17-MCQ-8).

### 4.6 Authorization

Plan actions: current `coaching_work` in the plan workspace; Trainer/WO/PO may edit any client plan in that workspace; Sales denied. Workspace-template actions: current `coaching_work` in the owning workspace. Global template management and assignment: PO-only. Exports: authorized actor + published revision. Clients have no F17 surface. Denials are generic.

## 5. Validation phases (future implementation, not authorized now)

1. Contract/pure-TS: document schema, id remap, reference resolution, three-default copy, volume table, export field parity, formula guard, prompt prohibitions, assignment state machine on mocks.
2. Database: schema, RLS, definer grants, immutability, CAS, assignment run ledger, concurrency and retry, foreign-workspace negatives.
3. Plan Core integration: publish gates (intake + subscription), stable ID, one revision per publish, no duplicate delivery/activation — verified against the **merged** F19 contract.
4. F16 integration: effective resolution, canonical-only template authoring, `ExerciseSnapshotV2` freeze, live Video, removed/merged targets.
5. UI: AR/EN, light/dark, mobile/desktop, keyboard reorder, axe, Design Gate evidence.
6. Security/perf: full negative matrix, mutation evidence for definer/RLS, re-benchmarked size/CPU limits (no historical number accepted as-is).

## 6. Migration allocation

**No version is reserved.** `docs/03-roadmap.md:64-65` (`20261107*`, `20261108*`) are obsolete (pending F19 treats them as obsolete). At implementation, scan `supabase/migrations` on every origin ref and allocate unique forward-only versions above the highest. No destructive migration, no rewrite of pushed migrations.

## 7. Dependencies

| Dependency               | State                      | Effect                                                                                              |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------- |
| F16 catalogs             | merged on main             | Defaults, resolution, alternatives, V2 snapshot, live Video are available as contracts.             |
| F19 Plan Core            | **pending PR, not merged** | F17 publish/copy/delivery integration cannot be implemented or accepted against a pending artifact. |
| F13/F12 entitlement      | merged                     | Publish requires a current subscription; exact "current" predicate belongs to F13/F19.              |
| P4 access/expiry surface | roadmap                    | F17 has no client surface; expiry enforcement is P4.                                                |
| F18 nutrition            | independent                | Shares export module and assignment _pattern_, not tables or content.                               |

## 8. Risks

| Risk                                                         | Mitigation                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Building F17 against a pending F19 contract                  | Treat F19 as a hard dependency; revalidate at merge; no duplicated lifecycle tables.            |
| Ambiguous assignment state causing double-distribution       | Durable per-workspace flag, run ledger, copy uniqueness, MCQ-3 ruling before code.              |
| Silent overwrite of customized workspace copies              | Copy-only writes; no update path; held template versions are skipped and reported per S43-PO-1. |
| Exporting private/foreign content                            | Published-revision-only, authorized selection, generic denial, audit.                           |
| Formula injection                                            | All cells text; leading-character neutralisation; golden tests.                                 |
| Historic 512 KB/CPU numbers becoming accidental requirements | SC-014 marks them provisional; re-benchmark before use.                                         |
| Historic branch drift                                        | No cherry-pick; reuse wording/evidence only (see `traceability.md`).                            |

## 9. Deferred items (blocking implementation of the named scope)

- Resolved S43-MCQ-A → byte-exact prompt templates and per-locale golden assertions in FR-019/SC-009/T040/T041.
- Resolved S43-MCQ-C → program-day weeks in FR-016/SC-007/T006/T036; no calendar date dependency.
- F19 merge, then revalidation of the consumed contract.
- Final size/performance limits after re-benchmark.

## 10. Evidence reuse policy

Historic `origin/sk-017` artifacts (`T036-evidence.md`, `T037-evidence.md`, `traceability.md`, `debate.md`) and the `origin/017-workout-planner` / `origin/017-t037-templates` branches are **reference only**. They may inform test intent and wording. They are not acceptance evidence for this draft, were produced against superseded contracts, and no code, test, table name or migration may be copied from them.
