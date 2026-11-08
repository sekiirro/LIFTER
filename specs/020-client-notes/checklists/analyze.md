# Spec Kit Analyze — F20 Client Notes

**Analysis date**: 2026-11-08T22:14Z (round 4, re-run after the CodeRabbit review of cdb89424 (review 5819883866): tasks.md dependency-order paragraph edited at 22:12Z; this analysis is after that edit and after every other round-4 edit of spec, plan, tasks, data-model, contracts and research, which applied CN-MCQ-08 (S38-PO-2), the whitespace answer (S37-PO-16) and the round-3 critique findings)
**Inputs**: spec.md, plan.md, tasks.md, data-model.md, research.md, contracts/client-notes-api.md, contracts/client-notes-rls.md
**Scope**: Spec-only proposal. No code, SQL, migrations, or runtime work.

## Counts verified against the artifacts

- CN-MCQ IDs defined: 15 (01–15). Resolved by PO: 14 (01–14; CN-MCQ-08 by S38-PO-2). Open: 1 (CN-MCQ-15, DESIGN.md §11 UI values).
- Functional requirements: 10 (FR-001..FR-010). Success criteria: 6 (SC-001..SC-006). Tasks: 14 (T001..T014; T008..T014 are test tasks). Acceptance scenarios: Story 1 = 3, Story 2 = 4, Story 3 = 6.
- Stale-reference grep over the feature folder for `PENDING`, `Not blocked`, `exemption`, `architect confirm`, `S37-R6` and `Bidi handling`: no remaining instance in spec, plan, data-model, contracts, research or tasks, other than the explicit CN-MCQ-15 (OPEN) entries and the historical quotations in the critique record. The approved copy table (spec.md Clarifications, rows 1–29) was inserted from `cn-mcq-08-proposed-copy.md` by a byte-exact script with a row-count check (29 rows).

## Findings

| Severity | Open count | Findings |
| --- | ---: | --- |
| CRITICAL | 0 | None. Authorization, tenant isolation and deny-by-default are explicit in FR-004/FR-005, the RLS contract and T006/T011. |
| HIGH | 0 | None. The round-3 HIGH findings are closed (see below). |
| MEDIUM | 1 | CN-MCQ-15 (OPEN, PO decision): DESIGN.md §11 items 1, 2 and 4 (breakpoints, minimum touch sizes, focus detail, token values) are not decided. Blocks only the visual/layout assertions in T005 and the viewport and token assertions in T013. Behaviour, data, authorization and copy are not blocked, and no value is guessed. |
| LOW | 0 | None. |

## CodeRabbit review on cdb89424 (review 5819883866, CHANGES_REQUESTED, 1 inline finding)

- tasks.md dependency paragraph, "No task starts until CN-MCQ-15 is resolved" (Minor, Functional Correctness, "unverified" part): **Valid, fixed.** The gate applies to implementation tasks only; documentation work (T001 and this artifact set) is not blocked. The paragraph now says so.
- tasks.md ordering of T014 (Minor, same finding): **Valid in part, fixed by clarification.** T014's tests need T003 before they can pass, so "accepted before T003" was contradictory. The paragraph now separates AUTHORED (test-first, red recorded as evidence, box not ticked) from TICKED (only after the tests pass on the implementation head, so T014's tick follows T003). **Not adopted:** the suggestion to let the test-authoring milestone complete while tests are red, because constitution §3 allows a tick only after the tests have executed and passed.

## Round-3 critique disposition (`s37-sol-cn-critique` finalMessage: CRITICAL 0 / HIGH 2 / MEDIUM 5 / LOW 1)

- HIGH 1 (task-specific ambiguity exemption conflicts with the constitutional gate): **Closed.** CN-MCQ-08 is resolved (S38-PO-2). The per-task "Not blocked" exemptions are removed from tasks.md. The zero-open-ambiguity gate now applies to all implementation tasks globally. The only open item is CN-MCQ-15, which is recorded, not assumed resolved.
- HIGH 2 (Unicode whitespace trimming without PO authority): **Closed** by S37-PO-16 (“Trim all leading/trailing whitespace …; preserve internal formatting; reject empty notes.”, quoted byte-exact in spec.md Clarifications). The PO's “all” is encoded as the Unicode White_Space property (FR-002). Interior formatting is preserved.
- MEDIUM 3 (immutable note identity and ownership not enforced by tests): **Fixed.** FR-003 and data-model invariant 6 make `id`, `workspace_id`, `client_id`, `author_user_id` and `created_at` immutable. The RLS contract adds direct-UPDATE refusal rows and a cross-workspace author row. Story 3 scenario 6 and T010 cover it.
- MEDIUM 4 (last-save-wins test can pass without concurrency): **Fixed.** The winner is the write the database commits last (FR-009, data-model invariant 7). Story 3 scenario 5 and T010 require controlled overlapping saves with per-save audit events.
- MEDIUM 5 (no atomicity between note mutation and audit): **Fixed.** FR-010, plan and the API contract require the mutation and its audit event in one database transaction, with rollback on audit failure. T004 and T012 test it.
- MEDIUM 6 (“denied operations emit no event” unapproved): **Closed by existing policy, no PO decision needed.** `specs/005-audit-log/spec.md` User Story 1, scenario 2 says a write the database rejects produces no event. FR-010, the contracts and T012 are narrowed to “no successful note-mutation event”, and no denial-audit event type is added (spec.md Clarifications item 7).
- MEDIUM 7 (FR tags do not show acceptance coverage): **Fixed.** tasks.md has a FR/SC → task → planned-evidence coverage map. T013 now covers the required states, light/dark and brand contrast, and the 390px/1440px viewport matrix. T007 records the executed authorization/RLS mutation evidence and `traceability.md`.
- LOW 8 (stale CN-MCQ-13/14 dependency and historical migration scan): **Fixed.** plan.md phase 1 names only the open item. The `20261108021002` figure is marked not relied upon; a fresh all-origin-ref scan is required before version selection, before commit and before push.

## Round-3 items re-checked

- CN-MCQ-13 (S37-PO-14): audit events inherit the existing `public.audit_events` retention unchanged; the period stays an open pre-production decision (DP-02 / ND-F5-1 / B4) that Client Notes does not decide.
- CN-MCQ-14 (S37-PO-14, whitespace scope per S37-PO-16): trim leading and trailing whitespace, count the trimmed text against 5,000 Unicode code points, store the trimmed text, reject blank-after-trim. PRRT_kwDOVYgYQ861CveV remains addressed by Story 2 scenario 3, the RLS contract, T009 and T014.
- FR-010 field mapping onto `public.audit_events` (round-3 CodeRabbit finding) is unchanged.

## Gate checklist

- [x] FRs have stable IDs and traceable tasks (FR-001..FR-010 each appear in tasks.md and in the coverage map).
- [x] Success criteria are measurable (SC-001..SC-006), each mapped to tasks in the coverage map.
- [x] Given/When/Then scenarios cover read, create (trim and boundary), edit (including overlapping saves and immutable columns), delete, tenancy, role denial, Trainer cross-client access, restored membership and last save wins.
- [x] Current role/membership model and backend/RLS enforcement are described.
- [x] No SQL/migration version is invented; the migration scan is not relied upon.
- [x] Clarifications: CN-MCQ-08 copy is recorded (rows 1–29, byte-exact). The open item is numbered (CN-MCQ-15). “No open ambiguities” is NOT stated, because CN-MCQ-15 is open.
- [x] UI follows the authority hierarchy; no icon; horizontal tab placement; text-only copy is bound to the approved table.
- [x] PO binding text quoted byte-exact in spec.md: S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 (Client Notes line) and S38-PO-2 (item 2).
- [ ] Implementation entry check: **FAIL, by design.** CN-MCQ-15 is open, so the zero-open-ambiguity requirement is not met. Implementation is NOT authorized.

## Result

PASS for the spec-only PR gate: 0 open CRITICAL, 0 open HIGH findings. One MEDIUM item (CN-MCQ-15, OPEN) is a PO decision on DESIGN.md §11 UI values; it blocks only the UI layout and token assertions. The implementation gate is closed until CN-MCQ-15 is resolved and Analyze is rerun. This result does not approve product decisions or authorize implementation.
