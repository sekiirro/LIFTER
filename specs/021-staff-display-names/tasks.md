# Tasks: F21 Staff Display Names

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Status**: Spec-only. No task is ticked; no implementation is authorized. NAME-17..NAME-20 block the final write-API shape, the request-key record, and the exact allowed-character rule.

## Task list

- [ ] **T001 [FR-001, FR-002, FR-012] [Luna-only: migration]** Design the forward-only staff display-name source and required provisioning field, aligning the NAME-13 allowed characters, the NAME-14 Unicode White_Space trim, the NFC normalization applied before validation and storage, the 1-80 code-point count taken on the NFC form, and one shared AR/EN field.
- [ ] **T002 [FR-001, FR-005, FR-010, NAME-11, NAME-12] [Luna-only: RLS/write policy]** Design and implement authorization for setting/backfilling a staff name: Workspace Owner only for their own workspace, or Platform Owner for platform/PO-owned accounts. Preserve existing staff access during backfill. Include application `authorize()` and RLS parity.
- [ ] **T003 [FR-003, FR-004, FR-005] [Luna-only: RLS/SECURITY DEFINER]** Design and implement same-workspace/PO read access for staff names using `app_private.has_workspace_access()` or an equivalent SECURITY DEFINER helper with `set search_path = ''`, owner postgres, and grants/revokes.
- [ ] **T004 [FR-003, FR-005, FR-010]** Add negative tests for client, Sales, anonymous, revoked, and foreign-workspace reads through both application and database boundaries.
- [ ] **T005 [FR-006, FR-007, FR-013, SC-003, SC-005, NAME-9, NAME-10]** Integrate the server-owned name in the Client Notes author line only, retain `clientNotes.unavailableAuthor` fallback, and append the exact approved deactivated marker. Do not change other surfaces.
- [ ] **T006 [FR-008, FR-011, NAME-15, NAME-16] [Luna-only: migration/audit policy if database-backed]** Implement name-change audit with actor and timestamp only, no old/new name values, atomically with the mutation. Implement the resolved retry/idempotency and concurrent-write behavior and test unknown outcomes, duplicate retries, races, and rollback.
- [ ] **T007 [FR-009, FR-011, NAME-8] [Luna-only: migration/RLS if changed]** Verify deactivation/closure retains the name and follows existing PII pseudonymization and retention rules; no new retention or purge.
- [ ] **T008 [FR-001, NAME-11, NAME-12]** Backfill existing unnamed staff by their Workspace Owner within that workspace or by the Platform Owner for platform/PO-owned accounts; keep access enabled while backfill is pending.
- [ ] **T009 [FR-001..FR-015, NAME-9..NAME-20]** Re-run Analyze after every spec/plan/tasks change and before implementation.
- [ ] **T010 [FR-013, NAME-10]** Keep every surface beyond the Client Notes author line, including its search/sort/export integrations, out of scope; separate proposals are required.
- [ ] **T011 [FR-002, SC-007, NAME-14, NAME-20] [Luna-only: migration]** Add normalization tests: the stored name equals the NFC form of the trimmed submitted value; leading and trailing Unicode White_Space is removed; canonically equivalent submissions store identically; the character and 1-80 code-point checks run on the NFC form and refuse a failing value with no name persisted. The interior whitespace reading is NAME-20 and is not fixed until it is answered.
- [ ] **T012 [FR-011, FR-014, FR-015, SC-008, SC-009, NAME-15, NAME-16, NAME-17, NAME-18, NAME-19] [Luna-only: migration]** Add write-safety tests: a retry under the same request key returns the original outcome, leaves the stored name unchanged and emits no second name-change audit event; a write presenting a stale expected version is rejected with the stored name unchanged and no audit event, and succeeds after the caller reloads the current name; the request-key record holds no staff-name value and follows no new retention rule. The request-key origin (NAME-17), the stale-rejection payload (NAME-18) and the request-key record contents (NAME-19) remain open, so the request shape is not fixed until they are answered.
- [ ] **T013 [FR-004, FR-010, NAME-2, NAME-12] [Luna-only: RLS]** Verify the request key and the expected version are never usable as identity, scope, or permission proof, and that neither appears in the name-change audit event payload.

## Notes

- High-risk items (migration, RLS, SECURITY DEFINER, grants/revokes, CHECK constraints) are Luna-only implementation tasks and require independent architect review plus mutation tests.
- No task is ticked. Evidence must be recorded in `traceability.md` before ticking.
- NAME-17..NAME-20 remain PO-DECISION-NEEDED and block the final write-API request and rejection shapes, the request-key record contents, and the exact allowed-character rule (T011, T012).
