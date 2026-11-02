import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  NUTRITION_MAX_ALTERNATIVES,
  NutritionAlternativesEditorError,
  NutritionPlanAlternativesEditor,
  addAlternativeDraft,
  moveAlternativeDraft,
  removeAlternativeDraft,
  replaceAlternativeFoodDraft,
  setAlternativeQuantityDraft,
  validateAlternativeDraft,
  type NutritionAlternativeDraft,
  type NutritionAlternativeFood,
  type NutritionAlternativesItem,
  type NutritionAlternativesEditorProps,
} from '../../components/plans/NutritionPlanAlternativesEditor';
import {
  computeNutritionMacro,
  type NutritionFoodSnapshot,
} from '../../lib/plans/nutrition/macros';
import { formatNutritionMacroDisplay } from '../../lib/plans/nutrition/display';
import { getMessages } from '../../lib/i18n';

const itemId = '00000000-0000-4000-8000-000000000010';

function snapshot(
  foodVersionId: string,
  basis: 'g' | 'ml',
  per100: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
  },
  equivalences: Record<string, string>,
): NutritionFoodSnapshot {
  return {
    foodVersionId,
    basis,
    per100,
    servingEquivalences: { [basis]: '1', ...equivalences },
  };
}

const chicken: NutritionAlternativeFood = {
  name: { ar: 'صدر دجاج مشوي', en: 'Grilled chicken breast' },
  snapshot: snapshot(
    '00000000-0000-4000-8000-000000000001',
    'g',
    { calories: '165.00', protein: '31.00', carbs: '0.00', fat: '3.60' },
    { piece: '120' },
  ),
};
const rice: NutritionAlternativeFood = {
  name: { ar: 'أرز بسمتي مطبوخ', en: 'Cooked basmati rice' },
  snapshot: snapshot(
    '00000000-0000-4000-8000-000000000002',
    'g',
    { calories: '130.00', protein: '2.70', carbs: '28.00', fat: '0.30' },
    { cup: '158' },
  ),
};
const yogurt: NutritionAlternativeFood = {
  name: { ar: 'زبادي يوناني', en: 'Greek yogurt' },
  snapshot: snapshot(
    '00000000-0000-4000-8000-000000000003',
    'g',
    { calories: '59.00', protein: '10.00', carbs: '3.60', fat: '0.40' },
    { cup: '245' },
  ),
};
const oats: NutritionAlternativeFood = {
  name: { ar: 'شوفان', en: 'Oats' },
  snapshot: snapshot(
    '00000000-0000-4000-8000-000000000004',
    'g',
    { calories: '389.00', protein: '16.90', carbs: '66.30', fat: '6.90' },
    { cup: '90' },
  ),
};
const foods = [chicken, rice, yogurt, oats];

const item: NutritionAlternativesItem = {
  id: itemId,
  name: chicken.name,
  snapshot: chicken.snapshot,
  quantity: { value: '200', unit: 'g' },
};

const alternatives: readonly [
  NutritionAlternativeDraft,
  NutritionAlternativeDraft,
  NutritionAlternativeDraft,
] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    foodVersionId: rice.snapshot.foodVersionId,
    quantity: { value: '150', unit: 'g' },
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    foodVersionId: yogurt.snapshot.foodVersionId,
    quantity: { value: '200', unit: 'g' },
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    foodVersionId: oats.snapshot.foodVersionId,
    quantity: { value: '40', unit: 'g' },
  },
];

function render(
  locale: 'ar' | 'en',
  overrides: Partial<{
    alternatives: readonly NutritionAlternativeDraft[];
    foods: readonly NutritionAlternativeFood[];
    foodVersionResolution: NutritionAlternativesEditorProps['foodVersionResolution'];
  }> = {},
): string {
  return renderToStaticMarkup(
    createElement(NutritionPlanAlternativesEditor, {
      locale,
      item,
      foods: overrides.foods ?? foods,
      alternatives: overrides.alternatives ?? alternatives,
      foodVersionResolution: overrides.foodVersionResolution,
    }),
  );
}

function row(html: string, alternativeId: string): string {
  const match = html.match(
    new RegExp(
      `<li[^>]*data-alternative-id="${alternativeId}"[^>]*>[\\s\\S]*?<\\/li>`,
    ),
  );
  if (!match) throw new Error(`Row ${alternativeId} was not rendered`);
  return match[0];
}

function displayedMacros(food: NutritionAlternativeFood, value: string) {
  return computeNutritionMacro({
    snapshot: food.snapshot,
    quantity: { value, unit: food.snapshot.basis },
  }).macros;
}

function expectMacro(
  html: string,
  name: 'calories' | 'protein' | 'carbs' | 'fat',
  value: string,
): void {
  expect(html).toContain(
    `data-macro="${name}">${formatNutritionMacroDisplay(value, name)}<`,
  );
}

describe('F18 nutrition manual alternatives editor', () => {
  it('renders one unified list with the original item first and every alternative after it', () => {
    const html = render('en');
    expect(html.match(/<ol\b/g)).toHaveLength(1);
    expect(html).toContain('data-testid="alternatives-unified-list"');
    expect(html).toContain('data-row="original"');
    expect(html.match(/data-row="alternative"/g)).toHaveLength(3);
    expect(html.indexOf('data-row="original"')).toBeLessThan(
      html.indexOf(`data-alternative-id="${alternatives[0].id}"`),
    );
    expect(html.indexOf(alternatives[0].id)).toBeLessThan(
      html.indexOf(alternatives[1].id),
    );
    expect(html.indexOf(alternatives[1].id)).toBeLessThan(
      html.indexOf(alternatives[2].id),
    );
    expect(html).not.toMatch(/\bstrict\b|\bfunctional\b/i);
  });

  it('calculates each alternative macro from its own snapshot and portion quantity', () => {
    const html = render('en');
    const original = html.match(
      /<li[^>]*data-row="original"[^>]*>[\s\S]*?<\/li>/,
    )?.[0];
    expect(original).toBeDefined();

    const originalMacros = displayedMacros(chicken, '200');
    for (const [name, value] of Object.entries(originalMacros)) {
      expectMacro(original ?? '', name as keyof typeof originalMacros, value);
    }

    const cases = [
      { draft: alternatives[0], food: rice, value: '150' },
      { draft: alternatives[1], food: yogurt, value: '200' },
      { draft: alternatives[2], food: oats, value: '40' },
    ];

    for (const entry of cases) {
      const macros = displayedMacros(entry.food, entry.value);
      const alternativeRow = row(html, entry.draft.id);
      for (const [name, value] of Object.entries(macros)) {
        expectMacro(alternativeRow, name as keyof typeof macros, value);
      }
    }

    expect(row(html, alternatives[2].id)).toContain(
      '<span data-macro="calories">156<',
    );
  });

  it('requires a validated positive portion quantity before showing macros', () => {
    const valid = validateAlternativeDraft(alternatives[0], foods);
    expect(valid.calculation.macros).toEqual(
      computeNutritionMacro({
        snapshot: rice.snapshot,
        quantity: { value: '150', unit: 'g' },
      }).macros,
    );
    expect(valid.draft.quantity).toEqual({ value: '150', unit: 'g' });

    for (const value of ['', '0', '-1', 'abc', '1.2345', '  ']) {
      let thrown: unknown;
      try {
        validateAlternativeDraft(
          {
            ...alternatives[0],
            quantity: { value, unit: 'g' },
          },
          foods,
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(NutritionAlternativesEditorError);
      expect((thrown as NutritionAlternativesEditorError).code).toBe(
        'invalid_quantity',
      );
    }

    const html = render('en', {
      alternatives: [
        {
          ...alternatives[0],
          quantity: { value: '0', unit: 'g' },
        },
      ],
    });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]*-error"/);
    expect(html).toContain(
      getMessages('en')['nutritionAlternatives.invalidQuantity'],
    );
    expect(html).toContain(
      getMessages('en')['nutritionAlternatives.macrosUnavailable'],
    );
  });

  it('never adjusts quantities automatically and offers no AI or auto-adjust control', () => {
    const html = render('en');
    expect(html).not.toMatch(/\bAI\b/);
    expect(html).not.toMatch(/auto[- ]?adjust/i);
    expect(html).not.toContain('data-ai-auto-adjust');

    const seed = alternatives.slice(0, 2);
    const before = seed.map((alternative) => alternative.quantity);
    const next = addAlternativeDraft(
      seed,
      foods,
      item.snapshot.foodVersionId,
      '00000000-0000-4000-8000-000000000104',
    );
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2).map((alternative) => alternative.quantity)).toEqual(
      before,
    );
    expect(alternatives).toHaveLength(3);
    expect(item.quantity).toEqual({ value: '200', unit: 'g' });
  });

  it('shows no delta-versus-original comparison', () => {
    const html = render('en');
    expect(html).not.toContain('data-delta');
    expect(html).not.toMatch(/\bdelta\b|\bdifference\b/i);
    expect(html).not.toMatch(/\bvs\.?\s+original\b/i);
  });

  it('caps the list at three alternatives and explains why adding is unavailable', () => {
    expect(NUTRITION_MAX_ALTERNATIVES).toBe(3);
    const html = render('en');
    const addButton = html.match(
      /<button[^>]*data-testid="add-alternative"[^>]*>/,
    )?.[0];
    expect(addButton).toBeDefined();
    expect(addButton).toContain('disabled');
    expect(addButton).toContain('aria-disabled="true"');
    const describedBy = addButton?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain(
      getMessages('en')['nutritionAlternatives.addDisabledLimit'],
    );

    let thrown: unknown;
    try {
      addAlternativeDraft(
        alternatives,
        foods,
        item.snapshot.foodVersionId,
        '00000000-0000-4000-8000-000000000105',
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(NutritionAlternativesEditorError);
    expect((thrown as NutritionAlternativesEditorError).code).toBe(
      'max_alternatives_exceeded',
    );

    const two = alternatives.slice(0, 2);
    const added = addAlternativeDraft(
      two,
      foods,
      item.snapshot.foodVersionId,
      '00000000-0000-4000-8000-000000000106',
    );
    expect(added).toHaveLength(3);
    expect(two).toHaveLength(2);
    expect(new Set(added.map((alternative) => alternative.id)).size).toBe(3);
  });

  it('reorders and removes alternatives without changing their ids or quantities', () => {
    const moved = moveAlternativeDraft(alternatives, alternatives[1].id, 'up');
    expect(moved.map((alternative) => alternative.id)).toEqual([
      alternatives[1].id,
      alternatives[0].id,
      alternatives[2].id,
    ]);
    expect(moved[0]!.quantity).toEqual(alternatives[1].quantity);
    expect(
      moveAlternativeDraft(alternatives, alternatives[0].id, 'up'),
    ).toEqual(alternatives);
    expect(
      moveAlternativeDraft(alternatives, alternatives[2].id, 'down'),
    ).toEqual(alternatives);

    const removed = removeAlternativeDraft(alternatives, alternatives[1].id);
    expect(removed.map((alternative) => alternative.id)).toEqual([
      alternatives[0].id,
      alternatives[2].id,
    ]);
    expect(removed[0]!.quantity).toEqual(alternatives[0].quantity);

    let thrown: unknown;
    try {
      removeAlternativeDraft(alternatives, 'missing-alternative');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(NutritionAlternativesEditorError);
    expect((thrown as NutritionAlternativesEditorError).code).toBe(
      'unknown_alternative',
    );
  });

  it('updates one alternative in place and changes the id when its food is replaced', () => {
    const updated = setAlternativeQuantityDraft(
      alternatives,
      alternatives[0].id,
      { value: '175' },
    );
    expect(updated[0]!.quantity).toEqual({ value: '175', unit: 'g' });
    expect(updated[1]).toBe(alternatives[1]);
    expect(alternatives[0].quantity.value).toBe('150');

    const newId = '00000000-0000-4000-8000-000000000107';
    const replaced = replaceAlternativeFoodDraft(
      alternatives,
      alternatives[0].id,
      yogurt.snapshot.foodVersionId,
      newId,
      foods,
    );
    expect(replaced[0]).toMatchObject({
      id: newId,
      foodVersionId: yogurt.snapshot.foodVersionId,
      quantity: { value: '100', unit: 'g' },
    });
    expect(replaced[1]).toBe(alternatives[1]);
    expect(
      replaced.some((alternative) => alternative.id === alternatives[0].id),
    ).toBe(false);
  });

  it('renders Arabic RTL copy with localized food names and LTR-isolated numbers', () => {
    const html = render('ar');
    const ar = getMessages('ar');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(ar['nutritionAlternatives.title']);
    expect(html).toContain(ar['nutritionAlternatives.original']);
    expect(html).toContain(chicken.name.ar);
    expect(html).toContain(rice.name.ar);
    expect(html).toContain('<bdi dir="ltr">');

    const en = render('en');
    expect(en).toContain('dir="ltr"');
    expect(en).toContain(getMessages('en')['nutritionAlternatives.title']);
    expect(en).toContain(chicken.name.en);
    expect(en).not.toContain(chicken.name.ar);
  });

  it('renders Arabic UI digits with Arabic-Indic numerals', () => {
    const html = render('ar');
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    expect(text).toContain(
      new Intl.NumberFormat('ar', { numberingSystem: 'arab' }).format(3),
    );
    expect(text).not.toMatch(/[0-9]/);
  });

  it('localizes gram and milliliter units in Arabic while preserving Latin units in English', () => {
    const arMessages = getMessages('ar');
    const enMessages = getMessages('en');
    const milliliterFood: NutritionAlternativeFood = {
      name: { ar: 'ماء', en: 'Water' },
      snapshot: snapshot(
        '00000000-0000-4000-8000-000000000005',
        'ml',
        { calories: '0', protein: '0', carbs: '0', fat: '0' },
        {},
      ),
    };
    const html = render('ar', {
      foods: [milliliterFood],
      alternatives: [
        {
          id: '00000000-0000-4000-8000-000000000108',
          foodVersionId: milliliterFood.snapshot.foodVersionId,
          quantity: { value: '250', unit: 'ml' },
        },
      ],
    });
    expect(html).toContain(arMessages['nutritionAlternatives.milliliters']);
    expect(html).toContain(arMessages['nutritionAlternatives.grams']);
    expect(html).not.toContain(' ml');
    expect(html).not.toContain(' g');
    expect(getMessages('en')['nutritionAlternatives.grams']).toBe(
      enMessages['nutritionAlternatives.grams'],
    );
    expect(arMessages['nutritionAlternatives.grams']).not.toBe('g');
    expect(arMessages['nutritionAlternatives.milliliters']).not.toBe('ml');
  });

  it('resolves frozen food references to the terminal current version and shows removed targets as unavailable', () => {
    const removedVersion = '00000000-0000-4000-8000-000000000099';
    const html = render('en', {
      alternatives: [
        { ...alternatives[0], foodVersionId: removedVersion },
        alternatives[1],
      ],
      foods: [chicken, rice, yogurt],
      foodVersionResolution: [
        {
          sourceFoodVersionId: removedVersion,
          currentFoodVersionId: '00000000-0000-4000-8000-000000000013',
        },
        {
          sourceFoodVersionId: '00000000-0000-4000-8000-000000000013',
          currentFoodVersionId: rice.snapshot.foodVersionId,
        },
        {
          sourceFoodVersionId: alternatives[1].foodVersionId,
          currentFoodVersionId: null,
        },
      ],
    });
    const aliasedRow = row(html, alternatives[0].id);
    expect(aliasedRow).toContain(rice.name.en);
    expect(aliasedRow).toContain(
      'data-resolved-food-version-id="00000000-0000-4000-8000-000000000002"',
    );
    expectMacro(aliasedRow, 'calories', '195.0000');
    const unavailableRow = row(html, alternatives[1].id);
    expect(unavailableRow).toContain(
      getMessages('en')['nutritionAlternatives.unavailableFood'],
    );
    expect(unavailableRow).toContain('data-food-unavailable="true"');
    expect(unavailableRow).not.toContain('data-macro=');
  });

  it('provides keyboard up/down and remove actions with bounds disabled', () => {
    const html = render('en');
    const first = row(html, alternatives[0].id);
    const last = row(html, alternatives[2].id);
    expect(first).toContain('data-move="up"');
    expect(first).toContain('data-move="down"');
    expect(first).toMatch(/<button[^>]*data-move="up"[^>]*disabled/);
    expect(last).toMatch(/<button[^>]*data-move="down"[^>]*disabled/);
    expect(last).toContain('data-remove-alternative');
    expect(html).toContain('data-testid="confirm-dialog"');
  });

  it('formats macro values with the shared display rule without changing the exact calculation', () => {
    expect(formatNutritionMacroDisplay('247.5000', 'calories')).toBe('248');
    expect(formatNutritionMacroDisplay('155.6000', 'calories')).toBe('156');
    expect(formatNutritionMacroDisplay('99.4999', 'calories')).toBe('99');
    expect(formatNutritionMacroDisplay('0.0000', 'protein')).toBe('0');
    expect(formatNutritionMacroDisplay('5.6000', 'protein')).toBe('5.6');
    expect(formatNutritionMacroDisplay('9.9500', 'fat')).toBe('10');
    expect(
      computeNutritionMacro({
        snapshot: rice.snapshot,
        quantity: { value: '150', unit: 'g' },
      }).macros.calories,
    ).toBe('195.0000');
  });
});
