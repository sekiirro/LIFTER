# F15 Data Model (Logical)

This is a logical model, not a schema migration. Tenant-owned records carry `workspace_id`; relationships use composite `(workspace_id,id)` keys and forced RLS. Exact columns, indexes, policies and retention implementation require the verified F15 isolated stack and latest merged F12/F14 baselines.

## Entities

| Entity | Scope and lifecycle | Key invariants |
| --- | --- | --- |
| Form | Platform-global or workspace-owned template identity | Global mutation is PO-only. Workspace actions follow approved F15-1 matrix. No cross-workspace answer access. |
| FormVersion | Immutable published authored content and declarative rules | Stable section/question IDs; separate AR/EN content; edit means new version. Text questions use 150/1,000 Unicode code point type maxima and may carry an integer per-question `charLimit` from 1 through the type maximum. No executable rules. |
| FormSelection | Workspace/client/form/version trigger, audience and recurrence configuration | Q3 audiences include all active clients, joining/onboarding clients, searched specific clients, and custom recurring schedules; renewal trigger uses actual F13 service start including freeze shifts. Stop while frozen/inactive. |
| ApprovalConsumption | Private F12 event identity plus F15 consumer state | Consumes only committed `registration.approved` v1 fact; no PII/form data in shared fact. Idempotent by event identity. |
| Assignment | Workspace/client/initial subscription/form-version obligation | Captures immutable independent snapshot; initial assignment unique by `(workspace_id,subscription_id)`. |
| AnswerDraft | Current acknowledged draft revision for assignment | Client-specific sensitive data; save is expected-revision checked; partial drafts allowed. |
| AnswerRevision | Immutable submission or correction version | Append-only; same-workspace assignment FK; values readable only through audited reader. Corrections denied after Closure/Refund/Deactivation (Q1). Q2 removal from existing history is blocked pending PO resolution. |
| Submission | Original accepted complete submission | Exactly one per initial obligation; immutable original instant and answer revision. |
| SlaObligation | Frozen D-03 start/day-five/deadline facts | Starts at first accepted complete Mandatory Intake submission; correction never resets; rule ID `cairo-d03-v1`. |
| ProcessingJob | Bounded assignment/backfill/alert/purge work item | Narrow internal authority, idempotent state, safe error code only; no raw error/body/answer. |
| DelayOccurrence | Logical late interval tied to SLA and authoritative P4 delivery facts | No real classification without complete P4 coverage; synthetic facts allowed. |
| AlertDelivery | Recipient/stage delivery state | IDs only; dedup occurrence × stage × recipient; reauthorize at delivery/read. |
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

- Q3/Q4 leave these operational details unstated: whether recurrence resumes after freeze ends; initial alert recipient when no Trainer is assigned; whether reassignment restarts the 24-hour clock; behavior when either escalation owner is unavailable or revoked.
- Q2 branch removal from already-submitted answer versions/history and audit is blocked pending PO resolution; requiredness bypass remains prohibited.
- No role may correct after Closure, Refund or Deactivation (Q1), even before purge.
- Mandatory Intake question entities/content are seeded only after the PO supplies them at the named task.
- Retention legal/technical feasibility for every hosted recoverable copy is a pre-production gate.
