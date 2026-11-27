# Contract: PO full export API and permissions

## API contract (proposed extension)

| Operation         | Contract                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request export    | PO-authenticated only; accepts approved explicit scope/filters and manifest version; server validates each input; returns safe request state/opaque ID only.           |
| Generate export   | Reads existing approved source rows under one consistent snapshot/window; bounded; package mode follows MCQ 030-01; records audit event without contents.              |
| Retrieve artifact | Authenticated request rechecks current PO authorization, requesting actor, artifact scope and expiry on every retrieval. No bearer/public URL or authorization bypass. |
| Retry/replay      | Same operation key returns same request/result; changed scope under same key is refused; no duplicate artifact or second audit success.                                |
| Cancel/expire     | Revoke access and delete artifact through selected existing storage path; no new cron is assumed.                                                                      |

## RLS / permission matrix

| Role              | Comprehensive request | Read/retrieve                             | Scope                                                               |
| ----------------- | --------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| PO                | Allow                 | Allow when still authenticated/authorized | Explicit workspace or platform scope selected; current PO authority |
| WO                | Deny                  | Deny                                      | No complete client dataset export                                   |
| Trainer           | Deny                  | Deny                                      | No complete client dataset export                                   |
| Sales             | Deny                  | Deny                                      | No comprehensive client dataset export                              |
| Client            | Deny                  | Deny                                      | May use separate own-plan PDF/Excel only while entitlement permits  |
| Anonymous/revoked | Deny                  | Deny                                      | No row/count/artifact existence disclosure                          |

**Authorization walls**: application layer plus database/source/storage policies. Direct endpoint/RPC, object identifier, storage path and URL replay tests are required. Any storage delivery mechanism must preserve authenticated current-PO authorization; a signed or bearer URL is not sufficient by itself and cannot bypass revocation/expiry checks. RLS must deny access to any internal request/artifact table except through narrow owner-authorized functions. Audit events include actor/scope/time/outcome/opaque reference; no file contents, health data, secrets, or URLs.

## Responses and states

Safe states are `accepted`, `processing` (only if async is approved), `ready`, `failed`, `expired`, and generic `not_permitted`. Empty selected scope is distinct from an authorization failure only for PO. No non-PO response reveals whether an artifact exists.
