# T044 Storage context proof — Session 12

**Result: STOP. T044 is not accepted and remains unticked.** A transform request cannot reach RLS on the pinned B profile. No alternate credential model, stack-profile change, production migration, proxy, validator or dependent task was implemented.

## Target and versions

Explicit selector `LIFTER_SUPABASE_STACK=b`; project `lifter-stack-b`, API 25421, DB 25422. `loadEnv()` enforces the selector's loopback/port checks, and this suite rejects any selector other than B before creating a connection.

| Component    | Observed version                                                                         |
| ------------ | ---------------------------------------------------------------------------------------- |
| Supabase CLI | `npx --yes supabase@2.122.0 --version`: `2.122.0`, executed from verified B workdir      |
| Storage      | `public.ecr.aws/supabase/storage-api:v1.84.19`, container `84a3fca1cff7`                 |
| PostgreSQL   | `show server_version`: `17.11`; image `public.ecr.aws/supabase/postgres:17.11.0.006`     |
| PostgREST    | `postgrest --version`: `PostgREST 16.5`; image `public.ecr.aws/supabase/postgrest:v16.5` |
| Node/npm     | `v24.19.0` / `11.17.0`                                                                   |

## Tests first and observed results

The new file was written before establishing its policy predicate. Its initial fixture's policy function recorded context but returned false: 13 tests failed, 0 passed. The positive HTTP download returned 400 instead of 200, after its context assertions passed. The initial cleanup used `DROP OWNED BY` without the required role authority; cleanup failed and its multi-statement transaction rolled back. Explicitly dropping the named proof schema/policy and revoking the named grants removed those fixtures. Cleanup now uses explicit revokes, not `DROP OWNED BY`.

Replacing only the deny-all return with the context predicate established 11 passes and two failures. Batch signing returns per-item denial inside HTTP 200; the assertion was corrected to require an error and absence of either signed-URL property for every requested item, without logging a URL or body. Final narrow result: **12 passed, 1 failed, 0 skipped (13 tests)**. The remaining failed assertion requires actual transform RLS evaluation and is intentionally retained as a visible hard gate, not skipped or weakened to accept a router 404.

| Requirement                    | Evidence                                                                                                                                                                                                                                                                                                                                          | Status                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| a. Restricted JWT authority    | HTTP download evaluates the invoker policy with effective `current_user` equal to the signed restricted role; `request.jwt.claim.role` and signed role/subject/credential-ID claims match. Both disposable roles have LOGIN, BYPASSRLS, SUPERUSER, CREATEROLE and CREATEDB false, and no memberships of their own.                                | Proven for the probe                                       |
| b. Request/transaction context | Policy matches `request.headers` opaque proof context and request correlation ID, JSON `request.jwt.claims`, `request.method=GET`, exact `request.path`, and `storage.operation=storage.object.get_authenticated`.                                                                                                                                | Proven for the probe                                       |
| c. Download-only operation     | Exact download returns 200 and byte-identical PNG. List, sign, sign-many and all listed writes do not deliver bytes or usable signing authority. A forged operation header does not replace Storage's own operation. Transform returns 404 with zero policy evaluations because its route is disabled.                                            | **Incomplete: transform RLS discrimination unproven**      |
| d. Fail closed                 | Missing/wrong opaque context, expired token, wrong role, anon identity and a foreign-workspace path deny. List exposes no objects, batch sign produces only item errors, mutations do not change source bytes. 32 positive/missing-context pairs require actual same-backend PID reuse across fresh transaction IDs; missing context stays false. | Probe negatives pass; transform condition remains unproven |

The test grants object DML privileges to its proof roles to exercise RLS's default-deny write behavior, but creates only a SELECT policy for the reader. The wrong role has no object policy. Neither role inherits privileged memberships. The invoker probe writes only non-secret booleans, operation/method, request correlation IDs and backend/transaction IDs into its disposable observations table. It does not store JWTs, authorization headers, opaque context values or raw request headers. The private context comparison is synthetic: live F10 token/render binding, credential registry/disable and revocation are future tasks, not proven here.

Service-role is used only to create/delete the private fixture bucket and upload/remove synthetic bytes. Every HTTP object read under test uses a separately issued, expiring restricted JWT (or an intentional negative token), with the public anon key solely as the API gateway key. JWT signing occurs inside the test process using `JWT_SECRET` from selected local environment; generated bearer JWTs are never saved or printed. Production Workers receive no signer from this change.

## Exact mechanism and source verification

`git ls-remote` resolved upstream tag `v1.84.19` to **872757184c35626fef3d84f35e0b3c4fa82af1b6**. The running B image's compiled `dist/internal/database/postgres/scope.js` and `dist/http/routes/render/index.js` were copied read-only for inspection under ignored `tmp/stack-b-audit/`; their relevant behavior matches the pinned source:

- [Database plugin](https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/http/plugins/db.ts): passes JWT payload, headers, URL, method and the server's operation callback into the database connection.
- [Postgres scope](https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/internal/database/postgres/scope.ts): sets role and the request/operation GUCs using transaction-local settings. No arbitrary client-set GUC or Worker-initiated DB transaction was assumed.
- [Object GET route](https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/http/routes/object/getObject.ts): private-bucket lookup uses the caller's RLS context; authenticated object routes use the server-defined download operation. Both GET aliases share this operation, so the proof additionally restricts the request path to the authenticated alias.
- [Operation constants](https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/http/routes/operations.ts): separates authenticated get, list, sign, upload/update, delete, move/copy and image-render operations.
- [Render route registration](https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/http/routes/render/index.ts): returns before registration when image transformation is disabled. Docker inspection printed only the non-secret flag `ENABLE_IMAGE_TRANSFORMATION=false`. The attempted authenticated transform returned 404 and produced zero policy observations. [Enabled authenticated-render route](https://github.com/supabase/storage/blob/872757184c35626fef3d84f35e0b3c4fa82af1b6/src/http/routes/render/renderAuthenticatedImage.ts) names a separate operation in source, but source inspection alone cannot satisfy the runtime gate.

## Scope and limitations

This establishes the mechanism for the enabled routes, not the complete proposed production policy. Transform enforcement, hosted compatibility, enabled credential registry, live F10/render-handle binding, real workspace authorization, production definer ownership, alternate API protocols, range/cache/conditional behavior and proxy buffering/privacy require their owning later gates. There is no service-role read fallback. No production policy is inferred from a disabled endpoint. T045–T051 and T014 were not started, and capability parity remains deferred until F12 U2.

Options for architect/PO review (none implemented):

1. Authorize a revised pinned B profile with image transformation enabled and its required renderer, then rerun this unchanged transform contract. This supplies the missing local RLS proof but changes the profile and consumes additional local resources.
2. Authorize a separate isolated verification environment with transforms enabled on the same image/version, then reconcile its configuration and require local/hosted acceptance explicitly. This avoids disturbing the concurrent stacks but adds environment work; external evidence does not automatically satisfy the current Stack-B gate.
3. Defer validator/proxy acceptance until an approved environment can prove the entire contract. This preserves the approved architecture and profile, with delivery blocked. Any changed acceptance criteria remain an architect/PO decision.

## Isolation and cleanup

Stack A was inspected read-only; no command stopped/reset/exec'd into it. Its five-container snapshot (IDs and StartedAt) was identical across the initial quiet interval and after T044, B reset and B provisioning. The B reset ran only from this worktree's verified `supabase-stack-b` directory, with a migrations junction into this same worktree. The selector-aware provisioner wrote only `.env.stack-b`.

Post-probe catalog checks printed **0 proof roles, 0 proof schemas, 0 proof policies, 0 proof buckets**. JWTs and local environment files are excluded from commits. Stack B remains running.

The post-full-integration comparison printed **False**. A's database container changed from `318fc1178404` (StartedAt `2026-10-29T06:29:25.951856864Z`) to `7d0c4b2ec68f` (`2026-10-29T13:21:36.216240311Z`). A's Auth ID stayed `319bbd546183`, but StartedAt changed from `2026-10-29T06:29:43.113156516Z` to `2026-10-29T13:21:57.339829839Z`. REST `39279fcc6db5`, Mailpit `4b630ed5147f`, and Kong `41ff4e61dfae` retained their IDs and start times. This does **not** prove unchanged-state isolation across the full run; the cause of A's changes was not independently established. All commands issued in this session targeted B for lifecycle, SQL and Docker exec; the merged F11 integration/provisioner references were routed through the selector before execution. No A restoration was attempted.

The final verbose narrow probe ran in the same command batch after the changed comparison was printed; the batch lacked a throwing guard at that checkpoint. It completed cleanup and again reported 12 passes / 1 failure. Further DB/Storage work stopped after inspecting the mismatch. Earlier reset/provision checkpoints did have throwing guards. This sequencing limitation is recorded rather than claiming the stop procedure was perfect.

## Observed operation matrix

Final verbose probe (`--silent=false --reporter=verbose`) printed:

| Request                                | HTTP status | Retained SELECT-policy observations   | Outcome                                                      |
| -------------------------------------- | ----------- | ------------------------------------- | ------------------------------------------------------------ |
| Authenticated download                 | 200         | 1, `storage.object.get_authenticated` | All role/claim/header/path checks true, exact bytes returned |
| List                                   | 200         | 2, `storage.object.list`              | Empty list                                                   |
| Sign                                   | 400         | 1, `storage.object.sign`              | Denied                                                       |
| Sign-many                              | 200         | 1, `storage.object.sign_many`         | Every item denied; no signed URL                             |
| Transform                              | 404         | 0                                     | **RLS distinction unproven**                                 |
| Upload / update / single delete / move | 400 each    | 0 each                                | Denied; source-byte positive control passes                  |
| Delete-many                            | 200         | 0                                     | Empty result; source survives                                |
| Copy                                   | 400         | 1, `storage.object.copy`              | Denied; source survives                                      |

Pooled reuse printed `{ reused: true, observedBackends: 1, pairs: 32 }`. The probe compares actual transaction IDs internally and emits only this aggregate. Zero retained observations for writes do not establish those write-operation GUC values; the write-denial and source-preservation assertions still pass. No enabled transform RLS observation exists.

## Final gates on the publishable state

| Command                                                | Observed result                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                               | Exit 0; 669 packages added, 670 audited; npm reported 4 high vulnerabilities                                   |
| `npm run typecheck`                                    | Exit 0                                                                                                         |
| `npm run lint`                                         | Exit 0                                                                                                         |
| `npm run format:check`                                 | Exit 0                                                                                                         |
| `npm test`                                             | Exit 0; 67 files, 1,401 tests passed; nothing excluded                                                         |
| `npx vitest run tests/unit/second-local-stack.test.ts` | Exit 0; 1 file, 5 tests passed                                                                                 |
| New T044 file on B                                     | Exit 1; 12 passed, 1 failed, 0 skipped                                                                         |
| `npm run test:integration` on B                        | Exit 1; 26 files passed, 1 failed, 1 skipped; 891 tests passed, 1 failed, 1 skipped, 893 total; 190.91 seconds |
| `git diff --check`                                     | Exit 0                                                                                                         |

The existing skipped file is `client-accounts-timing.test.ts`, whose `it.skipIf(process.env.SC011_TIMING_RUN !== 'true')` guards the SC-011 measurement. The command excluded no files and did not enable that opt-in measurement. The sole failure is the T044 transform contract; no Storage test was skipped. Earlier gate attempts before dependency installation finished failed for missing binaries; after installation, a typecheck attempt also included downloaded upstream `.ts` scratch sources. Those scratch files were renamed `.txt`, then typecheck passed without changing project checks. These failed attempts are not counted as green gates.

No task checkbox was added. T044 and its dependent acceptance remain blocked; T022's final F11 body prerequisite is documented without implementing T022. The publishable history excludes the local T011/T012 RED commit, which is retained on `s12-red-backup` and reapplied locally only after pushing evidence.
