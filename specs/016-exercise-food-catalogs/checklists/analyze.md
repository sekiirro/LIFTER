# Analyze — F16 one-global-catalog redesign (S36 round 3, critique response)

- Date: 2026-11-06 21:32 UTC. Re-run after the CodeRabbit fixes; run after the last spec, plan and tasks change (commit `285f8236`). Round-3 changes after this record are limited to `critique-response.md` (not a spec, plan or task artifact).
- Method: speckit-analyze procedure (read-only on spec artifacts); this file is the dated record the entry check requires. Prerequisite check run with `SPECIFY_FEATURE_DIRECTORY` set to this feature (no `.specify/feature.json` in the worktree). No `.specify/extensions.yml` exists, so no hooks apply.
- Scope: round-3 critique response (`critique-response.md`); the S36-PO-2 answers; the open PO items A to I and 9; the architecture corrections in `spec.md` FR-014 to FR-035, `data-model.md`, `contracts/`, `plan.md`, `tasks.md`.
- Authority: S36-PO-2 F16 paragraph (quoted in `spec.md` Clarifications and `decision-register.md`); the critique at `C:/Users/NEW LAP/.lifter/runs/s36-sonnet-f16-critique/critique.md`.

## Entry check (Spec Kit gate, section 1)

| Box | Result | Evidence |
| --- | --- | --- |
| spec.md has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched scope | PASS | FR-001 to FR-035 (incl. FR-016a); SC-001 to SC-016 (SC-013 to SC-016 added this round); US6 scenarios 4 to 6 added this round. |
| Clarifications recorded, or a PO-decision register entry citing the PO source | PASS | `spec.md` Clarifications sessions S33-PO-4, S35-PO-3, S36-PO-1, S36-PO-2 and the round-3 session (no new PO answers). `decision-register.md` round-3 section cites the critique and each open item. "No open ambiguities" is NOT claimed: PO items A, B, C, D, E, F, G, H, I and 9 are open (see below). |
| plan.md covers the touched scope; tasks.md has task IDs tagged with FR IDs | PASS | `plan.md` round-3 sections; `tasks.md` T037 to T067 with FR tags and owners. |
| checklists/analyze.md dated after the last spec, plan and task change, with 0 open CRITICAL/HIGH | **FAIL** | This file is dated after `c870fcd1`. It has 1 open CRITICAL (A7) and 8 open HIGH PO-owned items (below). |

Result: **entry check FAILS**. No new implementation task may start. Spec and plan work, and the independent review fixes already approved, may continue.

## Findings

Severity follows the speckit-analyze heuristic. "Open" means it still blocks implementation. "Resolved" means the spec now states it, with the commit that does so.

| ID | Category | Severity | Location(s) | Summary | Status / recommendation |
|---|---|---|---|---|---|
| A7 | Constitution alignment (process) | CRITICAL | `.specify/memory/constitution.md` lines 148-151 (Mandatory Spec Debate; Sol Medium); `spec.md` Constitution Check; S36-PO-2 | S36-PO-2 authorizes a Sonnet 5.5 critique. The constitution mandates an independent Sol Medium critique and bans substitution outside the permitted tiers. By rule, constitution conflicts are CRITICAL. | **OPEN, PO-owned.** Exit condition: the constitution-mandated Sol Medium critique is completed, or a constitution-compliant amendment or approved deviation that satisfies the constitution's required process is recorded. Designation or PO ratification of the Sonnet substitution alone is not sufficient to close A7. Architect may not resolve it. Blocks all F16 implementation. |
| A8 | Ambiguity (PO) | HIGH | `decision-register.md` F16-MCQ-A; `spec.md` FR-003, FR-014; `contracts/catalog-api.md` planned remove/clear row | How an overridden field is reset (per field or whole override). | **OPEN PO-DECISION-NEEDED.** Blocks T046 (null semantics), T047 (remove/clear), T040 (reset UI), T037 (reset assertions). |
| A9 | Ambiguity (PO) | HIGH | `decision-register.md` F16-MCQ-B; `spec.md` FR-025; `data-model.md` alternatives row | Whether an empty alternatives list suppresses the canonical list. | **OPEN PO-DECISION-NEEDED.** Blocks T048 (validation), T047, T040 (empty state), T037. |
| A10 | Ambiguity (PO, data) | HIGH | `decision-register.md` F16-MCQ-C; `data-model.md` legacy `note` row; `plan.md` migration step 1 | Treatment of existing variation `note` text (up to 2000 characters) that the allowlist does not contain. Wrong choice reclassifies internal text as client-visible, or hides data. | **OPEN PO-DECISION-NEEDED.** Blocks T062 (note backfill) and the data steps of T053. T063 (structural rules) is not blocked. |
| A11 | Ambiguity (PO, tenancy) | HIGH | `decision-register.md` F16-MCQ-E; `spec.md` FR-030; `main` tenancy `has_workspace_access` (PO true in every workspace) | Which workspaces the PO may write overrides in. The schema has no personal-workspace concept. | **OPEN PO-DECISION-NEEDED.** Blocks T047 (PO authorization text), T055 (PO parity rows), T037 (routing assertions), T040 (routing UI). |
| A12 | Ambiguity (PO) | HIGH | `decision-register.md` F16-MCQ-F (re-framed from -8); `spec.md` FR-003, FR-026; FR-023 | Localization of overridden name, description and instructions (AR/EN). | **OPEN PO-DECISION-NEEDED.** Blocks T044, T046 (name column), T049 (language selection), T056 (name-language freeze), T040, T037 (name assertions). |
| A13 | Ambiguity (PO) | HIGH | `decision-register.md` F16-MCQ-G (re-framed from -10); `spec.md` FR-025, FR-027; `contracts/catalog-api.md` client-view paragraph | Override alternatives seeded into the plan, or live at each view; private targets visible or not. | **OPEN PO-DECISION-NEEDED.** Blocks T048 (count bound and behaviour), T050 and T058 (client alternatives scope), T059 (F17 integration), FR-027 V2 alternatives freeze. |
| A14 | Ambiguity (PO) | HIGH | `decision-register.md` F16-MCQ-H; `spec.md` FR-023, FR-027 | Description frozen or live in a published plan. | **OPEN PO-DECISION-NEEDED.** Blocks T044 (freeze), T056 (description in V2). |
| A15 | Ambiguity (PO) | HIGH | `decision-register.md` F16-MCQ-9 (kept open, not answered); `spec.md` FR-014, FR-024; `contracts/catalog-api.md` line 119 | Client view of a workspace-private Trainer exercise's video: resolve or omit. The S36-PO-2 wording ("videos update live") largely points to resolve; the register keeps it open as instructed. | **OPEN PO-DECISION-NEEDED.** Blocks T045 (client visibility), T050 and T058 (private-video assertions). A one-line PO confirmation would close it. |
| A16 | Ambiguity (PO) | MEDIUM | `decision-register.md` F16-MCQ-I (added in review); `spec.md` FR-035; `plan.md` search line | Which names a workspace search matches (canonical, workspace, or effective), and any per-workspace override storage budget. | **OPEN PO-DECISION-NEEDED.** Blocks T064 only. The length bound in FR-035 is not blocked. |
| A17 | Ambiguity (PO, cross-feature) | LOW | `decision-register.md` F16-MCQ-D; `spec.md` FR-022 (narrowed); D-08 | Re-registration of a departing client under the global e-mail and phone rule. | **OPEN PO-DECISION-NEEDED, cross-feature.** Nothing in F16 is blocked (FR-022 narrowed to F16-owned enforcement). Escalate as an F11/F12 decision if identical identifiers are wanted. |
| A18 | Dependency | MEDIUM | `tasks.md` T058; `plan.md` client path; `origin/019-plan-core` (0 new migrations) | The client wrapper needs F19 persistence (a persisted plan/client relation). It does not exist on main or on `origin/019-plan-core`. | **OPEN, cross-feature.** T058 blocked; the internal resolver (T050, T051) is not blocked. |
| A19 | Dependency | MEDIUM | `tasks.md` T054, T055; `plan.md` dependencies; PR #43 | Legacy retirement and parity move are atomic with PR #43's consumers. #43 merge is PO-conditioned on its exact-head gates. | **OPEN, PO-conditioned.** Sequencing recorded (FR-031, FR-032). No change to #43 is made here. |
| A20 | Process | MEDIUM | `tasks.md` T066; `docs/04-changes-and-questions.md`; `docs/01-traceability.md` | S35/S36 decisions are not yet recorded in the docs (outside `specs/016-*`). | **OPEN, not executed in round 3.** Owner: MiniMax (docs) with architect review. |
| A21 | Cross-feature | MEDIUM | `tasks.md` T059; `impact-s35-redesign.md` | F17 (FR-003 `variation` reference, FR-008), F19 (`CatalogSnapshotRef` V2) amendments. | **OPEN, cross-feature.** Blocked by the F16 decisions and F19 persistence. Recorded, not executed. |
| A22 | Coverage | LOW | `tasks.md` (no dedicated test); FR-033 | Authorization labels are documentation only. The parity test (T055) indirectly protects the matrix, but no test asserts that no new capability exists. | **Open, LOW.** Add an assertion to T055 when the parity move lands. |
| A23 | Resolved | — | `spec.md` FR-026, FR-027; `data-model.md`; `plan.md`; T049, T056 | Frozen-name mechanism (critique F1, previously CRITICAL). | **RESOLVED** in `d94bcdf0`, `958e885f`, `bfc6f729`, `ca13be42`. Residual description and alternatives freeze is A13 and A14. |
| A24 | Resolved | — | `spec.md` FR-028, FR-029; `contracts/catalog-api.md`; T050, T051 | Client-read boundary and removed or merged plan video (critique F2 and F7). | **RESOLVED** in `d94bcdf0`, `958e885f`, `ca13be42`. Residual wrapper dependency is A18. |
| A25 | Resolved | — | `spec.md` FR-023, FR-024; `data-model.md` | Canonical and private video fields did not exist (critique F3 and F5). | **RESOLVED** in `d94bcdf0`, `958e885f`. Canonical description shape is A12 and A14. |
| A26 | Resolved | — | `spec.md` FR-025; `data-model.md`; T048 | Alternatives integrity (critique F4). | **RESOLVED** in `958e885f` (composite child rows). Empty-list and seeded or live semantics are A9 and A13. |
| A27 | Resolved | — | `spec.md` FR-032; `plan.md`; `quickstart.md` | Migration range sorted before main's head (critique F8). | **RESOLVED** in `d94bcdf0`, `bfc6f729`, `7850e5e7`, `285f8236`. Two checks are required: an ordering check (highest origin version; every local F16 version strictly greater) and `npm run check:migration-versions:remote`, which is a filename-conflict check only. |
| A28 | Resolved | — | `spec.md` FR-031; `contracts/catalog-api.md`; T054 | Legacy variation write path alive (critique F9). | **RESOLVED** in spec (`d94bcdf0`, `958e885f`). Implementation is A19. |
| A29 | Resolved | — | `spec.md` FR-022 | FR-022 required what the existing rules forbid (critique F11). | **RESOLVED** in `d94bcdf0`. Re-registration is A17. |
| A30 | Resolved | — | `spec.md` FR-033; `plan.md` | Authorization identifiers cited as existing (critique F13). | **RESOLVED** in `bfc6f729`, `d94bcdf0`. |
| A31 | Resolved | — | `checklists/analyze.md` (this file) | Analyze recorded a CRITICAL as a blocker and reported 0 CRITICAL (critique F14). | **RESOLVED**: A7 is recorded as CRITICAL and open. |
| A32 | Resolved | — | `tasks.md` | Umbrella tasks, missing owners and predecessors, missing task units (critique F15). | **RESOLVED** in `45810a2a`, `175c9411`. Units T043 to T067 carry owners, predecessors and blockers. |
| A33 | Resolved | — | `plan.md` validation phases; `tasks.md`; SC-013 to SC-016 | Validation and mutation plan incomplete (critique F16); SC coverage missing for FR-023 to FR-035. | **RESOLVED** in `bfc6f729`, `c870fcd1`. |
| A34 | Resolved | — | `spec.md` FR-003, FR-014 | Open MCQ status and garbled precedence sentence in normative text (critique F17.2, F17.3). | **RESOLVED** in `d94bcdf0`. |
| A35 | Resolved | — | `impact-s35-redesign.md`; `research.md`; `debate.md`; `traceability.md` | Stale impact audit and superseded artifacts (critique F18, F17.8). #64 and #44 states corrected: #64 is CLOSED, #44 is a closed F15 PR. | **RESOLVED** in `7850e5e7`. |
| A36 | Resolved | — | `decision-register.md`; `spec.md` Clarifications | MCQ-8 and MCQ-10 were not re-framed; MCQ-E to MCQ-I not registered (critique F21). | **RESOLVED** in `1115aa70`, `a819d6c4`. MCQ-9 kept open. |
| A37 | Open, LOW | LOW | `decision-register.md` FYI-2; `spec.md` FR-014; T061 | `docs.google.com` is accepted by the current validators on main and #43 but not by D16-3. | **OPEN, architect confirmation.** T061 is blocked until confirmed. |
| A38 | Open, LOW | LOW | `decision-register.md` FYI-1 and FYI-3; `spec.md` FR-014, FR-028 | Spec-added absence default (`video: null`, source `none`) and the merged-source media rule. | **OPEN, architect awareness.** FYI-3 is for architect review; FYI-1 is for awareness. |
| A39 | Open, MEDIUM | MEDIUM | `contracts/catalog-api.md` implemented matrix; `tests/unit/catalog-role-parity.test.ts` | Parity guard depends on the implemented matrix staying at its eight rows. Round 3 keeps it unchanged and passes locally (2 of 2). | **Monitor.** Re-run at the final head. |
| A40 | Readability | LOW | `spec.md` FR-014, FR-035 | FR-014 and FR-035 are long multi-sentence requirements. | No ambiguity added; leave as is. |
| A41 | Resolved | — | `spec.md` FR-026, FR-027; `impact-s35-redesign.md` (F17); T056 | Private exercises have no canonical identity, so the V2 snapshot could not represent them (CodeRabbit review on `a8b857f1`). | **RESOLVED** in `285f8236`: `source = workspace_private` branch and private picker source. |
| A42 | Resolved | — | `spec.md` FR-032; `plan.md`; `quickstart.md`; T052 | The remote scan was described as an ordering check, but it checks filename conflicts only (CodeRabbit review on `a8b857f1`). | **RESOLVED** in `285f8236`: two separate checks, ordering and conflict. |
| A43 | Resolved | — | `spec.md` FR-031; `plan.md` step 3; T062, T063 | Cutover could drop active legacy videos and let a legacy write land during the copy (CodeRabbit review on `a8b857f1`). | **RESOLVED** in `285f8236`: video carry-over in the cutover transaction under the same locks; note treatment still F16-MCQ-C. |
| A44 | Resolved | — | `contracts/catalog-api.md` line 97 | The client contract appeared to exclude live description and alternatives categorically (CodeRabbit review on `a8b857f1`). | **RESOLVED** in `285f8236`: presentation governed by F16-MCQ-H and F16-MCQ-G. |

## Coverage

- Requirements inventory: FR-001 to FR-035 (including FR-016a), 36 keys; SC-001 to SC-016, 16 keys.
- Requirements with at least one task reference (S36 or historical): 36 of 36. Requirements with a dedicated S36 test task: all except FR-033 (A22, LOW).
- Success criteria mapped to tasks: SC-001 to SC-016 (`tasks.md` coverage bullet). SC-005 (perf) maps to T034 (historical local benchmark) and T065 (exercise list and batch resolve); the Worker CPU and hosted metrics remain a production gate. SC-010 maps to T040, which is blocked (A8, A12, A11).
- Planned contract rows: each moves into the implemented matrix only with its SQL, fixture row and parity test (S36-R10). The implemented matrix is unchanged in round 3. `npx vitest run tests/unit/catalog-role-parity.test.ts` passes 2 of 2 locally.

## Counts

- Requirements: 36 keys (FR), 16 success criteria (SC). Tasks: 68 (T001 to T067 plus T900; T037 to T067 are S36).
- Ambiguity count (open): 10 (A8 to A17; A17 is cross-feature). Duplication count: 0 open (duplicate task rows removed in `175c9411`). Underspecification open: A22 (LOW) and A40 (LOW).
- Severity (open): CRITICAL 1 (A7). HIGH 8 (A8, A9, A10, A11, A12, A13, A14, A15). MEDIUM 5 (A16, A18, A19, A20, A21) plus A39 (monitor). LOW 5 (A17, A22, A37, A38, A40).
- Resolved in round 3: A23 to A36 and A41 to A44 (18 items).

## Gate

- Spec and plan artifacts: **NOT PASS**. Open CRITICAL: 1 (A7, constitution conflict, PO-owned). Open HIGH: 8 (PO-DECISION-NEEDED A, B, C, E, F, G, H and 9).
- Implementation: **BLOCKED** for every F16 implementation task. Blocked by A7, and per task by the PO items listed above (T037 partial; T040, T044, T046 to T050, T056, T058, T062, T064 by their PO items).
- Exit: A7 resolved by the PO (or the constitution amended by an explicit PO-approved change); the eight HIGH PO items decided and recorded in `decision-register.md`; then analyze is re-run and this file re-dated.
- Not a blocker for this round: MEDIUM and LOW items above.
