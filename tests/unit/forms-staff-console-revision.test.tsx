// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mockRouter = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
import { FormsStaffConsole } from '../../components/forms/FormsStaffConsole';
import type {
  FormsStaffAdapter,
  FormsStaffSnapshot,
  StaffFormDraft,
} from '../../lib/forms/staff-contracts';
import { getMessages } from '../../lib/i18n';

const form: StaffFormDraft = {
  id: 'form-before-save',
  title: { en: 'Before save', ar: '' },
  sections: [{ id: 'section-1', title: { en: 'Basics', ar: '' } }],
  questions: [
    {
      id: 'question-1',
      sectionId: 'section-1',
      type: 'shortText',
      required: false,
      charLimit: 150,
      label: { en: 'Question', ar: '' },
    },
  ],
  deadlineDays: 3,
  status: 'draft',
  revision: 1,
};

const snapshot: FormsStaffSnapshot = {
  forms: [form],
  assignments: [],
  defaultOnboardingFormId: form.id,
};

function makeAdapter(overrides: Partial<FormsStaffAdapter> = {}) {
  return {
    load: vi.fn(async () => snapshot),
    saveDraft: vi.fn(async () => ({ status: 'ok' as const, form })),
    publish: vi.fn(async () => ({ status: 'ok' as const, form })),
    retire: vi.fn(async () => ({ status: 'ok' as const, form })),
    copy: vi.fn(async () => ({ status: 'ok' as const, form })),
    selectDefaultOnboardingForm: vi.fn(async () => ({ status: 'ok' as const })),
    ...overrides,
  } satisfies FormsStaffAdapter;
}

describe('Forms staff console saved revision before publish', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  async function render(adapter: FormsStaffAdapter) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(FormsStaffConsole, {
          locale: 'en',
          adapter,
          brandSource: { resolvePublishedColor: async () => null },
          actorRole: 'wo',
          demo: false,
        }),
      );
    });
  }

  async function clickButton(label: string) {
    const button = [...(container?.querySelectorAll('button') ?? [])].find(
      (item) => item.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
  }

  it('keeps the successfully saved revision visible and reports a publish conflict', async () => {
    const saved = {
      ...form,
      id: 'saved-form',
      title: { en: 'Saved title', ar: '' },
      revision: 2,
    };
    const adapter = makeAdapter({
      saveDraft: vi.fn(async () => ({ status: 'ok' as const, form: saved })),
      publish: vi.fn(async () => ({ status: 'conflict' as const })),
    });
    await render(adapter);

    const messages = getMessages('en');
    await clickButton(messages['forms.staffPreviewForm']);
    await clickButton(messages['forms.staffPublish']);

    expect(container?.querySelector('h3')?.textContent).toBe('Saved title');
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
      messages['forms.staffResult.conflict'],
    );
    expect(adapter.publish).toHaveBeenCalledWith('wo', 'saved-form');

    await clickButton(messages['forms.staffReturnToEdit']);
    await clickButton(messages['forms.staffSaveDraft']);
    expect(adapter.saveDraft).toHaveBeenLastCalledWith('wo', saved);
  });

  it('publishes the form id returned by the preceding successful save', async () => {
    const saved = { ...form, id: 'saved-form', revision: 2 };
    const adapter = makeAdapter({
      saveDraft: vi.fn(async () => ({ status: 'ok' as const, form: saved })),
      publish: vi.fn(async () => ({
        status: 'ok' as const,
        form: { ...saved, status: 'published' as const },
      })),
    });
    await render(adapter);

    const messages = getMessages('en');
    await clickButton(messages['forms.staffPreviewForm']);
    await clickButton(messages['forms.staffPublish']);

    expect(adapter.publish).toHaveBeenCalledWith('wo', 'saved-form');
    expect(container?.textContent).toContain(messages['forms.staffPublished']);
  });
});
