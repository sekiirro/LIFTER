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

ND-F11-2a phone input acceptance remains open; no phone rules were implemented.
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
| `npm run format:check`                        |    1 |    0 | Repository check passed                                                               |
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

| Gate                                 | Pass | Fail | Staged | Evidence                                    |
| ------------------------------------ | ---: | ---: | -----: | ------------------------------------------- |
| `npm run typecheck`                  |    1 |    0 |      0 | Exit 0                                      |
| `npm run lint`                       |    1 |    0 |      0 | Exit 0, no warnings                         |
| `npm run format:check`               |    1 |    0 |      0 | Exit 0                                      |
| `npm test`                           | 1258 |    0 |      0 | 50 files, exit 0                            |
| `npm run test:integration`           |  678 |    0 |      3 | 19 files, final reset + provision, exit 0   |
| U2 integration files, included above |   82 |    0 |      3 | Model/security/normalization/claims/tickets |
| U2 e2e                               |    0 |    0 |      0 | No e2e spec assigned to U2                  |

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

| Gate                                                                               |                Pass | Fail | Deferred |
| ---------------------------------------------------------------------------------- | ------------------: | ---: | -------: |
| Local DB reset + provisioning                                                      |          2 commands |    0 |        0 |
| `npm run typecheck`                                                                |             1 check |    0 |        0 |
| `npm run lint`                                                                     | 1 check, 0 warnings |    0 |        0 |
| `npm run format:check`                                                             |             1 check |    0 |        0 |
| `npm test -- --reporter=json --outputFile=tmp/u4-unit.json`                        |          1299 tests |    0 |        0 |
| `npm run test:integration -- --reporter=json --outputFile=tmp/u4-integration.json` |           793 tests |    0 |  3 TODOs |
| Final U4-specific integration rerun                                                |             8 tests |    0 |        0 |
| Normal-runtime Unicode/category rerun                                              |             2 tests |    0 |        0 |

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

| Gate                                           |                Passed | Failed | Deferred |
| ---------------------------------------------- | --------------------: | -----: | -------: |
| Final local reset + provisioning               |            2 commands |      0 |        0 |
| `npm run typecheck`                            |               1 check |      0 |        0 |
| `npm run lint`                                 |   1 check, 0 warnings |      0 |        0 |
| `npm run format:check`                         |               1 check |      0 |        0 |
| `npm test`                                     | 1304 tests / 52 files |      0 |        0 |
| `npm run test:integration`                     |  842 tests / 24 files |      0 |   1 TODO |
| Focused admission/catalog/audit/RLS regression |    82 tests / 4 files |      0 |   1 TODO |

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

| Command                    |                 Passed | Failed | Pending                 |
| -------------------------- | ---------------------: | -----: | ----------------------- |
| `npm run typecheck`        |                1 check |      0 | none                    |
| `npm run lint`             |                1 check |      0 | none                    |
| `npm run format:check`     |                1 check |      0 | none                    |
| `npm test`                 | 1,308 tests / 53 files |      0 | none                    |
| `npm run test:integration` |   847 tests / 24 files |      0 | 1 existing Storage TODO |
| U5-R2 e2e                  |                    N/A |    N/A | no assigned spec        |

Integration ran after the pinned local `db reset` and
`node tests/integration/client-accounts-provision.mjs`, with local SIGNUP_* env
loaded privately for the integration process. All 26 admission tests pass,
including TS/DB shared vectors, exact +5000/+5001/-60000/-60001 millisecond
boundaries, nonce coverage, immediate/edge replay, races, limits, privacy and
rotation. Diagnostic logs were sanitized without printing credentials.

## U6 SC-011 public duplicate timing differential

Local loopback HTTP harness calls the production `signupResult('duplicate', 'en')` mapper for both labels. Archived-state design remains deferred on ND-F5-1, so `archived-collision-synthetic` is the approved synthetic stand-in; this measures public result serialization and equality, not database branch latency. Treat the measurement as a regression detector, not a latency SLA.

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

## U6 T023�T030 implementation evidence (2026-10-28)

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
| `npm run format:check`                                  |                         1 check passed |
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
| `npm run format:check`                                  |                                                                               1 check passed |
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
| `npm run format:check`                                  |                         1 check passed |
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
| `npm run format:check`                                             |                                                                                                                       1 check passed |
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
| `npm run format:check`                                                                                           |                1 check passed |
| `npm test`                                                                                                       | 59 files / 1,348 tests passed |
| Local DB reset + provision + `node tests/integration/client-accounts-provision.mjs` + `npm run test:integration` |   25 files / 859 tests passed |
| `CI=1 npm run e2e -- tests/e2e/auth.spec.ts`                                                                     |                      5 passed |

### U8-R1 architect review corrections

- RED: `npm test -- tests/unit/server-log-privacy.test.ts tests/unit/client-accounts-storage-result.test.ts` failed before implementation because both tested helpers were absent. The privacy test's synthetic raw line contains canary token/password/email values while a counts-only JSON summary contains none; the Storage test supplies the negative `1 skipped` result.
- GREEN: the scanner reported three matched canary categories and one matched raw line, while the counts-only summary reported zero hits. The e2e raw-log fixture canary passed without printing its line or values. The Storage parser classified `1 skipped` as `acceptable: false`; the isolated runner finished with `1 passed, 0 skipped, 0 failed, 0 flaky, 0 interrupted`.
- Full captured run: `CI=1 npm run e2e` passed 124 tests and skipped 10. A post-run temp-directory check found zero raw server-log files, two scrubbed summaries with `rawLogDeleted: true`, and no active path pointer. The focused client-account/accessibility pair passed 31 tests with one existing provider-fault skip.
- R1 gates: typecheck, lint, format check, 1,348 unit tests, 855 integration tests, build:edge, and the client-signup edge proof passed. Edge proof scanned 1,446 server files and 61 client assets. Storage runner passed exactly one test. Worker web size was 6,401.33 KiB / 1,331.78 KiB gzip, unchanged from the prior U8 measurement.
- No application code, migrations, dependencies, grants, RLS, seeds, capability matrix, or catalogs changed. No task IDs were ticked by R1.
