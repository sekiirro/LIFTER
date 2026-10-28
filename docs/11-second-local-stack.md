# Second local Supabase stack

## Current state — 2026-10-29

Stack B is running locally with project ID `lifter-stack-b` and the F14 profile below. Its API is on port 25421 and database on 25422. Stack B's database has not been reset or provisioned, and the integration suite has not been run.

The saved pre-flight snapshot is `tmp/stack-b-audit/preflight.txt`; the post-start comparison is in `tmp/stack-b-audit/postflight.txt`. Stack 1 container IDs stayed the same, but its database and Auth containers have different `StartedAt` timestamps in the post-start snapshot. The isolation check therefore failed. Stack B was not used for any database writes after that finding. Before running `db reset`, the provisioner, or integration tests, coordinate with the Stack 1 owner and establish a clean isolation comparison. Do not stop, restart, reset, or otherwise alter Stack 1 to restore the snapshot.

## Isolation and migrations

Stack A remains the default: `LIFTER_SUPABASE_STACK` unset or set to `a` selects the existing `.env.local` and the original `lifter` config. Set `LIFTER_SUPABASE_STACK=b` explicitly to select `.env.stack-b` and `supabase-stack-b/supabase/config.toml`. Copy `.env.stack-b.example` to `.env.stack-b` only if needed; use values obtained from Stack B's own status output. The actual environment file is ignored by Git. Never move keys or URLs between stacks.

Stack B has project ID `lifter-stack-b`; its explicit service ports occupy 25420–25429, disjoint from Stack A's default ports. The config retains signup disabled and an eight-character minimum password length, enables Storage, and keeps the same service defaults as Stack A. Stack B uses the standard project-ID-based Docker namespace. It does not enable experimental stack mode, whose identity is based on project directory, branch, and stack name rather than `project_id`. Configured ports are exact requests, so check the block before every start.

Migrations remain in the repository's single `supabase/migrations` directory. Stack B's `supabase-stack-b/supabase/migrations` is a Windows directory junction to that shared directory; SQL files are not copied.

The integration harness and F11 provisioner use the shared guard. They reject non-loopback targets and ports that do not match the selected config. The provisioner keeps Stack A's original `127.0.0.1:54321` API and `127.0.0.1:54322` database target by default. When B is selected, it writes only `.env.stack-b`.

## Stack B service profile

The Stack B start command includes Postgres, Auth (`gotrue`), Kong, PostgREST, and `storage-api`. The CLI calls its Inbucket-compatible service `mailpit`; that name is excluded along with Studio, imgproxy, edge runtime, Logflare, vector, Supavisor, Realtime, and Postgres Meta.

The command used to start B was run from its own workdir, with all CLI output redirected to an ignored file:

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack\supabase-stack-b'
npx --yes supabase@2.122.0 start --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta --output-format json *> ..\tmp\stack-b-audit\start.json
```

To refresh B's environment without printing it, run `npx --yes supabase@2.122.0 status -o env` from this same workdir and redirect its output to the ignored `..\.env.stack-b` file. The provisioner also reads status internally with output captured in the process.

## Required isolation proof before database writes

Save the following baseline from the machine before starting Stack B. Keep the snapshot under ignored `tmp/stack-b-audit/` and retain container IDs, `StartedAt` timestamps, and `State.Status` for Stack 1.

```powershell
New-Item -ItemType Directory -Force 'tmp\stack-b-audit' | Out-Null
docker ps --format '{{.ID}} {{.Names}} {{.Status}} {{.Ports}}' > 'tmp\stack-b-audit\preflight-ps.txt'
docker volume ls > 'tmp\stack-b-audit\preflight-volumes.txt'
docker network ls > 'tmp\stack-b-audit\preflight-networks.txt'
docker ps -q | ForEach-Object { docker inspect --format '{{.Id}} {{.Name}} {{.State.StartedAt}} {{.State.Status}}' $_ } > 'tmp\stack-b-audit\preflight-state.txt'
netstat -ano > 'tmp\stack-b-audit\preflight-netstat.txt'
```

Before start, verify the Stack B config's project ID is distinct, every configured port is within 25420–25429, no process listens on that range, and Stack B resource names (`supabase_*_lifter-stack-b`, matching volumes and network) do not exist. After start, repeat the Docker snapshots and compare Stack 1's container IDs, `StartedAt` timestamps, and `State.Status` byte-for-byte to the baseline. Check Stack B container health, its 25421/25422 endpoints, and the absence of every excluded service. If any Stack 1 value differs, stop before `db reset`, provisioning, or integration tests; do not attempt cleanup on Stack 1.

Only after a clean comparison and Stack B endpoint verification, migrations can be applied from the Stack B workdir:

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack\supabase-stack-b'
npx --yes supabase@2.122.0 db reset --local *> ..\tmp\stack-b-audit\db-reset.log
```

Then, from the repository root, run the Stack B provisioner and integration verification in a shell with explicit selection:

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack'
$env:LIFTER_SUPABASE_STACK = 'b'
node tests/integration/client-accounts-provision.mjs
npm run test:integration
```

These commands write to Stack B's database. Do not run them while the Stack 1 comparison fails. Each stack has its own database state and database lock; one lock does not protect the other database. Never point one stack's migration or provisioning process at the other's endpoints.

## Resource expectations and risks

Supabase's local development guidance suggests at least 7 GB RAM for Docker. Docker's general minimum is 4 GB RAM and 2 CPU cores, with 8 GB+ and 4+ cores recommended. Those are single-stack references. For two full concurrent local stacks, plan initially for roughly 8–14 GB RAM and 4–8 CPU cores available to Docker; actual use depends on enabled services and load. Host allocation and available headroom were not inspected.

Stack B's named ports are separate from Stack A, but another local process could occupy them. The `.env.stack-b` target guard rejects the wrong host or port before connecting. Each stack has separate database and Storage data; Stack B does not copy Stack A's state.

## Follow-up after U9

U9-owned files were left unchanged. If U9 adds stack selection examples or assertions to `tests/integration/client-accounts-*.test.ts`, `tests/integration/client-accounts-verification.md`, `tests/e2e/client-accounts.spec.ts`, or `specs/011-client-accounts/tasks.md`, review those changes and keep them consistent with explicit `LIFTER_SUPABASE_STACK=b` selection and the loopback/port guard.
