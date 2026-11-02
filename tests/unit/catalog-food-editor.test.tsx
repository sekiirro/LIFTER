import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FoodEditor } from '../../components/catalog/FoodEditor';
import { DuplicateReview } from '../../components/catalog/DuplicateReview';
import {
  buildFoodEditorInput,
  validateFoodEditorDraft,
  type FoodEditorDraft,
} from '../../lib/catalog/food-editor';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const base: FoodEditorDraft = {
  nameAr: 'أرز',
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
  servings: [{ labelAr: 'حصة', labelEn: 'serving', basisQuantity: '100' }],
  alternatives: [],
};

describe('food editor (T029)', () => {
  it('preserves canonical identity and separate weighing state in payload', () => {
    expect(buildFoodEditorInput(base)).toMatchObject({
      basis: 'g',
      productIdentity: 'rice',
      preparationIdentity: 'boiled',
      weighingState: 'cooked',
      kcal: 130,
      servings: [{ basisQuantity: 100 }],
    });
  });

  it('rejects missing nutrition and more than three alternatives', () => {
    expect(validateFoodEditorDraft({ ...base, kcal: '' }).kcal).toBe(
      'required',
    );
    expect(
      validateFoodEditorDraft({ ...base, productIdentity: '' }).productIdentity,
    ).toBe('required');
    expect(
      validateFoodEditorDraft({
        ...base,
        servings: [{ labelAr: '', labelEn: '', basisQuantity: '100' }],
      }).servingLabel,
    ).toBe('required');
    const alternatives = [1, 2, 3, 4].map((n) => ({
      foodId: `food-${n}`,
      portionQuantity: '50',
      portionUnit: 'g',
    }));
    expect(
      validateFoodEditorDraft({ ...base, alternatives }).alternatives,
    ).toBe('too_many');
    expect(
      validateFoodEditorDraft({
        ...base,
        alternatives: [
          {
            foodId: alternatives[0]!.foodId,
            portionQuantity: '0',
            portionUnit: 'g',
          },
        ],
      }).alternativePortions?.[0],
    ).toBe('positive');
  });

  it('renders bilingual named fields, warning-only kcal copy, and accessible errors', () => {
    const markup = renderToStaticMarkup(
      createElement(FoodEditor, {
        locale: 'en',
        initialDraft: { ...base, kcal: '200' },
        initialErrors: { name: 'required' },
      }),
    );
    expect(markup).toContain('per 100');
    expect(markup).toContain(en['catalog.foodKcalWarningOnly']);
    expect(markup).toContain('aria-describedby=');
    expect(markup).toContain('data-food-identity="canonical"');
    expect(
      renderToStaticMarkup(
        createElement(FoodEditor, { locale: 'ar', initialDraft: base }),
      ),
    ).toContain(ar['catalog.foodEditorTitle']);
  });

  it('renders pending, error, and success feedback without losing the submit control', () => {
    const saving = renderToStaticMarkup(
      createElement(FoodEditor, {
        locale: 'en',
        initialDraft: base,
        status: 'saving',
      }),
    );
    expect(saving).toContain('aria-busy="true"');
    expect(saving).toContain(en['catalog.foodSaving']);
    const failed = renderToStaticMarkup(
      createElement(FoodEditor, {
        locale: 'en',
        initialDraft: base,
        status: 'error',
      }),
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(en['catalog.foodSaveError']);
    const saved = renderToStaticMarkup(
      createElement(FoodEditor, {
        locale: 'en',
        initialDraft: base,
        status: 'success',
      }),
    );
    expect(saved).toContain(en['catalog.foodSaveSuccess']);
  });

  it('renders the explicit origin workspace field for non-PO creators', () => {
    const markup = renderToStaticMarkup(
      createElement(FoodEditor, {
        locale: 'en',
        role: 'trainer',
        workspaces: [{ id: 'ws-1', label: 'Current workspace' }],
        initialDraft: base,
      }),
    );
    expect(markup).toContain(en['catalog.foodOriginWorkspace']);
    expect(markup).toContain(en['catalog.foodChooseWorkspace']);
    expect(markup).toContain('value="ws-1"');
    expect(markup).not.toContain(en['catalog.foodNoOrigin']);
  });
});

describe('duplicate review (T030)', () => {
  const candidate = {
    id: 'f-1',
    names: { en: 'Cooked rice' },
    basis: 'g' as const,
    kcal: 130,
  };

  it('blocks exact duplicates with an existing entry and no creator/origin data', () => {
    const markup = renderToStaticMarkup(
      createElement(DuplicateReview, {
        locale: 'en',
        state: 'exact',
        candidates: [candidate],
        role: 'trainer',
      }),
    );
    expect(markup).toContain(en['catalog.duplicateExactTitle']);
    expect(markup).toContain('Cooked rice');
    expect(markup).not.toMatch(/creator|origin|workspace/i);
    expect(markup).not.toContain('type="submit"');
  });

  it('requires explicit confirmation for a near match and hides provenance outside PO', () => {
    const markup = renderToStaticMarkup(
      createElement(DuplicateReview, {
        locale: 'en',
        state: 'near',
        candidates: [candidate],
        role: 'trainer',
      }),
    );
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain(en['catalog.duplicateConfirm']);
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*>Continue with this food/,
    );
    expect(markup).not.toContain('data-testid="duplicate-provenance"');
  });
});
