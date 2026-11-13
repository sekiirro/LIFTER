import { describe, expect, it } from 'vitest';
import { applicableClientAnswers } from '../../lib/forms/client-answer-state';
import type { FormQuestion } from '../../lib/forms/validation';

describe('client answer applicability', () => {
  it('removes render-only labels before evaluating conditional questions', () => {
    const questions = [
      {
        id: 'has-goal',
        sectionId: 'basic',
        type: 'boolean',
        required: true,
        label: { en: 'Has goal', ar: 'لديه هدف' },
      },
      {
        id: 'goal-detail',
        sectionId: 'basic',
        type: 'shortText',
        required: true,
        label: { en: 'Goal detail', ar: 'تفاصيل الهدف' },
        when: {
          mode: 'all',
          conditions: [
            { questionId: 'has-goal', operator: 'equals', value: true },
          ],
        },
      },
    ] as unknown as readonly FormQuestion[];

    expect(
      applicableClientAnswers(questions, {
        'has-goal': false,
        'goal-detail': 'stale answer',
      }),
    ).toEqual({ 'has-goal': false });
  });
});
