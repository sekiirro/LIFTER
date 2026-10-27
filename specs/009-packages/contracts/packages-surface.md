# Contract: Packages surface (P1-F9)

Sources and normative fields: [spec.md](../spec.md), [data-model.md](../data-model.md). Existing actor, authorization, session client and locale/theme contracts remain in force.

## Route and UI

| Route                        | Access                     | Behavior                                                                                                                                  |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/packages?workspace=<uuid>` | Verified PO only           | `app/(app)/packages/page.tsx`; require actor, server-side PO guard before loading data; workspace parameter is selection, never authority |
| `/`                          | Existing signed-in landing | Show Packages link only to PO; final placement is ND-F9-5/F2 ND-5                                                                         |

Anonymous `/packages` redirects through existing middleware to `/login?next=%2Fpackages` (query retained when present); server actor requirement remains defense in depth. Signed-in non-PO gets `notFound()`/404 before management reads. No public package catalog or new public allow-list entry.

PO screen: workspace selector from authorized workspaces; semantic offers table with canonical package code, duration, current version, price/currency, commission percentage derived exactly from basis points and availability. Show authored AR/EN label for selected locale; do not translate content. Create-code form is separate from publication. Publish form requires package, preset buttons 1/3/6/8/12 or custom days, both names, price labeled **minor units**, currency and explicit commission basis points. All financial fields start blank, including rate; no catalog defaults. Initial offer is unavailable and requires separate confirmed toggle. Preset choices are UI controls, not preselected catalog data.

Reuse `Field`, `Button`, `Alert`, `States`, `ConfirmDialog`, existing tokens, logical CSS and theme/locale controls. Dialog identifies code/duration/workspace safely, supports cancel, traps/restores focus, and waits for confirmed mutation result. Show pending state, empty workspace/catalog/offers, generic load/save error and retry; do not represent failed writes as saved. Switching workspace resets stale form/offer state and discards late results from the previous selection. No hidden commission in Sales/Trainer props, HTML, RSC or error text.

## Public database RPCs

All calls carry the current user's JWT via the server session client; never an admin/service-role client. Authenticated has EXECUTE; PUBLIC/anon/service_role do not. SECURITY DEFINER with empty search path and explicit signed actor/workspace checks is specified in the data model.

| RPC                               | Named JSON input                                           | Successful value                                                            |
| --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `create_package`                  | `{code: string}`                                           | canonical package UUID; existing UUID on exact code replay                  |
| `publish_package_version`         | `{workspace_id: uuid, package_id: uuid, duration_months: 1 | 3                                                                           | 6   | 8   | 12  | null, duration_days: integer, name_ar: string, name_en: string, price_minor: decimal-integer-string, currency: string, commission_rate_bp: integer}` | published version UUID; current version UUID for exact current-payload replay |
| `set_package_offer_available`     | `{workspace_id: uuid, offer_id: uuid, available: boolean}` | offer UUID, including same-state no-op                                      |
| `get_package_version_commissions` | `{workspace_id: uuid}`                                     | rows `{version_id, commission_rate_bp}` for requested workspace; PO/WO only |

SQL signatures/types and constraints are exact in [data-model.md](../data-model.md#database-api-and-transaction-rules). JSON integer strings preserve bigint input. Required NULLs are rejected; only `duration_months` may be NULL. Currency text is validated before char(3) conversion. No `published_by`, timestamp, version number, current pointer or initial availability is supplied by the caller.

Mutation failure codes: `42501/not_permitted` for authorization, missing/foreign workspace/offer/package; `22023/invalid_input` for authorized scalar/representation validation. Database guard violations use `23514`; accidental constraint/provider text never crosses the app boundary. Malformed UUIDs at the app boundary are `denied` so targets are not probed; authorized malformed scalar terms are `invalid_input`. Direct RPC typed-argument parser errors are not forwarded to users. Failed writes and no-ops create no business audit event.

**Replay semantics**: Full exact terms equal to the offer's CURRENT version are a replay: return current id without insert, pointer change or event. Any other payload, including older non-current terms, appends N+1 and becomes current with one publication event. v1 -> v2 -> v1 terms therefore creates current v3 with v1 terms. Concurrent distinct calls serialize; which distinct payload gets the next number follows lock acquisition, not client request time. Retries after successful publication deduplicate while their payload equals current.

## Server actions and results

`app/(app)/packages/actions.ts` exports the following actions; `lib/packages/service.ts` owns testable server-only orchestration. Inputs may come from FormData but must be parsed once with shared pure validation, never trusted casts.

| Action                     | Input                                                                                                            | Result                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `createPackage`            | `{workspaceId, code}`                                                                                            | `{status:'ok', packageId}` or `denied | invalid_input | unavailable` |
| `publishPackageVersion`    | `{workspaceId, packageId, durationMonths, durationDays, nameAr, nameEn, priceMinor, currency, commissionRateBp}` | `{status:'ok', versionId}` or `denied | invalid_input | unavailable` |
| `setPackageOfferAvailable` | `{workspaceId, offerId, available}`                                                                              | `{status:'ok', offerId}` or `denied   | invalid_input | unavailable` |

Failures are exactly `{status:'denied'|'invalid_input'|'unavailable'}`, with translated generic text selected locally. No raw SQL/provider error, data echo, constraint name, stack, code-existence distinction or `console.*`. `lib/packages/results.ts` maps known `42501` to denied, controlled `22023/invalid_input` to invalid_input; unknown/network/env/guard failures to unavailable. Validation exposes only stable generic field codes where needed, never server details.

Every mutation: verified actor → require PO and `authorize(actor,'set_package_pricing',workspaceId)` → validate → session-client RPC → map result → revalidate `/packages` on success. No actor returns denied for actions. For the global `create_package` RPC the action uses the selected workspace as app authorization context; the database separately checks PO/capability without inventing a package workspace. PO can manage all real workspaces without membership. Validate the selected workspace exists through scoped reading before code creation; a missing selection gets a generic failure. Re-derive actor per request; never accept a browser role/membership. Availability action has no optimistic persisted success before RPC returns.

## Read surfaces and server helper

| Surface                                       | Projection / scope                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages`                                    | id, code, created_at, created_by; PO all; staff only when accessible offer exists                                                                                                             |
| `package_offers`                              | all offer fields under forced workspace RLS; no mutation grants                                                                                                                               |
| `package_versions_safe`                       | `workspace_id,id,offer_id,version,name_ar,name_en,price_minor::text AS price_minor,currency,duration_days,duration_months,published_at,published_by`; `security_invoker=true`; no rate column |
| Base `package_versions` explicit safe columns | Same RLS; column SELECT only, no commission; wildcard or explicit commission request fails for authenticated                                                                                  |
| `get_package_version_commissions`             | rate projection for PO/WO only, explicit workspace scope; Sales/Trainer denied even with forged input                                                                                         |
| Existing audit read                           | Unchanged PO/WO-only scoped audit RLS; Sales/Trainer cannot read rate from published-event details                                                                                            |

`lib/packages/read.ts` is server-only. `loadPackageOffers(actor, workspaceId)` first checks `authorize(actor,'generate_registration_link',workspaceId)`, then uses the session client with explicit projections and workspace filters to return `{status:'ok', packages, offers, versions}` or denied/unavailable. Rates are added only after explicit PO/WO role check and the commission RPC; rates are omitted entirely from other results (not hidden by CSS, not set to zero). Management loader additionally requires PO and `authorize(actor,'set_package_pricing',workspaceId)` before calling the shared loader. No cross-user/workspace server cache. Exact price transport uses the safe view; do not coerce an unsafe JSON number back to a supposed exact bigint.

No staff UI is added here. These read contracts are tested now and are reusable by F10; nonexistent or foreign single targets have generic outcomes, while RLS collection reads return an empty scoped collection. Unavailable/historical rows remain readable in scope; sellable selection must later filter available + current.

## Pure package library

- `lib/packages/validation.ts`: slug regex, names 1..120 Unicode code points and nonblank, preset/day parity, custom positive whole days, positive decimal integer price within bigint, currency ASCII uppercase format, explicit integer basis points 0..10000. Reject coercive booleans/empty strings/NaN/infinities, fractional or unsafe integer inputs. Use bigint for price; JS Number is safe only for bounded days/rate. Numeric technical limits match SQL.
- `lib/packages/money.ts`: exact `formatMinorUnits(priceMinor: string|bigint,currency:string,locale:'ar'|'en')`; localized grouping/bidi and currency minor-unit exponent from runtime currency metadata, never `Number(priceMinor)` with rounding. Unknown format-valid currency gets exact `minor units + code` fallback. Tests use synthetic currency examples, not approved catalog defaults.
- `lib/packages/results.ts`: typed result unions and controlled RPC error mapping; no dependency on UI or logging.

No new dependencies or environment variables. Existing server-only modules and test harness remain authoritative.

## Downstream F10/F12 boundary

Token issuance binds `(workspace_id, package_version_id)` selected server-authoritatively from an available offer/current version. Purchase snapshots copy version id, canonical identity, price_minor, currency, commission_rate_bp and duration. Subscriptions also snapshot installment schedule, whose total equals approved price (D-17). Commission is earned only on confirmed collections at snapshot rate (D-13). F9 implements none of these downstream records or financial calculations; it supplies immutable terms and restrictive composite identities. Disabling an offer does not mutate existing versions or historical references.
