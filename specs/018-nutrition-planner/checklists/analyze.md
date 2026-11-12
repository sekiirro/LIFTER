# Spec Kit Analyze — F18 nutrition planner

**Analyzed:** 2026-11-11 05:40 UTC
**Method:** Rechecked spec.md, plan.md, tasks.md, nutrition API/document and template-assignment contracts, data-model.md, traceability.md, research decision matrix/conflicts/Section B assessment, and S43-PO-5 / S44-PO-7 / architect mappings S43-R6, S43-R10 and S44-R7. This pass follows the Greptile P2 thread `PRRT_kwDOVYgYQ862AhVE` on head `d742eb5a` (template-assignment test 11) and reconciles the concurrent Assign single-pair race with the existing zero-copy rejection; it also retains the earlier CodeRabbit PR #79 fixes (`PRR_kwDOVYgYQ88AAAABXM9hLA`, head `f588e222`).

## Entry check

- PASS — spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the edited requirements, including containing-day meal visibility, independent Meal Notes/Food Notes edits, display-only rounding, publish replay before eligibility, and the F18-FR-011/F18-FR-012 selection write paths.
- PASS — Clarifications records S44-PO-7 byte-exact, labels architect mapping (S44-R7) separately, closes S44-MCQ-F18-1, and states no open product ambiguities for this change. The CodeRabbit fixes below reconcile existing approved requirements; none adds a product decision.
- PASS — plan.md describes the touched scope; tasks T001, T002, T005, T008, T021 and T025 are tagged to the affected FR/SC ids without renumbering.
- PASS — Analyze is dated after the final spec.md, plan.md and tasks.md edits.

## Findings

- CRITICAL: 0 open.
- HIGH: 0 open.
- MEDIUM: 0 open product decisions. Existing OPEN-TECH reconciliation entries C-06, C-10 and C-11 remain explicitly tracked in research/conflicts.md; they are not new behavior decisions.
- LOW: no cross-artifact or identifier mismatch found in the touched scope, including the corrected daily-total wording in plan.md §3 and this checklist's cross-artifact decision below.

## Cross-artifact decisions and task status

- S44-PO-7 removes meal applicability conditions and equivalent meal/day-type filtering. Each meal is visible on, and counted only in, the day that contains it: the single implicit day for `single_day`, or its own `days[]` entry for `seven_day`. A meal never crosses day boundaries, so days holding different meals have independent totals; plan.md §3 now says each day's total sums only that day's own meals. No Ready/publish rule depends on training/rest-day matching, and the seven-day fixture with different meals settles the result.
- Versioned content keeps exact stored computed values with display-only half-up rounding once; no stored or intermediate rounding exists anywhere, so the double-rounding goldens are unambiguous.
- Template root operations carry full target identity in the contract: `workspace_id` + `template_id` for workspace templates and `template_id` for global templates, plus `expected_version` where the version is compare-and-set checked; identity and version are part of the canonical request hash. This applies to version, retire and Make it Global, so `expected_version` alone never selects a target.
- Serving identity follows F16: `food_serving_units` is keyed by `(food_id, food_version, unit_key)` and has no separate row id. F18's `servingId` is that `unit_key` scoped to the food version, the snapshot key is `food:<food_id>@<version>#serving:<unit_key>` with RFC 3986 percent-encoding of the key, and no basis token, positional index or fabricated id can stand in for a serving. The same wording is used in the data model snapshot map and in F18-FR-002/F16 boundary, so no "serving-row id" claim remains.
- Selection writes have exactly two authorized paths with direct DML revoked from every role: the self-authorized selection RPC and the `SECURITY DEFINER` publish carry-forward defined by F18-FR-012. Compiled with F18-FR-011; a carried row preserves the originating client as `created_by` (never the staff publisher), and the publish path also writes the new revision's counter in the same transaction.
- Publish replay is resolved after authorization and before live subscription eligibility, matching F19: an exact authorized replay returns its original receipt even if entitlement has since expired; the current-subscription precondition applies only to a new operation key.
- T021's mutation now tightens a recorded threshold below the measured result so the benchmark fails; relaxing a passing threshold is no longer named as the mutation.
- Assign `All × All` gives each uninitialized workspace one copy of each selected active global template, so two active templates yield two copies, not one.
- The copy-ai-prompt contract names the approved source archive, its byte size and SHA-256, and the byte-comparison procedure; the approved EN/AR bodies are unchanged.
- Template assignment separates an exact-key replay (returns the original batch unchanged) from a new-key operation (includes a workspace created later that is still uninitialized).
- Concurrent Assign records a pair taken by another transaction as `skipped_existing` only while the later batch still creates at least one copy. If re-reading leaves zero copies (the single-pair race), the new operation is rejected before batch/state writes, matching F18-FR-008, F18-SC-007, template-assignment tests 6/11/12 and T014. This removes the former test 11 contradiction with the zero-copy rule; no new behaviour is added.
- Day types, including training/rest classification and carb-cycling targets, remain for nutrition behavior unrelated to meal visibility or totals.
- Meal Notes and Food Notes are distinct per-meal and per-item fields. Schema, editor and export tasks test independent edit/clear behavior; changing either preserves the other.
- S44-MCQ-F18-1 is closed by S44-PO-7. Its historical text remains marked superseded; it is absent from active requirements, contracts, plan and tests.
- All implementation tasks remain unchecked; this spec-only PR adds no implementation or executed test evidence. (Historical for the S43 pass — superseded by the Phase 0 section below: T001–T006 are ticked with executed evidence.)

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open product decisions. No open product ambiguity remains for the S44-PO-7 scope, the CodeRabbit PR #79 fixes or the Greptile concurrent-Assign reconciliation.

---

## Analyze — F18 Phase 0 implementation (S47/S48)

**Analyzed:** 2026-11-11T18:20:00Z
**Scope:** tasks.md Phase 0 only (T001–T006, all `[INDEPENDENT]`), authorized by PO S47-PO-13 ("F19 plan core, F17+F18 Phase 0 only"). No requirement text in spec.md, plan.md, data-model.md or contracts/ was changed by implementation; all tasks copied behavior already specified.

### Entry check re-validation (S29-PO-3 Q5)

- PASS — spec.md/plan.md unchanged since commit `15df5af6`; no requirement text was changed by Phase 0 implementation. tasks.md changed only by task ticks (`395895e0`) and the status-line corrections (`817cb314`; re-corrected under S48-PO-11/S48-R14); both are non-requirement bookkeeping, re-analyzed below.
- PASS — tasks.md `Status` line ("Implementation entry requires the F19 contract merged") is satisfied for Phase 0 by PO S47-PO-13, which authorizes exactly the Phase-0 `[INDEPENDENT]` tasks; Phase 1+ remain gated on F19.

### Findings

- CRITICAL: 0 open.
- HIGH: 0 open.
- MEDIUM: 0 open product decisions.
- LOW: T005's reference renderer labels (`Meal Notes`, `Food Notes`, `Totals`) are data-field codes inside a contract-test model, not shipped UI strings; the only display strings asserted are the S43-PO-2 approved side-note labels (P5) and the S43-PO-5 approved prompt bodies (byte-compared: P3 956 bytes, P4 1497 bytes, both equal to `runs/s43-po/copy-ai-prompt-approved.md`, SHA-256 `cc388b80…b421e03` as recorded in contracts/copy-ai-prompt.md). T003/T004/T005 encode their contracts as in-test reference models because their `Files:` lists name only test files; the DB tasks (T009/T010/T023) must satisfy these fixtures.

### Cross-artifact decisions and task status

- T001: frozen v1 validator with stable field codes; the D18-6 host allowlist (youtube.com, www.youtube.com, m.youtube.com, youtu.be, drive.google.com; HTTPS only; no credentials) lives in the implementation validator per contract §2.7 and is contract-tested for allowed and rejected hosts.
- T002: exact persistence at the declared-input product scale (no trailing-zero trimming, no storage rounding); half-up applied once at display from the exact value; `1.44996` → `1.4`; empty aggregates render `0`.
- T003/T004: publish and selection boundary semantics fixed as executable fixtures (ignore caller data, replay-before-eligibility, durable per-revision counter never reset, no-op writes nothing).
- T005: export/prompt fidelity contract as above; totals rows carry client-selection totals only.
- T006: assignment state machine — All never tops up a partial workspace; zero-copy rejection before writes; nutrition-only state.
- Tasks T001–T006 are ticked in tasks.md with executed evidence in traceability.md §4a; Phase 1+ tasks remain unticked and gated on F19.

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open product decisions. No new requirement text was added by implementation; no re-clarification needed.

---

## Analyze — F18 Phase 0 review fixes (S48-R13)

> **SUPERSEDED (2026-11-12):** S48-R13 is RETRACTED (architect error, disclosed to PO); PO decision **S48-PO-11** ("Show 10") with architect ruling **S48-R14** binds instead — commit `d8e48ea4` was reverted (`dc605d3d`) and the display behavior follows the merged data-model/S27 wording. See the S48-PO-11 section below and the F18 decision register (`research/po-decision-matrix.md`).

**Analyzed:** 2026-11-12T00:00:00Z
**Scope:** independent review `runs/s48-beam-f18-review/review.md` (range `8a846340..395895e0`); architect ruling S48-R13 (`runs/s48-arch/s48-architect-rulings.md`). No requirement text in spec.md/plan.md/data-model.md/contracts/ was changed.

### Review findings addressed

- Display threshold (review F18-PO-D1, resolved by S48-R13 as technical): `displayMacroGrams` now evaluates the below/at-10 g threshold on the exact persisted value — below 10 g exact renders one decimal even when half-up lands on 10.0 (9.96 → `10.0`, 9.95 → `10.0`, 9.94 → `9.9`); at or above 10 g exact renders an integer (10.00 → `10`, 10.04 → `10`). RED first (`t002-red-r13.log`, 2 goldens failing), GREEN 11/11 (`t002-green-r13.log`), mutation reintroduced the rounded-value threshold and failed the same 2 goldens (`t002-mutation-r13.log`), restored (`t002-green-r13b.log`). Commit `d8e48ea4` (Task: T002; FR: F18-FR-003). No SQL twin exists in Phase 0 (SQL parity is T008, gated on F19/stack). data-model.md §2's sentence "a below-threshold value that rounds to 10.0 renders `10`" describes the superseded behavior; it was not edited because S48-R13 orders an implementation/golden fix, not a spec change — recorded here as the authoritative reconciliation.
- M1: tasks.md:5 status line corrected — Phase 0 tasks T001–T006 ticked with executed evidence; Phase 1+ unticked and gated on F19.
- M2: traceability.md:5 scope line corrected — §4a records the executed Phase 0 evidence; §4b (ex-§4) is the historical pre-implementation state.
- M3 + LOW: analyze.md — the entry-check line now distinguishes spec/plan (unchanged since `15df5af6`) from tasks.md bookkeeping changes (ticks `395895e0`, status-line fix `d8e48ea4`-adjacent docs commit); the historical "all tasks unchecked" line is marked superseded by this section.

### Verification on the fix head

- RED: `runs/s48-glm-f18-fix/t002-red-r13.log` (2 failed | 9 passed). GREEN: `t002-green-r13.log` (11/11). Mutation: `t002-mutation-r13.log` (2 failed | 9 passed). Restore: `t002-green-r13b.log` (11/11).
- `npx tsc --noEmit` OK; `npx eslint lib/plans tests/golden --max-warnings=0` OK; full `npm test` 174 files / 2372 tests passed (`fix-tsc.log`, `fix-lint.log`, `fix-unit.log`).

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open product decisions. No requirement text changed; no re-clarification needed.

---

## Analyze — F18 display threshold per S48-PO-11 / S48-R14

**Analyzed:** 2026-11-12T01:30:00Z
**Scope:** PO decision S48-PO-11 (`runs/s48-po/s48-po-11.verbatim.txt`, SHA-256 `5e873a43fcd6111de30a0305378c0cdb06fe16bc3b4a7f0139f8bec95aec8b36`, verified) and architect ruling S48-R14; S48-R13 RETRACTED. This pass changed requirement text (F18-FR-003 clarified) — re-analysis required per the Spec Kit gate.

### Changes

- **Revert (S48-R14 step 1):** `git revert --no-edit d8e48ea4` → commit `dc605d3d` (normal revert commit). Code and goldens restored to 9.96 → `10`; the `'10.0'` → `'10'` branch in `displayMacroGrams` is back.
- **Goldens (S48-R14 step 1):** commit `9510710a` — 9.94 → `9.9`; 9.95 → `10`; 9.96 → `10`; **10.00 → `10` and 10.04 → `10` (new)**; 0 → `0`. RED for the new goldens: the reverted implementation already satisfies 10.00/10.04 (they lock the restored behavior; a RED was not achievable without a manufactured stub — documented here). Mutation on the `'10.0'` → `'10'` branch (S48-R14 step 1): removing the branch fails 2 goldens (`t002-mutation-r14.log`: "rounds finite-decimal ties half-up exactly once" and "follows the display thresholds"); restored (`t002-green-r14b.log`, 11/11). GREEN after revert and goldens: `t002-green-r14.log` (11/11).
- **Spec clarification (S48-R14 step 3):** F18-FR-003 gains the exact sentence "Clarified S48-PO-11 (S48-R14): a below-10 g value that rounds to 10.0 displays as the integer 10; zero displays as 0 (S48-PO-11)."
- **Decision register (S48-R14 step 3):** `research/po-decision-matrix.md` gains the S48-PO-11 section; the quoted PO words verified byte-equal with the verbatim file via Node (274 bytes, `bytecompare.js`).
- **Text citing R13 (S48-R14 step 2):** the analyze "review fixes (S48-R13)" section is marked SUPERSEDED with a pointer to S48-PO-11/S48-R14; traceability §4a T002 row now cites the revert, S48-PO-11 goldens and this pass's logs.

### Verification

- Golden run post-revert + new goldens: `runs/s48-glm-f18-fix2/t002-green-r14.log` (11/11); mutation `t002-mutation-r14.log` (2 failed | 9 passed); restore `t002-green-r14b.log` (11/11).
- Gates on the docs head: typecheck, lint, full unit, prettier — recorded in `final-*.log` (174 files / 2372 tests).

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open product decisions. F18-FR-003 wording now matches the merged data-model, S43-R9, the S27 evidence and the PO decision S48-PO-11; no open ambiguity remains for the display rule.
