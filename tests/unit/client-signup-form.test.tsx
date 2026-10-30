import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  runValidatedSignupAction,
  SignupForm,
} from '../../app/register/[token]/SignupForm';
import {
  initialSignupResult,
  runSignupActionSafely,
  signupResult,
} from '../../lib/client-accounts/results';
import type { PhoneCountryOption } from '../../lib/client-accounts/phone';

const phoneCountries: PhoneCountryOption[] = [
  { code: 'EG', name: 'Egypt', callingCode: '20' },
];

function renderSignup(locale: 'ar' | 'en' = 'en') {
  return renderToStaticMarkup(
    createElement(SignupForm, {
      action: vi.fn(async () => signupResult('complete', locale)),
      locale,
      phoneCountries,
    }),
  );
}

describe('T038 signup form', () => {
  it('renders identity fields and does not collect terms, health or sex at signup', () => {
    const html = renderSignup();
    for (const name of [
      'name',
      'dateOfBirth',
      'username',
      'telegramUsername',
      'email',
      'phone',
      'password',
    ])
      expect(html).toContain(`name="${name}"`);
    expect(html).not.toMatch(/type="checkbox"|termsConsent|health|sex/i);
  });

  it('passes pending signup fields without consent to the mocked transaction', async () => {
    const formData = new FormData();
    formData.set('name', 'Heba Sami Nabil');
    formData.set('dateOfBirth', '2000-10-29');
    formData.set('username', 'heba');
    formData.set('telegramUsername', '');
    formData.set('email', 'heba@example.test');
    formData.set(
      'phone',
      JSON.stringify({ country: 'EG', nationalNumber: '1012345678' }),
    );
    formData.set('password', 'Complex!2345');
    const action = vi.fn(async () => signupResult('complete', 'en'));

    const result = await runSignupActionSafely(
      action,
      initialSignupResult,
      formData,
      'en',
    );

    expect(result.status).toBe('complete');
    expect([...formData.keys()]).not.toContain('termsConsent');
    expect([...formData.keys()]).not.toContain('health');
    expect([...formData.keys()]).not.toContain('sex');
  });

  it('stops invalid identity before calling the signup transaction', async () => {
    const formData = new FormData();
    formData.set('name', 'Heba');
    formData.set('dateOfBirth', '2026-10-30');
    formData.set('username', 'system');
    const action = vi.fn(async () => signupResult('complete', 'en'));

    const result = await runValidatedSignupAction(
      action,
      initialSignupResult,
      formData,
      'en',
    );

    expect(result.status).toBe('invalid_input');
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps provider failures generic and preserves the manual sign-out gate', async () => {
    const failure = await runSignupActionSafely(
      async () => {
        throw new Error('private provider detail');
      },
      initialSignupResult,
      new FormData(),
      'en',
    );
    expect(failure.status).toBe('unavailable');
    expect(failure.message).toBe('Please try again later.');
    expect(failure.message).not.toContain('private provider detail');
    expect(signupResult('sign_out_required', 'en').status).toBe(
      'sign_out_required',
    );
    expect(renderSignup()).not.toContain('Sign out automatically');
  });
});
