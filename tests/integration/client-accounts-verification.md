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

The following are explicit `it.todo` cases, not passing evidence:

- `[U3/T012 U5/T020 staged RED] public signup RPC exact anon/authenticated-only EXECUTE`.
- `[U5/T020] narrow 30-day purge removes only old attempts and preserves audit`.
- `[U4/T029] Storage pending real-JWT read/write denial: storage-api excluded`.

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
