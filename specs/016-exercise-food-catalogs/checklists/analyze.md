## Specification Analysis Report

**Date:** 2026-11-03  
**Analysed commit:** `a7571707b02ccf9418ff293ebe30f6de98abe16d`
**Scope:** Static Spec Kit analysis and code/test traceability. No test suite was run.

### Entry check — mandatory Spec Kit gate

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then scenarios for scope | PASS | `spec.md` FR-001–FR-021 (including FR-016a); SC-001–SC-005; five user stories with Given/When/Then scenarios. |
| Clarifications / PO decision register and explicit no-open-ambiguities statement | PASS | `spec.md` Approved PO decisions states no D16 item remains open; decisions S20-03–S20-13 are recorded in `docs/04-changes-and-questions.md`. |
| Plan covers scope; tasks tagged with FR IDs | PASS | `plan.md`; `tasks.md` T001–T040 now each has one or more explicit FR tags. |
| Dated analyze checklist after last spec/plan/tasks change, zero open CRITICAL/HIGH | PASS | This analysis is dated after the task-tag commit; 0 CRITICAL and 0 HIGH findings. |
| Spec Kit prerequisites | PASS | `.specify/feature.json` in this worktree contains `{"feature_directory":"specs/016-exercise-food-catalogs"}`; `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireSpec -RequireTasks -IncludeTasks` resolves `specs/016-exercise-food-catalogs` and lists `tasks.md`. The pointer is machine-local and ignored by `.specify/.gitignore`, as designed by Spec Kit 1.2.3. |

### Inventory

Present: `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/catalog-api.md`, `contracts/export-read-isolation.md`, `quickstart.md`, `debate.md`, `ui-handoff.md`, `benchmark-s25.md`, `release-gate-s25.md`, `S27-library-evidence.md`, `checklists/analyze.md`, `checklists/requirements.md`, and `traceability.md`. No `## Clarifications` session; approved decisions are cited in the spec and decision register instead.

### Findings

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| A3 | Acceptance | MEDIUM | `spec.md` SC-003; `tasks.md` T024/T028/T029 | The “under 60 seconds of interaction” criterion has no identified timed interaction test or measurement evidence. | Add measurement evidence or ask the PO whether this criterion should be measured differently; do not infer success from functional tests. |
| A4 | Acceptance | MEDIUM | `spec.md` SC-005; `benchmark-s25.md`; `release-gate-s25.md` | Local database benchmark covers query plans/latency, but Worker CPU p95 and hosted HTTP/API p95 remain open production gates. | Keep production gate open and capture the specified full-path measurements before production. |

### Requirement coverage

| Requirement | Task coverage | Notes |
|---|---|---|
| FR-001–FR-004 | T006–T023, T037–T040 | Exercise taxonomy, identities, authorization, variations, workspace scope, lifecycle and UI; tags now explicit in `tasks.md`. |
| FR-005–FR-010 | T009–T030 | Food shape, add/edit permissions, validation, duplicates and governance; tags now explicit. |
| FR-011–FR-014 | T007, T011–T016, T018–T023, T025–T030, T037–T040 | Lifecycle, reads, privacy, audit, video resolution and host policy; tags now explicit. |
| FR-015–FR-016a | T002–T003, T006, T011, T014–T016, T018–T021, T025–T027 | Normalization, bounded search, idempotency/locking, taxonomy; tags now explicit. |
| FR-017–FR-021 | T001–T002, T004–T007, T011–T016, T024–T036, T040 | Denials, UI, no-seed, snapshots, quotas and benchmark; tags now explicit. |
| SC-001–SC-005 | T007, T018–T021, T024–T036, T040 | Test/evidence coverage exists; SC-003 timing and SC-005 production measurements remain partial. |

### Constitution alignment

No direct conflict found with Constitution v1.4.0 Principles I–IX. The plan specifies workspace isolation, immutable versions, least privilege, approved scope, bilingual/accessibility requirements, idempotency and test gates.

### Unmapped tasks

None. T001–T040 each carry explicit FR tags. FR coverage is 22/22 (100%) by explicit task tags; no task without a requirement mapping was found.

### Metrics

- Functional requirements: 22 identifiers (FR-001–FR-021 including FR-016a); SCs: 5.
- Tasks: 40.
- Explicit FR-tag coverage: 22/22 (100%).
- Findings: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 0 LOW.
- Ambiguity: 0 unresolved product ambiguities found in the approved F16 decision set.
- Duplication: 0 material duplicate requirements found.

### Verdict

**PASS WITH MEDIUM follow-ups.** The mandatory entry gate passes; no open CRITICAL/HIGH findings remain. SC-003 timing evidence and production Worker/API measurements for SC-005 remain open.
Static analysis only; no test suite was run. Test source and prior evidence document references are in `traceability.md`.

### History

#### Round 1 — analysed `f903683e659d9a0aa5d62b98f0917b8744a4d4f1` on 2026-11-03

Verdict: FAIL. Findings then: A1 HIGH (`.specify/feature.json` missing), A2 HIGH (tasks T001–T040 lacked FR tags), A3 MEDIUM (SC-003 timing), A4 MEDIUM (SC-005 production measures), A5 MEDIUM (no tests run by this static lane), A6 LOW (`checklists/requirements.md` missing). 25 traceability items were VERIFIED; SC-003 and SC-005 were PARTIAL; none were NOT-FOUND or DEFERRED. Repairs since that round: added task FR tags; created the local Spec Kit feature pointer in the format emitted by `Save-FeatureJson`; added the requirements checklist. The task-tag change was committed as `a7571707b02ccf9418ff293ebe30f6de98abe16d`.

## S30-PO-9 amendment analysis

**Date:** 2026-11-03 (revalidated after T041 blocker detail)
**Scope:** Spec/plan/task amendment for PO-approved exercise UI governance placement.
**Authority:** S30-PO-9 verbatim in `spec.md` and `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md` (S30-Q17).
**Clarifications:** No open PO ambiguity remains about exercise Add/Edit, Remove placement, confirmation, Merge/Restore visibility, permission matrix, or historical preservation. Existing approved keys are available for action, confirm/cancel and result: `catalog.editorRemove`, `dialog.confirm`, `dialog.cancel`, `catalog.editorLifecycleRemoved`; no new copy is needed.
**Traceability:** S30-PO-9 UI requirements are captured in the User Story 4 acceptance scenario, the S30-PO-9 plan subsection, and new FR-tagged task T041.

| Finding | Severity | Evidence | Disposition |
|---|---|---|---|
| Exercise Detail Remove cannot safely call an existing backend operation in either scope without expanding backend scope. The global transition requires a revision omitted from the detail projection; the workspace lifecycle RPC is not implemented. | MEDIUM | `contracts/catalog-api.md`; `lib/catalog/server.ts`; `supabase/migrations/20261106113000_catalog_exercise_lifecycle_merge.sql`; `supabase/migrations/20261106125000_catalog_exercise_detail.sql`; S30-PO-9 prohibits backend RPC/migration changes for this task. | PO-DECISION-NEEDED recorded in lib12 report. T041 remains unchecked until the full role matrix and mutation are verified. No backend guess encoded. |

**Verdict:** PASS WITH MEDIUM blocker. 0 open CRITICAL, 0 open HIGH. Spec Kit entry criteria remain met; implementation is limited to independently supported UI behavior pending PO direction on workspace backend scope.

## S31-PO-1 Q3 amendment analysis

**Date:** 2026-11-04 (after S31 spec, plan, task, contract and traceability edits)
**Authority:** PO decision S31-PO-1 Q3, quoted verbatim in `spec.md` and the lib13 brief; S30-PO-9 remains binding.
**Scope:** Global PO Remove projection and workspace Remove for PO explicit workspace or WO/Trainer current own-workspace `coaching_work`; workspace lifecycle revision projection, CAS/idempotency/audit, preservation; Detail-only UI with confirmation and no Restore/Merge controls.
**Clarification:** `spec.md` records the answer and option text verbatim. No open ambiguities remain for authorized behavior. Workspace Restore is explicitly out of scope.

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then | PASS | `spec.md` FR-002/FR-011 and User Story 4 scenario specify role matrix, confirmation, CAS, audit, search exclusion and preservation. |
| Clarification source and no-open-ambiguities statement | PASS | `spec.md` Clarifications — S31 cites S31-PO-1 Q3 verbatim and states no open ambiguities. |
| Plan and FR-tagged task IDs | PASS | `plan.md` S31 amendment; `tasks.md` T042–T044 tagged with FR-011 and related FRs; T041 end-to-end pending. |
| Analysis date newer than spec/plan/tasks | PASS | This 2026-11-04 amendment follows all those edits. |
| Open CRITICAL/HIGH findings | PASS | 0 CRITICAL, 0 HIGH. |

| Finding | Severity | Disposition |
|---|---|---|
| Workspace detail must preserve tenant identity if two workspaces contain the same UUID-shaped identity. | MEDIUM | T042/T043 require composite workspace key, explicit scope, same-ID tenant test and tenant-key mutation. |
| Mutation behavior must follow established operation-key and audit conventions. | MEDIUM | Contract specifies CAS, replay, one audit event and error parity; integration tests and four executed mutants are required by T043. |

**Verdict:** PASS WITH MEDIUM implementation risks. Spec Kit entry gate satisfied for T042–T044; no implementation began before this amendment analysis. Static analysis only; execution evidence belongs in traceability after tests pass.

## S32 lib14 evidence revalidation

**Date:** 2026-11-04 (after T041-T044 evidence updates in tasks.md and traceability.md).
**Scope:** Verification-only update for the existing S31-PO-1 Q3 approved scope; no requirement, plan, or task behavior text changed. Runtime launch diagnosis and test evidence are in the S32 run report.

| Check | Result | Evidence |
|---|---|---|
| Spec, clarification, measurable scope | PASS | spec.md FR-011 and User Story 4; S31-PO-1 Q3; explicit no-open-ambiguities statement. |
| Plan/task coverage and FR tags | PASS | plan.md; T041-T044 in tasks.md; each task cites executed test evidence. |
| 0 open CRITICAL/HIGH findings | PASS | Static scope recheck; 0 CRITICAL and 0 HIGH. Existing medium implementation risks were exercised by accepted lifecycle tests/mutants. |
| Implementation verification | PASS | Focused unit 37/37, Stack C integration 10/10, Playwright/axe 16/16; final full gates required on final head. |

**Verdict:** PASS. No product decision or design gap was introduced by verification/test evidence updates.

## S33 lib16 remediation re-analysis

**Date:** 2026-11-04 (after the S33 changes to `spec.md` and `tasks.md`).
**Scope:** Existing open PR #43 review fixes T045–T047. No new product behavior, UI surface, migration, or permissions are introduced. Authority: S30-PO-9 / S31-PO-1 Q3 recorded in `spec.md`, and `contracts/catalog-api.md`.
**Clarifications:** The only exercise/catalog Restore capability retained by this spec is global PO Restore through the backend/API. Workspace exercise Restore is not authorized. Exercise UI has no Restore or Merge control; Remove remains on Exercise Detail. No open ambiguities remain for this remediation.

| Entry check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then for touched scope | PASS | Existing FR-001 (exercise equipment) and FR-018 (bilingual editor/accessibility) plus User Story 4 scenarios in `spec.md`; no new FR or SC introduced. |
| Clarifications and explicit no-open-ambiguities statement | PASS | `spec.md` Clarifications—S31 (S31-PO-1 Q3); this S33 analysis states the Restore boundary and no open ambiguities. |
| Plan covers scope; tasks have IDs tagged to FRs | PASS | `plan.md` Application and UI; `tasks.md` T045 [FR-001], T046 [FR-018], T047 [FR-002, FR-011, FR-018]. |
| Analyze follows last spec/plan/tasks change; 0 open CRITICAL/HIGH | PASS | This re-analysis follows the S33 `spec.md`/`tasks.md` edits. 0 CRITICAL, 0 HIGH. |

### Scope findings

| ID | Severity | Location | Finding / disposition |
|---|---|---|---|
| S33-F16-A1 | MEDIUM | `spec.md` User Story 4 and FR-011 | The former workspace-staff Restore clause conflicted with S31 and `contracts/catalog-api.md`. Corrected to retain global PO backend/API Restore only; no behavior added. |
| S33-F16-A2 | LOW | `ui-handoff.md` PO edit row and Exercise Detail inventory | Handoff now matches current PO editor absence assertions (`catalog-ui.spec.ts`) and places Remove at Exercise Detail per T044. |

Existing MEDIUM follow-ups remain unchanged: SC-003 lacks timed interaction evidence and SC-005 hosted Worker/API performance measurements remain a pre-production gate. They do not block these in-scope CodeRabbit fixes.

**Verdict:** PASS. No new open CRITICAL/HIGH findings, product decisions, or design gaps. Existing approved behavior only. Static Spec Kit analysis; focused unit/component execution is recorded separately in `traceability.md`.

### S33 task evidence revalidation

**Date:** 2026-11-04 (after T045/T046 evidence and checkbox updates in `tasks.md`). The S33 scope, authority, requirements, and findings above are unchanged.

| Check | Result | Evidence |
|---|---|---|
| Plan/task coverage and FR tags | PASS | `plan.md` plus checked T045 [FR-001] and T046 [FR-018]; documentation task T047 [FR-002, FR-011, FR-018] remains open pending its documentation commit/evidence record. |
| 0 open CRITICAL/HIGH | PASS | Static S33 scope recheck; 0 CRITICAL and 0 HIGH. |
| Implementation evidence | PASS | RED/GREEN for both code fixes; commits `6da1574` and `5e51afa`; focused unit/component tests 29/29. |

**Verdict:** PASS. Analyze remains newer than the last `spec.md`, `plan.md`, and `tasks.md` edits. T047 does not introduce behavior and stays pending documentation verification.
