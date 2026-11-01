# LIFTER — Consolidated Business Requirements & Product Requirements

**Version:** Discovery handoff 1.0  
**Date:** 26 October 2026  
**Status:** 44-round product discovery completed; architecture, delivery plan and implementation **not yet approved**.  
**Audience:** Claude acting as independent product strategist, principal engineer, security reviewer and delivery planner.  
**Language of product:** Arabic and English; this handoff is written in English for precise technical review.

> **Authority / provenance:** This is a consolidated statement of the decisions recorded across 44 discovery rounds, not a verbatim transcript of every question and answer. Explicitly decided requirements are binding. Some low-level parameters were settled in earlier discussions but their exact numerical values are not reliably available in this consolidated handoff; these are identified for *source verification*, not filled in by guesswork. **Do not import behavior from the existing YBS system unless LIFTER explicitly adopts it.**

---

# PART I — BUSINESS REQUIREMENTS DOCUMENT (BRD)

## BRD-01. Vision and business model

LIFTER is a multi-tenant, branded coaching operating system for a platform operator who oversees multiple independently branded coaching workspaces (examples include KENDO and TOJI). Workspaces manage paying fitness-coaching clients, trainers, workout and nutrition programming, forms, subscriptions, operations and financial reporting. The Platform Owner retains central governance; client and business data are isolated between workspaces.

The service is **not** an open consumer marketplace, public storefront, CRM or in-app payment processor. A customer pays the relevant workspace **outside LIFTER**, receives a package-specific one-time account-registration link, is approved after payment confirmation, completes mandatory intake, and receives their plans. Coach-client conversations, sales, support and mass announcements occur on Telegram or other external channels rather than a built-in messenger.

### Outcomes
- Reliable, workspace-isolated onboarding, subscriptions, coaching-plan delivery and renewal operations.
- Efficient, auditable trainer workflows with clear accountability, KPIs and centrally governed compensation.
- Transparent financial reporting for each workspace and aggregate reporting for the Platform Owner.
- A simple bilingual client experience with branded registration, plans, check-ins, measurements and subscription visibility.
- Shared Telegram bot access to selected client/staff information, without replacing the web application.

### Business invariants
1. **Strict workspace isolation:** no cross-workspace leakage in queries, exports, bot messages, media, notifications, logs or authorization checks.
2. **Platform Owner is the governance authority:** creates workspaces, manages staff access and permissions, determines packages, prices, commission and salary/incentive decisions.
3. **External collection:** workspaces receive client payments directly. LIFTER calculates its *earned/owed* commission, **not** cash physically received.
4. **Historical financial truth:** purchase-time prices, tier and commission snapshots and immutable payment/refund ledger events must not be rewritten by later settings changes.
5. **Registration is post-sale only:** client registration remains invitation-only; no checkout, pre-sales CRM or self-service purchase inside LIFTER. A public premium marketing Landing Page for prospective Workspace Owners (services overview; Login, Work With Us and Apply CTAs) is approved as a **deferred feature after core platform completion** (PO, session 14, 2026-10-30).
6. **Activation of a first subscription requires delivery of both initial plans**, not merely account creation or payment.
7. **Existing decisions outrank suggestions:** Claude may challenge or propose changes, but must label them as proposals, not silently redefine scope.

## BRD-02. Organizational model and permissions

### Actors
- **Platform Owner:** full platform-level authority, aggregate and workspace-specific financial and operational visibility; only actor who creates workspaces, manages all staff membership/permissions, controls workspace package availability, prices, commissions, platform-wide exports, manual password-reset links, salaries, incentives and final enforcement decisions. Can also perform all trainer tasks.
- **Workspace Owner:** sees and operates their own workspace, views its revenue, workspace share and LIFTER commission, manages its branding and published content, and can perform all trainer/coaching tasks. Cannot see other workspaces, change platform-governed permissions/prices/commissions, or see other coaches' salaries.
- **Trainer:** plans and follows up on clients in authorized workspace(s), manages notes, forms and substitutions, and can work on any client in those authorized workspaces regardless of accountability assignment. Views own compensation/KPIs, not others'.
- **Sales:** separate professional role; its detailed operational rights must be taken only from explicitly approved permissions, not inferred from trainer privileges.
- **Client:** limited to their own workspace-specific account, assigned plans, forms, progress, subscription and settings.

A staff member may use one login across multiple authorized workspaces, but their **professional role is consistent** across those workspaces. Authorization is based on actual workspace membership; the UI alone is not a security boundary. Platform/Workspace Owners can carry out coaching work without being reassigned as trainers.

### Workspace branding
Workspace Owner can edit logo, color theme, visual identity, hero/branding elements and relevant text, preview changes and publish without Platform Owner approval. This never changes financial rules or security boundaries. Product visual direction is dark/monochrome with lime-green accents where appropriate, Arabic-first usability, clear loading states and responsive layouts.

## BRD-03. Commercial and revenue policies

- Package identity is canonical and must not depend on display labels. The Platform Owner decides which packages a workspace may sell and sets their prices/commissions; settings changes affect future purchases, not historical snapshots.
- The registration link is associated with a specific workspace and paid package. Package prices, durations and commission configuration must be data-driven, not hardcoded to historical YBS defaults.
- No integrated payment gateway. Initial sale and renewals are paid externally; staff record/approve after verifying payment.
- Three-month subscriptions may use two installments (50% initial, 50% subsequent), with the second due at the end of month one from activation; overdue installments restrict client plan access until settled while preserving account access and appropriate alerts.
- Support full/partial refunds via immutable financial reversal events; deletion of a client account is **not** a refund. Avoid fabricating historical paid events.
- Revenue views distinguish gross/collected client payments, refund effects, LIFTER commission owed, and workspace share as defined by the approved accounting rules. **Do not add inter-party settlement/payment tracking**: LIFTER does not record whether the workspace transferred its commission to the platform.
- Platform Owner has aggregate totals for revenue, clients and subscriptions, and drill-down into each workspace. No cross-workspace comparison dashboard is required by the final choice.
- Workspace Owners see only their workspace financial/operational data, including LIFTER commission and workspace share.

## BRD-04. Client lifecycle

1. Customer purchases externally; staff/platform issues the correct **unique, single-use registration link**, valid for 24 hours. If the registration form was opened before expiry, allow a **30-minute grace period** to finish. Link is consumed on successful signup only. Do not block signups by shared IP address.
2. Registration page contains **only** the workspace/coach identity (logo, colors, theme) and registration-data form, with an Arabic/English toggle. There is **no** public workspace marketing page, FAQ/price page, contact CTA, sales funnel or pre-sale lead capture in LIFTER.
3. Client identity is tied to one workspace-specific account. Account/email/phone uniqueness and separation across workspaces follow the approved account-isolation rules; do not merge unrelated workspace accounts. Telegram username is collected; actual bot linking is optional.
4. Workspace Owner approves registration/payment before intake. Client sees approval without having to log out and back in. Rejection/release of registration and deletion handling must preserve required financial/audit evidence. **PO decision 2026-10-28 (DG-F12-1):** PO, WO, or an authorized Trainer selects the intake form; it is automatically assigned after approval and presented to the client on login. This is delivered by the Forms/Intake engine (P2), not as a partial engine inside F12.
5. Mandatory initial intake consists of one form with **Basic, Workout and Nutrition** sections, conditional questions, autosave and workspace-independent assigned copies. Information is available contextually to the relevant planners; measurement linkage is manual where specified. Intake can be edited under form-versioning rules. The mandatory sections and workspace authorization remain required under the PO decision.
6. The delivery clock starts after **submission of mandatory intake**. First complete workout and nutrition plans are due in **five working days**. Friday is nonworking; submissions before 18:00 count the submission day, after 18:00 count from the next working day. Correcting submitted answers does not restart the clock.
7. First subscription becomes active automatically when both initial plans are delivered; `activated_at` is the timestamp recorded by the single exactly-once activation transaction that runs after both first deliveries have succeeded (independent delivery records; see Plan Core, spec 019). New-client assignment, planning and delivery status must be visible operationally.
8. During active subscription the client views eligible plans, measurements, check-ins, subscription and notifications. On expiry, login/settings/support/renewal-related access remains, while plan access/export is restricted. Overdue installments independently restrict plan access.
9. Renewal is paid and arranged **outside LIFTER**. Client sees expiry alert/date only, with no in-app renewal request or redirect CTA. Administration records and approves the renewed subscription; renewals activate under their previously agreed renewal rule (distinct from first-subscription activation).
10. Client account closure is requested by contacting administration **outside LIFTER**; administration reviews and executes, preserving legally required records. No self-service account-delete request UI.

## BRD-05. Trainer accountability and workforce policies

- New clients are automatically assigned across authorized trainers by balanced client count; assignment identifies a **responsible trainer**, not an exclusive access boundary.
- All trainers in the same authorized workspace may collaborate on its clients and plans; helper contributions are separately auditable. The designated responsible trainer receives productivity credit for the first auto-delivered workout and nutrition plans.
- **One productivity unit = one complete initial workout and nutrition plan set per client per subscription**. Extra edits/revisions/extra plans in the same subscription do not earn another unit. A renewal counts only if genuinely new plans are delivered. Genuine completed delivery remains credited even if a later refund occurs.
- Four KPI categories: plan deliveries, timeliness, follow-ups handled, and service quality. Platform Owner sets weights totaling 100% and performance targets. If no new clients are assigned, the new-delivery category is not evaluable and its weight redistributes proportionally; never punish the trainer for lack of assignments. Check-in performance measures handling of check-ins **received**, not whether clients send them.
- Service quality is assessed manually by Platform Owner; changes to monthly targets take effect the next month. Owner may correct attribution with a recorded reason/audit trail.
- Trainers have **fixed base salaries** and potential KPI-linked incentives. **Platform Owner decides incentive amounts manually**; do not automatically calculate salary bonuses from KPI scores. Trainers see own salary/KPI only. Payroll approval means **actually paid**, so approval must not occur before the external transfer. No second “confirm paid” step.
- Delivery delays trigger notifications to Platform Owner, Workspace Owner and responsible trainer. Rolling 90-day delay/strike progression at 3/6/9 delayed cases is subject to **human Platform Owner review and authorization**, including any deduction or termination; never auto-fire or auto-deduct. Preserve attribution/audit and historical payroll when access is revoked or clients reassigned.
- No SLA escalation engine for food-replacement requests. Avoid rare trainer-transfer edge-case workflows unless demonstrated necessary.

## BRD-06. Reporting and operating scope

- Workspace operational reporting: revenue, active clients, renewals, expiring/expired subscriptions, delivered plans and relevant coach workflow indicators.
- Client directory supports search, filters and actionable indicators (new check-ins, pending food replacements, plans waiting for delivery).
- Client has a concise chronological timeline of **meaningful** events (registration, renewal, delivery, trainer assignment changes, replacement requests), alongside normal detailed histories. Do not duplicate every microscopic audit event into the timeline.
- **Platform Owner alone may export comprehensive client datasets.** Workspace Owners do not get comprehensive client-data export. Existing per-plan PDF/Excel and permitted reports are separate features.
- **No bulk client actions**: plans, forms and account modifications are processed per client, not mass-assigned or mass-edited.
- LIFTER and YBS are **independent systems**. There is no live sync or mandatory migration. Selective import from YBS may be considered later only after explicit approval.

---

# PART II — PRODUCT REQUIREMENTS DOCUMENT (PRD)

## PRD-01. Core product surfaces

### Platform Owner console
- Workspace creation and lifecycle; package availability, pricing and commission configuration; workspace memberships/roles and staff access; all-workspace revenue/client/subscription summary and workspace drill-down.
- Client registration/payment and refund administration within authorized boundaries; staff KPI targets, attribution overrides, salary and manually assigned incentive review, payroll approval-after-payment, disciplinary decisions.
- Read complete audit history across workspaces; global client-data export; manual password-reset link generation; global shared exercise/food/form/template governance as decided.

### Workspace Owner console
- Workspace-specific dashboard, finance and operational reporting, clients, plans, forms, notifications and branding preview/publish.
- All coaching actions allowed, but no platform-only access/financial/salary changes. Audit history restricted to their workspace.

### Trainer workspace
- Search/filter client directory; work on any client in assigned workspace(s); assigned-accountability indicators; intake answers, measurements, trainer notes, workout and nutrition planning, check-ins and replacement requests.
- Own KPIs and salary visibility. No access to others' salaries, platform-wide exports or unrelated workspaces.

### Client portal (web)
- Minimal dashboard highlighting workout and nutrition; other information in dedicated tabs.
- View published workout plans; **no workout set/repetition logging, workout timers or exercise session recording on web**. Such activity tracking belongs to a possible future mobile app.
- View published nutrition plans and select approved food alternatives; **no daily meal checkboxes, food-consumption log or calorie diary on web**. Adherence is evaluated via weekly forms.
- Forms, measurements, subscription, notifications, account settings and history as permitted. Progress photos are exchanged over Telegram; **no web photo upload or automatic Telegram photo ingestion**.
- Arabic/English UI switch; coach-authored plan text is displayed as authored, not automatically translated.
- Client may change display name and profile image. Changing email or phone requires administration. Password reset: self-service email link **or** Platform Owner-generated manual reset link.

## PRD-02. Registration and authentication

**Required**
- One-time, package-bound, workspace-bound post-payment registration tokens, 24-hour validity and 30-minute in-progress grace.
- Token replay prevention, safe concurrent signup behavior and no accidental token consumption on failed form submission.
- Branded bilingual **registration form only**, with no public marketing pages in the client registration flow, pre-sale chat button or checkout. A public premium marketing Landing Page for prospective Workspace Owners (services overview; Login, Work With Us and Apply CTAs) is approved as a **deferred feature after core platform completion** (PO, session 14, 2026-10-30); invitation-only client registration remains unchanged.
- Unique account identity according to workspace separation and approved email/phone collision policy; safe rejection and deletion handling.
- Email/password sign-in; **no mandatory two-factor authentication**. Multiple simultaneous devices are allowed; **no special device/session management screen**.
- Self-service email password reset and Platform Owner manual reset links, with secure expiry, single-use properties and audit.
- Staff authorization enforced server-side for every sensitive operation; roles consistent across authorized workspaces.

**Acceptance checks**
- Token cannot register a second client, cannot be switched to a different package/workspace, and does not fail simply because another customer shares an IP.
- A signup started before expiry can finish inside the agreed grace; a brand-new start after expiry is refused.
- An unauthorized workspace member cannot query another workspace by changing URLs, identifiers, exports or bot commands.

## PRD-03. Onboarding and form engine

- Form builder supports globally shared forms/templates and workspace-local copies/assignments as approved; assignment captures a versioned independent snapshot so edits do not retroactively alter submitted forms.
- Mandatory intake is one form with Basic / Workout / Nutrition sections, conditional single-question progression and autosave; relevant answers surface in the appropriate plan editors.
- Weekly check-ins recur every seven days from subscription activation, including Fridays; freeze pauses scheduling and resume continues according to approved schedule behavior. Previously outstanding forms remain visible.
- Check-in reminders align to the assigned form's day; Telegram bot may send configured day/time/text/repetition when the recipient has linked the bot, alongside appropriate website notifications.
- Submission histories and coach processing states are recorded. Weekly check-in completion is **not** a login gate.
- Client intake uses visual body-fat image cards (F15, PO, session 14, 2026-10-30); Trainer-facing body-fat display remains a numerical percentage.

**Acceptance checks**
- Initial form autosave survives navigation; conditional questions render correctly; correcting answers does not reset first-delivery SLA.
- Historical submitted form remains readable after template updates.
- A frozen client does not receive inappropriate active-cycle check-in prompts.

## PRD-04. Workout planner

- **Canonical global exercise library** with stable exercise identity, searchable metadata and workspace-specific exercise/video variations. Trainers may add workspace-specific exercises; global exercise governance remains central.
- Workout template library contains both shared/global templates and workspace-specific templates. Trainers can create/edit their workspace templates.
- Planner supports sessions, rest days, exercise search/add/reorder/cross-day drag-and-drop, duplicate exercise/day, warm-up and working sets, per-set repetitions, load/weight fields, rest, RIR, notes, optional exercise alternatives and video references.
- Platform Owner may define default warm-up/working set, rep, rest and RIR values; trainer may customize a client's plan.
- Volume reporting counts working sets and supports agreed fractional credit for secondary muscles.
- Multiple plans per client can be published and retained; newest shown first. Edits to published plans create versions; session-version continuity must be respected if/when mobile logging is later introduced.
- Client web displays plans without session logging. PDF and Excel export available. **Hevy integration/export is excluded.**
- No AI-generated exercise alternatives; use approved manual alternatives and coach control.

**Acceptance checks**
- Global exercise canonical identity is not lost when a workspace uses its own video.
- Reordering or copying exercises does not corrupt set parameters or client plan versions.
- Export represents the selected plan/version correctly; no Hevy workflow appears.

## PRD-05. Nutrition planner and food data

- Shared/global food database with structured nutrition values, serving units and reliable per-quantity calories/protein/carbs/fat. **Trainers may add foods directly to the global food database**, without a moderation approval queue. Validation and duplicate detection are required; do not block ordinary additions behind bureaucracy.
- Nutrition templates may be global/shared or workspace-owned. PO exclusively manages global templates; authorized workspace staff manage workspace templates. PO may use **Make it Global** on an eligible template after removing private data and references. Loading always creates an independent copy. (D18-1 amendment, PO S20 Message B section 3.)
- Plan editor supports meals and foods, drag/reorder/duplicate, per-meal notes, optional recipes/video links, daily macros/calories and a repeating single-day or seven-day structure (including carb cycling and different day targets). Conditional pre-workout meals may be omitted on rest days.
- Multiple published nutrition plans for the same client **are allowed**, including multiple simultaneously eligible plans; show all with dates, newest first. Do not auto-archive older plans or delete their logs/history.
- Coach-configured manual food alternatives with precise gram amounts and calculated macros; unified client-visible alternatives, not separate 'strict' versus 'functional' lists. Approved replacement can become the selected food, with prior original remaining as an alternative where valid.
- Client can request food replacement in free text; at most one open request per food. Pending requests do not hide existing approved alternatives. Coach may approve by updating/publishing the plan revision, or reject. If target food is removed in a newer version, stale request closes appropriately.
- A plan revision preserves the original published version and audit; client-selected alternatives and exports must reflect current permitted selection without silently overwriting coach-authored source.
- Offline alternative selections (if a client-capable offline surface exists) queue/sync; latest valid server-accepted selection wins. Do not promise full offline web support without design validation.
- Web portal **does not** track meal consumption or calories eaten. PDF and Excel plan export supported.

**Acceptance checks**
- Portions and alternatives compute nutrition consistently, including units; invalid gram-based swaps do not silently alter macro values.
- Multiple nutrition plans stay visible without a one-active-plan constraint.
- Trainer addition of global food is immediate but duplicate/invalid nutrition entries are controlled.

## PRD-06. Plan delivery, activation and revisions

- First subscription's activation gate is delivery of both a workout plan and a nutrition plan. Publishing one plan alone does not activate it.
- First workout and nutrition plans may be delivered independently, including on different days. Subscription activation occurs exactly once after both first plans are successfully delivered; no paired-publish transaction is required. Each delivery is secure, idempotent and concurrency-safe. Later plan edits never restart activation. The responsible trainer is recorded for accountability; other trainer contributions are recorded independently. (PO S20 Message B section 4; supersedes paired-delivery transaction wording.)
- Deadline calculated from mandatory intake submission: five working days, Friday excluded; before 18:00 counts as first day, after 18:00 starts next working day.
- Delays trigger alerts to responsible trainer, Workspace Owner and Platform Owner; strike review is human-governed.
- Additional plan revisions during a subscription do not create new first complete workout and nutrition plan set productivity credit. Renewals require actually delivered new plans to generate a new credit.
- Keep versions, authorship, approval/publish actions, assignment changes and meaningful timeline entries.

## PRD-07. Subscriptions, installments, refunds and expiry

- Package selection is server-authoritative and linked to registration token. Price/commission snapshots immutable at purchase; later package edits apply prospectively.
- External payment confirmation is required before account/renewal approval. Avoid representing unverified cash as received.
- For applicable three-month installments: 50% + 50%; second installment due end of first month measured from activation; late installment restricts plans and prompts staff/client notices as approved.
- First activation occurs after both initial workout and nutrition plans are delivered (independent delivery records); renewal activation is immediate under the approved renewal behavior. Freeze affects eligibility and weekly forms, and must preserve agreed extension/history rules.
- Client expiration notifications at 3 days, 1 day and on expiry; access to plans/export stops at expiry but account/settings/support-related visibility remains. Do not add in-app 'request renewal' or external renewal CTA: client sees an expiry alert only.
- Full and partial refunds create immutable reversal ledger events. Deleted/closed accounts retain legally necessary financial/audit history.
- Exact duration arithmetic, freeze limits and schedule edge values must be verified against the signed-off original decision log before implementation; **do not guess them from YBS code**.

## PRD-08. Trainer workflow, KPI and payroll

- Balanced initial client assignment across workspace trainers. Workspace trainers collaborate freely; assignment drives accountability and KPI credit, not exclusive authorization.
- Productivity measured as a complete first workout and nutrition plan set per subscription. Owner-approved corrections have recorded reasons.
- Four weighted KPI categories (delivery, timeliness, handled check-ins, manually rated service quality), 100% total; not-evaluable delivery category weight redistributed if trainer has no new assignments. Target changes next month only.
- Fixed salary plus Platform Owner manually selected incentive; KPI is decision support, not a bonus-calculation engine. Owner-only all-staff payroll visibility; trainer own salary/KPI only.
- Approval marks salary **paid**; no separate payment confirmation. Any strike/deduction/dismissal requires Platform Owner authorization; 3/6/9 rolling 90-day progression tracked without automatic firing.
- Trainer departure revokes access promptly, clients reassigned, historical attribution and payroll preserved.

## PRD-09. Client progress, notes and timeline

- Measurements can be entered by client manually and through weekly forms. Authorized coach may correct measurements with edit history. Avoid duplicate same-day measurement records.
- Progress photographs remain in Telegram conversation, not in LIFTER storage or web uploads.
- Trainer Notes per client: all authorized trainers in that workspace can read, create, edit and delete each other's notes, with author/change/deletion audit; internal-only, never in client exports.
- Client timeline lists meaningful milestones, not every audit write.
- Optional top-five leaderboard with client names/profile photos requires Platform Owner approval before publishing; ensure participants know they may appear and can request removal/opt out. Do not impose universal prior opt-in as an extra signup gate.

## PRD-10. Notifications and Telegram bot

- In-site notifications for onboarding/plan delivery, new check-ins, food replacement requests, subscription expiry, late installments and relevant trainer/owner events.
- **One shared LIFTER Telegram bot for all workspaces.** Clients may link optionally; the same Telegram identity may connect to multiple workspace-specific accounts, with a workspace selector **only when needed**.
- Client bot: notifications, fetch workout/nutrition plan, open links to check-in forms and food replacement requests. Staff bot: operational alerts and lookup by client code for plan/subscription summary.
- Bot queries and outgoing messages must check current role, workspace membership and account link. Do not expose private cross-workspace data.
- Reminder day aligns with form's weekly day; configured time/text/repetition supported as agreed, subject to Telegram delivery capability and opt-in/link status.
- **No in-app chat**, no support-ticket module, no in-account support CTA, no bulk marketing announcements through LIFTER. Direct coach-client conversations and mass announcements are handled externally via Telegram channels/groups.
- Business Telegram auto-reply behavior for expired clients was discussed; feasibility depends on the actual Telegram Business integration, not standard bot API. Treat as integration feasibility validation, not a guaranteed basic bot feature.

## PRD-11. Search, reporting, exports and audit

- Server-authorized searchable client directory with relevant filters and work indicators; no bulk client actions.
- Workspace-specific operational reports (finance, active clients, renewals, expiry, plan delivery) and platform aggregate summary/drill-down.
- Platform Owner can inspect all audit events; Workspace Owner sees their own workspace audit. Coach sees contextual plan/history information needed for their work, not the full cross-workspace audit.
- Audit covers permission changes, subscription/payment/refund events, plan edits/publishing, form events, trainer notes, reassignment, KPI/compensation corrections and account actions. History must be tamper-resistant within authorization model.
- Only Platform Owner exports complete client datasets. Client plan PDF/Excel exports are separate, subject to plan-access restrictions and current valid food selections.

## PRD-12. Explicit exclusions and deferred scope

**Do not implement or plan as approved scope:**
- Public marketing/landing pages per workspace, price pages, testimonials, FAQ or pre-sale lead CRM in LIFTER remain excluded. A public premium marketing Landing Page introducing LIFTER to prospective Workspace Owners (services overview; Login, Work With Us and Apply CTAs) is approved only as a **deferred feature after core platform completion** (PO, session 14, 2026-10-30); invitation-only client registration remains unchanged.
- Integrated payment gateway or platform collection of customer payments.
- Tracking cash settlements/transfers of LIFTER commissions from workspaces.
- In-app direct messaging, helpdesk tickets, support buttons, mass broadcasts or in-app renewal requests.
- Self-service account deletion or self-service changes to email/phone.
- Bulk client actions, bulk assignment of forms or plans, or bulk subscription changes.
- Web workout logging/timers; web meal check-offs/calorie diary; web progress photo uploads.
- A standalone educational-content library.
- Hevy import/export/integration.
- Unapproved nutrition-template ownership or publishing. Workspace-owned templates are now allowed only under the D18-1 amendment: authorized staff manage workspace templates; PO manages global templates and may safely Make it Global without private data or references. (PO S20 Message B section 3; supersedes this exclusion.)
- AI-generated exercise alternatives or a mandatory food-addition approval queue.
- Automatic salary bonus computation, auto-deductions or automatic termination.
- Mandatory 2FA, one-device-per-account restriction or device-management screen.
- Full migration/synchronization with YBS; a native mobile app is a future separate product scope, not assumed part of the web MVP.

## PRD-13. Non-functional requirements and quality gates

1. **Authorization:** server-side tenant and object-level access controls; deny by default; cross-workspace penetration tests for APIs, exports, bot, storage and background jobs.
2. **Data integrity:** transaction-safe signup/token consumption, idempotent payment/approval and plan-delivery events, immutable ledger, reliable version history and retries.
3. **Privacy:** least-privilege views, secure reset links, retention/legal deletion policy, protection of client health/fitness information, auditable access to sensitive actions.
4. **Localization:** Arabic RTL and English LTR for UI, forms, notifications and exports where supported; no automatic translation of trainer-authored content.
5. **Reliability:** safe job retries and deduplication for reminders, Telegram notifications and recurring check-ins; avoid duplicate subscriptions or payouts.
6. **Performance:** pagination/filtering for growing client/food/exercise directories, practical mobile web performance and graceful loading states.
7. **Accessibility/usability:** responsive layouts, legible data-dense planner screens, keyboard access, accessible form inputs and error handling.
8. **Observability:** audit trails, errors, job failures, Telegram delivery/link status, financial reconciliation and operational metrics; avoid exposing private data in logs.
9. **Deployment discipline:** staging/local validation, migration/backout strategy and explicit user approval before production deploy; do not change the existing YBS production system while designing LIFTER.

## PRD-14. High-value end-to-end acceptance journeys

**Journey A — paid new client:** workspace receives external payment → staff issues correct branded package link → client signs up once → owner confirms payment/approves → mandatory intake autosaves and submits → deadline computed → trainers prepare both plans → auto-delivery activates subscription → client views plans and receives appropriate notifications.

**Journey B — trainer collaboration:** responsible trainer and helper trainer both edit authorized client plans → source/version/contribution history persists → first complete workout and nutrition plan set credits only responsible trainer → KPI excludes double-counting from revisions → Owner can audit and correct attribution.

**Journey C — food substitution:** client views nutrition plan and approved alternatives → chooses valid alternative → may request new replacement → trainer revises/publishes → client sees updated alternatives and all historical eligible plans → no web food diary is created.

**Journey D — renewal and installments:** client sees expiry notice → contacts workspace and pays externally → admin confirms and records renewal → immutable financial event/snapshot and correct subscription access; where installment applies, overdue second installment restricts plan access without disabling account login.

**Journey E — workspace isolation:** staff belongs to multiple authorized workspaces with consistent role → chooses appropriate context → cannot view or mutate unrelated workspace records via any surface, including bot/export/background operations.

**Journey F — coach payroll:** platform sets KPI weights/targets → received check-ins and initial plan sets counted → no-assignment KPI reweighting works → owner manually rates quality/incentive → actual payment made outside system → owner approves payroll as already paid → trainer sees only own result.

**Journey G — account closure:** client contacts admin externally → authorized admin reviews closure → client access closed and personal data handled under applicable retention rules → historical financial/audit records remain valid.

---

# PART III — DECISION REGISTER AND REVIEW RULES

## DR-01. Decisions locked by discovery

| Area | Binding choice |
|---|---|
| Public experience | Invitation-only post-payment branded bilingual client registration; public premium marketing Landing Page for prospective Workspace Owners is approved as deferred until after core platform completion (PO, session 14, 2026-10-30) |
| Sales & renewals | Payment and customer communication external; no payment gateway or in-app renewal request |
| Registration | One-time 24h link, +30min grace for started forms, package/workspace bound |
| Activation | First subscription starts when both initial plans are delivered |
| Workspace | Strict isolation, Platform Owner central control; Workspace Owner branding control |
| Staff | Consistent role across authorized workspaces; trainers collaborate across clients within workspace |
| Form engine | Mandatory 3-section intake; conditional autosave; weekly check-ins and versioning |
| Workout | Shared + workspace templates; canonical global exercises; no web logging; PDF/Excel |
| Nutrition | Global templates; trainers add global foods; manual alternatives; multiple published plans |
| Telegram | One shared bot; client plan/forms links; staff code lookup; optional client linking |
| Client experience | Minimal dashboard; bilingual; manual measurements; Telegram-only progress photos |
| Client account | Self-edit display name/photo only; email/phone admin; self + owner reset links |
| Operations | No bulk client actions; no built-in chat, helpdesk or mass announcements |
| Financial | Workspace receives payment; owed commission only, no interparty settlement ledger |
| Payroll | Fixed salary, manual incentive, approval means paid; KPI and strike human review |
| Export | Platform Owner only for comprehensive client data; PDF/Excel plans allowed |
| Security UX | Email/password; no mandatory 2FA or device-management UI; owner/workspace audit scopes |
| YBS relation | Independent systems; possible selective future transfer, no live sync |
| Closure | Account closure requested and reviewed outside platform |

## DR-02. Items to verify, not invent

The 44 rounds completed business discovery; the following items need **evidence-based reconciliation from original answer transcripts** before an engineering team turns them into numeric tests or irreversible migrations. These are not invitations to restart broad discovery:

- Exact allowed package tier/duration combinations, display names, and each workspace's configured prices/commission percentages. Do **not** assume historical YBS rates or prices.
- Precise subscription duration calendar arithmetic and previously agreed freeze allowances/extension details.
- Exact client email/phone global uniqueness and account closure data-retention behavior, including jurisdictional obligations.
- Specific form-builder permission matrix, Telegram reminder default clock times and repeated-message constraints where the original round did not specify a stable value.
- Exact commission/refund/installment allocation math on partial refunds and discounts, using the original finance decisions.
- Exact role rights for Sales beyond being distinct from Trainer; verify original approvals rather than guessing.
- Existing platform codebase/repository and technology constraints, if any: LIFTER is not automatically a rename of YBS.

If original transcripts are not available, mark each as **NEEDS SOURCE CONFIRMATION**, propose a conservative default separately, and do not assert the default as user-approved.

## DR-03. Conflict resolution

- Latest explicit user clarification overrides older multiple-choice selection or assistant suggestion.
- LIFTER decisions override analogous YBS behavior.
- If the product decision conflicts with legal/security constraints, **identify the conflict and a compliant mitigation**, without silently overriding the business choice.
- Preserve the distinction between **approved**, **proposed**, **requires source verification**, and **technically infeasible**.
- Do not reopen settled decisions with unlikely hypotheticals. Raise only materially consequential, evidence-backed gaps.

---

# PART IV — INSTRUCTIONS TO CLAUDE (COPY AS THE INITIAL MESSAGE)

You are receiving the approved LIFTER BRD/PRD from a completed 44-round discovery. Act as a **skeptical principal product architect, business analyst, engineering lead, security reviewer and delivery strategist**, not a passive yes-man.

**Your assignment is to BEGIN THE PLANNING AND CRITICAL REVIEW, NOT CODING.**

1. Read the **entire** document, including exclusions and decision register. Treat explicitly approved decisions as locked; do not silently import YBS functionality or assume this is a rebrand.
2. Produce an **executive critique**: what is coherent, what is unnecessarily complex, what has material technical/financial/privacy risks, and what might fail under real multi-tenant usage. Distinguish actual contradictions from speculative edge cases.
3. Produce a **requirements traceability matrix** mapping every major BRD objective to PRD modules, acceptance journeys and proposed validation tests. Call out any important business requirement that lacks a corresponding product behavior.
4. Propose a **pragmatic architecture** with alternatives and trade-offs: data model and tenant boundaries, authorization/RLS or equivalent, auth/reset, ledger, forms/versioning, plan/versioning, job scheduling, Telegram integration, reporting and export, observability and deployment. Do not assume the current YBS stack must be reused; justify any proposed stack.
5. Create a **phased implementation roadmap** with dependency order, milestones, MVP scope, subsequent phases, critical path, engineering workstreams, migration/testing strategy, and realistic risk-based effort ranges. Respect all explicit exclusions; don't quietly defer approved core functionality without explaining the consequence.
6. Give a **prioritized improvement register**: each suggestion must include (a) current approved behavior, (b) your proposed change, (c) benefit, (d) complexity/cost, (e) risks, (f) whether it needs the user's explicit approval. Prefer 5–10 meaningful improvements over dozens of minor UX ideas.
7. Provide a **security/privacy/financial correctness review**: cross-tenant attack surfaces, immutable financial snapshots, refund math, single-use link concurrency, payroll state semantics, Telegram identity mapping, client health data and legal account-closure handling.
8. List only **blocking clarifications** that materially change architecture, money, permissions or legal compliance. First attempt to resolve them from the provided document. Mark missing historical numeric details as source verification rather than inventing them.
9. Include a **decision-change log** with separate columns: APPROVED (source document), RECOMMENDED (your proposal), NEEDS SOURCE CONFIRMATION, and BLOCKED BY FEASIBILITY/LAW. Never blur these statuses.
10. **Do not implement, modify repositories, run migrations, deploy, create accounts, send messages, or make production changes** until the user explicitly reviews and approves the plan. Do not start another 44-round discovery. Deliver a coherent, critical plan and ask for approval of only material proposed deviations.

**Response language:** Egyptian Arabic for explanations and recommendations, using English technical terminology when it adds clarity. Be concise but substantive, challenge weak decisions with evidence, and avoid repetitive hypothetical edge cases.

**First output structure:** (1) overall assessment, (2) top risks/contradictions, (3) proposed architecture, (4) phased roadmap, (5) prioritized suggestions with approval flags, (6) source-verification checklist, (7) the few decisions that genuinely block implementation planning.

---

**End of consolidated LIFTER BRD/PRD — planning handoff.**
