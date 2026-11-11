# F15 Forms API Contract (Logical)

Route names below are proposed ownership seams, not implemented interfaces. Request/response schemas are finalized only with code and tests; security invariants in this document are binding from the feature spec.

## Operations

| Operation                              | Actor scope                                                                    | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select/configure form                  | PO/WO/Trainer authorized workspace                                             | Current capability/membership; eligible published version; no Sales access; per-form Q3=D audience, trigger, timing, recurrence and stop controls                                                                                                                                                                                                                                                                                                                                                                                             |
| Consume approval / resolve self-intake | Narrow internal worker / approved client                                       | Consume committed F12 event and valid selection atomically; idempotent; never select arbitrary fallback                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Read assignment/answer/history         | Client own assignment; staff workspace; PO explicit existing workspace         | Audited reader before any sensitive content; no-store; generic denial                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Save draft                             | Client own assignment                                                          | Expected revision and stable intent key; partial answer set allowed; shared server validator checks snapshot/types/applicability, short/long Unicode code point limits (150/1,000, or lower published per-question limit), independent 4,096-byte UTF-8 answer safety cap, and 262,144-byte answer-value payload cap                                                                                                                                                                                                                          |
| Submit                                 | Client own assignment                                                          | Shared server validator applies the same text and payload caps, plus completion of the applicable required answers authored for the assigned version (no fixed section count or question inventory, FR-006/FR-008); one immutable accepted submission and original SLA                                                                                                                                                                                                                                                                        |
| Correct submitted answers              | Client self-only, Trainer/WO current workspace, PO explicit existing workspace | Approved matrix while client relationship remains active; deny every role after Closure/Refund/Deactivation (Q1). Append immutable revision + atomic safe audit; correction does not reset the D-03 Trainer deadline. Client submission deadline is per assignment under D2/D3. D-29 separately authorizes automatic server-validated D1 erasure of answers currently inapplicable under authoritative answers, across versions and their answer-change/access-view audit rows; exact migration waits for F12/F14 merge and verified Stack D. |
| Read correction history                | Same as answer access                                                          | Every revision audited; fail closed on audit error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Detect/resolve alert                   | Narrow worker and currently authorized recipients                              | Late intake is detected when the configured client-submission deadline passes without accepted submission; notify authorized owners immediately. Client-to-Trainer assignment and client-late Trainer alert are deferred to F11/F12 under PDN-S39-F15-01; D-03 Trainer-late keeps existing Q4 rules. IDs-only state; dedup; real data requires authoritative facts                                                                                                                                                                            |
| Author/publish version                 | PO/WO/Trainer in authorized workspace                                          | Add/remove/reorder sections/questions; edit bilingual content, type, options, conditions, editable food lists and visual asset references. Draft → Preview → Publish; publication creates immutable version and never edits prior assignments. Your First Step is the ordinary editable default; Workspace Owners may edit, replace or select another onboarding form.                                                                                                                                                                        |
| Save signup identity/consent           | Invitation-only signup server transaction                                      | Extend F11 signup fields/validation and atomically store identity/link consumption without T&C consent; record required T&C version/timestamp only at post-Nutrition Terms Card, with separate optional marketing consent; preserve F11 no-session/pending-approval invariants. See `signup-extension.md`.                                                                                                                                                                                                                                    |

## Write preconditions

- Never accept caller-selected `client_id` or `workspace_id` on client operations. Derive scope from Auth and verify assignment ownership.
- Require `expected_revision` for drafts and canonical intent binding for retry keys. A reused key with changed intent fails safely.
- Reject stale authorization after any lock wait. Preserve the F12 lock order and P2 extension in plan.md.
- Return only safe allow-listed errors; never expose raw constraint/provider errors.
- Server draft and submission handlers (including future RPCs) MUST call `lib/forms/validation.ts`; client validation is supplemental only. Reject an over-limit textual answer or payload before any write with an allow-listed `answer_too_long` or `payload_too_large` error. The database migrations in T012/T013 add equivalent defense-in-depth enforcement when the answer schema exists.
- Typed definitions include text, single/multi choice, Yes/No, number+unit, slider, image-card single choice, chips, read-only profile-bound fields, computed age and derived option sets. Profile-bound and computed values are server-derived and cannot be submitted as client-edited answer values.
- The condition authoring model must support nested Yes/No branches (including N5), N7 count-derived meal timing choices, and N8 budget-derived editable food chips. Derived selections are validated against the active parent answer on every draft and submit; changing the parent clears invalid dependent values and applies approved D1 erasure semantics.
- Enforce existing limits without amendment: 20 questions/section, 60/form, 150/1,000 Unicode code points, 4,096 UTF-8 bytes/text answer, 262,144 UTF-8 serialized answer-value bytes/submission, 400 conditions, 16/question, 4,000 evaluation steps, 131,072 definition bytes and 50 choices.
- Your First Step is the ordinary editable default onboarding form in Forms, with prior intake questions only as optional editable starter content. Workspace Owners may edit, replace, or select another onboarding form. Assignment audience/timing are configured per form under Q3=D. No immutable Mandatory Intake catalog exists; published versions and assignment snapshots remain immutable.
- The N12 client answer is an image-card ID mapped to a known reference entry; authorized Trainers receive the associated numeric percentage. The student-facing card, accessible name, ordering and approved disclaimer must remain aligned with the version snapshot.

## Response and caching

- Authenticated answer-bearing endpoints are server-only and no-store (`Cache-Control: private, no-store`).
- No CDN, ISR, framework shared cache, Realtime publication, browser storage or service-role response.
- Denial response shape is indistinguishable for foreign/nonexistent/unauthorized targets except incidental request ID.
- Success acknowledgement means durable accepted revision only. Network uncertainty remains unsaved/unknown until reconciliation.

## S17 persistence slice

The F15-owned relations are `public.forms`, `public.form_versions`, and
`public.form_assignments`. Every tenant relationship carries `workspace_id` in
its key and foreign keys. Published form versions and assignment snapshots are
immutable. A version and its assignment bind the latest published row in
`app_private.terms_policy_versions`; the migration seeds no published T&C
copy. Tests publish synthetic policy rows inside rollback-scoped fixtures.

Direct table grants remain revoked. Forced RLS policies call the shared
capability and workspace helpers; the `author_forms`, `assign_intake_form`,
and `read_form_answers` capability mappings are pending the final shared
function reconciliation. `public.read_form_answer` appends an IDs-only
`form.answer_viewed` audit event before returning answer values. The private
retention worker uses immutable 30-day source windows, active legal holds, and
counts-only erasure controls; lifecycle writers still need to bind the
authoritative F12 closure/refund/deactivation facts after those contracts
merge.

### Capability additions and read paths

<!-- prettier-ignore-start -->
| Capability | Staff role set | Authority and scope |
| --- | --- | --- |
| `assign_intake_form` | PO, WO, Trainer | F15-3; `spec.md` FR-022 and SC-017. Sales and unknown capabilities deny. |
| `author_forms` | PO, WO, Trainer | F15-1; `spec.md` FR-004/030, SC-017, and the approved workspace builder operation matrix. Trainers may publish and retire workspace forms. Workspace membership is checked separately; global reusable-template governance remains PO-only. |
| `read_form_answers` | PO, WO, Trainer | `correction-matrix.md`, “Approved operations × roles × field classes”: staff current ordinary/sensitive answers and history are allowed in authorized workspace scope; Sales denies. PO must select an existing workspace. Clients read only their own assignment through the separate client path and are not granted this staff capability. PO final correction approval (2026-10-29) and Q1 relationship-end denial apply. |
<!-- prettier-ignore-end -->

`public.forms` and `public.form_versions` are read through the authorized
server-side Builder/catalog adapter; `public.form_assignments` is read through
the authorized assignment adapter (client self-scope or staff workspace
scope). These relations are not direct PostgREST data APIs: their RLS policies
remain installed, but table grants stay revoked. Answer revisions and drafts
are returned only by `public.read_form_answer`, which checks scope and appends
the access audit before returning answer values. Direct table reads, embedded
answer reads, and other answer-bearing RPCs are not an alternate path.
