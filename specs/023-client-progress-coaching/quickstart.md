# Quickstart: 023 Client Progress Coaching (P5 Progress)

These are the validation scenarios that prove the feature. Each one lists the automated test that covers it. Integration and e2e tests need the local Supabase stack (`npm run test:integration`, `npm run e2e`); unit tests run with `npm test`.

1. **First check-in on day 7, then every 7 days, Fridays included.** Activate a synthetic subscription and check the due days.
   - Unit: `tests/unit/progress-coaching-checkin-schedule.test.ts`.
   - Integration: `tests/integration/progress-coaching.test.ts`, plus `progress-coaching-activation-anchor.test.ts`, which uses the real F19 activation.
2. **Freezes shift the cycle with no catch-up.** Apply a 3-day freeze between days 5 and 8, then check the resume shift and that nothing missed is delivered.
   - Unit and integration: the same files as scenario 1.
3. **Reminders.** Leave a check-in unanswered and check for reminders at 10:00 AM workspace time on the due day and 24 hours later.
   - Timing and dedupe are covered by unit tests in `progress-coaching-checkin-schedule.test.ts`.
   - Delivery waits on the spec 022 client inbox (S57-PO-10).
4. **Auto-extraction.** Submit a weekly form with measurement-mapped answers, then check the Progress records carry a source reference and the original units.
   - Integration: `progress-coaching.test.ts`.
5. **Same-day duplicate.** Attempt a same-day duplicate measurement and check that it is rejected with a pointer to edit the existing record.
   - Integration: `progress-coaching.test.ts`.
   - E2E: `tests/e2e/progress-coaching-screenshots.spec.ts`.
6. **Trainer correction.** Correct a measurement as a second trainer.
   - Check: the measurement is updated directly, a background audit entry records actor, timestamp and previous/new values, and no user-facing correction-history entry appears.
   - Integration: `progress-coaching.test.ts`.
   - Unit: `progress-coaching-correction.test.ts`.
   - E2E: the persisted staff correction.
7. **Client edit of own entries (S57-PO-8).** The client edits their own manual entry.
   - Check: the entry is updated in place with a `client_edit` audit row.
   - Check: editing a check-in row or another client's row is rejected.
   - Integration: `progress-coaching-client-edit.test.ts`.
   - E2E: the add, duplicate and edit flow.
8. **Auto-extraction conflict.** An auto-extracted value conflicts with an existing same-day record; check it is updated in place with a background audit entry only.
   - Integration: `progress-coaching.test.ts`.
9. **Client selects an existing approved alternative**, and no request or revision is created.
   - Integration: `progress-coaching-food-replacement.test.ts` (F18 `select_nutrition_alternative`).
   - Unit: `progress-coaching-food-replacement-services.test.ts`.
10. **Client submits a free-text request.** Check there is one open request per food; cancel and re-submit.

- Integration: `progress-coaching-food-replacement.test.ts`, `progress-coaching-food-replacement-rls.test.ts`.
- Unit: `progress-coaching-food-replacement-validation.test.ts`.

11. **Trainer approves.** Check for a draft revision and manual publish within the max-3 cap, with no auto-publish.

- Integration: `progress-coaching-food-replacement.test.ts` and `progress-coaching-food-replacement-mutations.test.ts`.

12. **Stale close.** Remove the target food in a newer revision and check the request closes as stale.

- Integration: `progress-coaching-food-replacement.test.ts` and `progress-coaching-food-replacement-mutations.test.ts`.

13. **Timeline.** Trigger meaningful events.
    - Check: the timeline shows only the fixed set, in order, to authorized actors, and denies everyone else.
    - Check: there is no timeline table and no new retention rule.
    - Integration: `progress-coaching.test.ts` and `progress-coaching-timeline-retention.test.ts`.
    - Unit: `progress-coaching-timeline.test.ts`.
14. **No scoring on the check-in.** Check that no leaderboard scoring mechanics are shown to clients on the check-in.
    - Unit: `progress-coaching-adherence.test.ts`.
    - E2E: the T012 test.
15. **Database walls hold.** Each wall is checked by mutation kill tests: the client wall, ownership, trainer-only check-in rows, the trainer wall, RLS and the append-only audit.
    - Integration: `progress-coaching-mutations.test.ts`.
