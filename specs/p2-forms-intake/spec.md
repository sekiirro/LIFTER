# Feature Specification: P2 Forms/Intake

**Feature ID: pending PO assignment**

**Feature Branch**: `p2-forms-intake-spec`

**Tracker row**: P2 Forms/Intake

**Created**: 2026-10-29

**Status**: Draft (pending Spec Debate)

**Input**: Session 12, lane 4: specify the P2 Forms/Intake engine, authorization/capability boundaries and delivery SLA. Specification only; no code, migrations, database operations, Docker, plan or tasks. The directory remains neutral until the PO assigns the feature ID.

## Authority and scope

The [roadmap](../../docs/03-roadmap.md) P2 scope is quoted verbatim:

> Form templates/versions, assignment snapshots, conditional logic, autosave, mandatory 3-section intake, Cairo business-calendar SLA, delay alerts (in-app); includes REQ-P2-01 (post-approval automatic form assignment)

Sources read for this draft:

- [Carried requirements](../../docs/12-carried-requirements.md), REQ-P2-01; [decision register](../../docs/04-changes-and-questions.md), D-03, D-09, D-18, D-23 and phase-gated open items; [feature tracker](../../docs/10-feature-tracker.md), P2 row.
- [Constitution 1.3.0](../../.specify/memory/constitution.md), especially I, III–V and VII–IX; [production readiness](../../docs/13-production-readiness.md), DP-01/02, OP-03, BR-01/02 and inherited hosted/Go-Live gates.
- [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-02 (roles), BRD-04.4–7 (approval/intake/SLA/activation), BRD-05 (delay recipients and human discipline), BRD-06 (no bulk actions), PRD-03 (forms/versioning/autosave), PRD-06 (five-day delivery and alerts), PRD-10 (in-site notifications), PRD-11 (audit), PRD-13 (privacy/localization/accessibility), PRD-14 Journey A, DR-01/02. The business-calendar rules come from BRD-04.6 and PRD-06 as refined by D-03; neither authorizes an additional holiday exclusion.
- F12 branch `origin/012-registration-approval` at `89fe2a86e302df0ce585213071cdd26a39884077`: `spec.md`, `plan.md`, `data-model.md`, `contracts/feature-handoffs.md` and `contracts/registration-approval-surface.md` under `specs/012-registration-approval/`. Its proposed technical seams are dependencies, not claims of implemented interfaces. Its final F12-6 status-page decision and Sales approval denial supersede older D-09 wording where inconsistent.
- F14 branch `origin/014-workspace-branding` at `ea6b048f274f3c513fca7202f947e5b299193187`: `specs/014-workspace-branding/spec.md` F14-8, FR-008/015 and PI-F14-8; its plan was consulted only for integration/migration ordering. F14 supplies authorized published brand data/tokens; it does not implement P4.
- Main baseline `a8c7ae569e1ae1380740230b90817679b22d465b`: `lib/auth/capabilities.ts`, [Spec Kit template](../../.specify/templates/spec-template.md), [F11 specification](../011-client-accounts/spec.md), [Design Gate](../../docs/09-frontend-design-gate.md) and local `speckit-specify` conventions.

Latest approved decisions control. Every proposal below is identified separately from approved scope. Questions are NOT DECIDED; recommendations grant no permission. The user explicitly requires all gaps to remain visible instead of guessed defaults. Drafting these two files does not complete Spec Debate or authorize implementation.

## User Scenarios & Testing

### User Story 1 — Receive the selected intake after approval (Priority: P1)

As an approved client, I find my selected intake on login, so I can start onboarding without waiting for a manual form assignment.

**Why this priority**: REQ-P2-01 joins F12 approval to mandatory intake and is the start of Journey A's P2 slice.

**Independent Test**: Supply one synthetic committed approval fact and one authorized selected published intake version. Consume the fact twice and sign in as that client; one assignment appears with Basic/Workout/Nutrition. No planner or portal is needed.

**Acceptance Scenarios**:

1. **Given** a selected eligible intake and a committed approval event, **When** P2 processes it, **Then** exactly one independent assignment snapshot is created and presented to that client on login.
2. **Given** a rejected or rolled-back F12 operation, **When** assignment processing runs, **Then** no approval-derived assignment is created.
3. **Given** a previously committed approval before P2 existed, **When** backfill runs, **Then** it has the same assignment/dedup guarantees as a new event.
4. **Given** missing selection or an unavailable template prerequisite, **When** consumption runs, **Then** no arbitrary form is selected and the fact remains recoverable; Q8 must determine the operational resolution before this path ships.

### User Story 2 — Complete and resume intake safely (Priority: P1)

As a client, I answer conditional questions in one Basic/Workout/Nutrition intake, resume saved progress and submit only when all required applicable answers are complete.

**Why this priority**: Mandatory complete intake supplies reliable coaching information and starts the delivery clock.

**Independent Test**: Use a synthetic assignment with one conditional branch in each section. Save, navigate away, resume, deliberately conflict from another tab, and submit invalid then complete answers.

**Acceptance Scenarios**:

1. **Given** acknowledged saved answers, **When** I return on another authenticated device, **Then** the same accepted revision appears; unsaved or failed changes were never represented as saved.
2. **Given** two tabs loaded the same revision, **When** both save divergent changes, **Then** only one succeeds at that revision and the other sees a conflict without silent overwrite.
3. **Given** a required applicable answer is missing in any section, **When** I submit, **Then** submission fails with accessible section/question errors and no SLA starts.
4. **Given** a complete valid intake, **When** submission is accepted or its response is retried, **Then** one immutable submitted revision and one original submission instant result.

### User Story 3 — Maintain templates without rewriting history (Priority: P1)

As an authorized form author, I maintain versioned templates and conditional questions while preserving what every assigned client received and submitted.

**Why this priority**: Template changes must never change assigned obligations or historical health answers.

**Independent Test**: Under a PO-approved Q1 matrix, publish a template, create an assignment, then publish an edit and retire the original for future use. Compare original assignment and submission content before and after.

**Acceptance Scenarios**:

1. **Given** a published version used by an assignment, **When** an authorized author edits the template, **Then** a new version is produced and the assignment's questions, rules and requiredness remain unchanged.
2. **Given** an attempted rule cycle, executable script or rule set above approved bounds, **When** publication is attempted, **Then** it is rejected before clients can receive it.
3. **Given** a role denied authorship by Q1, **When** it bypasses the UI to create, publish or alter a template, **Then** both authorization walls deny the action.

### User Story 4 — See an accurate intake-based delivery deadline (Priority: P1)

As responsible staff, I see when the first workout/nutrition pair is due, calculated from the original complete intake submission using Cairo working days.

**Why this priority**: A reproducible deadline supports the approved delivery promise without activating subscriptions early.

**Independent Test**: Supply accepted submissions around Cairo 18:00, Thursday/Friday/Saturday, month/year boundaries and DST transitions. Calculate day five without a planner; verify the approved Q2 deadline instant once decided.

**Acceptance Scenarios**:

1. **Given** submission Thursday before 18:00 Cairo, **When** five working days are counted, **Then** Thursday is day one, Friday is excluded and Tuesday is day five.
2. **Given** Thursday at or after 18:00, or any Friday submission, **When** counting starts, **Then** Saturday is day one and Wednesday is day five.
3. **Given** a submitted answer is later corrected, **When** its new revision is accepted, **Then** the original SLA start and deadline remain unchanged.
4. **Given** approval, a saved draft or an incomplete submission, **When** time passes, **Then** none starts this clock or activates the subscription.

### User Story 5 — Receive one actionable in-app delay alert (Priority: P2)

As the responsible trainer, WO or PO, I learn when an undelivered first pair is late, with workspace-safe context and no automatic disciplinary consequence.

**Why this priority**: Delay alerts make the SLA useful while keeping people decisions human-governed.

**Independent Test**: Supply one overdue obligation and controlled delivery/responsibility facts. Run detection repeatedly and concurrently; verify one alert per approved recipient/dedup policy and no alerts for a pair completed on time. Q2/Q7 must be resolved first.

**Acceptance Scenarios**:

1. **Given** the approved deadline has passed without a complete first pair, **When** detection runs, **Then** in-app delay alerts reach the responsible trainer, workspace WO and PO under Q7's cadence.
2. **Given** a retry, worker restart or concurrent scan of the same delay, **When** it runs again, **Then** duplicate logical alerts are not created.
3. **Given** the pair was delivered by its deadline, **When** a delayed scan catches up, **Then** it does not claim a delivery delay; delivery after deadline preserves the actual delay history.
4. **Given** a missing responsible trainer or revoked membership, **When** routing runs, **Then** it leaks no client data to that actor and retains an actionable owner-visible exception under Q7.

### User Story 6 — Protect private answers across roles and workspaces (Priority: P1)

As a client or staff member, I can access only the forms and health information my current identity, role and workspace authorize.

**Why this priority**: Intake contains sensitive health/nutrition information and tenancy is non-negotiable.

**Independent Test**: Use two workspaces, two clients and PO/WO/Trainer/Sales identities. Attempt reads, saves, submission, selection, authoring, background processing and replay at both authorization walls, including revoked membership and guessed IDs.

**Acceptance Scenarios**:

1. **Given** a client identity, **When** it requests another client's assignment even in the same workspace, **Then** it receives no answers, metadata or existence signal.
2. **Given** an authorized Trainer or WO, **When** it reads intake for a client in an authorized workspace, **Then** coaching access is permitted regardless of responsible-trainer assignment; another workspace is denied.
3. **Given** Sales, pending/rejected clients or anonymous callers, **When** they request protected intake content, **Then** access is denied without broadening F12's self-status permission.
4. **Given** the PO, **When** a real target workspace is selected, **Then** platform-wide oversight is allowed and sensitive access is audited without copying answers into the audit.

### Edge Cases

- Approval races with form selection, version publication, retirement or staff revocation; no stale capability check or mixed-workspace binding may create an assignment.
- Duplicate/out-of-order approval facts, failed assignment/audit writes and lost acknowledgements; successful assignments remain unique and failures are recoverable.
- A conditional answer changes so a previously required branch is hidden; hidden answers must not satisfy another requirement or bypass server validation. Q5 decides their retention/projection.
- Empty or superficially renamed mandatory sections, all questions hidden, malformed choices, oversized text/payloads, cyclic dependencies and rule expansion attacks must not pass validation.
- Two devices save the same revision, an older response arrives after a newer one, or save races submission; accepted server revision ordering governs and submission cannot be overwritten by a late save.
- Network loss before acknowledgement, expired Auth and browser close do not claim a successful save; recoverable draft handling must not persist health data in logs or uncontrolled browser storage.
- Submission exactly at 18:00 Cairo, all Friday hours, Thursday cutoff, Cairo DST offset changes, leap dates and public holidays that remain working days under D-03.
- Pair delivery exactly at the proposed deadline boundary, delivery before a delayed detector, no responsible trainer, multiple owner roles and membership revocation require deterministic routing/boundaries after Q2/Q7.
- Corrections, template retirement and assignment replacement cannot erase prior submissions or restart the first-delivery clock. Q9 governs replacement/correction rights.
- Very long authored Arabic/English text, mixed-direction numbers, keyboard-only branching and loss of focus when a conditional question disappears require Design Gate verification.

## Requirements

### Functional Requirements

- **FR-001**: REQ-P2-01 is carried verbatim: PO, WO, or an authorized Trainer selects the intake form; it is automatically assigned after client approval and presented to the client on login. Preserve mandatory Basic/Workout/Nutrition intake and workspace authorization. Deliver this through the Forms/Intake engine (P2), not as a partial engine inside F12.
- **FR-002**: P2 MUST accept only a committed F12 `registration.approved` v1 fact bound to the same real workspace/client/initial subscription. Failed/rejected operations MUST produce no intake assignment. P2 MUST process both historical and new facts, atomically record successful consumption with assignment/audit, and deduplicate by `event_id` with independent one-initial-assignment protection for the approval/subscription. Failed prerequisites MUST remain retryable without selecting an unapproved fallback (Q8).
- **FR-003**: Selection MUST identify a published eligible intake version and authorized selecting actor in the client's workspace. PO has global scope over actual workspaces; WO has own-workspace scope; authorized Trainer has membership scope. Q3 MUST settle the Trainer capability before implementation; the role name or UI visibility alone MUST NOT grant selection. Builder rights are separately undecided under Q1.
- **FR-004**: P2 MUST provide versioned templates with stable question/section identities, answer types, authored labels, requiredness, validation and declarative conditional rules. Published versions MUST be immutable; editing published content creates a new version. Q1 governs global/shared and workspace-local creation, copy, edit, publication and retirement rights; Q5 settles supported field/rule inventory and bounds.
- **FR-005**: Every assignment MUST capture an immutable, workspace-owned independent snapshot of the selected version's full question/section content, validation and rules. Template editing, republishing, retirement or later shared-template access changes MUST NOT alter assigned or submitted forms. Historical authorized reads MUST remain possible without resolving a mutable live template. Snapshot immutability does not prevent new answer revisions under FR-013.
- **FR-006**: Mandatory initial intake MUST be one assigned form containing Basic, Workout and Nutrition sections. Neither authoring nor selection nor conditional logic may remove or bypass their substantive required completion. The server MUST validate each section's approved required applicable questions and section-completeness policy at submission; Q5 must define the exact inventory/minimum content so an empty or all-hidden section cannot pass as complete.
- **FR-007**: Conditional progression MUST be deterministic from the assignment snapshot and current accepted answers. Rules MUST be declarative, typed and allow-listed, without arbitrary script, executable markup, external calls or arbitrary code execution. Dependencies MUST be acyclic and evaluation MUST have explicit finite depth, rule-count, question-count, payload-size and work bounds. Q5 requires approved supported operations and numeric limits before publication/assignment can ship.
- **FR-008**: The server MUST independently re-evaluate conditional applicability, types, choices, validation, requiredness, bounds and the three-section policy on every save/submission; client visibility is not authority. Unknown question IDs, wrong-snapshot answers and out-of-bound rules/payloads MUST fail safely. Hidden-answer behavior MUST follow Q5 and cannot bypass completeness.
- **FR-009**: Autosave MUST distinguish unsaved, saving, acknowledged-saved, failed and conflict states. Only an acknowledged durable accepted revision may be called saved. Resuming MUST restore that revision across navigation/devices; retries after network loss MUST preserve the same intent key. Autosave cadence and draft expiry remain Q6 decisions, not implicit promises.
- **FR-010**: Draft writes MUST name the assignment and expected current revision. Accepted writes advance an authoritative ordered revision; stale competing writes MUST return a conflict and preserve the accepted draft. Last-write means last accepted server revision, never latest client clock or late network arrival. No silent whole-form last-arrival overwrite or automatic conflict merge is permitted; the client can reload/reconcile then save against the new revision. Late acknowledgements MUST NOT revert displayed newer state.
- **FR-011**: Save and submit retries MUST be idempotent: the same authorized operation key and canonical intent returns the original outcome without duplicate revision/submission/audit. Reusing a key with different intent MUST fail safely. Authorization MUST precede replay disclosure and be rechecked after contention. Concurrency between save and submit MUST serialize so a late draft write cannot mutate an accepted submission.
- **FR-012**: Draft/submitted answer data MUST remain server-authorized sensitive data. Draft retention/expiry and client-closure treatment MUST follow a PO-approved Q6/Q10 policy with visible expiry/recovery semantics; no indefinite or numeric retention default is approved. Expiry cleanup MUST preserve required immutable submission/SLA/audit history under the approved policy. No health-answer browser persistence policy is implied by autosave.
- **FR-013**: A complete successful submission MUST create an immutable answer revision and authoritative original submission instant together with audit and SLA start. An invalid, incomplete, failed or rolled-back submission MUST create none. Corrections MUST create new answer revisions, preserve prior authorized history and never reset original submission time or SLA. Who can correct, which answers and any replacement flow require Q9.
- **FR-014**: The SLA MUST begin only at the first accepted complete mandatory intake submission and target the first complete workout/nutrition pair. It MUST NOT begin at signup, approval, assignment, draft save or partial section completion; P2 MUST NOT activate a subscription or create delivery/productivity facts.
- **FR-015**: Calendar calculation MUST use the IANA zone `Africa/Cairo`, local calendar dates and current zone rules, not a fixed UTC offset or five 24-hour durations. Five working days include every day except Friday; D-03 explicitly says no other holidays. On a working day before 18:00, that day counts as day one; at/after 18:00, counting begins the next working day. Friday submissions begin on Saturday. DST MUST be evaluated from the instant's Cairo local time. Q4 concerns the authoritative Friday-only calendar source and any separately approved future change, not implicit public-holiday exclusion.
- **FR-016**: P2 MUST preserve original submission instant, derived Cairo start/day-five date, calendar/rule identity and the eventual deadline instant so a deadline is reproducible. The exact instant on day five and inclusive/exclusive late boundary are NOT DECIDED (Q2); neither cutoff 18:00 nor day-end may silently become the deadline. No production lateness classification may ship until Q2 is resolved. Calendar changes MUST NOT silently recalculate existing deadlines.
- **FR-017**: In-app delay alerts MUST identify the late first-pair obligation and route to the responsible trainer, workspace WO and PO (BRD-05, PRD-06). At the approved lateness boundary, an undelivered pair MUST become eligible for detection; operational scan/catch-up latency, repeated-alert policy and responsibility exceptions require Q7. There MUST be no email/SMS/Telegram sending in this P2 slice.
- **FR-018**: Detection and notification delivery MUST be retry-safe and deduplicated by the logical SLA/delay occurrence, approved alert kind and recipient; replays/concurrent scans MUST NOT create duplicate logical alerts. Recheck current workspace/recipient authorization at delivery and read. Use authoritative delivery timestamps to distinguish on-time delivery from a delayed scan and retain true late history without issuing obsolete actionable notices after resolution. Q7 settles reassignment/new-recipient behavior.
- **FR-019**: Delay detection MUST NOT automatically create deductions, strikes, firing or compensation changes. It MUST retain non-PII evidence for later human review and expose the P4 delivery/responsibility dependency without implementing P4 balanced assignment or activation. Missing dependency facts MUST be explicit operational exceptions, never invented delivery or trainer assignment.
- **FR-020**: Every tenant-owned template copy, selection, assignment, answer revision, SLA record, processing record and alert MUST carry workspace identity and same-workspace composite relationships. All reads/mutations/jobs MUST enforce current signed identity, capability, actual workspace membership and object ownership at both app authorization and independent database RLS boundaries. Foreign/nonexistent/unauthorized targets MUST not disclose existence through responses, errors, replay or cache. PO global authority still requires a real workspace target.
- **FR-021**: Approved clients MUST have self-access only to their own assigned forms/drafts/submissions. Pending/rejected clients MUST remain denied protected intake even with valid sessions; their F12 narrow self-status access is separate. WO and Trainers may read intake needed for coaching in their authorized workspaces, independent of responsible-trainer attribution; Sales receives no health-answer, selection or builder right without explicit approved permission. Staff mutation rights beyond approved selection require Q1/Q9.
- **FR-022**: All staff form rights MUST follow least privilege and the approved permission matrix. P2 MUST preserve F12's removal of Sales `approve_registration` and MUST NOT infer coaching permission from Sales payment rights or restore older D-09 approval behavior. Any new/reused capability MUST have identical TypeScript matrix and SQL `has_capability` semantics, verified by a role-by-capability matrix including revoked/foreign membership denials (Q3).
- **FR-023**: Intake answers and drafts MUST be classified as sensitive personal health/fitness/nutrition data; they are not ordinary operational metadata. Minimize authorized projections and cache scope, prevent shared/public caching and cross-workspace late-response leakage, and protect stored/transmitted data under platform privacy controls. No comprehensive export is added; any later full client export remains PO-only.
- **FR-024**: Template publication, selection, assignment, save/submission/correction, sensitive answer access, SLA creation and alert lifecycle MUST have append-only, tamper-resistant, allow-listed audit evidence. Mutation/audit success MUST be atomic; failed success-audit writes roll back the associated mutation. Audit MUST contain actor/tenant/object IDs, event/outcome, time and revision/rule identifiers only as appropriate, never answer values, question/label text, health data, client identity PII, raw requests, tokens or free text. Replays MUST NOT duplicate successful mutation audit. Audit retention stays Q10/ND-F5-1; audit history is not the client timeline.
- **FR-025**: Logs, telemetry, errors, jobs, traces and audit MUST exclude intake answers, names/email/phone, health/nutrition text, credentials and raw request bodies. New log sites and failure paths MUST pass log-scrub verification with distinctive synthetic sensitive values. Operational failure alerts MUST use safe IDs/outcome classes without exposing answer content.
- **FR-026**: All P2 UI MUST use existing DESIGN.md/P0 components and semantic tokens, Arabic-first RTL and English LTR, accessible labels/errors, keyboard navigation, focus management, save/conflict announcements and responsive light/dark states. Authored content MUST display as authored without machine translation; bilingual authoring/fallback completeness needs Q5. Body-fat information, if included in the approved inventory, MUST be numeric, not an unsolicited body-fat image selector (PRD-03).
- **FR-027**: Client intake MUST consume F14's authorized published workspace brand data/tokens when available, preserving neutral/default workspace presentation when no customization exists. Resolve current authorized scope per request with no shared actor/workspace cache; discard late workspace-switch responses, preserve semantic colors and verify contrast on real surfaces. Branding MUST NOT change answers, snapshot rules or authorization. F14-8 provides the branding contract only; P2 MUST NOT build the P4 portal.
- **FR-028**: P2 MUST integrate a real authenticated self-intake route through reviewed F12 status/navigation contracts once it exists. Preserve `/account/status` Pending/Approved/Rejected states, safe manual fallback and bounded automatic detection; never redirect to staff routes or treat approval as activation. P2 login presentation MUST not claim form-assignment success while prerequisites are unresolved. Q11 settles the precise presentation/destination under the Frontend Design Gate.
- **FR-029**: Every P2 rendered surface—builder/version list, selector, client conditional intake, draft/conflict/submission/history states, SLA indicator and in-app delay alert—MUST pass the Frontend Design Gate before implementation acceptance. Required evidence is real retained screenshots for AR-RTL/EN-LTR × light/dark × mobile 390/desktop 1440, required interaction/loading/empty/error/success/disabled/pending states, keyboard/screen-reader/axe and contrast verification. Missing Design System decisions MUST be escalated with options, not invented.

### Key Entities (logical)

- **Form template and published version**: Governed reusable form identity, scope, immutable authored question/section definitions and bounded conditional/validation rules; draft authoring and publication history are distinct.
- **Intake selection**: Authorized choice of an eligible version for a workspace/client onboarding context, selecting actor and time. Q8 determines when/how prerequisites must exist.
- **Approval fact and consumption record**: F12 immutable event identity/workspace/client/subscription/version/time, plus P2 private processing/dedup state; the event itself has no form selection or PII.
- **Form assignment snapshot**: Workspace/client/subscription-bound independent copy of versioned form content and rules, approval origin and assignment time, readable independently of later template changes.
- **Answer draft and revisions**: Sensitive answers keyed to snapshot question IDs, authoritative draft revision and acknowledged save state; accepted submissions/corrections retain immutable answer revisions and original submission identity.
- **Delivery SLA obligation**: Original complete submission, Cairo calendar/rule identity, day-five date and eventually approved deadline instant, linked to authoritative first-pair delivery/responsibility facts supplied by P4.
- **Delay occurrence and recipient alert**: One logical lateness occurrence and deduplicated authorized in-app recipient deliveries; no email/SMS or discipline entity is created.
- **Audit event**: Append-only safe action/access evidence, detached from answer content and governed by separately approved retention.

## Success Criteria

### Measurable Outcomes

- **SC-001**: For every eligible synthetic approval event, including historical backfill and concurrent duplicate delivery, exactly one initial intake assignment is visible to its approved client on login; zero rejected/rolled-back approvals create assignments.
- **SC-002**: Editing, publishing or retiring a template changes zero bytes of every pre-existing assignment snapshot and submitted revision in the versioning acceptance suite.
- **SC-003**: In every mandatory-section/conditional-branch validation case, incomplete intake is rejected; every accepted submission has complete Basic/Workout/Nutrition and exactly one original SLA start.
- **SC-004**: Across navigation, response-loss retry, two-tab/two-device and save-versus-submit tests, 100% of acknowledged saves are recoverable at their accepted revision within the approved retention window, with zero silent stale overwrite or duplicate accepted submissions.
- **SC-005**: All Cairo calendar fixtures produce the expected start and fifth working date, including exact 18:00, Friday, public holidays, month/year and DST boundaries. Once Q2 is approved, 100% of exact-boundary fixtures also produce the approved deadline instant and late classification.
- **SC-006**: Submitted-answer corrections change zero original SLA starts/deadlines; approval and draft-only fixtures create zero delivery clocks and zero subscription activations.
- **SC-007**: Each genuine overdue occurrence produces exactly the approved authorized recipient alerts with zero duplicates after retries/restarts/concurrent scans, within Q7's approved catch-up interval; on-time completed pairs produce zero delay alerts.
- **SC-008**: Every role/object/workspace negative case at either authorization wall reveals zero foreign/self-other health answers or existence metadata; all sensitive access evidence contains zero answer/identity PII.
- **SC-009**: Zero executable/cyclic/over-limit rule definitions reach clients, and every tampered client-only applicability/requiredness payload fails independent server validation.
- **SC-010**: All new log/error/audit/job paths contain zero occurrences of seeded sensitive test values; every mandatory successful mutation has exactly one corresponding safe success audit despite replay.
- **SC-011**: Every P2 UI surface passes the eight required locale/theme/device combinations plus keyboard, screen-reader, contrast and accessibility review with retained evidence and zero unresolved Design Gate failures.

## Assumptions and unresolved readiness

- F11 identity/workspace binding and F12 approval facts/self-status are dependencies; this draft does not claim F12 is merged or its proposed interfaces are operational.
- No answers, field inventory, rule numbers, retention periods, alert cadence or unresolved permission is borrowed from YBS or selected silently. Q1–Q11 require PO decisions/source confirmation before affected behavior is implementation-ready.
- Technical concurrency, idempotency and deny-by-default requirements protect already approved scope. Exact schemas, operations, test fixtures and performance budgets belong to the later reviewed plan, not this drafting lane.
- Production remains blocked by current readiness gates, including B4/ND-F5-1 retention, inherited hosted verification, log scrubbing, backup/restore and explicit deployment approval. This draft changes neither register nor tracker; future authorized integration must synchronize both.

## Open questions for PO

Every item below is **NOT DECIDED — NEEDS SOURCE CONFIRMATION**. Recommendations are proposals, not defaults or authorization.

1. **Q1 — Form-builder permission matrix (NOT DECIDED):** Who may create/copy/edit/publish/retire global forms and workspace-local forms? Options: A) PO governs global forms; PO/WO/Trainer author and publish workspace forms; Sales denied; B) PO governs global forms; PO/WO publish workspace forms; Trainer drafts only; Sales denied; C) PO publishes all forms; WO/Trainer draft locally; Sales denied. **Recommendation: B**, keeping global governance central and separating local coaching authorship from publication. Record an operation-by-role-by-scope matrix; selection remains Q3.
2. **Q2 — Deadline instant on day five (NOT DECIDED):** At what instant does delivery become late? Options: A) 18:00 Cairo on the fifth counted working day, late at/after that instant; B) exclusive next Cairo midnight after day five, late at/after that instant; C) original submission's Cairo wall-clock time on day five, late at/after that instant with an explicit DST ambiguity rule. **Recommendation: B**, giving the whole fifth working day; 18:00 remains the approved submission-count cutoff only until the PO decides.
3. **Q3 — Trainer selection capability (NOT DECIDED):** Which capability authorizes the Trainer in REQ-P2-01? Options: A) existing `coaching_work` plus actual workspace membership; B) new dedicated `select_intake_form` capability for PO/WO/authorized Trainers; C) existing `coaching_work` plus a separately governed per-workspace Trainer grant. **Recommendation: A**, if all authorized workspace Trainers are intended selectors; otherwise B. Any decision must update and verify TypeScript MATRIX and SQL `has_capability` parity, preserving F12's Sales approval denial.
4. **Q4 — Business/holiday calendar source (NOT DECIDED):** How should D-03's Friday-only calendar be sourced and governed? Options: A) versioned internal Friday-only calendar with no external holiday feed; B) explicit PO-managed calendar policy, initially Friday-only, with future changes separately approved and versioned; C) approved external public-holiday source plus an explicit D-03 amendment. **Recommendation: A** for current scope. No Egyptian/public holiday exclusion is currently approved; B/C cannot silently change existing deadlines.
5. **Q5 — Question inventory, logic bounds and authored locales (NOT DECIDED):** Which publishable form profile should be approved, including substantive required questions in Basic/Workout/Nutrition, field types, operators, finite depth/count/size/work limits, hidden-answer handling and AR/EN content fallback? Options: A) PO supplies/verifies the original inventory and numeric bounds with one authored language and explicit fallback; B) architect proposes a bounded typed profile and bilingual required labels for PO approval. **Recommendation: A**, then B only for missing source values; neither profile or its limits is approved by this draft.
6. **Q6 — Autosave cadence and draft retention (NOT DECIDED):** Which save/retention profile should govern sensitive drafts? Options: A) server-only drafts with a PO-approved debounce/max-unsaved interval and fixed inactivity expiry/warning; B) server-only drafts retained until submission/closure under the approved retention policy, with a PO-approved save interval; C) either profile plus explicitly approved encrypted device persistence and cleanup rules. **Recommendation: A**, with concrete intervals/expiry approved before implementation; acknowledged revisions and conflict rejection remain required in every option.
7. **Q7 — Delay detection and recipient lifecycle (NOT DECIDED):** What detection/catch-up interval and recurrence/routing policy should apply? Options: A) one alert per delay per authorized recipient, owner exception if no responsible trainer, no repeated reminders; B) initial alerts plus PO-configured repeated in-app reminders; C) initial alerts plus one owner escalation after a PO-set interval. **Recommendation: A**, with an explicit maximum detection/catch-up interval and an approved decision on new recipients after reassignment; P4 must supply real responsibility/delivery facts.
8. **Q8 — Selection timing and missing prerequisites (NOT DECIDED):** When must the selected intake version exist, including for approvals predating P2? Options: A) per-client selection before approval with an owner-visible recoverable exception for old/missing selections; B) an explicitly selected workspace intake default, with authorized per-client override before assignment; C) retain approval facts until authorized per-client selection, then assign automatically. **Recommendation: A**, plus explicit retrospective selection for backfill; do not add an F12 selector or make existing approval fail without reviewed cross-feature approval.
9. **Q9 — Corrections and assignment replacement (NOT DECIDED):** Who may revise submitted answers or replace an assigned intake? Options: A) client corrections plus authorized coaching corrections as new audited revisions; replacement requires PO/WO and preserves originals/SLA; B) client corrections only, staff read-only; PO/WO replacement preserves originals/SLA; C) staff-mediated corrections only with PO/WO replacement preserving originals/SLA. **Recommendation: A**, subject to an explicit field/action matrix; no option restarts the original delivery clock or mutates prior snapshots/submissions.
10. **Q10 — Sensitive-data and audit retention (NOT DECIDED):** Which intake closure/history retention policy should extend B4/ND-F5-1? Options: A) jurisdiction-reviewed distinct schedules for drafts, submissions/corrections, safe audit and alert evidence, with closure pseudonymization; B) apply a confirmed existing client-closure/audit schedule to intake after explicit legal applicability review. **Recommendation: A**. PO must approve actual durations, deletion/pseudonymization rules and backup treatment before real client data; no numerical or indefinite policy is assumed.
11. **Q11 — Login presentation and Design Gate gaps (NOT DECIDED):** How should a real approved-client intake route be presented within F12's standalone status flow? Options: A) approved status offers a clear Continue to Intake action and login resolves to outstanding intake; B) reviewed automatic navigation to outstanding intake with the same manual fallback; C) existing authenticated landing shows an intake entry while status remains standalone. **Recommendation: A**, preserving F12's bounded pending-approval detection and manual recovery. Exact builder/conditional progression/conflict/history/SLA/alert layouts and missing Design System decisions require options and PO review under the Frontend Design Gate before they are finalized.

## Dependencies and migration ordering

This section records coordination constraints only. No migration or implementation is authorized or created.

### F12 consumed contracts

- `public.clients`: immutable F11 identity/workspace/Auth binding and F12 current `approval_state`; do not grant a form through a stale JWT claim.
- `public.subscriptions`: initial-subscription identity/workspace/client binding. P2 reads only the identities needed for onboarding/SLA, not price/commission/payment content.
- `app_private.registration_approval_events`: private immutable `{event_id, kind:'registration.approved', schema_version:1, workspace_id, client_id, subscription_id, approved_at}` fact from successful approve/reconsider transactions. No form/template/selection/PII fields. F12 owns atomic emission and retention; P2 owns scoped internal reads, historical backfill, delivery/retry state and inbox dedup. Do not expose the private table to clients or start an unhandled generic job before its consumer exists.
- F12 `client_self_status()` and internal `client_has_access(workspace_id,client_id)`/client-access contract: self-only mapping with current approval, request-local checks, separate from staff membership. Approved does not itself grant intake/plan/Storage access; P2 adds independently scoped self-form access.
- `/account/status` and its Pending/Approved/Rejected standalone states, bounded visibility-aware detection, real-route server allowlist, safe `/` fallback and manual recovery (F12-6/PA-F12-6). P2 supplies a real route before any intake destination is registered; no guessed route or staff redirect.
- F12's `public.subscription_activations` is a future P4 delivery seam, not an intake SLA start or P2 writer. `subscription_installments`, `payment_events`, `registration_decisions` and `registration_operations` remain F12-owned and are not P2 write/read dependencies for health forms.
- F12 contains no form UI/selector/engine. Its handoff is durable approval facts, not already completed assignment. Its Sales capability removal must be preserved at both authorization walls.

### Other dependencies and shared files

- P4 must eventually supply authoritative atomic first-pair delivery and responsible-trainer facts. P2 defines consumption needs and SLA/alert tests with synthetic facts; no balanced assignment, planner, activation or general portal is implemented here. P3 later consumes authorized contextual intake answers; P5 later adds weekly recurrence/freeze/check-ins.
- F14-8: use only the published client-brand data/token contract, authorized per-request workspace resolution, contrast guards and neutral fallback. Do not add portal features, branding editor/storage or history behavior to P2.
- Shared `lib/auth/capabilities.ts`, SQL `has_capability` and `lib/auth/` require sequential integration and parity review with F12/F14. Main currently includes Sales `approve_registration`; F12 removes it. F14's separate branding capability must survive any matrix extension. Never replace either matrix from a stale branch.
- `audit_row_change()` is a shared complete function body. Future P2 work must start from the latest merged body after F12/F14, preserving all prior tenancy/staff/membership/recovery/package/link/signup/job/approval/payment/branding mappings, no-op behavior and scrubbed allow-lists. Do not copy an older F11-only definition over newer branches. Coordinate any explicit access-audit emission separately from row mutation audit.
- Shared `lib/i18n/messages/{ar,en}.ts`, existing staff dashboards (`app/(app)/page.tsx` and authorized dashboard surfaces), `lib/auth/`, F12 `lib/client-access/`, `app/(client)/account/status/` and future client-form routes need explicit sequential ownership. F12 Approvals/Payments links and branding/auth/self-status behavior must remain intact; no navigation redesign is implied.
- Future readiness/tracker updates belong to an explicitly authorized integration unit; these two draft files are the only changes in this lane.

### Ordering constraint

F12's proposed set is `20261101115000_flexible_registration_link_terms.sql`, `20261101120000_registration_approval_model.sql`, `20261101121000_registration_approval_operations.sql`, `20261101122000_payment_operations.sql` and `20261101123000_registration_approval_reads.sql`. All future P2 migrations MUST sort strictly after this entire `20261101…` set **and** F14's final migration set, including review-fix migrations. F14 currently names no final timestamps and requires its migrations after all final F11 migrations; do not invent an F14 or P2 timestamp. Allocate P2 timestamps only after reviewing the integrated F12/F14 sets and latest shared audit/capability definitions. Forward-only expand/contract and backup/restore gates still apply; this spec performs no stack or DB operation.

## Out of Scope

- P3 exercise/food catalogs, workout/nutrition planners, plan exports and contextual planner UI; P2 preserves the logical authorized-answer handoff only.
- P4 balanced trainer assignment, pair delivery, activation/productivity, client portal/dashboard, general notifications, subscription expiry/installment enforcement and finance reporting. P2 includes only its required login/intake presentation, SLA and in-app delay alerts.
- P5 recurring weekly check-ins, measurements/measurement linkage, freeze scheduling, replacements, trainer notes and client timeline UI. The engine must preserve versioning without implementing recurrence now.
- Email/SMS/Telegram reminders or alerts, messaging/helpdesk/broadcasts, bulk client/form assignment, arbitrary executable form rules, web photo uploads and comprehensive exports.
- F12 payment/approval/correction behavior, F14 branding management, F13 renewal/freeze/refunds, YBS import/sync, implementation artifacts and production operations.

## Constitution Check

- **I/III**: Workspace-bound relations, two authorization walls, current membership, PO global oversight, self-only client access and explicit undecided capability/builder matrix. No Sales coaching right is inferred.
- **II/V**: No financial mutation; immutable published forms, assignment snapshots and submission revisions. Approval/intake does not activate a subscription.
- **IV/VI**: Traceable P2 scope, explicit P3/P4/P5 boundaries and no invented policy/automated discipline. Q1–Q11 are NOT DECIDED.
- **VII**: Health-data sensitivity, least privilege, safe access/mutation audit, log scrubbing, open B4/ND-F5-1 retention and inherited production gates.
- **VIII**: Existing Design System, bilingual accessible intake and mandatory Frontend Design Gate; authored content is not machine-translated and brand tokens are presentation-only.
- **IX**: Idempotent approval consumption, saves/submission/alerts, deterministic dedup, conflict-safe revisions and Cairo calendar with Friday/18:00 rules; exact deadline remains an explicit PO question.

No deviation is proposed. This is a draft for independent Spec Debate and PO decisions; checklist validation is requirements review, not test execution or implementation approval. No `plan.md` or `tasks.md` exists for this feature yet.
