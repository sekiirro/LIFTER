import { describe, expect, it } from 'vitest';
import { buildProfilePrefill } from '../../lib/forms/profile-prefill';

const questions = [
  {
    id: 'B01',
    sectionId: 'basic',
    type: 'profileText' as const,
    required: false,
    profileField: 'fullName' as const,
  },
  {
    id: 'B02',
    sectionId: 'basic',
    type: 'computedAge' as const,
    required: false,
    dateOfBirthField: 'dateOfBirth' as const,
  },
];

describe('client intake signup profile prefill', () => {
  it('binds the approved question fields to the signup name and computes Cairo age', () => {
    expect(
      buildProfilePrefill(
        questions,
        { fullName: 'Signed client full name', dateOfBirth: '2000-10-31' },
        new Date('2026-10-30T22:30:00.000Z'),
      ),
    ).toEqual({ B01: 'Signed client full name', B02: '26' });
  });

  it('uses birthday today and the day before boundary in Cairo', () => {
    const profile = {
      fullName: 'Signed client full name',
      dateOfBirth: '2000-10-31',
    };
    expect(
      buildProfilePrefill(
        questions,
        profile,
        new Date('2026-10-30T21:30:00.000Z'),
      ),
    ).toEqual({ B01: profile.fullName, B02: '25' });
    expect(
      buildProfilePrefill(
        questions,
        profile,
        new Date('2026-10-30T22:30:00.000Z'),
      ),
    ).toEqual({ B01: profile.fullName, B02: '26' });
  });

  it('only binds declared read-only profile fields and tolerates a missing DOB', () => {
    const expanded = [
      ...questions,
      {
        id: 'custom',
        sectionId: 'basic',
        type: 'shortText' as const,
        required: false,
      },
    ];
    expect(
      buildProfilePrefill(
        expanded,
        { fullName: 'Signed client full name', dateOfBirth: null },
        new Date('2026-10-30T22:30:00.000Z'),
      ),
    ).toEqual({ B01: 'Signed client full name' });
  });
});
