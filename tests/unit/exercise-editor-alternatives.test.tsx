/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseEditor } from '../../components/catalog/ExerciseEditor';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('exercise editor selected alternatives keys', () => {
  it('uses stable exercise ids as keys for duplicate alternative names', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alternatives = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        names: { ar: 'تمرين أ', en: 'Same Name' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        names: { ar: 'تمرين ب', en: 'Same Name' },
      },
    ];
    const exercise = normalizeExerciseInput({
      names: { ar: 'تمرين رئيسي', en: 'Main Exercise' },
      primaryMuscle: 'chest',
      equipment: 'barbell',
      defaults: {
        warmupSets: 1,
        workingSets: 3,
        reps: { kind: 'fixed', value: 8 },
        restSeconds: 90,
        rir: 2,
        alternativeExerciseIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      },
    });

    await act(async () =>
      root.render(
        createElement(ExerciseEditor, {
          locale: 'en',
          role: 'po',
          exercise,
          alternatives,
        }),
      ),
    );

    const duplicateKeyWarnings = errorSpy.mock.calls
      .map(([message]) => (typeof message === 'string' ? message : ''))
      .filter((message) =>
        /same key|duplicate key|keys should be unique/i.test(message),
      );
    expect(duplicateKeyWarnings).toEqual([]);
    errorSpy.mockRestore();
  });

  it('shows resolved names for typed Global and private Alternative values', async () => {
    const alternatives = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'global' as const,
        names: { ar: 'تمرين عالمي', en: 'Global target' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'private' as const,
        names: { ar: 'تمرين خاص', en: 'Private target' },
      },
    ];
    const exercise = normalizeExerciseInput({
      names: { ar: 'تمرين رئيسي', en: 'Main Exercise' },
      primaryMuscle: 'chest',
      equipment: 'barbell',
      defaults: {
        reps: { kind: 'fixed', value: 8 },
        alternativeExerciseIds: [
          'g:11111111-1111-4111-8111-111111111111',
          'w:22222222-2222-4222-8222-222222222222',
        ],
      },
    });

    await act(async () =>
      root.render(
        createElement(ExerciseEditor, {
          locale: 'en',
          role: 'po',
          exercise,
          alternatives,
        }),
      ),
    );

    const summary = host.querySelector('[data-testid="exercise-defaults"]');
    expect(summary?.textContent).toContain('Global target');
    expect(summary?.textContent).toContain('Private target');
    expect(summary?.textContent).not.toContain('g:1111');
    expect(summary?.textContent).not.toContain('w:2222');
  });
});
