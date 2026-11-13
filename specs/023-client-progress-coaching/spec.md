# Feature Specification: 023 — Client Progress Coaching (P5 Progress)

**Feature Branch**: `023-client-progress-coaching`
**Spec directory**: `specs/023-client-progress-coaching`
**Status**: Draft — Specify + Clarify. Spec-only. Open PO questions remain (see `## Open questions for the PO`).
**Created**: 2026-11-13
**Scope**: P5 Progress coaching loop: weekly check-ins, measurements, food replacement requests, client timeline. Trainer notes reuse F20 (no new notes FRs). Client leaderboard is a SEPARATE spec (024) and is NOT included here.

**Input**: S54 spec lane scope (P5 Progress); PO decisions S54-PO-9, S54-PO-11, S54-PO-12; Phase 1 audits `s54-luna-p4audit/p4-audit.md`, `s54-beam-p5audit/p5-audit.md`; MCQ table `s54-arch/p4p5-phase1-decisions.md`.

## User Scenarios & Testing

### Story 1 — Weekly check-in (P1)

A client with an active subscription receives a weekly check-in form 7 days after activation and every 7 days thereafter. During a freeze the cycle pauses and resumes shifted by frozen days with no catch-up. The client is reminded on the check-in day and again 24 hours later if unanswered.

**Independent test**: Activate a synthetic subscription, assert first check-in at day 7, subsequent at day 14, apply a 3-day freeze between, assert resume shift and no catch-up delivery.

**Acceptance scenarios**

1. **Given** a client whose subscription activated on day 0, **When** day 7 arrives, **Then** a weekly check-in form is assigned (FR-001).
2. **Given** a 3-day freeze starting day 5, **When** the freeze ends, **Then** the next check-in occurs 3 days later than the un-frozen schedule and no missed check-ins are delivered (FR-002).
3. **Given** an unanswered check-in on its due day, **When** 24 hours pass without submission, **Then** a second reminder is sent (FR-006).
4. **Given** a client who has not submitted a check-in, **When** they log in, **Then** login is not gated on check-in completion (FR-005).

### Story 2 — Measurements (P1)

Measurements are auto-extracted from weekly check-in form answers into a dedicated Progress store, preserving question mappings, units and history. A client cannot create a duplicate manual entry for the same day/type. Any authorized trainer may correct a measurement with history.

**Independent test**: Submit a weekly form containing mapped measurement answers, assert a Progress record exists with source reference and original units; attempt a same-day duplicate, assert rejection; correct as a second trainer, assert history entry.

**Acceptance scenarios**

1. **Given** a weekly form submission with measurement-mapped answers, **When** it is processed, **Then** corresponding Progress measurements are created with source reference and original units (FR-010).
2. **Given** an existing measurement for client/type/day, **When** a second entry is attempted (manual or auto), **Then** it is rejected and the user is directed to edit the existing record (FR-012).
3. **Given** an authorized trainer, **When** they correct a measurement, **Then** the correction persists with an edit-history entry recording actor, timestamp and previous/new values (FR-013).

### Story 3 — Food replacement request (P2)

A client freely selects from existing approved alternatives. For a new alternative, the client submits a free-text request; the trainer adds/replaces it within the max-3 slots via a draft revision and manual publish. The client may cancel an open request but not edit it.

**Independent test**: Client selects an existing alternative (no request created); client submits a request, trainer approves via draft+publish within cap; client cancels an open request.

**Acceptance scenarios**

1. **Given** approved alternatives exist for a food, **When** the client selects one, **Then** no request or plan revision is created (FR-017).
2. **Given** a client submits a free-text request for a new alternative, **When** it is accepted, **Then** one open request exists for that food and existing alternatives remain visible (FR-018, FR-023).
3. **Given** an open request, **When** the client cancels it, **Then** the request closes and a new request may be submitted (FR-019).
4. **Given** trainer approval, **When** they add the alternative, **Then** it occupies one of the max-3 slots via a draft revision requiring manual Ready & Publish; no auto-publish (FR-021, FR-022).
5. **Given** the target food is removed in a newer revision, **When** the revision publishes, **Then** the open request closes as stale (FR-024).

### Story 4 — Client timeline (P2)

A client and authorized staff view a concise chronological timeline of meaningful events. It does not duplicate every audit write and follows existing audit retention.

**Independent test**: Trigger registration, delivery, freeze, replacement events for a client; assert timeline shows exactly the fixed meaningful set in order; assert no micro-audit events.

**Acceptance scenarios**

1. **Given** meaningful events occurred, **When** the client opens the timeline, **Then** only the fixed meaningful set is shown in chronological order (FR-028, FR-030).
2. **Given** an authorized trainer in the workspace, **When** they open the client timeline, **Then** the same fixed set is visible (FR-029).
3. **Given** a Sales or Client actor without authorization, **When** they request the timeline, **Then** access is denied (FR-029).

### Edge cases

- What happens when a freeze starts and ends within the same 7-day window? The anchor shifts by frozen days; no catch-up.
- What happens when an auto-extracted measurement conflicts with an existing same-day record? See open MCQ S54-023-Q2.
- What happens when a weekly form question mapping changes between revisions? Historical measurements preserve their original mapping and units (Assumptions).
- What happens when a food replacement request is open and the client's subscription expires? Follows F13 plan-access restrictions; request state retained.

## Functional Requirements

### Weekly check-ins (P5-A)

- **FR-001**: The system MUST schedule the first weekly check-in 7 days after subscription activation and every 7 days thereafter, including days falling on Fridays. (Source: S54-PO-12 Q15; BRD-04.6)
- **FR-002**: The system MUST pause the 7-day check-in cycle during an active freeze and resume after unfreeze with the original anchor shifted by the number of frozen days; no check-ins missed during the freeze MUST be delivered after resume (no catch-up). (Source: S54-PO-11 Q1=A; S54-PO-12 Q15; F13 freeze; F15 FR-003 no-catch-up)
- **FR-003**: The system MUST reuse the F15 recurring assignment engine for check-in occurrence creation; P5-A MUST NOT define a separate scheduler or occurrence table. (Source: S54-PO-11 Q3=A; p5-audit S54-P5-Q3)
- **FR-004**: Previously outstanding check-in forms MUST remain visible across freeze and resume. (Source: BRD-04.6)
- **FR-005**: Weekly check-in completion MUST NOT be a login gate. (Source: BRD-04.6)
- **FR-006**: The system MUST send an in-app reminder on the check-in day and a second reminder 24 hours later if the check-in remains unanswered. (Source: S54-PO-11 Q2 written)
- **FR-007**: Reminder time-of-day MUST be resolved per open MCQ S54-023-Q1; until resolved, no fixed time may be assumed. (Source: lane scope; p5-audit S54-P5-Q2)
- **FR-008**: Check-in KPI "handled check-ins received" MUST count check-ins received, not check-ins sent. (Source: BRD-05)
- **FR-009**: A frozen client MUST NOT receive inappropriate active-cycle check-in prompts. (Source: BRD-04.6)

### Measurements (P5-B)

- **FR-010**: The system MUST maintain a dedicated Progress measurement store with a source reference to the weekly form submission when a measurement is captured via a form. (Source: S54-PO-11 Q4=A; p5-audit S54-P5-Q4)
- **FR-011**: The system MUST auto-extract measurements from F15 weekly form answers into the Progress store, preserving question mappings, units and history. (Source: S54-PO-11 Q5 written)
- **FR-012**: The system MUST reject a second measurement entry for the same client/day/type and direct the user to edit the existing record, except where an auto-extract conflicts (see open MCQ S54-023-Q2). (Source: S54-PO-11 Q6=A; p5-audit S54-P5-Q6)
- **FR-013**: Any authorized trainer in the workspace MAY correct a measurement; corrections MUST be recorded in edit history with actor, timestamp, previous and new values. (Source: S54-PO-11 Q7=A; BRD-09)
- **FR-014**: Measurement types and units MUST be derived from the F15 weekly form question mappings; P5 MUST NOT define a separate measurement catalog. (Source: S54-PO-11 Q5 written)
- **FR-015**: The system MUST NOT create duplicate manual measurement entries that duplicate an auto-extracted measurement for the same client/day/type. (Source: S54-PO-11 Q5 written)
- **FR-016**: Measurements MUST be visible to the client during an active subscription and subject to F13 plan-access restrictions on expiry/overdue. (Source: BRD-04.8; F13)
- **FR-017**: Progress photos MUST remain exchanged over Telegram; no web photo upload or automatic Telegram photo ingestion. (Source: BRD-01; PRD-01)

### Food replacement requests (P5-C)

- **FR-018**: Clients MAY freely select from existing approved F18 alternatives for a food item without creating a request or plan revision. (Source: S54-PO-11 P5 Q8-10)
- **FR-019**: A NEW alternative requires a client request; the client MAY submit a free-text request per food item, with at most one open request per food. (Source: BRD-05; F18 FR-022)
- **FR-020**: A client MAY cancel an open request; editing an open request in place is NOT allowed (cancel then submit a new request). (Source: S54-PO-11 Q11=A; p5-audit S54-P5-Q11)
- **FR-021**: Request text MUST reuse F15 short/long text limits (150/1,000 code points) and 4,096 UTF-8 bytes per answer; no attachments. (Source: S54-PO-11 Q12=A; F15 FR-032)
- **FR-022**: On approval, the trainer MUST add/replace the alternative within F18's max-3 alternatives per food via a draft plan revision and MUST manually Ready & Publish; approval MUST NOT auto-publish. (Source: S54-PO-11 P5 Q8-10; p5-audit S54-P5-Q9 option A; F19)
- **FR-023**: An approved replacement MUST occupy one of the max-3 alternative slots (replacing an existing alternative) and MUST NOT temporarily exceed the cap. (Source: S54-PO-11 Q10=A; F18 FR-006)
- **FR-024**: Pending requests MUST NOT hide existing approved alternatives. (Source: BRD-05)
- **FR-025**: If the target food is removed in a newer plan revision, the open request MUST close as stale. (Source: BRD-05)
- **FR-026**: P5-C MUST preserve F18 alternative mapping, client-specific totals/exports and fallback rules. (Source: S54-PO-11 P5 Q8-10)
- **FR-027**: Food replacement lifecycle states MUST be: open, rejected, approved-via-published-revision, stale-closed; an in-app notification MUST be sent to the authorized trainer/workspace owner on open and to the client on rejection/approval. (Source: p5-audit S54-P5-Q8 option A)
- **FR-028**: Food replacement requests MUST NOT trigger SLA escalation. (Source: BRD-05)

### Client timeline (P5-E)

- **FR-029**: The system MUST provide a concise chronological timeline of meaningful events: registration, renewal, first workout/nutrition delivery, trainer assignment change, replacement request open/approved/rejected/stale, freeze apply/remove, closure. (Source: S54-PO-11 Q13=A; BRD-06)
- **FR-030**: The timeline MUST be visible to the client (own) and to authorized trainers, workspace owners and platform owners in the workspace. (Source: S54-PO-11 Q14=A; BRD-06)
- **FR-031**: Timeline entries MUST follow the app's existing audit retention; no new retention rule is added. (Source: S54-PO-11 Q14=A; F20)
- **FR-032**: The timeline MUST NOT duplicate every audit write; only the fixed meaningful set is included. (Source: BRD-06; BRD-09)
- **FR-033**: The timeline MUST reuse event emission from F13/F15/F19/F20/P4 and MUST NOT duplicate audit rows. (Source: p5-audit overlap map)

### Trainer notes (P5-D) — reuse only

- **FR-034**: Trainer notes are governed entirely by F20 (spec 020); P5 MUST add no notes FRs, tables or endpoints. (Source: S54-PO-11; p5-audit P5-D)
- **FR-035**: The timeline MAY reference note-related meaningful events only via F20's audit events, without duplicating note content. (Source: F20)

### Notifications / reuse

- **FR-036**: In-app notifications for check-in reminders and food replacement requests MUST reuse the F15 notification inbox and dedupe patterns; no duplicate inbox. (Source: p4-audit overlap map; F15)

## Key Entities

- **WeeklyCheckIn**: occurrence with client, subscription, scheduled date, form reference, status (assigned/submitted/expired), freeze-adjusted anchor.
- **ProgressMeasurement**: client, type, value, unit, recorded date, source form submission reference, correction history.
- **MeasurementCorrection**: measurement reference, actor, timestamp, previous value, new value.
- **FoodReplacementRequest**: client, food item, plan revision reference, free-text, status (open/rejected/approved-via-published-revision/stale-closed), created/closed timestamps.
- **ClientTimelineEntry**: client, event type (fixed set), occurred at, actor label, optional reference id.

## Success Criteria

- **SC-001**: Under normal (non-frozen) conditions, the first check-in is assigned exactly 7 days after activation and every 7 days thereafter, including Fridays.
- **SC-002**: During a freeze of N days, no check-in is scheduled; after resume the next check-in is shifted by N days; zero catch-up deliveries.
- **SC-003**: 100% of unanswered check-ins receive a reminder on the due day and a second reminder 24 hours later.
- **SC-004**: 100% of measurements auto-extracted from form submissions appear in the Progress store with a source reference and original units.
- **SC-005**: Zero duplicate measurement records for the same client/day/type.
- **SC-006**: 100% of corrections by authorized trainers persist with an edit-history entry.
- **SC-007**: Clients can select existing approved alternatives without a request or revision; a new alternative requires a request and trainer manual publish.
- **SC-008**: 100% of food replacement requests obey one-open-per-food and the F15 text limits with no attachments.
- **SC-009**: 100% of timeline views show only the fixed meaningful set, to authorized actors only.
- **SC-010**: No new notes FRs or duplicate F20 functionality is introduced by P5.

## Assumptions

- Measurement types and units are derived from F15 weekly form question mappings; historical measurements preserve their original mapping snapshot even if the form question changes later.
- Manual measurement entry by the client is permitted only where it does not duplicate an auto-extracted measurement for the same client/day/type (Q6=A).
- Timeline ordering is chronological (newest or oldest per UI convention) with a deterministic tie-break; pagination is a UI concern outside this spec.
- Food replacement notification recipients follow p5-audit Q8 option A (authorized trainer/workspace owner on open; client on resolution).
- KPI "handled check-ins received" is consumed by P7 reporting; no payroll consequence is added by P5.
- Existing audit retention (F11/F20) applies to all P5 tables; no new retention rule.

## Dependencies

- F13 freeze/renewal/refunds (freeze intervals, entitlement) — reuse.
- F15 forms/intake (recurring assignments, autosave, snapshots, SLA, retention, notification inbox) — reuse.
- F18 nutrition planner (alternatives, publish revisions, max-3 cap) — reuse.
- F19 plan core (publish/delivery/activation) — reuse.
- F20 client notes (notes, audit) — reuse; no new P5 notes spec.
- F21 staff display names (bylines) — reuse.
- F11 auth/audit/RLS — reuse.
- P4 client portal/notifications — P5-A/B/C/E require client dashboard and in-app notifications.

## Overlap / reuse (must not duplicate)

- F13 freeze engine — P5-A consumes intervals/state only.
- F15 scheduler — P5-A reuses; no separate scheduler.
- F18 alternatives — P5-C reuses; owns request workflow only.
- F19 publish — P5-C approval prepares draft; manual publish.
- F20 notes — P5-D = F20; no duplicate.
- F21 bylines — P5-D depends on F21.
- F15 notification inbox — P5-A/P5-C reuse.
- Open PRs #58, #86, #88, #90 — touchpoints; coordinate, no duplicate.

## Clarifications

### PO decision register (decided items)

1. **S54-PO-5** (2026-11-13): P5 deferred from v1; spec-only planning now; F20 is the v1-allowed P5 subset. (Governs all P5 features.)
2. **S54-PO-9** (2026-11-13): Phase 1 audit; no assumptions; unresolved decisions remain MCQs.
3. **S54-PO-11** (2026-11-13): Written decisions override MCQ letters. P5: Q1=A, Q3-4=A, Q6-7=A, Q11-15=A. Q2: reminder on check-in day + 24h later if unanswered. Q5: auto-extract measurements from F15 weekly forms into Progress, preserving mappings, units and history; no duplicate entry. P5 Q8-10: clients freely select existing approved alternatives without requests/revisions; new alternatives require requests; trainer adds/replaces within max-3 via draft + manual publish; preserve F18 mapping, client-specific totals/exports and fallback rules. Leaderboard is a separate spec. Propose EN/Egyptian Arabic copy.
4. **S54-PO-12** (2026-11-13): Q15 (added by ChatGPT) = first weekly check-in 7 days after activation, then every 7 days; account for freezes. Q16 = move workspace-isolated Client Top-5 leaderboard from P8 to P5 (separate spec 024). Q17 = rank using adherence + goal-relative progress; formula pending PO (spec 024).
5. **S48-PO-4** (2026-11-12): All Arabic user-facing text must be natural Egyptian colloquial Arabic; English copy professional.
6. **F13 freeze** (spec 013): P5-A consumes effective intervals; no freeze engine duplicate (F13 FR-032).
7. **F15 forms** (spec 015): recurrence resumes after freeze without catch-up (F15 FR-003); P5-A reuses recurring assignments.
8. **F18 nutrition** (spec 018): max 3 alternatives per food (FR-006); client food-replacement requests excluded (FR-022) — P5-C owns request workflow.
9. **F19 plan core** (spec 019): Ready & Publish is an explicit action; P5-C approval prepares draft.
10. **F20 client notes** (spec 020): notes governed by F20; P5 adds no notes spec.
11. **BRD-04.6/04.8, BRD-05, BRD-06, BRD-09** master: check-in recurrence, measurement entry/correction, food replacement, timeline events, client visibility.
12. **Resolved MCQs**: S54-P5-Q1=A, Q3=A, Q4=A, Q6=A, Q7=A, Q8-10 (written), Q11=A, Q12=A, Q13=A, Q14=A, Q15=A. Q2 behavior resolved (reminder day + 24h); time-of-day open (S54-023-Q1). Q5 resolved as auto-extract (written).

### Open questions for the PO

#### S54-023-Q1 — Reminder time of day

**Question**: At what time of day should the two check-in reminders be sent?

**Why it matters**: Determines reminder scheduling and notification copy timing for P5-A.

**Options**:

| Option | Description                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Inherit the assigned form's weekly day and a single default time; repetition once (p5-audit recommendation). Exact default time requires PO approval. |
| B      | Fixed platform-wide time for all workspaces.                                                                                                          |
| C      | Workspace-configured time; no default until configured.                                                                                               |
| D      | Per-client configured time.                                                                                                                           |

**Recommendation**: A, unless PO prefers workspace configurability (C). Exact default time string must be PO-approved (EN + Egyptian Arabic not applicable to time, but time value is a product decision).

**Blocks**: P5-A reminder scheduling and notification tests.

#### S54-023-Q2 — Same-day measurement conflict with auto-extract

**Question**: When an auto-extracted measurement conflicts with an existing same-day record (from a prior form submission or manual entry), what should happen?

**Why it matters**: Determines data integrity and history semantics for P5-B.

**Options**:

| Option | Description                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------- |
| A      | Auto-extract updates the existing same-day record and appends a correction-history entry (recommended). |
| B      | Auto-extract skips (first record wins) and logs a conflict for trainer review.                          |
| C      | Auto-extract creates a new timestamped version; display dedups by day.                                  |

**Recommendation**: A, to keep a single same-day record with auditable history.

**Blocks**: P5-B data model and auto-extract implementation.

## Out of scope

- Client leaderboard (spec 024).
- Plan PDF/Excel exports (deferred per S54-PO-5).
- Finance reporting (deferred per S54-PO-5).
- Trainer notes implementation (F20, separate spec).
- Any implementation, migrations, tests, merges or deployment (spec-only lane).

## Copy

All user-visible strings for this feature are proposed in `copy-proposal.md` (status PROPOSED — PENDING PO APPROVAL). No copy is approved by this spec.
