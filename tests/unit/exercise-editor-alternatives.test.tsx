/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseEditor } from '../../components/catalog/ExerciseEditor';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';

const searchAction = vi.hoisted(() => vi.fn());
vi.mock('../../app/(app)/exercise-library/actions', () => ({
  searchAlternativeOptionsAction: searchAction,
}));

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

  it('debounces authoring search and retains selected Alternatives across pages', async () => {
    const selectedId = '11111111-1111-4111-8111-111111111111';
    const exercise = normalizeExerciseInput({
      names: { en: 'Main Exercise' },
      primaryMuscle: 'chest',
      equipment: 'barbell',
      defaults: { alternativeExerciseIds: [`g:${selectedId}`] },
    });
    searchAction
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            { id: selectedId, kind: 'global', names: { en: 'Selected' } },
            {
              id: '22222222-2222-4222-8222-222222222222',
              kind: 'global',
              names: { en: 'Page one' },
            },
          ],
          nextCursor: 'g:33333333-3333-4333-8333-333333333333',
        },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            { id: selectedId, kind: 'global', names: { en: 'Selected' } },
            {
              id: '44444444-4444-4444-8444-444444444444',
              kind: 'global',
              names: { en: 'Page two' },
            },
          ],
          nextCursor: 'g:55555555-5555-4555-8555-555555555555',
        },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            { id: selectedId, kind: 'global', names: { en: 'Selected' } },
            {
              id: '66666666-6666-4666-8666-666666666666',
              kind: 'global',
              names: { en: 'Page three' },
            },
          ],
          nextCursor: null,
        },
      });

    await act(async () =>
      root.render(
        createElement(ExerciseEditor, {
          locale: 'en',
          role: 'po',
          exercise,
          alternatives: [],
        }),
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    const isSelectedVisible = () =>
      [...host.querySelectorAll('label')].some(
        (label) =>
          label.textContent?.includes('Selected') &&
          (document.getElementById(label.htmlFor) as HTMLInputElement | null)
            ?.checked,
      );
    expect(isSelectedVisible()).toBe(true);

    const search = host.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(search, 'page two');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(isSelectedVisible()).toBe(true);
    expect(searchAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'page two',
        selectedIds: [`g:${selectedId}`],
      }),
    );
    const next = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Next page',
    )!;
    await act(async () => next.click());
    expect(isSelectedVisible()).toBe(true);
  });
});
