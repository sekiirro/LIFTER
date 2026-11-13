# LIFTER — Decision Register (FINAL, PO 2026-10-27; amended 2026-10-28 (D-22..D-26), 2026-10-29 (D-27), 2026-11-04 (S31), 2026-11-06 (S35), and 2026-11-08 (D-29..D-31))

Statuses: **APPROVED** · **SUPERSEDED** · **OPEN**. Later decisions supersede earlier ones (DR-03). Binding together with BRD DR-01.

## Approved decisions

| Id   | Area                                                                                                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-03 | Delivery deadline                                                                                            | 5 working days, Friday excluded (no other holidays). Before 18:00 → submission day counts; at/after 18:00 → next working day. Africa/Cairo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-04 | Early renewal                                                                                                | Remaining days preserved; new duration starts when the current one ends                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D-05 | Freeze                                                                                                       | Pauses and extends entitlement, with a configurable duration. Stop keeps elapsed frozen days; Remove reverses the effect. Every change audited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D-06 | Hosting                                                                                                      | Next.js + Cloudflare + serverless, $0 recurring initially, Supabase Free validated in P0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-07 | Scope                                                                                                        | All approved features preserved; the pilot sequences and never removes Full Launch scope. P0 includes the Design System.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-08 | Accounts                                                                                                     | Client email and phone globally unique. Duplicate → only "This email is already registered. Contact support." No verification code, no workspace disclosure, no merge or transfer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D-09 | Permissions                                                                                                  | PO, WO, Sales: approve registrations, record renewals and installment payments, manage freezes, configure installment schedules on links. Trainers: generate links with approved settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-10 | Refunds & deletion                                                                                           | Platform Owner only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-11 | Pricing & durations                                                                                          | Only PO sets/changes prices and durations. 1/3/6/8/12 months (month = 30 days) or custom days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-12 | Installments                                                                                                 | Schedule configured on the link (PO/WO/Sales). Overdue → plans restricted, login kept, notices sent, access resumes on confirmed payment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D-13 | Commission                                                                                                   | Earned per confirmed collected payment at the purchase-time rate and price snapshot. Unpaid balance earns nothing. Payment belongs to its collection month.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-14 | Backups                                                                                                      | Encrypted local DB + storage exports with restore testing, $0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D-15 | Refunds                                                                                                      | **Full refund only** = 100% of the amount actually collected. Reverse all collected revenue and commission, cancel unpaid installments, keep immutable history. No partial refunds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-16 | Identities                                                                                                   | Staff and client accounts use separate emails. No dual-role accounts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-17 | Installment total                                                                                            | Installment amounts must sum exactly to the PO-approved price                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D-18 | Design System                                                                                                | [DESIGN.md](../DESIGN.md) approved (2026-10-27): emerald `#059669` default brand (not lime), workspace-customizable colors with WCAG 2.2 AA contrast guard, dark + light modes (device first, manual choice persisted). Constitution VIII amended to v1.1.0. Open items in DESIGN.md §11 stay open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-19 | Auth & manual recovery (2026-10-27)                                                                          | Supabase Auth, no external SMTP for now. PO, WO and authorized Trainers may generate a manual recovery link from a client's profile, only server-side (privileged credentials never reach the browser), behind capability + workspace scope, audited (`recovery_link.generated`), shown once, never logged, rate-limited. Extends BRD line 104 (PO-only manual reset). **APPROVED by the PO (S31-PO-2 `SK-004-01`, "Confirm D-19 approved").** Decided sub-decisions: ND-F4-3 (60-minute expiry), ND-F4-4 (S31-PO-3 `SK-004-04`) and ND-F4-6 (clients only, S31-PO-2 `SK-004-06`). S35-PO-1 (2026-11-06): ND-F4-5 decided `ND-F4-5=A` (option a); ND-F4-7 decided: implement staff email password recovery now via Supabase Auth (specified in spec 004; implementation not yet started), built-in email temporarily for permitted test addresses only (2/hour), external SMTP required before general rollout. ND-F4-7 PDN items (PDN-F4-7-01 to 11) remain open; see [specs/004-auth/spec.md](../specs/004-auth/spec.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-20 | Hosting region (B4, part) (2026-10-27)                                                                       | Supabase region **eu-central-1 (Frankfurt, EU)** for LIFTER is **APPROVED by the PO, including the legal question**. PO statement: YBS previously operated using German hosting without issues. Hosting: one dedicated LIFTER Free organization with **one** cloud project (production); development and testing use local Docker, with no cloud staging project. Never touch YBS. **B4 retention values remain OPEN** (client closure retention period, audit retention ND-F5-1) and still block production with real client data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-21 | Cloudflare account (2026-10-27)                                                                              | The Cloudflare **LIFTER** account (`c3a2ab30d3888eda7071b02916732b69`) is the only target; **Free**, confirmed by the PO on 2026-10-27, with no paid subscription. Both Wrangler configs pin this account id. The personal account is never used for LIFTER.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-22 | Workflow governance (2026-10-28)                                                                             | Constitution 1.2.0 establishes PO-approved spec debate, agent/model routing, controlled parallel development, frontend design and main merge gates; see [docs/08-agent-workflow.md](08-agent-workflow.md) and [docs/09-frontend-design-gate.md](09-frontend-design-gate.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-23 | F12 PO decisions (2026-10-28)                                                                                | ND-F12-1..7 and DG-F12-1..4 are decided; F12 records approval, installments, commission, audit, rejection and in-scope PO-only correction reversal, and hands post-approval form assignment to P2 via REQ-P2-01 in the [F12 specification](../specs/012-registration-approval/spec.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D-24 | F14 PO decisions (2026-10-28)                                                                                | ND-F14-1..7 and DG-F14-1..3 are decided; F14 records roles, registration branding, locale fallback, three surfaces, history and Supabase Storage; local/CI Storage enablement is approved implementation work, hosted verification remains a production blocker, and the focused Sol Medium r2 critique was completed (8/8 accepted) in the [F14 specification](../specs/014-workspace-branding/spec.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D-25 | Workflow approvals (2026-10-28)                                                                              | Independent features may proceed out of roadmap order with a maintained tracker; prepare second local Supabase stack configuration and verification only (provisioning/starting requires PO approval); Sol Medium is the absolute maximum including spec debates; one-time Terra Light skills refresh is not a routing change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-26 | Intermediate sub-branch merges (2026-10-28)                                                                  | Intermediate merges of parallel sub-branches into their parent feature branch (e.g. 011-docs-drift into 011-client-accounts) are not merges into main: they require Claude independent review of the actual diff and green relevant CI on the exact head, and no separate CodeRabbit gate. Their content then passes the complete main merge gate (docs/08) in the parent feature PR before any merge into main.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D-27 | Adaptive Model Routing (PO, 2026-10-29; sessions 10 + 11)                                                    | Constitution amended to 1.3.0: cheapest capable reliable model by risk/sensitivity; GLM 5.3 Flash free for simple low-risk non-sensitive work, Luna High standard/moderate, Sol Medium complex/security/high-risk and spec-debate critique; escalation GLM -> Luna -> Sol; Sol High/xhigh prohibited; performance logging; at most six concurrent delegated agents (the orchestrating architect is not counted); each writer has an isolated worktree and branch; one DB user per stack. The stack lock covers service operations and database migrations, seeding, and shared-state writes. Sync impact: docs/08 mirrors routing and concurrency. Tests-first, exact-head push + pull_request CI, final-head CodeRabbit APPROVED, resolved threads, and explicit PO merge approval remain unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-28 | GLM tier expansion (PO, 2026-10-29; session 11)                                                              | GLM 5.3 Flash free may take implementation, CI workflow, configuration and other low- to moderate-risk work when complexity, risk, cost and logged performance support it, with mandatory architect review of every GLM change and an agent proving the relevant tests pass. Genuinely high-risk security, Auth, RLS, SECURITY DEFINER, migration, admission, Storage policy and financial work stays on Luna High or Sol Medium; no third-party-routed model receives secrets or `.env` values. Recorded in constitution 1.3.0 (Development Workflow & Quality Gates) and docs/08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D-29 | Controlled model-routing flexibility (PO S36-PO-4 item 3, 2026-11-08)                                        | PO decision, verbatim: "Constitution = B: Formally amend via #48 for controlled model-routing flexibility. Preserve mandatory independent critique, security gates, and PO authority. No premature relaxation. Pause unauthorized high-risk mutations until policy conflicts are resolved." Related PO sources: S36-PO-2 (Sonnet 5.5 critiques authorized for F16/F4), S36-PO-3 section 1 (routing preferences, not hard rules), S36-PO-4 item 4 (Luna fallback) and the final S36-PO-5 Models/Constitution block. Constitution amended via PR #48 (1.7.0, then 1.8.0 after round 6): Sol Medium is used exclusively for the mandatory independent Spec Kit spec/plan critique (each invocation PO-approved), not for implementation or routine reviews; high-risk work is Luna preferred, with Haiku allowed only with independent Luna or Claude review after the amendment is merged, and any other model needs prior PO approval; Codex Luna is primary and `opencode-go/gpt-6-luna` is a fallback only on Codex quota exhaustion, returning to Codex Luna when quota is restored; at most six concurrent agents; routing changes need PO approval before use. Mandatory critique, security gates, PO authority, synthetic-data and no-secrets rules, the free-model guardrail (no free model is approved for sensitive tasks), worktree isolation, CI/CodeRabbit/exact-SHA merge gates and the stop-and-ask rule are unchanged. Sync: docs/08, docs/03.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-30 | Zero open ambiguities before implementation (PO S37-PO-1 Q1 = A, 2026-11-08)                                 | PO decision: "A: Tighten (Recommended)", option text "Require zero open ambiguities before implementation; one more CodeRabbit round on #48 r6." This tightens S29-PO-3 Q1: Clarify must end with zero open ambiguities before implementation, recorded explicitly and never assumed. Constitution 1.8.0 (PR #48); sync: docs/08, docs/03.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-31 | Eight concurrent slots, five PR writers (PO S37-PO-15 = approve, 2026-11-08)                                 | PO approval of the architect's amendment proposal (2): constitution 1.9.0 (MINOR) allows at most eight concurrent delegated agents (the orchestrating architect not counted), of which at most five may write to pull requests at the same time; on-demand slots include the PO-approved Sol Medium critique (S37-PO-12 and S37-PO-13 folded into this amendment; no broader Sol use). Worktree isolation, disjoint files, one stack-lock writer, all gates, the Absolute PO Decision Rule, the free-model guardrail and per-invocation Sol approval are unchanged. The model allocation table is operational and is not in the constitution. Sync: docs/08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-32 | Parallel CI evidence and standing approval (PO S38-PO-6 mapping (b),(d),(e), S38-PO-7, S38-PO-8; 2026-11-09) | Constitution 1.10.0 (MINOR) accepts three executed full CI attempts as either sequential `pull_request` attempts or one PR plus two concurrent `workflow_dispatch` runs of the same exact PR head, with `validate`, all three `integration-shard` jobs, the `integration` aggregator, and `storage` executed successfully. The matrix job id is `integration-shard` (display names remain `integration shard k/3`); the aggregator is named exactly `integration`, always runs, and fails unless the shard matrix succeeds. It compares the PR/head/merge revision tuples exported by all three shards and logs their shared tuple; it does not compare revisions from `validate` or `storage`. On main pushes the aggregator allows empty PR/head fields and validates the common merge SHA. Gate-check d enforces exact-head provenance and identical logged revisions across every required job in executed `pull_request` attempts. Dispatch runs use the PR base branch's trusted workflow ref, its `ci.yml` blob must match the tested merge result, and every required job must log identical revisions. Secret-bearing jobs reject fork dispatches before installing dependencies or executing untrusted PR code. Code failures void the head; infrastructure failures are recorded and never count. The PO's approval stands for normal PRs only after all eight live gates and independent architect review pass on the exact SHA; the merge lane records `po_approved_head`, rechecks immediately before `--match-head-commit`, and reports after merge. Any head change voids approval and requires fresh gates/review; constitution PRs always require explicit PO approval of the exact SHA. Existing gates, security checks, no-writes-to-main window, no-admin/bypass rule, CodeRabbit, threads, mutation evidence, and product-decision rule remain. Sync: constitution, docs/08, CI workflow, gate-check. |
| D-33 | Constitution 1.13.0 amendment (S47-PO-14; 2026-11-11)                                                        | PO decision, verbatim: "Amend constitution (Rec.)". Applied in PR #82 to Principle I; see the [amendment note](../.specify/memory/constitution.md#sync-impact-report-and-amendment-note---2026-11-11-s47-po-14) for scope. Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-14.verbatim.txt`; SHA-256: `945c9c68387d0ceb7e03a8ba4ea089b567e89bd8a9bb086a58645cd39a20d56e`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D-34 | Nine concurrent slots, five PR writers (PO S48-PO-22; S48-R28; 2026-11-12)                                   | PO decision, verbatim: "Permanently allow 3 concurrent Luna slots, adjusting the total cap." Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-22.verbatim.txt`; SHA-256: `ea229789b02a9b05bd22e2e7f6a6bc3a07a8b9e72e5ddd216b32e72dcb70d548`. Architect mapping (S48-R28; not PO words): Luna slots 2 to 3; total delegated-agent cap 8 to 9 (adds the third Luna slot); PR writers <= 5 unchanged. Worktree isolation, disjoint files, one stack-lock writer, Sol per-invocation approval, and all merge gates remain unchanged. Sync: constitution and docs/08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| —    | Architecture                                                                                                 | [02-architecture.md](02-architecture.md) v3 APPROVED (R1, R2, R4, R5, R6, R7 adopted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Superseded

| Item                                                                                                                                                                                                                                                                                                            | Superseded by                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 (earlier permissions), D-02 (1/3/12/Custom)                                                                                                                                                                                                                                                                | D-09, D-11                                                                                                                                                                                                                                                                                |
| BRD-03 fixed 50/50 installment                                                                                                                                                                                                                                                                                  | D-12, D-17                                                                                                                                                                                                                                                                                |
| BRD-03 / PRD-07 "full/partial refunds"                                                                                                                                                                                                                                                                          | D-15                                                                                                                                                                                                                                                                                      |
| R8 verification-code collision disclosure; X2                                                                                                                                                                                                                                                                   | D-08 (rev.)                                                                                                                                                                                                                                                                               |
| X1 installment-amount conflict                                                                                                                                                                                                                                                                                  | D-17                                                                                                                                                                                                                                                                                      |
| X3 proportional refund commission                                                                                                                                                                                                                                                                               | D-15                                                                                                                                                                                                                                                                                      |
| Constitution v1.0.0 VIII "lime accent"                                                                                                                                                                                                                                                                          | D-18                                                                                                                                                                                                                                                                                      |
| Calendar-month default; B1, B2, B3, B5                                                                                                                                                                                                                                                                          | D-08, D-09/10, D-13/15, D-11                                                                                                                                                                                                                                                              |
| "Staff email can't also be client" (technical note)                                                                                                                                                                                                                                                             | D-16 (policy)                                                                                                                                                                                                                                                                             |
| D-27 fixed tier sequence and model pool (S22-PO-9 rule 2; S25-PO-4; S25-PO-9); D-28 restriction of high-risk work to Luna High or Sol Medium (D-28's other safeguards, including no secrets or `.env` values for third-party-routed models, remain); S31-PO-7 Q6 high-risk model list (Luna High or Sol Medium) | D-29, for model selection only (S36-PO-3, S36-PO-4, S36-PO-5). S30-PO-8 Q15 stays in force (Sol Medium is used exclusively for the critique; other critics need explicit PO authorization). Per-invocation PO approval, mandatory critique and all gates are preserved. History retained. |
| D-27 "exact-head push + pull_request CI" wording                                                                                                                                                                                                                                                                | S35-PO-1 (`#48=A`): three executed `pull_request` attempts on the exact head; feature-branch pushes create no CI runs. See the [main merge gate](08-agent-workflow.md#main-merge-gate). Other D-27 requirements unchanged.                                                                |

## Open (does not block the Constitution)

- **F4 auth sub-decisions (ND-F4-1..7):** Trainer permission, link delivery, link expiry, rate-limit values, client-target sequencing, staff recovery, self-service email reset timing. Expiry and limits gate production. S35-PO-1 decided ND-F4-5 (`=A`) and ND-F4-7 (staff email reset; rollout gated on external SMTP); ND-F4-7 PDN items remain open.
- **B4 (remaining):** client closure retention period and audit retention (ND-F5-1). Gates production with real client data only.
- Outstanding production gates: [07-production-readiness.md](07-production-readiness.md). Per the PO (2026-10-27), these do not block local development or PR merges.
- Remaining phase-gated decisions:
  - check-in anchor (C1, P5)
  - form-builder permission matrix (P2)
  - ~~secondary-muscle credit (P3)~~ Resolved by S20 D17-1.
  - ~~catalog edit/merge rights (P3)~~ Resolved by S20 D16-1.
  - Telegram reminder defaults (P6)
  - deadline instant on day 5 (P2)
  - Sales coaching rights

## Session 20/21 PO decisions — binding under DR-03 (2026-10-31)

These numbered entries record PO Messages A/B, the final S20 handoff, and the S21 follow-up decisions. Later explicit PO decisions supersede older specs, plans and PRD wording.

| ID     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Source / effect                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| S20-01 | Hero prototype 97debafce8a7b6929722f079f0028c8d02311d07 approved for implementation; retain Emerald #059669, approved layout, Liquid Glass treatment, mobile behavior and tokens. Normal review and exact-SHA merge gates remain.                                                                                                                                                                                                                                                                          | PO S20 Message A; Message B section 5. Supersedes Message A visual-only scope for next-session implementation.                                |
| S20-02 | F14 PR #25 exact head c0026de5a65388e36e68336008e2d8b8893c46af has accepted data-integrity PASS and exact-SHA merge approval, conditional on rechecking gates; retain branch. No production deploy or migration authorization.                                                                                                                                                                                                                                                                             | PO S20 Message B section 5; handoff section 0-S20-FINAL. Documentary production evidence only; no live hosted query.                          |
| S20-03 | D16-1a=A: PO exclusively manages global exercises; authorized staff manage workspace exercises.                                                                                                                                                                                                                                                                                                                                                                                                            | PO S20 Message B section 1.                                                                                                                   |
| S20-04 | D16-1b=A: food creator or PO may publish food edits without moderation.                                                                                                                                                                                                                                                                                                                                                                                                                                    | PO S20 Message B section 1.                                                                                                                   |
| S20-05 | D16-1c=A: only PO may Remove (called retirement in this S20 entry) or merge global entries; S21-01 names the single staff-facing action Remove.                                                                                                                                                                                                                                                                                                                                                            | PO S20 Message B section 1; Remove wording amended by PO S21-PO-4.                                                                            |
| S20-06 | D16-2: exact 18 muscles: Chest, Lats, Upper Back, Traps, Front Delts, Side Delts, Rear Delts, Biceps, Triceps, Forearms, Abs, Spinal Erectors, Quads, Hamstrings, Glutes, Adductors, Abductors, Calves; 10 equipment values: Barbell, Dumbbell, Cable, Machine, Smith Machine, Bodyweight, Kettlebell, Resistance Band, Suspension Trainer, Other. Arabic/English names, primary muscle and equipment required; secondary muscles optional.                                                                | PO S20 Message B section 1.                                                                                                                   |
| S20-07 | D16-3: HTTPS YouTube and Google Drive only. One shared global exercise identity; independent workspace video URLs resolved dynamically. PO manages all mappings; authorized staff manage their workspace only. Enforce tenant isolation; no plan republish.                                                                                                                                                                                                                                                | PO S20 Message B section 1. Supersedes Vimeo and effective-video snapshot text.                                                               |
| S20-08 | D16-4: PO supplies dataset later. Audit nutrition values, calories, names, duplicates, irrelevant foods and raw/cooked variants; report corrections, exclusions, sources and alternative groups; produce smallest useful Egyptian/Arab-oriented catalog. PO approval is required before import. Do not invent nutritional values or exercise content.                                                                                                                                                      | PO S20 Message B section 1.                                                                                                                   |
| S20-09 | D16-5: warn when kcal discrepancy exceeds max(20 kcal, 10% of stated kcal); never block saving solely for this discrepancy.                                                                                                                                                                                                                                                                                                                                                                                | PO S20 Message B section 1; supersedes release-blocking validation.                                                                           |
| S20-10 | D16-6=A: kcal, protein, carbs and fat required; fiber optional. D16-8=A: at least one food-name language required.                                                                                                                                                                                                                                                                                                                                                                                         | PO S20 Message B section 1.                                                                                                                   |
| S20-11 | D16-7a=B: normalized textual similarity of at least 90%, with no automatic synonym matching; initial audit separately checks aliases. D16-7b=A: near-duplicate kcal proximity at most max(10%, 10 kcal), standardized per 100 g/100 ml; distinguish raw/cooked and genuinely different products. D16-7c: block genuine catalog duplicates; plan repeats allowed with Duplicate Food/Meal actions.                                                                                                          | PO S20 Message B section 1.                                                                                                                   |
| S20-12 | D16-9=A: creator and origin workspace visible to PO only. D16-10=B: 10 trainer additions/24h, 100 platform additions/24h, max 10,000 active foods; benchmark before production.                                                                                                                                                                                                                                                                                                                            | PO S20 Message B section 1.                                                                                                                   |
| S20-13 | Add/Edit/Archive/Remove/Restore are lifecycle actions, never mutation/deletion of immutable versions; preserve plan references and published snapshots. Exercise defaults are per exercise (warm-up/working sets, fixed/ranged reps, rest, RIR, alternatives), prefilled when added and coach-overridable. Food defaults allow at most THREE alternatives per food with validated portions and per-plan overrides.                                                                                         | PO S20 Message B section 1; handoff reconciliation items 4 and 5.                                                                             |
| S20-14 | D17-1=A: primary volume 1.0, secondary 0.5. D17-2: per-exercise defaults, not universal/platform defaults.                                                                                                                                                                                                                                                                                                                                                                                                 | PO S20 Message B section 2.                                                                                                                   |
| S20-15 | D17-3: global workout templates PO-only; workspace templates by authorized staff; safe Make it Global. D17-4=A fixed reps and ranges. D17-5=A drafts after client approval; publish requires submitted intake.                                                                                                                                                                                                                                                                                             | PO S20 Message B section 2.                                                                                                                   |
| S20-16 | D17-7=A: kg/lb per set and Bodyweight, Added Weight, Assisted modes. D17-8=A: published-plan exports only, audited PDF/Excel with formula-injection protection. D17-9: catalog-based alternatives editable per plan.                                                                                                                                                                                                                                                                                       | PO S20 Message B section 2.                                                                                                                   |
| S20-17 | D18-1 amendment: global nutrition templates PO-only; workspace templates by authorized staff; PO may Make it Global after excluding private data/references. Amend PRD-05/PRD-12 and Constitution IV. D18-2=A targets optional; always calculate totals.                                                                                                                                                                                                                                                   | PO S20 Message B section 3; DR-03.                                                                                                            |
| S20-18 | D18-4=C: display calories/macros as integers while preserving exact decimal calculations/storage.                                                                                                                                                                                                                                                                                                                                                                                                          | PO S20 Message B section 3.                                                                                                                   |
| S20-19 | D18-6: optional recipe/preparation video link/icon for YouTube or Google Drive; hidden when absent. D18-9=A: selections persist after edits while authorized and valid; otherwise coach default. Selections never create plans or affect other clients. Multiple active plans remain supported; daily logging deferred to mobile.                                                                                                                                                                          | PO S20 Message B section 3.                                                                                                                   |
| S20-20 | Plan Core/P4: same Plan ID stays editable after publish; silent autosave to private draft, Save as Draft, one Ready & Publish, drafts invisible until publish; only explicit Create New Plan creates a plan. First workout/nutrition deliveries may happen on different days; activate once after both first plans are delivered; no paired-publish transaction; later edits never restart activation. Secure, idempotent, concurrency-safe operations.                                                    | PO S20 Message B section 4; handoff reconciliation item 1.                                                                                    |
| S20-21 | Telegram AI (P6) may only select coach-approved existing alternatives; never invent foods or alternatives.                                                                                                                                                                                                                                                                                                                                                                                                 | PO S20 Message B section 3; handoff reconciliation item 8.                                                                                    |
| S20-22 | F14b all seven design decisions approved: reusable Upload Card with thumbnail, Retry and clear errors; upload on file selection but never auto-publish; banner-only identity confirmation; alt text in one language with fallback; reuse Workspace Builder Preview tab; Replace and Remove with safe fallback; use verbatim AR/EN strings and show actual server limits.                                                                                                                                   | PO S20 Message B section 5.                                                                                                                   |
| S20-23 | Hero implementation approved without another visual approval. Liquid Glass platform-wide effort is a separate audit only; no site-wide implementation until PO approves recommendations.                                                                                                                                                                                                                                                                                                                   | PO S20 Message B section 5.                                                                                                                   |
| S20-24 | Merge gates remain CI green, CodeRabbit approval on exact SHA, zero unresolved threads, independent review and explicit PO exact-SHA approval except approved F14 SHA. No automatic production deployment/migration.                                                                                                                                                                                                                                                                                       | PO S20 Message B sections 5 and 6.                                                                                                            |
| S21-01 | F16 catalog lifecycle is **Add / Edit / Remove / Restore**. Remove is the only staff-facing removal action for both exercise and food catalogs; it is non-destructive, prevents new selections, and never cascades to or automatically changes/republishes an existing client plan. Preserve references, snapshots, logs, media availability, and history; removal from a client plan requires an explicit plan-editing action. Restore remains available for the same identity/current immutable version. | PO S21-PO-4; supersedes the Archive portion of S20-13.                                                                                        |
| S21-02 | Glisse-based selective Liquid Glass implementation is authorized and in progress on a separate branch under S21-PO-1/2. The approved floating surfaces follow the PO direction; merge still requires explicit PO approval.                                                                                                                                                                                                                                                                                 | PO S21-PO-1/2; supersedes S20-23's platform-audit-only status.                                                                                |
| S21-03 | Split PR #26 by PO direction: retain decision logs, PRD, constitution, DESIGN.md, tracker and related canonical records in PR #26; move the F16, Plan Core, F17 and F18 spec bodies to their owning feature branches for review alongside implementation.                                                                                                                                                                                                                                                  | PO S21-PO-7. Feature branches: 016-exercise-food-catalogs, 019-plan-core, 017-workout-planner and 018-nutrition-planner; feature PRs pending. |

### F14b approved AR/EN copy and limits

`«شعار مساحة العمل»` / “Workspace logo”; `«صورة الغلاف»` / “Banner image”; `«وصف صورة الغلاف (بالعربية أو الإنجليزية)»` / “Banner image description (Arabic or English)”; `«أدخل وصفًا بلغة واحدة على الأقل؛ سيُستخدم الوصف المتاح عند غياب الآخر.»` / “Enter a description in at least one language; the available description will be used as fallback.”; recommend 1600×800 (2:1), keep important content away from edges/lower portion; `«تعذر رفع الصورة. تحقق من نوع الملف وحجمه وأبعاده ثم حاول مجددًا.»` / “Upload failed. Check the file type, size, and dimensions, then retry.” Show actual server limits, never invented limits.

- Show actual server limits: logo PNG/WebP 4 MiB ingress/output, 2048x2048, 1,000,000 pixels; banner PNG/WebP 8 MiB ingress/output, 4096x2048, 4,000,000 pixels.

### Open items for PO

No S20 decision above remains open. The PO-supplied D16-4 dataset is a future input, not an unresolved decision: audit it and obtain PO import approval when supplied. The S21-PO-1/2 Glisse-based selective Liquid Glass implementation is authorized and in progress on its separate branch; merging that work still needs explicit PO approval.

## S27 PO decisions — recorded 2026-11-02

These PO decisions are recorded here byte-exact. Each block is the raw text of the recorded PO session, embedded unchanged; the source file, byte count and SHA-256 are given under each entry so the text can be verified against its source. Architect interpretation notes that appear in the source files are not PO words and are not quoted here; they remain in the cited source files. Each block carries a `<!-- prettier-ignore -->` marker so the formatter never alters the recorded text.

### S27-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/briefs/s27-po-decisions-verbatim.md` (section `## S27-PO-2 — Product decisions`); 1136 bytes; SHA-256 `9cd156822d7efe40383ce259cb3124d0b8d22784c9d6793625a5f6cf064f53f5`.

<!-- prettier-ignore -->
```text
- All **546 bilingual DRAFT copy strings are APPROVED AS WRITTEN** across F14b/F15/F16/F17/F18. Mark them approved. New additions outside this batch remain separate.
- F15: Rename the five invalid migrations safely. Claude can handle this directly without spending agent credits. Preserve SQL and verify migration history.
- F15: Keep two separate actions:
  - **Refund:** Deactivation + Financial Reversal, including revenue/commission corrections.
  - **Closure:** Deactivation WITHOUT Financial Reversal.
  - Both result in `Deactivated`, with distinct reason codes, immediate access removal, and the approved 30-day retention policy. Preserve required financial/audit records.
- F16: Build the complete Exercise Library and manual Add Exercise workflow. Do not seed exercises. I will populate the library manually.
- F18: Approved one-decimal display below 10 g, retaining full calculation precision.
- F17: Fix Arabic-Indic digit consistency and clarify the rest label to "مدة الراحة (بالثواني)" / "Rest (seconds)".
- Production deployment/readiness planning is DEFERRED until features are substantially complete.
```

## S31 PO decisions — recorded 2026-11-04

S31 outcomes cite the PO decision IDs. These rows now link to committed owning-document records: [F4 S31 clarifications](../specs/004-auth/spec.md#clarifications-1) (S31-PO-2/3), [F8 clarifications](../specs/008-free-tier-validation/spec.md#clarifications) (S31-PO-4 / SK-008-01), [F10 clarifications](../specs/010-registration-links/spec.md#clarifications) (S31-PO-3/4), [Design System User Story 4](../specs/002-design-system/spec.md#user-story-4---responsive-app-shell-with-role-navigation-priority-p2) (S31-PO-7 Q5, including the 1024px breakpoint), [constitution](../.specify/memory/constitution.md) and [agent workflow](08-agent-workflow.md) (S31-PO-7 Q6 / S31-PO-8 synthetic-data and production-AI records). The two S31 rows below now reflect that their owning records landed.

| ID                         | Decision                                                                                                                                                                                                                                                                                                                                                            | Source / effect                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S31-PO-2 / SK-004-01       | “Confirm D-19 approved” — “D-19 becomes the scope authority; T030 closes; #52's D-19 item can be resolved.” D-19 is approved; T030 task status remains subject to the current-head evidence gate.                                                                                                                                                                   | S31-PO-2; `specs/004-auth/spec.md`; #52                                                                                                                                                                              |
| S31-PO-2 / SK-004-02       | All Trainers in a workspace may issue recovery links for any client in that workspace; implementation requires a new spec cycle, RLS, tests, and security review.                                                                                                                                                                                                   | S31-PO-2; recorded, unimplemented                                                                                                                                                                                    |
| S31-PO-2 / SK-004-03,05,06 | Copy-only; keep as built/F4 owns recovery/client lookup from P1; clients only.                                                                                                                                                                                                                                                                                      | S31-PO-2; `specs/004-auth/spec.md`                                                                                                                                                                                   |
| S31-PO-3 / SK-004-04       | 10 per issuing staff account per rolling hour; 3 per client per rolling 24 hours across issuers.                                                                                                                                                                                                                                                                    | S31-PO-3; recorded, implementation/configuration verification pending                                                                                                                                                |
| S31-PO-3 / SK-010-01,03    | No revocation. Registration-link limit: 50 per authorized issuing account per rolling 24 hours, including Trainer/WO/PO, no exceptions or per-workspace reset.                                                                                                                                                                                                      | S31-PO-3; recorded, new behavior unimplemented; `specs/010-registration-links`                                                                                                                                       |
| S31-PO-4 / SK-010-02       | No business maximum.                                                                                                                                                                                                                                                                                                                                                | S31-PO-4; `specs/010-registration-links`                                                                                                                                                                             |
| S31-PO-4 / SK-009-04       | Keep Sales/Trainer commission visibility denied. No edit to `specs/009`; separate F9 lane owns that specification.                                                                                                                                                                                                                                                  | S31-PO-4; carried decision                                                                                                                                                                                           |
| S31-PO-4 / SK-008-01       | Illustrative pilot input: 2 workspaces × 150 clients/workspace × 2 staff/workspace × 2 plans/client × 2 new plan versions/client/month. Verify schema and units before measurement.                                                                                                                                                                                 | S31-PO-4; `specs/008-free-tier-validation`, T012                                                                                                                                                                     |
| S31-PO-7 Q5                | Desktop navigation from 1024px; content clearance at 1024–1199px; screenshots at 1024 and 1440; phones/tablets retain bottom bar.                                                                                                                                                                                                                                   | S31-PO-7 Q5 (S31 PO session 2026-11-04); mirrored in [Design System Q5 decision](../specs/002-design-system/spec.md#user-story-6---selective-floating-liquid-glass-surfaces-priority-p2), FR-021, and SC-010/SC-011. |
| S31-PO-7 Q6 / S31-PO-8     | Development AI agents use synthetic data only. Future production Ask LIFTER AI/Telegram Bot may use minimum authorized workspace-scoped data through authenticated services, with verified identity, strict authorization, minimization, privacy safeguards, explicitly approved provider, and access disabled until separate security/privacy review and approval. | S31-PO-7 Q6; S31-PO-8 (S31 PO session 2026-11-04); mirrored in the [constitution](../.specify/memory/constitution.md) and [agent workflow](08-agent-workflow.md).                                                    |

Existing production-readiness items remain open where already tracked: F8 hosting/staging and authenticated-route approval (ND-F8-2/3); F11 retention (B4); F13 retention (T019, FR-029, DP-01/DP-02) and hosted-hook readiness (T020 blocked by D-20 — no cloud staging; Go-Live gate F13-PB-03 remains open); F10 public content and price visibility (ND-F10-4/5). They are existing gates, not new PO questions. No PO deferral exists for T020.

## S42 PO decisions — recorded 2026-11-09

These PO decisions are recorded here byte-exact. Each block is the raw text of the recorded PO session, embedded unchanged; the source file, byte count and SHA-256 are given under each entry so the text can be verified against its source. Architect interpretation notes that appear in the source files are not PO words and are not quoted here; they remain in the cited source files. Each block carries a `<!-- prettier-ignore -->` marker so the formatter never alters the recorded text.

### S42-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-1` header up to, but excluding, the `(Architect mapping` line); 292 bytes; SHA-256 `b6a3c506918c473623fc6738fa01b36fdb72b476515af142a6177f30a54af075`.

<!-- prettier-ignore -->
```text
S42-PO-1 (2026-11-09 ~23:28Z, PO free-text message in the architect session, verbatim):
Approve A for #45: audit missing e2e fixes, preserve them separately, then close the PR and keep its branch. Complete S42 startup first, then F19 gap sweep. Respect all governance gates and agent limits.
```

### S42-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-2` header up to, but excluding, the `(Architect mapping` line); 663 bytes; SHA-256 `f9a9302e6ed7b758c1d7d8aaa7446584c7669d81ef0d51e4b2172263fccac855`.

<!-- prettier-ignore -->
```text
S42-PO-2 (2026-11-09 ~23:55Z, PO pasted message in the architect session, verbatim):
PO decisions F19: Approve single `plan_deliveries` table, activation sources (`plan_deliveries`, `po_override`, `renewal`), atomic delivery/activation/productivity transaction (no outbox), and existing renewal activation behavior.

Q1–Q8: **A, A, A, A, A, B, A, A**.

Merge PR #68 at exact SHA `70420d57` only after all mandatory gates pass. Authorized to stop relay PID `26400` for PR #57 after verifying its identity.

Record decisions, reconcile conflicts with existing specs, and proceed with the approved F19 spec-only workflow. No implementation without required gates.
```

### S42-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-3` header up to, but excluding, the `(Architect mapping` line); 703 bytes; SHA-256 `2e1478d2f3fa1ac395487507323fdaddb3d4cae80859016a76a3b00e6bd1cf4d`.

<!-- prettier-ignore -->
```text
S42-PO-3 (2026-11-10 ~00:05Z, PO pasted message in the architect session, verbatim):
F19 PO decisions:

Q9=No: No Override for cancelled/refunded subscriptions or deactivated clients.

Q10=No: Override trainer selection affects productivity credit only, NOT assignment. Manual assignment via Clients dropdown remains available after approval.

Q11=Approved:
AR: اشتراكك خلص، بس رحلتنا لسه مكملة! تواصل مع كابتنك وجدّد اشتراكك عشان تكمل تقدمك.
EN: Your subscription has ended, but your journey isn't over! Contact your coach to renew and keep making progress.

Record decisions, reconcile conflicts, continue spec-only. No implementation.
```

### S42-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-4` header up to, but excluding, the `(Architect mapping` line); 240 bytes; SHA-256 `aaa7bf1c6b4a812674f74e39caa964ce0676a5e70b03b975c378b02e3aaa73b6`.

<!-- prettier-ignore -->
```text
S42-PO-4 (2026-11-10 ~00:30Z, PO answers via the question tool, selected option labels verbatim):
Disk floor: Remove salvage + more
F19-MCQ-12: C: Block publishing
F19-MCQ-13: A: Keep ID reference (Rec.)
F19-MCQ-14: C: Credit the publisher
```

### S42-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-5` header up to, but excluding, the `(Architect mapping` line); 133 bytes; SHA-256 `2d44fdd9743767c1901e84f09af4438f0f7b6b3ea34f0b6a9f048024217183c0`.

<!-- prettier-ignore -->
```text
S42-PO-5 (2026-11-10 ~00:50Z, PO answer via the question tool, selected option label verbatim):
Cleanup: Approve groups 1 + 2 (Rec.)
```

### S42-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-6` header up to, but excluding, the `(Architect mapping` line); 480 bytes; SHA-256 `880068c54462b77c6c7b19b26b820dce491663a1de01260b3c86ca6ee955ed78`.

<!-- prettier-ignore -->
```text
S42-PO-6 (2026-11-10 ~01:50Z, PO pasted message in the architect session, verbatim):
F19-MCQ-11: Approved. Make the subscription expiry page informational only.
- Title: "Subscription Expired" / "اشتراكك انتهي".
- Display the previously approved EN/AR expiry message verbatim.
- No buttons, CTAs, renewal actions, or contact actions.
- The page only explains the subscription status.
- Update the F19 spec accordingly. Preserve all existing approvals and constraints.
```

### S42-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-7` header up to, but excluding, the `(Architect mapping` line); 415 bytes; SHA-256 `13e0d267b2a1d1d551321a9f8cba32bfcf1e81bed37fa0af0d8b40aca4bb4f4a`.

<!-- prettier-ignore -->
```text
S42-PO-7 (2026-11-10 ~01:55Z, PO message in the architect session, verbatim):
read "C:\Users\NEW LAP\Downloads\LIFTER_F17_F18_PO_Decisions_and_Spec_Rebuild.md"
 Follow its instructions, verify against the live repo, and prepare updated F17/F18 spec-only drafts. Independently challenge GPT recommendations, report conflicts and batched PO MCQs. Coordinate with F19. No implementation or unapproved Sol medium runs.
```

### S42-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` (from the `S42-PO-8` header up to, but excluding, the `(Architect mapping` line); 1801 bytes; SHA-256 `c51f1725c7ffe0597faa515c64292eb656353c14945cb385b9ab3bdf11e61741`.

<!-- prettier-ignore -->
```text
S42-PO-8 (2026-11-10 ~02:45Z, PO pasted message in the architect session, verbatim):
Consolidate ALL F17/F18/F19 PO decisions (S42 + prior) into one authoritative matrix. Latest decisions win; mark superseded rules and unresolved MCQs.

Preserve all approved rules, especially:
- PO configures exercises AFTER launch; F16 defaults only Rest/RIR/Reps. New exercises start with zero working/warm-up sets; copy editable Notes/Alternatives.
- Preserve workspace-private exercises. Allow Global template promotion; flag unresolved exercises RED and block plan loading until fixed.
- Manual template Assign only; new workspaces empty. All Workspaces skips previously assigned workspaces (even partial); Specific Workspaces permits additions. No auto-sync, duplicates or overwrites; reject zero-copy Assign.
- Copy Prompt: PO/WO/Trainer; full AR/EN drafts require PO approval; language follows UI.
- Exports: UI-language labels, original text preserved, exercise names English; nutrition exports reflect client selections/totals.
- Workout volume counts training days only, excluding rest days.
- F19 expiry page: exact approved AR/EN text, no buttons/actions. Preserve all F19 delivery, activation, renewal and assignment decisions.

Update delegation: 2 Luna, 1 DeepSeek V4.1 Flash, 1 GLM 5.3 Flash, 1 Muse Spark 1.3, 1 Beam, 1 Big Pickle; Sol Medium on-demand with explicit PO approval per run. Max 8 agents/5 PR writers. DeepSeek may handle limited tests/bug fixes. Preserve running lanes and all gates.

Await F18 gaps. No implementation, push or Sol without approval.

Delegate handoff update to an available agent. Preserve complete status, decisions, SHA/PRs, pending work and blockers. Verify the handoff, send me a concise new-session startup prompt, then STOP this session. Start no further work.
```

## S43 PO decisions — recorded 2026-11-10

These PO decisions are recorded here byte-exact. Each block is the raw text of the recorded PO session, embedded unchanged; the source file, byte count and SHA-256 are given under each entry so the text can be verified against its source. Architect interpretation notes that appear in the source files are not PO words and are not quoted here; they remain in the cited source files. Each block carries a `<!-- prettier-ignore -->` marker so the formatter never alters the recorded text.

### S43-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-1.verbatim.txt` (between the `----- BEGIN S43-PO-1 -----` and `----- END S43-PO-1 -----` markers); 847 bytes; SHA-256 `fdf094c643856b5007061178c52ec75df08422483be95d06dc096f66840f15a7`.

<!-- prettier-ignore -->
```text
Start S43. Read and follow C:/Users/NEW LAP/.lifter/briefs/s43-startup-prompt.lean.md.
Also : Record my S43 decisions:
- MCQ-1: Skip existing global templates; no duplicates or overwrites. Report skipped items.
- MCQ-2: "Copy AI Prompt" / "Copied." — "نسخ برومبت الذكاء الاصطناعي" / "تم النسخ."
- MCQ-3: Show client's selection; coach's original in a side note.
- MCQ-4: Half-up rounding; preserve full internal precision.
- MCQ-5: Consecutive 7-calendar-day weeks from program start, including rest days.
- F19 MCQ-15: Reject Override Activate for already-active subscriptions; no changes or extra production units.
- F19 MCQ-16: Only one eligible subscription per client; bind delivery automatically. No manual selection.
Update decision matrix, specs, and S43 handoff. Preserve all gates. No commits or pushes.
```

### S43-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-2.verbatim.txt` (between the `----- BEGIN S43-PO-2 -----` and `----- END S43-PO-2 -----` markers); 424 bytes; SHA-256 `1a264434ed863382f6c5d23fa597404da9feea9fa278c287ec6e0709562b0680`.

<!-- prettier-ignore -->
```text
Verify Muse Spark 1.3 specifically through OpenCode Go 

Draft the complete Copy AI Prompt text in English and Arabic for my exact approval.

Coach’s original notes must appear per item and in the copied AI prompt, but NOT in totals rows

Finalize the specs, complete a Sol Medium debate with my approval, and settle the final version. Then commit and push normally. No session-wide freeze. Preserve all governance gates.
```

### S43-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-3.verbatim.txt` (between the `----- BEGIN S43-PO-3 -----` and `----- END S43-PO-3 -----` markers); 506 bytes; SHA-256 `c0eccee24cc324b88bc62f7e7a2f305d0f9cfcc57c134912c7285162cf7cc808`.

<!-- prettier-ignore -->
```text
PO decisions:

Upgrade uses FULL previously paid credit, not prorated. Example: 1 month EGP 750 → 3 months EGP 1,400; charge only EGP 650. Total subscription becomes 3 months from original start; record only EGP 650 as new revenue.

Muse Spark 1.3 Contributor via OpenCode Go is approved for use, including the required training-data setting.

Show me both complete AI prompts (Workout + Nutrition), in EN/AR, for approval. Do not finalize them yet.

Update relevant specs and preserve governance gates.
```

### S43-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-4.verbatim.txt` (between the `----- BEGIN S43-PO-4 -----` and `----- END S43-PO-4 -----` markers); 1988 bytes; SHA-256 `0bf7e3fa1402e0b8e7b16659cff6678a3f2e8531924ec5c1d1481e9f16ccd7aa`.

<!-- prettier-ignore -->
```text
PO final clarification — update F13/F19 and related specs:

1. One continuous subscription per client. Upgrade/Renewal modify the existing subscription, never create overlapping subscriptions.
2. Upgrade: Client can switch to any higher package/tier in their workspace. Credit the FULL amount previously paid, NOT remaining-day proration. Example: Basic 1 month (EGP 750) → Basic 3 months (EGP 1,400). Charge EGP 650 only. Total duration becomes 3 months from the ORIGINAL start date, preserving elapsed days. Revenue records only the additional EGP 650, never double-counting the original EGP 750.
3. Renewal: Add the FULL purchased duration to the CURRENT expiry, preserving remaining days. Example: 10 days remaining + 3-month renewal = 3 months + 10 days remaining. Charge and record the FULL renewal price as revenue.
4. Manual edits/extensions: Platform Owner ONLY. Can manually adjust subscription dates, including after expiry. No revenue generated by these manual adjustments.
5. Trainer points: Award production points for NEW clients only, once per client. Upgrades, renewals, and additional published plans NEVER generate extra points.
6. Plans: Both new and existing eligible clients can receive unlimited plan revisions/publications, subject to normal permissions. Upgrade/Renewal never require new plans. Do NOT tie publishing to additional trainer points.
7. Muse Spark 1.3 Contributor: I approve enabling “train on request data” in OpenCode Go and using the model fully during development. Never send secrets or real client data.
8. Show me the COMPLETE Workout and Nutrition AI prompts, each in English and Arabic, for approval. Include coach-original notes per item and in copied prompts, never totals rows. Do not finalize prompt wording without approval.

Reconcile conflicting specs and tests. Flag genuine ambiguities instead of inventing rules. Complete the approved Sol Medium debate, settle final specs, then commit/push normally under governance gates.
```

### S43-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-5.verbatim.txt` (between the `----- BEGIN S43-PO-5 -----` and `----- END S43-PO-5 -----` markers); 1612 bytes; SHA-256 `baf991118edb6843565afe7fe92172de6e6e498738d3f94c73bc032053a5d3e0`.

<!-- prettier-ignore -->
```text
Final PO decisions — update F13/F17/F18/F19:

1. One continuous subscription per client.
2. Upgrade: higher tier (even shorter duration) or same tier with longer duration. Credit FULL previously paid amount, never prorate. Equal price = free; lower price = not an upgrade. Example: EGP 750 → 1,400; charge 650.
3. Renewal: extend current expiry by full purchased duration; expired renewals start today. Record full renewal revenue.
4. Frozen subscriptions must be unfrozen before upgrade/renewal. Freezing extends expiry by frozen days.
5. Pre-activation upgrades allowed.
6. Refund covers the full package, not just upgrade difference.
7. Returning clients never count as new clients. Trainer points awarded once per new client, never per plan, upgrade, or renewal. Unlimited plan publishing.
8. Renewal then Upgrade: upgrade the original package while preserving separately paid renewal duration.
9. Higher-tier, shorter-duration upgrade starts on upgrade date, using full previously paid credit.
10. Expired subscriptions cannot upgrade; renew into the desired package instead.
11. Manual subscription edits: Platform Owner only, no revenue.

Approve all four EN/AR AI prompt drafts, removing “certified coach” and using “كابتن” consistently in Arabic. Coach-original notes appear per item and in copied prompts, never totals.

F17: Week 1 = program days 1–7, including rest days; no calendar start required.

Reconcile conflicts without inventing rules; flag any remaining ambiguity. Complete the approved Sol Medium debate, then finalize, commit and push under existing governance gates.
```

### S43-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-6.verbatim.txt` (between the `----- BEGIN S43-PO-6 -----` and `----- END S43-PO-6 -----` markers); 689 bytes; SHA-256 `64485f57c5a38be92b11b9f0073e80e6435e0b5034bc4d1a05c35f5b1621ac2e`.

<!-- prettier-ignore -->
```text
Fixed tier hierarchy: Silver < Gold < Platinum. Workspaces can rename tiers, but their underlying rank never changes.
* Higher-tier upgrades with equal/longer duration count from the original subscription start. Shorter-duration upgrades start on the upgrade date.
* Pre-activation upgrades are allowed; duration starts upon activation.
* Refunds cover the full selected package payment, including upgrade charges, but don’t automatically refund separate renewals.
* After renewal then upgrade, credit only the original package’s full payment. Preserve separately purchased renewal duration and payments.
* Never prorate upgrade credit. Record only additional payments as new revenue.
```

### S43-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-7.verbatim.txt` (between the `----- BEGIN S43-PO-7 -----` and `----- END S43-PO-7 -----` markers); 66 bytes; SHA-256 `2f9c133965e9e2a6561767edf22ee39b19bae893ddb64a3b3563e08737a7c2d2`.

<!-- prettier-ignore -->
```text
Arabic tier names are سيلفر، جولد، بلاتينيوم.
```

### S43-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-8.verbatim.txt` (between the `----- BEGIN S43-PO-8 -----` and `----- END S43-PO-8 -----` markers); 430 bytes; SHA-256 `38be769fcd0649ce226a4e106444686a76eb73532aea868597665c8c92862a74`.

<!-- prettier-ignore -->
```text
Every package category supports all 3 tiers: Silver, Gold, Platinum.
2. Platform Owner can rename tiers globally; Workspace Owners within their workspace only. Fixed ranks remain unchanged.
3. Older nutrition exports show the client’s last valid selection for that specific revision.
4. After expired renewal, upgrade calculations use the renewal start date.
5. Upgrades require the same currency; no cross-currency conversion.
```

### S43-PO-9 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s43-po/s43-po-9.verbatim.txt` (whole file; the source carries no BEGIN/END markers); 209 bytes; SHA-256 `502bed6f4233af8a3274aa2eb2381c597c2f9e80dda071037a0b9f06347e9025`.

<!-- prettier-ignore -->
```text
merge #75 at c1e099962dd614a4ba8930f26f2e27106d47d13c
then Delegate one agent to update and verify the LIFTER handoff, generate the next-session startup prompt, report both paths, then STOP. No other actions.
```

## S44–S51 PO decisions — recorded 2026-11-13

These PO decisions are recorded here byte-exact. Each block is the raw text of the recorded PO session, embedded unchanged; the source file, byte count and SHA-256 are given under each entry so the text can be verified against its source. Architect interpretation notes that appear in the source files are not PO words and are not quoted here; they remain in the cited source files. Each block carries a `<!-- prettier-ignore -->` marker so the formatter never alters the recorded text.

### S44-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-1.verbatim.txt`; 8 bytes; SHA-256 `87b42e40c2a290e01d87b721bf381c3c5e259d1eb0a4660e41fdbf8bc73f7ddd`.

<!-- prettier-ignore -->
```text
Approved
```

### S44-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-2.verbatim.txt`; 88 bytes; SHA-256 `5461b2371fa7bae1a113a02bc81512290970e44d9aa74d375ba904593ae4433f`.

<!-- prettier-ignore -->
```text
S44-MCQ-1="A: Yes, per-workspace (Recommended)"
S44-MCQ-2="A: When added (Recommended)"
```

### S44-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-3.verbatim.txt`; 536 bytes; SHA-256 `2eb68c0b24dfbab1a1ac1cdc2d6db1aa8b19ed3be26da130c697ceb5baeb4f99`.

<!-- prettier-ignore -->
```text
Use manual Greptile (Base tier, 1 credit) whenever CodeRabbit is rate-limited
Keep Greptile auto-reviews OFF.
Request reviews only after local tests and 3 independent green CI runs on exact SHA.
Default to one review round. Fix actionable findings, rerun local tests + 3 fresh CI greens. Re-review only when necessary.
Never merge with unresolved blockers.
Preserve Constitution, independent architect review, exact-SHA PO approval, branch protections, all merge gates and agent limits.
Maximize throughput without sacrificing quality.
```

### S44-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-4.verbatim.txt`; 129 bytes; SHA-256 `90e22bb0701819a4a809ab65726b9f12ad390146d1212c646a40f66fb6884a82`.

<!-- prettier-ignore -->
```text
S44-MCQ-3="A: Amend Constitution (Recommended)"
S44-MCQ-4="B: Amend to accept Greptile"
S44-MCQ-5="A: Stop it now (Recommended)"
```

### S44-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-5.verbatim.txt`; 395 bytes; SHA-256 `b650bc6bb8b17071a1d19ad69611ca3099faec92067248feaa599ce6605495e2`.

<!-- prettier-ignore -->
```text
Amend LIFTER Constitution:
- Merge requires 3 independent green CI runs on exact SHA.
- AI PR reviews are optional and provider-independent.
- Merging without AI review requires explicit PO approval.
- No redundant reviews or CI reruns on unchanged SHA.
- Remove provider-specific gates; align docs/workflows.
- Create amendment PR for PO exact-SHA approval. Do not merge without authorization.
```

### S44-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-6.verbatim.txt`; 320 bytes; SHA-256 `71d7a7af16f35f94f4da9464a1f3bb68a6a1fb7f0e15303bc64c677adc16d623`.

<!-- prettier-ignore -->
```text
For PR #80, clarify the main-branch movement rule: rerun 3 CI checks only when the tested merge result becomes stale or changes. Avoid unnecessary reruns when the validated merge result remains identical. Preserve all safety gates and ensure the rule is technically enforceable. Include this in Luna's current fix lane.
```

### S44-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-7.verbatim.txt`; 495 bytes; SHA-256 `d691d04b93d2df10d9a93a9cde97bd0e818fb485ab3db84025bcdeb1fc969c0c`.

<!-- prettier-ignore -->
```text
S44-MCQ-F18-1: PO overrides A/B.

Remove Training Days Only / Rest Days Only meal functionality entirely from F18 (UI, logic, validation, specs, tests).

All meals remain visible without training/rest-day filtering. Coaches communicate day-specific instructions through Meal Notes before delivery. Preserve Meal Notes and Food Notes; verify both exist and are independently editable.

No publication blockers related to training/rest-day meals. Keep unrelated nutrition functionality unchanged.
```

### S44-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-8.verbatim.txt`; 299 bytes; SHA-256 `d6be122bd9be564fa20404abdf4c8cc9530dc19c026e4a85d200fb85e065c93d`.

<!-- prettier-ignore -->
```text
Investigate and optimize GitHub API usage in gate-check and review coordinator. Eliminate redundant REST calls, add caching and efficient polling, handle rate limits safely, and prevent stale review locks without duplicate requests. Preserve all governance gates. Delegate when a slot is available.
```

### S44-PO-9 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-9.verbatim.txt`; 9 bytes; SHA-256 `7f8518f7db5e9a55049f49c4ea6d6e8f509695231e60cbd607bcb36c88a75a14`.

<!-- prettier-ignore -->
```text
approved
```

### S44-PO-10 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-10.verbatim.txt`; 33 bytes; SHA-256 `28afc67f9d112d665c3d140eb5c7f6f810c7fca53be455b188c2810d742570cb`.

<!-- prettier-ignore -->
```text
S44-MCQ-6="B: Fix, PO exception"
```

### S44-PO-11 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-11.verbatim.txt`; 49 bytes; SHA-256 `86e0368d6c533b0ebb293daecd2160ade2629ec93c1f2b95a0907f30e8753e1d`.

<!-- prettier-ignore -->
```text
S44-MCQ-F17-1="A: Reject the move (Recommended)"
```

### S44-PO-12 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-12.verbatim.txt`; 54 bytes; SHA-256 `10b4d056fac2dc4291130e0f4165587f259456a474f40fed126e0a2786db0eed`.

<!-- prettier-ignore -->
```text
merge #80 at 8eb086cd7e1062303465c0dd1f20a57398feeced
```

### S44-PO-13 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-13.verbatim.txt`; 53 bytes; SHA-256 `a85579acca3f84733ce2d1c3b4d91c0c86a597bde4adb675d73ecfffa3b14ee7`.

<!-- prettier-ignore -->
```text
S44-MCQ-7="A: Remove CodeRabbit check (Recommended)"
```

### S44-PO-14 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-14.verbatim.txt`; 501 bytes; SHA-256 `93b34168f4b56528a659f3fdbc574b863dc772adcb967f4231791409b76df06e`.

<!-- prettier-ignore -->
```text
Delegate an agent to activate Constitution 1.12.0:

- Update gate-check: optional provider-independent AI reviews, PO approval if unreviewed.
- Reuse 3 CI greens when the validated merge tree is unchanged.
- Audit #78/#79 branch protection and stale CodeRabbit blockers.
- Preserve all governance, security, architect and merge gates.
- Minimize unnecessary CI, reviews and API usage.

You supervise, independently verify the agent's work, and report blockers or PO decisions. No unauthorized merges.
```

### S44-PO-15 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-15.verbatim.txt`; 53 bytes; SHA-256 `7601b5fca0ba43c1c902af3b7eefd1e745fb28eda9b371b0b85f19aace526983`.

<!-- prettier-ignore -->
```text
S44-MCQ-8="A: Dismiss when gates pass (Recommended)"
```

### S44-PO-16 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s44-po/s44-po-16.verbatim.txt`; 223 bytes; SHA-256 `b6fa392532836c3ce3fd3c82705485d6db1e7de08e588f63f0de65a924485cc4`.

<!-- prettier-ignore -->
```text
Delegate one agent to update the handoff with the latest verified state, decisions, PRs, SHAs, blockers, and active lanes. Review its work, then provide a concise startup prompt for the next session AFTER Stop this session
```

### S45-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-1.verbatim.txt`; 35 bytes; SHA-256 `72dbb31a268beb484ea43f50c096ae5aa8beb47f9cb09eb3aed552c118c476db`.

<!-- prettier-ignore -->
```text
1- yea its mine, i closed it 
2- B
```

### S45-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-2.verbatim.txt`; 140 bytes; SHA-256 `6481695b2041fe8bc6fc8dd655a77b156fa04d409ff7cabaafb76700ac2df0a0`.

<!-- prettier-ignore -->
```text
S45-F13-MCQ-1="A: Deny until activated (Recommended)"
MCQ-17="overlapping legacy records are mock/test-only, safely clean invalid overlaps"
```

### S45-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-3.verbatim.txt`; 11 bytes; SHA-256 `67ee7117e39bc51e409c20551cb7677cefd81dbe17bac69a7aa9e96715714a94`.

<!-- prettier-ignore -->
```text
okay start
```

### S45-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-4.verbatim.txt`; 53 bytes; SHA-256 `3d4ef18684e0bbfca7e8b06312b51b1c94456ae9bf18d67dc23e3961542e5a95`.

<!-- prettier-ignore -->
```text
S45-MCQ-CR-1="A: Turn off auto-review (Recommended)"
```

### S45-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-5.verbatim.txt`; 165 bytes; SHA-256 `140180bc6f530464cb626156dff8a6839647b1dab799c1586063eeb2cf9704f5`.

<!-- prettier-ignore -->
```text
i told you before you dont have to wait coderabit u can use grebtify instead if coderabit still in its limit window , if grebtify ran out of credits letme know then
```

### S45-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-6.verbatim.txt`; 56 bytes; SHA-256 `d556d4118bfe3fa2a4370a66395818a1de5b9097ac9314ce57181ac70ad1149b`.

<!-- prettier-ignore -->
```text
S45-MCQ-GR-1="A: Yes, as a standing rule (Recommended)"
```

### S45-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-7.verbatim.txt`; 416 bytes; SHA-256 `f399297b82186e89cafaea327ba39c616c1e4d4f50d5d176087da3d7f39778b0`.

<!-- prettier-ignore -->
```text
Delegate handoff update to one agent. Have it produce a concise new-session startup prompt, then stop this session.

Permanent rule: Minimize context and token usage without sacrificing quality. Require all agents to return brief, results-only summaries: outcomes, blockers, decisions, and essential references. No verbose logs or repeated context. Persist this rule in project instructions for all future sessions.
```

### S45-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-8.verbatim.txt`; 54 bytes; SHA-256 `fc0f0012a58cd8ae42e6822e5e6db1d7fdc59c69b83724582a56403a23eebb96`.

<!-- prettier-ignore -->
```text
merge #78 at 0087efdd12c4ebcda5de4abb31da6ea2bff67e1b
```

### S46-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s46-po/s46-po-1.verbatim.txt`; 181 bytes; SHA-256 `f8cc02b0b68d5ebc9602d99c2be8009f34b5647fb67cad867d1d7fcdab34dfba`.

<!-- prettier-ignore -->
```text
S46-PO-1 (AskUserQuestion answer, 2026-11-10 ~23:30Z) to S46-PO-MCQ-1 (#57 four pushed migrations 20261104002000-20261104005000 sort before main):
"A: Rename forward (Recommended)"
```

### S46-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s46-po/s46-po-2.verbatim.txt`; 203 bytes; SHA-256 `dcc52a1de0922ae41a6306e7bbf95dca610a4095dd5dae4198118be7d06c27c9`.

<!-- prettier-ignore -->
```text
S46-PO-2 (AskUserQuestion answer, 2026-11-10 ~23:45Z) to S46-PO-MCQ-2 (#57; S46-PO-1 conflicts with S40-PO-4):
"Keep S40-PO-4 (Recommended)"
Effect: S46-PO-1 withdrawn; S40-PO-4 prefix exception stands.
```

### S46-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s46-po/s46-po-3.verbatim.txt`; 112 bytes; SHA-256 `e26fd2fc7ce56f826ad76e0da1a258da42fe8e30d8914fb35b4b5fddd23a785a`.

<!-- prettier-ignore -->
```text
S46-PO-3 (PO chat message, 2026-11-11 ~01:35Z), verbatim:
merge #73 at e680ed6589bd32f71e5ddd8b9ca5a7578093c989
```

### S47-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-1.verbatim.txt`; 53 bytes; SHA-256 `08c1edb7d44a1421e314d72cbad21f84afa902c3a51b0dff9fd0d53153d3bdf9`.

<!-- prettier-ignore -->
```text
merge #77 at 9c570945746387ee839fc58d341da199dec12542
```

### S47-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-2.verbatim.txt`; 198 bytes; SHA-256 `6d6ebdfc9dd78916bda5c8451113d9c9bc101f6f8de0ecfba4a9446ea73eab11`.

<!-- prettier-ignore -->
```text
also if you want ! you can Use Laguna S 2.1 via Pi Delegate for complex debugging, recurring bugs, and deep reasoning. Read-only investigation; delegate fixes to coding agents. Keep reports concise,
```

### S47-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-3.verbatim.txt`; 47 bytes; SHA-256 `f4975b74678e2bf426d0cf4cd47dd3d583e1c62ab669ae06b28031cbb1c20336`.

<!-- prettier-ignore -->
```text
yea approved , 
also forget this laguna for now
```

### S47-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-4.verbatim.txt`; 33 bytes; SHA-256 `89c1cb864d32de8d3e50dbf6c08692769ecffc2455a3fbd5873dc42d43530aba`.

<!-- prettier-ignore -->
```text
Remove begin/commit (Recommended)
```

### S47-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-5.verbatim.txt`; 28 bytes; SHA-256 `4b6f9216b2ebb40ad0cfa8671f11d8bf8381a5c1d0084eeca4cf03899d29dd89`.

<!-- prettier-ignore -->
```text
Keep as pushed (Recommended)
```

### S47-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-6.verbatim.txt`; 23 bytes; SHA-256 `e656ab88555e3f68b80cfbe9588b7b2a42a580fd53d52c23e789f58fb3d5c032`.

<!-- prettier-ignore -->
```text
Ratify all three (Rec.)
```

### S47-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-7.verbatim.txt`; 30 bytes; SHA-256 `75be758806a8963792643ada3a95844fcfa7c3703bfad220fff8380c2d60d178`.

<!-- prettier-ignore -->
```text
Block clearing required (Rec.)
```

### S47-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-8.verbatim.txt`; 18 bytes; SHA-256 `2d6d55b099424872ada3bee4a2d1fd948e605773f449c241f627a2ad1e46a76a`.

<!-- prettier-ignore -->
```text
Cap at 2000 (Rec.)
```

### S47-PO-9 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-9.verbatim.txt`; 18 bytes; SHA-256 `7ae49e07a14d7e48ac88d0136c52e3ed8d07c909f71c9e9ce98e29214341def7`.

<!-- prettier-ignore -->
```text
Reject self (Rec.)
```

### S47-PO-10 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-10.verbatim.txt`; 53 bytes; SHA-256 `3169f76fa93ee53bff06ae2b0f4d22aa2c88f87a14e5793502626ad73e67c631`.

<!-- prettier-ignore -->
```text
merge #79 at 15df5af6b625402b9360b931ffa5f6708191bb0a
```

### S47-PO-11 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-11.verbatim.txt`; 23 bytes; SHA-256 `44eeb78a4f1e7296b6213b5641610f3f5922f9b1e7fca41f499a875d56115b64`.

<!-- prettier-ignore -->
```text
One per deletion (Rec.)
```

### S47-PO-12 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-12.verbatim.txt`; 23 bytes; SHA-256 `dfe79286a9ac79a1c33632ef414692a37d2e91100dd11955b5de41827ef19449`.

<!-- prettier-ignore -->
```text
Corrections only (Rec.)
```

### S47-PO-13 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-13.verbatim.txt`; 70 bytes; SHA-256 `598ac1a1e1af2dd9187f2d5b59c6c8654b6a761f43268f47d38ace14623698b2`.

<!-- prettier-ignore -->
```text
F19 plan core, F17+F18 Phase 0 only, F13 T041–T047, F20 client notes
```

### S47-PO-15 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-15.verbatim.txt`; 14 bytes; SHA-256 `57d7b75cd166942b6c5d00fe8149f34bf1d98ad0878af6209c8eecd18a68361d`.

<!-- prettier-ignore -->
```text
Stack D (Rec.)
```

### S47-PO-16 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-16.verbatim.txt`; 55 bytes; SHA-256 `e419357937f67ffdbd197f16fcb4298b7988107aec88708c692d330eda412195`.

<!-- prettier-ignore -->
```text
merge #81 at ff12ce6232c8fb3b0a7a15882a9b1f7691768a30".
```

### S48-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-1.verbatim.txt`; 199 bytes; SHA-256 `44c13b6febb2a2d62969fc78ae063d016343db7405440133856afe7e4fecb81f`.

<!-- prettier-ignore -->
```text
Q: F16 labels 1-3 (catalog.editorDescription / editorNotes / editorVideo) -> A: "Approve set A (Recommended)" = Description | الوصف ; Notes | ملاحظات ; Video URL | رابط الفيديو
```

### S48-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-2.verbatim.txt`; 110 bytes; SHA-256 `1796bedde02cea4fe30fbfccf6f84866f90adc9945c813655cfad6267b12dcbf`.

<!-- prettier-ignore -->
```text
Q: F16 item 4 Description >2000 error -> A: "الوصف طويل زيادة. خليه 2000 حرف أو أقل"
```

### S48-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-3.verbatim.txt`; 213 bytes; SHA-256 `01bb3a365fa622a256cecdcacd6cd73a191469e6a14946a25ce98f2588181225`.

<!-- prettier-ignore -->
```text
Q: F16 item 5 Alternatives self/duplicate error -> A: Self-alternative: "مينفعش تختار نفس التمرين كبديل لنفسه."

Duplicate alternative: "البديل ده متضاف قبل كده."
```

### S48-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-4.verbatim.txt`; 248 bytes; SHA-256 `5cf7e4979e94e1ad7306bfd440bcf1a1834b02e3c5b89b8835754dc142c5971a`.

<!-- prettier-ignore -->
```text
From now on, ALL Arabic user-facing UI text, labels, validation errors, buttons, and notifications must use natural, simple Egyptian colloquial Arabic (العامية المصرية), NOT formal Arabic (الفصحى). Keep English copy professional
```

### S48-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-5.verbatim.txt`; 216 bytes; SHA-256 `524a4fc6ec009f887f24ea1ac01ae3d5858f65334b78c3154b2ddc7f721d91fc`.

<!-- prettier-ignore -->
```text
Q: F16 item 6 workspace override inherit/reset UI -> A: A + 
Inherited from Global: "جاي من المكتبة العامة"

Customized: "متعدل"

Reset to Global: "رجّعه زي المكتبة العامة"
```

### S48-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-6.verbatim.txt`; 230 bytes; SHA-256 `0311d75e87682a9951e556d62cf87409a86ef3c7679cdff7b3ad2da48ebda0fb`.

<!-- prettier-ignore -->
```text
Q: F16 items 4-5 EN copy: Description too long: 'Use 2,000 characters or fewer.' Self-alternative: 'An exercise can't be its own alternative.' Duplicate: 'This alternative is already added.' -> A: "Approve all three (Recommended)"
```

### S48-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-7.verbatim.txt`; 175 bytes; SHA-256 `e0c158bb7de402f16f43dee6c2632c60dfcf5efc36c2eed6413c88055192c141`.

<!-- prettier-ignore -->
```text
Q: F16 item 7 workspace library list -> A: "One list, A-Z by name (Recommended)" = single merged list sorted alphabetically by English name, one pagination; new combined read.
```

### S48-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-8.verbatim.txt`; 145 bytes; SHA-256 `c3913b43054e10fff3bd8ab6a2a1afde3bf19fc251fbbf202e36082b439665f6`.

<!-- prettier-ignore -->
```text
Q: Egyptian-Arabic rule retrofit -> A: "New copy only (Recommended)" = apply to all new/changed strings; leave existing copy until a later sweep.
```

### S48-PO-9 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-9.verbatim.txt`; 277 bytes; SHA-256 `497e637018eb4d3039b9644a104869b0df5e4e02a08dd0c22b5baae9249a00ff`.

<!-- prettier-ignore -->
```text
Q: Authorize F9 T077 implementation now, as a prerequisite PR before F13 T042? -> A: "Authorize T077 now (Recommended)" = Luna builds T077 (new forward migration, rank in offer identity) as its own PR; F13 continues T043/T044/T047 meanwhile; T042/T045 resume after T077 merges.
```

### S48-PO-10 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-10.verbatim.txt`; 324 bytes; SHA-256 `aeee956bbc8d5e68c22ba30c81fa3554346744e44ab2f68019c5274b23c74807`.

<!-- prettier-ignore -->
```text
Q: F9 T077 treatment of existing unranked offers (options: all Silver / refuse if any exist / retire existing) -> A: "Choose B. Verify all existing offers are mock/test data, delete them safely, then apply T077 with mandatory immutable tier ranks. Preserve required audit/payment test records. No arbitrary Silver defaults."
```

### S48-PO-11 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-11.verbatim.txt`; 274 bytes; SHA-256 `5e873a43fcd6111de30a0305378c0cdb06fe16bc3b4a7f0139f8bec95aec8b36`.

<!-- prettier-ignore -->
```text
Q: F18 display of 9.96 g (FR-003 wording implies '10.0'; merged data-model + S43-R9 say '10') -> A: "Show 10 (Recommended)" = anything that rounds to 10 shows as an integer, matching the merged data-model, S43-R9 and the S27 evidence. FR-003 wording gets clarified to match.
```

### S48-PO-12 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-12.verbatim.txt`; 142 bytes; SHA-256 `bf1a7efd777b9880ad219dfcdedf4093d4ac92fba739d563615a7ff4c2839690`.

<!-- prettier-ignore -->
```text
Q: Merge PR #84 (F17 workout planner Phase 0, T001-T009) at exact head 5f488c371326a385464779ae1080dcc223b1c0c3? -> A: "merge #84 at 5f488c37"
```

### S48-PO-13 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-13.verbatim.txt`; 148 bytes; SHA-256 `15e9a2ef1ad9609f00de1ac739b6efa973b8ae751557fd507fec9df15ab3d6fd`.

<!-- prettier-ignore -->
```text
Q: Merge PR #83 (F9 T077) at exact head bd1afc767bf7bb87f7ff240d3bf4bb6f4718d439? -> A: "Ai review by greptify if clean merge if not fix then merge"
```

### S48-PO-14 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-14.verbatim.txt`; 279 bytes; SHA-256 `36a2f1de90c7a71e3c5e79cfb3b28ce64ebf06a9cf11df894542826c66d9beb1`.

<!-- prettier-ignore -->
```text
Q: F13 T043 PO manual date adjustment constraints -> A: "No limits, dates take effect (Recommended)" = PO may set any valid dates; the new dates become the subscription's real dates (client access/expiry follow them); every edit audited. Frozen/deactivated subscriptions refused.
```

### S48-PO-15 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-15.verbatim.txt`; 236 bytes; SHA-256 `68058c0e0f31e28b080cb2e08013bac7bcbde18774599117664cac689d307ecf`.

<!-- prettier-ignore -->
```text
Q: F13 T044 which event awards the productivity point -> A: "Award 1 productivity point automatically to the assigned trainer upon the client's first normal plans delivery/activation. Manual Override Activation by PO awards ZERO points"
```

### S48-PO-16 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-16.verbatim.txt`; 256 bytes; SHA-256 `a6824f08001bc6a8af9a08b5b3455c8fa0db39cc5305d21ca08482d078b5e49f`.

<!-- prettier-ignore -->
```text
Q: F16 PR #86 15 migrations below main max (gate f) -> A: "Recorded exception (Recommended)" = Keep the 15 files as-is; record a per-file exception (like #57), after the lane proves none of them touches the same database objects as main's newer migrations.
```

### S48-PO-17 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-17.verbatim.txt`; 240 bytes; SHA-256 `c82612b02e778eca900972610cb983f979b7d8ac54e07e71054de27566dad7b6`.

<!-- prettier-ignore -->
```text
Q: F16 PR #86 Greptile Issue 1 cutover identity-set guard -> A: "Edit the pushed migration (Recommended)" = Add a 'stop if the locked set differs from the checked set' guard inside 20261111012000; safe because no shared database has run it.
```

### S48-PO-18 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-18.verbatim.txt`; 201 bytes; SHA-256 `7705368f20bba77ae555ae88d9649d89c35c4247ff85cde8906cb8042983969f`.

<!-- prettier-ignore -->
```text
Q: F13 T042 commission rate for upgrade additional payment -> A: "New package's rate (Recommended)" = Use the commission rate of the package version the client upgraded to, snapshotted on that payment.
```

### S48-PO-19 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-19.verbatim.txt`; 277 bytes; SHA-256 `05eef22ce2e91042dfa22533e7620c670276f8e3d073d4f4b98b3362dbab256d`.

<!-- prettier-ignore -->
```text
Q: F13 T044 point award wiring (no production activation writer/assigned-trainer link yet) -> A: "Wire it in P4 (Recommended)" = Keep the point storage/rules built now; add the automatic award inside P4's first-delivery transaction when P4 is built. T044 stays open until then.
```

### S48-PO-20 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-20.verbatim.txt`; 123 bytes; SHA-256 `1e1eb8a07ca52124f8c9573bab1e52341afda0ef2cf353b03f32a23094c85356`.

<!-- prettier-ignore -->
```text
Q: Merge PR #82 (Constitution 1.13.0) at exact head c1a9180669e9fb16011506289cdf8798147e1013? -> A: "merge #82 at c1a91806"
```

### S48-PO-21 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-21.verbatim.txt`; 287 bytes; SHA-256 `1d924a1a595785c3a98df1f872c4632eac5d58503843a7ad4342a0a78e41bbf1`.

<!-- prettier-ignore -->
```text
Q: F13 manual PO date adjustment followed by a later upgrade - which dates win? -> A: "Upgrade recalculates (Recommended)" = The upgrade computes new dates using the normal upgrade rules, starting from the manually adjusted dates as the current state. The PO can adjust again afterwards.
```

### S49-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-1.verbatim.txt`; 268 bytes; SHA-256 `51afe4f6c57eca52c42422eb76b92a17c76dc237f6bc0106da866a34fe2b1faf`.

<!-- prettier-ignore -->
```text
F18 MCQ-1 = 3. Draft AR/EN labels for my approval; non-blocking if copy-only.

#85: Verify all 8 gates on exact SHA against latest main, then report before merge.

#57: Delegate redo to next free Luna/MiniMax, investigate 4 migration collisions. Preserve active lanes.
```

### S49-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-2.verbatim.txt`; 5 bytes; SHA-256 `cced28c6dc3f99c2396a5eaad732bf6b28142335892b1cd0e6af6cdb53f5ccfa`.

<!-- prettier-ignore -->
```text
start
```

### S49-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-3.verbatim.txt`; 357 bytes; SHA-256 `193ed59b59c6d77bb641ac2fc22ce85bd157c1271db322f3a5c613567dfec550`.

<!-- prettier-ignore -->
```text
#86 decisions:
MCQ-1 = A
MCQ-2 = A
Use server-side search, pagination, debouncing, and preserve selected alternatives.
Enforce 2,000 characters consistently for Notes and stored Video text references only, not actual video files. Audit existing data and never silently truncate.
Commit the CodeRabbit fixes and rerun all required gates on the new exact SHA.
```

### S49-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-4.verbatim.txt`; 45 bytes; SHA-256 `3e924ad1cb5b1916a1b6fcc4087b7345c96ab7e5f685f038420f2c05a56daee5`.

<!-- prettier-ignore -->
```text
Merge #85 at d44b1a3b.
Merge #87 at 7ae395a0.
```

### S49-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-5.verbatim.txt`; 38 bytes; SHA-256 `b3c947e63f9ec41a911934804b67b5a8d96e601ae29362979d2154ddca3d1367`.

<!-- prettier-ignore -->
```text
S49-57-MCQ-1 = A 
F18 MCQ-1 = APPROVED
```

### S49-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-6.verbatim.txt`; 100 bytes; SHA-256 `151b0e19bd551716cf4be6cc61300016c98f0c249a86293df16cf3f5e0f2c175`.

<!-- prettier-ignore -->
```text
use hy4 apinex through opencode delegate till its quota finish if u want , every task in new session
```

### S49-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-7.verbatim.txt`; 368 bytes; SHA-256 `f73edc6b455d0a5d590f758381387d200a48ce993f86d693c21e02f854c7b8de`.

<!-- prettier-ignore -->
```text
S49-F20-MCQ-1 = A. Build a minimal, extensible staff Client Details page with the functional Notes tab only. Follow DESIGN.md and the Design System; enforce workspace authorization. Do not build placeholder tabs or unrelated features. Fix the note-existence disclosure, complete idempotency retry and Stay/Discard tests, then run required gates. Preserve active lanes.
```

### S49-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-8.verbatim.txt`; 1 bytes; SHA-256 `559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd`.

<!-- prettier-ignore -->
```text
A
```

### S49-PO-9 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-9.verbatim.txt`; 194 bytes; SHA-256 `5321faf8c707fb048519e1589dd41767b47c30303afc8d22fbd1bf00d5a80ac9`.

<!-- prettier-ignore -->
```text
is mistral 4 large good model to work with us on lifter ? if you think it is delegate it with a scope tasks under ur instructions through Mistral Large 4 NVIDIA pi delegate thinking effort high.
```

### S49-PO-10 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s49-po/s49-po-10.verbatim.txt`; 187 bytes; SHA-256 `b6d17d7d78d99058753963d416e390642b43a8e73f58bad437ae667263c30048`.

<!-- prettier-ignore -->
```text
Delegate an agent to update the handoff (status, agents, PRs, blockers, decisions). Generate and send me a concise next-session startup prompt, then stop this session. No further actions.
```

### S50-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-1.verbatim.txt`; 276 bytes; SHA-256 `a8b8d7b0be1fa56eae761c58f28bef52d3d269a4c1ea8a54f5281105629edc90`.

<!-- prettier-ignore -->
```text
merge #89 at cad00b05974a22d61e6364e001bb86959f5b563b
use 2 beam 1 Mistral Large 4 NVIDIA agents in scoped taskes , u still the reviewer above all agents work 
3 luna 
1 minimax , try to maximize speed as u can without sacrifing code quality , i trust you opus . you are my g
```

### S50-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-2.verbatim.txt`; 449 bytes; SHA-256 `4913b8ccc0cc25ee03364f4e589d2dd5bd5b1f33d0f777a245323ad9e36ef360`.

<!-- prettier-ignore -->
```text
Approve S50 decisions: 01A 02A 03A 05A 04A; PDN-S50-WT-1=A. For 03A, enforce the shared 262,144-byte limit on the complete request and validate remove IDs/count. For 04A, track the clear-answer UI as a follow-up task. For WT cleanup, verify ignored local configs are backed up, exclude all active worktrees, never force-delete, and report freed space. Continue delegated work under existing gates; architect independently reviews all agent outputs.
```

### S50-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-3.verbatim.txt`; 39 bytes; SHA-256 `f28b988b20887af69f691ef9de205592be34f90fdd51554c19c850d5603d3354`.

<!-- prettier-ignore -->
```text
PDN-S50-MIG-1 A 

F13 MCQ-4 A

MCQ-1 c
```

### S50-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-4.verbatim.txt`; 54 bytes; SHA-256 `ad4eafd2fe0555eabb86abaa0c3786777ce0fc1dcb8f0bb29630cb845d390c72`.

<!-- prettier-ignore -->
```text
merge #52 at 493c305eeb5e8f5b8c5c9505087955f3fa1d9fde
```

### S50-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-5.verbatim.txt`; 2 bytes; SHA-256 `06f961b802bc46ee168555f066d28f4f0e9afdf3f88174c1ee6f9de004fc30a0`.

<!-- prettier-ignore -->
```text
A
```

### S50-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-6.verbatim.txt`; 345 bytes; SHA-256 `c62cd198a022efb057517b6d99d258dab7743bb7a9ea259de4e672e364689888`.

<!-- prettier-ignore -->
```text
Delegate an agent to update SESSION_HANDOFF with all newly approved S50 decisions (F16=A, F15=A, F13=C, F20=A/B/A, CI=A , GOV-1 merge approved subject to gates). Preserve previous PO decisions and active agents. Verify PRs, blockers, and queue. Then provide a concise next-session startup prompt and stop this session. No other new delegations.
```

### S51-PO-1 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-1.verbatim.txt`; 1141 bytes; SHA-256 `3800b4dac13b8b17e5b72f83ea46d21a0e9e652c513ab2dfd4ef70d9ca751e7a`.

<!-- prettier-ignore -->
```text
F13: Upgrades require all existing installments fully settled AND the full upgrade difference paid upfront before activation. No upgrade installments. Reject upgrades with outstanding or pending payments. Supersede conflicting #88 specs/contracts/tests; preserve financial history and the single continuous subscription. Reassess remaining MCQs under this rule without inventing decisions.
Approve remaining PO decisions: F13: 6A 7A 8C; F20: 26A 27A 28B 29B. F13 previously approved: upgrade only after all old installments are fully settled, full upgrade price difference paid upfront, no new installment schedule, and Platform Owner commission at the original subscription's STORED rate (not a fixed 10%), calculated only on actual collection; trainers receive no commission. F13 audit must represent an upgrade with no replacement of outstanding installments. F20 author-name choice B requires verifying an authorized, trustworthy account-name source; use approved Unavailable author fallback if absent, and escalate any unresolved data-model/scope change. Update specs/contracts/tests and preserve all existing gates and running agents.
```

### S51-PO-2 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-2.verbatim.txt`; 94 bytes; SHA-256 `cda1f389106feff2ca7a854efe102c1283e33208182b0f06dbd1e33838f61880`.

<!-- prettier-ignore -->
```text
Approve F13 receipt decisions: 9A 10B. 
merge #92 at 957a9ecfd2d50708371bb12bb32f9beb51b61133
```

### S51-PO-3 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-3.verbatim.txt`; 19 bytes; SHA-256 `f6390b7ed9c0a3a9aadcef7282c5fa2bdfb645979dfcb43e3f1adcde0b15acf3`.

<!-- prettier-ignore -->
```text
#90 question 30: A
```

### S51-PO-4 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-4.verbatim.txt`; 43 bytes; SHA-256 `4be9e250bb55be1e0d70bc1c01d69c78942a0fab118891990491eee377fc5e35`.

<!-- prettier-ignore -->
```text
1- A 
2- A 
3- A 
4- A 
5- B
6-A 
7-A
8- A
```

### S51-PO-5 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-5.verbatim.txt`; 64 bytes; SHA-256 `ccfe05c2e10d36f3a77ebcd6a69e9645721facc5ce176df79468c88c41575eee`.

<!-- prettier-ignore -->
```text
F13 11 b 
merge #91 at 700819c2e4b7c4f5f25fd780c4afbc0e2b4a020d
```

### S51-PO-6 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-6.verbatim.txt`; 54 bytes; SHA-256 `4167e683575e91f4b0fd3fd4f7e21e6a7dea8f19be5bbfbd77f975efece3b30f`.

<!-- prettier-ignore -->
```text
merge #94 at c3422e26ba7712410050dff29f6119171a9780b1
```

### S51-PO-7 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-7.verbatim.txt`; 24 bytes; SHA-256 `1c00821505ac69fd1baca276ee16d4cd6373ff5dc66ab0d9ac70a2937ccdc801`.

<!-- prettier-ignore -->
```text
N9A N10A N11B N12A N13E
```

### S51-PO-8 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-8.verbatim.txt`; 15 bytes; SHA-256 `45d2e25c1fdfc21d4236bbd45c67da4fca380b62db1d00ff38c6a25ca905acdd`.

<!-- prettier-ignore -->
```text
N14B N15A N16B
```

### S51-PO-9 — PO words, verbatim

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-9.verbatim.txt`; 185 bytes; SHA-256 `a6487ac2162898d360463c6c0a7a9c27ede015cd42e97d6e4f22a4436400ade2`.

<!-- prettier-ignore -->
```text
#88 question F13 12 b 

Delegate an agent to update the handoff with verified latest status and decisions. Then provide a startup prompt for the next session and stop. No further work.
```
