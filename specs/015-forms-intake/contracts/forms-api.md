# F15 Forms API Contract (Logical)

Route names below are proposed ownership seams, not implemented interfaces. Request/response schemas are finalized only with code and tests; security invariants in this document are binding from the feature spec.

## Operations

| Operation | Actor scope | Required behavior |
| --- | --- | --- |
| Select/configure form | PO/WO/Trainer authorized workspace | Current capability/membership; eligible published version; no Sales access; first slice one-time client |
| Consume approval / resolve self-intake | Narrow internal worker / approved client | Consume committed F12 event and valid selection atomically; idempotent; never select arbitrary fallback |
| Read assignment/answer/history | Client own assignment; staff workspace; PO explicit existing workspace | Audited reader before any sensitive content; no-store; generic denial |
| Save draft | Client own assignment | Expected revision and stable intent key; partial answer set allowed; server validates snapshot/types/applicability/bounds |
| Submit | Client own assignment | Complete applicable requirements and substantive three sections; one immutable accepted submission and original SLA |
| Correct submitted answers | Client self-only, Trainer/WO current workspace, PO explicit existing workspace | Approved matrix while client relationship remains active; deny every role after Closure/Refund/Deactivation (Q1). Append immutable revision + atomic safe audit; no deadline reset. Q2 removal from existing history is blocked pending PO resolution. |
| Read correction history | Same as answer access | Every revision audited; fail closed on audit error |
| Detect/resolve alert | Narrow worker and authorized recipients | IDs-only alert state; dedup; reauthorize at delivery/read; real data requires complete P4 facts |

## Write preconditions

- Never accept caller-selected `client_id` or `workspace_id` on client operations. Derive scope from Auth and verify assignment ownership.
- Require `expected_revision` for drafts and canonical intent binding for retry keys. A reused key with changed intent fails safely.
- Reject stale authorization after any lock wait. Preserve the F12 lock order and P2 extension in plan.md.
- Return only safe allow-listed errors; never expose raw constraint/provider errors.

## Response and caching

- Authenticated answer-bearing endpoints are server-only and no-store (`Cache-Control: private, no-store`).
- No CDN, ISR, framework shared cache, Realtime publication, browser storage or service-role response.
- Denial response shape is indistinguishable for foreign/nonexistent/unauthorized targets except incidental request ID.
- Success acknowledgement means durable accepted revision only. Network uncertainty remains unsaved/unknown until reconciliation.
