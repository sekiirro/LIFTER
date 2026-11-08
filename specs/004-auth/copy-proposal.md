# F4 recovery copy proposal (PENDING-PO)

Concrete AR/EN strings for PO review. Arabic is the default RTL locale. Digits are Western (`0–9`). Rows marked **Reuse, approved** already exist on `origin/main` in `lib/i18n/messages/{en,ar}.ts`; the exact current catalog values are shown. The two approved FR-029 strings are repeated as a reference. Every other proposed string remains pending and is not an implementation requirement until PO approval.

| State / key | English (EN) | العربية (AR) | Source / status |
|---|---|---|---|
| Request screen title `auth.staffResetTitle` | Reset your password | إعادة تعيين كلمة المرور | New proposal; PENDING-PO |
| Request screen description `auth.staffResetHelp` | Enter your staff account email address and we’ll send a reset link if the account is eligible. | أدخل البريد الإلكتروني لحساب الموظف، وسنرسل رابطًا لإعادة التعيين إذا كان الحساب مؤهلًا. | New proposal; PENDING-PO |
| Email label `auth.email` | Email | البريد الإلكتروني | Reuse, approved: `origin/main` |
| Request action `auth.requestReset` | Send reset link | إرسال رابط إعادة التعيين | New proposal; PENDING-PO |
| Request loading `auth.sendingReset` | Sending… | جارٍ الإرسال… | New proposal; PENDING-PO |
| Generic response `auth.staffResetConfirm` | If an account exists for this email address, you'll receive password reset instructions. | لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر. | Reuse, approved: FR-029; exact bytes |
| Invalid or expired link `auth.invalid_link` | This password reset link is invalid or has expired. Request a new link to continue. | اللينك ده مش شغال أو صلاحيته انتهت. اطلب لينك جديد عشان تقدر تغيّر كلمة السر. | Reuse, approved: FR-029; exact bytes |
| Malformed email `auth.invalidEmail` | Enter a valid email address. | أدخل عنوان بريد إلكتروني صالحًا. | New proposal; PENDING-PO |
| Rate-limited response `auth.staffResetLimited` | If an account exists for this email address, you'll receive password reset instructions. | لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر. | Reuse generic FR-029 response; no rate-limit disclosure |
| Request unavailable response `auth.staffResetUnavailable` | If an account exists for this email address, you'll receive password reset instructions. | لو الإيميل ده مسجّل عندنا، هتوصلك رسالة فيها لينك تغيير كلمة السر. | Reuse generic FR-029 response in app UI; no provider detail |
| Continue action `auth.continue` | Continue | متابعة | Reuse, approved: `origin/main` |
| New-password screen title `auth.choosePasswordTitle` | Choose a new password | اختر كلمة مرور جديدة | New proposal; PENDING-PO |
| New password label `auth.newPassword` | New password | كلمة المرور الجديدة | Reuse, approved: `origin/main` |
| Confirm password label `auth.confirmPassword` | Confirm password | تأكيد كلمة المرور | Reuse, approved: `origin/main` |
| Weak password validation `auth.weak_password` | Choose a stronger password. | اختر كلمة مرور أقوى. | Reuse, approved: `origin/main` |
| Password mismatch validation `auth.mismatch` | The passwords do not match. | كلمتا المرور غير متطابقتين. | Reuse, approved: `origin/main` |
| Set password action `auth.setPassword` | Set password | حفظ كلمة المرور | Reuse, approved: `origin/main` |
| Saving state `auth.savingPassword` | Saving… | جارٍ الحفظ… | New proposal; PENDING-PO |
| Success then login `auth.resetSuccessLogin` | Your password has been changed. Sign in with your new password. | تم تغيير كلمة المرور. سجّل الدخول باستخدام كلمة المرور الجديدة. | New proposal; PENDING-PO; also used after known-successful change with closing-audit failure |
| Recovery session ended / login handoff `auth.resetLoginNext` | Your recovery session has ended. Continue to sign in. | انتهت جلسة استعادة كلمة المرور. تابع إلى تسجيل الدخول. | New proposal; PENDING-PO |
| Completion aborted, password unchanged `auth.resetNotChanged` | Your password wasn’t changed. Request a new reset link and try again. | لم يتم تغيير كلمة المرور. اطلب رابط إعادة تعيين جديدًا وحاول مرة أخرى. | New proposal; PENDING-PO |
| Completion result unclear `auth.resetCheckLogin` | We couldn’t confirm whether your password changed. Try signing in with your new password. If it doesn’t work, request a new reset link. | لم نتمكن من التأكد مما إذا تم تغيير كلمة المرور. جرّب تسجيل الدخول بكلمة المرور الجديدة. إذا لم تعمل، اطلب رابط إعادة تعيين جديدًا. | New proposal; PENDING-PO; reconciliation required, no claim of success |
| General service error `auth.unavailable` | The service is unavailable. Please try again. | الخدمة غير متاحة الآن. يرجى المحاولة مرة أخرى. | Reuse, approved: `origin/main`; not shown for valid-address request outcomes |
| Email subject `auth.staffResetEmailSubject` | Reset your LIFTER password | أعد تعيين كلمة مرور LIFTER | New proposal; PENDING-PO |
| Email body `auth.staffResetEmailBody` | Use the link below to reset your LIFTER password. The link expires in 60 minutes and can be used once. If you didn’t request this email, you can ignore it. | استخدم الرابط أدناه لإعادة تعيين كلمة مرور LIFTER. تنتهي صلاحية الرابط خلال 60 دقيقة ويمكن استخدامه مرة واحدة. إذا لم تطلب هذه الرسالة، يمكنك تجاهلها. | New proposal; PENDING-PO |

The exact byte-sensitive Arabic strings for the two FR-029 rows above are from the approved specification and must be reused verbatim. No string in this proposal changes FR-018 response parity or permits provider details to reach the user.
