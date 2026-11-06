import { describe, expect, it } from 'vitest';
import starter from '../../lib/forms/s14-starter-content.json';
import { getN11Feedback } from '../../lib/forms/n11-feedback';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

const approvedEnglish = [
  {
    min: 0,
    max: 2,
    key: 'forms.intake.n11.feedback.0_2',
    text: 'Very little hunger',
  },
  { min: 3, max: 4, key: 'forms.intake.n11.feedback.3_4', text: 'Mild hunger' },
  {
    min: 5,
    max: 6,
    key: 'forms.intake.n11.feedback.5_6',
    text: 'Moderate hunger',
  },
  { min: 7, max: 8, key: 'forms.intake.n11.feedback.7_8', text: 'High hunger' },
  {
    min: 9,
    max: 10,
    key: 'forms.intake.n11.feedback.9_10',
    text: 'Very strong hunger',
  },
] as const;

describe('N11 approved hunger feedback', () => {
  it('keeps exact PO-approved English strings in the EN catalog', () => {
    for (const band of approvedEnglish) {
      expect(en[band.key]).toBe(band.text);
    }
  });

  it.each([
    [0, 'Very little hunger'],
    [1, 'Very little hunger'],
    [2, 'Very little hunger'],
    [3, 'Mild hunger'],
    [4, 'Mild hunger'],
    [5, 'Moderate hunger'],
    [6, 'Moderate hunger'],
    [7, 'High hunger'],
    [8, 'High hunger'],
    [9, 'Very strong hunger'],
    [10, 'Very strong hunger'],
  ])('maps score %i to its inclusive approved band', (score, expected) => {
    expect(getN11Feedback(score, 'en')).toBe(expected);
  });

  it('preserves the current approved Arabic feedback in the AR catalog', () => {
    const question = starter.questions.find(({ id }) => id === 'N11');
    expect(question).toBeTruthy();
    expect(question?.feedbackBands).toBeTruthy();
    for (const [index, band] of question!.feedbackBands!.entries()) {
      const approvedBand = approvedEnglish[index]!;
      expect(ar[approvedBand.key]).toBe(band.text);
      expect(getN11Feedback(band.min, 'ar')).toBe(band.text);
    }
  });

  it.each([-1, 11, 1.5, Number.NaN])(
    'returns no feedback for invalid score %s',
    (score) => {
      expect(getN11Feedback(score, 'en')).toBeNull();
    },
  );
});
