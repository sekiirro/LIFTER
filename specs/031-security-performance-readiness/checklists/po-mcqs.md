# PO decisions: P8 security and performance readiness

## MCQ 031-01 — External pen-test vendor and timing

**Decision — DECIDED (S71-PO-7, MCQ 031-01):** “Defer, keep as gate”

**Applied meaning:** Choose the vendor and timing after the pilot. The external pen-test remains a blocking pre-go-live gate under `docs/13-production-readiness.md`; go-live cannot proceed until required testing, remediation, and retest evidence are complete.

**Source:** `C:/Users/NEW LAP/.lifter/runs/s71-po/s71-po-7.verbatim.txt` (SHA-256 `1A14C8D77F467BECE42C554C4354901950FE38DBF643E9D0FD78224016D0A411`).

## MCQ 031-02 — Performance budgets

**Decision — DECIDED (S71-PO-7, MCQ 031-02):** “Baseline, then PO signs (Rec.)”

**Applied meaning:** Measure a baseline using the spec 008 pilot volumes. Propose per-route p95 latency and error budgets from that baseline. These proposed budgets become a readiness gate only after the PO signs the values; before signature, report baseline evidence without a pass/fail claim.

**Source:** `C:/Users/NEW LAP/.lifter/runs/s71-po/s71-po-7.verbatim.txt` (SHA-256 `1A14C8D77F467BECE42C554C4354901950FE38DBF643E9D0FD78224016D0A411`).
