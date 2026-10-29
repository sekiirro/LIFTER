import { describe, expect, it } from 'vitest';
import {
  APPROVED_FORM_BOUNDS,
  countTextAnswer,
  measureAnswerPayloadBytes,
  measureTextAnswerBytes,
  validateAnswerSet,
  validateFormDefinition,
  type FormAnswerSet,
  type FormQuestion,
} from '../../lib/forms/validation';

const legacyCoverageQuestions: readonly FormQuestion[] = [
  { id: 'consent', sectionId: 'basic', type: 'boolean', required: true },
  {
    id: 'name',
    sectionId: 'basic',
    type: 'shortText',
    required: true,
    validation: { maxLength: 40 },
  },
  {
    id: 'goal',
    sectionId: 'workout',
    type: 'singleChoice',
    required: false,
    choices: ['strength', 'mobility'],
    when: {
      mode: 'all',
      conditions: [{ questionId: 'consent', operator: 'equals', value: true }],
    },
  },
];

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

function conditionGraph(conditionCount: number): FormQuestion[] {
  const dependentCount = Math.ceil(conditionCount / 16);
  const questions: FormQuestion[] = [
    { id: 'source', sectionId: 'section0', type: 'boolean', required: false },
  ];
  let remaining = conditionCount;
  for (let index = 0; index < dependentCount; index += 1) {
    const count = Math.min(16, remaining);
    questions.push({
      id: `dependent${index}`,
      sectionId: `section${Math.floor((index + 1) / 20)}`,
      type: 'boolean',
      required: false,
      when: {
        mode: 'all',
        conditions: Array.from({ length: count }, () => ({
          questionId: 'source',
          operator: 'equals' as const,
          value: true,
        })),
      },
    });
    remaining -= count;
  }
  return questions;
}

describe('restored form definition validation coverage', () => {
  const questionsForSections = (sizes: readonly number[]) =>
    sizes.flatMap((count, sectionIndex) =>
      Array.from({ length: count }, (_, questionIndex) => ({
        id: `q${sectionIndex}_${questionIndex}`,
        sectionId: `section${sectionIndex}`,
        type: 'shortText' as const,
        required: false,
      })),
    );

  it('accepts 20 questions in a section and rejects 21', () => {
    expect(validateFormDefinition(questionsForSections([20]))).toEqual([]);
    expect(
      validateFormDefinition(questionsForSections([21])).map(
        ({ code }) => code,
      ),
    ).toContain('too_many_questions_in_section');
  });

  it('accepts 60 questions per form and rejects 61 across valid section sizes', () => {
    expect(validateFormDefinition(questionsForSections([20, 20, 20]))).toEqual(
      [],
    );
    expect(
      validateFormDefinition(questionsForSections([20, 20, 20, 1])).map(
        ({ code }) => code,
      ),
    ).toContain('too_many_questions');
  });

  it('accepts typed acyclic definitions with known references', () => {
    expect(validateFormDefinition(legacyCoverageQuestions)).toEqual([]);
  });

  it('applies UTF-8 byte bounds to choice labels and condition values', () => {
    const valid4096Bytes = 'ا'.repeat(2_048);
    const invalid4097Bytes = `${valid4096Bytes}a`;
    const choiceDefinition = (choice: string): FormQuestion[] => [
      {
        id: 'choice',
        sectionId: 'basic',
        type: 'singleChoice',
        required: false,
        choices: [choice],
      },
    ];
    const conditionDefinition = (value: string): FormQuestion[] => [
      {
        id: 'source',
        sectionId: 'basic',
        type: 'shortText',
        required: false,
      },
      {
        id: 'branch',
        sectionId: 'basic',
        type: 'boolean',
        required: false,
        when: {
          mode: 'all',
          conditions: [{ questionId: 'source', operator: 'equals', value }],
        },
      },
    ];

    expect(validateFormDefinition(choiceDefinition(valid4096Bytes))).toEqual(
      [],
    );
    expect(
      validateFormDefinition(choiceDefinition(invalid4097Bytes)).map(
        ({ code }) => code,
      ),
    ).toContain('invalid_choices');
    expect(validateFormDefinition(conditionDefinition(valid4096Bytes))).toEqual(
      [],
    );
    expect(
      validateFormDefinition(conditionDefinition(invalid4097Bytes)).map(
        ({ code }) => code,
      ),
    ).toContain('invalid_applicability');
  });

  it('rejects unknown question IDs and answer types', () => {
    const invalid = [
      {
        ...legacyCoverageQuestions[0],
        type: 'script' as FormQuestion['type'],
      },
      {
        ...legacyCoverageQuestions[1],
        when: {
          mode: 'all' as const,
          conditions: [
            { questionId: 'missing', operator: 'equals' as const, value: true },
          ],
        },
      },
    ];
    expect(validateFormDefinition(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_question_type',
          questionId: 'consent',
        }),
        expect.objectContaining({
          code: 'unknown_question_id',
          questionId: 'name',
        }),
      ]),
    );
  });

  it('rejects cyclic applicability and type-incompatible conditions', () => {
    const cyclic: readonly FormQuestion[] = [
      {
        id: 'a',
        sectionId: 'basic',
        type: 'boolean',
        required: false,
        when: {
          mode: 'all',
          conditions: [{ questionId: 'b', operator: 'equals', value: true }],
        },
      },
      {
        id: 'b',
        sectionId: 'basic',
        type: 'boolean',
        required: false,
        when: {
          mode: 'all',
          conditions: [{ questionId: 'a', operator: 'equals', value: true }],
        },
      },
      {
        id: 'c',
        sectionId: 'basic',
        type: 'shortText',
        required: false,
        when: {
          mode: 'all',
          conditions: [{ questionId: 'a', operator: 'contains', value: 'x' }],
        },
      },
    ];

    expect(validateFormDefinition(cyclic)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'cyclic_applicability' }),
        expect.objectContaining({
          code: 'incompatible_condition',
          questionId: 'c',
        }),
      ]),
    );
  });

  it('rejects definitions and condition graphs above safe bounds', () => {
    expect(validateFormDefinition(conditionGraph(401))).toContainEqual(
      expect.objectContaining({ code: 'too_many_conditions' }),
    );

    const tooManyPerQuestion: FormQuestion[] = [
      { id: 'source', sectionId: 'basic', type: 'boolean', required: false },
      {
        id: 'dependent',
        sectionId: 'basic',
        type: 'boolean',
        required: false,
        when: {
          mode: 'all',
          conditions: Array.from({ length: 17 }, () => ({
            questionId: 'source',
            operator: 'equals' as const,
            value: true,
          })),
        },
      },
    ];
    expect(validateFormDefinition(tooManyPerQuestion)).toContainEqual(
      expect.objectContaining({ code: 'invalid_applicability' }),
    );

    const tooManyChoices: FormQuestion[] = [
      {
        id: 'choices',
        sectionId: 'basic',
        type: 'singleChoice',
        required: false,
        choices: Array.from({ length: 51 }, (_, index) => `choice-${index}`),
      },
    ];
    expect(validateFormDefinition(tooManyChoices)).toContainEqual(
      expect.objectContaining({ code: 'invalid_choices' }),
    );

    const tooLargeDefinition: FormQuestion[] = [
      {
        id: 'large',
        sectionId: 'basic',
        type: 'singleChoice',
        required: false,
        choices: Array.from(
          { length: 33 },
          (_, index) => `${'x'.repeat(4_000)}-${index}`,
        ),
      },
    ];
    expect(validateFormDefinition(tooLargeDefinition)).toContainEqual(
      expect.objectContaining({ code: 'definition_too_large' }),
    );

    const maximumWork = Array.from({ length: 60 }, (_, index) => ({
      id: `q${index}`,
      sectionId: `section${Math.floor(index / 20)}`,
      type: 'boolean' as const,
      required: false,
      ...(index > 0 && index <= 25
        ? {
            when: {
              mode: 'all' as const,
              conditions: Array.from({ length: 16 }, () => ({
                questionId: 'q0',
                operator: 'equals' as const,
                value: true,
              })),
            },
          }
        : {}),
    }));
    expect(APPROVED_FORM_BOUNDS.maxEvaluationSteps).toBe(4_000);
    expect(validateFormDefinition(maximumWork)).toEqual([]);
  });
});

describe('restored answer set validation coverage', () => {
  it('enforces the 4,096-byte answer safety limit at 4,096 and 4,097 Arabic bytes', () => {
    const dateQuestion: readonly FormQuestion[] = [
      { id: 'text', sectionId: 'basic', type: 'date', required: false },
    ];
    const valid4096Bytes = 'ا'.repeat(2_048);
    const invalid4097Bytes = `${valid4096Bytes}a`;
    expect(new TextEncoder().encode(valid4096Bytes).length).toBe(4_096);
    expect(new TextEncoder().encode(invalid4097Bytes).length).toBe(4_097);
    expect(
      validateAnswerSet(dateQuestion, { text: valid4096Bytes }).map(
        ({ code }) => code,
      ),
    ).not.toContain('answer_too_long');
    expect(
      validateAnswerSet(dateQuestion, { text: invalid4097Bytes }),
    ).toContainEqual(
      expect.objectContaining({ code: 'answer_too_long', questionId: 'text' }),
    );
  });

  it('accepts valid typed values and allows optional omissions', () => {
    const answers: FormAnswerSet = { consent: false, name: 'Mina' };
    expect(validateAnswerSet(legacyCoverageQuestions, answers)).toEqual([]);
  });

  it('rejects unknown IDs and values that do not match the question type', () => {
    expect(
      validateAnswerSet(legacyCoverageQuestions, {
        consent: 'yes',
        name: 'Mina',
        foreign: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_answer_id',
          questionId: 'foreign',
        }),
        expect.objectContaining({
          code: 'invalid_answer_type',
          questionId: 'consent',
        }),
      ]),
    );
  });

  it('rejects unsafe answer payloads and invalid choice values', () => {
    const questions: readonly FormQuestion[] = [
      { id: 'text', sectionId: 'basic', type: 'date', required: false },
      {
        id: 'goal',
        sectionId: 'basic',
        type: 'singleChoice',
        required: false,
        choices: ['strength', 'mobility'],
      },
    ];
    expect(
      validateAnswerSet(questions, {
        text: 'A'.repeat(4_097),
        goal: 'cardio',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'answer_too_long',
          questionId: 'text',
        }),
        expect.objectContaining({ code: 'invalid_choice', questionId: 'goal' }),
      ]),
    );
  });

  it('rejects answer collections above the byte limit', () => {
    const multiChoice: FormQuestion = {
      id: 'answer',
      sectionId: 'basic',
      type: 'multiChoice',
      required: false,
      choices: ['allowed'],
    };
    const oversizedAnswers = Array.from({ length: 44 }, () =>
      'x'.repeat(6_000),
    );
    const answerSet = { answer: oversizedAnswers };
    expect(measureAnswerPayloadBytes(answerSet)).toBeGreaterThan(
      APPROVED_FORM_BOUNDS.maxPayloadBytes,
    );
    expect(validateAnswerSet([multiChoice], answerSet)).toContainEqual(
      expect.objectContaining({ code: 'payload_too_large' }),
    );
  });
});

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
      validateFormDefinition([question('shortText', { charLimit: 150 })]),
    ).toEqual([]);
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
