'use client';

import { useId, useState, type CSSProperties } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages, type Messages } from '../../lib/i18n';
import { NUTRITION_ID_CONTINUITY_RULES } from '../../lib/plans/nutrition/id-continuity';
import {
  computeNutritionMacro,
  NutritionMacroError,
  type NutritionFoodSnapshot,
  type NutritionMacroCalculation,
  type NutritionMacroValues,
} from '../../lib/plans/nutrition/macros';
import type { Quantity } from '../../lib/plans/nutrition/schema';

export const NUTRITION_MAX_ALTERNATIVES = 3;

export type LocalizedFoodName = {
  ar: string;
  en: string;
};

export type NutritionAlternativeFood = {
  snapshot: NutritionFoodSnapshot;
  name: LocalizedFoodName;
};

export type NutritionAlternativesItem = {
  id: string;
  snapshot: NutritionFoodSnapshot;
  quantity: Quantity;
  name: LocalizedFoodName;
};

export type NutritionAlternativeDraft = {
  id: string;
  foodVersionId: string;
  quantity: Quantity;
};

export type NutritionAlternativesEditorProps = {
  locale: Locale;
  item: NutritionAlternativesItem;
  foods: readonly NutritionAlternativeFood[];
  alternatives: readonly NutritionAlternativeDraft[];
  /** Mockable catalog projection: source version -> terminal current version, or null when removed. */
  foodVersionResolution?: readonly {
    sourceFoodVersionId: string;
    currentFoodVersionId: string | null;
  }[];
  onAlternativesChange?: (alternatives: NutritionAlternativeDraft[]) => void;
  disabled?: boolean;
};

export type NutritionAlternativesEditorErrorCode =
  | 'max_alternatives_exceeded'
  | 'invalid_quantity'
  | 'unknown_food'
  | 'unknown_alternative'
  | 'duplicate_alternative_id'
  | 'invalid_macro_value';

export class NutritionAlternativesEditorError extends Error {
  readonly code: NutritionAlternativesEditorErrorCode;

  constructor(code: NutritionAlternativesEditorErrorCode, message: string) {
    super(message);
    this.name = 'NutritionAlternativesEditorError';
    this.code = code;
  }
}

export type ValidatedNutritionAlternativeDraft = {
  draft: NutritionAlternativeDraft;
  calculation: NutritionMacroCalculation;
};

const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const QUANTITY_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/;
const ARABIC_INDIC_DIGITS = Array.from({ length: 10 }, (_, digit) =>
  new Intl.NumberFormat('ar', {
    useGrouping: false,
    numberingSystem: 'arab',
  }).format(digit),
);

let fallbackAlternativeSequence = 0;

function createAlternativeId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  fallbackAlternativeSequence += 1;
  return `00000000-0000-4000-8000-${fallbackAlternativeSequence
    .toString()
    .padStart(12, '0')}`;
}

function findFood(
  foods: readonly NutritionAlternativeFood[],
  foodVersionId: string,
): NutritionAlternativeFood | undefined {
  return foods.find((food) => food.snapshot.foodVersionId === foodVersionId);
}

function normalizeQuantity(quantity: Quantity): Quantity {
  if (
    !quantity ||
    typeof quantity.value !== 'string' ||
    typeof quantity.unit !== 'string'
  ) {
    throw new NutritionAlternativesEditorError(
      'invalid_quantity',
      'quantity value and unit must be strings',
    );
  }

  const value = quantity.value.trim();
  const unit = quantity.unit.trim();
  if (!QUANTITY_DECIMAL_PATTERN.test(value) || !/[1-9]/.test(value)) {
    throw new NutritionAlternativesEditorError(
      'invalid_quantity',
      'quantity value must be greater than zero with at most three decimal places',
    );
  }
  if (!unit) {
    throw new NutritionAlternativesEditorError(
      'invalid_quantity',
      'quantity unit is required',
    );
  }

  return { value, unit };
}

export function validateAlternativeDraft(
  draft: NutritionAlternativeDraft,
  foods: readonly NutritionAlternativeFood[],
): ValidatedNutritionAlternativeDraft {
  if (!draft.id || typeof draft.id !== 'string') {
    throw new NutritionAlternativesEditorError(
      'unknown_alternative',
      'alternative id is required',
    );
  }

  const food = findFood(foods, draft.foodVersionId);
  if (!food) {
    throw new NutritionAlternativesEditorError(
      'unknown_food',
      `food ${draft.foodVersionId} is not available`,
    );
  }

  const quantity = normalizeQuantity(draft.quantity);
  try {
    const calculation = computeNutritionMacro({
      snapshot: food.snapshot,
      quantity,
    });
    return {
      draft: { ...draft, quantity },
      calculation,
    };
  } catch (error) {
    if (error instanceof NutritionMacroError) {
      throw new NutritionAlternativesEditorError(
        'invalid_quantity',
        error.message,
      );
    }
    throw error;
  }
}

export function addAlternativeDraft(
  alternatives: readonly NutritionAlternativeDraft[],
  foods: readonly NutritionAlternativeFood[],
  itemFoodVersionId: string,
  alternativeId: string,
): NutritionAlternativeDraft[] {
  if (alternatives.length >= NUTRITION_MAX_ALTERNATIVES) {
    throw new NutritionAlternativesEditorError(
      'max_alternatives_exceeded',
      `at most ${NUTRITION_MAX_ALTERNATIVES} alternatives are allowed`,
    );
  }
  if (alternatives.some((alternative) => alternative.id === alternativeId)) {
    throw new NutritionAlternativesEditorError(
      'duplicate_alternative_id',
      `alternative id ${alternativeId} is already in use`,
    );
  }

  const food =
    foods.find(
      (candidate) => candidate.snapshot.foodVersionId !== itemFoodVersionId,
    ) ?? foods[0];
  if (!food) {
    throw new NutritionAlternativesEditorError(
      'unknown_food',
      'no alternative food is available',
    );
  }

  const draft: NutritionAlternativeDraft = {
    id: alternativeId,
    foodVersionId: food.snapshot.foodVersionId,
    quantity: { value: '100', unit: food.snapshot.basis },
  };
  validateAlternativeDraft(draft, foods);
  return [...alternatives, draft];
}

export function removeAlternativeDraft(
  alternatives: readonly NutritionAlternativeDraft[],
  alternativeId: string,
): NutritionAlternativeDraft[] {
  if (!alternatives.some((alternative) => alternative.id === alternativeId)) {
    throw new NutritionAlternativesEditorError(
      'unknown_alternative',
      `alternative ${alternativeId} was not found`,
    );
  }
  return alternatives.filter((alternative) => alternative.id !== alternativeId);
}

export function moveAlternativeDraft(
  alternatives: readonly NutritionAlternativeDraft[],
  alternativeId: string,
  direction: 'up' | 'down',
): NutritionAlternativeDraft[] {
  const index = alternatives.findIndex(
    (alternative) => alternative.id === alternativeId,
  );
  if (index === -1) {
    throw new NutritionAlternativesEditorError(
      'unknown_alternative',
      `alternative ${alternativeId} was not found`,
    );
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= alternatives.length) {
    return [...alternatives];
  }

  const next = [...alternatives];
  const moved = next[index];
  if (!moved) {
    return [...alternatives];
  }
  next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function setAlternativeQuantityDraft(
  alternatives: readonly NutritionAlternativeDraft[],
  alternativeId: string,
  patch: { value?: string; unit?: string },
): NutritionAlternativeDraft[] {
  if (!alternatives.some((alternative) => alternative.id === alternativeId)) {
    throw new NutritionAlternativesEditorError(
      'unknown_alternative',
      `alternative ${alternativeId} was not found`,
    );
  }

  return alternatives.map((alternative) => {
    if (alternative.id !== alternativeId) return alternative;
    return {
      ...alternative,
      quantity: {
        value: patch.value ?? alternative.quantity.value,
        unit: patch.unit ?? alternative.quantity.unit,
      },
    };
  });
}

export function replaceAlternativeFoodDraft(
  alternatives: readonly NutritionAlternativeDraft[],
  alternativeId: string,
  foodVersionId: string,
  nextAlternativeId: string,
  foods: readonly NutritionAlternativeFood[],
): NutritionAlternativeDraft[] {
  const current = alternatives.find(
    (alternative) => alternative.id === alternativeId,
  );
  if (!current) {
    throw new NutritionAlternativesEditorError(
      'unknown_alternative',
      `alternative ${alternativeId} was not found`,
    );
  }
  if (current.foodVersionId === foodVersionId) {
    return [...alternatives];
  }

  const food = findFood(foods, foodVersionId);
  if (!food) {
    throw new NutritionAlternativesEditorError(
      'unknown_food',
      `food ${foodVersionId} is not available`,
    );
  }

  const continuityRule = NUTRITION_ID_CONTINUITY_RULES.replaceAlternativeFood;
  const replacementId =
    continuityRule.alternativeId === 'replace' ? nextAlternativeId : current.id;
  if (alternatives.some((alternative) => alternative.id === replacementId)) {
    throw new NutritionAlternativesEditorError(
      'duplicate_alternative_id',
      `alternative id ${replacementId} is already in use`,
    );
  }

  const replacement: NutritionAlternativeDraft = {
    id: replacementId,
    foodVersionId,
    quantity: { value: '100', unit: food.snapshot.basis },
  };
  validateAlternativeDraft(replacement, foods);

  return alternatives.map((alternative) =>
    alternative.id === alternativeId ? replacement : alternative,
  );
}

export function formatNutritionMacroInteger(
  value: string,
  locale: Locale = 'en',
): string {
  const match = CANONICAL_DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new NutritionAlternativesEditorError(
      'invalid_macro_value',
      `macro value ${value} is not a non-negative canonical decimal`,
    );
  }

  const whole = BigInt(value.trim().split('.')[0]!);
  const fraction = match[1] ?? '';
  const integer = (
    fraction[0] !== undefined && fraction[0] >= '5' ? whole + 1n : whole
  ).toString();
  return localizeDigits(integer, locale);
}

function localizeDigits(value: string, locale: Locale): string {
  if (locale === 'en') return value;
  return value.replace(
    /[0-9]/g,
    (digit) => ARABIC_INDIC_DIGITS[Number(digit)]!,
  );
}

function toCanonicalDigits(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/\u066b/g, '.');
}

function macroUnit(
  name: keyof NutritionMacroValues,
  messages: Messages,
): string {
  return name === 'calories'
    ? messages['nutritionAlternatives.kilocalories']
    : messages['nutritionAlternatives.grams'];
}

function localizedQuantityUnit(
  unit: string,
  locale: Locale,
  messages: Messages,
) {
  if (locale === 'ar' && unit === 'g')
    return messages['nutritionAlternatives.grams'];
  if (locale === 'ar' && unit === 'ml')
    return messages['nutritionAlternatives.milliliters'];
  return unit;
}

function MacroSummary({
  macros,
  label,
  messages,
  locale,
}: {
  macros: NutritionMacroValues;
  label: string;
  messages: Messages;
  locale: Locale;
}) {
  const nutrientLabels: Record<keyof NutritionMacroValues, string> = {
    calories: messages['nutritionAlternatives.calories'],
    protein: messages['nutritionAlternatives.protein'],
    carbs: messages['nutritionAlternatives.carbs'],
    fat: messages['nutritionAlternatives.fat'],
  };

  return (
    <div style={macroBlockStyle}>
      <p style={macroHeadingStyle}>{label}</p>
      <dl style={macroGridStyle}>
        {(Object.keys(nutrientLabels) as (keyof NutritionMacroValues)[]).map(
          (name) => (
            <div key={name} style={macroItemStyle}>
              <dt style={macroLabelStyle}>{nutrientLabels[name]}</dt>
              <dd style={macroValueStyle}>
                <Bidi dir="ltr">
                  <span data-macro={name}>
                    {formatNutritionMacroInteger(macros[name], locale)}
                  </span>{' '}
                  <span>{macroUnit(name, messages)}</span>
                </Bidi>
              </dd>
            </div>
          ),
        )}
      </dl>
    </div>
  );
}

function unitOptions(food: NutritionAlternativeFood | undefined): string[] {
  if (!food) return [];
  return [
    food.snapshot.basis,
    ...Object.keys(food.snapshot.servingEquivalences),
  ].filter((unit, index, all) => all.indexOf(unit) === index);
}

export function NutritionPlanAlternativesEditor({
  locale,
  item,
  foods,
  alternatives: initialAlternatives,
  foodVersionResolution = [],
  onAlternativesChange,
  disabled = false,
}: NutritionAlternativesEditorProps) {
  const messages = getMessages(locale);
  const idBase = useId();
  const titleId = `${idBase}-title`;
  const limitId = `${idBase}-limit`;
  const [alternatives, setAlternatives] = useState<NutritionAlternativeDraft[]>(
    () =>
      initialAlternatives.map((alternative) => ({
        ...alternative,
        quantity: { ...alternative.quantity },
      })),
  );
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function resolveFoodVersion(sourceFoodVersionId: string): string | null {
    let currentFoodVersionId: string | null = sourceFoodVersionId;
    const visited = new Set<string>();
    while (currentFoodVersionId !== null) {
      if (visited.has(currentFoodVersionId)) return null;
      visited.add(currentFoodVersionId);
      const projection = foodVersionResolution.find(
        (entry) => entry.sourceFoodVersionId === currentFoodVersionId,
      );
      if (!projection) return currentFoodVersionId;
      currentFoodVersionId = projection.currentFoodVersionId;
    }
    return null;
  }

  function describeError(error: unknown): string {
    if (error instanceof NutritionAlternativesEditorError) {
      if (error.code === 'invalid_quantity') {
        return messages['nutritionAlternatives.invalidQuantity'];
      }
      if (error.code === 'unknown_food') {
        return messages['nutritionAlternatives.unavailableFood'];
      }
      if (error.code === 'max_alternatives_exceeded') {
        return messages['nutritionAlternatives.addDisabledLimit'];
      }
    }
    return messages['nutritionAlternatives.errorTitle'];
  }

  function commit(next: NutritionAlternativeDraft[]) {
    setAlternatives(next);
    setActionError(null);
    onAlternativesChange?.(next);
  }

  function handleAdd() {
    if (disabled) return;
    try {
      commit(
        addAlternativeDraft(
          alternatives,
          foods,
          item.snapshot.foodVersionId,
          createAlternativeId(),
        ),
      );
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  function handleQuantityChange(
    alternativeId: string,
    patch: { value?: string; unit?: string },
  ) {
    if (disabled) return;
    try {
      commit(setAlternativeQuantityDraft(alternatives, alternativeId, patch));
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  function handleFoodChange(alternativeId: string, foodVersionId: string) {
    if (disabled) return;
    try {
      commit(
        replaceAlternativeFoodDraft(
          alternatives,
          alternativeId,
          foodVersionId,
          createAlternativeId(),
          foods,
        ),
      );
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  function handleMove(alternativeId: string, direction: 'up' | 'down') {
    if (disabled) return;
    try {
      commit(moveAlternativeDraft(alternatives, alternativeId, direction));
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  function handleConfirmRemove() {
    if (!pendingRemovalId) return;
    try {
      commit(removeAlternativeDraft(alternatives, pendingRemovalId));
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setPendingRemovalId(null);
    }
  }

  let originalCalculation: NutritionMacroCalculation | null = null;
  try {
    originalCalculation = computeNutritionMacro({
      snapshot: item.snapshot,
      quantity: item.quantity,
    });
  } catch {
    originalCalculation = null;
  }

  const atMax = alternatives.length >= NUTRITION_MAX_ALTERNATIVES;

  return (
    <Card
      as="section"
      aria-labelledby={titleId}
      data-testid="nutrition-alternatives-editor"
      dir={dirFor(locale)}
      lang={locale}
      style={rootStyle}
    >
      <header style={headerStyle}>
        <div style={headingGroupStyle}>
          <h2 id={titleId} style={titleStyle}>
            {messages['nutritionAlternatives.title']}
          </h2>
          <p style={mutedStyle}>{messages['nutritionAlternatives.intro']}</p>
        </div>
        <p style={noteStyle}>{messages['nutritionAlternatives.manualOnly']}</p>
      </header>

      <div style={toolbarStyle}>
        <p id={limitId} style={mutedStyle}>
          {atMax
            ? messages['nutritionAlternatives.addDisabledLimit']
            : messages['nutritionAlternatives.limitHelp']}
        </p>
        <Button
          data-testid="add-alternative"
          onClick={handleAdd}
          disabled={disabled || atMax}
          aria-describedby={limitId}
        >
          {messages['nutritionAlternatives.add']}
        </Button>
      </div>

      {actionError && (
        <Alert
          tone="error"
          title={messages['nutritionAlternatives.errorTitle']}
        >
          <p>{actionError}</p>
        </Alert>
      )}

      <ol
        aria-label={messages['nutritionAlternatives.unifiedListLabel']}
        data-testid="alternatives-unified-list"
        style={listStyle}
      >
        <li
          data-row="original"
          data-food-version-id={item.snapshot.foodVersionId}
          style={originalRowStyle}
        >
          <div style={rowHeaderStyle}>
            <div style={rowIdentityStyle}>
              <p style={eyebrowStyle}>
                {messages['nutritionAlternatives.original']}
              </p>
              <p style={foodNameStyle}>
                <Bidi>{item.name[locale]}</Bidi>
              </p>
            </div>
            <p style={quantityReadoutStyle}>
              <Bidi dir="ltr">
                {localizeDigits(item.quantity.value, locale)}{' '}
                {localizedQuantityUnit(item.quantity.unit, locale, messages)}
              </Bidi>
            </p>
          </div>
          {originalCalculation ? (
            <MacroSummary
              macros={originalCalculation.macros}
              label={messages['nutritionAlternatives.calculatedMacros']}
              messages={messages}
              locale={locale}
            />
          ) : (
            <p role="status" style={mutedStyle}>
              {messages['nutritionAlternatives.macrosUnavailable']}
            </p>
          )}
        </li>

        {alternatives.map((alternative, index) => {
          const controlId = `${idBase}-${index}-${alternative.id}`;
          const resolvedFoodVersionId = resolveFoodVersion(
            alternative.foodVersionId,
          );
          const food = resolvedFoodVersionId
            ? findFood(foods, resolvedFoodVersionId)
            : undefined;
          const unavailable = !food;
          let validation: ValidatedNutritionAlternativeDraft | null = null;
          let rowError: unknown = null;
          if (food && resolvedFoodVersionId) {
            try {
              validation = validateAlternativeDraft(
                { ...alternative, foodVersionId: resolvedFoodVersionId },
                foods,
              );
            } catch (error) {
              rowError = error;
            }
          }
          const quantityError =
            rowError instanceof NutritionAlternativesEditorError &&
            rowError.code === 'invalid_quantity'
              ? messages['nutritionAlternatives.invalidQuantity']
              : undefined;
          const units = unitOptions(food);
          const foodName =
            food?.name[locale] ??
            messages['nutritionAlternatives.unavailableFood'];

          return (
            <li
              key={alternative.id}
              data-row="alternative"
              data-alternative-id={alternative.id}
              data-food-version-id={alternative.foodVersionId}
              data-resolved-food-version-id={food?.snapshot.foodVersionId}
              data-food-unavailable={unavailable || undefined}
              style={rowStyle}
            >
              <div style={rowHeaderStyle}>
                <div style={rowIdentityStyle}>
                  <p style={eyebrowStyle}>
                    {messages['nutritionAlternatives.alternative']}{' '}
                    <Bidi dir="ltr">
                      {localizeDigits(String(index + 1), locale)}
                    </Bidi>
                  </p>
                  <p style={foodNameStyle}>
                    <Bidi>{foodName}</Bidi>
                  </p>
                </div>
                <div
                  role="group"
                  aria-label={messages['nutritionAlternatives.actionsLabel']}
                  style={actionsStyle}
                >
                  <Button
                    variant="secondary"
                    data-move="up"
                    aria-label={messages['nutritionAlternatives.moveUp']}
                    disabled={disabled || index === 0}
                    onClick={() => handleMove(alternative.id, 'up')}
                  >
                    {messages['nutritionAlternatives.moveUp']}
                  </Button>
                  <Button
                    variant="secondary"
                    data-move="down"
                    aria-label={messages['nutritionAlternatives.moveDown']}
                    disabled={disabled || index === alternatives.length - 1}
                    onClick={() => handleMove(alternative.id, 'down')}
                  >
                    {messages['nutritionAlternatives.moveDown']}
                  </Button>
                  <Button
                    variant="destructive"
                    data-remove-alternative
                    aria-label={messages['nutritionAlternatives.remove']}
                    disabled={disabled}
                    onClick={() => setPendingRemovalId(alternative.id)}
                  >
                    {messages['nutritionAlternatives.remove']}
                  </Button>
                </div>
              </div>

              <div style={fieldsStyle}>
                <label style={fieldLabelStyle} htmlFor={`${controlId}-food`}>
                  {messages['nutritionAlternatives.food']}
                  <select
                    id={`${controlId}-food`}
                    value={resolvedFoodVersionId ?? alternative.foodVersionId}
                    disabled={disabled}
                    onChange={(event) =>
                      handleFoodChange(alternative.id, event.target.value)
                    }
                    style={selectStyle}
                  >
                    {unavailable && (
                      <option value={alternative.foodVersionId}>
                        {messages['nutritionAlternatives.unavailableFood']}
                      </option>
                    )}
                    {foods
                      .filter(
                        (option) =>
                          !unavailable ||
                          option.snapshot.foodVersionId !==
                            alternative.foodVersionId,
                      )
                      .map((option) => (
                        <option
                          key={option.snapshot.foodVersionId}
                          value={option.snapshot.foodVersionId}
                        >
                          {option.name[locale]}
                        </option>
                      ))}
                  </select>
                </label>

                <Field
                  label={messages['nutritionAlternatives.quantity']}
                  hint={messages['nutritionAlternatives.quantityHint']}
                  error={quantityError}
                  inputProps={{
                    id: `${controlId}-quantity`,
                    value: localizeDigits(alternative.quantity.value, locale),
                    disabled,
                    dir: 'ltr',
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    onChange: (event) =>
                      handleQuantityChange(alternative.id, {
                        value: toCanonicalDigits(event.target.value),
                      }),
                  }}
                />

                <label style={fieldLabelStyle} htmlFor={`${controlId}-unit`}>
                  {messages['nutritionAlternatives.unit']}
                  <select
                    id={`${controlId}-unit`}
                    value={alternative.quantity.unit}
                    disabled={disabled}
                    onChange={(event) =>
                      handleQuantityChange(alternative.id, {
                        unit: event.target.value,
                      })
                    }
                    style={selectStyle}
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {localizedQuantityUnit(unit, locale, messages)}
                      </option>
                    ))}
                    {!units.includes(alternative.quantity.unit) && (
                      <option value={alternative.quantity.unit}>
                        {localizedQuantityUnit(
                          alternative.quantity.unit,
                          locale,
                          messages,
                        )}
                      </option>
                    )}
                  </select>
                </label>
              </div>

              {unavailable && (
                <Alert
                  tone="warning"
                  title={messages['nutritionAlternatives.unavailableFood']}
                />
              )}

              {validation ? (
                <MacroSummary
                  macros={validation.calculation.macros}
                  label={messages['nutritionAlternatives.calculatedMacros']}
                  messages={messages}
                  locale={locale}
                />
              ) : (
                !unavailable && (
                  <p role="status" style={mutedStyle}>
                    {messages['nutritionAlternatives.macrosUnavailable']}
                  </p>
                )
              )}
            </li>
          );
        })}
      </ol>

      {alternatives.length === 0 && (
        <p style={mutedStyle}>{messages['nutritionAlternatives.empty']}</p>
      )}

      <ConfirmDialog
        open={pendingRemovalId !== null}
        title={messages['nutritionAlternatives.removeTitle']}
        description={messages['nutritionAlternatives.removeDescription']}
        confirmLabel={messages['nutritionAlternatives.removeConfirm']}
        cancelLabel={messages['nutritionAlternatives.removeCancel']}
        tone="destructive"
        onCancel={() => setPendingRemovalId(null)}
        onConfirm={handleConfirmRemove}
      />
    </Card>
  );
}

const rootStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-5)',
  minInlineSize: 0,
};

const headerStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
};

const headingGroupStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--text-xl)',
  lineHeight: 'var(--line-height-heading)',
  textWrap: 'balance',
};

const mutedStyle: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--line-height-body)',
  textWrap: 'pretty',
};

const noteStyle: CSSProperties = {
  padding: 'var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg)',
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--line-height-body)',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const listStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-bg)',
  minInlineSize: 0,
};

const originalRowStyle: CSSProperties = {
  ...rowStyle,
  borderColor: 'var(--color-border-strong)',
  background: 'var(--color-card-raised)',
};

const rowHeaderStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const rowIdentityStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  minInlineSize: 0,
};

const eyebrowStyle: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
};

const foodNameStyle: CSSProperties = {
  fontWeight: 600,
  overflowWrap: 'anywhere',
};

const quantityReadoutStyle: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const fieldsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--space-3)',
  alignItems: 'start',
};

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  fontWeight: 600,
};

const selectStyle: CSSProperties = {
  inlineSize: '100%',
  minBlockSize: 'var(--touch-min)',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--color-card)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border-strong)',
  borderRadius: 'var(--radius-button)',
};

const macroBlockStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  minInlineSize: 0,
};

const macroHeadingStyle: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
};

const macroGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))',
  gap: 'var(--space-2)',
  margin: 0,
};

const macroItemStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-card)',
};

const macroLabelStyle: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-xs)',
};

const macroValueStyle: CSSProperties = {
  margin: 0,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};
