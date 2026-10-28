import type { SignupFields } from './validation';

export type SignupStatus =
  | 'invalid'
  | 'duplicate'
  | 'complete'
  | 'unavailable'
  | 'invalid_input'
  | 'sign_out_required';
export type SignupLocale = 'en' | 'ar';
export type SignupPublicResult = {
  status: SignupStatus;
  message: string;
  invalidFields?: Array<keyof SignupFields>;
};

const copy = {
  en: {
    invalid: 'This registration link is invalid or no longer available.',
    duplicate: 'This email is already registered. Contact support.',
    complete: 'Thank you. Your registration request is complete.',
    unavailable: 'Please try again later.',
    invalid_input: 'Check the highlighted fields and try again.',
    sign_out_required:
      'Please sign out before submitting this registration request.',
  },
  ar: {
    invalid: 'رابط التسجيل غير صالح أو لم يعد متاحًا.',
    duplicate: 'هذا البريد الإلكتروني مسجّل بالفعل. يُرجى التواصل مع الدعم.',
    complete: 'شكرًا لك. اكتمل طلب التسجيل.',
    unavailable: 'يرجى المحاولة مرة أخرى لاحقًا.',
    invalid_input: 'يرجى مراجعة الحقول المحددة والمحاولة مرة أخرى.',
    sign_out_required: 'يرجى تسجيل الخروج قبل إرسال طلب التسجيل هذا.',
  },
} satisfies Record<SignupLocale, Record<SignupStatus, string>>;

export function signupResult(
  status: SignupStatus,
  locale: SignupLocale,
  invalidFields?: Array<keyof SignupFields>,
): SignupPublicResult {
  return {
    status,
    message: copy[locale][status],
    ...(status === 'invalid_input' && invalidFields?.length
      ? { invalidFields: [...new Set(invalidFields)] }
      : {}),
  };
}

export const initialSignupResult = signupResult('invalid_input', 'en');
