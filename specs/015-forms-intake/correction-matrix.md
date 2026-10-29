# F15-7 Correction Authorization Matrix

**Status: APPROVED by PO 2026-10-29 (Final PO APPROVAL)**

The permitted actor set and operation × field × scope details below are approved by the PO. PO, WO, Trainer and Client have full correction permissions for submitted forms, including medical fields and attachments, subject to tenant isolation, authorized client scope, current authorization, immutable version history and audit. The post-relationship-end correction eligibility case remains OPEN and is not decided by this approval.

## Field classes

| Field class | Contents | Sensitivity treatment |
| --- | --- | --- |
| Ordinary answer | Non-health intake answer, including preferences and free-form response | Client-specific Forms data; audited and protected like all answer data |
| Sensitive health answer | Health, fitness, nutrition, measurement, medication, injury, or other sensitive personal answer | Sensitive health data; fail-closed audited read and no-store protections apply |
| Correction note | Explanation accompanying a correction | Treat as sensitive client-specific Forms content; append-only, included in retention purge, never copied into logs/audit payloads |
| Answer-version history | Prior and current values, correction actor/time, and correction note association | Contains answer content; same read authorization as the underlying field, every version access audited |
| Attachment | File/object or attachment metadata | Allow wherever attachments exist, subject to the same scope rules. This approval does not define an MVP attachment feature or storage. |

## Approved operations × roles × field classes

Legend: **Allow** = permitted subject to the scope and audit conditions below. **Deny** = no data, existence, or mutation signal.

| Operation | Client | Trainer | WO | PO | Sales |
| --- | --- | --- | --- | --- | --- |
| View current ordinary answer | Allow, own assigned form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View current sensitive health answer | Allow, own assigned form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| Correct ordinary answer | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| Correct sensitive health answer | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| Add correction note | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View ordinary answer-version history | Allow, own form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View sensitive answer-version history | Allow, own form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View/correct attachment or its metadata, wherever attachments exist | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |

## Scope and enforcement conditions

- **Client:** derive client/workspace identity from the signed Auth association; accept no client or workspace target parameters. Allow only the client's own assigned form while the client is authorized for that path. Never expose another client's answer, history, metadata, or existence.
- **Trainer and WO:** require current membership and capability in the answer's workspace for every operation. Coaching reads are workspace-wide and do not require responsible-Trainer assignment. Do not permit cross-workspace IDs or stale membership.
- **PO:** platform oversight is permitted only for an explicitly selected, existing `public.workspaces` row. Reject nonexistent workspace identifiers with the same generic denial shape as foreign targets.
- **Sales:** deny all answer, correction, note, and history operations. Payment or registration-link capabilities confer no Forms access.
- **Field scope:** this proposal permits the decided correction roles to correct both ordinary and sensitive answer fields. It does not permit changing form definitions through a correction operation, replacing an assignment, deleting prior versions, or editing the original submission/deadline.
- **Versioning:** each accepted correction appends a new immutable answer version and safe audit event. Preserve the original submission instant and deadline. Correction notes are immutable content associated with that version.
- **Audit and response handling:** every answer/history read appends IDs-only access evidence before returning content; audit failure returns no answers. Every correction and note mutation is audited atomically. Logs, notifications, telemetry, traces, audit payloads, and job errors contain no answer or note content. Answer-bearing responses are HTTPS and `private, no-store`; no browser persistence or Realtime publication.
- **Workspace scoping:** answer reads and writes stay on the existing audited access path, with workspace-bound relations and forced RLS. Do not expose direct table, embedding, PostgREST, or unaudited RPC access.
- **Post-relationship-end corrections:** whether a correction may be made after Closure/Refund/Deactivation but before the 30-day purge completes is not stated by F15-7/RET-1..3. This eligibility boundary is OPEN for PO clarification; do not infer permission from the retention grace period. The Final PO APPROVAL does not decide it.
- **Attachments:** correction permissions apply wherever attachments exist, under the same scope rules. FR-032 continues to define no MVP attachment feature or storage until separately specified. Any future support must declare the storage owner, authorized upload/read/delete operations, metadata protection and a purge path meeting RET-2/3 before accepting data.

## PO review checklist

1. Resolve correction eligibility after relationship end and before purge.
2. If Forms attachments are ever added, specify their storage owner and authorization/purge lifecycle before enabling upload.
