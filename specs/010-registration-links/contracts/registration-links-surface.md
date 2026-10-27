# Contract: Registration Links surface (P1-F10)

Normative sources: [spec](../spec.md), [data model](../data-model.md). Existing auth, locale, theme and Design System contracts remain. All paths below are future implementation, not files changed in this artifact run.

## Routes and public payload

| Route                                  | Access                                                      | Behavior                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/registration-links?workspace=<uuid>` | Verified staff, generation capability in selected workspace | Workspace selector, available/current offer selection, optional authorized schedule editor, issue dialog, recent list |
| `/register/[token]`                    | Public anon and authenticated                               | Calls open RPC server-side on page request, renders minimal valid/invalid state in AR/EN; no form/account mutation    |
| `/`                                    | Existing staff landing                                      | Minimal capability-appropriate Registration links entry; final navigation remains ND-F9-5/F2 ND-5                     |

Middleware permits precisely `/register/<one nonempty segment>` without requiring login; it must also permit bogus single-segment tokens so the generic invalid page renders. `/registration-links`, `/register`, nested paths and prefix lookalikes do not gain a broad bypass. Preserve existing session refresh/cookies, public routes and all protected redirects. Route itself has no `requireActor()` call; staff route still checks actor/capability server-side before reads.

Set `Referrer-Policy: no-referrer` on public register responses after middleware response replacement, including invalid/error states, and `Cache-Control: no-store`/dynamic rendering so tokens/results are not server/shared cached. Never put the public path into login next parameters, metadata, analytics, exception messages or logs. No token in page titles or reusable links. Avoid third-party content on the public page; no origin/path-derived navigation leaks. Any host request/access-log facility must omit/redact token path before production.

`registration_link_open` returns exactly one JSON object, no rows/count metadata:

```json
{ "status": "valid", "workspace_name": "<display name>" }
```

or, identically for unknown, malformed, expired, past-grace and consumed:

```json
{ "status": "invalid" }
```

Both valid/invalid business states use normal page rendering (HTTP 200); no invalid-cause redirects or distinct status codes. Infrastructure failures are safely adapted to the same generic invalid page without false workspace identity. No public workspace id, slug, link id, token/hash echo, expiry, package, price, commission or installments.

Initial copy direction: English “This registration link is valid.” / “This registration link is invalid or no longer available.”; Arabic “رابط التسجيل صالح.” / “رابط التسجيل غير صالح أو لم يعد متاحًا.”. Review natural AR copy during implementation. Valid shows workspace name plus validity message; no disabled/fake Continue, “registration arrives in F11”, marketing/contact/price content, logo/color branding implementation or signup fields. Use existing locale/theme toggles, neutral Design System states and accessible focus/heading semantics. ND-F10-4 remains open for future content decisions.

## Database RPCs

All functions SECURITY DEFINER, postgres owner, empty search_path and fully qualified references. REVOKE default EXECUTE first; only specified grants below. SQL transaction details and guard definitions are in the data model.

| RPC                               | Named input                                                                          | Success                          | Grants                               |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------ |
| issue_registration_link           | `{workspace_id:uuid,offer_id:uuid,token_hash:lowercase-hex-string,installments:array | null}`                           | Link UUID only                       | authenticated |
| registration_link_open            | `{token:text}`                                                                       | Exact valid/invalid JSON above   | anon, authenticated                  |
| get_registration_link_commissions | `{workspace_id:uuid}`                                                                | `{link_id,commission_rate_bp}[]` | authenticated, internally PO/WO only |

Installment JSON when present is a nonempty array:

```json
[
  { "seq": 1, "amount_minor": "400", "due_offset_days": 0 },
  { "seq": 2, "amount_minor": "800", "due_offset_days": 12 }
]
```

Illustrative synthetic price total 1200; this is not an approved catalog, percentage rule, first-offset requirement or due-date anchor. An otherwise valid first offset of 2 is also allowed. Strings for amounts are mandatory; JSON numbers for money are rejected, including safe-looking ones, to keep one exact transport contract. Sequence/offset numbers are bounded safe integers matching SQL int; exact array keys only. NULL is the only absent schedule. Empty `[]`, JSON `null` payload distinct from SQL NULL where relevant, non-array, negative/zero amounts, overflow, fractions, missing/extra fields, gap/repeated seq and non-increasing offsets fail invalid_input. App serializes absent schedule as SQL NULL, not JSON scalar null.

Any non-null schedule requires both capabilities before parsing, including malformed/empty payloads from Trainer. No actor/membership/version/snapshot/rate/expiry override arguments accepted. The RPC always resolves available/current version under lock. It has no stale-version compare argument: see [research R3](../research.md#r3--current-version-selection-versus-stale-request-rejection).

Issuance errors: `42501/not_permitted` for unauthorized/missing/foreign workspace/offer; `22023/invalid_input` for controlled authorized shape/schedule/hash validation; `P0001/unavailable` for unavailable/current-missing offer, rate exhaustion or duplicate hash. Unknown/provider/constraint errors map to unavailable at app boundary. No SQL/provider message or foreign existence detail crosses that boundary. RPC transaction commit failures, including deferred audit, are failures, never URL success. No `rate_limited` public result is added for F10.

## Server action and library

`app/(app)/registration-links/actions.ts` exports `issueRegistrationLinkAction(input:unknown)` delegating to server-only `lib/registration-links/service.ts`.

Input is exactly `{workspaceId,offerId,installments:null|{seq,amountMinor:string,dueOffsetDays:number}[]}`. Reject unknown fields, especially packageVersionId/priceMinor/currency/commissionRateBp/expiresAt/createdBy. Browser may select an offer only. Result:

```text
{status:'ok', linkId:uuid, link:string}
| {status:'not_permitted'|'invalid_input'|'unavailable'}
```

Sequence: re-derive verified actor → check `authorize(generate_registration_link,ws)` → if schedule present check `authorize(configure_installment_schedule,ws)` → validate exact shape/IDs/schedule → validate configured APP_ORIGIN → generate 32-byte random token and SHA-256 hex → call issuing RPC with session JWT, only hash → after confirmed commit construct `${APP_ORIGIN}/register/<token>` → return once and revalidate staff list. Never admin/service client, browser crypto generation, token in thrown error, URL in cache/revalidation keys, console, response persistence or automatic blind retry.

`APP_ORIGIN` must be an absolute HTTPS origin, loopback HTTP allowed in local/dev per existing F4 guard, with no userinfo/query/fragment/path prefix. Check before writing so invalid origin cannot create an undisplayable successful link. No new env/dependencies. Read existing server env without exposing service-role value; F10 itself does not use that privilege.

Suggested library contracts:

- `token.ts` server-only: token generation/hash and pure origin/URL construction; hash the encoded string consistently with SQL. Only generator/service ever owns raw token memory.
- `validation.ts`: pure schedule parser/validator; bigint/string sums and comparison, no Number money; returns stable generic codes, no logging.
- `grace.ts`: pure injected-clock `registrationLinkValidity` and derived internal staff status. Never browser clock as authorization.
- `results.ts`: exact discriminated unions and sanitized known-error mapping.
- `read.ts` server-only: scoped safe projections and optional separately gated commission reader; no cross-user/workspace cache.
- `open.ts` server-only: validate input, call open RPC using anon/session transport without a service key; strictly allow-list valid payload fields, otherwise generic invalid; no path logging.

Unit failures include env/crypto/RPC/deferred error/copy failure and assert zero console calls or sensitive request dumps. Token entropy test uses injected random provider spy requesting 32 bytes, canonical encoding and distinct values; do not use a probabilistic entropy proof or claim uniqueness by probability alone (DB UNIQUE is final wall).

## Staff reads and UI

`loadRegistrationLinks(actor,workspaceId)` first requires generation authorization and selected workspace visibility. It returns exact explicit safe projections from registration_links_safe/installments_safe and F9 available/current offers joined to package_versions_safe. Never SELECT `*`. Cast money at SQL view before JSON transport; do not reconstruct exact strings from unsafe JS numbers. Gated commissions are fetched only after PO/WO role + authorization; omit fields entirely otherwise. No hidden rates in props/HTML/RSC/errors. Historical link terms do not update when current offer changes.

Initial recent list: most recent 50 rows ordered created_at DESC,id DESC, an explicitly technical display batch, not an issuance cap or retention rule; no unrequested filtering by creator. Include current rows for all in-scope issuers. Safe columns may include ids/times/version/duration/price/currency; token_hash never. If row children are loaded, only for listed link IDs within selected workspace. Workspace display names come from existing authorized selector loader; PO all real workspaces, other staff active memberships only.

Status computed with server now and shared grace rule, precedence: consumed → consumed; invalid by effective deadline → expired; valid and opened_at non-NULL → opened; otherwise valid. Expired/consumed entries may retain first-open date without status ambiguity. No revoke/cancel/share/resend/secret-recovery action. Provisional staff price yes for all four roles per ND-F10-5; PO/WO optional commission details through gate only.

Page `app/(app)/registration-links/page.tsx`: requireActor then scoped generation check; no valid selected scope/non-staff → generic denial/404 before data load; no accessible workspaces → translated empty state. Selector never grants access. UI shows only available offers with current version and authored locale label, duration, exact price/currency. Schedule editor visible only to PO/WO/Sales; explicit minor-unit amount/day-offset labels, add/remove rows, live exact sum equals price and ordered-offset errors. Fields start blank; no schedule/price defaults invented. Compare against displayed price for feedback, DB compares against authoritative snapshot.

`RegistrationLinkDialog` reuses F4 ConfirmDialog/Field/Button/Alert show-once behavior. Confirm issue, then read-only LTR URL, Copy and Close only; retain within current open dialog only. Close, unmount or workspace switch clears secret and ignores late async results; pending duplicate submission disabled. Copy failure leaves manual selection possible in the same dialog. Closing before RPC response discards late URL, does not cancel/consume/revoke already committed link. Reopening starts a new issuance flow, never fetches old raw URL. Staff list updates only after success.

Use AR-first RTL/EN LTR, existing dark/light and responsive states, keyboard focus trap/restore, semantic table/list, live validation, loading/empty/error/retry and no-workspace/no-offer states. Authored package labels remain authored. Unit/page/e2e tests cover workspace switching and no rates in Sales/Trainer payloads. No Design System or navigation redesign.

## F11 handoff

Only F11 signup RPC can consume, in the same transaction as account creation using guarded UPDATE RETURNING and authoritative clock, with rollback on any validation/duplicate failure. It must coordinate on this row and use the shared validity predicate; it may never consume on GET/open. Account uniqueness/attempt limits under D-08, payment approval and subscription/account UI are future scope. F10 tests compatibility via privileged fixtures only; it adds no public consume endpoint.
