# F16 Export and Read Isolation Contract

- F16 does not create client catalog endpoints. A client receives only explicit F17/F18 plan-version snapshots through the client plan path; no catalog search, creator, origin, workspace variation, or live food catalog reads are exposed to clients.
- Exercise snapshots preserve the canonical shared exercise identity and exact selected exercise version. Workspace video URLs are resolved dynamically under authorization and are never persisted in snapshots or exports.
- Food snapshots preserve the exact food identity/version and the validated nutrition values used by the plan. A later edit, archive, remove, restore, or merge cannot change an existing snapshot.
- A workspace exercise/video read resolves from the selected authorized workspace only. KENDO receives only KENDO's mapping; no TOJI URL, note, existence bit, candidate count, or error distinction may be returned, logged to a client-visible channel, or included in an export. The same rule applies with KENDO and TOJI reversed.
- Global search/detail projections may expose global content to PO and current coaching staff. They never expose creator identity or origin workspace to non-PO actors, including duplicate warnings, RPC errors, pagination metadata, and export-read joins.
- Tests use isolated KENDO and TOJI fixture identities and links. Verify direct table reads, RPCs, search counts, detail/history, server projections, error paths, and plan/export joins. Mutation checks must make each tenant guard fail if removed. Do not use real production URLs or data as fixtures.
