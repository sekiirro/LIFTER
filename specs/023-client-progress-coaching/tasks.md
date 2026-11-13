# Tasks: 023 Client Progress Coaching (P5 Progress)

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Status**: Spec-only. No task is ticked; no implementation is authorized. Unfinished slices merge behind a server-side default-OFF feature flag (constitution 1.16.0).

## Task list

- [ ] **T001 [FR-001, FR-002, FR-003, FR-004, SC-001, SC-002] [Luna-only: scheduling]** Implement weekly check-in scheduling via F15 recurring assignments: first at day 7 then every 7 days including Fridays; pause/resume on freeze with anchor shifted by frozen days; no catch-up; outstanding forms remain visible.
- [ ] **T002 [FR-005, FR-006, FR-007, FR-008, FR-009, SC-003]** Implement login non-gate, in-app reminders at 10:00 AM workspace time on due day and 24h later if unanswered, KPI counting check-ins received, and suppression of active-cycle prompts for frozen clients.
- [ ] **T003 [FR-010, FR-011, FR-014, FR-015, SC-004, SC-005] [Luna-only: migration/RLS]** Implement the dedicated Progress measurement store and auto-extraction from F15 weekly form answers, preserving question mappings, units and history; reject duplicate manual entries for same client/day/type.
- [ ] **T004 [FR-012, FR-013, SC-006] [Luna-only: RLS/audit]** Implement measurement conflict handling (direct in-place update + background audit entry only) and authorized trainer correction (direct update + background audit entry only; no user-facing correction-history UI).
- [ ] **T005 [FR-016, FR-017]** Enforce plan-access visibility restrictions on measurements and keep progress photos over Telegram (no web upload or auto ingestion).
- [ ] **T006 [FR-018, FR-019, FR-020, FR-021, FR-024, SC-007, SC-008]** Implement food replacement request creation (free-text, one open per food, F15 text limits, no attachments), free selection of existing alternatives without request/revision, cancel (no in-place edit), and visibility of existing alternatives.
- [ ] **T007 [FR-022, FR-023, FR-025, FR-026, FR-027, FR-028]** Implement approval via draft revision + manual Ready & Publish within max-3 cap, stale-close on food removal, lifecycle states and notifications, no SLA escalation.
- [ ] **T008 [FR-029, FR-030, FR-031, FR-032, FR-033, SC-009]** Implement client timeline with the fixed meaningful event set, authorized access, existing audit retention, and reuse of F13/F15/F19/F20/P4 event emission.
- [ ] **T009 [FR-034, FR-035, SC-010]** Reuse F20 trainer notes entirely; add no notes FRs, tables or endpoints; timeline references note events via F20 audit only.
- [ ] **T010 [FR-036]** Reuse F15 notification inbox and dedupe patterns for check-in reminders and food replacement requests.
- [ ] **T011 [FR-037, FR-038, SC-011]** Add two self-reported adherence questions (workout, diet) on a 0-10 integer scale to the weekly check-in form; present as neutral self-report items; expose values to spec 024 by `workoutAdherence` and `dietAdherence`; never show leaderboard scoring mechanics.
- [ ] **T012 [FR-001..FR-038]** Re-run Analyze after every spec/plan/tasks change and before implementation.
- [ ] **T013 [FR-001..FR-038]** Merge unfinished slices behind a server-side default-OFF feature flag; remove the flag as part of feature completion; never gate security/authorization/RLS with the flag.

## Notes

- High-risk items (migration, RLS, SECURITY DEFINER, grants) are Luna-only and require independent architect review plus mutation tests.
- No task is ticked. Evidence must be recorded in `traceability.md` before ticking.
- Spec-only lane: no implementation, migrations, tests or merges.