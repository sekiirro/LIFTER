import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { ExerciseEditor } from '../../components/catalog/ExerciseEditor';
import {
  buildExerciseInput,
  canEditExercise,
  draftFromExercise,
  formatExerciseReps,
  validateExerciseEditorDraft,
  type CatalogStaffRole,
  type ExerciseEditorDraft,
} from '../../lib/catalog/exercise-editor';
import {
  mockExerciseAlternatives,
  mockExerciseEditorFixture,
  mockExerciseEditorRangeFixture,
} from '../../lib/catalog/mock';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

function render(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ExerciseEditor, {
      locale: 'en',
      role: 'po',
      scope: 'global',
      hasCoachingWork: false,
      exercise: mockExerciseEditorFixture,
      alternatives: mockExerciseAlternatives,
      ...props,
    }),
  );
}

function draft(
  overrides: Partial<ExerciseEditorDraft> = {},
): ExerciseEditorDraft {
  return { ...draftFromExercise(mockExerciseEditorFixture), ...overrides };
}

describe('exercise editor defaults presentation', () => {
  it('renders the exact fixed reps, rest, RIR and alternatives', () => {
    const html = render();
    expect(html).toContain('data-testid="exercise-defaults"');
    expect(html).toContain('data-defaults-reps="8"');
    expect(html).toContain('data-defaults-rest="90"');
    expect(html).toContain('data-defaults-rir="2"');
    expect(html).toContain(en['catalog.editorRepsFixed']);
    expect(html).toContain(en['catalog.editorRest']);
    expect(html).toContain(en['catalog.editorRir']);
    expect(html).toContain('Lat Pulldown');
    expect(html).toContain('Push-Up');
  });

  it('renders ranged reps exactly and shows an empty RIR as not set', () => {
    const html = render({ exercise: mockExerciseEditorRangeFixture });
    expect(html).toContain('data-defaults-reps="8–12"');
    expect(html).toContain('data-defaults-rir="—"');
    expect(html).toContain(en['catalog.editorRepsRange']);
    expect(formatExerciseReps({ kind: 'range', min: 8, max: 12 })).toBe('8–12');
    expect(formatExerciseReps({ kind: 'fixed', value: 8 })).toBe('8');
  });

  it('preserves the exact defaults when building an exercise input', () => {
    expect(buildExerciseInput(draft())).toMatchObject({
      names: { ar: 'ضغط الصدر بالبار', en: 'Barbell Bench Press' },
      primaryMuscle: 'chest',
      equipment: 'barbell',
      defaults: {
        reps: { kind: 'fixed', value: 8 },
        restSeconds: 90,
        rir: 2,
        alternativeExerciseIds: ['g:mock-exercise-2', 'g:mock-exercise-3'],
      },
    });
  });

  it('renders Arabic-first RTL and English LTR copy', () => {
    const arabic = render({ locale: 'ar' });
    expect(arabic).toContain('dir="rtl"');
    expect(arabic).toContain('lang="ar"');
    expect(arabic).toContain('data-catalog-locale="ar"');
    expect(arabic).toContain(ar['catalog.editorTitle']);
    expect(arabic).toContain(ar['catalog.editorDefaultsTitle']);
    expect(arabic).toContain('سحب أمامي');

    const english = render({ locale: 'en' });
    expect(english).toContain('dir="ltr"');
    expect(english).toContain('lang="en"');
    expect(english).toContain('data-catalog-locale="en"');
    expect(english).toContain(en['catalog.editorTitle']);
    expect(english).not.toContain(ar['catalog.editorTitle']);
  });

  it('keeps canonical numbers and taxonomy in LTR bidi isolation', () => {
    const html = render();
    expect(html).toContain('<bdi dir="ltr">8</bdi>');
    expect(html).toContain('<bdi dir="ltr">90</bdi>');
    expect(html).toContain('<bdi dir="ltr">Chest</bdi>');
  });
});

describe('exercise editor fixed-vs-range validation', () => {
  it('does not impose a UTF-16 maxLength on supplementary-plane name characters', () => {
    const html = render();
    expect(html).not.toMatch(/maxlength="120"/i);
  });
  it('accepts a 120-code-point Arabic name and rejects 121 code points', () => {
    const nameAtLimit = '\u062A'.repeat(120);
    const nameOverLimit = '\u062A'.repeat(121);
    expect(Array.from(nameAtLimit)).toHaveLength(120);
    expect(Array.from(nameOverLimit)).toHaveLength(121);

    expect(
      validateExerciseEditorDraft(
        draft({ names: { ar: nameAtLimit, en: 'Long name' } }),
      ).nameAr,
    ).toBeUndefined();
    const errors = validateExerciseEditorDraft(
      draft({ names: { ar: nameOverLimit, en: 'Long name' } }),
    );
    expect(errors.nameAr).toBe('text_too_long');
    expect(
      buildExerciseInput(
        draft({ names: { ar: nameOverLimit, en: 'Long name' } }),
      ),
    ).toBeNull();
  });

  it('enforces the Video URL 2000-code-point cap with the approved URL error', () => {
    const prefix = 'https://youtu.be/abcdefghijk?x=';
    const atLimit = `${prefix}${'😀'.repeat(2000 - Array.from(prefix).length)}`;
    const overLimit = `${atLimit}😀`;
    expect(Array.from(atLimit)).toHaveLength(2000);
    expect(Array.from(overLimit)).toHaveLength(2001);
    expect(
      validateExerciseEditorDraft(draft({ videoUrl: atLimit })).videoUrl,
    ).toBeUndefined();
    expect(
      validateExerciseEditorDraft(draft({ videoUrl: overLimit })).videoUrl,
    ).toBe('invalid_video_url');
  });

  it('rejects a range whose minimum exceeds its maximum', () => {
    const errors = validateExerciseEditorDraft(
      draft({ repsMode: 'range', repsMin: '12', repsMax: '8' }),
    );
    expect(errors.repsMin).toBe('range_order');
    expect(errors.repsMax).toBe('range_order');
    expect(
      buildExerciseInput(
        draft({ repsMode: 'range', repsMin: '12', repsMax: '8' }),
      ),
    ).toBeNull();
  });

  it('accepts a valid range and builds the range default', () => {
    const input = buildExerciseInput(
      draft({ repsMode: 'range', repsMin: '8', repsMax: '12' }),
    );
    expect(
      validateExerciseEditorDraft(
        draft({ repsMode: 'range', repsMin: '8', repsMax: '12' }),
      ),
    ).toEqual({});
    expect(input?.defaults?.reps).toEqual({ kind: 'range', min: 8, max: 12 });
  });

  it('rejects a fixed rep count that is not a positive integer', () => {
    const errors = validateExerciseEditorDraft(
      draft({ repsMode: 'fixed', repsValue: '0' }),
    );
    expect(errors.repsValue).toBe('positive_integer');
    expect(
      validateExerciseEditorDraft(
        draft({ repsMode: 'fixed', repsValue: '8.5' }),
      ).repsValue,
    ).toBe('positive_integer');
  });

  it('accepts a valid fixed rep count', () => {
    const input = buildExerciseInput(
      draft({ repsMode: 'fixed', repsValue: '10' }),
    );
    expect(input?.defaults?.reps).toEqual({ kind: 'fixed', value: 10 });
  });

  it('renders range-order validation feedback as an alert', () => {
    const html = render({
      initialErrors: { repsMin: 'range_order', repsMax: 'range_order' },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain(en['catalog.editorErrorRangeOrder']);
  });
});

describe('exercise editor role gating', () => {
  it('keeps the global rule unchanged: only PO may create or edit global exercises', () => {
    expect(canEditExercise('global', 'po', false)).toBe(true);
    for (const role of [
      'workspace_owner',
      'trainer',
      'sales',
      'client',
    ] satisfies CatalogStaffRole[]) {
      expect(canEditExercise('global', role, false)).toBe(false);
    }
  });

  it('keeps Add and Edit focused on exercise content for the PO', () => {
    const html = render({ role: 'po' });
    expect(html).not.toContain('data-testid="exercise-governance"');
    expect(html).not.toContain(en['catalog.editorRemove']);
    expect(html).not.toContain(en['catalog.editorRestore']);
    expect(html).not.toContain(en['catalog.editorMerge']);
    expect(html).toContain(en['catalog.editorSave']);
    expect(html).not.toContain('data-testid="exercise-read-only"');
    expect(html).not.toContain('disabled');
  });

  it('hides governance and save controls from non-PO roles on a global exercise', () => {
    for (const role of [
      'workspace_owner',
      'trainer',
      'sales',
      'client',
    ] satisfies CatalogStaffRole[]) {
      const html = render({ role });
      expect(html).not.toContain('data-testid="exercise-governance"');
      expect(html).not.toContain(en['catalog.editorRemove']);
      expect(html).not.toContain(en['catalog.editorMerge']);
      expect(html).not.toContain(en['catalog.editorSave']);
      expect(html).toContain('data-testid="exercise-read-only"');
      expect(html).toContain(en['catalog.editorReadOnlyNotice']);
      expect(html).toContain(`data-catalog-role="${role}"`);
      expect(html).toContain('disabled');
    }
  });
});

describe('exercise editor workspace scope', () => {
  it('allows a trainer with coaching work to edit a workspace exercise', () => {
    expect(canEditExercise('workspace', 'trainer', true)).toBe(true);
    const html = render({
      role: 'trainer',
      scope: 'workspace',
      hasCoachingWork: true,
    });
    expect(html).not.toContain('data-testid="exercise-read-only"');
    expect(html).not.toContain('data-testid="exercise-governance"');
    expect(html).toContain(en['catalog.editorSaveWorkspace']);
    expect(html).not.toContain('disabled');
  });

  it('keeps a trainer without coaching work read-only on a workspace exercise', () => {
    expect(canEditExercise('workspace', 'trainer', false)).toBe(false);
    const html = render({
      role: 'trainer',
      scope: 'workspace',
      hasCoachingWork: false,
    });
    expect(html).toContain('data-testid="exercise-read-only"');
    expect(html).toContain(en['catalog.editorReadOnlyNotice']);
    expect(html).not.toContain(en['catalog.editorSaveWorkspace']);
    expect(html).not.toContain('data-testid="exercise-governance"');
    expect(html).toContain('disabled');
  });

  it('keeps a trainer read-only on a global exercise', () => {
    expect(canEditExercise('global', 'trainer', false)).toBe(false);
    const html = render({ role: 'trainer', scope: 'global' });
    expect(html).toContain('data-testid="exercise-read-only"');
    expect(html).toContain(en['catalog.editorReadOnlyNotice']);
    expect(html).not.toContain(en['catalog.editorSave']);
    expect(html).not.toContain('data-testid="exercise-governance"');
    expect(html).toContain('disabled');
  });

  it('keeps sales read-only on both scopes', () => {
    for (const scope of ['global', 'workspace'] as const) {
      expect(canEditExercise(scope, 'sales', false)).toBe(false);
      const html = render({ role: 'sales', scope });
      expect(html).toContain('data-testid="exercise-read-only"');
      expect(html).toContain(en['catalog.editorReadOnlyNotice']);
      expect(html).not.toContain(en['catalog.editorSave']);
      expect(html).not.toContain(en['catalog.editorSaveWorkspace']);
      expect(html).not.toContain('data-testid="exercise-governance"');
      expect(html).toContain('disabled');
    }
  });

  it('lets the PO edit both scopes without exercise lifecycle controls', () => {
    const globalHtml = render({ role: 'po', scope: 'global' });
    expect(canEditExercise('global', 'po', false)).toBe(true);
    expect(globalHtml).toContain(en['catalog.editorSave']);
    expect(globalHtml).not.toContain('data-testid="exercise-governance"');
    expect(globalHtml).not.toContain(en['catalog.editorRestore']);
    expect(globalHtml).not.toContain(en['catalog.editorMerge']);
    expect(globalHtml).not.toContain('data-testid="exercise-read-only"');

    const workspaceHtml = render({ role: 'po', scope: 'workspace' });
    expect(canEditExercise('workspace', 'po', false)).toBe(true);
    expect(workspaceHtml).toContain(en['catalog.editorSaveWorkspace']);
    expect(workspaceHtml).not.toContain('data-testid="exercise-governance"');
    expect(workspaceHtml).not.toContain('data-testid="exercise-read-only"');
    expect(workspaceHtml).toContain(en['catalog.editorIntroWorkspace']);
    expect(workspaceHtml).not.toContain('global exercise');
  });
});

describe('exercise editor approved bounds', () => {
  it('accepts Rest at 0–600 in 15-second steps and rejects other values', () => {
    for (const restSeconds of ['0', '15', '90', '600']) {
      expect(
        validateExerciseEditorDraft(draft({ restSeconds })).restSeconds,
      ).toBeUndefined();
    }
    for (const restSeconds of ['7', '615', '-15', '601']) {
      expect(
        validateExerciseEditorDraft(draft({ restSeconds })).restSeconds,
      ).toBe('integer_range');
    }
  });

  it('limits RIR to 0–5 and Reps to 1–100', () => {
    expect(
      validateExerciseEditorDraft(draft({ rir: '5' })).rir,
    ).toBeUndefined();
    expect(validateExerciseEditorDraft(draft({ rir: '6' })).rir).toBe(
      'integer_range',
    );
    expect(
      validateExerciseEditorDraft(
        draft({ repsMode: 'fixed', repsValue: '100' }),
      ).repsValue,
    ).toBeUndefined();
    expect(
      validateExerciseEditorDraft(
        draft({ repsMode: 'fixed', repsValue: '101' }),
      ).repsValue,
    ).toBe('positive_integer');
    expect(
      validateExerciseEditorDraft(
        draft({ repsMode: 'range', repsMin: '1', repsMax: '100' }),
      ),
    ).toEqual({});
  });

  it('caps Description at 2000 characters and rejects unusable video URLs', () => {
    const atLimit = 'a'.repeat(2000);
    expect(
      validateExerciseEditorDraft(draft({ description: atLimit })).description,
    ).toBeUndefined();
    expect(
      validateExerciseEditorDraft(draft({ description: `${atLimit}a` }))
        .description,
    ).toBe('description_too_long');
    expect(
      validateExerciseEditorDraft(
        draft({ videoUrl: 'https://example.com/video' }),
      ).videoUrl,
    ).toBe('invalid_video_url');
    expect(
      validateExerciseEditorDraft(
        draft({ videoUrl: 'https://youtu.be/abcdef' }),
      ).videoUrl,
    ).toBeUndefined();
  });

  it('rejects duplicate and self-targeting Alternatives', () => {
    const selfId = '55555555-5555-4555-8555-555555555555';
    expect(
      validateExerciseEditorDraft(draft({ alternativeExerciseIds: ['a', 'a'] }))
        .alternatives,
    ).toBe('duplicate_alternative');
    expect(
      validateExerciseEditorDraft(
        draft({ alternativeExerciseIds: [selfId] }),
        selfId,
      ).alternatives,
    ).toBe('self_alternative');
    expect(
      validateExerciseEditorDraft(
        draft({ alternativeExerciseIds: ['a', 'b', 'c', 'd'] }),
      ).alternatives,
    ).toBe('too_many_alternatives');
  });

  it('requires English only, so an English-only draft is submittable', () => {
    expect(
      validateExerciseEditorDraft(draft({ names: { ar: '', en: 'Press' } })),
    ).toEqual({});
    expect(
      validateExerciseEditorDraft(draft({ names: { ar: 'ضغط', en: '' } }))
        .nameEn,
    ).toBe('required');
  });

  it('sends Description, Notes and Video through the eight-field input', () => {
    const input = buildExerciseInput(
      draft({
        description: 'Press description',
        notes: 'Coach note',
        videoUrl: 'https://youtu.be/abcdef',
      }),
    );
    expect(input).toMatchObject({
      description: 'Press description',
      notes: 'Coach note',
      videoUrl: 'https://youtu.be/abcdef',
    });
  });
});

describe('exercise editor keyboard access', () => {
  it('associates every control with a label and exposes a submit action', () => {
    const html = render();
    expect(html).toContain('<form');
    expect(html).toContain('type="submit"');
    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');

    const labelledFor = [...html.matchAll(/<label[^>]* for="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(labelledFor.length).toBeGreaterThan(5);
    for (const id of labelledFor) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toMatch(/<input[^>]* type="radio"/);
    expect(html).toMatch(/<input[^>]* type="checkbox"/);
  });

  it('renders saving and error status without claiming success', () => {
    const saving = render({ status: 'saving' });
    expect(saving).toContain('aria-busy="true"');
    expect(saving).toContain(en['catalog.editorSaving']);

    const failed = render({ status: 'error' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(en['catalog.editorStatusError']);
    expect(failed).toContain(en['catalog.editorStatusErrorDescription']);
  });
});
