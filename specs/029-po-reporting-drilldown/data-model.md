# Data Model: PO reporting drill-down

No new data entity is introduced. Reports remain projections over existing finance, client, subscription and delivery facts.

| Projection       | Existing source                    | Extension                                                                                              |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| PO aggregate     | Current platform report readers    | Add only dimensions selected in MCQ 029-01; preserve source totals and currency partitions.            |
| Workspace detail | Existing report RPC/source queries | Return selected workspace rows only after PO authorization; WO queries remain pinned to own workspace. |
| Pagination       | Current report cursor/order        | Stable deterministic order and server-capped page; no unbounded result or client-only filtering.       |

Financial values keep integer minor-unit/currency representation. No mutable snapshot, duplicated report table, new export artifact or audit-event entity is created.
