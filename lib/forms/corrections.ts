import { validateDraftAnswers } from './drafts';
import type { FormAnswerSet } from './validation';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type CorrectionValidation =
  | {
      ok: true;
      expectedRevision: number;
      intentKey: string;
      answerValues: FormAnswerSet;
      correctionNote: string;
    }
  | { ok: false; code: 'invalid' | 'answer_too_long' | 'payload_too_large' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCorrectionNoteWithinBounds(value: string): boolean {
  return (
    Array.from(value).length <= 1_000 &&
    new TextEncoder().encode(value).byteLength <= 4_096
  );
}

/** Validate correction metadata and answer values before the database write. */
export function validateCorrectionRequest(
  snapshot: unknown,
  value: unknown,
): CorrectionValidation {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'expected_revision',
          'intent_key',
          'answer_values',
          'correction_note',
        ].includes(key),
    ) ||
    !Number.isInteger(value.expected_revision) ||
    (value.expected_revision as number) < 1 ||
    typeof value.intent_key !== 'string' ||
    !uuidPattern.test(value.intent_key) ||
    typeof value.correction_note !== 'string'
  ) {
    return { ok: false, code: 'invalid' };
  }
  const correctionNote = value.correction_note;
  if (!isCorrectionNoteWithinBounds(correctionNote)) {
    return { ok: false, code: 'answer_too_long' };
  }
  const answers = validateDraftAnswers(snapshot, value.answer_values);
  if (!answers.ok) return answers;
  return {
    ok: true,
    expectedRevision: value.expected_revision as number,
    intentKey: value.intent_key,
    answerValues: answers.answerValues,
    correctionNote,
  };
}
