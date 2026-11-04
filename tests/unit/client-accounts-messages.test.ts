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

it('T035 keeps duplicate wording field-neutral and completion generic', () => {
  const en = getMessages('en') as Record<string, string>;
  const ar = getMessages('ar') as Record<string, string>;
  // PO Q2 B: every identity collision uses one neutral response.
  expect(en['clientSignup.duplicate']).toBe(
    'We could not complete this registration with these details. Contact your coach or support.',
  );
  expect(ar['clientSignup.duplicate']).toBe(
    '\u062a\u0639\u0630\u0651\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644 \u0628\u0647\u0630\u0647 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a. \u064a\u064f\u0631\u062c\u0649 \u0627\u0644\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u062f\u0631\u0651\u0628\u0643 \u0623\u0648 \u0627\u0644\u062f\u0639\u0645.',
  );
  expect(ar['clientSignup.duplicate']).not.toMatch(
    /\u0627\u0644\u0628\u0631\u064a\u062f|\u0627\u0644\u0647\u0627\u062a\u0641|\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645/,
  );
  expect(en['clientSignup.duplicate']).not.toMatch(/email|phone|username/i);
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

it('T045 keeps the extended signup field contract strict', () => {
  expect(
    signupFields({
      name: 'Example Middle Person',
      email: 'example@example.test',
      phone: '+201012345678',
      password: 'Complex!2345',
      dateOfBirth: '1990-04-12',
      username: 'example-user',
      telegramUsername: '',
      telegram: 'unused',
    }),
  ).toBeNull();
});
