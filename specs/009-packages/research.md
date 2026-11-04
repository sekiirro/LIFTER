# Research: Packages & Package Versions (P1-F9)

This records the supplied architect decisions against repository evidence; it does not reopen business policy or introduce dependencies. Sources: [spec.md](spec.md), Constitution v1.4.0, architecture, D-09/D-10/D-11/D-13/D-17, BRD 30/40–41/53–54/102/196/317, and S31-PO-4/S31-PO-5. No external technology recommendation or web research is needed for this artifact-only task.

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
- **Ambiguity handled**: Identical-to-current publication is replay; older non-current payload is a new publication even if intended as a delayed retry. The fixed signature has no request key. This binding R1 correction did not resolve the NDs open at the time; S31 later closes ND-F9-1 and ND-F9-4.

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

## R11 — S31 package dimensions and PO-only authorship

- **Decision**: Add the approved attribute domains `market = Egypt | International` and
  `type = Year-round | Promotional`; keep package creation/naming/pricing/control PO-only; interpret
  "unlimited distinct packages" as no package-count cap/quota; keep Sales/Trainer commission denied.
- **Rationale**: S31-PO-4 SK-009-01 and S31-PO-5 / S31-Q4 are explicit. S31-Q4 supersedes only the
  Workspace-Owner authorship part of SK-009-01, so the market/type/currency/no-conversion rules stand.
- **Alternatives considered**: WO package authorship is rejected by the superseding decision. A
  workspace package-count cap contradicts "unlimited". Granting Sales/Trainer rates contradicts
  SK-009-04.

## R12 — Forward-only schema extension with no historical inference

- **Decision**: The S31 delta is a new forward migration. The shipped F9 migration and existing
  package-version rows/terms are never edited. Existing offers/versions receive no inferred
  market/type classification before the PO approves a legacy policy.
- **Rationale**: Constitution II/V requires immutable financial truth and forward-only migrations;
  FR-021 requires the identifier and stored price/currency/commission/duration terms to be preserved
  (SC-011). Stored currency cannot distinguish an International
  EGP package from an Egypt EGP package, so currency-based inference would be false.
- **Alternatives considered**: Editing the shipped migration violates migration immutability.
  Backfilling every existing row to Egypt/International from currency is invalid. A default market
  or nullable legacy state still needs PO approval because it changes the visible attribute domain.

## R13 — Market-conditional currency without conversion

- **Decision**: Egypt accepts EGP only; International accepts EGP/USD/SAR. Every amount remains in
  its own currency; there is no exchange rate, converted field, mixed-currency arithmetic or
  cross-currency total. Currency is validated in the application and DB publication walls before
  mutation.
- **Rationale**: S31-PO-4 SK-009-01 and S31-PO-5 explicitly approve the matrix and no assumed
  conversion. Constitution II requires exact minor units and currency. The shipped F10/F12 models
  already copy one package currency into registration/subscription/installment records.
- **Alternatives considered**: Retaining format-only three-letter validation would allow currencies
  outside the approved set. A global reference currency or conversion table would invent rates and
  violate the PO decision. Mixed-currency installments would break exact same-currency totals.

## R14 — Conditional implementation gates

- **Decision**: Do not implement the S31 delta until SK-009-05 (legacy classification),
  SK-009-06 (market/type owner and mutability), SK-009-07 (promotional behavior), SK-009-08
  (approved AR/EN copy) and SK-009-09 (downstream currency relationship) are answered. Test design,
  current-code evidence, no-conversion invariants and PO-only role matrices may be prepared without
  choosing those product outcomes.
- **Rationale**: The absolute PO-decision rule forbids inventing data classification, mutability,
  lifecycle behavior, copy or downstream financial semantics.
- **Alternatives considered**: Choosing a technical default would silently resolve product policy.
  Treating open items as non-blocking would contradict the binding instructions.

## PO decision status

- **Closed**: ND-F9-1 (market-conditional currencies/no conversion), ND-F9-4 (Sales/Trainer
  commission denied), the PO/WO authorship conflict and package-count cap.
- **Open implementation blockers**: SK-009-08 and unanswered S33 MCQs; legacy audit and product scope are answered by S32-PO-4. Earlier S31 MCQs remain historical context, not current blockers. MCQs, implications,
  recommendations and blocked work in the run PO packet.
- **Retained**: ND-F9-2, ND-F9-3 and ND-F9-5 remain as previously recorded.

See [spec.md](spec.md#po-decision-register-and-needs-decision) and the S33 MCQs. S32-PO-4 closes the business scope for SK-009-05/06/07/09; detailed MCQs and SK-009-08 remain open.

## R15 ? S32-PO-4 package lifecycle and reporting

S32-PO-4 closes the previous product blockers for audit-safe legacy migration, editable defaults, full PO package management, promotional date/expiry support, and historical FX-based EGP reporting. S31-PO-5 and SK-009-04 remain unchanged. The decision explicitly requires original-currency preservation, immutable historical rates, safe API-failure handling, and distinct reported revenue versus actual settlement.

The approved scope does not identify which existing rows are defaults, a mapping, delete semantics for referenced identities, transaction-date timezone, non-business-day fallback, provider verification criteria, failure state, EGP identity-rate handling, expiry boundaries/link effects, exact market/type storage, or report basis. These are enumerated in `spec.md` S33-01..S33-12 and remain PO blockers. No technical option is promoted to a requirement.

## R16 ? External FX API and constitutional data constraint

Constitution platform constraints restrict AI model routing and require synthetic data in development/testing under S31-PO-8. FX rate retrieval is a runtime third-party data API, not an AI call; the inspected constitution contains no blanket prohibition on such an API. FR-027 therefore requires server-side data minimization: send currency pair/date only (subject to provider contract), never client/workspace/transaction payload. Provider verification and availability criteria remain S33-08 decisions. No client data or secrets are included in development fixtures or outbound calls.
