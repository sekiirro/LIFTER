# Research: Packages & Package Versions (P1-F9)

This records the supplied architect decisions against repository evidence; it does not reopen business policy or introduce dependencies. Sources: [spec.md](spec.md), Constitution v1.1.0, architecture, D-09/D-10/D-11/D-13/D-17, and BRD 30/40–41/53–54/102/196/317. No external technology recommendation or web research is needed for this artifact-only task.

## R1 — Identity separate from workspace sellable terms

- **Decision**: Global immutable `packages.code`; one `package_offers` row per workspace/package/days; numbered `package_versions` hold authored labels and financial terms.
- **Rationale**: BRD 53 says labels cannot define identity; BRD 40/54 makes availability and paid terms workspace data. D-11 adds duration combinations without changing canonical identity.
- **Alternatives**: Label-as-key breaks renaming; one global price prevents workspace configuration; a mutable price row rewrites history.

## R2 — Fixed day arithmetic and explicit financial data

- **Decision**: Presets 1/3/6/8/12 map to 30/90/180/240/360 days; custom positive integer days. Positive bigint minor units plus uppercase three-letter currency; integer commission basis points 0..10000, no defaults.
- **Rationale**: D-11 and Constitution II; BRD 317 forbids importing historical catalog values. Both database and shared pure functions enforce validation. Numeric storage ceilings are technical, not ND-F9-2 policy limits.
- **Alternatives**: Calendar months contradict D-11; float prices lose exactness; assumed currency/rate/tiers invent policy. A global two-decimal formatter is wrong for zero- and three-decimal currencies.

## R3 — Database-only publication and serialization

- **Decision**: A single hardened SECURITY DEFINER publish RPC, executed with user JWT, serializes on the natural offer key before first-row creation, then locks the offer and inserts max(version)+1. Constraints backstop concurrency; pointer and audit commit together.
- **Rationale**: Existing API roles must have no direct mutation privileges; an invoker writer with no grants cannot perform this operation. Advisory locking also covers absent offers. Constitution I/IX requires both app and database checks.
- **Alternatives**: App-side max+1 races; row locking alone misses first creation; separate offer/version/action calls allow partial state; service credentials in actions remove the caller's signed-identity boundary. The general architecture preference for invoker functions is narrowed by the binding F9 definer-RPC decision, with explicit authorization inside every function.

## R4 - Current-only publication replay and reverts

- **Decision**: Same canonical code create returns existing id; same availability state is a no-op. Under the offer lock compare every term with the CURRENT version only. Equality returns current id without insert, pointer change or event. Every other payload appends N+1 and moves current with one publication event.
- **Rationale**: Historical equality breaks reverts: v1 -> v2 -> v1 terms must create current v3 with v1 terms. Successful publication retries still deduplicate against current.
- **Alternatives**: Searching all historical versions silently prevents reverts; always append duplicates immediate retries. Price/rate-only equality collapses legitimate label changes.
- **Ambiguity handled**: Identical-to-current publication is replay; older non-current payload is a new publication even if intended as a delayed retry. The fixed signature has no request key. This binding R1 correction does not resolve ND-F9-1..5.

## R5 — Safe staff reads and privileged commission projection

- **Decision**: FORCE RLS on all tables; explicit column SELECT grants exclude commission for the shared `authenticated` role. Staff use a `security_invoker=true` safe view. PO/WO use an additional narrow, workspace- and role-checked `get_package_version_commissions` SECURITY DEFINER reader.
- **Rationale**: Repository `public.staff_role` is application data, not a separate SQL role per employee. Granting the commission column to authenticated grants it to Sales/Trainer too; UI hiding and RLS row predicates cannot hide one column. BRD 41 permits WO commission; ND-F9-4 grants nothing to Sales/Trainer. Existing audit RLS also hides commission-bearing audit events from them.
- **Alternatives**: Granting SELECT on the full base table leaks via direct API calls. An owner-bypass general view can bypass RLS. A single invoker view cannot retrieve a column withheld from its caller. A narrow definer commission reader explicitly repeats workspace/role checks and returns no other data; it complements the safe invoker view.
- **Transport**: Safe view projects `price_minor::text AS price_minor`; actions send validated decimal strings to the bigint RPC argument. This avoids JSON/JavaScript rounding above 2^53. Base explicit-column SQL/API reads remain RLS protected, but app money reads use the exact-string view.

## R6 — Strong history guards and composite relations

- **Decision**: Reuse installed `audit_events_immutable`/`forbid_delete` for version UPDATE/DELETE/TRUNCATE, without owner exceptions. Offer update guard freezes identity/duration. Composite FKs enforce workspace and a triple FK enforces same-offer current pointer. Insert guard checks duration snapshot parity.
- **Rationale**: Constitution I/V needs guarantees below application permissions. Latest guard bodies are visible in tenancy/audit migrations. A workspace-only pointer FK would permit selecting another offer's version in the same workspace.
- **Alternatives**: RLS alone is bypassed by service_role/postgres; revoke-only tests never prove triggers. A simple version-id FK permits cross-workspace wiring. Rewriting durations changes offer identity retrospectively.
- **Scope of guarantee**: postgres DML under installed triggers is rejected; superuser DDL can disable/drop guards, which reviewer mutation checks must detect.

## R7 — Exactly one audit event per business change

- **Decision**: Extend the latest body from `20261028120000_auth_recovery_links.sql`, attach AFTER triggers, and emit only package creation, version insertion and actual availability change with strict details allow-lists.
- **Rationale**: F5/F6/F4 mappings must survive replacement. Pointer updates and first offer creation are internal publication work, not separate business events. Failure rolls back the whole transaction. Published business terms are not client PII; authored names are still excluded.
- **Alternatives**: RPC plus trigger auditing doubles events; generic OLD/NEW JSON copies labels and unintended fields; copying an older function body drops jobs/recovery mappings.

## R8 — UI and two-wall app pattern

- **Decision**: Reuse `getActor`/`requireActor`, `authorize`, server session client, existing locale/theme cookies and Design System. Pure package validators and money formatting are shared with actions; no new dependencies or browser Supabase client. `/packages` is PO-only, linked from landing only.
- **Rationale**: Existing `app/(app)/page.tsx`, login actions, `components/ui/Field`, `Button`, `Alert`, `States`, `ConfirmDialog`, and `lib/i18n/messages` provide the pattern. Constitution VIII requires AR-first/EN, accessibility and states; F2 ND-5 leaves final navigation open.
- **Alternatives**: New PO navigation resolves ND-F9-5 prematurely; raw DB errors leak existence; a client-only guard is not authorization. No new public route/showcase is necessary merely to make management e2e easy.

## R9 — Conservative initial and conflicting duration states

- **Decision**: New offer starts unavailable and is enabled explicitly by PO. A later custom/preset representation conflict for the same days is rejected, preserving the offer and snapshot representation. Publication never changes availability.
- **Rationale**: The binding design does not specify initial availability, but only PO controls what may be sold. It also fixes the offer key by days and permits only pointer/availability updates, so changing months metadata would violate that rule.
- **Alternatives**: Auto-enabling couples publish to an availability decision; separate custom/preset offers with equal days violate uniqueness; silently changing months rewrites immutable offer identity. These technical interpretations are documented, not silently attributed to the BRD.

## R10 — Local verification and open decisions

- **Decision**: Unit tests, local Docker role/read/RPC matrices, concurrency and all-role guard checks, catalog/parity assertions, AR/EN Playwright and axe, then independent Claude re-runs and mutation checks. No cloud migration/deploy.
- **Rationale**: Constitution quality gates, [production readiness](../../docs/07-production-readiness.md) and D-20 keep development local. F9 policy items do not block local work; production readiness remains separate.
- **Alternatives**: API success-only tests miss cross-tenant/column leaks; UI hiding tests miss base grants; disabling tests for missing local env gives false confidence.

## NEEDS DECISION

ND-F9-1 allowed currencies; ND-F9-2 custom-duration bounds; ND-F9-3 catalog (NEEDS SOURCE CONFIRMATION); ND-F9-4 Sales/Trainer commission visibility (denied); ND-F9-5 PO navigation (landing only). See [spec.md](spec.md#needs-decision-mark-do-not-resolve). None resolved here.
