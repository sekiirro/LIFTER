# F15-7 Correction Authorization Matrix

**Status: PROPOSED — awaiting PO approval**

The permitted actor set is already decided by F15-7: Client, Trainer, PO and WO may correct submitted answers with authorization. This proposal defines the operation × field × scope details for PO review; it does not reopen the role decision. No correction implementation or UI may rely on this matrix until the PO approves it.

## Field classes

| Field class | Contents | Sensitivity treatment |
| --- | --- | --- |
| Ordinary answer | Non-health intake answer, including preferences and free-form response | Client-specific Forms data; audited and protected like all answer data |
| Sensitive health answer | Health, fitness, nutrition, measurement, medication, injury, or other sensitive personal answer | Sensitive health data; fail-closed audited read and no-store protections apply |
| Correction note | Explanation accompanying a correction | Treat as sensitive client-specific Forms content; append-only, included in retention purge, never copied into logs/audit payloads |
| Answer-version history | Prior and current values, correction actor/time, and correction note association | Contains answer content; same read authorization as the underlying field, every version access audited |
| Attachment | File/object or attachment metadata | **Unsupported in MVP.** No upload, object, storage owner, or authorization path exists. Future support requires a new PO-approved field/operation matrix and the lifecycle details in the spec's Attachment lifecycle section. |

## Proposed operations × roles × field classes

Legend: **Allow** = permitted subject to the scope and audit conditions below. **Deny** = no data, existence, or mutation signal. **Unsupported** = no Forms attachment operation exists.

| Operation | Client | Trainer | WO | PO | Sales |
| --- | --- | --- | --- | --- | --- |
| View current ordinary answer | Allow, own assigned form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View current sensitive health answer | Allow, own assigned form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| Correct ordinary answer | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| Correct sensitive health answer | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| Add correction note | Allow, own submitted form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View ordinary answer-version history | Allow, own form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View sensitive answer-version history | Allow, own form only | Allow, authorized workspace | Allow, authorized workspace | Allow, explicitly selected existing workspace | Deny |
| View/correct attachment or its metadata | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported |

## Scope and enforcement conditions

- **Client:** derive client/workspace identity from the signed Auth association; accept no client or workspace target parameters. Allow only the client's own assigned form while the client is authorized for that path. Never expose another client's answer, history, metadata, or existence.
- **Trainer and WO:** require current membership and capability in the answer's workspace for every operation. Coaching reads are workspace-wide and do not require responsible-Trainer assignment. Do not permit cross-workspace IDs or stale membership.
- **PO:** platform oversight is permitted only for an explicitly selected, existing `public.workspaces` row. Reject nonexistent workspace identifiers with the same generic denial shape as foreign targets.
- **Sales:** deny all answer, correction, note, and history operations. Payment or registration-link capabilities confer no Forms access.
- **Field scope:** this proposal permits the decided correction roles to correct both ordinary and sensitive answer fields. It does not permit changing form definitions through a correction operation, replacing an assignment, deleting prior versions, or editing the original submission/deadline.
- **Versioning:** each accepted correction appends a new immutable answer version and safe audit event. Preserve the original submission instant and deadline. Correction notes are immutable content associated with that version.
- **Audit and response handling:** every answer/history read appends IDs-only access evidence before returning content; audit failure returns no answers. Every correction and note mutation is audited atomically. Logs, notifications, telemetry, traces, audit payloads, and job errors contain no answer or note content. Answer-bearing responses are HTTPS and `private, no-store`; no browser persistence or Realtime publication.
- **Workspace scoping:** answer reads and writes stay on the existing audited access path, with workspace-bound relations and forced RLS. Do not expose direct table, embedding, PostgREST, or unaudited RPC access.
- **Post-relationship-end corrections:** whether a correction may be made after Closure/Refund/Deactivation but before the 30-day purge completes is not stated by F15-7/RET-1..3. This eligibility boundary is OPEN for PO clarification; do not infer permission from the retention grace period.
- **Attachments:** until an attachment feature is separately specified and approved, reject uploads and attachment IDs. Any future support must declare the storage owner, authorized upload/read/delete operations, metadata protection and a purge path meeting RET-2/3 before accepting data.

## PO review checklist

1. Confirm or adjust which authorized operations are allowed for each field class and role while preserving the F15-7 actor set.
2. Resolve correction eligibility after relationship end and before purge.
3. If Forms attachments are ever added, approve their storage owner and authorization/purge lifecycle before enabling upload.
