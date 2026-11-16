# F9 C5 audit evidence and forward-only plan (T053)

Scope: T053 [FR-022, FR-028, SC-013, SC-019], S32-R1. Evidence only: no migration, deletion or data change is made here (T064a, T064b and T065 own those). Baseline: `origin/main` @ `5525eff9`, fetched with `git fetch --prune origin` on 2026-11-16.

## 1. Version identity is unique across ALL origin refs (S32-R1)

Reproduce (read-only; uses only `git for-each-ref` and `git ls-tree -r -z <ref> -- supabase/migrations`):

```
git fetch --prune origin
node scripts/audit-migration-identity.mjs
npm run check:migration-versions:remote      # existing filename-conflict guard
```

The new script (`scripts/audit-migration-identity.mjs`, unit-tested in `tests/unit/audit-migration-identity.test.ts`) fails on either of:

- one 14-digit version carried by two different filenames on any refs (duplicate version identity);
- one migration filename whose git blob differs between refs (a pushed migration that was edited).

Result on 2026-11-16: 175 origin refs, 352 distinct versions, 0 duplicate versions, 0 filenames with divergent content (the content check covers every migration, including the five package-touching files below). `check:migration-versions:remote` also passes (175 refs).

Limit: this proves state at the fetch instant; a later push can introduce a collision. It must be re-run immediately before any new F9 migration is committed (T055/T065) and again at T063.

## 2. Package references (migrations that touch the package tables)

Package-defining or package-altering migrations on main:

| Migration                                                 | Role                                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `20261029120000_packages.sql`                             | `packages`, `package_offers`, `package_versions`, `packages_no_delete/no_truncate` (+ offers/versions equivalents), RESTRICT FKs |
| `20261103127000_f13_renewal_package_lookup_fix.sql`       | F13 renewal lookup fix                                                                                                        |
| `20261111170857_packages_tier_rank.sql`                   | `tier_rank`                                                                                                                   |
| `20261118000000_f9_package_markets_types_currency.sql`    | category identity `(workspace_id, market, type)`; legacy rows stay untouched and unclassified                                  |
| `20261118220001_f9_legacy_package_publication_compatibility.sql` | legacy publication compatibility                                                                                        |

Foreign-key dependents (all `on delete restrict`; none cascade), taken from migration sources:

| Dependent                          | Edge                                                                                            | Family            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| `package_offers`                   | `(package_id)` -> `packages`                                                                     | FK                |
| `package_versions`                 | `(workspace_id, offer_id)` -> `package_offers`; `package_offers.current_version_id` -> versions | FK                |
| `registration_links`               | `(workspace_id, package_version_id)` -> `package_versions`                                      | registration link |
| `clients`                          | `(workspace_id, package_version_id)` -> versions; `(.., registration_link_id, package_version_id)` -> links | registration link |
| `subscriptions`                    | `(workspace_id, package_version_id)` -> versions; link triple FK                                  | subscription      |
| `subscription_renewals`            | offer FK and `(version, offer)` FK                                                                | subscription      |
| `subscription_upgrades`            | offer FK and `(version, offer)` FK                                                                | subscription      |
| `subscription_installments`, `payment_events`, `subscription_activations`, `subscription_renewal_date_revisions` | reach packages transitively through `subscriptions` (restrict) | payment           |
| `audit_events`                     | soft reference `(target_table, target_id)`; no FK                                                | audit             |

The audit reference is not a database edge, so the preflight must look it up explicitly (T052/T064 tests do). The existing GREEN oracle test `tests/integration/packages-c5-inventory.test.ts` fails if any `package_id`, `package_offer_id` or `package_version_id` column appears in `public`/`app_private` without an FK edge, so an unknown reference cannot appear silently.

## 3. Why required financial and audit records cannot be damaged

1. Every FK from client, subscription, renewal, upgrade, registration-link and (transitively) installment/payment tables to package rows is `ON DELETE RESTRICT`. A package, offer or version that any of them references cannot be deleted by any statement, including `TRUNCATE ... CASCADE` which the `*_no_truncate` triggers also block.
2. `packages`, `package_offers` and `package_versions` carry `*_no_delete` and `*_no_truncate` triggers (`20261029120000_packages.sql`). The existing T077 cleanup (`supabase/cleanup/20261111_t077_legacy_package_offers.sql`) shows the only precedent: it disables one trigger inside an explicit transaction, deletes only offers with no versions/links/clients/subscriptions/renewals/audit references, and re-enables it.
3. `audit_events` is append-only (`audit_events_immutable` blocks UPDATE/DELETE, `20261027150000_audit_log.sql`). A package delete never removes audit history; audit references to client/financial dependents are a refusal condition and nothing may erase audit rows; audit rows that merely name a mock do not block (PO S61-PO-1 Q1=A) (tested by `packages-cleanup.test.ts`).
4. C5 requires refusal for non-synthetic data, required financial/audit dependencies or unknown dependency state. The T064 tests specify this and are RED until T064a; no deletion path exists on main, so today no financial or audit record can be damaged by C5 work.

## 4. Forward-only plan (nothing here is executed)

1. T052/T064 (this PR): RED tests pin the preflight contract (`tests/integration/packages-c5-preflight-contract.ts`).
2. T064a: implement `app_private.package_c5_preflight(uuid[])` as a read-only (STABLE) function in a NEW migration, with a timestamp above the highest version on ALL origin refs (re-run section 1 first). Remove `.fails` from T052/T064 tests in the same PR.
3. T064b: teardown design and independent security review for protected immutable version rows and the `*_no_delete` guards. No guard exception is authorized until this passes.
4. T065: an operator cleanup script (not a migration; review.md section 4) deletes only preflight-clean synthetic targets; a new forward migration only initializes the four empty categories. Never edit `20261029120000_packages.sql`, `20261118000000_f9_package_markets_types_currency.sql` or any pushed migration; re-run section 1 immediately before pushing.
5. T070 reviews the implemented deletion path; T063/T071 re-run Analyze and section 1.

Open dependency: the teardown mechanism for mocks that already have offers/versions (the guards forbid deletion) is unspecified and belongs to T064b. Until then the preflight must refuse any mock with attached offers/versions.
