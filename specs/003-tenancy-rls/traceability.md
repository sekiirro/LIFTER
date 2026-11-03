# F3 Traceability ? S30-PO-3 governance amendment

Analyzed source commit: `d04ef52` (`origin/main`). Static verification only; no tests or builds were run. Test files and code were inspected for existing behavior.

| Requirement | Task(s) | Test(s) (file::test name) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-013 | T014, T016 | NOT-FOUND: no test asserts Workspace Owner active-member roster visibility for this approved scope | `spec.md` S30-PO-3 Q7; analyzed commit `d04ef52` | NOT-FOUND | Roster boundary and visible member fields await PO clarification; implementation and tests are future work. |
| FR-014 | T015, T016 | NOT-FOUND: no database guard or asserting test for final-Platform-Owner removal/demotion exists | `spec.md` S30-PO-3 Q8; analyzed commit `d04ef52` | NOT-FOUND | Concurrent mutation behavior and database failure contract await PO clarification; implementation and tests are future work. |
| SC-005 | T015, T016 | NOT-FOUND: no executed mutation test proves final-PO denial and add-first transfer | S30-PO-3 Q8; analyzed commit `d04ef52` | NOT-FOUND | Requires forward-only migration, executed sequential/concurrent mutation tests, and security review. |
| SC-006 | T014, T016 | NOT-FOUND: no executed RLS mutation test proves the clarified active-member roster scope | S30-PO-3 Q7; analyzed commit `d04ef52` | NOT-FOUND | Requires PO scope decision, RLS change, executed positive/negative mutations, and security review. |
