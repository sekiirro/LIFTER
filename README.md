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

## Local database & isolation tests

Install Docker and Supabase CLI 2.122.0 before running the local database suite.
The integration job in GitHub Actions uses a disposable local stack, applies all
migrations from scratch, and needs no repository secrets or deployment.

On Windows, Docker Desktop is enough, and the pinned CLI runs via `npx supabase@2.122.0`
(verified 2026-10-27, Docker 29.9.2). If `docker` isn't on `PATH`, add
`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` (per-user install).

In Bash, start the stack and export its generated development environment:

```bash
supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
supabase status -o env
eval "$(supabase status -o env | sed 's/^/export /')"
npm run test:integration
supabase stop --no-backup
```

In PowerShell, replace the `eval` command with:

```powershell
supabase status -o env | ForEach-Object {
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
removal of the last PO role. Governance writes emit audit events automatically,
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
