# LIFTER

## Development

Prerequisites: Node.js 24 (see `.nvmrc`) and npm 11.17.0.
Install dependencies with `npm ci`.

| Command                | Purpose                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start the Next.js development server.                                                                                                                               |
| `npm run build`        | Create the production Next.js build.                                                                                                                                |
| `npm run start`        | Serve the production build on port 3000.                                                                                                                            |
| `npm run typecheck`    | Check TypeScript without emitting files.                                                                                                                            |
| `npm run lint`         | Run ESLint with no warnings allowed.                                                                                                                                |
| `npm run format`       | Format files with Prettier.                                                                                                                                         |
| `npm run format:check` | Check formatting without changing files.                                                                                                                            |
| `npm test`             | Run the Vitest unit tests in `tests/unit`.                                                                                                                          |
| `npm run e2e`          | Run Playwright health API tests in the Chromium project. Builds and starts the production server automatically; reuses an existing healthy local server outside CI. |
| `npm run build:edge`   | Build the Cloudflare Worker bundle in Linux CI only.                                                                                                                |
| `npm run size`         | Check uncompressed Worker size against 64 MiB in Linux CI; override with `WORKER_SIZE_LIMIT_KIB`.                                                                   |

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

## Backups & restore test

Operator tooling requires Node 24, npm, and Docker Desktop (or Docker Engine on
Linux). It invokes the pinned Supabase CLI 2.122.0 through npm. If Docker is not
on PATH on Windows, set `$env:DOCKER_BIN = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'`.
The scripts also add that binary's directory to child-process PATH for the CLI.
For direct `npx supabase` commands, add the directory to your own PATH.
All child processes use argument arrays, including paths containing spaces.

Choose a backup root and an offline identity location. Keep both outside source
control. Generate an identity once, on the PO's machine:

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
overrides the environment but exposes the URL in process arguments/history;
prefer the environment. `--no-prune` disables retention. Do not run concurrent
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
$env:BACKUP_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
New-Item -ItemType Directory -Force 'backups\review' | Out-Null
node scripts/backup/keygen.mjs --out 'backups\review\age-identity-review.txt' > 'backups\review\recipient.txt'
# PowerShell redirection may write UTF-16; normalize the public recipient to UTF-8.
$recipient = (Get-Content 'backups\review\recipient.txt' -Raw).Trim()
npm run backup -- --recipient $recipient --out-root 'backups\review\archives' --no-prune
$backup = (Get-ChildItem 'backups\review\archives' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
npm run backup:restore-test -- --backup $backup --identity-file 'backups\review\age-identity-review.txt'
if ($LASTEXITCODE -ne 0) { throw 'Expected PASS' }
$archive = Join-Path $backup 'data.sql.age'
$original = [IO.File]::ReadAllBytes($archive)
$tampered = [byte[]]$original.Clone()
$tampered[100] = $tampered[100] -bxor 1
try {
  [IO.File]::WriteAllBytes($archive, $tampered)
  npm run backup:restore-test -- --backup $backup --identity-file 'backups\review\age-identity-review.txt'
  if ($LASTEXITCODE -ne 1) { throw 'Expected tamper FAIL' }
} finally { [IO.File]::WriteAllBytes($archive, $original) }
node scripts/backup/keygen.mjs --out 'backups\review\age-identity-wrong.txt' > $null
npm run backup:restore-test -- --backup $backup --identity-file 'backups\review\age-identity-wrong.txt'
if ($LASTEXITCODE -ne 1) { throw 'Expected wrong-key FAIL' }
Get-Content 'backups\review\archives\restore-tests.log'
# Ciphertext scan: expect no sentinel or common SQL statements in any archive file.
Get-ChildItem $backup -File | ForEach-Object {
  $bytes = [IO.File]::ReadAllBytes($_.FullName)
  $text = [Text.Encoding]::UTF8.GetString($bytes)
  if ($text -match 'LIFTER_BACKUP_PLAINTEXT_SENTINEL|CREATE TABLE|COPY public\.') { throw 'Plaintext detected' }
}
& $docker exec supabase_db_lifter psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT * FROM public.backup_drill;'
# Expect the original row; remove only the reviewer-created scratch table afterwards.
& $docker exec supabase_db_lifter psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'DROP TABLE public.backup_drill;'
Remove-Item Env:BACKUP_DB_URL
```

Choose fresh identity filenames for repeat runs (keygen never overwrites).
The reviewer owns this Docker verification; unit gates do not establish a
successful end-to-end restore.
