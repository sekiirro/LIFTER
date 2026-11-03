import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodEditorDraft } from '../../lib/catalog/food-editor';
import { en } from '../../lib/i18n/messages/en';
import { FoodCreateFlow } from '../../components/catalog/FoodCreateFlow';

const actions = vi.hoisted(() => ({
  review: vi.fn(),
  save: vi.fn(),
}));

vi.mock('../../app/(dashboard)/catalog-foods/actions', () => ({
  reviewFoodDuplicatesAction: actions.review,
  saveCatalogFoodAction: actions.save,
}));

vi.mock('../../components/catalog/FoodEditor', () => ({
  FoodEditor: (props: {
    initialDraft: FoodEditorDraft;
    status?: 'ready' | 'saving' | 'error' | 'success';
    saveErrorDescription?: string;
    onSubmit?: (
      input: unknown,
      draft: FoodEditorDraft,
      workspaceId: string | null,
    ) => void;
  }) =>
    createElement(
      'div',
      null,
      props.status === 'error'
        ? createElement('div', { role: 'alert' }, props.saveErrorDescription)
        : null,
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.onSubmit?.(null, props.initialDraft, null),
        },
        'Start duplicate review',
      ),
    ),
}));

const draft: FoodEditorDraft = {
  nameAr: '\u0623\u0631\u0632',
  nameEn: 'Rice',
  basis: 'g',
  productIdentity: 'rice',
  preparationIdentity: 'boiled',
  weighingState: 'cooked',
  kcal: '130',
  protein: '2.7',
  carbs: '28',
  fat: '0.3',
  fiber: '',
  servings: [
    { labelAr: '\u062D\u0635\u0629', labelEn: 'serving', basisQuantity: '100' },
  ],
  alternatives: [],
};

let window: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  window = new Window();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('HTMLElement', window.HTMLElement);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = window.document.createElement('div');
  window.document.body.append(element);
  container = element as unknown as HTMLElement;
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  actions.review.mockResolvedValue({
    status: 'exact',
    candidates: [
      {
        id: 'existing-rice',
        names: { en: 'Cooked rice' },
        basis: 'g',
        kcal: 130,
      },
    ],
  });
  actions.save.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  window.happyDOM.abort();
  vi.unstubAllGlobals();
});

describe('FoodCreateFlow existing-item selection', () => {
  it('renders and announces the selected existing food after selection', async () => {
    await act(async () => {
      root.render(
        createElement(FoodCreateFlow, {
          locale: 'en',
          role: 'po',
          initialDraft: draft,
        }),
      );
    });
    await act(async () => {
      container.querySelector('button')?.click();
    });
    await act(async () => {
      container
        .querySelector('[data-testid="select-existing-existing-rice"]')
        ?.dispatchEvent(
          new window.MouseEvent('click', { bubbles: true }) as unknown as Event,
        );
    });

    expect(container.querySelector('[data-testid="duplicate-review"]')).toBe(
      null,
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      en['catalog.duplicateExistingSelected'],
    );
    expect(container.textContent).toContain('Cooked rice');
  });
});

describe('FoodCreateFlow save errors', () => {
  it('renders exactly one live alert for a failed save', async () => {
    actions.review.mockResolvedValue({ status: 'none' });
    actions.save.mockResolvedValue({ status: 'invalid' });
    await act(async () => {
      root.render(
        createElement(FoodCreateFlow, {
          locale: 'en',
          role: 'po',
          initialDraft: draft,
        }),
      );
    });
    await act(async () => {
      container.querySelector('button')?.click();
    });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('locks near-match confirmation and cancellation while save is pending', async () => {
    actions.review.mockResolvedValue({
      status: 'near',
      candidates: [
        {
          id: 'similar-rice',
          names: { en: 'Rice' },
          basis: 'g',
          kcal: 130,
        },
      ],
    });
    let resolveSave!: (value: { status: 'ok' }) => void;
    actions.save.mockReturnValue(
      new Promise<{ status: 'ok' }>((resolve) => {
        resolveSave = resolve;
      }),
    );
    await act(async () => {
      root.render(
        createElement(FoodCreateFlow, {
          locale: 'en',
          role: 'po',
          initialDraft: draft,
        }),
      );
    });
    await act(async () => {
      container.querySelector('button')?.click();
    });
    const confirmation = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(confirmation).not.toBeNull();
    await act(async () => confirmation!.click());
    const buttons = [...container.querySelectorAll('button')];
    const confirm = buttons.find((button) =>
      button.textContent?.includes(en['catalog.duplicateContinue']),
    );
    const cancel = buttons.find((button) =>
      button.textContent?.includes(en['catalog.duplicateCancel']),
    );
    expect(confirm).toBeDefined();
    expect(cancel).toBeDefined();
    await act(async () => {
      confirm!.click();
      confirm!.click();
    });

    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(confirm!.disabled).toBe(true);
    expect(cancel!.disabled).toBe(true);
    await act(async () => {
      cancel!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="duplicate-review"]'),
    ).not.toBe(null);

    await act(async () => resolveSave({ status: 'ok' }));
  });
});
