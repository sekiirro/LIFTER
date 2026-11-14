# Contracts: 023 Client Progress Coaching (P5 Progress)

Spec-only. High-level surface contracts; implementation details deferred to implementation lane.

## Weekly check-in

- First occurrence 7 days after subscription activation, then every 7 days; pause/resume on freeze with shifted anchor; no catch-up.
- Reminders at 10:00 AM workspace time on due day and 24h later if unanswered.
- Adherence answers `workoutAdherence`, `dietAdherence` (0-10 integer) exposed to spec 024 by name; values only; no scoring mechanics shown to clients.

## Measurements

- Auto-extract from weekly form answers into Progress store with source reference and original units.
- Reject duplicate manual entry for same client/day/type.
- Auto-extracted conflict updates existing record in place; recorded in background audit log; no user-visible correction-history entry.
- Trainer correction updates directly; recorded in background audit log only.

## Food replacement requests

- Free selection from existing approved alternatives creates no request/revision.
- New alternative: free-text request, one open per food, F15 text limits, no attachments, cancel allowed, no in-place edit.
- Approval: draft revision + manual Ready & Publish; max-3 cap; no auto-publish.
- Stale-close when target food removed.

## Client timeline

- Fixed meaningful event set only, chronological, authorized actors only, existing audit retention.
