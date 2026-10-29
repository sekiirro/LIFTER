# F15 Authorization and Audit Contract

## Principals and scope

| Principal | Allowed scope | Denied scope |
| --- | --- | --- |
| Client | Own assigned form, draft, submission, correction and history, derived from signed Auth association and approved client state | Any other client/workspace target, even within same workspace; pending/rejected protected Forms content |
| Trainer | Current authorized workspace; approved template/assignment/correction operations | Other workspaces, stale membership, Sales-only capabilities |
| WO | Current authorized workspace; approved template/assignment/correction operations | Other workspaces, stale membership |
| PO | Explicitly selected existing workspace for workspace-scoped data | Nonexistent workspace UUID; implicit cross-tenant access without target scope |
| Sales | No Forms answers, selector, builder, correction or history permission | All Forms access |
| Internal worker | Narrow operation-specific rows and capabilities | General answer access or unrestricted workspace authority |

App checks and database RLS independently enforce the decision. Use actual helpers `app_private.role_has_capability` and `app_private.has_workspace_access`, plus explicit existing-workspace joins for PO. Capability parity must test known and unknown values in both TS→SQL and SQL→TS directions after F12 and F14 changes merge.

Foreign, nonexistent and unauthorized targets return the same status/code/body shape except incidental request IDs. No answer, metadata or existence signal is returned.

## Audited read protocol

1. Authenticate and derive actor/client/workspace scope from trusted session state.
2. Check current role, membership, client association and assignment scope.
3. Append allow-listed IDs-only read evidence.
4. Only if the audit append succeeds, return the answer/history projection.

Audit failure returns no answer bytes. Current answer and every history revision use this exact path. Direct table reads, embeddings, PostgREST and unaudited RPCs deny. Audit data excludes answer values, labels, authored text, correction notes, PII, raw arguments and tokens.

## Mutation contract

Mutations recheck current authorization after lock waits. Form publication, selection, assignment, draft, submission, correction, SLA, alert and purge state changes append safe audit evidence atomically. Replays of an accepted canonical intent do not duplicate state or mutation audit. Corrections append immutable versions while the relationship is active; they never alter the original submission instant or SLA deadline. Q1 denies all roles after Closure/Refund/Deactivation. Q2 removal from already-submitted history remains blocked only for its conflict sub-case.

Answer-bearing responses require HTTPS and `Cache-Control: private, no-store`; no shared cache, browser persistence, Realtime or service-role answer path is allowed. Errors map to allow-listed codes; raw DB/provider errors are neither returned nor logged.

## Required authorization matrix tests

Exercise every answer, correction, current-value and history path for: (1) Client self-only, (2) staff current workspace, (3) PO explicit existing workspace, and (4) Sales denied. Include cross-client, foreign workspace, nonexistent workspace, pending/rejected client, stale/revoked membership, ordinary and medical fields, attachment permission wherever attachments exist, and audit append failure. Audit failure must fail closed on every read path.
