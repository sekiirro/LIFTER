import { describe, expect, it } from 'vitest';
import {
  APPROVED_FORM_BOUNDS,
  countTextAnswer,
  measureAnswerPayloadBytes,
  measureTextAnswerBytes,
  validateAnswerSet,
  validateFormDefinition,
  type FormQuestion,
} from '../../lib/forms/validation';

function question(
  type: 'shortText' | 'longText',
  options: Partial<FormQuestion> = {},
): FormQuestion {
  return {
    id: 'answer',
    sectionId: 'basic',
    type,
    required: false,
    ...options,
  };
}

function validateText(
  type: 'shortText' | 'longText',
  value: string,
  options: Partial<FormQuestion> = {},
) {
  return validateAnswerSet([question(type, options)], { answer: value });
}

describe('Unicode text answer counting', () => {
  it.each([
    ['English', 'Hello, world!', 13],
    ['Arabic with diacritics', 'مُدَرِّب', 8],
    ['surrogate-pair emoji', '😀🏋️', 3],
    ['ZWJ emoji sequence', '👨‍👩‍👧‍👦', 7],
    ['mixed RTL and LTR', 'مرحبا ABC ١٢٣', 13],
  ])('counts %s by Unicode code point', (_name, value, used) => {
    expect(countTextAnswer(value, 150)).toEqual({
      used,
      limit: 150,
      remaining: 150 - used,
      over: false,
    });
  });

  it('accepts exactly the short and long type boundaries and rejects one over', () => {
    expect(validateText('shortText', 'x'.repeat(150))).toEqual([]);
    expect(validateText('shortText', '😀'.repeat(150))).toEqual([]);
    expect(validateText('shortText', 'x'.repeat(151))).toContainEqual({
      code: 'answer_too_long',
      questionId: 'answer',
    });
    expect(validateText('longText', 'x'.repeat(1_000))).toEqual([]);
    expect(validateText('longText', 'x'.repeat(1_001))).toContainEqual({
      code: 'answer_too_long',
      questionId: 'answer',
    });
  });

  it('applies a lower author limit at N and N+1 and rejects limits above type max', () => {
    expect(validateText('longText', 'x'.repeat(12), { charLimit: 12 })).toEqual(
      [],
    );
    expect(
      validateText('longText', 'x'.repeat(13), { charLimit: 12 }),
    ).toContainEqual({ code: 'answer_too_long', questionId: 'answer' });
    expect(
      validateFormDefinition([question('shortText', { charLimit: 151 })]),
    ).toContainEqual({ code: 'invalid_char_limit', questionId: 'answer' });
    expect(
      validateFormDefinition([question('longText', { charLimit: 0 })]),
    ).toContainEqual({ code: 'invalid_char_limit', questionId: 'answer' });
  });

  it('keeps the approved 20-per-section and 60-per-form boundaries', () => {
    const sectionQuestions = Array.from({ length: 20 }, (_, index) =>
      question('shortText', { id: `s${index}`, sectionId: 'one' }),
    );
    expect(validateFormDefinition(sectionQuestions)).toEqual([]);
    expect(
      validateFormDefinition([
        ...sectionQuestions,
        question('shortText', { id: 's20', sectionId: 'one' }),
      ]),
    ).toContainEqual({ code: 'too_many_questions_in_section' });

    const sixtyQuestions = Array.from({ length: 60 }, (_, index) =>
      question('shortText', {
        id: `q${index}`,
        sectionId: `s${Math.floor(index / 20)}`,
      }),
    );
    expect(validateFormDefinition(sixtyQuestions)).toEqual([]);
    expect(
      validateFormDefinition([
        ...sixtyQuestions,
        question('shortText', { id: 'q60', sectionId: 's3' }),
      ]),
    ).toContainEqual({ code: 'too_many_questions' });
  });
});

describe('UTF-8 safety and submission payload byte measurements', () => {
  it('measures the separate per-answer UTF-8 safety boundary', () => {
    const fourByteText = '😀'.repeat(1_024);
    expect(measureTextAnswerBytes(fourByteText)).toBe(4_096);
    expect(measureTextAnswerBytes(`${fourByteText}x`)).toBe(4_097);
    expect(APPROVED_FORM_BOUNDS.maxTextBytes).toBe(4_096);
  });

  it('rejects a textual answer at 4,097 bytes even when character type is not text-counted', () => {
    const dateQuestion: FormQuestion = {
      id: 'answer',
      sectionId: 'basic',
      type: 'date',
      required: false,
    };
    expect(
      validateAnswerSet([dateQuestion], { answer: 'x'.repeat(4_096) }),
    ).not.toContainEqual({ code: 'answer_too_long', questionId: 'answer' });
    expect(
      validateAnswerSet([dateQuestion], { answer: 'x'.repeat(4_097) }),
    ).toContainEqual({ code: 'answer_too_long', questionId: 'answer' });
  });

  it('measures the answer-content payload boundary without keys or envelope', () => {
    const atLimit = 'x'.repeat(262_142);
    const overLimit = 'x'.repeat(262_143);
    expect(measureAnswerPayloadBytes({ arbitrary: atLimit })).toBe(262_144);
    expect(measureAnswerPayloadBytes({ arbitrary: overLimit })).toBe(262_145);
    expect(APPROVED_FORM_BOUNDS.maxPayloadBytes).toBe(262_144);
  });

  it('accepts the payload cap exactly and rejects the next byte', () => {
    const payloadAtLimit = [
      ...Array.from({ length: 42 }, () => 'x'.repeat(6_000)),
      'x'.repeat(10_014),
    ];
    const payloadOverLimit = [
      ...Array.from({ length: 42 }, () => 'x'.repeat(6_000)),
      'x'.repeat(10_015),
    ];
    const multiChoice: FormQuestion = {
      id: 'answer',
      sectionId: 'basic',
      type: 'multiChoice',
      required: false,
      choices: ['allowed'],
    };
    expect(measureAnswerPayloadBytes({ answer: payloadAtLimit })).toBe(262_144);
    expect(measureAnswerPayloadBytes({ answer: payloadOverLimit })).toBe(
      262_145,
    );
    expect(
      validateAnswerSet([multiChoice], { answer: payloadAtLimit }),
    ).not.toContainEqual({ code: 'payload_too_large' });
    expect(
      validateAnswerSet([multiChoice], { answer: payloadOverLimit }),
    ).toContainEqual({ code: 'payload_too_large' });
  });

  it('accepts 60 long answers of 1,000 four-byte code points under 256 KiB', () => {
    const questions = Array.from({ length: 60 }, (_, index) =>
      question('longText', {
        id: `q${index}`,
        sectionId: `s${Math.floor(index / 20)}`,
      }),
    );
    const answers = Object.fromEntries(
      questions.map(({ id }) => [id, '😀'.repeat(1_000)]),
    );

    expect(measureAnswerPayloadBytes(answers)).toBe(240_120);
    expect(validateAnswerSet(questions, answers)).toEqual([]);
  });

  it('rejects an oversized measured answer payload', () => {
    const multiChoice: FormQuestion = {
      id: 'answer',
      sectionId: 'basic',
      type: 'multiChoice',
      required: false,
      choices: ['allowed'],
    };
    const overSizedValues = Array.from({ length: 51 }, () => 'x'.repeat(6_000));
    expect(
      validateAnswerSet([multiChoice], { answer: overSizedValues }),
    ).toContainEqual({ code: 'payload_too_large' });
  });
});
