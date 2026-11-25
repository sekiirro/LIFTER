# Product decision register - P7 Workforce Management

All listed decisions are ANSWERED. S70-PO-16 decisions are not reopened. The original identifiers remain for traceability; no affected FR is PENDING-PO.

## P7-MCQ-01 - Closed-month correction rule - ANSWERED

**Verbatim S70-PO-18 answer #1**: "Carry to current month" - the closed month never changes; a correction/refund reversal belonging to a finalized month is booked in the current open month, linked back to the original month.

**Applied to**: FR-014/FR-021, period fence and late source handling. Closed snapshots and Sales totals remain immutable. A late correction uses the current open month with an original-month link.

## P7-MCQ-02 - Basic Salary - ANSWERED

**Verbatim S70-PO-18 answer #2**: "1 monthly salary/person (Recommended)" - one monthly Basic Salary per employee, in a PO-picked currency from that market's currencies (Egypt: EGP; International: EGP/USD/SAR); points reports stay separate per workspace.

**Applied to**: FR-008/FR-028 and compensation/payroll model/API. S70-R95 specifies that the platform PO owns the person-level entitlement across the employee's workspaces and staff self-read is per person.

## SOL-08 - Initial point month - ANSWERED

**Verbatim S70-PO-18 answer #3**: "Month it happened (Recommended)" - each item counts in the month (Africa/Cairo) its trigger happened: Sales +1 when approved and first payment confirmed; Trainer +1 when client activates; check-in penalty when the 24h deadline passes; plan penalty when the plan deadline passes.

**Applied to**: FR-001/002/003/010/022. Store trigger/effective time separately from recorded time.

## SOL-09 - Salary ownership across workspaces - ANSWERED

**Verbatim S70-PO-18 answer #2**: "1 monthly salary/person (Recommended)" - one monthly Basic Salary per employee, in a PO-picked currency from that market's currencies (Egypt: EGP; International: EGP/USD/SAR); points reports stay separate per workspace.

**S70-R95 detail**: the PO of the employee's workspaces is the platform PO role; own-compensation reads are per person, not per workspace; there is no duplicate workspace salary entitlement.

## SOL-20 - Copy approval sequence - ANSWERED

**Verbatim S70-PO-18 answer #4**: "Per screen batch (Recommended)" - before each UI slice, PO approves its drafted AR/EN texts; back-end work continues meanwhile.

**Applied to**: FR-029, copy inventory and every UI task dependency. No unapproved copy is treated as approved or shipped.

## P7-MCQ-03 - Strike source and attribution - ANSWERED

**Verbatim S70-PO-20**: "Late plan deliveries (Recommended)". Each client whose initial workout/nutrition plan is delivered after the persisted F15 D-03 deadline is one strike event for the Trainer responsible at that instant. Count strikes automatically over a rolling 90 days; show 3/6/9 to the PO for review only, never automatic discipline. Strike records remain separate from P7 point penalties; the PO corrects strikes separately.

**S70-R109**: This answer changes FR-016, FR-026 and T033; reuse the persisted D-03 deadline and never recompute it.

**Applied to**: FR-016/FR-026, the strike event and correction entities, PO-only RPC contract, and T033.

## Decision status

- Open product MCQs: P7-MCQ-04 and P7-MCQ-05 (see below).

## P7-MCQ-04 - PO strike correction semantics - OPEN

S70-PO-20 authorizes PO strike corrections as separate append-only actions but does not define the permitted operation or its effect on the strike event/count. Which semantics are approved?

1. Void or reinstate a strike only; counts use its active/void state.
2. Reattribute a strike only; counts follow the corrected Trainer.
3. Allow void/reinstate and reattribution; define how multiple corrections compose.

Implications: option 1 avoids changing original attribution; option 2 preserves event existence but changes attribution; option 3 supports both but requires explicit ordering/concurrency rules. Recommendation: option 3 only if PO explicitly specifies composition; otherwise choose the narrowest required correction set. Blocked: correction RPC schema/behavior, append-only composition tests, and its authorization kill-test.

## P7-MCQ-05 - Rolling 90-day count clock - OPEN

S70-PO-20 says rolling 90 days and attributes the event at the persisted D-03 breach instant, but does not explicitly select the count timestamp or exact cutoff inclusion. Should the count use (1) breach/deadline instant, or (2) first successful pair-delivery instant, and is the cutoff inclusive or exclusive? Recommendation: count by the breach/deadline instant with an explicitly defined inclusive/exclusive 90-day cutoff, consistent with Trainer attribution at breach. Blocked: count query, exact 89/90/91-day expectations, and delayed delivery/ingestion tests.

- PENDING-PO requirements: strike correction/count details in FR-026/FR-016 (P7-MCQ-04/05).
- Remaining governance dependency: Constitution C1/C2 are resolved by the pending separate Constitution 1.20.0 amendment PR in lane s70-gemini-const120; this is not a product question.
