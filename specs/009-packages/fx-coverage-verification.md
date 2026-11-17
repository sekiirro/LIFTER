# F9 FX coverage verification (T075, issue #138)

**Verified**: 2026-11-16 (observations taken 2026-11-15 23:20 UTC, i.e. 2026-11-16 Africa/Cairo) by live `curl` against `https://api.frankfurter.dev`. Task: T075 [FR-026, FR-031, SC-017, SC-022]. Required by S36-PO-2/S36-PO-3 and spec FR-026: record per currency (`EGP`, `USD`, `SAR`) whether the selected Frankfurter service has valid historical rates over the required dates. Any gap is a blocker; no provider, rate or fallback is assumed.

## Verdict (T075 result: BLOCKED on the ECB/TARGET reading; superseded by the S61-PO-1 addendum at the end)

| Currency | Frankfurter v1 (ECB reference rates, ECB/TARGET business days)                                                                                                                                                                   | Frankfurter v2 (multi-provider, calendar days)                                                                             | Verdict against the spec as written (ECB/TARGET + Frankfurter)                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EGP`    | NOT LISTED in `/v1/currencies`; every EGP request returns 404 `{"message":"not found"}`.                                                                                                                                         | Listed; 729/729 calendar days returned over 2024-11-15..2026-11-13, 0 missing weekdays, but 208 weekend dates are present. | **UNSUPPORTED on the ECB/TARGET series. BLOCKER.** Only available through v2 multi-provider data, which is not an ECB/TARGET business-day series.                   |
| `SAR`    | NOT LISTED in `/v1/currencies`; every SAR request returns 404.                                                                                                                                                                   | Listed; 729/729 days, 0 missing weekdays, 208 weekend dates; value is a constant 3.75 (peg) across the whole range.        | **UNSUPPORTED on the ECB/TARGET series. BLOCKER.** Same as EGP.                                                                                                     |
| `USD`    | Listed, but only as a quote of EUR: `base=EUR&symbols=USD` works; 509 points over 2024-11-15..2026-11-13, no weekend points, 12 missing weekdays all TARGET holidays. `base=USD&symbols=EGP,SAR` and `base=EGP\|SAR` return 404. | Listed; 729/729 days, 0 missing weekdays, 208 weekend dates.                                                               | **COVERED only for EUR->USD (and USD->EUR) on v1.** USD->EGP, the pair the odd-cent fixture and the reporting need, is NOT available on v1. Gap for the actual use. |

The spec does not name a Frankfurter API version (no `/v1`, `/v2` or host appears in spec.md, plan.md, research.md, data-model.md, quickstart.md, contracts/ or docs/04-changes-and-questions.md). It names the ECB/TARGET calendar and "the latest prior valid Frankfurter publication", which describes the v1 ECB series. v1 does not cover EGP or SAR, so on the spec's own terms the coverage requirement fails. v2 does return EGP and SAR but is a different data model (see below); accepting it is a product/architecture decision, not made here.

## Raw evidence

All requests `GET`, no auth, no request body. Host `https://api.frankfurter.dev`.

### v1

| Request                                                                | HTTP | Body (abridged)                                                                                                                                    |
| ---------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v1/currencies`                                                       | 200  | 30 codes: AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR. No EGP, no SAR. |
| `/v1/latest`                                                           | 200  | EUR-based ECB rates (no EGP/SAR).                                                                                                                  |
| `/v1/2026-11-10?base=EUR&symbols=USD,EGP,SAR`                          | 200  | `{"amount":1.0,"base":"EUR","date":"2026-11-10","rates":{"USD":1.1214}}` (EGP and SAR silently dropped)                                            |
| `/v1/2026-11-10?base=USD&symbols=EGP,SAR`                              | 404  | `{"message":"not found"}`                                                                                                                          |
| `/v1/2026-11-10?base=EGP&symbols=USD`                                  | 404  | `{"message":"not found"}`                                                                                                                          |
| `/v1/2026-11-10?base=SAR&symbols=USD`                                  | 404  | `{"message":"not found"}`                                                                                                                          |
| `/v1/latest?base=EGP`                                                  | 404  | `{"message":"not found"}`                                                                                                                          |
| `/v1/2026-11-10?base=USD&symbols=EUR`                                  | 200  | `{"amount":1.0,"base":"USD","date":"2026-11-10","rates":{"EUR":0.89174}}`                                                                          |
| `/v1/2024-11-15..2026-11-13?base=EUR&symbols=USD`                      | 200  | 509 points 2024-11-15..2026-11-13                                                                                                                  |
| `/v1/2024-11-15..2026-11-13?base=EUR&symbols=EGP` and `...symbols=SAR` | 404  | `{"message":"not found"}`                                                                                                                          |
| `/v1/2026-11-07?base=EUR&symbols=USD` (Saturday)                       | 200  | resolves to `"date":"2026-11-06"` (Friday), i.e. v1 snaps to the prior ECB business day                                                            |
| `/v1/2024-12-25?base=EUR&symbols=USD` (TARGET holiday)                 | 200  | resolves to `"date":"2024-12-24"`                                                                                                                  |

v1 EUR->USD gaps over 2024-11-15..2026-11-13: weekdays with no publication (12) are exactly the TARGET holidays 2024-12-25, 2024-12-26, 2025-01-01, 2025-04-18 (Good Friday), 2025-04-21 (Easter Monday), 2025-05-01, 2025-12-25, 2025-12-26, 2026-01-01, 2026-04-03 (Good Friday), 2026-04-06 (Easter Monday), 2026-05-01; zero weekend points. This confirms the ECB/TARGET calendar used by the T058 fixtures.

### v2

| Request                                                                         | HTTP | Observation                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v2/currencies`                                                                | 200  | EGP `{"iso_code":"EGP","name":"Egyptian Pound","start_date":"1994-03-24","end_date":"2026-11-15"}`; SAR start 1986-06-01, end 2026-11-16; USD start 1948-06-21, end 2026-11-16                                       |
| `/v2/providers`                                                                 | 200  | 111 providers. EGP is supplied by 29 (e.g. CBE Egypt official daily from 2024-03-03, SAMA daily from 2021-04-10, BIS/UST/INFOREURO/HMRC periodic); SAR by 53; USD by 110. The ECB provider does NOT list EGP or SAR. |
| `/v2/rates?base=USD&quotes=EGP,SAR&from=2026-11-05&to=2026-11-12`               | 200  | 16 rows, one per calendar day incl. Sat 2026-11-07 (EGP 54.081) and Sun 2026-11-08 (EGP 53.944); SAR 3.75 every day                                                                                                  |
| `/v2/rates?base=USD&quotes=EGP&from=2024-11-15&to=2026-11-13`                   | 200  | 729/729 calendar days, 208 weekend dates, 0 missing weekdays, min 46.803, max 56.141; first 49.366, last 53.562                                                                                                      |
| `/v2/rates?base=USD&quotes=SAR&from=2024-11-15&to=2026-11-13`                   | 200  | 729/729 days, 208 weekend dates, min = max = 3.75                                                                                                                                                                    |
| `/v2/rates?base=EUR&quotes=USD&from=2024-11-15&to=2026-11-13`                   | 200  | 729/729 days, 208 weekend dates (v1 has 509 ECB business-day points for the same pair)                                                                                                                               |
| `/v2/rate/USD/EGP?date=2026-11-07`                                              | 200  | `{"date":"2026-11-07","base":"USD","quote":"EGP","rate":54.081}`                                                                                                                                                     |
| `/v2/rates?base=USD&quotes=EGP,SAR&from=2026-11-05&to=2026-11-12&providers=ECB` | 200  | `[]` (ECB has no EGP/SAR)                                                                                                                                                                                            |
| same with `&providers=CBE`                                                      | 200  | rows only for 2026-11-05, 11-08, 11-09, 11-10, 11-11, 11-12 (no Fri 11-06 / Sat 11-07: Egyptian weekend); EGP 53.9423 on 11-05, SAR 3.7535                                                                           |
| same with `&providers=SAMA`                                                     | 200  | daily rows, EGP 54.721 on 11-05, SAR 3.75                                                                                                                                                                            |

Why v2 does not match the spec's calendar assumption: the default blended v2 series returns a value for every calendar day (including weekends the ECB never publishes), and its EGP/SAR values come from non-ECB providers whose own calendars differ (CBE skips the Egyptian Friday/Saturday weekend). The unfiltered v2 response does not state which provider produced each row, so "the latest prior valid publication on the ECB/TARGET calendar" is not a defined concept for EGP or SAR there. A weekend row would be treated as a valid publication under a naive client, contradicting S36-PO-2/S36-PO-3.

Re-verification note: observations are time-bound (provider lists, end dates and rates change). Re-run the requests above before T059 acceptance; the raw payloads are not committed.

## Impact

- T075 outcome: coverage for `EGP` and `SAR` is NOT verified on the ECB/TARGET series; `USD` is only EUR<->USD. Per the spec this is a recorded blocker. No provider, rate or fallback is assumed anywhere in the repository.
- T059 (adapter) stays BLOCKED until the decision below is made.
- T058 RED tests (`tests/unit/packages-fx-red.test.ts`) encode the spec's contract (calendar, selection, rounding) with synthetic rates and are provider-agnostic: they hold under any of the options below, except that Option B/C would redefine the "ECB/TARGET business-day calendar" assertions.

## Decision needed (PO / architect)

Which FX source satisfies "ECB/TARGET business-day, latest prior valid publication" for EGP, SAR and USD->EGP?

- **A.** Keep ECB/TARGET semantics strictly and do not treat Frankfurter v1 as covering EGP/SAR. Add a PO-approved, documented, verified additional source for EGP (and SAR) with its own publication calendar, via a separate spec amendment (new provider verification under FR-027/SC-018). EGP/SAR conversions stay pending until then.
- **B.** Approve Frankfurter v2 for EGP/SAR/USD, pinned to one named provider per currency (for example CBE for EGP, SAMA for SAR) and use that provider's own publication calendar instead of ECB/TARGET for those currencies; amend FR-026/SC-017 and the T058 calendar fixtures accordingly.
- **C.** Approve Frankfurter v2 blended series as is, using its calendar days as publications; amend FR-026/SC-017 to drop the ECB/TARGET weekday rule for EGP/SAR/USD.

Recommendation: **B** (or A if CBE/SAMA terms of use cannot be verified). It keeps the "latest prior valid publication" semantics and immutability well defined (one named, auditable provider and calendar per currency, no weekend fabrication) while using a service already selected by the spec. C leaves provenance and calendar semantics undefined; A is safest but delays reporting. Not decided here.

## S61-PO-1 (FX=B) addendum: pinned-provider verification (T075 re-run)

**Decision**: S61-PO-1 "FX=B" approves Frankfurter v2 pinned to one named provider per currency on that provider's own calendar (option B above). **Re-verified**: 2026-11-16 ~01:25 UTC by live `curl` against `https://api.frankfurter.dev/v2` (`/providers`, `/currencies`, `/rates`, `/rate`). The "BLOCKED" verdict above is superseded for coverage; the terms-of-use item below is still a blocker.

### Pinned providers (keys from live `/v2/providers`)

| Line currency | Pinned provider key | Provider metadata (API)                                                                                                                                                                                      | Quote    | Calendar observed over 2025-01-01..2026-11-13                                                                                                                                                                                      |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USD`         | `CBE`               | Central Bank of Egypt, country EG, official rate, pivot EGP, daily, start 2024-03-03, end 2026-11-15, 0 missed publishes. Lists AED AUD BHD CAD CHF CNY DKK EGP EUR GBP JOD JPY KWD NOK OMR QAR SAR SEK USD. | USD->EGP | 452 rows; weekday counts Sun 91, Mon 92, Tue 95, Wed 94, Thu 80, Fri 0, Sat 0 (no Friday/Saturday rows); 36 Sunday-Thursday dates absent, all Egyptian holiday runs (e.g. 2026-05-26..28, 2026-05-31). Min 46.77865, max 56.28185. |
| `SAR`         | `SAMA`              | Saudi Central Bank, country SA, indicative rate, pivot SAR, daily, start 2021-04-10, end 2026-11-15, 0 missed publishes. Lists 72 currencies incl. EGP, USD, SAR.                                            | SAR->EGP | 678 rows, rows on all 7 weekdays (incl. Fri/Sat); 4 dates absent: 2025-07-21, 2025-08-05..07. Min 12.4517, max 15.006. USD->SAR on SAMA is exactly 3.75 on every row (peg), min = max.                                             |
| `EGP`         | none                | identity                                                                                                                                                                                                     | EGP->EGP | exactly 1, no lookup.                                                                                                                                                                                                              |

Other provider-pair observations: CBE SAR->EGP (452 rows, 12.4733..14.9965) and CBE USD->SAR (3.7499..3.7568, not a constant peg) exist but are NOT used.

Provider calendars used by the T058 fixtures and `lib/packages/fx.ts`: CBE publishes Sunday-Thursday (Friday/Saturday never); official holidays simply have no row. SAMA publishes every calendar day (a Saturday/Sunday row can repeat the prior value, e.g. 14.3802 on 2026-11-07, -08 and -09).

### Findings that shape the adapter

- Rows from `/v2/rates` carry only `date, base, quote, rate`; they do NOT identify the provider. Pinning therefore relies on the explicit `providers=` parameter plus validation: a CBE-pinned response containing any Friday/Saturday row is rejected as evidence of a blended series.
- The single-date endpoint silently snaps back: `GET /v2/rate/USD/EGP?date=2026-11-07&providers=CBE` returned `date: 2026-11-05` (CBE has no Friday/Saturday rows), and without `providers` returns a blended 2026-11-07 value (53.926 vs CBE 53.9423 on 11-05 vs SAMA 54.721). The adapter uses the range endpoint `/v2/rates?...&providers=...&from=&to=` and validates every returned date against the requested window and the pinned calendar.
- The range endpoint carries the latest earlier row in when `from` has no row of its own: `/v2/rates?base=USD&quotes=EGP&providers=CBE&from=2026-10-09&to=2026-10-10` returns the 2026-10-07 row, and `from=2025-01-01&to=2025-01-03` returns 2024-12-31 and 2025-01-02. Rows may therefore precede `from` (and a `to` beyond the latest publication returns the latest row, e.g. 2026-11-15); the adapter accepts rows up to 31 days before `from` and none after `to`.
- Empty arrays (HTTP 200) are returned for unsupported provider/currency combinations (e.g. `providers=ECB`), so an empty result is treated as pending, never as rate 1.

### Terms of use and data URL (verification status: NOT VERIFIED, BLOCKER)

| Provider | API `data_url`                                                                            | API `terms_url`                                     | Result of fetching `terms_url` on 2026-11-16                                                   |
| -------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `CBE`    | https://www.cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates/historical-data | https://www.cbe.org.eg/en/disclaimer                | HTTP 200 but a 269-byte client-rendered shell; no terms text is retrievable without a browser. |
| `SAMA`   | https://www.sama.gov.sa/en-US/Currency/FinExc/Pages/Currency.aspx                         | https://www.sama.gov.sa/en-us/pages/termsofuse.aspx | Connection failed (no HTTP response) from this host.                                           |

The API metadata gives URLs only; it does not state licence, redistribution or reporting-use terms. Neither terms page could be read, so the S33-08 "documented verification of provider terms" gate for `CBE`, `SAMA` (and Frankfurter's own service terms for v2 redistribution) is **NOT verified and is a blocker for acceptance**. No terms are assumed. Required before acceptance: a human or a browser-capable reviewer reads both terms pages and records permitted use (internal financial reporting, no client data sent, caching of rates) here and in the T062 review.

### Accepted residual risk (T062 finding 2)

A blended series that happens to be served for a `SAMA`-pinned request cannot be detected: `SAMA` publishes every calendar day, so no row is off-calendar, and rows do not name their provider. For `CBE` the Friday/Saturday check catches a blend. This residual risk is accepted pending PO/architect confirmation; mitigations are the explicit `providers=` pin, pair/shape validation and the per-pair plausibility bounds.
