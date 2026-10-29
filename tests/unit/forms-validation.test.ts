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
  it('accepts typed acyclic definitions with known references', () => {
    expect(validateFormDefinition(questions)).toEqual([]);
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
