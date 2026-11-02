import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NutritionPlanEditor } from '../../components/plans/NutritionPlanEditor';
import { formatDigits } from '../../lib/i18n/format-digits';
import {
  formatMacroGrams,
  formatNutritionMacroDisplay,
} from '../../lib/plans/nutrition/display';
import type { NutritionDocument } from '../../lib/plans/nutrition/schema';

describe('S27-PO-2 macro gram display', () => {
  it('shows one decimal below 10 g and an integer at or above 10 g', () => {
    expect(formatMacroGrams('0.4')).toBe('0.4');
    expect(formatMacroGrams('0.04')).toBe('0');
    expect(formatMacroGrams('0.05')).toBe('0.1');
    expect(formatMacroGrams('9.94')).toBe('9.9');
    expect(formatMacroGrams('9.95')).toBe('10');
    expect(formatMacroGrams('10.4')).toBe('10');
    expect(formatMacroGrams('123.5')).toBe('124');
  });

  it('rounds half-up display values without changing stored calculation values', () => {
    expect(formatMacroGrams('9.9500')).toBe('10');
    expect(formatMacroGrams('0.0500')).toBe('0.1');
    expect(formatMacroGrams('0.0000')).toBe('0');
    expect(formatMacroGrams('10.0000')).toBe('10');
  });

  it('localizes Arabic digits with the existing helper and keeps the app separator', () => {
    const arabic = formatMacroGrams('0.4', 'ar');
    expect(arabic).toBe(formatDigits('0.4', 'ar'));
    expect(arabic).toContain('٠');
    expect(arabic).toContain('.');
    expect(formatMacroGrams('0.4', 'en')).toBe('0.4');
  });

  it('keeps calorie display as an integer', () => {
    expect(formatNutritionMacroDisplay('123.5', 'calories')).toBe('124');
    expect(formatNutritionMacroDisplay('9.95', 'calories')).toBe('10');
    expect(formatNutritionMacroDisplay('0.4', 'protein')).toBe('0.4');
    expect(formatNutritionMacroDisplay('0.8', 'fiber')).toBe('0.8');
  });

  it('renders meals 0.4 + 0.4 and a day total of 0.8 instead of 0 + 0 versus 1', () => {
    const foodId = '00000000-0000-4000-8000-000000000003';
    const item = (id: string) => ({
      id,
      foodVersionId: foodId,
      quantity: { value: '0.4', unit: 'g' },
      alternatives: [],
    });
    const document: NutritionDocument = {
      structure: {
        kind: 'single_day',
        implicitDayTypeId: '00000000-0000-4000-8000-000000000001',
      },
      dayTypes: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Training',
          trainingDay: true,
        },
      ],
      meals: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          conditional: 'always',
          items: [item('00000000-0000-4000-8000-000000000011')],
        },
        {
          id: '00000000-0000-4000-8000-000000000020',
          conditional: 'always',
          items: [item('00000000-0000-4000-8000-000000000021')],
        },
      ],
    };

    const html = renderToStaticMarkup(
      createElement(NutritionPlanEditor, {
        locale: 'en',
        document,
        foods: [
          {
            name: { ar: 'بروتين', en: 'Protein' },
            snapshot: {
              foodVersionId: foodId,
              basis: 'g',
              per100: {
                calories: '0.00',
                protein: '100.00',
                carbs: '0.00',
                fat: '0.00',
              },
              servingEquivalences: { g: '1' },
            },
          },
        ],
      }),
    );

    const mealTotals = html.match(
      /<dl[^>]*aria-label="Meal totals"[^>]*>[\s\S]*?<\/dl>/g,
    );
    expect(mealTotals).toHaveLength(2);
    for (const meal of mealTotals ?? []) expect(meal).toContain('0.4');

    const dayTotals = html.match(
      /<dl[^>]*aria-label="Day totals"[^>]*>[\s\S]*?<\/dl>/,
    )?.[0];
    expect(dayTotals).toBeDefined();
    expect(dayTotals).toContain('0.8');
  });
});
