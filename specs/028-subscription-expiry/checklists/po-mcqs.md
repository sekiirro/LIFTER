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

## MCQ 028-06 — Staff notifications date formatting

**Decision — DECIDED (S76-PO-1, answer A; architect mapping S76-R6):** Option A: StaffNotifications keeps day-first en-GB '30 Nov 2026'; CUMREV-028-01 CLOSED no change (PO decision).

**Applied meaning:** `components/shell/StaffNotifications.tsx` preserves day-first formatting (`en-GB`: '30 Nov 2026'), consistent with staff intake and alert surfaces (`components/forms/StaffIntake.tsx`, `components/forms/StaffSlaAlerts.tsx`). No presentation change is made.

## MCQ 028-R1 / MCQ-1..5 — Dispute retention hold and resolution lifecycle

**Earlier decision (S75-PO-4):** "A" — define/use an approved persisted dispute-resolution timestamp and include its model/clock in scope for 028 FR-011/T009/T017 (architect mapping S75-R28).

**Subdecisions (S76-PO-1, answers 1C, 2A, 3A, 4A, 5B; architect mapping S76-R6):** RESOLVED. Questions surfaced in `C:/Users/NEW LAP/.lifter/runs/s75-luna-spec028/report.md:20-24`.

- **028-R1-MCQ-1 — Notice-retention dispute eligibility: DECIDED (Option C).** 028 currently applies NO dispute retention hold until an approved dispute category/source exists (F26 `specs/026-retention-purge/spec.md` FR-004 / S70-R47: no persisted dispute object exists in main or F26; 027 follow-up disputes are not a notice-retention source). Only retention holds already defined by approved sources remain (specifically open refund holds under `app_private.refund_auth_lockouts.status`). T009/T017 test and implement without dispute holds.
- **028-R1-MCQ-2 — Resolution recorder: DECIDED (Option A).** When an approved dispute source exists, the resolution time is recorded by the approved upstream dispute process.
- **028-R1-MCQ-3 — Allowed states: DECIDED (Option A).** When an approved dispute source exists, open/resolved states are mapped from that approved dispute source.
- **028-R1-MCQ-4 — Reopening: DECIDED (Option A).** When an approved dispute source exists, if a resolved dispute is reopened, reopening reactivates the hold and a later resolution starts a fresh 30 days.
- **028-R1-MCQ-5 — Visibility: DECIDED (Option B).** When an approved dispute source exists, dispute resolution record visibility follows the approved dispute source's access policy.

**Applied meaning and guardrails:**
Feature 028 currently applies NO dispute retention hold (1C). Only retention holds already defined by approved sources (open refund holds under F26 FR-004 / S70-R47) remain. T009 and T017 test and implement without dispute holds. The 2A/3A/4A/5B rules are recorded as binding conditions that apply only once an approved dispute category/source exists. No new entity, states, columns, or roles are invented.

## Authority sources

- PO answers: `C:/Users/NEW LAP/.lifter/runs/s71-po/s71-po-6.verbatim.txt` (SHA-256 `DAA3A26C19CD1536486BCD508377FAF0EE33163B51A7C1C0E396FB7EC091F1B5`).
- PO answers: `C:/Users/NEW LAP/.lifter/runs/s75-po/s75-po-4.verbatim.txt` (028-R1 A).
- PO answers: `C:/Users/NEW LAP/.lifter/runs/s76-po/s76-po-1.verbatim.txt` (028-06 A; 028-R1: 1C, 2A, 3A, 4A, 5B).
- Architect rulings: S71-R12 in `C:/Users/NEW LAP/.lifter/runs/s71-rulings.md`, S75-R28 in `C:/Users/NEW LAP/.lifter/runs/s75-rulings.md`, and S76-R6 in `C:/Users/NEW LAP/.lifter/runs/s76-rulings.md`.
