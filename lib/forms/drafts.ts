import { validateAnswerSet } from './validation';
import type { FormAnswerSet, FormQuestion } from './validation';

export type DraftValidationResult =
  | { ok: true; answerValues: FormAnswerSet }
  | { ok: false; code: 'answer_too_long' | 'payload_too_large' | 'invalid' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate a persisted snapshot and draft payload before any write is attempted. */
export function validateDraftAnswers(
  snapshot: unknown,
  answerValues: unknown,
): DraftValidationResult {
  if (
    !isRecord(snapshot) ||
    !Array.isArray(snapshot.questions) ||
    !isRecord(answerValues)
  ) {
    return { ok: false, code: 'invalid' };
  }
  const issues = validateAnswerSet(
    snapshot.questions as FormQuestion[],
    answerValues,
  );
  if (issues.some(({ code }) => code === 'answer_too_long'))
    return { ok: false, code: 'answer_too_long' };
  if (issues.some(({ code }) => code === 'payload_too_large'))
    return { ok: false, code: 'payload_too_large' };
  if (issues.length > 0) return { ok: false, code: 'invalid' };
  return { ok: true, answerValues: answerValues as FormAnswerSet };
}
