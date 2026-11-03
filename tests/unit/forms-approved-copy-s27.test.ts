import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import approvedF15Copy from '../fixtures/forms/approved-f15-copy.json';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

describe('S27 approved F15 copy', () => {
  it('matches the approved Arabic and English strings exactly', () => {
    expect(approvedF15Copy).toHaveLength(227);
    expect(
      approvedF15Copy.find((row) => row.key === 'forms.staffResult.invalid')
        ?.ar,
    ).toBe(
      '\u0623\u0636\u0641\u0020\u0627\u0633\u0645\u064B\u0627\u0020\u0639\u0631\u0628\u064A\u064B\u0627\u0020\u0648\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u064B\u0627\u0020\u0644\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629\u0020\u0648\u0642\u0633\u0645\u064B\u0627\u0020\u0648\u0633\u0624\u0627\u0644\u064B\u0627\u0020\u0642\u0628\u0644\u0020\u0627\u0644\u0646\u0634\u0631\u002E',
    );

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

  it('pins PO S30-PO-1 Q2 Terms and B06 sex labels byte-for-byte', () => {
    const approvedTerms = {
      'forms.termsCardTitle': {
        ar: '\u0627\u0644\u0634\u0631\u0648\u0637\u0020\u0648\u0627\u0644\u0623\u062D\u0643\u0627\u0645',
        en: 'Terms and conditions',
      },
      'forms.requiredTerms': {
        ar: '\u0623\u0648\u0627\u0641\u0642\u0020\u0639\u0644\u0649\u0020\u0627\u0644\u0634\u0631\u0648\u0637\u0020\u0648\u0627\u0644\u0623\u062D\u0643\u0627\u0645',
        en: 'I accept the terms and conditions',
      },
      'forms.optionalMarketing': {
        ar: '\u0623\u0648\u0627\u0641\u0642\u0020\u0639\u0644\u0649\u0020\u062A\u0644\u0642\u064A\u0020\u062A\u062D\u062F\u064A\u062B\u0627\u062A\u0020\u062A\u0633\u0648\u064A\u0642\u064A\u0629',
        en: 'I agree to receive marketing updates',
      },
      'forms.acceptTerms': {
        ar: '\u0645\u062A\u0627\u0628\u0639\u0629',
        en: 'Continue',
      },
    } as const;
    const approvedSex = {
      ar: {
        question: '\u0627\u0644\u0646\u0648\u0639',
        male: '\u0630\u0643\u0631',
        female: '\u0623\u0646\u062B\u0649',
      },
      en: { question: 'Sex', male: 'Male', female: 'Female' },
    } as const;
    const assertPinnedTerms = (messages: typeof en) => {
      for (const [key, copy] of Object.entries(approvedTerms)) {
        expect(ar[key as keyof typeof ar]).toBe(copy.ar);
        expect(messages[key as keyof typeof en]).toBe(copy.en);
      }
    };
    const assertPinnedSex = (value: typeof approvedSex) => {
      expect(value.ar).toEqual(approvedSex.ar);
      expect(value.en).toEqual(approvedSex.en);
    };

    assertPinnedTerms(en);
    const decisions = JSON.parse(
      readFileSync(
        'specs/015-forms-intake/fixtures/s14-po-decisions.json',
        'utf8',
      ),
    ) as { P1_sex: typeof approvedSex };
    assertPinnedSex(decisions.P1_sex);

    const mutated = {
      ...en,
      'forms.acceptTerms': `${en['forms.acceptTerms']}!`,
    } as typeof en;
    expect(() => assertPinnedTerms(mutated)).toThrow();
    const mutatedSex = {
      ...decisions.P1_sex,
      en: { ...decisions.P1_sex.en, female: 'Woman' },
    } as unknown as typeof approvedSex;
    expect(() => assertPinnedSex(mutatedSex)).toThrow();
  });
});
