# Spec Kit Analyze - F4 Authentication, S36 round 3

- Date: 2026-11-06 17:59 UTC; after the latest changes to spec.md, plan.md, tasks.md and traceability.md.
- Worktree branch: speckit-004-staff-recovery; pre-commit base snapshot: e8654695b8e8f325b47bbccdd65e3f24ea2896cd; target base: origin/main 8b44c59c00e1b7a9fb62aa00dd2bc3ccea58b97a.
- Method: cross-artifact static review of specs/004-auth/spec.md, plan.md, tasks.md, traceability.md and .specify/memory/constitution.md (VII, VIII, IX). Spec Kit prerequisites passed using SPECIFY_FEATURE_DIRECTORY=specs/004-auth. No tests, implementation, stack or CI jobs were run as part of Analyze.
- Entry check: PASS. spec.md has numbered FR-001..FR-030, measurable SC-001..SC-015 and Given/When/Then scenarios for US1..US5, including direct-API and exact-copy cases. Clarifications/PO register explicitly says open ambiguities remain. plan.md covers this scope; T033..T049 are tagged to requirements; T033 is tagged FR-030 and T049 is positioned before implementation tasks.
- Classification: CRITICAL = constitution or PO conflict; HIGH = unaddressed PO-worded/security requirement; MEDIUM = open decision or technical/security design gate; LOW = record hygiene.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation / blocked |
|---|---|---|---|---|---|
| NF-1 | Auth API bypass | HIGH (PO-blocked) | spec.md FR-019, FR-024, FR-030; plan.md provider-boundary controls; tasks.md T049 | Direct anon-key /recover can bypass app eligibility, the five-per-account rolling-hour cap and request audit. FR-030 requires provider-boundary enforcement; the plan specifies a local Send Email hook candidate and limits; T049 adds direct endpoint negatives. Remaining HIGH is solely PDN-F4-7-13: whether any send path may proceed before that control or the session-lifetime blocker is in place. | Keep HIGH and implementation/send gated until the PO answers PDN-F4-7-13. Requirement and negative-test task are specified; no hosted Auth change is authorized. |
| NF-2 | Auth API bypass / audit overclaim | HIGH (PO-blocked) | spec.md FR-025, FR-030; plan.md provider-boundary controls; tasks.md T049 | A recovery access token can call updateUser directly and bypass the application completion audit. FR-025 now scopes its two-phase guarantee to the application path; the local Auth boundary requirement and candidate gateway/GoTrue extension are recorded, with direct-call tests in T049. Remaining HIGH is solely PDN-F4-7-13, the PO release-control/risk-acceptance choice. | Keep HIGH and completion gated until the PO answers PDN-F4-7-13. Do not claim cross-service atomicity. |
| NF-3 | Gate consistency | FIXED | tasks.md T033; traceability.md | T033 now explicitly gates T034..T046 on PDN-F4-7-12 and PDN-F4-7-13 as applicable. | Fixed in this round. |
| COPY-1 | Exact copy scope | MEDIUM | spec.md FR-027, FR-029, PDN-F4-7-06; tasks.md T042/T042b; traceability.md | S36-R6 closes only invalid/expired reset-link and generic confirmation strings. Those four source strings are copied into FR-029, and T042b requires byte equality for catalogs and rendered output. Remaining F4 strings are explicitly listed in PDN-F4-7-06. | Keep all other copy PO-blocked; do not infer additional approved text. |
| PDN-12 | User response after completion append failure | MEDIUM | spec.md FR-025(b), PDN-F4-7-12; tasks.md T033/T045 | Response choice remains open; FR-025 states the intent/audit guarantee is app-path-only. | Keep T045 response branch gated; no default selected. |
| CARRY | Existing open findings | MEDIUM/LOW | spec.md, plan.md, tasks.md, traceability.md | Prior open items remain: PDN-F4-7-01..11 as applicable, Sol Medium critique, provider behavior tests, AT-1/AT-2, Constitution row-I confirmation, external SMTP selection and existing traceability gaps. Previously resolved S35-R5 T1/T2 stay fixed on the app path. | Carry forward unchanged; no new decisions encoded. |

## Coverage summary

- FR-016..FR-030 each map to at least one task; FR-029 maps to T042b and FR-030 to T049.
- SC-008..SC-015 each map to a task; SC-014 maps to T042b and SC-015 to T049.
- US5 scenarios 1..11 map to requirements and tasks.
- No tasks were ticked; no tests were run.

## Verdict

- Open CRITICAL: **0**.
- Open HIGH: **2**, NF-1 and NF-2; both are blocked solely by unanswered PO choice PDN-F4-7-13. Their requirement, candidate boundary controls and negative-test task are specified. If the local boundary cannot enforce both public Auth routes, reopen the technical finding before implementation acceptance.
- Implementation gate: **FAIL / blocked** for ND-F4-7 until applicable PO decisions, remaining copy approvals, Sol Medium critique, provider-boundary control selection and security review are complete.
