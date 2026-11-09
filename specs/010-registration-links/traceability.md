# S33 traceability — S33-PO-4

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-012, FR-014 | T900 | `tests/e2e/registration-links.spec.ts::required local authenticated registration acceptance › ar po: exact terms, keyboard, schedule, copy-only, scope and themes` | Commit `4d47ed6`; three #41 Playwright specs passed 27/27 on current head and fresh Stack C. |

| FR-009, FR-014 | T901 | `tests/unit/registration-links-page.test.ts::public page uses no actor and shows only name/validity` | Commit `78b1093`; targeted unit run 16/16 passed with Stack C environment injected. Full unit gate subsequently passed 2,011/2,011. |
