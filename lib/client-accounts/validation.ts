import { validatePassword } from '../auth/password-policy';
import { exactKeys } from '../registration-links/validation';
import {
  isPastCalendarDate,
  isReservedSignupUsername,
  isValidTelegramUsername,
  normalizeSignupUsername,
  validateSignupName,
} from '../forms/signup-policy';

export { validatePassword } from '../auth/password-policy';
export type SignupFields = {
  name: string;
  email: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  username: string;
  telegramUsername: string;
};
/** Storage primitive only; U6 normalizes selected-country input server-side. */
export function canonicalPhone(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9][0-9]{1,14}$/.test(value);
}
/** Mirrors the captured Auth storage normalizer; no trimming or guessing. */
export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string' || /\s/.test(value)) return null;
  const separator = value.indexOf('@');
  if (
    separator <= 0 ||
    separator !== value.lastIndexOf('@') ||
    separator === value.length - 1 ||
    new TextEncoder().encode(value).length > 255
  )
    return null;
  return value.toLowerCase();
}
export function signupFields(value: unknown): SignupFields | null {
  const keys = [
    'name',
    'email',
    'phone',
    'password',
    'dateOfBirth',
    'username',
    'telegramUsername',
  ];
  if (
    !exactKeys(value, keys) ||
    !Object.values(value).every((v) => typeof v === 'string')
  )
    return null;
  const email = normalizedEmail(value.email);
  const dateOfBirth = value.dateOfBirth as string;
  const username = value.username as string;
  const telegramUsername = value.telegramUsername as string;
  if (
    !validateSignupName(value.name) ||
    !email ||
    !canonicalPhone(value.phone) ||
    typeof value.password !== 'string' ||
    !validatePassword(value.password).valid ||
    !isPastCalendarDate(dateOfBirth, new Date()) ||
    !username.trim() ||
    isReservedSignupUsername(username) ||
    !isValidTelegramUsername(telegramUsername)
  )
    return null;
  return {
    name: value.name,
    email,
    phone: value.phone,
    password: value.password,
    dateOfBirth,
    username: normalizeSignupUsername(username),
    telegramUsername,
  };
}
export function validateSignupFields(value: unknown): {
  fields: SignupFields | null;
  invalidFields: Array<keyof SignupFields>;
} {
  const invalidFields: Array<keyof SignupFields> = [];
  const keys = [
    'name',
    'email',
    'phone',
    'password',
    'dateOfBirth',
    'username',
    'telegramUsername',
  ];
  if (!exactKeys(value, keys))
    return {
      fields: null,
      invalidFields: keys as Array<keyof SignupFields>,
    };
  if (!validateSignupName(value.name)) invalidFields.push('name');
  if (!normalizedEmail(value.email)) invalidFields.push('email');
  if (!canonicalPhone(value.phone)) invalidFields.push('phone');
  if (
    typeof value.password !== 'string' ||
    !validatePassword(value.password).valid
  )
    invalidFields.push('password');
  if (!isPastCalendarDate(value.dateOfBirth, new Date()))
    invalidFields.push('dateOfBirth');
  if (
    typeof value.username !== 'string' ||
    !value.username.trim() ||
    isReservedSignupUsername(
      typeof value.username === 'string' ? value.username : '',
    )
  )
    invalidFields.push('username');
  if (!isValidTelegramUsername(value.telegramUsername))
    invalidFields.push('telegramUsername');
  return {
    fields: invalidFields.length === 0 ? signupFields(value) : null,
    invalidFields,
  };
}
type AdmissionResult =
  | { status: 'admitted'; admission_ticket: string }
  | { status: 'invalid' | 'unavailable' };
/** Pure app wall. U6 supplies trusted action context and the attested RPC call. */
export async function authorizePublicClientSignup(
  input: {
    token: unknown;
    requestSecret: unknown;
    fields: unknown;
    origin: string | null;
    expectedOrigin: string;
    signedIn: boolean;
  },
  admit: () => Promise<AdmissionResult>,
): Promise<
  AdmissionResult | { status: 'invalid_input' | 'sign_out_required' }
> {
  if (
    !exactKeys(input, [
      'token',
      'requestSecret',
      'fields',
      'origin',
      'expectedOrigin',
      'signedIn',
    ])
  )
    return { status: 'invalid' };
  if (input.signedIn) return { status: 'sign_out_required' };
  if (
    !input.origin ||
    input.origin !== input.expectedOrigin ||
    typeof input.token !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
    typeof input.requestSecret !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.requestSecret)
  )
    return { status: 'invalid' };
  if (!signupFields(input.fields)) return { status: 'invalid_input' };
  // Never cache admission or treat an earlier ticket as permission to retry.
  return admit();
}
