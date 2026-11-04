import { evaluateProgression } from './progression';
import {
  QUESTION_PRESENTATION_KEYS,
  type FormAnswerSet,
  type FormQuestion,
} from './validation';

export type FormSubmissionValidation =
  | { ok: true; answerValues: FormAnswerSet }
  | {
      ok: false;
      code: 'answer_too_long' | 'payload_too_large' | 'incomplete' | 'invalid';
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate full submission requirements against the assigned immutable snapshot. */
export function validateFormSubmission(
  snapshot: unknown,
  answerValues: unknown,
): FormSubmissionValidation {
  if (
    !isRecord(snapshot) ||
    !Array.isArray(snapshot.questions) ||
    !isRecord(answerValues)
  ) {
    return { ok: false, code: 'invalid' };
  }
  const questions = snapshot.questions.map((question) =>
    isRecord(question)
      ? Object.fromEntries(
          Object.entries(question).filter(
            ([key]) => !QUESTION_PRESENTATION_KEYS.has(key),
          ),
        )
      : question,
  ) as FormQuestion[];
  const progression = evaluateProgression({
    questions,
    answers: answerValues as FormAnswerSet,
  });
  if (progression.errors.some(({ code }) => code === 'answer_too_long'))
    return { ok: false, code: 'answer_too_long' };
  if (progression.errors.some(({ code }) => code === 'payload_too_large'))
    return { ok: false, code: 'payload_too_large' };
  if (progression.errors.length > 0) return { ok: false, code: 'invalid' };
  if (!progression.complete) return { ok: false, code: 'incomplete' };

  return { ok: true, answerValues: answerValues as FormAnswerSet };
}
