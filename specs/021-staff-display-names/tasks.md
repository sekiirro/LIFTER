# Tasks: F21 Staff Display Names

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Status**: Spec-only. No task is ticked; no implementation is authorized.

## Task list

- [ ] **T001 [FR-001, FR-002, FR-012]** Design the forward-only staff display-name source and required provisioning field. Define trim, length, letter validation, and one shared AR/EN field. Tag high-risk migration work as Luna-only.
- [ ] **T002 [FR-001, FR-005, FR-010, NAME-12]** Design and implement authorization for setting a staff name: Workspace Owner or Platform Owner only; WO limited to their own workspace unless NAME-12 changes. Include application `authorize()` and RLS parity.
- [ ] **T003 [FR-003, FR-004, FR-005]** Design and implement same-workspace/PO read access for staff names using `app_private.has_workspace_access()` or an equivalent SECURITY DEFINER helper with `set search_path = ''`, owner postgres, and grants/revokes.
- [ ] **T004 [FR-003, FR-005, FR-010]** Add negative tests for client, Sales, anonymous, revoked, and foreign-workspace reads through both application and database boundaries.
- [ ] **T005 [FR-006, FR-007, SC-003, SC-005, NAME-9, NAME-10]** Integrate Client Notes byline with the server-owned name, retain `clientNotes.unavailableAuthor` fallback, and add the approved deactivated marker after NAME-9.
- [ ] **T006 [FR-008, FR-011]** Implement name-change audit with actor and timestamp only, no old/new name values, in the same transaction as the mutation.
- [ ] **T007 [FR-009, FR-011, NAME-8]** Verify deactivation/closure retains the name and follows existing PII pseudonymization and retention rules; no new retention or purge.
- [ ] **T008 [FR-001, FR-002, NAME-11]** Resolve existing-account backfill and required-name enforcement before production.
- [ ] **T009 [FR-001..FR-012, NAME-9..NAME-13]** Re-run Analyze after every spec/plan/tasks change and before implementation.
- [ ] **T010 [FR-003, FR-005, NAME-10]** Design and implement only PO-selected existing surfaces beyond Client Notes; do not add search/sort/export integration without NAME-10.

## Notes

- High-risk items (migration, RLS, SECURITY DEFINER, grants/revokes, CHECK constraints) are Luna-only implementation tasks and require independent architect review plus mutation tests.
- No task is ticked. Evidence must be recorded in `traceability.md` before ticking.
- NAME-9..NAME-13 remain PO-DECISION-NEEDED and block the affected tasks.
