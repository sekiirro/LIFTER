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
| `npm run size`         | Check the Worker bundle size in Linux CI only (script added in Batch 3).                                                                                            |

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
