# Copy Proposal — 023 Client Progress Coaching (P5 Progress)

**Status**: APPROVED — S55-PO-10 (2026-11-14), amended by S57-PO-12 (2026-11-15). Rows marked PROPOSED remain pending PO approval.
**Source**: S54-PO-11 (propose EN/Egyptian Arabic copy); S48-PO-4 (Egyptian colloquial Arabic, not MSA). Approved strings source: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-10-approved-copy.md` (SHA-256 `1636510f8578e681db88a51b4f69b9ab4c5732f22150d6c5409eb6b52b4d3858`). S57-PO-12 (2026-11-15) approves the F23 measurement strings Add measurement, Edit measurement (replaces the S55-PO-10 AR), Measurement saved and No measurements recorded (replaces the S55-PO-10 EN/AR of `progress.measurements.empty`); "Preserve all other approved copy." The PO proposed further strings on 2026-11-14 (client entry value/date/save, a replacement duplicate message, weekly check-in configuration); they are listed as PROPOSED until approved.
**Scope**: User-visible strings introduced by P5 Progress: weekly check-in reminders, measurements, food replacement requests, client timeline. Trainer notes copy is governed by F20 and is not re-proposed here.

| Key                                         | EN (professional)                                                                  | Egyptian colloquial Arabic                                          | Status                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- |
| progress.title                              | Progress                                                                           | التقدم                                                              | APPROVED — S55-PO-10 (2026-11-14) |
| progress.measurements.title                 | Measurements                                                                       | القياسات                                                            | APPROVED — S55-PO-10 (2026-11-14) |
| progress.measurements.empty | No measurements recorded | لسه مفيش قياسات متسجلة | APPROVED — S57-PO-12 (2026-11-15) |
| progress.measurement.edit | Edit measurement | عدّل القياس | APPROVED — S57-PO-12 (2026-11-15) |
| progress.measurement.duplicateSameDay       | A measurement already exists for this day. Edit the existing record instead.       | فيه قياس متسجل لليوم ده. عدّل القياس الموجود بدل ما تضيف واحد جديد. | APPROVED — S55-PO-10 (2026-11-14) |
| progress.measurement.save | Save measurement | احفظ القياس | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| progress.measurement.date | Date | التاريخ | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| progress.measurement.value | Value | القيمة | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| progress.measurement.saved | Measurement saved | القياس اتسجّل | APPROVED — S57-PO-12 (2026-11-15) |
| progress.measurement.add | Add measurement | ضيف قياس جديد | APPROVED — S57-PO-12 (2026-11-15) |
| checkin.reminder.dayOf.title                | Weekly check-in reminder                                                           | تذكير بالمتابعة الأسبوعية                                           | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.reminder.dayOf.body                 | Your weekly check-in is due today.                                                 | النهارده معاد متابعتك الأسبوعية.                                    | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.reminder.followup.title             | Check-in still pending                                                             | المتابعة الأسبوعية لسه ناقصة                                        | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.reminder.followup.body              | You haven't submitted your weekly check-in yet.                                    | لسه ما بعتّش متابعتك الأسبوعية.                                     | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.completed.notGate                   | Check-ins do not block access to your account.                                     | تقدر تدخل حسابك عادي حتى لو ما بعتّش المتابعة الأسبوعية.            | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.request.title               | Request a new food alternative                                                     | اطلب بديل أكل جديد                                                  | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.request.placeholder         | Describe the alternative you would like…                                           | اكتب البديل اللي عايزه...                                           | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.request.submit              | Submit request                                                                     | ابعت الطلب                                                          | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.request.cancel              | Cancel request                                                                     | إلغاء الطلب                                                         | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.request.cancelConfirm       | Cancel this open request?                                                          | متأكد إنك عايز تلغي الطلب ده؟                                       | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.status.open                 | Open                                                                               | مفتوح                                                               | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.status.rejected             | Rejected                                                                           | مرفوض                                                               | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.status.approved             | Approved (in published revision)                                                   | اتوافق عليه واتضاف للنسخة المنشورة                                  | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.status.stale                | Closed (food removed)                                                              | اتقفل الطلب لأن الأكلة اتمسحت من الخطة                              | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.notification.open           | A client requested a food replacement.                                             | فيه عميل طلب بديل أكل جديد.                                         | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.notification.resolved       | Your food replacement request was updated.                                         | فيه تحديث على طلب بديل الأكل بتاعك.                                 | APPROVED — S55-PO-10 (2026-11-14) |
| foodReplacement.existingAlternativesVisible | Existing approved alternatives remain available.                                   | تقدر تفضل تستخدم البدائل الموجودة حاليًا.                           | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.title                              | Timeline                                                                           | سجل النشاط                                                          | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.registration                 | Registration                                                                       | التسجيل                                                             | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.renewal                      | Renewal                                                                            | تجديد الاشتراك                                                      | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.firstDelivery                | First plan delivery                                                                | استلام أول خطة                                                      | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.trainerChange                | Trainer assignment change                                                          | تغيير الكابتن المسؤول                                               | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.replacementOpen              | Replacement request opened                                                         | طلب بديل جديد                                                       | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.replacementApproved          | Replacement approved                                                               | الموافقة على البديل                                                 | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.replacementRejected          | Replacement rejected                                                               | رفض طلب البديل                                                      | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.replacementStale             | Replacement request closed (food removed)                                          | إغلاق طلب البديل بعد حذف الأكلة                                     | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.freezeApply                  | Freeze applied                                                                     | تجميد الاشتراك                                                      | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.freezeRemove                 | Freeze removed                                                                     | فك تجميد الاشتراك                                                   | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.event.closure                      | Closure                                                                            | الإغلاق                                                             | APPROVED — S55-PO-10 (2026-11-14) |
| timeline.empty                              | No timeline events yet.                                                            | لسه مفيش أي أحداث هنا.                                              | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.adherence.workout.title             | Workout adherence                                                                  | التزامك بالتمرين                                                    | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.adherence.workout.question          | On a scale from 0 to 10, how closely did you follow your workout plan this week?   | من 0 لـ 10، شايف إنك التزمت بتمرينك قد إيه الأسبوع ده؟              | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.adherence.diet.title                | Diet adherence                                                                     | التزامك بالدايت                                                     | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.adherence.diet.question             | On a scale from 0 to 10, how closely did you follow your nutrition plan this week? | من 0 لـ 10، شايف إنك التزمت بالدايت قد إيه الأسبوع ده؟              | APPROVED — S55-PO-10 (2026-11-14) |
| checkin.config.title | Weekly check-in form | فورم المتابعة الأسبوعية | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| checkin.config.select | Choose the weekly check-in form | اختار فورم المتابعة الأسبوعية | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| checkin.config.save | Use this form | استخدم الفورم ده | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| checkin.config.saved | Weekly check-in form saved. | اتحفظ فورم المتابعة الأسبوعية. | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| checkin.config.invalid | This form needs the workout and diet adherence questions (0–10). | الفورم ده لازم يكون فيه سؤالين الالتزام بالتمرين والدايت (من 0 لـ 10). | PROPOSED — PENDING PO APPROVAL (2026-11-14) |
| checkin.config.conflict | Another form is already the weekly check-in. | فيه فورم تاني متحدد كمتابعة أسبوعية. | PROPOSED — PENDING PO APPROVAL (2026-11-14) |

**Notes**:

- S55-PO-10 rows are approved; S57-PO-12 rows are approved and supersede the S55-PO-10 text for the same key; PROPOSED rows are pending PO approval and are pinned in `tests/unit/progress-coaching-copy.test.ts`.
- EN follows the S57-PO-12 wording exactly, without a trailing period, matching the catalog convention for confirmations and toasts ("Changes saved", "Saved successfully").
- `progress.measurement.duplicateSameDay` keeps its S55-PO-10 approved text. The PO's 2026-11-14 proposed replacement, "A measurement already exists for this day. Edit it instead." / "فيه قياس متسجل لليوم ده. عدّله بدل ما تضيف جديد.", is pending PO approval.
- Trainer notes copy is governed by F20 and is not duplicated here.
- Reminder time-of-day value is resolved to 10:00 AM workspace time (S55-PO-3 Q1=A); not a copy string.
- The two adherence questions use a 0–10 integer scale (same as the F15 N11 hunger score); rating labels reuse F15's existing 0–10 handling and copy patterns (S55-PO-5 Q3=A). No new rating-label strings are proposed here.
- Correction history is not a user-facing surface: trainer corrections update the measurement directly and are recorded in the background audit log only, so no `progress.measurement.correctionHistory` string is proposed.
