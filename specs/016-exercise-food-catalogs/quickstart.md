# F16 Quickstart and Gates

Planning handoff only. No database stack is assigned to F16; the architect will assign one before implementation. Do not start, reset, migrate, inspect, or otherwise touch any stack before that assignment.

## Migration window

F16 may use migration timestamps from **20261106000000 through 20261106195959 UTC**, inclusive. Every timestamp must encode a valid UTC clock time (`HHMMSS` from `000000` to `235959`). Do not overlap Plan Core's `20261106200000` through `20261106235959` range. Rebase/merge after F15 verification and latest `role_has_capability` definition before authoring migrations.

## Entry conditions

1. Architect assigns a dedicated stack and confirms F15 is verified on main.
2. Confirm the exact current audit trigger/function body and append-only audit grants before audit-touching migration work.
3. PO supplies the D16-4 food dataset and explicitly approves the audited import before any catalog data import. Until then, seed only 18 muscle taxonomy codes and 10 equipment taxonomy codes; no exercise/food records.
4. Maintain tests-first RED -> GREEN and mutation checks for every security guard. Stop if TS/SQL permission parity or cross-workspace isolation is not proven.

## Planned gates

Run only after the stack assignment, on the assigned stack, and from the assigned implementation worktree:

- Narrow unit/contract tests for each task, with recorded RED and GREEN evidence.
- Targeted SQL/RLS/RPC integration tests for the assigned local stack; assert direct DML denial, allowed RPC writes, role matrix, current-membership revocation, tenant isolation, idempotency/CAS, immutable versions, and audit privacy.
- Unit and integration mutation checks for each security guard; a removed guard must make its negative test fail.
- UI unit and Playwright/axe fixture checks in AR/EN, RTL/LTR, mobile/desktop, and light/dark as assigned. MiniMax-owned UI work uses fixtures and does not require direct DB access.
- D16-10 benchmark before production: defined 10,000-active-food fixture, documented name-length/query/concurrency distribution; record Worker CPU p95 <= 5 ms, DB/API p95 <= 300 ms target, intended index plans, duplicate-check cost, and database/index size against the 70% exit trigger.
- Final assigned repository gates: `npx prettier --check <touched files>`, `git diff --check`, applicable type/lint/test commands from `package.json`, and the assigned integration/security gates. Do not run stack or integration commands until stack ownership is explicit.

## Current design-artifact gate

For this documentation-only worktree, run `npx prettier --check` on the touched Markdown files and `git diff --check`. Do not run database, Docker, migration, integration, or end-to-end commands.
