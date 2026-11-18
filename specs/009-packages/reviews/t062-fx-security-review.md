# T062 FX security review

**Scope:** independent review of `lib/packages/fx.ts` and production call sites on `origin/main` at `2cc6e2edab094979d1ca9c180e02b802ac50ce2c`, unit tests, `fx-coverage-verification.md`, and PR #247 diff at `f5551d29204bfcc5bf348b987a8ec5259a97095c`.

**Verdict: FAIL — T062 remains unticked.** Two blocking findings remain. No application code or tests were changed or run.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Server-only boundary / client bundle | PASS | `lib/packages/fx.ts:1` imports `server-only`. Production-source search found no imports/call sites; only the mocked unit test imports it (`tests/unit/packages-fx-adapter.test.ts:8-18`; `packages-fx-red.test.ts:26`). |
| Outbound URL allow-list and host pinning | PASS | Fixed HTTPS base (`lib/packages/fx.ts:56`); URL builder uses only the fixed `/rates` path, fixed target currency, currency pin, and date window (`:225-239`). Tests assert exact origin and allowed query keys (`tests/unit/packages-fx-adapter.test.ts:51-66`). |
| Request minimization: query, headers, cookies, body | PASS | Month-only date range (`lib/packages/fx.ts:195-211`); request contains only base/quote/provider/from/to (`:225-239`); GET, JSON accept header, omitted credentials, no body (`:374-380`). Captured-request assertions (`tests/unit/packages-fx-adapter.test.ts:68-80`). No workspace, client, identity, contact, amount, or exact transaction data is forwarded. |
| TLS and redirects | PASS | URL is fixed to HTTPS (`lib/packages/fx.ts:56`); `redirect: 'error'` prevents redirect-following to another host (`:374-380`). Default platform fetch retains TLS certificate verification. |
| Timeouts and safe failure states | PASS | Abort timer uses a positive timeout capped at 15 seconds (`lib/packages/fx.ts:294-297`, `:366-380`); network, HTTP, body, parse, validation, and date failures return only `pending` (`:382-396`). |
| Response validation | PASS | Array/row-count/strict-key/base/quote/date/window/provider-calendar/duplicate/rate and plausibility-bound checks (`lib/packages/fx.ts:254-291`); response size is capped (`:59-60`, `:299-320`, `:383-387`). Corresponding rejection cases are covered (`tests/unit/packages-fx-adapter.test.ts:178-212`, `259-289`, `426-455`). |
| SSRF / currency and date injection | PASS | Network call is reachable only after an own-property currency-pin check (`lib/packages/fx.ts:78-84`, `:357-375`). Caller-supplied timestamps are converted to a Cairo date and calendar window before URL construction (`:200-211`); `URLSearchParams` encodes values and cannot replace the fixed origin (`:226-239`). Invalid timestamps return pending without a request (`tests/unit/packages-fx-adapter.test.ts:246-256`). |
| Ready-rate snapshot immutability | **FAIL** | Ready snapshots are mutable plain objects (`lib/packages/fx.ts:150-177`); fetched snapshots are returned as mutable objects (`:171-177`), and existing ready snapshots are passed back by reference (`:361-363`). The test only checks identity and no refetch (`tests/unit/packages-fx-adapter.test.ts:139-156`, `351-367`); it does not establish immutability. A caller can mutate a persisted snapshot's rate/provider before reporting. |
| Request-data logging | PASS | `lib/packages/fx.ts` has no logging; errors are caught and not returned (`:392-393`). No production call site was found that could expose provider errors to a UI. |
| Provider verification / terms gate | **FAIL** | PR #247 adds coverage observations for EGP/USD/SAR and the CBE/SAMA pins in `fx-coverage-verification.md` (§S65, after line 107); however, provider and Frankfurter terms remain explicitly unverified and a blocker at `:103-104`. T059 itself requires pinned-provider terms to be verified before accepting a currency (`specs/009-packages/tasks.md:189`). PR #247 changes T059 to `[x]` and says terms are pre-production (`gh pr diff 247`, `tasks.md` T059 hunk), contradicting that prerequisite and the coverage record. T062's own task text (`tasks.md:192`) does not remove T059's acceptance gate. |

## Blocking fixes required

1. **Snapshot mutability** — `lib/packages/fx.ts:150-177, 357-363`: make ready snapshot values immutable at the API boundary (including the existing-ready path), or otherwise guarantee consumers cannot mutate the recorded rate/provider. Add a test that attempts mutation and proves the snapshot stays unchanged. No code change was made in this review.
2. **Terms verification / T059 acceptance** — `specs/009-packages/tasks.md:189` and PR #247's T059 tick; `specs/009-packages/fx-coverage-verification.md:103-104`: verify and document Frankfurter v2, CBE, and SAMA applicable terms before T059 accepts currencies, or obtain the required product/spec decision changing that gate. PR #247's pre-production note alone does not satisfy the current task text. No product decision was inferred and no task was ticked here.

Because the security review has blocking findings, T062 remains `[ ]` in `specs/009-packages/tasks.md`.
