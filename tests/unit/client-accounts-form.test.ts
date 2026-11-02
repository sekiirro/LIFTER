import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const require = createRequire(import.meta.url);
type ParsedPhone = { number: string; isValid(): boolean };
type PhoneMetadataApi = {
  parsePhoneNumberFromString(
    value: string,
    options: { defaultCountry: string; extract: false },
  ): ParsedPhone | undefined;
};
const phoneApi = (() => {
  try {
    return require('libphonenumber-js/max') as PhoneMetadataApi;
  } catch {
    return null;
  }
})();

function source(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

it('T027 loads the max phone metadata and normalizes Egyptian trunk-0 variants to E.164', () => {
  expect(phoneApi, 'libphonenumber-js/max is installed').not.toBeNull();
  if (!phoneApi) return;
  const withTrunk = phoneApi.parsePhoneNumberFromString('01012345678', {
    defaultCountry: 'EG',
    extract: false,
  });
  const withoutTrunk = phoneApi.parsePhoneNumberFromString('1012345678', {
    defaultCountry: 'EG',
    extract: false,
  });
  expect(withTrunk?.isValid()).toBe(true);
  expect(withTrunk?.number === '+201012345678').toBe(true);
  expect(withoutTrunk?.isValid()).toBe(true);
  expect(withoutTrunk?.number === '+201012345678').toBe(true);
});

it('T027 validates other selected countries and rejects malformed, short and long numbers', () => {
  expect(phoneApi, 'libphonenumber-js/max is installed').not.toBeNull();
  if (!phoneApi) return;
  const us = phoneApi.parsePhoneNumberFromString('202-555-0123', {
    defaultCountry: 'US',
    extract: false,
  });
  expect(us?.isValid()).toBe(true);
  expect(us?.number === '+12025550123').toBe(true);
  for (const value of ['01012', '010123456789012', '010ABC5678']) {
    const parsed = phoneApi.parsePhoneNumberFromString(value, {
      defaultCountry: 'EG',
      extract: false,
    });
    expect(parsed?.isValid() ?? false).toBe(false);
  }
});

it('T027 app phone adapter composes E.164 from the selected country without echoing input', async () => {
  const { normalizePhone } = await import('../../lib/client-accounts/phone');
  const egyptWithTrunk = normalizePhone(
    JSON.stringify({ country: 'EG', nationalNumber: '01012345678' }),
  );
  const egyptWithoutTrunk = normalizePhone(
    JSON.stringify({ country: 'EG', nationalNumber: '1012345678' }),
  );
  expect(egyptWithTrunk === '+201012345678').toBe(true);
  expect(egyptWithoutTrunk === egyptWithTrunk).toBe(true);
  const us = normalizePhone(
    JSON.stringify({ country: 'US', nationalNumber: '202-555-0123' }),
  );
  expect(us === '+12025550123').toBe(true);
  for (const nationalNumber of ['01012', '010123456789012', '010ABC5678']) {
    const value = normalizePhone(
      JSON.stringify({ country: 'EG', nationalNumber }),
    );
    expect(value === null).toBe(true);
  }
});

it('generates 10,000 unique Egyptian mobile numbers accepted by normalizePhone', async () => {
  const [{ normalizePhone }, { generateEgyptianMobile }] = await Promise.all([
    import('../../lib/client-accounts/phone'),
    import('../e2e/egyptian-mobile'),
  ]);
  const numbers = Array.from({ length: 10_000 }, generateEgyptianMobile);
  const normalized = numbers.map((nationalNumber) =>
    normalizePhone(JSON.stringify({ country: 'EG', nationalNumber })),
  );

  expect(new Set(numbers).size).toBe(10_000);
  expect(numbers.every((number) => /^010[01269]\d{7}$/.test(number))).toBe(
    true,
  );
  expect(normalized.every((number) => number !== null)).toBe(true);
});

it('T027 provides a country selector defaulting to Egypt and keeps phone parsing out of the client bundle', () => {
  const page = source('app/register/[token]/page.tsx');
  const form = source('app/register/[token]/SignupForm.tsx');
  const phone = source('lib/client-accounts/phone.ts');

  expect(page).toContain('phoneCountryOptions');
  expect(phone).toContain('getCountries');
  expect(phone).toContain('getCountryCallingCode');
  expect(form).toContain("useState('EG')");
  expect(form).toContain('value={country}');
  expect(form).toContain('country');
  expect(form).toContain('nationalNumber');
  expect(phone).toContain("from 'libphonenumber-js/max'");
  expect(phone).toContain('isValid()');
  expect(phone).toContain('phone.number');
  expect(form).not.toContain('libphonenumber-js');
});

it('T027 exposes only safe signup states, disables pending submits and prompts manual sign-out', () => {
  const form = source('app/register/[token]/SignupForm.tsx');
  const service = source('lib/client-accounts/service.ts');
  const validation = source('lib/client-accounts/validation.ts');
  const results = source('lib/client-accounts/results.ts');

  expect(form).toContain('pending');
  expect(form).toMatch(/disabled=\{[^}]*pending/);
  expect(form).toContain('sign_out_required');
  expect(form).toContain('invalid_input');
  for (const status of ['unavailable', 'duplicate', 'complete'])
    expect(results).toContain(`'${status}'`);
  expect(form).toContain('newRequestSecret');
  expect(validation).toContain("['name', 'email', 'phone', 'password']");
  expect(service).toContain('validateSignupFields');
  expect(service).toContain('invalidFields');
  expect(form).not.toMatch(/data-(?:token|email|phone|name|password)=/i);
});

it('maps a rejected signup action to retryable localized unavailable and resets the submit guard', () => {
  const form = source('app/register/[token]/SignupForm.tsx');
  const results = source('lib/client-accounts/results.ts');
  expect(form).toContain(
    'runSignupActionSafely(action, previous, formData, locale)',
  );
  expect(results).toMatch(
    /catch\s*\{\s*return signupResult\('unavailable',\s*locale\)/s,
  );
  expect(form).toMatch(/finally\s*\{\s*submittingRef\.current\s*=\s*false/);
});
