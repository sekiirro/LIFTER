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
    onSubmit?: (
      input: unknown,
      draft: FoodEditorDraft,
      workspaceId: string | null,
    ) => void;
  }) =>
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => props.onSubmit?.(null, props.initialDraft, null),
      },
      'Start duplicate review',
    ),
}));

const draft: FoodEditorDraft = {
  nameAr: 'Ø£Ø±Ø²',
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
  servings: [{ labelAr: 'Ø­ØµØ©', labelEn: 'serving', basisQuantity: '100' }],
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
  container = window.document.createElement('div');
  window.document.body.append(container);
  root = createRoot(container);
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
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
