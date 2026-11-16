import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NutritionPlanEditor } from '../../components/plans/nutrition/NutritionPlanEditor';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';
import type { NutritionSnapshotEntry } from '../../lib/plans/nutrition/macros';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/schema';

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
];

function documentWithTwoMeals(): NutritionDocumentV1 {
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
        note: 'meal note',
        recipeUrl: null,
        items: [
          {
            id: '018f0000-0000-4000-8000-000000000001',
            foodId: 'chicken',
            foodVersion: 1,
            quantity: { value: '150', unit: { kind: 'basis', value: 'g' } },
            note: 'food note',
            alternatives: [],
          },
        ],
      },
      {
        id: 'meal-b',
        name: { ar: 'الغدا', en: 'Lunch' },
        note: null,
        recipeUrl: null,
        items: [],
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
  props: Parameters<typeof NutritionPlanEditor>[0],
): Promise<void> {
  await act(async () => root.render(createElement(NutritionPlanEditor, props)));
}

async function typeInto(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
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

function liveText(): string {
  return (
    container.querySelector('[data-testid="nutrition-totals-live"]')
      ?.textContent ?? ''
  );
}

function mealOrder(): string[] {
  return [...container.querySelectorAll('[data-testid^="meal-meal-"]')].map(
    (element) => element.getAttribute('data-testid') ?? '',
  );
}

function buttonWithText(scope: ParentNode, text: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

describe('nutrition plan editor (F18-FR-002, F18-FR-006, F18-FR-021, F18-FR-023)', () => {
  it('announces day totals live and refreshes the announcement on edits', async () => {
    await render({
      locale: 'en',
      document: documentWithTwoMeals(),
      foods: FOODS,
    });
    const live = container.querySelector(
      '[data-testid="nutrition-totals-live"]',
    );
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(liveText()).toContain(en['nutritionPlan.totalsAnnouncement']);
    expect(liveText()).toContain('248');
    expect(liveText()).toContain('kcal');

    await typeInto(
      container.querySelector<HTMLInputElement>(
        '[data-testid="item-quantity-018f0000-0000-4000-8000-000000000001"]',
      )!,
      '200',
    );
    expect(liveText()).toContain('330');
    expect(liveText()).not.toContain('248');
  });

  it('offers a keyboard move alternative for meals and never filters by day type', async () => {
    await render({
      locale: 'en',
      document: documentWithTwoMeals(),
      foods: FOODS,
    });
    expect(mealOrder()).toEqual(['meal-meal-a', 'meal-meal-b']);
    expect(container.textContent).toContain(en['nutritionPlan.restDay']);
    expect(
      container.querySelector('[data-testid="meal-meal-a"]')?.textContent,
    ).toContain('Breakfast');
    expect(
      container.querySelector('[data-testid="meal-meal-b"]')?.textContent,
    ).toContain('Lunch');

    const first = container.querySelector<HTMLElement>(
      '[data-testid="meal-meal-a"]',
    )!;
    await click(buttonWithText(first, en['nutritionPlan.moveDown']));
    expect(mealOrder()).toEqual(['meal-meal-b', 'meal-meal-a']);
  });

  it('keeps Meal Notes and Food Notes independently editable and clearable', async () => {
    const changes: NutritionDocumentV1[] = [];
    await render({
      locale: 'en',
      document: documentWithTwoMeals(),
      foods: FOODS,
      onDocumentChange: (next) => changes.push(next),
    });
    const mealNote = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="meal-note-meal-a"]',
    )!;
    const foodNote = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="food-note-018f0000-0000-4000-8000-000000000001"]',
    )!;
    expect(mealNote.value).toBe('meal note');
    expect(foodNote.value).toBe('food note');

    await typeInto(mealNote, 'eat slowly');
    expect(foodNote.value).toBe('food note');
    expect(changes.at(-1)?.meals?.[0]?.note).toBe('eat slowly');
    expect(changes.at(-1)?.meals?.[0]?.items[0]?.note).toBe('food note');

    await typeInto(mealNote, '');
    expect(foodNote.value).toBe('food note');
    expect(changes.at(-1)?.meals?.[0]?.note).toBeNull();
    expect(changes.at(-1)?.meals?.[0]?.items[0]?.note).toBe('food note');

    await typeInto(foodNote, 'no skin');
    expect(mealNote.value).toBe('');
    expect(changes.at(-1)?.meals?.[0]?.note).toBeNull();
    expect(changes.at(-1)?.meals?.[0]?.items[0]?.note).toBe('no skin');

    await typeInto(foodNote, '');
    expect(changes.at(-1)?.meals?.[0]?.items[0]?.note).toBeNull();
  });

  it('renders the unavailable state when a frozen food version is gone', async () => {
    await render({
      locale: 'en',
      document: documentWithTwoMeals(),
      foods: [],
    });
    expect(container.textContent).toContain(
      en['nutritionAlternatives.unavailableFood'],
    );
    expect(liveText()).toBe(en['nutritionPlan.totalsUnavailable']);
  });

  it.each([
    ['loading', en['nutritionPlan.loading']],
    ['error', en['nutritionPlan.errorTitle']],
    ['conflict', en['nutritionPlan.conflictTitle']],
  ] as const)('renders the %s state', async (state, text) => {
    await render({
      locale: 'en',
      document: documentWithTwoMeals(),
      foods: FOODS,
      state,
      onRetry: vi.fn(),
    });
    expect(container.textContent).toContain(text);
    if (state === 'conflict') {
      expect(
        container.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
      ).toBe(true);
    }
  });

  it('renders the empty state with the approved copy', async () => {
    await render({
      locale: 'en',
      document: { ...documentWithTwoMeals(), meals: [] },
      foods: FOODS,
      state: 'empty',
    });
    expect(container.textContent).toContain(en['nutritionPlan.emptyTitle']);
    expect(container.textContent).toContain(
      en['nutritionPlan.emptyDescription'],
    );
  });

  it('renders Arabic RTL with approved note labels and Arabic-Indic numerals', async () => {
    await render({
      locale: 'ar',
      document: documentWithTwoMeals(),
      foods: FOODS,
    });
    const editor = container.querySelector(
      '[data-testid="nutrition-plan-editor"]',
    );
    expect(editor?.getAttribute('dir')).toBe('rtl');
    const text = container.textContent ?? '';
    expect(text).toContain(ar['nutritionPlan.mealNotes']);
    expect(text).toContain(ar['nutritionPlan.foodNotes']);
    expect(text).toContain('ملاحظات للوجبة دي');
    expect(text).toContain('ملاحظات للأكلة دي');
    expect(liveText()).toMatch(/[\u0660-\u0669]/);
  });
});
