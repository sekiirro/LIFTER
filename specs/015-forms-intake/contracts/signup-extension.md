# F15 delivery of the F11 signup extension

This is a cross-feature logical contract. F11 remains the owner of invitation-token consumption, Auth identity creation, privacy defenses, and pending-approval access controls. F15 adds fields and consent requirements to that existing transaction; it does not replace F11.

## Fields and validation

| Field | Requirement |
| --- | --- |
| Full name | Required; after trimming/splitting on Unicode whitespace, at least three non-empty components. Persist the authored name unchanged after validation. |
| Date of birth | Required; valid past calendar date. Reject impossible and future dates. Store the date without a timezone conversion. Computed age uses the current Africa/Cairo calendar date and is never user-editable. |
| Username | Required; normalize with Unicode NFKC then lowercase before uniqueness comparison and persistence. Unique within the applicable workspace account namespace. Reject platform/system/role words and workspace identifiers/slugs from the centrally maintained reserved-name list. |
| Telegram username | Optional. If absent, accept it. If present, validate syntax only; never require Telegram linkage. |
| Phone, email, password | Preserve F11's existing required validation, generic duplicate response, credential handling and Auth invariants. Email and phone remain globally unique. |
| Terms consent | Not collected at signup. After Nutrition, the Terms Card shows a required unchecked checkbox; on acceptance persist exact policy version and server timestamp. Intake remains incomplete until accepted. |
| Marketing consent | At the post-Nutrition Terms Card, offer a separate optional unchecked checkbox. Persist only when explicitly opted in; independently record its policy version and server timestamp. It is not a prerequisite to account creation or intake completion. |

## Preserved F11 invariants

- Invitation-only `/register/[token]`; no public signup or marketing Landing page.
- Auth identity creation, client insert, registration-link single-use consumption and successful audit remain one atomic operation under the approved F11 transaction design.
- Generic invalid/duplicate/unavailable behavior and rate-limit/admission privacy boundaries remain unchanged.
- Signup creates no authenticated client session. The client has zero client-scoped access while pending approval, even after independently signing in; F12 remains the approval owner.
- No health/fitness intake is displayed or accepted before current authoritative approval. A pending or rejected client cannot access Forms through app, RLS, RPC, Storage, or direct endpoints.
- The F11 security/audit allow-list must be reviewed before adding DOB, username or personal data fields, including the B06 sex answer in Forms. Signup creates the pending account without T&C consent; consent persistence occurs after Nutrition at the Terms Card. Never add raw DOB, username, consent copy, token, PII, credential or health data to audit/log payloads. Consent receipt persistence is private and limited to what is necessary to prove policy version and acceptance time.

## Post-approval journey

After approval status is resolved, assign the Mandatory Intake under the existing F12/F15 approval event contract. Journey order is Basic → Training → Nutrition → Terms Card → new LIFTER Welcome page. Forms questions requiring health information are unavailable before approval. Terms publication and acceptance are versioned; changes after publication create a new policy version and do not rewrite prior receipts.

The binding session-14 decision places T&C consent only at the post-Nutrition Terms Card. Signup creates the pending account without T&C consent. Terms acceptance is required to complete intake; optional marketing consent is separate.

## Dependencies and migration boundary

Implementation depends on the latest merged F11/F12 contracts, review of F11's Auth compatibility and audit-field constraints, F12 approval state, and verified Stack D. F12 and F14 remain external/unmerged integration dependencies from this branch's base. Any F15-owned migration timestamp is `20261104000000` or later and must follow every F12/F14 migration actually merged by implementation time. This contract authorizes no migration, Auth write, database operation or production change by itself.
