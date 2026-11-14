# Copy Proposal — Client Top-5 Leaderboard (spec 024)

**Status**: APPROVED — S55-PO-10 (2026-11-14); S55-PO-11 (2026-11-14); S57-PO-12 (2026-11-15); S57-PO-13 (2026-11-15). Every row below is approved.
**Approved strings file**: `C:/Users/NEW LAP/.lifter/runs/s55-po/s55-po-10-approved-copy.md` (SHA-256 `1636510f8578e681db88a51b4f69b9ab4c5732f22150d6c5409eb6b52b4d3858`)
**Feature**: `specs/024-client-leaderboard`
**Languages**: Professional English and natural spoken Egyptian Arabic.

Approved strings below are byte-exact from the approved file. Rows marked PENDING remain unapproved. New wording added for verification is marked separately.

| Key                                       | English (professional)                                                                        | Egyptian colloquial Arabic                                                               | Status                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `leaderboard.title`                       | Top 5                                                                                         | أفضل 5                                                                                   | APPROVED — S55-PO-10                                                                  |
| `leaderboard.empty`                       | No leaderboard is available right now.                                                        | مفيش ترتيب متاح دلوقتي.                                                                  | APPROVED — S55-PO-10                                                                  |
| `leaderboard.fewerThanFive`               | {count} clients qualify so far.                                                               | لحد دلوقتي فيه {count} عميل مؤهل.                                                        | APPROVED — S55-PO-10                                                                  |
| `leaderboard.rankLabel`                   | Rank {rank}                                                                                   | المركز {rank}                                                                            | APPROVED — S55-PO-10                                                                  |
| `leaderboard.resultsMonthLabel`           | Results for {month} {year}                                                                    | نتائج {month} {year}                                                                     | APPROVED — S55-PO-11 (2026-11-14)                                                     |
| `leaderboard.optOut.mayAppear`            | You may appear in the Top 5                                                                   | ممكن اليوزرنيم بتاعك يظهر ضمن أفضل 5                                                     | APPROVED — S55-PO-10                                                                  |
| `leaderboard.optOut.mayAppearBody`        | Your username may appear in the Top 5. You can turn this off at any time in account settings. | ممكن اليوزرنيم بتاعك يظهر ضمن أفضل 5 عملاء. وتقدر توقف ظهوره في أي وقت من إعدادات حسابك. | APPROVED — S55-PO-10                                                                  |
| `leaderboard.optOut.turnOffParticipation` | Turn off participation                                                                        | وقف ظهوري في الترتيب                                                                     | APPROVED — S57-PO-12 (2026-11-15; supersedes S55-PO-10)                               |
| `leaderboard.yourRank`                    | Your rank                                                                                     | ترتيبك                                                                                   | APPROVED — S57-PO-12 (2026-11-15)                                                     |
| `leaderboard.rankOfTotal`                 | Rank {rank} of {total}                                                                        | إنت في المركز {rank} من {total}                                                          | APPROVED — S57-PO-12 (2026-11-15)                                                     |
| `leaderboard.optOut.success`              | You will no longer appear on the leaderboard.                                                 | مش هتظهر في ترتيب أفضل 5 طول ما المشاركة مقفولة.                                         | APPROVED — S55-PO-10                                                                  |
| `leaderboard.optedOut`                    | You turned off leaderboard participation.                                                     | إنت موقف ظهورك في ترتيب أفضل 5.                                                          | APPROVED — S55-PO-10                                                                  |
| `leaderboard.publish.action`              | Approve monthly leaderboard                                                                   | اعتماد ترتيب الشهر                                                                       | APPROVED — S57-PO-13 (2026-11-15; AR supersedes S55-PO-10; approves the FULL ranking) |
| `leaderboard.publish.approved`            | Monthly leaderboard approved.                                                                 | اتعتمد ترتيب الشهر.                                                                      | APPROVED — S55-PO-10                                                                  |
| `leaderboard.publish.rejected`            | Monthly leaderboard rejected.                                                                 | اترفض ترتيب الشهر.                                                                       | APPROVED — S55-PO-10                                                                  |
| `leaderboard.publish.unpublished`         | Leaderboard is no longer visible.                                                             | ترتيب أفضل 5 مش ظاهر دلوقتي.                                                             | APPROVED — S55-PO-10                                                                  |
| `leaderboard.ineligible`                  | You are not eligible for the leaderboard yet.                                                 | لسه مش مستوفي شروط الدخول في ترتيب أفضل 5.                                               | APPROVED — S55-PO-10                                                                  |
| `clientSignup.username.label`             | Username                                                                                      | اسم المستخدم                                                                             | APPROVED — S55-PO-10                                                                  |
| `clientSignup.username.hint`              | Choose a username. You can edit it later.                                                     | اختار يوزرنيم بالإنجليزي، وتقدر تغيّره بعدين.                                            | APPROVED — S55-PO-10                                                                  |
| `clientSignup.username.workspaceTaken`    | This username is already used in your workspace.                                              | اليوزرنيم ده مستخدم بالفعل. جرّب واحد تاني.                                              | APPROVED — S55-PO-10                                                                  |

Notes:

- The heading is **أفضل 5** (Top 5), with a separate label identifying the approved results month (`leaderboard.resultsMonthLabel`). A current-month label must never misdescribe older winners kept visible pending approval.
- The last PO-approved Top 5 stays displayed until the next month's PO-approved result supersedes it; ranking is recalculated on fresh monthly data.
- Copy reflects the decided direct, immediate opt-out and later username editing. Username is chosen at signup, editable later; English letters, digits, `_` and `.`, 3-20 characters; case-insensitive unique per workspace; reserved names blocked. Reuse the actual F11 signup field if it exists; never duplicate it.
- PO alone approves final monthly winners (after independent verification). Client opt-out removes the username from visible rankings immediately without PO approval.
- Superseded proposal rows removed per S55-R12: noticeTitle->mayAppear, noticeBody->mayAppearBody, button->turnOffParticipation
- Month label approved by S55-PO-11

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

Account-settings username error (APPROVED — S57-PO-12, 2026-11-15). Used for a reserved or already-used name in the account-settings edit. Signup keeps F15's single generic `clientSignup.usernameUnavailable` (S57-PO-7: "Keep generic"). The PO's EN wording is used exactly as given; it is an error label, not a confirmation, so no trailing period is added.

| Key                                    | English (professional) | Egyptian colloquial Arabic | Status                            |
| -------------------------------------- | ---------------------- | -------------------------- | --------------------------------- |
| `accountSettings.username.unavailable` | Username unavailable   | اليوزرنيم ده مش متاح       | APPROVED — S57-PO-12 (2026-11-15) |

The earlier approved `accountSettings.username.reserved` and `accountSettings.username.workspaceTaken` strings are preserved in the catalog ("Preserve all other approved copy"). The account-settings edit now shows the single `accountSettings.username.unavailable` message for both cases.

Reviewed copy approved as proposed (APPROVED — S57-PO-13, 2026-11-15). The PO approved the remaining reviewed Leaderboard, Account Settings and Goals copy; the EN goal labels are also the PO's own words (S57-PO-1).

| Key                                  | English (professional)                               | Egyptian colloquial Arabic             | Status                            |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------- | --------------------------------- |
| `leaderboard.publish.rejectAction`   | Reject monthly leaderboard                           | رفض ترتيب الشهر                        | APPROVED — S57-PO-13 (2026-11-15) |
| `leaderboard.publish.generateAction` | Prepare monthly leaderboard                          | جهّز ترتيب الشهر                       | APPROVED — S57-PO-13 (2026-11-15) |
| `leaderboard.publish.generated`      | The monthly leaderboard is ready for review.         | ترتيب الشهر جاهز للمراجعة.             | APPROVED — S57-PO-13 (2026-11-15) |
| `leaderboard.publish.pendingExists`  | A monthly leaderboard is already waiting for review. | فيه ترتيب للشهر مستني المراجعة بالفعل. | APPROVED — S57-PO-13 (2026-11-15) |
| `leaderboard.publish.noEligible`     | No clients qualify yet.                              | لسه مفيش عملاء مؤهلين.                 | APPROVED — S57-PO-13 (2026-11-15) |
| `accountSettings.title`              | Account settings                                     | إعدادات الحساب                         | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.title`                  | Goals                                                | الأهداف                                | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.goalType`               | Goal Type                                            | نوع الهدف                              | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.goalType.fatLoss`       | Fat Loss                                             | خسارة دهون                             | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.goalType.muscleGain`    | Muscle Gain                                          | زيادة عضل                              | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.goalType.maintenance`   | Maintenance                                          | تثبيت الوزن                            | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.notSet`                 | Not set                                              | لسه متحددش                             | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.nearTermGoal`           | Near-term goal                                       | الهدف القريب                           | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.nearTermGoalEmpty`      | No answer yet.                                       | لسه مفيش إجابة.                        | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.save`                   | Save goal type                                       | احفظ نوع الهدف                         | APPROVED — S57-PO-13 (2026-11-15) |
| `clientGoals.saved`                  | Goal type saved.                                     | اتحفظ نوع الهدف.                       | APPROVED — S57-PO-13 (2026-11-15) |

Placement (S57-PO-12): "Top 5 belongs inside Progress, not Main Navigation." No navigation label is proposed; the earlier `nav.leaderboard` proposal is withdrawn. The `leaderboard.myRank` single-sentence proposal is withdrawn in favor of the approved `leaderboard.yourRank` label and `leaderboard.rankOfTotal` value.
