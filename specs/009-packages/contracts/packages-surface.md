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

**Baseline note**: the RPC table below describes the shipped pre-S31 F9 contract. The S31 delta adds market/type and currency validation. The old format-only `publish_package_version` path MUST fail closed when the approved delta ships. This table is not the final S31 contract. Under S34-PO-6 (PD-S34-NEW-01=A) the package row is the category: the final publication path targets an existing category package row by `package_id`, takes no market/type input and derives the market from that row; the old path fails closed. Exact final signatures are defined in T042 under this model, and any market literal is BLOCKED by PD-S34-NEW-02.

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

**Status**: S33-PO-6, S34-PO-1 and S34-PO-2 settle the recorded logical rules and four English/Arabic market/type label pairs. S34-PO-6 settles category persistence identity (the package row is the category). PD-S34-NEW-02 keeps the canonical market literal blocked. All other dashboard/Installments/empty/error/help copy remains BLOCKED-COPY. No client or RPC may infer an unapproved value.

### S31 publication input and result

The future S31 publication surface MUST enforce the approved market/type values and this currency matrix before mutation. The values identify one of the four fixed categories, each a workspace-scoped package row (S34-PO-6). The currency check uses the market stored on the package row. The market tokens in the first column are **display-only placeholders pending PD-S34-NEW-02** (canonical literal `egypt`/`international` vs `Egypt`/`International`, no wire/storage mapping decided); they are not normative and MUST NOT be implemented as a validator, RPC or test literal until the PO decides:

| Market (label) | Permitted currency | Prohibited currency |
|---|---|---|
| Egypt (literal pending PD-S34-NEW-02) | `EGP` | `USD`, `SAR`, every other code |
| International (literal pending PD-S34-NEW-02) | `EGP`, `USD`, `SAR` | every other code |

FR-007 initial-unavailable behavior is unchanged: a newly created offer still starts unavailable,
publication never enables it, and only a separate confirmed PO availability action changes it.

The logical invariant is settled: market/type are immutable category attributes and market/type are included in S33-11 immutable snapshots. Parameter flow under S34-PO-6 (illustrative field sets; exact names and types are fixed in T042, and the market literal is BLOCKED by PD-S34-NEW-02):

```text
category initialization (PO-only): { workspace_id, market, type }
publication:                       { workspace_id, package_id,
                                     duration_months, duration_days, name_ar, name_en,
                                     price_minor, currency, commission_rate_bp }
```

Market/type are supplied only at category initialization and are stored immutably on the package row. Publication carries no market/type; the server derives the market from the target package row in the requested workspace. The contract provides one server-authoritative path, and the old format-only path MUST fail closed.

Success returns the published version UUID under the final approved contract. A prohibited market/currency pair, unknown market/type, invalid request or rejected category identity returns the existing generic `invalid_input`/`denied` result with no existence disclosure. No version, pointer, offer or event is created on rejection.

### Role and count contract

- PO alone may create/name/price/control a package, including market/type and availability.
- WO/Sales/Trainer are denied create/name/price/control in every workspace, including their own.
- Sales/Trainer remain unable to retrieve commission through direct, wildcard, joined, embedded,
  audit, safe-view or alternate supported paths.
- The historical S31 open-ended count rule is superseded by C3: each workspace has exactly four logical market/type category slots. The category is the package row, unique on `(workspace_id, market, type)` (S34-PO-6).

### Read contract

Authorized package reads expose the approved market/type machine values from the category package row (S34-PO-6), using the canonical literal decided under PD-S34-NEW-02.
A version exposes its own exact `price_minor` and `currency`; market never changes the amount's
currency. Reads MUST NOT return:

- a converted or derived amount;
- an exchange rate or reference-currency field;
- a total/sum across currencies; or
- an unapproved legacy classification presented as Egypt/International or Year-round/Promotional.

S34-PO-1 C5 resolves the existing package rows as mocks; no row-by-row classification or default is applied. Before removal, the target-stack preflight verifies synthetic-only status and every dependency under FR-028.

### `/packages` UI contract

The PO screen adds market and type to the create/publish/review journey on the category package row (S34-PO-6); machine literals behind the labels are pending PD-S34-NEW-02. The four Arabic/English label pairs are approved by LABELS and S34-PO-2. It MUST:

- show the current package's market/type and exact own-currency amount;
- reject prohibited currency before submission and show a generic field error;
- never display a combined cross-currency total or converted amount;
- preserve PO-only server authorization and required loading/empty/error/save states;
- use only PO-approved Arabic/English labels (no machine translation of authored package names);
- pass the Frontend Design Gate for AR-RTL/EN-LTR × light/dark × mobile/desktop with keyboard and
  accessibility evidence.

`Promotional` behavior is settled by S33-PO-6: Africa/Cairo start-inclusive/end-exclusive approved
periods; expiry prevents new links while issued links retain snapshots. This supersedes the earlier
S31 undecided wording. The four English/Arabic market/type label pairs are approved by LABELS and S34-PO-2; other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY.

### Downstream F10/F12 boundary

The existing F10/F12 boundaries remain outside this F9 implementation scope. S33-PO-6/C4 settle reporting conversion and separate settlement/accounting-record semantics; do not alter downstream financial schema here. Any later downstream currency change requires its applicable PO decision and feature contract.

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
- C5 deletion must execute a read-only target-stack preflight first, enumerating FK edges, registration links, subscriptions, payments, audit rows and every other package reference. Non-synthetic data, required financial/audit dependencies or unknown state returns refusal/escalation with zero writes. Only a complete clean preflight allows safe mock deletion; preserve required client/financial/audit history and reject partial completion. The cleanup path is explicit and limited to verified synthetic targets; it cannot weaken general immutability, audit, RLS or restrictive-reference protections or cascade into protected dependencies. Initialization creates four empty category package rows per workspace with no names/prices/commissions; the market literal is blocked by PD-S34-NEW-02. The teardown mechanism for protected immutable version rows is not specified and no guard exception is authorized; it requires a separate security design and review (T070), and until then mock packages with attached offers/versions make the preflight refuse.
- The approved pairs are Egypt/«مصر», International/«دولي», Promotional/«وقت العـروض», and Year-Round/«طول السنـة». Arabic strings include exact tatweel. All other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY.

## S32-PO-4 package management and FX contract delta (historical; superseded by S33-PO-6 / S34-PO-1 where noted)

The PO-only management surface controls workspace-specific names, prices and package-specific commissions; WOs cannot configure terms. Commercial edits append immutable versions and preserve prior client/assignment snapshots. Market/type are immutable under C1 and included in S33-11's immutable snapshot. C5 governs existing mock deletion; S33-02 soft-retirement applies to future real packages. Four English/Arabic market/type label pairs are approved; only other UI copy remains BLOCKED-COPY. Category identity is the package row (S34-PO-6); the market literal remains blocked by PD-S34-NEW-02.

Promotional categories use approved Africa/Cairo start-inclusive/end-exclusive periods. Expiry stops new links only; issued links retain snapshots (S33-PO-6 S33-05/06).

Historical FX reporting preserves source transaction/settlement currency and separate settlement records. It uses Africa/Cairo transaction dates, previous published business-day rates, verified Frankfurter data, exact EGP identity rate, and idempotent rate-pending retries excluded from totals until fetched. Converted commission remains PO/WO-only; Sales/Trainer are denied (S33-PO-6). Provider requests exclude client/workspace data.
