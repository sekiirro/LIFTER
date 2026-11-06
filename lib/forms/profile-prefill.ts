import type { FormQuestion } from './validation';
import { calculateAgeInCairo } from './validation';

export type SignupProfile = {
  fullName: string;
  dateOfBirth: string | null;
};

/** Resolve only authored read-only bindings from the authenticated client's signup profile. */
export function buildProfilePrefill(
  questions: readonly FormQuestion[],
  profile: SignupProfile | null,
  now: Date,
): Record<string, string> {
  if (!profile) return {};
  const values: Record<string, string> = {};
  for (const question of questions) {
    if (
      question.type === 'profileText' &&
      question.profileField === 'fullName' &&
      profile.fullName.trim()
    ) {
      values[question.id] = profile.fullName;
    }
    if (
      question.type === 'computedAge' &&
      question.dateOfBirthField === 'dateOfBirth' &&
      profile.dateOfBirth
    ) {
      const age = calculateAgeInCairo(profile.dateOfBirth, now);
      if (age !== null) values[question.id] = String(age);
    }
  }
  return values;
}
