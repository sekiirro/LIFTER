import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateCorrectionRequest } from '../../lib/forms/corrections';

const snapshot = {
  questions: [
    {
      id: 'q1',
      sectionId: 'basic',
      type: 'shortText',
      required: false,
    },
    {
      id: 'requiredQ',
      sectionId: 'basic',
      type: 'shortText',
      required: true,
    },
    {
      id: 'hiddenQ',
      sectionId: 'basic',
      type: 'shortText',
      required: false,
      when: {
        mode: 'all',
        conditions: [{ questionId: 'q1', operator: 'equals', value: 'show' }],
      },
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

describe('S50 explicit correction removals', () => {
  const base = {
    expected_revision: 1,
    intent_key: 'fced6ad3-4d4d-4eb1-a9d2-7770cd7ee08c',
    answer_values: {},
    correction_note: 'synthetic note',
  };

  it('accepts an omitted remove list as no removals and validates known unique IDs', () => {
    expect(validateCorrectionRequest(snapshot, base)).toMatchObject({
      ok: true,
      remove: [],
    });
    expect(
      validateCorrectionRequest(snapshot, { ...base, remove: [] }),
    ).toMatchObject({ ok: true, remove: [] });
    expect(
      validateCorrectionRequest(snapshot, {
        ...base,
        remove: ['q1', 'hiddenQ'],
      }),
    ).toMatchObject({ ok: true, remove: ['q1', 'hiddenQ'] });
  });

  it.each([
    ['null list', null],
    ['non-array', 'q1'],
    ['non-string', [1]],
    ['unknown id', ['missing']],
    ['duplicate id', ['q1', 'q1']],
    ['over snapshot count', ['q1', 'requiredQ', 'hiddenQ', 'fourth']],
    ['invalid id format', ['bad id']],
    ['supplied and removed conflict', ['q1']],
  ])('rejects %s removal input', (label, remove) => {
    const request =
      label === 'supplied and removed conflict'
        ? { ...base, answer_values: { q1: 'changed' }, remove }
        : { ...base, remove };
    expect(validateCorrectionRequest(snapshot, request)).toEqual({
      ok: false,
      code: 'invalid',
    });
  });

  it('applies the complete canonical request byte cap including note and removal fields', () => {
    const result = validateCorrectionRequest(snapshot, {
      ...base,
      answer_values: { q1: 'x'.repeat(261_200) },
      remove: ['hiddenQ'],
      correction_note: 'n'.repeat(1_000),
    });
    expect(result).toEqual({ ok: false, code: 'payload_too_large' });
  });

  it('keeps the RPC explicit remove-count bound against the snapshot question count', () => {
    const rpcMigration = readFileSync(
      new URL(
        '../../supabase/migrations/20261112031800_f15_explicit_correction_removals.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(rpcMigration).toContain(
      "jsonb_array_length(p_remove) > jsonb_array_length(coalesce(snapshot->'questions','[]'::jsonb))",
    );
    expect(rpcMigration).toContain(
      "jsonb_typeof(x.value) is distinct from 'string'",
    );
    expect(rpcMigration).toContain(
      "(x.value #>> '{}') !~ '^[A-Za-z0-9_.-]{1,64}$'",
    );
    expect(rpcMigration).toContain(
      "language plpgsql security definer set search_path = ''",
    );
    expect(rpcMigration).toContain(
      'alter function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text,jsonb) owner to postgres;',
    );
    expect(rpcMigration).toContain(
      'grant execute on function public.correct_form_answer(uuid,uuid,integer,uuid,jsonb,text,jsonb) to authenticated;',
    );
  });
});
