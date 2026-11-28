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

## Client inbox copy (APPROVED — CB-P8-04, S71-PO-13 / S71-R37 / S72-PO-7)

Approved as CB-P8-04 under S71-PO-13 / S71-R37 / S72-PO-7 (frozen source `C:/Users/NEW LAP/.lifter/runs/s71-hy4-p8copy4/cb-p8-04.approved.md`); shipped as keys `client.portal.inbox.notice.expiryT3` / `expiryT1` / `expired` (`.title` + `.body`) in `lib/i18n/messages/en.ts` and `ar.ts`. EN/AR text below is byte-exact to those shipped keys (verified against the frozen file; no difference). Short-lead T-3 (`client.portal.inbox.notice.expiryT3ShortLead.title`) is outside this batch and unchanged.

| Key                                                  | State          | English (APPROVED)                       | Egyptian Arabic (APPROVED)       |
| ---------------------------------------------------- | -------------- | ---------------------------------------- | -------------------------------- |
| `client.portal.inbox.notice.expiryT3.title`          | T-3            | Subscription expires in 3 days           | اشتراكك هينتهي كمان ٣ أيام       |
| `client.portal.inbox.notice.expiryT3.body`           | T-3            | Your subscription ends on {expiryDate}.  | اشتراكك هينتهي يوم {expiryDate}. |
| `client.portal.inbox.notice.expiryT3ShortLead.title` | Short-lead T-3 | Subscription expires soon                | اشتراكك قرب ينتهي                |
| `client.portal.inbox.notice.expiryT1.title`          | T-1            | Subscription expires tomorrow            | اشتراكك هينتهي بكرة              |
| `client.portal.inbox.notice.expiryT1.body`           | T-1            | Your subscription ends on {expiryDate}.  | اشتراكك هينتهي يوم {expiryDate}. |
| `client.portal.inbox.notice.expired.title`           | Expired        | Subscription expired                     | اشتراكك انتهى                    |
| `client.portal.inbox.notice.expired.body`            | Expired        | Your subscription ended on {expiryDate}. | اشتراكك انتهى يوم {expiryDate}.  |

## Shipped F-05/F-11 copy (APPROVED — S74-PO-1 / S74-R23 / #406)

S74-PO-1 approved F-05/F-11 as A+; S74-R23 maps that approval to these four shipped keys, byte-exact in #406 (merged as `28ce60b7`). English and Egyptian Arabic below are copied from `lib/i18n/messages/en.ts` and `ar.ts` on `origin/main`.

| Key                                                | State    | English (APPROVED)                 | Egyptian Arabic (APPROVED)            | Source                    |
| -------------------------------------------------- | -------- | ---------------------------------- | ------------------------------------- | ------------------------- |
| `staff.notifications.bellLabelWithCount`           | APPROVED | Open notifications ({count} unread) | افتح الإشعارات ({count} إشعار مش مقروء) | S74-PO-1 / S74-R23 / #406 |
| `staff.clientDirectory.previousPage`               | APPROVED | Previous page                      | الصفحة السابقة                        | S74-PO-1 / S74-R23 / #406 |
| `staff.clientDirectory.nextPage`                   | APPROVED | Next page                          | الصفحة التالية                        | S74-PO-1 / S74-R23 / #406 |
| `staff.clientDirectory.paginationLabel`            | APPROVED | Clients pagination                 | صفحات العملاء                         | S74-PO-1 / S74-R23 / #406 |
