import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseOverrideEditor } from '../../components/catalog/ExerciseOverrideEditor';
import {
  overrideDraftFromExercise,
  overrideSources,
  type OverrideField,
} from '../../lib/catalog/exercise-override';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../app/(app)/exercise-library/actions', () => ({
  saveExerciseOverrideAction: vi.fn(),
  resetExerciseOverrideFieldAction: vi.fn(),
}));

const exercise = normalizeExerciseInput({
  names: { ar: 'ضغط الصدر', en: 'Bench press' },
  primaryMuscle: 'chest',
  equipment: 'barbell',
  description: 'Description text',
  notes: 'Notes text',
  videoUrl: 'https://youtu.be/abcdef',
  defaults: { reps: { kind: 'fixed', value: 8 }, restSeconds: 90, rir: 2 },
});

const sources = overrideSources({
  name: { source: 'override' },
  description: { source: 'canonical' },
  notes: { source: 'canonical' },
  video: { source: 'canonical' },
  alternatives: { source: 'canonical' },
  default_rest_time: { source: 'canonical' },
  default_rir: { source: 'canonical' },
  default_reps: { source: 'canonical' },
});

function render(locale: 'en' | 'ar' = 'en') {
  return renderToStaticMarkup(
    createElement(ExerciseOverrideEditor, {
      locale,
      workspaceId: '22222222-2222-4222-8222-222222222222',
      exerciseId: '33333333-3333-4333-8333-333333333333',
      expectedVersion: 0,
      exercise,
      sources,
      alternatives: [],
    }),
  );
}

describe('workspace exercise override editor', () => {
  it('exposes the eight fields with their approved labels', () => {
    const html = render();
    expect(html).toContain('data-testid="exercise-override-editor"');
    for (const key of [
      'catalog.editorNameEn',
      'catalog.editorNameAr',
      'catalog.editorDescription',
      'catalog.editorNotes',
      'catalog.editorVideo',
      'catalog.editorReps',
      'catalog.editorRest',
      'catalog.editorRir',
      'catalog.editorAlternatives',
    ] as const) {
      expect(html).toContain(en[key]);
    }
    expect(html).toContain(en['catalog.editorSaveWorkspace']);
  });

  it('shows a per-field source badge and reset only for overridden fields', () => {
    const html = render();
    expect(html).toContain(en['catalog.overrideCustomized']);
    expect(html).toContain(en['catalog.overrideInherited']);
    const resets = html.match(/>Reset to Global</g) ?? [];
    expect(resets).toHaveLength(1);
    expect(html).toContain(
      `${en['catalog.overrideReset']} — ${en['catalog.editorNameEn']}`,
    );
  });

  it('renders Arabic RTL copy from the message catalog', () => {
    const html = render('ar');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain(ar['catalog.editorDescription']);
    expect(html).toContain(ar['catalog.overrideInherited']);
    expect(html).toContain(ar['catalog.overrideReset']);
    expect(html).not.toContain(en['catalog.overrideInherited']);
  });

  it('seeds the draft from the resolved values', () => {
    expect(overrideDraftFromExercise(exercise)).toMatchObject({
      description: 'Description text',
      notes: 'Notes text',
      videoUrl: 'https://youtu.be/abcdef',
    });
  });

  it('keeps the eight source keys stable for the server projection', () => {
    const keys: OverrideField[] = [
      'name',
      'description',
      'notes',
      'video',
      'alternatives',
      'default_rest_time',
      'default_rir',
      'default_reps',
    ];
    expect(Object.keys(sources).sort()).toEqual([...keys].sort());
  });
});
