/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseOverrideEditor } from '../../components/catalog/ExerciseOverrideEditor';
import {
  overrideDraftFromExercise,
  overrideSources,
  validateOverrideDraft,
  type OverrideField,
} from '../../lib/catalog/exercise-override';
import { normalizeExerciseInput } from '../../lib/catalog/schemas';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const actionMocks = vi.hoisted(() => ({
  save: vi.fn(),
  reset: vi.fn(),
  search: vi.fn(),
}));
vi.mock('../../app/(app)/exercise-library/actions', () => ({
  saveExerciseOverrideAction: actionMocks.save,
  resetExerciseOverrideFieldAction: actionMocks.reset,
  searchAlternativeOptionsAction: actionMocks.search,
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
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

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

  it('accepts a 2,000-character Video text reference and rejects 2,001', () => {
    const draft = overrideDraftFromExercise(exercise);
    draft.videoUrl = `https://youtu.be/abcdefghijk?x=${'a'.repeat(1969)}`;
    expect(Array.from(draft.videoUrl).length).toBe(2000);
    expect(
      validateOverrideDraft(draft, new Set(['video']), exercise.names.en),
    ).toEqual({});
    draft.videoUrl += 'a';
    expect(
      validateOverrideDraft(draft, new Set(['video']), exercise.names.en),
    ).toEqual({
      video: 'text_too_long',
    });
  });

  it('keeps selected Alternatives checked through a debounced search and next page', async () => {
    const selectedId = '44444444-4444-4444-8444-444444444444';
    const selectedExercise = normalizeExerciseInput({
      names: { en: 'Bench press' },
      primaryMuscle: 'chest',
      equipment: 'barbell',
      defaults: { alternativeExerciseIds: [`g:${selectedId}`] },
    });
    actionMocks.search
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            { id: selectedId, kind: 'global', names: { en: 'Selected' } },
            {
              id: '55555555-5555-4555-8555-555555555555',
              kind: 'global',
              names: { en: 'Page one' },
            },
          ],
          nextCursor: 'g:66666666-6666-4666-8666-666666666666',
        },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            { id: selectedId, kind: 'global', names: { en: 'Selected' } },
            {
              id: '77777777-7777-4777-8777-777777777777',
              kind: 'global',
              names: { en: 'Page two' },
            },
          ],
          nextCursor: 'g:88888888-8888-4888-8888-888888888888',
        },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            { id: selectedId, kind: 'global', names: { en: 'Selected' } },
            {
              id: '99999999-9999-4999-8999-999999999999',
              kind: 'global',
              names: { en: 'Page three' },
            },
          ],
          nextCursor: null,
        },
      });
    await act(async () =>
      root.render(
        createElement(ExerciseOverrideEditor, {
          locale: 'en',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          exerciseId: '33333333-3333-4333-8333-333333333333',
          expectedVersion: 0,
          exercise: selectedExercise,
          sources,
          alternatives: [],
        }),
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    const selected = () =>
      document.getElementById(
        `33333333-3333-4333-8333-333333333333-override-alt-${selectedId}`,
      ) as HTMLInputElement | null;
    expect(selected()?.checked).toBe(true);

    const search = document.getElementById(
      '33333333-3333-4333-8333-333333333333-override-alternative-search',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(search, 'page two');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(selected()?.checked).toBe(true);
    const next = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === en['catalog.nextPage'],
    )!;
    await act(async () => next.click());
    expect(selected()?.checked).toBe(true);
    expect(actionMocks.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'page two',
        selectedIds: [`g:${selectedId}`],
      }),
    );
  });

  it('drops an old override page response after the query changes', async () => {
    type SearchResult = {
      status: 'ok';
      data: {
        options: {
          id: string;
          kind: 'global';
          names: { en: string };
        }[];
        nextCursor: string | null;
      };
    };
    let resolveNext!: (result: SearchResult) => void;
    const pendingNext = new Promise<SearchResult>((resolve) => {
      resolveNext = resolve;
    });
    actionMocks.search
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              kind: 'global',
              names: { en: 'Initial result' },
            },
          ],
          nextCursor: 'g:55555555-5555-4555-8555-555555555555',
        },
      })
      .mockReturnValueOnce(pendingNext)
      .mockResolvedValueOnce({
        status: 'ok',
        data: {
          options: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              kind: 'global',
              names: { en: 'New query result' },
            },
          ],
          nextCursor: null,
        },
      });

    await act(async () =>
      root.render(
        createElement(ExerciseOverrideEditor, {
          locale: 'en',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          exerciseId: '33333333-3333-4333-8333-333333333333',
          expectedVersion: 0,
          exercise,
          sources,
          alternatives: [],
        }),
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    const next = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === en['catalog.nextPage'],
    )!;
    await act(async () => next.click());

    const search = document.getElementById(
      '33333333-3333-4333-8333-333333333333-override-alternative-search',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(search, 'new query');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(host.textContent).toContain('New query result');

    await act(async () => {
      resolveNext({
        status: 'ok',
        data: {
          options: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              kind: 'global',
              names: { en: 'Stale page result' },
            },
          ],
          nextCursor: null,
        },
      });
      await pendingNext;
    });
    expect(host.textContent).not.toContain('Stale page result');
  });

  it('reuses the operation key when retrying the same unchanged failed save', async () => {
    actionMocks.save
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockResolvedValueOnce({ status: 'ok', data: {} });
    await act(async () =>
      root.render(
        createElement(ExerciseOverrideEditor, {
          locale: 'en',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          exerciseId: '33333333-3333-4333-8333-333333333333',
          expectedVersion: 0,
          exercise,
          sources,
          alternatives: [],
        }),
      ),
    );
    const input = host.querySelector<HTMLInputElement>(
      '[id="33333333-3333-4333-8333-333333333333-override-name-en"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(input, 'Updated name');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const form = host.querySelector('form')!;
    await act(async () =>
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    await act(async () =>
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    expect(actionMocks.save).toHaveBeenCalledTimes(2);
    expect(actionMocks.save.mock.calls[0]![0].operationKey).toEqual(
      actionMocks.save.mock.calls[1]![0].operationKey,
    );
  });
});
