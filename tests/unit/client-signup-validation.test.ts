import { describe, expect, it } from 'vitest';
import {
  calculateSignupAge,
  validateSignupIdentity,
} from '../../app/register/[token]/schema';

const now = new Date('2026-06-16T12:00:00.000Z');
const valid = {
  name: 'Heba Sami Nabil',
  dateOfBirth: '1990-04-12',
  username: 'Heba.Sami',
  telegramUsername: '',
};

describe('approved signup profile contract', () => {
  it('accepts a three-part name, past DOB, username and optional Telegram', () => {
    expect(validateSignupIdentity(valid, { now })).toEqual({
      value: {
        name: valid.name,
        dateOfBirth: valid.dateOfBirth,
        username: 'heba.sami',
      },
      invalidFields: [],
    });
  });

  it('rejects a two-part name and a future DOB', () => {
    expect(
      validateSignupIdentity({ ...valid, name: 'Heba Nabil' }, { now })
        .invalidFields,
    ).toContain('name');
    expect(
      validateSignupIdentity({ ...valid, dateOfBirth: '2026-06-17' }, { now })
        .invalidFields,
    ).toContain('dateOfBirth');
  });

  it('calculates age on both sides of the birthday in Cairo time', () => {
    expect(calculateSignupAge('2000-06-16', now)).toBe(26);
    expect(calculateSignupAge('2000-06-17', now)).toBe(25);
  });

  it('uses the Cairo calendar date across the UTC midnight boundary', () => {
    const justAfterCairoMidnight = new Date('2026-06-15T22:30:00.000Z');
    expect(calculateSignupAge('2000-06-16', justAfterCairoMidnight)).toBe(26);
    expect(calculateSignupAge('2000-06-17', justAfterCairoMidnight)).toBe(25);
  });

  it('rejects reserved and workspace-identifying usernames', () => {
    expect(
      validateSignupIdentity({ ...valid, username: 'workspace-owner' }, { now })
        .invalidFields,
    ).toContain('username');
    expect(
      validateSignupIdentity(valid, {
        now,
        workspaceIdentifiers: ['Heba.Sami'],
      }).invalidFields,
    ).toContain('username');
  });

  it('keeps Telegram optional and validates its format when supplied', () => {
    expect(validateSignupIdentity(valid, { now }).invalidFields).toEqual([]);
    expect(
      validateSignupIdentity({ ...valid, telegramUsername: 'ab' }, { now })
        .invalidFields,
    ).toContain('telegramUsername');
  });
});
