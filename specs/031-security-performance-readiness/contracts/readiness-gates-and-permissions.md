# Contract: External test and performance readiness gates

## Evidence contract

| Gate                                | Required evidence                                                                                                                                                                                            | Pass condition                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| PT-01 External cross-workspace test | PO-approved vendor/window/budget; versioned rules of engagement; synthetic identities/data; API/export/bot/storage/job coverage map; sanitized report; severity and remediation register; retest disposition | External work is authorized and complete; required findings have verified remediation/retest; PO gate status is updated in docs/13. |
| PI-03 Capacity/performance          | PO-approved pilot volumes; approved non-production target/run; spec 008 measurements for route p50/p95 latency, response size, CPU and failures; numeric targets selected by PO                              | Measurements at target volumes satisfy the PO-approved budgets. Without approved targets, report baseline-only and keep gate Open.  |
| Existing CI/security                | Current required CI, secret scan, RLS/authorization tests, backup and deployment controls                                                                                                                    | All existing exact-head and production gates remain satisfied independently.                                                        |

## Role and approval matrix

| Role                       | Approve vendor/spend/window                            | Approve test scope/target                              | Review report/measurements                                               | Close readiness gate                                |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| PO                         | Yes; MCQ 031-01 and later explicit engagement approval | Yes                                                    | Yes                                                                      | Yes, with evidence; does not imply go-live approval |
| WO                         | No                                                     | No                                                     | No platform report; only own workspace evidence if separately authorized | No                                                  |
| Trainer                    | No                                                     | No                                                     | No                                                                       | No                                                  |
| Sales                      | No                                                     | No                                                     | No                                                                       | No                                                  |
| Client                     | No                                                     | No                                                     | No                                                                       | No                                                  |
| Platform/security operator | Execute only under approved scope                      | Prepare evidence and run approved non-prod measurement | Provide sanitized evidence                                               | Cannot replace PO approval                          |

## Test identity outcomes

Use synthetic identities and assert explicit outcomes from the approved permission matrix in `docs/02-architecture.md:35-49` and current role policies: PO can exercise approved cross-workspace platform scope; WO can access only its own workspace; Trainers can access only currently assigned/authorized client work; Sales can exercise only explicitly granted capabilities; Clients can access only their own authorized resources. For each applicable surface, include allowed own-scope requests and denied foreign workspace/object, revoked membership, guessed ID, direct API/RPC and count/existence probes. Do not grant new test or production capabilities.

No production testing, access to real client data, paid-service procurement, or deployment is authorized by these docs. Preserve existing `docs/13` CI, backup, hosting, and final go-live checks.

## Coverage matrix required by PRD-13.1

| Surface         | Example coverage boundary                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| APIs            | Actor/workspace/object authorization, foreign ID, enumeration, response errors     |
| Exports         | PO-only comprehensive export, plan export entitlement and artifact access          |
| Bot             | Current role, workspace membership, linked identity, cross-workspace lookup        |
| Storage         | Workspace path isolation, signed access, revoked membership, backup surface        |
| Background jobs | Tenant-scoped query, payload minimization, recipient authorization, retries/replay |

For every listed surface, retain a coverage-to-evidence row naming role pair, own/foreign object case, test or policy source, and sanitized result reference. Missing or unexecuted evidence remains Open.
