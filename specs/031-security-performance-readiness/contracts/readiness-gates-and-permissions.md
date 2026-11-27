# Contract: External test and performance readiness gates

## Evidence contract

| Gate                                | Required evidence                                                                                                                                                                                          | Pass condition                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| PT-01 External cross-workspace test | Vendor/timing selected after pilot; versioned rules of engagement; synthetic identities/data; API/export/bot/storage/job coverage map; sanitized report; severity/remediation register; retest disposition | Blocking pre-go-live gate in docs/13; required external test, verified remediation/retest, and PO gate update are complete.                         |
| PI-03 Capacity/performance          | Spec 008 pilot volumes; approved non-production target/run; measurements for route p50/p95 latency, response size, CPU and failures; proposed per-route p95 latency/error budgets and PO signature         | Baseline and proposed budgets are documented first. Gate only after PO signs the proposed values; then reproducible measurements must satisfy them. |
| Existing CI/security                | Current required CI, secret scan, RLS/authorization tests, backup and deployment controls                                                                                                                  | All existing exact-head and production gates remain satisfied independently.                                                                        |

## Role and approval matrix

| Role                       | Approve vendor/spend/window                                     | Approve test scope/target                              | Review report/measurements                                               | Close readiness gate                                |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| PO                         | Yes; vendor/timing selected after pilot and engagement approved | Yes                                                    | Yes                                                                      | Yes, with evidence; does not imply go-live approval |
| WO                         | No                                                              | No                                                     | No platform report; only own workspace evidence if separately authorized | No                                                  |
| Trainer                    | No                                                              | No                                                     | No                                                                       | No                                                  |
| Sales                      | No                                                              | No                                                     | No                                                                       | No                                                  |
| Client                     | No                                                              | No                                                     | No                                                                       | No                                                  |
| Platform/security operator | Execute only under approved scope                               | Prepare evidence and run approved non-prod measurement | Provide sanitized evidence                                               | Cannot replace PO approval                          |

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
