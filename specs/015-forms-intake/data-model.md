# F15 Data Model (Logical)

This is a logical model, not a schema migration. Tenant-owned records carry `workspace_id`; relationships use composite `(workspace_id,id)` keys and forced RLS. S25-PO-8 and S25-R4 require always-on in-app delivery and optional Telegram only for explicitly linked staff. No Email. Telegram carries generic text plus an in-app link and never names, answers or health data. Exact columns, indexes, policies and retention implementation require the verified F15 isolated stack and latest merged F12/F14 baselines.

## Entities

| Entity | Scope and lifecycle | Key invariants |
| --- | --- | --- |
| Form | Platform-global or workspace-owned template identity | Global mutation is PO-only. Workspace actions follow approved F15-1 matrix. No cross-workspace answer access. |
| FormVersion | Immutable published authored content and declarative rules | Stable section/question IDs; separate AR/EN content; edit means new version. Text questions use 150/1,000 Unicode code point type maxima and may carry an integer per-question `charLimit` from 1 through the type maximum. No executable rules. |
| WorkspaceForm / FormVersion | Ordinary workspace-authored form and immutable published content | A workspace may designate one form as its default onboarding form. Your First Step is the initial default; prior intake questions may be starter content only. Workspace Owners may edit, replace, or select another onboarding form. Edits publish a new immutable FormVersion; assignments bind immutable snapshots. No separate immutable Mandatory Intake catalog exists. |
| QuestionAnswerDefinition | A version-scoped typed question or child, including conditional applicability | Supported S14 shapes: short/long text, single/multi choice, Yes/No, number+unit, slider, image cards, chips, read-only profile-bound field, computed age, and derived choices. Stable IDs survive edits; changes publish a new form version. |
| ConditionalRule / DerivedOptionSet | Declarative bounded branch predicates and derived choice source | Supports nested Yes/No N5 branches, N7 count-derived timing options and N8 budget-derived editable foods. Must remain within approved 400 conditions, 16 conditions/question and 4,000 evaluation steps. Branch disappearance clears inapplicable answer values per approved D1 semantics. |
| SignupProfileExtension | F11 client identity fields supplied by invitation-only signup | Adds DOB, three-part name validation, normalized workspace-scoped username and optional Telegram; T&C consent is collected after Nutrition while preserving F11 atomic link/Auth transaction and pending-approval isolation. Existing global email/phone uniqueness is unchanged. |
| ConsentReceipt | Accepted legal-policy version and server instant for one client | No T&C consent is recorded at signup. The post-Nutrition Terms Card requires an unchecked box; acceptance stores immutable policy version and server timestamp and is required to complete intake. Marketing consent is separate, optional and independently version/timestamped when opted in. No health data is collected pre-approval. |
| BodyFatReferenceAsset | Approved client-visible image-card reference and metadata | Keep YBS originals read-only and uncommitted; retain source path and SHA-256 in `assets/body-fat/PROVENANCE.md`; store only optimized WebP/AVIF derivatives under `public/images/body-fat/` (max 2x display width; target <=150 KB). Sex is personal data used only to choose standard male/female N12 series; male-cinematic is unused. Trainer projection exposes selected numeric percentage. No YBS T&C artifact/design. |
| SexAnswer | Required personal data answer associated with the intake profile | Used only to select the standard N12 `male` or `female` reference series; `male-cinematic` is unused. Apply the same authorization, no-store, audit-redaction, retention and erasure controls as the sensitive intake profile. The value is not logged or included in audit payloads. Purge it with related answer data across recoverable copies within the approved 30-day relationship-end window. |
| FormSelection | Workspace/client/form/version trigger, audience and recurrence configuration | Q3 audiences include all active clients, joining/onboarding clients, searched specific clients, and custom recurring schedules; renewal trigger uses actual F13 service start including freeze shifts. Stop while frozen/inactive. |
| ApprovalConsumption | Private F12 event identity plus F15 consumer state | Consumes only committed `registration.approved` v1 fact; no PII/form data in shared fact. Idempotent by event identity. |
| Assignment | Workspace/client/initial subscription/form-version obligation | Captures immutable independent snapshot; initial assignment unique by `(workspace_id,subscription_id)`. |
| ClientSubmissionDeadline | One deadline per assignment/recurrence occurrence | Calculated from assignment instant using Cairo calendar dates: default onboarding form day 0 + 3 dates; other forms 1-14 days, default 3. Deadline ends at 23:59:59.999 Cairo. Separate from the D-03 Trainer delivery SLA. |
| AnswerDraft | Current acknowledged draft revision for assignment | Client-specific sensitive data; save is expected-revision checked; partial drafts allowed. |
| AnswerRevision | Submission or correction version | Same-workspace assignment FK; values readable only through audited reader. Corrections denied after Closure/Refund/Deactivation (Q1). D-29 permits automatic server-validated deletion of answer values whose question is currently inapplicable under the authoritative answer state, across every version. |
| AnswerErasureControl | Append-only evidence for completed/deferred automatic erasure | Counts only; no operation, tenant, actor, assignment, question, answer or audit-row IDs, no content. Legal hold records defer/count outcome and alert without deletion targets. |
| Submission | Original accepted complete submission | Exactly one per initial obligation; immutable original instant and answer revision. |
| SlaObligation | Frozen D-03 start/day-five/deadline facts | Starts at first accepted complete submission of the selected onboarding form; correction never resets; rule ID `cairo-d03-v1`. This is the Trainer delivery deadline, distinct from each assignment’s client-submission deadline. |
| ProcessingJob | Bounded assignment/backfill/alert/purge work item | Narrow internal authority, idempotent state, safe error code only; no raw error/body/answer. |
| DelayOccurrence | Logical late interval tied to client-submission assignment or D-03 SLA | Client-late owner notices follow the approved F15 trigger; the client-to-Trainer assignment and Trainer alert are deferred to F11/F12 under PDN-S39-F15-01, with S36-01=A retained as the future source rule. Trainer-late D-03 preserves existing Q4 rules. Current authorization is checked at enqueue and delivery. |
| AlertDelivery | Per-channel delivery state for one occurrence/stage/recipient | IDs only; unique `(workspace_id, occurrence_id, stage, recipient_user_id, channel)` for `in_app` or `telegram`; reauthorize at enqueue/delivery/read. Telegram is created only for an explicitly linked staff account. |
| InAppAlertInbox | Recipient-owned in-app notification created from the T016 alert queue | One row per alert delivery/channel; forced RLS and audited reader restrict reads to the recipient. Mark-read is recipient-only and audited. IDs/codes only; source record/relationship-end retention, purged within 30 days. |
| TelegramLinkToken | One-time staff account-link authorization for the bot `/start` deep link | Random short-lived token, hash only at rest, single use, bound to the authenticated staff user. Expired/used token rejects without revealing account state. |
| TelegramAccountLink | Explicit staff-to-Telegram private chat binding | Persist Telegram chat ID, never username as identity proof; unique staff user and chat. Staff unlink is supported; workspace membership loss revokes the link. |
| TelegramUpdateReceipt | Webhook update idempotency state | Unique Telegram update ID; record no raw body or token. Verify configured secret header using constant-time comparison before processing. |
| Audit evidence | Append-only safe access/mutation facts | Identifiers and allow-listed codes only; no answer/authored text/note/PII. Read audit failure blocks data return. |

## Relationship sketch

```text
Workspace ── Form ── FormVersion
    │             └── FormSelection ── Client
    │                                  │
    ├── Assignment ── Client + Subscription + immutable FormVersion snapshot
    │       ├── AnswerDraft ── AnswerRevision* ── Submission
    │       └── SlaObligation ── DelayOccurrence ── AlertDelivery*
    └── ProcessingJob / safe Audit evidence
```

`*` indicates append-only or deduplicated child records. PO audit scope is bound to a real existing workspace; a global PO role check by itself is insufficient for tenant-owned Forms content.

## Constraints to preserve

- Tenant FKs are composite and same-workspace. Client ownership is derived from signed Auth identity and approved F12 association; request bodies do not accept client/workspace targets.
- Assignment snapshot contains the exact published content/rules applicable at assignment time. Later source changes do not affect it.
- Draft/submission validation applies a 4,096-byte UTF-8 cap per textual answer and a 262,144-byte cap on the sum of UTF-8 JSON-serialized answer values, excluding question IDs, object keys, envelope fields and transport framing. Every server write path calls the shared pure validator; T012/T013 add database-level enforcement with their schema migrations.
- Draft revision updates require expected-current revision. Submission/correction adds immutable revisions; original submission and SLA facts do not change.
- Unique constraints independently enforce one initial assignment and one original submission/SLA, even when operation keys differ.
- Answer content has no Realtime, browser storage, shared framework cache or service-role path.
- No attachment object/table/bucket is modeled for MVP. If a separately specified future feature adds attachments, it must bind scope/audit/metadata and purge lifecycle before accepting files.
- Purge begins from authoritative Closure/Refund/Deactivation fact/time. Reusable templates remain; only legally required minimal Forms audit evidence may remain. Financial ledger events are not deleted.

## Open model details

- D4 and F1 close recurrence and alert timing. At delivery, recheck authorization and notify whichever PO/WO remains authorized (A3).
- D-29 approved the Constitution VII exception and security/DB design (design only). The server-validated current answer state determines applicability; every answer value in every version is selected if its question is currently inapplicable, including values that were already hidden before the latest change or remained during a legal hold. Previous answers may support branch evidence/validation but do not gate erasure. Only same-answer answer-change and access-view audit rows are selected. Financial, authentication, authorization, security, unrelated-client, other-tenant and unrelated audit rows are never targets. A legal hold defers with alert and no targets. Selection is tenant-isolated, idempotent and fail-closed. The control record contains counts only, with no IDs; no answer content enters logs. RET-3 requires purge across all recoverable copies within 30 days.
- The exact migration/function remains DB-blocked until F12/F14 merge and verified Stack D. No SQL is part of this plan. No human role or service-role caller has a direct delete or trigger path.
- No role may correct after Closure, Refund or Deactivation (Q1), even before purge.
- The S14 inventory and copy are supplied. The exact N01 option/title translations and N12 asset-to-percentage mapping require explicit source/PO confirmation where this spec does not list them; do not synthesize missing values. Reserved-name categories are defined in the signup contract.
- Terms and Conditions Arabic and English drafts were approved verbatim by S30-PO-1 Q2. Architect defaults specify existing premium card/checkbox components for the Terms Card and 150-250ms N11 motion with `prefers-reduced-motion`.
- Retention legal/technical feasibility for every hosted recoverable copy is a pre-production gate.
