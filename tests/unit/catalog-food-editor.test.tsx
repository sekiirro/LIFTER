import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodEditor } from '../../components/catalog/FoodEditor';
import { DuplicateReview } from '../../components/catalog/DuplicateReview';
import { selectExistingFood } from '../../components/catalog/DuplicateReview';
import {
  buildFoodEditorInput,
  clearResolvedMacroErrors,
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

let dom: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  dom = new Window();
  vi.stubGlobal('window', dom);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('HTMLElement', dom.HTMLElement);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = dom.document.createElement('div');
  dom.document.body.append(element);
  container = element as unknown as HTMLElement;
  root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.happyDOM.abort();
  vi.unstubAllGlobals();
});

describe('food editor (T029)', () => {
  it('uses one numeral system in every Arabic editor and duplicate text node', () => {
    const candidate = {
      id: 'food-existing',
      names: { ar: 'أرز مطبوخ', en: 'Cooked rice' },
      basis: 'g' as const,
      kcal: 130,
    };
    const editor = renderToStaticMarkup(
      createElement(FoodEditor, {
        locale: 'ar',
        initialDraft: base,
        status: 'ready',
      }),
    );
    const duplicate = renderToStaticMarkup(
      createElement(DuplicateReview, {
        locale: 'ar',
        role: 'trainer',
        state: 'near',
        candidates: [candidate],
      }),
    );
    for (const markup of [editor, duplicate]) {
      const visibleText = markup.replace(/<[^>]*>/g, ' ');
      expect(visibleText).not.toMatch(/[0-9]/);
      expect(visibleText).toMatch(/[\u0660-\u0669]/);
    }
    expect(editor).toContain('١٠٠');
    expect(duplicate).toContain('١٣٠');
  });

  it('exposes an exact-match selection action and returns the selected candidate', () => {
    const candidate = {
      id: 'food-existing',
      names: { en: 'Cooked rice' },
      basis: 'g' as const,
      kcal: 130,
    };
    const callback = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(DuplicateReview, {
        locale: 'en',
        role: 'trainer',
        state: 'exact',
        candidates: [candidate],
        onSelectExisting: callback,
      }),
    );
    expect(markup).toContain('select-existing-food-existing');
    selectExistingFood(candidate, callback);
    expect(callback).toHaveBeenCalledWith(candidate);
  });
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

  it('rejects blank alternative food ids and exposes the field error', async () => {
    const invalidDraft = {
      ...base,
      alternatives: [{ foodId: ' ', portionQuantity: '50', portionUnit: 'g' }],
    };
    expect(validateFoodEditorDraft(invalidDraft).alternativeFoods?.[0]).toBe(
      'required',
    );
    expect(buildFoodEditorInput(invalidDraft)).toBeNull();

    const onSubmit = vi.fn();
    await act(async () => {
      root.render(
        createElement(FoodEditor, {
          locale: 'en',
          initialDraft: invalidDraft,
          onSubmit,
        }),
      );
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(
        new dom.Event('submit', {
          bubbles: true,
          cancelable: true,
        }) as unknown as Event,
      );
    });
    const select = container.querySelector<HTMLSelectElement>(
      'select[id$="-alternative-0"]',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(select?.getAttribute('aria-invalid')).toBe('true');
    expect(select?.getAttribute('aria-describedby')).toMatch(
      /alternative-0-error/,
    );
    expect(container.textContent).toContain(en['catalog.foodErrorRequired']);
    expect(container.querySelector('a[href$="-alternative-0"]')).not.toBeNull();
  });

  it('clears alternative errors when a row is removed', async () => {
    const twoAlternatives = {
      ...base,
      alternatives: [
        { foodId: '', portionQuantity: '', portionUnit: '' },
        { foodId: '', portionQuantity: '', portionUnit: '' },
      ],
    };
    await act(async () => {
      root.render(
        createElement(FoodEditor, {
          locale: 'en',
          initialDraft: twoAlternatives,
          initialErrors: {
            alternativeFoods: ['required', 'required'],
            alternativePortions: ['positive', 'positive'],
            alternativeUnits: [true, true],
            alternatives: 'too_many',
          },
        }),
      );
    });
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find(
          (button) =>
            button.textContent === en['catalog.foodAlternativeRemove'],
        )
        ?.dispatchEvent(
          new dom.MouseEvent('click', { bubbles: true }) as unknown as Event,
        );
    });
    expect(
      container.querySelectorAll('select[id*="-alternative-"]'),
    ).toHaveLength(1);
    expect(container.querySelector('a[href$="-alternative-0"]')).toBeNull();
    expect(container.querySelector('[id$="-alternatives-error"]')).toBeNull();
    expect(
      container
        .querySelector('select[id$="-alternative-0"]')
        ?.getAttribute('aria-invalid'),
    ).toBeNull();
    expect(
      container
        .querySelector('input[id$="-portion-0"]')
        ?.getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('clears all dependent macro errors once the macro sum is valid', () => {
    const invalid = { ...base, protein: '40', carbs: '40', fat: '30' };
    const errors = validateFoodEditorDraft(invalid);
    expect(errors).toMatchObject({
      protein: 'macros_exceed_basis',
      carbs: 'macros_exceed_basis',
      fat: 'macros_exceed_basis',
    });
    expect(
      clearResolvedMacroErrors(errors, { ...invalid, fat: '20' }),
    ).not.toHaveProperty('protein');
    expect(
      clearResolvedMacroErrors(errors, { ...invalid, fat: '20' }),
    ).not.toHaveProperty('carbs');
    expect(
      clearResolvedMacroErrors(errors, { ...invalid, fat: '20' }),
    ).not.toHaveProperty('fat');
    expect(clearResolvedMacroErrors(errors, { ...invalid, fat: '30' })).toEqual(
      errors,
    );
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
    expect(markup).toContain(
      'Calories differ from the 4/4/9 macro estimate. This warning will not prevent saving.',
    );
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

describe('food editor error-summary focus', () => {
  it('does not steal focus from an edited field after an invalid submit', async () => {
    const invalidDraft = { ...base, nameAr: '', kcal: '-1', protein: '101' };
    await act(async () => {
      root.render(
        createElement(FoodEditor, {
          locale: 'en',
          initialDraft: invalidDraft,
        }),
      );
    });
    const form = container.querySelector('form');
    const protein = container.querySelector<HTMLInputElement>(
      'input[id$="-protein"]',
    );
    expect(form).not.toBeNull();
    expect(protein).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(
        new dom.Event('submit', {
          bubbles: true,
          cancelable: true,
        }) as unknown as Event,
      );
    });
    const summary = container.querySelector('[id$="-error-summary"]');
    expect(dom.document.activeElement).toBe(summary);
    let refocusedSummary = false;
    summary!.addEventListener('focus', () => {
      refocusedSummary = true;
    });

    await act(async () => {
      protein!.focus();
      const setter = Object.getOwnPropertyDescriptor(
        dom.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(protein, '3');
      const reactPropsKey = Object.keys(protein!).find((key) =>
        key.startsWith('__reactProps'),
      );
      expect(reactPropsKey).toBeDefined();
      const props = (
        protein as unknown as Record<
          string,
          { onChange: (event: { currentTarget: HTMLInputElement }) => void }
        >
      )[reactPropsKey!];
      if (!props) throw new Error('React input props missing');
      props.onChange({ currentTarget: protein! });
    });

    expect(protein!.value).toBe('3');
    expect(container.querySelector('[id$="-error-summary"]')).not.toBeNull();
    expect(dom.document.activeElement).toBe(protein);
    expect(refocusedSummary).toBe(false);
  });
});
