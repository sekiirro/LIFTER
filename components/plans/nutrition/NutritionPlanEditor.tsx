'use client';

import { useId, useMemo, useState } from 'react';
import { Alert } from '../../ui/Alert';
import { Bidi } from '../../ui/Bidi';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { dirFor, type Locale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { localizeUiDigits } from '../../../lib/i18n/format-digits';
import {
  computeDocumentValues,
  displayCalories,
  displayMacroGrams,
  snapshotMapKey,
  type NutritionSnapshotEntry,
} from '../../../lib/plans/nutrition/macros';
import {
  validateNutritionDocument,
  type NutritionDocumentV1,
  type NutritionMeal,
} from '../../../lib/plans/nutrition/schema';
import { NutritionAlternativesEditor } from './NutritionAlternativesEditor';
import {
  foodName,
  macroText,
  normalizeQuantityInput,
  quantityInputText,
  unitText,
} from './display';
import {
  addMeal,
  daySlots,
  duplicateMeal,
  isAvailable,
  moveMeal,
  removeItem,
  removeMeal,
  setItemNote,
  setItemQuantity,
  setMealNote,
  snapshotMapFromEntries,
  unitContextFromEntries,
  type IdFactory,
} from './model';
import styles from './NutritionPlanEditor.module.css';

export type NutritionPlanEditorState =
  'ready' | 'loading' | 'empty' | 'error' | 'conflict';

export type NutritionPlanEditorProps = {
  locale: Locale;
  document: NutritionDocumentV1;
  foods: readonly NutritionSnapshotEntry[];
  state?: NutritionPlanEditorState;
  onDocumentChange?: (next: NutritionDocumentV1) => void;
  onRetry?: () => void;
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

type MacroValues = {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};

export function NutritionPlanEditor({
  locale,
  document: initialDocument,
  foods,
  state = 'ready',
  onDocumentChange,
  onRetry,
  newId = defaultId,
}: NutritionPlanEditorProps) {
  const m = getMessages(locale);
  const base = useId();
  const [document, setDocument] = useState(initialDocument);
  const [dayIndex, setDayIndex] = useState(0);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {},
  );
  const [invalidQuantities, setInvalidQuantities] = useState<
    Record<string, boolean>
  >({});

  const snapshotMap = useMemo(() => snapshotMapFromEntries(foods), [foods]);
  const context = useMemo(() => unitContextFromEntries(foods), [foods]);
  const slots = useMemo(() => daySlots(document), [document]);
  const slot = slots.find((entry) => entry.dayIndex === dayIndex) ?? slots[0];
  const values = useMemo(() => {
    try {
      return computeDocumentValues(document, snapshotMap);
    } catch {
      return null;
    }
  }, [document, snapshotMap]);
  const totals = values?.days[String(slot?.dayIndex ?? 0)] ?? null;

  function commit(next: NutritionDocumentV1) {
    setDocument(next);
    onDocumentChange?.(next);
  }

  function commitQuantity(itemId: string, raw: string) {
    const next = setItemQuantity(document, itemId, normalizeQuantityInput(raw));
    try {
      validateNutritionDocument(next, context);
    } catch {
      setQuantityDrafts((current) => ({ ...current, [itemId]: raw }));
      setInvalidQuantities((current) => ({ ...current, [itemId]: true }));
      return;
    }
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setInvalidQuantities((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    commit(next);
  }

  function addBlankMeal() {
    const number = (slot?.meals.length ?? 0) + 1;
    const label = `${m['nutritionPlan.meal']} ${number}`;
    const meal: NutritionMeal = {
      id: newId(),
      name: { ar: label, en: label },
      note: null,
      recipeUrl: null,
      items: [],
    };
    commit(addMeal(document, slot?.dayIndex ?? 0, meal));
  }

  function totalsText(valuesForDay: MacroValues): string {
    const parts = [
      `${macroText(displayCalories(valuesForDay.kcal), locale)} ${m['nutritionAlternatives.kilocalories']}`,
      `${macroText(displayMacroGrams(valuesForDay.protein), locale)} ${m['nutritionAlternatives.grams']} ${m['nutritionAlternatives.protein']}`,
      `${macroText(displayMacroGrams(valuesForDay.carbs), locale)} ${m['nutritionAlternatives.grams']} ${m['nutritionAlternatives.carbs']}`,
      `${macroText(displayMacroGrams(valuesForDay.fat), locale)} ${m['nutritionAlternatives.grams']} ${m['nutritionAlternatives.fat']}`,
    ];
    return `${m['nutritionPlan.totalsAnnouncement']}: ${parts.join(', ')}`;
  }

  function renderMacroList(
    valuesForRow: MacroValues | undefined,
    label: string,
    testId: string,
  ) {
    if (!valuesForRow)
      return (
        <p className={styles.macrosUnavailable}>
          {m['nutritionAlternatives.macrosUnavailable']}
        </p>
      );
    return (
      <dl className={styles.macros} aria-label={label} data-testid={testId}>
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

  const disabled = state === 'conflict';

  return (
    <Card
      as="section"
      className={styles.editor}
      aria-labelledby={`${base}-title`}
      dir={dirFor(locale)}
      lang={locale}
      data-testid="nutrition-plan-editor"
    >
      <div className={styles.header}>
        <h2 id={`${base}-title`}>{m['nutritionPlan.title']}</h2>
        {state !== 'loading' && state !== 'error' && (
          <p className={styles.structure}>
            <span>{m['nutritionPlan.structure']}: </span>
            {document.structure === 'single_day'
              ? m['nutritionPlan.singleDay']
              : m['nutritionPlan.sevenDay']}
          </p>
        )}
      </div>
      {state === 'loading' && (
        <>
          <Skeleton lines={6} />
          <p role="status" className={styles.status}>
            {m['nutritionPlan.loading']}
          </p>
        </>
      )}
      {state === 'error' && (
        <ErrorState
          title={m['nutritionPlan.errorTitle']}
          description={m['nutritionPlan.errorDescription']}
          onRetry={onRetry ?? (() => {})}
          retryLabel={m['nutritionPlan.retry']}
        />
      )}
      {state === 'conflict' && (
        <Alert tone="warning" title={m['nutritionPlan.conflictTitle']}>
          <p>{m['nutritionPlan.conflictDescription']}</p>
        </Alert>
      )}
      {state !== 'loading' && state !== 'error' && slot && (
        <fieldset className={styles.fieldset} disabled={disabled}>
          <legend className={styles.srOnly}>{m['nutritionPlan.title']}</legend>
          {document.structure === 'seven_day' && (
            <div
              className={styles.dayTabs}
              role="group"
              aria-label={m['nutritionPlan.day']}
            >
              {slots.map((entry) => (
                <Button
                  key={entry.dayIndex}
                  variant={
                    entry.dayIndex === slot.dayIndex ? 'primary' : 'secondary'
                  }
                  aria-pressed={entry.dayIndex === slot.dayIndex}
                  onClick={() => setDayIndex(entry.dayIndex)}
                >
                  {m['nutritionPlan.day']}{' '}
                  <Bidi>
                    {localizeUiDigits(String(entry.dayIndex + 1), locale)}
                  </Bidi>
                </Button>
              ))}
            </div>
          )}
          <div className={styles.day}>
            <h3 className={styles.dayTitle}>
              {m['nutritionPlan.day']}{' '}
              <Bidi>{localizeUiDigits(String(slot.dayIndex + 1), locale)}</Bidi>
            </h3>
            <p className={styles.dayType}>
              <span>{m['nutritionPlan.dayType']}: </span>
              <span dir="auto">{slot.dayType?.name[locale] ?? ''}</span>
              {slot.dayType && (
                <span className={styles.badge}>
                  {slot.dayType.trainingDay
                    ? m['nutritionPlan.trainingDay']
                    : m['nutritionPlan.restDay']}
                </span>
              )}
            </p>
          </div>
          <div className={styles.totalsRow}>
            <div className={styles.totals}>
              <h3>{m['nutritionPlan.dayTotals']}</h3>
              {renderMacroList(
                totals ?? undefined,
                m['nutritionPlan.dayTotals'],
                'day-macros',
              )}
            </div>
            <Button variant="secondary" onClick={addBlankMeal}>
              {m['nutritionPlan.addMeal']}
            </Button>
          </div>
          <div
            className={styles.srOnly}
            aria-live="polite"
            aria-atomic="true"
            data-testid="nutrition-totals-live"
          >
            {totals ? totalsText(totals) : m['nutritionPlan.totalsUnavailable']}
          </div>
          {slot.meals.length === 0 ? (
            <EmptyState
              title={m['nutritionPlan.emptyTitle']}
              description={m['nutritionPlan.emptyDescription']}
            />
          ) : (
            <ol className={styles.meals}>
              {slot.meals.map((meal, mealIndex) => (
                <li key={meal.id}>
                  <section
                    className={styles.meal}
                    aria-labelledby={`${base}-meal-${meal.id}`}
                    data-testid={`meal-${meal.id}`}
                  >
                    <div className={styles.mealHeader}>
                      <h3 id={`${base}-meal-${meal.id}`} dir="auto">
                        {meal.name[locale]}
                      </h3>
                      <div
                        className={styles.mealActions}
                        role="group"
                        aria-label={m['nutritionPlan.meal']}
                      >
                        <Button
                          variant="secondary"
                          aria-label={`${m['nutritionPlan.moveUp']} — ${meal.name[locale]}`}
                          disabled={mealIndex === 0}
                          onClick={() =>
                            commit(moveMeal(document, meal.id, -1))
                          }
                        >
                          {m['nutritionPlan.moveUp']}
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`${m['nutritionPlan.moveDown']} — ${meal.name[locale]}`}
                          disabled={mealIndex === slot.meals.length - 1}
                          onClick={() => commit(moveMeal(document, meal.id, 1))}
                        >
                          {m['nutritionPlan.moveDown']}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            commit(duplicateMeal(document, meal.id, newId))
                          }
                        >
                          {m['nutritionPlan.duplicate']}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => commit(removeMeal(document, meal.id))}
                        >
                          {m['nutritionAlternatives.remove']}
                        </Button>
                      </div>
                    </div>
                    <label
                      className={styles.field}
                      htmlFor={`${base}-meal-${meal.id}-note`}
                    >
                      {m['nutritionPlan.mealNotes']}
                      <textarea
                        id={`${base}-meal-${meal.id}-note`}
                        data-testid={`meal-note-${meal.id}`}
                        rows={2}
                        value={meal.note ?? ''}
                        onChange={(event) =>
                          commit(
                            setMealNote(document, meal.id, event.target.value),
                          )
                        }
                      />
                    </label>
                    <ul className={styles.items}>
                      {meal.items.map((item, itemIndex) => {
                        const available = isAvailable(
                          snapshotMap,
                          item.foodId,
                          item.foodVersion,
                          item.quantity.unit,
                        );
                        const entry =
                          snapshotMap[
                            snapshotMapKey(
                              item.foodId,
                              item.foodVersion,
                              item.quantity.unit,
                            )
                          ];
                        const itemId = `${base}-item-${item.id}`;
                        return (
                          <li
                            className={styles.item}
                            key={item.id}
                            data-testid={`item-${item.id}`}
                          >
                            <div className={styles.itemHeader}>
                              <h4 dir="auto">
                                {available
                                  ? foodName(entry, locale)
                                  : m['nutritionAlternatives.unavailableFood']}
                              </h4>
                              <Button
                                variant="secondary"
                                aria-label={`${m['nutritionAlternatives.remove']} — ${itemIndex + 1}`}
                                onClick={() =>
                                  commit(removeItem(document, item.id))
                                }
                              >
                                {m['nutritionAlternatives.remove']}
                              </Button>
                            </div>
                            {!available && (
                              <p className={styles.unavailable}>
                                {m['nutritionAlternatives.unavailableFood']}
                              </p>
                            )}
                            <label
                              className={styles.field}
                              htmlFor={`${itemId}-qty`}
                            >
                              {m['nutritionPlan.quantity']}
                              <input
                                id={`${itemId}-qty`}
                                type="text"
                                inputMode="decimal"
                                data-testid={`item-quantity-${item.id}`}
                                value={
                                  quantityDrafts[item.id] ??
                                  quantityInputText(item.quantity.value, locale)
                                }
                                aria-invalid={
                                  invalidQuantities[item.id] || undefined
                                }
                                aria-describedby={
                                  invalidQuantities[item.id]
                                    ? `${itemId}-qty-error`
                                    : undefined
                                }
                                onChange={(event) =>
                                  commitQuantity(item.id, event.target.value)
                                }
                              />
                            </label>
                            <p className={styles.quantity}>
                              <span>{m['nutritionAlternatives.unit']}: </span>
                              {unitText(item.quantity.unit, entry, locale, m)}
                            </p>
                            {invalidQuantities[item.id] && (
                              <p
                                className={styles.error}
                                id={`${itemId}-qty-error`}
                              >
                                {m['nutritionAlternatives.invalidQuantity']}
                              </p>
                            )}
                            {available &&
                              renderMacroList(
                                values?.items[item.id],
                                m['nutritionAlternatives.calculatedMacros'],
                                `item-macros-${item.id}`,
                              )}
                            <label
                              className={styles.field}
                              htmlFor={`${itemId}-note`}
                            >
                              {m['nutritionPlan.foodNotes']}
                              <textarea
                                id={`${itemId}-note`}
                                data-testid={`food-note-${item.id}`}
                                rows={2}
                                value={item.note ?? ''}
                                onChange={(event) =>
                                  commit(
                                    setItemNote(
                                      document,
                                      item.id,
                                      event.target.value,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <NutritionAlternativesEditor
                              locale={locale}
                              document={document}
                              itemId={item.id}
                              foods={foods}
                              disabled={disabled}
                              newId={newId}
                              onDocumentChange={commit}
                            />
                          </li>
                        );
                      })}
                    </ul>
                    <div className={styles.mealTotals}>
                      <h4>{m['nutritionPlan.mealTotals']}</h4>
                      {renderMacroList(
                        values?.meals[meal.id],
                        m['nutritionPlan.mealTotals'],
                        `meal-macros-${meal.id}`,
                      )}
                    </div>
                  </section>
                </li>
              ))}
            </ol>
          )}
        </fieldset>
      )}
    </Card>
  );
}
