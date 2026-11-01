# LIFTER — Overall Assessment

Status: PLANNING DRAFT (Phase 1) · Source: `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md` (BRD/PRD ids cited inline)

## Verdict

The scope is coherent and holds together well. It describes a post-sale coaching operating system with strict tenancy, external payments, and human-governed people decisions. The exclusions (PRD-12) take out most of the usual complexity: no payment gateway, no chat, no bulk actions, no web logging. Most of the remaining risk sits in four places:

1. **Tenant isolation across non-HTTP surfaces.** The Telegram bot, background jobs, exports and object storage are where workspaces usually leak into each other, not the REST API.
2. **Money rules (resolved).** D-04, D-05, D-11, D-13, D-15 and D-17 fix renewal stacking, freeze, 30-day durations, per-payment commission, full-only refunds and installment totals. Only jurisdiction/retention (B4) remains open.
3. **Shared mutable catalogs.** Global foods, exercises and templates are written by trainers from every workspace (PRD-04/05). That is a cross-tenant write surface and a data-integrity risk for already-published plans.
4. **Size.** The full BRD is several products: commercial core, form engine, two planners, a bot, and KPI/payroll. The MVP has to be cut along journey lines, not module lines.

## Actual contradictions / tensions (need a ruling or source)

| # | Where | Tension | Proposed handling |
|---|---|---|---|
| C1 | PRD-03 | Check-ins "recur every seven days from activation", but reminders "align to the assigned form's day". These differ when the form's weekday ≠ the activation weekday. | NEEDS SOURCE CONFIRMATION. The scheduler will support an anchor date plus an optional weekday override, so either answer works without a migration. |
| C2 | BRD-04.9 vs PRD-07 | Early-renewal start | **RESOLVED** (D-04): new period starts after the current one ends |
| C3 | BRD-04.4 vs PRD-01 vs BRD-02 | Who issues links, approves, records renewals and refunds | **RESOLVED** (D-09/D-10) |
| C4 | PRD-09 vs DR-03 (legal) | Leaderboard with names/photos on an opt-out basis, while the product stores health data. Many privacy laws (e.g. Egypt PDPL 151/2020, KSA PDPL) treat health data as sensitive. | Not a product conflict as long as the leaderboard shows no health metrics. Legal check required. Mitigation: alias option, no body metrics, explicit notice. Feature is optional and post-MVP. |
| C5 | PRD-06 | "Automatic delivery when both are ready" doesn't say whether a single published plan is visible to the client before both plans are delivered. | **RESOLVED** (PO S20 Message B section 4 / Plan Core): first workout and nutrition plans publish and deliver independently, possibly on different days; subscription activation occurs exactly once after both first deliveries succeed. |
| C6 | PRD-09 vs PRD-11 | Trainers may delete each other's notes, but history must be tamper-resistant. | Reconcilable: soft-delete with an immutable audit record. No conflict. |

## Material risks

| Risk | Impact | Mitigation (see [02-architecture.md](02-architecture.md)) |
|---|---|---|
| Cross-workspace leak via bot/job/export/storage | Critical (BRD invariant 1) | Postgres RLS as the second wall. Every job and bot update runs inside an explicit workspace context. Isolation test suite is a release gate. |
| Finance rules confirmed late | Rework of reports; wrong commission | Ledger records facts only (amount, currency, kind, snapshot ids). Commission/share are derived by versioned calculation rules, so a rule change doesn't need a data migration. |
| Global food/exercise edits alter other workspaces' published plans | Silent macro changes; trust loss | Catalog versions and lifecycle changes preserve published snapshots and plan references. D16 governance is approved: PO-only global exercise management/retirement/merge; food creators or PO publish edits; PO retires/merges. D18-1 keeps global templates PO-only and permits authorized workspace-owned templates; PO promotion to global removes private data and references. Exercise videos resolve per workspace. |
| Arabic RTL in PDF/Excel | Broken exports, a visible-quality failure | Browser-side print-to-PDF with RTL print CSS (Architecture v3; no headless browser on the free plan). Spike in P0-F2. |
| Telegram account linking takeover | Plan/health data sent to the wrong person | Link only via a one-time deep-link token issued from an authenticated web session. Authorization is re-checked on every command and every outbound message. |
| Working-day SLA ambiguity (timezone, holidays) | Wrong deadlines, which feed into trainer strikes | Pure, tested calendar function. Africa/Cairo, Friday non-working, 18:00 cutoff (D-03). Only the deadline instant on day 5 is open. |
| Scope / delivery time | Late MVP | Journey-based MVP cut (see [03-roadmap.md](03-roadmap.md)). Proposed deferrals require PO approval. |

## Not risks (deliberately not raised)

Device management, 2FA, offline web, Hevy, AI alternatives, bulk ops. All excluded and fine as excluded.
