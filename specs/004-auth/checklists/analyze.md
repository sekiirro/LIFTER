# Spec Kit Analyze - F4 Authentication, S36 round 3

- Date: 2026-11-06 18:46 UTC; after the latest tasks.md review-driven edits.
- Worktree branch: speckit-004-staff-recovery; analyzed commit base: 3b11b6d35f5f84785a6fb106fa75cb0beb75efb8 plus the current uncommitted spec-only follow-up; PR target base main.
- Method: static cross-artifact review of specs/004-auth/spec.md, plan.md, tasks.md, traceability.md and Constitution VII, VIII, IX. Prerequisites passed for specs/004-auth. No implementation or tests were run.
- Entry check: PASS. FR-001..FR-030 are numbered; SC-001..SC-015 measurable; US1..US5 have Given/When/Then acceptance scenarios including exact-copy, direct-API global/per-account limits, client manual-link preservation and session revocation. PO register/Clarifications explicitly record remaining ambiguities. Plan and tasks cover the scope; T033, T042b, T049 and T050 have FR tags.

## Findings and review classification

| ID | Severity/status | Finding and disposition |
|---|---|---|
| NF-1 | HIGH; PO-blocked, thread stays open | Direct anon-key /recover could bypass eligibility, five/account/hour, global cap and request audit. FR-030 now requires boundary enforcement or denial of the public route. Plan offers local-only private-route/ingress and GoTrue-extension candidates that preserve built-in email/T044a; T049 tests, T050 implements. Sole open Spec Kit decision is PDN-F4-7-13. Runtime proof remains required before acceptance; no CodeRabbit thread resolution claimed. |
| NF-2 | HIGH; PO-blocked, thread stays open | Direct recovery-token updateUser could bypass completion audit. FR-025 is app-path scoped; FR-030 requires staff-only boundary protection, access-token/session enforcement, client-flow preservation and other-session revocation. Plan candidates and T049/T050 cover the paths. Sole open Spec Kit decision is PDN-F4-7-13; runtime proof remains required before acceptance. |
| NF-3 | FIXED | T033 explicitly includes PDN-F4-7-12 and -13; updated after review and remains gated. |
| CR-1 | FIXED | FR-030 and T049 now require the direct recovery path to enforce the PO-decided global cap or deny public requests; direct-after-cap test is specified. |
| CR-2 | FIXED in design | Removed Send Email hook as test-phase solution because it conflicts with FR-019 built-in delivery and T044a; plan specifies local private Auth route/ingress or GoTrue extension, preserving the built-in sender/template. |
| CR-3 | FIXED in design | FR-030, plan and T049/T050 preserve existing client manual-link completion while applying staff-only boundary controls. |
| CR-4 | FIXED | PDN-F4-7-07 now records the binding S35-PO-3 decision to revoke other sessions and enforce access-token controls; stale A/B options removed. |
| CR-5 | FIXED | T049 specifies first five account requests pass, sixth and later are blocked when other limits do not intervene. |
| CR-6 | FIXED | T050 assigns local boundary implementation after T033 and RED T049, preserving tests-first order. |
| CR-7 | FIXED IN SPEC | T049 separately tests public `/recover` denial when selected, or public-route enforcement if enabled, and exercises the first-five/sixth-and-later cap through the controlled app route. |
| CR-8 | FIXED IN SPEC | T048 matches the approved main-merge gate in docs/08 and the current brief: three executed green `pull_request` runs on the exact final head, including validate, integration, storage and secret scan; feature-branch push runs are not required. |
| COPY-1 | MEDIUM | FR-029 contains only the two approved states; T042b checks catalog and application output byte-for-byte. Other F4 strings stay PO-DECISION-NEEDED and are listed under PDN-F4-7-06. |

## Coverage and verdict

- FR-016..FR-030 and SC-008..SC-015 each map to tasks and traceability rows; FR-029/SC-014 map to T042b; FR-030/SC-015 map to T049/T050. No tasks are ticked.
- Open CRITICAL: **0**. Open HIGH: **2**, NF-1/NF-2, solely awaiting PDN-F4-7-13 for release posture. Controls and tests are specified; their implementation/runtime proof remains a required future acceptance gate under T049/T050. A PO risk acceptance does not count as enforcement evidence.
- ND-F4-7 implementation remains blocked by applicable PO decisions, remaining copy approvals, Sol Medium critique, boundary selection/feasibility and security review. No hosted Auth or SMTP change.
