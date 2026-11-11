# Spec Kit Analyze — F18 nutrition planner

**Analyzed:** 2026-11-11 01:48 UTC
**Method:** Rechecked spec.md, plan.md, tasks.md, nutrition API/document and template-assignment contracts, data-model.md, traceability.md, research decision matrix/conflicts/Section B assessment, and S43-PO-5 / S44-PO-7 / architect mappings S43-R6, S43-R10 and S44-R7. This pass follows the CodeRabbit CHANGES_REQUESTED review on PR #79 (`PRR_kwDOVYgYQ88AAAABXM9hLA`, 2026-11-11T01:06:00Z, head `f588e222`) and fixes seven inline findings, one outside-diff finding and one additional comment: template-root identity in the retire/version contracts, decimal-string scope, F16 serving identity mapping, the publish carry-forward write path and attribution, publish replay before eligibility, the T021 mutation, per-day total wording, and one copy per selected template.

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
- Serving identity follows F16: `food_serving_units` is keyed by `(food_id, food_version, unit_key)` and has no separate row id. F18's `servingId` is that `unit_key` scoped to the food version, the snapshot key is `food:<food_id>@<version>#serving:<unit_key>` with RFC 3986 percent-encoding of the key, and no basis token, positional index or fabricated id can stand in for a serving.
- Selection writes have exactly two authorized paths with direct DML revoked from every role: the self-authorized selection RPC and the `SECURITY DEFINER` publish carry-forward defined by F18-FR-012. Compiled with F18-FR-011; a carried row preserves the originating client as `created_by` (never the staff publisher), and the publish path also writes the new revision's counter in the same transaction.
- Publish replay is resolved after authorization and before live subscription eligibility, matching F19: an exact authorized replay returns its original receipt even if entitlement has since expired; the current-subscription precondition applies only to a new operation key.
- T021's mutation now tightens a recorded threshold below the measured result so the benchmark fails; relaxing a passing threshold is no longer named as the mutation.
- Assign `All × All` gives each uninitialized workspace one copy of each selected active global template, so two active templates yield two copies, not one.
- The copy-ai-prompt contract names the approved source archive, its byte size and SHA-256, and the byte-comparison procedure; the approved EN/AR bodies are unchanged.
- Template assignment separates an exact-key replay (returns the original batch unchanged) from a new-key operation (includes a workspace created later that is still uninitialized).
- Day types, including training/rest classification and carb-cycling targets, remain for nutrition behavior unrelated to meal visibility or totals.
- Meal Notes and Food Notes are distinct per-meal and per-item fields. Schema, editor and export tasks test independent edit/clear behavior; changing either preserves the other.
- S44-MCQ-F18-1 is closed by S44-PO-7. Its historical text remains marked superseded; it is absent from active requirements, contracts, plan and tests.
- All implementation tasks remain unchecked; this spec-only PR adds no implementation or executed test evidence.

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open product decisions. No open product ambiguity remains for the S44-PO-7 scope or the CodeRabbit PR #79 fixes.
