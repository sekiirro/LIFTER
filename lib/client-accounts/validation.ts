import { validatePassword } from '../auth/password-policy';
import { exactKeys } from '../registration-links/validation';

export { validatePassword } from '../auth/password-policy';
export type SignupFields = {
  name: string;
  email: string;
  phone: string;
  password: string;
};
/** Storage primitive only; U6 normalizes selected-country input server-side. */
export function canonicalPhone(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9][0-9]{1,14}$/.test(value);
}
/** Mirrors the captured Auth storage normalizer; no trimming or guessing. */
export function normalizedEmail(value: unknown): string | null {
  return typeof value === 'string' &&
    value.includes('@') &&
    !/\s/.test(value) &&
    new TextEncoder().encode(value).length <= 255
    ? value.toLowerCase()
    : null;
}
export function signupFields(value: unknown): SignupFields | null {
  if (
    !exactKeys(value, ['name', 'email', 'phone', 'password']) ||
    !Object.values(value).every((v) => typeof v === 'string')
  )
    return null;
  const email = normalizedEmail(value.email);
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !email ||
    !canonicalPhone(value.phone) ||
    typeof value.password !== 'string' ||
    !validatePassword(value.password).valid
  )
    return null;
  return {
    name: value.name,
    email,
    phone: value.phone,
    password: value.password,
  };
}
export function validateSignupFields(value: unknown): {
  fields: SignupFields | null;
  invalidFields: Array<keyof SignupFields>;
} {
  const invalidFields: Array<keyof SignupFields> = [];
  if (!exactKeys(value, ['name', 'email', 'phone', 'password']))
    return {
      fields: null,
      invalidFields: ['name', 'email', 'phone', 'password'],
    };
  if (typeof value.name !== 'string' || !value.name.trim())
    invalidFields.push('name');
  if (!normalizedEmail(value.email)) invalidFields.push('email');
  if (!canonicalPhone(value.phone)) invalidFields.push('phone');
  if (
    typeof value.password !== 'string' ||
    !validatePassword(value.password).valid
  )
    invalidFields.push('password');
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
    !/^[A-Za-z0-9_-]{43,}$/.test(input.requestSecret)
  )
    return { status: 'invalid' };
  if (!signupFields(input.fields)) return { status: 'invalid_input' };
  // Never cache admission or treat an earlier ticket as permission to retry.
  return admit();
}
