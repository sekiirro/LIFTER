# Product Owner MCQs — P7 Workforce Management

Decisions already made in S70-PO-16 are not reopened here. These are the two product decisions found unresolved in the reviewed scope.

## P7-MCQ-01 — Correction to a finalized monthly snapshot

**Affected requirements**: FR-014 and FR-021 (PENDING-PO). A later correction can change the accounting total after month-end, including a Sales total that was previously finalized. S70-PO-16 requires monthly snapshots/finalization and PO corrections, but does not say whether a finalized month may be restated or how Sales sees that correction.

**Question**: When a PO correction or late source reversal belongs to an already finalized month, what is the rule for that closed month and its Sales monthly total?

| Option                                 | Policy                                                                                                                                                                                      | Implication                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A — Restate in place **(Recommended)** | Append the correction, create a new immutable snapshot version for that same month, retain the prior snapshot, and expose the latest finalized total to Sales after the original month-end. | Correct month attribution remains accurate; prior disclosure remains auditable; Sales total can change after month-end.           |
| B — Carry into current open month      | Keep the finalized snapshot and Sales total unchanged; book the correction into the current open month, linked to the original event/month.                                                 | Stable historical display; the correction changes the current period's points and attribution history identifies original period. |
| C — PO-controlled reopen               | Keep the finalized snapshot until the PO explicitly reopens it; append a new snapshot and republish the Sales total after re-finalization.                                                  | Requires an extra reopen/finalize workflow and permits a temporarily unchanged displayed total.                                   |

**Custom answer**: PO may provide another rule.

**Recommendation rationale**: A preserves event-period accounting and immutable snapshots while allowing a prior version to remain reviewable. This is a recommendation only; do not encode it until PO answers.

## P7-MCQ-02 — Basic Salary currency and pay period

**Affected requirement**: FR-008 (salary amount semantics only; PO ownership, WO exclusion, external-paid approval and own-compensation confidentiality are already decided).

**Question**: What does the PO-entered Basic Salary amount represent, and which currency applies?

| Option                                                       | Policy                                                                                                                                                                 | Implication                                                                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A — Monthly, one currency per workspace                      | Store a monthly Basic Salary in one PO-selected currency for the workspace/market.                                                                                     | Simple monthly comparison; PO must choose the workspace-level currency if staff operate across supported currencies.           |
| B — Monthly, per-employee allowed currency **(Recommended)** | Store a monthly amount and PO-selected currency per Trainer/Sales employee, restricted to existing market-allowed currencies (Egypt: EGP; International: EGP/USD/SAR). | Reuses the verified F9 market currency matrix, avoids exchange-rate assumptions, and supports distinct staff currency choices. |
| C — PO-defined pay period and allowed currency               | PO selects the salary period and a market-allowed currency when setting each employee's salary.                                                                        | Most flexible; adds period configuration and comparisons to payroll review.                                                    |

**Custom answer**: PO may define a different unit/cycle/currency rule.

**Recommendation rationale**: B follows the existing approved market currency matrix and monthly reporting model without inventing a workspace default or exchange-rate behavior. This is a recommendation only; do not implement salary-value semantics until PO answers.
