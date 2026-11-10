# F18 conflicts and verifications

**Date**: 2026-11-10 (S42). **Base**: `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`. Every entry cites live evidence. Status values: `RESOLVED-BY-PO` (a PO decision settles it), `RESOLVED-DESIGN` (settled by this draft's design within PO authority), `OPEN-MCQ` (product choice, escalated), `OPEN-TECH` (technical reconciliation, no product effect), `VERIFIED` (checked, no conflict), `HISTORIC` (superseded reference only).

## F18-C-01 — Plan root bound to a subscription (old) vs delivery-time binding (F19)

- **Old**: `origin/sk-018:specs/018-nutrition-planner/plan.md:19` puts `subscription_id` on `nutrition_plans`; old FR-001 delegated to "PC-FR-001..007".
- **Now**: F19 pending `spec.md:24` (F19-FR-002) binds a plan to a subscription only through a `plan_deliveries` row; `data-model.md:26,50` says a plan root has no subscription field.
- **Status**: RESOLVED-BY-PO (S42-PO-2 architecture; S42-PO-4 MCQ-12 C) + F19 pending design. F18-FR-001 encodes the delivery binding and adds no subscription column. If F19 changes before merge, F18 follows the merged contract, never the historic one.

## F18-C-02 — "Global templates readable by all" vs PO-only global library

- **Old**: `origin/sk-018:specs/018-nutrition-planner/T012-evidence.md` states "Global templates are visible to readers and only writable by PO"; historic UI tests assert a non-PO reader sees the global list; `D18-1` as originally drafted allowed shared/global reads.
- **Now**: A5 Q1=A (`runs/s42-po/f17-f18-po-decisions-source.md:59`) applies A2 (`:40`) — assigned global templates become **independent workspace copies**, with no live link; only the PO manages the global collection.
- **Status**: RESOLVED-BY-PO. F18-FR-007 removes workspace reads of the global library; the historic T012 expectations are not reusable.

## F18-C-03 — Make it Global "validates/removes" vs "refuses" private content

- **Old**: `origin/sk-018:specs/018-nutrition-planner/plan.md:19` "validates/removes private data and references".
- **Now**: S20-17/D18-1 (`docs/04-changes-and-questions.md:93`) says the PO may Make it Global **after** excluding private data/references.
- **Status**: RESOLVED-DESIGN (INFERRED, matrix I5). The action validates and refuses with field codes; it never silently strips. This preserves authored content and makes the PO's removal step explicit in audit.

## F18-C-04 — Serving-equivalence precision assumption (4 dp) vs live 3 dp

- **Old**: `origin/sk-018:specs/018-nutrition-planner/spec.md:86` (FR-003) and `plan.md:23` assume serving equivalences ≤ 4 decimals.
- **Now**: `supabase/migrations/20261106093000_catalog_food_versions_and_servings.sql:28` defines `basis_qty numeric(12,3)`; per-100 values are `kcal numeric(7,1)` and macros `numeric(7,2)` (`:9-13`).
- **Status**: RESOLVED-DESIGN. F18-FR-003/data-model §2 use the live scales; plan quantities stay ≤ 3 dp; Sol-1 requires exact persistence without storage rounding.

## F18-C-05 — `FoodSnapshotV1` freezes one serving, a plan may use several

- **Evidence**: `lib/catalog/snapshot.ts:15-37` (single `serving`), `:164-242` (`toFoodSnapshot` takes one `servingId`); F16 FR-020 (`specs/016-exercise-food-catalogs/spec.md:134`) requires exact referenced version + per-100 values; a valid plan may use grams for one item and a serving unit for another of the same food version.
- **Status**: RESOLVED-DESIGN (INFERRED, matrix I6). F18-FR-005 requires one snapshot entry per (food version, serving unit); the F16 type stays unchanged. This is a real integration constraint, not a product choice.

## F18-C-06 — Snapshot values as JS `number` vs exact decimal strings

- **Evidence**: `lib/catalog/snapshot.ts:21-37` types kcal/macros/serving quantity as `number`; `specs/016-exercise-food-catalogs/plan.md:38` says snapshot transport uses decimal strings.
- **Status**: OPEN-TECH. F18 requires fixed-scale decimal-string transport and forbids binary floating-point in calculation. The implementation must parse `FoodSnapshotV1` at fixed scale or serialize its fields as strings; if F16 changes the builder type, F18 follows. No PO decision.

## F18-C-07 — Display rounding: S27 half-up vs A5 final rounding

- **Evidence**: `git show origin/sk-018:specs/018-nutrition-planner/S27-decimal-evidence.md` ("rounds half-up at display time only"); A5 Q4 (`runs/s42-po/f17-f18-po-decisions-source.md:62`) "one final half-even rounding step".
- **Reading checked**: S43-PO-1 settles half-up display. S43-R9 Sol-1 technically settles exact persistence without storage rounding.
- **Status**: PO display rule resolved by S43-PO-1 MCQ-4; technical exact-persistence/no-storage-rounding rule by S43-R9 Sol-1. Aggregates use exact values; TS and SQL tie/double-rounding goldens must agree.

## F18-C-08 — S27-PO-2 is not in the decision register

- **Evidence**: `docs/04-changes-and-questions.md:94` still records D18-4=C as "integers"; `git show origin/sk-018:.../S27-decimal-evidence.md:3` records the later one-decimal approval; no `S27-PO-2` text exists in `docs/` on `main`.
- **Status**: REGISTER GAP recorded, not repaired (this task forbids editing docs/04). F18 cites the branch evidence as level-4 authority and labels it a gap.

## F18-C-09 — Renewal productivity credit (PRD/013) superseded by S42-PO-2 Q3=A

- **Old**: `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:191` "Renewals require actually delivered new plans to generate a new credit"; `specs/013-freeze-renewal-refunds/spec.md:443` "renewal productivity only for genuinely new delivered plans".
- **Now**: S42-PO-2 (`s42-po-1.verbatim.txt:7,15` architect mapping Q3=A) — renewals activate at recording and earn no unit; F19 pending FR-005.
- **Status**: RESOLVED-BY-PO, owned by F19. F18 encodes no renewal rule at all (F18-FR-001/010) and does not restate F19's lifecycle.

## F18-C-10 — Who owns the revision's nutrition content

- **Evidence**: F19 pending `specs/019-plan-core/data-model.md:34` says `plan_revisions` records "domain content"; F19 does not define the nutrition shape.
- **Status**: OPEN-TECH. This draft places the nutrition document in a 1:1 F18 side table keyed to `(workspace_id, plan_id, revision_id)` (data-model §1) so lifecycle stays F19 and the nutrition shape stays versioned. If F19 stores content inline, the F18 shape remains authoritative and 1:1; the choice is implementation-time and must not duplicate the document.

## F18-C-11 — Contributor attribution required by PRD-06 but absent from F19

- **Evidence**: `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:188` "other trainer contributions are recorded independently"; old F18 FR-010b; F19 pending spec/data-model contain no contributor table or requirement.
- **Status**: OPEN-TECH. F18-FR-018 retains the requirement with workspace-scoped immutable rows and nutrition action codes; if F19 adds shared attribution, F18 consumes it and drops the duplicate. Not a PO question; F18 must not lose the requirement.

## F18-C-12 — Historic migration range reserves nothing

- **Evidence**: `docs/03-roadmap.md:63-65` lists Plan Core `2026110620…`, F17 `20261107*`, F18 `20261108*`; F19 pending `spec.md:91` records the ranges as obsolete; `origin/sk-018:plan.md:51` reserved `20261108000000-20261108235959`.
- **Status**: HISTORIC. F18 reserves no version and requires a fresh all-ref scan (F16 FR-032 pattern).

## F18-C-13 — F16 video host rule vs D18-6 recipe links

- **Evidence**: F16 FR-014 (`specs/016-exercise-food-catalogs/spec.md:127`) allows HTTPS YouTube only and explicitly rejects `docs.google.com` for **exercise videos** (D16-3); D18-6 (`docs/04:95`) allows **YouTube or Google Drive** for the optional recipe/preparation link.
- **Status**: VERIFIED — different fields, different approved rules. F18 does not import the exercise-video host ban into nutrition recipe links, and does not add hosts beyond "YouTube or Google Drive". The exact host allowlist is implementation-level and contract-tested.

## F18-C-14 — Old requirement/task identifiers and branch status

- **Evidence**: `origin/018-nutrition-planner` and `origin/sk-018` both carry FR-001..FR-013, T001..T025 and "implementation in progress" statuses; `origin/main` has no `specs/018-nutrition-planner/` and no F18 code (verified: `git ls-tree -r --name-only origin/main -- specs/018-nutrition-planner` is empty; `lib/i18n/messages/{ar,en}.ts` contain only the generic `nav.nutrition` label and F16 catalog strings, no planner/template/export copy).
- **Status**: HISTORIC. Identifiers are renumbered (F18-FR-001..022, T001..T027); no task is inherited as complete; every historic tick is disregarded.

## F18-C-15 — S24-PO-3 stable-id decision not on `main`

- **Evidence**: old `plan.md:77` and `tasks.md:83` cite "S24-PO-3 'Keep unless food changes (Recommended)'"; no such text exists in `docs/` on `main` (grep returns nothing).
- **Status**: REGISTER GAP + INFERRED (matrix I9). F18 requires ids to survive quantity/note/reorder edits and to change on food replacement because D18-9=A's "valid" test is id-based; the exact wording is not claimed as a direct PO record.

## F18-C-16 — Old SC-006 performance numbers

- **Evidence**: `origin/sk-018:specs/018-nutrition-planner/spec.md:111` (Worker CPU p95 ≤ 5 ms, DB/API p95 ≤ 300 ms, 350 MB trigger); debate R10/R3 changed the CPU target twice.
- **Status**: HISTORIC / provisional. F18-SC-006 requires a pre-implementation envelope and re-benchmark; no number is adopted as acceptance.

## F18-C-17 — Old version-scoped selection copy rule vs D18-9=A

- **Evidence**: old FR-009 (`origin/sk-018:.../spec.md:92`) says: on publish, copy a version-scoped selection to the new version only when the client remains authorized and the same stable item and approved alternative ids both exist; otherwise no selection for the new version. D18-9=A (`docs/04:95`) says selections persist after edits while authorized and valid, otherwise coach default.
- **Status**: VERIFIED — consistent. D18-9=A is the authority; the old mechanism is retained as the implementation shape (F18-FR-012) with the added rule that selection ids are the only identity, and no selection ever mutates the revision.

## Summary

| Status                     |  Count | IDs                             |
| -------------------------- | -----: | ------------------------------- |
| RESOLVED-BY-PO             |      5 | C-01, C-02, C-07, C-09, S44-MCQ-F18-1 |
| RESOLVED-DESIGN / INFERRED |      3 | C-03, C-04, C-05                |
| VERIFIED                   |      2 | C-13, C-17                      |
| OPEN-MCQ                   |      0 | —                               |
| OPEN-TECH                  |      3 | C-06, C-10, C-11                |
| REGISTER GAP               |      2 | C-08, C-15                      |
| HISTORIC                   |      3 | C-12, C-14, C-16                |
| **Total**                  | **18** |                                 |

## S43 reconciliation (2026-11-10)

F18-MCQ-1..6 are resolved per S42-PO-8/S43-PO-1. S43-MCQ-A is resolved by S43-PO-5; exact prompt bytes are in contracts/copy-ai-prompt.md. S43-MCQ-B is resolved by S43-PO-2: per-item note in exports and copied prompt; client-selection totals only. The S43 review found no additional product conflict at that time; open technical items C-10/C-11 remain technical reconciliation, not product decisions.

## S44 review reconciliation (2026-11-10)

S44-PO-7 closes S44-MCQ-F18-1. Meal-level day applicability is removed: every meal remains visible on every day and contributes to that day's totals, with no Ready/publish rule based on day-type matching. The earlier draft assumptions and blocked question remain historical and are marked superseded in the spec decision register. Day types and carb cycling remain for unrelated nutrition behavior. No other open product decision was introduced.
