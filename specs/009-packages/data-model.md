# Data Model: Packages & Package Versions (P1-F9)

The shipped baseline is `supabase/migrations/20261029120000_packages.sql` (PR #9 merge
`b565d4c`, implementation tip `b359985`). Never edit that committed migration or any later shipped
migration. The S31 delta is a **new** forward migration,
`supabase/migrations/20261106125000_f9_package_markets_types_currency.sql` (provisional filename
until implementation), with the final legacy
policy and owner/mutability decisions still gated by SK-009-05..SK-009-09.

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

## `public.package_offers` — workspace/package/duration identity (FR-002/003/007)

| Column             | Type          | Rule                                                                                            |
| ------------------ | ------------- | ----------------------------------------------------------------------------------------------- |
| id                 | uuid PK       | UNIQUE `(workspace_id, id)`                                                                     |
| workspace_id       | uuid          | FK `workspaces(id)` ON DELETE RESTRICT                                                          |
| package_id         | uuid          | FK `packages(id)` ON DELETE RESTRICT                                                            |
| duration_days      | integer       | `duration_days >= 1`                                                                            |
| duration_months    | smallint NULL | Preset months, otherwise NULL for custom days                                                   |
| available          | boolean       | DEFAULT `false`; only explicit PO toggle enables a new offer                                    |
| current_version_id | uuid NULL     | Same-workspace, same-offer published version pointer; transiently NULL during first publication |

Constraints:

- UNIQUE `(workspace_id, package_id, duration_days)`; preset 3 months and custom 90 days cannot create separate offers.
- CHECK `((duration_months IN (1,3,6,8,12) AND duration_days = duration_months * 30) OR (duration_months IS NULL AND duration_days >= 1))`, together with NOT NULL and `duration_days >= 1`. NULL is custom; explicit 2/4-month presets fail.
- FK `(workspace_id, current_version_id)` → `package_versions(workspace_id, id)` ON DELETE RESTRICT, added after both tables exist.
- Also FK `(workspace_id, current_version_id, id)` → `package_versions(workspace_id, id, offer_id)` ON DELETE RESTRICT. Add the referenced UNIQUE triple on versions. This prevents pointing at a different offer within the same workspace, which the pair alone cannot prevent.
- Index `(package_id, workspace_id)` supports canonical package visibility. The workspace/duration unique key and workspace/id unique key support scoped reads and FKs.

No API write grants/policies. Only publish inserts an offer; only publish changes current pointer and only availability RPC changes availability. `app_private.guard_package_offer_update()` rejects changes to `id`, `workspace_id`, `package_id`, `duration_days`, `duration_months` (`23514`); checks `has_workspace_access(OLD.workspace_id, 'set_package_pricing')` for any update; no override GUC. New RPCs run as postgres with caller `auth.uid()` retained. `package_offers_guard` is BEFORE UPDATE, row. Delete/truncate guards: `package_offers_no_delete` and `package_offers_no_truncate` via `forbid_delete`.

First publish creates the offer with NULL pointer, inserts version 1 and sets the pointer within the same transaction. No successful publish leaves NULL. No independent offer-creation endpoint exists. An existing offer's duration representation is fixed: same days with different `duration_months` is `invalid_input`, not an identity rewrite. Publication preserves existing availability.

## `public.package_versions` — immutable published terms (FR-004/005/006)

| Column             | Type          | Rule                                                                                                           |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------------------------- |
| id                 | uuid PK       | UNIQUE `(workspace_id, id)`; UNIQUE `(workspace_id, id, offer_id)`                                             |
| workspace_id       | uuid          | FK `workspaces(id)` ON DELETE RESTRICT                                                                         |
| offer_id           | uuid          | Composite FK `(workspace_id, offer_id)` → `package_offers(workspace_id, id)` ON DELETE RESTRICT                |
| version            | integer       | `version >= 1`; UNIQUE `(offer_id, version)`                                                                   |
| name_ar            | text          | `char_length(name_ar) BETWEEN 1 AND 120` AND `char_length(btrim(name_ar)) >= 1` AND `name_ar ~ '[^[:space:]]'` |
| name_en            | text          | `char_length(name_en) BETWEEN 1 AND 120` AND `char_length(btrim(name_en)) >= 1` AND `name_en ~ '[^[:space:]]'` |
| price_minor        | bigint        | `price_minor > 0`; signed bigint technical ceiling `9223372036854775807`; no default                           |
| currency           | char(3)       | `currency ~ '^[A-Z]{3}$'`; no default. Under S31 the effective set is market-conditional: Egypt=EGP only; International=EGP/USD/SAR; row-local format alone is insufficient |
| commission_rate_bp | integer       | `commission_rate_bp BETWEEN 0 AND 10000`; no default, zero must be explicit                                    |
| duration_days      | integer       | Positive duration copied from offer; same duration CHECK as offers                                             |
| duration_months    | smallint NULL | Copied exactly from offer, NULL-safe equality                                                                  |
| published_at       | timestamptz   | DEFAULT `now()`                                                                                                |
| published_by       | uuid          | FK `staff_profiles(user_id)` ON DELETE RESTRICT; assigned from verified PO `auth.uid()`                        |

Package identity is resolved through the immutable offer relation; no redundant `package_id` column is needed on versions. `app_private.guard_package_version_insert()` BEFORE INSERT verifies the referenced offer in the same workspace and exact snapshot equality (`IS NOT DISTINCT FROM` for months), price/rate/name/currency validation and PO authority. The S31 forward migration additionally enforces the market/currency matrix at the selected owner. Database constraints enforce row-local ranges too. This prevents privileged SQL test inserts from bypassing snapshot parity. SQL and pure validation reject required NULLs, blanks and invalid ranges; labels are stored/displayed as authored, not translated or silently trimmed.

`package_versions_no_update` BEFORE UPDATE row uses `audit_events_immutable`; `package_versions_no_delete` BEFORE DELETE row and `package_versions_no_truncate` BEFORE TRUNCATE statement use `forbid_delete`. They reject DML for all roles, including service_role and postgres; do not make an owner/service exception. Grants are a separate wall, so postgres DML tests must prove trigger behavior, and service-role tests temporarily grant DML in a rolled-back transaction to avoid merely testing missing grants. Superuser DDL/disabled triggers are not preventable by application RLS; mutation tests detect their removal.

## S31 market/type and currency delta (FR-015..FR-021)

### Invariants fixed by the PO

- Proposed machine encoding is `market = egypt | international` and
  `package_type = year_round | promotional`. This is a technical design proposal for
  implementation, not PO-approved copy, and it may change without a PO decision. Arabic/English
  display labels are separate and are not shipped until SK-009-08 supplies approved copy.
- Egypt → `EGP` only. International → `EGP | USD | SAR`. Every other currency is invalid even if it
  satisfies the former three-letter format check.
- A version keeps its own exact minor-unit amount/currency. No exchange-rate field, converted
  amount, mixed-currency total or market/currency inference is introduced.
- Distinct canonical package codes remain independent within a workspace. No package-count cap,
  quota or one-package-per-workspace key is introduced.
- PO is the only actor who may create/name/price/control packages. WO/Sales/Trainer denial and
  Sales/Trainer commission denial are unchanged.
- Existing `package_versions` rows are immutable. The forward migration cannot update, delete,
  truncate or rewrite their identifiers or financial/duration terms.

### Owner and mutability are conditional on SK-009-06

The approved attribute values do not decide where they live or whether they may change. The forward
migration MUST follow the PO answer rather than one of these design candidates:

| Candidate | Physical delta | Required history/mutability behavior | Blocked by |
|---|---|---|---|
| A — workspace offer, fixed (recommended) | Add `market` and `package_type` to `package_offers`; extend the offer identity-update guard to freeze both | New offer requires both values; later publication must match them; a changed market/type requires a distinct package | SK-009-06 |
| B — workspace offer, mutable | Add the same columns; allow only an explicitly audited PO mutation | Decide whether each package version snapshots the old or new value; otherwise historical reads can change meaning | SK-009-06 + SK-009-07 |
| C — platform canonical package | Add the columns to `packages` | One global value applies to every workspace; version history remains immutable | SK-009-06 |
| D — immutable version snapshot | Add the columns to `package_versions` | Every new version records values; current offer/version projections need a defined current-value rule | SK-009-06 + SK-009-07 |

Do not combine candidates or silently fall back from one to another. The data model, RPC, read
contract, UI and migration tests must all use the same PO-approved candidate.

### Existing-row classification is conditional on SK-009-05

The shipped schema has no market/type values. Therefore the new columns cannot honestly become
mandatory for existing offers without an approved representation. The forward migration must encode
exactly one PO-approved SK-009-05 option before it is committed:

- **Explicit mapping**: apply a PO-supplied row mapping in the migration's approved staging order,
  then enforce the selected owner's non-null/check constraints. This may classify offer metadata but
  MUST NOT rewrite any `package_versions` term.
- **Approved legacy/unclassified representation**: retain an explicit approved legacy state and
  publish new rows under the two new domains. The state and its display copy require PO approval;
  it is not invented by the schema author.
- **Verified-empty catalog**: if deployed-state evidence proves there are no rows to classify, add
  mandatory constraints immediately with no data update.
- **Currency inference is prohibited**: EGP does not prove Egypt because International permits EGP;
  USD/SAR do not prove a historical market rule.

No default `Egypt`, `International`, `Year-round` or `Promotional` is applied to existing rows in
this plan.

### Conditional publication contract

If SK-009-06 selects candidate A/B/C, market/type are supplied once when the selected owner record
(canonical package or workspace offer) is created, and later publications must match the fixed
owner value (or follow the approved mutable transition). If it selects D, every publication
supplies and snapshots market/type. In either case the new publication path MUST:

1. re-derive the signed actor and require PO + `set_package_pricing` before target lookup;
2. validate market/type and the market/currency matrix before advisory/row locks or inserts;
3. create/find the offer using the unchanged workspace/package/duration identity;
4. preserve the current-only exact-payload replay rule, including whether market/type participate
   in equality according to the approved owner/mutability model;
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
- If market/type belong to `package_offers`, extend the offer projection and safe allow-list. If
  they belong to `package_versions`, extend the safe view with exact immutable values. If they
  belong to `packages`, extend the canonical package projection. No projection may expose an
  unapproved legacy label.
- No direct UPDATE grant is added. If candidate B is selected, a separate PO-only RPC performs the
  audited mutation; otherwise the existing offer identity guard freezes the fields.
- Audit details may include only the machine market/type values and the actual business transition;
  no free text, labels, PII or currency-conversion data enters audit records. Event count and
  allow-lists are specified with the selected candidate before implementation.
- RLS/catalog/parity tests must prove market/type cannot cross workspaces and cannot create a
  second mutation path for WO/Sales/Trainer.

### Conditional downstream contract

Current shipped F10 registration links copy the package version's price/currency; current F12
subscriptions, installments, payments, refunds and commission snapshots preserve that currency and
enforce same-currency totals. The final S31 requirement for those surfaces is SK-009-09. Under the
recommended same-currency option, no new conversion field or rate source is added and existing
snapshots remain unchanged. Under any option that permits a different or mixed downstream currency,
a new PO-approved source of truth and migration plan is required; this specification does not
provide one.

## Database API and transaction rules

Public RPC signatures use the parameter names shown here (PostgREST named inputs); qualify all SQL identifiers to avoid parameter/column ambiguity. No extra required parameter or request-key store.

| Function                                                                                                                                                                                                         | Return                                                | Authorization / effects                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.create_package(code text)`                                                                                                                                                                               | uuid                                                  | Non-null `auth.uid()` and `is_platform_owner()` plus PO pricing capability; insert canonical code or return existing id on unique conflict                 |
| `public.publish_package_version(workspace_id uuid, package_id uuid, duration_months smallint, duration_days integer, name_ar text, name_en text, price_minor bigint, currency text, commission_rate_bp integer)` | uuid                                                  | `has_workspace_access(workspace_id, 'set_package_pricing')`; workspace/package must exist; create/find offer, append version and update pointer atomically |
| `public.set_package_offer_available(workspace_id uuid, offer_id uuid, available boolean)`                                                                                                                        | uuid (offer id)                                       | Same PO pricing guard; scoped offer lookup, lock row, change only if `available IS DISTINCT FROM` requested state                                          |
| `public.get_package_version_commissions(workspace_id uuid)`                                                                                                                                                      | TABLE `(version_id uuid, commission_rate_bp integer)` | PO or active WO in requested workspace only; returns that workspace's version rates, never other workspaces                                                |

All four public functions: SECURITY DEFINER, owner postgres, `SET search_path = ''`, fully qualified relations, execute revoked from PUBLIC/anon/authenticated/service_role, then granted only to authenticated. Commission reader is STABLE, mutations are VOLATILE. No service-role RPC use in the app. Unauthorized/null identity is `42501/not_permitted`. Unknown workspace, package or foreign/missing offer maps to the same denial, never a raw FK/existence error. Invalid authorized input is `22023/invalid_input`; unexpected database failures are not exposed by the app. Authorize before looking up requested entities; reject missing required args (SQL NULL must not pass a predicate accidentally).

Private trigger functions `guard_package_offer_update()` and `guard_package_version_insert()` are SECURITY DEFINER, owner postgres, empty search path, execute revoked from PUBLIC/anon/authenticated/service_role. Do not grant private mutation helpers to API callers. Existing reused guards retain their current invoker status and grants.

### Concurrency and replay identity (FR-005)

1. After authorization and scalar validation, acquire a transaction advisory lock keyed by a namespaced hash of `(workspace_id, package_id, duration_days)`. Acquire before offer lookup/creation, including when no offer row exists. Hash collisions serialize extra unrelated work safely.
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

| Trigger / operation                   | Action                               | Details                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_packages` AFTER INSERT         | `package.created`                    | `{code}`; target package id; workspace NULL                                                                                                                                         |
| `audit_package_versions` AFTER INSERT | `package_version.published`          | `{offer_id, package_id, version, price_minor, currency, commission_rate_bp, duration_days}`; price_minor recorded as an exact decimal string; package_id resolved through same-workspace offer; target version id; version workspace |
| `audit_package_offers` AFTER UPDATE   | `package_offer.availability_changed` | `{available}` only if actual boolean changes; target offer id; offer workspace                                                                                                      |

Offer insertion and current-pointer-only updates produce no offer event. Replays and same-state toggles produce none. Audit failure rolls back mutation. No names, email, phone, tokens, labels or arbitrary form/provider data in details. The package code is deliberate canonical business data. Preserve existing audit immutability and visibility. Exactly-one means one event per actual business change, not one for every underlying SQL statement.

## Historical contract and transitions

Canonical package → fixed workspace offer → append-only version sequence. New offer: absent → unavailable/version 1/current pointer, atomically. Subsequent publish changes only pointer, never availability. Availability true/false changes independently, preserving versions. All relations remain restrictive and workspace-composite where tenant-owned. F10 tokens and F12 subscriptions must reference `(workspace_id, package_version_id)` and snapshot price/currency/rate/duration at purchase; later publications cannot update them. Those tables and commission accrual/installment arithmetic (D-13/D-17) are out of scope.
