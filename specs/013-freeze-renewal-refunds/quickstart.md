# F13 implementation and verification quickstart

This document is a future execution checklist, not authorization to implement or use a database. The current planning run is DB-free.

## Before implementation

1. Obtain PO approval for the complete plan/tasks/analyze package and slice-specific implementation brief.
2. Verify F12 U4 is merged; inspect final migration/RPC, lock order, authorization, receipts, audit rollback and races. Verify current F12/F14 migration heads and all pending migrations.
3. Prove a supported PO-1 sign-in block plus full session/refresh revocation primitive shares the refund transaction on a verified isolated stack. If proof fails, stop and request revised PO design.
4. Assign a newly verified isolated F13 stack; do not borrow Stack A or Stack B. Set every F13 migration timestamp after all integrated F12/F14 migrations.
5. Resolve the technical/legal retention gate before any production real-data use.

## Per-unit test protocol

For each task, write its unit/contract/integration tests first, capture the failing RED output, implement only the bounded unit, capture GREEN output, then run the named mutation check to prove the security/financial assertion detects the targeted fault. Keep DB-dependent tests on the assigned isolated stack. Never report unrun results. Required refund race fixtures and all eight fixtures in `ledger-architecture.md` are named in tasks.md.

## Final checks

Run project-required formatting/type/lint/unit checks and isolated-stack integration checks for the completed unit; verify bidirectional TS↔SQL capability parity; inspect migration ordering and integrated shared-function bodies; capture outputs and SHAs. No production deployment or merge approval is implied.
