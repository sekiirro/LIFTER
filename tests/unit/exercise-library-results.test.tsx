import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseLibraryResults } from '../../app/(app)/exercise-library/ExerciseLibraryResults';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const items = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    kind: 'exercise' as const,
    names: { ar: 'ضغط صدر', en: 'Chest press' },
    primaryMuscle: 'chest' as const,
    equipment: 'barbell' as const,
    lifecycleState: 'active' as const,
  },
];

describe('exercise library detail navigation', () => {
  it('links global entries to global detail scope', () => {
    const html = renderToStaticMarkup(
      createElement(ExerciseLibraryResults, {
        locale: 'en',
        items,
        query: '',
        filters: {},
        workspaceId: null,
        nextHref: null,
      }),
    );
    expect(html).toContain(
      'href="/exercise-library/55555555-5555-4555-8555-555555555555"',
    );
  });

  it('preserves explicit tenant scope when opening workspace exercise detail', () => {
    const html = renderToStaticMarkup(
      createElement(ExerciseLibraryResults, {
        locale: 'ar',
        items,
        query: '',
        filters: {},
        workspaceId: '22222222-2222-4222-8222-222222222222',
        nextHref: null,
      }),
    );
    expect(html).toContain(
      'scope=workspace&amp;workspace=22222222-2222-4222-8222-222222222222',
    );
  });
});
