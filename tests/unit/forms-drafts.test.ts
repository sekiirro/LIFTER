import { describe, expect, it } from 'vitest';
import { validateDraftAnswers } from '../../lib/forms/drafts';

const snapshot = {
  questions: [
    {
      id: 'short',
      sectionId: 'basic',
      type: 'shortText',
      required: false,
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
});
