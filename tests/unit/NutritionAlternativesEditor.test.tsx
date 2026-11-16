import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NutritionAlternativesEditor } from '../../components/plans/nutrition/NutritionAlternativesEditor';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';
import type { NutritionSnapshotEntry } from '../../lib/plans/nutrition/macros';
import type {
  NutritionDocumentV1,
  NutritionItem,
} from '../../lib/plans/nutrition/schema';

const FOODS: NutritionSnapshotEntry[] = [
  {
    kind: 'basis',
    foodId: 'chicken',
    version: 1,
    names: { ar: 'فراخ', en: 'Chicken' },
    basis: 'g',
    productIdentity: 'chicken',
    preparationIdentity: 'grilled',
    weighingState: 'cooked',
    per100: {
      kcal: '165',
      protein: '31',
      carbs: '0',
      fat: '3.6',
      fiber: null,
    },
  },
  {
    kind: 'basis',
    foodId: 'rice',
    version: 1,
    names: { ar: 'رز', en: 'Rice' },
    basis: 'g',
    productIdentity: 'rice',
    preparationIdentity: 'boiled',
    weighingState: 'cooked',
    per100: {
      kcal: '130',
      protein: '2.7',
      carbs: '28',
      fat: '0.3',
      fiber: null,
    },
  },
];

function item(): NutritionItem {
  return {
    id: '018f0000-0000-4000-8000-000000000001',
    foodId: 'chicken',
    foodVersion: 1,
    quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
    note: null,
    alternatives: [
      {
        id: '018f0000-0000-4000-8000-000000000002',
        foodId: 'chicken',
        foodVersion: 1,
        quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
      },
      {
        id: '018f0000-0000-4000-8000-000000000003',
        foodId: 'rice',
        foodVersion: 1,
        quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
      },
    ],
  };
}

function documentWithItem(entry: NutritionItem = item()): NutritionDocumentV1 {
  return {
    schemaVersion: 1,
    structure: 'single_day',
    dayTypes: [
      {
        id: 'rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    implicitDayTypeId: 'rest',
    meals: [
      {
        id: 'meal-a',
        name: { ar: 'الفطار', en: 'Breakfast' },
        note: null,
        recipeUrl: null,
        items: [entry],
      },
    ],
    title: null,
    notes: null,
  };
}

let dom: JSDOM;
let root: { render: (node: React.ReactNode) => void; unmount: () => void };
let container: HTMLElement;
let globals: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost/' },
  );
  const currentGlobals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  globals = new Map(
    Object.keys(currentGlobals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(currentGlobals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  // JSDOM has no modal dialog implementation; mirror the open flag only.
  const dialog = dom.window.HTMLDialogElement?.prototype;
  if (dialog && typeof dialog.showModal !== 'function') {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    dialog.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
  const { createRoot } = await import('react-dom/client');
  container = dom.window.document.getElementById('root') as HTMLElement;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  for (const [key, descriptor] of globals ?? []) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function render(
  props: Parameters<typeof NutritionAlternativesEditor>[0],
): Promise<void> {
  await act(async () =>
    root.render(createElement(NutritionAlternativesEditor, props)),
  );
}

async function typeInto(element: HTMLElement, value: string): Promise<void> {
  const prototype =
    element.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function buttonWithLabelPrefix(
  scope: ParentNode,
  prefix: string,
): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find((candidate) =>
    (candidate.getAttribute('aria-label') ?? '').startsWith(prefix),
  );
  if (!button) throw new Error(`button not found: ${prefix}`);
  return button;
}

function quantityInputs(): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('ol li input')];
}

describe('nutrition alternatives editor (F18-FR-006, F18-FR-021)', () => {
  it('keeps the original first, then alternatives in stored order with macros', async () => {
    await render({
      locale: 'en',
      document: documentWithItem(),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
    });
    const rows = [...container.querySelectorAll('ol li')];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.getAttribute('data-original')).toBe('true');
    expect(rows[0]?.textContent).toContain(
      en['nutritionAlternatives.original'],
    );
    expect(rows[0]?.textContent).toContain('Chicken');
    expect(rows[1]?.textContent).toContain('Chicken');
    expect(rows[2]?.textContent).toContain('Rice');
    expect(
      container.querySelector(
        `dl[aria-label="${en['nutritionAlternatives.calculatedMacros']}"]`,
      ),
    ).not.toBeNull();
  });

  it('moves alternatives with keyboard-reachable buttons', async () => {
    const changes: NutritionDocumentV1[] = [];
    await render({
      locale: 'en',
      document: documentWithItem(),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
      onDocumentChange: (next) => changes.push(next),
    });
    const rows = [...container.querySelectorAll('ol li')].slice(1);

    expect(
      buttonWithLabelPrefix(rows[0]!, en['nutritionAlternatives.moveUp'])
        .disabled,
    ).toBe(true);
    await click(
      buttonWithLabelPrefix(rows[0]!, en['nutritionAlternatives.moveDown']),
    );
    expect(
      changes
        .at(-1)
        ?.meals?.[0]?.items[0]?.alternatives.map((entry) => entry.id),
    ).toEqual([
      '018f0000-0000-4000-8000-000000000003',
      '018f0000-0000-4000-8000-000000000002',
    ]);

    // The host owns the document, so it re-renders with the committed draft.
    await render({
      locale: 'en',
      document: changes.at(-1)!,
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
      onDocumentChange: (next) => changes.push(next),
    });
    const reordered = [...container.querySelectorAll('ol li')].slice(1);
    await click(
      buttonWithLabelPrefix(reordered[1]!, en['nutritionAlternatives.moveUp']),
    );
    expect(
      changes
        .at(-1)
        ?.meals?.[0]?.items[0]?.alternatives.map((entry) => entry.id),
    ).toEqual([
      '018f0000-0000-4000-8000-000000000002',
      '018f0000-0000-4000-8000-000000000003',
    ]);
  });

  it('adds one alternative with an injected id and refuses a fourth', async () => {
    const changes: NutritionDocumentV1[] = [];
    await render({
      locale: 'en',
      document: documentWithItem(),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
      newId: () => '018f0000-0000-4000-8000-000000000005',
      onDocumentChange: (next) => changes.push(next),
    });
    await click(container.querySelector('form button[type="submit"]')!);
    const added = changes.at(-1)?.meals?.[0]?.items[0]?.alternatives;
    expect(added).toHaveLength(3);
    expect(added?.at(-1)).toEqual({
      id: '018f0000-0000-4000-8000-000000000005',
      foodId: 'chicken',
      foodVersion: 1,
      quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
    });

    const full = documentWithItem({
      ...item(),
      alternatives: [
        item().alternatives[0]!,
        item().alternatives[1]!,
        {
          id: '018f0000-0000-4000-8000-000000000004',
          foodId: 'chicken',
          foodVersion: 1,
          quantity: { value: '50', unit: { kind: 'basis', value: 'g' } },
        },
      ],
    });
    const atLimit: NutritionDocumentV1[] = [];
    await render({
      locale: 'en',
      document: full,
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
      onDocumentChange: (next) => atLimit.push(next),
    });
    const submit = container.querySelector<HTMLButtonElement>(
      'form button[type="submit"]',
    )!;
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain(
      en['nutritionAlternatives.addDisabledLimit'],
    );
    await click(submit);
    expect(atLimit).toHaveLength(0);
  });

  it('rejects an invalid alternative quantity with the merged validator', async () => {
    const changes: NutritionDocumentV1[] = [];
    await render({
      locale: 'en',
      document: documentWithItem(),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
      onDocumentChange: (next) => changes.push(next),
    });
    const input = quantityInputs()[0]!;
    await typeInto(input, 'abc');
    expect(changes).toHaveLength(0);
    expect(
      container
        .querySelector<HTMLInputElement>('ol li input')
        ?.getAttribute('aria-invalid'),
    ).toBe('true');
    expect(container.textContent).toContain(
      en['nutritionAlternatives.invalidQuantity'],
    );
  });

  it('marks a retired food version as unavailable instead of computing macros', async () => {
    await render({
      locale: 'en',
      document: documentWithItem({
        ...item(),
        alternatives: [
          {
            id: 'alt-retired',
            foodId: 'retired-food',
            foodVersion: 1,
            quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
          },
        ],
      }),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
    });
    const rows = [...container.querySelectorAll('ol li')];
    expect(rows[1]?.textContent).toContain(
      en['nutritionAlternatives.unavailableFood'],
    );
    expect(rows[1]?.querySelector('dl')).toBeNull();
  });

  it('removes an alternative only after confirming the dialog', async () => {
    const changes: NutritionDocumentV1[] = [];
    await render({
      locale: 'en',
      document: documentWithItem(),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
      onDocumentChange: (next) => changes.push(next),
    });
    const removeButtons = [...container.querySelectorAll('button')].filter(
      (candidate) =>
        candidate.textContent?.trim() === en['nutritionAlternatives.remove'],
    );
    expect(removeButtons).toHaveLength(2);
    await click(removeButtons[1]!);
    expect(container.textContent).toContain(
      en['nutritionAlternatives.removeTitle'],
    );
    expect(changes).toHaveLength(0);
    await click(container.querySelector('[data-testid="dialog-confirm"]')!);
    expect(
      changes
        .at(-1)
        ?.meals?.[0]?.items[0]?.alternatives.map((entry) => entry.id),
    ).toEqual(['018f0000-0000-4000-8000-000000000002']);
  });

  it('renders Arabic RTL evidence for the alternatives surface', async () => {
    await render({
      locale: 'ar',
      document: documentWithItem(),
      itemId: '018f0000-0000-4000-8000-000000000001',
      foods: FOODS,
    });
    const section = container.querySelector(
      '[data-testid="alternatives-018f0000-0000-4000-8000-000000000001"]',
    );
    expect(section?.getAttribute('dir')).toBe('rtl');
    expect(container.textContent).toContain(ar['nutritionAlternatives.title']);
    expect(container.textContent).toContain(
      ar['nutritionAlternatives.original'],
    );
  });
});
