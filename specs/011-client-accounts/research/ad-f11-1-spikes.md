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

## Option 3b confirmation (U14)

2026-10-28 · starting HEAD `4221e9c` · **AD-F11-1 PENDING PO; no approval recorded.**

**Result: the specified INSERT-ticket variant fails on GoTrue v2.197.0. Retain option 1 / (i) as the conditional recommendation.** Supplied `app_metadata` arrives on an UPDATE after the user/identities INSERTs. An INSERT-only trigger that preserves ticketless staff provisioning therefore silently skips signup finalization. A separate UPDATE-finalization diagnostic demonstrated atomic rollback, but does not establish an implementation-ready replacement.

All executable SQL/JS, dependencies, downloaded source and sanitized results are outside the repo in `%TEMP%\lifter-f11-spike3b\`. Only local Docker/loopback endpoints were used, with CLI **2.122.0**, Auth **v2.197.0**, supabase-js **2.118.0**, and the requested Docker bin/start exclusion list. Started from local `npx --yes supabase@2.122.0 db reset`, applying all **10** committed migrations through `20261030120000_registration_links.sql`, including F4 recovery and F10. No Before User Created hook was installed. `config.toml` contains only `project_id = "lifter"`; effective defaults: **enable_signup=true**, **minimum_password_length=6**, required composition empty. No config edits, linked/cloud operations, deployment or feature implementation.

### Source and observed statement sequence

The pinned [admin creation source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go#L489-L590) constructs default provider metadata, then inside one transaction performs: user INSERT → email identity INSERT → phone identity INSERT → provider audit INSERT → role UPDATE → supplied app-metadata UPDATE → confirmation UPDATE → user-metadata verification UPDATE. `phone_confirm` was omitted. [SetRole / UpdateAppMetaData](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L206-L259) use column-specific UPDATEs; [Confirm](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L524-L542) updates confirmation fields and then user metadata.

Scratch BEFORE/AFTER user triggers recorded only operation, ticket-presence booleans, changed column names and transaction ID; identity INSERTs were also observed. Exact SDK call: user INSERT **BEFORE=false, AFTER=false**; two identity INSERTs; user UPDATEs changing `role`, `raw_app_meta_data` (**first ticket=true**), `email_confirmed_at`, then `raw_user_meta_data` (plus managed timestamps/generated-field observations). All belonged to transaction **1263**. Provider-audit placement is from source, rather than this user/identity trace. Thus the ticket is **not present at INSERT**, independently of trigger ordering.

### Tests 1–8

`U/I/C/A` = newly created Auth users / identities / dummy pending clients / dummy audit rows. Both email and phone produce **two identities**. “Diagnostic” below means the explicitly different scratch BEFORE UPDATE finalizer, with locked link/ticket, strict `expires_at > clock_timestamp()` checks after locks, binding/uniqueness, atomic consumption/audit, and user-metadata scrubbing. It is not a pass for the specified INSERT variant.

| Test | Result | Evidence / implication |
| --- | --- | --- |
| 1. app_metadata at INSERT | **FAIL** | Both INSERT phases false; ticket first appears on app-metadata UPDATE. Exact success: U/I/C/A **1/2/0/0**, link unconsumed. INSERT-only admission cannot work. |
| 2. Atomic rollback and errors | **FAIL exact; PASS diagnostic rollback; FAIL classification** | Exact invalid, expired, consumed and dummy duplicate-email/phone fixtures all returned **200**, leaving **1/2/0/0**. Diagnostic unknown ticket, expired link/ticket, consumed link and dummy duplicate email/phone each returned **500**, with zero new U/I/C/A; available links remained unconsumed, pre-consumed link stayed consumed, pre-existing collision rows were preserved. An injected AFTER UPDATE exception **after client/consume/audit writes** also yielded **0/0/0/0**, unconsumed. Native Auth duplicates: **422/email_exists**, **422/phone_exists**, no consumption. Legacy trigger response: **500/code=P0001**; `X-Supabase-Api-Version: 2024-01-01`: **500/code=unexpected_failure**. SDK trigger-error `code` was absent. Provider text was present; do not forward it. Safe output projection is possible, but faithful invalid/duplicate/unavailable distinction is unproven. |
| 3. Ticket scrubbing | **FAIL exact; PASS diagnostic storage; response echo remains** | Exact ticket persists in app metadata and response. Diagnostic: ticket absent from stored `raw_app_meta_data`, `raw_user_meta_data` and both `identity_data` rows, including after successful password sign-in, refresh and admin metadata update. Later user UPDATE traces contained no ticket. App metadata was **not copied into identities**: observed keys were sub/email-or-phone/email_verified/phone_verified. Successful API body **still echoes ticket** from GoTrue memory: action must discard the entire response and never log it. No identity scrub was needed for this app-metadata-only admin probe; arbitrary user-metadata transports are not validated by it. |
| 4. Concurrency | **FAIL exact; PASS diagnostic** | Exact 20-call same-ticket/link race: one user, two identities, **zero clients/consumptions**. Diagnostic 20 simultaneous SDK calls: **1 success**, 16×500 and 3×422/email_exists; final **1/2/1/1**, one consumption. Two different tickets/links racing with the same email+phone, email only, or phone only: each **one winner**, one client/audit/consumption, one user/two identities; losing link unconsumed. Counts exclude fully rolled-back losers. |
| 5. Forgery / public signup | **FAIL exact; PASS diagnostic unknown-ticket rejection** | Public signup enabled. Anon REST signUp with top-level app_metadata plus `data` cannot set the app-metadata ticket: ignored, no client or consumption (normal public signup returned a session). Exact admin unknown-ticket creation succeeded **200**. Diagnostic unknown-ticket admin request rejected **500**, zero effects. Ticketless anon accounts remain possible under current settings; client-access protection is a separate obligation. |
| 6. Existing paths | **PASS** | With spike triggers, existing integration subset: **7 files / 379 tests passed**; after reset: **7 / 379 passed**. All **104** harness-created staff/recovery fixture users had **zero dummy clients**. No-ticket creation remained unchanged. Inventory/details below. |
| 7. No signup session | **PASS** | Admin results contain no session; successful diagnostic user's `auth.sessions` count **0** before subsequent sign-in. Dummy client status pending. Real `signInWithPassword`, token refresh and admin update succeeded afterward. Client authorization is outside this spike. |
| 8. Password backstop | **PASS current provider rules; AUTH-PW-01 still required** | 5-character password: **422/weak_password**; 6 plain letters accepted. 72 ASCII bytes accepted; 73 ASCII bytes and 74 UTF-8 bytes rejected **400/validation_failed**. Current minimum is **6**, not approved future 8. Shared app validation must enforce 8 characters, digit, required symbol and 72-byte/NUL boundaries; future config task must set minimum 8. |

Compatibility inventory: repository-wide search found the sole executable `createUser` call in `tests/integration/harness.ts:createStaff`, exercised unchanged for platform_owner, workspace_owner, trainer, sales and auth-only/recovery fixtures. README's manual first-PO bootstrap inserts a staff profile for an existing Auth UUID; governance fixtures exercise that bootstrap/role pattern. `lib/auth/recovery-link.ts` uses admin getUserById/generateLink, not user creation; `auth-recovery.test.ts` exercises the real recovery generation/verification/password lifecycle. No executable signup/invite path or Auth seed exists; reset reports no `supabase/seed.sql`. Package/registration fixtures also delegate to the shared harness. No additional F4 staff creation action was found or invented.

Ran the existing `test:integration` npm script with filters `auth-recovery governance isolation matrix-parity rls-catalog audit` (also selects registration-links-audit). Because repo dependencies were absent, copied the unchanged package/lock into scratch, installed there, and used an external equivalent Vitest config (same test settings; repo root, external dependency aliases/cache). Test source, repo config and dependencies were unchanged. Durations: **23.67s** installed-trigger run; **23.27s** post-reset run. These cover existing paths, not new F11 acceptance tests.

### Recommendation and refined B1–B4 — PENDING PO

Retain option 1's existing conditional recommendation and C1–C4 obligations. Do not select exact 3b: INSERT availability is disproved, not merely undocumented. UPDATE-finalization is a credible follow-up architecture because GoTrue's transaction includes that UPDATE, but requires explicit redesign/PO selection. In particular, mapping every 500 to invalid or unavailable would conflate business failures with infrastructure failures; parsing provider messages is not an acceptable classifier. Scratch projections are not a validated action contract.

The following are proposed Option-3b binding conditions **only if PO selects a revised variant**, not approved conditions or the inherited privacy/retention B4:

1. **B1 transactional entry and admission:** replace the false INSERT premise with a version-pinned, tested UPDATE entry; prove it belongs to a newly created user in the same transaction, rather than permitting later admin updates to finalize existing accounts. Private one-use tickets bind canonical payload, link/request secret, attestation and strict expiry. Preserve link-first lock order; recheck fresh time, global staff/client uniqueness, limits and pending-only state under locks. Atomically commit Auth/identities/client/claims/consume/receipt/audit. Full late/deferred failures, races and lost-response replay remain required.
2. **B2 server boundary and exposure:** service-role use exclusively server-side, separately replacing proposed C3 by PO decision; durable admission/counting before HTTP/password hashing. Only opaque ticket IDs in app metadata, never raw link credentials/hashes. Scrub relevant INSERT/UPDATE surfaces, verify JWT/log/identity exposure across upgrades, and discard provider bodies on success/error. Prove unknown/forged/reused tickets fail without affecting ticketless staff/recovery flows.
3. **B3 public outcomes and password policy:** establish trusted, non-text business classification for invalid/duplicate versus infrastructure unavailable, including native prechecks and concurrent constraint failures. Preserve generic cross-scope D-08 payload/status/headers/timing. Independently durable attempt accounting and business-failure ticket redemption cannot rely on writes rolled back with Auth; redesign/prove them. Retain shared F11/F4 AUTH-PW-01 validation, provider minimum-8 backstop, byte bounds, secret-safe errors and attestation/rate limits.
4. **B4 compatibility and production gate:** keep no-ticket provisioning a no-op; run all existing creation/recovery fixtures plus no-session/later-sign-in, metadata and upgrade regressions against pinned SDK/Auth/config. Require separately authorized hosted trigger/role/version/rollback verification before deployment. Local evidence does not satisfy production acceptance, inherited retention decisions or independent T046 review. No architecture switch is silently authorized by a failed guard.

### Cleanup and scope confirmation

After the post-reset regression run, performed **another final local db reset** so its synthetic fixtures were also removed. Catalog/count verification: **spike schemas=0, spike triggers=0, Auth users=0, identities=0, sessions=0, staff profiles=0, public test tables=0**; all **10** committed migrations reapplied. Scratch code was never committed. Only this appended section and a short plan pointer are repository edits.

`config.toml` was **untouched**, SHA-256 before/after `7b4ac2ebb6e2138b4a7218f9cc8fce5b4d3779610992cd30908bdfc66ac99883`. `tasks.md` was **untouched**, SHA-256 before/after `5d561aa86a513b4e3c3a3a3310f4ef02d6755c36cf4de6609ce566bebf3ef9f0`. Starting-tree status was clean. Commit/push SHA is recorded in the handoff; this report does not claim PO approval or complete any feature task.
