# Analyze: 023 Client Progress Coaching (P5 Progress)

Date: 2026-11-15. Scope: `specs/023-client-progress-coaching/`. This full Analyze follows the S57-PO-8, S57-PO-10 and S57-PO-12 spec changes:

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
  - S57-PO-8, S57-PO-10 and S57-PO-12, each under its own dated heading with the PO words verbatim.

  No open PO question blocks the spec: PASS.

- `plan.md` covers the scope unchanged. Client edit of own manual entries reuses the US2 measurement store and audit, and reminders reuse the spec 022 client inbox, so no plan design change is needed: PASS.
- `tasks.md` has T001..T054 tagged with FR/SC IDs; migration/RLS work is marked `[HIGH-RISK: migration/RLS]`: PASS.
- `traceability.md` maps FR-001..FR-038 and SC-001..SC-011: PASS.

## Findings

- Open CRITICAL: 0.
- Open HIGH: 0.
- MEDIUM, resolved in this pass: FR-012 "direct the user to edit the existing record" conflicted with FR-013's trainer-only correction. S57-PO-8 resolves it: clients edit their own manual entries, and trainers correct everything. FR-012, FR-013, SC-006 and Story 2 now agree. Check-in-extracted measurements stay trainer-only, which is consistent with FR-013 "trainers correct everything".
- LOW, recorded: copy rows marked PROPOSED (client entry value/date/save, the weekly check-in configuration strings, and the 2026-11-14 duplicate-message replacement) await PO approval. The S55-PO-10 approved duplicate text stays in force per S57-PO-12 ("Preserve all other approved copy").
- Dependency, recorded: check-in reminder delivery (FR-006, FR-036; T010, T014) depends on the spec 022 client inbox (S57-PO-10). Food replacement (US3) still depends on F18 contracts.

## Cross-reference sweep

- FR-001..FR-038 and SC-001..SC-011 occur in `spec.md` and are referenced by `tasks.md` and `traceability.md`.
- T001..T054 occur in `tasks.md`.
- S57-PO-8, S57-PO-10 and S57-PO-12 are recorded verbatim in `spec.md`. The register items they resolve are not marked open anywhere in tasks, traceability or this file.
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
