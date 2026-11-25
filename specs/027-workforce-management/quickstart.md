# Quickstart - P7 Workforce Management

Planning-only walkthrough for the later implementation lane. No commands here authorize migration, stack startup, production changes or implementation in this documentation PR.

## PO monthly review

1. Open the workspace workforce report and choose a Cairo calendar month.
2. Review durable Trainer activation facts, plan/check-in penalties, Sales funnel facts, acquisition/reversal entries, quality entries, manual point/money inputs and rolling 90-day strikes.
3. Resolve point disputes with appended entries; never edit F19 or prior ledger history. A correction to a closed month is booked in current open month and linked to the original month; closed Sales totals do not change.
4. Enter monthly transformation and feedback counts. Defaults are +1/-1 per Trainer; only the latest effective revision per Trainer/month/category contributes.
5. Finalize after month-end. Sales receives only its own finalized total; no formula or detail.
6. Set one monthly Basic Salary per person in a market-allowed currency. The platform PO owns it across workspaces. Record exactly one payroll approval only after external payment against the reviewed snapshot version.

## Trainer check-in review

1. Open Trainer Check-ins for an authorized workspace.
2. Filter form statuses Scheduled, Awaiting Client, Client Overdue or Submitted.
3. Review client name, phone, platform/Telegram usernames, schedule, submission/deadline/follow-up timestamps and responsible Trainer.
4. Review F15/F23 answers/history, follow up through Telegram, then record Followed Up. Authorized Trainers see all workspace Weekly Check-in history through the narrow check-in view.
5. A follow-up at exactly 24h is on time. If follow-up is later than 24h or still absent after deadline, the due evaluator records one -0.5 effective at deadline for the Trainer assigned at breach. Later confirmation shares the same occurrence key. Late remains in history; client lateness itself has no penalty.

## Sales view boundary

Before month-end and PO finalization, Sales receives no KPI total. After both conditions, Sales reads only its own finalized month total. Test UI, server/API, RPC, RLS, export, Realtime, count/HEAD, notification, cache and replay paths. PO details remain private.

## Accounting and retention acceptance

- Any completed partial or full acquisition refund reverses its Sales point once. Full-refund staff-fault questionnaire is asked once per acquisition only when F13 refundable collected funds for the purchase scope are fully refunded.
- Initial periods follow trigger month in Africa/Cairo: Trainer activation, Sales approval+first confirmed payment, check-in 24h deadline and F15 plan deadline.
- Monthly quality revisions preserve history but replace the effective contribution.
- F26 purge removes client-linked records through its allowlist; retained staff ledger has no client FK/PII. Open tied follow-up disputes/refund reviews pause purge until resolution, then restart the 30-day clock.
- Use exact decimal arithmetic and negative totals; salary/money never derive from points.
- Test concurrent close/refund/PO edits using the shared workspace+month fence and fixed lock order.
- Update traceability only with executed passing test evidence.
