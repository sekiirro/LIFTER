# Quickstart: P8 security and performance readiness

This guide prepares future evidence. No test/vendor engagement/production run was performed by this docs-only spec lane.

1. Read current docs/13 and retain all Open/Prepared rows; confirm the target is PO-approved and non-production.
2. Resolve MCQ 031-01 before vendor selection or contracting. Resolve MCQ 031-02 before claiming a performance pass.
3. Prepare synthetic identities and a scope map for API, export, bot, storage, worker/background paths, role and workspace boundaries.
4. Agree rules of engagement, allowed endpoints, account lifetime, stop condition, reporting/redaction format and remediation/retest responsibilities.
5. Run spec 008 HTTP probe and log parser at existing illustrative pilot volumes in the approved non-production target. Capture p50/p95, bytes, CPU, status/error counts; label baseline-only until budgets exist.
6. Ensure evidence contains no secrets or real-client data. Add sanitized evidence references and owners to PT-01/PI-03 in docs/13.
7. Keep production/go-live gates Open until required external evidence, approved thresholds and all existing backup/CI/approval gates are satisfied.
