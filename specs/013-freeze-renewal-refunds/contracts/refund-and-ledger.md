# Contract: Refund and financial ledger

PO confirms a completed external refund for one explicitly selected paid purchase. The positive integer-minor-unit amount defaults to the actual refundable collected residual; zero is never confirmable. No payment gateway, settlement method or free-text reference is accepted.

Refund is a distinct immutable aggregate with FIFO source allocations ordered by collection date, installment sequence and event UUID. Corrections remain exact F12 reversals. Principal across corrections/recollections/refunds cannot exceed active collected residual; cumulative commission reversal uses source snapshot and exact cumulative rounding, capped at stored commission. Unpaid obligations receive separate cancellation facts.

The first successful refund atomically records allocations, cancellation, client deactivation, one durable idempotent Auth-lockout outbox row, RET-1 start, audit and safe receipt. Failure of any transaction write commits none. The Custom Access Token Postgres hook reads the committed internal deactivation fact before token issuance and returns `account_unavailable` / HTTP 403 for password sign-in and refresh. The server-side worker remains defense in depth: it applies a supported Auth Admin ban with retries/backoff, records success, and sends a safe PO/WO alert on persistent failure. App/RPC paths deny deactivated clients even if a JWT remains valid. Subsequent partials are capped and never reactivate or duplicate the per-client outbox row. Other purchases remain financially independent and require manual resolution.

Exact authorized replay returns the same receipt without effects; altered key binding conflicts; current authorization is checked before any receipt disclosure. Receipt and audit payload omit commission, PII, secrets and free text. PO/WO commission is read only from the separate commission projection.

### F12 U4 compatibility contract (PR #18 merged)

F12 U4 was re-verified against merged `origin/main` at `e3a2534`; signatures and evidence are pinned
in `research.md` under “F12 merged contract and provisional F14 inventory.” It uses one JSONB request argument and returns a
`{status, receipt}` result; idempotency receipts are stored in the private
`registration_operations` table under a unique actor/request-key pair. The canonical binding is a
fixed v1 SHA-256 input, and exact authorized replay returns the stored JSON result unchanged.
F13's mocked refund RPC contract must preserve those semantics while binding the refund actor,
workspace/client, explicitly selected purchase, positive amount, external-confirmation attestation,
and expected revisions. It must run current authorization before any receipt lookup and recheck it
after key-lock waits. Same key with changed intent is a generic `key_conflict`; revoked replay is
`not_permitted` without receipt disclosure. No amount-zero confirmation, unselected purchase, or
gateway/payment credential is accepted. F14 core is integrated in this branch; `20261103129200_f13_f14_capability_reconciliation.sql` preserves the F12/F14 shared-function and capability contracts after the F14 migrations.

## Hard gates

- F12 U4 merged contract and latest integrated migration bodies verified.
- Stack C supported Auth Admin ban measured: HTTP 200 ban, then HTTP 400 for fresh sign-in and refresh. With the hook active and worker failing, fresh sign-in and refresh return HTTP 403 with no access token. Supabase hook docs and exact configuration are recorded in `research.md`.
- DB execution uses verified isolated Stack C only; Stack A and B are reserved to F12/F14.
