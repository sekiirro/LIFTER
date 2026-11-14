# Copy Proposal — Client Top-5 Leaderboard (spec 024)

**Status**: APPROVED — S55-PO-10 (2026-11-14)
**Approved strings file**: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-10-approved-copy.md` (SHA-256 `1636510f8578e681db88a51b4f69b9ab4c5732f22150d6c5409eb6b52b4d3858`)
**Feature**: `specs/024-client-leaderboard`
**Languages**: Professional English and natural spoken Egyptian Arabic.

Approved strings below are byte-exact from the approved file. Rows marked PENDING remain unapproved. New wording added for verification is marked separately.

| Key                                       | English (professional)                                                                        | Egyptian colloquial Arabic                                                               | Status                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| `leaderboard.title`                       | Top 5                                                                                         | أفضل 5                                                                                   | APPROVED — S55-PO-10          |
| `leaderboard.empty`                       | No leaderboard is available right now.                                                        | مفيش ترتيب متاح دلوقتي.                                                                  | APPROVED — S55-PO-10          |
| `leaderboard.fewerThanFive`               | {count} clients qualify so far.                                                               | لحد دلوقتي فيه {count} عميل مؤهل.                                                        | APPROVED — S55-PO-10          |
| `leaderboard.rankLabel`                   | Rank {rank}                                                                                   | المركز {rank}                                                                            | APPROVED — S55-PO-10          |
| `leaderboard.resultsMonthLabel`           | Results for {month} {year}                                                                    | نتائج {month} {year}                                                                     | NEW — PENDING PO VERIFICATION |
| `leaderboard.optOut.mayAppear`            | You may appear in the Top 5                                                                   | ممكن اليوزرنيم بتاعك يظهر ضمن أفضل 5                                                     | APPROVED — S55-PO-10          |
| `leaderboard.optOut.mayAppearBody`        | Your username may appear in the Top 5. You can turn this off at any time in account settings. | ممكن اليوزرنيم بتاعك يظهر ضمن أفضل 5 عملاء. وتقدر توقف ظهوره في أي وقت من إعدادات حسابك. | APPROVED — S55-PO-10          |
| `leaderboard.optOut.turnOffParticipation` | Turn off leaderboard participation                                                            | وقف ظهوري في أفضل 5                                                                      | APPROVED — S55-PO-10          |
| `leaderboard.optOut.success`              | You will no longer appear on the leaderboard.                                                 | مش هتظهر في ترتيب أفضل 5 طول ما المشاركة مقفولة.                                         | APPROVED — S55-PO-10          |
| `leaderboard.optedOut`                    | You turned off leaderboard participation.                                                     | إنت موقف ظهورك في ترتيب أفضل 5.                                                          | APPROVED — S55-PO-10          |
| `leaderboard.publish.action`              | Approve monthly leaderboard                                                                   | اعتماد أفضل 5 للشهر                                                                      | APPROVED — S55-PO-10          |
| `leaderboard.publish.approved`            | Monthly leaderboard approved.                                                                 | اتعتمد ترتيب الشهر.                                                                      | APPROVED — S55-PO-10          |
| `leaderboard.publish.rejected`            | Monthly leaderboard rejected.                                                                 | اترفض ترتيب الشهر.                                                                       | APPROVED — S55-PO-10          |
| `leaderboard.publish.unpublished`         | Leaderboard is no longer visible.                                                             | ترتيب أفضل 5 مش ظاهر دلوقتي.                                                             | APPROVED — S55-PO-10          |
| `leaderboard.ineligible`                  | You are not eligible for the leaderboard yet.                                                 | لسه مش مستوفي شروط الدخول في ترتيب أفضل 5.                                               | APPROVED — S55-PO-10          |
| `clientSignup.username.label`             | Username                                                                                      | اسم المستخدم                                                                             | APPROVED — S55-PO-10          |
| `clientSignup.username.hint`              | Choose a username. You can edit it later.                                                     | اختار يوزرنيم بالإنجليزي، وتقدر تغيّره بعدين.                                            | APPROVED — S55-PO-10          |
| `clientSignup.username.workspaceTaken`    | This username is already used in your workspace.                                              | اليوزرنيم ده مستخدم بالفعل. جرّب واحد تاني.                                              | APPROVED — S55-PO-10          |

Notes:

- The heading is **أفضل 5** (Top 5), with a separate label identifying the approved results month (`leaderboard.resultsMonthLabel`). A current-month label must never misdescribe older winners kept visible pending approval.
- The last PO-approved Top 5 stays displayed until the next month's PO-approved result supersedes it; ranking is recalculated on fresh monthly data.
- Copy reflects the decided direct, immediate opt-out and later username editing. Username is chosen at signup, editable later; English letters, digits, `_` and `.`, 3-20 characters; case-insensitive unique per workspace; reserved names blocked. Reuse the actual F11 signup field if it exists; never duplicate it.
- PO alone approves final monthly winners (after independent verification). Client opt-out removes the username from visible rankings immediately without PO approval.
- Superseded proposal rows removed per S55-R12: noticeTitle->mayAppear, noticeBody->mayAppearBody, button->turnOffParticipation
- New wording marked for verification: `leaderboard.resultsMonthLabel`.

Validation error copy (APPROVED — S55-PO-10 for matched rows):

| Key                                       | English (professional)                                                   | Egyptian colloquial Arabic                  | Status               |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | -------------------- |
| `clientSignup.username.tooShort`          | Username must be at least 3 characters.                                  | اليوزرنيم لازم يكون 3 خانات على الأقل.      | APPROVED — S55-PO-10 |
| `clientSignup.username.tooLong`           | Username must be at most 20 characters.                                  | اليوزرنيم مايزيدش عن 20 خانة.               | APPROVED — S55-PO-10 |
| `clientSignup.username.invalidChars`      | Username can contain only English letters, digits, underscores and dots. | استخدم حروف إنجليزي وأرقام و (_) أو (.) بس. | APPROVED — S55-PO-10 |
| `clientSignup.username.reserved`          | This username is reserved.                                               | اليوزرنيم ده محجوز، اختار غيره.             | APPROVED — S55-PO-10 |
| `accountSettings.username.tooShort`       | Username must be at least 3 characters.                                  | اليوزرنيم لازم يكون 3 خانات على الأقل.      | APPROVED — S55-PO-10 |
| `accountSettings.username.tooLong`        | Username must be at most 20 characters.                                  | اليوزرنيم مايزيدش عن 20 خانة.               | APPROVED — S55-PO-10 |
| `accountSettings.username.invalidChars`   | Username can contain only English letters, digits, underscores and dots. | استخدم حروف إنجليزي وأرقام و (_) أو (.) بس. | APPROVED — S55-PO-10 |
| `accountSettings.username.reserved`       | This username is reserved.                                               | اليوزرنيم ده محجوز، اختار غيره.             | APPROVED — S55-PO-10 |
| `accountSettings.username.workspaceTaken` | This username is already used in your workspace.                         | اليوزرنيم ده مستخدم بالفعل. جرّب واحد تاني. | APPROVED — S55-PO-10 |

- Exact digit rendering follows existing locale conventions; wording remains subject to PO approval.
