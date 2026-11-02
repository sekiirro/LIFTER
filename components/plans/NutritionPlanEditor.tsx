'use client';

import { useMemo, useState } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { formatDigits } from '../../lib/i18n/format-digits';
import { getMessages } from '../../lib/i18n';
import type { NutritionFoodSnapshot } from '../../lib/plans/nutrition/macros';
import type {
  NutritionDocument,
  Quantity,
} from '../../lib/plans/nutrition/schema';
import {
  assignDayType,
  duplicateMeal,
  moveMeal,
  nutritionTotalsForDay,
  updateItemQuantity,
  visibleMealsForDay,
} from './NutritionPlanEditorModel';
import styles from './NutritionPlanEditor.module.css';

export type NutritionPlanEditorFood = {
  snapshot: NutritionFoodSnapshot;
  name: { ar: string; en: string };
};

export type NutritionPlanEditorProps = {
  locale: Locale;
  document: NutritionDocument;
  foods: readonly NutritionPlanEditorFood[];
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'conflict';
  onDocumentChange?: (document: NutritionDocument) => void;
  onRetry?: () => void;
};

function id(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
      const random = Math.floor(Math.random() * 16);
      return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    })
  );
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/٫/g, '.');
}

export function NutritionPlanEditor({
  locale,
  document: initialDocument,
  foods,
  state = 'ready',
  onDocumentChange,
  onRetry,
}: NutritionPlanEditorProps) {
  const messages = getMessages(locale);
  const [document, setDocument] = useState(initialDocument);
  const [selectedDay, setSelectedDay] = useState(0);
  const dayTypeId =
    document.structure.kind === 'single_day'
      ? document.structure.implicitDayTypeId
      : (document.structure.days.find((day) => day.dayIndex === selectedDay)
          ?.dayTypeId ??
        document.dayTypes[0]?.id ??
        '');
  const dayType = document.dayTypes.find((type) => type.id === dayTypeId);
  const meals = useMemo(
    () => visibleMealsForDay(document, selectedDay),
    [document, selectedDay],
  );
  const snapshotById = new Map(
    foods.map((food) => [food.snapshot.foodVersionId, food]),
  );
  const totals = (() => {
    try {
      return nutritionTotalsForDay(
        document,
        selectedDay,
        foods.map((food) => food.snapshot),
      );
    } catch {
      return null;
    }
  })();

  function commit(next: NutritionDocument) {
    setDocument(next);
    onDocumentChange?.(next);
  }

  function formatUnit(unit: string) {
    if (locale === 'ar' && unit === 'g')
      return messages['nutritionAlternatives.grams'];
    if (locale === 'ar' && unit === 'ml')
      return messages['nutritionAlternatives.milliliters'];
    return unit;
  }

  function addMeal() {
    const food = foods[0];
    if (!food) return;
    commit({
      ...document,
      meals: [
        ...document.meals,
        {
          id: id(),
          conditional: 'always',
          items: [
            {
              id: id(),
              foodVersionId: food.snapshot.foodVersionId,
              quantity: { value: '100', unit: food.snapshot.basis },
              alternatives: [],
            },
          ],
        },
      ],
    });
  }

  function renderTotals(
    inputs: { snapshot: NutritionFoodSnapshot; quantity: Quantity }[],
    label: string,
  ) {
    const values = (() => {
      try {
        const temporary: NutritionDocument = {
          ...document,
          meals: [
            {
              id: '00000000-0000-4000-8000-000000000000',
              conditional: 'always',
              items: inputs.map((input, index) => ({
                id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                foodVersionId: input.snapshot.foodVersionId,
                quantity: input.quantity,
                alternatives: [],
              })),
            },
          ],
        };
        return nutritionTotalsForDay(
          temporary,
          0,
          foods.map((food) => food.snapshot),
        );
      } catch {
        return null;
      }
    })();
    if (!values) return null;
    return (
      <dl className={styles.totals} aria-label={label}>
        {(['calories', 'protein', 'carbs', 'fat'] as const).map((name) => (
          <div key={name}>
            <dt>{messages[`nutritionAlternatives.${name}`]}</dt>
            <dd>
              <Bidi dir="ltr">
                {formatDigits(
                  Math.round(Number(values[name])).toString(),
                  locale,
                )}{' '}
                {name === 'calories'
                  ? messages['nutritionAlternatives.kilocalories']
                  : formatUnit('g')}
              </Bidi>
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (state !== 'ready') {
    if (state === 'loading')
      return (
        <Card
          as="section"
          aria-busy="true"
          className={styles.state}
          dir={dirFor(locale)}
          lang={locale}
        >
          <p role="status">{messages['nutritionPlan.loading']}</p>
        </Card>
      );
    if (state === 'error')
      return (
        <Card
          as="section"
          className={styles.state}
          dir={dirFor(locale)}
          lang={locale}
        >
          <Alert tone="error" title={messages['nutritionPlan.errorTitle']}>
            <p>{messages['nutritionPlan.errorDescription']}</p>
          </Alert>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              {messages['nutritionPlan.retry']}
            </Button>
          )}
        </Card>
      );
    if (state === 'conflict')
      return (
        <Card
          as="section"
          className={styles.state}
          dir={dirFor(locale)}
          lang={locale}
        >
          <Alert tone="warning" title={messages['nutritionPlan.conflictTitle']}>
            <p>{messages['nutritionPlan.conflictDescription']}</p>
          </Alert>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              {messages['nutritionPlan.retry']}
            </Button>
          )}
        </Card>
      );
    return (
      <Card
        as="section"
        className={styles.state}
        dir={dirFor(locale)}
        lang={locale}
      >
        <h2>{messages['nutritionPlan.emptyTitle']}</h2>
        <p>{messages['nutritionPlan.emptyDescription']}</p>
      </Card>
    );
  }

  return (
    <Card
      as="section"
      aria-labelledby="nutrition-plan-title"
      className={styles.editor}
      dir={dirFor(locale)}
      lang={locale}
      data-testid="nutrition-plan-editor"
    >
      <header className={styles.header}>
        <h2 id="nutrition-plan-title">{messages['nutritionPlan.title']}</h2>
        <label className={styles.selectField}>
          {messages['nutritionPlan.structure']}
          <select
            value={document.structure.kind}
            onChange={(event) => {
              if (event.target.value === 'single_day')
                commit({
                  ...document,
                  structure: {
                    kind: 'single_day',
                    implicitDayTypeId: dayTypeId,
                  },
                });
              else
                commit({
                  ...document,
                  structure: {
                    kind: 'seven_day',
                    days: Array.from({ length: 7 }, (_, dayIndex) => ({
                      dayIndex,
                      dayTypeId: dayTypeId || document.dayTypes[0]?.id || '',
                    })),
                  },
                });
            }}
          >
            <option value="single_day">
              {messages['nutritionPlan.singleDay']}
            </option>
            <option value="seven_day">
              {messages['nutritionPlan.sevenDay']}
            </option>
          </select>
        </label>
      </header>
      {document.structure.kind === 'seven_day' && (
        <nav className={styles.days} aria-label={messages['nutritionPlan.day']}>
          {document.structure.days.map((day) => (
            <Button
              key={day.dayIndex}
              variant={day.dayIndex === selectedDay ? 'primary' : 'secondary'}
              aria-pressed={day.dayIndex === selectedDay}
              onClick={() => setSelectedDay(day.dayIndex)}
            >
              {messages['nutritionPlan.day']}{' '}
              {formatDigits(String(day.dayIndex + 1), locale)}
            </Button>
          ))}
        </nav>
      )}
      {dayType && (
        <label className={styles.selectField}>
          {messages['nutritionPlan.dayType']}
          <select
            value={dayTypeId}
            onChange={(event) =>
              commit(assignDayType(document, selectedDay, event.target.value))
            }
          >
            {document.dayTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.trainingDay
                  ? messages['nutritionPlan.trainingDay']
                  : messages['nutritionPlan.restDay']}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={styles.sectionHeading}>
        <h3>{messages['nutritionPlan.meals']}</h3>
        <Button onClick={addMeal} disabled={foods.length === 0}>
          {messages['nutritionPlan.addMeal']}
        </Button>
      </div>
      <ol className={styles.meals} aria-label={messages['nutritionPlan.meals']}>
        {meals.map((meal) => {
          const allMeals = document.meals;
          const index = allMeals.findIndex((entry) => entry.id === meal.id);
          const mealInputs: {
            snapshot: NutritionFoodSnapshot;
            quantity: Quantity;
          }[] = [];
          return (
            <li key={meal.id}>
              <Card as="article" className={styles.meal}>
                <div className={styles.mealHeader}>
                  <h4>
                    {messages['nutritionPlan.meal']}{' '}
                    {formatDigits(String(index + 1), locale)}
                  </h4>
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      aria-label={messages['nutritionPlan.moveUp']}
                      disabled={index === 0}
                      onClick={() => commit(moveMeal(document, meal.id, 'up'))}
                    >
                      {messages['nutritionPlan.moveUp']}
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={messages['nutritionPlan.moveDown']}
                      disabled={index === allMeals.length - 1}
                      onClick={() =>
                        commit(moveMeal(document, meal.id, 'down'))
                      }
                    >
                      {messages['nutritionPlan.moveDown']}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        commit(duplicateMeal(document, meal.id, id))
                      }
                    >
                      {messages['nutritionPlan.duplicate']}
                    </Button>
                  </div>
                </div>
                <ul className={styles.items}>
                  {meal.items.map((item) => {
                    const food = snapshotById.get(item.foodVersionId);
                    if (food)
                      mealInputs.push({
                        snapshot: food.snapshot,
                        quantity: item.quantity,
                      });
                    return (
                      <li key={item.id} className={styles.item}>
                        <p>{food?.name[locale] ?? item.foodVersionId}</p>
                        <label>
                          {messages['nutritionPlan.quantity']}
                          <span className={styles.quantity}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={formatDigits(
                                item.quantity.value,
                                locale,
                              )}
                              onChange={(event) =>
                                commit(
                                  updateItemQuantity(document, item.id, {
                                    ...item.quantity,
                                    value: normalizeDigits(event.target.value),
                                  }),
                                )
                              }
                            />
                            <Bidi dir="ltr">
                              {formatUnit(item.quantity.unit)}
                            </Bidi>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {renderTotals(mealInputs, messages['nutritionPlan.mealTotals'])}
              </Card>
            </li>
          );
        })}
      </ol>
      {meals.length === 0 && (
        <p>{messages['nutritionPlan.emptyDescription']}</p>
      )}
      <div className={styles.dayTotals}>
        <h3>{messages['nutritionPlan.dayTotals']}</h3>
        {totals &&
          renderTotals(
            meals.flatMap((meal) =>
              meal.items.flatMap((item) => {
                const food = snapshotById.get(item.foodVersionId);
                return food
                  ? [{ snapshot: food.snapshot, quantity: item.quantity }]
                  : [];
              }),
            ),
            messages['nutritionPlan.dayTotals'],
          )}
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {messages['nutritionPlan.totalsAnnouncement']}:{' '}
        {totals
          ? (['calories', 'protein', 'carbs', 'fat'] as const)
              .map(
                (name) =>
                  `${messages[`nutritionAlternatives.${name}`]} ${formatDigits(Math.round(Number(totals[name])).toString(), locale)} ${name === 'calories' ? messages['nutritionAlternatives.kilocalories'] : formatUnit('g')}`,
              )
              .join(', ')
          : messages['nutritionPlan.totalsUnavailable']}
      </p>
    </Card>
  );
}
