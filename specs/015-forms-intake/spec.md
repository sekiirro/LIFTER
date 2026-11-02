# Feature Specification: F15 — P2 Forms/Intake

**Feature ID**: F15

**Feature Branch**: `015-forms-intake`

**Tracker row**: P2 Forms/Intake

**Created**: 2026-10-29

**Status**: Revised per binding PO decisions including D1 constitutional/security approval (2026-10-30); correction matrix approved by PO 2026-10-29 (Final PO APPROVAL)

**Input**: Session 12, lane 4: specify the P2 Forms/Intake engine, authorization/capability boundaries and delivery SLA. Specification only; no code, migrations, database operations, Docker, plan or tasks. Feature ID F15 and branch/directory `015-forms-intake` are assigned. The [Spec Debate](debate.md) records the completed critique and binding architect judgment.

## Authority and scope

The [roadmap](../../docs/03-roadmap.md) P2 scope is quoted verbatim:

> Form templates/versions, assignment snapshots, conditional logic, autosave, mandatory 3-section intake, Cairo business-calendar SLA, delay alerts (in-app); includes REQ-P2-01 (post-approval automatic form assignment)

Sources read for this draft:

- [Carried requirements](../../docs/12-carried-requirements.md), REQ-P2-01; [decision register](../../docs/04-changes-and-questions.md), D-03, D-09, D-18, D-23 and phase-gated open items; [feature tracker](../../docs/10-feature-tracker.md), P2 row.
- [Constitution 1.4.0](../../.specify/memory/constitution.md), especially I, III–V and VII–IX; [production readiness](../../docs/13-production-readiness.md), DP-01/02, OP-03, BR-01/02 and inherited hosted/Go-Live gates.
- [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-02 (roles), BRD-04.4–7 (approval/intake/SLA/activation), BRD-05 (delay recipients and human discipline), BRD-06 (no bulk actions), PRD-03 (forms/versioning/autosave), PRD-06 (five-day delivery and alerts), PRD-10 (in-site notifications), PRD-11 (audit), PRD-13 (privacy/localization/accessibility), PRD-14 Journey A, DR-01/02. The business-calendar rules come from BRD-04.6 and PRD-06 as refined by D-03; neither authorizes an additional holiday exclusion.
- F12 branch `origin/012-registration-approval` at `50cc77e8a0090f3baa716c3e4656b216db0983dd`: `spec.md`, `plan.md`, `data-model.md`, `contracts/feature-handoffs.md` and `contracts/registration-approval-surface.md` under `specs/012-registration-approval/`. Its proposed technical seams are dependencies, not claims of implemented interfaces. Its final F12-6 status-page decision and Sales approval denial supersede older D-09 wording where inconsistent.
- F14 branch `origin/014-workspace-branding` at `334f50190bcc78e794832fa26c0ea9d482b116c6`: `specs/014-workspace-branding/spec.md` F14-8, FR-008/015 and PI-F14-8; its plan was consulted only for integration/migration ordering. F14 supplies authorized published brand data/tokens; it does not implement P4.
- Main baseline `a8c7ae569e1ae1380740230b90817679b22d465b`: `lib/auth/capabilities.ts`, [Spec Kit template](../../.specify/templates/spec-template.md), [F11 specification](../011-client-accounts/spec.md), [Design Gate](../../docs/09-frontend-design-gate.md) and local `speckit-specify` conventions.

The binding Session 12 and Session 13 PO decision files and the decision register control. F15-1..8, RET-1..3, PO-1, F15 Q1–Q5, D1–D4, A1–A3, F1 and the operation-by-role-by-field correction matrix are decided. Superseded policy answers below are historical only; current behavior follows the final decisions recorded here. D1's constitutional amendment and security review are approved for design only under D-29. Automatic server-validated erasure may delete only inapplicable answer values from every version and their answer-change and access-view audit rows. A legal hold defers deletion and alerts; operations are idempotent, tenant-isolated and fail-closed; the separate control record contains counts only, with no assignment, question or answer IDs. No person, including PO, WO, Trainer or Client, and no service-role caller may trigger direct deletion. Financial, authentication, authorization, security and unrelated audit records are never selected. RET-3 requires purge from every recoverable copy within 30 days. No answer content may enter logs. Database migration work remains blocked until F12/F14 merge and Stack D is verified. This revision does not authorize real-data production use.

### Final PO decisions (2026-10-30, verbatim)

**Final PO decisions**

* F15 Q2=C: Delete inapplicable answers from all versions/history. Flag immutable audit conflicts before implementation.
* A1=B: If no Trainer assigned, notify PO + WO.
* A2=Modified A: First overdue alert to Trainer 24h after form deadline; escalate to BOTH PO + WO 48h after deadline. On Trainer reassignment, transfer alert without resetting the clock.
* A3=A: Notify whichever PO/WO remains authorized.
* F1=A: Automatically resume recurring forms after freeze, without catching up missed forms.
* F12 PR #18=A: Accept additional U1/T052 scope after review and tests.
* CI: Use previously approved temporary public window, restore PRIVATE and verify. Preserve all merge gates.
"Important: Intake Form submission deadline hasn't been decided. Present concise MCQ options with recommendations; don't invent a default. PO-1 remains pending Luna High review. Continue unblocked work. No merge without my explicit approval."

**Final PO decisions D1–D4 + PO-1**

* D1=B: Delete inapplicable answers from all versions and related audit records. Review required constitutional amendments and security implications before implementation.
* D2=A: Mandatory Intake deadline: 23:59 Cairo, third day after assignment.
* D3=A: Other forms: configurable 1–14 days, default matching Intake; each recurring occurrence has its own deadline.
* D4=A: Separate Client-late and Trainer-late alerts. Client: Trainer at +24h, PO+WO at +48h after deadline. Preserve existing Trainer-late rules.
* PO-1: Existing JWTs may remain valid until expiry. On refund, deactivate client and block new sign-ins/refresh with safe failure handling. A+/C no longer applies.

Architect note (not a PO decision): D1 requires a forward-only migration changing audit immutability enforcement. The constitutional amendment and security/DB design are PO-approved under D-29; the exact database work waits for F12/F14 merge and verified Stack D.

**F15 D1 Constitutional Amendment — PO APPROVED (session 13, 2026-10-30, verbatim)**

> 1=A: Approve narrowly scoped Privacy Erasure exception. 2=B: Delete related answer-change AND access-view audit records. 3=B: Deletion log retains counts only, no IDs. 4=A: Automatic server-validated deletion only. 5=A: Respect Legal Holds; defer deletion and alert. 6=A: Approve security review and DB change plan. Strictly limit deletion to inapplicable answers and authorized related records. Preserve all Financial, Security and Unrelated Audit Records. Update constitution, specs and tests. Independently review security implications. Escalate genuine conflicts without inventing policy. Design approval only — NOT merge approval. Preserve all CI, CodeRabbit and PO merge gates.

PO reference: `C:/Users/NEW LAP/.lifter/briefs/s13-po-decisions-2026-10-29.md`, § “F15 D1 Constitutional Amendment — PO APPROVED”; approved proposal at the baseline head `f8524fd` is `reports/D1-amendment-security-review.md`. Decision register: D-29. The amendment records the material integrity consequence of deleting access-view rows: the system loses evidence of who viewed that inapplicable answer. It does not re-decide the approved policy.

**Application of D2–D4 and F1:** “third day after assignment” means the assignment's Cairo calendar date is day 0; the deadline is 23:59:59.999 Cairo on the third following Cairo calendar date. Other forms use a validated configurable 1–14 Cairo calendar-day interval, defaulting to the Mandatory Intake interval of three days, with the same end-of-day deadline. Each recurring occurrence receives its own assignment-time deadline. These client-submission deadlines are separate from Trainer delivery deadline D-03.

**S25-PO-8 — F15 alert channels (verbatim)**

> **PO Decision — F15:** In-App + Telegram approved. No Email. Preserve escalation rules, prevent duplicates, protect sensitive data, and keep the scheduler disabled until approved. Update specs and handoff.

**S25-R4 — binding channel implementation ruling**

- In-app alerts are always created for each authorized alert recipient.
- Telegram is available only to staff recipients who explicitly link their account using a one-time bot `/start` deep-link token. A Telegram username alone is never proof of a link. Staff can unlink; loss of workspace membership revokes the link.
- Telegram sends generic text and an in-app link only. Payload/message content contains IDs and allow-listed codes only; never a client name, answer text or health data.
- The bot token is a server-only runtime secret. Use a fake transport in tests; never expose or persist token values in repository files, logs, jobs or audit.
- Deduplicate delivery per `(alert stage, recipient, channel)`. Preserve D-03 and client-late escalation timing. Scheduler activation remains disabled until separate PO approval. Email is out of scope.
### F15 text/submission limits — PO approval (verbatim)

> "Claude, F15 PO APPROVED: Q1=A (Short: 150 chars, Long: 1,000 chars), Q2=A (256 KiB max submission). Implement live character counters and enforce UTF-8 safety limits server-side. Test actual payload sizes, Arabic/English/emoji, boundary cases, and maximum 20 questions/section and 60/form. Record decisions and continue implementation. Escalate only confirmed conflicts."

Architect mapping (not additional PO decisions): “chars” means Unicode code points, counted identically in browser and server with the shared pure helper; short text has a 150-code-point maximum and long text 1,000. Authors may choose a lower per-question `charLimit` (minimum 1), never a higher one; publication rejects higher values. A separate 4,096-byte UTF-8 per-answer safety cap applies. The 256 KiB submission cap is 262,144 bytes, measured as UTF-8 bytes of each answer value's JSON serialization, summed without question IDs, keys, envelope fields or transport framing. The approved 20 questions/section and 60/form limits remain in force. ZWJ sequences count as multiple Unicode code points.

## User Scenarios & Testing

### User Story 1 — Receive the selected intake after approval (Priority: P1)

As an approved client, I find my selected intake on login, so I can start onboarding without waiting for a manual form assignment.

**Why this priority**: REQ-P2-01 joins F12 approval to mandatory intake and is the start of Journey A's P2 slice.

**Independent Test**: Supply one synthetic committed approval fact and one authorized selected published intake version. Consume the fact twice and sign in as that client; one assignment appears with Basic/Training/Nutrition. No planner or portal is needed.

**Acceptance Scenarios**:

1. **Given** a selected eligible intake and a committed approval event, **When** P2 processes it, **Then** exactly one independent assignment snapshot is created and presented to that client on login.
2. **Given** a rejected or rolled-back F12 operation, **When** assignment processing runs, **Then** no approval-derived assignment is created.
3. **Given** a previously committed approval before P2 existed, **When** backfill runs, **Then** it has the same assignment/dedup guarantees as a new event.
4. **Given** missing selection or an unavailable template prerequisite, **When** consumption runs, **Then** no arbitrary form is selected and the fact remains recoverable; the fixed both-facts operation remains safe and the configured trigger governs presentation.

### User Story 2 — Complete and resume intake safely (Priority: P1)

As a client, I answer conditional questions in one Basic/Training/Nutrition intake, resume saved progress and submit only when all required applicable answers are complete.

**Why this priority**: Mandatory complete intake supplies reliable coaching information and starts the delivery clock.

**Independent Test**: Use a synthetic assignment with one conditional branch in each section. Save, navigate away, resume, deliberately conflict from another tab, and submit invalid then complete answers.

**Acceptance Scenarios**:

1. **Given** acknowledged saved answers, **When** I return on another authenticated device, **Then** the same accepted revision appears; unsaved or failed changes were never represented as saved.
2. **Given** two tabs loaded the same revision, **When** both save divergent changes, **Then** only one succeeds at that revision and the other sees a conflict without silent overwrite.
3. **Given** a required applicable answer is missing in any section, **When** I submit, **Then** submission fails with accessible section/question errors and no SLA starts.
4. **Given** a complete valid intake, **When** submission is accepted or its response is retried, **Then** one immutable submitted revision and one original submission instant result.
5. **Given** an empty or partial draft with valid supplied answers, **When** autosave runs, **Then** it succeeds; submission of that same incomplete draft is rejected.
6. **Given** backward review or a branch-changing answer, **When** the path recomputes, **Then** one applicable question remains presented at a time and acknowledged answers survive navigation/resume with accessible focus.

### User Story 3 — Maintain templates without rewriting history (Priority: P1)

As an authorized form author, I maintain versioned templates and conditional questions while preserving what every assigned client received and submitted.

**Why this priority**: Template changes must never change assigned obligations or historical health answers.

**Independent Test**: Under the F15-1 operation matrix, publish a workspace template as PO, WO and Trainer in separate authorized fixtures, create an assignment, then publish an edit and retire the original for future use. Compare original assignment and submission content before and after.

**Acceptance Scenarios**:

1. **Given** a published version used by an assignment, **When** an authorized author edits the template, **Then** a new version is produced and the assignment's questions, rules and requiredness remain unchanged.
2. **Given** an attempted rule cycle, executable script or rule set above approved bounds, **When** publication is attempted, **Then** it is rejected before clients can receive it.
3. **Given** Sales or a staff role outside its permitted scope bypasses the UI to create, publish or alter a template, **When** both authorization walls run, **Then** the action is denied.

### User Story 4 — See an accurate intake-based delivery deadline (Priority: P1)

As responsible staff, I see when the first workout/nutrition pair is due, calculated from the original complete intake submission using Cairo working days.

**Why this priority**: A reproducible deadline supports the approved delivery promise without activating subscriptions early.

**Independent Test**: Supply accepted submissions around Cairo 18:00, Thursday/Friday/Saturday, month/year boundaries and DST transitions. Calculate D-03 day five and the F15-2 late instant using `Africa/Cairo`; include a spring-forward fixture where local midnight is skipped.

**Acceptance Scenarios**:

1. **Given** submission Thursday before 18:00 Cairo, **When** five working days are counted, **Then** Thursday is day one, Friday is excluded and Tuesday is day five.
2. **Given** Thursday at or after 18:00, or any Friday submission, **When** counting starts, **Then** Saturday is day one and Wednesday is day five.
3. **Given** a submitted answer is later corrected, **When** its new revision is accepted, **Then** the original SLA start and deadline remain unchanged.
4. **Given** approval, a saved draft or an incomplete submission, **When** time passes, **Then** none starts this clock or activates the subscription.
5. **Given** the date after day five has a skipped 00:00 Cairo local time at spring-forward, **When** the deadline is calculated, **Then** the zone library stores the first valid instant of that same Cairo date; a delay is false just before it and true at/after it.

### User Story 5 - Receive a Trainer-late delivery alert (Priority: P2)

As responsible staff, I learn when the first workout/nutrition pair is late under the existing D-03 delivery deadline.

**Independent Test**: Use synthetic authoritative P4 delivery and Trainer facts around the D-03 deadline. Verify the existing F15 Q4 seven-day catch-up, deduplication, assigned-Trainer notification, reassignment behavior, and simultaneous PO+WO escalation after 24 hours unresolved. This Trainer-late schedule is distinct from client form-submission reminders.

**Acceptance Scenarios**:

1. **Given** authoritative facts show an undelivered first pair after D-03, **When** detection runs, **Then** preserve the existing Q4 Trainer-late alert sequence exactly.
2. **Given** the pair was delivered by its deadline, **When** detection runs late, **Then** it creates no false delay alert.
3. **Given** authoritative P4 delivery or Trainer facts are missing, **When** detection runs, **Then** no real-data late classification is produced; retain only a safe operational exception.

### User Story 6 — Protect private answers across roles and workspaces (Priority: P1)

As a client or staff member, I can access only the forms and health information my current identity, role and workspace authorize.

**Why this priority**: Intake contains sensitive health/nutrition information and tenancy is non-negotiable.

**Independent Test**: Use two workspaces, two clients and PO/WO/Trainer/Sales identities. Attempt reads, saves, submission, selection, authoring, background processing and replay at both authorization walls, including revoked membership and guessed IDs.

**Acceptance Scenarios**:

1. **Given** a client identity, **When** it requests another client's assignment even in the same workspace, **Then** it receives no answers, metadata or existence signal.
2. **Given** an authorized Trainer or WO, **When** it reads intake for a client in an authorized workspace, **Then** coaching access is permitted regardless of responsible-trainer assignment; another workspace is denied.
3. **Given** Sales, pending/rejected clients or anonymous callers, **When** they request protected intake content, **Then** access is denied without broadening F12's self-status permission.
4. **Given** the PO, **When** a real target workspace is selected, **Then** platform-wide oversight is allowed and sensitive access is audited without copying answers into the audit.
5. **Given** a staff or client answer read whose audit append fails, **When** the read is attempted, **Then** no answers are returned; direct table, embedding and unaudited RPC paths also return no answers.
6. **Given** a PO without membership and an approved client without staff role, **When** each uses its correct authorization path, **Then** real-workspace PO and own-assignment client access pass; nonexistent/foreign targets have the same generic denial shape.
7. **Given** unpublished global content or another workspace copy, **When** visibility/copy is attempted without eligibility, **Then** no global visibility grant permits its mutation or foreign answer access.
8. **Given** an authorized correction or a denied role/workspace/field operation, **When** the correction is submitted, **Then** an allowed change appends one immutable version and audit without changing the original deadline, while a denied change creates no revision and returns no answer content.

### User Story 7 - Meet each client form deadline (Priority: P1)

As a client, I can see the Cairo submission deadline for each assigned form and receive timely reminders if it becomes overdue.

**Independent Test**: Assign Mandatory Intake and other synthetic forms before and after Cairo midnight and across DST, month/year, and leap boundaries. Verify a 3-day Mandatory Intake deadline, configurable 1-14 day deadlines defaulting to 3, independent deadlines per recurring occurrence, Trainer alert at +24h, PO+WO alert at +48h, no-Trainer routing to PO+WO, and reassignment without a clock reset.

**Acceptance Scenarios**:

1. **Given** a Mandatory Intake is assigned on Cairo date D, **When** its deadline is calculated, **Then** the deadline is 23:59:59.999 Cairo on date D+3.
2. **Given** another form has a configured value from 1 through 14, **When** it is assigned, **Then** its deadline is at the end of that many following Cairo calendar dates; an unset value defaults to 3 and values 0 or 15 reject.
3. **Given** a recurring occurrence is assigned, **When** its deadline is calculated, **Then** it receives its own deadline from that occurrence assignment time.
4. **Given** a form remains unsubmitted after its deadline, **When** 24 elapsed hours pass, **Then** alert the assigned Trainer, or PO+WO if no Trainer is assigned; at +48h alert PO+WO.
5. **Given** Trainer responsibility changes, **When** pending alerts are delivered, **Then** transfer the Trainer alert without resetting its original clock and notify only currently authorized PO/WO recipients.

### Edge Cases

- Approval races with form selection, version publication, retirement or staff revocation; no stale capability check or mixed-workspace binding may create an assignment.
- Duplicate/out-of-order approval facts, failed assignment/audit writes and lost acknowledgements; successful assignments remain unique and failures are recoverable.
- A conditional answer changes so a previously required branch is hidden; hidden answers must not satisfy another requirement or bypass server validation. The S14 inventory is fixed by the canonical fixture; authored edits create new versions and remain Builder-editable.
- Empty or superficially renamed mandatory sections, all questions hidden, malformed choices, oversized text/payloads, cyclic dependencies and rule expansion attacks must not pass validation.
- Two devices save the same revision, an older response arrives after a newer one, or save races submission; accepted server revision ordering governs and submission cannot be overwritten by a late save.
- Network loss before acknowledgement, expired Auth and browser close do not claim a successful save; recoverable draft handling must not persist health data in logs or uncontrolled browser storage.
- Submission exactly at 18:00 Cairo, all Friday hours, Thursday cutoff, Cairo DST offset changes, leap dates and public holidays that remain working days under D-03.
- Pair delivery exactly at the F15-2 deadline boundary, delivery before a delayed detector, no responsible Trainer, multiple owner roles and membership revocation require deterministic routing and boundaries.
- Corrections and template retirement cannot erase prior submissions or restart the original delivery deadline. F15-7 and the operation-by-role-by-field matrix are approved; Q1 denies corrections after Closure/Refund/Deactivation. General assignment replacement is deferred.
- Very long authored Arabic/English text, mixed-direction numbers, keyboard-only branching and loss of focus when a conditional question disappears require Design Gate verification.

## Requirements

### Functional Requirements

- **FR-001**: REQ-P2-01 is carried verbatim: PO, WO, or an authorized Trainer selects the onboarding form; after client approval the selected form is assigned and presented on login according to its configured trigger. Your First Step is the default ordinary editable Forms template; preserve workspace authorization and invitation/approval flow. Deliver this through the Forms/Intake engine (P2), not as a partial engine inside F12.
- **FR-002**: One idempotent internal assignment operation MUST create an approval-triggered initial assignment only when both a committed F12 `registration.approved` v1 fact and an authorized eligible form selection exist for the same existing workspace/client/initial subscription. Invoke it when configuration/selection is recorded, when the approved client resolves self-intake and during bounded historical backfill/reconciliation. Selection may precede or follow approval; presentation occurs only when the configured trigger is met. Failed/rejected approvals create none. Successful consumption, assignment and audit MUST commit atomically. Dedup by event identity and independently enforce unique initial assignment on `(workspace_id, subscription_id)`; missing prerequisites remain recoverable without an arbitrary fallback.
- **FR-003**: Assignment configuration MUST support all approved audiences and triggers: all active workspace clients, new clients on joining/onboarding, searched one-or-many clients, and renewal-triggered delivery only when the renewed subscription actually starts (including F13 freeze-related start shifts, never early payment). Custom recurring schedules and manual control over audience, timing, recurrence and stop conditions are supported. Stop recurring deliveries while frozen or inactive. Automatically resume recurrence after a freeze without catch-up deliveries (F1). Each occurrence has its own assignment and client-submission deadline. One-time per-client assignment may be an initial slice. Every assignment binds an eligible published version and current authorization. PO/WO/Trainer may configure within authorized scope; Sales is excluded. No F12 selector/approval prerequisite. This requirement supersedes BRD-06 no-bulk wording for Forms and the earlier per-client-only restriction.
- **FR-004**: Published form versions MUST have stable question/section identities, typed answers, authored labels, requiredness, validation and declarative conditional rules. Published content is immutable; editing creates a new version. Distinguish platform-owned global published templates from workspace-owned copies: global visibility grants neither global mutation nor access to foreign workspace copies/answers. Validate eligibility of a global published version before copying into a workspace-bound assignment. PO/WO/Trainer workspace builder rights follow the approved F15-1 operation matrix recorded below; Sales is excluded. Your First Step is the ordinary editable default onboarding form; its initial questions may be starter content. Every form has separately authored Arabic and English versions.
- **FR-005**: Every assignment captures an immutable, workspace-owned snapshot of its selected version. Later template edits, publication, retirement or access changes do not alter assigned/submitted forms. Historical authorized reads are independent of templates, subject to RET-1..3 and the approved D1 deletion mechanism. Corrections append revisions; assignment replacement is deferred. D1 erasure is restricted to answer values whose questions are currently inapplicable under the authoritative answer state, across all versions and their answer-change and access-view audit rows, by automatic server-validated processing only. No person or service-role caller can directly trigger or perform deletion. Financial, authentication, authorization, security and unrelated audit records are excluded; the control record stores counts only and no IDs.
- **FR-006**: Your First Step is the ordinary editable default onboarding form in Forms. Previously supplied intake questions may be included as editable starter content, but are not a required, fixed, or immutable catalog. An authorized Workspace Owner may edit it, replace it, or select another onboarding form. Authors may add, remove, reorder, and revise questions subject to normal validation and authorization. Submission validates the applicable required answers authored for that version; there is no fixed-catalog or three-substantive-section completion requirement. Publishing creates an immutable version and assignments retain immutable snapshots. Audience, trigger, timing, recurrence and stopping conditions are configured per form under approved Q3=D.
- **FR-007**: Conditional progression is deterministic, declarative, typed, allow-listed and acyclic; no scripts or external calls. Enforce at most 20 questions per section and 60 per form. Short/long text limits are 150/1,000 Unicode code points; a per-question `charLimit` may be lower (minimum 1), never higher. ZWJ sequences count as multiple code points. Each text answer is limited to 4,096 UTF-8 bytes. Submission cap is 262,144 bytes summed across each answer value JSON serialization, excluding IDs, keys, envelope and transport. Retain maxConditions 400, maxConditionsPerQuestion 16, maxEvaluationSteps 4,000, maxDefinitionBytes 131,072, maxChoices 50. Reject over-bound values before evaluation. D1 erasure selects every answer version whose question is currently inapplicable; it also retries eligible values left by a legal hold or prior incomplete erasure.
- **FR-008**: Every save validates supplied answers, snapshot identity, applicability, types/choices and bounds server-side; partial drafts are allowed. Submission enforces applicable required answers authored for the selected form version; it does not require fixed sections or a fixed question inventory. Unknown IDs, wrong-snapshot answers and unsafe inputs fail safely. Shared validation is required on every server draft/submission path. Hidden answers cannot bypass requiredness. The D1 erasure selector accepts a server-validated branch fact and selects every answer from all versions whose question is currently inapplicable under authoritative answers. Previous answers may support evidence/validation but do not limit erasure to a before/after delta.
- **FR-009**: Autosave MUST distinguish unsaved, saving, acknowledged-saved, failed and conflict states. Only an acknowledged durable accepted revision may be called saved. Resume MUST restore accepted progress across navigation/devices; uncertain retries retain the same intent key. The architect MUST propose and review measured save timing/debounce/max-unsaved behavior before the UI ships; no product latency promise is invented. Draft retention follows F15-8/RET-1..3.
- **FR-010**: Draft writes MUST name assignment and expected current revision. Accepted writes advance authoritative server revision; stale competitors return conflict without overwrite. Last-write means last accepted server revision, never client clock or late arrival. No silent whole-form last-arrival overwrite or automatic merge is permitted; reload/reconcile then save against current revision. Late acknowledgements MUST NOT revert newer displayed state.
- **FR-011**: Save/submit retries MUST return the same outcome for the same authorized key/canonical intent without duplicate revision/submission/audit; changed intent under that key fails safely. Independently of operation keys, enforce one original accepted submission and SLA per assignment and initial onboarding obligation. When touching F12 records preserve client → subscription → obligations/ledger lock order; the plan MUST define a compatible order for P2 selection/assignment and authorization locks and recheck authorization after waits. Distinct-key assignment/submission races, save-versus-submit, selection/retirement/revocation races and audit-failure rollback MUST preserve these invariants.
- **FR-012**: Sensitive drafts/submissions/corrections MUST remain server-authorized and client-specific Forms data MUST be purged at 30 days from the authoritative relationship-end event (Closure/Refund/Deactivation). Retention applies to every recoverable copy, including backups. Purge drafts, answers, correction content and any attachments; retain reusable templates and only legally required minimal audit evidence. Immutable financial ledger events are not physically deleted. Technical and legal feasibility for the 30-day maximum, including backup/PITR treatment and legal exceptions, is a pre-production blocker for real client data, not local/CI synthetic work. PO-1 makes every successful refund a client deactivation and starts this clock at that authoritative deactivation fact/time.
- **FR-013**: A complete accepted submission atomically creates an immutable answer revision, original submission instant, audit and original D-03 Trainer delivery deadline. Invalid submissions create none. Client, Trainer, PO and WO may correct submitted answers while the relationship is active; all roles are denied after Closure, Refund or Deactivation (Q1). Corrections append immutable versions and audit; the original submission instant and Trainer delivery deadline never reset. See the [approved correction matrix](correction-matrix.md). The distinct client-submission deadline is calculated per assignment under D2/D3.
- **FR-014**: SLA start MUST be the first accepted complete submission of the selected/default onboarding form, targeting the first complete workout/nutrition pair when those authored questions apply. Signup, approval, assignment, draft save and partial completion MUST NOT start it. P2 MUST NOT activate subscriptions or create delivery/productivity facts.
- **FR-015**: D-03 day counting MUST be a pure tested function of submission instant in IANA `Africa/Cairo`, using local dates and zone rules, never a fixed UTC offset or five 24-hour durations. Every day except Friday is working; no other holidays are excluded. Before 18:00 on a working day counts it as day one; at/after 18:00 starts next working day; Friday starts Saturday. Store fixed rule identifier `cairo-d03-v1` with the frozen deadline facts. No holiday feed or runtime calendar-governance machinery is required.
- **FR-016**: Preserve original submission instant, Cairo start/date-five result, fixed rule identifier and immutable original delivery deadline. Delivery becomes late at 00:00 Cairo after the fifth working day (`>=` the threshold). Compute the first valid instant of the following `Africa/Cairo` calendar date using a zone library; if 00:00 is skipped at a spring-forward transition, use the first valid instant on that same Cairo date. Include DST fixtures, including spring-forward and overlap cases. A correction never recalculates this deadline.
- **FR-017**: Preserve existing D-03 Trainer-late alerts exactly under F15 Q4: seven-day catch-up, deduplication, initial alert to assigned Trainer, reassignment handling, then simultaneous PO+WO escalation after 24 hours unresolved. Separately, client-late alerts go to assigned Trainer at deadline+24h and PO+WO at deadline+48h. If no Trainer is assigned, alert PO+WO. Reassignment transfers the Trainer alert without resetting the clock. Deliver to whichever PO/WO remains authorized. Do not combine the alert clocks. In-app is always delivered; Telegram is an additional channel only for explicitly linked staff recipients. Email is forbidden.
- **FR-018**: Deduplicate each logical occurrence, stage, recipient and channel across retries/concurrent scans. Recheck authorization at enqueue, delivery and read. Client-late clocks use each occurrence's original deadline: Trainer +24h, PO+WO +48h; reassignment transfers the alert without resetting the clock. D-03 Trainer-late alerts retain existing Q4 rules exactly. Authoritative delivery timestamps and detector serialization prevent false Trainer-late alerts, retain genuine delay history and suppress obsolete actionable alerts after resolution. Alert rows store IDs only. In-app inbox access is recipient-only, audited and supports mark-read; inbox retention follows the source Forms retention and is purged within RET-3's 30-day maximum.
- **FR-034**: Every form assignment carries an independent client-submission deadline. Your First Step, the default onboarding form, uses assignment Cairo date as day 0 and ends at 23:59:59.999 Cairo on the third following Cairo date. Other forms use an integer setting from 1 through 14 Cairo calendar days, default 3. Each recurring occurrence gets its own assignment-time deadline. Use Africa/Cairo calendar rules, including DST gaps/folds and calendar boundaries; no fixed UTC offset or elapsed 24-hour arithmetic. This deadline is distinct from D-03 Trainer delivery.
- **FR-035**: Client-late alerts are separate from D-03 Trainer-late alerts. Notify assigned Trainer 24 elapsed hours after client-submission deadline and PO+WO 48 hours after that deadline. With no Trainer, notify PO+WO at the first alert time. Reassignment transfers the Trainer alert without resetting either clock. At delivery, notify whichever PO/WO remains authorized. Preserve D-03 Trainer-late rules exactly under F15 Q4.
- **FR-019**: No automatic strike, deduction, firing or compensation change is permitted. Keep safe evidence for human review without implementing P4 balanced assignment/activation. The alert scheduler MUST follow the approved owner-only `pg_cron` pattern in F11 migration `20261031130000_purge_scheduling_pg_cron.sql`: `SECURITY INVOKER`, empty `search_path`, explicit `current_user = 'postgres'` check, transaction advisory lock, restricted cron schema/table grants, owner-only activate/deactivate functions, and no activation call embedded in migration. The scheduler stays disabled until separate PO activation approval. Real-data alerts remain gated on authoritative P4 facts; production activation follows the existing pre-production gate.
- **FR-020**: Every tenant-owned copy, selection, assignment, answer revision, SLA, processing record and alert MUST carry workspace identity and same-workspace composite `(workspace_id, id)` relationships with enabled/forced RLS across reads, mutations, jobs and all access surfaces. Staff authorization requires current capability/membership except PO global authority over an explicitly joined existing `public.workspaces` row; `has_workspace_access` alone is insufficient because PO may pass for nonexistent UUIDs. Clients require signed self-association and approved state, not staff membership. Background operations use narrowly scoped internal authority. At both authorization walls foreign/nonexistent/unauthorized targets MUST have identical denial status/code/body shape apart from incidental request IDs, with no existence/replay/cache leakage.
- **FR-021**: Approved clients MUST have self-only form/draft/submission/correction access. Client operations may accept assignment identity but MUST NOT accept client/workspace target parameters; derive identity/scope from signed Auth association and verify ownership. Pending/rejected clients remain denied protected intake with valid sessions; F12 self-status is separate. WO/Trainer may read and correct intake for coaching within current authorized workspaces regardless of responsibility assignment, subject to the approved matrix; Sales has no health-answer, selector, builder or correction right.
- **FR-022**: Use actual SQL helpers `app_private.role_has_capability` and `app_private.has_workspace_access`, with parity against TypeScript `MATRIX`/`roleHasCapability` for known AND unknown capability strings in both directions. Add dedicated `assign_intake_form` for PO/WO/Trainer and deny Sales. Sequence the shared TypeScript and SQL matrix extension after F12's Sales `approve_registration` removal and F14's `manage_branding` change are integrated; rebuild from those latest definitions and preserve both changes. F15-3 is decided; role name/UI visibility alone grants nothing.
- **FR-023**: Health/fitness/nutrition answers/drafts are sensitive personal data. Require HTTPS and `Cache-Control: private, no-store` for answer-bearing reads/actions/RPC responses; no framework data cache, ISR or CDN answer caching. MVP MUST NOT store answers in localStorage, sessionStorage, IndexedDB or service workers and MUST exclude intake tables from Realtime publications. No service-role browser/application answer path is allowed; client paths use their session under RLS. Intake belongs within BR-01/BR-02 encrypted backup/restore gates. Provider at-rest encryption is UNVERIFIED in this repository; D-20 approves Frankfurt region only. Verify hosted at-rest protection before production; F15 MUST NOT add column-level encryption unless the PO adds that requirement.
- **FR-024**: Every staff AND client access to sensitive answers MUST append allow-listed IDs-only access evidence; audit failure MUST return no answers. No daily access-audit dedup or client exemption is allowed. Deny direct answer-table reads, embedding/PostgREST or RPC paths that bypass access audit; RLS alone does not audit reads. Privileged operations independently verify identity/scope/operation, use `search_path=''` and qualified objects, revoke default EXECUTE and grant narrowly. Template publication/selection/assignment/save/submission/correction/SLA/alert mutations MUST have append-only safe audit atomically with mutation; successful mutation replays do not duplicate mutation audit. No answer/label/authored text, identity PII, raw arguments, token or free text belongs in audit. F15 retention keeps only legally required minimal Forms audit evidence; global audit retention ND-F5-1 remains separate and open.
- **FR-025**: Logs/errors/telemetry/jobs/traces MUST exclude answers, identity PII, health text, credentials and raw request bodies. Validate before writes and map raw DB/constraint/provider errors to allow-listed safe codes; raw errors MUST reach neither clients nor logs because constraints may echo values. P2 background failures MUST store only allow-listed error codes in fields consumed by existing dead-job audit, including `last_error`; F11's existing job audit copies that field. Seed distinctive sensitive values through failures and verify job rows/audit and each enabled log layer.
- **FR-026**: Client intake MUST present one applicable question at a time (PRD-03), support backward review and recompute remaining progression after changes without losing acknowledged answers. Use existing DESIGN.md/P0 components and semantic tokens, AR-first RTL/EN LTR, keyboard access, focus/error/save/conflict announcements and responsive light/dark states. Every form has separate Arabic and English authored versions; do not machine-translate. For Mandatory Intake N12, visual body-fat reference image cards supersede the older numeric-only client-input direction; the selected percentage remains visible to authorized Trainers. Image cards are selectable accessible controls, with the approved estimate disclaimer. Single-question path, branch disappearance, resume and backward focus require Design Gate review.
- **FR-027**: Consume F14's authorized published workspace brand data/tokens when available with neutral/default fallback. Resolve authorized scope per request without shared actor/workspace cache; discard late switch responses, preserve semantic tokens and verify actual surface contrast. Branding cannot alter answers/snapshots/authorization. F14-8 is a branding contract, not P4 portal implementation.
- **FR-028**: Navigation is already decided by FINAL F12-6/PA-F12-6. Register a real authorized intake destination in F12's server allowlist once it exists; retain bounded automatic redirect following detected pending-to-approved transition plus Manual Refresh/navigation fallback. Direct already-approved visits follow that reviewed route contract. Never guess a route, redirect to staff pages or imply approval equals activation/assignment success. Only concrete missing layouts/Design System decisions require Design Gate options and PO review; do not reopen navigation policy.
- **FR-029**: Every builder/version list, selector, conditional single-question intake, draft/conflict/submission/correction history, staff intake/SLA and alert surface MUST pass the Frontend Design Gate. Retain real screenshots for AR-RTL/EN-LTR × light/dark × mobile 390/desktop 1440, required interaction/loading/empty/error/success/disabled/pending states, keyboard/screen-reader/axe and contrast evidence. Missing DS decisions MUST be escalated with concrete options rather than invented.
- **FR-030**: Workspace form authorship MUST allow PO, WO and Trainer to create, copy, edit, publish and retire workspace forms; Sales is denied. WO/Trainer actions require current membership in the selected workspace; PO platform authority requires an explicitly existing workspace for workspace-scoped operations. Global templates remain PO-governed; eligible published global content may be copied into a workspace-local form, never mutated by WO/Trainer. The operation matrix appears below.
- **FR-031**: A form assignment policy MUST represent Q3 triggers, audiences, schedules and stop conditions: all active clients in the workspace; new clients on joining/onboarding; specific clients selected through search, singly or in multiples; custom recurrence; renewal delivery only at actual renewed-subscription service start including F13 freeze shifts, never early payment; and stop recurring delivery while frozen or inactive. Provide manual control over audience, timing, recurrence and stopping conditions. Consume the F13 entitlement projection for actual service start (including freeze shifts) and frozen/inactive state. Assignment instances MUST be deduplicated by configured form/client/occurrence and retain independent immutable snapshots. One-time specific-client delivery may precede recurring slices. F1 requires recurrence to resume after freeze without catch-up.
- **FR-032**: Forms do not accept or store attachments in the MVP; web photo uploads remain out of scope. No Forms attachment storage owner or upload authorization path exists while that remains true. If a future approved form supports attachments, it MUST define storage owner, scoped authorization, metadata/content access auditing and deletion/purge path before accepting files; RET-2 then requires purge at relationship-end + 30 days across recoverable copies. Attachment policy status is recorded in OPEN items. D1 is limited to answer values and their answer-change and access-view audit rows and does not amend RET-1..3.
- **FR-033**: The F15-owned Forms purge consumer MUST use the authoritative Closure/Refund/Deactivation fact and timestamp, purge drafts, answers, corrections and any supported attachment objects by the end of the 30-day maximum, and cover backups and other recoverable copies. Its scheduled invocation MUST follow the approved owner-only pg_cron control pattern; the existing F11 signup-attempt purge does not purge Forms data. Retain reusable templates and only legally required minimal audit evidence; every purge action MUST be idempotent and must not physically delete immutable financial ledger events. Technical/legal feasibility and any applicable exception require documented pre-production review.
- **FR-036**: The Form Builder MUST provide editable Draft → Preview → Publish with immutable published versions; add/remove/reorder sections and questions; edit AR/EN labels, options, answer types, rules, editable food lists and visual assets. It MUST work for Mandatory Intake too; no hardcoded question/form structure or permanent mandatory-form lock is allowed. Existing authorization, approved caps and workspace/global ownership rules apply.
- **FR-037**: The type system MUST support slider, visual image-card single choice, multi-select chips, number+unit, read-only profile-bound text/number, computed age, and derived option sets in addition to existing types. The rule editor MUST express nested conditions, dynamic options and budget-derived option sets within existing condition/evaluation/definition/choice bounds. Enforce all existing approved limits unchanged: 20 questions/section, 60/form, 150/1,000 Unicode code points, 4 KiB UTF-8 per text answer and 256 KiB answer-value JSON per submission.
- **FR-038**: The F15 program MUST extend the F11 invitation-only signup with DOB, three-component name validation, unique normalized username, optional Telegram and consent acceptance after Nutrition at the Terms Card. Preserve F11 Auth/link transactionality, no-session completion, generic privacy responses, global email/phone uniqueness and zero client access until F12 approval. The full field and receipt contract is `contracts/signup-extension.md`.
- **FR-039**: After F12 approval, the client journey MUST be Basic → Training → Nutrition → Terms Card → new LIFTER Welcome page. No health data is requested before approval. At the post-Nutrition Terms Card, record required unchecked T&C consent with policy version and server timestamp plus separate optional unchecked marketing consent. Signup creates the pending account without T&C consent. Intake is incomplete until T&C acceptance. Terms copy remains DRAFT until PO approval. Public marketing Landing is deferred. Use existing premium card/checkbox components; N11 motion is 150-250ms with prefers-reduced-motion.

## S14 Mandatory Intake

Binding decisions: D-S14-1 through D-S14-5 and session-14 PO decisions (2026-10-30), the canonical source `C:/Users/NEW LAP/.lifter/briefs/s14-po-intake-copy-2026-10-30.md`, and [`fixtures/mandatory-intake-copy-ar.md`](fixtures/mandatory-intake-copy-ar.md). The fixture's section body was extracted byte-for-byte from the canonical source; no Arabic UI text is retyped in this specification. Treat fixture bytes as the source of truth. The intake is assigned only after F12 approval; pending clients have no client Forms access and no health data is requested before approval.

### Stable inventory and behavior

The S14 starter material lists 26 parent IDs; IDs remain stable for questions retained across versions, but no form must keep every listed question. Your First Step may start with this material as editable content; authors may remove or replace questions and sections. P1 adds sex as B06, preserving existing IDs; its draft copy is a non-canonical addendum pending PO approval. Child IDs count as questions for the approved 20-per-section / 60-per-form limits. Labels and choice copy resolve through the canonical fixture by section/ordinal; child copy is referenced by its fixture line. No question, option, or food label may be fabricated from this table. Requiredness is authored in the version; children are required only when their branch is applicable. Exact counts use parents plus children, so the configured form remains below approved caps.

| Stable ID | Section / copy locator | Answer shape | Units/options and conditional or computed rules |
| --- | --- | --- | --- |
| B01 | Basic 1 | Read-only profile-bound text | Sign-up full name; never editable in intake. |
| B02 | Basic 2 | Read-only computed number | Age from registered DOB; calculate against Africa/Cairo calendar date. |
| B03 | Basic 3 | Yes/No radio cards | Yes reveals B03.details long text; exact child label in fixture. |
| B03.details | Basic 3 child | Long text | Applicable only when B03=Yes. |
| B04 | Basic 4 | Number + unit | kg. |
| B05 | Basic 5 | Short text | Occupation only; must not solicit daily activity. |
| B06 | Basic 6 | Single-choice cards | Sex selector; draft copy pending PO approval; required to select the N12 reference series. Stored as personal data with the intake profile. |
| T01 | Training 1 | Short text | D-S14-4 supersedes the canonical brief's older card proposal: no options/cards and no conditional “other” child. |
| T02 | Training 2 | Yes/No radio cards | Yes reveals T02.details long text. |
| T02.details | Training 2 child | Long text | Applicable only when T02=Yes. |
| T03 | Training 3 | Single choice | Integer options 1 through 7 days. |
| T04 | Training 4 | Two selectable cards | The two approved fixture options; exactly one selected. |
| T05 | Training 5 | Yes/No | Yes reveals T05.sport short text. |
| T05.sport | Training 5 child | Short text | Applicable only when T05=Yes. |
| T06 | Training 6 | Long textarea | Free text, subject to approved long-text limits. |
| T07 | Training 7 | Two separate short-text answers | T07.liked and T07.disliked, each independently editable and validated. |
| T07.liked | Training 7 child | Short text | Preferred exercises. |
| T07.disliked | Training 7 child | Short text | Disliked exercises. |
| T08 | Training 8 | Yes/No | Yes reveals T08.system short text. |
| T08.system | Training 8 child | Short text | Applicable only when T08=Yes. |
| N01 | Nutrition 1 | Five premium single-select cards | Each card has the exact Arabic title and description in the fixture; English EN-mode copy is in the separate translation table below. |
| N02 | Nutrition 2 | Number + unit | cm. |
| N03 | Nutrition 3 | Single-choice radio cards | Four approved daily-activity options from the fixture; this means activity outside exercise. |
| N04 | Nutrition 4 | Yes/No | Yes reveals N04.details textarea. |
| N04.details | Nutrition 4 child | Textarea | Applicable only when N04=Yes. |
| N05 | Nutrition 5 | Yes/No | Nested exclusive branches: Yes reveals N05.medications textarea; No reveals N05.supplement_suggestion Yes/No. Never automatically prescribe supplements. |
| N05.medications | Nutrition 5 Yes child | Textarea | Applicable only when N05=Yes. |
| N05.supplement_suggestion | Nutrition 5 No child | Yes/No | Applicable only when N05=No. |
| N06 | Nutrition 6 | Long textarea | Usual eating day. |
| N07 | Nutrition 7 | Single-choice cards | Options are «وجبتين» / «3 وجبات» / «4 وجبات» / «5 وجبات», the PO-approved maximum-five meal choices. This is an explicit deviation from unchanged canonical copy; no 6+ option is supported. |
| N07.training_timing | Nutrition 7 derived child | Derived single choice | After meal count is known, generate meal-number choices 1..N, where N is selected meal count (2 to 5). Also include «قبل أول وجبة» and «معنديش ميعاد ثابت». If meal count changes, replace stale choices and clear invalid prior selection; version/snapshot history remains immutable. |
| N08 | Nutrition 8 | Three single-select budget cards | Selected budget derives the editable multi-select list N08.foods from the matching fixture list. |
| N08.foods | Nutrition 8 derived child | Editable multi-select chips | Only options for selected budget; values and ordering are versioned Builder data and are not hardcoded in client UI. |
| N09 | Nutrition 9 | Two separate short-text answers | N09.liked and N09.disliked. |
| N09.liked | Nutrition 9 child | Short text | Preferred foods. |
| N09.disliked | Nutrition 9 child | Short text | Disliked foods. |
| N10 | Nutrition 10 | Three single-choice cards | Exact options in fixture. |
| N11 | Nutrition 11 | Interactive integer slider | Range 0–10, step 1; live `X/10`; endpoint and midpoint labels exactly as fixture; feedback ranges 0–2, 3–4, 5–6, 7–8 and 9–10, with labels in fixture. Keyboard, screen-reader and mobile touch support. Smooth score feedback is requested; exact animation behavior must respect reduced-motion and must not invent timing/easing beyond DESIGN.md. |
| N12 | Nutrition 12, last | Visual single-select image cards | Use the source-verified catalog in `tests/fixtures/forms/body-fat-derivative-manifest.json` to resolve each approved percentage to optimized WebP/AVIF derivatives in `public/images/body-fat/`, generated from the read-only YBS source by the reproducible media task. Derivatives target <=150 KB and are capped at 768 source pixels wide. Render image content at no more than 384 CSS pixels wide, keeping assets within 2x display width. Male selects the standard `male` series; female selects `female`; `male-cinematic` is unused. Original images are never committed. Show estimated percentage on each card, and the canonical fixture disclaimer. MUST remain last in Nutrition. Trainers can read the selected numeric percentage. |

### EN translation — PO review

These English translations are for EN-mode only and do not replace or alter the Arabic fixture. Each is pending PO review before publication.

| Stable ID | EN-mode translation |
| --- | --- |
| B01 | Full name |
| B02 | Age |
| B03 | Do you have any chronic conditions? |
| B03.details | Please describe your chronic conditions. |
| B04 | What is your current weight? |
| B05 | What is your occupation? |
| B06 | Sex (draft; pending PO approval) |
| T01 | What is your near-term goal? |
| T02 | Do you have any injuries? |
| T02.details | Tell us about the injury. |
| T03 | How many days a week would you like to train? |
| T04 | How much time can you set aside for a workout? |
| T05 | Do you play a sport in addition to going to the gym? |
| T05.sport | Which sport do you play? |
| T06 | What do you consider your weak points? |
| T07 | Which exercises do you like most and dislike most? |
| T07.liked | Exercises you like |
| T07.disliked | Exercises you dislike |
| T08 | Would you like to follow a particular training split? |
| T08.system | What training system would you like to follow? |
| N01 | What is your goal for your nutrition plan? |
| N01.cut.title | Fat loss |
| N01.cut | Fat loss at a moderate rate while preserving as much muscle mass as possible. |
| N01.cut_fast.title | Fast fat loss |
| N01.cut_fast | Faster fat loss, with a higher chance of muscle loss or reduced performance. |
| N01.bulk.title | Muscle gain |
| N01.bulk | Increase muscle mass while limiting fat gain as much as possible. |
| N01.bulk_fast.title | Fast muscle gain |
| N01.bulk_fast | Increase body weight and muscle mass faster, with a higher chance of gaining fat. |
| N01.recomposition.title | Body recomposition |
| N01.recomposition | Increase muscle mass while reducing body-fat percentage at the same time. |
| N02 | What is your height in centimeters? |
| N03 | How active are you and how much do you move during the day? |
| N04 | Are you allergic to any foods? |
| N04.details | List the foods you are allergic to. |
| N05 | Are you currently taking any medications or supplements? |
| N05.medications | List the medications and supplements you take. |
| N05.supplement_suggestion | Would you like us to suggest dietary supplements? |
| N06 | Tell us what a typical day of eating looks like for you. |
| N07 | How many meals would you like to eat each day? (maximum: 5; PO-approved departure from canonical source) |
| N07.training_timing | Nutrition 7 derived child | Derived single choice | After meal count is known, generate meal-number choices 1..N, where N is selected meal count (2 to 5). Also include «قبل أول وجبة» and «معنديش ميعاد ثابت». If meal count changes, replace stale choices and clear invalid prior selection; version/snapshot history remains immutable. |
| N08 | What is your food budget like? |
| N08.foods | Choose foods that fit your budget. |
| N09 | Which foods do you like most and dislike most? |
| N09.liked | Foods you like |
| N09.disliked | Foods you dislike |
| N10 | Would you rather weigh food before or after cooking? |
| N11 | How hungry do you feel, from 0 to 10? |
| N11.feedback.0_2 | Very little hunger |
| N11.feedback.3_4 | Mild hunger |
| N11.feedback.5_6 | Moderate hunger |
| N11.feedback.7_8 | High hunger |
| N11.feedback.9_10 | Very strong hunger |
| N12 | Choose the body-fat reference that most closely resembles your body shape. |
| N12.disclaimer | This percentage is an estimate and is not a substitute for measuring body-fat percentage. |

The five N01 titles/descriptions, T04/N03/N07/N08/N10 choices, N11 endpoint labels and N12 card labels must also be translated into EN-mode as separate authored option records. B06 draft labels: «النوع» / «ذكر» / «أنثى», and EN "Sex" / "Male" / "Female"; pending PO approval. Those translations require PO review and must never be inferred at runtime. Do not add missing goal options or body-fat percentages.

#### EN option translations — PO review

| Source option locator | EN-mode option |
| --- | --- |
| N03.1 | Sitting for most of the day |
| N03.2 | Light movement and walking |
| N03.3 | Moderate movement and walking |
| N03.4 | A lot of movement or physically demanding work |
| T04.less_than_90 | Less than an hour and a half |
| T04.at_least_90 | An hour and a half or more |
| N07.2 | Two meals |
| N07.3 | 3 meals |
| N07.4 | 4 meals |
| N07.5 | 5 meals |
| N07.before_first | Before the first meal |
| N07.no_fixed_time | I don't have a fixed time |
| N08.low | Low budget |
| N08.medium | Medium budget |
| N08.high | High budget |
| N08.low.foods | Cottage cheese / plant protein / eggs / baladi bread |
| N08.medium.foods | Eggs / chicken / meat / toast / fish |
| N08.high.foods | Salmon / smoked turkey / steak / ribeye |
| N10.before | Before cooking |
| N10.after | After cooking |
| N10.no_preference | No preference |
| N11.label.0 | I hardly ever feel hungry |
| N11.label.5 | Moderate hunger |
| N11.label.10 | Very strong hunger |

The T04, N08 budget and food-chip, and N12 percentage-specific option records are authored from their exact fixture values; do not paraphrase or manufacture missing card choices. All EN translations in this table remain pending PO review.

### Signup extension, approval gate, consent and flow

On the F15 program, extend the existing F11 signup surface with required date of birth and unique username; preserve required phone, email and password. Full name must contain at least three non-empty whitespace-separated components after trimming. DOB must be a valid past calendar date; reject impossible/future values and compute age using Africa/Cairo's current date. Username normalization is Unicode NFKC followed by lowercase; enforce uniqueness under workspace-scoped account rules and reject a centrally maintained reserved-name list. Telegram username is optional and syntax-checked only if supplied. Do not show red required asterisks. T&C consent is not part of signup; it is captured at the post-Nutrition Terms Card; acceptance checkbox starts unchecked and is mandatory, while marketing consent is a separate optional unchecked choice. Preserve F11 token single-use, atomic identity/link consumption, no-session signup, pending-approval and generic-duplicate invariants. Existing client email/phone global uniqueness remains unchanged.

No health data is requested or accessible before approval. Journey: invitation-only `/register/[token]` → Sign Up → Pending/Approved status → after approval, Basic → Training → Nutrition → Terms Card → new LIFTER Welcome page. The invitation contract and F11 pending-approval denial remain unchanged. Public marketing Landing is deferred and out of scope. Approval is not assignment or activation. No T&C consent receipt is recorded during signup; the post-Nutrition Terms Card is the sole required T&C acceptance point. Intake remains incomplete until acceptance.

Build a new premium LIFTER Terms & Conditions card using existing premium card/checkbox components; do not copy the YBS T&C card or design. Consent is unchecked by default, records the exact published policy version and acceptance timestamp, and presents separate optional marketing consent. Draft Egyptian Arabic and English text strictly from existing approved privacy, retention/purge, health-data, refund/freeze and account policies; citations and a proposed text are in [`reports/S14-terms-draft.md`](reports/S14-terms-draft.md). The Terms copy is DRAFT and PO approval is required before ship. S17 supersedes the historical separate health-data notice: do not render a standalone notice or acknowledgment. Use minimal contextual health-data guidance only where genuinely useful; the PO-approved contextual label may be used in that context.

### S14 acceptance and fixture verification plan

The canonical Arabic extract is `fixtures/mandatory-intake-copy-ar.md`; it remains unchanged. PO-approved deviations and non-canonical draft strings are recorded separately in `fixtures/s14-po-decisions.json`. Before any implementation, a fixture generator/test must extract bytes from the canonical file starting at `SECTION 01` and ending immediately before the `FORM BUILDER` heading, excluding exactly the single Markdown separator newline immediately preceding that heading. Compare the resulting byte buffer to the committed fixture; fail on any difference, normalization, encoding change, or missing marker. No copy byte is trimmed or normalized. Then parse/validate that all 26 stable parent IDs and child locators resolve, question order is Basic→Training→Nutrition, N12 is last, and branch predicates/derived values match this table. Add fixtures for N5 both nested outcomes; N7 meals 2, 3, 4, 5 only, generated after-meal choices 1..N and fixed timing choices; N8 budget lists/editability; N11 all values and feedback-band boundaries; branch answer changes clearing inapplicable answers under D1; and snapshot immutability. CI must run this byte-equality check without opening or requiring access to the external source path by storing a canonical-source checksum/extraction fixture in the task's controlled test input. Any changed Arabic copy requires an explicit PO-approved canonical update and regenerated fixture.

### S14 PO approval gates

- Sex question labels, T&C wording, and English translations require their separate PO approvals. S17 supersedes a standalone health-data notice; minimal contextual guidance may use the PO-approved phrase only where useful and creates no acknowledgment or consent record.
- Architect defaults: Terms Card uses existing premium card/checkbox components; N11 motion uses 150-250ms with `prefers-reduced-motion`; reserved usernames cover platform/system/role words and workspace identifiers. Copy approval remains required.
- The canonical intake includes no approved near-term goal options. T01 remains free short text under D-S14-4. The P4 maximum-five-meals rule supersedes only canonical N7 copy.

### Key Entities (logical)

- **Form template and published version**: Governed reusable form identity, scope, immutable authored question/section definitions and bounded conditional/validation rules; draft authoring and publication history are distinct.
- **Intake selection/assignment policy**: Authorized per-form trigger, audience, recurrence and eligible published version, with selecting/configuring actor and time. Selection may precede or follow approval; the configured trigger controls assignment/presentation. Q3 trigger uses F13 entitlement projection for actual service start, including freeze shifts, plus frozen/inactive state.
- **Approval fact and consumption record**: F12 immutable event identity/workspace/client/subscription/version/time, plus P2 private processing/dedup state; the event itself has no form selection or PII.
- **Form assignment snapshot**: Workspace/client/subscription-bound independent copy of versioned form content and rules, approval origin and assignment time, readable independently of later template changes.
- **Answer draft and revisions**: Sensitive answers keyed to snapshot question IDs, authoritative draft revision and acknowledged save state; accepted submissions/corrections retain immutable answer revisions and original submission identity.
- **Delivery SLA obligation**: Original complete submission, fixed Cairo rule identifier, day-five date and F15-2 first-valid-instant deadline, linked to authoritative first-pair delivery/responsibility facts supplied by P4.
- **Delay occurrence and recipient alert**: One logical lateness occurrence and deduplicated authorized in-app recipient deliveries; no email/SMS or discipline entity is created.
- **Audit event**: Append-only safe action/access evidence, detached from answer content and governed by separately approved retention.

## Success Criteria

### Measurable Outcomes

Unconditional invariants can be verified with synthetic fixtures now. Threshold/policy-dependent outcomes below are conditionally measurable and cannot pass until their named decisions, reviewed numeric bounds and fixtures are attached.

- **SC-001**: For each approval/selection ordering and historical backfill/concurrent distinct-key retry, exactly one initial assignment exists only after both prerequisites; zero failed/rejected approvals assign.
- **SC-002**: Template publication/edit/retirement changes zero bytes of existing assignment snapshots or submitted revisions, subject to approved retention treatment.
- **SC-003**: Every empty/partial draft with valid supplied answers saves; zero incomplete submissions pass.
- **SC-004**: Response-loss, navigation, two-tab/device and save/submit/distinct-key races yield zero silent stale overwrite, duplicate original submission or duplicate SLA.
- **SC-005**: All pure D-03 fixtures produce expected start/day-five dates, including exact 18:00, Friday, public holidays, month/year and Cairo DST transitions; original facts never change on correction.
- **SC-006**: 100% of exact-boundary and Cairo DST fixtures yield the first valid instant of the date after D-03 day five; a skipped local midnight uses the first valid instant on that date, and equality with the threshold is late.
- **SC-007**: Real-data delay classification/alerts remain disabled until authoritative P4 delivery and responsible-Trainer coverage exists. Missing evidence produces zero late classifications; synthetic on-time/detector races produce zero false alerts. Initial alert is to assigned Trainer, with seven-day catch-up, deduplication and reassignment handling; unresolved cases escalate simultaneously to both Platform Owner and Workspace Owner after 24 hours, with zero duplicates.
- **SC-008**: All foreign/nonexistent target denials have identical status/code/body shape at both walls apart from incidental request IDs, and disclose zero answers/existence metadata; approved clients without staff membership and PO without membership over real workspaces pass their proper access cases.
- **SC-009**: Every executable/cyclic rule or client-tampered applicability payload fails.
- **SC-010**: Every staff/client answer access has IDs-only audit evidence; audit-failure fixtures return zero answers. Direct table/embedding/RPC bypasses return zero answers; successful mutation replay creates zero duplicate mutation audits.
- **SC-011**: Seeded sensitive values occur zero times in enabled logs/errors/audit/jobs, including dead-job `last_error`; answer responses are private/no-store, and browser persistence/Realtime/service-role answer paths expose zero answers.
- **SC-012**: Every P2 UI surface passes all eight locale/theme/device combinations and keyboard/screen-reader/contrast/accessibility review with retained evidence and zero unresolved Design Gate failures. Correction UI follows the approved matrix; all roles are denied after relationship end (Q1).

- **SC-013 (editable onboarding starter):** Your First Step is available by default in Forms, can be edited/replaced or superseded by a selected onboarding form by an authorized Workspace Owner, and may contain the previously supplied questions as editable starter content. Tests prove there is no fixed-catalog requirement and that published versions/assignment snapshots remain immutable.
- **SC-014 (gated: engineering timing and retention)**: Every acknowledged accepted draft revision is recoverable while the relationship is active; after Closure/Refund/Deactivation all client-specific Forms data is unrecoverable from every live or backup copy by day 30, subject only to a reviewed legal exception that blocks production until resolved.
- **SC-015 (gated: P4)**: Each genuine delay with an assigned Trainer produces the Q4 initial alert to that Trainer; unresolved cases escalate simultaneously to WO+PO after 24 hours, with zero duplicate logical alerts across retries/concurrent scans.
- **SC-016 (Q5 approved limits)**: Every section accepts at most 20 questions and every form at most 60; 21 in a section or 61 in a form is rejected before evaluation. Short/long text accepts at most 150/1,000 Unicode code points (or the lower published per-question `charLimit`), with a separate 4,096 UTF-8-byte per-answer cap. Submission answer-value JSON bytes, excluding keys/envelope/transport framing, total at most 262,144. English, Arabic with diacritics, emoji/ZWJ and mixed-direction boundaries are covered; a valid 60-answer worst case of 1,000 four-byte code points per answer passes. Character counters use the same pure code-point helper as server validation.
- **SC-017 (F15-1/F15-3)**: PO/WO/Trainer can perform the approved workspace builder operations only within authorized scope; Sales is denied; `assign_intake_form` returns identical allow/deny results in TypeScript and SQL for every role and known/unknown capability string.
- **SC-018 (F15-6/F1)**: Assignment configuration covers every decided trigger/audience/recurrence class; recurring forms resume after freeze without catch-up, and each occurrence receives a distinct assignment and deadline.
- **SC-019 (F15-7/Q1/D1)**: Each correction by PO, WO, Trainer or Client, including medical fields and attachments wherever attachments exist, appends a new immutable version and audit under tenant isolation and authorized client scope while the client relationship is active; after Closure, Refund or Deactivation every role is denied. Each denied role/scope operation returns no data/change, client reads/corrections remain self-only, and no correction changes the original deadline. D1 automatic erasure selects every answer value whose question is currently inapplicable from all versions and its answer-change/access-view audit rows, defers with alert on legal hold, fails closed, is tenant-isolated/idempotent and produces a counts-only control record with no IDs. The loss of who-viewed evidence for that answer is an accepted recorded consequence under D-29.
- **SC-020 (F15-8/RET-1..3/PO-1)**: Synthetic lifecycle fixtures prove the 30-day clock starts from authoritative Closure/Refund/Deactivation; all Forms drafts, answers, correction content and supported attachment objects are purged from every recoverable copy by day 30, templates remain, and financial ledger events remain immutable.
- **SC-021 (F15-4/S14)**: Every form has independently authored AR and EN versions. The S14 Arabic extract passes byte-equality against the canonical source fixture; EN-mode translations remain a separately reviewed authored table.
- **SC-022 (D2/D3/D4):** Your First Step, the default onboarding form, is due at 23:59:59.999 Cairo on assignment date +3 Cairo calendar dates (assignment date = day 0); other forms accept configured 1-14 day values and default to 3; recurring assignments get separate deadlines. Client-late alerts fire at +24h and +48h with reassignment preserving the original clock, while D-03 Trainer-late behavior remains unchanged.

## Assumptions and readiness

- F11 identity binding and F12 private approval facts/self-status remain dependencies, not claims of implemented/merged interfaces. Production delay behavior additionally requires authoritative P4 delivery/responsible-Trainer facts; synthetic work is allowed.
- F15-1..8, RET-1..3, PO-1, D-29 and the correction matrix are binding and incorporated below. S14 supplies the Mandatory Intake inventory and signup extension; all published versions remain editable and immutable after publication. Autosave timing and finite execution limits remain architect engineering items for measured review.
- Spec Debate is complete with the [architect judgment](debate.md); this revision does not approve implementation. This S14 amendment updates plan/tasks/contracts and creates no application code, migration or database change.
- Real client data remains blocked until the 30-day all-copy retention feasibility/legal review and applicable production readiness gates are closed. These gates do not block local/CI synthetic work. This revision updates the F15 specification, plan, tasks, contracts and correction matrix.

## PO Decisions and traceability

### D-S14-1..5 — Historical S14 decisions and S17 supersession

- **D-S14-1**: Use YBS `public/body-fat` as read-only source for optimized derivatives only; record original source path and SHA-256. Derivatives belong under `public/images/body-fat/`; originals are never committed. Visual image cards are approved for client N12; authorized Trainers still see the numeric percentage. Male selects standard `male`, female selects `female`, and `male-cinematic` is unused. Do not copy YBS T&C material or design.
- **D-S14-2/P2/P3** (historical; standalone health notice superseded by S17): Terms consent occurs only at the post-Nutrition Terms Card using an unchecked required box and records policy version/server timestamp; marketing consent is separate and optional. Signup creates the pending account without T&C consent. Do not display a standalone health-data notice. Use minimal contextual health-data guidance only where genuinely useful, optionally labeled «عن بياناتك الصحية» / “About your health data”; it adds no acknowledgment or consent record. Terms copy and separately unapproved sex/EN copy remain subject to their existing PO approvals; no standalone health-notice copy approval is a ship prerequisite.
- **D-S14-3**: Invitation-only `/register/[token]` → Sign Up → Pending/Approved → after approval Basic → Training → Nutrition → Terms Card → new LIFTER Welcome page. Do not collect health data before approval. Public marketing Landing is deferred.
- **D-S14-4**: Training T01 is a short-text response with no options/cards. This newer decision supersedes the canonical source's earlier card/“other” proposal.
- **D-S14-5**: Validate three non-empty whitespace-separated name components; valid past DOB and age on Africa/Cairo date; NFKC + lowercase username normalization, workspace-scoped uniqueness and a reserved-name list; optional Telegram syntax-check only when supplied; no red asterisks.

The canonical Arabic source remains byte-identical and unchanged. P1 sex copy is draft/non-canonical; P4 N7 is an explicit PO-approved deviation documented in `fixtures/s14-po-decisions.json`. The updated catalog has 26 parent questions. Earlier F11 transactional signup, invitation-token, pending-approval, privacy and global email/phone uniqueness invariants remain in force.

### F15 Q1-Q5 + Stack C decisions (2026-10-30, prior PO decision record; superseded entries identified below)

F15 Q1 — A: No corrections allowed by any role after the client relationship ends.

F15 Q2 — D: Remove irrelevant branching answers from the form, audit and history. Check for conflicts with immutable history requirements. Do not override my decision; return any conflict for PO resolution.

F15 Q3 — D: Flexible Form Automation:
* All active clients within the workspace.
* New clients automatically on joining/onboarding.
* Specific clients selected through search (single or multiple).
* Custom recurring schedules, e.g. weekly check-ins.
* Renewal-triggered delivery only when the renewed subscription actually starts, including freeze-related delays, never on early payment.
* Stop recurring deliveries when the client's subscription becomes inactive or frozen.
* Manual control over audience, timing, recurrence and stopping conditions.

F15 Q4 — Modified B: Initial alert to assigned Trainer. Seven-day catch-up, deduplication and reassignment handling. After 24 hours unresolved, escalate simultaneously to BOTH Platform Owner and Workspace Owner.

Q5 (follow-up, controls) — “F15 Q5: Approve your proposed technical limits, subject to validating that the 16 KB submission cap accommodates valid forms. One correction: Maximum 20 questions per section and 60 questions total per form, NOT 200. Update the spec and tests accordingly. No need to reopen Q5 unless a technical conflict is found.”

Stack C — A APPROVED: Create it with verified isolation from Stacks A/B. F13 refund-session proof takes priority, then F15.

| Decision | Binding outcome | Requirements / acceptance |
| --- | --- | --- |
| F15-1 | PO/WO/Trainer create, copy, edit, publish and retire workspace forms; Sales excluded. | FR-004, FR-030; SC-017; User Story 3 |
| F15-2 + D-03 | Late at 00:00 Cairo after working day five; Friday alone is excluded; DST gap uses the first valid instant of that Cairo date. | FR-015/016; SC-005/006; User Story 4 |
| F15-3 | Dedicated `assign_intake_form` capability for Trainer authorization, with TypeScript/SQL parity after F12 and F14 capability changes. | FR-022; SC-017 |
| F15-4 | Historical decision: PO would supply initial Mandatory Intake/questions at implementation; superseded by S17 for the default form and starter content. S14 questions may be editable starter content; Your First Step is the ordinary editable Forms default. Every form has separate Arabic and English versions. | FR-004/006/026, FR-029/SC-013/021 |
| F15-5 | Initial late alert to responsible Trainer, otherwise PO; if assigned Trainer remains delayed, superseded by Q4: simultaneous WO+PO escalation after 24 hours unresolved; deduplicate. | Superseded by final F15 Q4 below. |
| F15-6 | Per-form trigger, target audience and recurrence configuration for onboarding, specific-client and recurring eligible individual/cohort forms. The implementation sequence must cover approved Q3=D behavior and is coordinated between T010 and T023. | Extended by final F15 Q3 below; FR-003/031; SC-018; BRD-06 conflict recorded below |
| F15-7 | PO, WO, Trainer and Client have full correction permissions for submitted forms, including medical fields and attachments; enforce tenant isolation, authorized client scope and immutable version history/audit; Correction Matrix is approved; no further PO approval needed. | FR-013/021/024; SC-019; [approved correction matrix](correction-matrix.md) |
| F15-8 + RET-1..3 | Keep necessary data while active; start 30 days at Closure/Refund/Deactivation; purge drafts/answers/correction content/attachments; retain templates and minimal legally required audit evidence; maximum 30 days over every recoverable copy including backups; feasibility/legal review before production. | FR-012/024/032/033; SC-014/020 |
| PO-1 | Every successful refund deactivates the client, blocks login, revokes sessions, preserves financial/audit records, and supplies the authoritative relationship-end fact/time that starts RET-1. | FR-012/033; SC-020 |

### F15 Final PO APPROVAL (2026-10-29)

- PO, WO, Trainer and Client have full correction permissions for submitted forms, including medical fields and attachments.
- Enforce tenant isolation, authorized client scope and immutable version history/audit.
- Correction Matrix is approved; no further PO approval needed.

Status of resolved correction-matrix approval item: **DECIDED 2026-10-29 (Final PO APPROVAL)**. Attachment correction permission applies wherever attachments exist; this approval does not add an attachment feature or storage to the MVP. Q1 additionally denies all corrections after Closure, Refund or Deactivation.

### Approved workspace builder operation matrix (F15-1)

Workspace operations require current membership for WO/Trainer and a real existing workspace for PO workspace-scoped actions. Client is limited to assigned forms; Sales is excluded. Global reusable-template governance remains PO-only. A permitted global read/use is eligibility-checked and does not permit mutation or foreign workspace-copy/answer access.

| Operation | Global: PO | Global: WO/Trainer | Global: Sales | Workspace: PO | Workspace: WO | Workspace: Trainer | Workspace: Sales | Client |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create | Allow | Deny | Deny | Allow | Allow in membership | Allow in membership | Deny | Deny |
| Copy eligible published version into workspace draft | Allow | Deny global mutation; may copy only if eligible in an authorized workspace | Deny | Allow | Allow in membership | Allow in membership | Deny | Deny |
| Edit draft | Allow | Deny | Deny | Allow | Allow in membership | Allow in membership | Deny | Deny |
| Publish | Allow | Deny | Deny | Allow | Allow in membership | Allow in membership | Deny | Deny |
| Retire | Allow | Deny | Deny | Allow | Allow in membership | Allow in membership | Deny | Deny |
| Read unpublished draft | Allow | Deny | Deny | Allow | Allow in membership | Allow in membership | Deny | Deny |
| Read/use eligible published version | Allow | Eligible read/use only; no global mutation | Deny | Allow | Allow in membership | Allow in membership | Deny | Assigned snapshot only |
| Read local published template/copy | N/A | No foreign-copy access | Deny | Allow | Allow in membership | Allow in membership | Deny | Assigned snapshot only |

### Closed prior questions (ND status)

Former F15 questions Q1-Q8 are **CLOSED as decision prompts by the binding PO decisions**, not pending alternatives: Q1 maps to F15-1, Q2 to F15-2, Q3 to F15-3, Q4 to F15-4, Q5 to F15-5, Q6 to F15-6, Q7 to F15-7, and Q8 to F15-8/RET-1..3. F15 Q1-Q5 dated 2026-10-30 are recorded above and final; no decision prompt is reopened. D1 design/security is approved under D-29; exact DB migration remains blocked pending F12/F14 merge and Stack D. ND-F5-1 remains separate and open.

### Superseded constraints and source conflicts

- The prior option-B Q1 builder matrix, Q1 recommendation, and Q1 approval gate are superseded by F15-1; Trainers may publish and retire workspace forms.
- The prior Q7 client-only correction recommendation and FR-013's staff-read-only language are superseded by F15-7 and its approved correction matrix.
- D4 distinguishes client-late from Trainer-late alerts. Client-late uses +24h Trainer and +48h PO+WO, no Trainer routes to PO+WO, reassignment does not reset the clock, and only authorized PO/WO recipients are notified. Trainer-late under D-03 preserves existing Q4 rules exactly.
- F15-6 expressly conflicts with BRD-06's no bulk/mass assignment wording (BRD-06 § Reporting and operating scope, approximately line 92) and with the prior F15 per-client-only / no-cohort text. F15-6 controls Forms assignment. Implement all approved Q3=D audiences, triggers, timing, recurrence, and stop conditions per form; coordinate T010 and T023 so recurrence policy and behavior are implemented once. F1 requires resume after freeze without catch-up. PRD-03's recurring check-in behavior is retained in the overall product scope; P5's other check-in features remain separate.
- Prior blanket exclusion of recurrence in P5 is superseded only for the F15-6 configurable form-assignment capability. P5 scheduling, freeze behavior, measurement linkage and check-in surfaces remain outside this F15 scope.

## D1 approved erasure contract and implementation gates

The PO approved the constitutional exception and security/DB design under D-29 (verbatim approval above). The DB-free selector is authorized. Its inputs are the form definition, answer versions, validated branch fact, legal-hold state and audit-row descriptors. It returns exact answer-version row IDs whose questions are currently inapplicable under the authoritative current answer state, and only matching `answer_change` and `access_view` audit-row IDs, plus an IDs-free counts-only control record. Prior answers may support evidence/validation but do not gate selection. It never selects financial, authentication, authorization, security, unrelated-client, other-tenant or other audit rows. Legal hold yields no targets, a defer signal and an alert signal; after release, currently inapplicable targets can be selected without a new branch change. Reprocessing after answer rows are erased returns no targets. Any invalid scope, definition or branch proof fails closed. No answer content is written to logs. The deletion control record contains counts only; it has no operation, tenant, actor, assignment, question, answer or audit-row IDs.

Only an automatic server-validated worker/function may execute erasure; human roles and service-role callers have no direct delete or trigger path. No SQL/migration is authorized in this DB-free task. The future exact migration remains gated on F12/F14 merge and verification of Stack D. RET-3 requires all-copy purge within 30 days. Deleting access-view rows removes evidence of who viewed that inapplicable answer; this security consequence is recorded and follows the PO-approved D-29 decision.

## Open items and gates

| Open item | Classification | Handling |
| --- | --- | --- |
| D1 exact migration | Database implementation gate | F12/F14 must merge and Stack D must be verified before writing or executing the exact forward migration; no DB work in this lane. |
| N12 derivative generation | DB-free media task | Source originals remain read-only and uncommitted; generate WebP/AVIF derivatives under public/images/body-fat at max 2x display width, target <=150 KB each. P1 selects male/female standard series; male-cinematic is unused. |
| Draft-copy PO approval | Terms AR/EN, sex labels, and health-data notice copy | Keep Terms and sex/EN copy marked DRAFT until their separate PO approvals. The standalone health notice is superseded and is not a ship blocker; contextual guidance may use the PO-approved label where useful. Architect defaults resolve Terms Card and N11 motion patterns. |
| 30-day purge feasibility across hosted DB, PITR, snapshots and backups; legal exceptions | Production blocker under RET-3 | Complete and evidence technical/legal review before real Forms data. Synthetic local/CI work may proceed. |
| Authoritative P4 first-pair delivery and responsible-Trainer coverage | Cross-feature dependency | P4 must provide complete authoritative facts before real-data late classification or alerts. |
| Attachment feature and storage beyond MVP | Future design item | No upload/storage feature exists in this scope. Any future implementation needs a scoped design and RET-2/3 proof. |
| ND-F5-1 | Separate retained production open item | Track through its existing owner and register; this F15 decision record does not resolve it. |

### Attachment lifecycle

Forms attachments do not exist in this MVP: no upload field/API, storage owner, stored object, or attachment authorization path is specified. This is consistent with the explicit exclusion of web photo uploads and avoids inventing a storage system. If attachments are introduced later, their storage owner, workspace/client-bound authorization, audited read path, object metadata handling, and purge/deletion mechanism are OPEN design items. Any supported attachment becomes client-specific Forms data and must be deleted within the same 30-day all-recoverable-copies limit. Until those details are approved and demonstrable, attachment upload remains disabled.

## MVP slices and ordering

1. Cairo D-03 pure function and F15-2 late-instant fixtures, including spring-forward/overlap behavior.
2. Schema/RLS/authorization, health-data controls and fail-closed audited readers.
3. General editable Draft → Preview → Publish Builder and provision an editable Your First Step default onboarding template; no immutable catalog or permanently locked mandatory-form exception.
4. Per-client selection, idempotent assignment and bounded historical backfill/reconciliation.
5. Client single-question progression, partial autosave, conflicts, atomic submission/SLA, and authorized append-only corrections under the approved matrix; post-relationship-end corrections are denied under Q1. Register the real route in F12 navigation.
6. Staff intake/correction/SLA views and F14 published brand tokens, with the approved scope and audited-read controls.
7. Add recurrence/cohort execution under the approved F15-6 eligibility semantics and F1 resume rule.
8. Delay logic with synthetic facts; real-data classification/alerts only after authoritative P4 integration, using separate D4 client-late and D-03 Trainer-late rules and the F11 owner-only pg_cron pattern. Production scheduler activation follows its existing gate.

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

- P4 must eventually supply authoritative atomic first-pair delivery and responsible-Trainer facts. P2 defines consumption needs and SLA/alert tests with synthetic facts; no balanced assignment, planner, activation or general portal is implemented here. F15-6 owns configurable form-assignment recurrence; P5 owns separate check-in scheduling/freeze behavior and measurement linkage.
- F14-8: use only the published client-brand data/token contract, authorized per-request workspace resolution, contrast guards and neutral fallback. Do not add portal features, branding editor/storage or history behavior to P2.
- Shared `lib/auth/capabilities.ts`, SQL `app_private.role_has_capability` / `app_private.has_workspace_access` and `lib/auth/` require sequential integration and parity review with F12/F14. Add only `assign_intake_form` for F15, with PO/WO/Trainer allowed and Sales denied, after the F12 Sales `approve_registration` removal and F14 `manage_branding` change are integrated. Verify TypeScript-to-SQL and SQL-to-TypeScript parity for known and unknown strings. Never replace either matrix from a stale branch.
- `audit_row_change()` is a shared complete function body. Future P2 work must start from the latest merged body after F12/F14, preserving all prior tenancy/staff/membership/recovery/package/link/signup/job/approval/payment/branding mappings, no-op behavior and scrubbed allow-lists. Do not copy an older F11-only definition over newer branches. Coordinate any explicit access-audit emission separately from row mutation audit.
- Shared `lib/i18n/messages/{ar,en}.ts`, existing staff dashboards (`app/(app)/page.tsx` and authorized dashboard surfaces), `lib/auth/`, F12 `lib/client-access/`, `app/(client)/account/status/` and future client-form routes need explicit sequential ownership. F12 Approvals/Payments links and branding/auth/self-status behavior must remain intact; no navigation redesign is implied.
- Future readiness/tracker updates belong to an explicitly authorized integration unit; this lane changes only `spec.md` and `correction-matrix.md`.

### Ordering constraint

All future F15/P2 migrations MUST sort strictly after whatever complete F12 and F14 migration sets are actually merged at implementation time, including review-fix migrations. The inspected F12 plan includes a `20261101...` set; that observation is not a frozen upper bound. Recheck all integrated timestamps before allocating any F15 migration; do not invent F14/F15 timestamps. Rebuild audit and capability extensions from the latest integrated definitions, preserving every prior mapping/capability. Forward-only expand/contract and encrypted backup/restore gates still apply; this specification performs no stack/DB operation.

## Out of Scope

- P3 exercise/food catalogs, workout/nutrition planners, plan exports and contextual planner UI; P2 preserves the logical authorized-answer handoff only.
- P4 balanced trainer assignment, pair delivery, activation/productivity, client portal/dashboard, general notifications, subscription expiry/installment enforcement and finance reporting. P2 includes only its required login/intake presentation, SLA and in-app delay alerts.
- P5 check-in cadence/surfaces, measurement linkage, freeze scheduling, replacements, trainer notes and client timeline UI. F15-6 form-assignment recurrence remains in scope for eligible individuals/cohorts; this does not implement the rest of P5.
- Email/SMS delivery, messaging/helpdesk/broadcasts outside approved alert channels, generic bulk client edits, arbitrary executable form rules, web photo uploads and comprehensive exports. F15-6 cohort assignment is the explicit exception to BRD-06 no-bulk wording.
- F12 payment/approval/correction behavior, F14 branding management, F13 renewal/freeze/refunds, YBS import/sync, implementation artifacts and production operations.

## Constitution Check

- **I/III/VII**: Workspace-bound relations, two authorization walls, current membership, PO global oversight, self-only client access and F15-1/3 authorization. Correction permissions follow the approved matrix during an active relationship; all roles are denied after Closure/Refund/Deactivation (Q1). D1 follows D-29: automatic server-validated erasure only for answers currently inapplicable under authoritative answers and their answer-change/access-view rows, with legal-hold defer+alert, idempotency, tenant isolation, fail-closed behavior, counts-only/no-ID control record, no content logging, RET-3 all-copy purge, and no direct human/service-role delete. The loss of who-viewed evidence is documented. No Sales coaching or Forms right is inferred.
- **II/V**: No financial mutation; immutable published forms, assignment snapshots and submission revisions. Approval/intake does not activate a subscription.
- **IV/VI**: Traceable P2 scope, explicit P3/P4/P5 boundaries, F15-6's recorded BRD-06 conflict, and no invented policy/automated discipline. Former F15 Q1–Q8 are closed; listed open items remain visible.
- **VII**: Health-data sensitivity, least privilege, safe access/mutation audit, the narrowly scoped D-29 erasure exception, log scrubbing, open B4/ND-F5-1 retention and inherited production gates.
- **VIII**: Existing Design System, bilingual accessible intake and mandatory Frontend Design Gate; authored content is not machine-translated and brand tokens are presentation-only.
- **IX**: Idempotent approval consumption, saves/submission/alerts, deterministic dedup, conflict-safe revisions and Cairo D-03/F15-2 deadline with Friday/18:00 rules and DST-safe first-valid-instant handling.

No deviation is proposed. Spec Debate is complete; this revision records the binding decisions and identifies only the remaining open details above. Checklist validation is requirements review, not test execution or implementation approval. See [debate.md](debate.md) for accepted/rejected critique points and architectural recommendations.

### S17 F15 supersession (2026-10-30; PO decision section 3)

Your First Step («خطوتك الأولى») is the default ordinary editable onboarding form in Forms. Its Arabic title is PO-approved verbatim by “Session 17 PO decision — F15 default form Arabic title”; the Arabic Forms section name «النماذج» is also PO-given. Workspace Owners may edit, replace, or select another onboarding form. Previously supplied S14 questions are editable starter content, not a fixed catalog. Assignment and delivery timing are configurable per form under Q3=D. There is no standalone health notice; use «عن بياناتك الصحية» / “About your health data” only where genuinely useful. This does not alter Terms Card consent. The T3 MCQ is closed. Published versions and assignment snapshots remain immutable.
