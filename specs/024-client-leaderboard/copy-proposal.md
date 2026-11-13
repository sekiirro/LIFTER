# Copy Proposal — Client Top-5 Leaderboard (spec 024)

**Status**: PROPOSED — PENDING PO APPROVAL (S48-PO-4; S55-PO-3; S55-PO-6)
**Feature**: `specs/024-client-leaderboard`
**Languages**: Professional English and natural spoken Egyptian Arabic.

All strings below are proposals only. Do not use them until the PO approves the exact English and Arabic wording.

| Key                                    | English (professional)                                                                               | Egyptian colloquial Arabic                                                   | Status                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| `leaderboard.title`                    | Top 5 this month                                                                                     | أحسن ٥ الشهر ده                                                              | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.empty`                    | No leaderboard is available right now.                                                               | مفيش ترتيب متاح دلوقتي.                                                      | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.fewerThanFive`            | {count} clients qualify so far.                                                                      | {count} عميل مؤهل لحد دلوقتي.                                                | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.rankLabel`                | Rank {rank}                                                                                          | الترتيب رقم {rank}                                                           | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.optOut.noticeTitle`       | You may appear on the leaderboard                                                                    | ممكن اسمك يظهر في ترتيب المتصدرين                                            | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.optOut.noticeBody`        | You may appear on your workspace leaderboard. You can turn this off at any time in account settings. | ممكن اسمك يظهر في ترتيب مساحة شغلك. تقدر تقفل ده من إعدادات حسابك في أي وقت. | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.optOut.button`            | Turn off leaderboard                                                                                 | اقفل ظهوري في ترتيب المتصدرين                                                | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.optOut.success`           | You will no longer appear on the leaderboard.                                                        | مش هتظهر في ترتيب المتصدرين تاني.                                            | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.optedOut`                 | You turned off leaderboard participation.                                                            | إنت قفلت ظهورك في ترتيب المتصدرين.                                           | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.publish.action`           | Approve monthly leaderboard                                                                          | وافق على ترتيب الشهر                                                         | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.publish.approved`         | Monthly leaderboard approved.                                                                        | وافقت على ترتيب الشهر.                                                       | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.publish.rejected`         | Monthly leaderboard rejected.                                                                        | رفضت ترتيب الشهر.                                                            | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.publish.unpublished`      | Leaderboard is no longer visible.                                                                    | الترتيب مبقاش ظاهر.                                                          | PROPOSED — PENDING PO APPROVAL |
| `leaderboard.ineligible`               | You are not eligible for the leaderboard yet.                                                        | لسه مش مؤهل للترتيب.                                                         | PROPOSED — PENDING PO APPROVAL |
| `clientSignup.username.label`          | Username                                                                                             | اسم المستخدم                                                                 | PROPOSED — PENDING PO APPROVAL |
| `clientSignup.username.hint`           | Choose a username. You can edit it later.                                                            | اختار اسم مستخدم، وتقدر تغيّره بعدين.                                        | PROPOSED — PENDING PO APPROVAL |
| `clientSignup.username.workspaceTaken` | This username is already used in your workspace.                                                     | اسم المستخدم ده مستخدم في مساحة شغلك.                                        | PROPOSED — PENDING PO APPROVAL |

Notes:

- The notice contains no score, formula, weight, or scoring-input details.
- Copy reflects the decided direct, immediate opt-out and later username editing. Username validation rules (3-20 characters; English letters, digits, underscores and dots only; case-insensitive workspace uniqueness; reserved names admin, support, lifter, trainer, owner blocked case-insensitively) follow S55-PO-9 Q14; validation-error strings above are PROPOSED — PENDING PO APPROVAL.

Validation error copy (PROPOSED — PENDING PO APPROVAL):

| Key                                       | English (professional)                                                   | Egyptian colloquial Arabic                                        | Status                         |
| ----------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------ |
| `clientSignup.username.tooShort`          | Username must be at least 3 characters.                                  | اسم المستخدم يجب أن يكون 3 أحرف على الأقل.                        | PROPOSED — PENDING PO APPROVAL |
| `clientSignup.username.tooLong`           | Username must be at most 20 characters.                                  | اسم المستخدم يجب ألا يتجاوز 20 حرفاً.                             | PROPOSED — PENDING PO APPROVAL |
| `clientSignup.username.invalidChars`      | Username can contain only English letters, digits, underscores and dots. | اسم المستخدم يقبل فقط أحرف انكليزية وأرقاماً وشرطة سفلية ونقاطاً. | PROPOSED — PENDING PO APPROVAL |
| `clientSignup.username.reserved`          | This username is reserved.                                               | هذا اسم المستخدم محجوز.                                           | PROPOSED — PENDING PO APPROVAL |
| `accountSettings.username.tooShort`       | Username must be at least 3 characters.                                  | اسم المستخدم يجب أن يكون 3 أحرف على الأقل.                        | PROPOSED — PENDING PO APPROVAL |
| `accountSettings.username.tooLong`        | Username must be at most 20 characters.                                  | اسم المستخدم يجب ألا يتجاوز 20 حرفاً.                             | PROPOSED — PENDING PO APPROVAL |
| `accountSettings.username.invalidChars`   | Username can contain only English letters, digits, underscores and dots. | اسم المستخدم يقبل فقط أحرف انكليزية وأرقاماً وشرطة سفلية ونقاطاً. | PROPOSED — PENDING PO APPROVAL |
| `accountSettings.username.reserved`       | This username is reserved.                                               | هذا اسم المستخدم محجوز.                                           | PROPOSED — PENDING PO APPROVAL |
| `accountSettings.username.workspaceTaken` | This username is already used in your workspace.                         | اسم المستخدم ده مستخدم في مساحة شغلك.                             | PROPOSED — PENDING PO APPROVAL |

- Exact digit rendering follows existing locale conventions; wording remains subject to PO approval.
