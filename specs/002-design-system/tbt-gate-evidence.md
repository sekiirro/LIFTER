# T046 / SC-008 paired TBT gate evidence

**STATUS: NOT RUN — NEEDS-STACK.** This file records a blocked attempt, not a
measurement. T046 stays unchecked and SC-008 stays `PARTIAL` in
`tasks.md`/`traceability.md`. No threshold, sample count or measurement method
was changed.

## What the task requires

- Task `specs/002-design-system/tasks.md:88` — T046 [US6]: "Reproduce the
  approved paired TBT gate (15 interleaved samples per arm, desktop and mobile)
  and attach the evidence report to this feature. The merged PR description
  reports passing medians, but the run output is not in this checkout; no
  performance test was run during this static reconciliation. SC: SC-008."
- Requirement `specs/002-design-system/spec.md:214` — SC-008: "Across 15
  interleaved paired TBT samples per arm, the median desktop and mobile TBT
  difference for the Glass change is no greater than +50 ms versus baseline.
  [S21-PO-6; PR #28 body]"

Both arms (pre-Glass baseline and Glass) are required, on desktop and mobile:
four measurement passes in total.

## Approved method (already in the repo; not redefined here)

`scripts/perf/glass-tbt-ab.mjs` — the harness merged with the Glass work. Its
fixed protocol:

| Parameter       | Value                                                                                                                                              | Harness line   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Arms            | pre-Glass baseline checkout (`GLASS_BEFORE_ROOT`) vs this checkout                                                                                 | 12-17          |
| Servers         | two production servers, `next start` (no dev mode)                                                                                                 | 74-98          |
| Ports           | before `127.0.0.1:4356`, after `127.0.0.1:4355`; anything else rejected, 3300 forbidden                                                            | 22-23, 43-46   |
| Route measured  | `/registration-links` (hard-coded)                                                                                                                 | 24             |
| Order           | 2 warm-ups then 15 measured pairs per arm, strictly `B,A` interleaved                                                                              | 25-26, 513-572 |
| Load conditions | fresh browser context per load, DPR 2, CPU throttle 4x, 150 ms latency / 1.6 Mbps down / 750 kbps up 3G, `hardwareConcurrency=4`, `deviceMemory=4` | 314-332        |
| Viewports       | `desktop` 1440x900, `mobile` 390x844 (each a separate run)                                                                                         | 35-41          |
| Metric          | TBT = sum of `longtask` overrun above 50 ms inside the FCP .. FCP+5 s window; 6 s settle before collect                                            | 394-419        |
| Statistics      | per-arm median/IQR, paired difference median, seeded paired bootstrap 95% CI, 10,000 resamples                                                     | 447-488        |
| Gate            | `median(after - before) <= 50 ms`                                                                                                                  | 610-615        |

## Why it cannot run in this lane

The harness cannot start: it is hard-wired to a live Supabase **Stack B** and to
an authenticated, database-backed page. Every requirement below is a hard
`throw` or a mandatory precondition, so no part is optional and no DB-free
substitution exists without changing the approved method.

| Requirement                                                                                                                                                                                    | Harness source   | Could this lane satisfy it?                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `GLASS_BEFORE_ROOT` baseline checkout + its own `npm run build`                                                                                                                                | 15-17            | Not the blocker (a baseline worktree could be built)                                        |
| `next start` production servers on exactly 4356/4355                                                                                                                                           | 22-23, 43-46     | Only inside the harness protocol                                                            |
| `DB_URL`, `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` mandatory                                                                                                                                  | 47-55            | **No** — requires a running Supabase stack                                                  |
| Loopback-only Stack B endpoints: API `127.0.0.1:25421`, Postgres `127.0.0.1:25422/postgres`                                                                                                    | 56-68            | **No** — Stack B is another lane's / spare stack; this lane may not start or borrow a stack |
| Fixture discovery over the live Auth admin API (`@example.test` users), `staff_profiles`, active `workspace_memberships`, seeded `public.registration_links` rows, trainer needing >= 12 links | 100-187          | **No** — all reads go through the live stack                                                |
| Session minted and verified through the live Auth API (`generateLink` + `verifyOtp`), then replayed as cookies                                                                                 | 189-226, 289-303 | **No**                                                                                      |
| Data-visibility check as that trainer through `registration_links_safe`                                                                                                                        | 228-258          | **No**                                                                                      |
| `LIFTER_SHOWCASE` deliberately deleted from the server env, so no DB-free showcase shell                                                                                                       | 74-90            | **No** — the harness forbids the showcase path                                              |

`app/(app)/registration-links/page.tsx` calls `requireActor()` (line 21),
`notFound()` when there is no role (line 22), and `loadRegistrationLinks()`
(line 60), so without a served session and a database the measured route
redirects or 404s and `sample()` throws on the status/final-URL assertions
(lines 380-388). There is no approved alternative route, no approved DB-free
fixture and no approved relaxation of the 15-pair / 50 ms protocol.

Lane constraint: this lane's browser policy allows only
`PLAYWRIGHT_PORT=3106` and no stack work at all ("No DB stack; no Supabase stack
may be started"), while the approved harness accepts only 4355/4356 plus Stack B
on 25421/25422. Running it would require both a new stack and a new port
assignment, i.e. a different method.

## Load note

`Win32_Processor.LoadPercentage` read immediately before the attempt: **47 %**
(other lanes building concurrently in the same session). Load is recorded for
completeness only; it is not the blocker — the missing stack is. No measurement
was produced, so no load caveat applies to any number in this file.

## Reproduce it in a stack-backed lane (unchanged approved method)

1. Create the baseline checkout and build both arms:
   `git worktree add <baseline> 24694ffb731ae7e75c4ca5dcbae6ceb923fb1404`
   (`24694ffb` is the first parent of the PR #28 merge `ed88574a`), then
   `npm ci && npm run build` in `<baseline>` and in the tested checkout.
2. Start the stack through the safe wrapper only, then export
   `DB_URL=postgresql://postgres:postgres@127.0.0.1:25422/postgres`,
   `API_URL=http://127.0.0.1:25421`, `ANON_KEY`, `SERVICE_ROLE_KEY` from that
   stack (never printed).
3. Seed/confirm an existing `@example.test` trainer with a workspace holding at
   least 12 `public.registration_links` rows (the harness reuses existing rows
   and adds none).
4. `GLASS_BEFORE_ROOT=<baseline> node scripts/perf/glass-tbt-ab.mjs --viewport=desktop`
   then the same with `--viewport=mobile`. Do not set `GLASS_SAMPLES`,
   `GLASS_WARMUPS`, `GLASS_VIEWPORT` or the URLs — the defaults are the approved
   protocol.
5. Attach both `metrics-<viewport>.json` outputs (raw samples, medians, IQR,
   paired CI95) to this feature. Tick T046 and the traceability row only if
   **both** viewport medians are `<= 50 ms`.

## Environment

- Target head: `5f997301b29376f092186138d5f61dcdffa3ab58` (`origin/main`,
  1 commit ahead of the brief's minimum `eebc9dca05311333afa5e5286b1d83b5f66b44f7`).
- Node `v24.19.0`, npm `11.17.0`, Windows (win32), host load 47 % at attempt.
- Harness dependencies are the pinned repo deps (`@playwright/test`,
  `postgres`, `@supabase/supabase-js`, `@supabase/ssr`); the browser step never
  ran, so no Playwright browser build was exercised.
- Nothing was installed, no stack was started, no server was bound to a port.

## Prior report (context only, not evidence)

PR #28's body reports desktop `-4 ms [-22, +6]` and mobile `-3 ms [-12, +6]`
paired medians from 15 interleaved samples per arm (verified by reading
`gh pr view 28`). That is a prose summary written by the original lane: no raw
`metrics-*.json` is committed anywhere on `origin/main`
(`git ls-tree -r --name-only origin/main` matches only
`scripts/perf/glass-tbt-ab.mjs`), so it cannot be re-derived and is **not** a
substitute for the gate run.

## Conclusion

- Gate result: **not measured — NEEDS-STACK** (live Supabase Stack B plus an
  authenticated `/registration-links` session, neither permitted in this lane).
- T046: remains `[ ]`. SC-008: remains `PARTIAL`. Traceability untouched.
- No threshold, sample count, port or protocol was invented or relaxed.
