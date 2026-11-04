# LIFTER — Phased Roadmap (DRAFT)

Effort is given in **engineer-weeks (ew)** of focused implementation plus review, assuming AI coders (Codex) under Claude review. Treat the ranges as risk-based, not commitments. Calendar time depends on how fast the source-confirmation items resolve.

## Dependency order

```
P0 Foundation ──► P1 Commercial core ──► P2 Forms+Intake+SLA ──► P3 Catalogs+Planners ──► P4 Delivery+Portal  = MVP
                                                                                              │
                         P5 Check-ins/Measurements/Replacements/Notes/Timeline ◄──────────────┤
                         P6 Telegram bot ◄────────────────────────────────────────────────────┤
                         P7 KPI/Payroll/Strikes ◄── needs P4 delivery events + P5 check-ins ──┘
                         P8 Reporting depth, PO export, leaderboard, hardening
```

Critical path: P0 tenancy/auth → P1 token+subscription+ledger → P3 planners (largest) → P4 independent first-plan delivery and activation.

## Phases

| Phase | Scope | Journeys | Effort | Blocking inputs |
|---|---|---|---|---|
| **P0 Foundation** | Repo, CI, Supabase (staging+prod) + RLS scaffolding, authorize() + permission matrix, Supabase Auth + custom SMTP, audit log, **Design System** (tokens, AR/EN RTL components, states), outbox jobs + cron Worker, isolation test harness, **encrypted backups + first restore test**, free-tier spike (OpenNext bundle/CPU, Supabase limits), browser Arabic PDF spike | E (skeleton) | 4–7 ew | — |
| **P1 Commercial core** | Workspaces, memberships, branding preview/publish, PO-only packages + versions (30-day months: 1/3/6/8/12, custom days), registration tokens (24h/+30m) with staff-configured installment schedule, global email/phone uniqueness + generic duplicate message, signup, approval, subscriptions + snapshots, ledger (confirmed payments, PO full refunds), per-payment commission, installment overdue restriction/resume, freeze (apply/stop/remove), early-renewal stacking, expiry, PO-only deletion/removal | A (to approval), D, G | 5–8 ew | — |
| **P2 Forms + intake + SLA** | Form templates/versions, assignment snapshots, conditional logic, autosave, mandatory 3-section intake, Cairo business-calendar SLA, delay alerts (in-app); includes REQ-P2-01 (post-approval automatic form assignment) | A (intake → deadline) | 3–5 ew | Form-builder permissions |
| **P3 Catalogs + planners** | Global exercises (+ workspace variations), global foods (add, dedup, versions), workout templates (global + workspace), global and workspace nutrition templates, workout planner, nutrition planner (alternatives, 1/7-day, carb cycling), plan versions, PDF/Excel export | C (partial) | 6–10 ew | F13 subscription lifecycle (hard dependency for F17/F18) |
| **P4 Delivery + client portal** | Balanced auto-assignment, independent first workout/nutrition deliveries (possibly on different days), exactly-once activation after both succeed, productivity-unit insert, client dashboard (plans, subscription, notifications), in-app notifications, client directory + indicators, plan-access restriction (expiry/overdue), **minimum finance reporting** (workspace: collected, refunds, commission owed, share, active/expiring; PO: aggregate + drill-down) | A (complete), B (partial), E | 4–6 ew | F17/F18 delivery integration; finance math for commission figures |
| **Limited pilot total** | P0–P4: a sequencing step only (D-07) | A, D, E, G (+ C partial) | **22–37 ew** | |
| **Full Launch (mandatory scope)** | Pilot + P5–P8: **all approved features**, none optional except where the BRD itself says so (leaderboard needs PO approval to publish) | A–G | **+10–17 ew** | Full Launch can't be declared with any approved feature missing |
| P5 Coaching loop | Weekly check-ins + freeze, measurements, food replacement requests, trainer notes, timeline | B, C | 3–5 ew | C1 check-in anchor, freeze rules |
| P6 Telegram | Linking, client commands, staff lookup, reminders, outbound queue | E (bot) | 2–4 ew | Reminder defaults; Business auto-reply = spike |
| P7 Workforce | KPI periods/weights, reweighting, manual quality, payroll (approve = paid), strikes view, departure/reassignment | F | 3–4 ew | — |
| P8 Hardening | PO aggregate drill-down depth, PO full export, leaderboard (if legal OK), external pen-test, perf | — | 2–4 ew | Legal review (C4) |

**Production gate:** the encrypted backup restore test has passed, and jurisdiction/retention (B4) is known before real client data goes live.

**Pilot interim (until P5–P7 land; features are sequenced, not removed):** without P5 the MVP has no weekly check-ins, so adherence feedback runs over Telegram manually during early use. Without P7, KPI/payroll stay outside LIFTER. Data still accrues from P4 delivery events, so KPIs can be computed back-dated once P7 lands. Without P6 there are in-app notifications only.

## Quality gates (every feature, enforced by Claude review)

1. Constitution, Specify, Clarify, Plan, Tasks, and Analyze are complete before code. Clarify explicitly records zero open ambiguities when none remain; Analyze is dated after the latest spec/plan/tasks change and has zero open CRITICAL/HIGH findings (S29-PO-2; S29-PO-3 Q1).
2. Typecheck + lint + unit tests green in CI (integration tests join the CI gate from P0-F3, when the Supabase schema exists). Implementation agents execute tests; Claude verifies required CI evidence on the exact PR head and does not rerun tests locally.
3. **Isolation gate:** every new tenant table has RLS + a composite FK, and every new endpoint/job/bot command has a foreign-workspace negative test.
4. **Money gate:** ledger/payroll changes include immutability + idempotency tests. Amounts are integers only.
5. Migrations are forward-only, reviewed and reversible-by-expand/contract. Destructive ones need PO approval.
6. AR (RTL) + EN screenshots or a Playwright check for any new UI.
7. No PII in logs (log-scrub test on new log sites).
8. Release to staging only. Prod needs explicit PO approval.

## Testing strategy

- Unit: calendar/SLA, commission calc versions, KPI reweighting, macro/unit math (table-driven).
- Integration (real Postgres): RLS, token concurrency (parallel submits), independent first-plan delivery and activation, ledger triggers.
- E2E (Playwright): Journeys A, D, E, G for MVP; B, C, F as their phases land.
- Pre-launch: external cross-tenant pen-test (PRD-13.1).
- Migration from YBS: none (BRD-06). A selective import is a separate, later approval.

## Approved migration allocations (UTC)

| Feature | Migration range |
|---|---|
| Hero follow-ups | 20261105000000-20261105235959 |
| F16 catalogs | 20261106000000-20261106195959 |
| Plan Core | 20261106200000-20261106235959 |
| F17 workout planner | 20261107* |
| F18 nutrition planner | 20261108* |

All migration timestamps use valid UTC clock fields. F16 and Plan Core ranges are adjacent and non-overlapping.
