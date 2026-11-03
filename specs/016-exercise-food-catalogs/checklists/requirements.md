# Requirements Quality Checklist: F16 Exercise & Food Catalogs

**Purpose**: Reviewer-owned check of requirement clarity, completeness and traceability.  
**Created**: 2026-11-03  
**Feature**: [spec.md](../spec.md)  
**Review commit**: `f903683e659d9a0aa5d62b98f0917b8744a4d4f1`

## Requirement definition

- [x] CHK001 Each functional requirement has a stable FR identifier.
- [x] CHK002 Success criteria use measurable outcomes or explicitly defined thresholds.
- [x] CHK003 User stories include Given/When/Then acceptance scenarios.
- [x] CHK004 PO-approved decisions cite their decision source.
- [ ] CHK005 Every requirement maps to task IDs explicitly in `tasks.md`.
- [ ] CHK006 Each success criterion has current evidence for every stated measure.

## Scope and consistency

- [x] CHK007 Scope and lifecycle language are consistent with cited PO decisions.
- [x] CHK008 Workspace isolation, permissions and privacy requirements are explicit.
- [x] CHK009 Versioning and non-retroactive behavior are explicit.
- [x] CHK010 Required supporting plan, research, data model and contracts are present.
- [ ] CHK011 Spec Kit feature metadata and analysis prerequisites are present and usable.
- [x] CHK012 No unresolved F16 product decision is represented as settled by inference.

## Verification quality

- [x] CHK013 Traceability points to concrete test files and named assertions where identifiable.
- [ ] CHK014 Every VERIFIED status is backed by an asserting test on the analysed commit.
- [ ] CHK015 Tests and gates have been executed on this exact head by this review lane.
- [ ] CHK016 Production-only SC-005 measurements are available.

## Notes

- The task-to-FR mapping is inferred from task descriptions; FR tags are missing and supplied as a proposed diff.
- Static review only; this lane did not execute tests. Existing checked tasks contain prior evidence references.
- Do not interpret checklist markers as implementation completion.
