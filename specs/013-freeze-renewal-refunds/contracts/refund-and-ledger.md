# Contract: Refund and financial ledger

PO confirms a completed external refund for one explicitly selected paid purchase. The positive integer-minor-unit amount defaults to the actual refundable collected residual; zero is never confirmable. No payment gateway, settlement method or free-text reference is accepted.

Refund is a distinct immutable aggregate with FIFO source allocations ordered by collection date, installment sequence and event UUID. Corrections remain exact F12 reversals. Principal across corrections/recollections/refunds cannot exceed active collected residual; cumulative commission reversal uses source snapshot and exact cumulative rounding, capped at stored commission. Unpaid obligations receive separate cancellation facts.

The first successful refund atomically records allocations, cancellation, client deactivation, login block, revocation of all Auth sessions/refresh tokens, RET-1 start, audit and safe receipt. Failure of any step commits none. Subsequent partials are capped and never reactivate. Other purchases remain financially independent and require manual resolution.

Exact authorized replay returns the same receipt without effects; altered key binding conflicts; current authorization is checked before any receipt disclosure. Receipt and audit payload omit commission, PII, secrets and free text. PO/WO commission is read only from the separate commission projection.

## Hard gates

- F12 U4 merged contract and latest integrated migration bodies verified.
- Supported PO-1 Auth transaction-safe block/revocation primitive proven on a verified isolated stack. If unsupported, stop and obtain revised approval.
- DB execution waits for a verified isolated F13 stack; Stack A and B are reserved to F12/F14.
