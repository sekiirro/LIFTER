import { expect, it, vi } from 'vitest';
import { signupResult } from '../../lib/client-accounts/results';
import { parseOpenResult } from '../../lib/registration-links/open';
import { getMessages } from '../../lib/i18n';
import { signupFields } from '../../lib/client-accounts/validation';

vi.mock('server-only', () => ({}));

const signupKeys = [
  'clientSignup.name',
  'clientSignup.email',
  'clientSignup.country',
  'clientSignup.phone',
  'clientSignup.password',
  'clientSignup.submit',
  'clientSignup.pending',
  'clientSignup.fieldError',
  'clientSignup.signedIn',
  'clientSignup.invalid',
  'clientSignup.duplicate',
  'clientSignup.complete',
  'clientSignup.unavailable',
  'clientSignup.invalidInput',
  'clientSignup.signOutRequired',
];

it('T035 has matching Arabic and English signup message keys and scoped Telegram copy', () => {
  const en = getMessages('en') as Record<string, string>;
  const ar = getMessages('ar') as Record<string, string>;
  expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  for (const key of signupKeys) {
    expect(en[key], `${key} in English`).toBeTruthy();
    expect(ar[key], `${key} in Arabic`).toBeTruthy();
  }
  // S14 canonical copy (2026-10-30, line 213) makes Telegram optional.
  const telegramCopyAllowlist = ['clientSignup.telegramUsername'] as const;
  for (const messages of [en, ar]) {
    const telegramEntries = Object.entries(messages)
      .filter(([key, value]) =>
        /telegram|تيليجرام|تليجرام|تلغرام|تيلجرام/i.test(`${key} ${value}`),
      )
      .map(([key]) => key)
      .sort();
    expect(telegramEntries).toEqual([...telegramCopyAllowlist]);
  }
});

it('T035 preserves D-08 and unavailable wording and keeps completion generic', () => {
  const en = getMessages('en') as Record<string, string>;
  const ar = getMessages('ar') as Record<string, string>;
  expect(en['clientSignup.duplicate']).toBe(
    'This email is already registered. Contact support.',
  );
  expect(ar['clientSignup.duplicate']).toBe(
    'هذا البريد الإلكتروني مسجّل بالفعل. يُرجى التواصل مع الدعم.',
  );
  expect(en['clientSignup.unavailable']).toBe('Please try again later.');
  expect(ar['clientSignup.unavailable']).toBe('يرجى المحاولة مرة أخرى لاحقًا.');
  expect(en['clientSignup.complete']).toBeTruthy();
  expect(ar['clientSignup.complete']).toBeTruthy();
  for (const completion of [
    en['clientSignup.complete'] ?? '',
    ar['clientSignup.complete'] ?? '',
  ]) {
    expect(completion).not.toMatch(
      /approv|activat|access|destination|workspace|account|موافقة|تفعيل|وصول|وجهة|مساحة العمل|حساب/i,
    );
  }
  expect(signupResult('duplicate', 'en').message).toBe(
    en['clientSignup.duplicate'],
  );
  expect(signupResult('unavailable', 'ar').message).toBe(
    ar['clientSignup.unavailable'],
  );
});

it('T035 collapses every registration-link state to valid or invalid, never unavailable', () => {
  const linkStates: unknown[] = [
    { status: 'valid', workspace_name: 'Workspace' },
    { status: 'invalid' },
    { status: 'expired' },
    { status: 'consumed' },
    { status: 'revoked' },
    { status: 'unknown' },
    null,
    'invalid',
  ];
  const parsed = linkStates.map(parseOpenResult);
  expect(parsed[0]).toEqual({ status: 'valid', workspace_name: 'Workspace' });
  expect(parsed.slice(1).every((result) => result.status === 'invalid')).toBe(
    true,
  );
  expect(parsed.every((result) => !('unavailable' in result))).toBe(true);
  expect(signupResult('unavailable', 'en').status).toBe('unavailable');
  expect(signupResult('unavailable', 'en').message).toBe(
    'Please try again later.',
  );
});

it('T035 keeps the signup field contract to name, email, phone and password', () => {
  expect(
    signupFields({
      name: 'Example Person',
      email: 'example@example.test',
      phone: '+201012345678',
      password: 'Complex!2345',
      telegram: 'unused',
    }),
  ).toBeNull();
});
