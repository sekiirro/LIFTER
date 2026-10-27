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
removal of the last PO role. Audit event emission is deferred to F5.

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
