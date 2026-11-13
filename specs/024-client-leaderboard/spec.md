# Feature Specification: F24 — Workspace-Isolated Top-5 Client Leaderboard

**Feature Branch**: `024-client-leaderboard`
**Spec directory**: `specs/024-client-leaderboard`
**Status**: Spec-only (Clarify complete except for the numbered blocking PO questions below). No implementation, migrations, tests, merges or deployment are authorized by this spec.
**MCQ ID prefix**: `S55-024-Q`
**Lane**: s55-luna-spec024b (SPEC LANE)

## Scope and authority

This spec defines the monthly, workspace-isolated Top-5 client leaderboard moved from P8 to P5 by S54-PO-11. S55-PO-3 resolves the scoring, eligibility, display identity, visibility, approval, and notice decisions. Three product gaps remain as numbered MCQs in `## Open questions for the PO`; they block planning.

Authority (newer overrides older): S54-PO-9, S54-PO-11, S54-PO-12 (verbatim files under `C:/Users/NEW LAP/.lifter/runs/s54-po/`) plus earlier PO decisions cited in the Phase 1 audits `C:/Users/NEW LAP/.lifter/runs/s54-luna-p4audit/p4-audit.md` and `C:/Users/NEW LAP/.lifter/runs/s54-beam-p5audit/p5-audit.md`, and the MCQ table `C:/Users/NEW LAP/.lifter/runs/s54-arch/p4p5-phase1-decisions.md`. BRD/PRD master line 219 is the originating requirement. Constitution: `.specify/memory/constitution.md`.

## Binding source quotations

BRD/PRD master line 219 (PRD-09):

```text
Optional top-five leaderboard with client names/profile photos requires Platform Owner approval before publishing; ensure participants know they may appear and can request removal/opt out. Do not impose universal prior opt-in as an extra signup gate.
```

PO S54-PO-11 (`C:/Users/NEW LAP/.lifter/runs/s54-po/s54-po-11.verbatim.txt`), relevant excerpt:

```text
Client Leaderboard: Move workspace-isolated Top-5 from P8 to P5. Separate spec-only PR for my friend. Ranking combines adherence and goal-relative progress. Ask PO about scoring, eligibility and privacy.
```

PO S54-PO-12 (`C:/Users/NEW LAP/.lifter/runs/s54-po/s54-po-12.verbatim.txt`), historical excerpt (the formula was later decided by S55-PO-3):

```text
Q15-Q17 were added by ChatGPT:
- Q15: First weekly check-in 7 days after activation, then every 7 days. Account for freezes.
- Q16: Move workspace-isolated Client Top-5 Leaderboard from P8 to P5.
- Q17: Rank using adherence + goal-relative progress.
Treat these as additional PO decisions, not your original MCQ options.
```

PO S54-PO-9 (`.../s54-po-9.verbatim.txt`): "Delegate independent P4, P5 Progress and P5 Leaderboard spec agents... Propose EN/Egyptian Arabic copy for PO approval... No implementation, merges or deployment."

S48-PO-4 (`.../s48-po/s48-po-4.verbatim.txt`): all Arabic user-facing text must be natural Egyptian colloquial; English copy professional. (Governs any approved copy.)

## Dependency list (reuse, never duplicate)

This feature consumes; it does not redefine:

- **Spec 003 tenancy/RLS** (`specs/003-tenancy-rls`): workspace isolation and RLS boundaries for all leaderboard reads/writes.
- **Spec 005 audit log** (`specs/005-audit-log`): approval/rejection, opt-out/removal and configuration-change audit events.
- **Spec 013 freeze/renewal/refunds** (`specs/013-freeze-renewal-refunds`): subscription status, entitlement, freeze intervals, renewal. Leaderboard eligibility consumes F13 state; must not duplicate freeze engine.
- **Spec 015 forms/intake** (`specs/015-forms-intake`): weekly check-in forms, recurring assignments, SLA, retention. Adherence inputs reuse F15; must not duplicate scheduler.
- **Spec 017 workout planner** (`specs/017-workout-planner`): published workout plan revisions and delivery facts.
- **Spec 018 nutrition planner** (`specs/018-nutrition-planner`): published nutrition plan revisions, alternatives, selection.
- **Spec 019 plan core** (`specs/019-plan-core`): `plan_deliveries`, activation sources, atomic delivery/activation transaction. Plan-adherence inputs reuse F19.
- **Spec 020 client notes** (`specs/020-client-notes`): internal-only notes boundary; leaderboard must never expose notes.
- **Spec 021 staff display names** (`specs/021-staff-display-names`): server-owned staff identity; staff names are not client identities.
- **Spec 023 client progress/coaching** (branch `023-client-progress-coaching`, in progress in parallel): measurements, check-ins, progress visibility. **This spec references spec 023 by name and does not redefine its data.** Goal-relative progress inputs are consumed from spec 023's approved measurement/check-in model.
- **Open PRs**: #58 (F15 UI), #86 (F16 catalog), #88 (F13), #90 (F20). Coordinate; do not clone.

Out of scope (deferred/not owned): finance reporting, exports, P4 client portal implementation, Telegram bot, full P8 hardening. Leaderboard is optional and post-MVP gating applies.

## User Scenarios & Testing

### Story 1 — Platform Owner publishes a leaderboard (Priority P1)

A Platform Owner (PO) approves and publishes a workspace-isolated Top-5 leaderboard so eligible clients in that workspace can see a ranked list. Publication is an explicit, audited action; nothing is client-visible before approval.

**Independent test**: With a workspace containing at least 5 eligible clients and PO approval recorded after WhatsApp verification, publish and verify exactly 5 ranked entries appear to authorized viewers; without approval, verify no client-visible leaderboard.

**Acceptance scenarios**

1. **Given** a workspace with at least 5 eligible clients and completed WhatsApp verification, **When** the PO manually approves publication, **Then** a ranked monthly Top-5 list becomes visible to authorized viewers and the approval is audited (FR-003, FR-039).
2. **Given** no PO approval, **When** any viewer requests the leaderboard, **Then** no ranked list is returned (FR-003, FR-004).
3. **Given** WhatsApp verification has been completed, **When** the PO rejects the monthly result, **Then** the decision is recorded and no client-visible result is published (FR-003, FR-026, FR-039).

### Story 2 — Eligible client appears and can opt out (Priority P1)

An eligible client is informed once on the dashboard when first eligible and can find the notice in account settings. Participation is opt-out by default, with no prior signup gate.

**Independent test**: Enroll an eligible client, verify the one-time dashboard notice and account-settings notice, then verify the client's username appears only after PO approval and not after an opt-out request.

**Acceptance scenarios**

1. **Given** a client who becomes eligible for the first time, **When** they open the dashboard, **Then** the notice is shown once and remains available in account settings (FR-005, FR-013).
2. **Given** an eligible, non-opted-out client, **When** the PO approves a monthly publication, **Then** their username may appear in the ranked list (FR-013, FR-015, FR-022).
3. **Given** a client who opts out, **When** a later monthly result is approved, **Then** they do not appear (FR-007, FR-008).
4. **Given** a client who requests removal, **When** the request is handled under the PO-selected flow, **Then** the required removal occurs and is audited (FR-007–FR-009, FR-039; S55-024-Q13).

### Story 3 — Ranking uses adherence + goal-relative progress (Priority P1)

The ranked order reflects an equal-weight composite of adherence and normalized improvement versus baseline, using the two self-reported workout and diet adherence answers specified by spec 023. The scoring mechanics are never disclosed in client-facing copy.

**Independent test**: Given fixed adherence answers and normalized baseline improvement values, verify ordering matches the approved composite and tie-break rules.

**Acceptance scenarios**

1. **Given** eligible clients with differing adherence and normalized baseline improvement, **When** the monthly leaderboard is computed, **Then** ordering follows the equal-weight composite (FR-015–FR-018).
2. **Given** two clients with equal scores, **When** the leaderboard is computed, **Then** higher adherence, earlier achievement date, then client code determines order (FR-021).

### Story 4 — Privacy: no health values shown (Priority P1)

No health metric, measurement, weight, body-fat, check-in answer, note, or progress photo appears anywhere in the leaderboard or its exports.

**Independent test**: Inspect leaderboard payload and UI for any health-related field; assert none present.

**Acceptance scenarios**

1. **Given** a published leaderboard, **When** any viewer reads it, **Then** only non-health display fields are present (FR-022, FR-023, FR-024).
2. **Given** an opted-out client, **When** a later leaderboard is published, **Then** their username is absent (FR-008, FR-022).

### Story 5 — Workspace isolation (Priority P1)

A leaderboard never mixes or exposes clients across workspaces.

**Independent test**: Create two workspaces with eligible clients; publish in one; assert the other workspace's clients never appear.

**Acceptance scenarios**

1. **Given** two workspaces, **When** a leaderboard is published in workspace A, **Then** no client from workspace B appears (FR-001, FR-037).

### Edge cases

- Fewer than 5 eligible clients: list only eligible (FR-002).
- A prior monthly winner remains displayed and recognized until outperformed by a new competitor; the score basis and update/approval boundary remain open as S55-024-Q12.
- Client opts out after appearing: must not be included in subsequent client-visible results (FR-007–FR-009); removal from an already displayed result is part of S55-024-Q13.
- Client becomes ineligible (subscription ends, freeze): no longer eligible under FR-010–FR-012.
- Tie scores: per approved tie-break (FR-021).
- Opt-out before manual PO approval: honored before the result is made visible (FR-008).

## Functional Requirements

### Scope, governance and publishing

- **FR-001**: The leaderboard MUST be workspace-isolated: only clients belonging to the same workspace may be ranked against or displayed to each other; no cross-workspace aggregation or visibility is permitted (BRD workspace isolation; S54-PO-11; spec 003).
- **FR-002**: Each published leaderboard MUST contain at most 5 ranked entries (Top-5); if fewer than 5 clients are eligible, only eligible clients are listed (BRD "top-five"; S54-PO-11).
- **FR-003**: Every client-visible monthly leaderboard result MUST receive the Platform Owner's manual final approval after WhatsApp verification. WhatsApp verification occurs outside the application; the application records the PO's approval or rejection and an audit event. No result becomes client-visible without approval (S55-PO-3; BRD line 219).
- **FR-004**: The leaderboard is optional: if no approved monthly result exists for a workspace, no leaderboard is shown to any viewer (BRD "Optional").
- **FR-005**: A client-facing notice that the client may appear MUST be shown once on the client dashboard when the client first becomes eligible and remain available in account settings. Proposed copy is in `copy-proposal.md` and awaits PO approval (S55-PO-3 Q10; BRD line 219).
- **FR-006**: The system MUST NOT impose a universal prior opt-in as an extra signup gate (BRD line 219).
- **FR-007**: A client MUST be able to request removal / opt out of the leaderboard at any time (BRD line 219).
- **FR-008**: An opt-out or removal request MUST prevent the client from appearing in subsequent client-visible results for that workspace; removal behavior for an already displayed monthly result is pending S55-024-Q13 (BRD line 219).
- **FR-009**: Opt-out/removal requests and their handling MUST be audited (FR-039); handling and timing are pending S55-024-Q13.

### Eligibility

- **FR-010**: Only clients with an active subscription (F13 entitlement state) are eligible (F13; S54-PO-11).
- **FR-011**: A client must accrue at least 14 active subscription days to become eligible (S55-PO-3 Q4).
- **FR-012**: Freeze periods pause active-day accumulation; eligibility accrual resumes after the freeze, using F13 state without duplicating its lifecycle rules (S55-PO-3 Q4; spec 013).
- **FR-013**: Participation is opt-out by default; no prior signup gate is imposed (S55-PO-3 Q4; BRD line 219).
- **FR-014**: Eligibility requires an active subscription and 14 active subscription days. A delivered plan is not an additional eligibility condition (S55-PO-3 Q4).

### Scoring and ranking

- **FR-015**: Ranking MUST combine adherence and goal-relative progress (S54-PO-11; S54-PO-12 Q17).
- **FR-016**: The composite score MUST weight adherence and goal-relative progress equally, 50% each (S55-PO-3 Q1).
- **FR-017**: Adherence MUST be the average of the two self-reported workout-adherence and diet-adherence check-in answers. These are temporary proxy inputs until mobile tracking exists. Consume the `workoutAdherence` and `dietAdherence` fields from spec 023 by name; do not edit or redefine their form contract (S55-PO-3 Q2; spec 023 FR-037).
- **FR-018**: Goal-relative progress MUST be normalized improvement versus baseline per goal type, consuming the relevant progress inputs from spec 023 without redefining its data model (S55-PO-3 Q3).
- **FR-019**: The leaderboard period is monthly and the client-facing result is a Top 5 (S55-PO-3 Q5). How prior winners compare with new monthly competitors is pending S55-024-Q12.
- **FR-020**: The monthly candidate ranking is computed for the monthly period. The PO manually approves or rejects each client-visible result after external WhatsApp verification; refresh and incumbent carryover behavior remain pending S55-024-Q12 (S55-PO-3 Q5, Q9).
- **FR-021**: Equal scores MUST be ordered by higher adherence, then earlier achievement date, then client code (S55-PO-3 Q6).

### Privacy and data minimization

- **FR-022**: Displayed identity MUST be the client's username only. Profile photos are out of scope for this version; an optional avatar may be considered later. Username creation, uniqueness, and editing rules are pending S55-024-Q11 (S55-PO-3 Q7).
- **FR-023**: The leaderboard MUST NOT display or expose any health value: no measurements, weights, body-fat, circumferences, check-in answers, notes, progress photos, or plan content (BRD assessment C4 mitigation; PRD-09 line 216).
- **FR-024**: Data minimization: the leaderboard projection MUST store only the fields required for ranking and display; no raw measurement or check-in data is stored in the leaderboard (privacy).
- **FR-025**: Opt-out/removal handling, including self-service versus request, removal timing, and behavior for an already displayed result, is pending S55-024-Q13.
- **FR-026**: The app MUST record a PO approval or rejection after WhatsApp verification and audit the actor, timestamp, decision, and associated monthly result. No separate proposal workflow is specified. Whether approved results are fixed snapshots or update with monthly incumbent comparisons is pending S55-024-Q12 (S55-PO-3 Q9).

### Visibility

- **FR-027**: Viewers are clients in the workspace, staff, trainers, workspace owners, and the Platform Owner. All access remains workspace-isolated (S55-PO-3 Q8; spec 003).

### Publish-approval flow

- **FR-028**: The Platform Owner alone performs the manual final approval or rejection after WhatsApp verification; the verification itself is outside the app (S55-PO-3 Q9).
- **FR-029**: Each monthly result requires the manual final approval specified in FR-028 before client visibility. Other re-approval behavior depends on S55-024-Q12.
- **FR-030**: Each PO approval or rejection decision MUST be recorded with its monthly result and audit reference (FR-026, FR-039).

### Reuse and integration

- **FR-031**: This spec MUST reference spec 023 (client progress/coaching) by name for measurements/check-ins and MUST NOT redefine that data (task dependency rule).
- **FR-032**: Eligibility and entitlement MUST reuse F13 state; no duplicate lifecycle engine (spec 013).
- **FR-033**: Adherence inputs MUST reuse F15 forms/check-ins; no duplicate scheduler (spec 015).
- **FR-034**: Plan-adherence inputs MUST reuse F19 delivery facts; no duplicate delivery primitive (spec 019).
- **FR-035**: Workspace isolation MUST reuse spec 003 tenancy/RLS (spec 003).
- **FR-036**: Audit MUST reuse spec 005 audit log (spec 005).
- **FR-037**: Display identity MUST use the client username source once its rules are decided (S55-024-Q11); staff display names (spec 021) are not client identities.

### Copy and localization

- **FR-038**: All user-facing leaderboard strings MUST use professional English and natural Egyptian colloquial Arabic, with exact proposed strings in `copy-proposal.md` pending PO approval. Client-facing copy MUST NOT disclose the scoring formula, weights, or input names (S48-PO-4; S55-PO-3 Q2).

### Audit and compliance

- **FR-039**: PO approval/rejection and opt-out/removal handling MUST be auditable with actor and timestamp (spec 005).
- **FR-040**: No PII or health data beyond approved display fields may appear in logs or exports (privacy; assessment C4).

## Key Entities

- **LeaderboardPublication**: a monthly workspace result with PO approval or rejection after WhatsApp verification, decision timestamp and actor; incumbent carryover behavior remains open (S55-024-Q12).
- **LeaderboardEntry**: a ranked row for one eligible, non-opted-out client: rank, username and period reference. No score or health values are displayed.
- **EligibilityRecord**: derived eligibility state per client per period (active subscription, active days, freeze state, opt-out flag). Consumed from F13 and the named form/progress contracts.
- **OptOutRequest**: client removal/opt-out action or request, with handling and timing pending S55-024-Q13, and audit reference.
- **ScoreInputs**: average of the two adherence answers and normalized baseline improvement by goal type, consumed by name from spec 023. These inputs and scoring mechanics are never shown in client-facing copy.

## Success Criteria

- **SC-001**: 100% of published leaderboards contain at most 5 entries; 100% contain only eligible, non-opted-out clients from the same workspace.
- **SC-002**: 0 client-visible monthly leaderboard results occur without manual PO approval after WhatsApp verification.
- **SC-003**: 100% of clients whose opt-out/removal has taken effect are absent from subsequent client-visible results; timing for an already displayed result is pending S55-024-Q13.
- **SC-004**: 0 health values appear in leaderboard payloads or UI (automated field allow-list check).
- **SC-005**: 0 cross-workspace client appearances in any leaderboard (RLS + query isolation test).
- **SC-006**: 100% of approval/rejection and opt-out/removal handling produce an audit event with actor and timestamp.
- **SC-007**: 100% of newly eligible clients see the notice once on the dashboard, and can find it in account settings.
- **SC-008**: 100% of monthly candidate rankings follow the 50/50 score and approved tie-break; client-facing copy reveals no formula, weights, or input names.

## Assumptions

- Leaderboard is optional and post-MVP; v1 pilot excludes it (S54-PO-5) except spec-only planning now.
- Legal/privacy review (assessment C4) is required before Full Launch; this spec assumes no health metrics are shown.
- Spec 023 is authoritative for check-in and progress data; this spec consumes the adherence answers by name and is read-only with respect to spec 023.
- Three product gaps remain in `## Open questions for the PO`; planning is blocked until resolved.
- No implementation authorized.

## Clarifications

### Decided — S55-PO-3 (2026-11-13)

Source: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-3.verbatim.txt`; the PO's written wording governs over MCQ letters.

- **S55-PO-3 Q1**: “Q1=A (50/50)” — composite score weights adherence and goal-relative progress equally (FR-016).
- **S55-PO-3 Q2**: “average self-reported workout + diet adherence from two check-in questions; temporary until mobile tracking exists; don't reveal scoring mechanics” (FR-017, FR-023, FR-038). Consume spec 023 fields by name, read-only.
- **S55-PO-3 Q3**: “Q3=B (normalized baseline improvement)” per goal type (FR-018).
- **S55-PO-3 Q4**: “Q4=A” and “active subscription + minimum 14 active days + freeze pauses accumulation (no eligibility during freeze) + opt-out default” (FR-010–FR-014).
- **S55-PO-3 Q5**: “monthly Top 5; previous winners remain displayed and recognized until new competitors outperform them” (FR-019, FR-020; comparison semantics open in S55-024-Q12).
- **S55-PO-3 Q6**: “Q6=A: higher adherence, then earlier achievement date, then client code” (FR-021).
- **S55-PO-3 Q7**: “username only (optional avatar later)” for display (FR-022). F11/F21 do not define client username rules; see S55-024-Q11.
- **S55-PO-3 Q8**: “clients in the workspace, staff, trainers, workspace owners, PO” (FR-027).
- **S55-PO-3 Q9**: “PO-only manual final approval after WhatsApp verification (verification happens outside the app; the app records the PO's approval/rejection with audit)” (FR-003, FR-026, FR-028). No separate proposal step is specified.
- **S55-PO-3 Q10**: “notice shown once on the client dashboard when first eligible + in account settings” (FR-005).
- **S55-PO-3 Q7 removal detail**: no removal method or timing was given; see S55-024-Q13.

### Earlier decisions retained

- **S54-PO-11**: Move workspace-isolated Top-5 leaderboard from P8 to P5; separate spec-only PR; ranking combines adherence and goal-relative progress.
- **BRD line 219**: Optional Top-5; participants may request removal/opt out; no universal prior opt-in gate.
- **S48-PO-4**: English professional; Arabic natural Egyptian colloquial.
- **S54-PO-5**: P5 deferred from v1; this is spec-only planning.

### Open questions for the PO

Each question has 2–4 options, implications, a recommendation, and what it blocks.

#### S55-024-Q11 — Client username rules

F11 (`specs/011-client-accounts`) and F21 (`specs/021-staff-display-names`) define no client username. What rules govern the username shown on the leaderboard?

Options:

- A: Client chooses a globally unique username; client can edit it.
- B: Workspace owner or PO assigns a workspace-unique username; only authorized staff can edit it.
- C: System assigns a unique, non-editable username.

Implications: Options determine who creates and changes the display identity and its uniqueness scope. Recommendation: A for client control, subject to the PO defining validation and reserved-name rules. Blocks: FR-022, username contract and display lifecycle.

#### S55-024-Q12 — Monthly winner carryover and comparison

How should the monthly result retain a prior winner until a new competitor outperforms them, given each result requires PO approval?

Options:

- A: Keep each winner's last approved monthly score as the comparison threshold; a new monthly candidate replaces that incumbent only when the candidate's score is higher. Keep the current approved list visible until the PO approves the changed monthly result.
- B: Recalculate incumbents and new candidates together using the current month's inputs; replace an incumbent only when a new candidate's current score is higher, and keep the current approved list visible until the PO approves the new monthly result.

Implications: A preserves the winning month's score as the incumbent threshold; B compares on current inputs and can change incumbent scores. Both retain the approved display while the next PO decision is pending. Recommendation: A, which follows the wording that winners remain until outperformed while preserving a clear prior result. Blocks: FR-019, FR-020, FR-026, monthly ranking/publishing scenarios.

#### S55-024-Q13 — Opt-out and removal handling

The BRD allows clients to request removal or opt out, but does not define the action path or timing. How should a client request be handled?

Options:

- A: Client opts out directly in account settings; remove the client from the visible list immediately and from later results.
- B: Client submits a removal request to the PO; remove the client after the PO records a decision.

Implications: A is immediate self-service; B adds a human review step and leaves the client listed while pending. Recommendation: A, consistent with the stated right to opt out at any time. Blocks: FR-007–FR-009, FR-025, removal scenarios and audit behavior.

## Overlap and coordination notes

- Do not duplicate F13 freeze/entitlement, F15 forms/scheduling, F17/F18/F19 planning and delivery, F20 notes, F21 staff display names, spec 022 account-settings conventions (its contract is not present in this checkout), spec 023 progress/check-in data, or this spec's leaderboard rules.
- Coordinate with open PRs #58/#86/#88/#90; consume merged contracts.
- Leaderboard is optional; gated by legal review (assessment C4) before Full Launch.
