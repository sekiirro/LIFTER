# Data Model: PO comprehensive client export

No export-specific entity is approved until MCQ 030-01 is resolved. The conceptual model for later design is:

| Concept        | Existing source/reuse                                       | Constraint                                                                                                            |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Export request | Existing authorized request/operation and audit conventions | Store actor, selected scope, manifest version, request/finish state and opaque ID only; no row/health data in audit.  |
| Field manifest | PO-approved schema choice                                   | Explicit allow-list; separate health/fitness-sensitive fields from ordinary identity; no silent schema drift.         |
| Artifact       | Existing storage if selected                                | Bind to requesting PO, selected scope and approved expiry; authenticated retrieval and deletion on expiry/revocation. |
| Export rows    | Existing source-of-truth tables/readers                     | Stream/page bounded data; preserve workspace scope; do not persist a duplicate dataset.                               |

Exact persistence, format and artifact lifecycle are PENDING-PO. The client-plan export entity/route is out of scope and must not be reused as if it were comprehensive export.
