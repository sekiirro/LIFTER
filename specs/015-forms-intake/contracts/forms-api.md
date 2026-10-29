# F15 Forms API Contract (Logical)

Route names below are proposed ownership seams, not implemented interfaces. Request/response schemas are finalized only with code and tests; security invariants in this document are binding from the feature spec.

## Operations

| Operation | Actor scope | Required behavior |
| --- | --- | --- |
| Select/configure form | PO/WO/Trainer authorized workspace | Current capability/membership; eligible published version; no Sales access; first slice one-time client |
| Consume approval / resolve self-intake | Narrow internal worker / approved client | Consume committed F12 event and valid selection atomically; idempotent; never select arbitrary fallback |
| Read assignment/answer/history | Client own assignment; staff workspace; PO explicit existing workspace | Audited reader before any sensitive content; no-store; generic denial |
| Save draft | Client own assignment | Expected revision and stable intent key; partial answer set allowed; shared server validator checks snapshot/types/applicability, short/long Unicode code point limits (150/1,000, or lower published per-question limit), independent 4,096-byte UTF-8 answer safety cap, and 262,144-byte answer-value payload cap |
| Submit | Client own assignment | Shared server validator applies the same text and payload caps, plus complete applicable requirements and substantive three sections; one immutable accepted submission and original SLA |
| Correct submitted answers | Client self-only, Trainer/WO current workspace, PO explicit existing workspace | Approved matrix while client relationship remains active; deny every role after Closure/Refund/Deactivation (Q1). Append immutable revision + atomic safe audit; correction does not reset the D-03 Trainer deadline. Client submission deadline is per assignment under D2/D3. D-29 separately authorizes automatic server-validated D1 erasure of answers currently inapplicable under authoritative answers, across versions and their answer-change/access-view audit rows; exact migration waits for F12/F14 merge and verified Stack C. |
| Read correction history | Same as answer access | Every revision audited; fail closed on audit error |
| Detect/resolve alert | Narrow worker and currently authorized recipients | Separate client-late (+24h Trainer, +48h PO+WO) from D-03 Trainer-late (existing Q4 rules); reassignment never resets client-late clock; IDs-only state; dedup; real data requires authoritative facts |

## Write preconditions

- Never accept caller-selected `client_id` or `workspace_id` on client operations. Derive scope from Auth and verify assignment ownership.
- Require `expected_revision` for drafts and canonical intent binding for retry keys. A reused key with changed intent fails safely.
- Reject stale authorization after any lock wait. Preserve the F12 lock order and P2 extension in plan.md.
- Return only safe allow-listed errors; never expose raw constraint/provider errors.
- Server draft and submission handlers (including future RPCs) MUST call `lib/forms/validation.ts`; client validation is supplemental only. Reject an over-limit textual answer or payload before any write with an allow-listed `answer_too_long` or `payload_too_large` error. The database migrations in T012/T013 add equivalent defense-in-depth enforcement when the answer schema exists.

## Response and caching

- Authenticated answer-bearing endpoints are server-only and no-store (`Cache-Control: private, no-store`).
- No CDN, ISR, framework shared cache, Realtime publication, browser storage or service-role response.
- Denial response shape is indistinguishable for foreign/nonexistent/unauthorized targets except incidental request ID.
- Success acknowledgement means durable accepted revision only. Network uncertainty remains unsaved/unknown until reconciliation.
