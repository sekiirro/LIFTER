import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  NutritionPlanEditor,
  type NutritionPlanEditorProps,
} from '../../components/plans/NutritionPlanEditor';
import { getMessages } from '../../lib/i18n';
import type { NutritionDocument } from '../../lib/plans/nutrition/schema';

const trainingId = '00000000-0000-4000-8000-000000000001';
const restId = '00000000-0000-4000-8000-000000000002';
const foodId = '00000000-0000-4000-8000-000000000003';
const document: NutritionDocument = {
  structure: {
    kind: 'seven_day',
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      dayTypeId: dayIndex ? restId : trainingId,
    })),
  },
  dayTypes: [
    { id: trainingId, name: 'Training', trainingDay: true },
    { id: restId, name: 'Rest', trainingDay: false },
  ],
  meals: [
    {
      id: '00000000-0000-4000-8000-000000000010',
      conditional: 'always',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          foodVersionId: foodId,
          quantity: { value: '100', unit: 'g' },
          alternatives: [],
        },
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000020',
      conditional: 'training_days_only',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000021',
          foodVersionId: foodId,
          quantity: { value: '25', unit: 'g' },
          alternatives: [],
        },
      ],
    },
  ],
};
const props: NutritionPlanEditorProps = {
  locale: 'ar',
  document,
  foods: [
    {
      name: { ar: 'أرز', en: 'Rice' },
      snapshot: {
        foodVersionId: foodId,
        basis: 'g',
        per100: {
          calories: '100.00',
          protein: '10.00',
          carbs: '20.00',
          fat: '5.00',
        },
        servingEquivalences: { g: '1' },
      },
    },
  ],
};
function render(overrides: Partial<NutritionPlanEditorProps> = {}) {
  return renderToStaticMarkup(
    createElement(NutritionPlanEditor, { ...props, ...overrides }),
  );
}

describe('F18 nutrition plan editor', () => {
  it('renders Arabic RTL and English LTR labels and exact localized totals', () => {
    const ar = render();
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain(getMessages('ar')['nutritionPlan.sevenDay']);
    expect(ar).toContain('aria-live="polite"');
    expect(ar).toContain(
      new Intl.NumberFormat('ar', { numberingSystem: 'arab' }).format(125),
    );
    const en = render({ locale: 'en' });
    expect(en).toContain('dir="ltr"');
    expect(en).toContain(getMessages('en')['nutritionPlan.dayTotals']);
    expect(en).toContain('Rice');
  });

  it('exposes keyboard move alternatives and disabled boundaries', () => {
    const html = render();
    expect(html).toContain(getMessages('ar')['nutritionPlan.moveUp']);
    expect(html).toContain(getMessages('ar')['nutritionPlan.moveDown']);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/aria-label="نقل الوجبة لأعلى"[^>]*disabled/);
  });

  it('renders loading, empty, error, and conflict states accessibly', () => {
    expect(render({ state: 'loading' })).toContain('aria-busy="true"');
    expect(render({ state: 'loading' })).toContain(
      getMessages('ar')['nutritionPlan.loading'],
    );
    expect(render({ state: 'empty' })).toContain(
      getMessages('ar')['nutritionPlan.emptyTitle'],
    );
    expect(render({ state: 'error', onRetry: vi.fn() })).toContain(
      'role="alert"',
    );
    expect(render({ state: 'conflict' })).toContain(
      getMessages('ar')['nutritionPlan.conflictTitle'],
    );
  });
});
