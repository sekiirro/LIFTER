# Spec Kit Analyze: F13 continuity decisions

**Analyzed:** 2026-11-10 17:48 UTC
**Method:** Reconciled S45-PO-2/S45-R3 with byte-exact source verification; reviewed FR-005/012/038/039, scenarios 13/14, SC-033 and SC-034, plan, T041/T042, traceability, lifecycle/data model, research, and earlier S43-PO-6/architect mapping for credit after upgrade, renewal, then upgrade. Reviewed in-flight, unknown-result, retry, deletion, concurrency, crash-between-step, and no-partial-write states for these spec-only changes.

## Entry check

- PASS - FR-005/012/039, scenarios 13/14, and measurable SC-033 and SC-034 specify the changed renewal and credit behavior.
- PASS - S45-F13-MCQ-1 is resolved by the exact PO quote and separate S45-R3 mapping in the PO-decision register. The earlier credit finding is covered by S43-PO-6 residual 5 and S43-R7; no new product choice is inferred.
- PASS - plan.md and tagged tasks T041/T042 cover the new behavior and expected tests; implementation tasks remain unchecked.
- PASS - this Analyze pass follows the latest spec, plan, and task edits.

## Findings

- CRITICAL: 0 open.
- HIGH: 0 open.
- MEDIUM: 0 open PO decisions in this change scope.
- LOW: 0 FR/task/SC ID or task-tag mismatches found in the touched continuity and credit scope.

## Decision and evidence status

- FR-012/039 are specified as pre-activation refusal with no writes/no queued duration, then FR-039 active/expired rules after activation. Existing T010 evidence is historical and does not verify all current no-write outcomes; see traceability.md.
- S43-PO-6 residual 5 states the original package full payment is the sole credit after renewal then upgrade. FR-038 and scenario 14 clarify that prior upgrade charges and separate renewal payments are excluded even when an earlier upgrade preceded the renewal.
- SC-033 and SC-034 map to unchecked T041/T042; no test execution or implementation is claimed. Other implementation evidence gaps and independent technical/security gates remain as recorded.

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open PO decisions; LOW 0.

## S45 R3 review-fix analysis

**Analyzed:** 2026-11-11 00:51 Africa/Cairo
**Scope:** CodeRabbit round-3 fixes for expired-renewal term anchoring and cumulative refund caps.

- PASS: the expired-renewal anchor is the renewal operation date in lifecycle mapping; this follows the existing approved mapping and makes no new product choice.
- PASS: each source's cumulative refunded principal is bounded by eligible collections; group cumulative refunds use total eligible collections, while a new request is bounded by the pre-operation residual.
- PASS: subscription/group locking and deterministic allocation remain unchanged; FR/SC/task IDs and task tags are untouched.
- PASS: no product ambiguity or new PO decision found.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze â€” Greptile review PRR_kwDOVYgYQ88AAAABXNC1UA (01:33 UTC)

- Scope: correct the two S43-PO-8 scenario-to-SC citations and the 50-row traceability status summary.
- PASS: scenario 2 maps upgrade term anchors to SC-027; scenario 3 maps pre-activation duration start to SC-028. SC-029 remains mapped to renewal-then-upgrade credit.
- PASS: recomputed matrix statuses are 37 PARTIAL and 13 UNVERIFIED across 50 rows; the summary IDs exactly match the matrix rows and status counts.
- PASS: FR-012/FR-039 and S45-R3's pre-activation renewal refusal, zero-write/no-queued-duration rule remain unchanged. No PO behavior or copy was introduced.
- PASS: numbered FRs, measurable SCs, GWT acceptance, clarifications, plan coverage, task mappings, and dated analysis artifacts exist for the touched feature.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions; LOW: 0 stale cross-reference findings.

## 2026-11-11 Analyze â€” merge of main, no PR content change (01:52 UTC)

- Scope: merged main commit b1476db5f95d447ed2b0525e19ed4a9c890b90cc; no PR content change.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze â€” T043 PO-only manual date adjustment (FR-040; SC-018)

- Entry check: PASS â€” FR-040 states the PO-only/after-expiry/audit/zero-revenue rules; SC-018 is measurable; GWT scenario 11 covers PO-after-expiry success and non-PO refusal; task T043 is tagged FR-040/SC-018; plan.md slice (5) covers PO date edits.
- Specified (implement): only `platform_owner` attempts commit; attempts by any other role (including null actor) are refused before any write; adjustment commits even when the subscription term is expired; every commit writes exactly one immutable audit row; zero payment/revenue/ledger rows are written by the operation. Input well-formedness (valid UUIDs, valid Cairo dates, end-exclusive after start) is rejected as `invalid_input`; this is input validity, not product policy.
- NOT specified (no code): which subscription dates are adjustable beyond asserted effective start/end, permitted shift ranges or backdating limits, previous-value derivation, whether entitlement/P4 projections must reflect manual edits, behavior for frozen or deactivated subscriptions, and expected-revision concurrency. These are escalated as PO-DECISION-NEEDED with the adjustment fact recording only the PO-asserted dates.
- Design: new immutable table `public.subscription_manual_date_adjustments` (no money columns by construction) + `public.record_subscription_date_adjustment(jsonb)` (SECURITY DEFINER, authenticated-only grant, explicit `app_private.is_platform_owner()` pre- and post-lock checks, per-actor request-key exact replay, `key_conflict` on changed intent) + audit trigger writing `subscription.manual_date_adjusted`. No new capability (T017 parity untouched). TS service `lib/subscriptions/manual-date-service.ts` enforces PO-before-RPC with an allow-listed receipt.
- Catalog impact: two new `app_private`/`public` objects require updating the pinned `rls-catalog` private-function list; both follow the hardened owner/search-path/grant pattern.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions in the specified scope (open questions escalated, not encoded).

## 2026-11-11 Analyze â€” T044 productivity points (FR-040/041; SC-019/026)

- Entry check: PASS â€” FR-041 states one point per new client, no repeat for returning clients, and no points for upgrades/renewals/plan publications; FR-040 states unlimited plan revisions/publications and no trainer point for plan publication; GWT scenario 12 and SC-019/SC-026 are measurable; task T044 is tagged FR-040/FR-041/SC-019/SC-026; plan.md slice (6) covers point uniqueness.
- Specified (implement): exactly one point per new client (`points = 1` CHECK); at most one point row per client (`UNIQUE(client_id)`, immutable, never deleted); repeat awards for the same client are rejected with zero new rows; upgrade, renewal and plan-publication operations write zero point rows (no writer is invoked from those paths); no count limit is imposed on plan revisions/publications. Pure rules module pins `new_client -> 1`, all other events -> 0.
- NOT specified (no code): which event/role awards the point in production (award entry point and authorizer), whether a returning client under a new client row can be linked by identity, and point display/reporting. The award entry point is escalated as PO-DECISION-NEEDED; no public award RPC is added. Persistence, uniqueness/immutability guards, audit trigger (`trainer.productivity_point_awarded`), and behavioral no-point coverage are the shippable core.
- Catalog impact: one new audit trigger function requires updating the pinned `rls-catalog` private-function list; hardened pattern followed.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions in the specified scope (award entry escalated, not encoded).

## 2026-11-11 Analyze â€” T047 frozen-state operations (FR-038/039; SC-022)

- Entry check: PASS â€” FR-038/039 state frozen upgrade/renewal refusal until unfrozen and freeze-day expiry extension; GWT scenario 10 and SC-022 are measurable; task T047 is tagged FR-038/FR-039/SC-022 with paths in freeze-service/freeze-dates and unit/integration freeze-lifecycle tests; plan.md slice (3) covers frozen refusal and freeze-day extension.
- Specified (implement): pure `requireUnfrozenForOperation` gate (upgrade/renewal refused while frozen; mirrors existing `requireFreezeRole` style) + `isFrozenOn` window predicate derived from the specified Apply-counts/Stop-excluded day semantics + exact 10-counted-days â†’ +10-expiry unit fixture + integration fixtures in freeze-lifecycle.test.ts (frozen renewal refusal with zero writes via existing `record_renewal`, DB-level 10-day extension via `f13_project_entitlement`, concurrent-apply race serialization, apply/stop/remove audit counts with replay silence).
- NOT in scope: DB-level frozen upgrade refusal has no upgrade writer until T042 (forbidden to this lane); covered by the pure gate plus a T042 handoff note. No migration is required (freeze guards exist); no catalog changes.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open.
## 2026-11-11 Analyze â€” S48-PO-14/15 clarification and T043/T044 untick (19:37 UTC)

- Entry check for T043: PASS. `spec.md` contains numbered FR-040, measurable SC-018, and GWT scenario 11; the new Clarifications entries preserve S48-PO-14 words and separately label S48-R22 mapping; no open product ambiguity remains for T043. `plan.md` slice (5) covers PO date edits; `tasks.md` T043 is tagged FR-040/SC-018 and is now unchecked pending current-head verification.
- Entry check for T044: PASS for requirements and plan mapping. FR-041, SC-019/026 and GWT scenario 12 exist; PO event/role is resolved by S48-PO-15 and S48-R22; task remains unchecked. Production writer and assigned-trainer source must be established from repository evidence before implementation; no path or identity is assumed.
- S48-R22 T043 acceptance to verify: manual dates affect effective entitlement/expiry through the projector and P4 consumers; frozen/deactivated attempts refuse with `stale_state` and zero writes; audit and zero-revenue behavior remain intact.
- Scope is decision-record/status bookkeeping only; no behavior, schema, or test expectations were added. Previous T043/T044 implementation evidence remains historical and their tasks are unticked until current-head revalidation.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - final T043/T044 authority record (19:38 UTC)

- Revalidated the Spec Kit entry gate after the last spec/tasks edit. PASS: numbered FRs, measurable SCs, Given/When/Then scenarios, Clarifications, plan coverage, and tagged tasks are present. S48-PO-14/15 wording is copied from the verbatim decision files; S48-R22 is separately labeled as architect mapping.
- T043 has no open product ambiguity. T044's product event/role is decided; its repository implementation path remains an evidence-gathering prerequisite and is not inferred.
- T043/T044 are unchecked pending current-head tests; the historical test records are retained and are not claimed as current verification.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - S48-R22 T043 acceptance update (19:53 UTC)

- Spec Kit entry check: PASS after this final requirement edit. `spec.md` has numbered FR-040, measurable SC-018, and GWT scenario 11 covering the PO-approved effective-date projection, frozen/deactivated refusal with zero writes, audit, zero revenue, and role refusal. Clarifications cite S48-PO-14 and S48-R22; plan slice (5) covers the adjustment; T043 is tagged FR-040/SC-018.
- The mapping is confined to the PO answer and S48-R22; it adds no shift limits or other date policy. Renewal and freeze projection rules remain the existing projector behavior.
- RED tests were written before implementation and currently fail on the old projector/adjustment writer. No implementation change has been made after this Analyze.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - T043 verified; T044 award path inventory (20:14 UTC)

- After T043 task tick, revalidated FR-040/SC-018 evidence. PASS: the forward migration feeds latest PO dates to the entitlement projector and returns `stale_state` before date/audit writes for frozen/deactivated clients; the current Stack C suite passes the after-expiry, authorization, audit, zero-revenue, replay, projection, and state-refusal cases.
- T043 traceability marks SC-018 VERIFIED and FR-040 PARTIAL because T044 remains open. The T043 code, migration, test, and traceability changes are within FR-040/SC-018 and S48-R22.
- T044 repository inventory found no production activation/plan-delivery writer or assigned-trainer mapping. The existing activation helper is a synthetic rolled-back probe; P4's migration comment assigns the production atomic writer to P4. S48-F13-MCQ-3 records the two implementation-path options, implications, recommendation, and blocked scope. No guess or T044 code was added.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - final T043 task and traceability evidence (20:15 UTC)

- T043 is ticked only after Stack C focused integration 7/7, full F12/F13 candidate 26/630, full unit 2425/2425, lint/typecheck, migration timestamp/ref scans, and both frozen/deactivated guard mutations passed/killed. Traceability cites the T043 commit subject and test evidence.
- FR-040 remains PARTIAL because the distinct T044 productivity award path is blocked by S48-F13-MCQ-3; SC-018 is VERIFIED for T043's full clarified scope.
- Cross-reference check: T043 -> FR-040/SC-018; T044 -> FR-040/FR-041/SC-019/SC-026. No T044 code or task tick is claimed.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - post-format T043 exact-head gates (20:20 UTC)

- After the final T043/T044 task evidence edit, the exact candidate passed: unit 181 files / 2425 tests; lint; typecheck; Prettier on all touched Markdown/TypeScript; local migration validation (122); remote cross-reference scan (115); all-origin max scan (116 refs; max 20261111222000 < candidate 20261111222100); F12/F13 Stack C 26 files / 630 tests.
- T043 remains verified for FR-040/SC-018. T044 remains unticked and blocked only at its missing production award integration path, recorded as S48-F13-MCQ-3.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - S48-PO-19 T044 P4 deferral and T042 entry gate (20:50 UTC)

- Spec Kit entry gate for T042: PASS. `spec.md` has FR-038, measurable SCs and GWT scenarios 1-10/13-14; the clarification/PO register records S43-PO-8, and S48-PO-18 resolves the only newly identified commission-rate question. `plan.md` slices (1), (2), and (4) cover continuity, upgrade branches, and refunds. `tasks.md` T042 remains tagged FR-037/FR-038 and the specified SC set. No open product ambiguity remains in T042 scope at entry.
- T044 status: S48-PO-19 verbatim answer, mapped by S48-R24, defers award wiring to P4's first-delivery transaction. F13 storage/rules remain recorded; T044 stays unchecked and FR-041 PARTIAL until the P4 writer/assigned-trainer source is available. No F13 award writer or inferred assignment is authorized.
- T043 is complete and ticked at commit `71754d709decf424c4ca62fb83fa252c3c3c4ead`; older Analyze snapshots describing its pending state are superseded by the later exact-head verification entry.
- No requirement or behavior was added in this documentation step. CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - S48-PO-18/21 upgrade clarifications and T042 re-entry (21:35 UTC)

- Spec Kit entry gate: PASS after final S48-PO-18/21/task edit. `spec.md` has FR-038, measurable SCs and Given/When/Then upgrade scenarios; Clarifications record byte-exact S48-PO-18 and S48-PO-21 decisions with separate S48-R24 and S48-R26 mappings. `plan.md` slices (1), (2), and (4) cover continuity, upgrades, and refunds; T042 remains tagged FR-037/FR-038 with applicable SCs. No open product ambiguity remains for T042 at entry.
- S48-PO-18 resolves the upgrade-payment commission rate: snapshot the selected package version's rate on the additional payment; non-upgrade validation and original payment snapshots remain unchanged.
- S48-PO-21 resolves F13-T042-D2: upgrade calculation starts from the manually adjusted current effective dates under normal FR-038 rules; a later adjustment supersedes the upgrade projection. No extra date policy is inferred.
- At this 21:35 UTC checkpoint T044 remained P4-deferred and T041/T042 awaited the S48-R5 renewal-then-upgrade test; the later 22:39 UTC entry below records their verified completion. T044 remains unticked.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - T041/T042 Stack C implementation and verification (22:39 UTC)

- Entry check: PASS. `spec.md` defines FR-037..039, measurable SC-015..034, and GWT scenarios for pre-activation refusal, upgrade pricing/date branches, and renewal-then-upgrade. PO-18 and PO-21 are byte-exact in Clarifications with separate S48-R24/R26 mappings; no T041/T042 product ambiguity remains. `plan.md` covers continuity, upgrades, and refunds; `tasks.md` T041/T042 are tagged and now ticked after current-head tests. T044 remains unticked and explicitly P4-deferred.
- T042 evidence: focused Stack C integration 14/14; full F12/F13 Stack C regression 27 files / 644 tests, compared with the 630-test pre-change baseline; no new failure IDs. Unit 181 files / 2425 passed; lint and typecheck passed. Local migration timestamp validation passed (123 migrations, 11 documented exceptions); remote all-ref scan passed across 115 refs.
- Guard mutations were restored and killed for frozen/expired refusal, selected-version commission snapshot, lower-price/rank/duration/same-currency validation, stale revision, workspace authorization, original-package-only credit excluding paid renewal, SECURITY DEFINER, forced RLS, and authenticated execute grant. Post-mutation focused suite passed 14/14.
- Migration review: new forward-only `20261111233600_f13_subscription_upgrades.sql` is newer than the origin-ref max `20261111222100`; no legacy/mock successor rows were rewritten. The writer is SECURITY DEFINER with empty search_path and authenticated-only execute; operation/projection helpers use empty search_path; upgrade fact tables have forced RLS and revoked app-role reads; each is covered by catalog, authorization, audit, and focused behavior assertions.
- Cross-reference review at the 22:39 UTC checkpoint: T041/T042 and SC-027..030, SC-032..034 cite current test names and commit subject in traceability. At that checkpoint SC-015..026 was PARTIAL while T045 refund composition remained open; the dated T045 completion entry below supersedes that status. No stale T042 pending status remains outside this historical Analyze entry.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11 Analyze - T045 full-package refund after upgrade (23:23 UTC)

- Spec Kit entry gate for T045: PASS. `spec.md` contains FR-042, measurable SC-025/SC-031, and Given/When/Then scenario 5; S43-PO-5 item 6 / S43-PO-6 resolve the refund basis in Clarifications; `plan.md` slice 4 covers refund composition; `tasks.md` T045 is tagged FR-042 and SC-025/SC-031. No open product ambiguity remains in the stated T045 scope. S48-PO-21 remains byte-exact in the F13 decision register with its separate S48-R26 mapping; the prior dated Analyze records that resolution.
- Implementation is one forward migration `20261112010200_f13_refund_upgrade_purchase_selection.sql`. It extends the existing append-only refund allocations with an exclusive source choice: existing F12 payment collection or immutable upgrade fact, with tenant/subscription composite keys and source-specific unique indexes. Existing payment rows are not rewritten or synthesized. The effective `record_refund` body was copied from `20261111140400_f13_refund_renewal_purchase_selection.sql`; the validator was copied from the current F13 refund ledger definition and extended for upgrade principal/commission caps. Paid renewal collections remain excluded from available refund basis; their existing rows and balances are unchanged.
- Validation-before-write: the RPC computes refundable balances from eligible original collections plus positive immutable upgrade charges, then rejects amounts above the selected basis before inserting operation, refund, allocation, cancellation, lockout, or deactivation facts. Stack C test asserts EGP 1,401 and EGP 1,500 reject with zero refund writes, then EGP 1,400 commits for EGP 750 original + EGP 650 upgrade, commission allocations total EGP 205, and no renewal allocation is written.
- Security review: `record_refund` and `f13_validate_refund_ledger` are SECURITY DEFINER with empty search_path and postgres owner; only authenticated can execute the RPC, internal validator execute is revoked; existing allocation-table forced RLS/direct-read denial remain. Integration catalog/source-constraint assertions pass. SQL additions found by security/grant scan are intentional and covered.
- RED: Stack C T045 case returned `invalid_input` for the specified EGP 1,400 refund; first setup-only attempts stopped before refund behavior and are separately labelled in the run logs. GREEN: focused T045 2/2. Mutations killed/restored: renewal-source exclusion (`t045-mutation-renewal.txt`), upgrade-source inclusion (`t045-mutation-upgrade-source.txt`), stored upgrade commission (`t045-mutation-commission.txt`), SECURITY DEFINER (`t045-mutation-definer.txt`), execute grant (`t045-mutation-grant.txt`), source XOR constraint (`t045-mutation-source-xor.txt`).
- Regression: full established F12/F13 Stack C set plus `upgrade-operations.test.ts` passed 27 files / 646 tests; baseline 26 files / 630; no new failure IDs. Unit 181 files / 2,425; lint; typecheck; local timestamp validation (124 migrations, 11 documented exceptions); remote cross-ref scan (116 refs); focused Prettier and git diff checks passed. Migration version `20261112010200` is above the all-origin maximum `20261111233600` and uses a valid current Cairo timestamp.
- T045 traceability is updated to VERIFIED; T041/T042 stay ticked, T044 remains P4-deferred and unticked. CRITICAL: 0 open; HIGH: 0 open.


## 2026-11-12 Analyze - T045 exact-head Spec Kit date correction (01:44 UTC+02; 23:44 UTC)

- CI's Check feature spec consistency reported that the prior T045 Analyze heading preceded the latest 	asks.md commit timestamp. This entry is appended after that task/traceability edit and records the CI-detected consistency correction.
- No spec, plan, task, or behavior requirements changed. T045 remains limited to FR-042 refund composition and its stated SC-025/SC-031 scenarios; the follow-up test asserts the existing validator's SECURITY DEFINER, owner, empty search_path, and revoked execute boundary.
- Spec Kit cross-reference remains PASS: FR-042, SC-025/SC-031, T045, and the S48-PO-21/R26 decision are present in their relevant records. T044 remains P4-deferred/unticked; no new ambiguity or product choice was identified.
- CI consistency check will be rerun on this exact candidate. CRITICAL: 0 open; HIGH: 0 open.
