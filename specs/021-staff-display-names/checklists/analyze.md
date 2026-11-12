# Analyze: F21 Staff Display Names

Date: 2026-11-12. Scope: spec-only artifacts for specs/021-staff-display-names/. This analysis follows the final spec, plan, and task edits in this pass.

## Entry check

- spec.md has numbered FRs, measurable SCs, and Given/When/Then scenarios for provisioning, validation, backfill, access, Client Notes author-line use, audit, lifecycle, retry, concurrency, and out-of-scope surfaces: PASS.
- PO clarifications and source evidence are recorded: NAME-1..NAME-8 from S51-PO-4; NAME-9..NAME-13 from S51-PO-7; NAME-14..NAME-16 from S51-PO-8. All three source verbatims and SHA-256 values are in spec.md, and the S51-PO-8 entry records both the architect decision file and the underlying PO answer file. NAME-17..NAME-18 are explicit open MCQs; no unresolved choice is encoded as settled.
- plan.md covers the scope; tasks.md has task IDs tagged with FRs, and migration/RLS/SECURITY DEFINER work is marked Luna-only: PASS.
- This analysis is dated after the final spec.md, plan.md, and tasks.md edits: PASS.

## Findings

- Open CRITICAL: 0.
- Open HIGH: 0.
- Open product decisions: NAME-17 (request-key origin), NAME-18 (stale-rejection response shape), NAME-19 (what the request-key record retains and whether the retried outcome carries a name value) and NAME-20 (which code points "space" denotes inside the allowed set). The affected write-API shape, request-key record, retention statement and validation rule are blocked pending PO answers; no outcome is assumed.
- No code, migration, schema, or database changes are part of this pass.

## Addendum C gap sweep

- In-flight, unknown result, and retry: NAME-15=A is resolved and encoded as FR-014, SC-008 and Story 4 scenario 4 — a retry under the same request key returns the original outcome, leaves the stored name unchanged and emits no second audit event. The request-key origin (client-generated per intended change vs. server-issued) is NAME-17 and is not guessed; FR-014 and T012 state the resolved behavior without fixing the request shape.
- Delete, deactivation, and closure: retained author names and existing closure/PII/DP-02 behavior are stated; this feature adds no delete or purge behavior.
- Data retention of the replay record: the existing feature-neutral operation-key ledger stores an immutable result under its own retention and purge (`supabase/migrations/20261106100000_catalog_operation_keys.sql:2-49,74-90`). Whether the staff-name request-key record retains a name value, and whether the retried outcome carries one, is NAME-19 and is not guessed. FR-011 keeps staff-name retention on DP-02 with no new retention setting, so option B of NAME-19 would need an explicit retention decision and is not encoded as settled.
- Concurrent changes and crash between steps: NAME-16=B is resolved and encoded as FR-015, SC-009 and Story 4 scenario 5 — a stale expected version is rejected with the stored name unchanged and no audit event, and the caller reloads before retrying. The stale-rejection payload (carry the current name vs. a bare conflict indication) is NAME-18 and is not guessed. Audit stays atomic with each successful mutation, and failed changes emit no success event.
- Copy and scope: marker strings are copied byte-for-byte from the PO-7 source and were re-verified against it in this pass (EN "(deactivated)", AR "(متوقف)", byte-identical); only the Client Notes author line is in first implementation scope. Other surfaces and their search/sort/export behavior are explicitly out of scope. No staff-name write surface exists in this repository, so the new retry and stale-rejection behavior adds no visible string and no copy is proposed.
- Permissions: Workspace Owner is own-workspace only; Platform Owner covers platform/PO-owned backfill; same-workspace active staff and existing PO read rule remain; clients/Sales/anonymous/revoked/foreign workspace are denied. The request key and the expected version are explicitly not identity, scope, or permission proof (FR-014; FR-015; T013).
- Validation: NAME-13 fixes the allowed character set and the 1-80 code-point count; NAME-14=B fixes the trim set to Unicode White_Space and requires NFC normalization before validation and storage, so the checks run on the NFC form and canonically equivalent submissions store identically (FR-002; SC-007; T011). Which code points "space" denotes inside the allowed set — U+0020 only, or the Unicode White_Space property as used for the trim — is NAME-20 and is not guessed; FR-002 marks it as PO-DECISION-NEEDED.
- Retention/deletion: name retention follows NAME-7 and DP-02; no new purge/retention behavior. The request-key record's own retention and contents are NAME-19 and are not assumed.
- FR/SC/task/traceability cross-references: FR-001..FR-015, SC-001..SC-009 and T001..T013 are accounted for; traceability rows exist for every FR; no task is ticked and traceability remains unverified until implementation tests run.

## Constitution check

- Principle VII: PASS for spec scope. Staff names are personal data, with least-privilege reads, no old/new name audit values, no second name disclosure on a rejected write, and existing closure/retention treatment (.specify/memory/constitution.md:90-100; spec FR-003, FR-008, FR-009, FR-011).
- Principle I: PASS for non-PO actors. Platform Owner access inherits the existing F20 recorded rule; no constitution change is made (specs/020-client-notes/plan.md:71).
- No constitution, DESIGN.md, or canonical PO decision record is changed. The S51-PO-8 decision is recorded in this feature's own spec decision register with its verbatim source and SHA-256, following the same pattern already used for S51-PO-4 and S51-PO-7.

## Cross-reference sweep

- FR-001..FR-015 occur in spec.md and are mapped by tasks.md and traceability.md.
- SC-001..SC-009 are measurable and correspond to acceptance scenarios and requirements.
- NAME-1..NAME-16 are resolved and encoded; NAME-17..NAME-20 appear only as explicit open decisions/blockers.
- The F20 unavailable-author fallback and auth-metadata exclusion remain cited (specs/020-client-notes/spec.md:90,113).
- No stale pending/absent status remains for NAME-9..NAME-13; the PO-4 quote is retained as historical verbatim and superseded by PO-7 for NAME-9..NAME-13 and by PO-8 for NAME-14..NAME-16.

## Result

Analyze passes for this spec-only change with 0 open CRITICAL/HIGH findings. NAME-17..NAME-20 remain PO decisions and block the affected write-API request and rejection shapes, the request-key record contents and retention, and the exact allowed-character rule. No implementation is authorized by this change.
