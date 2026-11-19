# T046 / SC-008 paired TBT gate evidence

**STATUS: RUN COMPLETE — GATE PASSED on both viewports.** The approved paired
TBT gate was executed with the approved harness, unchanged: desktop paired
median **+5 ms** (bootstrap CI95 [-8, +10]), mobile paired median **-6 ms**
(CI95 [-15, +32]); the SC-008 gate is `median(after - before) <= +50 ms`, so
both viewports pass. T046 is ticked and SC-008 is `VERIFIED` in
`traceability.md`. No threshold, sample count, port, route or protocol value
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

## Approved method (run unchanged)

`scripts/perf/glass-tbt-ab.mjs`, exactly as merged with the Glass work:

| Parameter       | Value                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arms            | pre-Glass baseline checkout (`GLASS_BEFORE_ROOT`) vs this checkout                                                                                 |
| Servers         | two production servers, `next start` (no dev mode)                                                                                                 |
| Ports           | before `127.0.0.1:4356`, after `127.0.0.1:4355`; anything else rejected, 3300 forbidden                                                            |
| Route measured  | `/registration-links` (hard-coded)                                                                                                                 |
| Order           | 2 warm-ups then 15 measured pairs per arm, strictly `B,A` interleaved                                                                              |
| Load conditions | fresh browser context per load, DPR 2, CPU throttle 4x, 150 ms latency / 1.6 Mbps down / 750 kbps up 3G, `hardwareConcurrency=4`, `deviceMemory=4` |
| Viewports       | `desktop` 1440x900, `mobile` 390x844 (each a separate run)                                                                                         |
| Metric          | TBT = sum of `longtask` overrun above 50 ms inside the FCP .. FCP+5 s window; 6 s settle before collect                                            |
| Statistics      | per-arm median/IQR, paired difference median, seeded paired bootstrap 95% CI, 10,000 resamples                                                     |
| Gate            | `median(after - before) <= 50 ms`                                                                                                                  |

## The run (2026-11-19, lane s67-glm-t046)

- **Tested after arm:** `8f395e15a9768a5698ec329686e7c6a8ed15bc70` (branch
  `s67-002-t046-run`, == PR #282 head; `origin/main 5f997301` + the
  NEEDS-STACK evidence commit). Production `npm run build` executed in both
  arms before the run.
- **Baseline (before) arm:** worktree at `24694ffb731ae7e75c4ca5dcbae6ceb923fb1404`
  (the first parent of the PR #28 merge `ed88574a`), per the reproduction steps
  recorded in the NEEDS-STACK version of this file.
- **Stack B** (loopback API `127.0.0.1:25421`, Postgres `127.0.0.1:25422`),
  reached only through the safe wrapper: safe `db reset --local` (all 338
  migrations at the tested head), `tests/integration/client-accounts-provision.mjs`
  provisioning, and the seeded trainer fixture. The harness then reused the
  existing `@example.test` trainer (workspace `e36ff133-d41e-41b6-a1e6-a76ff6e324eb`,
  12 seeded `registration_links`), added no fixture rows, minted the session
  through live Auth `generateLink`/`verifyOtp`, and verified data visibility
  through `registration_links_safe`.
- **Servers:** spawned by the harness (`next start`), before on 4356 / after on
  4355, with `LIFTER_SHOWCASE` deleted from the server env, so both arms served
  the authenticated, database-backed route.
- **CPU load** (`Win32_Processor.LoadPercentage`): **8 %** immediately before
  the desktop run, **4 %** before the mobile run (mid-run sample 22 %,
  post-run 28 %).
- **Tools:** Node `v24.19.0`, npm `11.17.0`, `@playwright/test` `1.64.1`
  (chromium build 1248), Supabase CLI `2.122.0`, Windows (win32).
- Commands: `GLASS_BEFORE_ROOT=<baseline> node scripts/perf/glass-tbt-ab.mjs --viewport=desktop`
  and the same with `--viewport=mobile`; no other env override set
  (`GLASS_SAMPLES`, `GLASS_WARMUPS`, `GLASS_VIEWPORT`, URLs all left at the
  approved defaults).

## Raw samples — desktop (1440x900, measured pairs only)

| pair | arm    | fcpMs | lcpMs | cls    | tbtMs | runtime |
| ---- | ------ | ----- | ----- | ------ | ----- | ------- |
| 1    | before | 1160  | 1160  | 0.0004 | 129   | -       |
| 1    | after  | 1704  | 1704  | 0.0004 | 207   | static  |
| 2    | before | 1140  | 1140  | 0.0004 | 169   | -       |
| 2    | after  | 1668  | 1668  | 0.0004 | 112   | static  |
| 3    | before | 924   | 924   | 0.0004 | 98    | -       |
| 3    | after  | 1672  | 1672  | 0.0004 | 108   | static  |
| 4    | before | 924   | 924   | 0.0004 | 102   | -       |
| 4    | after  | 1632  | 1632  | 0.0004 | 95    | static  |
| 5    | before | 1136  | 1136  | 0.0004 | 102   | -       |
| 5    | after  | 1628  | 1628  | 0.0004 | 88    | static  |
| 6    | before | 1140  | 1140  | 0.0004 | 77    | -       |
| 6    | after  | 1632  | 1632  | 0.0004 | 88    | static  |
| 7    | before | 932   | 932   | 0.0004 | 106   | -       |
| 7    | after  | 1656  | 1656  | 0.0004 | 113   | static  |
| 8    | before | 1148  | 1148  | 0.0004 | 136   | -       |
| 8    | after  | 1152  | 1152  | 0.0004 | 128   | static  |
| 9    | before | 1056  | 1056  | 0.0004 | 90    | -       |
| 9    | after  | 1668  | 1668  | 0.0004 | 95    | static  |
| 10   | before | 1108  | 1108  | 0.0004 | 86    | -       |
| 10   | after  | 1644  | 1644  | 0.0004 | 93    | static  |
| 11   | before | 928   | 928   | 0.0004 | 69    | -       |
| 11   | after  | 1628  | 1628  | 0.0004 | 103   | static  |
| 12   | before | 1100  | 1100  | 0.0004 | 144   | -       |
| 12   | after  | 1640  | 1640  | 0.0004 | 117   | static  |
| 13   | before | 1128  | 1128  | 0.0004 | 91    | -       |
| 13   | after  | 1100  | 1100  | 0.0004 | 90    | static  |
| 14   | before | 1124  | 1124  | 0.0004 | 140   | -       |
| 14   | after  | 1112  | 1112  | 0.0004 | 95    | static  |
| 15   | before | 1116  | 1116  | 0.0004 | 106   | -       |
| 15   | after  | 1096  | 1096  | 0.0004 | 136   | static  |

Per-pair `after - before` TBT diffs (ms): 78, -57, 10, -7, -14, 11, 7, -8, 5,
7, 34, -27, -1, -45, 30. Every desktop sample recorded `cls` =
0.0004098861882716049 in both arms; the table shows it rounded to 4 decimals.

## Raw samples — mobile (390x844, measured pairs only)

| pair | arm    | fcpMs | lcpMs | cls    | tbtMs | runtime |
| ---- | ------ | ----- | ----- | ------ | ----- | ------- |
| 1    | before | 936   | 936   | 0.0012 | 122   | -       |
| 1    | after  | 1868  | 1868  | 0.0000 | 120   | static  |
| 2    | before | 932   | 932   | 0.0012 | 113   | -       |
| 2    | after  | 1604  | 1604  | 0.0000 | 99    | static  |
| 3    | before | 900   | 900   | 0.0012 | 65    | -       |
| 3    | after  | 1652  | 1652  | 0.0000 | 139   | static  |
| 4    | before | 1128  | 1128  | 0.0000 | 163   | -       |
| 4    | after  | 1640  | 1640  | 0.0000 | 132   | static  |
| 5    | before | 1156  | 1156  | 0.0000 | 112   | -       |
| 5    | after  | 1132  | 1132  | 0.0000 | 196   | static  |
| 6    | before | 1108  | 1108  | 0.0000 | 122   | -       |
| 6    | after  | 1640  | 1640  | 0.0000 | 113   | static  |
| 7    | before | 952   | 952   | 0.0012 | 130   | -       |
| 7    | after  | 1660  | 1660  | 0.0000 | 115   | static  |
| 8    | before | 1140  | 1140  | 0.0000 | 191   | -       |
| 8    | after  | 1660  | 1660  | 0.0000 | 284   | static  |
| 9    | before | 928   | 928   | 0.0012 | 132   | -       |
| 9    | after  | 1132  | 1132  | 0.0000 | 108   | static  |
| 10   | before | 932   | 932   | 0.0012 | 107   | -       |
| 10   | after  | 1636  | 1636  | 0.0000 | 139   | static  |
| 11   | before | 1172  | 1172  | 0.0000 | 128   | -       |
| 11   | after  | 1648  | 1648  | 0.0000 | 158   | static  |
| 12   | before | 1152  | 1152  | 0.0000 | 154   | -       |
| 12   | after  | 1144  | 1144  | 0.0000 | 168   | static  |
| 13   | before | 1292  | 1292  | 0.0000 | 126   | -       |
| 13   | after  | 1632  | 1632  | 0.0000 | 120   | static  |
| 14   | before | 956   | 956   | 0.0012 | 151   | -       |
| 14   | after  | 1096  | 1096  | 0.0000 | 118   | static  |
| 15   | before | 1148  | 1148  | 0.0000 | 168   | -       |
| 15   | after  | 1640  | 1640  | 0.0000 | 150   | static  |

Per-pair `after - before` TBT diffs (ms): -2, -14, 74, -31, 84, -9, -15, 93,
-24, 32, 30, 14, -6, -33, -18. Nonzero mobile `cls` samples recorded exactly
0.0011536690550526718 (before arm only).

## Medians, spread and gate verdicts

| Viewport | before median TBT (IQR)      | after median TBT (IQR)     | paired median (after-before) | bootstrap CI95 | gate | verdict |
| -------- | ---------------------------- | -------------------------- | ---------------------------- | -------------- | ---- | ------- |
| desktop  | 102 ms (90.5-132.5; 69-169)  | 103 ms (94-115; 88-207)    | **+5 ms**                    | [-8, +10]      | 50   | PASS    |
| mobile   | 128 ms (117.5-152.5; 65-191) | 132 ms (116.5-154; 99-284) | **-6 ms**                    | [-15, +32]     | 50   | PASS    |

CI95 from the harness's seeded paired bootstrap (10,000 resamples). LCP
medians, recorded but not gated: desktop 1116 -> 1632 ms, mobile
1108 -> 1640 ms.

## Runtime-mode note

Under the harness's headless, CPU/network-constrained emulation, every
after-arm sample reports `data-glass-runtime="static"` — the documented
constrained-device fallback of the Glass work, recorded per sample by the
harness itself. SC-008 does not condition on the runtime mode and no protocol
value was changed; the mode is reported here because the raw samples carry it.

## Tested SHA vs this PR head

The measurement executed at the after arm `8f395e15…` (above). This file is
committed on a head that additionally merges `origin/main` `1bef2baa6e3ba3ddc551addbe9f100bf268f0be9`
(required before the push so the PR merge ref stays clean) and this
documentation commit. The complete app-code delta between the tested SHA and
that merge is `components/ui/UploadCard.tsx` and one string in
`lib/i18n/messages/ar.ts` (the 014 banner size hint); no Glass,
`/registration-links`, or shell source differs. The baseline arm and the
harness are byte-identical between the tested SHA and this head's ancestry.

## Reproduce it (unchanged approved method)

1. Create the baseline checkout and build both arms:
   `git worktree add <baseline> 24694ffb731ae7e75c4ca5dcbae6ceb923fb1404`,
   then `npm ci && npm run build` in `<baseline>` and in the tested checkout.
2. Reset + provision Stack B through the safe wrapper only, then export
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
5. Both `metrics-<viewport>.json` outputs (raw samples, medians, IQR, paired
   CI95) are preserved in the lane run directory
   (`C:/Users/NEW LAP/.lifter/runs/s67-glm-t046/metrics-desktop.json`,
   `metrics-mobile.json`); the tables above carry every measured sample.

## Environment

- After arm built and run at `8f395e15a9768a5698ec329686e7c6a8ed15bc70`;
  baseline arm at `24694ffb731ae7e75c4ca5dcbae6ceb923fb1404`.
- Node `v24.19.0`, npm `11.17.0`, `@playwright/test` 1.64.1 (chromium-1248),
  Supabase CLI 2.122.0, Windows (win32). Host load 8 % / 4 % before the two
  runs.
- Full harness `metrics-*.json` outputs archived in the lane run directory
  (not committed); every measured sample is reproduced in the tables above.

## History

- 2026-11-19 earlier: the blocked attempt was recorded in this file as
  NEEDS-STACK (commit `8f395e15…`, PR #282): the harness is hard-wired to a
  live Stack B and an authenticated `/registration-links` session, which that
  lane could not start. This run satisfied exactly those preconditions on
  Stack B and supersedes that record; the old text remains in git history.

## Conclusion

- Gate result: **desktop +5 ms [-8, +10], mobile -6 ms [-15, +32] — PASS**
  (both `<= +50 ms`, 15 interleaved pairs per arm per viewport, approved
  thresholds only).
- T046: ticked. SC-008: `VERIFIED` in `traceability.md`.
- No threshold, sample count, port, route, fixture or protocol value was
  invented, substituted or relaxed.
