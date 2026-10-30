import { describe, expect, it } from 'vitest';

import {
  calculateAgeInCairo,
  validateAnswerSet,
  validateFormDefinition,
  type FormQuestion,
} from '../../lib/forms/validation';
import { evaluateProgression } from '../../lib/forms/progression';

describe('S14 form definition types and privacy metadata', () => {
  it('requires sex to be a personal-data single choice', () => {
    const sex: FormQuestion = {
      id: 'sex',
      sectionId: 'basic',
      type: 'singleChoice',
      required: true,
      choices: ['male', 'female'],
      privacy: 'personal',
      purpose: 'n12-series',
    };

    expect(validateFormDefinition([sex])).toEqual([]);
    expect(
      evaluateProgression({ questions: [sex], answers: {} })
        .missingRequiredQuestionIds,
    ).toEqual(['sex']);
    expect(validateAnswerSet([sex], { sex: 'male-cinematic' })).toContainEqual({
      code: 'invalid_choice',
      questionId: 'sex',
    });
    expect(
      validateFormDefinition([{ ...sex, required: false }]),
    ).toContainEqual({
      code: 'invalid_n12_series_selector',
      questionId: 'sex',
    });
  });

  it('supports display-only notices without answer or consent fields', () => {
    const notice = {
      id: 'health-notice',
      sectionId: 'basic',
      type: 'displayOnly',
      required: false,
      displayText: { en: 'Health notice', ar: 'إشعار صحي' },
    } as unknown as FormQuestion;

    expect(validateFormDefinition([notice])).toEqual([]);
    expect(
      validateFormDefinition([{ ...notice, required: true }]),
    ).toContainEqual({
      code: 'invalid_display_only_question',
      questionId: 'health-notice',
    });
    expect(validateAnswerSet([notice], {})).toEqual([]);
    expect(
      validateAnswerSet([notice], { 'health-notice': true }),
    ).toContainEqual(expect.objectContaining({ code: 'invalid_answer_type' }));
  });

  it('keeps profile-bound values read-only and calculates age on Cairo date', () => {
    const fields: FormQuestion[] = [
      {
        id: 'full-name',
        sectionId: 'basic',
        type: 'profileText',
        required: false,
        profileField: 'fullName',
      },
      {
        id: 'age',
        sectionId: 'basic',
        type: 'computedAge',
        required: false,
        dateOfBirthField: 'dateOfBirth',
      },
    ];
    expect(validateFormDefinition(fields)).toEqual([]);
    expect(validateAnswerSet(fields, {})).toEqual([]);
    expect(validateAnswerSet(fields, { age: 34 })).toContainEqual(
      expect.objectContaining({
        code: 'invalid_answer_type',
        questionId: 'age',
      }),
    );
    expect(
      calculateAgeInCairo('2000-10-30', new Date('2026-10-29T22:30:00.000Z')),
    ).toBe(26);
    expect(
      calculateAgeInCairo('2000-10-31', new Date('2026-10-29T22:30:00.000Z')),
    ).toBe(25);
    expect(
      calculateAgeInCairo('2027-01-01', new Date('2026-10-30T12:00:00.000Z')),
    ).toBeNull();
  });

  it('supports bounded slider and image choice schemas', () => {
    const questions: FormQuestion[] = [
      {
        id: 'hunger',
        sectionId: 'nutrition',
        type: 'slider',
        required: true,
        validation: { min: 0, max: 10, step: 1 },
        labels: { minimum: 'Low', middle: 'Medium', maximum: 'High' },
        feedbackBands: [
          { min: 0, max: 2, text: 'Low hunger' },
          { min: 3, max: 10, text: 'Hunger' },
        ],
      } as FormQuestion,
      {
        id: 'body-fat',
        sectionId: 'nutrition',
        type: 'imageChoice',
        required: true,
        choices: ['male-10', 'male-15'],
        assetReferences: [
          '/images/body-fat/male-10.webp',
          '/images/body-fat/male-15.webp',
        ],
      } as FormQuestion,
    ];

    expect(validateFormDefinition(questions)).toEqual([]);
    expect(
      validateAnswerSet(questions, { hunger: 5, 'body-fat': 'male-15' }),
    ).toEqual([]);
    expect(
      validateAnswerSet(questions, { hunger: 5.5, 'body-fat': 'male-15' }),
    ).toContainEqual(
      expect.objectContaining({
        code: 'number_out_of_range',
        questionId: 'hunger',
      }),
    );
    expect(
      validateFormDefinition([
        {
          ...questions[0]!,
          feedbackBands: [{ min: -1, max: 10, text: 'unsafe' }],
        },
      ]),
    ).toContainEqual({
      code: 'invalid_slider_configuration',
      questionId: 'hunger',
    });
    expect(
      validateFormDefinition([
        {
          ...questions[1]!,
          assetReferences: [
            'https://example.test/../x',
            '/images/body-fat/male-15.webp',
          ],
        },
      ]),
    ).toContainEqual({
      code: 'invalid_image_choice_assets',
      questionId: 'body-fat',
    });
  });

  it('constrains N7 to the approved meal counts and derived child', () => {
    const questions: FormQuestion[] = [
      {
        id: 'N07.meal_count',
        sectionId: 'nutrition',
        type: 'mealCount',
        required: true,
        choices: ['2', '3', '4', '5'],
      },
      {
        id: 'N07.training_timing',
        sectionId: 'nutrition',
        type: 'derivedChoice',
        required: true,
        choices: ['meal-1', 'meal-2', 'before-first', 'no-fixed-time'],
        derivedOptions: {
          sourceQuestionId: 'N07.meal_count',
          fixedChoices: ['before-first', 'no-fixed-time'],
        },
        when: {
          mode: 'all',
          conditions: [
            { questionId: 'N07.meal_count', operator: 'isAnswered' },
          ],
        },
      },
    ];

    expect(validateFormDefinition(questions)).toEqual([]);
    expect(
      validateAnswerSet(questions, { 'N07.meal_count': '6' }),
    ).toContainEqual({
      code: 'invalid_choice',
      questionId: 'N07.meal_count',
    });
    expect(
      validateFormDefinition([
        { ...questions[0]!, choices: ['2', '3', '4', '5', '6'] },
      ]),
    ).toContainEqual({
      code: 'invalid_meal_count_range',
      questionId: 'N07.meal_count',
    });
  });

  it('validates branches that depend on nested conditional answers', () => {
    const questions: FormQuestion[] = [
      {
        id: 'has-condition',
        sectionId: 'basic',
        type: 'boolean',
        required: true,
      },
      {
        id: 'condition-detail',
        sectionId: 'basic',
        type: 'shortText',
        required: true,
        when: {
          mode: 'all',
          conditions: [
            { questionId: 'has-condition', operator: 'equals', value: true },
          ],
        },
      },
      {
        id: 'detail-followup',
        sectionId: 'basic',
        type: 'singleChoice',
        required: true,
        choices: ['yes', 'no'],
        when: {
          mode: 'all',
          conditions: [
            { questionId: 'condition-detail', operator: 'isAnswered' },
          ],
        },
      },
    ];

    expect(validateFormDefinition(questions)).toEqual([]);
    expect(
      evaluateProgression({ questions, answers: { 'has-condition': false } })
        .applicableQuestionIds,
    ).toEqual(['has-condition']);
    expect(
      evaluateProgression({ questions, answers: { 'has-condition': true } })
        .missingRequiredQuestionIds,
    ).toEqual(['condition-detail']);
    expect(
      evaluateProgression({
        questions,
        answers: { 'has-condition': true, 'condition-detail': 'details' },
      }).missingRequiredQuestionIds,
    ).toEqual(['detail-followup']);
  });
});
