# PO MCQs: P8 security and performance readiness

**Authority already applied**: S71-PO-1 approves external pen-test and performance work. The requirement is not re-asked.

## MCQ 031-01 — External pen-test engagement envelope

**Where**: FR-001/FR-003; docs/03 roadmap and PRD-13.1 name the test but no vendor, budget, or timing.

A. Obtain two qualified quotes; PO selects vendor and approves a not-to-exceed budget and pre-production window; test synthetic staging/local data only. **(Recommended)** Preserves PO spend/scope control and independent quality.
B. PO names one vendor and budget before scheduling; choose window after readiness. Minimal procurement, but later schedule certainty.
C. Defer vendor selection/timing until after pilot but retain the test as a blocking pre-go-live gate. Lowest near-term cost, later lead time.

**PO choice**: PENDING-PO. Affects FR-001 and schedule. Scope, safeguards, evidence plan and gates proceed.

## MCQ 031-02 — Numeric performance acceptance budgets

**Where**: FR-007; PRD-13.6 is qualitative and docs/13 PI-03 requires dated capacity evidence but no route latency/error budgets.

A. Approve route-class p95 latency and error/CPU budgets after a baseline at spec 008 pilot volumes; baseline is a proposal and no pass/fail gate exists until PO signs values. **(Recommended)** Avoids treating qualitative guidance as an SLA.
B. Use p95 <= 500 ms for reads and <= 1 s for writes, with <= 1% errors at pilot volumes. Immediate gate but may not fit the approved free-tier stack.
C. Require no material regressions from current baseline plus graceful loading and bounded pagination. No numeric SLA, weaker capacity evidence.

**PO choice**: PENDING-PO. Affects FR-007/SC-003. Measurement matrix and baselines proceed independently.
