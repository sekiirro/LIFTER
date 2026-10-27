# Quickstart / Validation: P0-F1

Prereqs: Node 24 (`.nvmrc`), npm 11, git. Docker is only needed for the optional `npx supabase start`.

| Step | Command | Expected |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0, 0 warnings |
| Format | `npm run format:check` | exit 0 |
| Unit | `npm test` | health test passes |
| Edge build (Linux CI) | `npm run build:edge` | `.open-next/` produced, no deploy |
| Size (Linux CI) | `npm run size` | prints `compressed KiB / limit KiB (x%)`; exit 1 if over |
| E2E | `npx playwright install chromium && npm run e2e` | health passes |
| Health | `npm run dev`, then `GET /api/health` | `{"status":"ok","version":"0.1.0"}` per [contract](contracts/health.md) |

Negative checks: add a type error → `typecheck` fails. Set `WORKER_SIZE_LIMIT_KIB=1` → `size` exits 1.
