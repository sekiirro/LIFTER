// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionFlow,
  type FormsClientAdapter,
  type LabeledQuestion,
} from '../../components/forms/QuestionFlow';
import { createMockFormsClientAdapter } from '../../lib/forms/mock-client-adapter';
import { createAuthorizedFormsClientAdapter } from '../../lib/forms/authorized-client-adapter';
import { getMessages } from '../../lib/i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const questions: readonly LabeledQuestion[] = [
  {
    id: 'required-goal',
    sectionId: 'intake',
    type: 'shortText',
    required: true,
    title: { en: 'Primary goal', ar: 'الهدف الأساسي' },
  },
  {
    id: 'optional-notes',
    sectionId: 'intake',
    type: 'shortText',
    required: false,
    title: { en: 'Additional notes', ar: 'ملاحظات إضافية' },
  },
];

describe('QuestionFlow autosave retry + history refresh (S54-58-CR-007/008)', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function renderFlow(props: {
    adapter: FormsClientAdapter;
    assignmentId?: string;
    initialAnswers?: Record<string, string>;
    initialRevision?: number;
    initialState?: 'ready' | 'submitted';
    history?: Array<{
      version: number;
      createdAt?: string;
      answers: Record<string, string>;
    }>;
  }) {
    await act(async () => {
      root?.render(
        createElement(QuestionFlow, {
          locale: 'en',
          questions,
          adapter: props.adapter,
          assignmentId: props.assignmentId ?? 'test-assignment',
          initialAnswers: props.initialAnswers ?? {
            'required-goal': 'Build strength',
          },
          initialRevision: props.initialRevision ?? 1,
          initialState: props.initialState ?? 'ready',
          history: props.history ?? [],
        }),
      );
    });
  }

  function currentInput(): HTMLInputElement {
    const input = container?.querySelector(
      'form input',
    ) as HTMLInputElement | null;
    if (!input) throw new Error('Current question input not found');
    return input;
  }

  async function typeAnswer(value: string) {
    const input = currentInput();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function findButton(label: string): HTMLButtonElement {
    const buttons = Array.from(
      container?.querySelectorAll('button') ?? [],
    ) as HTMLButtonElement[];
    const btn = buttons.find((button) => button.textContent?.trim() === label);
    if (!btn) throw new Error(`Button not found with label "${label}"`);
    return btn;
  }

  it('(a) CR-007: a 400/422-style save failure stops automatic re-sends of the unchanged payload', async () => {
    vi.useFakeTimers();
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: { 'required-goal': 'Build strength' },
      },
    });
    const saveDraftSpy = vi
      .spyOn(baseAdapter, 'saveDraft')
      .mockImplementation(async () => ({ status: 'error' as const }));

    await renderFlow({ adapter: baseAdapter });
    await typeAnswer('Lose fat');

    // First autosave fires after the 1500ms debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);

    // The save-error state is kept, but no further automatic saves fire.
    const messages = getMessages('en');
    expect(container?.textContent).toContain(messages['forms.saveFailed']);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);
  });

  it('(a) CR-007: after a permanent save failure, changing an answer or pressing retry saves again', async () => {
    vi.useFakeTimers();
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: { 'required-goal': 'Build strength' },
      },
    });
    const saveDraftSpy = vi
      .spyOn(baseAdapter, 'saveDraft')
      .mockImplementation(async () => ({ status: 'error' as const }));

    await renderFlow({ adapter: baseAdapter });
    await typeAnswer('Lose fat');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);

    // Changing an answer re-arms autosave.
    await typeAnswer('Build muscle');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(2);

    // The existing retry/save control also re-sends on demand.
    const messages = getMessages('en');
    const retryButton = findButton(messages['forms.retrySave']);
    await act(async () => {
      retryButton.click();
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(3);
  });

  it('(b) CR-007: a 500-style save failure keeps retrying per the current policy', async () => {
    vi.useFakeTimers();
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: { 'required-goal': 'Build strength' },
      },
    });
    const saveDraftSpy = vi
      .spyOn(baseAdapter, 'saveDraft')
      .mockImplementation(async () => ({ status: 'retryable' as const }));

    await renderFlow({ adapter: baseAdapter });
    await typeAnswer('Lose fat');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(1);

    // Retry loop with backoff keeps re-sending: +2000ms, +4000ms, +8000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(saveDraftSpy).toHaveBeenCalledTimes(4);
  });

  it('(c) CR-008: history shows the new answer after a successful submit without reload', async () => {
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: {
          'required-goal': 'Build strength',
          'optional-notes': 'No injuries',
        },
      },
    });
    const submitSpy = vi
      .spyOn(baseAdapter, 'submit')
      .mockImplementation(async () => ({
        status: 'submitted' as const,
        revision: 5,
      }));
    // The server is authoritative: it returns canonical answers and the
    // real submission revision, which may differ from the client's guess.
    const reloadSubmittedSpy = vi
      .spyOn(baseAdapter, 'reloadSubmitted')
      .mockImplementation(async () => ({
        status: 'loaded' as const,
        revision: 5,
        answers: {
          'required-goal': 'Lose fat (server)',
          'optional-notes': 'No injuries',
        },
      }));

    await renderFlow({
      adapter: baseAdapter,
      initialAnswers: {
        'required-goal': 'Build strength',
        'optional-notes': 'No injuries',
      },
      history: [
        {
          version: 1,
          createdAt: '2026-11-23T18:00:00Z',
          answers: {
            'required-goal': 'Build strength',
            'optional-notes': 'No injuries',
          },
        },
      ],
    });

    await typeAnswer('Lose fat');

    const messages = getMessages('en');
    await act(async () => {
      findButton(messages['forms.next']).click();
    });
    await act(async () => {
      findButton(messages['forms.submit']).click();
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
    // The displayed history is refreshed from the server after submit.
    expect(reloadSubmittedSpy).toHaveBeenCalledTimes(1);
    expect(reloadSubmittedSpy).toHaveBeenCalledWith({
      assignmentId: 'test-assignment',
    });
    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(2);
    const latest = versionItems?.[versionItems.length - 1];
    expect(latest?.textContent).toContain('Version 5');
    expect(latest?.textContent).toContain('Lose fat (server)');
  });

  it('(c) CR-008: history shows the corrected answer after a successful correction without reload', async () => {
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: {
          'required-goal': 'Build strength',
          'optional-notes': 'No injuries',
        },
      },
    });
    const correctSpy = vi
      .spyOn(baseAdapter, 'correct')
      .mockImplementation(async () => ({
        status: 'saved' as const,
        revision: 6,
      }));
    const reloadSubmittedSpy = vi
      .spyOn(baseAdapter, 'reloadSubmitted')
      .mockImplementation(async () => ({
        status: 'loaded' as const,
        revision: 6,
        answers: {
          'required-goal': 'Build muscle (server)',
          'optional-notes': 'No injuries',
        },
      }));

    await renderFlow({
      adapter: baseAdapter,
      initialAnswers: {
        'required-goal': 'Build strength',
        'optional-notes': 'No injuries',
      },
      initialState: 'submitted',
      history: [
        {
          version: 1,
          createdAt: '2026-11-23T18:00:00Z',
          answers: {
            'required-goal': 'Build strength',
            'optional-notes': 'No injuries',
          },
        },
      ],
    });

    const messages = getMessages('en');
    await act(async () => {
      findButton(messages['forms.correct']).click();
    });
    await typeAnswer('Build muscle');
    await act(async () => {
      findButton(messages['forms.next']).click();
    });
    await act(async () => {
      findButton(messages['forms.saveCorrection']).click();
    });

    expect(correctSpy).toHaveBeenCalledTimes(1);
    // The displayed history is refreshed from the server after correction.
    expect(reloadSubmittedSpy).toHaveBeenCalledTimes(1);
    expect(reloadSubmittedSpy).toHaveBeenCalledWith({
      assignmentId: 'test-assignment',
    });
    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(2);
    const latest = versionItems?.[versionItems.length - 1];
    expect(latest?.textContent).toContain('Version 6');
    expect(latest?.textContent).toContain('Build muscle (server)');
  });

  it('(d) S74-R21: history Clear buttons are enabled while the post-submit refresh is still pending', async () => {
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: {
          'required-goal': 'Build strength',
          'optional-notes': 'No injuries',
        },
      },
    });
    const submitSpy = vi
      .spyOn(baseAdapter, 'submit')
      .mockImplementation(async () => ({
        status: 'submitted' as const,
        revision: 5,
      }));
    // Hold the CR-008 reload open: the submission is already confirmed
    // (state 'submitted') while the server round-trip is still pending.
    type ReloadResult = Awaited<
      ReturnType<NonNullable<typeof baseAdapter.reloadSubmitted>>
    >;
    let resolveReload!: (value: ReloadResult) => void;
    const reloadSubmittedSpy = vi
      .spyOn(baseAdapter, 'reloadSubmitted')
      .mockImplementation(
        () =>
          new Promise<ReloadResult>((resolve) => {
            resolveReload = resolve;
          }),
      );

    await renderFlow({
      adapter: baseAdapter,
      initialAnswers: {
        'required-goal': 'Build strength',
        'optional-notes': 'No injuries',
      },
      history: [
        {
          version: 1,
          createdAt: '2026-11-23T18:00:00Z',
          answers: {
            'required-goal': 'Build strength',
            'optional-notes': 'No injuries',
          },
        },
      ],
    });

    await typeAnswer('Lose fat');

    const messages = getMessages('en');
    await act(async () => {
      findButton(messages['forms.next']).click();
    });
    await act(async () => {
      findButton(messages['forms.submit']).click();
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
    // The refresh has started but not finished: the form must not stay
    // locked, or the disabled Clear buttons render at 3.99:1 and fail
    // axe color-contrast in the submitted state.
    expect(reloadSubmittedSpy).toHaveBeenCalledTimes(1);
    const clearButtons = Array.from(
      container?.querySelectorAll(
        '[aria-label="Clear answer: Additional notes"]',
      ) ?? [],
    ) as HTMLButtonElement[];
    expect(clearButtons.length).toBe(1);
    expect(clearButtons[0]?.disabled).toBe(false);

    // Let the refresh finish: the history still shows the server answers.
    await act(async () => {
      resolveReload({
        status: 'loaded',
        revision: 5,
        answers: {
          'required-goal': 'Lose fat (server)',
          'optional-notes': 'No injuries',
        },
      });
    });
    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(2);
    const latest = versionItems?.[versionItems.length - 1];
    expect(latest?.textContent).toContain('Version 5');
    expect(latest?.textContent).toContain('Lose fat (server)');
  });

  it('(b) S74-R4: a 408 save failure through the real adapter keeps retrying per the current policy', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => ({
      status: 408,
      json: async () => ({ status: 'error' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'intent-key' });

    await renderFlow({ adapter: createAuthorizedFormsClientAdapter() });
    await typeAnswer('Lose fat');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    const draftPosts = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === '/api/forms/assignments/test-assignment/draft' &&
          (init as RequestInit | undefined)?.method === 'POST',
      ).length;
    expect(draftPosts()).toBe(1);

    // Retry loop with backoff keeps re-sending: +2000ms, +4000ms, +8000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(draftPosts()).toBe(4);

    vi.unstubAllGlobals();
  });
});
