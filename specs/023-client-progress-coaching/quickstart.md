# Quickstart: 023 Client Progress Coaching (P5 Progress)

Spec-only. Validation scenarios to prove the feature once implemented; no implementation code here.

1. Activate a synthetic subscription; assert first check-in at day 7 and every 7 days thereafter including Fridays.
2. Apply a 3-day freeze between days 5-8; assert resume shift and no catch-up delivery.
3. Leave a check-in unanswered; assert reminders at 10:00 AM workspace time on due day and 24h later.
4. Submit a weekly form with measurement-mapped answers; assert Progress records with source reference and original units.
5. Attempt a same-day duplicate measurement; assert rejection with redirect to edit.
6. Correct a measurement as a second trainer; assert direct update and a background audit entry (actor, timestamp, previous/new values); assert no user-facing correction-history entry.
7. Auto-extract conflict with existing same-day record; assert in-place update and background audit entry only.
8. Client selects an existing approved alternative; assert no request or revision created.
9. Client submits a free-text request; assert one open request per food; cancel and re-submit.
10. Trainer approves; assert draft revision + manual publish within max-3; no auto-publish.
11. Remove target food in newer revision; assert request closes as stale.
12. Trigger meaningful events; assert timeline shows only the fixed set in order to authorized actors; deny unauthorized.
13. Assert no leaderboard scoring mechanics shown to clients on check-in.