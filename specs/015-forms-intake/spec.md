# Feature Specification: F15 — P2 Forms/Intake

**Feature ID**: F15

**Feature Branch**: `015-forms-intake`

**Tracker row**: P2 Forms/Intake

**Created**: 2026-10-29

**Status**: Draft — Spec Debate complete (2026-10-29); pending PO decisions

**Input**: Session 12, lane 4: specify the P2 Forms/Intake engine, authorization/capability boundaries and delivery SLA. Specification only; no code, migrations, database operations, Docker, plan or tasks. Feature ID F15 and branch/directory `015-forms-intake` are assigned. The [Spec Debate](debate.md) records the completed critique and binding architect judgment.

## Authority and scope

The [roadmap](../../docs/03-roadmap.md) P2 scope is quoted verbatim:

> Form templates/versions, assignment snapshots, conditional logic, autosave, mandatory 3-section intake, Cairo business-calendar SLA, delay alerts (in-app); includes REQ-P2-01 (post-approval automatic form assignment)

Sources read for this draft:

- [Carried requirements](../../docs/12-carried-requirements.md), REQ-P2-01; [decision register](../../docs/04-changes-and-questions.md), D-03, D-09, D-18, D-23 and phase-gated open items; [feature tracker](../../docs/10-feature-tracker.md), P2 row.
- [Constitution 1.3.0](../../.specify/memory/constitution.md), especially I, III–V and VII–IX; [production readiness](../../docs/13-production-readiness.md), DP-01/02, OP-03, BR-01/02 and inherited hosted/Go-Live gates.
- [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-02 (roles), BRD-04.4–7 (approval/intake/SLA/activation), BRD-05 (delay recipients and human discipline), BRD-06 (no bulk actions), PRD-03 (forms/versioning/autosave), PRD-06 (five-day delivery and alerts), PRD-10 (in-site notifications), PRD-11 (audit), PRD-13 (privacy/localization/accessibility), PRD-14 Journey A, DR-01/02. The business-calendar rules come from BRD-04.6 and PRD-06 as refined by D-03; neither authorizes an additional holiday exclusion.
- F12 branch `origin/012-registration-approval` at `50cc77e8a0090f3baa716c3e4656b216db0983dd`: `spec.md`, `plan.md`, `data-model.md`, `contracts/feature-handoffs.md` and `contracts/registration-approval-surface.md` under `specs/012-registration-approval/`. Its proposed technical seams are dependencies, not claims of implemented interfaces. Its final F12-6 status-page decision and Sales approval denial supersede older D-09 wording where inconsistent.
- F14 branch `origin/014-workspace-branding` at `334f50190bcc78e794832fa26c0ea9d482b116c6`: `specs/014-workspace-branding/spec.md` F14-8, FR-008/015 and PI-F14-8; its plan was consulted only for integration/migration ordering. F14 supplies authorized published brand data/tokens; it does not implement P4.
- Main baseline `a8c7ae569e1ae1380740230b90817679b22d465b`: `lib/auth/capabilities.ts`, [Spec Kit template](../../.specify/templates/spec-template.md), [F11 specification](../011-client-accounts/spec.md), [Design Gate](../../docs/09-frontend-design-gate.md) and local `speckit-specify` conventions.

Latest approved decisions control. Every proposal below is identified separately from approved scope. Questions are NOT DECIDED; recommendations grant no permission. The user explicitly requires all gaps to remain visible instead of guessed defaults. Spec Debate is complete as recorded in [debate.md](debate.md); the eight remaining PO decisions are not approved, and no implementation is authorized.

## User Scenarios & Testing

### User Story 1 — Receive the selected intake after approval (Priority: P1)

As an approved client, I find my selected intake on login, so I can start onboarding without waiting for a manual form assignment.

**Why this priority**: REQ-P2-01 joins F12 approval to mandatory intake and is the start of Journey A's P2 slice.

**Independent Test**: Supply one synthetic committed approval fact and one authorized selected published intake version. Consume the fact twice and sign in as that client; one assignment appears with Basic/Workout/Nutrition. No planner or portal is needed.

**Acceptance Scenarios**:

1. **Given** a selected eligible intake and a committed approval event, **When** P2 processes it, **Then** exactly one independent assignment snapshot is created and presented to that client on login.
2. **Given** a rejected or rolled-back F12 operation, **When** assignment processing runs, **Then** no approval-derived assignment is created.
3. **Given** a previously committed approval before P2 existed, **When** backfill runs, **Then** it has the same assignment/dedup guarantees as a new event.
4. **Given** missing selection or an unavailable template prerequisite, **When** consumption runs, **Then** no arbitrary form is selected and the fact remains recoverable; the fixed both-facts operation remains safe and Q6 gates the pending-selection presentation.

### User Story 2 — Complete and resume intake safely (Priority: P1)

As a client, I answer conditional questions in one Basic/Workout/Nutrition intake, resume saved progress and submit only when all required applicable answers are complete.

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

**Independent Test**: Supply one synthetic overdue obligation and controlled delivery/responsibility facts; real-data classification/alerts remain gated on authoritative P4 integration. Run detection repeatedly and concurrently; verify one alert per approved recipient/dedup policy and no alerts for a pair completed on time. Q2/Q5 must be resolved first.

**Acceptance Scenarios**:

1. **Given** the approved deadline has passed without a complete first pair, **When** detection runs, **Then** in-app delay alerts reach the responsible trainer, workspace WO and PO under Q5's cadence.
2. **Given** a retry, scheduler restart or concurrent scan of the same delay, **When** it runs again, **Then** duplicate logical alerts are not created.
3. **Given** the pair was delivered by its deadline, **When** a delayed scan catches up, **Then** it does not claim a delivery delay; delivery after deadline preserves the actual delay history.
4. **Given** a missing responsible trainer or revoked membership, **When** routing runs, **Then** it leaks no client data to that actor and retains an actionable owner-visible exception under Q5.

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

### Edge Cases

- Approval races with form selection, version publication, retirement or staff revocation; no stale capability check or mixed-workspace binding may create an assignment.
- Duplicate/out-of-order approval facts, failed assignment/audit writes and lost acknowledgements; successful assignments remain unique and failures are recoverable.
- A conditional answer changes so a previously required branch is hidden; hidden answers must not satisfy another requirement or bypass server validation. Q4 decides their retention/projection.
- Empty or superficially renamed mandatory sections, all questions hidden, malformed choices, oversized text/payloads, cyclic dependencies and rule expansion attacks must not pass validation.
- Two devices save the same revision, an older response arrives after a newer one, or save races submission; accepted server revision ordering governs and submission cannot be overwritten by a late save.
- Network loss before acknowledgement, expired Auth and browser close do not claim a successful save; recoverable draft handling must not persist health data in logs or uncontrolled browser storage.
- Submission exactly at 18:00 Cairo, all Friday hours, Thursday cutoff, Cairo DST offset changes, leap dates and public holidays that remain working days under D-03.
- Pair delivery exactly at the proposed deadline boundary, delivery before a delayed detector, no responsible trainer, multiple owner roles and membership revocation require deterministic routing/boundaries after Q2/Q5.
- Corrections and template retirement cannot erase prior submissions or restart the first-delivery clock. Q7 governs correction rights; general assignment replacement is deferred.
- Very long authored Arabic/English text, mixed-direction numbers, keyboard-only branching and loss of focus when a conditional question disappears require Design Gate verification.

## Requirements

### Functional Requirements

- **FR-001**: REQ-P2-01 is carried verbatim: PO, WO, or an authorized Trainer selects the intake form; it is automatically assigned after client approval and presented to the client on login. Preserve mandatory Basic/Workout/Nutrition intake and workspace authorization. Deliver this through the Forms/Intake engine (P2), not as a partial engine inside F12.
- **FR-002**: One idempotent internal assignment operation MUST create an assignment only when both a committed F12 `registration.approved` v1 fact and an authorized per-client selection exist for the same existing workspace/client/initial subscription. Invoke this operation when authorized selection is recorded, when the approved client resolves self-intake and during bounded historical backfill/reconciliation. Selection may precede or follow approval (Q6 governs pending-selection presentation). No assignment success may be claimed before both prerequisites exist; failed/rejected approvals create none. Successful consumption, assignment and audit MUST commit atomically. Dedup by event identity and independently enforce unique initial assignment on `(workspace_id, subscription_id)`; missing prerequisites remain recoverable without an arbitrary fallback.
- **FR-003**: Selection MUST be per client, identify a published eligible intake version and derive the selecting actor from current authorization. PO may select globally for an existing workspace; WO and authorized Trainer act within current memberships. Q3 MUST settle the Trainer capability before implementation; role name/UI visibility alone grants nothing. Do not add workspace-default mass assignment or an F12 selector/approval prerequisite. Q1 governs separate builder rights.
- **FR-004**: Published form versions MUST have stable question/section identities, typed answers, authored labels, requiredness, validation and declarative conditional rules. Published content is immutable; editing creates a new version. Distinguish platform-owned global published templates from workspace-owned copies: global visibility grants neither global mutation nor access to foreign workspace copies/answers. Validate eligibility of a global published version before copying into a workspace-bound assignment. PO global governance is fixed; Q1 settles the explicit local operation-by-role-by-scope matrix and Q4 settles substantive form content.
- **FR-005**: Every assignment MUST capture an immutable, workspace-owned independent snapshot of its selected version's full questions, sections, validation and rules. Later editing, publication, retirement or access changes MUST NOT alter assigned/submitted forms. Historical authorized reads MUST be independent of mutable templates, subject to the eventually approved retention/closure rules (Q8). Answer corrections append revisions; general assignment replacement is deferred beyond MVP.
- **FR-006**: Mandatory intake MUST be one assigned form containing substantive Basic, Workout and Nutrition sections. Neither authoring, selection nor conditional logic may bypass their required completion. Submission MUST validate all approved applicable required answers and the section-completeness policy; an empty or all-hidden section cannot count as substantively complete. Q4 supplies the required inventory and hidden-answer policy.
- **FR-007**: Conditional progression MUST be deterministic and declarative, typed, allow-listed and acyclic, with no arbitrary script, executable markup, external calls or arbitrary code execution. Finite depth, rule-count, question-count, payload-size and evaluation-work bounds MUST be proposed/measured by the architect and reviewed before publication ships; these engineering limits are not a separate PO-policy vote. Reject payloads/definitions above every reviewed bound before evaluation; Q4 governs content/hidden-answer/authored-language policy.
- **FR-008**: Every save MUST independently validate supplied answers, snapshot identity, applicability, types/choices and safety bounds server-side; empty/partial drafts are allowed and missing required answers MUST NOT reject a draft solely for incompleteness. Submission additionally MUST enforce all applicable required answers and substantive three-section completeness. Unknown question IDs, wrong-snapshot answers and unsafe/over-bound inputs fail safely. Hidden answers cannot bypass requiredness.
- **FR-009**: Autosave MUST distinguish unsaved, saving, acknowledged-saved, failed and conflict states. Only an acknowledged durable accepted revision may be called saved. Resume MUST restore accepted progress across navigation/devices; uncertain retries retain the same intent key. The architect MUST propose and review measured save timing/debounce/max-unsaved behavior before the UI ships; no product latency promise is invented. Draft retention belongs to Q8, not a separate cadence policy question.
- **FR-010**: Draft writes MUST name assignment and expected current revision. Accepted writes advance authoritative server revision; stale competitors return conflict without overwrite. Last-write means last accepted server revision, never client clock or late arrival. No silent whole-form last-arrival overwrite or automatic merge is permitted; reload/reconcile then save against current revision. Late acknowledgements MUST NOT revert newer displayed state.
- **FR-011**: Save/submit retries MUST return the same outcome for the same authorized key/canonical intent without duplicate revision/submission/audit; changed intent under that key fails safely. Independently of operation keys, enforce one original accepted submission and SLA per assignment and initial onboarding obligation. When touching F12 records preserve client → subscription → obligations/ledger lock order; the plan MUST define a compatible order for P2 selection/assignment and authorization locks and recheck authorization after waits. Distinct-key assignment/submission races, save-versus-submit, selection/retirement/revocation races and audit-failure rollback MUST preserve these invariants.
- **FR-012**: Sensitive drafts/submissions MUST remain server-authorized. Q8/B4 governs actual draft/submission/correction/audit/closure retention, deletion/pseudonymization and backup treatment before real client data. Do not invent expiry purges or indefinite retention. Unresolved retention blocks production real data only; local/CI synthetic work may proceed. Required historical readability remains subject to the approved retention exceptions.
- **FR-013**: A complete accepted submission MUST atomically create an immutable answer revision, authoritative original submission instant, audit and original SLA start. Invalid/incomplete/failed/rolled-back submission creates none. Corrections MUST append answer revisions, preserve original history under Q8 and never restart original submission time/SLA. Q7 decides correction actors; recommendation is client-only MVP with staff read-only, not approved policy. General assignment replacement is deferred.
- **FR-014**: SLA start MUST be the first accepted complete mandatory intake submission, targeting the first complete workout/nutrition pair. Signup, approval, assignment, draft save and partial completion MUST NOT start it. P2 MUST NOT activate subscriptions or create delivery/productivity facts.
- **FR-015**: D-03 day counting MUST be a pure tested function of submission instant in IANA `Africa/Cairo`, using local dates and zone rules, never a fixed UTC offset or five 24-hour durations. Every day except Friday is working; no other holidays are excluded. Before 18:00 on a working day counts it as day one; at/after 18:00 starts next working day; Friday starts Saturday. Store fixed rule identifier `cairo-d03-v1` with the frozen deadline facts. No holiday feed, runtime calendar-governance machinery or separate calendar-source PO question is required.
- **FR-016**: Preserve original submission instant, Cairo start/date-five result and fixed rule identifier; freeze the deadline determined at submission without later silent recalculation. Day counting is decided and testable now. The exact day-five deadline instant and equality boundary remain gated by Q2: no recommendation is approved. Recommended B is the first valid instant of the following Africa/Cairo calendar date after day five, late at/after that instant; if selected, the reviewed zone-library implementation MUST find the earliest valid instant on that following date (advance past skipped local times and choose the earlier occurrence in an overlap), with explicit DST fixtures, including Thursday before spring-forward. This algorithm is conditional on Q2 approval. No real-data late classification may ship before Q2.
- **FR-017**: In-app delay alerts MUST target the responsible trainer, workspace WO and PO. No real-data delay classification or alert may run until authoritative P4 first-pair delivery and responsible-trainer facts are integrated with complete coverage. Missing/unavailable evidence MUST produce an owner-visible operational exception, never a client/trainer late classification. Synthetic integration/testing is permitted. Q5 settles recurrence, detection/catch-up budget and reassignment routing only when P4 integration is ready. No email/SMS/Telegram sending is included.
- **FR-018**: Detection/delivery MUST deduplicate each logical SLA/delay occurrence, approved alert kind and recipient across retries/concurrent scans. Recheck current recipient/workspace authorization at delivery/read. Authoritative delivery timestamps and delivery-versus-detector serialization MUST prevent false delay for on-time pairs, retain genuine late history and suppress obsolete actionable notices after resolution. Alert rows MUST store IDs only; resolve names at read time under current authorization. Q5 settles newly responsible recipients.
- **FR-019**: No automatic strike, deduction, firing or compensation change is permitted. Keep safe evidence for human review without implementing P4 balanced assignment/activation. **Architectural recommendation, not scheduler activation approval:** reuse the approved pg_cron owner-only security-invoker activate/deactivate pattern from `20261031130000_purge_scheduling_pg_cron.sql`; activation remains deferred to pre-production and the P4 integration gate. Do not add an unhandled generic job/new worker.
- **FR-020**: Every tenant-owned copy, selection, assignment, answer revision, SLA, processing record and alert MUST carry workspace identity and same-workspace composite `(workspace_id, id)` relationships with enabled/forced RLS across reads, mutations, jobs and all access surfaces. Staff authorization requires current capability/membership except PO global authority over an explicitly joined existing `public.workspaces` row; `has_workspace_access` alone is insufficient because PO may pass for nonexistent UUIDs. Clients require signed self-association and approved state, not staff membership. Background operations use narrowly scoped internal authority. At both authorization walls foreign/nonexistent/unauthorized targets MUST have identical denial status/code/body shape apart from incidental request IDs, with no existence/replay/cache leakage.
- **FR-021**: Approved clients MUST have self-only form/draft/submission access. Client operations may accept assignment identity but MUST NOT accept client/workspace target parameters; derive identity/scope from signed Auth association and verify ownership. Pending/rejected clients remain denied protected intake with valid sessions; F12 self-status is separate. WO/Trainer may read intake for coaching within current authorized workspaces regardless of responsibility assignment; Sales has no health-answer/selector/builder right without explicit approval. Q7 gates correction rights.
- **FR-022**: Use actual SQL helpers `app_private.role_has_capability` and `app_private.has_workspace_access`, with parity against TypeScript `MATRIX`/`roleHasCapability` for known AND unknown capability strings. Preserve F12 Sales `approve_registration` removal and F14 approved `manage_branding` addition during latest-integrated-matrix review. Q3 recommends existing `coaching_work`, with no capability-matrix change if confirmed; never infer Sales coaching from payment rights.
- **FR-023**: Health/fitness/nutrition answers/drafts are sensitive personal data. Require HTTPS and `Cache-Control: private, no-store` for answer-bearing reads/actions/RPC responses; no framework data cache, ISR or CDN answer caching. MVP MUST NOT store answers in localStorage, sessionStorage, IndexedDB or service workers and MUST exclude intake tables from Realtime publications. No service-role browser/application answer path is allowed; client paths use their session under RLS. Intake belongs within BR-01/BR-02 encrypted backup/restore gates. Provider at-rest encryption is UNVERIFIED in this repository; D-20 approves Frankfurt region only. Verify hosted at-rest protection before production; F15 MUST NOT add column-level encryption unless the PO adds that requirement.
- **FR-024**: Every staff AND client access to sensitive answers MUST append allow-listed IDs-only access evidence; audit failure MUST return no answers. No daily access-audit dedup or client exemption is allowed. Deny direct answer-table reads, embedding/PostgREST or RPC paths that bypass access audit; RLS alone does not audit reads. Privileged operations independently verify identity/scope/operation, use `search_path=''` and qualified objects, revoke default EXECUTE and grant narrowly. Template publication/selection/assignment/save/submission/correction/SLA/alert mutations MUST have append-only safe audit atomically with mutation; successful mutation replays do not duplicate mutation audit. No answer/label/authored text, identity PII, raw arguments, token or free text belongs in audit. Audit retention is Q8/ND-F5-1, distinct from the client timeline.
- **FR-025**: Logs/errors/telemetry/jobs/traces MUST exclude answers, identity PII, health text, credentials and raw request bodies. Validate before writes and map raw DB/constraint/provider errors to allow-listed safe codes; raw errors MUST reach neither clients nor logs because constraints may echo values. P2 background failures MUST store only allow-listed error codes in fields consumed by existing dead-job audit, including `last_error`; F11's existing job audit copies that field. Seed distinctive sensitive values through failures and verify job rows/audit and each enabled log layer.
- **FR-026**: Client intake MUST present one applicable question at a time (PRD-03), support backward review and recompute remaining progression after changes without losing acknowledged answers. Use existing DESIGN.md/P0 components and semantic tokens, AR-first RTL/EN LTR, keyboard access, focus/error/save/conflict announcements and responsive light/dark states. Authored text is never machine-translated; Q4 settles required authored languages/fallback. Body-fat information, if included, is numeric rather than an unsolicited image selector. Single-question path, branch disappearance, resume and backward focus require Design Gate review.
- **FR-027**: Consume F14's authorized published workspace brand data/tokens when available with neutral/default fallback. Resolve authorized scope per request without shared actor/workspace cache; discard late switch responses, preserve semantic tokens and verify actual surface contrast. Branding cannot alter answers/snapshots/authorization. F14-8 is a branding contract, not P4 portal implementation.
- **FR-028**: Navigation is already decided by FINAL F12-6/PA-F12-6. Register a real authorized intake destination in F12's server allowlist once it exists; retain bounded automatic redirect following detected pending-to-approved transition plus Manual Refresh/navigation fallback. Direct already-approved visits follow that reviewed route contract. Never guess a route, redirect to staff pages or imply approval equals activation/assignment success. Only concrete missing layouts/Design System decisions require Design Gate options and PO review; do not reopen navigation policy.
- **FR-029**: Every builder/version list, selector, conditional single-question intake, draft/conflict/submission/correction history, staff read-only/SLA and alert surface MUST pass the Frontend Design Gate. Retain real screenshots for AR-RTL/EN-LTR × light/dark × mobile 390/desktop 1440, required interaction/loading/empty/error/success/disabled/pending states, keyboard/screen-reader/axe and contrast evidence. Missing DS decisions MUST be escalated with concrete options rather than invented.

### Key Entities (logical)

- **Form template and published version**: Governed reusable form identity, scope, immutable authored question/section definitions and bounded conditional/validation rules; draft authoring and publication history are distinct.
- **Intake selection**: Authorized choice of an eligible version for a workspace/client onboarding context, selecting actor and time. Selection may precede or follow approval; Q6 decides the pending-selection workflow/presentation.
- **Approval fact and consumption record**: F12 immutable event identity/workspace/client/subscription/version/time, plus P2 private processing/dedup state; the event itself has no form selection or PII.
- **Form assignment snapshot**: Workspace/client/subscription-bound independent copy of versioned form content and rules, approval origin and assignment time, readable independently of later template changes.
- **Answer draft and revisions**: Sensitive answers keyed to snapshot question IDs, authoritative draft revision and acknowledged save state; accepted submissions/corrections retain immutable answer revisions and original submission identity.
- **Delivery SLA obligation**: Original complete submission, fixed Cairo rule identifier, day-five date and eventually approved deadline instant, linked to authoritative first-pair delivery/responsibility facts supplied by P4.
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
- **SC-006**: Conditional on Q2, 100% of approved exact-boundary/skipped/ambiguous-time fixtures yield the approved deadline and equality classification. No Q2 recommendation is treated as approval.
- **SC-007**: Real-data delay classification/alerts remain disabled until authoritative P4 coverage and Q2/Q5 are satisfied. Missing evidence produces zero late classifications; synthetic on-time/detector races produce zero false alerts.
- **SC-008**: All foreign/nonexistent target denials have identical status/code/body shape at both walls apart from incidental request IDs, and disclose zero answers/existence metadata; approved clients without staff membership and PO without membership over real workspaces pass their proper access cases.
- **SC-009**: Every executable/cyclic rule or client-tampered applicability payload fails.
- **SC-010**: Every staff/client answer access has IDs-only audit evidence; audit-failure fixtures return zero answers. Direct table/embedding/RPC bypasses return zero answers; successful mutation replay creates zero duplicate mutation audits.
- **SC-011**: Seeded sensitive values occur zero times in enabled logs/errors/audit/jobs, including dead-job `last_error`; answer responses are private/no-store, and browser persistence/Realtime/service-role answer paths expose zero answers.
- **SC-012**: Every P2 UI surface passes all eight locale/theme/device combinations and keyboard/screen-reader/contrast/accessibility review with retained evidence and zero unresolved Design Gate failures. Concrete missing design choices and Q1/Q4/Q7 policy-dependent screens remain gated.

- **SC-013 (gated: Q4)**: Every accepted submission completes the approved substantive Basic/Workout/Nutrition inventory and hidden-answer policy once its decision and completeness fixtures are attached.
- **SC-014 (gated: engineering timing and Q8)**: Every acknowledged accepted draft revision is recoverable within the approved retention window; save cadence/max-unsaved tests meet reviewed architect timing values. No timing/retention threshold is assumed before review.
- **SC-015 (gated: P4, Q2/Q5)**: Each genuine delay produces exactly its authorized recipient alerts within the approved detection/catch-up budget, with zero duplicate logical alerts across delivery/reassignment/retry races.
- **SC-016 (gated: reviewed numeric bounds)**: Payloads above EACH reviewed numeric bound are rejected before evaluation, and zero over-limit definitions reach clients; attach bound values and boundary fixtures before PASS.

## Assumptions and readiness

- F11 identity binding and F12 private approval facts/self-status remain dependencies, not claims of implemented/merged interfaces. Production delay behavior additionally requires authoritative P4 integration; synthetic integration is allowed.
- Q1–Q8 remain NOT DECIDED. Autosave timing and finite execution limits are architect engineering items for measured review; draft retention is consolidated into Q8/B4. Friday-only D-03 and F12 navigation are settled and not new PO questions.
- Spec Debate is complete with the [architect judgment](debate.md); this does not approve implementation. No code, migration, DB, Docker, plan or tasks is included.
- Production real data remains blocked by B4/ND-F5-1 and current hosted/log/backup/deployment gates. These retention gates do not block local/CI synthetic work. Future authorized integration must synchronize tracker/readiness registers; this lane changes only the three feature Markdown files.

## Open questions for PO

Every item is **NOT DECIDED**. Recommendations are proposals, not authorization. Original question IDs are retained parenthetically for debate traceability; the final register is sequential Q1–Q8.

1. **Q1 — Workspace form-builder rights (former Q1; NOT DECIDED):** Which local operation×role×scope matrix should apply? Options: A) PO/WO/Trainer create/copy/edit/publish/retire workspace forms; B) PO/WO publish/retire workspace forms, Trainer creates/copies/edits drafts only; C) PO publishes/retires all forms, WO/Trainer draft locally. Sales denied in all options; PO global governance is already fixed. **Recommendation: B**. The PO must approve an explicit table for create, copy, edit draft, publish, retire and read by role and global/workspace scope; global visibility never grants foreign-copy/answer access.
2. **Q2 — Deadline instant (former Q2; NOT DECIDED):** When exactly does day five become late? Options: A) 18:00 Cairo on day five; B) the first valid instant of the following Africa/Cairo calendar date after day five; C) original submission's Cairo wall-clock time on day five with an explicit skipped/ambiguous-time rule. **Recommendation: B, late at/after that instant**, with reviewed zone-library handling and DST fixtures. This instant/equality choice remains unapproved; pure D-03 day counting and its submission cutoff are already decided.
3. **Q3 — Trainer selection capability (former Q3; NOT DECIDED):** What authorizes Trainer selection? Options: A) existing `coaching_work` with current membership; B) dedicated `select_intake_form` capability for PO/WO/authorized Trainers. **Recommendation: A**, requiring no capability-matrix change if confirmed. Verify actual TypeScript/SQL helpers for known and unknown strings while preserving F12 Sales approval removal and F14 `manage_branding`.
4. **Q4 — Intake inventory and authored policy (former Q5; NOT DECIDED):** What substantive Basic/Workout/Nutrition question inventory, hidden-answer treatment and authored-language fallback should publish? Options: A) PO supplies/verifies original inventory and approves hidden-answer retention/projection and one-required-language fallback; B) architect proposes a minimal typed inventory with bilingual required labels and explicit hidden-answer rules for PO approval. **Recommendation: A**, using B only for missing source content. Finite numeric execution/payload limits are architect-proposed/measured safeguards for review, not a separate policy vote; single-question progression, numeric body-fat display and no machine translation are settled.
5. **Q5 — Delay cadence and reassignment (former Q7; NOT DECIDED):** Once P4 facts are integrated, what detection/catch-up budget and recipient lifecycle apply? Options: A) one alert per delay/authorized recipient, owner exception if trainer missing; B) initial alert plus PO-configured repeated in-app reminders; C) initial alert plus one owner escalation after a PO-set interval. **Recommendation: A**, with an explicit maximum detection/catch-up interval and decision whether a new responsible trainer receives a new recipient alert. Needed only with P4; missing authoritative evidence is never a delay classification.
6. **Q6 — Selection timing presentation (former Q8; NOT DECIDED):** How should per-client selection before or after approval and pending-selection exceptions be presented? Options: A) allow either order, assign only when both facts exist, visibly flag pending selection to owners and the client safely; B) operationally require staff selection before approval but retain a safe pending-selection exception for historical/missing choices without changing F12 approval. **Recommendation: A**. The assignment invariant is fixed; this question approves the timing workflow/copy. No workspace-default or mass-assignment option is in MVP.
7. **Q7 — Correction actors (former Q9; NOT DECIDED):** Who may append submitted-answer corrections? Options: A) client and authorized coaching staff under an explicit field/action matrix; B) client only with staff read-only; C) staff-mediated corrections only. **Recommendation: B for MVP**. Every option appends revisions and preserves original submission/SLA; general assignment replacement is deferred and is not part of this decision.
8. **Q8 — Sensitive-data retention (former Q10 plus Q6 retention; NOT DECIDED):** Which policy extends existing B4/ND-F5-1 and DP-01/02 to drafts, submissions/corrections, safe access/mutation audit and alert evidence? Options: A) jurisdiction-reviewed distinct schedules including closure pseudonymization/deletion and backup treatment; B) explicitly reviewed reuse of confirmed client-closure/audit schedules where applicable. **Recommendation: A**. Actual durations and lifecycle rules require approval before production real data only; local/CI synthetic work is not blocked. No expiry purge or indefinite-retention default is approved; MVP answer storage remains server-only.

### Q1 proposed option B matrix - NOT DECIDED

This proposed operation/role/scope table needs explicit PO approval. It describes template governance, not the already defined intake-answer read paths. Published global-version use remains eligibility-checked under FR-004; it grants no draft/global mutation right.

| Template operation                               | Global: PO     | Global: WO/Trainer/Sales                                       | Workspace: PO | Workspace: WO       | Workspace: Trainer       | Workspace: Sales |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------- | ------------- | ------------------- | ------------------------ | ---------------- |
| Create                                           | Allow          | Deny                                                           | Allow         | Allow in membership | Draft only in membership | Deny             |
| Copy eligible published version into local draft | Allow          | No global copy mutation                                        | Allow         | Allow in membership | Draft only in membership | Deny             |
| Edit draft                                       | Allow          | Deny                                                           | Allow         | Allow in membership | Allow in membership      | Deny             |
| Publish                                          | Allow          | Deny                                                           | Allow         | Allow in membership | Deny                     | Deny             |
| Retire                                           | Allow          | Deny                                                           | Allow         | Allow in membership | Deny                     | Deny             |
| Read unpublished draft                           | Allow          | Deny                                                           | Allow         | Allow in membership | Allow in membership      | Deny             |
| Read/use eligible published global version       | Allow          | No new grant; eligibility governs WO/Trainer use; Sales denied | Allow         | Eligibility governs | Eligibility governs      | Deny             |
| Read local published template/copy               | Not applicable | No foreign-copy grant                                          | Allow         | Allow in membership | Allow in membership      | Deny             |

## MVP slices and ordering

1. Cairo D-03 pure function and fixtures; calculate start/day five independently while Q2 gates the deadline instant.
2. Schema/RLS/authorization, health-data controls and fail-closed audited readers.
3. Minimal PO-only publication of one PO-supplied intake version, enabling intake work without waiting for the full builder.
4. Per-client selection, idempotent assignment and bounded historical backfill/reconciliation.
5. Client single-question progression, partial autosave, conflicts, atomic submission/SLA, append-only client corrections once Q7 is approved, and real-route registration in F12 navigation.
6. Staff read-only intake/SLA views and F14 published brand tokens.
7. Full form builder under the approved Q1 matrix.
8. Delay logic with synthetic facts now; real-data classification/alerts only after reviewed P4 integration and applicable decisions, with scheduler activation separately deferred.

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
- Shared `lib/auth/capabilities.ts`, SQL `app_private.role_has_capability` / `app_private.has_workspace_access` and `lib/auth/` require sequential integration and parity review with F12/F14. Main currently includes Sales `approve_registration`; F12 removes it. F14's separate branding capability must survive any matrix extension. Never replace either matrix from a stale branch.
- `audit_row_change()` is a shared complete function body. Future P2 work must start from the latest merged body after F12/F14, preserving all prior tenancy/staff/membership/recovery/package/link/signup/job/approval/payment/branding mappings, no-op behavior and scrubbed allow-lists. Do not copy an older F11-only definition over newer branches. Coordinate any explicit access-audit emission separately from row mutation audit.
- Shared `lib/i18n/messages/{ar,en}.ts`, existing staff dashboards (`app/(app)/page.tsx` and authorized dashboard surfaces), `lib/auth/`, F12 `lib/client-access/`, `app/(client)/account/status/` and future client-form routes need explicit sequential ownership. F12 Approvals/Payments links and branding/auth/self-status behavior must remain intact; no navigation redesign is implied.
- Future readiness/tracker updates belong to an explicitly authorized integration unit; the three feature Markdown files are the only changes in this lane.

### Ordering constraint

All future F15/P2 migrations MUST sort strictly after whatever complete F12 and F14 migration sets are actually merged at implementation time, including review-fix migrations. The inspected F12 plan includes a `20261101...` set; that observation is not a frozen upper bound. Recheck all integrated timestamps before allocating any F15 migration; do not invent F14/F15 timestamps. Rebuild audit and capability extensions from the latest integrated definitions, preserving every prior mapping/capability. Forward-only expand/contract and encrypted backup/restore gates still apply; this specification performs no stack/DB operation.

## Out of Scope

- P3 exercise/food catalogs, workout/nutrition planners, plan exports and contextual planner UI; P2 preserves the logical authorized-answer handoff only.
- P4 balanced trainer assignment, pair delivery, activation/productivity, client portal/dashboard, general notifications, subscription expiry/installment enforcement and finance reporting. P2 includes only its required login/intake presentation, SLA and in-app delay alerts.
- P5 recurring weekly check-ins, measurements/measurement linkage, freeze scheduling, replacements, trainer notes and client timeline UI. The engine must preserve versioning without implementing recurrence now.
- Email/SMS/Telegram reminders or alerts, messaging/helpdesk/broadcasts, bulk client/form assignment, arbitrary executable form rules, web photo uploads and comprehensive exports.
- F12 payment/approval/correction behavior, F14 branding management, F13 renewal/freeze/refunds, YBS import/sync, implementation artifacts and production operations.

## Constitution Check

- **I/III**: Workspace-bound relations, two authorization walls, current membership, PO global oversight, self-only client access and explicit undecided capability/builder matrix. No Sales coaching right is inferred.
- **II/V**: No financial mutation; immutable published forms, assignment snapshots and submission revisions. Approval/intake does not activate a subscription.
- **IV/VI**: Traceable P2 scope, explicit P3/P4/P5 boundaries and no invented policy/automated discipline. Q1–Q8 are NOT DECIDED.
- **VII**: Health-data sensitivity, least privilege, safe access/mutation audit, log scrubbing, open B4/ND-F5-1 retention and inherited production gates.
- **VIII**: Existing Design System, bilingual accessible intake and mandatory Frontend Design Gate; authored content is not machine-translated and brand tokens are presentation-only.
- **IX**: Idempotent approval consumption, saves/submission/alerts, deterministic dedup, conflict-safe revisions and Cairo calendar with Friday/18:00 rules; exact deadline remains an explicit PO question.

No deviation is proposed. Spec Debate is complete; this draft awaits the eight PO decisions. Checklist validation is requirements review, not test execution or implementation approval. No `plan.md` or `tasks.md` exists for this feature yet. See [debate.md](debate.md) for accepted/rejected critique points and architectural recommendations.
