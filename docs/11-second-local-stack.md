# Second local Supabase stack

## Current state — 2026-10-29

Stack B is running and provisioned locally under project ID `lifter-stack-b`. Its API is published on `127.0.0.1:25421`, its database on `127.0.0.1:25422`, Storage API is enabled, and Mailpit is running for local Auth recovery-email tests. No cloud project or production environment was targeted. The ignored audit files are in `tmp/stack-b-audit/`; they contain command output and state snapshots and must not be committed or displayed where keys could appear.

The earlier post-start comparison was confounded: while that run was in progress, the F11 agent legitimately cycled Stack A for its Storage runner. Stack A's database container ID and Auth start time changed, so that comparison could not establish whether Stack B affected Stack A. This controlled run waited until Stack A had two identical snapshots 60 seconds apart and no other process whose command line matched both `LFTR-011` and `supabase` (the check excluded its own PowerShell process). The quiet snapshots matched, and the controlled Stack B stop/start, database reset, provisioner, integration run, and final check each left Stack A's IDs, `StartedAt`, and status byte-identical.

| Checkpoint | Stack A matches controlled baseline |
| --- | --- |
| Quiet snapshot 1 → quiet snapshot 2, 60 seconds apart | Yes |
| Immediately before Stack B stop/start → after Stack B start | Yes |
| Before → after Stack B `db reset --local` | Yes |
| Before → after the Stack B provisioner | Yes |
| Before → after Stack B integration verification | Yes |
| Final Stack A snapshot | Yes |

Stack A's five unchanged container IDs in that controlled proof were `57b1c40162a1` (Kong), `6579e16ab5d0` (REST), `83d8233ec283` (database), `c1183359ab77` (Inbucket), and `f235a973bd2c` (Auth). The ignored full snapshots also include each exact start time and status.

Stack B's configured profile runs Postgres, Auth (`gotrue`), Kong, PostgREST, `storage-api`, and Mailpit (the CLI's Inbucket-compatible service name). Studio, imgproxy, edge runtime, Logflare, vector, Supavisor, Realtime, and Postgres Meta are excluded. Mailpit is required because the recovery test asks local Auth to issue an email, even though the test reads the issued opaque token from the local database instead of an SMTP mailbox. At verification, all six Stack B containers were running; database, Auth, Storage, Kong, and Mailpit reported healthy. B's API and database use ports 25421 and 25422; Mailpit uses ports 25424–25426.

The B database reset completed successfully from `supabase-stack-b`; `node tests/integration/client-accounts-provision.mjs` with `LIFTER_SUPABASE_STACK=b` exited 0. A selector-targeted read-only query returned database `postgres`, server port `5432`, and cluster `main`; Auth health returned HTTP 200 on both Stack B's 25421 endpoint and Stack A's 54321 endpoint.

The first B integration run had 23 files pass and 2 fail (852 passed, 1 failed, 8 skipped). The Auth `beforeAll` hard-coded Stack A's API/DB ports, so its eight tests were skipped after setup failed. Once those locality checks derived expected ports from the selected config, all eight tests ran. The C1 event check read Stack A's hard-coded database container logs instead of B's; changing log/exec calls to derive container names from the selected project ID fixed that target mismatch. The first actual Auth recovery test run also showed that Mailpit must be enabled for local Auth to issue a recovery email. One admission counter assertion observed cleanup of stale B counters from the previous test run; a Stack B-only database reset and reprovision gave the suite a clean starting state.

After those fixes, the full Stack B integration suite passed: 25 files, 861 tests passed, 0 failed, 0 skipped. Stack A's snapshot changed during this later run: it started with six containers (including Storage) and ended with five, with container IDs and start times recreated. That matches the F11 agent's concurrent Storage-runner cycling pattern. The B tests now resolve Docker container names from `LIFTER_SUPABASE_STACK` and the selected project ID, and their HTTP/DB endpoints are validated against B's config; no command was issued against Stack A. The ignored `pre-full-integration-stack1.txt` and `post-full-integration-stack1.txt` snapshots record the difference.

## Isolation, selector, and shared migrations

Stack A remains the default: unset `LIFTER_SUPABASE_STACK` or set it to `a` to select `.env.local` and the original `supabase/config.toml`. Set `LIFTER_SUPABASE_STACK=b` explicitly to select `.env.stack-b` and `supabase-stack-b/supabase/config.toml`. The actual `.env.stack-b` is ignored. Create it from `.env.stack-b.example` and populate it only with Stack B's own local values; never copy keys or URLs between stacks. Do not edit `.env.local` to switch stacks.

Stack B has project ID `lifter-stack-b`; its configured ports occupy 25420–25429, disjoint from Stack A's default ports. Signup remains disabled and the minimum password length remains eight characters. Storage is enabled. The remaining service defaults match Stack A. The standard project-ID-based Docker namespace gives Stack B resources names such as `supabase_db_lifter-stack-b`. Migrations are shared: `supabase-stack-b/supabase/migrations` is a Windows directory junction to the single repository `supabase/migrations` directory. Do not copy migration files into a second tree.

The shared selector and target guard in `scripts/local-stack.mjs` reject non-loopback API or database URLs and ports that do not match the selected config. The integration harness and F11 provisioner use that guard. With B selected, the provisioner writes only `.env.stack-b`; with A selected, its existing API and database targets remain `127.0.0.1:54321` and `127.0.0.1:54322`.

## Stack B lifecycle commands

These commands have already been run for the controlled proof above. Any future start, stop, or reset requires explicit PO approval. Before acting, repeat the isolation proof below. Keep the commands in Stack B's workdir so the CLI resolves `lifter-stack-b` from its config.

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack\supabase-stack-b'
npx --yes supabase@2.122.0 start --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta --output-format json *> ..\tmp\stack-b-audit\start.json
```

To apply the shared migrations to B only:

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack\supabase-stack-b'
npx --yes supabase@2.122.0 db reset --local *> ..\tmp\stack-b-audit\db-reset.log
```

Then provision and run the integration verification from the repository root with explicit B selection:

```powershell
Set-Location 'C:\Users\NEW LAP\Desktop\LFTR-stack'
$env:LIFTER_SUPABASE_STACK = 'b'
node tests/integration/client-accounts-provision.mjs
npm run test:integration
```

These commands write to Stack B's database. Run them only after verifying the selected project ID and endpoints are `lifter-stack-b`, API port 25421, and database port 25422. Do not point a migration or provisioning process at the other stack.

## Isolation proof procedure

Before lifecycle or database writes, save a Stack A snapshot containing each container's ID, name, `StartedAt`, and status. Take another snapshot exactly 60 seconds later and require byte-identical results. Also check `Get-CimInstance Win32_Process` for a process whose command line contains both `LFTR-011` and `supabase`; report process names and IDs only. If the snapshots differ or such a process exists, stop before touching Stack B.

For the controlled lifecycle proof, snapshot Stack A, run `npx --yes supabase@2.122.0 stop` from the Stack B workdir only, start B with the profile above, then compare a new Stack A snapshot byte-for-byte. Never use `--all`; never stop or restart Stack A. For each subsequent B database reset, provisioner run, and integration run, snapshot Stack A immediately before and after and compare IDs, `StartedAt`, and status. If any comparison differs, stop further work. Never use Docker prune, remove Stack A containers, volumes, networks, or otherwise try to restore a snapshot.

Keep all start, status, and reset output in ignored files under `tmp/stack-b-audit/`; never print keys, JWTs, or environment values. The controlled run's snapshots are named `quiet-1.txt`, `quiet-2.txt`, `lifecycle-baseline.txt`, `controlled-postflight.txt`, `pre-reset.txt`, `post-reset.txt`, `post-provisioner.txt`, and `post-integration.txt`. The rejected first comparison is not a Stack B leak finding; the F11 cycling described above made it inconclusive.

Each stack has its own database state and database lock. A lock held for Stack A does not lock Stack B. Observe both stacks' ownership and isolation independently.

## Resource expectations and risks

Supabase local development guidance recommends at least 7 GB RAM for Docker. For two concurrent stacks, plan roughly 8–14 GB RAM and 4–8 CPU cores available to Docker, then monitor actual usage. Stack B's ports can still be occupied by another local process. Its guard rejects the wrong host or port before connecting. Stack B has separate database and Storage data and does not copy Stack A's state.

## Using Stack B from another worktree

A worktree based on main or another branch should use Stack B only after it has the selector, config, and target guard from infrastructure commit `75d4a40` (the current integration-proof/docs corrections are in `7e93fd4` and later commits). Since `75d4a40` also changes F11-owned files, do not cherry-pick that mixed commit wholesale into a divergent worktree. Bring over or independently apply these paths:

| Path | F11 dependency |
| --- | --- |
| `scripts/local-stack.mjs` | No; selector and loopback/config-port checks |
| `supabase-stack-b/supabase/config.toml` | No; Stack B project ID and port/service config |
| `.env.stack-b.example` | No; placeholders only |
| `.gitignore` | No; ignores the local B environment and audit output |
| `tests/unit/second-local-stack.test.ts` | No; config, selector, and guard checks |
| `tests/integration/harness.ts` | Yes; F11 integration harness must load the selector and enforce the guard |
| `tests/integration/client-accounts-provision.mjs` | Yes; F11 provisioner must select the matching workdir/status and write only the selected env file |
| `docs/11-second-local-stack.md` | No; operational instructions and results |

For the two F11-owned files, coordinate after F11 changes settle, then port only the stack-selection/guard changes while preserving F11's current integration behavior. In the target worktree, create its own ignored `.env.stack-b` from that worktree's placeholder template using B's own local status values; never copy `.env.local`. Set `$env:LIFTER_SUPABASE_STACK='b'` for each provisioner or integration command. Do not run `supabase link` or target any cloud project.
