# Feature Specification: F24 — Workspace-Isolated Top-5 Client Leaderboard

**Feature Branch**: `024-client-leaderboard`
**Spec directory**: `specs/024-client-leaderboard`
**Status**: Spec-only (Specify + Clarify). PO questions open. No implementation, migrations, tests, merges or deployment are authorized by this spec.
**MCQ ID prefix**: `S54-024-Q`
**Lane**: s54-beam-spec024 (SPEC LANE)

## Scope and authority

This spec defines the workspace-isolated Top-5 client leaderboard moved from P8 to P5 by PO decision S54-PO-11 (Q16) and the pending formula decision S54-PO-12 (Q17). It is a **spec-only** PR; all product ambiguities remain numbered MCQs in `## Open questions for the PO`.

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

PO S54-PO-12 (`C:/Users/NEW LAP/.lifter/runs/s54-po/s54-po-12.verbatim.txt`), relevant excerpt:

```text
Q15-Q17 were added by ChatGPT:
- Q15: First weekly check-in 7 days after activation, then every 7 days. Account for freezes.
- Q16: Move workspace-isolated Client Top-5 Leaderboard from P8 to P5.
- Q17: Rank using adherence + goal-relative progress, with the exact formula pending PO approval.
Treat these as additional PO decisions, not your original MCQ options.
```

PO S54-PO-9 (`.../s54-po-9.verbatim.txt`): "Delegate independent P4, P5 Progress and P5 Leaderboard spec agents... Propose EN/Egyptian Arabic copy for PO approval... No implementation, merges or deployment."

S48-PO-4 (`.../s48-po/s48-po-4.verbatim.txt`): all Arabic user-facing text must be natural Egyptian colloquial; English copy professional. (Governs any approved copy.)

## Dependency list (reuse, never duplicate)

This feature consumes; it does not redefine:

- **Spec 003 tenancy/RLS** (`specs/003-tenancy-rls`): workspace isolation and RLS boundaries for all leaderboard reads/writes.
- **Spec 005 audit log** (`specs/005-audit-log`): publish, unpublish, opt-out, removal and config-change events.
- **Spec 013 freeze/renewal/refunds** (`specs/013-freeze-renewal-refunds`): subscription status, entitlement, freeze intervals, renewal. Leaderboard eligibility consumes F13 state; must not duplicate freeze engine.
- **Spec 015 forms/intake** (`specs/015-forms-intake`): weekly check-in forms, recurring assignments, SLA, retention. Adherence inputs reuse F15; must not duplicate scheduler.
- **Spec 017 workout planner** (`specs/017-workout-planner`): published workout plan revisions and delivery facts.
- **Spec 018 nutrition planner** (`specs/018-nutrition-planner`): published nutrition plan revisions, alternatives, selection.
- **Spec 019 plan core** (`specs/019-plan-core`): `plan_deliveries`, activation sources, atomic delivery/activation transaction. Plan-adherence inputs reuse F19.
- **Spec 020 client notes** (`specs/020-client-notes`): internal-only notes boundary; leaderboard must never expose notes.
- **Spec 021 staff display names** (`specs/021-staff-display-names`): server-owned staff identity; client display identity remains client-owned name/photo per BRD.
- **Spec 023 client progress/coaching** (branch `023-client-progress-coaching`, in progress in parallel): measurements, check-ins, progress visibility. **This spec references spec 023 by name and does not redefine its data.** Goal-relative progress inputs are consumed from spec 023's approved measurement/check-in model.
- **Open PRs**: #58 (F15 UI), #86 (F16 catalog), #88 (F13), #90 (F20). Coordinate; do not clone.

Out of scope (deferred/not owned): finance reporting, exports, P4 client portal implementation, Telegram bot, full P8 hardening. Leaderboard is optional and post-MVP gating applies.

## User Scenarios & Testing

### Story 1 — Platform Owner publishes a leaderboard (Priority P1)

A Platform Owner (PO) approves and publishes a workspace-isolated Top-5 leaderboard so eligible clients in that workspace can see a ranked list. Publication is an explicit, audited action; nothing is client-visible before approval.

**Independent test**: With a workspace containing ≥5 eligible clients and PO approval, publish and verify exactly 5 ranked entries appear to authorized viewers; without approval, verify no client-visible leaderboard.

**Acceptance scenarios**

1. **Given** a workspace with at least 5 eligible clients and a PO approval action, **When** the PO publishes the leaderboard, **Then** a ranked Top-5 list becomes visible to authorized viewers and an audit event is recorded (FR-003, FR-005, FR-039).
2. **Given** no PO approval, **When** any client or staff requests the leaderboard, **Then** no ranked list is returned (FR-003, FR-004).
3. **Given** a published leaderboard, **When** the PO unpublishes it, **Then** it is no longer client-visible and an audit event is recorded (FR-003, FR-039).

### Story 2 — Eligible client appears and can opt out (Priority P1)

An eligible client is informed they may appear, may view the published leaderboard, and may request removal/opt-out at any time without a prior signup gate.

**Independent test**: Enroll an eligible client, verify notice is shown, verify appearance in a published leaderboard, then opt out and verify removal from current and future publications.

**Acceptance scenarios**

1. **Given** an eligible client, **When** they first become eligible, **Then** a notice that they may appear on the leaderboard is shown (FR-005, FR-013).
2. **Given** an eligible, non-opted-out client, **When** a leaderboard is published, **Then** they may appear in the ranked list (FR-013, FR-015).
3. **Given** a client who opts out, **When** any current or future leaderboard is published, **Then** they do not appear (FR-007, FR-008).
4. **Given** a client who requests removal, **When** the request is processed, **Then** they are removed from the published view and an audit event is recorded (FR-007, FR-009, FR-039).

### Story 3 — Ranking uses adherence + goal-relative progress (Priority P1)

The ranked order of eligible clients reflects a score combining adherence and goal-relative progress per the approved formula (pending PO).

**Independent test**: Given fixed inputs for adherence and goal-relative progress, verify ordering matches the approved formula and tie-break rules (once decided).

**Acceptance scenarios**

1. **Given** eligible clients with differing adherence and progress, **When** the leaderboard is computed, **Then** ordering follows the approved scoring formula (FR-015, FR-016, FR-017).
2. **Given** two clients with equal scores, **When** the leaderboard is computed, **Then** the approved tie-break rule determines order (FR-021).

### Story 4 — Privacy: no health values shown (Priority P1)

No health metric, measurement, weight, body-fat, check-in answer, note, or progress photo appears anywhere in the leaderboard or its exports.

**Independent test**: Inspect leaderboard payload and UI for any health-related field; assert none present.

**Acceptance scenarios**

1. **Given** a published leaderboard, **When** any viewer reads it, **Then** only non-health display fields are present (FR-022, FR-023, FR-024).
2. **Given** an opted-out client, **When** the leaderboard is published, **Then** their name/photo/initials are absent (FR-008, FR-022).

### Story 5 — Workspace isolation (Priority P1)

A leaderboard never mixes or exposes clients across workspaces.

**Independent test**: Create two workspaces with eligible clients; publish in one; assert the other workspace's clients never appear.

**Acceptance scenarios**

1. **Given** two workspaces, **When** a leaderboard is published in workspace A, **Then** no client from workspace B appears (FR-001, FR-037).

### Edge cases

- Fewer than 5 eligible clients: list only eligible (FR-002).
- Client opts out after appearing: removed from next refresh/publication; current published snapshot behavior per Q9.
- Client becomes ineligible (subscription ends, freeze): removed per eligibility rules (FR-010, FR-012).
- Tie scores: per approved tie-break (FR-021).
- Opt-out during a pending publication: honored before publish (FR-008).

## Functional Requirements

### Scope, governance and publishing

- **FR-001**: The leaderboard MUST be workspace-isolated: only clients belonging to the same workspace may be ranked against or displayed to each other; no cross-workspace aggregation or visibility is permitted (BRD workspace isolation; S54-PO-11; spec 003).
- **FR-002**: Each published leaderboard MUST contain at most 5 ranked entries (Top-5); if fewer than 5 clients are eligible, only eligible clients are listed (BRD "top-five"; S54-PO-11).
- **FR-003**: Publishing a leaderboard MUST require explicit Platform Owner approval before any client-visible publication; no automatic or staff-initiated publication without PO approval is permitted (BRD line 219).
- **FR-004**: The leaderboard is optional: if no approved published leaderboard exists for a workspace, no leaderboard is shown to clients (BRD "Optional").
- **FR-005**: Participants MUST be informed that they may appear on the leaderboard; notice copy is proposed in `copy-proposal.md` and requires PO approval (BRD line 219; S48-PO-4).
- **FR-006**: The system MUST NOT impose a universal prior opt-in as an extra signup gate (BRD line 219).
- **FR-007**: A client MUST be able to request removal / opt out of the leaderboard at any time (BRD line 219).
- **FR-008**: An opt-out or removal request MUST remove the client from the current and future published leaderboards for that workspace (BRD line 219).
- **FR-009**: Removal/opt-out requests MUST be processable by authorized staff/PO and MUST be audited (FR-039).

### Eligibility

- **FR-010**: Only clients with an active subscription (F13 entitlement state) are eligible (F13; S54-PO-11).
- **FR-011**: A minimum active-days threshold applies; its value is pending PO approval (S54-024-Q4).
- **FR-012**: Freeze handling for eligibility (exclusion vs. pause of accumulation) is pending PO approval (S54-024-Q4; F13).
- **FR-013**: Participation model is opt-out by default (no prior signup gate), per BRD; opt-in alternative is pending PO approval (S54-024-Q4).
- **FR-014**: Whether a delivered plan (F19) is required for eligibility is pending PO approval (S54-024-Q4).

### Scoring and ranking

- **FR-015**: Ranking MUST combine adherence and goal-relative progress (S54-PO-11; S54-PO-12 Q17).
- **FR-016**: The exact scoring formula and weights are pending PO approval among the options in S54-024-Q1.
- **FR-017**: The definition of adherence (check-in submission rate, plan adherence, or combined) is pending PO approval (S54-024-Q2).
- **FR-018**: Goal-relative progress per goal type is pending PO approval (S54-024-Q3); inputs are consumed from spec 023 by name and not redefined here.
- **FR-019**: The ranking period (e.g., current subscription cycle, rolling window, calendar period) is pending PO approval (S54-024-Q5).
- **FR-020**: The refresh cadence (recompute on data change vs. scheduled) is pending PO approval (S54-024-Q5).
- **FR-021**: Tie-break rules are pending PO approval (S54-024-Q6).

### Privacy and data minimization

- **FR-022**: Displayed identity uses client name and, subject to PO approval, profile photo, initials, or alias (S54-024-Q7; BRD line 219).
- **FR-023**: The leaderboard MUST NOT display or expose any health value: no measurements, weights, body-fat, circumferences, check-in answers, notes, progress photos, or plan content (BRD assessment C4 mitigation; PRD-09 line 216).
- **FR-024**: Data minimization: the leaderboard projection MUST store only the fields required for ranking and display; no raw measurement or check-in data is stored in the leaderboard (privacy).
- **FR-025**: Opt-out and removal flow details (channel, SLA, confirmation) are pending PO approval (S54-024-Q7).
- **FR-026**: Whether a published leaderboard is an immutable snapshot or a live view is pending PO approval (S54-024-Q9).

### Visibility

- **FR-027**: Who may view the published leaderboard (clients in workspace, staff, PO, or a combination) is pending PO approval (S54-024-Q8).

### Publish-approval flow

- **FR-028**: Who may initiate a publication request (PO only vs. workspace owner/staff proposal + PO approval) is pending PO approval (S54-024-Q9).
- **FR-029**: Re-approval requirements for changes to an already-published leaderboard (formula, eligibility, visibility) are pending PO approval (S54-024-Q9).
- **FR-030**: Unpublish and re-publish flows must be audited (FR-039).

### Reuse and integration

- **FR-031**: This spec MUST reference spec 023 (client progress/coaching) by name for measurements/check-ins and MUST NOT redefine that data (task dependency rule).
- **FR-032**: Eligibility and entitlement MUST reuse F13 state; no duplicate lifecycle engine (spec 013).
- **FR-033**: Adherence inputs MUST reuse F15 forms/check-ins; no duplicate scheduler (spec 015).
- **FR-034**: Plan-adherence inputs MUST reuse F19 delivery facts; no duplicate delivery primitive (spec 019).
- **FR-035**: Workspace isolation MUST reuse spec 003 tenancy/RLS (spec 003).
- **FR-036**: Audit MUST reuse spec 005 audit log (spec 005).
- **FR-037**: Display identity MUST reuse client-owned name/photo sources; staff display names (spec 021) are not used for clients.

### Copy and localization

- **FR-038**: All user-facing leaderboard strings MUST follow S48-PO-4: exact English (professional) + Egyptian colloquial Arabic, approved by PO; proposed strings are in `copy-proposal.md` with status "PROPOSED — PENDING PO APPROVAL" (S48-PO-4; S54-PO-11).

### Audit and compliance

- **FR-039**: Publish, unpublish, opt-out, removal, and config-change actions MUST be auditable with actor and timestamp (spec 005).
- **FR-040**: No PII or health data beyond approved display fields may appear in logs or exports (privacy; assessment C4).

## Key Entities

- **LeaderboardPublication**: a PO-approved publication instance for a workspace, with status (draft/published/unpublished), approved config snapshot reference, created/approved timestamps, actor.
- **LeaderboardEntry**: a ranked row for one eligible, non-opted-out client within a publication: rank, display name, approved display photo/initials/alias, score (if approved for display), period reference. No health fields.
- **EligibilityRecord**: derived eligibility state per client per period (active subscription, active days, freeze state, opt-out flag, delivered-plan flag). Consumed from F13/F15/F19/spec 023.
- **OptOutRequest**: client request to be removed; status, timestamps, actor, audit reference.
- **ScoreInputs**: adherence value and goal-relative progress value per client per period, consumed from F15/spec 023; formula applied per approved option.

## Success Criteria

- **SC-001**: 100% of published leaderboards contain at most 5 entries; 100% contain only eligible, non-opted-out clients from the same workspace.
- **SC-002**: 0 client-visible leaderboard publications occur without explicit PO approval.
- **SC-003**: 100% of opt-out/removal requests result in the client's absence from the next refresh or publication.
- **SC-004**: 0 health values appear in leaderboard payloads or UI (automated field allow-list check).
- **SC-005**: 0 cross-workspace client appearances in any leaderboard (RLS + query isolation test).
- **SC-006**: 100% of publish/unpublish/opt-out/removal/config actions produce an audit event with actor and timestamp.
- **SC-007**: Notice of possible appearance is shown to 100% of newly eligible clients.
- **SC-008**: Once the scoring formula is approved, 100% of rankings match the formula and approved tie-break.

## Assumptions

- Leaderboard is optional and post-MVP; v1 pilot excludes it (S54-PO-5) except spec-only planning now.
- Legal/privacy review (assessment C4) is required before Full Launch; this spec assumes no health metrics are shown.
- Spec 023 data model is authoritative for measurements/check-ins; this spec consumes by name.
- Exact numeric thresholds, formula, cadence, and copy require PO approval and remain MCQs.
- No implementation authorized.

## Clarifications

### Decided (baseline)

- **S54-PO-11 (Q16)**: Move workspace-isolated Top-5 leaderboard from P8 to P5; separate spec-only PR. Ranking combines adherence + goal-relative progress. (Source: `C:/Users/NEW LAP/.lifter/runs/s54-po/s54-po-11.verbatim.txt`)
- **S54-PO-12 (Q17)**: Rank using adherence + goal-relative progress; exact formula pending PO approval. (Source: `.../s54-po-12.verbatim.txt`)
- **BRD line 219**: Optional top-five with names/photos; PO approval before publishing; participants informed; can request removal/opt out; no universal prior opt-in gate.
- **S48-PO-4**: Egyptian colloquial Arabic for all user-facing text.
- **S54-PO-5**: P5 deferred from v1; spec-only planning now.
- **Reuse rule**: F13/F15/F17/F18/F19/F20/F21 and spec 023 consumed by name; no duplication.

### Open questions for the PO

Each MCQ has 2-4 options, implications, a recommendation, and what it blocks. IDs use prefix `S54-024-Q`.

#### S54-024-Q1 — Scoring formula and weights

Question: How should the leaderboard score combine adherence and goal-relative progress?

Options:

- A: Single composite score = (adherence weight × adherence) + (progress weight × goal-relative progress), with weights 50/50. (Recommended starting point)
- B: Adherence is a gate (minimum threshold) and ranking is by goal-relative progress only.
- C: Goal-relative progress is a gate and ranking is by adherence only.
- D: Weighted composite with PO-chosen weights (weights specified by PO).

Implications: A gives balanced recognition; B rewards progress among compliant clients; C rewards compliance; D requires weight decision. Blocks: FR-016, SC-008, publish config.

Recommendation: A as a default, subject to PO weights; otherwise D with explicit weights.

#### S54-024-Q2 — Adherence definition

Question: What counts as "adherence"?

Options:

- A: Weekly check-in submission rate only (submitted on time / expected). (Recommended)
- B: Plan adherence (completed workout/nutrition plan actions) only.
- C: Combined: check-in submission rate + plan adherence, equal weight.

Implications: A is measurable from F15/spec 023; B requires plan-execution tracking not yet defined; C combines both. Blocks: FR-017, data inputs.

Recommendation: A (measurable, reuses F15).

#### S54-024-Q3 — Goal-relative progress per goal type

Question: How is "goal-relative progress" computed per goal type?

Options:

- A: Percentage of goal achieved relative to target (e.g., weight loss target, strength target), normalized 0–100, averaged across active goals. (Recommended)
- B: Improvement delta vs. baseline, normalized per goal type.
- C: Binary (goal met / not met) per goal, averaged.

Implications: A intuitive but requires goal targets in spec 023; B needs baseline handling; C loses granularity. Blocks: FR-018, spec 023 consumption.

Recommendation: A if spec 023 exposes targets; otherwise B.

#### S54-024-Q4 — Eligibility

Question: What are the eligibility rules?

Options:

- A: Active subscription + minimum 14 active days + freeze pauses accumulation (no eligibility during freeze) + opt-out default. (Recommended)
- B: Active subscription + minimum 7 active days + freeze excludes client entirely + opt-out default.
- C: Active subscription only + opt-in required (contradicts BRD no prior gate — not recommended).

Implications: A/B differ on threshold and freeze; C violates BRD line 219 (no universal prior opt-in). Blocks: FR-010–FR-014, eligibility record.

Recommendation: A (aligns with BRD; freeze handling consistent with F13).

#### S54-024-Q5 — Ranking period and refresh cadence

Question: What is the ranking period and how often is it recomputed?

Options:

- A: Current subscription cycle (activation→expiry) as period; recompute on data change (check-in/progress update) but publish only on PO action. (Recommended)
- B: Rolling last 30 days; scheduled daily recompute.
- C: Calendar month; scheduled weekly recompute.

Implications: A ties to entitlement; B/C add period boundary complexity. Blocks: FR-019, FR-020, publication model.

Recommendation: A.

#### S54-024-Q6 — Tie-breaks

Question: How are score ties broken?

Options:

- A: Higher adherence, then earlier achievement date, then client code. (Recommended)
- B: Higher goal-relative progress, then adherence, then client code.
- C: Random among tied (not recommended for fairness).

Implications: A/B deterministic; C unfair. Blocks: FR-021, SC-008.

Recommendation: A.

#### S54-024-Q7 — Privacy display and removal flow

Question: What identity is displayed and how does removal work?

Options:

- A: First name + last initial + profile photo (if available) with initials fallback; opt-out via client self-service button; removal within 24h. (Recommended)
- B: Initials only + no photo; opt-out via request to staff.
- C: Full name + photo; opt-out via request to PO only.

Implications: A richer but more identifying; B more private; C highest exposure. Removal SLA and channel differ. Blocks: FR-022, FR-025, copy.

Recommendation: A or B depending on legal review (assessment C4); default B for privacy safety.

#### S54-024-Q8 — Who can see the leaderboard

Question: Who may view a published leaderboard?

Options:

- A: Clients in the same workspace only (gamification among peers). (Recommended)
- B: Clients + staff/trainers in the workspace.
- C: Clients + staff + PO.

Implications: A minimal exposure; B/C broader. Blocks: FR-027, RLS.

Recommendation: A.

#### S54-024-Q9 — PO publish-approval flow

Question: How does publication get approved?

Options:

- A: Workspace owner/staff proposes a leaderboard config; PO approves and publishes (or rejects) with audit. Published view is a snapshot; re-approval required for config changes. (Recommended)
- B: PO alone initiates and publishes; no proposal step.
- C: PO approves but published view is live (auto-updates without re-approval).

Implications: A adds proposal workflow; B simpler; C risks unreviewed changes. Snapshot vs live affects re-approval. Blocks: FR-026, FR-028, FR-029, FR-003.

Recommendation: A (snapshot + re-approval).

#### S54-024-Q10 — Copy and notice placement

Question: Where and how is the "you may appear" notice shown?

Options:

- A: Shown on client dashboard once when first eligible + in account settings; exact EN/AR copy per copy-proposal.md. (Recommended)
- B: Shown only in account settings.
- C: Shown as a dismissible banner on first login after eligibility.

Implications: affects copy-proposal.md strings and UI surface. Blocks: FR-005, FR-038.

Recommendation: A.

## Overlap and coordination notes

- Do not duplicate F13 freeze/entitlement, F15 scheduling, F17/F18/F19 delivery, F20 notes, F21 names, spec 023 progress data.
- Coordinate with open PRs #58/#86/#88/#90; consume merged contracts.
- Leaderboard is optional; gated by legal review (assessment C4) before Full Launch.
