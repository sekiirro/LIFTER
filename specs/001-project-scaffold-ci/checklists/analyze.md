# Spec Kit Analyze ? Self-hosted CI Infrastructure

- Date: 2026-11-03 (S30 refresh after accepted patch and CI-c evidence review)
- Analyzed implementation commit: `80e1a1eccc6b8dad1fbf2996c23ebd0dc8374b7b` (`origin/ci-self-hosted-runner`).
- Scope: accepted self-hosted CI additions under `specs/001-project-scaffold-ci/`. CI-c evidence below applies only to SHA `80e1a1e`.
- Method: `.claude/skills/speckit-analyze/SKILL.md`; static artifact, test-source, run-record and port-evidence review. No test suite/CI job or operational control was run by this review.

## Inventory and entry check

| Artifact | State | Result |
|---|---|---|
| `spec.md` | Present | FR-001..020, SC-001..011 and Given/When/Then scenarios include the S28-PO-3 infrastructure scope. PASS. |
| Clarifications | Present | Cites S28-PO-3 and the infrastructure rules; no additional product behavior inferred. PASS. |
| `plan.md` | Present | Self-hosted isolation, visibility, fallback, startup and release plan present. PASS. |
| `tasks.md` | Present | T016..T020 tagged to FR-015..020. All remain unchecked. PASS. |
| `research.md`, `quickstart.md`, `contracts/health.md`, `checklists/requirements.md` | Present | Existing artifacts inspected. |
| `checklists/analyze.md`, `traceability.md` | Present | Refreshed in this review. |

Entry gate: numbered FR/SC/GWT PASS; Clarifications PASS; plan/tasks coverage PASS; Analyze freshness PASS but 0-open-HIGH criterion FAIL because reboot evidence remains open. Do not start/accept new implementation tasks until the HIGH is resolved.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Acceptance / reliability | HIGH | FR-017 / SC-008; `docs/ci-self-hosted.md`; `SESSION_HANDOFF.md:54` | Automatic start after reboot is required. Current Scheduled Task is logon-triggered; the AtStartup trigger was not configured and a real reboot test remains pending the PO maintenance window. | Keep T018 open until the authorized window and reboot evidence prove automatic startup. |
| A2 | Exact-head evidence | MEDIUM | FR-015/016, SC-006/007; CI-c `result.json`, `steps.log:10,12-14`, `port-leak-evidence.md` | Push 41570315774 attempt 1 and PR 41570323648 attempts 1+2 all succeeded on `80e1a1e` (19 validate / 23 integration / 22 storage steps). CI-c listener samples show no `wslrelay` on lane ports and permitted forwarding on app port 3990 only. PR #45 is CHANGES_REQUESTED with four open threads; its head is expected to move, so the evidence cannot close T016/T017 for the eventual final head. | Keep T016/T017 open; repeat evidence on the final PR head. Do not generalize these records beyond `80e1a1e`. |
| A3 | Operational controls | MEDIUM | FR-019/020; `docs/ci-self-hosted.md`; `SESSION_HANDOFF.md:119`; `s29-startup-prompt.md:79` | Runner-offline-while-PUBLIC and CI-window lock/watchdog/restore rules are documented, but this review did not find a complete observation log proving every interval/window. | Keep T019/T020 open and retain per-window evidence. |
| A4 | Coverage history | LOW | `tasks.md` T012 and T016..T020 | T012 describes the hosted baseline; the self-hosted extension is tracked in distinct FR-tagged tasks. | Keep the extension tasks separate and unchecked until acceptance evidence is complete. |

## Coverage and constitution

All 6 self-hosted FRs and 6 SCs map to T016..T020 (12/12 = 100%). Constitution v1.4.0 principles I, III, IV, VII and IX reviewed; no conflict identified. Run and isolation evidence is specific to `80e1a1e`; T016/T017 remain open for a future PR head. T018 remains open for reboot; T019/T020 remain open for operational records.

## Static traceability

`traceability.md`: 0 VERIFIED, 7 PARTIAL, 5 NOT-FOUND. Tests and evidence names were inspected statically; this review did not run tests or CI. CI-c records are architecture-supplied evidence and are not represented as runs performed here.

## Verdict

**FAIL** ? 0 CRITICAL, 1 HIGH, 2 MEDIUM, 1 LOW. The reboot auto-start requirement remains unproven. PR #45 has four open threads and may move from the evidence head; the exact-head CI-c evidence is recorded but does not close T016/T017 for its eventual final head.

## History

- **S30 refresh:** applied architect-accepted `001-ci-proposed-edits.patch`; recorded push 41570315774 attempt 1 and PR 41570323648 attempts 1+2, all successful on `80e1a1e` with 19/23/22 steps. `port-leak-evidence.md` reports no `wslrelay` on lane ports and permitted 3990 forwarding. Evidence applies only to `80e1a1e`; T016/T017 remain open because PR #45 is CHANGES_REQUESTED with four threads and its head may move; T018 remains open pending PO maintenance/reboot evidence. Static review only.
- The preceding review's finding that no exact-head green runs existed is superseded by the CI-c evidence above; earlier run evidence on `3ee93a7` is not substituted for these records.
