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

**Baseline note**: the RPC table below is the shipped pre-S31 F9 contract. The S31 delta adds approved market/type inputs and the market/currency matrix; after T042 ships, the format-only `publish_package_version` path MUST fail closed and the S31 signature becomes the only accepted one. Final parameter placement and shape are selected with SK-009-06.

| RPC                               | Named JSON input                                           | Successful value                                                            |
| --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `create_package`                  | `{code: string}`                                           | canonical package UUID; existing UUID on exact code replay                  |
| `publish_package_version` | `{workspace_id: uuid, package_id: uuid, duration_months: 1 \| 3 \| 6 \| 8 \| 12 \| null, duration_days: integer, name_ar: string, name_en: string, price_minor: decimal-integer-string, currency: string, commission_rate_bp: integer}` | published version UUID; current version UUID for exact current-payload replay |
| `set_package_offer_available`     | `{workspace_id: uuid, offer_id: uuid, available: boolean}` | offer UUID, including same-state no-op                                      |
| `get_package_version_commissions` | `{workspace_id: uuid}`                                     | rows `{version_id, commission_rate_bp}` for requested workspace; PO/WO only |

SQL signatures/types and constraints are exact in [data-model.md](../data-model.md#database-api-and-transaction-rules). JSON integer strings preserve bigint input. Required NULLs are rejected; only `duration_months` may be NULL. Currency text is validated before char(3) conversion. No `published_by`, timestamp, version number, current pointer or initial availability is supplied by the caller.

Mutation failure codes: `42501/not_permitted` for authorization, missing/foreign workspace/offer/package; `22023/invalid_input` for authorized scalar/representation validation. Database guard violations use `23514`; accidental constraint/provider text never crosses the app boundary. Malformed UUIDs at the app boundary are `denied` so targets are not probed; authorized malformed scalar terms are `invalid_input`. Direct RPC typed-argument parser errors are not forwarded to users. Failed writes and no-ops create no business audit event.

**Replay semantics**: Full exact terms equal to the offer's CURRENT version are a replay: return current id without insert, pointer change or event. Any other payload, including older non-current terms, appends N+1 and becomes current with one publication event. v1 -> v2 -> v1 terms therefore creates current v3 with v1 terms. Concurrent distinct calls serialize; which distinct payload gets the next number follows lock acquisition, not client request time. Retries after successful publication deduplicate while their payload equals current.

## S31 market/type/currency contract delta

**Status**: the approved values/rules below are binding; physical owner/mutability, legacy-row
representation, promotional behavior, display copy and downstream propagation remain gated by
SK-009-05..SK-009-09. No client or RPC may infer an unapproved value.

### S31 publication input and result

The S31 publication surface MUST carry the approved market/type values according to the
SK-009-06 owner model and enforce this matrix before mutation:

| Market | Permitted currency | Prohibited currency |
|---|---|---|
| `egypt` | `EGP` | `USD`, `SAR`, every other code |
| `international` | `EGP`, `USD`, `SAR` | every other code |

FR-007 initial-unavailable behavior is unchanged: a newly created offer still starts unavailable,
publication never enables it, and only a separate confirmed PO availability action changes it.

If SK-009-06 selects fixed offer/package ownership, market/type are supplied when the offer/owner
is first created and later publications must match; if it selects version snapshots, every
publication supplies them. The exact input names below are therefore a contract family, not an
invented final signature:

```text
{ workspace_id, package_id, market, package_type,
  duration_months, duration_days, name_ar, name_en,
  price_minor, currency, commission_rate_bp }
```

For a fixed owner, the application may use a separate owner-assignment operation instead of
repeating the values on every publication, but the combined sequence MUST have one unambiguous
server-authoritative path and the old path MUST fail closed. The final named JSON/RPC contract is
selected with SK-009-06 and frozen in the forward migration.

Success returns the published version UUID as today. A prohibited market/currency pair, unknown
market/type, conflicting fixed owner value or invalid legacy treatment returns the existing generic
`invalid_input`/`denied` result with no existence disclosure. No version, pointer, offer or event is
created on rejection.

### Role and count contract

- PO alone may create/name/price/control a package, including market/type and availability.
- WO/Sales/Trainer are denied create/name/price/control in every workspace, including their own.
- Sales/Trainer remain unable to retrieve commission through direct, wildcard, joined, embedded,
  audit, safe-view or alternate supported paths.
- Distinct package codes coexist in one workspace with independent current-version pointers and
  version sequences. S34-PO-1 supersedes this historical S31 count rule: each workspace has exactly four immutable market/type categories.

### Read contract

Authorized package reads expose the approved market/type machine values from the PO-selected owner.
A version exposes its own exact `price_minor` and `currency`; market never changes the amount's
currency. Reads MUST NOT return:

- a converted or derived amount;
- an exchange rate or reference-currency field;
- a total/sum across currencies; or
- an unapproved legacy classification presented as Egypt/International or Year-round/Promotional.

If SK-009-05 selects an approved legacy state, its safe projection and exact AR/EN display copy are
part of the PO-approved contract. Until then, no legacy state is invented.

### `/packages` UI contract

The PO screen adds market and type to the create/publish/review journey only after the selected
owner model and SK-009-08 copy are approved. It MUST:

- show the current package's market/type and exact own-currency amount;
- reject prohibited currency before submission and show a generic field error;
- never display a combined cross-currency total or converted amount;
- preserve PO-only server authorization and required loading/empty/error/save states;
- use only PO-approved Arabic/English labels (no machine translation of authored package names);
- pass the Frontend Design Gate for AR-RTL/EN-LTR × light/dark × mobile/desktop with keyboard and
  accessibility evidence.

`Promotional` behavior is settled by S33-PO-6: Africa/Cairo start-inclusive/end-exclusive approved
periods; expiry prevents new links while issued links retain snapshots. This supersedes the earlier
S31 undecided wording. English and other unapproved UI copy remains BLOCKED-COPY.

### Downstream F10/F12 boundary

The shipped registration-link RPC copies the package version's price and currency; F12 copies that
currency through subscription/installment/payment/refund snapshots and requires same-currency
totals. The final S31 rule is SK-009-09:

- if same-currency propagation is approved, F10/F12 require no conversion field and continue to
  snapshot the package version's own currency;
- if a different downstream currency is approved, a new PO-approved conversion source, timestamp,
  rounding and immutable snapshot contract is required before implementation; and
- mixed-currency installments/totals are not implied by S31 and remain outside this contract.

## Server actions and results

`app/(app)/packages/actions.ts` exports the following actions; `lib/packages/service.ts` owns testable server-only orchestration. Inputs may come from FormData but must be parsed once with shared pure validation, never trusted casts.

| Action                     | Input                                                                                                            | Result                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `createPackage`            | `{workspaceId, code}`                                                                                            | `{status:'ok', packageId}` or `denied \| invalid_input \| unavailable` |
| `publishPackageVersion`    | `{workspaceId, packageId, durationMonths, durationDays, nameAr, nameEn, priceMinor, currency, commissionRateBp}` | `{status:'ok', versionId}` or `denied \| invalid_input \| unavailable` |
| `setPackageOfferAvailable` | `{workspaceId, offerId, available}`                                                                              | `{status:'ok', offerId}` or `denied   \| invalid_input \| unavailable` |

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

- `lib/packages/validation.ts`: slug regex, names 1..120 Unicode code points and nonblank, preset/day parity, custom positive whole days, positive decimal integer price within bigint, market/type domain validation, market-conditional currency validation (Egypt=EGP; International=EGP/USD/SAR), and explicit integer basis points 0..10000. Reject coercive booleans/empty strings/NaN/infinities, fractional or unsafe integer inputs. Use bigint for price; JS Number is safe only for bounded days/rate. Numeric technical limits match SQL. The generic three-letter currency format check is not sufficient for S31 publication.
- `lib/packages/money.ts`: exact `formatMinorUnits(priceMinor: string|bigint,currency:string,locale:'ar'|'en')`; localized grouping/bidi and currency minor-unit exponent from runtime currency metadata, never `Number(priceMinor)` with rounding. Unknown format-valid currency gets exact `minor units + code` fallback. Tests use synthetic currency examples, not approved catalog defaults.
- `lib/packages/results.ts`: typed result unions and controlled RPC error mapping; no dependency on UI or logging.

No new dependencies or environment variables. Existing server-only modules and test harness remain authoritative.

## Downstream F10/F12 boundary

Token issuance binds `(workspace_id, package_version_id)` selected server-authoritatively from an available offer/current version. Purchase snapshots copy version id, canonical identity, price_minor, currency, commission_rate_bp and duration. Subscriptions also snapshot installment schedule, whose total equals approved price (D-17). Commission is earned only on confirmed collections at snapshot rate (D-13). Under the recommended SK-009-09 option, each downstream monetary record keeps the package version's own currency and no conversion occurs. F9 implements none of these downstream records or financial calculations; it supplies immutable terms and restrictive composite identities. Disabling an offer does not mutate existing versions or historical references.

## S34-PO-1 logical contract delta (future implementation)

- Each workspace exposes exactly four immutable market/type category pairs. Both markets may be active simultaneously. Promotional availability obeys its approved Africa/Cairo start-inclusive/end-exclusive period; expiry affects new-link creation only, and issued-link snapshots remain unchanged.
- PO-only configuration covers workspace-specific package names, prices and package-specific commissions. WO attempts are denied. Commercial edits append versions; existing client/assignment snapshots remain stable. Market/type cannot be changed.
- Dashboard semantics are actual monthly collections and package-specific commission with installment detail (due dates, paid and remaining amounts). Settlement/accounting rows remain separate. Converted commission is PO/WO-only; Sales/Trainer remain denied.
- C5 deletion must execute a read-only target-stack preflight first, enumerating FK edges, registration links, subscriptions, payments, audit rows and every other package reference. Non-synthetic data, required financial/audit dependencies or unknown state returns refusal/escalation with zero writes. Only a clean preflight allows mock deletion and initialization of four empty categories with no names/prices/commissions.
- Only exact Arabic labels «مصر», «دولي», «وقت العـروض», «طول السنـة» are approved. English labels and all other dashboard/Installments UI copy are BLOCKED-COPY.

## S32-PO-4 package management and FX contract delta (historical; superseded by S33-PO-6 / S34-PO-1 where noted)

The PO-only management surface controls workspace-specific names, prices and package-specific commissions; WOs cannot configure terms. Commercial edits append immutable versions and preserve prior client/assignment snapshots. Market/type are immutable under C1 and included in S33-11's immutable snapshot. C5 governs existing mock deletion; S33-02 soft-retirement applies to future real packages. Only non-approved UI copy remains BLOCKED-COPY.

Promotional categories use approved Africa/Cairo start-inclusive/end-exclusive periods. Expiry stops new links only; issued links retain snapshots (S33-PO-6 S33-05/06).

Historical FX reporting preserves source transaction/settlement currency and separate settlement records. It uses Africa/Cairo transaction dates, previous published business-day rates, verified Frankfurter data, exact EGP identity rate, and idempotent rate-pending retries excluded from totals until fetched. Converted commission remains PO/WO-only; Sales/Trainer are denied (S33-PO-6). Provider requests exclude client/workspace data.
