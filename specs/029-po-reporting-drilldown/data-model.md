# Data Model: PO reporting drill-down

No new data entity is introduced. Reports remain projections over existing finance, client, subscription and delivery facts.

| Projection       | Existing source                                                                                                      | Extension                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PO aggregate     | Existing collections/refunds/commissions, client, and subscription source facts; no platform aggregate reader exists | Add a PO-only aggregate reader over source facts, with month and package breakdowns for revenue, client, subscription, and established finance measures; preserve source totals and currency partitions. |
| Workspace detail | Existing report RPC/source queries                                                                                   | Return selected workspace rows only after PO authorization; WO queries remain pinned to own workspace.                                                                                                   |
| Pagination       | Current report cursor/order                                                                                          | Stable deterministic order and server-capped page; no unbounded result or client-only filtering.                                                                                                         |

Month buckets use the existing report period/timezone boundary and package buckets use the package identity already present in source facts. Do not add client-history or Trainer/operational data dimensions.

Financial values keep integer minor-unit/currency representation. No mutable snapshot, duplicated report table, new export artifact or audit-event entity is created.
