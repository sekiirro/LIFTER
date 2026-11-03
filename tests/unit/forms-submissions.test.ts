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
  it('accepts complete applicable answers without imposing section identifiers', () => {
    expect(
      validateFormSubmission(
        {
          questions: [
            { id: 'name', sectionId: 'identity', type: 'shortText', required: true },
            { id: 'goal', sectionId: 'goals', type: 'shortText', required: true },
          ],
        },
        { name: 'Lina', goal: 'Strength' },
      ),
    ).toMatchObject({ ok: true });
  });

  it('allows only complete applicable required answers', () => {
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

  it('validates immutable snapshots after removing localized render copy', () => {
    const localizedSnapshot = {
      questions: snapshot.questions.map((question) => ({
        ...question,
        title: { en: 'Question', ar: 'سؤال' },
        description: { en: 'Help text', ar: 'مساعدة' },
      })),
    };
    expect(
      validateFormSubmission(localizedSnapshot, {
        b: 'basic',
        t: 'training',
        n: 'nutrition',
      }),
    ).toMatchObject({ ok: true });
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

  it('kills route-validator bypass and raw-provider-error mutants', () => {
    const submitPath =
      'app/api/forms/assignments/[assignmentId]/submit/route.ts';
    const correctionPath =
      'app/api/forms/assignments/[assignmentId]/corrections/route.ts';
    const submitRoute = readFileSync(submitPath, 'utf8');
    const correctionRoute = readFileSync(correctionPath, 'utf8');
    const assertValidatorPresent = (source: string, marker: string) => {
      expect(source).toContain(marker);
      expect(source).not.toMatch(/error\.message|JSON\.stringify\(error\)/);
    };

    const bypassed = submitRoute.replace(
      'validateFormSubmission(',
      'skipSubmissionValidation(',
    );
    expect(() =>
      assertValidatorPresent(bypassed, 'validateFormSubmission('),
    ).toThrow();

    const leaked = correctionRoute.replace(
      "response({ status: 'unavailable' }, 503)",
      'response({ status: error.message }, 503)',
    );
    expect(() =>
      assertValidatorPresent(leaked, 'validateCorrectionRequest('),
    ).toThrow();
  });
});
