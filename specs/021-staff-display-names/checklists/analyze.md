# Analyze: F21 Staff Display Names

Date: 2026-11-12. Scope: spec-only artifacts for `specs/021-staff-display-names/`. This analysis follows the final spec, plan, and task edits in this pass, which encode PO S52-PO-2 (NAME-17..NAME-20) and fix the two Greptile review threads on `specs/021-staff-display-names/tasks.md`.

## Entry check

- `specs/021-staff-display-names/spec.md` has numbered FRs (FR-001..FR-016), measurable SCs (SC-001..SC-012), and Given/When/Then acceptance scenarios for provisioning, validation, backfill, access, Client Notes author-line use, audit, lifecycle, retry, concurrency, and out-of-scope surfaces: PASS.
- PO clarifications and source evidence are recorded: NAME-1..NAME-8 from S51-PO-4; NAME-9..NAME-13 from S51-PO-7; NAME-14..NAME-16 from S51-PO-8; NAME-17..NAME-20 from S52-PO-2. All four source verbatims and SHA-256 values are in `specs/021-staff-display-names/spec.md`, and the NAME-17..NAME-20 entry records the PO answer file `C:/Users/NEW LAP/.lifter/runs/s52-po/s52-po-2.verbatim.txt` with its SHA-256 `ceb4357d4db1b57f0e0acae17da160f1f02f59f37a297dfaba75602f87731628`. No unresolved choice is encoded as settled, and no product decision is open: PASS.
- `specs/021-staff-display-names/plan.md` covers the scope; `specs/021-staff-display-names/tasks.md` has task IDs T001..T013 tagged with their FR IDs, and migration/RLS/SECURITY DEFINER work is marked Luna-only: PASS.
- `specs/021-staff-display-names/checklists/analyze.md` is dated after the last change to spec/plan/tasks: PASS.
- `specs/021-staff-display-names/traceability.md` has a row for every FR in FR-001..FR-016, with no ticked task and no implementation evidence claimed: PASS.

## Findings

- Open CRITICAL: 0.
- Open HIGH: 0.
- Open product decisions: none. NAME-17 (request-key origin), NAME-18 (stale-rejection response shape), NAME-19 (request-key record contents and retention, and the retried outcome) and NAME-20 (which code points "space" denotes inside the allowed set) are resolved by PO S52-PO-2 and encoded in FR-002, FR-011, FR-014, FR-015, FR-016, SC-010, SC-011, SC-012, Story 1 scenario 7 and Story 4 scenarios 4-6.
- No code, migration, schema, or database changes are part of this pass.

## Addendum C gap sweep

- In-flight, unknown result, and retry: NAME-15=A is encoded as FR-014, SC-008 and Story 4 scenario 4; NAME-17=A fixes the key origin (client-generated per intended change, re-sent unchanged on retry) and is encoded in FR-014, SC-011 and Story 4 scenario 4; NAME-19=A fixes the record as content-free (scope, key, request fingerprint, outcome status) with a status-only retry and is encoded in FR-016, FR-011, SC-011 and Story 4 scenario 6. A retry therefore discloses no name value, and the caller reads the current name through the authorized read path.
- Delete, deactivation, and closure: retained author names and existing closure/PII/DP-02 behavior are stated; this feature adds no delete or purge behavior.
- Data retention of the replay record: the existing feature-neutral operation-key ledger stores an immutable result under its own retention and purge (`supabase/migrations/20261106100000_catalog_operation_keys.sql:2-49,74-90`). NAME-19=A keeps the staff-name request-key record on that existing retention and purge, holds no staff-name value, and adds no new retention rule, so FR-011's "no new retention setting or purge is added" holds and no second copy of staff-name personal data is created.
- Concurrent changes and crash between steps: NAME-16=B is encoded as FR-015, SC-009 and Story 4 scenario 5; NAME-18=B fixes the rejection to a conflict indication with no name value, encoded in FR-015, SC-012 and Story 4 scenario 5. The caller re-reads the current name through the authorized read path, so a rejected write is never a second disclosure point for a staff name. Audit stays atomic with each successful mutation, and failed changes emit no success event.
- Copy and scope: marker strings are copied byte-for-byte from the PO-7 source and were re-verified against it in this pass (EN "(deactivated)", AR "(متوقف)", byte-identical); only the Client Notes author line is in first implementation scope. Other surfaces and their search/sort/export behavior are explicitly out of scope. No staff-name write surface exists in this repository, so the retry, stale-rejection and interior-whitespace behavior adds no visible string and no copy is proposed.
- Permissions: Workspace Owner is own-workspace only; a Platform Owner may set a name when provisioning in any workspace (FR-001; Story 1 scenarios 1-2); Platform Owner backfill covers platform/PO-owned accounts (NAME-11; Story 1 scenario 4); same-workspace active staff and the existing PO read rule remain; clients/Sales/anonymous/revoked/foreign workspace are denied. The request key and the expected version are explicitly not identity, scope, or permission proof (FR-014; FR-015; T013).
- Validation: NAME-13 fixes the allowed character set and the 1-80 code-point count; NAME-14=B fixes the trim set to Unicode White_Space and requires NFC normalization before validation and storage, so the checks run on the NFC form and canonically equivalent submissions store identically (FR-002; SC-007; T011). NAME-20=A fixes "space" to U+0020 SPACE only, so an interior tab, non-breaking space, line break or form feed is refused while the same code points are trimmed at the ends (FR-002; SC-010; T011).
- Retention/deletion: name retention follows NAME-7 and DP-02; no new purge/retention behavior. The request-key record stays on the existing operation-key retention and purge (NAME-19; FR-011; FR-016).
- FR/SC/task/traceability cross-references: FR-001..FR-016, SC-001..SC-012 and T001..T013 are accounted for; traceability rows exist for every FR; no task is ticked and traceability remains unverified until implementation tests run.

## Review-thread fixes in this pass

- Greptile thread `PRRT_kwDOVYgYQ8621xiw` (`tasks.md` T002): T002 previously read as "Workspace Owner only for their own workspace, or Platform Owner for platform/PO-owned accounts", which narrowed the approved provisioning path. T002 now states two separate permissions: provisioning (a Platform Owner may set the name when provisioning staff in any workspace, per FR-001 and Story 1 scenarios 1-2) and backfill of existing unnamed accounts (NAME-11=B: the account's own Workspace Owner, or the Platform Owner for platform/PO-owned accounts).
- Greptile thread `PRRT_kwDOVYgYQ8621xii` (`tasks.md` T012): T012 previously asserted the request-key record contents while NAME-19 was still open. NAME-19 is now answered A by PO S52-PO-2, so T012 now states the resolved content-free record, the existing-retention rule and the status-only retry, and cites S52-PO-2.

## Constitution check

- Principle VII: PASS for spec scope. Staff names are personal data, with least-privilege reads, no old/new name audit values, no name disclosure on a rejected write or on a retried outcome, and existing closure/retention treatment (`.specify/memory/constitution.md:90-100`; spec FR-003, FR-008, FR-009, FR-011, FR-016).
- Principle I: PASS for non-PO actors. Platform Owner access inherits the existing F20 recorded rule; no constitution change is made (`specs/020-client-notes/plan.md:71`).
- No constitution, DESIGN.md, or canonical PO decision record is changed. The S52-PO-2 decision is recorded in this feature's own spec decision register with its verbatim source and SHA-256, following the same pattern already used for S51-PO-4, S51-PO-7 and S51-PO-8.

## Cross-reference sweep

- FR-001..FR-016 occur in `spec.md` and are mapped by `tasks.md` and `traceability.md`.
- SC-001..SC-012 are measurable and correspond to acceptance scenarios and requirements.
- NAME-1..NAME-20 are resolved and encoded; no NAME id appears only as an open decision or blocker.
- The F20 unavailable-author fallback and auth-metadata exclusion remain cited (`specs/020-client-notes/spec.md:90`).
- No stale pending/absent status remains for NAME-9..NAME-13 or NAME-14..NAME-16; the PO-4 quote is retained as historical verbatim and superseded by PO-7 for NAME-9..NAME-13 and by PO-8 for NAME-14..NAME-16.

## Result

Analyze passes for this spec-only change with 0 open CRITICAL/HIGH findings. NAME-17..NAME-20 are resolved by PO S52-PO-2 and encoded; the write-API request and rejection shapes, the request-key record contents and retention, and the exact allowed-character rule are fixed. No product decision is open, and no implementation is authorized by this change.
