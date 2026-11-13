import { describe, expect, it } from 'vitest';

import {
  evaluateProgression,
  type ProgressionQuestion,
} from '../../lib/forms/progression';
import type { FormAnswerSet } from '../../lib/forms/validation';

const questions: readonly ProgressionQuestion[] = [
  { id: 'has-injury', sectionId: 'basic', type: 'boolean', required: true },
  {
    id: 'injury-detail',
    sectionId: 'basic',
    type: 'shortText',
    required: true,
    when: {
      mode: 'all',
      conditions: [
        { questionId: 'has-injury', operator: 'equals', value: true },
      ],
    },
  },
  {
    id: 'training-goal',
    sectionId: 'workout',
    type: 'shortText',
    required: true,
  },
];

describe('evaluateProgression', () => {
  it('returns one applicable question at a time and then deterministic neighbors', () => {
    const first = evaluateProgression({ questions, answers: {} });
    expect(first.currentQuestion?.id).toBe('has-injury');
    expect(first.nextQuestionId).toBe('training-goal');
    expect(first.applicableQuestionIds).toEqual([
      'has-injury',
      'training-goal',
    ]);

    const second = evaluateProgression({
      questions,
      answers: { 'has-injury': true },
      currentQuestionId: 'training-goal',
    });
    expect(second.currentQuestion?.id).toBe('training-goal');
    expect(second.previousQuestionId).toBe('injury-detail');
  });

  it('supports backward review of any currently applicable question', () => {
    const result = evaluateProgression({
      questions,
      answers: { 'has-injury': true, 'injury-detail': 'old shoulder injury' },
      currentQuestionId: 'has-injury',
    });
    expect(result.currentQuestion?.id).toBe('has-injury');
    expect(result.nextQuestionId).toBe('injury-detail');
    expect(result.previousQuestionId).toBeNull();
  });

  it('recomputes applicability after a branch change without changing hidden answers', () => {
    const answers: FormAnswerSet = {
      'has-injury': false,
      'injury-detail': '  keep these bytes exactly  ',
      'training-goal': 'strength',
    };
    const result = evaluateProgression({
      questions,
      answers,
      currentQuestionId: 'injury-detail',
    });

    expect(result.answers).toBe(answers);
    expect(result.answers['injury-detail']).toBe(
      '  keep these bytes exactly  ',
    );
    expect(result.applicableQuestionIds).toEqual([
      'has-injury',
      'training-goal',
    ]);
    expect(result.applicableQuestionIds).not.toContain('injury-detail');
    expect(result.currentQuestion?.id).not.toBe('injury-detail');
  });

  it('does not let a hidden required answer satisfy requiredness', () => {
    const result = evaluateProgression({
      questions,
      answers: { 'has-injury': false, 'injury-detail': 'old answer' },
    });
    expect(result.missingRequiredQuestionIds).toEqual(['training-goal']);
    expect(result.complete).toBe(false);
  });

  it('recomputes deterministically for identical inputs', () => {
    const input = { questions, answers: { 'has-injury': true } };
    expect(evaluateProgression(input)).toEqual(evaluateProgression(input));
  });

  it('evaluates dependencies even when the referenced question appears later', () => {
    const reverseOrderedQuestions = [
      questions[1]!,
      questions[0]!,
      questions[2]!,
    ];
    const result = evaluateProgression({
      questions: reverseOrderedQuestions,
      answers: { 'has-injury': true },
    });
    expect(result.applicableQuestionIds).toEqual([
      'injury-detail',
      'has-injury',
      'training-goal',
    ]);
  });

  it('rejects cyclic rules and unknown answer IDs before presenting a question', () => {
    const cyclic: ProgressionQuestion[] = [
      {
        id: 'has-injury',
        sectionId: 'basic',
        type: 'boolean',
        required: true,
        when: {
          mode: 'all' as const,
          conditions: [
            {
              questionId: 'injury-detail',
              operator: 'equals' as const,
              value: 'yes',
            },
          ],
        },
      },
      ...questions.slice(1),
    ];
    const cycleResult = evaluateProgression({ questions: cyclic, answers: {} });
    expect(cycleResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'cyclic_applicability' }),
      ]),
    );
    expect(cycleResult.currentQuestion).toBeNull();

    const unknownResult = evaluateProgression({
      questions,
      answers: { 'unknown-question': true },
    });
    expect(unknownResult.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_answer_id' }),
      ]),
    );
    expect(unknownResult.currentQuestion).toBeNull();
  });
});
