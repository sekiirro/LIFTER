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

- Open product MCQs: 0.

## P7-MCQ-04 - PO strike correction semantics - RESOLVED BY S70-R110

S70-R110 rules that PO-only append-only corrections may void a strike, reinstate the latest void, or reattribute it to a Trainer in the same workspace who held access at breach time. The latest correction determines effective state; reason is required and audit contains an opaque reference only.

## P7-MCQ-05 - Rolling 90-day count clock - RESOLVED BY S70-R110

The strike instant is when the persisted F15 D-03 deadline passes without a successful initial plan pair, even if no later delivery occurs. A later delivery does not move the strike instant or create another strike. Count `breach_at > now() - interval '90 days' AND breach_at <= now()` using `timestamptz`; Cairo is display-only.

- PENDING-PO requirements: none.
- Remaining governance dependency: Constitution C1/C2 are resolved by the pending separate Constitution 1.20.0 amendment PR in lane s70-gemini-const120; this is not a product question.
