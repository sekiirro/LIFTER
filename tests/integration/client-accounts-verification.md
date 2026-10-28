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
