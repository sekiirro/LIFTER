# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-09T05:47Z (round 7, re-run after the S39-PO-8 encoding of CN-MCQ-17 in spec.md, plan.md, tasks.md and contracts/client-notes-api.md, and after the CodeRabbit review 5820674376 finding on `spec.md:65`; every spec, plan, tasks, contracts, data-model and research edit precedes this analysis)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only. No code, SQL, migrations, or runtime work.

## Verdict

**0 open ambiguities. "No open ambiguities" is stated explicitly for F20.** CN-MCQ-01..14 are RESOLVED by the PO. CN-MCQ-16 (exit-protection copy and Save Draft) is RESOLVED by S38-PO-10 ("CN-MCQ-16 approved: unsaved-changes warning, no Save Draft. Approve proposed copy.") and S38-PO-11 ("Approved", confirming the draft strings in `runs/s38-po/cn-mcq-16-proposed-copy.md` rows 30-33). CN-MCQ-17 (Discard with an in-flight save) is RESOLVED by S39-PO-8, option A ("* #68 Discard: Option A. Never falsely promise cancellation of in-flight saves."), encoded in FR-007, Story 2 scenarios 5-6, Story 3 scenarios 7-8, T005 and T013. CN-MCQ-15 was removed by architect ruling S38-R9 under S38-PO-3 and its ID is not reused. No other open decision is recorded in the F20 register.

Scope note (not an F20 ambiguity): the app-wide audit retention period (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`) is an open pre-production decision. CN-MCQ-13 makes Client Notes follow the existing `public.audit_events` retention unchanged, so F20 does not depend on it and does not decide it. It is tracked outside this feature.

## Counts verified against the artifacts

- CN-MCQ IDs in the register: 16 defined (01-14, 16 and 17; CN-MCQ-15 removed, ID not reused). Resolved by PO: 16 (01-14, 16 and 17). Open: 0.
- Functional requirements: 10 (FR-001..FR-010). Success criteria: 6 (SC-001..SC-006). Tasks: 14 (T001..T014; T008..T014 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 6, Story 3 = 8.
- Task ticks: 0 (`grep "\[x\]"` on tasks.md returns no match). All tasks remain unticked (spec-only; S38-R8).
- Approved copy: CN-MCQ-08 rows 1–29 (S38-PO-2) and CN-MCQ-16 rows 30–33 (S38-PO-11). Rows 30–33 were byte-compared against `runs/s38-po/cn-mcq-16-proposed-copy.md` (EN and AR, title, body, Stay, Discard); all four match. The browser close/reload line matches the source line byte-exact.
- Stale-reference grep over the feature folder for `OPEN`, `open ambiguit`, `blocked by`, `NOT approved`, `CN-MCQ-16` and `CN-MCQ-17`: no live open item. Every CN-MCQ-16 and CN-MCQ-17 reference is in the RESOLVED form, including the byte-exact S39-PO-8 line in spec.md.
- Contracts (`client-notes-api.md`, `client-notes-rls.md`): no reference to CN-MCQ-15 or DESIGN.md §11. The API contract names the exit-protection copy as CN-MCQ-16 rows 30–33 and adds the CN-MCQ-17 rule that leaving or discarding does not cancel a submitted request (line 19, updated in this round). The RLS contract has no copy and no exit rule; its "no row persisted" rows apply only to refused writes, not to Discard.

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. |
| HIGH | 0 | None. |
| MEDIUM | 0 | None. CN-MCQ-16 (previously the only MEDIUM item) is resolved: exact copy rows 30–33 are encoded in FR-007, Story 2 scenario 5, Story 3 scenario 7, T005 and T013; Save Draft is not offered. CN-MCQ-17 is resolved by S39-PO-8 and the overpromising Discard wording is gone. |
| LOW | 1 | FR-006/FR-007 name the reusable components by family (textarea, button, dialog, toast, States). The repository has `components/ui/` with Button, ConfirmDialog, Field, Toast, States and Bidi; the textarea mapping is not verified in this spec-only round. **Not an ambiguity**: it is a check for the implementation task that uses the component (T005), under the existing design gate. |

### Inconsistency check (round 7 edits)

- Status lines in spec.md, plan.md and tasks.md now agree: CN-MCQ-16 and CN-MCQ-17 RESOLVED, no open ambiguities, no implementation authorized.
- The exit rule is stated identically in FR-007, Story 2 scenarios 5–6, Story 3 scenarios 7–8, plan.md (exit-protection section and risk), the API contract line 19, T005 and T013: an unsaved, unsubmitted edit is discarded; a submitted save is not cancelled and takes the server result (committed or refused); a committed save keeps its row, its edit metadata and exactly one audit event; rows 30–33 strings; no Save Draft; browser built-in warning on close/reload.
- No statement in spec.md, plan.md, tasks.md or the contracts promises cancellation, "no row persisted" or "no audit event" for a save that has already been submitted. The remaining "no row persisted" statements are refused-write cases only (Story 2 scenario 2, FR-002, SC-002, RLS contract rows 33/37/41).
- The CN-MCQ-08 table (rows 1–29), the CN-MCQ-16 rows (30–33), SC-004 and the Assumptions bullet name the same two copy sources; no new UI copy was added by this round.
- Task ordering text (tasks.md "Dependency order") names CN-MCQ-16 and CN-MCQ-17 as resolved. The S38-R8 rule is unchanged: a test task is ticked only after its tests execute and pass. Tasks remain at 0 ticks.

### Constitution check

The worktree contains no `.specify/memory/constitution.md` (searched: no `constitution*.md` in the repository). The gate applied is the lifter Spec Kit gate in the run brief: zero open ambiguities and zero open CRITICAL/HIGH before implementation. Both conditions hold for this spec-only artifact set. This analysis does not authorize implementation.

## Architect rulings and review findings applied to date

- **S38-R8** (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): a test task is ticked only after its tests execute and pass (constitution §3); red runs are recorded as evidence with the box unticked. Unchanged in round 6.
- **S38-R9** (CN-MCQ-15, DESIGN.md §11 UI values): removed as a PO question (S38-PO-3). The Client Notes UI reuses existing Design System components and values and introduces no new breakpoint, touch-size, focus or token value. Unchanged in round 6.
- **CodeRabbit review 5820142764 on `e2b6a6e3`** (revoked-membership scope): fixed in `f080dc77`; non-PO scope in SC-001, Story 3 scenario 4, both contracts, plan.md and T006.
- **CodeRabbit review 5820103675 on `c428158d`** (exit protection): behaviour encoded in `e2b6a6e3`; the copy is now approved (CN-MCQ-16, S38-PO-11) and encoded in round 6.
- **CodeRabbit review 5820602643 on `ccdf5b45`** (CHANGES_REQUESTED, 1 inline finding on `contracts/client-notes-api.md:18`, Minor · Functional Correctness): **valid**. The line said no copy outside rows 1–29 is approved, which would block the approved CN-MCQ-16 warning (rows 30–33). Fixed in round 6; the line now names rows 30–33 for the exit-protection warning and keeps rows 1–29 for all other copy.
- **CodeRabbit review 5820674376 on `0611ae89`** (CHANGES_REQUESTED, 1 inline finding on `spec.md:65`, Major · Data Integrity & Integration; thread `PRRT_kwDOVYgYQ861GZGQ`): **valid**. Story 2 scenario 5 promised that Discard leaves "no row persisted, no audit event", which a save already submitted can falsify. A PO decision was raised as CN-MCQ-17 and answered by S39-PO-8, option A. Fixed in round 7: CN-MCQ-17 added to the register with the byte-exact PO line; Story 2 scenario 5 and Story 3 scenario 7 narrowed to unsubmitted text; Story 2 scenario 6 and Story 3 scenario 8 added for in-flight saves (Discard leaves; no cancellation; outcome is the server result); FR-007, plan.md, the API contract, T005 and T013 aligned. No new UI copy.
- **CodeRabbit reply on thread `PRRT_kwDOVYgYQ861FR0f`** (review 5820575538, comment 4508576614, not a code finding): the copy file is outside the checkout. The strings are in spec.md rows 30–33 and were checked byte-exact against that external file, the same convention as the CN-MCQ-08 table (spec.md Clarifications). No change.
- **PRRT_kwDOVYgYQ861FR0f** (spec.md, open, "obtain approval for bilingual copy and add exit-protection scenarios"): the copy is approved (S38-PO-11) and the exit-protection scenarios exist (Story 2 scenario 5, Story 3 scenario 7). Replied with the round-6 commit SHA and file:line evidence, then resolved in the round-6 step.

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
| FR-007 states, copy rows 1–33, Bidi, no icon, exit protection, no Save Draft | T005, T013 |
| FR-008 ordering | T008 |
| FR-009 last write wins, local time | T004, T010, T013 |
| FR-010 audit | T004, T012 |
| SC-001..SC-006 | mapped in tasks.md coverage table |

Every FR and SC has at least one task. No task lacks a requirement mapping.

## Gate checklist (Spec Kit entry check, spec-only PR)

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-010 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-006), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim and boundary), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership, last save wins and exit protection (unsubmitted discard and in-flight saves).
- [x] Current role/membership model and backend/RLS enforcement are described.
- [x] No SQL/migration version is invented; the migration scan is not relied upon.
- [x] Clarifications: CN-MCQ-01..14, CN-MCQ-16 and CN-MCQ-17 resolved; CN-MCQ-08 copy (rows 1–29) and CN-MCQ-16 copy (rows 30–33) recorded; "No open ambiguities" stated explicitly.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy bound to the approved tables; no new UI value introduced; exit-protection behaviour from DESIGN.md §5 encoded; Save Draft not offered; no cancellation promise for an in-flight save (CN-MCQ-17).
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line), S38-PO-2 (item 2), S38-PO-10, S38-PO-11 and S39-PO-8 (Client Notes line).
- [x] Analyze dated after the last change to spec, plan, tasks, data-model, research and contracts (this analysis 2026-11-09T05:47Z follows every round-7 edit).
- [x] Revoked-membership scope matches the existing PO rule (FR-004; spec.md Clarifications item 2): SC-001, Story 3 scenario 4, the RLS and API contracts, plan.md and T006 say non-PO revoked membership.
- [x] Tasks: 0 ticks; T005 and T013 string assertions cover rows 30–33 (unblocked) and the in-flight case asserts only the server outcome.

## Result

PASS for the spec-only PR analysis gate: 0 open CRITICAL, 0 open HIGH, 0 open MEDIUM, 0 open ambiguities. One LOW implementation-time check (textarea component mapping), which is not an ambiguity. This result does not approve product decisions and does not authorize implementation.
