# T047 / T045 / T046 security verification

Session 12 continuation, 2026-10-29. Base/pushed start: `852002b`. Local RED-only `b87ad97` was absent from HEAD when this work resumed; `s12-red-backup` retains `33fd95a`. All implementation remains on `014-workspace-branding` in LFTR-014. The architect accepted T044 before this run.

## Scope and boundaries

Three forward-only migrations implement the requested security units:

| Unit | Migration                                              | Resulting behavior                                                                                                                                     |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T047 | `20261102120000_workspace_branding_identities.sql`     | Restricted no-login/no-bypass roles, hash-only enabled/expiring credential registry, operator-managed lifecycle and immutable feature-owned events     |
| T045 | `20261102121000_workspace_branding_render_handles.sql` | Hash-only random render handles bound to link/workspace/current version with TTL, concurrency/rate caps and bounded cleanup; narrow F10 open extension |
| T046 | `20261102122000_workspace_branding_asset_resolve.sql`  | Metadata resolver and live context predicate; exact-object authenticated-download-only Storage policy                                                  |

The timestamps follow the architect's `20261102*` allocation and do not modify the F12-owned `20261101*` range. Existing committed migrations were not edited. `lib/auth/capabilities.ts`, `role_has_capability`, `has_workspace_access`, and `audit_row_change()` were not changed. The catalog test inventories new functions without weakening existing ownership/grant checks. There is no new PO-facing management API; operator-only operations use the database operator. Existing workspace rows are required by composite/FK constraints and explicit workspace joins.

Private publication/version/current-pointer/asset tables are read-side foundations for handle binding and resolution, with no API write grants. Test postgres fixtures populate them. This is not an implementation of publication, authoritative image validation, promotion receipts, owner capability parity or GC. `branding_validator` receives no validated-object write grant in this unit; T049 remains pending. No unvalidated production image is made public. Service-role is used only for synthetic staff/object fixture setup and object cleanup; the object reads being verified use restricted JWTs.

## RED first and GREEN

Before migration implementation, the three new integration files failed: **3 failed files; 4 failed tests and 9 setup-blocked/skipped tests**. T047 failed on missing roles/registry functions/Worker credential reader; T045 and T046 setup failed on the missing publication relation. This RED run is in ignored `tmp/stack-b-audit/security-units/red.log`; the skips were failed setup, not accepted Storage skips.

Before parser/transport implementation, the focused unit run failed: **2 failed files; 1 failed test / 18 passed**, with the metadata reader module missing and the new optional-handle parser case failing. The implementation then passed focused unit checks and the full unit suite.

First integration GREEN: **3 files / 13 tests**. After strengthening cross-workspace, current-publication, deadline, privilege, cleanup and independent rate/operation oracles, the final scoped command included all three new files plus `rls-catalog.test.ts`: **4 files / 53 tests passed, 0 failed, 0 skipped**. The three feature files comprise **5 credential, 5 handle and 9 resolution tests**.

The first full run found **909 passed / 2 failed / 2 skipped (913 total)**. The unchanged F10 microsecond-open regression caught the extension's use of statement time instead of F10's transaction `now()`; that extension now preserves the original transaction clock. Image authorization continues to use the current statement clock. The other failure caught host/DB clock mixing in the credential fixture's registry-vs-JWT expiry comparison; the fixture now obtains one exact second from the DB clock and uses that same expiry for registration and external signing. Registry expiry enforcement was retained. B was reset and provisioned again after these corrections.

## Inventory and grants

The inventory query printed nine functions, all `SECURITY DEFINER`, owner `postgres`, `search_path=''`. EXECUTE is revoked from PUBLIC, anon, authenticated, service_role and the restricted roles before the following narrow grants. Operator-only means no API-role EXECUTE grant, with owner execution retained.

| Function                                                            | Granted API execution                              |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `app_private.branding_credential_register(text,text,timestamptz)`   | None; operator only                                |
| `app_private.branding_credential_set_enabled(text,boolean,boolean)` | None; operator only                                |
| `app_private.branding_credential_event_immutable()`                 | None; trigger only                                 |
| `app_private.branding_credential_allowed(text)`                     | branding_proxy, branding_validator                 |
| `app_private.branding_render_handles_cleanup(integer)`              | None; operator only                                |
| `app_private.branding_asset_context(text,text,text)`                | None; internal definer call only                   |
| `public.registration_link_open(text)`                               | anon, authenticated (existing F10 grants retained) |
| `public.registration_brand_asset_resolve(text,text,text)`           | branding_proxy only                                |
| `app_private.branding_storage_read_allowed(text,text)`              | branding_proxy only                                |

Both identity roles have NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOINHERIT, NOCREATEDB and NOCREATEROLE, and no memberships of their own. The gateway authenticator is granted the ability to switch to them. A role-drift guard rejects existing overprivileged roles instead of silently accepting them; role creation tolerates an already-correct cluster-global role surviving a local DB reset.

`branding_proxy` has schema usage and SELECT on `storage.objects`, constrained by `branding_proxy_object_read`; it has no object DML grants. `branding_validator` has schema usage and the credential-check helper only. Neither has direct grants on new private tables or unrelated application tables. The policy inventory printed exactly `{branding_proxy}`, SELECT.

A catalog scan of table/view privileges across public, app_private, auth, storage and vault printed **0 unexpected table grants for each identity**, excluding only the proxy's intentional storage.objects SELECT. Both role flag rows printed false for LOGIN/SUPERUSER/BYPASSRLS/INHERIT/CREATEDB/CREATEROLE.

All six new tables printed both RLS and FORCE RLS true: `branding_credentials`, `branding_credential_events`, `branding_published_versions`, `branding_current_publications`, `branding_render_handles`, `branding_published_assets`. API roles have no direct table access. Audit rows reject UPDATE/DELETE/TRUNCATE even in the operator test. Events contain credential-ID hashes, identity kind, action, timestamp and operator role; no JWT, visitor token, render handle, image bytes or object path is written to that audit table.

## Credential operation and signer placement

`scripts/branding/issue-credential.mjs` is external operator tooling, not imported by app/lib/Workers. It returns an expiring HS256 restricted JWT in memory for a trusted operator secret-store consumer; it never prints, saves or deploys a JWT. Tests actually use this issuer with the selected local secret in their process. Intentionally invalid JWTs are signed only in the test process. No secret or generated JWT is printed or written to disk by these tests.

`lib/branding/credentials.ts` reads only externally issued `BRANDING_PROXY_JWT` and `BRANDING_VALIDATOR_JWT`. A source scan for `JWT_SECRET`, the issuer import and `createHmac` under lib/branding and Workers returned no matches. There is no signer or service-role fallback in `lib/branding/public-read.ts`.

Registration creates a disabled credential row containing only the SHA-256 of the canonical 32-byte random ID. Operator rotation is register disabled → mint externally → enable → deploy → disable predecessor. Emergency disable appends an event atomically. Tests prove predecessor rejection, replacement success, unknown/expired/role-mismatched IDs and registry expiry rejection. Both RPC and Storage recheck enabled state independently on subsequent statements. JWT expiry cannot exceed registry expiry.

## Caps and live authorization

**ARCHITECT-PROPOSED pending PO confirmation, not a new PO decision:** 32 random bytes per handle, 43 canonical base64url characters; TTL at most **5 minutes**, never after F10's existing effective deadline; **8 active handles/link**; **30 issuances/link per rolling 5 minutes**. The link row serializes concurrent issuance. At a cap, F10 remains valid and returns its ordinary name projection without another handle. Recent expired rows retain rate history. Per-open cleanup removes at most 30 old expired rows for that link; operator global cleanup defaults to 100 and accepts 1–500 rows, using a bounded ordered SKIP LOCKED batch. The count test independently expires active handles so the active cap cannot hide a missing rate cap.

The resolver and policy check the signed enabled credential, canonical visitor token and render handle, hash binding, actual workspace, live F10 expiry/grace/consumption, unexpired handle, current version, slot and exact derived validated object. The policy separately checks `storage.object.get_authenticated`, GET and the exact authenticated object route. Raw caller workspace/version/path assertions are never trusted. No image function updates opened_at or extends grace; tests compare timestamps before/after and exercise live grace, expiry and consumption. Handles do not retain old versions through an FK. A replaced pointer invalidates the old handle; metadata is not a byte cache.

Authorization is at each database statement snapshot. A subsequent committed consumption, disable or publication invalidates subsequent RPC/Storage reads. Already-authorized in-flight bytes cannot be recalled; T048 must implement buffering/final recheck before emission. Full hosted compatibility, route/privacy/cache/range controls, writer validation, receipts, GC and capability/audit matrix work remain with their existing gates.

## Disposable mutation evidence

Each mutation changed only the live B function definition, ran one targeted assertion, then restored `pg_get_functiondef()` in `finally`. No migration source was mutated for these probes. A final B reset reapplied the original migrations and provisioning afterward. Every row below printed exit 1 and an AssertionError; all other tests were explicitly out of scope for that narrow mutation command.

| Mutation                                                 | Owning oracle                          | Observed failure               |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------ |
| Remove registry enabled predicate                        | Q-M27 credential rotation              | 1 failed; 4 untargeted skipped |
| Raise active cap from 8 to 8000                          | T045 concurrent opens                  | 1 failed; 4 untargeted skipped |
| Raise issuance cap from 30 to 30000                      | T045 independent rate history          | 1 failed; 4 untargeted skipped |
| Remove live F10 validity predicate                       | Q-M23 consumption/deadline             | 1 failed; 7 untargeted skipped |
| Ignore current-version binding and use old handle assets | Q-M24 publication replacement          | 1 failed; 7 untargeted skipped |
| Remove exact-object comparison                           | Q-M22 real foreign object              | 1 failed; 7 untargeted skipped |
| Remove operation comparison                              | Q-M26 otherwise-valid database context | 1 failed; 7 untargeted skipped |

Additional positive/negative controls cover Q-M21 authority combinations, Q-M22 real foreign objects with positive controls in both scopes, Q-M23 live grace/expiry/consumption, Q-M25 list/sign denial, and Q-M27 immediate disable at both RPC and Storage. The Q-M26 database mutation oracle isolates the operation predicate with otherwise-matching path/method/context; T044 separately supplies the actual pinned Storage request/operation propagation proof, including its manually executed enabled-transform run. This run did not alter B's committed disabled-transform profile.

## Gates and isolation

All Supabase lifecycle/reset commands used CLI 2.122.0 from this worktree's verified `supabase-stack-b` workdir with project `lifter-stack-b`; provision/integration selected `LIFTER_SUPABASE_STACK=b`. Migrations use this worktree's own junction. B was reset and provisioned after mutation restoration and before the final scoped/full run. The profile diff is empty. Required CI jobs use the root Supabase profile, which mirrors Stack B except for project identity and ports; local verification uses Stack B. The existing Playwright gateway-fault target now derives the selected container instead of hard-coding A. No local e2e fault was executed and no CI-run success is claimed from these local checks.

The initial resume snapshot was stable through the pre-reset quiet check. Later A snapshots changed: DB `dbe1f29cdbd3` → `fd0fe4597d01` → `0f0bbfa811d4` → `f84c2c134008`; Auth ID `319bbd546183` remained but its StartedAt changed. REST `39279fcc6db5`, Mailpit `4b630ed5147f` and Kong `41ff4e61dfae` were unchanged at those comparisons. The first full-run snapshot comparison printed True; the corrected full-run comparison printed False. Read-only process checks for command lines containing both LFTR-012 and supabase printed no matching processes (count 0 before/after the first full and after the corrected full). This does not establish the cause or actor of those changes. No A logs/exec/stop/start/reset command was issued; no other worktree's git or files were changed. Unchanged-state isolation across the complete run cannot be claimed.

Final gates on the publishable state, without the local T011/T012 RED tip:

| Gate                                                       | Observed result                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                        | Exit 0                                                                                                        |
| `npm run lint`                                             | Exit 0                                                                                                        |
| `npm run format:check`                                     | Exit 0                                                                                                        |
| `npm test`                                                 | Exit 0; 68 files / 1,404 passed                                                                               |
| Scoped B security + catalog + unchanged F10 open suites    | Exit 0; 5 files / 61 passed, no failed/skipped tests                                                          |
| Full `npm run test:integration` on B after reset/provision | Exit 0; 30 passed files / 1 skipped file; 911 passed / 0 failed / 2 skipped tests (913 total), 159.39 seconds |
| `git diff --check`                                         | Exit 0                                                                                                        |
| Committed B profile diff                                   | Exit 0                                                                                                        |

The two full-suite skips are the existing opt-in SC-011 timing measurement and T044's explicitly labelled enabled-transform proof on the committed disabled-transform profile. The latter was manually executed successfully in the accepted earlier T044 run; no new security-unit case is skipped. No file was excluded. No hosted/CI/e2e success is inferred from this local integration run.

T047, T045 and T046 are ticked. T005/T008/T022/T051 capability/matrix/audit work remains pending per the architect, as do T048 privacy/delivery, T049 validation receipts and T050 GC/writer integration. The proposed handle caps remain pending PO confirmation. All six B containers were running at the final check; all five with configured health checks were healthy. B is left running and its config is unchanged.
