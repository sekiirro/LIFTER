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

describe('QuestionFlow Clear Answer component flows', () => {
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
            'optional-notes': 'No injuries',
          },
          initialRevision: props.initialRevision ?? 1,
          initialState: props.initialState ?? 'submitted',
          history: props.history ?? [
            {
              version: 1,
              createdAt: '2026-11-23T18:00:00Z',
              answers: {
                'required-goal': 'Build strength',
                'optional-notes': 'No injuries',
              },
            },
          ],
        }),
      );
    });
  }

  function findClearButton(questionTitle: string): HTMLButtonElement {
    const messages = getMessages('en');
    const label = `${messages['forms.clearAnswer']}: ${questionTitle}`;
    const btn = container?.querySelector(
      `button[aria-label="${label}"]`,
    ) as HTMLButtonElement | null;
    if (!btn) {
      throw new Error(`Clear button not found with aria-label="${label}"`);
    }
    return btn;
  }

  it('(a) clicking Clear answer on an OPTIONAL question on the latest revision calls adapter.correct once with remove=[questionId], current expectedRevision and no other changes, answer disappears and new history version shows it removed', async () => {
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: {
          'required-goal': 'Build strength',
          'optional-notes': 'No injuries',
        },
      },
    });
    const correctSpy = vi.spyOn(baseAdapter, 'correct');

    await renderFlow({ adapter: baseAdapter });

    const clearBtn = findClearButton('Additional notes');
    expect(clearBtn.disabled).toBe(false);

    // Also verify required-goal button is disabled
    const requiredClearBtn = findClearButton('Primary goal');
    expect(requiredClearBtn.disabled).toBe(true);

    await act(async () => {
      clearBtn.click();
    });

    expect(correctSpy).toHaveBeenCalledTimes(1);
    expect(correctSpy).toHaveBeenCalledWith({
      assignmentId: 'test-assignment',
      expectedRevision: 1,
      answers: {},
      remove: ['optional-notes'],
    });

    // Check that a new version (Version 2) appears in history
    const historySection = container?.querySelector(
      'section[aria-labelledby="history-heading"]',
    );
    expect(historySection?.textContent).toContain('Version 2');

    // In Version 2, optional-notes is not present
    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(2);

    const version2 = versionItems?.[1];
    expect(version2?.textContent).toContain('Version 2');
    expect(version2?.textContent).toContain('Primary goal');
    expect(version2?.textContent).toContain('Build strength');
    expect(version2?.textContent).not.toContain('Additional notes');
    expect(version2?.textContent).not.toContain('No injuries');
  });

  it('(b) keyboard activation (Enter) calls adapter.correct once and updates state', async () => {
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: {
          'required-goal': 'Build strength',
          'optional-notes': 'No injuries',
        },
      },
    });
    const correctSpy = vi.spyOn(baseAdapter, 'correct');

    await renderFlow({ adapter: baseAdapter });

    const clearBtn = findClearButton('Additional notes');
    await act(async () => {
      clearBtn.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(correctSpy).toHaveBeenCalledTimes(1);
    expect(correctSpy).toHaveBeenCalledWith({
      assignmentId: 'test-assignment',
      expectedRevision: 1,
      answers: {},
      remove: ['optional-notes'],
    });

    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(2);
    expect(versionItems?.[1]?.textContent).toContain('Version 2');
    expect(versionItems?.[1]?.textContent).not.toContain('Additional notes');
  });

  it('(b) keyboard activation (Space) calls adapter.correct once and updates state', async () => {
    const baseAdapter = createMockFormsClientAdapter({
      'test-assignment': {
        revision: 1,
        answers: {
          'required-goal': 'Build strength',
          'optional-notes': 'No injuries',
        },
      },
    });
    const correctSpy = vi.spyOn(baseAdapter, 'correct');

    await renderFlow({ adapter: baseAdapter });

    const clearBtn = findClearButton('Additional notes');
    await act(async () => {
      clearBtn.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: ' ',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(correctSpy).toHaveBeenCalledTimes(1);
    expect(correctSpy).toHaveBeenCalledWith({
      assignmentId: 'test-assignment',
      expectedRevision: 1,
      answers: {},
      remove: ['optional-notes'],
    });

    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(2);
    expect(versionItems?.[1]?.textContent).toContain('Version 2');
    expect(versionItems?.[1]?.textContent).not.toContain('Additional notes');
  });

  it('(c) adapter conflict keeps the answer, shows conflict error copy, and does not add local history', async () => {
    const messages = getMessages('en');
    const baseAdapter = createMockFormsClientAdapter();
    const conflictAdapter: FormsClientAdapter = {
      ...baseAdapter,
      correct: vi.fn(async () => ({ status: 'conflict' as const })),
    };

    await renderFlow({ adapter: conflictAdapter });
    const clearBtn = findClearButton('Additional notes');

    await act(async () => {
      clearBtn.click();
    });

    expect(conflictAdapter.correct).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain(messages['forms.conflictTitle']);
    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(1);
    expect(versionItems?.[0]?.textContent).toContain('Additional notes');
    expect(versionItems?.[0]?.textContent).toContain('No injuries');
  });

  it('(c) adapter failure keeps the answer, shows submit failed error copy, and does not add local history', async () => {
    const messages = getMessages('en');
    const baseAdapter = createMockFormsClientAdapter();
    const failureAdapter: FormsClientAdapter = {
      ...baseAdapter,
      correct: vi.fn(async () => ({ status: 'error' as const })),
    };

    await renderFlow({ adapter: failureAdapter });
    const clearBtn = findClearButton('Additional notes');

    await act(async () => {
      clearBtn.click();
    });

    expect(failureAdapter.correct).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain(messages['forms.submitFailed']);
    const versionItems = container?.querySelectorAll(
      'section[aria-labelledby="history-heading"] ol > li',
    );
    expect(versionItems?.length).toBe(1);
    expect(versionItems?.[0]?.textContent).toContain('Additional notes');
    expect(versionItems?.[0]?.textContent).toContain('No injuries');
  });

  it('(d) double-click sends only one request', async () => {
    let resolveCorrect!: (val: { status: 'saved'; revision: number }) => void;
    const pendingPromise = new Promise<{ status: 'saved'; revision: number }>(
      (resolve) => {
        resolveCorrect = resolve;
      },
    );

    const baseAdapter = createMockFormsClientAdapter();
    const slowAdapter: FormsClientAdapter = {
      ...baseAdapter,
      correct: vi.fn(async () => pendingPromise),
    };

    await renderFlow({ adapter: slowAdapter });
    const clearBtn = findClearButton('Additional notes');

    await act(async () => {
      clearBtn.click();
      clearBtn.click();
    });

    expect(slowAdapter.correct).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCorrect({ status: 'saved', revision: 2 });
    });

    expect(slowAdapter.correct).toHaveBeenCalledTimes(1);
  });
});
