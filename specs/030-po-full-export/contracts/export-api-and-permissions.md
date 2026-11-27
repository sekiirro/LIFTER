# Contract: PO full export API and permissions

## API contract (proposed extension)

| Operation         | Contract                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request export    | PO-authenticated only; accepts approved explicit scope/filters and manifest version; server validates each input; returns safe request state/opaque ID only.                                                                               |
| Generate export   | Existing spec 006 jobs/outbox asynchronously generates one UTF-8 CSV file for one workspace or all workspaces; reads at most 500 source rows per keyset page using the PO-approved manifest; records audit event without contents.         |
| Retrieve artifact | Short-lived authenticated download rechecks current PO authorization, requesting actor, artifact scope and expiry on every retrieval; writes a retrieval audit event before releasing bytes. No public/bearer URL or authorization bypass. |
| Retry/replay      | Existing job idempotency key returns the same request/result; changed scope under same key is refused; no duplicate archive or second audit success.                                                                                       |
| Cancel/expire     | Revoke access and delete/deny the file in the private export-artifacts bucket after the per-screen PO-approved expiry or revocation; cleanup uses the existing jobs/outbox path and adds no cron.                                          |

## RLS / permission matrix

| Role              | Comprehensive request | Read/retrieve                             | Scope                                                               |
| ----------------- | --------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| PO                | Allow                 | Allow when still authenticated/authorized | Explicit workspace or platform scope selected; current PO authority |
| WO                | Deny                  | Deny                                      | No complete client dataset export                                   |
| Trainer           | Deny                  | Deny                                      | No complete client dataset export                                   |
| Sales             | Deny                  | Deny                                      | No comprehensive client dataset export                              |
| Client            | Deny                  | Deny                                      | May use separate own-plan PDF/Excel only while entitlement permits  |
| Anonymous/revoked | Deny                  | Deny                                      | No row/count/artifact existence disclosure                          |

**Authorization walls**: application layer plus database/source/storage policies. Add a private `export-artifacts` bucket and scoped policies in a migration. Direct endpoint/RPC, object identifier, storage path and URL replay tests are required. Any storage delivery mechanism must preserve authenticated current-PO authorization; signed or bearer URLs are not used. RLS denies direct artifact access. Audit events cover request, generation and every retrieval, include actor/scope/time/outcome/opaque reference, and contain no file contents, health data, secrets, or URLs. Retrieval fails closed if its audit cannot be written.

## Responses and states

Safe states are `accepted`, `processing`, `ready`, `failed`, `expired`, and generic `not_permitted`. Empty selected scope is distinct from an authorization failure only for PO. No non-PO response reveals whether an artifact exists. Download endpoints require current authentication and PO authorization; public/signed bearer URLs are not used. CSV text fields are formula-safe and RFC 4180 escaped before UTF-8 serialization.
