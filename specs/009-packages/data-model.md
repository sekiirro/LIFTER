# Data Model: Packages & Package Versions (P1-F9)

The shipped baseline is `supabase/migrations/20261029120000_packages.sql` (PR #9 merge
`b565d4c`, implementation tip `b359985`). Never edit that committed migration or any later shipped
migration. The S31 delta is a **new** forward migration,
`supabase/migrations/20261106125000_f9_package_markets_types_currency.sql` (provisional filename
until implementation). S33-PO-6, S34-PO-1 and S34-PO-2 settle the logical owner/version, operational rules and four English/Arabic market/type label pairs. Other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY. Category persistence identity is settled by S34-PO-6 (PD-S34-NEW-01=A): the package row is the category. The canonical market literal is settled by S35-PO-1 F9=A (option A): title-case `Egypt`/`International` as both the wire value and the stored value.

The shipped baseline extended `app_private.audit_row_change()` from its latest complete body in
`20261028120000_auth_recovery_links.sql`, preserving workspace, staff, membership, jobs and recovery
mappings. Reuse `has_workspace_access`, `is_platform_owner`, `current_staff_role`,
`role_has_capability`, `audit_events_immutable` and `forbid_delete`; the existing PO-only
`set_package_pricing` capability does not change. The S31 forward migration must extend the latest
integrated audit body without dropping any existing branch.

All UUID primary keys default to `gen_random_uuid()`. All columns are NOT NULL unless explicitly marked nullable. Referenced identity/workspace rows use restrictive deletion, never cascade. Business fields have no default except the explicit conservative availability state described below. No seed data.

## `public.packages` — canonical platform identity (FR-001)

| Column     | Type        | Rule                                                                                   |
| ---------- | ----------- | -------------------------------------------------------------------------------------- |
| id         | uuid PK     | Stable canonical identity                                                              |
| code       | text        | UNIQUE; `code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`; lowercase ASCII slug, no label dependency |
| created_at | timestamptz | DEFAULT `now()`                                                                        |
| created_by | uuid        | DEFAULT `auth.uid()`; FK `staff_profiles(user_id)` ON DELETE RESTRICT; verified PO     |

Platform-owned, so no `workspace_id`. `packages_no_update` rejects every UPDATE using `audit_events_immutable`; `packages_no_delete` row and `packages_no_truncate` statement guards use `forbid_delete`. This also protects attribution, not only code. Creation only through `create_package`; no direct API insert. A same-code create replay returns existing id, with no new row or event.

**S34-PO-6 delta (supersedes the platform-owned shape above for the S34 model; baseline migration is never edited).** The package row is the category (PD-S34-NEW-01=A). Through a forward migration the canonical package identity gains `workspace_id` (FK `workspaces(id)` ON DELETE RESTRICT), immutable `market` and immutable `type`, with UNIQUE `(workspace_id, market, type)`. Commercial terms stay on `package_versions`. An offer MUST NOT reference a package row of a different workspace (workspace-consistent reference between `package_offers` and `packages`). Existing platform-owned rows are mocks handled only by C5; no row is mapped or reclassified. The exact column order, constraint names, retention or uniqueness of `code`, and RLS predicates are forward-migration design under T042; they MUST preserve the invariants in this section and in the S31 delta. The canonical market literal stored in `market` is `Egypt`/`International` per S35-PO-1 F9=A (the same title-case tokens as the wire value); the type values are not part of that decision.

## `public.package_offers` — workspace/category/duration/tier-rank identity (FR-002/003/007/034)

The tier-rank key is a logical forward-only extension to the shipped offer schema. T077 must add `tier_rank`, replace the old workspace/package/duration uniqueness with the rank-inclusive key, and extend publication input in a new migration; the shipped baseline migration is not edited.

| Column             | Type          | Rule                                                                                            |
| ------------------ | ------------- | ----------------------------------------------------------------------------------------------- |
| id                 | uuid PK       | UNIQUE `(workspace_id, id)`                                                                     |
| workspace_id       | uuid          | FK `workspaces(id)` ON DELETE RESTRICT                                                          |
| package_id         | uuid          | FK `packages(id)` ON DELETE RESTRICT                                                            |
| duration_days      | integer       | `duration_days >= 1`                                                                            |
| duration_months    | smallint NULL | Preset months, otherwise NULL for custom days                                                   |
| tier_rank          | smallint      | Immutable fixed rank: 1=Silver, 2=Gold, 3=Platinum                                              |
| available          | boolean       | DEFAULT `false`; only explicit PO toggle enables a new offer                                    |
| current_version_id | uuid NULL     | Same-workspace, same-offer published version pointer; transiently NULL during first publication |

Constraints:

- UNIQUE `(workspace_id, package_id, duration_days, tier_rank)`; preset 3 months and custom 90 days cannot create separate offers at the same tier rank, while different ranks may coexist at the same duration.
- CHECK `tier_rank IN (1,2,3)`, mapping the immutable ranks Silver, Gold, Platinum.
- CHECK `((duration_months IN (1,3,6,8,12) AND duration_days = duration_months * 30) OR (duration_months IS NULL AND duration_days >= 1))`, together with NOT NULL and `duration_days >= 1`. NULL is custom; explicit 2/4-month presets fail.
- FK `(workspace_id, current_version_id)` → `package_versions(workspace_id, id)` ON DELETE RESTRICT, added after both tables exist.
- Also FK `(workspace_id, current_version_id, id)` → `package_versions(workspace_id, id, offer_id)` ON DELETE RESTRICT. Add the referenced UNIQUE triple on versions. This prevents pointing at a different offer within the same workspace, which the pair alone cannot prevent.
- Index `(package_id, workspace_id)` supports canonical package visibility. The workspace/duration unique key and workspace/id unique key support scoped reads and FKs.

No API write grants/policies. Only publish inserts an offer; only publish changes current pointer and only availability RPC changes availability. `app_private.guard_package_offer_update()` rejects changes to `id`, `workspace_id`, `package_id`, `duration_days`, `duration_months`, `tier_rank` (`23514`); checks `has_workspace_access(OLD.workspace_id, 'set_package_pricing')` for any update; no override GUC. New RPCs run as postgres with caller `auth.uid()` retained. `package_offers_guard` is BEFORE UPDATE, row. Delete/truncate guards: `package_offers_no_delete` and `package_offers_no_truncate` via `forbid_delete`.

First publish creates the offer with NULL pointer, inserts version 1 and sets the pointer within the same transaction. No successful publish leaves NULL. No independent offer-creation endpoint exists. An existing offer's duration representation is fixed: same days with different `duration_months` is `invalid_input`, not an identity rewrite. Publication preserves existing availability.

## `public.package_versions` — immutable published terms (FR-004/005/006)

| Column             | Type          | Rule                                                                                                                                                                        |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                 | uuid PK       | UNIQUE `(workspace_id, id)`; UNIQUE `(workspace_id, id, offer_id)`                                                                                                          |
| workspace_id       | uuid          | FK `workspaces(id)` ON DELETE RESTRICT                                                                                                                                      |
| offer_id           | uuid          | Composite FK `(workspace_id, offer_id)` → `package_offers(workspace_id, id)` ON DELETE RESTRICT                                                                             |
| version            | integer       | `version >= 1`; UNIQUE `(offer_id, version)`                                                                                                                                |
| name_ar            | text          | `char_length(name_ar) BETWEEN 1 AND 120` AND `char_length(btrim(name_ar)) >= 1` AND `name_ar ~ '[^[:space:]]'`                                                              |
| name_en            | text          | `char_length(name_en) BETWEEN 1 AND 120` AND `char_length(btrim(name_en)) >= 1` AND `name_en ~ '[^[:space:]]'`                                                              |
| price_minor        | bigint        | `price_minor > 0`; signed bigint technical ceiling `9223372036854775807`; no default                                                                                        |
| currency           | char(3)       | `currency ~ '^[A-Z]{3}$'`; no default. Under S31 the effective set is market-conditional: Egypt=EGP only; International=EGP/USD/SAR; row-local format alone is insufficient |
| commission_rate_bp | integer       | `commission_rate_bp BETWEEN 0 AND 10000`; no default, zero must be explicit                                                                                                 |
| duration_days      | integer       | Positive duration copied from offer; same duration CHECK as offers                                                                                                          |
| duration_months    | smallint NULL | Copied exactly from offer, NULL-safe equality                                                                                                                               |
| published_at       | timestamptz   | DEFAULT `now()`                                                                                                                                                             |
| published_by       | uuid          | FK `staff_profiles(user_id)` ON DELETE RESTRICT; assigned from verified PO `auth.uid()`                                                                                     |

Package identity is resolved through the immutable offer relation; no redundant `package_id` column is needed on versions. `app_private.guard_package_version_insert()` BEFORE INSERT verifies the referenced offer in the same workspace and exact snapshot equality (`IS NOT DISTINCT FROM` for months), price/rate/name/currency validation and PO authority. The S31 forward migration additionally enforces the market/currency matrix at the selected owner. Database constraints enforce row-local ranges too. This prevents privileged SQL test inserts from bypassing snapshot parity. SQL and pure validation reject required NULLs, blanks and invalid ranges; labels are stored/displayed as authored, not translated or silently trimmed.

`package_versions_no_update` BEFORE UPDATE row uses `audit_events_immutable`; `package_versions_no_delete` BEFORE DELETE row and `package_versions_no_truncate` BEFORE TRUNCATE statement use `forbid_delete`. They reject DML for all roles, including service_role and postgres; do not make an owner/service exception. Grants are a separate wall, so postgres DML tests must prove trigger behavior, and service-role tests temporarily grant DML in a rolled-back transaction to avoid merely testing missing grants. Superuser DDL/disabled triggers are not preventable by application RLS; mutation tests detect their removal.

## S31 market/type and currency delta (FR-015..FR-021)

### Invariants fixed by the PO

- The exact approved label pairs are Egypt/«مصر», International/«دولي», Promotional/«وقت العـروض», and Year-Round/«طول السنـة». Copy Arabic strings exactly including tatweel. Other dashboard/Installments/empty/error/help UI copy remains BLOCKED-COPY.
- Egypt → `EGP` only. International → `EGP | USD | SAR`. Every other currency is invalid even if it
  satisfies the former three-letter format check.
- A package version keeps its exact minor-unit amount/currency. Only transaction-date EGP reporting conversion is permitted; no package-price conversion or mixed-currency total is introduced.
- Each workspace has exactly four immutable category identities. Both markets may operate simultaneously.
- PO is the only actor who may create/name/price/control packages. WO/Sales/Trainer denial and
  Sales/Trainer commission denial are unchanged.
- Existing `package_versions` rows are immutable. The forward migration cannot update, delete,
  truncate or rewrite their identifiers or financial/duration terms.

### Owner and mutability (settled)

Market/type are immutable and the S33-11 immutable version snapshot holds them. C1 supersedes S32-PO-4 SK-009-06 market/type mutability and S33-07 for these attributes only. Commercial terms remain PO-controlled and versioned; prior client/assignment snapshots are preserved. S34-PO-6 (PD-S34-NEW-01=A) settles the owner: the package row is the category, workspace-scoped, immutable in market/type and unique on `(workspace_id, market, type)`; versions hold commercial terms. Market/type are stored on the package row and copied into each version snapshot (S33-11); a version's market is derived from its package row and is never a caller-supplied publication input. The canonical market literal is `Egypt`/`International` per S35-PO-1 F9=A (option A: title-case tokens as the wire and stored value).

The implementation must preserve the approved immutable snapshot invariant in the data model, RPC, read contract and tests.

### Existing mock packages (C5)

S34-PO-1 declares all existing package rows mock data and supersedes S32-PO-4 SK-009-05/S33-01 mapping for these rows. Before removal, a read-only target-stack preflight verifies synthetic-only status and enumerates every dependency: FK edges, registration links, subscriptions, payments, audit rows, and all other package references. Any non-synthetic row, required financial/audit dependency, or unknown state requires refusal/escalation before writes. After a complete clean preflight, safely delete obsolete mock packages while preserving required client, financial and audit history; partial completion is not accepted. The C5 path is explicit and limited to verified synthetic targets; it must not disable or weaken general immutability, audit, RLS or restrictive-reference protections, or cascade into protected dependencies. After a clean preflight, exactly four empty category package rows per workspace (one per `(workspace_id, market, type)`, no names, prices or commissions) are initialized; the market literal used is `Egypt`/`International` per S35-PO-1 F9=A. The immutable version rows and restrictive references attached to mock packages are protected by FR-006: this document does not define a teardown mechanism and authorizes no guard exception. Until a separate security design and independent review (T064b) specifies an atomic, audited, workspace-scoped teardown that preserves FR-006, any mock package that still has attached offers or versions is a protected dependency and the preflight refuses. The existing `packages_no_delete` guard (and its `packages_no_truncate` sibling) on `public.packages` is likewise an existing constraint the C5 teardown MUST satisfy: no mock package, including one with no attached offers or versions, is deletable while that guard stands. The teardown mechanism is BLOCKED pending a future security review (T064b design scope includes this guard); this document introduces no guard exception and no mechanism, and the preflight refuses for every mock package until such a reviewed design exists. Future real packages follow S33-PO-6 soft-retirement; historical records are preserved.

### Conditional publication contract

Market/type are assigned once when the category package row is initialized and are included in the S33-11 immutable snapshot; publication takes no market/type input and cannot mutate them. Commercial edits use new versions and preserve client/assignment snapshots. The publication path MUST:

1. re-derive the signed actor and require PO + `set_package_pricing` before target lookup;
2. resolve the target package row in the requested workspace, read its stored market, and validate the market/currency matrix against that stored market before advisory/row locks or inserts;
3. create/find the offer using the workspace/package/duration/tier-rank identity;
4. preserve the current-only exact-payload replay rule; market/type are not publication payload fields, so they do not participate in payload equality (they are fixed by the package row);
5. insert the next immutable version, move the current pointer and emit one publication event
   atomically; and
6. reject a prohibited currency before any offer, version, pointer or event mutation.

The forward migration should expose one unambiguous S31 publication RPC/overload. The old
publication path must not remain a bypass: revoke its EXECUTE grant or replace it with an explicit
fail-closed rejection that requires market/type and cannot infer them. No old caller may publish a
format-valid but market-prohibited currency after the forward migration.

### Conditional read/RLS and audit delta

- Market/type are not sensitive financial columns and may be exposed to the same authorized
  package readers defined by FR-008; this grants no new audience. Commission remains absent from
  Sales/Trainer paths.
- Read projections must expose the approved market/type values under the authorized scope from the package row (S34-PO-6) and the S33-11 immutable version snapshot, using the canonical literal decided under S35-PO-1 F9=A (`Egypt`/`International`). No projection may expose an unapproved legacy label.
- No direct UPDATE grant is added. Any mutation or initialization path is PO-authorized and audited; its category identity is the package row (S34-PO-6) and its exact RPC signature is T042 design; the market literal in it is `Egypt`/`International` per S35-PO-1 F9=A. Existing immutable-history protections remain in force.
- Audit details may include only the machine market/type values and the actual business transition;
  no free text, labels, PII or currency-conversion data enters audit records. Event count and
  allow-lists are specified with the selected candidate before implementation.
- RLS/catalog/parity tests must prove market/type cannot cross workspaces and cannot create a
  second mutation path for WO/Sales/Trainer.

### Conditional downstream contract

Current shipped F10/F12 records preserve package-version price/currency snapshots and same-currency
totals. This remains unchanged for transactions and actual settlements. The separate S33-PO-6
transaction-date EGP conversion is for collections/commission reporting only; it does not rewrite
downstream snapshots, change existing payment rules, or create package-price conversion or mixed-currency totals.

## Database API and transaction rules

**Baseline note (z3cEA)**: the table below is the shipped pre-S31 baseline, not the final contract. Under S34-PO-6 the final publication path takes the category package row by `package_id` in the requested workspace, accepts no market/type input, derives the market from that row, and the old format-only `publish_package_version` signature fails closed when the forward migration ships. Category initialization creates the workspace-scoped package row with its immutable market/type (market literal `Egypt`/`International` per S35-PO-1 F9=A). Exact final signatures are defined in T042 under this model.

Required parameters are exactly those in the final signatures below; `tier_rank` is required for publication. No extra request-key store is added.

| Function                                                                                                                                                                                                                             | Return                                                | Authorization / effects                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.create_package(code text)`                                                                                                                                                                                                   | uuid                                                  | Non-null `auth.uid()` and `is_platform_owner()` plus PO pricing capability; insert canonical code or return existing id on unique conflict                 |
| `public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint, duration_days integer, tier_rank smallint, name_ar text, name_en text, price_minor bigint, currency text, commission_rate_bp integer)` | uuid                                                  | `has_workspace_access(workspace_id, 'set_package_pricing')`; workspace/package must exist; create/find offer, append version and update pointer atomically |
| `public.set_package_offer_available(workspace_id uuid, offer_id uuid, available boolean)`                                                                                                                                            | uuid (offer id)                                       | Same PO pricing guard; scoped offer lookup, lock row, change only if `available IS DISTINCT FROM` requested state                                          |
| `public.get_package_version_commissions(workspace_id uuid)`                                                                                                                                                                          | TABLE `(version_id uuid, commission_rate_bp integer)` | PO or active WO in requested workspace only; returns that workspace's version rates, never other workspaces                                                |

All four public functions: SECURITY DEFINER, owner postgres, `SET search_path = ''`, fully qualified relations, execute revoked from PUBLIC/anon/authenticated/service_role, then granted only to authenticated. Commission reader is STABLE, mutations are VOLATILE. No service-role RPC use in the app. Unauthorized/null identity is `42501/not_permitted`. Unknown workspace, package or foreign/missing offer maps to the same denial, never a raw FK/existence error. Invalid authorized input is `22023/invalid_input`; unexpected database failures are not exposed by the app. Authorize before looking up requested entities; reject missing required args (SQL NULL must not pass a predicate accidentally).

Private trigger functions `guard_package_offer_update()` and `guard_package_version_insert()` are SECURITY DEFINER, owner postgres, empty search path, execute revoked from PUBLIC/anon/authenticated/service_role. Do not grant private mutation helpers to API callers. Existing reused guards retain their current invoker status and grants.

### Concurrency and replay identity (FR-005)

1. After authorization and scalar validation (including requiring `tier_rank` in 1..3), acquire a transaction advisory lock keyed by a namespaced hash of `(workspace_id, package_id, duration_days, tier_rank)`. Acquire before offer lookup/creation, including when no offer row exists. Hash collisions serialize extra unrelated work safely.
2. Verify referenced workspace/package, create the offer if absent (`available=false`), then lock its row FOR UPDATE. A competing availability RPC locks the same offer row; keep lock ordering consistent (publication advisory lock → row lock; availability row lock only).
3. Reject conflicting duration-month representation for the existing key. Copy duration from the locked offer, not from unchecked request data.
4. Compare the complete published payload against the offer's CURRENT version only: exact `name_ar`, `name_en`, `price_minor`, `currency`, `commission_rate_bp`, `duration_days`, NULL-safe `duration_months`. Equality is the replay key. If equal, return the current version id; do not insert, change the pointer/availability or emit an event. Comparison is after locking, so concurrent identical requests deduplicate.
5. Otherwise allocate `coalesce(max(version),0)+1` under the same lock, insert and set `current_version_id`. The unique constraint remains a backstop. Any failure, including audit insertion, rolls back offer/version/pointer/events. Overflow fails safely; no policy max is invented.

Retries identical to current deduplicate after a successful publication. Any other payload, including one equal to an older non-current version, allocates N+1 and moves current with one publication event. Thus v1 -> v2 -> v1 terms creates v3 with v1 terms. No request key or catalog policy is added.

## Forced RLS, column grants and read surfaces (FR-008/009)

Enable AND FORCE RLS on all three tables. Revoke all default privileges (including service_role); grant only the following SELECT access to authenticated. No INSERT/UPDATE/DELETE/TRUNCATE grants or mutation policies for any API role. Postgres-owned guarded RPCs are the deliberate write boundary.

| Relation / policy                            | SELECT predicate / grant                                                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages_select_scoped` on packages         | `is_platform_owner()` OR EXISTS accessible offer with `package_id = packages.id` and `has_workspace_access(offer.workspace_id, 'generate_registration_link')`; SELECT all package columns |
| `package_offers_select_scoped` on offers     | `has_workspace_access(workspace_id, 'generate_registration_link')`; SELECT all offer columns                                                                                              |
| `package_versions_select_scoped` on versions | `has_workspace_access(workspace_id, 'generate_registration_link')`; column-level SELECT on all version columns EXCEPT `commission_rate_bp`; never table-level SELECT                      |
| `public.package_versions_safe`               | View with `security_invoker=true`, explicit projection of the safe columns listed below; authenticated SELECT only; no owner-bypass view                                                  |

Safe projection: `workspace_id, id, offer_id, version, name_ar, name_en, price_minor::text AS price_minor, currency, duration_days, duration_months, published_at, published_by`. The view returns price as an exact decimal integer string; the underlying column remains bigint. Base version wildcard SELECT fails because commission lacks a grant, even for PO/WO through the shared authenticated DB role. The safe view succeeds under caller RLS. Direct explicit-safe-column reads are also supported and tested; no `SELECT *` in the view or app. App money reads always use the string projection.

PO/WO retrieve rates separately through `get_package_version_commissions`: explicit non-null signed actor, `has_workspace_access(ws, 'generate_registration_link')` AND (`is_platform_owner()` OR `current_staff_role() = 'workspace_owner'`), actual workspace existence and explicit `WHERE package_versions.workspace_id = requested ws`. App read helper separately checks the same role and `authorize(actor, 'generate_registration_link', ws)` before this call. This narrow definer reader is necessary because PO/WO/Sales/Trainer all use PostgreSQL `authenticated`, making role-dependent column grants alone impossible. It does not widen pricing authority or create a new business capability. No commission-bearing alternate view, embedding, audit projection or returned mutation payload is exposed to Sales/Trainer. Audit RLS already restricts business events to PO/WO in scope; retain it.

Unavailable offers and older versions remain readable to authorized staff. Registration sellable selection (future F10) must filter available offers and resolve current version; no anonymous registration read is added in F9. Canonical package existence query goes package → offers only; offer policy does not query packages, avoiding RLS recursion.

## Audit extension (FR-011)

Add branches to the latest `audit_row_change()` body; retain postgres ownership, empty search path and revoked execute grants. Insert audit via AFTER triggers only, never also in RPC code. Standard columns: `actor_user_id=auth.uid()`, target table/id, timestamp and workspace (NULL for canonical packages). Exact details allow-lists:

| Trigger / operation                   | Action                               | Details                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audit_packages` AFTER INSERT         | `package.created`                    | `{code}`; target package id; workspace NULL                                                                                                                                                                                          |
| `audit_package_versions` AFTER INSERT | `package_version.published`          | `{offer_id, package_id, version, price_minor, currency, commission_rate_bp, duration_days}`; price_minor recorded as an exact decimal string; package_id resolved through same-workspace offer; target version id; version workspace |
| `audit_package_offers` AFTER UPDATE   | `package_offer.availability_changed` | `{available}` only if actual boolean changes; target offer id; offer workspace                                                                                                                                                       |

Offer insertion and current-pointer-only updates produce no offer event. Replays and same-state toggles produce none. Audit failure rolls back mutation. No names, email, phone, tokens, labels or arbitrary form/provider data in details. The package code is deliberate canonical business data. Preserve existing audit immutability and visibility. Exactly-one means one event per actual business change, not one for every underlying SQL statement.

## Historical contract and transitions

Canonical package → fixed workspace offer → append-only version sequence. New offer: absent → unavailable/version 1/current pointer, atomically. Subsequent publish changes only pointer, never availability. Availability true/false changes independently, preserving versions. All relations remain restrictive and workspace-composite where tenant-owned. F10 tokens and F12 subscriptions must reference `(workspace_id, package_version_id)` and snapshot price/currency/rate/duration at purchase; later publications cannot update them. Those tables and commission accrual/installment arithmetic (D-13/D-17) are out of scope.

## S32-PO-4 data-model delta (historical draft; superseded by S33-PO-6 / S34-PO-1 where noted)

### Legacy catalog and versioned package management

Before any mock removal, inventory stable package/offer/version IDs and enumerate all target-stack references: FKs, registration links, subscriptions, payments, audit rows and all other package dependencies. Verify synthetic-only status. Any non-synthetic record, required financial/audit dependency or unknown state refuses/escalates with zero writes. A clean preflight permits safe deletion and initialization of four empty categories. No default commercial values are created.

Management writes are PO-only for workspace-specific names, prices and package-specific commissions; WOs cannot configure these values. Commercial edits append versions and preserve prior client/assignment snapshots. Market/type are immutable and included in the S33-11 snapshot. S33-02 soft-retirement applies to future real packages; C5 governs existing mock-package removal.

### FX snapshot entity (conceptual; product behavior settled)

Any future snapshot preserves original transaction amount/currency and actual settlement. The transaction timestamp maps to its Africa/Cairo calendar date. ECB/TARGET defines the business-day calendar. Select the latest prior valid Frankfurter publication strictly before that transaction date; if the preceding business day has no valid publication, continue to the latest earlier valid publication. If no valid prior publication exists, the rate remains pending, its idempotent retry is used, and the item is excluded from converted totals until fetched. A snapshot records the source/target currency, immutable rate and publication date so a historical value is never recalculated.

Each reporting line is converted exactly from its immutable snapshot using decimal/rational arithmetic, without per-line minor-unit rounding. Each reported EGP aggregate sums those exact line conversions and is rounded half-up exactly once to EGP minor units (100 minor units per EGP); an exact half minor unit rounds to the next higher minor unit. EGP→EGP uses exactly 1. Frankfurter coverage is verified for every supported currency (`EGP`, `USD`, `SAR`); an uncovered currency is recorded as a blocker, and no rate, provider or fallback is assumed. Existing payment rules remain unchanged.

Store reporting values separately from actual settlement amount/currency and settlement events. Never overwrite settlement with a reported converted value, and do not change payment status, settlement, refund or other existing payment rules. Store/retain exact per-line converted values for aggregation; apply the single half-up-to-EGP-minor-unit rounding only when materializing each reported aggregate. Dashboard display follows C4: actual monthly collections and package-specific commissions with installment detail; settlement/accounting events remain separate. Copy beyond the four approved English/Arabic market/type label pairs remains BLOCKED-COPY.

### Fetch/expiry jobs, audit and idempotency

Use existing scheduling patterns for future provider fetches and promotion availability; no new scheduling platform is specified. Provider fetch is server-only, validates rate source/publication date/currency and verified coverage, uses an idempotent retry, and records pending state without inventing a rate. Promotion boundaries and issued-link effects follow FR-030: a missing start bound means available from creation, a missing end bound means indefinite, and supplied bounds are Africa/Cairo start-inclusive/end-exclusive. Audit required management and FX changes without client data or provider secrets; independent security review remains required.

The constitutional external-model rule applies to development AI handling. S31-PO-8 requires synthetic data for development/testing; the FX provider is a runtime data API, not an AI model. Outbound runtime calls still send no client data (FR-027).

## S34-PO-1 settled data invariants

- Workspace category cardinality is exactly four: Egypt × Year-Round, Egypt × Promotional, International × Year-Round, International × Promotional. Both markets can operate at once. Market/type are immutable; S33-11 requires market/type in the immutable version snapshot.
- PO controls workspace-specific names, prices and package-specific commissions. WOs cannot configure them. Commercial-term changes append a version and preserve prior client/assignment snapshots.
- Dashboard read semantics are actual monthly collections and package-specific commissions with installment due/paid/remaining detail. Accounting/settlement events remain separate records. Converted commission is PO/WO-only.
- FX uses the transaction timestamp's Africa/Cairo calendar date, the ECB/TARGET business-day calendar and the latest prior valid Frankfurter publication strictly before that date, falling back to the latest earlier valid publication when needed. Coverage is verified for every supported currency; uncovered currencies are recorded blockers. Lines are converted exactly and each reported aggregate is rounded half-up once to EGP minor units. EGP→EGP is exactly 1; a pending rate retries idempotently and is omitted from converted totals until fetched. Existing payment rules are unchanged and no other conversion is allowed.
- C5 deletion requires a target-stack dependency manifest including FKs, registration links, subscriptions, payments, audit rows and every other reference. Unsafe or unknown state refuses and escalates with zero writes. Safe cleanup initializes four empty categories without commercial defaults.
- Requirements define Installments data only. Four English/Arabic market/type label pairs are approved by LABELS/S34-PO-2; all other dashboard/Installments/empty/error/help copy remains BLOCKED-COPY.

## S43-PO-6/7 package-tier data-model delta (no migration authored)

**architect mapping (S43-R10):** Each of the four existing package category rows has all three tier offers: Silver, Gold, and Platinum. Each tier offer belongs to one category and stores the immutable platform rank; rank is compared within a category and never inferred from price, duration, or localized label. Tier display names resolve per locale from PO-controlled global names with optional Workspace Owner override scoped to that owner's workspace. Renaming affects display only and cannot alter price, duration, currency, or other commercial terms. This note specifies no migration, SQL, or implementation.

## S43-PO-8 tier-offer data model

Each of the four existing package category rows has all three tier offers: Silver, Gold, and Platinum. Each tier offer belongs to one category and stores the immutable platform rank; rank is compared within a category and never inferred from price, duration, or localized label. Tier display names resolve per locale from PO-controlled global names with optional Workspace Owner override scoped to that owner's workspace. Renaming affects display only and cannot alter price, duration, currency, or other commercial terms. **architect mapping (S43-R10).**
