# Contract: Refund and financial ledger

PO confirms a completed external refund for one explicitly selected paid purchase. The positive integer-minor-unit amount defaults to the actual refundable collected residual; zero is never confirmable. No payment gateway, settlement method or free-text reference is accepted.

Refund is a distinct immutable aggregate with FIFO source allocations ordered by collection date, installment sequence and event UUID. Corrections remain exact F12 reversals. Principal across corrections/recollections/refunds cannot exceed active collected residual; cumulative commission reversal uses source snapshot and exact cumulative rounding, capped at stored commission. Unpaid obligations receive separate cancellation facts.

The first successful refund atomically records allocations, cancellation, client deactivation, one durable idempotent Auth-lockout outbox row, RET-1 start, audit and safe receipt. Failure of any transaction write commits none. The server-side worker applies a supported Auth Admin ban with retries/backoff, records success, and sends a safe PO/WO alert on persistent failure. App/RPC paths deny deactivated clients even if a JWT remains valid. Direct GoTrue sign-in/refresh may still succeed before the worker ban; this is an unresolved timing conflict with an immediate reading of PO-1. Subsequent partials are capped and never reactivate or duplicate the per-client outbox row. Other purchases remain financially independent and require manual resolution.

Exact authorized replay returns the same receipt without effects; altered key binding conflicts; current authorization is checked before any receipt disclosure. Receipt and audit payload omit commission, PII, secrets and free text. PO/WO commission is read only from the separate commission projection.

## Hard gates

- F12 U4 merged contract and latest integrated migration bodies verified.
- Stack C supported Auth Admin ban measured: HTTP 200 ban, then HTTP 400 for fresh sign-in and refresh. Direct GoTrue token issuance during the pre-worker window remains a PO timing conflict.
- DB execution uses verified isolated Stack C only; Stack A and B are reserved to F12/F14.
