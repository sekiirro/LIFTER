import { describe, expect, it } from 'vitest';
import { validateCorrectionRequest } from '../../lib/forms/corrections';

const snapshot = {
  questions: [
    {
      id: 'q1',
      sectionId: 'basic',
      type: 'shortText',
      required: false,
    },
  ],
};

describe('T014 correction request validation', () => {
  it('accepts a bounded answer set and an opaque replay key', () => {
    expect(
      validateCorrectionRequest(snapshot, {
        expected_revision: 1,
        intent_key: 'fced6ad3-4d4d-4eb1-a9d2-7770cd7ee08c',
        answer_values: { q1: 'updated' },
        correction_note: 'synthetic note',
      }),
    ).toMatchObject({
      ok: true,
      expectedRevision: 1,
      answerValues: { q1: 'updated' },
    });
  });

  it('accepts the correction note code-point bound and rejects overflow before write', () => {
    const base = {
      expected_revision: 1,
      intent_key: 'fced6ad3-4d4d-4eb1-a9d2-7770cd7ee08c',
      answer_values: { q1: 'updated' },
    };
    expect(
      validateCorrectionRequest(snapshot, {
        ...base,
        correction_note: '😀'.repeat(1_000),
      }).ok,
    ).toBe(true);
    expect(
      validateCorrectionRequest(snapshot, {
        ...base,
        correction_note: 'x'.repeat(1_001),
      }),
    ).toEqual({ ok: false, code: 'answer_too_long' });
    expect(
      validateCorrectionRequest(snapshot, {
        ...base,
        correction_note: '😀'.repeat(1_025),
      }),
    ).toEqual({ ok: false, code: 'answer_too_long' });
  });

  it.each([
    {
      expected_revision: 0,
      intent_key: 'fced6ad3-4d4d-4eb1-a9d2-7770cd7ee08c',
      answer_values: { q1: 'x' },
      correction_note: 'note',
    },
    {
      expected_revision: 1,
      intent_key: 'bad-key',
      answer_values: { q1: 'x' },
      correction_note: 'note',
    },
    {
      expected_revision: 1,
      intent_key: 'fced6ad3-4d4d-4eb1-a9d2-7770cd7ee08c',
      answer_values: { q1: 'x' },
      correction_note: 4,
    },
  ])('rejects malformed correction metadata %#', (body) => {
    expect(validateCorrectionRequest(snapshot, body).ok).toBe(false);
  });
});
