# Quickstart / Validation: P0-F3

| Step | Command | Expected |
|---|---|---|
| Unit | `npm test` | `authorize` table tests pass |
| Local DB (needs Docker) | `npx supabase@2.122.0 start` | Migrations apply cleanly |
| Env | `npx supabase@2.122.0 status -o env` → export the vars | `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DB_URL` set |
| Integration | `npm run test:integration` | catalog, isolation, governance and parity suites pass |
| CI | push / PR | The `integration` job is green |

Negative check (reviewer, not committed): change the `workspaces` SELECT policy to `using (true)`. `isolation.test.ts` must fail.

Without Docker, `npm run test:integration` fails fast with "Run `supabase start`". It never passes silently.
