# Quickstart: P8 security and performance readiness

This guide prepares future evidence. No test/vendor engagement/production run was performed by this docs-only spec lane.

1. Read current docs/13 and retain all Open/Prepared rows; confirm the target is PO-approved and non-production.
2. Defer vendor and timing selection until after the pilot; keep PT-01 a blocking pre-go-live gate. Record this status in docs/13.
3. Prepare synthetic identities and a scope map for API, export, bot, storage, worker/background paths, role and workspace boundaries.
4. Agree rules of engagement, allowed endpoints, account lifetime, stop condition, reporting/redaction format and remediation/retest responsibilities.
5. Run spec 008 HTTP probe and log parser at its pilot volumes in the approved non-production target. Capture p50/p95, bytes, CPU, status/error counts and propose per-route p95 latency/error budgets. Mark the baseline/proposals as not a gate until PO signs the budget values.
6. Ensure evidence contains no secrets or real-client data. Add sanitized evidence references and owners to PT-01/PI-03 in docs/13.
7. Keep production/go-live gates Open until external pen-test evidence/remediation/retest and all existing backup/CI/approval gates are satisfied. Apply performance pass/fail only after PO signature of proposed budgets.
