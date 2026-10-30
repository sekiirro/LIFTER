# LIFTER — Decision Register (FINAL, PO 2026-10-27; amended 2026-10-28 (D-22..D-26), 2026-10-29 (D-27), and 2026-10-30 (D-29))

Statuses: **APPROVED** · **SUPERSEDED** · **OPEN**. Later decisions supersede earlier ones (DR-03). Binding together with BRD DR-01.

## Approved decisions

| Id | Area | Decision |
|---|---|---|
| D-03 | Delivery deadline | 5 working days, Friday excluded (no other holidays). Before 18:00 → submission day counts; at/after 18:00 → next working day. Africa/Cairo. |
| D-04 | Early renewal | Remaining days preserved; new duration starts when the current one ends |
| D-05 | Freeze | Pauses and extends entitlement, with a configurable duration. Stop keeps elapsed frozen days; Remove reverses the effect. Every change audited. |
| D-06 | Hosting | Next.js + Cloudflare + serverless, $0 recurring initially, Supabase Free validated in P0 |
| D-07 | Scope | All approved features preserved; the pilot sequences and never removes Full Launch scope. P0 includes the Design System. |
| D-08 | Accounts | Client email and phone globally unique. Email/phone/username collisions → one field-neutral duplicate response (PO s15 Q2 B; wording DRAFT pending PO approval, see `specs/015-forms-intake/reports/S16-q2-duplicate-copy-draft.md`). No verification code, no workspace disclosure, token not consumed, no merge or transfer. |
| D-09 | Permissions | PO, WO, Sales: approve registrations, record renewals and installment payments, manage freezes, configure installment schedules on links. Trainers: generate links with approved settings. |
| D-10 | Refunds & deletion | Platform Owner only |
| D-11 | Pricing & durations | Only PO sets/changes prices and durations. 1/3/6/8/12 months (month = 30 days) or custom days. |
| D-12 | Installments | Schedule configured on the link (PO/WO/Sales). Overdue → plans restricted, login kept, notices sent, access resumes on confirmed payment. |
| D-13 | Commission | Earned per confirmed collected payment at the purchase-time rate and price snapshot. Unpaid balance earns nothing. Payment belongs to its collection month. |
| D-14 | Backups | Encrypted local DB + storage exports with restore testing, $0 |
| D-15 | Refunds | **Full refund only** = 100% of the amount actually collected. Reverse all collected revenue and commission, cancel unpaid installments, keep immutable history. No partial refunds. |
| D-16 | Identities | Staff and client accounts use separate emails. No dual-role accounts. |
| D-17 | Installment total | Installment amounts must sum exactly to the PO-approved price |
| D-18 | Design System | [DESIGN.md](../DESIGN.md) approved (2026-10-27): emerald `#059669` default brand (not lime), workspace-customizable colors with WCAG 2.2 AA contrast guard, dark + light modes (device first, manual choice persisted). Constitution VIII amended to v1.1.0. Open items in DESIGN.md §11 stay open. |
| D-19 | Auth & manual recovery (2026-10-27) | Supabase Auth, no external SMTP for now. PO, WO and authorized Trainers may generate a manual recovery link from a client's profile, only server-side (privileged credentials never reach the browser), behind capability + workspace scope, audited (`recovery_link.generated`), shown once, never logged, rate-limited. Extends BRD line 104 (PO-only manual reset). Open sub-decisions ND-F4-1..7 in [specs/004-auth/spec.md](../specs/004-auth/spec.md). |
| D-20 | Hosting region (B4, part) (2026-10-27) | Supabase region **eu-central-1 (Frankfurt, EU)** for LIFTER is **APPROVED by the PO, including the legal question**. PO statement: YBS previously operated using German hosting without issues. Hosting: one dedicated LIFTER Free organization with **one** cloud project (production); development and testing use local Docker, with no cloud staging project. Never touch YBS. **B4 retention values remain OPEN** (client closure retention period, audit retention ND-F5-1) and still block production with real client data. |
| D-21 | Cloudflare account (2026-10-27) | The Cloudflare **LIFTER** account (`c3a2ab30d3888eda7071b02916732b69`) is the only target; **Free**, confirmed by the PO on 2026-10-27, with no paid subscription. Both Wrangler configs pin this account id. The personal account is never used for LIFTER. |
| D-22 | Workflow governance (2026-10-28) | Constitution 1.2.0 establishes PO-approved spec debate, agent/model routing, controlled parallel development, frontend design and main merge gates; see [docs/08-agent-workflow.md](08-agent-workflow.md) and [docs/09-frontend-design-gate.md](09-frontend-design-gate.md). |
| D-23 | F12 PO decisions (2026-10-28) | ND-F12-1..7 and DG-F12-1..4 are decided; F12 records approval, installments, commission, audit, rejection and in-scope PO-only correction reversal, and hands post-approval form assignment to P2 via REQ-P2-01 in the [F12 specification on branch 012-registration-approval](https://github.com/sekiirro/LIFTER/blob/7cc81d52a9ad8bc1d4aa8797122d1bb8162708f7/specs/012-registration-approval/spec.md) (update to a repository-relative link when the spec merges). |
| D-24 | F14 PO decisions (2026-10-28) | ND-F14-1..7 and DG-F14-1..3 are decided; F14 records roles, registration branding, locale fallback, three surfaces, history and Supabase Storage; local/CI Storage enablement is approved implementation work, hosted verification remains a production blocker, and the focused Sol Medium r2 critique was completed (8/8 accepted) in the [F14 specification on branch 014-workspace-branding](https://github.com/sekiirro/LIFTER/blob/21aa70bc88e6d18b66eeebc0b9c76fd33dcf625b/specs/014-workspace-branding/spec.md) (update to a repository-relative link when the spec merges). |
| D-25 | Workflow approvals (2026-10-28) | Independent features may proceed out of roadmap order with a maintained tracker; prepare second local Supabase stack configuration and verification only (provisioning/starting requires PO approval); Sol Medium is the absolute maximum including spec debates; one-time Terra Light skills refresh is not a routing change. |
| D-26 | Intermediate sub-branch merges (2026-10-28) | Intermediate merges of parallel sub-branches into their parent feature branch (e.g. 011-docs-drift into 011-client-accounts) are not merges into main: they require Claude independent review of the actual diff and green relevant CI on the exact head, and no separate CodeRabbit gate. Their content then passes the complete main merge gate (docs/08) in the parent feature PR before any merge into main. |
| D-27 | Adaptive Model Routing (PO, 2026-10-29; sessions 10 + 11) | Constitution amended to 1.3.0: cheapest capable reliable model by risk/sensitivity; GLM 5.3 Flash free for simple low-risk non-sensitive work, Luna High standard/moderate, Sol Medium complex/security/high-risk and spec-debate critique; escalation GLM -> Luna -> Sol; Sol High/xhigh prohibited; performance logging; at most six concurrent delegated agents (the orchestrating architect is not counted); each writer has an isolated worktree and branch; one DB user per stack. The stack lock covers service operations and database migrations, seeding, and shared-state writes. Sync impact: docs/08 mirrors routing and concurrency. Tests-first, exact-head push + pull_request CI, final-head CodeRabbit APPROVED, resolved threads, and explicit PO merge approval remain unchanged. |
| D-28 | GLM tier expansion (PO, 2026-10-29; session 11) | GLM 5.3 Flash free may take implementation, CI workflow, configuration and other low- to moderate-risk work when complexity, risk, cost and logged performance support it, with mandatory architect review of every GLM change and an agent proving the relevant tests pass. Genuinely high-risk security, Auth, RLS, SECURITY DEFINER, migration, admission, Storage policy and financial work stays on Luna High or Sol Medium; no third-party-routed model receives secrets or `.env` values. Recorded in constitution 1.3.0 (Development Workflow & Quality Gates) and docs/08. |
| D-29 | F15 D1 privacy-erasure exception (PO, 2026-10-30) | “1=A: Approve narrowly scoped Privacy Erasure exception. 2=B: Delete related answer-change AND access-view audit records. 3=B: Deletion log retains counts only, no IDs. 4=A: Automatic server-validated deletion only. 5=A: Respect Legal Holds; defer deletion and alert. 6=A: Approve security review and DB change plan. Strictly limit deletion to inapplicable answers and authorized related records. Preserve all Financial, Security and Unrelated Audit Records. Update constitution, specs and tests. Independently review security implications. Escalate genuine conflicts without inventing policy. Design approval only — NOT merge approval. Preserve all CI, CodeRabbit and PO merge gates.” Constitution VII allows only this narrow answer-erasure exception; migration work remains gated by F12/F14 merge and Stack C. |
| — | Architecture | [02-architecture.md](02-architecture.md) v3 APPROVED (R1, R2, R4, R5, R6, R7 adopted) |

## Superseded

| Item | Superseded by |
|---|---|
| D-01 (earlier permissions), D-02 (1/3/12/Custom) | D-09, D-11 |
| BRD-03 fixed 50/50 installment | D-12, D-17 |
| BRD-03 / PRD-07 "full/partial refunds" | D-15 |
| R8 verification-code collision disclosure; X2 | D-08 (rev.) |
| X1 installment-amount conflict | D-17 |
| X3 proportional refund commission | D-15 |
| Constitution v1.0.0 VIII "lime accent" | D-18 |
| Calendar-month default; B1, B2, B3, B5 | D-08, D-09/10, D-13/15, D-11 |
| "Staff email can't also be client" (technical note) | D-16 (policy) |

## Open (does not block the Constitution)

- **F4 auth sub-decisions (ND-F4-1..7):** Trainer permission, link delivery, link expiry, rate-limit values, client-target sequencing, staff recovery, self-service email reset timing. Expiry and limits gate production.
- **B4 (remaining):** client closure retention period and audit retention (ND-F5-1). Gates production with real client data only.
- Outstanding production gates: [07-production-readiness.md](07-production-readiness.md). Per the PO (2026-10-27), these do not block local development or PR merges.
- Phase-gated, no defaults approved:
  - check-in anchor (C1, P5)
  - form-builder permission matrix (P2)
  - secondary-muscle credit (P3)
  - catalog edit/merge rights (P3)
  - Telegram reminder defaults (P6)
  - deadline instant on day 5 (P2)
  - Sales coaching rights
