# F16 Quickstart and Gates

S25-PO-3 assigned Stack C for F16. This quickstart records the Stack C-only local workflow; production remains outside this lane.

## Migration window

Round 3 (FR-032) withdraws the fixed window `20261106000000`-`20261106195959`. Each F16 migration version must be strictly greater than the highest version on any origin ref at implementation time (highest on 2026-11-06: `20261108021002`). Run `npm run check:migration-versions:remote` immediately before each implementation commit and again before each push. Every timestamp must encode a valid UTC clock time (`HHMMSS` from `000000` to `235959`). Author after PR #43's migrations (`20261106125000`, `20261107030000`), and rebase onto the latest `role_has_capability` definition before authoring migrations.

## Entry conditions

1. Architect assigns a dedicated stack and confirms F15 is verified on main.
2. Confirm the exact current audit trigger/function body and append-only audit grants before audit-touching migration work.
3. PO supplies the D16-4 food dataset and explicitly approves the audited import before any catalog data import. Until then, seed only 18 muscle taxonomy codes and 10 equipment taxonomy codes; no exercise/food records.
4. Maintain tests-first RED -> GREEN and mutation checks for every security guard. Stop if TS/SQL permission parity or cross-workspace isolation is not proven.

## Local Stack C account-test setup

After every clean local Stack C database reset, run `tests/integration/client-accounts-provision.mjs` through the approved `supabase-safe.mjs` Stack C wrapper before running shared client account integration tests. The provisioner installs the local Vault values those signup tests require; without it, `client_signup_admit` can return `signup_unavailable`. Never copy or print the generated secret values. Run the provisioner from the repository root after the reset and before `client-accounts-catalog.test.ts`.

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
