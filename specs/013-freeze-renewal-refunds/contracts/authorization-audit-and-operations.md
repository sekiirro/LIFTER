# Contract: Authorization, audit and operational safety

- Enforce server authorization and forced-RLS authorization; PO global scope still requires a real workspace row. WO/Sales require current own-workspace membership. Return generic `not_permitted` for foreign, missing or revoked targets.
- `manage_freeze` and `record_payment` apply to PO/WO/Trainer/Sales as approved. `record_refund` is explicitly PO-only. Keep TypeScript and SQL maps equal in both directions, preserving F12 Sales approval removal and F14 `manage_branding`.
- Every new definer function uses a restricted explicit owner, `SECURITY DEFINER`, empty search path, qualified names, no dynamic SQL, revoked default EXECUTE and narrow grants. Internal P4 seams are not granted to authenticated callers.
- Rebuild shared `audit_row_change()` and `app_private.role_has_capability()` from the latest integrated F12/F14 bodies. Audit failures roll back business writes. Audit includes only allow-listed identifiers, bounded codes, revisions, dates, minor-unit strings, currency and correlation IDs.
- No raw errors, SQL/messages, payloads, PII, secrets, commission or free text in logs, audit/jobs fields, receipts or client views.
- Preserve delivered productivity after refund; no payroll reversal, fabricated productivity or automatic discipline.
