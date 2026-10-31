# Session 17 R25/R26 evidence — F14

## R25 — CI profile independence

### a. CI workflow profile

Compared `.github/workflows/ci.yml` with `origin/main`. The `integration` job has no `LIFTER_SUPABASE_STACK` setting and no Stack B `working-directory`; it uses the root `supabase/` profile. Its F14-specific additions are `LOCAL_SUPABASE_STORAGE_TEST=true` for browser coverage and keeping `imgproxy` available for the enabled image-transformation test. The separate `storage` job also starts the root profile, waits for Storage readiness, runs the unmodified provisioner, the seven F14 Storage integration files, and the F14 banner plus F11 pending-client Storage browser tests. It checks JSON reports with the zero-skip guard. No action ref was added or changed.

CI could not be run because the repository is private. Visibility was not changed.

### b. Stack-agnostic test selection

`scripts/local-stack.mjs` accepts local profiles A–D, selects an explicit `LIFTER_SUPABASE_STACK` when supplied, and otherwise infers the profile from loopback API/DB ports. Each test validates the selected endpoint against that profile before opening connections. Stack B project/port assertions run only when B is selected. F14 fixture and integration files no longer require B merely to run; the transform contract always runs and checks the selected profile’s actual transform setting. No branding suite is skipped for CI.

The Stack B credentials file remains at the repository-root `.env.stack-b` location used by the existing provisioner contract; profile generalization changes the selected profile/workdir without moving that file.

The Playwright app server receives the selected profile environment. For local browser runs it creates a short-lived `branding_proxy` test credential through the existing local credential registry and issuer, passes the bearer only in process memory, and uses no `service_role` client or Vault value. `playwright.config.ts` forwards the parent process environment to the server process.

### c. Root Storage settings

`supabase/config.toml` now has explicit root values matching Stack B for `[api]`, `[db]`, `[studio]`, `[inbucket]`, `[analytics]`, `[edge_runtime]`, and `[db.pooler]`. This makes the root CI profile’s behavior directly comparable with B; port and project identity are the only profile differences.

`[storage.image_transformation] enabled = true` was added to root and Stack B so the transform request reaches Storage RLS instead of being skipped or stopped at a disabled route. The root profile already enabled Storage. Stack B gained `[auth.email] otp_expiry = 3600`, matching the existing root setting. No global upload-size setting was added; the F14 fixtures use small images and their bucket-specific limits.

### d. Full integration runs

After the fresh B reset, both commands ran the full 55-file integration suite against Stack B’s endpoints:

| Environment shape | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| CI shape: selector absent, B endpoints autodetected | 55 | 1,217 | 0 | 1 |
| Explicit `LIFTER_SUPABASE_STACK=b` | 55 | 1,217 | 0 | 1 |

The only current skip is `tests/integration/client-accounts-timing.test.ts` — `SC-011 measures the real admitted production signup path`, which requires `SC011_TIMING_RUN=true`.

All F14 branding files matched in the two JSON reports: 15 files, 71 passed, 0 failed, 0 skipped in each run. `assert-storage-suite-zero-skips.mjs integration` accepted all seven required F14 Storage files: 37 passed, 0 failed, 0 skipped.

### e. Root/B config parity

`tests/unit/local-stack-profile-parity.test.ts` parses both TOML profiles and asserts equality after removing only these identity keys:

`root.project_id`, `api.port`, `db.port`, `db.shadow_port`, `studio.port`, `inbucket.port`, `inbucket.smtp_port`, `inbucket.pop3_port`, `analytics.port`, `edge_runtime.inspector_port`, and `db.pooler.port`.

The parity test passed in the full unit suite.

## R26 — skip inventory and guard

### Prior integration skip baseline

The accepted R3 evidence recorded two skips. Source and condition review identifies them as:

| File and test | Prior skip condition | Current result |
| --- | --- | --- |
| `tests/integration/client-accounts-timing.test.ts` — `SC-011 measures the real admitted production signup path` | `SC011_TIMING_RUN` is not `true` | Still the one skip; opt-in performance run remains disabled |
| `tests/integration/branding-storage-context.test.ts` — `enabled-profile proof: transform reaches RLS and is denied by operation alone` | The old B profile had transformations disabled; the complementary disabled-profile check ran | No longer skipped. The profile-aware test now runs on the enabled root/B profile |

The current full integration result is 1,217 passed / 0 failed / 1 skipped. No F14 Storage test is skipped.

### Prior Playwright skip baseline and current run

The accepted R3 evidence records 201 tests with 192 passed / 0 failed / 9 skipped, but does not retain the nine test names. The current full report enumerates 201 tests with 193 passed / 0 failed / 8 skipped. The eight remaining skips are project-specific shell tests:

| File and test | Skip reason |
| --- | --- |
| `tests/e2e/shell.spec.ts` — Arabic mobile trainer bottom bar | Pixel 7 assertions run only in the mobile Chromium project |
| `tests/e2e/shell.spec.ts` — Arabic mobile client bottom bar | Pixel 7 assertions run only in the mobile Chromium project |
| `tests/e2e/shell.spec.ts` — Arabic desktop trainer rail | Desktop rail assertions run only in Chromium |
| `tests/e2e/shell.spec.ts` — Arabic showcase role previews | Showcase preview assertions run only in the desktop project |
| `tests/e2e/shell.spec.ts` — English mobile trainer bottom bar | Pixel 7 assertions run only in the mobile Chromium project |
| `tests/e2e/shell.spec.ts` — English mobile client bottom bar | Pixel 7 assertions run only in the mobile Chromium project |
| `tests/e2e/shell.spec.ts` — English desktop trainer rail | Desktop rail assertions run only in Chromium |
| `tests/e2e/shell.spec.ts` — English showcase role previews | Showcase preview assertions run only in the desktop project |

The F11 pending-client Storage denial test ran in the full suite and the dedicated Storage subset. The subset contained two files and 13 passed / 0 failed / 0 skipped; the F14 loaded-banner matrix contributed 12 of those tests. All Storage cases were required and none was skipped.

### Zero-skip mutation

Changed the real F14 transform assertion in `tests/integration/branding-storage-context.test.ts` from `it` to `it.skip`, ran that Stack B file, and passed its JSON report to the guard. The report had 12 passed / 0 failed / 1 skipped; the guard rejected it with `missing=none skipped=1 failed=0 passed=12`. Restored `it` immediately. The final full integration and seven-file Storage guard passed after restoration.

## Reset, gates, and scope

- Ownership checks confirmed project `lifter-stack-b`, API 25421, DB 25422, Storage enabled, port assignments 25420–25429 (25420 is the shadow DB port), and workdir `<worktree>/supabase-stack-b` before database commands. Supabase status output was consumed in memory and never printed.
- Fresh Stack B reset: **53 migrations applied**, no errors. The unmodified `tests/integration/client-accounts-provision.mjs` ran with explicit Stack B selection; output was suppressed.
- Unit: **96 files, 1,658 passed, 0 failed**, versus 1,654 before this change.
- Full Playwright: **193 passed, 0 failed, 8 skipped**; F14 browser/axe cases all ran. The dedicated Storage browser guard passed 13/13 with zero skips.
- Lint and typecheck passed. The Playwright web-server startup ran `npm run build` successfully. `npm run size` passed: web 7,164.98 KiB uncompressed / 1,481.18 KiB gzip; cron 5.58 KiB / 1.96 KiB gzip.
- Explicit final `npm run build` also passed (Next.js production build and static generation completed).
- Prettier check passed on all touched supported files. TOML was excluded because no Prettier TOML parser is configured. `git diff --check` passed.
- `actionlint` was not installed, so it was not run.
- No migration was edited or added, no dependency was added, and no new PNG was committed.
