import type { SignupFields } from './validation';
import { getMessages } from '../i18n';

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

export async function runSignupActionSafely(
  action: (
    previous: SignupPublicResult,
    formData: FormData,
  ) => Promise<SignupPublicResult>,
  previous: SignupPublicResult,
  formData: FormData,
  locale: SignupLocale,
): Promise<SignupPublicResult> {
  try {
    return await action(previous, formData);
  } catch {
    return signupResult('unavailable', locale);
  }
}

export function signupResult(
  status: SignupStatus,
  locale: SignupLocale,
  invalidFields?: Array<keyof SignupFields>,
): SignupPublicResult {
  const messages = getMessages(locale);
  const messageKey = {
    invalid: 'clientSignup.invalid',
    duplicate: 'clientSignup.duplicate',
    complete: 'clientSignup.complete',
    unavailable: 'clientSignup.unavailable',
    invalid_input: 'clientSignup.invalidInput',
    sign_out_required: 'clientSignup.signOutRequired',
  } satisfies Record<SignupStatus, keyof typeof messages>;
  return {
    status,
    message: messages[messageKey[status]],
    ...(status === 'invalid_input' && invalidFields?.length
      ? { invalidFields: [...new Set(invalidFields)] }
      : {}),
  };
}

export const initialSignupResult = signupResult('invalid_input', 'en');
