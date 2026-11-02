import { describe, expect, it } from 'vitest';
import approvedF15Copy from '../fixtures/forms/approved-f15-copy.json';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('S27 approved F15 copy', () => {
  it('matches the approved Arabic and English strings exactly', () => {
    expect(approvedF15Copy).toHaveLength(227);

    for (const row of [
      ...approvedF15Copy,
      {
        key: 'forms.staffQuestionOptional',
        ar: 'اختياري',
        en: 'Optional',
      },
    ]) {
      const key = row.key as keyof typeof ar;
      expect(ar[key], `${row.key} Arabic`).toBe(row.ar);
      expect(en[key], `${row.key} English`).toBe(row.en);
    }
  });
});
