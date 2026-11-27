# Data Model: Security and performance readiness

No runtime/product schema changes are planned. Readiness evidence is tracked in the existing `docs/13-production-readiness.md` register.

| Evidence object            | Fields to record                                                                                                                                                                                          | Handling                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| PT-01 external test gate   | scope/version, vendor approval reference (not secrets), approved window, synthetic identity plan, coverage status, sanitized report reference, findings/severity, remediation/retest status, owner/status | Evidence links only; no client data, credentials, exploit payload secrets or raw sensitive records.        |
| PI-03 performance evidence | approved pilot volume, route/script version, target environment/approval, date, p50/p95 latency, response bytes, CPU p50/p95/max, error/status counts, PO-approved target and conclusion                  | Baseline is labeled baseline-only until budgets are approved; never store credentials or real-client data. |

No separate evidence database, security finding tracker, vendor list, or benchmark artifacts service is introduced. Existing spec 008 artifacts and docs/13 links remain the source.
