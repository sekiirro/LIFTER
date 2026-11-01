# LIFTER — Traceability (BRD → PRD → Acceptance)

Journeys = PRD-14 (A–G). `AT-*` = proposed acceptance test ids; each becomes a Spec Kit acceptance scenario in its feature spec.

| BRD objective | PRD | Journey | Proposed acceptance tests | Gap |
|---|---|---|---|---|
| Inv.1 Strict workspace isolation | PRD-02, 10, 11, 13.1 | E | AT-ISO-01 API IDOR matrix (every resource × foreign workspace id) · AT-ISO-02 export scope · AT-ISO-03 bot command/outbound scope · AT-ISO-04 job context · AT-ISO-05 storage signed URLs scoped · AT-ISO-06 RLS denies with app-layer check disabled | — |
| Inv.2 Platform Owner governance | PRD-01 | — | AT-GOV-01 non-PO cannot create workspace/change price/commission/permissions | Sales per D-09 (unlisted rights deny-all) |
| Inv.3/BRD-03 External collection, commission owed | PRD-07, 11 | A, D | AT-FIN-01 payment recorded only after approval · AT-FIN-02 commission/share derived from snapshot | Resolved: D-13 (per collected payment), D-15 (full refund only) |
| Inv.4 Historical financial truth | PRD-07 | D | AT-FIN-03 package price edit doesn't change prior subscription · AT-FIN-04 ledger rows reject UPDATE/DELETE at DB level · AT-FIN-05 refund = reversal event | — |
| Inv.5 Post-sale registration only | PRD-02, 12 | A | AT-REG-01 no public routes except token registration, login, reset | — |
| Inv.6 Activation after first-plan deliveries | PRD-06 | A | AT-ACT-01 either first plan delivered alone → subscription not active · AT-ACT-02 workout and nutrition first deliveries may occur on different days; activate exactly once after both succeed · AT-ACT-03 retries/concurrent deliveries do not duplicate delivery, activation or productivity credit; later edits add none | P4 exposes each delivered plan under its access rules; activation waits for both |
| BRD-02 Roles, multi-workspace staff, consistent role | PRD-02 | E | AT-ISO-07 role identical across memberships · AT-ISO-08 workspace switch scopes all reads | — |
| BRD-02 Branding preview/publish | PRD-01 | — | AT-BRD-01 preview not visible on live registration until publish · AT-BRD-02 branding can't alter finance/security | **No PRD acceptance check** |
| BRD-03 Packages data-driven, canonical id | PRD-07 | A | AT-PKG-01 token bound to package version; tamper → reject | Resolved: D-11 (PO-only; 30-day months 1/3/6/8/12 or custom days) |
| BRD-03 Installments (superseded by D-12: configurable schedule) | PRD-07 | D | AT-INS-01 due dates = activation + configured day offsets · AT-INS-02 overdue → plans blocked, login OK, notices sent · AT-INS-03 confirmed payment restores access | — |
| BRD-03 PO aggregate + drill-down | PRD-11 | — | AT-RPT-01 PO totals = Σ workspace reports | **No journey** |
| BRD-04.1 Token 24h + 30m grace, single use, no IP block | PRD-02 | A | AT-REG-02 concurrent double submit → one account · AT-REG-03 failed validation doesn't consume · AT-REG-04 opened at T-1m finishes at T+29m; new open at T+1m rejected · AT-REG-05 shared IP OK | — |
| BRD-04.3 Account identity per workspace | PRD-02 | E | AT-ID-01 global uniqueness (see D-08 rows) | Resolved: D-08 |
| BRD-04.4 Approval / rejection / release | PRD-02 | A | AT-REG-06 approval visible without re-login · AT-REG-07 rejection keeps audit | **Rejection/release semantics** undefined |
| BRD-04.5 Intake form | PRD-03 | A | AT-FRM-01 autosave survives nav · AT-FRM-02 conditional render · AT-FRM-03 historical submission readable after template edit | Form-builder permission matrix NEEDS SOURCE |
| BRD-04.6 5-working-day SLA | PRD-06 | A | AT-SLA-01..n table-driven (before/after 18:00, Thursday/Friday boundaries) · AT-SLA-02 answer correction doesn't reset | Resolved: D-03 (Africa/Cairo, Friday only); deadline instant open |
| BRD-04.8 Expiry restrictions | PRD-07 | D | AT-EXP-01 notices at 3d/1d/0d exactly once · AT-EXP-02 plans/exports blocked; settings OK | — |
| BRD-04.8 Freeze | PRD-03, 07 | D | AT-FRZ-01 no check-in prompts while frozen · AT-FRZ-02 stop keeps accrued extension · AT-FRZ-03 remove reverses extension · AT-FRZ-04 audited | Resolved: D-05 rules; D-09 authority (PO/WO/Sales) |
| BRD-04.9 Renewal | PRD-07 | D | AT-REN-01 recorded renewal → snapshot + access | Resolved: D-04 (remaining days preserved; stacks after current end) |
| BRD-04.10 / G Closure | PRD-07, 13.3 | G | AT-CLS-01 access closed, ledger/audit intact | **Retention policy/jurisdiction** NEEDS SOURCE |
| BRD-05 Balanced auto-assignment | PRD-08 | B | AT-ASN-01 least-loaded trainer; deterministic tie-break | "Client count" definition (active only?) unconfirmed |
| BRD-05 Productivity unit | PRD-06, 08 | B | AT-KPI-01 one unit after both independent first deliveries; AT-KPI-02 later revisions earn none; AT-KPI-03 refund does not remove unit | Renewal credit definition remains separately tracked |
| BRD-05 KPI weights + reweighting | PRD-08 | F | AT-KPI-04 no assignments → delivery weight redistributed proportionally · AT-KPI-05 target change effective next month | — |
| BRD-05 Payroll approval = paid | PRD-08 | F | AT-PAY-01 single approve step; immutable; correction = new event · AT-PAY-02 trainer sees only own | — |
| BRD-05 Strikes 3/6/9 rolling 90d | PRD-08 | — | AT-STR-01 counts surface; no automatic action | **No journey** |
| BRD-05 Departure/reassignment | PRD-08 | — | AT-DEP-01 access revoked immediately; history preserved | **No journey** |
| BRD-06 Directory, indicators, no bulk | PRD-11 | — | AT-DIR-01 filters + indicators; no multi-select actions | — |
| BRD-06 Timeline (meaningful only) | PRD-09 | B | AT-TL-01 listed event types only | — |
| BRD-06 PO-only full export | PRD-11 | E | AT-EXP-03 WO/Trainer denied | — |
| PRD-04 Workout planner | PRD-04 | P3 | AT-WRK-01 reorder/copy preserves sets; AT-WRK-02 workspace video is dynamically scoped to canonical exercise identity; AT-WRK-03 published-only audited export; AT-WRK-04 per-exercise defaults; AT-WRK-05 same-Plan-ID edits; AT-WRK-06 catalog Remove is non-destructive and never removes/changes existing client plans | Resolved by PO S20 Message B sections 1, 2 and 4; Remove rule amended by PO S21-PO-4 |
| PRD-05 Nutrition & foods | PRD-05 | C | AT-NUT-01 exact decimal storage/integer display; AT-NUT-02 multiple active plans; AT-NUT-03 genuine duplicates block, while only kcal discrepancy is warn-only; AT-NUT-04 coach-approved alternatives and persistence; AT-NUT-05 global/workspace templates; AT-NUT-06 optional video hidden when absent; AT-NUT-07 catalog Remove preserves existing plan references and snapshots | Resolved by PO S20 Message B sections 1, 3 and 4; Remove rule amended by PO S21-PO-4 |
| PRD-10 Telegram | PRD-10 | E | AT-TG-01 one-time token linking; AT-TG-02 selector only if multiple accounts; AT-TG-03 revoked membership denies lookup; AT-TG-04 AI selects only coach-approved existing alternatives | Reminder defaults NEEDS SOURCE; Business auto-reply = feasibility |
| D-08 Global email/phone uniqueness | PRD-02 | A, E | AT-ID-02 duplicate email/phone → exactly "This email is already registered. Contact support.", token not consumed, no workspace disclosed · AT-ID-04 no merge/transfer · AT-ID-05 after PO removal, email/phone reusable · AT-ID-06 staff email cannot register as client and vice versa (D-16) | — |
| D-15 Full refund only (supersedes BRD-03/PRD-07 partial refunds) | PRD-07 | D | AT-FIN-09 refund = Σ collected (600 / 1200 cases) · AT-FIN-10 all collected revenue + commission reversed in refund month · AT-FIN-11 unpaid installments cancelled · AT-FIN-12 no partial-refund path exists · AT-FIN-04 originals untouched | — |
| D-09/10 Permission matrix | PRD-02 | E | AT-PERM-01 matrix test per role × capability (incl. refund/delete PO-only, Trainer can't approve, Sales deny-all for unlisted) | — |
| D-11 Durations (30-day months) | PRD-07 | A, D | AT-DUR-01 1/3/6/8/12 → 30/90/180/240/360 days · AT-DUR-02 custom days · AT-DUR-03 non-PO can't change price/duration | — |
| D-12/13 Installments & commission | PRD-07 | D | AT-INS-04 schedule sum ≠ PO price → rejected (D-17) · AT-FIN-06 commission = collected × snapshot rate, unpaid balance 0 · AT-FIN-07 payment reported in its collection month (Cairo) | — |
| D-14 Backups | PRD-13.2/9 | — | AT-BKP-01 archive encrypted (no plaintext) · AT-BKP-02 restore into local Supabase passes ledger/audit checksums | — |
| PRD-02 Password reset | PRD-02 | — | AT-AUTH-01 reset single-use, expiring, audited (self + PO-manual; D-19 adds WO/authorized Trainer, F4) | Self-service email reset sequenced until SMTP (ND-F4-7); expiry ND-F4-3 |
| PRD-13 NFRs | PRD-13 | all | Gates in [03-roadmap.md](03-roadmap.md) | Retention policy |

## Uncovered business requirements (summary)

1. Sales role: no product behavior at all.
2. Registration rejection/release and re-issue semantics.
3. Freeze behavior: limits, extension and who triggers it.
4. Workspace lifecycle states (suspend/archive): named, but not defined.
5. Branding, password reset, strikes, departure and PO aggregates have no acceptance checks or journeys. The AT ids above fill that.
6. Client code format for bot lookup is unspecified. Proposed: a random per-workspace code, not sequential (to prevent enumeration).

## S20 canonical feature traceability

| Feature requirements | Decision/source | Trace |
|---|---|---|
| F16 FR-001 through FR-021 | D16-1a/b/c, D16-2 through D16-10 | spec on branch 016-exercise-food-catalogs (feature PR pending); PO S20 Message B section 1 |
| Plan Core PC-FR-001 through PC-FR-007 | Plan Core/P4 override | spec on branch 019-plan-core (feature PR pending); PO S20 Message B section 4 |
| F17 FR-001 through FR-016 | D17-1 through D17-9 and Plan Core | spec on branch 017-workout-planner (feature PR pending); PO S20 Message B sections 2 and 4 |
| F18 FR-001 through FR-013 | D18-1/2/4/6/9 and Plan Core | spec on branch 018-nutrition-planner (feature PR pending); PO S20 Message B sections 3 and 4 |
| F14b / Hero | Seven F14b decisions; approved prototype 97debaf | docs/04-changes-and-questions.md S20-22/23; DESIGN.md |
