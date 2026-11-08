# Tasks: F20 Client Notes

**Status**: Planning only. CN-MCQ-01..07 and CN-MCQ-09..12 are resolved by the PO (S37-PO-6, S37-PO-7). CN-MCQ-08, CN-MCQ-13 and CN-MCQ-14 remain PENDING-PO. No implementation task is authorized until Analyze is rerun and implementation is approved.

## Documentation / planning task

- [ ] **T001 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010]** Prepare the spec-only feature contract, plan, data model, research, and decision register, including the S37 PO answers. Do not implement code or SQL. Evidence will be the reviewed artifacts and documentation gates; not implementation acceptance.

## Future implementation tasks

- [ ] **T002 [FR-004, FR-005]** Confirm current Client Details authorization integration and record app/database role-action parity for workspace-wide Trainer access (CN-MCQ-04 resolved). Not blocked.
- [ ] **T003 [FR-002, FR-003, FR-005, FR-010]** Add forward-only workspace/client note persistence (`created_at`, nullable `edited_at`, body check) and deny-by-default RLS, after a fresh all-origin migration scan. Blocked by CN-MCQ-14 for the stored body form only.
- [ ] **T004 [FR-002, FR-003, FR-004, FR-008, FR-009, FR-010]** Implement server-side read/create/edit/hard-delete boundaries using verified actor and existing membership/role model, newest-created-first list order, last-save-wins edits and metadata-only audit events. Blocked by CN-MCQ-14 for the stored body form. CN-MCQ-13 blocks only the audit retention setting, not event writing.
- [ ] **T005 [FR-001, FR-002, FR-003, FR-007, FR-008, FR-009]** Implement the bilingual Client Notes tab (horizontal, text-only, local-time display) and interaction states within Client Details. Blocked by CN-MCQ-08 (tab label, state messages, Arabic strings, “edited” and “Unavailable author” labels, timestamp format). “Add New Note” English wording is fixed.
- [ ] **T006 [FR-004, FR-005]** Add RLS/integration denial tests for every role/action, revoked membership, forged scope and cross-workspace access, plus authorized actor cases.
- [ ] **T007 [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010]** Run independent UI/security review, Analyze, repository checks, and required PR gates on the implementation head. Runs last.

## Test tasks (test-first; each runs before its implementation task is accepted)

- [ ] **T008 [P] [FR-008]** Add failing tests for list order: newest-created first, deterministic tie-break on equal `created_at`, and an edit does not change a note's position. Not blocked.
- [ ] **T009 [P] [FR-002]** Add failing tests for the body rule: 1 and 5,000 Unicode code points accepted; 5,001 code points refused; astral-plane characters count as one code point; blank and whitespace-only bodies refused; no row persisted on refusal. Not blocked.
- [ ] **T010 [P] [FR-003, FR-009]** Add failing tests for edits: author with current membership succeeds; author after revocation denied; author after restored membership succeeds again; non-author Trainer or Workspace Owner denied; two valid saves leave the last save as content; `edited_at` is set; `created_at` and `author_user_id` unchanged; no version rows.
- [ ] **T011 [P] [FR-004]** Add failing positive and negative tests for access: a Trainer not assigned to a client can view and create notes for that client in the same workspace; the same Trainer is denied in another workspace; Sales, Client and anonymous are denied; non-PO hard delete (including the author) is denied; PO hard delete removes the row.
- [ ] **T012 [P] [FR-010]** Add failing tests for audit: exactly one event per successful create, edit and hard delete; each event contains only actor, workspace, client ID, note ID, action and timestamp; the body text never appears in any audit payload; denied operations emit no event.
- [ ] **T013 [P] [FR-001, FR-002, FR-007, FR-009]** Add failing UI tests (unit, e2e, axe) for: horizontal tab placement; text-only tab with no icon; keyboard path and visible focus; “Unavailable author” label for a note with an unavailable author; viewer-local timestamps; EN LTR and AR RTL rendering. Strings are blocked by CN-MCQ-08.

## Dependency order

Resolve CN-MCQ-08, CN-MCQ-13 and CN-MCQ-14 before the blocked tasks (T003, T004, T005, T013 string assertions). Rerun Analyze after any artifact change. T002 precedes T003–T005. The test tasks T008–T013 are written before the implementation they cover. T003 and T004 precede T005. T006 verifies all boundaries. T007 is last. Every implementation task remains unchecked until its tests have executed and passed on the implementation head.
