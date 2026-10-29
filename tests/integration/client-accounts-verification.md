# F11 U1 verification — T001–T005

Worktree: `C:\Users\NEW LAP\Desktop\LFTR-011`; branch `011-client-accounts`.
Starting SHA: `25befa8e31bea8a206afb1c2ee227a4b8b75513f`.
Initial tree clean; `git pull --ff-only` reported already up to date.
Only this worktree and the owned loopback Docker `lifter` stack were used.
No hosted checks, deployment, protected worktree access, dependency, seed,
capability-matrix or committed-migration changes. T046 remains untouched.

## Scope and remaining blockers

AD-F11-1 option (i) is approved with C1–C4 binding. U1 proves the private
catalog guard, not a public signup operation. U2 owns clients, claims, minimal
tickets and redemption. U3/U5 own guard-before-write/RPC unavailable mapping,
including zero client/attempt/receipt/redemption effects. Those objects and RPCs
do not exist at U1; their effects are explicitly pending, not claimed passing.
C2 exhaustive Auth-row parity is U4; C3 independent DB password enforcement and
full secret-negative signup proof remain U3/U4/U6. U1 supplies the captured cost
and shared validator only. F4 validator call-site integration is T031/U7;
the existing F4 recovery suite is unchanged here.

**C4:** Option (i) verified on local stack only; hosted Supabase Auth version/DML permission and upgrade allowlist must be re-verified before any deployment (PO approval)

Vault keys `SIGNUP_RATE_KEY`/`SIGNUP_ATTEST_KEY` and Vault API-role grant revocation are applied by a local-only provisioning script (supabase_admin); hosted environments need a PO-approved provisioning procedure (with C4) before deployment.

ND-F11-2a was decided by the PO on 2026-10-28: a country selector defaults
to +20 (Egypt), accepts a national number, and the server composes canonical
E.164. U6 records the selector and normalization evidence below.
ND-F5-1/B4 jurisdiction/retention, archived-state/admin-review design,
other-audit retention, inherited F4 decisions including ND-F4-5, ND-F10-4 public
content/grace review, host log redaction, backup/restore and independent
Analyze/Claude review remain applicable blockers. F12 approval is outside F11.

## Captured nonsecret local metadata — T002 / Q-C1 / Q-C3

`docker exec supabase_auth_lifter auth version` returned `v2.197.0`.
Latest local `auth.schema_migrations.version`: `20260831180000`; this is the
single explicit allowlist entry. PostgreSQL image: `17.11.0.006`.
The fixture records all 44 users/identities columns, their native and formatted
types and generated status. The conservative future-write contract includes
all 42 non-generated columns; `users.confirmed_at` and `identities.email` are
generated and must never be inserted. Any later signup write-list change must
remain covered by this manifest and C2 exhaustive parity.

A temporary GoTrue-admin-created reference account yielded bcrypt cost **10**
using a server-side substring-to-integer projection only; no password/hash was
returned. The reference was removed through the admin API. Local pgcrypto is
installed in `extensions`. No Auth database-encryption environment overrides
were present; the observed reference used bcrypt. This evidence does not
establish hosted encryption/configuration compatibility.

Only `[auth] enable_signup = false` and `minimum_password_length = 8` were added
to `supabase/config.toml`. SHA-256 (file bytes):

| State  | SHA-256                                                            |
| ------ | ------------------------------------------------------------------ |
| Before | `7b4ac2ebb6e2138b4a7218f9cc8fce5b4d3779610992cd30908bdfc66ac99883` |
| After  | `83218cd894a82004ce829220c1a295df62845340412528d5a70f27fb55da32e2` |

After restart, selected nonsecret GoTrue configuration confirmed
`GOTRUE_DISABLE_SIGNUP=true`, `GOTRUE_PASSWORD_MIN_LENGTH=8`, empty required
character sets, email enabled and autoconfirm true. The fixture records the
approved resulting config, not the pre-change defaults (signup enabled/min 6).

## RED before implementation — T003

Environment was loaded privately from ignored `.env.local`; command output was
captured under ignored `tmp/`. Retain this sanitized evidence, never raw secrets.

| Command                                                                                                                                              | Observed RED                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run --config vitest.integration.config.ts tests/integration/client-accounts-schema.test.ts tests/integration/auth-signup-policy.test.ts` | 50 failed / 0 passed. Guard/definer functions absent (`42883`); Vault count expected 2, received 0; anon signup error code expected `signup_disabled`, received undefined; config regex expected disabled signup, received project-id-only config. The unexpectedly created synthetic Auth user was removed before asserting. |
| `npx vitest run --config vitest.integration.config.ts tests/integration/client-accounts-schema.test.ts` after separating Vault access assertion      | 49 failed / 0 passed. Vault API-role SELECT privilege expected false, received true for service_role.                                                                                                                                                                                                                         |
| `npx vitest run tests/unit/password-policy.test.ts`                                                                                                  | 16 failed / 0 passed: missing shared validator module.                                                                                                                                                                                                                                                                        |

Additional regressions were tested RED before their corrections:

- Empty migration catalog: `npx vitest run --config vitest.integration.config.ts tests/integration/client-accounts-schema.test.ts` produced 1 failed / 49 passed; the probe expected `[true,true]` (guard explicitly false, counts unchanged), received `[false,true]`. SQL NULL was corrected to false with COALESCE.
- Printable combining-mark and non-decimal-number symbols: `npx vitest run tests/unit/password-policy.test.ts` produced 2 failed / 16 passed; both expected valid=true, received false. The symbol exclusion now follows letter/digit/whitespace/nonprintable categories without excluding printable marks or other numbers.
- The full integration gate exposed the existing `rls-catalog.test.ts` exact private-function inventory: `all private functions have hardened ownership, search path and execute grants` rejected the two new helper names (1 failed / 595 passed). Its inventory now includes those names and requires authenticated EXECUTE=false for both; all prior security expectations remain intact. The governance and recovery suites were not edited.

Auth catalog mutations require their platform owner: ordinary postgres cannot
ALTER these tables or modify Auth's migration catalog. Tests use local Docker
psql as supabase_admin solely for transaction-scoped perturbations, then SET
LOCAL ROLE postgres before invoking the guard. Each probe always rolls back,
including connection-close rollback on SQL failure. No durable Auth mutation,
grant or test schema is left behind.

## GREEN and security design — T004/T005

After clean local reset and provisioning:

- The same two U1 integration files plus unchanged `governance.test.ts` and
  `auth-recovery.test.ts`: **81 passed / 0 failed**, four files. This includes
  admin-created platform-owner, workspace-owner, trainer and sales fixtures,
  actual sign-in and unchanged F4 recovery checks.
- Shared password policy: **18 passed / 0 failed**. Includes 7/8 original Unicode
  code points, multibyte and astral inputs, 72/73 UTF-8 bytes, NUL, composition,
  printable Unicode symbol classification, no normalization and safe AR/EN text.
- Guard tests pass on the actual schema and reject an unsupported latest
  migration, an empty migration catalog, each of 42 missing written columns and
  a wrong JSON type. Probes compare Auth user/identity counts, link counts and
  consumption counts, and audit counts before/after. Public-RPC effects on
  future objects are staged for U3/U5, as tasks.md requires.
- Both private functions are postgres-owned SECURITY DEFINER with empty
  search_path and schema-qualified catalog/data/crypto access. EXECUTE is
  revoked from PUBLIC, anon, authenticated and service_role. No public RPC,
  Auth DML, new RLS policy, table grant or audit-body change was introduced.
- The link verifier requires canonical lowercase-hex token-hash input and a
  32-byte supplied key. It uses HMAC-SHA256 with decoded SIGNUP_RATE_KEY,
  `lifter.f11.link.v1`, NUL domain separator and uint32 big-endian input byte
  length. It compares all 32 bytes without early mismatch exit. Tests cover
  valid derivation, wrong key/length, uppercase/malformed/NULL inputs and missing
  Vault key, independently of attestation. Full attested issuance stays U5.

### Local Vault provisioning and rotation

After every `npx --yes supabase@2.122.0 db reset`, run
`node tests/integration/client-accounts-provision.mjs` with Docker's bin on PATH.
The script rejects non-loopback/non-lifter environment targets, uses the local
Vault extension owner to revoke all Vault table/function privileges from
PUBLIC/anon/authenticated/service_role, creates missing 32-byte random keys in
Vault and silently writes matching lowercase-hex server-only copies into
git-ignored `.env.local`. Existing keys are retained on repeated provisioning.
Only postgres and the unavoidable platform superuser can read the values;
ordinary API roles cannot SELECT secrets or call Vault decrypt/key functions.
The provisioning script is separate from the forward migration because
postgres cannot revoke the platform extension owner's grants. No key values
are committed, sent to the browser, or included in this report.

Approved rare manual single-key rotation: stop admission traffic; generate a new
32-byte key in memory; update its Vault value and matching server-only env copy
together; restart affected server processes and resume traffic only once copies
match. Do not retain an old-key admission fallback. SIGNUP_RATE_KEY rotation
resets link/IP counter attribution; the approved risk is up to one extra window
per key (at most one hour). Old-key counters expire naturally at their original
fixed window end. SIGNUP_ATTEST_KEY rotation is coordinated the same way; old
attestations receive no fallback. Rotation integration remains T019/T020/U5.

The first startup CLI invocation unexpectedly emitted local status credentials.
They are not reproduced in evidence. All subsequent stack/status output was
captured privately; no new application logging emits secrets.

## Requirement-to-unit map — T001

Mappings indicate ownership, not completed feature acceptance. U9 verifies all;
U10/T046 remains reserved for the independent reviewer.

| Requirement | Implementation / acceptance units                                                             |
| ----------- | --------------------------------------------------------------------------------------------- |
| FR-001      | U1 password primitive/config; U2 model; U3/U4 Auth; U6/U8 form; U7 F4 shared-validator wiring |
| FR-002      | U1 C1 primitive; U3/U5 authoritative guard/invalid paths; U6/U8 unavailable transport         |
| FR-003      | U2 integrity/tickets; U3 atomic signup; U4 real Auth proof                                    |
| FR-004      | U2/U3 correspondence/consumption; U6/U8 stale-page/expiry acceptance                          |
| FR-005      | U2 snapshot constraints; U3 transaction binding                                               |
| FR-006      | U3/U4 duplicate behavior; U6/U8 outward equality                                              |
| FR-007      | U2 claims/uniqueness; U3/U4 concurrency                                                       |
| FR-008      | U2 app/RLS/grants; U3/U6 pending-JWT denial; U7 recovery scope                                |
| FR-009      | U1 private grants; U2 DB boundaries; U5/U6 public admission                                   |
| FR-010      | U3 success/consumption/failure audit; U5 admission/cleanup                                    |
| FR-011      | U1 password primitive; U3/U4 rollback; U5 admission; U6/U8 validation/privacy                 |
| FR-012      | U7 F4 client lookup/scope                                                                     |
| FR-013      | U6 transport/form; U8 bilingual/a11y/themes                                                   |
| FR-014      | U3/U5 secret-negative DB proof; U6/U8 response/log/header privacy                             |
| FR-015      | U2 pending state; U3 atomic effects; U6/U8 generic completion                                 |
| FR-016      | U5/U6/U8 manual sign-out and no linking                                                       |
| FR-017      | U1 disabled signup plus staff/F4 regression                                                   |
| SC-001      | U2/U3 atomicity; U4 real sign-in/parity                                                       |
| SC-002      | U2/U3 races/integrity; U4 replay/no orphan                                                    |
| SC-003      | U3/U4 collisions/invalid; U6/U8 exact public responses                                        |
| SC-004      | U3 consumption clock; U6/U8 grace mismatch                                                    |
| SC-005      | U2 app/RLS; U3/U6 pending JWT; U7 recovery                                                    |
| SC-006      | U3/U5 audit; U6/U8 privacy captures                                                           |
| SC-007      | U1 password tests; U6/U8 form/a11y; U7 shared F4 wiring                                       |
| SC-008      | U5 durable limits; U6 transport                                                               |
| SC-009      | U5 purge/counter expiry; U9 mutation verification                                             |
| SC-010      | U5/U6/U8 signed-in manual sign-out                                                            |
| SC-011      | U2/U3 collision safety; U6/U8 differential privacy; archived state deferred ND-F5-1           |
| SC-012      | U1 zero-write C1 primitive; U3 success/failure/consumption; U5 attempt/cleanup                |

## Final gates

| Gate                                          | Pass | Fail | Evidence                                                                              |
| --------------------------------------------- | ---: | ---: | ------------------------------------------------------------------------------------- |
| `npm run typecheck`                           |    1 |    0 | No TypeScript errors                                                                  |
| `npm run lint`                                |    1 |    0 | No ESLint errors/warnings                                                             |
| `npm run format:check`                        |    1 |    0 | Repository Prettier check passed after final docs and task edits                      |
| `npm test`                                    | 1242 |    0 | 48 files, no skips                                                                    |
| `npm run test:integration`                    |  596 |    0 | 17 files, no skips; fresh local db reset plus local Vault provisioning; 95.22 seconds |
| Focused U1 plus unchanged governance/recovery |   81 |    0 | Four files; included again in full gate                                               |
| Password-policy unit file                     |   18 |    0 | Included again in full unit gate                                                      |

Final `npx --yes supabase@2.122.0 db reset` and local provisioning both exited 0.
T001–T005 were marked complete only after these observed passes.
U1 assigns no e2e spec; later-unit e2e, RPC integration and attested issuance
are pending as explicitly staged in tasks.md, rather than skipped U1 tests.

## U2 — client model, claims, default deny and ticket redemption

Started on clean `011-client-accounts` at
`7998eb590e5484ab94c170440c6126a8c46b55c5`; `git pull --ff-only` reported
already up to date. Only the owned LFTR-011 worktree and local Docker stack
were used. The required start exclusions were retained, including storage-api.
No audit function, previous migration, dependency, capability matrix or seed
was modified. No public signup issuer/RPC or approval transition is installed.

### RED evidence, before the model migration

With local environment loaded privately, ran:

```text
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/client-accounts-catalog.test.ts tests/integration/client-accounts-integrity.test.ts --reporter=json --outputFile=tmp/u2-red-final.json
```

Observed **0 passed / 59 failed / 4 todo**, exit 1. Failures included:

- `public.clients: exists, forces RLS, and has no policies`: expected a catalog
  row with both RLS flags true; received no row.
- `public.clients: zero effective table AND column grants, overriding default
ACLs`: expected the table to exist; it did not.
- Every quoted client/claim/receipt FK and UNIQUE catalog assertion failed.
- Pending synthetic JWT/catalog RPC probes failed because the model was absent.
- Normalization, Auth synchronization, staff/client exclusivity, immutable
  records, ticket binding, two-connection redemption and rollback tests failed.

The app authorization tests exercise every capability with a null-role pending
actor and an accepting backend mock; existing authorize() already denies them,
so no application or capability-matrix change was needed.

Additional observed RED regressions before their corrections:

- `GoTrue stored digits map to E.164 without defining client phone input
acceptance`: `-t 'GoTrue stored digits'`, 0 passed / 1 failed,
  `unresolved_identifier`. The canonicalizer now distinguishes persisted Auth
  representation from canonical client storage. No phone input parser exists.
- `resolved tickets require exact workspace/link as well as link key and
request hash`: `-t 'resolved tickets'`, 0 passed / 1 failed, missing five-argument
  internal redemption function. Exact resolved binding is now checked in UPDATE.
- Concurrent phone/both probes initially hit `users_phone_key`, revealing Auth
  index masking. BEFORE Auth synchronization plus a deferred claim-to-Auth FK
  now makes the registry's UNIQUE constraints reject the competing writes.

### Model/security evidence

- Five tables have enabled and forced RLS, no policies, and explicit REVOKE ALL
  from PUBLIC, anon, authenticated and service_role immediately after creation.
  Catalog probes check effective table privileges (including MAINTAIN), column
  privileges, PUBLIC ACL entries and creating-owner pg_default_acl effects.
  UUID defaults create no sequences. All U2 functions are postgres-owned
  SECURITY DEFINER, empty search_path, qualified object references and zero API
  EXECUTE. No new public function or grant is introduced.
- Client identity, issued version, workspace and link are constrained by global
  UNIQUE keys and ordinary/composite RESTRICT FKs. Independent rolled-back
  probes disable client insert/deferred guards to isolate UNIQUE and FK failures.
  Normal inserts validate locked unconsumed/unexpired links, derive canonical
  Auth email and persist required name, server time and pending-approval only.
- Both classification directions lock the Auth row and contend on identity and
  sorted canonical keys. Two physical connections prove email/phone/both claim
  races and staff/client exclusivity. UNIQUE constraints remain the backstop.
  NULL Auth phone preserves an existing client claim; a non-NULL disagreement
  fails. Direct claim reassignment and identifier clearing fail closed.
- Backfill replays use the local platform owner only to disable Auth-owned
  triggers inside one rolled-back transaction. Canonical collisions and unresolved
  phones abort the entire INSERT, leave no partial claims and merge no identities.
  Email folding follows [GoTrue v2.197.0 validateEmail](https://github.com/supabase/auth/blob/v2.197.0/internal/api/mail.go#L659).
  Persisted Auth phone translation follows its
  [phone representation](https://github.com/supabase/auth/blob/v2.197.0/internal/api/phone.go#L19).
  ND-F11-2a stays OPEN; no input parsing, whitespace removal or country default.
- Pending-access SQL probes SET LOCAL ROLE authenticated and transaction-local
  JWT claims. They iterate every public RLS table, fixture-grant a safe UUID
  column inside rollback, and check own/foreign has_workspace_access denial.
  Public RPCs are discovered from pg_proc, with unknown argument types failing
  the probe. Real GoTrue later sign-in and PostgREST table/RPC denial also run.
- Clients and committed receipts reject UPDATE/DELETE/TRUNCATE. Claims permit
  synchronization only. Attempts allow only safe outcome/time/resolved scope,
  reject UPDATE/general DELETE/TRUNCATE, and have a not-yet-authorized purge seam.
  The deferred client integrity check verifies consumed link/claim correspondence;
  U3 owns the full converse consumption/audit extension.
- Ticket redemption invokes C1 before writes, binds link key/request-secret hash
  and exact nullable resolved scope, and uses guarded NULL-to-now UPDATE RETURNING.
  A transaction/ticket-scoped HMAC capability (U1 Vault key) authorizes the update
  trigger; a caller-writable boolean cannot authorize it. The capability is cleared
  after use. Tickets persist only hashes, never raw request secrets or attribution.
  Two connections prove one winner; replay/wrong bindings fail. Inner business
  savepoint rollback retains redemption; outer infrastructure rollback restores it.

### Q-M03 canonical UNIQUE mutation

Temporarily patched only the independent duplicate probes to drop their target
client canonical UNIQUE constraint inside rollback; ran:

```text
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/client-accounts-integrity.test.ts -t 'client (email_normalized|phone_e164) UNIQUE' --reporter=json --outputFile=tmp/u2-qm03-red.json
```

Observed exit 1, **0 passed / 2 failed**: both duplicate inserts resolved instead
of rejecting. There was no FK/claim/grant masking. Database mutations rolled
back. The scratch patch was removed and the test file SHA-256 matched before
and after: `A4A11A406E5DEDA0E4ECE17B230F05C71C16DCAD42C6F909077B949069AD8599`.
Restored independent UNIQUE/FK probes pass.

### Staged coverage and open decisions

At the U5 checkpoint, the following were explicit `it.todo` cases, not passing evidence:

- `[U3/T012 U5/T020 staged RED] public signup RPC exact anon/authenticated-only EXECUTE`.
- `[U5/T020] narrow 30-day purge removes only old attempts and preserves audit`.
- `[U4/T029] Storage pending real-JWT read/write denial: storage-api excluded`.

U6 replaces the Storage todo with `tests/e2e/client-accounts-storage.spec.ts`.
`scripts/test-client-accounts-storage.ps1` stops the default local stack, starts a
Storage-enabled local stack for that single e2e, then restores the default
`storage-api` exclusion. No hosted Storage service is used.

Public attested issuance, counters/nonces, operational purge/cleanup audit and
signup success/consumption audit remain with their assigned later units. Storage
cannot be exercised against the required excluded service. Real sign-in and
PostgREST were feasible and are implemented now. Archived-state/review design,
identifier release/pseudonymization and audit retention remain unresolved; no
release, archival, approval or general cleanup operation was added. Hosted proof
and deployment remain blocked by C4.

### U2 final gate results

The first full run observed **666 passed / 3 failed / 3 todo**. The exact private
function/immutability-trigger inventories required the new U2 objects. The F10
privileged TRUNCATE probe encountered the new incoming FKs before its guard;
it now discovers/removes all incoming FKs inside rollback, preserving its exact
23514 guard assertion. All 57 catalog/F10 regression tests then passed.

Final review placed Auth trigger installation before backfill: CREATE TRIGGER's
SHARE ROW EXCLUSIVE lock is held through migration commit, closing the possible
concurrent Auth write gap. The final file was applied by another clean local
reset, followed by `node tests/integration/client-accounts-provision.mjs`, both
exit 0. The final full integration gate used that exact migration file.

| Gate                                 | Pass | Fail |                                                           Staged | Evidence                                    |
| ------------------------------------ | ---: | ---: | ---------------------------------------------------------------: | ------------------------------------------- |
| `npm run typecheck`                  |    1 |    0 |                                                                0 | Exit 0                                      |
| `npm run lint`                       |    1 |    0 |                                                                0 | Exit 0, no warnings                         |
| `npm run format:check`               |    1 |    0 | Repository Prettier check passed after final docs and task edits |
| `npm test`                           | 1258 |    0 |                                                                0 | 50 files, exit 0                            |
| `npm run test:integration`           |  678 |    0 |                                                                3 | 19 files, final reset + provision, exit 0   |
| U2 integration files, included above |   82 |    0 |                                                                3 | Model/security/normalization/claims/tickets |
| U2 e2e                               |    0 |    0 |                                                                0 | No e2e spec assigned to U2                  |

Integration environment was loaded privately from ignored `.env.local` before
the npm command. An initial bare npm invocation without those private variables
was not counted as evidence. The first stack start command unexpectedly emitted
local stack credentials; subsequent CLI output was suppressed/captured. No
credential values are included in committed artifacts or this report.

T006–T009 were ticked only after the observed final-file passes. The three named
staged cases above remain with their later owners. T046 is unchanged.

## U3 - transactional signup RPC (option i), consume guard and audit

Starting branch `011-client-accounts`, clean HEAD
`e0a70823e46d90f10fb602dfaf6fb79f46fe4b2d`; `git pull --ff-only`
reported already up to date. This is continuation of the same unit, not a new
unit baseline. Only the owned LFTR-011 worktree and local Docker stack were used.
No dependency, capability, seed, committed migration, protected worktree, cloud,
deployment, PR or T046 edits occurred.

### RED before implementation

After the U2-only local reset and `node tests/integration/client-accounts-provision.mjs`:

```text
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/client-accounts-signup.test.ts tests/integration/client-accounts-audit.test.ts tests/integration/client-accounts-catalog.test.ts --reporter=json --outputFile=tmp/u3-red2.json
```

Observed exit 1, **20 passed / 30 failed**, before creating the signup migration.
T010 atomic signup, rollback-stage and replay assertions and T011 success/audit
assertions failed with sanitized `Signup SQL failed: 42883` (missing RPC).
The exact grant assertion failed `bounded signup RPC exists: expected undefined
to be defined`. The independent privileged strict-expiry assertion resolved
instead of rejecting even though the unchanged F10 grace-open returned valid.
The barrier assertion failed `signup must wait on link FOR UPDATE before inner
writes`. Initial `tmp/u3-red.json` also predates implementation (20 passed /
29 failed); its fixtures exposed protected-catalog permissions and F10 issuance
limits. Those fixture issues were corrected before the second RED run.

Saved ignored JSON/log evidence survived the interrupted turn and was inspected
before continuation. The new migration therefore did not need to be removed to
reconstruct RED. Runtime evidence never substitutes skipped/todo tests for a pass.

Additional regressions were also observed RED before their fixes:

- Signed-in visitor: expected invalid, received complete (`tmp/u3-extra-red.json`,
  35 passed / 1 failed); fixed with a DB-side auth.uid() denial.
- Known GoTrue confirmed-email markers: expected user metadata email_verified=true,
  received empty metadata (`tmp/u3-markers-red.json`, 1 failed). The captured local
  v2.197.0 source Confirm() and a real admin-created reference establish this marker;
  identity email_verified remains false, matching the observed reference identity.
  Exhaustive row parity is still U4/C2.
- Non-printable Unicode format/private-use characters incorrectly satisfied the
  symbol rule (`tmp/u3-unicode-red.json`, 2 passed / 2 failed). The DB now requires
  a printable non-letter/non-digit/non-whitespace character. Multibyte fixture
  literals use Unicode escapes to avoid Windows shell encoding substitution.

### Installed behavior and security

The single new forward migration is
`supabase/migrations/20261031122000_client_accounts_signup.sql`. C1 precedes every
write. Password/field validation uses U2 seams, and phones must already be canonical
E.164; no parsing, trimming, country defaults or ND-F11-2a acceptance policy was added.
The private bcrypt-cost seam is captured cost 10. Hashing precedes link/identity
state branching, then link FOR UPDATE, then clock_timestamp(), then U2 one-use
redemption in the outer rollback boundary. Canonical locks are sorted by U2.

Auth user/identity, U2 claims, pending client, strict guarded consume RETURNING,
immutable receipt and successful audits all share the inner subtransaction.
SET CONSTRAINTS ALL IMMEDIATE forces U2 deferred correspondence checks before
returning complete. Known business failures roll back the inner writes, retain
redemption and append a separate failure attempt/audit outside that block. Failure
audit targets an attempt UUID, never a ticket or credential. Unknown SQLSTATEs and
unknown constraints are unavailable and roll back the outer block, including
redemption, operational failure rows and failure audit. Vault/proof absence is
infrastructure; C1 failure leaves all rows unchanged. No raw exception detail is
returned, logged by the function or copied to audit.

The original U3 brief's binding architect requirement overrides the older surface
contract's separate duplicate result: invalid links, replay, forged scope and all
identifier collisions return exactly {status:'invalid'}. No archived state/review
workflow was invented. Archived-state/review design remains deferred on ND-F5-1;
canonical claims reserve all existing identities without a public existence branch.
Success is only {status:'complete'}, and infrastructure only {status:'unavailable'}.
No session is created. Real later sign-in succeeds but pending RLS/access still denies.

The RPC is postgres-owned SECURITY DEFINER with empty search_path and qualified
schema objects. Only anon/authenticated have EXECUTE; PUBLIC/service_role are
explicitly revoked. New private cost helper has no API/PUBLIC EXECUTE. U2 forced
RLS, zero table/column grants, claims triggers, insert guard and receipt protections
remain unchanged. No issuer exists in U3; tests insert synthetic pre-admitted tickets.

C3 tests inject exceptions containing random plaintext/token/request-secret/hash
canaries in message/detail/hint for both business and infrastructure classes;
returned values, captured error messages and audit payloads contain none of them.
PostgreSQL jsonb cannot represent NUL; the input-boundary rejection test catches
its generic error message without printing parameters. Password code-point/UTF-8
boundaries, Unicode digits, emoji symbols and non-printable rejection are covered.
Secrets remain only in ignored .env.local and local owner-only Vault; no secret
values appear in committed evidence. The initial CLI start unexpectedly emitted
local development credentials; subsequent CLI output was captured privately.

### Complete audit-body preservation

Copied the complete function from `20261030120000_registration_links.sql`, including
its owner, empty search_path, revokes, no-op returns, unmapped exception and final
append INSERT. Diff of the copied body contains only these additive branches:

```diff
+ elsif old.consumed_at is null and new.consumed_at is not null then
+   event_action := 'registration_link.consumed';
+   event_details := <outcome_class, timestamp, link_id, workspace_id>;

+ elsif tg_table_schema = 'public' and tg_table_name = 'clients' then
+   if tg_op <> 'INSERT' then return new; end if;
+   event_action := 'client.signup_succeeded';
+   event_target := new.id;
+   event_workspace := new.workspace_id;
+   event_details := <outcome_class, timestamp, link_id, workspace_id>;
```

The integration test strips only the two delimited additions from the installed
pg_get_functiondef() body and compares every remaining character against the latest
F10 body (line-ending normalization only). All nine old table branches survive:
workspaces, staff_profiles, workspace_memberships, recovery_link_issuances, packages,
package_versions, package_offers, registration_links and jobs. Existing suites execute
legacy mapping/allowlist/no-op/unmapped and append-only assertions as well. The
existing registration-link UPDATE audit trigger handles consumption, so no second
consume trigger/manual success audit duplicates an event. Failure auditing alone is
manual and outside the rolled-back inner block.

### Mutation and restoration evidence

Local function-definition scratch probes, never committed-migration edits:

```text
node --env-file=.env.local tmp/u3-mutations.mjs
```

Each probe used the relevant Vitest integration file with -t and JSON output,
restored both function definitions in finally, and observed **0 passed / 1 failed**:

| Probe                                         | Intended assertion detected                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Q-M01 remove link FOR UPDATE                  | Ticket must remain unlocked while signup waits on link, independently of client guard                                   |
| Q-M02 remove strict consume expiry predicate  | Expiry during client work returns invalid; update guard disabled only inside rollback to isolate RPC predicate          |
| Q-M02 remove RETURNING-row requirement        | Zero-row update must roll back; receipt/deferred guards disabled only inside rollback to avoid masking                  |
| Q-M06 remove jobs branch                      | Exact full legacy audit-body comparison fails                                                                           |
| Q-M08 move Auth writes outside inner rollback | Forced client failure leaves Auth row; zero-orphan assertion fails                                                      |
| Q-M11 use transaction-start now()             | Nontransactional synthetic sequence observes forbidden Auth INSERT after lock-wait expiry, independently of U2 rollback |

Mutation script rejects unchanged/no-op patches. An initial CRLF-mismatched scratch
patch did not apply for Q-M06/Q-M08; these were not claimed as detection. Both were
corrected, rerun and observed failing as above. Migration SHA-256 before and after
all six effective probes was identical:
`b5547ebf3418067e7098a54ec6c4b8b9d5d0d56bda0166a12e69e8a7a5159a51`.
The synthetic sequence/trigger/function used by the clock test is removed in finally.
No password/token/hash is recorded by this probe.

Q-M12 tests lost-response committed receipt request/link/client binding, exact replay,
changed-secret and changed-identity retry with one client and one success event.
Q-M13 scope overrides are rejected before writes, and the existing U2 isolated
composite snapshot/FK tests remain in the full gate. F10 grace-open stays unchanged;
strict consume rejects post-expiry, with no grace. No usable orphan remains after
any of eight injected business failures (Auth/identity/claims/client/consume/receipt/
audit/deferred); real later password sign-in attempts fail for rolled-back users.

### Final gates and staged coverage

The first full post-reset integration run observed 724 passed / 2 failed / 3 todo.
Both failures were exact legacy security inventories missing the new private cost
helper and client audit trigger. Their explicit expected inventories were extended
in rls-catalog.test.ts; ownership/search_path/grant/trigger checks remain strict.
The final run below also includes the subsequently added lost-response receipt test.

Final application of the exact migration used the required local command:

```text
npx --yes supabase@2.122.0 db reset
node tests/integration/client-accounts-provision.mjs
npm run test:integration -- --reporter=json --outputFile=tmp/u3-integration-final.json
```

The ignored .env.local was loaded privately into the npm process environment.
Reset and provisioning both exited 0; the full integration run exited 0.

| Gate                                    | Pass | Fail | Staged | Evidence                                |
| --------------------------------------- | ---: | ---: | -----: | --------------------------------------- |
| Local DB reset + provisioning           |    2 |    0 |      0 | Exact final migration, exit 0 each      |
| npm run typecheck                       |    1 |    0 |      0 | Exit 0                                  |
| npm run lint                            |    1 |    0 |      0 | Exit 0, no warnings                     |
| npm run format:check                    |    1 |    0 |      0 | Exit 0                                  |
| npm test                                | 1258 |    0 |      0 | 50 files, exit 0                        |
| npm run test:integration                |  727 |    0 |      3 | 21 files, final reset/provision, exit 0 |
| U3 signup/audit/catalog, included above |   68 |    0 |      3 | 45 signup + 3 audit + 20 catalog        |
| U3 e2e                                  |    0 |    0 |      0 | No spec assigned                        |

Saved final integration evidence: tmp/u3-integration-final.json; unit evidence:
tmp/u3-unit.json. These are ignored runtime artifacts, not committed credentials.

No e2e spec is assigned to U3. Explicit staged cases remain admission RPC grants and
30-day attempt-only purge/audit preservation (U5), plus real-JWT Storage denial
assigned by the existing todo to a later unit (required stack excludes storage-api).
Public attested admission/counters/nonces and purge cleanup are U5; exhaustive C2
Auth parity is U4; HTTP/action/UI privacy integration is later work. C4 hosted Auth
version/DML/upgrade proof still blocks production rollout. ND-F11-2a input acceptance,
ND-F5-1 archived-state/review and audit retention remain open; no policy was invented.
T046 is unchanged. T010-T015 are marked complete only after observed final gates.

## U3-R1 ? Claude password-policy review fix

Start SHA: `5826cbbabf8232d38894d3d7cd876f83cfc40ea2`, clean
`011-client-accounts`; `git pull --ff-only` reported already up to date.
Only LFTR-011 and its owned loopback Docker stack were used. Commit authority
includes push to this branch. No committed migration, shared validator behavior,
dependency, seed, capability matrix, audit body or T046 was changed.

### Tests first and explicit RED differences

Created one shared fixture, `tests/fixtures/password-policy-vectors.json`, with
55 static expected results from the existing TS semantics. Both the unit and DB
parity suites consume it. The TS suite passed 56/56 (including its existing
bilingual-message test) before the DB implementation. The fixture covers all
requested cases, each of the ten Arabic-Indic and extended-Arabic digits,
combining marks, other numbers, format/space/control characters, unassigned and
private-use characters, original code-point counts and exact 72/73-byte limits.
Combining marks count as symbols; ZWJ, soft hyphen and RTL mark do not. No TS
behavior contradiction with ND-F11-1/1a was found; TS was left unchanged.

Extracted the old predicate unchanged into a private helper in the uncommitted
forward migration, and delegated the RPC to it, solely to run the new suite RED.
No applied/committed migration was edited. The local default `en_US.UTF-8`
matched all 55 vectors; claiming default-locale vector failures would be false.
Adding explicit `COLLATE pg_catalog."C"` to each same helper call exposed the
locale dependence: **27 passed / 31 failed**, all failures below. Every default
assertion passed; each listed C assertion returned false where TS expects true.
The Arabic/Cyrillic no-symbol vectors were correctly rejected in both locales.

Initial metadata collection using SHOW failed before vector execution because
this PostgreSQL 17.11 build reports `unrecognized configuration parameter` for
both `SHOW lc_ctype` and `SHOW lc_collate`. Independent psql commands confirmed
both errors. `pg_database.datctype` and `datcollate` each report `en_US.UTF-8`;
`SHOW server_encoding` returns `UTF8`. The test now reads the locale catalog
and reports encoding without depending on obsolete SHOW parameters.

RED command (environment privately loaded from ignored `.env.local`):

```text
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/password-policy-parity.test.ts --reporter=json --outputFile=tmp/u3-r1-legacy-red.json
```

| Shared vector label              | TS expected | Legacy DB, C collation |
| -------------------------------- | ----------- | ---------------------- |
| astral code points               | true        | false                  |
| Arabic-Indic digit only          | true        | false                  |
| extended Arabic digit only       | true        | false                  |
| Arabic question mark only symbol | true        | false                  |
| Arabic comma only symbol         | true        | false                  |
| Arabic semicolon only symbol     | true        | false                  |
| euro only symbol                 | true        | false                  |
| copyright only symbol            | true        | false                  |
| emoji only symbol                | true        | false                  |
| combining mark only symbol       | true        | false                  |
| non-decimal number only symbol   | true        | false                  |
| Arabic-Indic digit 0             | true        | false                  |
| Arabic-Indic digit 1             | true        | false                  |
| Arabic-Indic digit 2             | true        | false                  |
| Arabic-Indic digit 3             | true        | false                  |
| Arabic-Indic digit 4             | true        | false                  |
| Arabic-Indic digit 5             | true        | false                  |
| Arabic-Indic digit 6             | true        | false                  |
| Arabic-Indic digit 7             | true        | false                  |
| Arabic-Indic digit 8             | true        | false                  |
| Arabic-Indic digit 9             | true        | false                  |
| extended Arabic digit 0          | true        | false                  |
| extended Arabic digit 1          | true        | false                  |
| extended Arabic digit 2          | true        | false                  |
| extended Arabic digit 3          | true        | false                  |
| extended Arabic digit 4          | true        | false                  |
| extended Arabic digit 5          | true        | false                  |
| extended Arabic digit 6          | true        | false                  |
| extended Arabic digit 7          | true        | false                  |
| extended Arabic digit 8          | true        | false                  |
| extended Arabic digit 9          | true        | false                  |

### Implementation and CI enforcement

New forward-only migration `20261031123000_signup_password_parity.sql` installs
`app_private.signup_password_acceptable(text)` and replaces only the RPC password
predicate with a helper call. The rest of the RPC, including transaction, locking,
Auth writes, audit, strict expiry and error boundaries, is preserved. The helper
is postgres-owned SECURITY DEFINER with `search_path=''`; EXECUTE is revoked
from PUBLIC, anon, authenticated and service_role. Catalog tests assert every
property, NULL rejection and actual RPC delegation. The existing exact private
function security inventory includes the helper without relaxing its checks.

The helper checks original PostgreSQL UTF8 code-point length and UTF8 byte length,
then classifies integer Unicode code points using two immutable int4multiranges.
No locale-sensitive classification or normalization occurs. Ranges are generated
from the exact existing JS expressions `\p{Nd}` and
`[^\p{L}\p{Nd}\p{Z}\p{C}\s]` on Node v24.19.0 / Unicode 17.0.
`scripts/generate-password-unicode-ranges.mjs --check` exhaustively recomputes
both categories over U+0000..U+10FFFF and compares the SQL constants. Its unit
test is a CI guard against runtime Unicode-data drift; future category upgrades
require a new forward migration, never editing an applied migration. The target
is a UTF8 database. PostgreSQL text rejects NUL at the protocol boundary (22021),
which the parity suite explicitly asserts without reflecting provider details.

The integration job has an explicit parity-suite step after Vault provisioning,
followed by the existing full integration run. A unit assertion verifies that
ordering and the exact parity filename. The new suite runs all representable
shared vectors under both the database default and explicit C collation.

### Final gates

The exact final migration was applied with a clean local DB reset and provisioning:

```text
npx --yes supabase@2.122.0 db reset
node tests/integration/client-accounts-provision.mjs
npm run test:integration -- --reporter=json --outputFile=tmp/u3-r1-integration-final.json
```

CLI reset/provision output was captured only in ignored tmp logs. The integration
npm process received the privately loaded `.env.local` environment. An initial
`node --run` attempt did not forward the environment and failed at suite loading
(0 executed tests); it was replaced with an explicitly inherited npm subprocess.
The first typecheck identified optional postgres row access in the new test;
that test typing was corrected and typecheck rerun successfully.

| Gate                                | Result                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| DB reset + local Vault provisioning | Exit 0 each                                                         |
| npm run typecheck                   | Exit 0                                                              |
| npm run lint                        | Exit 0, no warnings                                                 |
| npm run format:check                | Exit 0                                                              |
| npm test                            | 1,298 passed, 0 failed, 0 skipped/todo, 51 files                    |
| npm run test:integration            | 785 passed, 0 failed, 3 pre-existing staged todos, 22 files; exit 0 |
| New parity suite, included above    | 58 passed, 0 failed; 55 vectors + 3 helper/RPC checks               |
| git diff --check                    | Exit 0                                                              |

Ignored evidence: `tmp/u3-r1-legacy-red.json`, `tmp/u3-r1-unit-final.json`,
`tmp/u3-r1-parity-green.json`, `tmp/u3-r1-integration-final.json` and gate logs.
U3 assigns no e2e spec. The pre-existing three integration todos stay staged for
U5/later storage coverage, as in U3. C4 hosted Auth/DML/upgrade proof still blocks
production rollout; no hosted operation or deployment was performed. U4 C2,
U5 admission/purge, ND-F11-2a, ND-F5-1 and the other recorded U3 blockers remain.
This is an implementation correction for independent review, not self-approval.

## U4 ? T016?T018: C2 Auth parity and C3 sign-in proofs

Start: clean `011-client-accounts`, `78b99364c6b8157bbff505c0eed8d5343416ac7a`;
`git pull --ff-only` reported already up to date. All DB/Auth operations used
loopback ports 54322/54321 and the owned `lifter` Docker stack. No hosted proof.

### RED and implementation boundary

Before T017 helpers existed, ran:

```text
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/client-accounts-auth.test.ts
```

Observed **4 failed / 2 passed**: the ordinary, multibyte and 72-byte exhaustive
pre/post lifecycle tests failed with `normalizeAuthValue is not a function`;
`C2 normalizer preserves NULL/token/metadata differences and instance scope`
failed with `normalize is not a function`. T017 then installed the reference,
anon signup and strict lifecycle-normalization helpers. Existing U2 catalog HTTP
and fixture-grant RLS probes were moved without changing their assertions into
shared fixture helpers, used by both the original U2 tests and U4 real sessions.

An earlier test-harness error appended a wrong-password suffix beyond the
72-byte bcrypt boundary, which GoTrue ignores. Corrected that test to change the
first character within the verified boundary. This is not a product RED or a
hash incompatibility. Wrong passwords within the boundary now fail for all
three cases. The initial table scan also needed a qualified SQL identifier
correction; neither harness correction changed production behavior.

No production parity differences were observed, so no compatibility migration
was necessary. The latest U3-R1 function, all grants, audit branches and password
policy remain intact. No older function body was copied or replaced.

### Observed proofs

- Official local control creation uses only
  `auth.admin.createUser({email,password,email_confirm:true})`; signup itself
  uses the anon SDK RPC and a synthetic pre-admitted ticket. No U5 issuer.
- Each of ordinary, multibyte and exactly-72-UTF8-byte passwords is tested with
  its own control and signup-created account. Signup creates zero Auth sessions.
  The exact password signs both accounts in through real GoTrue; a wrong
  password fails. Captured bcrypt cost matches the manifest.
- Catalog enumeration equals the U1 manifest: **35 auth.users columns and all
  9 auth.identities columns**, including generated columns. Every value is
  compared before either sign-in and after one successful sign-in each.
  Only account ids, non-NULL timestamps, password hashes and email/phone values
  (including nested values) normalize. NULL remains NULL; empty strings remain
  empty strings; instance scope remains exact. Metadata shape, booleans,
  provider arrays and token markers remain exact. Differences report only column
  names. Explicit suspects covered: `identity_data.email_verified`,
  `raw_user_meta_data`, `raw_app_meta_data.providers`, `last_sign_in_at`,
  `email_change_confirm_status`, and every nullable/empty-string token column.
- Verified real JWT claims drive rollback-scoped SELECT/UPDATE probes over every
  public RLS table with safe fixture grants. Both own/foreign
  `has_workspace_access` checks deny access. Shared U2 HTTP probes deny catalog
  table reads and all public RPC access. No staff profile or membership exists.
- 73 UTF8 bytes and NUL are rejected; no Auth account persists and diagnostics
  contain no password. PostgreSQL text cannot persist NUL. Representable positive and negative passwords are checked without row
  output against public/Auth/private application tables, including audit and
  receipts. Docker Auth, PostgreSQL and Kong stdout/stderr since suite start
  are captured in memory and checked for literal/JSON-escaped plaintext.
- Local recovery is reachable: real `resetPasswordForEmail`, server-only read of
  the issued opaque recovery hash as a mailbox substitute, real recovery
  `verifyOtp`, `updateUser`, and sign-in with the changed password all pass.
  No admin recovery API, SMTP delivery dependency or U7 wiring was added.
- Runtime is Unicode **17.0**, matching the immutable migration-header pin.
  Both CI jobs print Node's Unicode version and execute the same assertion and
  exhaustive category-range test. Actual remote CI execution is not claimed.
  Injecting `process.versions.unicode = '0.0'` through an ignored preload with
  `NODE_OPTIONS=--import=<local preload>` and `vitest --pool=forks` produces
  **2 failures**, including `runtime drift requires architect review`:
  expected `17.0`, received `0.0`. Removing the preload gives **2 passed**.
  No migration or runtime configuration file was modified for this probe.

### Gates and limits

Final observed gates (all exit 0):

| Gate                                                                               |                Pass | Fail |                                                         Deferred |
| ---------------------------------------------------------------------------------- | ------------------: | ---: | ---------------------------------------------------------------: |
| Local DB reset + provisioning                                                      |          2 commands |    0 |                                                                0 |
| `npm run typecheck`                                                                |             1 check |    0 |                                                                0 |
| `npm run lint`                                                                     | 1 check, 0 warnings |    0 |                                                                0 |
| `npm run format:check`                                                             |                   1 |    0 | Repository Prettier check passed after final docs and task edits |
| `npm test -- --reporter=json --outputFile=tmp/u4-unit.json`                        |          1299 tests |    0 |                                                                0 |
| `npm run test:integration -- --reporter=json --outputFile=tmp/u4-integration.json` |           793 tests |    0 |                                                          3 TODOs |
| Final U4-specific integration rerun                                                |             8 tests |    0 |                                                                0 |
| Normal-runtime Unicode/category rerun                                              |             2 tests |    0 |                                                                0 |

Integration npm inherited the privately loaded `.env.local` environment. The
final U4-specific rerun also covers the last explicit byte-length, local-target
and bcrypt-cost assertions. JSON reports and diagnostic logs are ignored/local
only; no captured provider bodies or row values are included here.

The three existing TODO names are:

- `[U5/T020] public admission RPC exact anon/authenticated-only EXECUTE`
- `[U5/T020] narrow 30-day purge removes only old attempts and preserves audit`
- `[U4/T029] Storage pending real-JWT read/write denial: storage-api excluded`

T016, T017 and T018 are ticked only after these observed passing proofs. U4 specifies no browser
e2e. Existing pending Storage coverage remains deferred to T029 because the
required local stack excludes storage-api. This is not claimed as a Storage
proof. The existing app authorize denial tests remain part of the unit gate.
C4 hosted compatibility, U5 admission/attempt/purge, U7 recovery wiring and the
reserved T046 review remain outstanding. Phone-input acceptance remains open.

Security: no grant, SECURITY DEFINER/search_path, RLS policy, dependency, seed or
capability change. Safe grants used by probes roll back. Assertion diagnostics
contain only safe outcomes/column names. A stack-start CLI invocation printed
local credentials into the tool transcript before suppression was applied;
subsequent credential-bearing CLI output was suppressed. No credentials are
committed. Local secret copies remain in ignored `.env.local`.

## U3-R2 ? distinct D-08 result

Start: clean `011-client-accounts`, `5800a485ba405299f3571a7ed8eb83880d419efb`;
`git pull --ff-only` was already up to date. Local stack only.

RED: `node --env-file=.env.local node_modules/vitest/vitest.mjs run --config
vitest.integration.config.ts tests/integration/client-accounts-signup.test.ts -t D-08`:
25 failing collision assertions, expected the exact JSON body with status
`duplicate`, received status `invalid`. No implementation preceded this RED.

Forward-only `20261031123500_signup_duplicate_result.sql` copies the latest
`client_signup` body from `20261031123000_signup_password_parity.sql`. Only
canonical email/phone unique-constraint failures select `duplicate`; other
business failures retain `invalid`. Hashing stays before link/identity branching.
Redemption and the generic failure-row/audit payload survive duplicate rollback.
No field/class discriminator is persisted. Original owner, empty search_path and
anon/authenticated-only EXECUTE are preserved. No audit trigger was changed.

GREEN: signup/audit focused run: 72 passed. Full integration: 817 passed,
3 existing TODOs (admission grants and purge in U5; Storage real-JWT in T029).
Typecheck, lint (zero warnings), format check pass; unit suite: 1299 passed.
No browser e2e is specified for this database review fix. Tests cover email,
phone and both claims, pending clients in same/foreign workspaces, active Auth
identities, staff memberships and retained soft-deleted Auth claims. Active or
archived client lifecycle/review states remain undefined and are not invented;
Auth-only identities have no workspace association. Link-class responses include
unknown canonical token, malformed token, consumed replay, wrong well-shaped
secret and forged ticket binding, all exactly invalid. Existing strict-expiry,
link-before-uniqueness and installed hash-order proofs remain passing.

During verification, fixture-only failures were corrected: multiple signup calls
inside one rollback probe must restore deferred constraint mode; expired-link
fixtures use a single statement timestamp to preserve the exact 24-hour CHECK.
One overlapping integration run interfered with the global sequence timing
probe; isolated final rerun passed. No production workaround was added.

No task checkbox changed. Secrets remain in ignored `.env.local`; diagnostics
contain only safe statuses and names. No dependencies, seeds or capabilities changed.

## U5 - durable admission, attestation, counters and purge

Start: clean `011-client-accounts`, `cd465abc65f52a5e30e8e3af17ecb82a44ebb63d`;
`git pull --ff-only` was already up to date. U3-R2 was committed and pushed first.
Local Docker only. New migration `20261031123600_client_accounts_admission.sql`
is after U3-R2 and avoids the already-used 123000 timestamp. No committed migration
was edited, and no audit trigger body was changed.

### Observed RED before implementation

- T019: `node --env-file=.env.local node_modules/vitest/vitest.mjs run --config
vitest.integration.config.ts tests/integration/client-accounts-rate-limit.test.ts
-t 'T019 admission contract'`: one failed assertion, bounded attested admission
  RPC exists, expected true / received false. The test file was subsequently
  renamed to the task-owned `client-accounts-admission.test.ts`.
- T021: `npm test -- --run tests/unit/client-accounts-boundary.test.ts`: one failed
  assertion, server-only admission builder exists, expected true / received false.
  The helper suite also failed to import the absent three modules. T020/T022
  implementation began only after these REDs.
- Additional RED before corrections: `npm test -- --run
tests/unit/client-accounts-admission.test.ts` accepted an extra top-level
  workspace field (expected admission denial, received admission); exact-envelope
  validation fixed it. The same command failed on absent `attestAdmission` before
  adding the shared signed-field builder.
- `node --env-file=.env.local node_modules/vitest/vitest.mjs run --config
vitest.integration.config.ts tests/integration/client-accounts-admission.test.ts
-t 'C1 mismatch emits'`: structured C1 server event exists, expected true /
  received false. The migration then added only fixed code/timestamp LOG evidence
  before returning unavailable. Database rows remain unchanged. Captured C1 logs
  are also tested for absence of attribution and credential canaries.

### Observed GREEN

Final application: `npx --yes supabase@2.122.0 db reset`, then
`node tests/integration/client-accounts-provision.mjs`, both exit 0. Docker bin was
on PATH. The prescribed stack exclusion set was used. Integration npm inherited
privately loaded ignored `.env.local`; no environment values are reported.

| Gate                                           |                Passed | Failed |                                                         Deferred |
| ---------------------------------------------- | --------------------: | -----: | ---------------------------------------------------------------: |
| Final local reset + provisioning               |            2 commands |      0 |                                                                0 |
| `npm run typecheck`                            |               1 check |      0 |                                                                0 |
| `npm run lint`                                 |   1 check, 0 warnings |      0 |                                                                0 |
| `npm run format:check`                         |                     1 |      0 | Repository Prettier check passed after final docs and task edits |
| `npm test`                                     | 1304 tests / 52 files |      0 |                                                                0 |
| `npm run test:integration`                     |  842 tests / 24 files |      0 |                                                           1 TODO |
| Focused admission/catalog/audit/RLS regression |    82 tests / 4 files |      0 |                                                           1 TODO |

No U5 browser e2e is specified. The only TODO is
`[U4/T029] Storage pending real-JWT read/write denial: storage-api excluded`.
The staged U2 admission-grant and purge TODOs are real passing tests now. One full
run found the stale private-function inventory: its four new names were added,
retaining all hardened owner/search_path/EXECUTE checks. Bigint count expectations
were corrected with safe integer casts in tests; production semantics were unchanged.

### Security and acceptance evidence

- Admission order: C1, Vault keys, constant-time attestation/freshness verification,
  nonce insertion, independent token-to-link-key binding, advisory link then IP
  locks, both fixed-window increments, both limit checks, hashed-secret ticket,
  attempt row and audit. Invalid/stale/replayed attestations receive no counter
  credit or ticket. C1/missing keys are unavailable with zero writes. Unknown,
  malformed, expired and consumed links and invalid request-secret shapes count
  both windows after reaching counting, then return invalid without a ticket.
- Shared `f11-attestation-vectors.json` provides three fixed synthetic vectors,
  including IPv6, and four concrete single-field mutations. TS and the actual DB
  verifier use the same file: domain tags + NUL, uint32 big-endian byte lengths,
  32-byte HMACs, decimal epoch milliseconds and raw 16-byte UUIDs agree.
  Assertions compare booleans instead of printing MAC/key/credential values.
- Twelve separate connections on one link yield exactly 5 admitted / 7 invalid,
  link counter 12. Thirty-six separate connections sharing an IP across eight
  links in two workspaces yield exactly 30 admitted / 6 invalid, IP counter 36.
  Both counters increment on denials. Injected limits use only the policy owner;
  an unresolved limits seam rolls all admission writes back.
- Committed admission evidence survives business and infrastructure signup rollback.
  Duplicate failure retains redemption and safe failure audit; infrastructure
  failure preserves the unused ticket. A fresh admission counts again. Real anon
  RPC tests reject forged ticket, wrong request hash and wrong link, then complete
  exactly once with a valid admitted ticket; replay stays invalid.
- Rotation uses the same canonical address and token before/after changing the
  Vault rate key and corresponding test signer together. Exhausted old IP/link
  counters remain unchanged and are ignored; new-key admission succeeds. Expired
  old counters are removed opportunistically. Boundaries align with expiry; no
  old-key lookup exists. Accepted extra exposure is one window per key, at most
  one hour; rotation remains rare/manual and coordinated with the server env.
- RPC is postgres-owned SECURITY DEFINER with empty search_path and EXECUTE only
  anon/authenticated, revoked PUBLIC/service_role. All new private helpers revoke
  API/PUBLIC EXECUTE. Counters/nonces are private, forced RLS, zero effective API
  table/column grants, no workspace/link FK or identity fields. U2 redemption
  guards and one-use integrity are reused unchanged.
- Attempts contain no IP/ip_key/token/hash/PII. Unknown attempted/failed audit
  targets use the attempt UUID, never a nonce/ticket/token. Audit survives signup
  rollback. Captured DB/Auth logs and evidence are scanned with safe boolean
  assertions for attribution, credentials and PII canaries.
- Private purge uses a transaction/backend-bound HMAC capability, matching U2's
  signed-capability pattern. A forged GUC cannot authorize general DELETE. The
  function and trigger both enforce the retention-policy owner: only attempts
  older than 30 days are deleted. Young attempts and live nonces survive; expired
  counters/nonces are removed. Cleanup appends a count only, targeting a fresh
  per-run UUID. Every original audit row, including references to purged attempts,
  survives unchanged. Tickets/receipts and one-use replay protection stay intact.
- Pure trusted-IP extraction reads only CF-Connecting-IP, canonicalizes IPv4 and
  lowercase compressed IPv6, maps IPv4-mapped IPv6 to IPv4, ignores every other
  header and permits overrides only with explicit non-production mode AND flag.
  Attribution uses the full address. Builders start with server-only, read env
  keys, return derived proof fields only, and generate 32-byte random base64url
  request secrets. U6 must adapt hex proof fields to PostgREST bytea and wire calls.
- Validation delegates passwords to the existing owner, reuses exact-key validation,
  follows captured Auth email storage normalization and accepts already-canonical
  E.164 storage values only. No phone parsing/country/input acceptance rules were
  added. Signed-in visitors get an internal manual-sign-out requirement, with no
  automatic sign-out, linking, merge or token redirect.

### Remaining decisions and production blockers

T019-T022 are ticked only after observed GREEN. ND-F11-2a phone-input acceptance/UI
remains OPEN; only canonical E.164 primitives ship. U6 owns server-action wiring
and build:edge, neither done here. Clock skew is an availability risk: even a
slightly future Worker timestamp is rejected against DB clock_timestamp(); no
tolerance was added. IPv6 address rotation can bypass the IP ceiling across
links; this remains an open risk for the PO, with the per-link ceiling retained.
No /64 grouping was added. Production purge scheduling is a blocker: private
local invocation only, no pg_cron or scheduler. Audit retention/archived review
remain pending ND-F5-1; C4 hosted proof is blocked and T046 stays reserved/unchanged.
No dependency, seed, capability-matrix or hosted change. Secrets stay in ignored
`.env.local`; vector keys are explicitly synthetic. Ignored diagnostic logs were
scanned without displaying credentials; no credential-bearing log was found.

## U5-R1 — export provisioned keys to the CI test environment

Started on clean `011-client-accounts` at
`24e6d63d1a033289d9e0184f91ab414a52bfb972`. Confirmed the failure using
`gh run view 40636637668 --log-failed`: 19 admission tests and the infrastructure
rollback audit test failed in the fixture's `mac()` at `Buffer.from(undefined)`.
The test step had stack endpoint credentials but no signup-key environment
variables. Provisioning wrote matching Vault keys to `.env.local` without
exporting them into subsequent Actions steps; the integration harness reads
`process.env` directly.

The provisioner retains the existing create-if-missing Vault behavior and local
target checks. In Actions it masks both keys, then appends those exact validated
Vault values to `GITHUB_ENV`, before saving the existing ignored local env copy.
Missing Actions environment-file configuration fails explicitly. The admission
fixture checks both env keys before deriving any proof and throws only
`SIGNUP_* env missing; run provisioning`.

RED first: the CI export contract assertion failed, and both missing-key fixture
cases reproduced the Buffer TypeError. GREEN: all seven focused tests passed.
`npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` passed;
the full unit gate contains **1,307 tests in 53 files**.

Fresh-clone simulation retained at
`C:\Users\NEW LAP\AppData\Local\Temp\LFTR-011-U5-R1-aed74f9f58d940169de2f9cf69a54175`.
Cloned starting HEAD with no ignored files and copied only the four changed
implementation/test files for pre-commit validation. Ran `npm ci`, the workflow's
Unicode pin commands, its pinned local stack start command, an additional local
`supabase@2.122.0 db reset`, the stack environment export, and the provisioning
command with `GITHUB_ACTIONS=true` and a temporary runner environment file.
The simulation consumed mask commands privately in memory and checked that two
masks were emitted. A privileged local-only verification compared both exported
values against Vault and the generated local env copy using boolean assertions;
all copies matched. The generated `.env.local` was then renamed to
`.env.provisioned`, so the subsequent CI commands relied on the exported runner
environment. The explicit password-policy parity command passed **58 tests**.
The full fresh-clone `npm run test:integration` passed **842 tests in 24 files**
with zero failures and the existing single U4 Storage TODO (storage-api excluded),
in 140.47 seconds. This includes all 21 admission tests and all audit tests.
No temporary directory or existing user file was deleted. No key values were
printed or added to versioned evidence or test artifacts. No dependency,
migration, seed, capability matrix, hosted stack or T046 change was made.

## U5-R2 ? IPv6 /64 rate key and 5-second attestation skew

PO decisions 2026-10-28. Started with a clean `011-client-accounts`,
`git pull --ff-only`, and HEAD `0620b4a9c456efc030ee981bbefe06c2c50ddece`.
GitHub CI run `40637961243` was completed/success for that exact SHA.

Tests were written and executed before implementation. RED commands:

- `npx vitest run tests/unit/client-accounts-admission.test.ts`: 16 passed,
  2 failed. `shared vectors reproduce every byte...` failed its boolean
  `ipKey` comparison; `PO decision 2026-10-28: IPv6 /64 grouping and mapped
IPv4 preserve rate-key boundaries` failed `same /64 shares a key`
  (expected true, received false). No key values were included in assertions.
- After local reset/provision and loading SIGNUP_* from ignored `.env.local`,
  `npx vitest run --config vitest.integration.config.ts tests/integration/client-accounts-admission.test.ts`:
  25 passed, 1 failed. `PO clock boundary 5000 ms: accepted once` expected
  admitted and received invalid. The +5001, -60000 and -60001 boundaries passed.
  An initial test-clock correction also froze the purge clock; later the
  cleanup assertion was corrected to compare against post-cleanup state,
  because advancing time may legitimately expire existing rate counters.

Implementation uses the existing domain/length-prefix encoding. The IPv6 input
is ASCII RFC 5952 lowercase compressed /64 network-address text without a slash:
first 64 bits retained, last 64 bits zeroed. Full trusted-IP extraction stays
unchanged; mapped IPv4 normalizes to dotted-quad before rate-key derivation.
Six shared vectors cover same-/64 equality, adjacent-/64 separation and mapped
IPv4, with independent PostgreSQL canonicalization/HMAC and verifier checks.

Forward-only `20261031123700_signup_admission_po_decisions.sql` copies the latest
complete admission body from `20261031123600_client_accounts_admission.sql`.
Only the timing record, private policy lookup, future comparison and nonce expiry
expression change. Both intervals have one owner in
`app_private.signup_attestation_timing()`. The inclusive acceptance window is
[issued_at - 5 seconds, issued_at + 60 seconds]. Expiry remains issued_at + max_age,
covering up to 65 seconds from first acceptance; strict nonce cleanup preserves
the final inclusive instant. Frozen-clock probes exist only in rolled-back test
transactions, never in the production migration. Boundary proofs verify immediate
replay denial and replay denial after cleanup at the final accepted instant.

A direct local catalog check passed: the timing seam is postgres-owned,
SECURITY DEFINER, empty search_path, with no PUBLIC/anon/authenticated/service_role
EXECUTE. Existing RPC grants, RLS, counter/attempt/audit behavior and every other
branch are preserved. No raw IP enters the RPC, no logging is added, and matching
server/Vault keys remain in ignored local environment and owner-only Vault.

No tasks were newly ticked: T019?T022 were already complete. `tasks.md` and T046
are unchanged. No e2e spec is assigned to U5-R2. The existing Storage real-JWT TODO
remains deferred to its staged later unit because storage-api is excluded.
No dependency, seed, catalog, capability, Auth/audit migration or hosted change.

The first full integration run passed all admission tests and reported 846 passed,
1 failed, 1 existing TODO. Its sole failure was the exhaustive private-function
security inventory missing the new timing function. Added only that name to
`signupPrivate` in `tests/integration/rls-catalog.test.ts`, preserving every owner,
SECURITY DEFINER, search_path and denied-execute assertion; no product catalog or
seed is changed. Re-ran the full gate after another local reset/provision.

Final GREEN gates (local):

| Command                    |                 Passed | Failed | Pending                                                          |
| -------------------------- | ---------------------: | -----: | ---------------------------------------------------------------- |
| `npm run typecheck`        |                1 check |      0 | none                                                             |
| `npm run lint`             |                1 check |      0 | none                                                             |
| `npm run format:check`     |                      1 |      0 | Repository Prettier check passed after final docs and task edits |
| `npm test`                 | 1,308 tests / 53 files |      0 | none                                                             |
| `npm run test:integration` |   847 tests / 24 files |      0 | 1 existing Storage TODO                                          |
| U5-R2 e2e                  |                    N/A |    N/A | no assigned spec                                                 |

Integration ran after the pinned local `db reset` and
`node tests/integration/client-accounts-provision.mjs`, with local SIGNUP_* env
loaded privately for the integration process. All 26 admission tests pass,
including TS/DB shared vectors, exact +5000/+5001/-60000/-60001 millisecond
boundaries, nonce coverage, immediate/edge replay, races, limits, privacy and
rotation. Diagnostic logs were sanitized without printing credentials.

## U6 SC-011 public duplicate timing differential

Local loopback HTTP harness calls the production `signupResult('duplicate', 'en')` mapper for both labels. Archived-state design remains deferred on ND-F5-1, so `archived-collision-synthetic` is the approved synthetic stand-in; this measures public result serialization and equality, not database branch latency. Treat the measurement as a regression detector, not a latency SLA.

Run command: `npx tsx scripts/verify-client-signup-timing.mjs` from the repository root. The script imports TypeScript modules (`lib/client-accounts/results.ts`), so running it with bare `node` fails; use `tsx`.

- Warm-up: 20 sequential requests per label; measured trials: 200 ordinary and 200 archived stand-in, randomized and interleaved.
- Mann-Whitney U: 19495.000; two-sided p-value: 0.662572; absolute median difference: 0.020 ms.
- Thresholds: p >= 0.01 and |median difference| < 5 ms: PASS.
- Each response matched status 200, identical body bytes, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `Content-Type: application/json; charset=utf-8`.
- No account-existence detail is included in either response.

Ordinary duplicate timings (ms):

```text
14.863, 15.550, 15.929, 16.024, 15.518, 15.251, 14.926, 16.010, 0.741, 15.708, 15.888, 15.002, 15.751, 15.982, 16.134, 15.265, 1.648, 10.647, 15.139, 15.541, 14.982, 15.334, 15.599, 15.464, 15.505, 15.176, 15.929, 15.294, 15.033, 15.338, 15.787, 15.706, 15.366, 15.051, 15.949, 15.581, 15.708, 15.977, 16.186, 15.430, 14.770, 15.873, 16.056, 15.832, 15.534, 0.474, 14.453, 15.703, 15.734, 15.647, 15.427, 15.139, 16.014, 15.030, 14.520, 0.447, 14.920, 15.529, 15.197, 14.791, 15.394, 0.493, 15.288, 15.318, 15.773, 14.864, 1.341, 15.247, 15.744, 15.471, 15.377, 15.998, 14.833, 16.093, 15.493, 15.665, 15.706, 15.046, 15.725, 15.468, 15.209, 15.339, 15.679, 15.682, 13.790, 0.825, 15.149, 14.034, 15.464, 15.468, 15.293, 15.649, 15.636, 15.811, 15.941, 15.448, 15.743, 15.311, 15.258, 15.953, 15.752, 15.180, 16.233, 15.667, 16.394, 15.239, 14.334, 15.432, 15.875, 2.821, 12.195, 15.725, 15.755, 15.899, 15.066, 15.456, 15.044, 15.421, 14.792, 15.855, 16.146, 13.026, 1.037, 0.831, 14.412, 14.716, 15.914, 16.205, 15.278, 14.877, 0.605, 15.069, 15.559, 15.833, 15.060, 15.071, 15.001, 16.087, 15.025, 14.494, 14.966, 0.583, 15.680, 15.693, 15.011, 14.975, 15.507, 15.466, 14.884, 15.180, 16.240, 14.101, 15.419, 15.893, 15.994, 15.633, 16.665, 16.567, 15.565, 14.884, 15.791, 0.594, 15.416, 0.568, 14.892, 15.953, 15.215, 15.829, 14.768, 15.987, 15.579, 15.023, 15.810, 15.805, 14.961, 15.836, 15.754, 0.754, 15.862, 15.764, 0.967, 15.773, 15.173, 16.060, 14.626, 15.114, 16.238, 15.649, 15.260, 14.968, 15.844, 0.981, 13.600, 16.180, 0.632, 15.234, 1.019, 0.966, 0.861, 0.924
```

Archived collision synthetic stand-in timings (ms):

```text
15.352, 15.108, 0.753, 14.620, 15.921, 16.001, 14.797, 15.617, 15.622, 15.458, 15.269, 16.101, 15.589, 15.142, 15.069, 15.730, 15.796, 14.145, 15.018, 15.403, 0.469, 15.582, 15.255, 15.321, 1.538, 1.404, 15.889, 15.194, 15.465, 14.715, 15.599, 16.012, 15.883, 15.738, 15.660, 16.599, 14.900, 14.913, 15.766, 16.558, 15.853, 14.575, 15.630, 15.633, 15.593, 15.267, 16.021, 15.767, 14.854, 15.707, 15.874, 15.109, 15.557, 15.587, 16.774, 15.116, 15.226, 16.090, 15.741, 15.174, 0.479, 0.483, 15.526, 14.904, 14.667, 15.817, 15.575, 14.716, 15.634, 14.519, 16.573, 15.821, 16.052, 15.359, 15.247, 15.316, 15.539, 16.319, 15.082, 15.794, 15.122, 16.088, 15.681, 15.452, 15.234, 15.654, 16.961, 1.425, 14.234, 16.278, 15.057, 15.350, 14.785, 16.211, 15.688, 1.916, 13.961, 15.369, 15.541, 1.174, 15.882, 15.705, 15.435, 16.257, 15.346, 15.387, 0.953, 15.786, 14.541, 0.890, 14.101, 15.963, 15.522, 15.595, 16.839, 14.656, 16.009, 14.949, 0.868, 14.668, 16.284, 16.304, 16.146, 14.397, 15.459, 15.362, 1.064, 0.876, 16.047, 15.057, 16.130, 16.064, 15.200, 14.558, 15.496, 15.936, 14.754, 15.762, 15.279, 15.515, 15.821, 14.779, 15.781, 15.154, 16.515, 0.691, 15.497, 15.287, 15.712, 15.513, 15.826, 15.895, 15.366, 0.575, 15.103, 15.671, 0.937, 14.694, 15.287, 15.277, 16.019, 15.391, 2.483, 13.092, 15.673, 15.387, 15.246, 16.301, 15.039, 15.861, 14.235, 15.432, 16.061, 16.166, 14.925, 0.368, 15.449, 16.192, 15.258, 16.304, 14.194, 15.732, 15.064, 15.396, 14.147, 14.500, 17.312, 15.332, 14.354, 16.245, 16.066, 0.895, 14.761, 15.624, 15.074, 15.444, 15.358, 0.570, 15.453, 1.014
```

## U6 T023—T030 implementation evidence (2026-10-28)

RED was recorded before each paired implementation:

- T023 ? T024: `npx vitest run tests/unit/client-accounts-actions.test.ts` had 5 failures; the first assertion reported `server action exists: expected '' not to be ''`.
- T025 ? T026: `npx vitest run tests/unit/auth-middleware.test.ts tests/unit/client-accounts-headers.test.ts` had 11 failures because register responses lacked the required `Referrer-Policy: no-referrer` and `Cache-Control: no-store` headers, including recreated and denied responses.
- T027 ? T028: `npx vitest run tests/unit/client-accounts-form.test.ts` had 4 failures; the phone parser/selector was absent, including the +20 default and country-specific normalization checks.
- T029 ? T030: `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts` initially had 1 failure at the country selector locator in `valid signup link renders a minimal form with private route headers`; the pre-implementation journey lacked the phone selector.

GREEN evidence after implementation:

- `npx vitest run tests/unit/client-accounts-actions.test.ts tests/unit/client-accounts-form.test.ts tests/unit/client-accounts-headers.test.ts tests/unit/auth-middleware.test.ts`: 4 files, 53 tests passed.
- `npm test`: 56 files, 1,328 tests passed.
- `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts`: 11 passed. Includes provider failure followed by retry, committed response loss followed by consumed-link invalid, country selector, pending submit disabling, correction without consumption, privacy headers, signed-in manual sign-out prompt, and denied paths.
- `npx --yes supabase@2.122.0 db reset`, `node tests/integration/client-accounts-provision.mjs`, then `npm run test:integration`: local reset and provisioning passed; 24 files, 847 tests passed, 0 pending.
- `scripts/test-client-accounts-storage.ps1`: 1 real-JWT Storage denial test passed. The script stops the default local stack, starts an isolated stack with Storage enabled, runs only `tests/e2e/client-accounts-storage.spec.ts`, then stops it and restores the default `-x` exclusion list. Verified afterward that the default DB/Auth/REST/Kong/Inbox containers were up and the Storage container was absent; no hosted Storage was used.
- `npm run build:edge`: passed. `node scripts/check-client-signup-edge.mjs`: passed; Worker output had production `NODE_ENV` inlined and no test-IP override branch, and the scan found no service-role key or `SIGNUP_*` values in 61 client assets.
- `npm run size`: Worker web output 6,398.00 KiB (1,332.13 KiB gzip). Against the recorded baseline 6,121.81 KiB (1,271.97 KiB gzip), delta is +276.19 KiB uncompressed / +60.16 KiB gzip. The phone parser is server-only and absent from client assets.

Final U6 gates (local):

| Gate                                                    |                                 Result |
| ------------------------------------------------------- | -------------------------------------: |
| `npm run typecheck`                                     |                         1 check passed |
| `npm run lint`                                          |                         1 check passed |
| `npm run format:check`                                  |                                      1 | 0   | Repository Prettier check passed after final docs and task edits |
| `npm test`                                              |          56 files / 1,328 tests passed |
| Local DB reset + provision + `npm run test:integration` | 24 files / 847 tests passed; 0 pending |
| `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts` |                              11 passed |
| Isolated Storage real-JWT e2e                           |                               1 passed |
| `npm run build:edge` + Worker/client asset proof        |              passed; 61 assets scanned |

Transport follows the PO decision: infrastructure failures return the generic bilingual `unavailable` action payload with HTTP 200, no-store/no-referrer headers and no consumption. The action does not expose provider details and no token-bearing endpoint was added. Storage access was denied for both read and write with a real pending-client JWT. The dedicated signup RPC client uses only the anon/publishable key with persistence disabled; the action import graph does not reach the admin client or service-role key. No migration, seed, catalog, or capability-matrix changes were made.

## U6-R1 architect review fixes

RED negative-control evidence, before the scanner fix:

- `npx vitest run tests/unit/client-accounts-actions.test.ts -t "override reference split"` failed at the expected negative control: `expected [Function] to throw an error`. The pre-fix checker ignored a test-IP override placed in a separate server bundle file.
- The initial test-first run of `npx vitest run tests/unit/client-accounts-actions.test.ts` also failed the new scanner tests because `scripts/client-signup-edge-proof.mjs` had not yet been implemented.

GREEN evidence:

- `npx vitest run tests/unit/client-accounts-actions.test.ts`: 15 passed, including fixtures for a live override path, an un-inlined `process.env.NODE_ENV` guard, a missing signup marker, and an override split into a second bundle file.
- The signed-in submission test returned the exact `sign_out_required` public result and asserted the shared RPC spy was never called; therefore neither admission nor signup ran and no admission was counted.
- `npm run build:edge` passed. `node scripts/check-client-signup-edge.mjs` scanned 1,446 production server files (`.open-next/worker.js`, all files under `.open-next/server-functions/`, and `.open-next/middleware/` when present). It found `client_signup_admit` in `.open-next/server-functions/default/.next/server/chunks/ssr/_1r0n0ei4bgsnf._.js` and `.open-next/server-functions/default/handler.mjs`; both override identifiers were absent throughout production server output, and dynamic `NODE_ENV` was absent from the service files. The client secret scan covered 61 assets under `.open-next/assets` and `.next/static` without printing secret values.
- SignupResult now documents a signed-in visitor at submission (including a session appearing after GET) as `sign_out_required`, with generic bilingual sign-out text, no link/identity disclosure, and no admission or consumption.

Final U6-R1 gates:

| Gate                                                    |                                                                                       Result |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------: |
| `npm run typecheck`                                     |                                                                               1 check passed |
| `npm run lint`                                          |                                                                               1 check passed |
| `npm run format:check`                                  |                                                                                            1 | 0   | Repository Prettier check passed after final docs and task edits |
| `npm test`                                              |                                                                56 files / 1,334 tests passed |
| Local DB reset + provision + `npm run test:integration` |                                                       24 files / 847 tests passed; 0 pending |
| `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts` |                                                                                    11 passed |
| `npm run build:edge` + server/client proof              |                                      passed; 1,446 server files and 61 client assets scanned |
| `npm run size`                                          | Worker web 6,397.98 KiB / 1,332.13 KiB gzip; change from U6 start: -0.02 KiB / 0.00 KiB gzip |

No RPC, database, migration, grant, RLS, capability-matrix, seed, or catalog change was made for U6-R1.

## U7 T031-T034 F4 recovery linkage and shared password policy

### RED evidence

- T031: `npx vitest run tests/unit/auth-actions.test.ts` failed 7 recovery password cases. Each failed at the provider-factory spy: expected 0 calls, received 1; the old action reached the successful update/redirect path for underlength, missing digit, missing symbol, whitespace-only symbol, non-printable symbol, over-72-byte, and NUL inputs.
- T031: after local DB reset and Vault provision, `npm run test:integration -- tests/integration/auth-recovery.test.ts tests/integration/client-accounts-recovery.test.ts` failed 3 client-linkage assertions. The placeholder resolved both committed signup Auth IDs to NULL, so PO preflight and record were denied. The F4 catalog and target/actor lock-order assertions passed.
- T033: after reset and provision, `npm run test:integration -- tests/integration/auth-recovery.test.ts` passed 21 tests but the fixture restored the NULL placeholder. The following `npm run test:integration -- tests/integration/client-accounts-recovery.test.ts` failed 5 of 7 tests; the temporary override restore and committed-target lookup returned NULL instead of the client workspace.

### GREEN evidence

- T032: the forward migration replaces only the helper lookup. Focused local integration checks passed for two committed pending-client targets, PO/WO scope, foreign/revoked/role/self/staff/anonymous denials, no-row NULL, audit attribution, and the F4 catalog contract.
- T034: the fixture now restores the captured installed function definition; the integration regression compares `prosecdef`, `proconfig`, `proowner`, `proacl`, and volatility before/after. The helper contract is SECURITY DEFINER, empty search path, postgres owner, owner-only execute ACL, and STABLE volatility.
- T034: `lib/auth/password-policy.ts` runs before session client creation or any GoTrue call. All seven invalid classes return the existing localized `auth.weak_password` result without echoing the submitted password; a compliant password reaches the provider update path, and the local F4 provider lifecycle still succeeds.
- Full local integration run after DB reset and provision: 25 files / 855 tests passed, 0 pending. Recovery e2e `CI=1 npm run e2e -- tests/e2e/auth.spec.ts`: 5 passed.

### U7 gates

| Gate                                                    |                                 Result |
| ------------------------------------------------------- | -------------------------------------: |
| `npm run typecheck`                                     |                         1 check passed |
| `npm run lint`                                          |                         1 check passed |
| `npm run format:check`                                  |                                      1 | 0   | Repository Prettier check passed after final docs and task edits |
| `npm test`                                              |          56 files / 1,342 tests passed |
| Local DB reset + provision + `npm run test:integration` | 25 files / 855 tests passed; 0 pending |
| `CI=1 npm run e2e -- tests/e2e/auth.spec.ts`            |                               5 passed |
| `npm run build:edge`                                    |                                 passed |

No audit-body, F4 permission/rate/expiry/delivery/secret, client grant, RLS, capability, seed, catalog, or endpoint change was made. ND-F4-5 remains open.

## U8 T035–T038 bilingual messages, accessibility and privacy capture

### RED evidence

- T035: `npx vitest run tests/unit/client-accounts-messages.test.ts` failed before message centralization because `clientSignup.name` and `clientSignup.duplicate` were absent from both catalogs; the link-state enumeration passed.
- T037: `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts --grep "per-submit request secret"` ran a temporary negative-control assertion expecting `requestSecretWasTransmitted` to be false; it failed with `expected false, received true`. It used deterministic synthetic bytes and emitted only the boolean assertion. The existing Server Action contract sends the form payload as multipart data; capture handling was changed to keep raw payloads in memory, redact before checking/persisting, and attach only scrubbed summaries.

### GREEN evidence

- T036: `npx vitest run tests/unit/client-accounts-messages.test.ts` passed 4 tests: AR/EN key parity, exact D-08 and unavailable copy, no Telegram key/field, generic completion wording, and valid/invalid link-state enumeration with `unavailable` excluded.
- T036: `tests/e2e/client-accounts-a11y.spec.ts` passed 10 tests. Axe found zero serious/critical issues across AR/EN, light/dark, mobile/desktop. Keyboard flows cover Name → Email → Country → Phone → Password → Submit; field errors are associated and the first invalid field/result receives focus; pending is announced.
- T037/T038: bilingual completion captures collected HTML, RSC, action request/response, metadata, browser logs, server logs and Playwright traces. Raw content is transient; captured dynamic values are scrubbed in memory, trace files are removed, and attachments contain counts/outcomes only. The server wrapper streams stdout/stderr lines to a unique OS-temp raw log for per-scenario scanning, removes it during teardown, and retains only aggregate counts/deletion status in its summary. Scrubbed outcomes are checked for request-secret, PII, token, UUID, provider/SQL and Telegram markers.
- T037/T038: unavailable retry tests passed in AR/EN with the same-route Server Action returning HTTP 200, `no-store`/`no-referrer`, a retained retryable form, generic status copy, and no consumption. The public link-state test enumerates valid, invalid, expired, consumed, revoked, unknown and malformed states; none maps to `unavailable`.
- T037/T038: duplicate e2e checks passed for 12 collision combinations per locale (pending, active, staff and archived identities × email, phone and both). After scrubbing dynamic values, actual response bodies, status and stable headers compare identically across the classes.
- T038: the valid-link acceptance assertion was updated to require the F11 signup form. The Storage e2e now skips only when the required local stack returns HTTP 503 for `storage-api`; its real-JWT read/write assertions still run when that service is enabled. `app/register/[token]/error.tsx` required no change because no disclosed error text or privacy-header defect was demonstrated.

### U8 gates

| Gate                                                               |                                                                                                                               Result |
| ------------------------------------------------------------------ | -----------------------------------------------------------------------------------------------------------------------------------: |
| `npm run typecheck`                                                |                                                                                                                       1 check passed |
| `npm run lint`                                                     |                                                                                                                       1 check passed |
| `npm run format:check`                                             |                                                                                                                                    1 | 0   | Repository Prettier check passed after final docs and task edits |
| `npm test`                                                         |                                                                                                        57 files / 1,346 tests passed |
| Local DB reset + provision + `npm run test:integration`            |                                                                                               25 files / 855 tests passed; 0 pending |
| Focused client-account and accessibility e2e pair                  |                                                                                                                30 passed / 1 skipped |
| Full `CI=1 npm run e2e`                                            |                                                                                                   123 passed / 10 skipped / 0 failed |
| `npm run build:edge` + `node scripts/check-client-signup-edge.mjs` |                                                                              passed; 1,446 server files and 61 client assets scanned |
| `npm run size`                                                     | Worker web 6,401.33 KiB / 1,331.78 KiB gzip; +3.35 KiB / −0.35 KiB gzip against the latest recorded 6,397.98 / 1,332.13 KiB baseline |

The 10 full-e2e skips are the eight existing Chromium/mobile project guards, the provider-fault opt-in case, and the Storage test while the mandated stack excludes `storage-api` (probe returned HTTP 503). No migrations, dependency manifests, grants, RLS, seeds, capability matrix, catalog or application endpoints changed. The existing `unavailable` action remains HTTP 200 with privacy headers.

## U7-R2 pending-client recovery keeps approval and access denied

### RED / non-vacuity evidence

- The new integration flow passed on its first complete run, so a local scratch negative control changed only a copy of the full `public.clients` JSON row with `jsonb_set` and compared it with the original. `npm run test:integration -- tests/integration/client-accounts-recovery.test.ts -t "negative control: the full clients-row equality"` failed as expected at `expect(after?.client_row).toEqual(before!.client_row)`: `approval_state` differed (`pending-approval` versus `active`). This proves the all-column comparison detects a state change. A direct DB update was rejected by the schema's sole allowed-state check; no client data was changed.

### GREEN evidence

- `npm run test:integration -- tests/integration/client-accounts-recovery.test.ts` passed 11 tests. Both the PO and a workspace-owner recovery path authorized and recorded issuance, completed local `verifyOtp` recovery, and used `updateUser` with an AUTH-PW-01-compliant password. Each path compared the complete `to_jsonb(public.clients)` row before/after, checked `pending-approval`, and found no clients-table UPDATE audit event. The new password signed in; the original password failed.
- The post-reset JWT had no app capability for its own or a foreign workspace. `pendingRlsAccess` temporarily granted SELECT/UPDATE on one safe UUID column per protected RLS table inside a rolled-back database transaction; each SELECT returned zero rows and each UPDATE changed zero rows, establishing RLS denial independently of absent product grants. `pendingHttpAccess` probed every public RLS table and public RPC with the real JWT; reads were denied/empty and RPC results denied. The original pending-client suite retains PO/WO foreign-workspace issuance denials. The client JWT was probed against both workspaces.
- Static checks verified `app/auth/recovery/actions.ts` and every public F4 `recovery_link_*` plus private recovery helper definition contain no `UPDATE public.clients` statement. Recovery code has no approval-state write path.
- No migrations, application code, endpoint, grants, RLS policy, seed, capability matrix, catalog, or task checkboxes changed for U7-R2. The pending-client recovery decision is recorded once in the spec decision register.

### U7-R2 gates

| Gate                                                                                                             |                        Result |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------: |
| `npm run typecheck`                                                                                              |                1 check passed |
| `npm run lint`                                                                                                   |                1 check passed |
| `npm run format:check`                                                                                           |                             1 | 0   | Repository Prettier check passed after final docs and task edits |
| `npm test`                                                                                                       | 59 files / 1,348 tests passed |
| Local DB reset + provision + `node tests/integration/client-accounts-provision.mjs` + `npm run test:integration` |   25 files / 859 tests passed |
| `CI=1 npm run e2e -- tests/e2e/auth.spec.ts`                                                                     |                      5 passed |

### U8-R1 architect review corrections

- RED: `npm test -- tests/unit/server-log-privacy.test.ts tests/unit/client-accounts-storage-result.test.ts` failed before implementation because both tested helpers were absent. The privacy test's synthetic raw line contains canary token/password/email values while a counts-only JSON summary contains none; the Storage test supplies the negative `1 skipped` result.
- GREEN: the scanner reported three matched canary categories and one matched raw line, while the counts-only summary reported zero hits. The e2e raw-log fixture canary passed without printing its line or values. The Storage parser classified `1 skipped` as `acceptable: false`; the isolated runner finished with `1 passed, 0 skipped, 0 failed, 0 flaky, 0 interrupted`.
- Full captured run: `CI=1 npm run e2e` passed 124 tests and skipped 10. A post-run temp-directory check found zero raw server-log files, two scrubbed summaries with `rawLogDeleted: true`, and no active path pointer. The focused client-account/accessibility pair passed 31 tests with one existing provider-fault skip.
- R1 gates: typecheck, lint, format check, 1,348 unit tests, 855 integration tests, build:edge, and the client-signup edge proof passed. Edge proof scanned 1,446 server files and 61 client assets. Storage runner passed exactly one test. Worker web size was 6,401.33 KiB / 1,331.78 KiB gzip, unchanged from the prior U8 measurement.
- No application code, migrations, dependencies, grants, RLS, seeds, capability matrix, or catalogs changed. No task IDs were ticked by R1.

## U9 T039—T045 final verification (2026-10-28)

### C1—C3 and privacy capture

- C1: `node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/client-accounts-schema.test.ts tests/integration/client-accounts-signup.test.ts -t 'C1'` — 47 passed, 72 filtered; mismatch and compatibility probes passed.
- C2: the exhaustive `auth.users`/`auth.identities` parity test was rerun separately with real local GoTrue password sign-in: `node --env-file=.env.local node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/client-accounts-auth.test.ts -t 'C2'` — 4 passed, 4 filtered. It compares all selected Auth columns and verifies a real sign-in.
- C3: the canary persistence/diagnostic tests were rerun separately: auth + signup integration files filtered to `C3` — 7 passed, 70 filtered. C4 remains a hosted/PO acceptance blocker; local Auth acceptance is not complete.
- T040 multipart capture RED: temporarily breaking the multipart field-name parser made `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts -g 'identity collision keeps'` fail at `multipart submission capture includes request_secret` (expected a non-empty parsed list, received 0). GREEN: restored parser normalizes React's `_1_` field prefix; the same focused test passed. The capture concatenates registered known-sensitive values and checks token, request_secret, password, email, phone and name non-vacuity for each submitted scenario.
- With local Supabase and `.env.local` environment loaded, full CI e2e passed 124, skipped 10; opt-in provider failure passed 1; isolated Storage runner passed exactly 1 (0 skipped/failed). The e2e harness scanned HTML/RSC/action payloads, redirects, browser/server logs, traces and scrubbed artifacts; traces and raw temporary server logs were removed. Edge proof scanned 1,446 production server files and 61 client assets; no test-IP override identifier, dynamic signup-service NODE_ENV or client service key was found. `npm run check:secrets` passed. Hosted host access-log redaction remains an operational blocker.

### Mutation evidence (local scratch only)

For SQL cases listed as restored, each mutation was applied only to the disposable local database; the original function/constraint was restored by `db reset`, Vault was reprovisioned, and the named focused test passed green. No committed migration was changed. —Open— means the required mutation or no-masking proof was not completed; it is not a pass.

| ID    | Mutation target and RED assertion                                                                                                                                                                                                                                                                   | Isolation / restoration / GREEN                                                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-M01 | `public.client_signup`, removed link `FOR UPDATE`; row-lock test failed —link lock must precede redemption, independently of client guard—.                                                                                                                                                         | Link/client guards were considered separately; DB reset + provision; row-lock test green.                                                                                                                                                                                                                                  |
| Q-M02 | `public.client_signup`, removed only `sampled_at < expires_at`; strict-consume test expected `{status:'invalid'}`, received `{status:'complete'}`.                                                                                                                                                  | Update guard and deferred client checks disabled for the specific probe; DB reset + provision; test green. Separate set-once trigger mutation remains open.                                                                                                                                                                |
| Q-M03 | Dropped `public.clients.email_normalized` canonical UNIQUE; dedicated integrity assertion expected rejection but insert resolved.                                                                                                                                                                   | Claim/insert/deferred guards disabled for fixture; DB reset + provision; test green. Registry UNIQUE variant remains open.                                                                                                                                                                                                 |
| Q-M04 | Added permissive clients SELECT policy plus safe-column grants; the pending synthetic-JWT assertion failed at the unexpected visible row. The later real-JWT negative control loosened `has_workspace_access`; own and foreign post-reset probes returned `[false,false]` instead of `[true,true]`. | Safe-column grants were supplied inside rollback-scoped probes, so RLS was the deciding wall; reset + provision restored `[true,true]`.                                                                                                                                                                                    |
| Q-M05 | Granted `SELECT(email_normalized)` to authenticated; zero-effective-grant catalog assertion failed (observed 10 grants).                                                                                                                                                                            | Catalog assertion independent of RLS; DB reset + provision; test green.                                                                                                                                                                                                                                                    |
| Q-M06 | Replaced `app_private.audit_row_change()` with no-op; full legacy-body assertion failed.                                                                                                                                                                                                            | Used latest complete body from migration `20261031122000_client_accounts_signup.sql`; reset + provision; audit test green. No migration edited.                                                                                                                                                                            |
| Q-M07 | `lib/client-accounts/results.ts` duplicate-to-copy mapping changed to invalid (the rendered copy is in `lib/i18n/messages`); D-08 exact mapping assertion failed with invalid copy.                                                                                                                 | SHA-256 original/restored `AD7319058B872A8A81563FD0AEDD979D943330983AE89E453F8CDBA041CEEF25`; mutated `1AE45AFB1097A134B4CB95EFE383ABE30E44CA126BC7F95935BEE7E17B6857F9`; restored hash matched; 4 message tests green.                                                                                                    |
| Q-M08 | Moved Auth writes outside the protected rollback in the committed Q-M08 regression; after the expected business failure, real local GoTrue sign-in succeeded and `rolled-back user cannot sign in` failed.                                                                                          | Reset + provision; committed-state test passed with the orphan absent/unusable. In-transaction GoTrue check is labeled sanity-only.                                                                                                                                                                                        |
| Q-M09 | `middleware.ts` forced token-bearing redirect branch; nested/denied registration e2e failed at the token-free `Location` assertion.                                                                                                                                                                 | SHA-256 original/restored `513926EFBD03894B40CEE231B993DF83D02C19BC607266DE71FE27A02F8D0523`; mutated `35C5D83C0AFF1F67A467ABEC9F42AC7CE24739519C847DEAF54B8345FF34E893`; restored hash matched; focused e2e green. Raw server-log scanner ran in full e2e.                                                                |
| Q-M10 | Removed `Referrer-Policy`; two header assertions failed. Separately removed `Cache-Control`; two no-store assertions failed.                                                                                                                                                                        | `middleware.ts` original/restored SHA-256 `513926EFBD03894B40CEE231B993DF83D02C19BC607266DE71FE27A02F8D0523`; mutations respectively `9F44935A7ACF2CD402DC636889C7A77CAF2F04810D937BE07780C23E4F1F924E` and `09AA99430DC91BAA681FEB19A6156F5DBDF55A6546C9730B2C311E4DF1E4EDD7`; restored hash matched; header tests green. |
| Q-M11 | Replaced post-lock `clock_timestamp()` by `now()`; delayed-submit test failed because expired request was accepted (`expected false, got true`).                                                                                                                                                    | Isolated post-lock time predicate; DB reset + provision; row-lock/expiry test green.                                                                                                                                                                                                                                       |
| Q-M12 | SQL receipt request-secret hash changed to digest of mutated text; lost-response assertion failed at `before!.bound`. TS action request-secret binding was also changed; lost-response e2e failed at expected one Auth user, received zero.                                                         | SQL reset + provision and receipt test green. TS action SHA-256 original/restored `012F92C87443FD3CD255703676F4F64EDBA9CA639F89B0E38C524F7EA71219F1`; mutated `C2B92D9F5CCA35D6BF12761B2613A620676C315078E7E372D3A566B34A0A9FAA`; restored hash matched; focused e2e green.                                                |
| Q-M13 | Dropped exact `(workspace_id, registration_link_id, package_version_id)` composite FK; new alternate-version test expected SQLSTATE 23503 but insert resolved.                                                                                                                                      | Fixture had a valid alternate same-workspace package/link/client; package insert guard disabled only for alternate fixture; FK was the isolated failing constraint. Reset + provision; test green.                                                                                                                         |
| Q-M14 | Removed signed-in app-wall check while using accepting RPC mock; unit status assertion failed.                                                                                                                                                                                                      | `validation.ts` original/restored SHA-256 `2AE4BEB3E7C41F25E28A86A8C169CACBE3474927BD89AD2EF1B33EB6BDE3649B`; mutated `7A7DEB9488FF043889E31B30EE60B872F93A4CCF54A5AED218FB8AFE1AD7B492`; restored hash matched; unit green. DB-side guard mutation remains open.                                                          |
| Q-M15 | Removed only per-link cap; separate-connection race admitted 12 vs expected 5. Separately removed only per-IP cap; admitted 36 vs expected 30.                                                                                                                                                      | Independent connections and independent predicates; each DB reset + provision; both limiter tests green.                                                                                                                                                                                                                   |
| Q-M16 | Bypassed compatibility guard for unsupported latest version, missing written column and wrong written-column type; each targeted C1 probe returned `f,t` where `t,t` was required.                                                                                                                  | Mutated only local function; reset + provision after each; all three C1 probes green.                                                                                                                                                                                                                                      |
| Q-M17 | Removed per-table UPDATE/DELETE and TRUNCATE guards in isolated probes. Direct operations resolved and their expected 23514 assertions failed; Q-M17 table/transition variants and the remaining attempts/tickets TRUNCATE evidence are recorded in the U9 delta 3 step 2 table below.              | Reset + provision after each mutation; all listed guards passed focused green reruns.                                                                                                                                                                                                                                      |
| Q-M18 | Forced attestation predicate false; forged proof returned admitted instead of invalid.                                                                                                                                                                                                              | No ticket/counter-credit assertion was part of failing test; reset + provision; forged-proof test green.                                                                                                                                                                                                                   |
| Q-M19 | Removed freshness predicate; stale proof returned admitted instead of invalid.                                                                                                                                                                                                                      | No ticket/counter-credit assertion was part of failing test; reset + provision; stale-proof test green.                                                                                                                                                                                                                    |
| Q-M20 | Separate nullable `raw_ip inet` and `ip_key bytea` scratch columns each made the exact attempt-column allowlist assertion fail with the unexpected column present.                                                                                                                                  | No values were inserted; no FK/check/grant masked the schema assertion. Reset + provision after each; focused allowlist test passed.                                                                                                                                                                                       |
| Q-M21 | Changed trusted-IP helper to fall back to XFF; trusted-CF-only assertion failed on invalid CF plus forged XFF.                                                                                                                                                                                      | `trusted-ip.ts` original/restored SHA-256 `603812F5AFDE52A2A7876D71D5443F979C1B3F4851D23C37B05B8AF5B5247F92`; mutated `DB498D0CEB493273A8C7335D2D0F5090EB275744004D6FD94C52D630E84767AA`; restored hash matched; unit and edge proof green.                                                                                |
| Q-M22 | TS infrastructure-to-invalid mutation failed the bilingual retry assertion. SQL expired-link SQLSTATE P1100→P1101 mutation unexpectedly passed `invalid link precedes canonical collision locking`; stopped per architect instruction as a test coverage gap.                                       | TS SHA-256 evidence and e2e green are above. SQL reset + provision restored the targeted test to green; full e2e later passed, including the existing HTTP 200 unavailable contract. No Q-M22 fix was attempted.                                                                                                           |
| Q-M23 | Mutated purge to delete referenced audit rows; with only the audit immutability trigger disabled to avoid trigger masking, `surviving.slice(0, original.length).toEqual(original)` failed.                                                                                                          | This compares the pre-existing referenced audit rows byte-for-byte. Reset + provision; purge test green; surviving rows are unchanged.                                                                                                                                                                                     |

### T043 scope audit and decision drift

The final diff contains only `tests/e2e/client-accounts.spec.ts`, `tests/integration/client-accounts-integrity.test.ts`, and this evidence file. No migrations, seed/catalog/capability files, dependency manifests, protected worktrees, cloud resources, or application implementation files changed. The latest audit function source was confirmed as `20261031122000_client_accounts_signup.sql`; no migration edit was made. Fixed the stale phone line: PO decision ND-F11-2a (2026-10-28) is country selector, +20 default, national input, E.164 storage. Other decisions cited here and in the spec: Server Action `unavailable` payload with HTTP 200; signed-in visitor `sign_out_required`; pending-client recovery Option A preserves pending approval and denial after reset. C4 remains an explicit hosted/PO blocker.

### T044 acceptance map and blockers

The existing FR-001—FR-017 / SC-001—SC-012 map remains in this file; synthetic local checks and hosted acceptance are distinct. Local evidence covers C1—C3, pending-JWT denial, the implemented flows and the listed mutation RED/GREEN cases. Acceptance still blocked by C4 hosted Auth/PO approval, hosted Vault provisioning, operational purge scheduling, host access-log redaction, ND-F5-1 audit retention, APP_ORIGIN deployment configuration, and open ND-F4/F10 decisions. SC-011 timings are a local regression only, not an SLA; archived collision timing remains limited by archived-state policy. Q-M08, Q-M20, SQL Q-M22, Q-M03 registry uniqueness, Q-M02 set-once trigger, Q-M04 real-JWT loosened-policy negative control, Q-M14 DB-wall mutation, and full Q-M17 table/transition coverage remain open as marked above.

### T045 final gates and repository state

- `npm run typecheck`: pass (1 check); `npm run lint`: pass (0 errors/warnings); `npm run format:check`: pass (all matched files); `npm test -- --configLoader native --pool threads`: 59 files / 1,348 passed.
- Clean local `db reset` + Vault provision + `node tests/integration/client-accounts-provision.mjs` followed by `npm run test:integration`: 25 files / 860 passed.
- Full `CI=1 npm run e2e` with local environment: 124 passed / 10 skipped / 0 failed; separate provider-fault e2e: 1 passed; isolated Storage runner: 1 passed / 0 skipped / 0 failed.
- `npm run build:edge`: pass; `node scripts/check-client-signup-edge.mjs`: pass (1,446 server files, 61 client assets); `npm run check:secrets`: pass; `npm run size`: web 6,401.33 KiB / 1,331.78 KiB gzip (limit 65,536 KiB), cron 2.85 KiB / 1.25 KiB gzip.
- One earlier e2e invocation without local environment skipped 59 scenarios (75 passed); the correctly configured rerun above is the gate result. Scoped Prettier check across pre-existing spec markdown reports seven files not formatted; repository `format:check` passes, and those source-of-truth documents were left untouched.
- Final pristine source hashes: `app/register/[token]/actions.ts` `012F92C87443FD3CD255703676F4F64EDBA9CA639F89B0E38C524F7EA71219F1`; `middleware.ts` `513926EFBD03894B40CEE231B993DF83D02C19BC607266DE71FE27A02F8D0523`; `lib/client-accounts/validation.ts` `2AE4BEB3E7C41F25E28A86A8C169CACBE3474927BD89AD2EF1B33EB6BDE3649B`; `lib/client-accounts/results.ts` `AD7319058B872A8A81563FD0AEDD979D943330983AE89E453F8CDBA041CEEF25`; `lib/client-accounts/trusted-ip.ts` `603812F5AFDE52A2A7876D71D5443F979C1B3F4851D23C37B05B8AF5B5247F92`.
- Final local DB reset/provision and `git diff --check` are pending after the last focused C1—C3 runs. Because required mutation coverage remains open, T039/T041/T042/T044/T045 are not claimed complete and no task checkbox or commit/push is made. T040 privacy evidence and T043 scope audit are complete.

### U9 delta 1 local mutation additions (2026-10-28)

All SQL mutations below were local runtime scratch mutations. Each SQL restoration used `npx --yes supabase@2.122.0 db reset` followed by `node tests/integration/client-accounts-provision.mjs`, then the focused test was rerun green. No committed migration was changed.

| ID / target                                                          | RED evidence and no-masking proof                                                                                                                                                                                                                                                                                                                                                                                                                         | Restore and GREEN                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-M02 `app_private.guard_registration_link_update()` set-once branch | Removed only the consumed-at set-once branch. `tests/integration/registration-links-integrity.test.ts -t 'consumed transition is set-once'` failed at the expected SQLSTATE 23514 rejection because the update resolved. Direct privileged update; constraints/FKs/grants were not the rejecting mechanism.                                                                                                                                               | Reset + provision; focused test passed (1).                                                                                                                                                                                 |
| Q-M03 canonical registry UNIQUE                                      | Dropped only `account_identifier_claims_email_key_key`. The case-fold collision assertion in `client-accounts-integrity.test.ts` failed because the duplicate Auth identity insert resolved. Auth sync/claim guards were disabled only for the fixture; this isolates the canonical registry constraint.                                                                                                                                                  | Reset + provision; focused collision test passed (1).                                                                                                                                                                       |
| Q-M04 pending-client RLS                                             | Altered `app_private.has_workspace_access(uuid,text)` to allow any authenticated UUID. With real pending-client JWT and rollback-scoped safe-column grants, both independently tested own/foreign workspace RLS probes failed: `safe-column RLS probes for both workspaces` expected `[true,true]`, received `[false,false]`. The baseline pending JWT and post-reset access probes pass. Grants were supplied, so missing privileges could not mask RLS. | Reset + provision; focused pending recovery test passed (2).                                                                                                                                                                |
| Q-M08 committed usable Auth orphan                                   | Mutated local `public.client_signup` to perform Auth user/identity writes outside its protected business subtransaction, then triggered a business insert failure. The committed rollback test failed at `rolled-back user cannot sign in`: GoTrue sign-in succeeded, proving the orphan was usable.                                                                                                                                                      | Reset + provision; focused Q-M08 test passed (1).                                                                                                                                                                           |
| Q-M14 SQL admission DB wall                                          | Mutated `app_private.redeem_signup_admission_ticket(...)` to accept the forged ticket. `client-accounts-admission.test.ts -t 'direct RPC cannot bypass ticket/request/link binding'` received `{status:'complete'}` where `{status:'invalid'}` was asserted. The direct RPC completed, so no FK/grant failure masked the guard.                                                                                                                           | Reset + provision; focused test passed (1).                                                                                                                                                                                 |
| Q-M17 per-table UPDATE/DELETE guards                                 | Disabled the individual client, operation, claim, attempt and ticket UPDATE/DELETE transition/general-delete triggers in separate scratch runs. The matching privileged assertions expecting 23514 each failed because the corresponding direct UPDATE/DELETE resolved. Client same-value UPDATE, unreferenced attempt/claim/ticket rows and outbound-only operation/ticket FKs avoid FK masking.                                                         | Reset + provision after each mutation; each corresponding immutable/transition test passed green.                                                                                                                           |
| Q-M17 clients TRUNCATE                                               | Disabled the clients truncate guard and the operation-table cascade truncate guard. The catalog assertion `public.clients: privileged TRUNCATE is forbidden` failed because TRUNCATE resolved; both guards were removed to ensure cascade trigger behavior did not mask the clients guard.                                                                                                                                                                | Reset + provision; focused catalog assertion passed.                                                                                                                                                                        |
| Q-M17 claims/operations TRUNCATE                                     | Disabled each table's own truncate trigger individually. Each table-specific `privileged TRUNCATE is forbidden` assertion failed because the operation resolved.                                                                                                                                                                                                                                                                                          | Claims reset + provision and green rerun completed. Operation reset/provision and green rerun was started; final completion was not observed in this turn and is left open. Attempts/tickets TRUNCATE variants remain open. |
| Q-M20 raw IP / ip_key storage                                        | Not executed. Existing payload/log scans do not prove the required independent SQL mutations. No missing assertion was added because a mutation gap must be routed to the architect.                                                                                                                                                                                                                                                                      | Open.                                                                                                                                                                                                                       |
| Q-M22 SQL link-state branch                                          | Not executed; only the previously recorded TypeScript infrastructure-to-invalid mutation has evidence. The SQL branch mutation and HTTP 200 `unavailable` payload contract remain open.                                                                                                                                                                                                                                                                   | Open.                                                                                                                                                                                                                       |

The Q-M08 rollback suite now performs real GoTrue sign-in before checking transactional absence, and a separate committed regression proves the no-usable-orphan property across a committed business rollback. Q-M17 guard variants remain partial as noted above.

### Delta 1 completion checkpoint and gate status (2026-10-28)

This supersedes the earlier sentence that no commit/push was made: the requested four-file checkpoint was committed and pushed as `a01e2d111e7c0eb0c06f96bdae4d13e36e4cbf9c` (`test(011): U9 part 1 — T040 capture hardening, Q-M13 FK regression, mutation evidence`). The current delta adds only the pending-JWT negative-control regression, committed-GoTrue-orphan regression, and the mutation evidence above.

The changed integration tests passed together: recovery + signup, 2 files / 81 tests. Final gate observations for this delta:

- `npm run typecheck`: passed; `npm run lint`: passed; `npm run format:check`: passed after formatting this evidence file; `npm test`: 59 files / 1,348 passed.
- Clean local reset + Vault provisioning completed, followed by `node tests/integration/client-accounts-provision.mjs`. `npm run test:integration` finished 25 files / 855 passed / 6 failed / 0 skipped / 861 total. Failures: `expired, consumed and malformed-request submissions still count both windows and issue no ticket` (audit count +1); `C1 mismatch emits a code/timestamp-only server event with zero database writes` (audit count +1); `C1 guard then missing keys: unavailable with zero writes` (audit count +1); `PO clock boundary 5000 ms: accepted once` (audit count +1); `narrow 30-day purge removes only old attempts and preserves audit and tickets` (concurrent cleanup audit row entered snapshot); and `zero-row consume RETURNING rolls back all writes` (Postgres deadlock while creating a trigger). The full-suite failure is not waived; T039/T045 remain incomplete pending owner/architect routing.
- `CI=1 npm run e2e`: 124 passed / 10 skipped / 0 failed. Provider-fault opt-in: 1 passed. Isolated Storage runner: exactly 1 passed, 0 skipped/failed/flaky/interrupted.
- `npm run build:edge`, `node scripts/check-client-signup-edge.mjs` (1,446 server files, 61 client assets), `npm run check:secrets`, and `npm run size` passed. Worker size: web 6,401.33 KiB (1,331.78 KiB gzip), cron 2.85 KiB (1.25 KiB gzip).
- `git diff --check` passed. This delta did not execute all SQL mutation variants or finish the complete FR/SC matrix. T039, T041, T042, T044 and T045 remain unchecked. T040 is checked from its observed evidence. T046 was not edited.

Current open mutation variants: Q-M17 operation TRUNCATE green restoration not independently observed, attempts/tickets TRUNCATE; Q-M20 raw-IP and `ip_key` SQL mutations; Q-M22 SQL link-state branch/HTTP 200 `unavailable` payload. The all-Q-M01..Q-M23 record is intentionally incomplete, and the full ten-seam/T044 acceptance matrix requires continuation.

## U9 delta 2 — isolation regressions and integration reruns (2026-10-28)

### Initial reproduction and hypotheses

After a clean local `db reset` and Vault provisioning, the first `npm run test:integration` on `440f0b2` completed **25 files / 861 passed / 0 failed**. Thus the prior recorded local **855 passed / 6 failed** result was not reproducible on this clean run. Its exact failures remain recorded above. The following changes address the concrete state-sharing and lock-risk hypotheses without relaxing assertions.

- **H1, committed Q-M08 state:** the old Q-M08 test used the signup file's shared workspace. It did commit the expected failure attempt and `client.signup_failed` event, so those rows can persist between files. Q-M08 now creates its own `clientContext` (therefore a unique workspace/link) and asserts the exact link-scoped failure attempt and event. The in-transaction GoTrue sign-in is labeled a sanity check only; the committed transaction followed by real GoTrue sign-in remains the proof. No IP is used by this test: it calls the signup RPC directly and does not call admission. Admission count deltas are now scoped to that test's link key, IP key, nonce, link id and attempt-linked audit events. The purge snapshot now checks every captured preexisting audit row by its original ID and exact contents, so unrelated new audit rows do not alter the comparison; deletion or modification of a captured row still fails.
- **H2, Q-M13 fixture write:** removed the committing `issue(context)` RPC from inside the rollback probe. The alternate registration-link row is now inserted directly within that same transaction with only the insert guard disabled for the fixture insert; the probe rollback removes it. This avoids consuming another committed F10 issuance slot. Q-M13 passed in the 5-file focused run.
- **H3, Q-M04 concurrent probes:** the own/foreign workspace probes now run sequentially. `pendingRlsAccess` raises a dedicated `PendingRlsAccessDenied` only when a safe-column SELECT/UPDATE or workspace-access assertion observes access. The mutation harness maps only that error to `false`; all database, grant, transaction and other infrastructure errors are rethrown. With a local runtime mutation that makes `has_workspace_access` allow every authenticated user, both PO and WO recovery cases failed at the intended assertion: expected `[true,true]`, received `[false,false]`. After reset and Vault provisioning, the focused recovery test passed 2 cases / 9 skipped.
- **H4, zero-row consume deadlock:** no deadlock recurred in the two clean full-suite runs. Live `pg_locks` polling observed only short-lived admission advisory-lock waits (PIDs 604—607 with a separate blocker 599); the waits cleared, and the next `pg_blocking_pids` snapshot was empty. No `deadlock detected` entry was present in the local DB container logs. The historical two deadlock participants therefore could not be identified from this environment. The zero-row consume test was not weakened or changed; both complete suite runs passed it. The sequential Q-M04 grant probes also remove concurrent GRANT activity on shared catalog relations. I do not claim the exact historical deadlock cause was proven.

### GREEN reruns

Two consecutive full integration gates each followed a fresh `npx --yes supabase@2.122.0 db reset` and `node tests/integration/client-accounts-provision.mjs`:

1. **25 files / 861 passed / 0 failed** (duration 154.13 seconds).
2. **25 files / 861 passed / 0 failed** (duration 152.59 seconds).

Before these runs, the focused recovery/signup/integrity/catalog/admission set passed **5 files / 193 tests**. The Q-M04 mutation red and restored focused green are recorded above. Local SQL mutations were restored by reset/provision. No migration, application implementation, grant, RLS policy or committed SECURITY DEFINER function was changed.

### Delta 2 final gates

The initial clean reset/provision run on the unchanged `440f0b2` baseline passed 25 files / 861 tests, so the earlier 6-failure local result did not reproduce in this delta. After the test/evidence isolation changes, two consecutive clean reset/provision full integration runs each passed 25 files / 861 tests / 0 failures. The focused Q-M04 mutation failed both PO and WO cases at the exact `[true,true]` versus `[false,false]` assertion; reset/provision restored the focused test to 2 passed / 9 skipped. The five-file recovery/signup/integrity/catalog/admission subset passed 193 tests.

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- `npm test`: 59 files / 1,348 tests passed.
- `npm run test:integration`: two clean runs, each 25 files / 861 tests passed; each was preceded by local DB reset and Vault provisioning.
- `CI=1 npm run e2e`: 124 passed / 10 skipped / 0 failed.
- Provider-fault e2e: 1 passed.
- `scripts/test-client-accounts-storage.ps1`: exactly 1 passed, 0 skipped/failed/flaky/interrupted.
- `npm run build:edge`: pass.
- `node scripts/check-client-signup-edge.mjs`: pass, 1,446 production server files and 61 client assets scanned.
- `npm run check:secrets`: pass.
- `npm run size`: pass; web 6,401.33 KiB (1,331.78 KiB gzip), cron 2.85 KiB (1.25 KiB gzip).
- `git diff --check`: pass. Final local reset/provision completed after the gates.

The previously reported six integration failures are recorded as an earlier RED result; delta 2 did not reproduce them in a clean baseline run. The two post-change full runs prove GREEN twice. The exact historical deadlock participants remain unverified because no deadlock recurred and local DB logs contained no deadlock entry. Q-M17/Q-M20/Q-M22 mutations and T043—T045 are outside this delta and were not started.

## U9 delta 3, step 1 — R1 global no-write and R2 full purge-audit set

- **R1 target:** `tests/integration/client-accounts-admission.test.ts`, true no-write admission paths (C1 mismatch; C1 guard; each missing Vault key), plus rejection paths with durable writes. Each affected probe starts with `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`. No-write cases retain the scoped `countsForAdmission` equality and now also require exact global `counts(tx)` equality. Counted rejections compare the exact global counter, credit, nonce, attempt, and audit deltas in addition to scoped deltas.
- **R1 mutation RED:** locally replaced the C1 guard branch in `public.client_signup_admit` to insert one `signup_rate_counters` row using a different link key. The C1 mismatch probe's scoped equality passed, but the restored global assertion failed at `expect(await counts(tx)).toEqual(globalBefore)` (`client-accounts-admission.test.ts:82`): global `counters` and `credits` each increased by one. The failure was not caused by missing grants, RLS, triggers, or constraints: the mutation inserted under the function's existing SECURITY DEFINER authority and the only failing assertion was global count equality.
- **R1 restore/GREEN:** `npx --yes supabase@2.122.0 db reset` plus `node tests/integration/client-accounts-provision.mjs`; focused C1 guard/mismatch rerun passed **2 tests / 0 failed**.
- **R2 target:** `tests/integration/client-accounts-catalog.test.ts`, narrow 30-day purge. The probe uses repeatable read, retains each preexisting audit row's exact id/content check, and now compares the full before/after set of all audit rows except `client.signup_cleanup` for exact equality.
- **R2 mutation RED:** locally changed `app_private.purge_client_signup_attempts` to emit an extra `client.signup_attempted` audit row. Per-row survival checks passed; the full-set assertion failed specifically at `purge emits no audit rows except client.signup_cleanup` (`client-accounts-catalog.test.ts:177`), with the extra row visible in the received set. The mutation used the function's existing definer authority; no grant, RLS, FK, trigger, or constraint masked it.
- **R2 restore/GREEN:** `npx --yes supabase@2.122.0 db reset` plus `node tests/integration/client-accounts-provision.mjs`; focused admission and catalog rerun passed **2 files / 48 tests / 0 failed**. The local scratch function mutations were discarded by reset. No migration, app implementation, grant, RLS, or SECURITY DEFINER function source was edited.

## U9 delta 3, step 2 — Q-M17/Q-M20 and Q-M22 stop condition

| Mutation                              | Target, RED assertion, and masking check                                                                                                                                                                                                                                                                                                                                                                    | Restore and GREEN                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-M17 operation TRUNCATE restoration  | Green rerun of `client-accounts-catalog.test.ts -t 'client_signup_operations: privileged TRUNCATE'`: table-specific privileged truncate guard rejects with 23514.                                                                                                                                                                                                                                           | Clean local reset/provision had just completed for R2; 1 passed.                                                                                  |
| Q-M17 attempts TRUNCATE               | Disabled only `app_private.client_signup_attempts.signup_no_truncate`. `client-accounts-catalog.test.ts -t 'client_signup_attempts: privileged TRUNCATE'` failed at `.rejects.toMatchObject({ code: '23514' })`: truncate resolved. The test performs direct privileged `TRUNCATE ... CASCADE`; `pg_constraint` confirmed zero inbound FKs to the table, so neither FK nor grant masked the guard.          | `npx --yes supabase@2.122.0 db reset` + provision; same focused test 1 passed.                                                                    |
| Q-M17 tickets TRUNCATE                | Disabled only `app_private.signup_admission_tickets.signup_no_truncate`. `client-accounts-catalog.test.ts -t 'signup_admission_tickets: privileged TRUNCATE'` failed at `.rejects.toMatchObject({ code: '23514' })`: truncate resolved. Direct privileged `TRUNCATE ... CASCADE`; zero inbound FKs confirmed.                                                                                               | Reset + provision; same focused test 1 passed.                                                                                                    |
| Q-M20 raw-IP field                    | Scratch `ALTER TABLE app_private.client_signup_attempts ADD COLUMN raw_ip inet` (nullable, no value written). `client-accounts-integrity.test.ts -t 'attempts contain only safe evidence'` failed at the exact column allowlist assertion; received `raw_ip`. No FK, check, or grant was involved.                                                                                                          | Reset + provision; same focused test 1 passed.                                                                                                    |
| Q-M20 ip_key field                    | Scratch `ALTER TABLE app_private.client_signup_attempts ADD COLUMN ip_key bytea` (nullable, no value written). The same exact column allowlist assertion failed; received `ip_key`. No FK, check, or grant was involved.                                                                                                                                                                                    | Reset + provision; same focused test 1 passed.                                                                                                    |
| Q-M22 expired-link SQL classification | Scratch changed the `public.client_signup` expired/consumed-link exception SQLSTATE from P1100 to P1101. The targeted `invalid link precedes canonical collision locking` test unexpectedly passed under mutation, so no failing assertion was observed. Per instruction, stopped Q-M22 immediately and made no test/fix change. This mutation result is a coverage gap; no masking explanation is claimed. | Reset + provision; the same targeted test passed 1 test after restore. HTTP 200 `unavailable` e2e contract was not run because Q-M22 was stopped. |

The database was reset and reprovisioned after every scratch mutation. No Q-M17/Q-M20/Q-M22 implementation, grant, RLS, migration, or committed SECURITY DEFINER source was changed.

## U9 delta 3, step 3 — final scope audit, FR/SC matrix, and gate evidence

### T043 scope and ten-owner-seam audit

The audited range begins at `0e8a9c3cd9da50e585be536576ea85f73a5c06de`. The step 1 and step 2 commits changed only integration tests and this verification file; the final step changes only `specs/011-client-accounts/tasks.md` and this verification file. No app implementation, migration, seed, catalog, capability matrix, dependency manifest, linked/cloud resource, protected worktree, or LFTR-008 file changed. No migration body was edited; local scratch function/trigger/schema mutations were discarded with reset/provision. T046 remains unchanged.

The ten single-owner seams match the current decision register and implementation evidence:

1. **Password policy (ND-F11-1/1a, AUTH-PW-01):** minimum 8 characters with a number and symbol; maximum 72 UTF-8 bytes; symbol is printable and not letter/digit/whitespace; shared F11/F4 validator and GoTrue minimum backstop are PO-approved.
2. **Identity normalization (ND-F11-2/2a):** PO-approved country selector, +20 default, national-number input, canonical E.164 storage; Supabase Auth email normalization remains canonical.
3. **Field contract (ND-F11-3):** required name/email/phone/password; no Telegram or invented extra field bound.
4. **Consumption (ND-F11-4/4a):** strict submit-before-expiry; F10 grace-open behavior remains unchanged and submit is generic invalid.
5. **Admission (ND-F11-5/5a, AD-F11-2):** every submission reaching admission counts; 5/link/15 minutes and 30/IP/hour fixed windows; CF-Connecting-IP only with fresh single-use HMAC attestation.
6. **Completion (ND-F11-6/6a/6b):** pending approval by workspace PO/WO in F12; generic completion creates no session.
7. **Retention (ND-F11-7/ND-F5-1):** operational attempts expire after 30 days; counters expire with their windows; other audit retention remains NEEDS SOURCE CONFIRMATION.
8. **Authenticated visitor (ND-F11-8):** `sign_out_required`; manual sign-out, no linking/merge/automatic sign-out.
9. **Identifier scope (ND-F11-9/9a/9b):** active/pending uniqueness and identical generic D-08 response are required; archived state/admin review is deferred on ND-F5-1 and not invented.
10. **Audit (ND-F11-10):** structured attempt/failure/success/consumption/cleanup events, allow-listed details and append-only audit rows; Q-M23 plus R2 prove preservation; other audit retention remains open.

Production fails closed for unavailable configuration and keeps the exact C4 blocker: hosted Auth version, required DML permission/upgrade allowlist, hosted Vault provisioning and PO deployment approval have not been verified or authorized. The phone-input sentence formerly marked open is resolved by ND-F11-2a; this file now records the selector/+20/E.164 decision. Existing action transport remains HTTP 200 `unavailable`; sign-in-required and pending-client recovery remain `sign_out_required` and Option A.

Approved dependency exception clarification: PO decision ND-F11-2a (2026-10-28) approved the exact pin `libphonenumber-js` 1.13.15, imported through `libphonenumber-js/max`, for selected-country validation. This is the sole approved dependency exception; historical per-unit “no dependency” notes describe their original scope and are not rewritten. No other dependency change is authorized.

### C1-C4 proof status

| Condition                         | Final local evidence                                                                                                                               | Status                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Q-C1 Auth schema compatibility    | `client-accounts-schema.test.ts` + `client-accounts-signup.test.ts -t C1`: 2 files, 47 passed, 73 filtered; mismatch/compatibility paths included. | Local pass                                               |
| Q-C2 exhaustive Auth parity       | `client-accounts-auth.test.ts -t C2`: 1 file, 4 passed, 4 filtered; exhaustive users/identities column parity and real local GoTrue sign-in.       | Local pass; hosted Auth acceptance remains blocked by C4 |
| Q-C3 password/Auth/privacy checks | auth + signup integration files `-t C3`: 2 files, 7 passed, 71 filtered.                                                                           | Local pass                                               |
| Q-C4 hosted Auth acceptance       | No hosted check or deployment was run. Hosted Auth version, DML permission, upgrade allowlist and PO approval remain required.                     | PO/hosted blocker; Auth acceptance is not complete       |

### T044 FR-001..017 and SC-001..012 acceptance/evidence matrix

Synthetic/local test evidence is distinguished from hosted/PO acceptance. —Local pass— does not assert hosted acceptance.

| Requirement | Evidence mapping                                                                                                                                      | Status and remaining acceptance                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| FR-001      | Form/password/phone tests; signup/Auth tests; C2 exhaustive parity.                                                                                   | Local pass; C4 hosted Auth gate remains.                                                                               |
| FR-002      | Invalid/unavailable SQL and action paths; bilingual HTTP 200 retry e2e.                                                                               | Local pass for current paths; SQL Q-M22 mutation did not fail its intended test and remains a test-coverage gap.       |
| FR-003      | Atomic signup, rollback, GoTrue sign-in and no-session integration tests.                                                                             | PO/hosted blocked by C4.                                                                                               |
| FR-004      | Strict expiry/consumption and grace-open/strict-submit tests.                                                                                         | Local pass.                                                                                                            |
| FR-005      | Snapshot/FK/transaction-binding integrity tests.                                                                                                      | Local pass; canonical model mutation evidence remains as listed in the mutation table.                                 |
| FR-006      | Collision classes, D-08 equality and bilingual e2e.                                                                                                   | Local pass for implemented classes; archived-state/review acceptance deferred on ND-F5-1.                              |
| FR-007      | Canonical claims/unique constraints and concurrency tests.                                                                                            | Partial: Q-M03 registry UNIQUE mutation remains open.                                                                  |
| FR-008      | App wall, safe-grant RLS probes, real pending JWT PostgREST/RPC/Storage denials and Q-M04 negative control.                                           | Local pass; no hosted policy claim.                                                                                    |
| FR-009      | Action import/admin boundary, admission RPC and SQL wall tests.                                                                                       | Partial: Q-M14 DB-wall mutation remains open; app-wall TS mutation passed.                                             |
| FR-010      | Append-only audit event tests, purge target checks, Q-M23 mutation and R2 full-set assertion.                                                         | Local pass; other audit retention remains undecided under ND-F5-1.                                                     |
| FR-011      | Link/IP caps, every-admission counting, retry/correction and C1-C3.                                                                                   | Local pass for implemented behavior; AD-F11-2 hosted trust configuration remains a deployment requirement.             |
| FR-012      | F4 recovery own/foreign scope and approval-preservation tests.                                                                                        | Local pass; ND-F4-5 and inherited F4 decisions remain open.                                                            |
| FR-013      | AR/EN, keyboard, axe, theme and responsive e2e/unit checks.                                                                                           | Local pass.                                                                                                            |
| FR-014      | HTML/RSC/action/redirect/log/trace privacy scans, edge bundle and secret checks.                                                                      | Local pass; host access-log redaction is an operational blocker.                                                       |
| FR-015      | Pending-approval completion and no-session tests.                                                                                                     | Local pass; approval action belongs to F12.                                                                            |
| FR-016      | `sign_out_required`, no RPC call and manual sign-out UI tests.                                                                                        | Local pass.                                                                                                            |
| FR-017      | Disabled public Auth signup and inherited staff/F4 regression gates.                                                                                  | Local pass in inherited suite.                                                                                         |
| SC-001      | Atomicity, C2 parity and real sign-in.                                                                                                                | Local pass; C4 remains PO/hosted blocked.                                                                              |
| SC-002      | Races, replay, rollback and committed no-usable-orphan Q-M08 proof.                                                                                   | Local pass.                                                                                                            |
| SC-003      | Invalid/collision response equality and D-08 privacy tests.                                                                                           | Partial: archived-state policy is deferred; Q-M22 SQL classification mutation gap remains.                             |
| SC-004      | Strict expiry, nonce and lock-wait tests.                                                                                                             | Local pass.                                                                                                            |
| SC-005      | App/RLS/PostgREST/RPC/Storage pending-JWT denials, with Q-M04 safe-grant negative control.                                                            | Local pass.                                                                                                            |
| SC-006      | Audit branches, Q-M23 referenced-row survival, R1/R2 purge checks.                                                                                    | Local pass; audit retention and hosted scheduling remain open.                                                         |
| SC-007      | Password boundary tests, shared F4 validator and accessibility flows.                                                                                 | Local pass; AUTH-PW-01 is PO-approved.                                                                                 |
| SC-008      | Exact 5/link and 30/IP windows, separate limiter mutations and admission accounting.                                                                  | Local pass; hosted CF/Vault provisioning remains unverified.                                                           |
| SC-009      | 30-day purge, counter expiry, cleanup audit, Q-M23 and R2 full-set mutation.                                                                          | Local pass; purge scheduling and retention policy remain deployment blockers.                                          |
| SC-010      | Signed-in visitor prompt and no automatic linking/sign-out.                                                                                           | Local pass.                                                                                                            |
| SC-011      | 20 warm-ups plus 200 interleaved ordinary/synthetic archived serialization trials; p=0.662572, median delta 0.020 ms, exact response/header equality. | Local regression pass only, not an SLA; archived DB-branch timing is unavailable until ND-F5-1 defines archived state. |
| SC-012      | C1 zero-write checks, durable attempt/audit branches, cleanup and privacy capture.                                                                    | Local pass; host access-log redaction and other audit retention remain open.                                           |

Other PO/operational blockers listed separately from synthetic passes: C4 hosted Auth review; hosted Vault provisioning; purge scheduling; host access-log redaction; ND-F5-1/B4 jurisdiction, archived-state and retention decisions; APP_ORIGIN deployment configuration; ND-F4/F10 inherited decisions. No policy was invented for these.

### T045 final gates and restored-source evidence

| Gate                                        |                                  Pass | Fail | Evidence                                                                                       |
| ------------------------------------------- | ------------------------------------: | ---: | ---------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         |                                     1 |    0 | `tsc --noEmit`                                                                                 |
| `npm run lint`                              |                                     1 |    0 | ESLint, zero warnings                                                                          |
| `npm run format:check`                      |                                     1 |    0 | Repository Prettier check passed after final docs and task edits                               |
| `npm test`                                  |                                 1,348 |    0 | 59 files passed                                                                                |
| `npm run test:integration`                  |                                   861 |    0 | 25 files passed after `db reset` and Vault provision; repeated after final R1 assertion update |
| `CI=1 npm run e2e`                          |                                   124 |    0 | 10 existing environment/project skips; local-fixture env loaded; raw server-log scan completed |
| `scripts/test-client-accounts-storage.ps1`  |                                     1 |    0 | Exactly 1 passed, 0 skipped/failed/flaky/interrupted                                           |
| `npm run build:edge`                        |                                     1 |    0 | OpenNext production worker bundle built                                                        |
| `node scripts/check-client-signup-edge.mjs` | 1,446 server files + 61 client assets |    0 | No test-IP override or dynamic NODE_ENV markers in production output                           |
| `npm run check:secrets`                     |                                     1 |    0 | Secret scan passed                                                                             |
| `npm run size`                              |                                     1 |    0 | Web 6,401.33 KiB / 1,331.78 KiB gzip; cron 2.85 KiB / 1.25 KiB gzip                            |
| `git diff --check`                          |                                     1 |    0 | Passed after final task/evidence edits; final clean reset/provision completed                  |

Pristine SHA-256 values for the restored TypeScript mutation targets (all match their original values recorded with the mutations): `lib/client-accounts/results.ts` `AD7319058B872A8A81563FD0AEDD979D943330983AE89E453F8CDBA041CEEF25`; `middleware.ts` `513926EFBD03894B40CEE231B993DF83D02C19BC607266DE71FE27A02F8D0523`; `app/register/[token]/actions.ts` `012F92C87443FD3CD255703676F4F64EDBA9CA639F89B0E38C524F7EA71219F1`; `lib/client-accounts/trusted-ip.ts` `603812F5AFDE52A2A7876D71D5443F979C1B3F4851D23C37B05B8AF5B5247F92`; `lib/client-accounts/validation.ts` `2AE4BEB3E7C41F25E28A86A8C169CACBE3474927BD89AD2EF1B33EB6BDE3649B`; `lib/client-accounts/service.ts` `8CE3218EA06AD074EEC9F9852CE4FA4BBBD62D152CB0ED52EF933C7BD63B4FBB`.

Q-M22 SQL did not meet its mutation RED gate, so T039/T041/T042 remain unchecked; Q-M02 set-once trigger, Q-M03 registry UNIQUE and Q-M14 DB-wall variants also remain open as reflected above. No check is waived. The final reset/provision, `git diff --check`, and format check completed; T045 evidence is complete.

## U9 delta 4, step 1 — Q-M22 classification and Q-M20 raw-IP write path

Q-M22 follows the checked-in quickstart contract: expired and consumed link states remain `invalid`; only infrastructure classification maps to the generic `unavailable` payload. The same quickstart explicitly says every link state stays invalid. The bilingual e2e unavailable case covers HTTP 200, no-store/no-referrer, retryability, generic copy, and no consumption; `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts` passed 21 tests with 1 existing skip. Therefore expired/consumed links are not changed to `unavailable`.

| Mutation                          | RED evidence and no-masking proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Restore and GREEN                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-M22 expired/consumed SQLSTATE   | Scratch changed both expired/consumed `public.client_signup` SQLSTATE literals from `P1100` to `P1101`. `npm run test:integration -- --run tests/integration/client-accounts-signup.test.ts` failed 6 assertions; the new Q-M22 test failed at the exact P1100 definition assertion (`tests/integration/client-accounts-signup.test.ts:596`), and the existing invalid-link-before-lock assertion failed at line 554 because the result became `unavailable`. The identity-lock function was replaced with an `XX000` raiser in the rollback probe; no grants, RLS, FK or deferred constraint masked the classification.                                                                                           | `npx --yes supabase@2.122.0 db reset`, then `node tests/integration/client-accounts-provision.mjs`; focused admission + signup integration rerun passed 99/99. The expired and consumed fixtures pass the P1100 and public `{status:'invalid'}` assertions before canonical identity locking.                                                            |
| Q-M22 application mapping         | Scratch mapped a database `{status:'unavailable'}` result to app `{status:'invalid'}`. The unit test failed at `tests/unit/client-accounts-actions.test.ts:74`: expected the exact public `unavailable` payload, received `invalid` with the invalid-link message. The test supplied a successful admission then a database response and asserted only status/message keys; no HTTP/database grant path participates.                                                                                                                                                                                                                                                                                              | Source SHA-256 original/restored `8CE3218EA06AD074EEC9F9852CE4FA4BBBD62D152CB0ED52EF933C7BD63B4FBB`; mutated `9E30832026269D960059844388569A21527B0BBC84326370FEC94E4D9BBBA535`. Restored hash matched; `npm test -- --run tests/unit/client-accounts-actions.test.ts` passed 17/17. Existing unavailable e2e contract remains the HTTP 200 route proof. |
| Q-M20 raw-IP keyed evidence write | Scratch changed only the IP counter write expression to a 32-byte field containing plaintext `192.0.2.1` bytes (padded to preserve the existing key-length constraint). `npm run test:integration -- --run tests/integration/client-accounts-admission.test.ts -t 'Q-M20 stores the keyed IP evidence value and never the plaintext IP'` failed at the precise `ip_key` write-path assertion (`tests/integration/client-accounts-admission.test.ts:581`). The admission call reached the counter write; the bytea 32-byte check remained enabled, so schema constraints did not mask the assertion. The value assertion also rejects stored keys containing the raw IP bytes and requires the expected HMAC value. | `npx --yes supabase@2.122.0 db reset`, then `node tests/integration/client-accounts-provision.mjs`; focused Q-M20 integration test passed 1/1. The production SQL write uses verified `ip_key`; its persisted value equals the expected keyed HMAC and does not contain the plaintext IP.                                                                |

The app/HTTP test is for the infrastructure-to-`unavailable` classification, as required by quickstart; the expired/consumed routes remain public `invalid` by contract. No application or migration change was retained. The first attempted Q-M20 scratch write was rejected by the 32-byte constraint and is excluded as masked/non-evidence; the recorded mutation above preserved that constraint and reached the regression assertion.

Additional Q-M22 single-branch proof: mutating only the expiry guard from P1100 to P1101 failed both link-state result assertions and the expired branch assertion at `client-accounts-signup.test.ts:608`; after reset/provision, mutating only the zero-row consume exception failed the consumed branch assertion at line 608 while the expiry case passed. A final reset/provision restored both cases, which passed 2/2. These branch-local checks pin the two classifications independently.

## U9 delta 4, step 2b — Q-M02/Q-M03/Q-M14 mutation variants

| Mutation                           | RED assertion and no-masking proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Restore and GREEN                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Q-M02 set-once consumed transition | Disabled only `public.registration_links.registration_links_update_guard`. `npm run test:integration -- --run tests/integration/registration-links-integrity.test.ts -t 'consumed transition is set-once'` failed at `.rejects.toMatchObject({code:'23514'})` (`registration-links-integrity.test.ts:216`): the second update resolved. The test performs the update as the privileged DB owner; no grant, FK or other constraint rejected it.                                                                                                                                                                        | `npx --yes supabase@2.122.0 db reset` + `node tests/integration/client-accounts-provision.mjs`; focused set-once test passed 1/1.        |
| Q-M03 registry email UNIQUE        | Added a focused test using two distinct Auth UUIDs; after flushing deferred events it disables only `signup_claim_write_guard`, updates the first claim and expects the second update to fail specifically on `account_identifier_claims_email_key_key`. Dropping only that UNIQUE constraint made the assertion fail at `.rejects.toMatchObject(...)` (`client-accounts-integrity.test.ts:639`): the duplicate update resolved. Distinct Auth IDs kept the primary key clear; Auth emails stayed distinct; the claim-write trigger was intentionally disabled, so the registry UNIQUE constraint alone could reject. | `npx --yes supabase@2.122.0 db reset` + `node tests/integration/client-accounts-provision.mjs`; focused registry UNIQUE test passed 1/1. |
| Q-M14 DB workspace guard           | Replaced `app_private.has_workspace_access(uuid,text)` with `select true` while the app wall remained intact. The safe-column pending-JWT probe failed at `PendingRlsAccessDenied: Pending client unexpectedly accessed workspaces SELECT` (`client-accounts-fixture.ts:340`). The rollback-scoped probe grants SELECT/UPDATE on safe UUID columns before `SET LOCAL ROLE authenticated`; therefore RLS/access-helper behavior, not absent table/column grants, determines the result.                                                                                                                                | `npx --yes supabase@2.122.0 db reset` + `node tests/integration/client-accounts-provision.mjs`; the same safe-grant test passed 1/1.     |

Q-M02 set-once, Q-M03 registry UNIQUE, and Q-M14 DB workspace guard now have observed mutation RED and restored GREEN evidence. No committed migration, application implementation, grant, RLS policy, or SECURITY DEFINER function source was edited; each DB-side mutation existed only on the disposable local stack and was discarded by reset.

### Delta 4 current Q-M01–Q-M23 disposition

This current-status table supersedes the historical “open” labels in earlier U9 snapshots. Every listed mutation has a RED assertion, a no-masking rationale, and a restored GREEN run in the evidence above or in the earlier mutation records.

| ID    | Status | Evidence area                                                                                                               |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Q-M01 | Pass   | Link-lock serialization and post-lock recheck; prior T039 mutation record.                                                  |
| Q-M02 | Pass   | Strict consume/expiry plus set-once trigger variant; delta 4 table.                                                         |
| Q-M03 | Pass   | Client canonical UNIQUE plus registry email UNIQUE; delta 4 table.                                                          |
| Q-M04 | Pass   | Permissive RLS and real pending-JWT safe-grant negative controls; prior U9 mutation record.                                 |
| Q-M05 | Pass   | Column-grant widening and safe read probe; prior T039 mutation record.                                                      |
| Q-M06 | Pass   | Latest complete audit function branch preservation; prior T039 mutation record.                                             |
| Q-M07 | Pass   | Duplicate result mapping mutation; prior T039 mutation record.                                                              |
| Q-M08 | Pass   | Committed business rollback plus real local GoTrue sign-in; prior T039 mutation record.                                     |
| Q-M09 | Pass   | Token-bearing redirect and raw log scan; prior T039 mutation record.                                                        |
| Q-M10 | Pass   | no-referrer/no-store removal variants; prior T039 mutation record.                                                          |
| Q-M11 | Pass   | Transaction-start clock mutation under held lock; prior T039 mutation record.                                               |
| Q-M12 | Pass   | Receipt/request-secret/link binding and lost-response replay; prior T039 mutation record.                                   |
| Q-M13 | Pass   | Composite snapshot FK isolated mutation; prior T039 mutation record.                                                        |
| Q-M14 | Pass   | App-wall mutation and DB `has_workspace_access` safe-grant negative; delta 4 table.                                         |
| Q-M15 | Pass   | Separate link/IP cap mutations and together under independent connections; prior T039 mutation record.                      |
| Q-M16 | Pass   | C1 latest-version and missing/wrong-type column mutations; prior T039 mutation record.                                      |
| Q-M17 | Pass   | Guard, transition, operation/attempt/ticket TRUNCATE variants; delta 3 step 2 and prior U9 record.                          |
| Q-M18 | Pass   | Forged admission attestation mutation; prior T039 mutation record.                                                          |
| Q-M19 | Pass   | Replayed/stale/future nonce/freshness mutations; prior T039 mutation record.                                                |
| Q-M20 | Pass   | Safe-column allowlist plus plaintext raw-IP counter-write mutation; delta 3 step 2 and delta 4 step 1.                      |
| Q-M21 | Pass   | Trusted Cloudflare IP and production edge proof mutation; prior T039 mutation record.                                       |
| Q-M22 | Pass   | Expired/consumed SQL P1100 link classification; infra-to-unavailable app mapping and HTTP 200 e2e contract; delta 4 step 1. |
| Q-M23 | Pass   | Referenced audit-row purge mutation plus repeatable-read exact full-set assertion; prior U9 mutation record.                |

Q-M22 status follows the checked-in quickstart: link/identity outcomes stay `invalid`; the exact HTTP 200 `unavailable` payload applies to infrastructure failures, with no leaked identifiers. It does not claim Auth acceptance completion.

Architect clarification: per spec FR-002 and contract lines 208–210, expired/consumed/unknown links classify as `invalid`; only infrastructure failures map to HTTP 200 `unavailable`—there is no PO conflict.

### Delta 4 FR/SC status update

The FR/SC matrix above is updated by these completed local regressions: FR-002 and SC-003 include branch-specific expired/consumed P1100 classification plus infrastructure-only HTTP 200 `unavailable`; FR-007 includes the independent registry UNIQUE mutation; FR-009 includes app-wall and DB workspace-wall mutations. Their synthetic tests pass locally. Hosted/operational acceptance remains separately blocked by C4, Vault provisioning, purge scheduling, host access-log redaction, ND-F5-1, APP_ORIGIN, and open ND-F4/F10 decisions. C4 is not called complete.

### Delta 4 final gates before checkpoint 2

| Gate                                        |                                  Pass | Fail | Evidence                                                                                                |
| ------------------------------------------- | ------------------------------------: | ---: | ------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         |                                     1 |    0 | `tsc --noEmit` passed.                                                                                  |
| `npm run lint`                              |                                     1 |    0 | ESLint passed with zero warnings.                                                                       |
| `npm run format:check`                      |                                     1 |    0 | Repository Prettier check passed after the current test/evidence edits.                                 |
| `npm test`                                  |                                 1,350 |    0 | 59 test files passed.                                                                                   |
| `npm run test:integration`                  |                                   865 |    0 | 25 files passed after clean `db reset` and Vault provision.                                             |
| `CI=1 npm run e2e`                          |                                   124 |    0 | 10 existing skips; raw server-log scanner completed.                                                    |
| `scripts/test-client-accounts-storage.ps1`  |                                     1 |    0 | Exactly 1 passed, 0 skipped/failed/flaky/interrupted.                                                   |
| `npm run build:edge`                        |                                     1 |    0 | OpenNext production worker bundle built.                                                                |
| `node scripts/check-client-signup-edge.mjs` | 1,446 server files + 61 client assets |    0 | No production test-IP override identifiers or dynamic signup-service NODE_ENV.                          |
| `npm run check:secrets`                     |                                     1 |    0 | Secret scan passed.                                                                                     |
| `npm run size`                              |                                     1 |    0 | Web 6,401.33 KiB / 1,331.78 KiB gzip; cron 2.85 KiB / 1.25 KiB gzip.                                    |
| `git diff --check`                          |                                     1 |    0 | Passed before final task/evidence formatting; rerun required after those edits and on the final commit. |

The integration and full e2e counts above are local synthetic regression evidence. C4 hosted Auth/PO acceptance and the operational blockers remain open.

### Post-merge gate evidence — merge `6c3d0b519746daceaa1fca622d04c249531d745b`

All gates below ran on the no-ff merge commit after a clean local `npx --yes supabase@2.122.0 db reset` and `node tests/integration/client-accounts-provision.mjs` (both exited 0). Local `.env.local` values were loaded privately by the test processes and were not included in output.

| Gate                                        |                                  Pass | Fail | Evidence                                                             |
| ------------------------------------------- | ------------------------------------: | ---: | -------------------------------------------------------------------- |
| Local DB reset + Vault provision            |                                     2 |    0 | Both commands exited 0.                                              |
| `npm run typecheck`                         |                                     1 |    0 | `tsc --noEmit` passed.                                               |
| `npm run lint`                              |                                     1 |    0 | ESLint passed with zero warnings.                                    |
| `npm run format:check`                      |                                     1 |    0 | All matched files passed Prettier.                                   |
| `npm test`                                  |                                 1,354 |    0 | 59 test files passed.                                                |
| `npm run test:integration`                  |                                   865 |    0 | 25 files passed after reset and provisioning.                        |
| `CI=1 npm run e2e`                          |                                   124 |    0 | 10 existing skips; server-log scanner ran.                           |
| `scripts/test-client-accounts-storage.ps1`  |                                     1 |    0 | 1 passed, 0 skipped/failed/flaky/interrupted.                        |
| `npm run build:edge`                        |                                     1 |    0 | OpenNext production worker bundle built.                             |
| `node scripts/check-client-signup-edge.mjs` | 1,446 server files + 61 client assets |    0 | Edge proof passed; test-IP override identifiers absent.              |
| `npm run check:secrets`                     |                                     1 |    0 | Secret scan passed.                                                  |
| `npm run size`                              |                                     1 |    0 | Web 6,401.33 KiB (1,331.77 KiB gzip); cron 2.85 KiB (1.25 KiB gzip). |
| `git diff --check`                          |                                     1 |    0 | Passed after this evidence update.                                   |

These results are local synthetic verification. Hosted Auth compatibility and the listed production/operational blockers remain open; Auth acceptance is not complete.

## CodeRabbit round 1 — admission before bcrypt (A)

The forward-only `20261031125000_client_signup_admission_before_bcrypt.sql` extends the latest committed complete `public.client_signup` body in `20261031123500_signup_duplicate_result.sql`; it preserves all existing checks, exception branches, `SECURITY DEFINER`, `search_path=''`, owner, revoke, and anon/authenticated grants. The effective sequence is: field/policy/identity checks → exact 43-character token and request-secret checks → registration-link `FOR UPDATE` and keyed binding → one-use ticket redemption → bcrypt-cost validation and `extensions.crypt` → P1100 invalid-link classification → identity locks/collision handling. The password hash remains before every admitted link-state and identity/collision branch, preserving D-08 timing uniformity.

The rollback-scoped detector replaces `app_private.signup_bcrypt_cost()` with a raising probe immediately before `extensions.crypt`; the order assertion independently pins cost-check-before-crypt. Replacing extension-owned `extensions.crypt` was denied to the test DB role, so the adjacent private seam is used without broadening grants. The probe transaction rolls back both helper replacement and signup writes.

| Probe                                                                                                | Observed result                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED before migration: `npm run test:integration -- tests/integration/client-accounts-signup.test.ts` | `admission ticket replayed is rejected before password hashing` and `admission ticket mismatched is rejected before password hashing` both failed: expected `{status:'invalid'}`, received `{status:'unavailable'}` when the pre-redemption bcrypt-cost probe raised.                                                                                                                                                 |
| Hash-before-redemption mutation                                                                      | A scratch local migration moved bcrypt-cost/hash ahead of redemption. After reset + provision, `npm run test:integration -- tests/integration/client-accounts-signup.test.ts -t "admission ticket"` failed both assertions at the expected invalid-result assertion (line 539), observing `unavailable`. No RLS/grant/constraint masked the probe; the ticket path reached the deliberate raising hash-adjacent seam. |
| Restore + GREEN                                                                                      | Removed the scratch migration, ran `npx --yes supabase@2.122.0 db reset` then `node tests/integration/client-accounts-provision.mjs`, and reran `npm run test:integration -- tests/integration/client-accounts-signup.test.ts`: 74/74 passed. Expired and consumed link cases still redeemed their valid ticket, returned generic `invalid`, and retained the P1100 classification before identity locking.           |

The earlier U2 chronology paragraph records the then-installed behavior and is superseded for current order by this review-round evidence; D-08 still requires hashing before every admitted link-state and identity/collision branch.

## CodeRabbit round 1 — action fallback and input format (B/C)

| Probe                                                                                                                                                                    | Observed result                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RED before implementation: `npm test -- tests/unit/client-accounts-form.test.ts tests/unit/client-accounts-actions.test.ts tests/unit/client-accounts-admission.test.ts` | 3 regression assertions failed: rejected-action fallback was absent; `normalizedEmail('@example.test')` was accepted instead of null; the app wall admitted a 44-character request secret.                                                                                                                                                                         |
| B fallback-removal mutation                                                                                                                                              | Replaced the catch fallback with a synthetic throw; `npm test -- tests/unit/client-accounts-actions.test.ts -t 'rejected client action'` failed in `runSignupActionSafely` on that rejection. Restored fallback; the generic localized result unit test and existing finally guard pass.                                                                           |
| C email-shape mutation                                                                                                                                                   | Restored the old `includes('@')` predicate; `npm test -- tests/unit/client-accounts-actions.test.ts -t 'rejects empty email components'` failed at `normalizedEmail('@example.test')`: expected null, received `@example.test`. Restored the stricter subset check.                                                                                                |
| C request-secret mutation                                                                                                                                                | Widened the app regex from `{43}` to `{43,}`; `npm test -- tests/unit/client-accounts-admission.test.ts -t 'independent app wall'` failed because the 44-character request secret reached admission. Restored exact length.                                                                                                                                        |
| C SQL-format mutation                                                                                                                                                    | A scratch migration widened `client_signup`'s request-secret format to `{43,}`; the focused integration ordering/format assertion failed at `offsets.every(...)` (line 566). Removed the scratch migration, ran reset + provision, then the exact-format assertion passed (1 passed, 73 filtered).                                                                 |
| GREEN                                                                                                                                                                    | Targeted app/unit suites passed 44/44. `CI=1 npm run e2e -- tests/e2e/client-accounts.spec.ts -g "lost committed response"` passed 1/1 and verified the localized unavailable state, retained name/email, and enabled retry. The request-secret generator's 100 samples all match exactly 43 base64url characters; the source generates them from 32 random bytes. |

Email normalization preserves the existing no-trim, whitespace rejection, UTF-8 byte limit and lowercase behavior. Empty local/domain parts and multiple `@` separators fail field validation before admission; they cannot reach duplicate or unavailable RPC classification. The client action fallback returns the existing localized `SignupPublicResult` and does not clear form state or skip the `finally` reset.

## CodeRabbit round 1 — docs and repository hygiene (D/E)

| Probe                              | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D source audit                     | Updated the U1 checklist status, normative AD-F11-2 attestation reference, shipped migration references in T012/T017/T020, ND-F11-2a phone wording in T007, and T001–T045/T046 completion inventory. The sole approved dependency exception is exact `libphonenumber-js` 1.13.15 via `libphonenumber-js/max`, authorized by PO decision ND-F11-2a on 2026-10-28; it is recorded in the plan tech table and this T043 scope-audit clarification. Earlier per-unit “no dependency” notes are historical and were not rewritten. |
| E Docker-path RED/GREEN            | Added a static portability regression. RED: it failed because the storage runner hard-coded the developer's Docker Desktop path. GREEN: runner now uses `docker` from PATH first, then `$env:DOCKER_BIN`, `$env:ProgramFiles\Docker\Docker\resources\bin`, and `$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin`, only prepending an existing directory. The Storage runner passed exactly 1, skipped 0, failed 0, flaky 0, interrupted 0.                                                                             |
| E password-vector source RED/GREEN | Added a code-point-based assertion over JSON input literals. RED reported raw U+0020, U+200B, U+0301, U+00A0, U+2003, U+3000, U+200D, U+00AD, U+200F, U+FEFF, U+0378, and U+E000 (U+0301 appeared twice). Replaced all targeted raw source characters with exact `\uXXXX` escapes. Parsed JSON deep equality against the pre-change `HEAD` fixture passed (`isDeepStrictEqual` true), and the source-escape regression passed.                                                                                                |
| Focused GREEN                      | The five targeted unit files passed 103/103; the complete unit suite passed 1,360/1,360. Typecheck, lint, format check, and `git diff --check` passed after formatting.                                                                                                                                                                                                                                                                                                                                                       |

The SignupForm update reuses the existing localized unavailable result, status region, form layout, and design tokens. It introduces no new visual pattern, component, color, spacing, font, motion, or dependency.

The required real-render screenshot matrix was captured and reviewed against `DESIGN.md` sections 3 and 12. All eight cases passed with the existing design: [AR-RTL, EN-LTR] × [light, dark] × [390×844 mobile, 1440×900 desktop]. Screenshots are in the run's OS temp directory `C:\Users\NEWLAP~1\AppData\Local\Temp\lifter-f11-review-deYw9T` as `{ar,en}-{light,dark}-{mobile,desktop}.png`. The screenshots show the existing unavailable message with the form retained; no visual issue was found. The existing client-accounts axe matrix also covers these locale/theme/viewport combinations.

## CodeRabbit round 1 — Storage gate startup regression

The final clean-head browser pass exposed a local Storage preflight race, followed by a runner setup gap. RED evidence: the original full e2e suite failed `client-accounts-storage.spec.ts` at the `createdBucket.error === null` assertion after the omitted local service briefly returned HTTP 500; the subsequent stable excluded-service response was HTTP 503 with `name resolution failed`. The isolated runner returned `0 passed, 0 skipped, 1 failed` because `supabase/config.toml` had no `[storage] enabled = true`, so the Storage container was never created even in the runner's Storage-enabled start.

The tests-first readiness regression initially failed because `tests/e2e/storage-readiness.ts` did not exist. Its follow-up tests failed with `expected 'retry', received 'excluded'` for a single transient 503, and `expected 'ready', received 'retry'` for the live Storage API's anonymous `400 Invalid Compact JWS` response. A source assertion also failed because local Storage was not explicitly enabled in `supabase/config.toml`. The restored design retries transient/unreachable responses; only three consecutive 503 responses classify the standard stack as intentionally excluded; the exact live anonymous response is recognized as ready; and `LOCAL_SUPABASE_STORAGE_TEST=true` prevents skips in the dedicated runner. Added `[storage] enabled = true` to local Supabase configuration while the standard stack still excludes `storage-api` explicitly. The runner verifies the enabled service, then restores the excluded stack.

GREEN: readiness units passed 4/4; the dedicated Storage runner passed exactly 1, skipped 0, failed 0, flaky 0, interrupted 0. The isolated storage e2e's ordinary-stack behavior skipped only after a stable 503; with the dedicated runner flag, unavailable Storage fails after bounded retries rather than being counted as a pass.

## CodeRabbit round 1 — final local gates

| Gate                                        |                                                              Passed | Failed / skipped | Evidence                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------: | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         |                                                                   1 |                0 | `tsc --noEmit` passed.                                                                                                                                                                                                     |
| `npm run lint`                              |                                                                   1 |                0 | ESLint passed with zero warnings.                                                                                                                                                                                          |
| `npm run format:check`                      |                                                                   1 |                0 | All matched files passed Prettier.                                                                                                                                                                                         |
| `npm test`                                  |                                                               1,365 |                0 | 60 test files passed.                                                                                                                                                                                                      |
| `npm run test:integration`                  |                                                                 867 |                0 | 25 files passed after local reset/provisioning. An initial invocation without loaded local env stopped at the harness precondition (25 setup errors, no tests); the rerun loaded ignored `.env.local` silently and passed. |
| `CI=1 npm run e2e`                          |                                                                 124 |       10 skipped | Full browser suite; the 10 existing skips are outside the local fixture gate.                                                                                                                                              |
| `scripts/test-client-accounts-storage.ps1`  |                                                                   1 |        0 skipped | Exactly 1 passed, 0 skipped/failed/flaky/interrupted.                                                                                                                                                                      |
| `npm run build:edge`                        |                                                                   1 |                0 | OpenNext production worker bundle built.                                                                                                                                                                                   |
| `node scripts/check-client-signup-edge.mjs` |                               1,446 server files + 61 client assets |                0 | Passed; test-IP override identifiers absent.                                                                                                                                                                               |
| `npm run check:secrets`                     |                                                                   1 |                0 | Secret scan exited 0.                                                                                                                                                                                                      |
| `npm run size`                              | 6,401.81 KiB web (1,331.89 KiB gzip); 2.85 KiB cron (1.25 KiB gzip) |                0 | Within 65,536 KiB limit.                                                                                                                                                                                                   |
| SC-011 timing differential                  |                                                   200 + 200 samples |                0 | 20 warm-ups per case; p=0.152416, absolute median delta 0.072 ms, exact response/header equality. This is a local regression only, not an SLA; archived collision timing remains synthetic.                                |
| `git diff --check`                          |                                                                   1 |                0 | Passed after evidence update.                                                                                                                                                                                              |

The full integration pass followed clean local `db reset` and `node tests/integration/client-accounts-provision.mjs`; the final local reset and provision also passed after all DB-using gates. Hosted Auth acceptance remains blocked by C4 and is not claimed complete.

## U6 SC-011 public duplicate timing differential

Local loopback HTTP harness calls the production `signupResult('duplicate', 'en')` mapper for both labels. Archived-state design remains deferred on ND-F5-1, so `archived-collision-synthetic` is the approved synthetic stand-in; this measures public result serialization and equality, not database branch latency. Treat the measurement as a regression detector, not a latency SLA.

- Warm-up: 20 sequential requests per label; measured trials: 200 ordinary and 200 archived stand-in, randomized and interleaved.
- Mann-Whitney U: 20498.500; two-sided p-value: 0.666656; absolute median difference: 0.043 ms.
- Thresholds: p >= 0.01 and |median difference| < 5 ms: PASS.
- Each response matched status 200, identical body bytes, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `Content-Type: application/json; charset=utf-8`.
- No account-existence detail is included in either response.

Ordinary duplicate timings (ms):

```text
13.949, 15.598, 0.604, 15.556, 15.328, 15.536, 15.739, 15.977, 15.185, 15.380, 16.103, 15.820, 15.463, 16.148, 15.084, 15.607, 15.415, 16.235, 15.532, 16.068, 14.966, 15.157, 1.064, 14.895, 15.551, 15.147, 14.932, 15.455, 15.643, 15.064, 15.717, 15.206, 0.624, 15.896, 16.840, 14.808, 15.874, 0.500, 15.099, 15.626, 13.666, 16.238, 15.212, 15.625, 15.508, 15.497, 15.084, 15.718, 14.710, 15.095, 16.220, 15.226, 15.410, 15.096, 15.833, 14.838, 15.922, 15.458, 15.473, 15.630, 15.891, 15.740, 15.150, 15.970, 15.552, 16.398, 14.739, 15.312, 1.332, 14.954, 15.642, 16.007, 15.046, 15.639, 15.587, 16.393, 15.289, 0.377, 15.254, 14.356, 14.965, 15.233, 15.712, 16.000, 14.635, 15.667, 14.632, 14.092, 0.954, 1.148, 10.634, 15.479, 14.528, 15.001, 16.358, 14.186, 15.943, 15.871, 14.420, 15.317, 15.528, 15.270, 15.121, 15.192, 14.907, 15.193, 1.764, 15.243, 16.818, 6.045, 3.202, 0.583, 15.444, 15.424, 16.273, 14.566, 15.173, 16.022, 15.433, 15.103, 16.008, 16.186, 1.069, 15.093, 16.474, 15.785, 14.610, 15.429, 15.429, 0.990, 14.673, 15.912, 15.085, 17.142, 15.524, 1.226, 14.380, 16.197, 14.859, 16.160, 14.946, 15.089, 0.912, 14.959, 15.682, 15.819, 15.543, 0.640, 15.157, 14.914, 16.152, 1.020, 13.515, 15.512, 16.094, 15.651, 14.776, 16.017, 15.565, 13.646, 16.077, 15.343, 14.292, 15.594, 15.524, 15.666, 14.987, 15.527, 15.352, 14.336, 0.914, 15.840, 15.471, 15.614, 15.589, 15.565, 15.752, 15.175, 15.443, 16.302, 15.935, 14.229, 15.565, 14.277, 15.044, 15.344, 16.437, 1.074, 12.699, 15.760, 15.308, 16.018, 14.929, 15.853, 15.724, 16.084, 15.117, 14.722, 16.524, 14.453
```

Archived collision synthetic stand-in timings (ms):

```text
15.718, 16.124, 15.869, 15.398, 14.837, 0.649, 14.337, 15.333, 15.226, 15.918, 15.160, 16.027, 15.672, 14.845, 15.545, 15.296, 14.597, 15.269, 15.835, 15.228, 16.091, 15.489, 15.143, 15.302, 15.422, 15.228, 15.601, 15.749, 15.037, 15.807, 15.317, 15.793, 0.889, 15.367, 15.262, 16.317, 0.514, 14.798, 15.142, 15.348, 15.120, 15.486, 15.746, 14.990, 15.450, 15.150, 15.222, 1.149, 15.906, 15.406, 16.746, 15.794, 15.907, 0.377, 15.107, 14.926, 14.985, 15.227, 15.752, 16.055, 16.041, 16.072, 13.781, 15.451, 15.288, 15.463, 15.050, 15.270, 15.248, 16.077, 15.571, 0.681, 15.867, 15.939, 14.709, 15.741, 16.162, 15.500, 15.122, 15.973, 15.004, 17.658, 16.002, 2.582, 1.165, 0.882, 14.740, 16.010, 15.401, 15.509, 15.300, 0.936, 14.030, 0.910, 15.116, 0.849, 15.578, 15.390, 15.467, 15.677, 15.237, 15.289, 15.367, 15.697, 16.025, 14.872, 13.957, 1.288, 0.873, 1.871, 13.566, 15.217, 14.872, 15.428, 0.919, 15.610, 15.866, 15.372, 14.732, 16.294, 16.605, 15.724, 1.775, 13.855, 15.356, 14.181, 15.377, 15.937, 16.058, 1.447, 13.262, 15.384, 15.114, 0.796, 15.498, 15.366, 16.012, 15.061, 16.147, 15.500, 14.959, 14.833, 15.855, 15.302, 16.667, 13.978, 17.005, 15.376, 15.422, 15.114, 15.474, 0.822, 1.019, 13.711, 15.259, 15.345, 16.625, 15.439, 15.566, 0.891, 15.200, 15.458, 15.161, 0.558, 15.803, 16.143, 15.560, 16.940, 14.594, 15.640, 15.781, 15.821, 15.188, 15.673, 16.245, 14.921, 16.742, 14.714, 0.834, 14.402, 15.430, 14.848, 15.069, 15.671, 15.901, 14.779, 15.378, 16.362, 0.904, 14.921, 0.890, 15.375, 15.295, 15.808, 15.113, 15.364, 15.582, 14.437, 16.145, 15.571
```

## U6 SC-011 public duplicate timing differential

Local loopback HTTP harness calls the production `signupResult('duplicate', 'en')` mapper for both labels. Archived-state design remains deferred on ND-F5-1, so `archived-collision-synthetic` is the approved synthetic stand-in; this measures public result serialization and equality, not database branch latency. Treat the measurement as a regression detector, not a latency SLA.

- Warm-up: 20 sequential requests per label; measured trials: 200 ordinary and 200 archived stand-in, randomized and interleaved.
- Mann-Whitney U: 21655.000; two-sided p-value: 0.152416; absolute median difference: 0.072 ms.
- Thresholds: p >= 0.01 and |median difference| < 5 ms: PASS.
- Each response matched status 200, identical body bytes, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `Content-Type: application/json; charset=utf-8`.
- No account-existence detail is included in either response.

Ordinary duplicate timings (ms):

```text
16.184, 14.844, 0.558, 15.811, 15.470, 15.969, 15.569, 15.233, 15.360, 14.813, 16.179, 15.669, 15.391, 15.706, 15.514, 15.453, 16.416, 14.750, 15.477, 15.098, 16.176, 15.319, 1.047, 14.203, 15.959, 14.938, 15.699, 14.434, 15.875, 15.506, 14.579, 14.861, 15.151, 16.525, 15.560, 15.409, 15.813, 15.596, 15.391, 15.211, 15.253, 15.262, 16.245, 16.351, 16.395, 15.147, 15.443, 14.830, 15.567, 15.736, 14.404, 15.342, 14.614, 15.642, 15.130, 14.783, 15.790, 15.077, 15.808, 15.766, 15.912, 15.198, 0.429, 15.328, 15.032, 15.761, 0.618, 15.057, 15.554, 16.052, 14.102, 15.305, 0.627, 14.853, 15.731, 15.337, 15.553, 16.111, 15.188, 14.719, 15.932, 15.302, 15.697, 15.354, 16.503, 15.206, 15.875, 15.666, 15.953, 15.076, 15.746, 15.576, 15.158, 0.739, 16.521, 0.928, 14.479, 14.844, 15.171, 15.263, 16.159, 15.381, 0.663, 1.865, 1.805, 15.068, 15.488, 15.184, 15.901, 15.681, 16.013, 14.658, 15.051, 16.183, 15.075, 15.292, 15.483, 15.038, 15.394, 0.400, 14.847, 15.007, 15.320, 15.010, 15.316, 15.525, 15.082, 15.662, 15.583, 15.772, 15.282, 15.623, 16.363, 15.873, 15.164, 16.056, 15.605, 16.072, 15.082, 16.065, 14.836, 15.887, 15.275, 15.157, 16.314, 14.818, 15.395, 16.002, 16.134, 15.492, 15.688, 16.172, 15.926, 15.771, 15.585, 16.183, 15.108, 15.382, 16.064, 15.543, 15.645, 16.297, 15.953, 15.679, 15.134, 14.892, 15.630, 16.027, 15.277, 15.185, 15.647, 14.968, 14.973, 15.078, 15.571, 14.884, 15.740, 15.491, 14.658, 15.555, 16.348, 15.041, 15.886, 16.065, 15.284, 15.692, 15.123, 15.629, 15.114, 14.983, 15.423, 14.630, 15.976, 0.662, 15.561, 15.786, 16.082, 15.868, 15.806, 15.990
```

Archived collision synthetic stand-in timings (ms):

```text
1.644, 13.076, 16.126, 15.390, 15.122, 15.105, 14.947, 16.633, 15.225, 15.044, 15.627, 15.675, 15.162, 15.214, 15.373, 15.644, 15.101, 15.726, 15.475, 15.528, 16.059, 15.295, 0.627, 14.679, 16.014, 15.180, 16.179, 15.777, 15.012, 14.671, 15.769, 15.638, 15.275, 15.756, 0.861, 15.877, 15.565, 16.315, 15.864, 15.340, 16.282, 15.211, 15.375, 15.221, 15.496, 14.731, 16.036, 14.731, 15.410, 15.686, 16.546, 15.318, 15.798, 15.386, 16.129, 15.405, 16.680, 16.628, 15.271, 15.933, 0.905, 15.202, 15.480, 16.776, 15.759, 15.858, 15.606, 15.216, 15.140, 15.152, 15.489, 15.946, 14.748, 15.952, 15.142, 16.788, 15.543, 14.929, 15.026, 15.560, 0.541, 15.344, 15.173, 15.497, 14.758, 15.376, 15.415, 1.044, 13.932, 15.373, 15.452, 14.895, 15.768, 15.334, 15.158, 16.318, 15.407, 15.141, 15.135, 15.219, 15.063, 14.901, 15.040, 15.895, 15.202, 15.301, 15.091, 14.667, 15.415, 15.476, 15.426, 16.624, 15.455, 15.669, 15.574, 1.041, 10.008, 15.750, 14.746, 0.431, 0.428, 15.399, 14.851, 15.430, 14.853, 15.568, 15.209, 16.338, 0.468, 14.805, 15.565, 15.540, 15.350, 15.071, 15.193, 14.679, 14.541, 15.326, 16.057, 14.875, 15.318, 15.415, 15.539, 14.909, 14.344, 15.652, 15.514, 15.494, 15.555, 15.489, 14.781, 14.915, 15.580, 0.400, 15.685, 15.460, 15.062, 15.865, 14.939, 16.121, 15.547, 15.365, 15.984, 15.120, 15.518, 15.208, 15.659, 15.004, 0.411, 15.833, 15.635, 15.452, 14.774, 15.313, 0.319, 15.928, 14.954, 15.628, 15.377, 15.979, 15.739, 15.345, 15.164, 15.396, 15.829, 15.284, 15.067, 15.619, 14.873, 15.612, 15.494, 16.717, 15.836, 14.616, 15.937, 15.046, 15.985, 14.599, 14.620, 15.126
```

## CodeRabbit round 2: executable DOCKER_BIN and CI timeout note

- `scripts/test-client-accounts-storage.ps1`: when `$env:DOCKER_BIN` resolves to an existing file, the runner prepends its parent directory; directory values remain supported, followed by the standard Docker Desktop fallbacks. The existing script unit test was extended to assert both code paths.
- RED: `npm test -- tests/unit/client-accounts-storage-result.test.ts` failed in `uses portable Docker path fallbacks only when docker is absent from PATH` at the leaf-path assertion: expected `Test-Path -LiteralPath $env:DOCKER_BIN -PathType Leaf`, absent in the original script (2 passed, 1 failed).
- GREEN: the same focused command passed 3/3 after the change. The real isolated Storage runner passed exactly 1, skipped 0, failed 0, flaky 0, interrupted 0.
- CI run 40781253931's initial push attempt timed out in `client-accounts-recovery.test.ts` test `%s can reset a pending client password without changing approval or access`; its failed-job rerun passed, as did the PR-event run on the same SHA. `vitest.integration.config.ts` sets a shared 30,000 ms test timeout and 60,000 ms hook timeout; the timed-out test has no local override and the complete CI integration job took 4m16s. It performs several sequential local GoTrue recovery calls. Review found no deterministic blocking cause; recorded as an observed CI flake, without changing the test or its assertions.

## Hardening H1 - recovery flake

- CI failure evidence: run 40792530137 reported the PO reset case timing out at 30,007 ms; the recovery file took 43,923 ms and the following WO variant took 9,074 ms. The failed-attempt log has no per-call timing. Run 40781253931's failed-attempt log was no longer available from `gh run view --log-failed` after the failed-job rerun passed.
- Before fix, the complete recovery file passed 15/15 consecutive local runs at 7.08-8.50 s per file. The PO workflow measured 1,253 ms in a focused run; maximum individual steps across those runs were 528 ms for either HTTP scan and 258 ms for either RLS probe.
- Before fix, two clean-order full integration runs passed 867/867 in 157.94 s and 152.66 s. On the first full run, cold full-catalog checks were slower: RLS probes peaked at 2,679.5 ms per workspace and HTTP scans at 2,456.5 ms per workspace; the second run's corresponding peaks were 493.3 ms and 700.6 ms. These phases account for most of the scenario's variable work. Historical CI logs contain no step timing, so a particular hung request, lock, or rate-limit cause was not observed.
- Fix: keep the PO password-reset, row-integrity, old/new password, claims, actor, and app-authorization assertions together; run the unchanged two safe-column RLS probes in a following test and the unchanged two HTTP access probes in another. Shared in-memory authenticated client and claims carry the exact recovered session across these ordered tests. The WO journey remains intact. No assertions were removed, weakened, skipped, or caught-and-ignored.
- After fix, the recovery file passed 20/20 consecutive runs (13 tests per file), 7.19-8.55 s per file. PO phase maxima were 380 ms (password-reset/app checks), 539 ms (both RLS probes), and 1,073 ms (both HTTP probes); each phase has its own configured 30-second test timeout.
- Full-suite GREEN after the split: clean Stack A reset plus provision, then 25 files / 869 tests passed in 155.07 s.

## Hardening H2 - local-stack Playwright lane

- `.github/workflows/ci.yml` now runs Playwright once in `integration`, after the integration suite and while the local Supabase environment is exported. It installs Chromium there, opts into `LOCAL_SUPABASE_PROVIDER_FAULT_TEST=true`, and removes only the stack-less Playwright invocation from `validate`; the other validation steps and job permissions remain.
- The fault-injection test stops `supabase_kong_lifter`. Its Docker Compose project label is `lifter`, matching `supabase/config.toml` project_id. The full e2e run uses one worker so no unrelated browser test issues requests while that shared local gateway is deliberately stopped. This retains all checks and prevents the fault test from disrupting parallel browser cases.
- Local parallel-worker diagnosis: with the provider-fault opt-in, two full runs produced 123 passed / 9 skipped / 2 failed and 124 passed / 9 skipped / 1 failed. The failures included an a11y focus timeout and the F10 packages workspace-switch stale-status assertion; failed cases passed when rerun alone. With one worker and a clean Stack A reset/provision, the same full suite passed 125 / 125, 0 failed, 9 skipped.
- The 9 expected skips are exactly: four mobile bottom-bar assertions run only in the Pixel 7 `mobile-chromium` project (they skip in desktop Chromium); four desktop rail/showcase assertions run only in `chromium` (they skip in `mobile-chromium`); and the pending-client Storage JWT test, because the standard Stack A profile excludes `storage-api`. The Storage assertion passes separately in the isolated Storage runner; the CI Storage lane arrives with F14 FR-017/U09.
- Final local gates on this change: typecheck, lint, format check, and diff check passed; unit suite passed 61 files / 1,366 tests; after clean local reset and Vault provision, integration passed 25 files / 869 tests in 142.85 s. CI-equivalent local Playwright was run after a clean reset/provision with provider-fault opt-in and `--workers=1`: 125 passed, 9 skipped, 0 failed.
