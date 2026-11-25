# Quickstart — P7 Workforce Management

Planning-only walkthrough for the later implementation lane. No commands in this document authorize migration, stack startup, production changes or implementation in this documentation PR.

## PO monthly review

1. Open the workspace workforce report and choose a Cairo calendar month.
2. Review F19 eligible-new-client events, plan-delay/check-in-delay penalties, Sales link acquisitions and full-refund reversals, quality entries, manual adjustments and rolling 90-day strikes.
3. Resolve disputes/corrections by adding attributed ledger events; do not edit source history.
4. Enter each Trainer's monthly transformation count/points and feedback counts. Confirm +1/−1 defaults or set that Trainer's weights; save a new history revision.
5. After month-end, finalize the period. Verify that Sales sees only its own monthly total after finalization. Post-close correction behavior remains blocked by P7-MCQ-01 until answered.
6. Set Trainer/Sales Basic Salary (currency/pay period pending P7-MCQ-02). Record payroll approval only after payment was made externally.

## Trainer check-in review

1. Open Trainer Check-ins for the authorized workspace.
2. Filter by the form status: Scheduled, Awaiting Client, Client Overdue or Submitted.
3. Review the client name, phone, platform/Telegram usernames, schedule, submission/deadline/follow-up timestamps and responsible Trainer.
4. Open completed forms, review existing F15/F23 answers/history, follow up through Telegram, then record Followed Up.
5. Confirm a follow-up after the 24-hour threshold records one −0.5 penalty while Late remains in history. Client lateness alone adds no Trainer penalty.
6. Open any historical Weekly Check-in in the same workspace, including one handled by another Trainer.

## Sales view boundary

Before month-end and finalization, Sales receives no KPI total. After both conditions, Sales can read its own total only. Verify raw database query, server route, RPC, RLS, export and cached/replayed response; all detail remains PO-only.

## Implementation acceptance checklist

- Validate one F19 +1 and zero repeat points for renewal/upgrade/revision.
- Validate −1 late plan and −0.5 post-submission follow-up delay; exact 24h boundary and idempotent retries.
- Validate full-refund Sales reversal exactly once; partial refunds do not ask the PO.
- Validate net formula with positive, negative and negative-result examples.
- Validate role matrix and workspace boundary on app and DB paths.
- Validate concurrent double-click, two PO edits and month-close race.
- Validate F26 retention preserves staff totals and removes client linkage on schedule.
- Run current repository gates on exact head and record evidence before marking tasks complete.
