'use client';

import { useId, useMemo, useState } from 'react';
import { Bidi } from '../../ui/Bidi';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { dirFor, type Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import {
  computeAlternativeValues,
  computeDocumentValues,
  displayCalories,
  displayMacroGrams,
  snapshotMapKey,
  type NutritionSnapshotEntry,
} from '../../../lib/plans/nutrition/macros';
import {
  validateNutritionDocument,
  type NutritionAlternative,
  type NutritionDocumentV1,
  type NutritionItem,
} from '../../../lib/plans/nutrition/schema';
import {
  foodName,
  macroText,
  normalizeQuantityInput,
  quantityInputText,
  unitText,
} from './display';
import {
  addAlternative,
  entryIdentity,
  isAvailable,
  moveAlternative,
  removeAlternative,
  setAlternativeQuantity,
  snapshotMapFromEntries,
  unitContextFromEntries,
  unitForEntry,
  type IdFactory,
} from './model';
import styles from './NutritionAlternativesEditor.module.css';

export type NutritionAlternativesEditorProps = {
  locale: Locale;
  document: NutritionDocumentV1;
  itemId: string;
  foods: readonly NutritionSnapshotEntry[];
  onDocumentChange?: (next: NutritionDocumentV1) => void;
  disabled?: boolean;
  newId?: IdFactory;
};

function defaultId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
      const random = Math.floor(Math.random() * 16);
      return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    })
  );
}

function itemById(
  document: NutritionDocumentV1,
  itemId: string,
): NutritionItem | null {
  const groups =
    document.structure === 'single_day'
      ? [document.meals ?? []]
      : (document.days ?? []).map((day) => day.meals);
  for (const meals of groups)
    for (const meal of meals) {
      const item = meal.items.find((entry) => entry.id === itemId);
      if (item) return item;
    }
  return null;
}

type MacroValues = {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};

export function NutritionAlternativesEditor({
  locale,
  document,
  itemId,
  foods,
  onDocumentChange,
  disabled = false,
  newId = defaultId,
}: NutritionAlternativesEditorProps) {
  const m = getMessages(locale);
  const base = useId();
  const [foodIndex, setFoodIndex] = useState(0);
  const [addQuantity, setAddQuantity] = useState('100');
  const [addInvalid, setAddInvalid] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const snapshotMap = useMemo(() => snapshotMapFromEntries(foods), [foods]);
  const context = useMemo(() => unitContextFromEntries(foods), [foods]);
  const values = useMemo(() => {
    let itemValues: MacroValues | null = null;
    let alternativeValues: Record<string, MacroValues> = {};
    try {
      itemValues =
        computeDocumentValues(document, snapshotMap).items[itemId] ?? null;
    } catch {
      itemValues = null;
    }
    try {
      alternativeValues =
        computeAlternativeValues(document, snapshotMap)[itemId] ?? {};
    } catch {
      alternativeValues = {};
    }
    return { item: itemValues, alternatives: alternativeValues };
  }, [document, snapshotMap, itemId]);

  const item = itemById(document, itemId);
  if (!item) return null;

  const entryFor = (reference: {
    foodId: string;
    foodVersion: number;
    quantity: { unit: NutritionItem['quantity']['unit'] };
  }) =>
    snapshotMap[
      snapshotMapKey(
        reference.foodId,
        reference.foodVersion,
        reference.quantity.unit,
      )
    ];

  const originalEntry = entryFor(item);

  function commit(next: NutritionDocumentV1): boolean {
    try {
      // Reuse the merged v1 validator; never re-implement quantity rules.
      validateNutritionDocument(next, context);
    } catch {
      return false;
    }
    onDocumentChange?.(next);
    return true;
  }

  function commitQuantity(alternativeId: string, raw: string) {
    const value = normalizeQuantityInput(raw);
    const next = setAlternativeQuantity(document, itemId, alternativeId, value);
    if (commit(next)) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[alternativeId];
        return next;
      });
      setInvalid((current) => {
        const next = { ...current };
        delete next[alternativeId];
        return next;
      });
    } else {
      setDrafts((current) => ({ ...current, [alternativeId]: raw }));
      setInvalid((current) => ({ ...current, [alternativeId]: true }));
    }
  }

  function add() {
    const entry = foods[foodIndex];
    if (!item || !entry || item.alternatives.length >= 3) return;
    const identity = entryIdentity(entry);
    const alternative: NutritionAlternative = {
      id: newId(),
      foodId: identity.foodId,
      foodVersion: identity.version,
      quantity: {
        value: normalizeQuantityInput(addQuantity),
        unit: unitForEntry(entry),
      },
    };
    if (commit(addAlternative(document, itemId, alternative))) {
      setAddQuantity('100');
      setAddInvalid(false);
    } else {
      setAddInvalid(true);
    }
  }

  const atLimit = item.alternatives.length >= 3;
  const removeTarget = item.alternatives.find(
    (entry) => entry.id === pendingRemove,
  );

  function renderMacros(
    valuesForRow: MacroValues | null | undefined,
    testId: string,
  ) {
    if (!valuesForRow)
      return (
        <p className={styles.macrosUnavailable}>
          {m['nutritionAlternatives.macrosUnavailable']}
        </p>
      );
    return (
      <dl
        className={styles.macros}
        aria-label={m['nutritionAlternatives.calculatedMacros']}
        data-testid={testId}
      >
        <div>
          <dt>{m['nutritionAlternatives.calories']}</dt>
          <dd>
            <Bidi>{macroText(displayCalories(valuesForRow.kcal), locale)}</Bidi>{' '}
            <span>{m['nutritionAlternatives.kilocalories']}</span>
          </dd>
        </div>
        {(
          [
            ['protein', displayMacroGrams(valuesForRow.protein)],
            ['carbs', displayMacroGrams(valuesForRow.carbs)],
            ['fat', displayMacroGrams(valuesForRow.fat)],
          ] as const
        ).map(([field, value]) => (
          <div key={field}>
            <dt>{m[`nutritionAlternatives.${field}`]}</dt>
            <dd>
              <Bidi>{macroText(value, locale)}</Bidi>{' '}
              <span>{m['nutritionAlternatives.grams']}</span>
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <section
      className={styles.alternatives}
      dir={dirFor(locale)}
      data-testid={`alternatives-${itemId}`}
    >
      <h4>{m['nutritionAlternatives.title']}</h4>
      <p className={styles.intro}>{m['nutritionAlternatives.intro']}</p>
      <ol
        className={styles.list}
        aria-label={m['nutritionAlternatives.unifiedListLabel']}
      >
        <li className={styles.row} data-original="true">
          <span className={styles.badge}>
            {m['nutritionAlternatives.original']}
          </span>
          <div className={styles.rowMain}>
            <p className={styles.foodName} dir="auto">
              {foodName(originalEntry, locale)}
            </p>
            <p className={styles.quantity}>
              <Bidi>{quantityInputText(item.quantity.value, locale)}</Bidi>{' '}
              <span>
                {unitText(item.quantity.unit, originalEntry, locale, m)}
              </span>
            </p>
          </div>
          {originalEntry ? (
            renderMacros(values.item, `macros-original-${itemId}`)
          ) : (
            <p className={styles.unavailable}>
              {m['nutritionAlternatives.unavailableFood']}
            </p>
          )}
        </li>
        {item.alternatives.map((alternative, index) => {
          const entry = entryFor(alternative);
          const available = isAvailable(
            snapshotMap,
            alternative.foodId,
            alternative.foodVersion,
            alternative.quantity.unit,
          );
          const rowId = `${base}-alt-${alternative.id}`;
          return (
            <li className={styles.row} key={alternative.id}>
              <span className={styles.badge}>
                <span className={styles.srOnly}>
                  {m['nutritionAlternatives.alternative']}{' '}
                </span>
                <Bidi>{quantityInputText(String(index + 1), locale)}</Bidi>
              </span>
              <div className={styles.rowMain}>
                <p className={styles.foodName} dir="auto">
                  {foodName(entry, locale)}
                </p>
                <label className={styles.field} htmlFor={`${rowId}-qty`}>
                  {m['nutritionAlternatives.quantity']}
                  <input
                    id={`${rowId}-qty`}
                    type="text"
                    inputMode="decimal"
                    value={
                      drafts[alternative.id] ??
                      quantityInputText(alternative.quantity.value, locale)
                    }
                    disabled={disabled}
                    aria-invalid={invalid[alternative.id] || undefined}
                    aria-describedby={
                      invalid[alternative.id] ? `${rowId}-qty-error` : undefined
                    }
                    onChange={(event) =>
                      commitQuantity(alternative.id, event.target.value)
                    }
                  />
                </label>
                <p className={styles.quantity}>
                  {m['nutritionAlternatives.unit']}:{' '}
                  <span>
                    {unitText(alternative.quantity.unit, entry, locale, m)}
                  </span>
                </p>
                {invalid[alternative.id] && (
                  <p className={styles.error} id={`${rowId}-qty-error`}>
                    {m['nutritionAlternatives.invalidQuantity']}
                  </p>
                )}
                {available ? (
                  renderMacros(
                    values.alternatives[alternative.id],
                    `macros-${alternative.id}`,
                  )
                ) : (
                  <p className={styles.unavailable}>
                    {m['nutritionAlternatives.unavailableFood']}
                  </p>
                )}
              </div>
              <div
                className={styles.actions}
                role="group"
                aria-label={m['nutritionAlternatives.actionsLabel']}
              >
                <Button
                  variant="secondary"
                  disabled={disabled || index === 0}
                  aria-label={`${m['nutritionAlternatives.moveUp']} — ${m['nutritionAlternatives.alternative']} ${index + 1}`}
                  onClick={() =>
                    onDocumentChange?.(
                      moveAlternative(document, itemId, alternative.id, -1),
                    )
                  }
                >
                  {m['nutritionAlternatives.moveUp']}
                </Button>
                <Button
                  variant="secondary"
                  disabled={disabled || index === item.alternatives.length - 1}
                  aria-label={`${m['nutritionAlternatives.moveDown']} — ${m['nutritionAlternatives.alternative']} ${index + 1}`}
                  onClick={() =>
                    onDocumentChange?.(
                      moveAlternative(document, itemId, alternative.id, 1),
                    )
                  }
                >
                  {m['nutritionAlternatives.moveDown']}
                </Button>
                <Button
                  variant="destructive"
                  disabled={disabled}
                  onClick={() => setPendingRemove(alternative.id)}
                >
                  {m['nutritionAlternatives.remove']}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      {item.alternatives.length === 0 && (
        <p className={styles.empty}>{m['nutritionAlternatives.empty']}</p>
      )}
      {foods.length > 0 && (
        <form
          className={styles.addForm}
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label className={styles.field} htmlFor={`${base}-add-food`}>
            {m['nutritionAlternatives.food']}
            <select
              id={`${base}-add-food`}
              value={foodIndex}
              disabled={disabled || atLimit}
              onChange={(event) => setFoodIndex(Number(event.target.value))}
            >
              {foods.map((entry, index) => (
                <option key={index} value={index}>
                  {foodName(entry, locale) || entryIdentity(entry).foodId}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field} htmlFor={`${base}-add-quantity`}>
            {m['nutritionAlternatives.quantity']}
            <input
              id={`${base}-add-quantity`}
              type="text"
              inputMode="decimal"
              value={addQuantity}
              disabled={disabled || atLimit}
              aria-invalid={addInvalid || undefined}
              aria-describedby={addInvalid ? `${base}-add-error` : undefined}
              onChange={(event) => setAddQuantity(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={disabled || atLimit}>
            {m['nutritionAlternatives.add']}
          </Button>
          {addInvalid && (
            <p className={styles.error} id={`${base}-add-error`}>
              {m['nutritionAlternatives.invalidQuantity']}
            </p>
          )}
          <p className={styles.hint}>
            {atLimit
              ? m['nutritionAlternatives.addDisabledLimit']
              : m['nutritionAlternatives.limitHelp']}
          </p>
        </form>
      )}
      <p className={styles.hint}>{m['nutritionAlternatives.manualOnly']}</p>
      <ConfirmDialog
        open={pendingRemove !== null}
        title={m['nutritionAlternatives.removeTitle']}
        description={m['nutritionAlternatives.removeDescription']}
        confirmLabel={m['nutritionAlternatives.removeConfirm']}
        cancelLabel={m['nutritionAlternatives.removeCancel']}
        tone="destructive"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = removeTarget;
          setPendingRemove(null);
          if (target) {
            onDocumentChange?.(removeAlternative(document, itemId, target.id));
          }
        }}
      />
    </section>
  );
}
