# Copy status — Subscription expiry

CB-P8-01 screens 1 and 2 are **APPROVED as written** under S71-PO-9 / S71-R19. Use only these approved strings for the shared staff notifications surface and the existing `/clients` directory filter. The approved source is `C:/Users/NEW LAP/.lifter/runs/s71-hy4-p8copy/cb-p8-01.approved.md`. Client inbox strings below were not part of those screens and remain proposed pending per-screen approval.

## Screen 1 — Shared staff notifications surface (APPROVED)

| Key                                    | State          | English (APPROVED)                                           | Egyptian Arabic (APPROVED)                            | Source                                  |
| -------------------------------------- | -------------- | ------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------- |
| `staff.notifications.title`            | Surface title  | Notifications                                                | الإشعارات                                             | New                                     |
| `staff.notifications.bellLabel`        | Bell label     | Open notifications                                           | افتح الإشعارات                                        | New                                     |
| `staff.notifications.loading`          | Loading        | Loading                                                      | جارٍ التحميل                                          | Existing `button.loading`               |
| `staff.notifications.empty`            | Empty          | You are all caught up.                                       | مفيش إشعارات جديدة.                                   | Existing `client.portal.inbox.empty`    |
| `staff.notifications.error`            | Error title    | Unable to load data                                          | تعذّر تحميل البيانات                                  | Existing `states.error.title`           |
| `staff.notifications.errorDescription` | Error detail   | Something went wrong. Please try again.                      | حدث خطأ. يرجى المحاولة مرة أخرى.                      | Existing `states.error.description`     |
| `staff.notifications.retry`            | Retry          | Retry                                                        | إعادة المحاولة                                        | Existing `states.retry`                 |
| `staff.notifications.markRead`         | Mark read      | Mark as read                                                 | اعتبره مقروء                                          | Existing `client.portal.inbox.markRead` |
| `staff.notices.expiryT3`               | T-3 notice     | {clientName}'s subscription expires in 3 days ({expiryDate}) | اشتراك {clientName} هينتهي كمان ٣ أيام ({expiryDate}) | New                                     |
| `staff.notices.expiryT3ShortLead`      | Short-lead T-3 | {clientName}'s subscription expires soon ({expiryDate})      | اشتراك {clientName} قرب ينتهي ({expiryDate})          | New                                     |
| `staff.notices.expired`                | Expiry notice  | {clientName}'s subscription expired on {expiryDate}          | اشتراك {clientName} انتهى يوم {expiryDate}            | New                                     |

Existing F15 form-alert stage strings remain unchanged: `forms.staffStatus.clientLate` (Client form overdue / استمارة العميل متأخرة), `forms.staffStatus.trainerLate` (Trainer delivery overdue / تسليم المدرّب متأخر), and `forms.staffStatus.resolved` (Resolved / تم الحل).

## Screen 2 — Existing `/clients` directory expiry filter (APPROVED)

| Key                                                | State            | English (APPROVED)                     | Egyptian Arabic (APPROVED)       | Source       |
| -------------------------------------------------- | ---------------- | -------------------------------------- | -------------------------------- | ------------ |
| `staff.clientDirectory.expiring`                   | Filter and badge | Expiring                               | قرب ينتهي                        | New          |
| `staff.clientDirectory.subscriptionStatus.expired` | Filter and badge | Expired                                | منتهي                            | Existing key |
| `staff.clientDirectory.expiring.empty`             | Empty            | No clients match this filter           | مفيش عملاء مطابقين للفلتر ده     | New          |
| `staff.clientDirectory.expiring.loadError`         | Load error       | We couldn't load this list. Try again. | مقدرناش نحمل القائمة. حاول تاني. | New          |

## Client inbox copy (PROPOSED)

These strings were not included in CB-P8-01 screens 1 or 2 and remain subject to per-screen PO approval before implementation.

| Surface       | State          | English (PROPOSED)                  | Egyptian Arabic (PROPOSED) |
| ------------- | -------------- | ----------------------------------- | -------------------------- |
| Client notice | T-3            | Your subscription expires in 3 days | اشتراكك هينتهي كمان ٣ أيام |
| Client notice | Short-lead T-3 | Your subscription expires soon      | اشتراكك قرب ينتهي          |
| Client notice | T-1            | Your subscription expires tomorrow  | اشتراكك هينتهي بكرة        |
| Client notice | Expired        | Your subscription has expired       | اشتراكك انتهى              |
