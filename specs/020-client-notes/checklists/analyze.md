# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-09T11:45Z (round 9, re-run after the S40-PO-3 approval of the CN-MCQ-19 exact copy was encoded as spec.md row 34, key `clientNotes.exitWarning.bodyInFlight`, in spec.md, plan.md, tasks.md, data-model.md, research.md and contracts/client-notes-api.md; every edit precedes this analysis)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only. No code, SQL, migrations, or runtime work.

## Verdict

**0 open ambiguities in F20 behaviour. No PO item is pending.** CN-MCQ-01..14 are RESOLVED by the PO. CN-MCQ-16 (exit-protection copy and Save Draft) is RESOLVED by S38-PO-10 ("CN-MCQ-16 approved: unsaved-changes warning, no Save Draft. Approve proposed copy.") and S38-PO-11 ("Approved", confirming the draft strings in `runs/s38-po/cn-mcq-16-proposed-copy.md` rows 30-33). CN-MCQ-17 (Discard with an in-flight save) is RESOLVED by S39-PO-8, option A. CN-MCQ-18 (idempotent save/retry with DB-level duplicate prevention) is RESOLVED by S39-PO-9, option A, and encoded in FR-011, SC-007, Story 2 scenarios 7-8, plan.md, data-model.md, the API contract, T003, T004 and T015. CN-MCQ-19 (in-flight exit-warning copy) is RESOLVED by S40-PO-3, option Variant 1 (Recommended); its exact EN and Egyptian Arabic strings are encoded byte-exact as spec.md row 34, key `clientNotes.exitWarning.bodyInFlight`, and referenced from FR-006, FR-007, SC-004, Story 2 scenario 6, Story 3 scenario 8, plan.md, the API contract and tasks T005/T013. CN-MCQ-15 was removed by architect ruling S38-R9 under S38-PO-3 and its ID is not reused. No other open decision is recorded in the F20 register.

Scope note (not an F20 ambiguity): the app-wide audit retention period (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`) is an open pre-production decision. CN-MCQ-13 makes Client Notes follow the existing `public.audit_events` retention unchanged, so F20 does not depend on it and does not decide it. It is tracked outside this feature.

## Counts verified against the artifacts

- CN-MCQ IDs in the register: 18 defined (01-14, 16, 17, 18 and 19; CN-MCQ-15 removed, ID not reused). PO-resolved: 18 (01-14, 16, 17, 18 and 19).
- Functional requirements: 11 (FR-001..FR-011). Success criteria: 7 (SC-001..SC-007). Tasks: 15 (T001..T015; T008..T015 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 8, Story 3 = 8.
- Task ticks: 0 (`grep "\[x\]"` on tasks.md returns no match). All tasks remain unticked (spec-only; S38-R8).
- Approved copy: CN-MCQ-08 rows 1–29 (S38-PO-2), CN-MCQ-16 rows 30–33 (S38-PO-11) and CN-MCQ-19 row 34 (S40-PO-3). Rows 1–33 are byte-identical to the previous head `cbc870bf` (script check over the copy table, 33/33 unchanged); row 34 is new.
- Row 34 byte verification: EN and AR cells are byte-identical to Variant 1 of `runs/s40-ds-cn-r8/cn-mcq-19-copy-proposal.md` (60 / 48 Unicode code points respectively); row 31 is unchanged. Script: `runs/s40-ds-cn-r9/verify-copy.cjs` (ALL PASS), plus `runs/s40-ds-cn-r9/verify-rows.cjs` (rows 1-33 unchanged, row 34 present).
- No `PENDING-PO` or blocked-on-copy statement remains in the feature folder; the only residual matches are none.
- Contracts (`client-notes-api.md`, `client-notes-rls.md`): the create row carries the FR-011 idempotency key and duplicate-returns-existing rule; the display section carries row 34 with the key and both strings. The RLS contract has no copy and no exit rule; its "no row persisted" rows apply only to refused writes, not to Discard or to a duplicate-key return.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. Create idempotency is not an authorization path (FR-011). |
| HIGH | 0 | None. |
| MEDIUM | 0 | None. CN-MCQ-16, CN-MCQ-17 and CN-MCQ-18 are resolved and encoded; CN-MCQ-19 is resolved by S40-PO-3 and its exact strings are encoded byte-exact. |
| LOW | 1 | FR-006/FR-007 name the reusable components by family (textarea, button, dialog, toast, States). The repository has `components/ui/` with Button, ConfirmDialog, Field, Toast, States and Bidi; the textarea mapping is not verified in this spec-only round. **Not an ambiguity**: it is a check for the implementation task that uses the component (T005), under the existing design gate. |

### Inconsistency check (round 9 edits)

- Status lines in spec.md, plan.md and tasks.md agree: CN-MCQ-19 RESOLVED by S40-PO-3, no open behavioural ambiguities, no pending PO item, no implementation authorized.
- Row 34 (key `clientNotes.exitWarning.bodyInFlight`, EN and AR byte-exact) is stated consistently in spec.md (status, FR-006, FR-007, SC-004, Story 2 scenario 6, Story 3 scenario 8, Clarifications item 13, Session S40 block, copy-table note and register), plan.md (status, UI strings, in-flight body, phase 1 and PO decisions), tasks.md (status, T005, T013, coverage map and dependency order) and contracts/client-notes-api.md (display). No conflicting or guessed variant is encoded.
- The CN-MCQ-08 table (rows 1–29) and CN-MCQ-16 rows (30–33) are unchanged; the new row 34 is additive. Row 31's scope remains unsubmitted text only.
- The idempotency rule is stated identically in FR-011, SC-007, Story 2 scenarios 7–8, plan.md (data section, risk and phase 4), data-model.md (column `idempotency_key`, invariant 9 and migration description), contracts/client-notes-api.md (create row and denials), T003, T004 and T015.
- No statement in spec.md, plan.md, tasks.md or the contracts promises cancellation, "no row persisted" or "no audit event" for a save that has already been submitted. The remaining "no row persisted" statements are refused-write cases only (Story 2 scenario 2, FR-002, SC-002, RLS contract rows 33/37/41).
- Task ordering text (tasks.md "Dependency order") names CN-MCQ-16, CN-MCQ-17, CN-MCQ-18 and CN-MCQ-19 as resolved with row 34 encoded. The S38-R8 rule is unchanged: a test task is ticked only after its tests execute and pass. Tasks remain at 0 ticks.

### Constitution check

The worktree contains no `.specify/memory/constitution.md` (searched: no `constitution*.md` in the repository). The gate applied is the lifter Spec Kit gate in the run brief: zero open ambiguities and zero open CRITICAL/HIGH before implementation. This analysis does not authorize implementation.

## Architect rulings and review findings applied to date

- **S38-R8** (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): a test task is ticked only after its tests execute and pass (constitution §3); red runs are recorded as evidence with the box unticked. Unchanged in round 9.
- **S38-R9** (CN-MCQ-15, DESIGN.md §11 UI values): removed as a PO question (S38-PO-3). The Client Notes UI reuses existing Design System components and values and introduces no new breakpoint, touch-size, focus or token value. Unchanged in round 9.
- **CodeRabbit review 5820142764 on `e2b6a6e3`** (revoked-membership scope): fixed in `f080dc77`; non-PO scope in SC-001, Story 3 scenario 4, both contracts, plan.md and T006.
- **CodeRabbit review 5820103675 on `c428158d`** (exit protection): behaviour encoded in `e2b6a6e3`; the copy is approved (CN-MCQ-16, S38-PO-11) and encoded in round 6.
- **CodeRabbit review 5820602643 on `ccdf5b45`** (CHANGES_REQUESTED, 1 inline finding on `contracts/client-notes-api.md:18`, Minor · Functional Correctness): **valid**. Fixed in round 6; the line now names rows 30–33 for the exit-protection warning and keeps rows 1–29 for all other copy.
- **CodeRabbit review 5820674376 on `0611ae89`** (CHANGES_REQUESTED, 1 inline finding on `spec.md:65`, Major · Data Integrity & Integration; thread `PRRT_kwDOVYgYQ861GZGQ`): **valid**. A PO decision was raised as CN-MCQ-17 and answered by S39-PO-8, option A. Fixed in round 7 and carried into rounds 8 and 9.
- **CodeRabbit review 5822122189 on `38581d78`** (CHANGES_REQUESTED, 2 inline findings, both PO decisions):
  - `PRRT_kwDOVYgYQ861JMXx` `spec.md:93` (Major · Data Integrity & Integration): recovery for a save with no observable result and duplicate-safe retry. **Valid**; answered by S39-PO-9 as CN-MCQ-18 option A and encoded in FR-011, SC-007, Story 2 scenarios 7–8, plan.md, data-model.md, the API contract, T003, T004 and T015. No migration file is added. Resolved in phase 1 of round 8.
  - `PRRT_kwDOVYgYQ861JMX2` `spec.md:190` (Major · Functional Correctness): the warning body overpromises loss for an in-flight save. **Valid**; answered by S40-PO-3 as CN-MCQ-19 option Variant 1 (Recommended), copy encoded byte-exact as row 34, and referenced from FR-006, FR-007, SC-004, Story 2 scenario 6, Story 3 scenario 8, plan.md, the API contract and T005/T013. Thread to be replied to with the fixing SHA and file:line, then resolved only because the finding is fixed.
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
| FR-007 states, copy rows 1–34, Bidi, no icon, exit protection, no Save Draft (CN-MCQ-19 row 34) | T005, T013 |
| FR-008 ordering | T008 |
| FR-009 last write wins, local time | T004, T010, T013 |
| FR-010 audit | T004, T012 |
| FR-011 create idempotency, duplicate returns existing note | T003, T004, T015 |
| SC-001..SC-007 | mapped in tasks.md coverage table |

Every FR and SC has at least one task. No task lacks a requirement mapping.

## Gate checklist (Spec Kit entry check, spec-only PR)

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-011 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-007), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim, boundary and idempotent retry), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership, last save wins and exit protection (unsubmitted discard and in-flight saves, with the in-flight warning key named).
- [x] Current role/membership model and backend/RLS enforcement are described; create idempotency is explicitly not an authorization factor.
- [x] No SQL/migration version is invented; the migration scan is not relied upon; no migration file is added by this PR.
- [x] Clarifications: CN-MCQ-01..14, CN-MCQ-16, CN-MCQ-17, CN-MCQ-18 and CN-MCQ-19 resolved; CN-MCQ-08 copy (rows 1–29), CN-MCQ-16 copy (rows 30–33) and CN-MCQ-19 row 34 recorded byte-exact; "no open ambiguities in F20 behaviour" stated explicitly with no pending PO item.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy bound to the approved tables; no new UI value introduced; exit-protection behaviour from DESIGN.md §5 encoded; Save Draft not offered; no cancellation promise for an in-flight save (CN-MCQ-17); in-flight body is the approved row 34 (CN-MCQ-19).
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line), S38-PO-2 (item 2), S38-PO-10, S38-PO-11, S39-PO-8 (Client Notes line), S39-PO-9 (both lines) and S40-PO-3 (`Variant 1 (Recommended)`), with the S40 architect mapping labelled as not PO words.
- [x] Analyze dated after the last change to spec, plan, tasks, data-model, research and contracts (this analysis 2026-11-09T11:45Z follows every round-9 edit).
- [x] Revoked-membership scope matches the existing PO rule (FR-004; spec.md Clarifications item 2): SC-001, Story 3 scenario 4, the RLS and API contracts, plan.md and T006 say non-PO revoked membership.
- [x] Tasks: 0 ticks; T005 and T013 cover the exit-protection rows 30–34, including the exact CN-MCQ-19 row 34 string; T015 covers create idempotency.

## Result

PASS for the spec-only PR analysis gate: 0 open CRITICAL, 0 open HIGH, 0 open MEDIUM and 0 open behavioural ambiguities. No PO item is pending. One LOW implementation-time check (textarea component mapping) remains. This result does not approve product decisions and does not authorize implementation.
