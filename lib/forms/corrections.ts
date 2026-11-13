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
      remove: string[];
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
          'remove',
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
  let rawCompleteRequest: string;
  try {
    rawCompleteRequest = JSON.stringify({
      answer_values: value.answer_values,
      remove: value.remove ?? [],
      correction_note: correctionNote,
    });
  } catch {
    return { ok: false, code: 'invalid' };
  }
  if (
    rawCompleteRequest === undefined ||
    new TextEncoder().encode(rawCompleteRequest).byteLength > 262_144
  ) {
    return { ok: false, code: 'payload_too_large' };
  }
  const answers = validateDraftAnswers(snapshot, value.answer_values);
  if (!answers.ok) return answers;
  if (
    !isRecord(snapshot) ||
    !Array.isArray(snapshot.questions) ||
    (value.remove !== undefined && !Array.isArray(value.remove))
  ) {
    return { ok: false, code: 'invalid' };
  }
  const remove = (value.remove ?? []) as unknown[];
  const questionIds = new Set<string>();
  for (const question of snapshot.questions) {
    if (
      isRecord(question) &&
      typeof question.id === 'string' &&
      /^[a-zA-Z0-9_.-]{1,64}$/u.test(question.id)
    ) {
      questionIds.add(question.id);
    }
  }
  if (
    remove.length > snapshot.questions.length ||
    remove.some(
      (id) =>
        typeof id !== 'string' ||
        !/^[a-zA-Z0-9_.-]{1,64}$/u.test(id) ||
        !questionIds.has(id),
    ) ||
    new Set(remove).size !== remove.length ||
    remove.some(
      (id) => typeof id === 'string' && Object.hasOwn(answers.answerValues, id),
    )
  ) {
    return { ok: false, code: 'invalid' };
  }
  let completeRequest: string;
  try {
    completeRequest = JSON.stringify({
      answer_values: answers.answerValues,
      remove,
      correction_note: correctionNote,
    });
  } catch {
    return { ok: false, code: 'invalid' };
  }
  if (
    completeRequest === undefined ||
    new TextEncoder().encode(completeRequest).byteLength > 262_144
  ) {
    return { ok: false, code: 'payload_too_large' };
  }
  return {
    ok: true,
    expectedRevision: value.expected_revision as number,
    intentKey: value.intent_key,
    answerValues: answers.answerValues,
    remove: remove as string[],
    correctionNote,
  };
}
