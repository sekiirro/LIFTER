import { expect, it, vi } from 'vitest';
import { signupResult } from '../../lib/client-accounts/results';
import { parseOpenResult } from '../../lib/registration-links/open';
import { getMessages } from '../../lib/i18n';

it('uses the approved EN and AR username validation copy byte-for-byte', () => {
  const en = getMessages('en');
  const ar = getMessages('ar');
  expect(en['clientSignup.usernameUnavailable']).toBe(
    'This username is unavailable. Choose another.',
  );
  expect(ar['clientSignup.usernameUnavailable']).toBe(
    'اسم المستخدم ده غير متاح. اختار اسم تاني.',
  );
  expect(en['clientSignup.usernameFormatError']).toBe(
    'Use 3–30 characters: English letters, numbers, periods, or underscores.',
  );
  expect(ar['clientSignup.usernameFormatError']).toBe(
    'استخدم من 3 لـ30 حرف: حروف إنجليزي أو أرقام أو نقطة أو شرطة سفلية.',
  );
});
import { signupFields } from '../../lib/client-accounts/validation';

vi.mock('server-only', () => ({}));

const signupKeys = [
  'clientSignup.name',
  'clientSignup.dateOfBirth',
  'clientSignup.username',
  'clientSignup.telegramUsername',
  'clientSignup.optional',
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

it('T035 has matching Arabic and English signup profile message keys', () => {
  const en = getMessages('en') as Record<string, string>;
  const ar = getMessages('ar') as Record<string, string>;
  expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
  for (const key of signupKeys) {
    expect(en[key], `${key} in English`).toBeTruthy();
    expect(ar[key], `${key} in Arabic`).toBeTruthy();
  }
  expect(en['clientSignup.telegramUsername']).toBe('Telegram username');
  expect(ar['clientSignup.telegramUsername']).toBe('اسم مستخدم تيليجرام');
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

it('T035 keeps the approved signup profile fields and rejects unknown fields', () => {
  expect(
    signupFields({
      name: 'Example Sami Person',
      email: 'example@example.test',
      phone: '+201012345678',
      password: 'Complex!2345',
      dateOfBirth: '1990-04-12',
      username: 'example.person',
      telegramUsername: '',
      telegram: 'unused',
    }),
  ).toBeNull();
});
