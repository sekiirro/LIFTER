# Second local Supabase stack

This checkout prepares stack B only. No Supabase services or database were provisioned or started as part of this change. Starting it requires explicit PO approval.

## Isolation and migrations

Stack A remains the default: `LIFTER_SUPABASE_STACK` unset or set to `a` selects the existing `.env.local` and the original `lifter` config. Set `LIFTER_SUPABASE_STACK=b` explicitly to select `.env.stack-b` and `supabase-stack-b/supabase/config.toml`. Copy `.env.stack-b.example` to `.env.stack-b` and fill it only with values from stack B. The actual environment file is ignored by Git. Never move keys or URLs between stacks.

Stack B has project ID `lifter-stack-b`; its explicit service ports occupy 25420–25429, disjoint from stack A's default ports. The config retains signup disabled and an eight-character minimum password length. It keeps stack A's service defaults, including disabled Analytics and connection pooler. Stack A has no explicit `--exclude` list, so stack B keeps that same default policy. The experimental `stack = true` setting lets the CLI keep local project state tied to the worktree/branch. Supabase documents this feature as experimental and treats configured ports as exact requests, so check that the block is free before the approved start.

Migrations remain in the repository's single `supabase/migrations` directory. Stack B has its own `supabase/` configuration directory; before first use, create a Windows directory junction at `supabase-stack-b/supabase/migrations` pointing to `../../supabase/migrations`. The junction shares the migration source and does not copy SQL files. Do not create it until PO approval.

The integration harness and F11 provisioner fail before opening database connections unless both API and database endpoints are loopback and use the ports in the selected config. The provisioner retains stack A's original `127.0.0.1:54321` API and `127.0.0.1:54322` database target by default. Stack B writes only `.env.stack-b`; it never writes `.env.local`.

## Later provisioning and start (requires PO approval)

Run these commands from PowerShell after approval. They are instructions only; do not run them as part of this preparation.

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack'
New-Item -ItemType Junction -Path '.\supabase-stack-b\supabase\migrations' -Target (Resolve-Path '.\supabase\migrations')
Set-Location '.\supabase-stack-b'
npx --yes supabase@2.122.0 start
npx --yes supabase@2.122.0 status --env --output-format text | Tee-Object -FilePath '..\.env.stack-b'
```

Review the displayed URLs and keys against the B config before copying any generated values. The checked-in example uses placeholders; replace them with the matching values written by `status`, keeping both stack names and keys together. Return to the repository root, then run the client-account provisioner with explicit selection:

```powershell
Set-Location '..'
$env:LIFTER_SUPABASE_STACK = 'b'
node tests/integration/client-accounts-provision.mjs
```

This provisioner performs database writes, so it also requires PO approval. To run the integration suite later, select B in that shell and run `npm run test:integration`; the harness rejects remote hosts and mismatched API/database ports before connecting. Do not run `supabase db reset` for this workflow. Each stack has its own database state and database lock; the lock for stack A does not protect stack B, and vice versa. Never point one stack's migration/provisioning process at the other's endpoints.

## Resource expectations and risks

Supabase's local development guidance suggests at least 7 GB RAM for Docker. Docker's general minimum is 4 GB RAM and 2 CPU cores, with 8 GB+ and 4+ cores recommended. Those are single-stack references. For two full concurrent local stacks, plan initially for roughly 8–14 GB RAM and 4–8 CPU cores available to Docker; actual use depends on enabled services and load. Host allocation and available headroom were not inspected.

The experimental CLI behavior can change between releases. Explicit ports avoid collision with stack A's standard block but can still be occupied by another local process. A wrong or stale `.env.stack-b` is rejected when its endpoint ports do not match the B config. Supabase status must be read from the B worktree so its URL and keys stay paired. Each stack has separate database and Storage data; stack B does not copy stack A's state.

## Follow-up after U9

U9-owned files were left unchanged. If U9 adds stack selection examples or assertions to `tests/integration/client-accounts-*.test.ts`, `tests/integration/client-accounts-verification.md`, `tests/e2e/client-accounts.spec.ts`, or `specs/011-client-accounts/tasks.md`, review those changes after U9 lands and keep them consistent with the explicit `LIFTER_SUPABASE_STACK=b` selection and loopback/port guard.
