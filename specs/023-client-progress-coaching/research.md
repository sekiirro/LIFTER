# Research: 023 Client Progress Coaching (P5 Progress)

Spec-only. Decisions recorded for plan/design; no implementation.

## Decision register

- **D-01 Weekly check-in recurrence**: Reuse F15 recurring assignment engine; first at day 7, then every 7 days including Fridays; pause/resume on freeze with anchor shifted; no catch-up. Rationale: S54-PO-12 Q15, S54-PO-11 Q1/Q3, F15 FR-003. Alternative (separate scheduler) rejected — would duplicate F15.
- **D-02 Reminder time-of-day**: 10:00 AM workspace time for both reminders. Rationale: S55-PO-3 Q1=A. Alternative (per-user time) rejected — PO specified workspace time.
- **D-03 Measurement conflict handling**: Auto-extracted conflict directly updates the existing same-day record in place; change recorded in background audit log; no user-visible correction-history entry. Rationale: S55-PO-3 Q2=A "directly update measurement, no complicated history UI; keep background audit".
- **D-04 Trainer correction handling**: Direct update in place; change recorded in background audit log only (actor, timestamp, previous/new values); no user-facing correction-history UI. Rationale: architect review fix of Story 2/FR-013 contradiction per S55-PO-3 Q2.
- **D-05 Adherence answer scale**: 0-10 integer, same as F15 N11 hunger score; reuse F15 numeric handling and copy patterns. Rationale: S55-PO-5 Q3=A.
- **D-06 Food replacement lifecycle**: open/rejected/approved-via-published-revision/stale-closed; max 3 alternatives via draft + manual publish; no SLA escalation. Rationale: p5-audit S54-P5-Q8 option A, S54-PO-11 P5 Q8-10.
- **D-07 Timeline scope**: fixed meaningful set only; reuse existing audit retention; no duplicate audit rows. Rationale: BRD-06, BRD-09, F20.
- **D-08 Trainer notes**: reuse F20 entirely; no new notes FRs. Rationale: S54-PO-11, p5-audit P5-D.
- **D-09 Plan PDF/Excel exports**: owned by spec 022 / F17 / F18, not this spec. Rationale: S54-PO-12 returned client exports to v1; architect review fix.
- **D-10 Feature flag**: unfinished slices merge behind server-side default-OFF flag; flag never gates security/authorization/RLS. Rationale: constitution 1.16.0 (S54-PO-14).

## Alternatives considered

- Separate scheduler for check-ins: rejected (duplicates F15).
- User-facing correction-history UI: rejected (PO Q2 "no complicated history UI"; background audit only).
- Inventing adherence rating labels: rejected (scale resolved to reuse F15 0-10 patterns; no new copy invented).
- Plan exports in this spec: rejected (owned by spec 022/F17/F18).