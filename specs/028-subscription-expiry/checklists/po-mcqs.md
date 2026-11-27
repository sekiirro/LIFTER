# PO decisions: Subscription expiry notices and scoped client list

All PO decisions below quote the source answer verbatim. Architect technical defaults are recorded separately and are not attributed to the PO.

## MCQ 028-01 — Trainer recipients and list authorization

**Decision — DECIDED (S71-PO-6, Q1):** “Q1: C — All workspace Trainers.”

**Applied meaning:** All Trainers with coaching access in the client workspace receive the T-3 and expiry notices and can see that client's expiring/expired directory row while that access remains current. Recheck workspace coaching access on send, read, and list queries. A former Trainer loses current access; already-delivered notice rows remain stored but are not readable after access is revoked.

## MCQ 028-02 — First eligible with less than 72 hours remaining before expiry

**Decision — DECIDED (S71-R12, architect technical default A under S38-PO-3 safe-default authority; not a PO decision):** If a subscription first becomes eligible while its expiry is upcoming and less than 72 hours away, send the T-3 notice immediately once to each applicable client/staff recipient, then send the expiry notice at expiry. Only T-3 is caught up; client T-1 remains tied to its exact 24-hour due instant. Deduplication prevents repeats.

## MCQ 028-03 — Notice identity after effective-expiry revision

**Decision — DECIDED (S71-PO-6, Q2):** “* Q2: A — New notification pair per new expiry date.”

**Applied meaning:** Use one deduplication identity per `(subscription, effective-expiry revision, stage)` for staff and client notice stages. Keep delivered rows unchanged. If an effective expiry changes before a due instant, suppress the obsolete due instant and recompute from the current F13 projection; a later revision may produce a new T-3/expiry pair.

## MCQ 028-04 — Expiring-list window

**Decision — DECIDED (S71-R12, architect technical default A under S38-PO-3 safe-default authority; not a PO decision):** `expiring` means the effective expiry instant is at or after the single sampled current instant and strictly before 72 elapsed hours after it. The lower bound is inclusive and the upper bound exclusive. `expired` means current F13 state is `expired`.

## Authority sources

- PO answers: `C:/Users/NEW LAP/.lifter/runs/s71-po/s71-po-6.verbatim.txt` (SHA-256 `DAA3A26C19CD1536486BCD508377FAF0EE33163B51A7C1C0E396FB7EC091F1B5`).
- Architect defaults: S71-R12 in `C:/Users/NEW LAP/.lifter/runs/s71-rulings.md`, citing S38-PO-3; these are technical defaults, not PO answers.
