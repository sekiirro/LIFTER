import { ar } from '../i18n/messages/ar';
import { en } from '../i18n/messages/en';
import { ADHERENCE_QUESTION_IDS } from './constants';

/**
 * FR-037: the weekly check-in carries two neutral self-report questions on the
 * F15 0-10 integer scale (same validation as the N11 hunger score). They are
 * plain F15 typed answers; no scoring rationale is attached (FR-038).
 */
export const ADHERENCE_VALIDATION = { min: 0, max: 10, step: 1 } as const;

export type AdherenceQuestionTemplate = {
  id: (typeof ADHERENCE_QUESTION_IDS)[keyof typeof ADHERENCE_QUESTION_IDS];
  sectionId: string;
  type: 'number';
  required: boolean;
  validation: typeof ADHERENCE_VALIDATION;
  /** Approved S55-PO-10 copy (presentation key, kept apart from F15 data keys). */
  label: { en: string; ar: string };
};

export function adherenceQuestionTemplates(
  sectionId: string,
  required: boolean,
): AdherenceQuestionTemplate[] {
  return [
    {
      id: ADHERENCE_QUESTION_IDS.workout,
      sectionId,
      type: 'number',
      required,
      validation: ADHERENCE_VALIDATION,
      label: {
        en: en['checkin.adherence.workout.question'],
        ar: ar['checkin.adherence.workout.question'],
      },
    },
    {
      id: ADHERENCE_QUESTION_IDS.diet,
      sectionId,
      type: 'number',
      required,
      validation: ADHERENCE_VALIDATION,
      label: {
        en: en['checkin.adherence.diet.question'],
        ar: ar['checkin.adherence.diet.question'],
      },
    },
  ];
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Mirror of `app_private.f23_adherence_question_valid`. */
export function isValidAdherenceQuestion(
  definition: unknown,
  questionId: string,
): boolean {
  if (!isRecord(definition) || !Array.isArray(definition.questions))
    return false;
  const matches = definition.questions.filter(
    (q) => isRecord(q) && q.id === questionId,
  ) as Raw[];
  if (matches.length !== 1) return false;
  const q = matches[0]!;
  const validation = q.validation;
  return (
    (q.type === 'slider' || q.type === 'number') &&
    isRecord(validation) &&
    validation.min === 0 &&
    validation.max === 10 &&
    validation.step === 1
  );
}

/** Mirror of `app_private.f23_checkin_definition_valid`. */
export function isValidCheckInDefinition(definition: unknown): boolean {
  return (
    isValidAdherenceQuestion(definition, ADHERENCE_QUESTION_IDS.workout) &&
    isValidAdherenceQuestion(definition, ADHERENCE_QUESTION_IDS.diet)
  );
}

/** Measurement-mapped questions (FR-014): numeric questions with a unit. */
export function measurementQuestionIds(definition: unknown): string[] {
  if (!isRecord(definition) || !Array.isArray(definition.questions)) return [];
  const adherence: readonly string[] = Object.values(ADHERENCE_QUESTION_IDS);
  return definition.questions
    .filter(
      (q): q is Raw =>
        isRecord(q) &&
        typeof q.id === 'string' &&
        /^[A-Za-z0-9_.-]{1,64}$/.test(q.id) &&
        !adherence.includes(q.id) &&
        (q.type === 'number' || q.type === 'slider') &&
        isRecord(q.unit),
    )
    .map((q) => q.id as string);
}
