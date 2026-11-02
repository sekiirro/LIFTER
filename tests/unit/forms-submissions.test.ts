import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateFormSubmission } from '../../lib/forms/submissions';

const snapshot = {
  questions: [
    { id: 'b', sectionId: 'basic', type: 'shortText', required: true },
    { id: 't', sectionId: 'training', type: 'shortText', required: true },
    { id: 'n', sectionId: 'nutrition', type: 'shortText', required: true },
    {
      id: 'conditional',
      sectionId: 'training',
      type: 'shortText',
      required: true,
      when: {
        mode: 'all',
        conditions: [{ questionId: 'b', operator: 'equals', value: 'yes' }],
      },
    },
  ],
};

describe('T013 submission validation', () => {
  it('allows only complete applicable answers across all substantive sections', () => {
    expect(
      validateFormSubmission(snapshot, {
        b: 'no',
        t: 'training',
        n: 'nutrition',
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateFormSubmission(snapshot, {
        b: 'yes',
        t: 'training',
        n: 'nutrition',
      }),
    ).toEqual({ ok: false, code: 'incomplete' });
    expect(
      validateFormSubmission(snapshot, { b: 'no', t: 'training', n: '' }),
    ).toEqual({ ok: false, code: 'incomplete' });
  });

  it('keeps invalid answer and size failures on the public allow-list', () => {
    expect(
      validateFormSubmission(snapshot, {
        b: 'x'.repeat(151),
        t: 'training',
        n: 'nutrition',
      }),
    ).toEqual({ ok: false, code: 'answer_too_long' });
    expect(validateFormSubmission(snapshot, {})).toEqual({
      ok: false,
      code: 'incomplete',
    });
  });

  it('validates every submission and correction write before the RPC and never reflects provider errors', () => {
    const routes = [
      {
        path: 'app/api/forms/assignments/[assignmentId]/submit/route.ts',
        validator: 'validateFormSubmission(',
        rpc: "client.rpc('submit_form_assignment'",
      },
      {
        path: 'app/api/forms/assignments/[assignmentId]/corrections/route.ts',
        validator: 'validateCorrectionRequest(',
        rpc: "client.rpc('correct_form_answer'",
      },
    ];
    for (const { path, validator, rpc } of routes) {
      const route = readFileSync(path, 'utf8');
      expect(route).toContain(validator);
      expect(route.indexOf(rpc)).toBeGreaterThan(route.indexOf(validator));
      expect(route).toContain('status: valid.code');
      expect(route).toContain("response({ status: 'unavailable' }, 503)");
      expect(route).not.toMatch(/error\.message|JSON\.stringify\(error\)/);
    }
  });
});
