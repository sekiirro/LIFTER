import {
  calculateSignupAge as calculateAge,
  isPastCalendarDate,
  isReservedSignupUsername,
  isValidSignupUsername,
  isValidTelegramUsername,
  normalizeSignupUsername,
  validateSignupName,
} from '../../../lib/forms/signup-policy';

export type SignupIdentityField =
  'name' | 'dateOfBirth' | 'username' | 'telegramUsername';

export type SignupIdentity = {
  name: string;
  dateOfBirth: string;
  username: string;
  telegramUsername?: string;
};

export type SignupIdentityResult = {
  value: SignupIdentity | null;
  invalidFields: SignupIdentityField[];
};

export function calculateSignupAge(dateOfBirth: string, now = new Date()) {
  return calculateAge(dateOfBirth, now);
}

export function validateSignupIdentity(
  input: unknown,
  options: {
    now?: Date;
    workspaceIdentifiers?: readonly string[];
  } = {},
): SignupIdentityResult {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return {
      value: null,
      invalidFields: ['name', 'dateOfBirth', 'username'],
    };

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const allowed = new Set([
    'name',
    'dateOfBirth',
    'username',
    'telegramUsername',
  ]);
  if (
    keys.some((key) => !allowed.has(key)) ||
    !keys.includes('name') ||
    !keys.includes('dateOfBirth') ||
    !keys.includes('username')
  )
    return {
      value: null,
      invalidFields: ['name', 'dateOfBirth', 'username'],
    };

  const now = options.now ?? new Date();
  const invalidFields: SignupIdentityField[] = [];
  const name = record.name;
  const dateOfBirth = record.dateOfBirth;
  const rawUsername = record.username;
  const telegramUsername = record.telegramUsername ?? '';

  if (!validateSignupName(name)) invalidFields.push('name');
  if (!isPastCalendarDate(dateOfBirth, now)) invalidFields.push('dateOfBirth');
  if (
    !isValidSignupUsername(rawUsername) ||
    isReservedSignupUsername(
      typeof rawUsername === 'string' ? rawUsername : '',
      options.workspaceIdentifiers,
    )
  )
    invalidFields.push('username');
  if (!isValidTelegramUsername(telegramUsername))
    invalidFields.push('telegramUsername');

  if (invalidFields.length) return { value: null, invalidFields };

  return {
    value: {
      name: name as string,
      dateOfBirth: dateOfBirth as string,
      username: normalizeSignupUsername(rawUsername as string),
      ...(telegramUsername
        ? { telegramUsername: telegramUsername as string }
        : {}),
    },
    invalidFields: [],
  };
}

export function parseSignupIdentity(
  formData: FormData,
  options: { workspaceIdentifiers?: readonly string[]; now?: Date } = {},
): SignupIdentityResult {
  return validateSignupIdentity(
    {
      name: formData.get('name'),
      dateOfBirth: formData.get('dateOfBirth'),
      username: formData.get('username'),
      telegramUsername: formData.get('telegramUsername') ?? '',
    },
    options,
  );
}
