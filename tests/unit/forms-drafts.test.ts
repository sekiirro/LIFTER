import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateDraftAnswers } from '../../lib/forms/drafts';

const snapshot = {
  questions: [
    {
      id: 'short',
      sectionId: 'basic',
      type: 'shortText',
      required: false,
      title: { en: 'Short answer', ar: 'إجابة قصيرة' },
      description: { en: 'Optional copy', ar: 'نسخة اختيارية' },
    },
    {
      id: 'long',
      sectionId: 'basic',
      type: 'longText',
      required: false,
    },
  ],
};

describe('T012 server draft validation', () => {
  it('ignores localized labels retained on persisted Builder snapshots', () => {
    expect(
      validateDraftAnswers(
        {
          questions: [
            {
              id: 'labeled',
              sectionId: 'basic',
              type: 'shortText',
              required: false,
              label: { en: 'Goal', ar: 'الهدف' },
            },
          ],
        },
        { labeled: 'Strength' },
      ),
    ).toEqual({ ok: true, answerValues: { labeled: 'Strength' } });
  });

  it('allows partial draft sets and applies the snapshot text bounds', () => {
    expect(validateDraftAnswers(snapshot, { short: 'partial' })).toEqual({
      ok: true,
      answerValues: { short: 'partial' },
    });
    expect(validateDraftAnswers(snapshot, { short: 'x'.repeat(151) })).toEqual({
      ok: false,
      code: 'answer_too_long',
    });
  });

  it('reports payload overflow by the allowed safe code and conceals schema errors', () => {
    expect(
      validateDraftAnswers(snapshot, { unknown: 'x'.repeat(262_145) }),
    ).toEqual({ ok: false, code: 'payload_too_large' });
    expect(validateDraftAnswers(snapshot, { unknown: 'x' })).toEqual({
      ok: false,
      code: 'invalid',
    });
  });

  it('keeps the answer route validator before the draft write and safe on network errors', () => {
    const route = readFileSync(
      'app/api/forms/assignments/[assignmentId]/draft/route.ts',
      'utf8',
    );
    const validatorIndex = route.indexOf('validateDraftAnswers(');
    const writeIndex = route.indexOf("client.rpc('save_form_draft'");
    expect(validatorIndex).toBeGreaterThanOrEqual(0);
    expect(writeIndex).toBeGreaterThan(validatorIndex);
    expect(route).toContain('status: valid.code');
    expect(route).toContain("response({ status: 'unavailable' }, 503)");
    expect(route).not.toMatch(/error\.message|JSON\.stringify\(error\)/);

    const bypassMutant = route.replace(
      'validateDraftAnswers(',
      'skipDraftValidation(',
    );
    const mutantValidatorIndex = bypassMutant.indexOf('validateDraftAnswers(');
    expect(mutantValidatorIndex).toBe(-1);
    expect(mutantValidatorIndex).not.toBeGreaterThanOrEqual(0);
  });
});
