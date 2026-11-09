# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-09T11:11Z (round 8, re-run after the S39-PO-9 encoding of CN-MCQ-18 and the CN-MCQ-19 direction registration in spec.md, plan.md, tasks.md, data-model.md, research.md and contracts/client-notes-api.md, and after CodeRabbit review 5822122189; every spec, plan, tasks, contracts, data-model and research edit precedes this analysis)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only. No code, SQL, migrations, or runtime work.

## Verdict

**0 open ambiguities in F20 behaviour. No open ambiguities remain in the decided behaviour; one PO copy approval is pending and is stated explicitly here: CN-MCQ-19's exact EN and Egyptian Arabic strings are PENDING-PO.** CN-MCQ-01..14 are RESOLVED by the PO. CN-MCQ-16 (exit-protection copy and Save Draft) is RESOLVED by S38-PO-10 ("CN-MCQ-16 approved: unsaved-changes warning, no Save Draft. Approve proposed copy.") and S38-PO-11 ("Approved", confirming the draft strings in `runs/s38-po/cn-mcq-16-proposed-copy.md` rows 30-33). CN-MCQ-17 (Discard with an in-flight save) is RESOLVED by S39-PO-8, option A. CN-MCQ-18 (idempotent save/retry with DB-level duplicate prevention) is RESOLVED by S39-PO-9, option A, and encoded in FR-011, SC-007, Story 2 scenarios 7-8, plan.md, data-model.md, the API contract, T003, T004 and T015. CN-MCQ-19's direction is approved by S39-PO-9, option A; its exact strings are PENDING-PO (see the explicit pending item below). CN-MCQ-15 was removed by architect ruling S38-R9 under S38-PO-3 and its ID is not reused. No other open decision is recorded in the F20 register.

**Explicit pending PO item (not an ambiguity, not a severity finding):** CN-MCQ-19. The PO approved the direction (new EN and Egyptian Arabic warning copy stating that leaving cannot cancel a save already sent) but not the wording. The proposal is `C:/Users/NEW LAP/.lifter/runs/s40-ds-cn-r8/cn-mcq-19-copy-proposal.md` (current approved row 31 quoted byte-exact; two EN + Egyptian Arabic variants with key name, screen and character counts). No string is encoded in spec.md, plan.md, tasks.md or tests, the approved rows 30-33 are unchanged, and thread `PRRT_kwDOVYgYQ861JMX2` stays open until byte-exact PO approval. Implementation of the in-flight body string is blocked on that approval; all other F20 spec work is decided.

Scope note (not an F20 ambiguity): the app-wide audit retention period (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`) is an open pre-production decision. CN-MCQ-13 makes Client Notes follow the existing `public.audit_events` retention unchanged, so F20 does not depend on it and does not decide it. It is tracked outside this feature.

## Counts verified against the artifacts

- CN-MCQ IDs in the register: 18 defined (01-14, 16, 17, 18 and 19; CN-MCQ-15 removed, ID not reused). PO-resolved: 17 (01-14, 16, 17 and 18). CN-MCQ-19: direction approved by S39-PO-9, exact strings PENDING-PO.
- Functional requirements: 11 (FR-001..FR-011). Success criteria: 7 (SC-001..SC-007). Tasks: 15 (T001..T015; T008..T015 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 8, Story 3 = 8.
- Task ticks: 0 (`grep "\[x\]"` on tasks.md returns no match). All tasks remain unticked (spec-only; S38-R8).
- Approved copy: CN-MCQ-08 rows 1–29 (S38-PO-2) and CN-MCQ-16 rows 30–33 (S38-PO-11). This round both tables were byte-compared against `runs/s38-po/cn-mcq-08-proposed-copy.md` (29/29 rows identical) and `runs/s38-po/cn-mcq-16-proposed-copy.md` (4/4 rows identical); the approved rows were not edited. Row 31 is now at `spec.md:202` (it was at `spec.md:190` when round 8 started).
- CN-MCQ-19: no string in spec.md, plan.md, tasks.md or tests. A grep for the proposal strings and their Arabic text returns no artifact match. The proposal lives only in the run directory.
- Stale-reference grep over the feature folder for `OPEN`, `open ambiguit`, `blocked by`, `NOT approved`, `CN-MCQ-16`, `CN-MCQ-17`, `CN-MCQ-18`, `CN-MCQ-19`, `FR-011` and `SC-007`: every entry is in the RESOLVED, direction-approved/PENDING-PO, or blocked-on-copy form; no unqualified "No open ambiguities" string remains.
- Contracts (`client-notes-api.md`, `client-notes-rls.md`): the create row carries the FR-011 idempotency key and duplicate-returns-existing rule; the display section states the CN-MCQ-19 pending status without a string. The RLS contract has no copy and no exit rule; its "no row persisted" rows apply only to refused writes, not to Discard or to a duplicate-key return.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. Create idempotency is not an authorization path (FR-011). |
| HIGH | 0 | None. |
| MEDIUM | 0 | None. CN-MCQ-16 (previously the only MEDIUM item) is resolved; CN-MCQ-17 is resolved by S39-PO-8; CN-MCQ-18 is resolved by S39-PO-9 and fully encoded; CN-MCQ-19's wording is explicitly PENDING-PO rather than guessed. |
| LOW | 1 | FR-006/FR-007 name the reusable components by family (textarea, button, dialog, toast, States). The repository has `components/ui/` with Button, ConfirmDialog, Field, Toast, States and Bidi; the textarea mapping is not verified in this spec-only round. **Not an ambiguity**: it is a check for the implementation task that uses the component (T005), under the existing design gate. |

### Inconsistency check (round 8 edits)

- Status lines in spec.md, plan.md and tasks.md agree: CN-MCQ-18 RESOLVED, CN-MCQ-19 direction approved with exact strings PENDING-PO, no open behavioural ambiguities, no implementation authorized.
- The idempotency rule is stated identically in FR-011, SC-007, Story 2 scenarios 7–8, plan.md (data section, risk and phase 4), data-model.md (column `idempotency_key`, invariant 9 and migration description), contracts/client-notes-api.md (create row and denials), T003, T004 and T015: one client-generated key per create; retry re-sends it; unique `(workspace_id, client_id, idempotency_key)`; a duplicate returns the existing note, never a second note; no second create audit event; the key never widens actor/role/scope.
- The CN-MCQ-19 pending state is stated in spec.md (status, Clarifications item 12, FR-006, FR-007, SC-004, the note under the copy table and the register), plan.md (status, UI section, risk and PO decisions), tasks.md (status, T005, T013, coverage map and dependency order) and contracts/client-notes-api.md. None contains a proposed string.
- The CN-MCQ-08 table (rows 1–29) and CN-MCQ-16 rows (30–33) are byte-identical to their approved sources; no approved copy row was edited. Row 31's scope is narrowed in prose (unsubmitted text only) without changing its bytes.
- No statement in spec.md, plan.md, tasks.md or the contracts promises cancellation, "no row persisted" or "no audit event" for a save that has already been submitted. The remaining "no row persisted" statements are refused-write cases only (Story 2 scenario 2, FR-002, SC-002, RLS contract rows 33/37/41).
- Task ordering text (tasks.md "Dependency order") names CN-MCQ-16, CN-MCQ-17 and CN-MCQ-18 as resolved, and records that the CN-MCQ-19 in-flight copy work is blocked until byte-exact PO approval. The S38-R8 rule is unchanged: a test task is ticked only after its tests execute and pass. Tasks remain at 0 ticks.

### Constitution check

The worktree contains no `.specify/memory/constitution.md` (searched: no `constitution*.md` in the repository). The gate applied is the lifter Spec Kit gate in the run brief: zero open ambiguities and zero open CRITICAL/HIGH before implementation, with the one explicitly recorded PO copy approval pending. This analysis does not authorize implementation.

## Architect rulings and review findings applied to date

- **S38-R8** (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): a test task is ticked only after its tests execute and pass (constitution §3); red runs are recorded as evidence with the box unticked. Unchanged in round 8.
- **S38-R9** (CN-MCQ-15, DESIGN.md §11 UI values): removed as a PO question (S38-PO-3). The Client Notes UI reuses existing Design System components and values and introduces no new breakpoint, touch-size, focus or token value. Unchanged in round 8.
- **CodeRabbit review 5820142764 on `e2b6a6e3`** (revoked-membership scope): fixed in `f080dc77`; non-PO scope in SC-001, Story 3 scenario 4, both contracts, plan.md and T006.
- **CodeRabbit review 5820103675 on `c428158d`** (exit protection): behaviour encoded in `e2b6a6e3`; the copy is approved (CN-MCQ-16, S38-PO-11) and encoded in round 6.
- **CodeRabbit review 5820602643 on `ccdf5b45`** (CHANGES_REQUESTED, 1 inline finding on `contracts/client-notes-api.md:18`, Minor · Functional Correctness): **valid**. Fixed in round 6; the line now names rows 30–33 for the exit-protection warning and keeps rows 1–29 for all other copy.
- **CodeRabbit review 5820674376 on `0611ae89`** (CHANGES_REQUESTED, 1 inline finding on `spec.md:65`, Major · Data Integrity & Integration; thread `PRRT_kwDOVYgYQ861GZGQ`): **valid**. A PO decision was raised as CN-MCQ-17 and answered by S39-PO-8, option A. Fixed in round 7 and carried into round 8.
- **CodeRabbit review 5822122189 on `38581d78`** (CHANGES_REQUESTED, 2 inline findings, both PO decisions):
  - `PRRT_kwDOVYgYQ861JMXx` `spec.md:93` (Major · Data Integrity & Integration): recovery for a save with no observable result and duplicate-safe retry. **Valid**; answered by S39-PO-9 as CN-MCQ-18 option A and encoded in FR-011, SC-007, Story 2 scenarios 7–8, plan.md, data-model.md, the API contract, T003, T004 and T015. No migration file is added. Thread reply cites the fixing commit SHA and file:line, then resolves only if fixed.
  - `PRRT_kwDOVYgYQ861JMX2` `spec.md:190` (Major · Functional Correctness): the warning body overpromises loss for an in-flight save. **Valid**; the direction is approved by S39-PO-9 as CN-MCQ-19 option A, but the exact strings are PENDING-PO. The approved rows are unchanged and no string is guessed. Thread left **OPEN** pending copy approval.
- **CodeRabbit reply on thread `PRRT_kwDOVYgYQ861FR0f`** (review 5820575538, comment 4508576614, not a code finding): the copy file is outside the checkout. The strings are in spec.md rows 30–33 and were checked byte-exact against that external file, the same convention as the CN-MCQ-08 table (spec.md Clarifications). No change.
- **PRRT_kwDOVYgYQ861FR0f** (spec.md, open, "obtain approval for bilingual copy and add exit-protection scenarios"): the copy is approved (S38-PO-11) and the exit-protection scenarios exist. Replied and resolved in the round-6 step.

## Round-4 CodeRabbit history (kept for traceability)

- Review `5819883866` on `cdb89424`: 1 inline finding on tasks.md:51 (T014 ordering and the dependency gate). The gate part was fixed in `dd5a896f`. The T014 tick part is S38-R8.
- Review `5819936996` on `dd5a896f`: COMMENTED, empty body, one reply that the thread stays open for the architect ruling.

## Coverage map (FR / SC → tasks)

| Requirement | Tasks |
| --- | --- |
| FR-001 tab placement | T005, T013 |
| FR-002 body rule, unavailable-author label | T003, T004, T009, T013, T014 |
| FR-003 edit, no history | T003, T004, T010 |
| FR-004 role × action | T002, T006, T011 |
| FR-005 isolation, RLS | T003, T006, T011, T014 |
| FR-006 PO decisions, reuse rule | T001, T007 |
| FR-007 states, copy rows 1–33, Bidi, no icon, exit protection, no Save Draft (CN-MCQ-19 in-flight body pending) | T005, T013 |
| FR-008 ordering | T008 |
| FR-009 last write wins, local time | T004, T010, T013 |
| FR-010 audit | T004, T012 |
| FR-011 create idempotency, duplicate returns existing note | T003, T004, T015 |
| SC-001..SC-007 | mapped in tasks.md coverage table |

Every FR and SC has at least one task. No task lacks a requirement mapping.

## Gate checklist (Spec Kit entry check, spec-only PR)

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-011 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-007), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim, boundary and idempotent retry), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership, last save wins and exit protection (unsubmitted discard and in-flight saves).
- [x] Current role/membership model and backend/RLS enforcement are described; create idempotency is explicitly not an authorization factor.
- [x] No SQL/migration version is invented; the migration scan is not relied upon; no migration file is added by this PR.
- [x] Clarifications: CN-MCQ-01..14, CN-MCQ-16, CN-MCQ-17 and CN-MCQ-18 resolved; CN-MCQ-19 direction approved with exact strings explicitly PENDING-PO; CN-MCQ-08 copy (rows 1–29) and CN-MCQ-16 copy (rows 30–33) recorded byte-exact; "no open ambiguities in F20 behaviour" stated explicitly together with the pending copy approval.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy bound to the approved tables; no new UI value introduced; exit-protection behaviour from DESIGN.md §5 encoded; Save Draft not offered; no cancellation promise for an in-flight save (CN-MCQ-17); no guessed in-flight string (CN-MCQ-19).
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line), S38-PO-2 (item 2), S38-PO-10, S38-PO-11, S39-PO-8 (Client Notes line) and S39-PO-9 (both lines).
- [x] Analyze dated after the last change to spec, plan, tasks, data-model, research and contracts (this analysis 2026-11-09T11:11Z follows every round-8 edit).
- [x] Revoked-membership scope matches the existing PO rule (FR-004; spec.md Clarifications item 2): SC-001, Story 3 scenario 4, the RLS and API contracts, plan.md and T006 say non-PO revoked membership.
- [x] Tasks: 0 ticks; T005 and T013 cover the exit-protection rows 30–33 and record that the CN-MCQ-19 in-flight string is blocked on PO approval; T015 covers create idempotency.

## Result

PASS for the spec-only PR analysis gate: 0 open CRITICAL, 0 open HIGH, 0 open MEDIUM and 0 open behavioural ambiguities. One pending PO item is recorded explicitly (CN-MCQ-19 exact EN/Egyptian Arabic copy approval; direction already approved by S39-PO-9), and one LOW implementation-time check (textarea component mapping) remains. This result does not approve product decisions and does not authorize implementation.
