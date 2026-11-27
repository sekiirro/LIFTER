# Quickstart: PO report drill-down

Future implementation validation; no tests or code ran in this docs-only lane.

1. Implement only the month and package breakdowns approved by S71-PO-6; obtain per-screen copy approval before shipping copy.
2. Seed synthetic multi-workspace finance facts and calculate expected sums from source ledger records.
3. RED-test PO, own/foreign WO, Trainer, Sales, Client, revoked and anonymous via route and direct RPC, including counts and cursors.
4. Verify parent aggregate equals child totals for the same periods/currency and all monetary values are integer minor units.
5. Verify stable bounded pagination, filters, no foreign-workspace leakage, and no P7/audit detail.
6. Exercise empty/error/loading, AR/RTL and EN/LTR, mobile, keyboard and design-system states on the existing report page.
7. Record executed evidence in traceability only after tests pass on the implementation head.
