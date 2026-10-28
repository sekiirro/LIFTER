import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { buildAdmission } from './admission';
import { normalizePhone } from './phone';
import { trustedIp } from './trusted-ip';
import { signupFields, validateSignupFields } from './validation';
import {
  signupResult,
  type SignupLocale,
  type SignupPublicResult,
} from './results';

type HeadersLike = { get(name: string): string | null };
type RpcResult = { data: unknown; error: { message: string } | null };
type SignupRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};
type SignupServiceInput = {
  token: unknown;
  requestSecret: unknown;
  fields: unknown;
  origin: string | null;
  expectedOrigin: string | undefined;
  headers: HeadersLike;
  signedIn: () => Promise<boolean>;
  locale: SignupLocale;
};

function createSignupRpcClient(): SignupRpcClient | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as unknown as SignupRpcClient;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasSignupFieldShape(value: Record<string, unknown>): boolean {
  const allowed = ['name', 'email', 'phone', 'password'];
  return (
    Object.keys(value).length === allowed.length &&
    allowed.every((key) => Object.hasOwn(value, key)) &&
    Object.values(value).every((field) => typeof field === 'string')
  );
}

function hexBytea(value: string): string {
  return `\\x${value}`;
}

export async function processClientSignup(
  input: SignupServiceInput,
): Promise<SignupPublicResult> {
  try {
    // Keep the public action checks in this order: origin, strict field shape,
    // validation, trusted attribution, admission, then the signup transaction.
    if (!input.expectedOrigin) return signupResult('unavailable', input.locale);
    const origin = input.origin;
    const expectedOrigin = input.expectedOrigin;
    if (!origin || !(origin === expectedOrigin))
      return signupResult('invalid', input.locale);

    const rawFields = record(input.fields);
    if (!rawFields || !hasSignupFieldShape(rawFields))
      return signupResult('invalid_input', input.locale);
    const phone = normalizePhone(rawFields.phone);
    const adaptedFields = { ...rawFields, phone };
    const validation = validateSignupFields(adaptedFields);
    if (!validation.fields)
      return signupResult(
        'invalid_input',
        input.locale,
        validation.invalidFields,
      );
    const fields = signupFields(adaptedFields);
    if (!fields) return signupResult('invalid_input', input.locale);

    if (
      typeof input.token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
      typeof input.requestSecret !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.requestSecret)
    )
      return signupResult('invalid', input.locale);
    if (await input.signedIn())
      return signupResult('sign_out_required', input.locale);

    const mode =
      process.env.NODE_ENV === 'production'
        ? 'production'
        : process.env.NODE_ENV === 'test'
          ? 'test'
          : 'development';
    const clientIp = trustedIp(input.headers, {
      mode,
      allowTestOverride:
        mode !== 'production' &&
        process.env.ALLOW_SIGNUP_TEST_IP_OVERRIDE === 'true',
      testIp: process.env.SIGNUP_TEST_IP,
    });
    if (!clientIp) return signupResult('unavailable', input.locale);

    const admission = await buildAdmission({
      ip: clientIp,
      token: input.token,
    });
    if (!admission) return signupResult('unavailable', input.locale);

    const client = createSignupRpcClient();
    if (!client) return signupResult('unavailable', input.locale);
    const admitted = await client.rpc('client_signup_admit', {
      token: input.token,
      request_secret: input.requestSecret,
      ip_key: hexBytea(admission.ipKey),
      link_key: hexBytea(admission.linkKey),
      issued_at: admission.issuedAt,
      nonce: admission.nonce,
      attestation: hexBytea(admission.attestation),
    });
    if (admitted.error) return signupResult('unavailable', input.locale);
    const admissionResult = record(admitted.data);
    if (admissionResult?.status === 'invalid')
      return signupResult('invalid', input.locale);
    if (
      admissionResult?.status === 'unavailable' ||
      admissionResult?.status !== 'admitted' ||
      typeof admissionResult.admission_ticket !== 'string'
    )
      return signupResult('unavailable', input.locale);

    const completed = await client.rpc('client_signup', {
      token: input.token,
      request_secret: input.requestSecret,
      admission_ticket: admissionResult.admission_ticket,
      fields: {
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        password: fields.password,
      },
    });
    if (completed.error) return signupResult('unavailable', input.locale);
    const signup = record(completed.data);
    switch (signup?.status) {
      case 'invalid':
      case 'duplicate':
      case 'complete':
      case 'unavailable':
        return signupResult(signup.status, input.locale);
      default:
        return signupResult('unavailable', input.locale);
    }
  } catch {
    // Provider errors and thrown exceptions can contain credentials or PII.
    return signupResult('unavailable', input.locale);
  }
}
