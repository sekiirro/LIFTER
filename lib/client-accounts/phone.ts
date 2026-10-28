import 'server-only';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';
import { exactKeys } from '../registration-links/validation';

export type PhoneCountryOption = {
  code: CountryCode;
  name: string;
  callingCode: string;
};

const countries = getCountries();

export function phoneCountryOptions(locale: 'en' | 'ar'): PhoneCountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return countries
    .map((code) => ({
      code,
      name: names.of(code) ?? code,
      callingCode: getCountryCallingCode(code),
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, locale) || a.code.localeCompare(b.code),
    );
}

function phoneSubmission(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Accept a national input and country only; return the sole stored E.164 form. */
export function normalizePhone(value: unknown): string | null {
  const input = phoneSubmission(value);
  if (
    !exactKeys(input, ['country', 'nationalNumber']) ||
    typeof input.country !== 'string' ||
    !countries.includes(input.country as CountryCode) ||
    typeof input.nationalNumber !== 'string' ||
    !input.nationalNumber.trim()
  )
    return null;
  const country = input.country as CountryCode;
  const phone = parsePhoneNumberFromString(input.nationalNumber, {
    defaultCountry: country,
    extract: false,
  });
  if (
    !phone ||
    !phone.isValid() ||
    phone.country !== country ||
    !/^\+[1-9][0-9]{1,14}$/.test(phone.number)
  )
    return null;
  return phone.number;
}
