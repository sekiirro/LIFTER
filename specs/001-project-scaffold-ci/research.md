# Research: P0-F1

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Package manager | npm 11 + lockfile | Already installed; zero setup; reproducible with `npm ci` | pnpm (not installed; corepack is being removed from newer Node) |
| Node version | 24 LTS pinned (`.nvmrc`, `engines`, CI `setup-node` reads `.nvmrc`) | Current LTS, matches the local machine | 22 LTS |
| Edge build | `opennextjs-cloudflare build` → `.open-next/` | Approved in Architecture v3 | `next-on-pages` (deprecated path) |
| Size measurement | `wrangler deploy --dry-run --outdir <tmp>`, then gzip the emitted bundle in-script and compare to `WORKER_SIZE_LIMIT_KIB` | Dry-run bundles like a real deploy without account access; the in-script gzip makes the number deterministic | Parsing wrangler's console output (brittle) |
| Free-tier limit | Default 65536 KiB **uncompressed** (official page, checked 2026-10-27: "There is no compressed size limit"; 64 MiB uncompressed on Free and Paid). Gzip size is reported for information only. | Official source verified | Earlier 3 MB compressed assumption (now obsolete) |
| Lint/format | ESLint 9 flat config with `eslint-config-next` + Prettier; `--max-warnings=0` | Standard for Next | Biome (fine, but less Next integration) |
| Unit tests | Vitest; health payload built by the pure `lib/health.ts` | Fast, TS-native | Jest |
| E2E | Playwright Chromium against `next start`; CI installs Chromium only | Matches the later RTL/AR screenshot gate | Cypress |
| Version in health | `next.config.ts` imports `package.json` and injects `version` as `APP_VERSION` at build | Never exposes the env generically | Reading package.json at runtime (not available in Workers) |
| Supabase | `supabase init` output committed (`config.toml`), with no migrations | Local DB tooling ready for P0-F3 | — |
| CI | GitHub Actions on push and PR: `npm ci` → typecheck → lint → format:check → test → build:edge → size → e2e. `validate` uses no secrets; later `integration`/`storage` jobs may use optional Docker Hub credentials only for authenticated image pulls. No deployment secrets or deploy step. | FR-009 | Merged workflow at `9b4d7a4c9db0dc0493dbd6419a6fead95290f1dd` |
