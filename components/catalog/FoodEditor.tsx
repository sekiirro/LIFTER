'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import type { Locale } from '../../lib/design/preferences';
import { dirFor } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { interpolateNumbers } from '../../lib/i18n/format';
import {
  MAX_CATALOG_TEXT_LENGTH,
  buildFoodEditorInput,
  foodWarnings,
  validateFoodEditorDraft,
  type FoodEditorDraft,
  type FoodEditorErrors,
} from '../../lib/catalog/food-editor';
import styles from './FoodEditor.module.css';

type FoodAlternativeOption = {
  id: string;
  names: Partial<Record<'ar' | 'en', string>>;
};
export type FoodEditorProps = {
  locale: Locale;
  role?: 'po' | 'workspace_owner' | 'trainer';
  workspaces?: readonly { id: string; label: string }[];
  initialWorkspaceId?: string;
  initialDraft: FoodEditorDraft;
  initialErrors?: FoodEditorErrors;
  alternatives?: readonly FoodAlternativeOption[];
  status?: 'ready' | 'saving' | 'error' | 'success';
  onSubmit?: (
    input: ReturnType<typeof buildFoodEditorInput>,
    draft: FoodEditorDraft,
    workspaceId: string | null,
  ) => void;
};

export function FoodEditor({
  locale,
  role,
  workspaces = [],
  initialWorkspaceId = '',
  initialDraft,
  initialErrors = {},
  alternatives = [],
  status = 'ready',
  onSubmit,
}: FoodEditorProps) {
  const m = getMessages(locale);
  const localized = (key: keyof typeof m, values: Record<string, number>) =>
    interpolateNumbers(m[key], values, locale);
  const base = useId();
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState(initialErrors);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [workspaceError, setWorkspaceError] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const warn = foodWarnings(draft).length > 0;
  const editing = status !== 'saving';
  const nutritionLabels = {
    kcal: m['catalog.foodKcal'],
    protein: m['catalog.foodProtein'],
    carbs: m['catalog.foodCarbs'],
    fat: m['catalog.foodFat'],
    fiber: m['catalog.foodFiber'],
  };
  const errorSummaryEntries = [
    ...(errors.name
      ? [{ target: `${base}-name-ar`, label: m['catalog.foodNames'] }]
      : []),
    ...(errors.productIdentity
      ? [{ target: `${base}-productIdentity`, label: m['catalog.foodProduct'] }]
      : []),
    ...(errors.preparationIdentity
      ? [
          {
            target: `${base}-preparationIdentity`,
            label: m['catalog.foodPreparation'],
          },
        ]
      : []),
    ...(['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const).flatMap((key) =>
      errors[key]
        ? [{ target: `${base}-${key}`, label: nutritionLabels[key] }]
        : [],
    ),
    ...(errors.servingLabel
      ? [{ target: `${base}-serving-ar-0`, label: m['catalog.foodServingAr'] }]
      : []),
    ...(errors.serving
      ? [
          {
            target: `${base}-serving-quantity-0`,
            label: m['catalog.foodServingQuantity'],
          },
        ]
      : []),
    ...(errors.alternativePortions?.some(Boolean)
      ? [
          {
            target: `${base}-portion-${errors.alternativePortions.findIndex(Boolean)}`,
            label: m['catalog.foodAlternativePortion'],
          },
        ]
      : []),
    ...(errors.alternativeUnits?.some(Boolean)
      ? [
          {
            target: `${base}-portion-unit-${errors.alternativeUnits.findIndex(Boolean)}`,
            label: m['catalog.foodAlternativeUnit'],
          },
        ]
      : []),
    ...(errors.alternatives
      ? [
          {
            target: `${base}-alternative-limit`,
            label: m['catalog.foodAlternatives'],
          },
        ]
      : []),
  ];
  useEffect(() => {
    if (submitAttempted && errorSummaryEntries.length) {
      document.getElementById(`${base}-error-summary`)?.focus();
    }
  }, [base, errors, submitAttempted, errorSummaryEntries.length]);
  function update<K extends keyof FoodEditorDraft>(
    key: K,
    value: FoodEditorDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    const errorKey = (
      {
        nameAr: 'name',
        nameEn: 'name',
        productIdentity: 'productIdentity',
        preparationIdentity: 'preparationIdentity',
        kcal: 'kcal',
        protein: 'protein',
        carbs: 'carbs',
        fat: 'fat',
        fiber: 'fiber',
      } as Partial<Record<keyof FoodEditorDraft, keyof FoodEditorErrors>>
    )[key];
    if (errorKey) {
      setErrors((previous) => {
        if (!(errorKey in previous)) return previous;
        const next = { ...previous };
        delete next[errorKey];
        return next;
      });
    }
  }
  function setServing(
    index: number,
    key: 'labelAr' | 'labelEn' | 'basisQuantity',
    value: string,
  ) {
    setErrors((previous) => {
      if (key === 'basisQuantity' && !previous.serving) return previous;
      if (key !== 'basisQuantity' && !previous.servingLabel) return previous;
      const next = { ...previous };
      if (key === 'basisQuantity') delete next.serving;
      else delete next.servingLabel;
      return next;
    });
    update(
      'servings',
      draft.servings.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }
  function setAlternative(
    index: number,
    key: 'foodId' | 'portionQuantity' | 'portionUnit',
    value: string,
  ) {
    setErrors((previous) => {
      if (key === 'portionQuantity' && !previous.alternativePortions?.[index])
        return previous;
      if (key === 'portionUnit' && !previous.alternativeUnits?.[index])
        return previous;
      const next = { ...previous };
      if (key === 'portionQuantity' && next.alternativePortions) {
        next.alternativePortions = next.alternativePortions.map((value, i) =>
          i === index ? undefined : value,
        );
      }
      if (key === 'portionUnit' && next.alternativeUnits) {
        next.alternativeUnits = next.alternativeUnits.map((value, i) =>
          i === index ? undefined : value,
        );
      }
      return next;
    });
    update(
      'alternatives',
      draft.alternatives.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    const next = validateFoodEditorDraft(draft);
    setErrors(next);
    if (Object.keys(next).length) return;
    if (role && role !== 'po' && !workspaceId) {
      setWorkspaceError(true);
      document.getElementById(`${base}-origin-workspace`)?.focus();
      return;
    }
    setWorkspaceError(false);
    onSubmit?.(buildFoodEditorInput(draft), draft, workspaceId || null);
  }
  const err = (code: string | undefined) =>
    code === 'required'
      ? m['catalog.foodErrorRequired']
      : code === 'too_long'
        ? m['catalog.foodErrorTooLong']
        : code === 'macros_exceed_basis'
          ? localized('catalog.foodErrorMacroLimit', { amount: 100 })
          : code
            ? m['catalog.foodErrorNumeric']
            : undefined;
  const identityFields = [
    ['productIdentity', m['catalog.foodProduct'], draft.productIdentity],
    [
      'preparationIdentity',
      m['catalog.foodPreparation'],
      draft.preparationIdentity,
    ],
  ] as const;
  const nutritionFields = [
    ['kcal', m['catalog.foodKcal'], draft.kcal],
    ['protein', m['catalog.foodProtein'], draft.protein],
    ['carbs', m['catalog.foodCarbs'], draft.carbs],
    ['fat', m['catalog.foodFat'], draft.fat],
    ['fiber', m['catalog.foodFiber'], draft.fiber],
  ] as const;
  return (
    <section
      className={styles.editor}
      dir={dirFor(locale)}
      lang={locale}
      data-catalog-locale={locale}
      data-testid="food-editor"
      aria-labelledby={`${base}-title`}
    >
      <header className={styles.header}>
        <h2 id={`${base}-title`}>{m['catalog.foodEditorTitle']}</h2>
        <p>
          <Bidi dir="auto">
            {localized('catalog.foodPer100g', { amount: 100 })}
          </Bidi>{' '}
          /{' '}
          <Bidi dir="auto">
            {localized('catalog.foodPer100ml', { amount: 100 })}
          </Bidi>
        </p>
      </header>
      {status === 'error' && (
        <Alert tone="error" title={m['catalog.foodSaveError']}>
          <p>{m['catalog.foodSaveErrorDescription']}</p>
        </Alert>
      )}
      {status === 'success' && (
        <Alert tone="success" title={m['catalog.foodSaveSuccess']} />
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        {errorSummaryEntries.length > 0 && (
          <section
            id={`${base}-error-summary`}
            className={styles.errorSummary}
            role="alert"
            tabIndex={-1}
            aria-labelledby={`${base}-error-title`}
          >
            <h3 id={`${base}-error-title`}>
              {m['catalog.foodErrorSummaryTitle']}
            </h3>
            <ul>
              {errorSummaryEntries.map((entry) => (
                <li key={entry.target}>
                  <a href={`#${entry.target}`}>
                    {entry.label}: {m['catalog.foodErrorSummaryLink']}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <fieldset className={styles.group}>
          <legend>{m['catalog.foodNames']}</legend>
          <div className={styles.grid}>
            <Field
              label={m['catalog.foodNameAr']}
              error={err(errors.name)}
              inputProps={{
                id: `${base}-name-ar`,
                value: draft.nameAr,
                maxLength: MAX_CATALOG_TEXT_LENGTH,
                disabled: !editing,
                dir: 'rtl',
                onChange: (e) => update('nameAr', e.currentTarget.value),
              }}
            />
            <Field
              label={m['catalog.foodNameEn']}
              error={err(errors.name)}
              inputProps={{
                id: `${base}-name-en`,
                value: draft.nameEn,
                maxLength: MAX_CATALOG_TEXT_LENGTH,
                disabled: !editing,
                dir: 'ltr',
                onChange: (e) => update('nameEn', e.currentTarget.value),
              }}
            />
          </div>
        </fieldset>
        {role && (
          <fieldset className={styles.group}>
            <legend>{m['catalog.foodOriginWorkspace']}</legend>
            <div className={styles.field}>
              <label htmlFor={`${base}-origin-workspace`}>
                {m['catalog.foodChooseWorkspace']}
              </label>
              <select
                id={`${base}-origin-workspace`}
                value={workspaceId}
                disabled={!editing}
                aria-invalid={workspaceError || undefined}
                aria-describedby={
                  workspaceError ? `${base}-workspace-error` : undefined
                }
                onChange={(event) => {
                  setWorkspaceId(event.currentTarget.value);
                  setWorkspaceError(false);
                }}
              >
                <option value="">
                  {role === 'po'
                    ? m['catalog.foodNoOrigin']
                    : m['catalog.foodChooseWorkspace']}
                </option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.label}
                  </option>
                ))}
              </select>
              {workspaceError && (
                <p id={`${base}-workspace-error`} className={styles.error}>
                  {m['catalog.foodWorkspaceRequired']}
                </p>
              )}
            </div>
          </fieldset>
        )}
        <fieldset className={styles.group} data-food-identity="canonical">
          <legend>{m['catalog.foodIdentity']}</legend>
          <div className={styles.grid}>
            {identityFields.map(([key, label, value]) => (
              <Field
                key={key}
                label={label}
                error={err(errors[key])}
                inputProps={{
                  id: `${base}-${key}`,
                  value,
                  maxLength: MAX_CATALOG_TEXT_LENGTH,
                  disabled: !editing,
                  onChange: (e) => update(key, e.currentTarget.value),
                }}
              />
            ))}
            <div className={styles.field}>
              <label htmlFor={`${base}-weighing`}>
                {m['catalog.foodWeighing']}
              </label>
              <select
                id={`${base}-weighing`}
                value={draft.weighingState}
                disabled={!editing}
                onChange={(e) =>
                  update(
                    'weighingState',
                    e.currentTarget.value as FoodEditorDraft['weighingState'],
                  )
                }
              >
                <option value="raw">{m['catalog.foodRaw']}</option>
                <option value="cooked">{m['catalog.foodCooked']}</option>
                <option value="not_applicable">
                  {m['catalog.foodNotApplicable']}
                </option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-basis`}>{m['catalog.foodBasis']}</label>
              <select
                id={`${base}-basis`}
                value={draft.basis}
                disabled={!editing}
                onChange={(e) =>
                  update('basis', e.currentTarget.value as 'g' | 'ml')
                }
              >
                <option value="g">
                  {localized('catalog.foodPer100g', { amount: 100 })}
                </option>
                <option value="ml">
                  {localized('catalog.foodPer100ml', { amount: 100 })}
                </option>
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset className={styles.group}>
          <legend>
            {localized('catalog.foodNutrition', { amount: 100 })} —{' '}
            <Bidi dir="auto">
              {draft.basis === 'g'
                ? localized('catalog.foodPer100g', { amount: 100 })
                : localized('catalog.foodPer100ml', { amount: 100 })}
            </Bidi>
          </legend>
          <div className={styles.grid}>
            {nutritionFields.map(([key, label, value]) => (
              <Field
                key={key}
                label={label}
                error={err(errors[key])}
                inputProps={{
                  id: `${base}-${key}`,
                  type: 'number',
                  inputMode: 'decimal',
                  min: 0,
                  step: 'any',
                  value,
                  disabled: !editing,
                  onChange: (e) => update(key, e.currentTarget.value),
                }}
              />
            ))}
          </div>
          {warn && (
            <Alert tone="warning" title={m['catalog.foodKcal']}>
              {localized('catalog.foodKcalWarningOnly', {
                protein: 4,
                carbs: 4,
                fat: 9,
              })}
            </Alert>
          )}
        </fieldset>
        <fieldset className={styles.group}>
          <legend>{m['catalog.foodServings']}</legend>
          {draft.servings.map((serving, index) => (
            <div className={styles.grid} key={index}>
              <Field
                label={m['catalog.foodServingAr']}
                error={err(errors.servingLabel)}
                inputProps={{
                  id: `${base}-serving-ar-${index}`,
                  value: serving.labelAr,
                  maxLength: MAX_CATALOG_TEXT_LENGTH,
                  disabled: !editing,
                  onChange: (e) =>
                    setServing(index, 'labelAr', e.currentTarget.value),
                }}
              />
              <Field
                label={m['catalog.foodServingEn']}
                error={err(errors.servingLabel)}
                inputProps={{
                  id: `${base}-serving-en-${index}`,
                  value: serving.labelEn,
                  maxLength: MAX_CATALOG_TEXT_LENGTH,
                  disabled: !editing,
                  onChange: (e) =>
                    setServing(index, 'labelEn', e.currentTarget.value),
                }}
              />
              <Field
                label={m['catalog.foodServingQuantity']}
                error={
                  errors.serving ? m['catalog.foodErrorServing'] : undefined
                }
                inputProps={{
                  id: `${base}-serving-quantity-${index}`,
                  type: 'number',
                  min: 0,
                  step: 'any',
                  value: serving.basisQuantity,
                  disabled: !editing,
                  onChange: (e) =>
                    setServing(index, 'basisQuantity', e.currentTarget.value),
                }}
              />
            </div>
          ))}
          <div className={styles.actions}>
            {draft.servings.length > 1 && (
              <Button
                variant="secondary"
                disabled={!editing}
                onClick={() => update('servings', draft.servings.slice(0, -1))}
              >
                {m['catalog.foodServingRemove']}
              </Button>
            )}
            <Button
              disabled={!editing}
              onClick={() =>
                update('servings', [
                  ...draft.servings,
                  { labelAr: '', labelEn: '', basisQuantity: '' },
                ])
              }
            >
              {m['catalog.foodServingAdd']}
            </Button>
          </div>
        </fieldset>
        <fieldset
          className={styles.group}
          aria-describedby={
            errors.alternatives ? `${base}-alternatives-error` : undefined
          }
        >
          <legend>{m['catalog.foodAlternatives']}</legend>
          <p id={`${base}-alternative-limit`}>
            {m['catalog.foodAlternativeLimit']}
          </p>
          {draft.alternatives.map((item, index) => (
            <div className={styles.grid} key={index}>
              <div className={styles.field}>
                <label htmlFor={`${base}-alternative-${index}`}>
                  {m['catalog.foodAlternativeFood']}
                </label>
                <select
                  id={`${base}-alternative-${index}`}
                  value={item.foodId}
                  disabled={!editing}
                  onChange={(e) =>
                    setAlternative(index, 'foodId', e.currentTarget.value)
                  }
                >
                  <option value="">—</option>
                  {alternatives.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.names[locale] ??
                        option.names.en ??
                        option.names.ar}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                label={m['catalog.foodAlternativePortion']}
                error={
                  errors.alternativePortions?.[index]
                    ? m['catalog.foodErrorAlternativePortion']
                    : undefined
                }
                inputProps={{
                  id: `${base}-portion-${index}`,
                  type: 'number',
                  min: 0,
                  step: 'any',
                  value: item.portionQuantity,
                  disabled: !editing,
                  onChange: (e) =>
                    setAlternative(
                      index,
                      'portionQuantity',
                      e.currentTarget.value,
                    ),
                }}
              />
              <Field
                label={m['catalog.foodAlternativeUnit']}
                inputProps={{
                  id: `${base}-portion-unit-${index}`,
                  value: item.portionUnit,
                  maxLength: 40,
                  disabled: !editing,
                  onChange: (e) =>
                    setAlternative(index, 'portionUnit', e.currentTarget.value),
                }}
                error={
                  errors.alternativeUnits?.[index]
                    ? m['catalog.foodErrorTooLong']
                    : undefined
                }
              />
              <Button
                variant="secondary"
                disabled={!editing}
                onClick={() =>
                  update(
                    'alternatives',
                    draft.alternatives.filter((_, i) => i !== index),
                  )
                }
              >
                {m['catalog.foodAlternativeRemove']}
              </Button>
            </div>
          ))}
          {errors.alternatives && (
            <p
              id={`${base}-alternatives-error`}
              role="alert"
              aria-live="assertive"
            >
              {m['catalog.foodAlternativeLimit']}
            </p>
          )}
          <Button
            variant="secondary"
            disabled={!editing || draft.alternatives.length >= 3}
            onClick={() =>
              update('alternatives', [
                ...draft.alternatives,
                { foodId: '', portionQuantity: '', portionUnit: '' },
              ])
            }
          >
            {m['catalog.foodAlternativeAdd']}
          </Button>
        </fieldset>
        <div className={styles.actions}>
          <Button
            type="submit"
            disabled={!editing}
            loading={status === 'saving'}
            loadingLabel={m['catalog.foodSaving']}
          >
            {m['catalog.foodEditorSave']}
          </Button>
        </div>
      </form>
    </section>
  );
}
