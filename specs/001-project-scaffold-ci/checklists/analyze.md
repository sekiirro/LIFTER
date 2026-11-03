# Spec Kit Analyze ? Self-hosted CI Infrastructure

- Date: 2026-11-03
- Analyzed implementation commit: `80e1a1eccc6b8dad1fbf2996c23ebd0dc8374b7b` (`origin/ci-self-hosted-runner`).
- Scope: self-hosted CI under existing `specs/001-project-scaffold-ci/`; specification additions are in `001-ci-proposed-edits.patch`.
- Method: `.claude/skills/speckit-analyze/SKILL.md`; static cross-artifact and test/source review only. No CI or tests were run.

## Inventory and entry check

| Artifact | Present at base? | Hero/CI scope status |
|---|---:|---|
| `spec.md` | Yes | Baseline FR-001..014 and SC-001..005; proposed additions FR-015..020, SC-006..011 and G/W/T acceptance scenarios from S28-PO-3. PASS in proposed patch. |
| Clarifications | No | Proposed explicit statement that approved S28-PO-3 and the cited infrastructure rules leave no product ambiguity. PASS in proposed patch. |
| `plan.md` | Yes | Baseline plan; proposed self-hosted architecture, isolation, visibility, startup and release gates. PASS in proposed patch. |
| `tasks.md` | Yes | T001..T015 baseline. Proposed T016..T020 cover every new FR; all remain unchecked. PASS in proposed patch. |
| `research.md`, `quickstart.md`, `contracts/health.md` | Yes | Present; existing research and runbook evidence inspected. |
| `checklists/requirements.md` | Yes | Present. |
| `checklists/analyze.md` | Added | Current review; two open HIGH findings below. |
| `traceability.md` | Added | FR/SC-to-task, test/evidence/status table. |

## Mandatory entry check (proposed CI scope)

| Gate | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs and Given/When/Then | PASS (proposed) | FR-015..020, SC-006..011 and User Story 5 scenarios in the patch. |
| Clarifications / explicit no-open-product-ambiguities | PASS (proposed) | `spec.md` Clarifications cites S28-PO-3 and technical source records. |
| Plan covers scope; task ID tagged to every touched FR | PASS (proposed) | Self-hosted plan map and T016..T020 tags in patch. |
| Analyze dated after spec/plan/tasks; 0 open CRITICAL/HIGH | FAIL | This Analyze is dated after proposed edits but has two open HIGH findings A1/A2. Do not start/accept new implementation tasks until resolved. |

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Acceptance / reliability | HIGH | FR-017 / SC-008; `docs/ci-self-hosted.md`; `SESSION_HANDOFF.md:54` | PO requires automatic runner start after reboot. The current startup task starts at user logon; an AtStartup trigger was denied without elevation, and the real reboot test remains pending. | Keep T018 open until the authorized maintenance window and real reboot evidence prove automatic startup. |
| A2 | Isolation / exact-head verification | HIGH | FR-015/016, SC-006/007; `SESSION_HANDOFF.md:46-47`; `s29-queue.md:63-65` | The three successful self-hosted runs are on `3ee93a7`, not current head `80e1a1e`; final-head proof remains open, with a port-3000 WSL forwarding leak reported. | Keep T016/T017 open; close only with exact-head runs and port-leak evidence that preserves stacks and reserved lane ports. |
| A3 | Operational control evidence | MEDIUM | FR-019/020; `docs/ci-self-hosted.md`; `s29-startup-prompt.md:79` | Runner-offline-while-PUBLIC is documented, but no observation log proves compliance; no CI-window lock/watchdog timestamps were found. | Keep T019/T020 open and record each approved window. |
| A4 | Coverage history | LOW | `tasks.md` T012; proposed T016..T020 | T012 describes the original hosted baseline, while the self-hosted extension now has separate tasks. The staged changes leave the original task historical and map all new work explicitly. | Keep the extension in distinct FR-tagged tasks; do not check them until exact-head verification is executed and passed. |

## Coverage and constitution

All 6 proposed self-hosted FRs and 6 proposed SCs map to at least one T016..T020 task (12/12 = 100%). The existing baseline remains in scope and its workflow steps are still present. Constitution v1.4.0 alignment: Principle I is applicable to isolation of the dedicated CI engine and reserved ports; code tests cover configured ranges, but live stack preservation remains unproven. Principle III is supported by workflow `permissions: contents: read` and the documented unprivileged `lifterrunner` account; do not broaden runner permissions. Principle IV is satisfied by the approved S28-PO-3/S29-PO-3 scope; no new product behavior is inferred. Principle VII is supported by the workflow's secret-scan gate and private-runner visibility constraint; no secret values were accessed. Principle IX applies to job serialization and cleanup; exact-head run and port-release evidence remain open. No constitution conflict is identified; these evidence gaps remain blockers, not exceptions.

## Metrics and verdict

- Self-hosted FRs: 6; SCs: 6; new tasks: 5.
- Requirement/task coverage: 100% (12/12).
- Findings: 0 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW.
- Traceability: 0 VERIFIED, 7 PARTIAL, 5 NOT-FOUND, 0 DEFERRED (12 FR/SC rows).
- Verdict: **FAIL** ? two HIGH acceptance gaps remain: reboot auto-start and exact-final-head CI/isolation proof. No implementation was performed; the proposed gate requirements and open tasks are documentation only.

## History

- This is the first self-hosted CI Spec Kit compliance review. The earlier round's `ci-self-hosted-spec-gap.md` was a gap note; the present PR branch already contains the feature folder and baseline artifacts.
