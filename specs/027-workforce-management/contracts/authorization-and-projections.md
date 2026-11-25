# Contract - Authorization and Projection Matrix

Additive to D-09. Unlisted P7 capabilities are denied. Trusted server code and database authorization/RLS derive the signed actor and workspace membership. Caller role, staff id or workspace arguments do not grant access.

| Capability / data                                                                         | PO                                   | WO                                                | Trainer                                                                                    | Sales                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Full workforce report, KPI formula, ledger, reasons, attribution, deductions, adjustments | Full detail in authorized workspaces | Deny P7; preserve unrelated existing audit rights | Deny                                                                                       | Deny                                                              |
| Manual point edits, dispute, correction, reattribution, quality entries                   | Read/write, attributable             | Deny                                              | Deny                                                                                       | Deny                                                              |
| Person-level salary, monetary payroll inputs, payroll snapshots/approval                  | Platform PO read/write               | Deny                                              | Own compensation only                                                                      | Own compensation only                                             |
| Check-ins page/forms/history                                                              | Authorized workspace                 | Deny by P7                                        | All authorized workspace Weekly Check-ins, including other Trainers, via narrow projection | Deny                                                              |
| Confirm same-workspace check-in follow-up                                                 | Yes                                  | Deny                                              | Yes, within existing F15/F23 permissions                                                   | Deny                                                              |
| Live KPI or detailed Sales data                                                           | Full detail                          | Deny                                              | Deny                                                                                       | Deny, including own live total                                    |
| Finalized Sales total                                                                     | Full detail                          | Deny                                              | Deny                                                                                       | Own staff id only after month-end and PO finalization; total only |
| F10 link visibility                                                                       | Existing grants                      | Existing D-09 grants                              | Existing approved grants                                                                   | Existing approved grants; no P7 attribution added                 |
| Full-refund fault decision/individual deductions                                          | Yes                                  | Deny                                              | Deny                                                                                       | Deny                                                              |
| Rolling 90-day strikes, strike history, and separate correction                           | Platform PO only                     | Deny                                              | Deny                                                                                       | Deny                                                              |
| Former staff history after departure                                                      | PO history                           | Existing independent grants only                  | Current workspace history allowed by role                                                  | Own finalized total while authorization remains valid             |

## Sales confidentiality - mandatory server-side surfaces

- UI shows no Sales total before Cairo month-end AND PO finalization; after both it contains only period label and own total.
- API/RPC derive Sales person id from authenticated identity; never accept target staff id. RLS denies raw ledger/snapshot reads and any pre-finalization projection.
- Export, Realtime/publications, broadcasts, notifications, HEAD/count/existence/search, cache, errors and replay receipts reveal no raw P7 activity or other user's data.
- Authorize before looking up a source, aggregate, replay receipt, export or cache. Cache keys include workspace, actor, role, month and finalized version; revalidate after role changes.
- F10 independently authorized link visibility stays as approved. It does not permit adding P7 attribution or KPI details.

## Check-in and audit boundaries

- Trainer history is a purpose-built, narrow same-workspace Weekly Check-in projection. Do not widen F22 directory assignment filters, direct assignment table reads or client-code search; preserve S70-PO-1 item 1 wall.
- Existing WO audit access remains for unrelated events. P7 financial/KPI audit rows use opaque references only; direct WO audit read cannot reveal P7 amounts, reasons, employee/salary detail or event metadata that discloses activity.
- Test audit target/action/count disclosures as well as detail payload; expose sensitive P7 evidence only through PO-only tables/projections.
- Strike records, rolling counts, review thresholds and corrections are PO-only. Trainer, WO and Sales are denied through RPC, direct table reads, Realtime/counts and audit surfaces; authorization is checked before resolving strike/source identifiers. Corrections append separately and expose only opaque audit references.

## Required real-role probes

- PO allowed full detail and privileged writes; WO/Trainer/Sales denied them.
- Trainer allowed all same-workspace weekly history, denied foreign workspace; direct assignment and directory/code access remain as before.
- Staff salary read is per-person only; another person's salary denied; no WO payroll row.
- Sales before month-end, after month-end but before finalization, for another employee/workspace, or through any raw/channel path receives no KPI data. After finalization it receives only its own total.
- Realtime, broadcasts, notification payloads, counts/HEAD, exports, caches, replay receipts, errors and role revocation all tested.
- Revoke membership during a lock wait; authorization is checked again before returning or committing.
