# Readiness evidence index (slice 1)

Single index for the sanitized artifacts produced or planned under PT-01 and PI-03. The register remains [docs/13-production-readiness.md](../../../docs/13-production-readiness.md); this index only points at evidence. It introduces no second register, no vendor record and no benchmark service.

## Slice 1 artifacts committed now

| Artifact                                                       | Gate  | Status                                    | Contains secrets/client data |
| -------------------------------------------------------------- | ----- | ----------------------------------------- | ---------------------------- |
| [pen-test-readiness.md](pen-test-readiness.md)                 | PT-01 | Scaffolding prepared; engagement deferred | No                           |
| [coverage-map.md](coverage-map.md)                             | PT-01 | Surface-to-test mapping prepared          | No                           |
| [perf-route-matrix.json](perf-route-matrix.json)               | PI-03 | Route list recorded before the run        | No                           |
| [perf-baseline-2026-11-27.json](perf-baseline-2026-11-27.json) | PI-03 | One local baseline run (synthetic)        | No — redacted summary        |
| [perf-baseline-2026-11-27.md](perf-baseline-2026-11-27.md)     | PI-03 | Proposed budgets (not a gate)             | No                           |
| [perf-baseline-2026-11-28.json](perf-baseline-2026-11-28.json) | PI-03 | Local production-mode baseline (signed)   | No — redacted summary        |
| [perf-baseline-2026-11-28.md](perf-baseline-2026-11-28.md)     | PI-03 | Performance budgets signed (S73-PO-4)     | No                           |

## Planned after the pilot (not produced by slice 1)

| Artifact                                    | Gate          | Owner                  | Status                                                     |
| ------------------------------------------- | ------------- | ---------------------- | ---------------------------------------------------------- |
| Versioned rules of engagement (PO-approved) | PT-01         | PO + platform/security | Pending — vendor/timing after pilot (S71-PO-7)             |
| Sanitized external report                   | PT-01         | assessor               | Pending — Open                                             |
| Findings/remediation/retest register        | PT-01         | platform/security      | Pending — Open                                             |
| Hosted measured run with CPU p50/p95/max    | PI-03 (PI-04) | PO + platform          | Pending approval — no production target used here          |
| PO signature on proposed per-route budgets  | PI-03         | PO                     | Signed per S73-PO-4; lifter-prod re-measurement deferred to pre-launch checklist (PI-04) |

## Sanitization rule

Every artifact above records references and aggregate metrics only. No connection strings, keys, cookies, tokens, raw request bodies, client content or personal data are stored. Local timing is a smoke signal, not a hosted capacity result; hosted CPU and true-scale measurements stay pending PI-04 approval.
