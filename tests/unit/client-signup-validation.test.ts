import { describe, expect, it } from 'vitest';
import {
  calculateSignupAge,
  validateSignupIdentity,
} from '../../app/register/[token]/schema';
import {
  isReservedSignupUsername,
  isValidTelegramUsername,
  normalizeSignupUsername,
  validateSignupName,
} from '../../lib/forms/signup-policy';

const beforeCairoBirthday = new Date('2026-10-30T00:00:00.000Z');

describe('T037 signup identity validation', () => {
  it.each([
    ['  Heba   Sami  Nabil ', true],
    ['Heba Sami', false],
    ['Heba  \t \n Nabil', false],
    ['   ', false],
  ])('requires three non-empty name parts: %j', (name, valid) => {
    expect(validateSignupName(name)).toBe(valid);
  });

  it('rejects impossible dates and today/future dates in the Cairo calendar', () => {
    for (const dateOfBirth of ['2024-02-30', '2026-10-30', '2099-01-01', '']) {
      expect(
        validateSignupIdentity(
          {
            name: 'Heba Sami Nabil',
            dateOfBirth,
            username: 'heba',
            telegramUsername: '',
          },
          { now: beforeCairoBirthday },
        ).invalidFields,
      ).toContain('dateOfBirth');
    }
  });

  it('computes age from Cairo-local date boundaries, including birthday tomorrow', () => {
    expect(calculateSignupAge('2000-10-31', beforeCairoBirthday)).toBe(25);
    expect(calculateSignupAge('2000-10-30', beforeCairoBirthday)).toBe(26);
    expect(
      calculateSignupAge('2000-10-30', new Date('2026-10-30T22:30:00.000Z')),
    ).toBe(26);
  });

  it('normalizes usernames with NFKC followed by lowercase', () => {
    expect(normalizeSignupUsername('  ＡＢＣ  ')).toBe('  abc  ');
    expect(normalizeSignupUsername('Straße')).toBe('straße');
  });

  it.each([
    'platform',
    'system',
    'trainer',
    'sales',
    'client',
    'platform_owner',
    'workspace-owner',
  ])('reserves platform, system and role identifier %s', (username) => {
    expect(isReservedSignupUsername(username)).toBe(true);
  });

  it('reserves workspace identifiers supplied by the trusted caller after normalization', () => {
    expect(
      isReservedSignupUsername('  ＡCME  ', ['acme-workspace', 'acme']),
    ).toBe(true);
    expect(isReservedSignupUsername('acme-client', ['acme-workspace'])).toBe(
      false,
    );
  });

  it.each([
    ['', true],
    ['@heba_123', true],
    ['heba', false],
    ['@ab!cd', false],
    ['@12345', false],
    ['@' + 'a'.repeat(33), false],
  ])('accepts optional Telegram syntax only when valid: %j', (value, valid) => {
    expect(isValidTelegramUsername(value)).toBe(valid);
  });

  it('accepts a valid identity without signup consent, health or sex fields', () => {
    const result = validateSignupIdentity(
      {
        name: 'Heba Sami Nabil',
        dateOfBirth: '2000-10-29',
        username: 'Ｈｅｂａ',
        telegramUsername: '',
      },
      { now: beforeCairoBirthday },
    );

    expect(result.invalidFields).toEqual([]);
    expect(result.value).toEqual({
      name: 'Heba Sami Nabil',
      dateOfBirth: '2000-10-29',
      username: 'heba',
      telegramUsername: undefined,
    });
    expect(JSON.stringify(result.value)).not.toMatch(
      /terms|consent|health|sex/i,
    );
  });
});
