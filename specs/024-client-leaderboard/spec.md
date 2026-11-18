# Feature Specification: F24 — Workspace-Isolated Top-5 Client Leaderboard

**Feature Branch**: `024-client-leaderboard`
**Spec directory**: `specs/024-client-leaderboard`
**Status**: Clarify complete (S55-024-Q14; S57-PO-1, S57-PO-2, S57-PO-3, S57-PO-4, S57-PO-6, S57-PO-7, S57-PO-12, S57-PO-13). Implementation is authorized under the S56/S57 PO instructions; merges still require PO authorization.
**MCQ ID prefix**: `S55-024-Q`
**Lane**: s55-luna-spec024c (SPEC LANE)

## Scope and authority

This spec defines the monthly, workspace-isolated Top-5 client leaderboard moved from P8 to P5 by S54-PO-11. S55-PO-3 resolves the scoring, eligibility, display identity, visibility, approval, and notice decisions. S55-PO-6 resolves username ownership and workspace uniqueness, current-month winner re-scoring and approval boundary, and immediate self-service opt-out. One username-format/reserved-name detail remains as a non-blocking MCQ; the conservative planning default is explicitly marked pending.

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
- **Spec 023 client progress/coaching** (`specs/023-client-progress-coaching`): measurements, check-ins, progress visibility. **This spec references spec 023 by name and does not redefine its data.** Goal-relative progress inputs are consumed from spec 023's approved model; adherence is read by the field names `workoutAdherence` and `dietAdherence`, each a 0?10 integer per FR-037. This spec is read-only with respect to 023.
- **Merged contracts**: F16 (#86), F13 (#88), F20 (#90); coordinate with open PR #58 (F15-B). Do not clone.

Out of scope (deferred/not owned): finance reporting, exports, P4 client portal implementation, Telegram bot, full P8 hardening. Leaderboard is optional and post-MVP gating applies.

## User Scenarios & Testing

### Story 1 — Platform Owner publishes a leaderboard (Priority P1)

A Platform Owner (PO) approves and publishes a workspace-isolated Top-5 leaderboard so eligible clients in that workspace can see a ranked list. Publication is an explicit, audited action; nothing is client-visible before approval.

**Independent test**: With a workspace containing more than 5 eligible clients and PO approval recorded after WhatsApp verification, approve the full ranking and verify the public Top 5 appears to authorized viewers while each ranked client sees only their own private rank and the participant total; without approval, verify no client-visible leaderboard (S57-PO-6).

**Acceptance scenarios**

1. **Given** a workspace with eligible clients and completed WhatsApp verification, **When** the PO manually approves the full monthly ranking, **Then** the public Top 5 of that ranking becomes visible to authorized viewers, each ranked eligible client can see their own private rank and the participant total, and the approval is audited (FR-002, FR-003, FR-039, FR-041; S57-PO-6).
2. **Given** no PO approval, **When** any viewer requests the leaderboard, **Then** no ranked list is returned (FR-003, FR-004).
3. **Given** WhatsApp verification has been completed, **When** the PO rejects the monthly result, **Then** the decision is recorded and no client-visible result is published (FR-003, FR-026, FR-039).

### Story 2 — Eligible client appears and can opt out (Priority P1)

An eligible client is informed once on the dashboard when first eligible and can find the notice in account settings. Participation is opt-out by default, with no prior signup gate.

**Independent test**: Enroll an eligible client, verify the one-time dashboard notice and account-settings notice, then verify the client's username appears only after PO approval and disappears immediately when the client opts out in account settings.

**Acceptance scenarios**

1. **Given** a client who becomes eligible for the first time, **When** they open the dashboard, **Then** the notice is shown once and remains available in account settings (FR-005, FR-013).
2. **Given** an eligible, non-opted-out client with a workspace-unique username, **When** the PO approves a monthly publication, **Then** their username may appear in the ranked list; they chose it during invitation-link signup and can edit it later (FR-013, FR-015, FR-022, FR-037; S55-PO-6 Q11).
3. **Given** a client who opts out in account settings, **When** the action completes, **Then** they are hidden from the public Top 5 immediately, excluded from later results and the action is audited; their private rank in the current approved ranking is preserved (FR-007-FR-009, FR-025, FR-039; S57-PO-6).
4. **Given** a client in the public Top 5 of the currently approved ranking, **When** they opt out in account settings, **Then** they are hidden publicly immediately and the next eligible client of the approved ranking is promoted (#6 -> #5) without PO reapproval, and the action is audited (FR-007-FR-009, FR-020, FR-025, FR-039; S55-PO-6 Q13; S57-PO-6).

### Story 3 — Ranking uses adherence + goal-relative progress (Priority P1)

The ranked order reflects an equal-weight composite of adherence and normalized improvement versus baseline, using the two self-reported workout and diet adherence answers specified by spec 023. The scoring mechanics are never disclosed in client-facing copy.

**Independent test**: Given fixed adherence answers and normalized baseline improvement values, verify ordering matches the approved composite and tie-break rules.

**Acceptance scenarios**

1. **Given** eligible clients with differing adherence and normalized baseline improvement, **When** the monthly leaderboard is computed, **Then** ordering follows the equal-weight composite (FR-015–FR-018).
2. **Given** two clients with equal scores, **When** the leaderboard is computed, **Then** higher adherence, then the earlier last scoring input, then the earlier registration approval determines order (FR-021; S57-PO-2, S57-PO-3).
3. **Given** an eligible client with a trainer-set goal type and body weights in spec 023, **When** the month is scored, **Then** progress follows the S57-PO-1 formula for that goal type; a client without a goal type is not eligible (FR-018; S57-PO-1).

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

- Fewer than 5 eligible clients: the public view lists only the eligible clients of the approved ranking (FR-002).
- More than 5 eligible clients: all are ranked; only the public Top 5 is visible to others, and each eligible client sees only their own private rank (FR-002, FR-041; S57-PO-6, S57-PO-12).
- A client who has become ineligible since the approval (for example frozen, expired or without a goal type) sees no private rank; an opted-out client keeps theirs (FR-041; S57-PO-6, S57-PO-12).
- Past winners and new candidates are re-scored using the current month's data. A past winner (a client shown in the current public Top 5) keeps a Top 5 place until a new candidate's current score is higher; everyone else follows in score order, so a displaced past winner stays ranked just below the Top 5. The current approved ranking stays visible until the PO approves its successor (S55-PO-6 Q12; S57-PO-6). The displayed Top-5 heading remains "أفضل 5" with a separate label identifying the approved results month; a current-month label must never misdescribe older winners kept visible pending approval.
- A client who opts out in account settings is removed immediately from the visible list and excluded from later results, and the action is audited (S55-PO-6 Q13; FR-007-FR-009, FR-025, FR-039).
- Client becomes ineligible (subscription ends, freeze): no longer eligible under FR-010–FR-012.
- Tie scores: per approved tie-break (FR-021).
- Opt-out before manual PO approval: the client is excluded from that result (FR-008).
- An opted-out client is hidden publicly immediately even if they are in the current public Top 5; the next eligible client is promoted and no reapproval is needed (S55-PO-6 Q13; S57-PO-6).
- A username must be 3-20 characters using English letters (A-Z), digits, underscores and dots only; reserved names (admin, support, lifter, trainer, owner) are blocked case-insensitively; a username already in use (case-insensitively) in the same workspace cannot be selected at signup or a later edit; the same username may be used in another workspace (S55-PO-6 Q11; S55-PO-9 Q14).

## Functional Requirements

### Scope, governance and publishing

- **FR-001**: The leaderboard MUST be workspace-isolated: only clients belonging to the same workspace may be ranked against or displayed to each other; no cross-workspace aggregation or visibility is permitted (BRD workspace isolation; S54-PO-11; spec 003).
- **FR-002**: Each monthly result MUST rank ALL eligible clients of the workspace. The public leaderboard MUST show at most 5 entries (Top 5), derived at read time from the approved ranking; if fewer than 5 ranked clients are visible, only those are listed (BRD "top-five"; S54-PO-11; S57-PO-6).
- **FR-003**: Every client-visible monthly leaderboard result MUST receive the Platform Owner's manual final approval after WhatsApp verification. WhatsApp verification occurs outside the application; the application records the PO's approval or rejection and an audit event. No result becomes client-visible without approval (S55-PO-3; BRD line 219).
- **FR-004**: The leaderboard is optional: if no approved monthly result exists for a workspace, no leaderboard is shown to any viewer (BRD "Optional").
- **FR-005**: A client-facing notice that the client may appear MUST be shown once on the client dashboard when the client first becomes eligible and remain available in account settings. Proposed copy is in `copy-proposal.md` and awaits PO approval (S55-PO-3 Q10; BRD line 219).
- **FR-006**: The system MUST NOT impose a universal prior opt-in as an extra signup gate (BRD line 219).
- **FR-007**: A client MUST be able to opt out directly in account settings at any time (BRD line 219; S55-PO-6 Q13).
- **FR-008**: A client opt-out MUST immediately hide the client from the public Top 5, automatically promote the next eligible client of the approved ranking (#6 -> #5) without reapproval, preserve the client's private rank in the current approved ranking, and exclude the client from later results in that workspace (S55-PO-6 Q13; S57-PO-6; BRD line 219).
- **FR-009**: The client's self-service opt-out and its handling MUST be audited with actor and timestamp (FR-039; S55-PO-6 Q13).

### Eligibility

- **FR-010**: Only clients with an active subscription (F13 entitlement state) are eligible (F13; S54-PO-11). An overdue client (F13 FR-028 overdue input) is not rankable or public and does not see the Top 5 or the private rank (S66-PO-2).
- **FR-011**: A client must accrue at least 14 active subscription days to become eligible (S55-PO-3 Q4).
- **FR-012**: Freeze periods pause active-day accumulation; eligibility accrual resumes after the freeze, using F13 state without duplicating its lifecycle rules (S55-PO-3 Q4; spec 013).
- **FR-013**: Participation is opt-out by default; no prior signup gate is imposed (S55-PO-3 Q4; BRD line 219).
- **FR-014**: Eligibility requires an active subscription, 14 active subscription days and a trainer-set goal type (S57-PO-1: "No goal set means the client isn't eligible"). A delivered plan is not an additional eligibility condition (S55-PO-3 Q4).

### Scoring and ranking

- **FR-015**: Ranking MUST combine adherence and goal-relative progress (S54-PO-11; S54-PO-12 Q17).
- **FR-016**: The composite score MUST weight adherence and goal-relative progress equally, 50% each, with both components on the same 0-1 scale (adherence 0-10 divided by 10; progress per FR-018) (S55-PO-3 Q1).
- **FR-017**: Adherence MUST be the average of the self-reported workout and diet answers, consumed by the exact spec 023 field names `workoutAdherence` and `dietAdherence`; each is a 0-10 integer. The monthly value is the mean of (workout + diet) / 2 across all of the month's check-ins that have both answers (S57-PO-4). These are temporary proxy inputs until mobile tracking exists. Do not edit or redefine spec 023 FR-037 or its F15 form contract (S55-PO-3 Q2; S55-PO-5 Q3; S57-PO-4; spec 023 FR-037).
- **FR-018**: Goal-relative progress MUST be normalized improvement versus baseline per goal type, consuming spec 023 body-weight baselines without redefining its data model (S55-PO-3 Q3). Per S57-PO-1: trainers pick a goal type per client (fat loss, muscle gain or maintenance); progress compares the first body weight with this month's latest; fat loss = % lost / 10%, capped at 1; muscle gain = % gained / 5%, capped at 1; maintenance = 1 - |% change| / 3%, floored at 0; values stay within 0-1. No goal type, or no usable body weight this month, means the client is not ranked (FR-043).
- **FR-019**: The leaderboard period is monthly; the result is a full ranking whose public view is a Top 5. Past winners and new candidates are re-scored on current-month data. A past winner (a client shown in the current public Top 5) keeps a Top 5 place until a new candidate's current score is higher; all other eligible clients follow in score order (S55-PO-3 Q5; S55-PO-6 Q12; S57-PO-6).
- **FR-020**: The PO approves the full ranking. The next monthly ranking replaces the current approved ranking only after the PO manually approves it following external WhatsApp verification; until then the current approved ranking stays visible. The PO may reject the candidate; rejection leaves the current approved ranking visible. Promotions caused by opt-outs require no reapproval (S55-PO-3 Q9; S55-PO-6 Q12; S57-PO-6).
- **FR-021**: Equal scores MUST be ordered by higher adherence, then earlier achievement date, then client code (S55-PO-3 Q6). The achievement date is the last scoring input: the timestamp of the client's latest check-in or measurement counted in this month's score, so whoever reached the score first ranks higher (S57-PO-2). The client code is registration order: earlier registration approval ranks higher (S57-PO-3).

### Privacy and data minimization

- **FR-022**: Displayed identity MUST be the client's username only. The client chooses a username during F11 invitation-link signup; reuse an existing field if one exists, otherwise add it to that signup. The username MUST be 3-20 characters and contain only English letters (A-Z), digits, underscores and dots. Uniqueness MUST be case-insensitive per workspace: the same username (ignoring case) cannot be selected by two clients in the same workspace at signup or in a later edit, while the same username may be used in a different workspace. Reserved names (admin, support, lifter, trainer, owner) MUST be blocked case-insensitively. Clients MUST be able to edit the username later. Signup keeps the single generic "unavailable" message that hides whether a username exists (S57-PO-7); the account-settings edit shows the approved "Username unavailable" message for a reserved or already-used name (S57-PO-12). Profile photos are out of scope for this version; an optional avatar may be considered later (S55-PO-3 Q7; S55-PO-6 Q11; S55-PO-9 Q14).
- **FR-023**: The leaderboard MUST NOT display or expose any health value: no measurements, weights, body-fat, circumferences, check-in answers, notes, progress photos, or plan content (BRD assessment C4 mitigation; PRD-09 line 216).
- **FR-024**: Data minimization: the leaderboard projection MUST store only the fields required for ranking and display; no raw measurement or check-in data is stored in the leaderboard (privacy).
- **FR-025**: Client opt-out occurs directly in account settings and immediately removes the client from the visible list and all later results; the action is audited (S55-PO-6 Q13).
- **FR-026**: The app MUST record a PO approval or rejection after WhatsApp verification and audit the actor, timestamp, decision, and associated monthly result. No separate proposal workflow is specified. Current-month re-scoring and the approved-list boundary follow S55-PO-6 Q12.

### Visibility

- **FR-027**: Viewers of the public Top 5 are clients in the workspace, staff, trainers, workspace owners, and the Platform Owner; only the Platform Owner reviews the full candidate ranking. Nobody sees another client's rank outside the public Top 5. All access remains workspace-isolated (S55-PO-3 Q8; S57-PO-6; S57-PO-12; spec 003).

### Publish-approval flow

- **FR-028**: The Platform Owner alone performs the manual final approval or rejection after WhatsApp verification; the verification itself is outside the app (S55-PO-3 Q9).
- **FR-029**: Each new monthly ranking requires the manual final approval specified in FR-028 before it replaces the current approved ranking. The current approved ranking remains visible until that approval; immediate opt-out hiding and promotion still apply without reapproval (S55-PO-6 Q12, Q13; S57-PO-6).
- **FR-030**: Each PO approval or rejection decision MUST be recorded with its monthly result and audit reference (FR-026, FR-039).

### Reuse and integration

- **FR-031**: This spec MUST reference spec 023 (client progress/coaching) by name for measurements/check-ins and MUST NOT redefine that data (task dependency rule).
- **FR-032**: Eligibility and entitlement MUST reuse F13 state; no duplicate lifecycle engine (spec 013).
- **FR-033**: Adherence inputs MUST reuse F15 forms/check-ins; no duplicate scheduler (spec 015).
- **FR-034**: Plan-adherence inputs MUST reuse F19 delivery facts; no duplicate delivery primitive (spec 019).
- **FR-035**: Workspace isolation MUST reuse spec 003 tenancy/RLS (spec 003).
- **FR-036**: Audit MUST reuse spec 005 audit log (spec 005).
- **FR-037**: Reuse the F11 invitation-link signup and `client_signup` RPC boundaries (F11 FR-001-FR-007; `specs/011-client-accounts/contracts/client-signup-surface.md`) for the username field; do not redesign signup or create a parallel client identity. Reuse spec 022 account-settings conventions where available for client edits, and do not treat F21 staff display names as client identities. Username format (3-20 characters, English letters, digits, underscores and dots), case-insensitive workspace uniqueness, and case-insensitive reserved-name blocking (admin, support, lifter, trainer, owner) apply at signup and in later edits (S55-PO-9 Q14).

### Copy and localization

- **FR-038**: All user-facing leaderboard strings MUST use professional English and natural Egyptian colloquial Arabic, with exact approved strings in `copy-proposal.md` (S55-PO-10/S55-PO-11) where approved; new or changed wording is marked pending verification and must not be shipped until approved (the separate approved-results-month label is APPROVED — S55-PO-11). The Top-5 heading and the separate approved-results-month label are distinct strings: the month label MUST identify the month of the approved result and MUST NOT misdescribe older winners kept visible pending approval. Client-facing copy MUST NOT disclose the scoring formula, weights, or input names (S48-PO-4; S55-PO-3 Q2; S55-PO-10 consistency check 1).

### Audit and compliance

- **FR-039**: PO approval/rejection and opt-out/removal handling MUST be auditable with actor and timestamp (spec 005).
- **FR-040**: No PII or health data beyond approved display fields may appear in logs or exports (privacy; assessment C4).

### Private rank, placement and goal type

- **FR-041**: Every eligible client MUST be able to see their own private rank in the current approved ranking and the total number of participants. The total counts every ranked client of the approved ranking, opted-out clients included. An opted-out client keeps their private rank; a client who is not eligible today (opt-out aside) sees no private rank. No client may see another client's rank outside the public Top 5, nor any score or input (S57-PO-6; S57-PO-12).
- **FR-042**: The client Top 5 and private rank MUST appear inside the client Progress area, not as a Main Navigation entry; any earlier leaderboard link MUST land on that Progress section (S57-PO-12).
- **FR-043**: Trainers (and other coaching staff: workspace owner, Platform Owner; never Sales) MUST be able to set and update each client's goal type (Fat Loss, Muscle Gain, Maintenance) in a Goals section under Client Details, which also shows the client's F15 near-term goal answer read-only as a reference through F15's audited answer reader. The goal type is workspace-scoped coaching data; its changes are audited without the value (S57-PO-1; FR-035, FR-036).

## Key Entities

- **LeaderboardPublication**: A monthly workspace result with PO approval/rejection after WhatsApp verification, decision timestamp and actor. New candidates and past winners are re-scored on current-month data; a changed list replaces the current approved list only after PO approval.
- **LeaderboardEntry**: a ranked row of the full monthly ranking for one eligible client: approved rank and period reference. The public Top 5 is derived at read time from visible entries; the username is read live. No score or health values are stored or displayed.
- **PrivateRank**: a read-time view for one client: their own approved rank and the participant total; never another client's data.
- **ClientGoalType**: the trainer-set goal type per client (fat loss, muscle gain, maintenance) with actor and time; required for eligibility.
- **EligibilityRecord**: derived eligibility state per client per period (active subscription, active days, freeze state, opt-out flag). Consumed from F13 and the named form/progress contracts.
- **OptOutState**: A client-controlled account-settings choice; opting out immediately hides the client from the visible list and excludes them from future results, with an audit reference.
- **ScoreInputs**: average of the two adherence answers and normalized baseline improvement by goal type, consumed by name from spec 023. These inputs and scoring mechanics are never shown in client-facing copy.

## Success Criteria

- **SC-001**: 100% of public leaderboard views contain at most 5 entries; 100% contain only non-opted-out clients of the same workspace's approved ranking, and 100% of approved rankings contain only clients eligible at approval.
- **SC-002**: 0 client-visible monthly leaderboard results occur without manual PO approval after WhatsApp verification.
- **SC-003**: 100% of clients who opt out are removed from the visible list immediately and are absent from all later results; every opt-out is audited.
- **SC-004**: 0 health values appear in leaderboard payloads or UI (automated field allow-list check).
- **SC-005**: 0 cross-workspace client appearances in any leaderboard (RLS + query isolation test).
- **SC-006**: 100% of approval/rejection and opt-out/removal handling produce an audit event with actor and timestamp.
- **SC-007**: 100% of newly eligible clients see the notice once on the dashboard, and can find it in account settings.
- **SC-009**: 100% of private-rank reads return only the caller's own rank and the participant total, and 0 reads return another client's rank or any score (FR-041).
- **SC-010**: 100% of opt-outs from the public Top 5 promote the next eligible client without a new PO decision (FR-008, FR-020).
- **SC-008**: 100% of monthly rankings follow the 50/50 score and approved tie-break; past winners and new candidates use current-month data, and a past winner is replaced only when a new candidate's current score is higher. The approved list remains visible until the PO approves its successor. Client-facing copy reveals no formula, weights, or input names.

## Assumptions

- Leaderboard is optional and post-MVP; v1 pilot excludes it (S54-PO-5) except spec-only planning now.
- Legal/privacy review (assessment C4) is required before Full Launch; this spec assumes no health metrics are shown.
- Spec 023 is authoritative for check-in and progress data; this spec consumes the adherence answers by name and is read-only with respect to spec 023.
- S55-PO-6 resolves Q11-Q13. S55-PO-9 Q14 resolves username validation: 3-20 characters, English letters (A-Z), digits, underscores and dots only; case-insensitive uniqueness per workspace; reserved names (admin, support, lifter, trainer, owner) blocked case-insensitively. Apply at signup and later edits.
- No implementation authorized.

## Clarifications

### Decided — S55-PO-3 (2026-11-13)

Source: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-3.verbatim.txt`; the PO's written wording governs over MCQ letters.

- **S55-PO-3 Q1**: “Q1=A (50/50)” — composite score weights adherence and goal-relative progress equally (FR-016).
- **S55-PO-3 Q2**: “average self-reported workout + diet adherence from two check-in questions; temporary until mobile tracking exists; don't reveal scoring mechanics” (FR-017, FR-023, FR-038). Consume spec 023 fields by name, read-only.
- **S55-PO-3 Q3**: “Q3=B (normalized baseline improvement)” per goal type (FR-018).
- **S55-PO-3 Q4**: “Q4=A” and “active subscription + minimum 14 active days + freeze pauses accumulation (no eligibility during freeze) + opt-out default” (FR-010–FR-014).
- **S55-PO-3 Q5**: “monthly Top 5; previous winners remain displayed and recognized until new competitors outperform them” (FR-019, FR-020; the current-month comparison and approval boundary follow S55-PO-6 Q12).
- **S55-PO-3 Q6**: “Q6=A: higher adherence, then earlier achievement date, then client code” (FR-021).
- **S55-PO-3 Q7**: “username only (optional avatar later)” for display (FR-022). F11 supplies the signup flow; S55-PO-6 Q11 defines the username lifecycle.
- **S55-PO-3 Q8**: “clients in the workspace, staff, trainers, workspace owners, PO” (FR-027).
- **S55-PO-3 Q9**: “PO-only manual final approval after WhatsApp verification (verification happens outside the app; the app records the PO's approval/rejection with audit)” (FR-003, FR-026, FR-028). No separate proposal step is specified.
- **S55-PO-3 Q10**: “notice shown once on the client dashboard when first eligible + in account settings” (FR-005).

### Decided -- S55-PO-6 (2026-11-14)

Source: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-6.verbatim.txt`; PO wording is quoted verbatim.

- **S55-024-Q11**: "Username is chosen during signup via invitation link. Reuse the existing field if present; otherwise add it. Enforce workspace uniqueness and allow later edits." The client chooses the username in F11 invitation-link signup; reuse an existing field if present, otherwise add it there; enforce workspace-scoped uniqueness; allow later client edits. See FR-022 and FR-037.
- **S55-024-Q12**: "Past winners and new candidates are re-scored on the current month's data; a past winner is replaced only when a new candidate's current score is higher; the current approved list stays visible until the PO approves the next one." See FR-019, FR-020, FR-026, FR-029 and SC-008.
- **S55-024-Q13**: "Client opts out directly in account settings; removed from the visible list immediately and from later results; audited." See FR-007-FR-009, FR-025, FR-039 and SC-003/006.

### Decided -- S55-PO-9 (2026-11-14)

Source: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-9.verbatim.txt`; PO wording is quoted verbatim.

- **S55-024-Q14**: "Usernames must be 3-20 characters, English letters (A-Z), digits, underscores and dots only. Case-insensitive uniqueness per workspace. Block reserved names (admin, support, lifter, trainer, owner)." Usernames MUST be 3-20 characters using English letters (A-Z), digits, underscores and dots only; uniqueness MUST be case-insensitive per workspace at signup and in later edits; reserved names (admin, support, lifter, trainer, owner) MUST be blocked case-insensitively. See FR-022 and FR-037.

### Earlier decisions retained

- **S54-PO-11**: Move workspace-isolated Top-5 leaderboard from P8 to P5; separate spec-only PR; ranking combines adherence and goal-relative progress.
- **BRD line 219**: Optional Top-5; participants may request removal/opt out; no universal prior opt-in gate.
- **S48-PO-4**: English professional; Arabic natural Egyptian colloquial.
- **S54-PO-5**: P5 deferred from v1; this is spec-only planning.

### Open questions for the PO

None. S55-024-Q11 through S55-024-Q14 are resolved (see Clarifications above).

## Overlap and coordination notes

- Do not duplicate F13 freeze/entitlement, F15 forms/scheduling, F17/F18/F19 planning and delivery, F20 notes, F21 staff display names, spec 022 account-settings conventions (its contract is not present in this checkout), spec 023 progress/check-in data, or this spec's leaderboard rules.
- Consume merged F13/F16/F20 contracts; coordinate with open PR #58 (F15-B).
- Reuse the F11 invitation-link signup surface and `client_signup` contract; do not redesign signup. Reuse account-settings patterns from spec 022 where available, F11/F21 identity ownership boundaries, and spec 023 progress/adherence fields by name.
- Leaderboard is optional; gated by legal review (assessment C4) before Full Launch.

### S56-PO-4 - 2026-11-14

PO S56-PO-4 (2026-11-14): "LIFTER isn't live yet. Cancel Feature Flag Spec 025, remove its blockers from other specs, and continue development normally. Reconsider flags before production. Keep tests and regression safeguards."

### S66-PO-2 - 2026-11-18

PO ruling S66-PO-2 (2026-11-18), option A, relayed by the coordinator: "Overdue clients (app_private.f13_client_overdue_state overdue=true) are not rankable/public and do not see the Top 5 or private rank (treat like restricted)." F24 reuses the F13 overdue state; it adds no overdue logic. See FR-010.

### S57-PO-1 - 2026-11-14

PO (S57-PO-1, F24 FR-018): "i choose A + Add a Goals section under Client Details with a Goal Type dropdown: Fat Loss, Muscle Gain, Maintenance. Show the client's F15 Near-term Goal as reference. Trainers can update Goal Type."

Option A text: "Trainers pick a goal type per client: fat loss, muscle gain or maintain. Progress uses body weight from 023 baselines (first value vs this month's latest). Fat loss: % lost ÷ 10%, capped at 1. Gain: % gained ÷ 5%, capped at 1. Maintain: 1 − |% change| ÷ 3%, floored at 0. No goal set means the client isn't eligible."

See FR-014, FR-018 and FR-043.

### S57-PO-2 - 2026-11-14

PO (S57-PO-2, F24 FR-021) selected "Last scoring input": "The timestamp of the client's latest check-in or measurement counted in this month's score, so whoever reached the score first ranks higher." See FR-021.

### S57-PO-3 - 2026-11-14

PO (S57-PO-3, F24 FR-021) selected "Registration order": "Earlier registration approval ranks higher." See FR-021.

### S57-PO-4 - 2026-11-14

PO (S57-PO-4, F24 FR-017) selected "Monthly mean": "Mean of (workout + diet) ÷ 2 across all of the month's check-ins that have both answers." See FR-017.

### S57-PO-6 - 2026-11-14

PO (S57-PO-6, F24 FR-008/FR-019/FR-020): "Rank ALL eligible clients monthly. Each client sees their private rank and total participants; public Leaderboard shows Top 5 only. Opt-out hides the client publicly, preserves their private rank, and automatically promotes the next eligible client (#6 → #5). PO approves the full ranking; promotions require no reapproval." See FR-002, FR-008, FR-019, FR-020, FR-027, FR-029 and FR-041.

### S57-PO-7 - 2026-11-14

PO (S57-PO-7, F24 signup username messages) selected "Keep generic": "Keep the single generic 'unavailable' message, which hides whether a username exists." See FR-022.

### S57-PO-12 - 2026-11-15

PO (S57-PO-12, 2026-11-15): "Top 5 belongs inside Progress, not Main Navigation. Every eligible client sees their private full rank; only the public Top 5 is visible to others. Preserve all other approved copy. Update specs, UI strings, and affected tests."

Approved F24 copy (S57-PO-12): "Top 5" / "أفضل 5"; "Your rank" / "ترتيبك"; "Rank {rank} of {total}" / "إنت في المركز {rank} من {total}"; "Username unavailable" / "اليوزرنيم ده مش متاح"; "Turn off participation" / "وقف ظهوري في الترتيب". See FR-022, FR-027, FR-038, FR-041, FR-042 and `copy-proposal.md`.

### S57-PO-13 - 2026-11-15

PO (S57-PO-13, 2026-11-15): "Approve the reviewed EN/Arabic UI copy for F22/F23/F24, with these changes: ... F24 monthly approval: "اعتماد ترتيب الشهر" (full ranking, not just Top 5). Approve the remaining reviewed Measurement, Check-in, Leaderboard, Account Settings and Goals copy. Finish all independent tasks and tests in #108–#110. Don't implement blocked dependencies or change F17/F18/F19-owned code."

The PO's monthly approval action reads "اعتماد ترتيب الشهر" in Arabic (EN stays "Approve monthly leaderboard") and approves the FULL ranking, not only the Top 5 (FR-020, FR-029, FR-038). The remaining reviewed Leaderboard, Account Settings and Goals strings are approved as proposed; see `copy-proposal.md`.
