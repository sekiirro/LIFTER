import { describe, expect, it } from 'vitest';

import {
  deriveMealTimingOptions,
  evaluateProgression,
  reconcileDerivedChoice,
} from '../../lib/forms/progression';

describe('S14 derived N7 meal timing options', () => {
  it.each([2, 3, 4, 5])(
    'derives 1..N and fixed options for %i meals',
    (count) => {
      expect(deriveMealTimingOptions(count)).toEqual([
        ...Array.from({ length: count }, (_, index) => `meal-${index + 1}`),
        'before-first',
        'no-fixed-time',
      ]);
    },
  );

  it.each([0, 1, 6, 6.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects unsupported meal count %s',
    (count) => {
      expect(deriveMealTimingOptions(count)).toEqual([]);
    },
  );

  it('keeps a valid timing choice and clears one made stale by the parent', () => {
    const allowed = deriveMealTimingOptions(2);
    expect(reconcileDerivedChoice('meal-2', allowed)).toBe('meal-2');
    expect(reconcileDerivedChoice('meal-4', allowed)).toBeUndefined();
  });

  it('keeps budget food chips in the N08 question step', () => {
    const questions = [
      {
        id: 'N08',
        sectionId: 'nutrition',
        type: 'singleChoice' as const,
        required: false,
        choices: ['low', 'medium', 'high'],
      },
      {
        id: 'N08.foods',
        sectionId: 'nutrition',
        type: 'multiChoice' as const,
        required: false,
        choices: ['low:egg', 'medium:chicken', 'high:salmon'],
        when: {
          mode: 'any' as const,
          conditions: [
            { questionId: 'N08', operator: 'equals' as const, value: 'low' },
            {
              questionId: 'N08',
              operator: 'equals' as const,
              value: 'medium',
            },
            { questionId: 'N08', operator: 'equals' as const, value: 'high' },
          ],
        },
      },
      {
        id: 'N09',
        sectionId: 'nutrition',
        type: 'shortText' as const,
        required: false,
      },
    ];
    const progression = evaluateProgression({
      questions,
      answers: { N08: 'medium', 'N08.foods': ['medium:chicken'] },
      currentQuestionId: 'N08',
    });

    expect(progression.errors).toEqual([]);
    expect(progression.applicableQuestionIds).toEqual([
      'N08',
      'N08.foods',
      'N09',
    ]);
    expect(progression.nextQuestionId).toBe('N09');
  });
});
