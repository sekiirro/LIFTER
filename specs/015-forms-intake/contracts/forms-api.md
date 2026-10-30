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
| Correct submitted answers | Client self-only, Trainer/WO current workspace, PO explicit existing workspace | Approved matrix while client relationship remains active; deny every role after Closure/Refund/Deactivation (Q1). Append immutable revision + atomic safe audit; correction does not reset the D-03 Trainer deadline. Client submission deadline is per assignment under D2/D3. D-29 separately authorizes automatic server-validated D1 erasure of answers currently inapplicable under authoritative answers, across versions and their answer-change/access-view audit rows; exact migration waits for F12/F14 merge and verified Stack D. |
| Read correction history | Same as answer access | Every revision audited; fail closed on audit error |
| Detect/resolve alert | Narrow worker and currently authorized recipients | Separate client-late (+24h Trainer, +48h PO+WO) from D-03 Trainer-late (existing Q4 rules); reassignment never resets client-late clock; IDs-only state; dedup; real data requires authoritative facts |
| Author/publish version | PO/WO/Trainer in authorized workspace | Add/remove/reorder sections/questions; edit bilingual content, type, options, conditions, editable food lists and visual asset references. Draft → Preview → Publish; publication creates immutable version and never edits prior assignments. Applies equally to Mandatory Intake. |
| Save signup identity/consent | Invitation-only signup server transaction | Extend F11 signup fields/validation and atomically store identity/link consumption without T&C consent; record required T&C version/timestamp only at post-Nutrition Terms Card, with separate optional marketing consent; preserve F11 no-session/pending-approval invariants. See `signup-extension.md`. |

## Write preconditions

- Never accept caller-selected `client_id` or `workspace_id` on client operations. Derive scope from Auth and verify assignment ownership.
- Require `expected_revision` for drafts and canonical intent binding for retry keys. A reused key with changed intent fails safely.
- Reject stale authorization after any lock wait. Preserve the F12 lock order and P2 extension in plan.md.
- Return only safe allow-listed errors; never expose raw constraint/provider errors.
- Server draft and submission handlers (including future RPCs) MUST call `lib/forms/validation.ts`; client validation is supplemental only. Reject an over-limit textual answer or payload before any write with an allow-listed `answer_too_long` or `payload_too_large` error. The database migrations in T012/T013 add equivalent defense-in-depth enforcement when the answer schema exists.
- Typed definitions include text, single/multi choice, Yes/No, number+unit, slider, image-card single choice, chips, read-only profile-bound fields, computed age and derived option sets. Profile-bound and computed values are server-derived and cannot be submitted as client-edited answer values.
- The condition authoring model must support nested Yes/No branches (including N5), N7 count-derived meal timing choices, and N8 budget-derived editable food chips. Derived selections are validated against the active parent answer on every draft and submit; changing the parent clears invalid dependent values and applies approved D1 erasure semantics.
- Enforce existing limits without amendment: 20 questions/section, 60/form, 150/1,000 Unicode code points, 4,096 UTF-8 bytes/text answer, 262,144 UTF-8 serialized answer-value bytes/submission, 400 conditions, 16/question, 4,000 evaluation steps, 131,072 definition bytes and 50 choices.
- Mandatory Intake content is not hardcoded or permanently locked. Its seed is an editable published version; later author changes create a new immutable version and do not alter existing assignment snapshots.
- The N12 client answer is an image-card ID mapped to a known reference entry; authorized Trainers receive the associated numeric percentage. The student-facing card, accessible name, ordering and approved disclaimer must remain aligned with the version snapshot.

## Response and caching

- Authenticated answer-bearing endpoints are server-only and no-store (`Cache-Control: private, no-store`).
- No CDN, ISR, framework shared cache, Realtime publication, browser storage or service-role response.
- Denial response shape is indistinguishable for foreign/nonexistent/unauthorized targets except incidental request ID.
- Success acknowledgement means durable accepted revision only. Network uncertainty remains unsaved/unknown until reconciliation.
