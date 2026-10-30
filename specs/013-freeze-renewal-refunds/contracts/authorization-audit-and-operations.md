# Contract: Authorization, audit and operational safety

- Enforce server authorization and forced-RLS authorization; PO global scope still requires a real workspace row. WO/Sales require current own-workspace membership. Return generic `not_permitted` for foreign, missing or revoked targets.
- `manage_freeze` and `record_payment` apply to PO/WO/Trainer/Sales as approved. `record_refund` is explicitly PO-only. Keep TypeScript and SQL maps equal in both directions, preserving F12 Sales approval removal and F14 `manage_branding`.

**F12 merged evidence (PR #18 merge `e3a2534`):** F12 `role_has_capability()` maps `record_refund` only to `platform_owner`, and the latest merged `has_workspace_access()` requires an authenticated actor plus either PO status or a live membership. The latest F12 audit and client/payment guard bodies, source paths, current transaction behavior and required F13 forward amendment are documented in `research.md`. **F14 remains unmerged and provisional:** its fetched branch through `20261102130000` did not redefine these functions, but the F14 lane is adding `manage_branding` and later migrations. Rebuild/check the shared bodies after F14 merges; do not add its permission here.
- Every new definer function uses a restricted explicit owner, `SECURITY DEFINER`, empty search path, qualified names, no dynamic SQL, revoked default EXECUTE and narrow grants. Internal P4 seams are not granted to authenticated callers.
- Rebuild shared `audit_row_change()` and `app_private.role_has_capability()` from the latest integrated F12/F14 bodies. Audit failures roll back business writes. Audit includes only allow-listed identifiers, bounded codes, revisions, dates, minor-unit strings, currency and correlation IDs.
- No raw errors, SQL/messages, payloads, PII, secrets, commission or free text in logs, audit/jobs fields, receipts or client views.
- Preserve delivered productivity after refund; no payroll reversal, fabricated productivity or automatic discipline.

- Refund commits a durable idempotent Auth-lockout outbox row with deactivation. A server-only worker uses the Auth Admin API, bounded retries/backoff, completion recording, and a safe operational alert to PO/WO after persistent failure. Do not log secrets, provider messages, user identifiers or client PII.
- The Supabase Custom Access Token hook uses invoker security, `search_path=''`, and grants limited to `supabase_auth_admin`; it rejects sign-in/refresh token issuance from committed client deactivation. The hook's error is fixed and PII-free. Existing JWT natural expiry is accepted.
