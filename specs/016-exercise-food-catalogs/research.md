# F16 Design Research

**Feature**: [Exercise & food catalogs](spec.md)

**Authority**: PO-approved `spec.md`, `plan.md`, `debate.md`, S20-03..S20-13 in `docs/04-changes-and-questions.md`, `DESIGN.md`, and Constitution 1.4.0. This document records implementation patterns; it does not reopen decisions.

## Decisions needed for design

| Design question | Decision carried forward | Repository evidence |
| --- | --- | --- |
| How are application permissions represented? | Treat application `authorize(actor, capability, workspaceId)` as the first wall. `platform_owner` is global; other roles need the workspace in the actor's active membership list and the role capability. Catalog UI visibility is not authorization. | `lib/auth/authorize.ts:9-20` |
| How is workspace isolation repeated in Postgres? | Use `app_private.has_workspace_access(workspace_id, 'coaching_work')` in workspace-table RLS and again in mutating RPCs. Global read policy and read RPC must agree: PO directly, or authenticated coaching staff in at least one current workspace. Sales, Client, unaffiliated, and unknown actors fail closed. | `supabase/migrations/20261027120000_tenancy.sql:65-82`; `specs/016-exercise-food-catalogs/plan.md`, Authorization |
| What database function boundary is established? | Follow the F12-F15 authenticated user-JWT pattern: narrow `SECURITY DEFINER` functions, empty search path, fully qualified objects, explicit grants/revokes, role and scope checks inside the function, and no direct client table DML. Keep the established owner pattern; do not invent a new owner role. | `supabase/migrations/20261101121000_registration_approval_operations.sql:7-23, 200-224`; `specs/016-exercise-food-catalogs/plan.md`, Technical Context |
| What is the audit shape? | Use immutable `public.audit_events`, two-segment lower-case action names, one row per successful mutation, and transactional audit insertion. Global events use `workspace_id = NULL`; workspace events use that workspace. Details are an allowlist of IDs and changed-field codes only, with no content, URLs, origin, operation key, or free text. | `supabase/migrations/20261027150000_audit_log.sql:2-6, 29-41, 96-104`; `supabase/migrations/20261102139000_workspace_branding_audit_extension.sql:140-151`; F16 FR-013 |
| How do writes handle retries and stale updates? | Bind a client UUIDv4 operation key to the RPC action and canonical request hash. Same actor/key/hash returns the original result; same key with a different hash conflicts. Lock identities, recheck membership/capability after lock waits, compare expected and current versions, then append exactly one audit event atomically. | `supabase/migrations/20261027160000_jobs.sql:48-54` (idempotent insert); `supabase/migrations/20261102132000_workspace_branding_owner_operations.sql:141-145, 170-172` (row lock and stale revision conflict); F16 FR-013/016 |
| How should version history and identity transitions be protected? | Immutable version rows; identity rows expose only lifecycle/current-version transitions. Remove and Restore never delete referenced rows. Merge source into an active identity only, resolves target to its active terminal, locks affected identities deterministically, and flattens aliases to prevent chains/cycles. | `supabase/migrations/20261027150000_audit_log.sql:29-41` (append-only audit precedent); F16 FR-010/011/016 |
| What catalog content is present at schema creation? | Seed exactly the approved taxonomy values (18 muscle groups and 10 equipment values). Seed no exercise or food entries. The D16-4 food dataset is a later PO-supplied input requiring audit and explicit PO import approval. | `docs/04-changes-and-questions.md:76,78`; `specs/016-exercise-food-catalogs/spec.md`, FR-019 and Approved catalog defaults and import protocol |

## F16-specific decisions applied

- Global exercise identity is shared across all workspaces. Workspace video mappings and workspace-only exercises are separate tenant rows; selected-workspace video URLs resolve at read time under authorization.
- Global food identity is shared. New food creation is immediately usable by authorized coaching staff. Food content requires kcal, protein, carbs, and fat per 100 g or 100 ml; fiber is optional; at least one of Arabic or English name is required.
- Versions are immutable and snapshots pin exact versions. Lifecycle actions are Add, Edit, Remove and Restore, represented by append-only content versions and lifecycle markers. Remove is the only staff-facing removal action; existing plan references remain valid.
- Exact duplicate identity includes language, normalized name, basis, canonical product identity, preparation identity and weighing state. Near-duplicate detection uses normalized textual similarity >=90%, no automatic synonym matching, and kcal proximity <= `max(10%, 10 kcal)` per matching 100 g/ml basis, product/preparation identity and weighing state. Genuine duplicates are blocked; different products/preparations and raw/cooked states remain distinct. Kcal-vs-4/4/9 discrepancies over `max(20 kcal, 10% of stated kcal)` warn but do not block saving by themselves.
- D16-10 limits apply to every authorized food creator role: at most 10 new food identities per creator per rolling 24 hours, 100 across all authorized creators per rolling 24 hours, and 10,000 active foods. Enforce counters transactionally under concurrency-safe locks and make exact replay quota-neutral. Benchmark before production; do not claim benchmark evidence in this design phase.
- Global creator and origin workspace metadata are available only to PO governance reads. Every non-PO server-side projection, including errors, duplicate candidates, counts, search, detail/history and exports, must omit or null both fields. Global audit events carry no workspace origin.
- Exercise defaults are per exercise: warm-up and working sets, fixed/ranged reps, rest, RIR, and alternatives. Food defaults allow at most three alternatives, with validated portions and plan-level overrides.

## References

- `specs/016-exercise-food-catalogs/{spec.md,plan.md,debate.md}`
- `specs/019-plan-core/`
- `docs/04-changes-and-questions.md` (S20-03..S20-13)
- `DESIGN.md`; `.specify/memory/constitution.md` (version 1.4.0)
- `C:/Users/NEW LAP/.lifter/briefs/s20-po-final-decisions-verbatim.md` (binding decision source)
