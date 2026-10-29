import { describe, expect, it } from 'vitest';

import {
  validateAnswerSet,
  validateFormDefinition,
  type FormAnswerSet,
  type FormQuestion,
} from '../../lib/forms/validation';

const questions: readonly FormQuestion[] = [
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

describe('validateFormDefinition', () => {
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
    expect(validateFormDefinition(questions)).toEqual([]);
  });

  it('applies UTF-8 byte bounds to choice labels and condition values', () => {
    const valid4096Bytes = 'ا'.repeat(2_048);
    const invalid4097Bytes = `${valid4096Bytes}a`;
    const choiceDefinition = (choice: string) => [
      {
        id: 'choice',
        sectionId: 'basic',
        type: 'singleChoice' as const,
        required: false,
        choices: [choice],
      },
    ];
    const conditionDefinition = (value: string) => [
      {
        id: 'source',
        sectionId: 'basic',
        type: 'shortText' as const,
        required: false,
      },
      {
        id: 'branch',
        sectionId: 'basic',
        type: 'boolean' as const,
        required: false,
        when: {
          mode: 'all' as const,
          conditions: [
            { questionId: 'source', operator: 'equals' as const, value },
          ],
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
        ...questions[0],
        type: 'script' as FormQuestion['type'],
      },
      {
        ...questions[1],
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
    const tooMany = Array.from({ length: 201 }, (_, index) => ({
      id: `q${index}`,
      sectionId: 'basic',
      type: 'shortText' as const,
      required: false,
    }));
    expect(validateFormDefinition(tooMany)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'too_many_questions' }),
      ]),
    );

    const tooLarge = [
      {
        id: 'choices',
        sectionId: 'basic',
        type: 'singleChoice' as const,
        required: false,
        choices: Array.from(
          { length: 40 },
          (_, index) => `${'x'.repeat(4_088)}${index}`,
        ),
      },
    ];
    expect(validateFormDefinition(tooLarge)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'definition_too_large' }),
      ]),
    );
  });
});

describe('validateAnswerSet', () => {
  const textQuestion: readonly FormQuestion[] = [
    { id: 'text', sectionId: 'basic', type: 'longText', required: false },
  ];

  it('counts Arabic text limits in UTF-8 bytes at 4,096 and 4,097 bytes', () => {
    const valid4096Bytes = 'ا'.repeat(2_048);
    const invalid4097Bytes = `${valid4096Bytes}a`;
    expect(new TextEncoder().encode(valid4096Bytes).length).toBe(4_096);
    expect(new TextEncoder().encode(invalid4097Bytes).length).toBe(4_097);
    expect(validateAnswerSet(textQuestion, { text: valid4096Bytes })).toEqual(
      [],
    );
    expect(validateAnswerSet(textQuestion, { text: invalid4097Bytes })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'answer_too_long',
          questionId: 'text',
        }),
      ]),
    );
  });

  it('accepts valid typed values and allows optional omissions', () => {
    const answers: FormAnswerSet = { consent: false, name: 'Mina' };
    expect(validateAnswerSet(questions, answers)).toEqual([]);
  });

  it('rejects unknown IDs and values that do not match the question type', () => {
    expect(
      validateAnswerSet(questions, {
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
    expect(
      validateAnswerSet(questions, {
        consent: true,
        name: 'A'.repeat(41),
        goal: 'cardio',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'answer_too_long',
          questionId: 'name',
        }),
        expect.objectContaining({ code: 'invalid_choice', questionId: 'goal' }),
      ]),
    );
  });

  it('rejects answer collections above the byte limit', () => {
    expect(validateAnswerSet(questions, { name: 'x'.repeat(17_000) })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'payload_too_large' }),
      ]),
    );
  });
});
