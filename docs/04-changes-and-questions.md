# LIFTER — Decision Register (FINAL, PO 2026-10-27)

Statuses: **APPROVED** · **SUPERSEDED** · **OPEN**. Later decisions supersede earlier ones (DR-03). Binding together with BRD DR-01.

## Approved decisions

| Id | Area | Decision |
|---|---|---|
| D-03 | Delivery deadline | 5 working days, Friday excluded (no other holidays). Before 18:00 → submission day counts; at/after 18:00 → next working day. Africa/Cairo. |
| D-04 | Early renewal | Remaining days preserved; new duration starts when the current one ends |
| D-05 | Freeze | Pauses and extends entitlement, with a configurable duration. Stop keeps elapsed frozen days; Remove reverses the effect. Every change audited. |
| D-06 | Hosting | Next.js + Cloudflare + serverless, $0 recurring initially, Supabase Free validated in P0 |
| D-07 | Scope | All approved features preserved; the pilot sequences and never removes Full Launch scope. P0 includes the Design System. |
| D-08 | Accounts | Client email and phone globally unique. Duplicate → only "This email is already registered. Contact support." No verification code, no workspace disclosure, no merge or transfer. |
| D-09 | Permissions | PO, WO, Sales: approve registrations, record renewals and installment payments, manage freezes, configure installment schedules on links. Trainers: generate links with approved settings. |
| D-10 | Refunds & deletion | Platform Owner only |
| D-11 | Pricing & durations | Only PO sets/changes prices and durations. 1/3/6/8/12 months (month = 30 days) or custom days. |
| D-12 | Installments | Schedule configured on the link (PO/WO/Sales). Overdue → plans restricted, login kept, notices sent, access resumes on confirmed payment. |
| D-13 | Commission | Earned per confirmed collected payment at the purchase-time rate and price snapshot. Unpaid balance earns nothing. Payment belongs to its collection month. |
| D-14 | Backups | Encrypted local DB + storage exports with restore testing, $0 |
| D-15 | Refunds | **Full refund only** = 100% of the amount actually collected. Reverse all collected revenue and commission, cancel unpaid installments, keep immutable history. No partial refunds. |
| D-16 | Identities | Staff and client accounts use separate emails. No dual-role accounts. |
| D-18 | Design System | [DESIGN.md](../DESIGN.md) approved (2026-10-27): emerald `#059669` default brand (not lime), workspace-customizable colors with WCAG 2.2 AA contrast guard, dark + light modes (device first, manual choice persisted). Constitution VIII amended to v1.1.0. Open items in DESIGN.md §11 stay open. |
| D-17 | Installment total | Installment amounts must sum exactly to the PO-approved price |
| D-20 | Hosting region (B4, part) (2026-10-27) | Supabase region **eu-central-1 (Frankfurt, EU)** for LIFTER, approved by the PO on the basis that no approved specification sets a conflicting data-residency requirement (none found). Hosting: one dedicated LIFTER Free organization with **one** cloud project (production); development and testing use local Docker. Never touch YBS. Risk noted for legal review: cross-border transfer rules (e.g. Egypt PDPL 151/2020) for health data. **B4 retention values remain OPEN** (closure retention, ND-F5-1) and still block production with real client data. |
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

- **B4 (remaining):** closure retention period and audit retention (ND-F5-1); legal confirmation of cross-border transfer for the D-20 region. Gates production only.
- Phase-gated, no defaults approved:
  - check-in anchor (C1, P5)
  - form-builder permission matrix (P2)
  - secondary-muscle credit (P3)
  - catalog edit/merge rights (P3)
  - Telegram reminder defaults (P6)
  - deadline instant on day 5 (P2)
  - Sales coaching rights
