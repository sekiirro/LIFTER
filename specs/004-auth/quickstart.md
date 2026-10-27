# Quickstart / Validation: P0-F4

Prerequisites: Docker Desktop on PATH, `npm ci`, local stack per README ("Local database").

1. Gates: `npm run typecheck && npm run lint && npm run format:check && npm test`.
2. Build and secret scan: `npm run build:edge && node scripts/check-client-secrets.mjs` → `0 findings`.
3. Local stack: `npx supabase@2.122.0 start -x …` → export `status -o env` → `npm run test:integration`. `tests/integration/auth-recovery.test.ts` covers:
   - the role × workspace matrix
   - self and staff targets denied
   - default `recovery_target_workspace` denies all (ND-F4-5)
   - rate limit
   - exactly one `recovery_link.generated` event per record, with no `@` in details
   - issuances immutable and not insertable through the API
   - single-use and superseded links via `verifyOtp`
   - a revoked membership drops out of the actor scope
4. E2E: `CI=1 npm run e2e`.
   - The `/login` and `/auth/recovery` pages pass axe in AR and EN.
   - Anonymous requests to `/` redirect to `/login?next=%2F`.
   - `next=//evil.example` falls back to `/`.
5. Manual (optional, local): sign in as a fixture staff user in `npm run dev` with the local env, then sign out.
6. Negative checks (reviewer):
   - Temporarily drop the staff-target clause from `recovery_link_guard` (via a scratch migration). The staff-target test must fail. Revert.
   - Temporarily remove the WO branch of the capability. The WO-allowed test must fail. Revert.
   - Temporarily remove `'server-only'`. Import the admin module into a client component. The build must fail. Revert.
