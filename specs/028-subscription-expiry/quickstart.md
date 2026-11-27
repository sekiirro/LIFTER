# Quickstart: Subscription expiry notices and scoped client list

This is a future implementation validation guide; no code, tests, migrations, or stack were run for this docs-only specification.

1. Resolve MCQs 028-01 through 028-03 and approve proposed copy per screen before the affected UI slice.
2. Use synthetic subscriptions with known effective expiry from the F13 projection. Cover awaiting activation, active, frozen, renewed/extended, corrected dates, refunded/deactivated, expired and purged states.
3. RED-first authz: test direct RPC and UI as PO, own/foreign WO, Trainer, Sales, Client, revoked staff and anonymous. Probe foreign workspace IDs, notification IDs, HEAD/count and pagination/cursor paths.
4. Advance controlled instants at `expiry - 72h`, client `expiry - 72h`, `expiry - 24h`, and `expiry`. Run the evaluator repeatedly/concurrently; verify one row per recipient/stage identity and current recipient resolution.
5. Change effective expiry before each stage through renewal, freeze and correction; verify unsent stages recompute. Refund/cancel/deactivate/close/purge must suppress later enqueue.
6. Verify recipient-specific read/dismiss state and safe not-found behavior. Verify in-app text contains no renewal CTA and no sensitive data.
7. Query the existing directory filter with bounded pages. Verify PO/WO/Trainer/ Sales/client matrix, foreign workspace denial, counts, empty/error/loading states, AR/RTL and EN/LTR/accessibility screenshots under the Design Gate.
8. Extend and test the existing F26 purge allowlist using its already authorized schedule/control; confirm notice cleanup by the approved 30-day limit without adding a cron entry.
9. Document test file and executed evidence in traceability only after the test passes on the final implementation head.
