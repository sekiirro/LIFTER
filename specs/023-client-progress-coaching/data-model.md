# Data Model: 023 Client Progress Coaching (P5 Progress)

Spec-only. Entities derived from spec.md; no migrations authored here.

## WeeklyCheckIn

- client, subscription, scheduled date, form reference (F15), status (assigned/submitted/expired), freeze-adjusted anchor.
- Self-reported `workoutAdherence` and `dietAdherence` (0-10 integer), stored as part of the weekly form submission (F15 typed answers, validation, immutable snapshots, retention).
- Source of truth for adherence values consumed by spec 024 by field name.

## ProgressMeasurement

- client, type, value, unit, recorded date, source form submission reference.
- Background audit log of corrections (actor, timestamp, previous/new value); no user-facing correction-history UI.
- Types/units derived from F15 weekly form question mappings; no separate catalog.

## MeasurementCorrection (background audit only)

- measurement reference, actor, timestamp, previous value, new value.
- Recorded in background audit log; not surfaced as a user-facing history entry.

## FoodReplacementRequest

- client, food item, plan revision reference, free-text, status (open/rejected/approved-via-published-revision/stale-closed), created/closed timestamps.
- At most one open per food; F15 text limits; no attachments.

## ClientTimelineEntry

- client, event type (fixed meaningful set), occurred at, actor label, optional reference id.
- Follows existing audit retention; no new retention rule; no duplicate audit rows.

## Relationships

- WeeklyCheckIn 1..* ProgressMeasurement (auto-extracted).
- FoodReplacementRequest references F18 food item and F19 plan revision.
- ClientTimelineEntry references events from F13/F15/F19/F20/P4.
