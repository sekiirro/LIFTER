# AD-F11-1 — three architectures: research and local spikes

2026-10-28 · U11 · branch `011-client-accounts` · starting HEAD `1c2acd2e82396595a06fd9a84e1856c1cc833a1d`.

**PENDING PO. Recommendation: retain A1 / option (i), conditional on C1–C4.** A3 has real transactional atomicity, but its hook/API combinations do not satisfy all current constraints on v2.197.0. This is mechanism evidence, not feature acceptance. PO decisions, AUTH-PW-01 and T001–T046 remain unchanged.

## Scope and cleanup

All executable spikes and downloaded source were outside the repo at `%TEMP%\lifter-f11-spikes\` (session path `C:\Users\NEWLAP~1\AppData\Local\Temp\lifter-f11-spikes`). Scratch `setup.sql`, `run.py`, `followup.py`, `extra.py` used disposable `f11_spike` objects and synthetic `example.com` identities only. `sdk.mjs`/`sdk.py` repeated A1/A2 with the actual pinned SDK, installed only in scratch. Sanitized result JSON files retain statuses/counts, without passwords, hashes or credentials. No spike code is committed. No application/migration/dependency changes, cloud/linked commands or deployment; LFTR and LFTR-008 were not modified.

Started the local stack with the required command:

```powershell
npx --yes supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
```

Docker bin: `C:\Users\NEW LAP\AppData\Local\Programs\DockerDesktop\resources\bin`. CLI **2.122.0**, running Auth **v2.197.0**, PostgreSQL image **17.11.0.006**. Latest local Auth migration: **20260831180000**; measured provider bcrypt cost: **10**, without printing the hash. API calls targeted only `http://127.0.0.1:54321/auth/v1/`; SQL ran through local `docker exec -i supabase_db_lifter psql -X -U postgres -d postgres -At -v ON_ERROR_STOP=1`. A3 used raw REST. A1/A2 used raw REST and then actual `@supabase/supabase-js@2.118.0` methods with persistence/refresh disabled; no keys, passwords or token values were printed.

Backed up config bytes before appending `[auth.hook.before_user_created]` with `enabled = true`, URI `pg-functions://postgres/f11_spike/before_user`, plus `[auth.email] enable_confirmations = false`. Autoconfirm was already true by default. Local stop/start applied configuration changes. Restored original bytes, restarted the original-config stack, then finished with **`npx --yes supabase@2.122.0 db reset` (exit 0)**, reapplying all ten committed migrations through registration links. Cleanup catalog checks are recorded below.

After the final reset: spike schema absent, spike triggers=0, synthetic users=0; running Auth environment has no before-user-created hook configuration. Config hash matches below. `tasks.md` SHA-256 before/after is `fceaac2e3be0d137e7067d580ef59498c6fa8d8b38c764b66479f6feb7912ac3`. Final diff is limited to the three authorized docs; final commit/push SHA is reported in the handoff (a commit cannot embed its own SHA).

| Config SHA-256 | Value |
| --- | --- |
| Before | `7b4ac2ebb6e2138b4a7218f9cc8fce5b4d3779610992cd30908bdfc66ac99883` |
| After byte restoration | `7b4ac2ebb6e2138b4a7218f9cc8fce5b4d3779610992cd30908bdfc66ac99883` |

## Official evidence: six short quotes

Retrieved 2026-10-28; documentation is not a hosted-version guarantee.

| Source | Quote |
| --- | --- |
| [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) | “Postgres Hooks have 2 seconds to complete processing while HTTP Hooks should complete in 5 seconds.” |
| [Before User Created](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) | “If the hook returns an error object, the signup is denied and the user is not created.” |
| [User Management](https://supabase.com/docs/guides/auth/managing-user-data) | “If the trigger fails, it could block signups, so test your code thoroughly.” |
| [Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) | “This function should only be called on a server. Never expose your `service_role` key in the browser.” |
| [Official signUp reference](https://supabase.com/docs/reference/python/auth-signup) | “If Confirm email is disabled, both a `user` and a `session` are returned.” |
| [Password security](https://supabase.com/docs/guides/auth/password-security) | “Supabase Auth uses bcrypt, a strong password hashing function, to store hashes of users' passwords.” |

The Hooks page lists Before User Created on **Free and Pro**, implemented with Postgres functions or HTTP. Hook errors carry `http_code`/`message`; Postgres errors are not retried and propagate as Auth HTTP errors. The general documentation statement that hooks run in a transaction does **not** establish a shared user-insert transaction. Input contains request metadata (id/time/name/IP) and the user-to-be-created, including user metadata; that user is not yet in Postgres. Output allows/denies rather than rewriting the user. The [pinned user model](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L26-L54) excludes encrypted passwords/tokens from JSON; the hook cannot inspect plaintext to enforce F11's password policy.

User Management documents an AFTER INSERT `auth.users` trigger with an empty-search-path SECURITY DEFINER application-schema function. It recommends FK references to the Auth primary key; other managed columns/indexes/constraints can change. Auth is not exposed through the generated API. [Managed-schema troubleshooting](https://supabase.com/kb/troubleshooting/database-error-saving-new-user-RU_EwB) identifies direct SQL user insertion as a cause of incompatible NULL token markers. Local DML permission is therefore not a compatibility contract. [Hosted role restrictions](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema) say `postgres` is not a superuser, cannot assume the reserved Auth-admin role, and cannot grant custom roles Auth schema usage without grant option. This does not prohibit documented triggers or prove local direct-write permissions on hosted Supabase. Hosted compatibility remains unverified.

Admin createUser supports `email_confirm: true` without a signup session/confirmation-email flow. Public signUp with confirmations enabled returns an unconfirmed user/no session but invokes confirmation delivery; do not assume it solves D-19 without SMTP. Disabled confirmations auto-confirm and create a session. Discarding tokens is not equivalent to ND-F11-6b's requirement that signup create no session. No SMTP was configured or exercised. Password hashes reside in `auth.users.encrypted_password`; provider requirements cannot express the exact approved character policy (research R9 / AUTH-PW-01).

## GoTrue v2.197.0 source trace

- [signup.go:177–191](https://github.com/supabase/auth/blob/v2.197.0/internal/api/signup.go#L177-L191) hashes/constructs the user and invokes `triggerBeforeUserCreated` **before** `db.Transaction`. [hooks.go](https://github.com/supabase/auth/blob/v2.197.0/internal/api/hooks.go#L35-L49), including `checkTX`, refuses that hook on an already transactional connection.
- [Postgres hook dispatcher](https://github.com/supabase/auth/blob/v2.197.0/internal/hooks/hookspgfunc/hookspgfunc.go#L73-L121) sets a 2-second statement timeout in its own transaction, then checks returned hook errors after that transaction completes. Local hook markers persisted even for denial/later trigger failure. Hook-side consumption is not atomic with user creation. HTTP hooks likewise do not share the user-insert DB transaction.
- [signup.go:191–278](https://github.com/supabase/auth/blob/v2.197.0/internal/api/signup.go#L191-L278) places user INSERT, identity creation and confirmation in the outer transaction. Its `signupNewUser` wrapper reuses that transaction through [storage.Connection.Transaction](https://github.com/supabase/auth/blob/v2.197.0/internal/storage/dial.go#L375-L405), rather than committing independently. A trigger exception propagates and rolls back the user and associated writes. Autoconfirmed session issuance follows in a separate transaction.
- [adminUserCreate](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go#L399-L592) validates plaintext password strength, constructs/hashes, then transactionally inserts user, identities, audit, role and confirmation. **It never invokes before-user-created.** Trigger exceptions still roll back this transaction. Hook bypass and zero admin-created sessions were measured locally.
- [API error handling](https://github.com/supabase/auth/blob/v2.197.0/internal/api/errors.go#L150-L210) varies by requested Auth API version. Our REST calls omitted `X-Supabase-Api-Version`: denial returned HTTP **403**, numeric `code=403`, `error_code=unknown`, `msg=Invalid signup`; trigger exceptions returned HTTP **500**, SQLSTATE `code=P0001`, `message=Invalid signup`. Source for the newer response format uses `unexpected_failure` for wrapped saving/creating-user failures; that format was not locally tested. Do not assume SQL error text is hidden or forward provider bodies/headers publicly.
- [Password crypto](https://github.com/supabase/auth/blob/v2.197.0/internal/crypto/password.go#L370-L390) uses bcrypt default cost outside test mode. Local cost was 10. Minimal pgcrypto sign-in success does not establish encryption-mode, upgrade or exhaustive row parity.

## Spike results

`U/I/C/A` = Auth users / Auth identities / dummy pending clients / dummy consumption audit rows. Hook markers are separate committed evidence. Queries counted synthetic identities or dummy link rows, never selected secrets. Fresh UUIDs per fixture; the race used two emails/tickets sharing one link.

| Test | Result | Evidence |
| --- | --- | --- |
| A3 hook enabled/reject | PASS | Enabled=true; HTTP 403/unknown; U/I/C/A=0/0/0/0, consumed=false, hook marker=1. |
| A3 BEFORE trigger raises after dummy writes | PASS | HTTP 500/P0001; all four counts zero, consumed=false; hook marker survives. |
| A3 AFTER INSERT trigger raises | PASS | HTTP 500/P0001; user and preceding dummy client/consume/audit writes all roll back; no identity. |
| A3 anon trigger success | PASS atomicity | HTTP 200; U/I/C/A=1/1/1/1, consumed=true; dummy client defaults to pending. |
| A3 concurrent double signup | PASS | Both hooks ran; HTTP 200 + 500/P0001; exactly one user/identity/client/audit, one consumed link. Losing email has zero Auth rows. |
| A3 INSERT-only metadata strip | **FAIL** | Ticket key persisted in user metadata for anon/admin; anon identity also retained it. Subsequent Auth writes reintroduced metadata. |
| A3 strengthened metadata strip | PASS storage | Added BEFORE UPDATE user scrub and BEFORE INSERT/UPDATE identity scrub: zero ticket keys stored in fresh anon/admin user/identity JSON. |
| A3 response stripping assumption | **FAIL** | Both API responses still contained the ticket id despite database scrubbing. Discard/sanitize the entire provider response. |
| A3 anon no-session | **FAIL** | Successful signUp returned access token; one auth.sessions row; autoconfirm=true. |
| A3 admin hook coverage | **FAIL** | Hook-reject fixture succeeded via admin: hook markers=0. Trigger still committed client/consume/audit atomically. |
| A3 admin no-session/rollback | PASS | Admin success: no access token, sessions=0. Raised trigger: HTTP 500/P0001, all counts zero, consumed=false. |
| A3 forged ticket | PASS bounded probe | Random missing ticket: anon 403/unknown; admin trigger 500/P0001. Not exhaustive forgery coverage. |
| A3 safe response projection | PASS bounded probe | Scratch `mapping.py` projected five measured legacy failures to only `{status:'invalid'}`; three source-shaped duplicate fixtures to only `{status:'duplicate'}`. No provider text/fields forwarded. Duplicate fixtures were not live API measurements. |
| A1 direct insert/sign-in | PASS | User/identity/client/guarded consume/audit committed; real password-grant HTTP 200/access token; bcrypt cost 10. |
| A1 actual SDK signInWithPassword | PASS | error=null, user/session returned. Auth sessions count was zero before this later sign-in; `sdk-results.json`. |
| A1 exception after all writes | PASS | psql exit 3; U/I/C/A=0/0/0/0, consumed=false. Link fixture existed before transaction. |
| A2 DB finalize failure | PASS orphan demonstration | Confirmed createUser HTTP 200; DB transaction exit 3; Auth user remains and password sign-in returns 200. |
| A2 ban compensation | PASS observation | Admin update 200; sign-in 400/user_banned; user=1, identity=1, session row=1 remain. Finite 876000h ban, not permanent-gate proof. |
| A2 hard-delete compensation | PASS observation | Admin delete 200; user/identity/session counts zero. Existing JWT validity not tested; docs say a stateless access JWT survives deletion until expiry. |
| A2 actual SDK repeat | PASS observation | createUser error=null/no session property; failed DB exit 3; orphan signInWithPassword succeeds; updateUserById ban succeeds, sign-in=user_banned; deleteUser succeeds, zero remaining users. |

A3's hook checked dummy link availability, ticket expiry and email binding; its trigger locked/rechecked the link, inserted a pending client, conditionally consumed and audited. Client.link_id was UNIQUE; the client→user FK was deferred for BEFORE INSERT creation. The hook-reject mode was intentionally absent from the trigger to expose admin bypass. A1/A2 controls deliberately bypassed A3 admission. Real F11 limits, canonical uniqueness across staff/clients, receipts, production audit/deferred checks, durable failure accounting and F4 parity were not implemented or accepted.

The projection demonstrates that measured legacy errors can be mapped without echoing secrets. It is not an implemented action contract. Newer API `unexpected_failure` erases business-error distinctions; classifying all such failures as unavailable would violate the existing rule against deriving unavailable from link/identity state. Any selected A3 variant must prove trusted invalid/duplicate classification across its chosen SDK/API version and race paths (e.g. private outcome evidence), separately from infrastructure errors, with identical D-08 payload/status/headers/timing across collision scopes. That remains unresolved here; never forward a SQL constraint detail or use metadata as the classifier.

## Scored comparison

**1 poor/high effort → 5 strong/low effort**; qualitative assessment, not benchmarks. A3 lists anon/admin differences. Contract failures outweigh scores.

| Criterion | A1 direct Auth writes | A2 API + compensation | A3 API + hook + trigger |
| --- | --- | --- | --- |
| Security: secrets/service role | **4** anon RPC; bounded DB password path | **2** privileged orchestration/reconciler | **3/2** ticket transport/echo; admin service key and hook bypass |
| Security: forgery/enumeration | **4** independent DB checks/generic action response | **2** reservation/fencing + provider error sanitization | **3** untrusted metadata; ticket binding + trigger recheck; distinct hook errors |
| Atomicity/orphan/consume without client | **5** one signup transaction | **1** usable orphan proven; client/consume/audit remain an atomic subset | **5** trigger/user atomicity proven; hook writes separate |
| Maintainability | **2** replicates provider row/hash semantics | **2** supported creation, complex crash/reconcile states | **3** supported creation, cross-schema triggers/scrubs and bypass rules |
| Supabase compatibility/upgrade risk | **1** managed-table/hash internals; hosted unverified | **4** official API; durable Auth-row gate lowers this score | **3** documented trigger/hook; identity scrub adds coupling; hosted unverified |
| AUTH-PW-01 | **3** shared app + independent DB policy; provider creation checks bypassed | **4** app policy + provider backstop, not exact provider policy | **3/4** hook lacks password; server ticket/policy and provider backstop |
| Rate limits/attestation | **5** durable admission/redemption before bcrypt | **3** admit before API + reconciliation limits | **2/4** anon hashes before hook; admin can gate HTTP, trigger independently verifies ticket |
| Testability | **4** deterministic local rollback; exhaustive parity costly | **2** process death/unknown commit/cleanup outages | **4** API race/rollback testable; metadata/other creation flows add cases |
| Effort | **3** existing plan; guard/parity substantial | **1** reservations/gating/fencing/reconciliation | **2** transport/hook/triggers/scrubs and task/contract redesign |
| ND-F11-6b + D-19 + proposed C3 | Fits structurally; acceptance pending | Admin no session/SMTP, but service key + orphan problem | Anon creates session; admin avoids session/SMTP but bypasses hook and replaces C3 |

## Recommendation and proposed binding conditions — PENDING PO

Retain **A1 / option (i)** for the current contract: minimal local sign-in/rollback now passed, and it preserves no signup session and no service-role signup path. Its managed-schema coupling remains a major risk; no candidate is implementation-ready. A3 is a credible atomic alternative, materially better than A2 on consistency: official API creation does **not** inherently require compensation when a trigger does all finalization.

The exact hook-gated, anon-only, no-session/no-SMTP A3 combination is not established. Admin A3 meets no-session/no-SMTP, but requires a revised C3 and authoritative trigger admission despite the hook never executing on that path. It is a different variant requiring an explicit architecture selection. A failed A1 compatibility guard must reopen AD-F11-1, not silently switch designs.

Proposed conditions, binding only if PO selects A1:

1. **C1 compatibility:** retain fail-closed migration/column/type/generated-field allowlist before every admission write/redemption and Auth write; include relevant hashing/storage-encryption configuration. Observed migration 20260831180000 is evidence, not an accepted production allowlist. Mismatch → generic unavailable/no effects.
2. **C2 parity/atomicity:** retain exhaustive user/identity comparison against official-API controls, real SDK signInWithPassword coverage, upgrade/config fixtures, every write/deferred failure, concurrency and lost-response replay proofs. These minimal REST/SDK spikes do not complete C2. Signup creates zero sessions; later pending JWTs confer zero client access through both walls.
3. **C3 password/privilege:** retain anon/publishable-only signup RPC, hardened empty-search-path definer, revoked internal EXECUTE and no signup service key. Implement AUTH-PW-01 shared F11/F4 application validator plus independent direct-path DB policy: min 8 characters, number, printable non-letter/non-digit/non-whitespace symbol, max 72 UTF-8 bytes, safe NUL/truncation rejection. Cost 10 is the local baseline; encryption mode/provider compatibility still require proof. Admit/count before bcrypt. Never expose plaintext, link credentials, hashes or provider bodies in logs/errors/audit/returns.
4. **C4 production blocker:** local-only evidence is insufficient; reverify hosted Auth version, DML/trigger permissions, upgrade allowlist and rollback before any deployment under separate PO authority. No hosted operation is authorized here. AD-F11-1 and independent T046 review remain pending.

If A3 is reconsidered, transport only a random one-use ticket id in metadata, **never raw link token or token hash**. Treat the id as a temporary bearer credential. The private ticket must bind link/request, validated canonical payload, expiry, attestation and pending-only state; metadata cannot select scope/role/state. Admission issuance durably counts all submissions and independently verifies link-key binding before HTTP/hash work. The hook can precheck; the trigger must lock/revalidate link validity with fresh consume-time, ticket one-use, admission/limits, global uniqueness and pending state, then atomically client/claims/consume/receipt/audit. Preserve link-first lock order. Durable failure accounting and business-failure ticket redemption cannot be assumed to survive an aborted Auth transaction; current U2/U3 semantics need redesign. Strip every relevant user/identity INSERT/UPDATE, sanitize responses and inspect JWT/log surfaces. Fail-closed alternate creation-flow rules must preserve staff provisioning/F4. Storage stripping passed; comprehensive exposure/forgery/redemption proofs did not run.

## Task deltas — described only, conditional on AD-F11-1

For retained A1, no architecture replacement/new IDs: conditional on AD-F11-1, T002–T005 capture version/cost/config/encryption evidence; T010–T018 turn scratch mechanisms into RED→GREEN SDK/parity/no-session/race/deferred-failure tests; T019–T024 retain durable admission/attestation and sanitized public errors; T039–T045 record regression evidence/C4 blockers. Existing tasks own these obligations. Scratch passes complete no task. AUTH-PW-01 scope in T004/T031/T034/T043–T044 is preserved.

Only if A3 is selected, conditional on AD-F11-1: redesign T002–T005 compatibility manifests; T006–T009 ticket binding/replay/failure-redemption; T010–T018 replace direct Auth/hash writes with API/trigger atomicity, hook-bypass/alternate-flow, metadata-reinsertion/identity/response-leak and no-session tests. T019–T024 gate HTTP creation with durable attestation/rates and select either anon with a newly proven no-session mechanism or admin with replacement C3 and trigger-authoritative admission. T039–T045 add hook-config restoration/hosted compatibility/upgrade coverage. Model/contract/quickstart edits need separate authorization. A2 would additionally require durable reservations, permanent gating, fencing, compensation and reconciliation crash tests. **No deltas were applied to tasks.md; T001–T046, order/units and T046 text remain byte-identical.**
