# Spec Kit Analyze - F7 Encrypted Backups & Restore Test

- Date: 2026-11-03
- Analyzed source commit: `ed88574ae09c722b1f6ded4fc0b66122bbeb4f13` (`origin/main` at branch creation). Task FR tags are added in this documentation change.
- Method: static inventory, cross-artifact review, and source/test inspection. No test suite, Docker, Supabase, or stack operation was run.

## Inventory and entry check

- Present: `spec.md` (FR-001..008, SC-001..004 and Given/When/Then for the three stories), `plan.md`, `tasks.md`, `checklists/requirements.md`.
- Missing at base: `checklists/analyze.md`, `traceability.md`, and explicit `## Clarifications` section.
- Clarification state: plan `NEEDS DECISION` records F7-ND-1 storage path/key custody and F7-ND-2 first remote restore drill. The key remains PO-held offline and path is an operator argument; D20 says there is no cloud staging project, conflicting with the plan's staging-project assumption. New PO items are recorded in the round report.
- Plan/tasks: all 8 FRs map to task IDs; tasks now receive explicit FR tags. T001-T007 checkboxes are pre-existing and unchanged.
- Requirements gate: FR/SC/scenarios PASS. Clarification gate FAIL until the storage backup scope and restore target questions are resolved. Analyze has one CRITICAL and one HIGH finding.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Constitution / scope | CRITICAL | `scripts/backup/backup.mjs:56-58`; Constitution platform backup constraint; D-14 (`docs/04-changes-and-questions.md:20`); `specs/007-backups/spec.md:69-91` | D-14 and Constitution require database **and storage** backups. The current script aborts with `STORAGE_EXPORT_UNSUPPORTED` whenever any storage bucket exists; main now includes `branding-staging` and `branding-validated`. F7 has no FR, task, or asserting test for encrypted object export/restore. The backup command therefore cannot run against the current schema once those buckets exist. | Architect routing: D-14 already approves storage exports; route storage export/restore into F7 as a later Spec Kit cycle. No new PO decision is raised. |
| A2 | PO / plan inconsistency | HIGH | `specs/007-backups/plan.md:55-56`; `docs/04-changes-and-questions.md:26` | F7-ND-2 assumes a cloud staging project for the first remote drill, while D20 approves one cloud project and explicitly says there is no cloud staging project. Production is gated pending PO approval. | PO to choose an approved drill target; do not assume a staging project or use production without approval. |
| A3 | Clarification record | MEDIUM | `spec.md`; `plan.md:53-56` | No Clarifications session states which F7 operator inputs are resolved versus which release/deployment gates remain open. | Record only after the PO items are answered; keep key custody and operator-supplied path explicit. |

## Coverage and constitution

Task coverage is 8/8 FRs (100%) after adding `[FR tags]` tags; task checkboxes were not changed. Constitution VII and the platform rule requiring encrypted database and storage backups are not fully met by current F7 scope/implementation (A1). Other reviewed principles have no additional identified conflict.

## Traceability

`traceability.md` maps 8 FRs, 4 SCs, and the D-14 storage-scope gap. Result counts include the scope-gap row: 4 VERIFIED, 8 PARTIAL, 1 NOT-FOUND, 0 DEFERRED. Tests were inspected statically and not run. No test citation is inferred from a checked task alone.

## Verdict

**FAIL** ? 1 CRITICAL, 1 HIGH, 1 MEDIUM, 0 LOW. The D-14 storage-backup requirement is unrepresented and current code rejects backups when a bucket exists; the restore-target conflict also needs a PO decision.

## History

- First SK-A merged-feature review on `origin/main` `ed88574`; no earlier Analyze history existed.
