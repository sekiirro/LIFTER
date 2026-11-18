# Analyze: 023 Client Progress Coaching (P5 Progress)

## Re-run 2026-11-18 (notifications on the F22 inbox seam, after PR #108)

Date: 2026-11-18. Scope: `specs/023-client-progress-coaching/`. No FR, SC, acceptance or plan design text changed. Changed text in this pass:

- `tasks.md`: migration names renumbered to 20261125030000 and 20261125030100 (F22 took 20261123000000); evidence for T010, T014, T033 and T040 now that `app_private.f22_enqueue_client_notice` is on main.
- Decision recorded (no new FR): reminders and food replacement notices are produced in the database (hourly job, triggers) rather than by `lib/.../reminders.ts` and a reminders route; staff notices use a sibling inbox table because the F15 inbox is form-alert specific. All copy is the S55-PO-10 approved copy; no new strings.

T028 is implemented on the merged F13 overdue input (PR #265, app_private.f13_client_overdue_state): measurements are restricted while overdue, in SQL (migration 20261125030300).

Result: 0 open CRITICAL, 0 open HIGH. No task in this spec waits on another PR; T051 (docs/) and T054 are orchestrator-owned.

### Review follow-up 2026-11-18 (two independent reviews of PR #109, PASS-WITH-CONDITIONS)

No FR, SC, acceptance or plan design text changed. Recorded decisions and accepted findings:

- A1: `record_progress_measurement` and `parseOwnEntryInput` refuse dates older than 366 Cairo days (migration 20261125030400); the spec sets no floor, so 366 days is an implementation bound, not a product rule.
- A2: the check-in extraction trigger takes the same `clients` row lock as the manual entry. Covered by a definition assertion, not a concurrent-connection test.
- A3/A4: each policy in `f23_weekly_checkin_run` runs in a subtransaction; a failure is audited as `form.weekly_checkin_policy_skipped` and the other workspaces still run. The day's audience is a snapshot taken when the daily run materializes: a client who activates later in the day, or whose due day arrives after the run, is picked up on the next due day (FR-001/FR-009 are per due day; there is no catch-up by design, FR-002).
- A5: confirmed. `scripts/check-migration-timestamps.mjs` validates only the 14-digit UTC format and uniqueness (plus the 11 documented merged exceptions) and `audit-migration-identity` checks uniqueness across origin refs. Neither requires versions to sort after main's newest, and LIFTER has no live database (pre-live, S56-PO-4), so the 20261118200000-200800 F23 versions stay as they are, like F22's 20261118100000 migrations. Renumbering is not required.
- A8: `record_progress_measurement` keeps its `p_client_id` argument (the client wall already rejects any id but the caller's; removing it changes the signature, the 024 contract tests and the catalog fixtures). Accepted LOW.
- A10: `list_progress_measurements` is the audited, plan-access-aware read path for staff and the client; the staff RLS read grant on `progress_measurements` stays because the F23 mutation tests and the spec 024 readers depend on direct row reads inside the same database walls.
- B1: a client cancel after approval returns `already_prepared`; the request stays open with its history and audit.
- B2: the day-of reminder is skipped once the follow-up instant has passed (late start or outage); the follow-up is still sent.
- B3-B5 accepted LOW: approval is open to any `coaching_work` staff (FR-013 and F19 draft rules); a former assigned trainer keeps notices already sent; a cancelled request leaves its `replacementOpen` timeline event (cancel is not a fixed meaningful event, so only open, approved, rejected and stale are projected, and an open event for a cancelled request remains as history).

## Re-run 2026-11-17 (US3 implementation, after the F18 merge)

Date: 2026-11-17. Scope: `specs/023-client-progress-coaching/`. No FR, SC, acceptance or plan design text changed. Changed text in this pass:

- `data-model.md`: the FoodReplacementRequest status list gains `cancelled`, the closed state of a client withdrawal that FR-020 already allows (FR-027's four states are unchanged and remain the server-driven lifecycle);
- `quickstart.md`: scenarios 9-12 now name their tests instead of BLOCKED on F18;
- `tasks.md`: evidence annotations and checkboxes for tasks whose exact-head CI is green, plus the exact missing contract for the tasks that stay blocked.

Result: 0 open CRITICAL, 0 open HIGH. Open dependency, recorded: client-recipient notifications (T010, T014, T033, T040) wait for the spec 022 client inbox on the F15 inbox (PR #108, not merged); the F15 inbox has no generic notice kind for staff either. T028 waits for an overdue access projection from P4/F13. T051 and T054 are orchestrator-owned.

Date: 2026-11-15 (re-run after S57-PO-13). Scope: `specs/023-client-progress-coaching/`. This full Analyze follows the S57-PO-8, S57-PO-10, S57-PO-12 and S57-PO-13 spec changes (S57-PO-13 changes only copy status and the `checkin.config.saved` AR text; no FR, SC or acceptance text):

- FR-006, FR-012, FR-013, FR-036 and SC-006 were changed;
- Story 2 gained acceptance scenario 4;
- the Assumptions, Dependencies and Clarifications register were updated;
- `copy-proposal.md` gained the approved and proposed rows;
- the T014, T026 and T027 descriptions were updated in `tasks.md`.

The previous Analyze (2026-11-14) covered the tasks restructuring and the S56-PO-4 flag cancellation.

## Entry check

- `spec.md` has numbered FRs (FR-001..FR-038), measurable SCs (SC-001..SC-011), and Given/When/Then acceptance scenarios: PASS.
- PO clarifications recorded:
  - S54-PO-5, S54-PO-9, S54-PO-11, S54-PO-12, S48-PO-4;
  - S55-PO-3 (Q1=A, Q2=A, cross-spec spec 024 Q2), S55-PO-5 (S55-023-Q3 = A);
  - S56-PO-4;
  - S57-PO-8, S57-PO-10, S57-PO-12 and S57-PO-13, each under its own dated heading with the PO words verbatim.

  No open PO question blocks the spec: PASS.

- `plan.md` covers the scope unchanged. Client edit of own manual entries reuses the US2 measurement store and audit, and reminders reuse the spec 022 client inbox, so no plan design change is needed: PASS.
- `tasks.md` has T001..T054 tagged with FR/SC IDs; migration/RLS work is marked `[HIGH-RISK: migration/RLS]`: PASS.
- `traceability.md` maps FR-001..FR-038 and SC-001..SC-011: PASS.

## Findings

- Open CRITICAL: 0.
- Open HIGH: 0.
- MEDIUM, resolved in this pass: FR-012 "direct the user to edit the existing record" conflicted with FR-013's trainer-only correction. S57-PO-8 resolves it: clients edit their own manual entries, and trainers correct everything. FR-012, FR-013, SC-006 and Story 2 now agree. Check-in-extracted measurements stay trainer-only, which is consistent with FR-013 "trainers correct everything".
- LOW, resolved: the copy rows that were PROPOSED (client entry value/date/save, the weekly check-in configuration strings) are approved by S57-PO-13, with `checkin.config.saved` AR changed by the PO. The S55-PO-10 duplicate message stays final. No copy is pending.
- Dependency, recorded: check-in reminder delivery (FR-006, FR-036; T010, T014) depends on the spec 022 client inbox (S57-PO-10). Food replacement (US3) still depends on F18 contracts.

## Cross-reference sweep

- FR-001..FR-038 and SC-001..SC-011 occur in `spec.md` and are referenced by `tasks.md` and `traceability.md`.
- T001..T054 occur in `tasks.md`.
- S57-PO-8, S57-PO-10, S57-PO-12 and S57-PO-13 are recorded verbatim in `spec.md`. The register items they resolve are not marked open anywhere in tasks, traceability or this file.
- Top 5 placement inside Progress (S57-PO-12) is recorded as a spec 024 dependency. This spec defines no leaderboard scoring (FR-038 unchanged).
- Reuse-not-duplicate preserved with F13/F15/F17/F18/F19/F20/F21 and specs 022/024.
- No copy outside `copy-proposal.md`.

## Constitution check

- Principle I: PASS. A client edit is limited to the client's own manual rows, behind client and database walls, with foreign-client, foreign-workspace, staff-as-client and anon denials.
- Principle IV: PASS. Every changed FR traces to S57-PO-8, S57-PO-10 or S57-PO-12.
- Principle VII: PASS. The background audit is append-only for client edits too, with no correction-history UI.
- Principle IX: PASS. Reminders stay idempotent through the inbox dedupe key.
- Development workflow: Analyze dated 2026-11-15, after the latest spec/tasks change, with zero open CRITICAL/HIGH findings.

## Result

Analyze passes with 0 open CRITICAL/HIGH findings. Feature flags stay cancelled while LIFTER is not live (PO S56-PO-4). Security, authorization and RLS safeguards remain mandatory.
