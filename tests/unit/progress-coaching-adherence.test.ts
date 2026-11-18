import { describe, expect, it } from 'vitest';
import {
  adherenceQuestionTemplates,
  isValidCheckInDefinition,
  measurementQuestionIds,
} from '../../lib/progress-coaching/adherence';
import { validateFormDefinition } from '../../lib/forms/validation';
import { en } from '../../lib/i18n/messages/en';

describe('weekly check-in adherence questions (FR-037, FR-038, SC-011)', () => {
  it('uses the F15 0-10 integer scale and the approved neutral copy', () => {
    const [workout, diet] = adherenceQuestionTemplates('checkin', false);
    expect(workout).toMatchObject({
      id: 'workoutAdherence',
      type: 'number',
      validation: { min: 0, max: 10, step: 1 },
      label: {
        en: 'On a scale from 0 to 10, how closely did you follow your workout plan this week?',
      },
    });
    expect(diet!.id).toBe('dietAdherence');
    expect(diet!.label.ar).toBe(
      'من 0 لـ 10، شايف إنك التزمت بالدايت قد إيه الأسبوع ده؟',
    );
  });

  it('produces F15-valid question definitions once presentation keys are separated', () => {
    const questions = adherenceQuestionTemplates('checkin', true).map(
      (question) => {
        const data: Record<string, unknown> = { ...question };
        delete data.label;
        return data;
      },
    );
    expect(validateFormDefinition(questions)).toEqual([]);
  });

  it('never exposes scoring mechanics in client-facing check-in copy (FR-038)', () => {
    const copy = [
      en['checkin.adherence.workout.title'],
      en['checkin.adherence.workout.question'],
      en['checkin.adherence.diet.title'],
      en['checkin.adherence.diet.question'],
    ].join(' ');
    expect(copy).not.toMatch(/leaderboard|rank|score|points/i);
  });

  it('validates check-in definitions like the database guard', () => {
    const questions = adherenceQuestionTemplates('checkin', false);
    expect(isValidCheckInDefinition({ questions })).toBe(true);
    expect(isValidCheckInDefinition({ questions: [questions[0]] })).toBe(false);
    expect(
      isValidCheckInDefinition({
        questions: [
          questions[0],
          { ...questions[1], validation: { min: 1, max: 10, step: 1 } },
        ],
      }),
    ).toBe(false);
    expect(
      isValidCheckInDefinition({
        questions: [questions[0], { ...questions[1], type: 'slider' }],
      }),
    ).toBe(true);
    expect(isValidCheckInDefinition(null)).toBe(false);
  });

  it('derives measurement types from numeric questions with a unit (FR-014)', () => {
    expect(
      measurementQuestionIds({
        questions: [
          ...adherenceQuestionTemplates('checkin', false),
          { id: 'bodyWeight', type: 'number', unit: { en: 'kg', ar: 'كجم' } },
          { id: 'waist', type: 'slider', unit: { en: 'cm', ar: 'سم' } },
          { id: 'mood', type: 'number' },
          { id: 'notes', type: 'longText', unit: { en: 'x', ar: 'x' } },
        ],
      }),
    ).toEqual(['bodyWeight', 'waist']);
  });
});
