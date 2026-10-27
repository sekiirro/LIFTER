# LIFTER

## Development

Prerequisites: Node.js 24 (see `.nvmrc`) and npm 11.17.0.
Install dependencies with `npm ci`.

| Command                | Purpose                                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start the Next.js development server.                                                                                                                                                                             |
| `npm run build`        | Create the production Next.js build.                                                                                                                                                                              |
| `npm run start`        | Serve the production build on port 3000.                                                                                                                                                                          |
| `npm run typecheck`    | Check TypeScript without emitting files.                                                                                                                                                                          |
| `npm run lint`         | Run ESLint with no warnings allowed.                                                                                                                                                                              |
| `npm run format`       | Format files with Prettier.                                                                                                                                                                                       |
| `npm run format:check` | Check formatting without changing files.                                                                                                                                                                          |
| `npm test`             | Run the Vitest unit tests in `tests/unit`.                                                                                                                                                                        |
| `npm run e2e`          | Run Playwright health, design-system, shell, and print tests in Chromium, plus shell tests on Pixel 7. Builds and starts the production server automatically; reuses an existing healthy local server outside CI. |
| `npm run build:edge`   | Build the Cloudflare Worker bundle in Linux CI only.                                                                                                                                                              |
| `npm run size`         | Check uncompressed Worker size against 64 MiB in Linux CI; override with `WORKER_SIZE_LIMIT_KIB`.                                                                                                                 |

Run these development gates:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run format:check`
4. `npm test`
5. `npm run build`
6. `npm run e2e`

Vitest includes only `tests/unit/**`, excluding the Playwright e2e tests.
The health endpoint is `GET http://localhost:3000/api/health`; it returns
`{ "status": "ok", "version": "<package version>" }` with caching disabled.
POST requests return 405.

The additional `build:edge` and `size` gates run in Linux CI only. This scaffold
does not deploy; no deploy, account setup, or login commands are part of development
validation.

## Free-tier validation

Offline preparation (no deployment):

1. After `npm run build:edge`, run `npm run size` in Linux CI to measure both
   web and cron Workers using Wrangler dry-runs. Each size is compared with the
   existing uncompressed limit; either Worker exceeding it exits 1.
2. With the local database stack running, privately supply `FREE_TIER_DB_URL`
   in the environment, then run
   `npm run free-tier:db -- --count public.workspaces,public.jobs --json usage.json`.
   The URL is accepted only from that environment variable, never from arguments.
   Catalog statistics and optional exact counts run in a read-only transaction
   with a 15-second statement timeout. No row contents are read.
3. Copy `scripts/free-tier/volumes.example.json` to a local volumes file and fill
   only confirmed expected row counts. Add all tables present in `usage.json`.
   Run `npm run free-tier:project -- --per-row usage.json --volumes volumes.json`.
   Null or absent volumes print `MISSING` and exit 2; partial totals are incomplete.
   Projection covers the measured top 15 relations, not all database overhead.
   Database/projection `--limit-mb` defaults to 500 decimal MB (1 MB = 1,000,000 bytes).
4. Parse synthetic logs offline with
   `npm run free-tier:tail -- scripts/free-tier/fixtures/tail-sample.jsonl`.
   Override the 10 ms CPU limit with `--cpu-limit-ms`; `--json report.json` saves
   sanitized aggregates. Verdicts use maximum observed CPU: warn at 70%, over
   above 100%. Missing timing fields stay null; invalid lines are counted.

After PO approval, per the approval record, use the explicitly approved staging
host with `npm run free-tier:probe -- --base-url https://approved-host.example --routes scripts/free-tier/routes.example.json --n 20 --concurrency 2 --json probe.json`.
For the reviewer's local smoke test use `http://localhost:3000` with `next start`.
Only HTTPS or loopback HTTP is allowed. Requests carry no credentials, never
follow redirects, and time out after 15 seconds. `--n` is capped at 200 per route
and `--concurrency` at 5; batches run sequentially. Latency includes response-body
reading; body bytes are counted without saving content. Query strings never
appear in reports. Authenticated measurements await ND-F8-3.

After PO approval, capture request events from the approved Worker with
`wrangler tail --format json > tail.jsonl`, then parse the saved file with
`npm run free-tier:tail -- tail.jsonl --json cpu.json`. Keep raw tail files
private: they can contain headers, logs and exceptions. Only the parser's
aggregates are suitable for the report. Local latency does not measure platform
CPU. Pilot volumes remain **NEEDS SOURCE CONFIRMATION** (ND-F8-1).

## Local database & isolation tests

Install Docker and Supabase CLI 2.122.0 before running the local database suite.
The integration job in GitHub Actions uses a disposable local stack, applies all
migrations from scratch, and needs no repository secrets or deployment.

On Windows, Docker Desktop is enough, and the pinned CLI runs via `npx supabase@2.122.0`
(verified 2026-10-27, Docker 29.9.2). If `docker` isn't on `PATH`, add
`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` (per-user install).

In Bash, start the stack and export its generated development environment:

```bash
npx supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
npx supabase@2.122.0 status -o env
eval "$(npx supabase@2.122.0 status -o env | sed 's/^/export /')"
npm run test:integration
npx supabase@2.122.0 stop --no-backup
```

In PowerShell, replace the `eval` command with:

```powershell
npx supabase@2.122.0 status -o env | ForEach-Object {
  if ($_ -match '^([A-Z_]+)="?(.*?)"?$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
  }
}
```

The harness accepts `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, and `DB_URL`, or
their `SUPABASE_` aliases (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`). Missing environment values fail
immediately with “Integration env missing”. Treat status output as local
credentials; do not commit it. Fixtures use unique synthetic users and slugs in
each test file and remain only in the disposable local database.

Every new tenant table must include a foreign-workspace negative test through
`tests/integration/harness.ts`, exercising a signed user's API client. Unit tests
remain separate and run without Docker via `npm test`.

The first Platform Owner requires an existing auth account. An operator runs this
SQL in the intended local or staging database, substituting its auth user UUID:

```sql
insert into public.staff_profiles (user_id, role)
values ('<auth-user-uuid>'::uuid, 'platform_owner'::public.staff_role);
```

Never commit a real user UUID. Bootstrap is manual; this feature does not prevent
removal of the last PO role. Mapped governance writes (workspace create/update, staff role assign/change, membership grant/revoke) emit audit events automatically,
including bootstrap and maintenance writes (null actor when no JWT is present).

## Auditing new tables

`app_private.audit_row_change()` is the reusable audit trigger helper. In a new
forward migration, use `create or replace function` to extend its table/action
mapping and hard-coded details allow-list, preserving the existing mappings,
`security definer`, empty `search_path`, postgres ownership and revoked API
EXECUTE grants. Then attach it to the new table:

```sql
create trigger audit_example_records after insert or update on public.example_records
  for each row execute function app_private.audit_row_change();
```

Define a namespaced action, UUID target and workspace scope explicitly (null for
platform events). Return without emitting for updates with no audited change.
Unsupported tables raise an error until their mapping exists. AFTER triggers see
the final values from BEFORE guards; events and source writes commit or roll back
together. The helper inserts as postgres even though API roles lack INSERT grants.

Never serialize whole rows into details. Allow only identifiers, roles, slugs and
explicitly approved non-personal fields; workspace names are business data. Never
record personal names, emails or phone numbers. Future columns must not enter the
audit log automatically.

Follow `tests/integration/audit.test.ts` using an independent
`twoWorkspaceFixture()`: assert exactly one event per change, actor/action/target/
workspace and exact details; no event for no-op, rejected or rolled-back writes;
and null actors for service fixtures. Scan details for fixture emails and `@`.
Verify PO visibility, active WO visibility, foreign-workspace denial, trainer/sales/
anonymous denial and loss of access on revocation. Keep direct-insert and
UPDATE/DELETE/TRUNCATE rejection tests, including postgres guard tests that fail
if a guard is removed. Extend the catalog assertions for the new trigger. Run the
full integration suite on the disposable Supabase stack before review.

## Background jobs

Feature SQL enqueues work in the same transaction as its source change:

```sql
select app_private.enqueue_job(
  'system.noop',
  null, -- explicit workspace UUID for workspace jobs; null for platform jobs
  '{}'::jsonb,
  'system.noop:platform:bootstrap:once'
);
```

Use a deterministic key following `<kind>:<workspace>:<entity>:<period>` (maximum
200 characters). Reusing a key returns the existing job ID without changing its
payload or schedule. Enqueue is SQL-only: anonymous, authenticated and service-role
API callers cannot execute it. Optional final arguments are `run_at` and
`max_attempts` (defaults: database now and 5).

Payloads must be non-PII JSON objects, at most 4 KB. Include identifiers only;
never personal names, emails, phone numbers, credentials or message bodies. Kinds
must match `^[a-z_]+\.[a-z_]+$`. Add a handler in
`workers/cron/src/handlers.ts`, keyed by kind. Handlers receive
`{ jobId, kind, workspaceId, payload }`; use the explicit `workspaceId` from the job
for workspace operations. Never derive workspace scope from payload fields.

The separate cron Worker runs every minute and claims batches of 25. It stops
starting new jobs after 20 seconds; an in-flight handler can run longer, so keep
handlers short. Claims increment attempts and hold a five-minute lease. Reports
must carry the current lease token; expired leases can be reclaimed. Failures
retry after 1, 2, 4, 8… minutes, capped at 60 minutes. Maximum attempts or permanent
failures become dead and emit one `job.dead_lettered` audit event. Unknown kinds
fail permanently. Throw `JobError('error_code', { permanent: true })` for a known
permanent failure, or omit `permanent` to retry. Codes must match
`^[a-z0-9_.:-]{1,64}$`; arbitrary errors become `handler_error`, never their message.
Make handlers idempotent: lease recovery can repeat an external side effect after
a crash. Use the job ID as the downstream idempotency key where supported.

`npm run build:cron` bundles the Worker via Wrangler's deploy dry-run without
deploying. CI runs it after `build:edge`. Unit tests cover the drain; database
integration tests cover concurrent enqueue/claim, retries, leases and access.

Production deployment and runtime secrets require PO approval. At deploy time,
configure `SUPABASE_URL` (must be `https://`; the Worker rejects plain `http://`
except loopback hosts for local development) and `SUPABASE_SERVICE_ROLE_KEY` through
`wrangler secret put SUPABASE_URL --config workers/cron/wrangler.jsonc` and
`wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config workers/cron/wrangler.jsonc`.
Never commit secret values or put them in Wrangler vars. The Worker reads them
only from runtime bindings and uses only the three service-role RPCs; service_role
has table SELECT for operations visibility and no direct job mutation grants.

## Design system

`lib/design/tokens.ts` defines the typed light/dark surfaces, semantic colors,
spacing, radii, typography, shadows, motion, and print colors. The root layout
injects `tokensToCss()` from `lib/design/tokens-css.ts`. Consume CSS variables in
component CSS Modules, such as `color: var(--color-text)` and
`padding-inline: var(--space-4)`. Use `--motion-*` for transitions and
`--touch-min` for controls. Keep raw colors in the token definitions or the brand
derivation library.

Use logical CSS properties: `padding-inline-start`, `margin-inline`,
`inset-inline-start`, and `text-align: start`. The logical-CSS unit test scans
all application and component styles. The root reads locale/theme cookies for
the first paint; absent cookies mean Arabic/RTL and the device color scheme.
Geist and IBM Plex Sans Arabic are self-hosted.

Add every message key to `lib/i18n/messages/ar.ts` first and its translation to
`en.ts`. English is typed against the Arabic keys; the parity test rejects missing
or empty entries. Use `getMessages(locale)` and pass labels to components through
props. Wrap measurements, codes, and mixed-direction data in `Bidi`.

Enable the dev-only pages with `LIFTER_SHOWCASE=1` before starting the server
(PowerShell: `$env:LIFTER_SHOWCASE = '1'`, then `npm run dev`). Visit `/showcase`
for tokens, brands, components, and a scaled shell preview. The full shell demos
are `/showcase/shell?role=trainer`, `?role=client`, and `?role=sales`;
`/print-sample` contains the Arabic print spike. These routes return 404 without
the exact flag. Playwright supplies it automatically. The shell renders both
navigation variants on the server and CSS chooses the visible one; its role
configuration defines navigation only and performs no authorization.

Use `<BrandScope color="#059669">…</BrandScope>` from
`components/ui/BrandScope.tsx` to apply a workspace color. It derives accessible
light/dark brand variables for primary fills, labels, links, and focus rings,
including nested scopes. Success, warning, error, and info tokens remain fixed.

Open **NEEDS DECISION** items are recorded in the
[design-system plan](specs/002-design-system/plan.md#needs-decision-po-open-items-designmd-11-provisional-values-only-not-presented-as-approved):

- ND-1: secondary and interactive token values remain proposals for PO review.
- ND-2: the final icon library is undecided; the current outline icons are replaceable.
- ND-3: the shell breakpoint is provisionally `48rem`, declared once in the shell CSS.
- ND-4: the touch target is provisionally 44 × 44 CSS pixels.
- ND-5: platform-owner, workspace-owner, and sales navigation awaits a decision;
  the shell renders their content without navigation.
- ND-6: digits are shown as authored; no Arabic-Indic conversion is applied.
- ND-7: display fonts remain excluded pending licensing decisions.

The A4 print spike uses provisional 15 mm margins. The print e2e writes a PDF to
its Playwright output directory and copies it to `test-results/print-sample.pdf`
for reviewer inspection. The reviewer records shaping, direction, mixed text,
header repetition, and pagination findings separately.

## Backups & restore test

Operator tooling requires Node 24, npm, and Docker Desktop (or Docker Engine on
Linux). It invokes the pinned Supabase CLI 2.122.0 through npm. If Docker is not
on PATH on Windows, set `$env:DOCKER_BIN = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'`.
The scripts also add that binary's directory to child-process PATH for the CLI.
For direct `npx supabase` commands, add the directory to your own PATH.
All child processes use argument arrays, including paths containing spaces.

Choose a backup root and an offline identity location. The PO-chosen local root
is `backup/` in the repository directory (Git-ignored, like `backups/`, `*.age`
and `age-identity*.txt`). Never keep the identity there or anywhere in the
repository. Generate an identity once, on the PO's machine:

```powershell
npm run backup:keygen -- --out 'E:\Offline Keys\age-identity-lifter.txt'
```

This refuses to overwrite a file and prints only the public `age1…` recipient.
Save that recipient in a public recipient file such as
`C:\Operator\lifter-recipient.txt`. Keep the identity offline, with a second
protected offline copy; losing it makes the archives unrecoverable. On Windows,
restrict the identity file's ACL to the operator (POSIX mode 0600 cannot enforce
Windows ACLs). Only connect the identity medium for restore drills.

Supply `BACKUP_DB_URL` privately through the operator's environment, without
putting the connection string in scripts, command history, logs, or git. Pause
application writes and migrations throughout backup: the roles, schema, data,
and verification queries use separate snapshots. For the local stack the default
URL is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; hosted credentials
are operator inputs. Then run daily:

```powershell
npm run backup -- --recipient-file 'C:\Operator\lifter-recipient.txt' --out-root 'C:\Operator\backups'
```

`--recipient <public-key>` is an alternative to `--recipient-file`. `--db-url`
overrides the environment and also lands in shell history, so prefer the
environment. **Known limitation:** either way, the script passes the URL to the
Supabase CLI (`db dump --db-url`) as a child-process argument, which other local
users can read from the process list. Run backups only on a single-user operator
machine until a non-argument credential path is implemented. `--no-prune` disables retention. Do not run concurrent
backups against the same root. Do not mutate an archive during verification.

Only encrypted `roles.sql.age`, `schema.sql.age`, `data.sql.age`, and
`checks.json.age` are written inside each timestamped backup folder. The
plaintext manifest contains format/version/time metadata and ciphertext SHA-256
hashes. Its presence marks completion. A failed backup removes its partial
folder and does not prune. After success, retention keeps the union of the newest
backup in each of the current and preceding 13 UTC days, 7 ISO weeks, and 11
months. Incomplete timestamp folders are removed at that time. Non-backup
directories are left alone. Storage currently supports **0 buckets**; a nonzero
bucket count fails backup until storage export is implemented.

Schedule on the operator machine; this feature creates no scheduled job:

- **Windows Task Scheduler:** create a daily 02:00 task running as the operator.
  Program: `C:\Program Files\nodejs\node.exe`. Arguments:
  `"C:\Users\NEW LAP\Desktop\LFTR\scripts\backup\backup.mjs" --recipient-file "C:\Operator\lifter-recipient.txt" --out-root "C:\Operator\backups"`.
  Start in: `C:\Users\NEW LAP\Desktop\LFTR`. Provide `BACKUP_DB_URL` in that
  account's protected environment and ensure npm and Docker are discoverable.
  Set “Do not start a new instance” and review task exit codes daily.
- **cron:** use `0 2 * * * /home/operator/lifter-daily-backup.sh`. In that
  operator-owned mode-0700 script, set PATH to Node/npm/Docker, load
  `BACKUP_DB_URL` from an external mode-0600 environment file, `cd` to the repo,
  then execute `node scripts/backup/backup.mjs --recipient-file "/home/operator/keys/recipient.txt" --out-root "/home/operator/backups"`.
  Set `CRON_TZ=UTC` where supported if runs must follow UTC.

Run a restore test **monthly and before every production migration**:

```powershell
npm run backup:restore-test -- --backup 'C:\Operator\backups\2026-10-27T12-00-00-000Z' --identity-file 'E:\Offline Keys\age-identity-lifter.txt'
Get-Content 'C:\Operator\backups\restore-tests.log' -Tail 10
```

The test verifies every hash before decrypting, decrypts in memory, starts a fresh
`lifter-restore` stack in an OS temp workdir without repository migrations, and
restores roles → schema → replica-mode data in one `ON_ERROR_STOP` transaction.
The restore connects as `supabase_admin`: Supabase-managed role parameter grants
require the local stack's superuser. This applies only to the isolated local
restore container. A production restore into a fresh project is a separate
PO-approved drill. Startup excludes
`studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta`.
Ports 55320–55329 and inspector port 9083 are reserved for this stack. Mail
ports override both legacy `[inbucket]` and CLI 2.122.0's `[local_smtp]`, which
takes precedence when present. Existing containers or volumes
for this project cause a refusal; the developer's `lifter` stack is untouched.
It compares the exact table map of counts and deterministic checksums and runs a
public-table smoke query. `auth.users` checks cover IDs only. It then stops the
stack with `--no-backup` and removes the temp directory, including on failure.
Decryption needs memory proportional to archive plaintext size; backup dump
encryption streams with bounded memory. The database checksum query itself uses
an aggregate proportional to each table's row count.

Each log line is `timestamp<TAB>backup-id<TAB>PASS|FAIL<TAB>reason-code`.
Failures also print the first redacted `ERROR:`/`FATAL:` stderr diagnostic,
without SQL source, DETAIL, CONTEXT, or quoted values. If teardown fails, the
temporary config is retained for a manual retry and `CLEANUP_FAILED` is reported.
Exit codes are 0 PASS, 1 FAIL, 2 usage. Codes include `HASH_MISMATCH`,
`DECRYPT_FAILED`, `STACK_EXISTS`, `STACK_START_FAILED`, `RESTORE_FAILED`,
`CHECKS_FAILED`, `SMOKE_FAILED`, `CLEANUP_FAILED`, and `LOG_FAILED`.
`--log <path>` overrides the log location. `--keep-stack` is a debugging option
that retains the restored plaintext database and temp workdir; stop that project
and remove its temp workdir manually before another drill.

**A failed or missing restore test blocks production migrations.** Review the
latest applicable PASS and resolve every failure before proceeding. RPO ≤24 h
and RTO ≤4 h remain operational targets for a later approved staging drill.

Reviewer end-to-end drill (PowerShell, Docker running, repo working directory):

```powershell
# Set DOCKER_BIN/PATH as above when needed. No remote database is used.
npx --yes supabase@2.122.0 start
$docker = if ($env:DOCKER_BIN) { $env:DOCKER_BIN } else { 'docker' }
& $docker exec supabase_db_lifter psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE TABLE public.backup_drill (id int primary key, note text); INSERT INTO public.backup_drill VALUES (1, 'LIFTER_BACKUP_PLAINTEXT_SENTINEL');"
# Abort if the scratch table already existed, so the final DROP never removes a table this drill did not create.
if ($LASTEXITCODE -ne 0) { throw 'backup_drill not created; aborting drill' }
$env:BACKUP_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
New-Item -ItemType Directory -Force 'backups\review' | Out-Null
# Drill identities live outside the repository and are deleted even if the drill fails.
$keys = Join-Path ([IO.Path]::GetTempPath()) ("lifter-drill-keys-" + [guid]::NewGuid())
New-Item -ItemType Directory $keys | Out-Null
$drillFailure = $null
try {
  node scripts/backup/keygen.mjs --out (Join-Path $keys 'age-identity-review.txt') > (Join-Path $keys 'recipient.txt')
  # PowerShell redirection may write UTF-16; normalize the public recipient to UTF-8.
  $recipient = (Get-Content (Join-Path $keys 'recipient.txt') -Raw).Trim()
  npm run backup -- --recipient $recipient --out-root 'backups\review\archives' --no-prune
  $backup = (Get-ChildItem 'backups\review\archives' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
  $log = 'backups\review\archives\restore-tests.log'
  npm run backup:restore-test -- --backup $backup --identity-file (Join-Path $keys 'age-identity-review.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Expected PASS' }
  $archive = Join-Path $backup 'data.sql.age'
  $original = [IO.File]::ReadAllBytes($archive)
  $tampered = [byte[]]$original.Clone()
  $tampered[100] = $tampered[100] -bxor 1
  try {
    [IO.File]::WriteAllBytes($archive, $tampered)
    npm run backup:restore-test -- --backup $backup --identity-file (Join-Path $keys 'age-identity-review.txt')
    if ($LASTEXITCODE -ne 1) { throw 'Expected tamper FAIL' }
    if ((Get-Content $log -Tail 1) -notmatch "`tFAIL`tHASH_MISMATCH") { throw 'Expected HASH_MISMATCH' }
  } finally { [IO.File]::WriteAllBytes($archive, $original) }
  node scripts/backup/keygen.mjs --out (Join-Path $keys 'age-identity-wrong.txt') > $null
  npm run backup:restore-test -- --backup $backup --identity-file (Join-Path $keys 'age-identity-wrong.txt')
  if ($LASTEXITCODE -ne 1) { throw 'Expected wrong-key FAIL' }
  if ((Get-Content $log -Tail 1) -notmatch "`tFAIL`tDECRYPT_FAILED") { throw 'Expected DECRYPT_FAILED' }
  Get-Content 'backups\review\archives\restore-tests.log'
  # Ciphertext scan: expect no sentinel or common SQL statements in any archive file.
  Get-ChildItem $backup -File | ForEach-Object {
    $bytes = [IO.File]::ReadAllBytes($_.FullName)
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    if ($text -match 'LIFTER_BACKUP_PLAINTEXT_SENTINEL|CREATE TABLE|COPY public\.') { throw 'Plaintext detected' }
  }
  # The dev stack must still hold exactly the original row.
  $row = & $docker exec supabase_db_lifter psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "SELECT id || ':' || note FROM public.backup_drill;"
  if ($LASTEXITCODE -ne 0 -or ($row | Out-String).Trim() -ne '1:LIFTER_BACKUP_PLAINTEXT_SENTINEL') { throw 'Scratch row check failed' }
} catch {
  $drillFailure = $_
  throw
} finally {
  # This drill created the scratch table (it aborted earlier otherwise), so drop it
  # on success and failure alike; preserve earlier failures and report a lone drop failure.
  & $docker exec supabase_db_lifter psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'DROP TABLE public.backup_drill;'
  $dropFailed = $LASTEXITCODE -ne 0
  if ($dropFailed) { Write-Warning 'Scratch table drop failed; drop public.backup_drill manually' -WarningAction Continue }
  try {
    Remove-Item -LiteralPath $keys -Recurse -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $keys) { throw 'Temporary key directory still exists' }
  } finally {
    Remove-Item Env:BACKUP_DB_URL
  }
  if ($dropFailed -and $null -eq $drillFailure) {
    throw 'Scratch table drop failed; drop public.backup_drill manually'
  }
}
```

Each run uses a fresh temporary key folder outside the repository, so keygen never hits an existing file.
The reviewer owns this Docker verification; unit gates do not establish a
successful end-to-end restore.
