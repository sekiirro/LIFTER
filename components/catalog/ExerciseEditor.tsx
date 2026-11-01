'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import {
  EQUIPMENT_CODES,
  MUSCLE_GROUP_CODES,
  type CatalogLifecycleState,
  type CatalogLocale,
  type ExerciseReps,
  type NormalizedExercise,
} from '../../lib/catalog/schemas';
import {
  alternativeName,
  buildExerciseInput,
  canEditExercise,
  draftFromExercise,
  formatExerciseReps,
  formatExerciseRir,
  hasExerciseEditorErrors,
  validateExerciseEditorDraft,
  type CatalogStaffRole,
  type ExerciseScope,
  type ExerciseAlternativeOption,
  type ExerciseEditorDraft,
  type ExerciseEditorErrorCode,
  type ExerciseEditorErrors,
} from '../../lib/catalog/exercise-editor';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import styles from './ExerciseEditor.module.css';

export type ExerciseEditorStatus = 'ready' | 'saving' | 'error';

export type ExerciseEditorProps = {
  locale: Locale;
  role: CatalogStaffRole;
  scope?: ExerciseScope;
  hasCoachingWork?: boolean;
  exercise?: NormalizedExercise | null;
  alternatives?: readonly ExerciseAlternativeOption[];
  initialDraft?: ExerciseEditorDraft;
  initialErrors?: ExerciseEditorErrors;
  lifecycleState?: CatalogLifecycleState;
  status?: ExerciseEditorStatus;
  onSubmit?: (draft: ExerciseEditorDraft) => void;
  onRemove?: () => void;
  onRestore?: () => void;
  onMerge?: () => void;
};

type Messages = ReturnType<typeof getMessages>;

const ERROR_MESSAGE_KEYS: Record<ExerciseEditorErrorCode, keyof Messages> = {
  required: 'catalog.editorErrorRequired',
  positive_integer: 'catalog.editorErrorPositiveInteger',
  integer_range: 'catalog.editorErrorIntegerRange',
  range_order: 'catalog.editorErrorRangeOrder',
  invalid_choice: 'catalog.editorErrorChoice',
  too_many_alternatives: 'catalog.editorErrorTooManyAlternatives',
};

function errorText(
  code: ExerciseEditorErrorCode | undefined,
  m: Messages,
): string | undefined {
  return code ? m[ERROR_MESSAGE_KEYS[code]] : undefined;
}

function emptyDraft(): ExerciseEditorDraft {
  return {
    names: { ar: '', en: '' },
    primaryMuscle: '',
    secondaryMuscles: [],
    equipment: '',
    warmupSets: '',
    workingSets: '',
    repsMode: 'fixed',
    repsValue: '',
    repsMin: '',
    repsMax: '',
    restSeconds: '',
    rir: '',
    alternativeExerciseIds: [],
  };
}

function repsFromDraft(draft: ExerciseEditorDraft): ExerciseReps | undefined {
  if (draft.repsMode === 'fixed') {
    const value = draft.repsValue.trim();
    return value ? { kind: 'fixed', value: Number(value) } : undefined;
  }
  const min = draft.repsMin.trim();
  const max = draft.repsMax.trim();
  return min && max
    ? { kind: 'range', min: Number(min), max: Number(max) }
    : undefined;
}

function updateDraft(
  draft: ExerciseEditorDraft,
  key: keyof ExerciseEditorDraft,
  value: ExerciseEditorDraft[keyof ExerciseEditorDraft],
): ExerciseEditorDraft {
  return { ...draft, [key]: value };
}

export function ExerciseEditor({
  locale,
  role,
  scope = 'global',
  hasCoachingWork = false,
  exercise = null,
  alternatives = [],
  initialDraft,
  initialErrors,
  lifecycleState,
  status = 'ready',
  onSubmit,
  onRemove,
  onRestore,
  onMerge,
}: ExerciseEditorProps) {
  const m = getMessages(locale);
  const titleId = useId();
  const base = useId();
  const [draft, setDraft] = useState<ExerciseEditorDraft>(
    () =>
      initialDraft ?? (exercise ? draftFromExercise(exercise) : emptyDraft()),
  );
  const [errors, setErrors] = useState<ExerciseEditorErrors>(
    initialErrors ?? {},
  );

  const canEdit = canEditExercise(scope, role, hasCoachingWork);
  const canGovern = scope === 'global' && role === 'po';
  const state = lifecycleState ?? exercise?.lifecycleState ?? 'active';
  const reps = repsFromDraft(draft);
  const repsText = formatExerciseReps(reps);
  const repsError =
    errors.repsValue ?? errors.repsMin ?? errors.repsMax ?? errors.repsMode;
  const alternativesAtMax = draft.alternativeExerciseIds.length >= 3;
  const alternativeOptions = alternatives;
  const selectedAlternatives = draft.alternativeExerciseIds.map((id) => {
    const option = alternativeOptions.find((item) => item.id === id);
    return option ? alternativeName(option, locale) : id;
  });

  const lifecycleLabels: Record<CatalogLifecycleState, string> = {
    active: m['catalog.editorLifecycleActive'],
    removed: m['catalog.editorLifecycleRemoved'],
    superseded: m['catalog.editorLifecycleSuperseded'],
  };

  function setValue<K extends keyof ExerciseEditorDraft>(
    key: K,
    value: ExerciseEditorDraft[K],
  ) {
    setDraft((previous) => updateDraft(previous, key, value));
  }

  function setName(field: CatalogLocale, value: string) {
    setDraft((previous) => ({
      ...previous,
      names: { ...previous.names, [field]: value },
    }));
  }

  function toggleAlternative(id: string, checked: boolean) {
    setDraft((previous) => {
      const selected = previous.alternativeExerciseIds;
      return {
        ...previous,
        alternativeExerciseIds: checked
          ? [...selected, id]
          : selected.filter((item) => item !== id),
      };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const nextErrors = validateExerciseEditorDraft(draft);
    setErrors(nextErrors);
    if (hasExerciseEditorErrors(nextErrors)) return;
    if (!buildExerciseInput(draft)) return;
    onSubmit?.(draft);
  }

  return (
    <section
      className={styles.editor}
      dir={dirFor(locale)}
      lang={locale}
      data-catalog-locale={locale}
      data-catalog-role={role}
      data-catalog-scope={scope}
      data-testid="exercise-editor"
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 id={titleId}>{m['catalog.editorTitle']}</h2>
          {!canEdit && (
            <span className={styles.badge}>{m['catalog.editorReadOnly']}</span>
          )}
        </div>
        <p>
          {scope === 'workspace'
            ? m['catalog.editorIntroWorkspace']
            : m['catalog.editorIntroGlobal']}
        </p>
        <dl className={styles.meta}>
          <div>
            <dt>{m['catalog.editorPrimaryMuscle']}</dt>
            <dd>
              <Bidi dir="ltr">{draft.primaryMuscle || '—'}</Bidi>
            </dd>
          </div>
          <div>
            <dt>{m['catalog.editorEquipment']}</dt>
            <dd>
              <Bidi dir="ltr">{draft.equipment || '—'}</Bidi>
            </dd>
          </div>
        </dl>
      </header>

      {status === 'error' && (
        <Alert tone="error" title={m['catalog.editorStatusError']}>
          <p>{m['catalog.editorStatusErrorDescription']}</p>
        </Alert>
      )}

      <section className={styles.summary} data-testid="exercise-defaults">
        <h3>{m['catalog.editorDefaultsTitle']}</h3>
        <p>{m['catalog.editorDefaultsIntro']}</p>
        <dl className={styles.summaryList}>
          <div data-defaults-warmup={draft.warmupSets.trim()}>
            <dt>{m['catalog.editorWarmupSets']}</dt>
            <dd>
              {draft.warmupSets.trim() ? (
                <Bidi dir="ltr">{draft.warmupSets.trim()}</Bidi>
              ) : (
                m['catalog.editorNone']
              )}
            </dd>
          </div>
          <div data-defaults-working={draft.workingSets.trim()}>
            <dt>{m['catalog.editorWorkingSets']}</dt>
            <dd>
              {draft.workingSets.trim() ? (
                <Bidi dir="ltr">{draft.workingSets.trim()}</Bidi>
              ) : (
                m['catalog.editorNone']
              )}
            </dd>
          </div>
          <div data-defaults-reps={repsText}>
            <dt>{m['catalog.editorReps']}</dt>
            <dd>
              <span className={styles.mode}>
                {draft.repsMode === 'fixed'
                  ? m['catalog.editorRepsFixed']
                  : m['catalog.editorRepsRange']}
              </span>{' '}
              {repsText ? (
                <Bidi dir="ltr">{repsText}</Bidi>
              ) : (
                m['catalog.editorNone']
              )}
            </dd>
          </div>
          <div data-defaults-rest={draft.restSeconds.trim()}>
            <dt>{m['catalog.editorRest']}</dt>
            <dd>
              {draft.restSeconds.trim() ? (
                <>
                  <Bidi dir="ltr">{draft.restSeconds.trim()}</Bidi>{' '}
                  <span>{m['catalog.editorSeconds']}</span>
                </>
              ) : (
                m['catalog.editorNone']
              )}
            </dd>
          </div>
          <div
            data-defaults-rir={formatExerciseRir(
              draft.rir.trim() ? Number(draft.rir) : null,
            )}
          >
            <dt>{m['catalog.editorRir']}</dt>
            <dd>
              {draft.rir.trim() ? (
                <Bidi dir="ltr">{draft.rir.trim()}</Bidi>
              ) : (
                m['catalog.editorNone']
              )}
            </dd>
          </div>
          <div className={styles.summaryWide}>
            <dt>{m['catalog.editorAlternatives']}</dt>
            <dd>
              {selectedAlternatives.length ? (
                <ul className={styles.chips}>
                  {selectedAlternatives.map((name) => (
                    <li key={name}>
                      <Bidi dir="auto">{name}</Bidi>
                    </li>
                  ))}
                </ul>
              ) : (
                m['catalog.editorNone']
              )}
            </dd>
          </div>
        </dl>
      </section>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <fieldset className={styles.group}>
          <legend>{m['catalog.editorBasics']}</legend>
          <div className={styles.grid}>
            <Field
              label={m['catalog.editorNameAr']}
              error={errorText(errors.nameAr, m)}
              inputProps={{
                id: `${base}-name-ar`,
                value: draft.names.ar,
                disabled: !canEdit,
                onChange: (event) => setName('ar', event.currentTarget.value),
              }}
            />
            <Field
              label={m['catalog.editorNameEn']}
              error={errorText(errors.nameEn, m)}
              inputProps={{
                id: `${base}-name-en`,
                value: draft.names.en,
                disabled: !canEdit,
                onChange: (event) => setName('en', event.currentTarget.value),
              }}
            />
            <div className={styles.field}>
              <label htmlFor={`${base}-primary-muscle`}>
                {m['catalog.editorPrimaryMuscle']}
              </label>
              <select
                id={`${base}-primary-muscle`}
                value={draft.primaryMuscle}
                disabled={!canEdit}
                aria-invalid={errors.primaryMuscle ? true : undefined}
                aria-describedby={
                  errors.primaryMuscle
                    ? `${base}-primary-muscle-error`
                    : undefined
                }
                onChange={(event) =>
                  setValue('primaryMuscle', event.currentTarget.value)
                }
              >
                <option value="">{m['catalog.editorNone']}</option>
                {MUSCLE_GROUP_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              {errors.primaryMuscle && (
                <p id={`${base}-primary-muscle-error`} className={styles.error}>
                  {errorText(errors.primaryMuscle, m)}
                </p>
              )}
            </div>
            <div className={styles.field}>
              <label htmlFor={`${base}-equipment`}>
                {m['catalog.editorEquipment']}
              </label>
              <select
                id={`${base}-equipment`}
                value={draft.equipment}
                disabled={!canEdit}
                aria-invalid={errors.equipment ? true : undefined}
                aria-describedby={
                  errors.equipment ? `${base}-equipment-error` : undefined
                }
                onChange={(event) =>
                  setValue('equipment', event.currentTarget.value)
                }
              >
                <option value="">{m['catalog.editorNone']}</option>
                {EQUIPMENT_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              {errors.equipment && (
                <p id={`${base}-equipment-error`} className={styles.error}>
                  {errorText(errors.equipment, m)}
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{m['catalog.editorDefaultsFormTitle']}</legend>
          <div className={styles.grid}>
            <Field
              label={m['catalog.editorWarmupSets']}
              error={errorText(errors.warmupSets, m)}
              inputProps={{
                id: `${base}-warmup-sets`,
                type: 'number',
                inputMode: 'numeric',
                min: 0,
                max: 100,
                value: draft.warmupSets,
                disabled: !canEdit,
                onChange: (event) =>
                  setValue('warmupSets', event.currentTarget.value),
              }}
            />
            <Field
              label={m['catalog.editorWorkingSets']}
              error={errorText(errors.workingSets, m)}
              inputProps={{
                id: `${base}-working-sets`,
                type: 'number',
                inputMode: 'numeric',
                min: 0,
                max: 100,
                value: draft.workingSets,
                disabled: !canEdit,
                onChange: (event) =>
                  setValue('workingSets', event.currentTarget.value),
              }}
            />
          </div>

          <fieldset className={styles.repsGroup}>
            <legend>{m['catalog.editorReps']}</legend>
            <div className={styles.radioRow}>
              {(['fixed', 'range'] as const).map((mode) => (
                <div key={mode} className={styles.radioOption}>
                  <input
                    id={`${base}-reps-${mode}`}
                    type="radio"
                    name={`${base}-reps-mode`}
                    value={mode}
                    checked={draft.repsMode === mode}
                    disabled={!canEdit}
                    onChange={() => setValue('repsMode', mode)}
                  />
                  <label htmlFor={`${base}-reps-${mode}`}>
                    {mode === 'fixed'
                      ? m['catalog.editorRepsFixed']
                      : m['catalog.editorRepsRange']}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          {draft.repsMode === 'fixed' ? (
            <div className={styles.grid}>
              <Field
                label={m['catalog.editorRepsFixedValue']}
                error={errorText(errors.repsValue, m)}
                inputProps={{
                  id: `${base}-reps-value`,
                  type: 'number',
                  inputMode: 'numeric',
                  min: 1,
                  max: 1000,
                  value: draft.repsValue,
                  disabled: !canEdit,
                  onChange: (event) =>
                    setValue('repsValue', event.currentTarget.value),
                }}
              />
            </div>
          ) : (
            <div className={styles.grid}>
              <Field
                label={m['catalog.editorRepsMin']}
                error={errorText(errors.repsMin, m)}
                inputProps={{
                  id: `${base}-reps-min`,
                  type: 'number',
                  inputMode: 'numeric',
                  min: 1,
                  max: 1000,
                  value: draft.repsMin,
                  disabled: !canEdit,
                  onChange: (event) =>
                    setValue('repsMin', event.currentTarget.value),
                }}
              />
              <Field
                label={m['catalog.editorRepsMax']}
                error={errorText(errors.repsMax, m)}
                inputProps={{
                  id: `${base}-reps-max`,
                  type: 'number',
                  inputMode: 'numeric',
                  min: 1,
                  max: 1000,
                  value: draft.repsMax,
                  disabled: !canEdit,
                  onChange: (event) =>
                    setValue('repsMax', event.currentTarget.value),
                }}
              />
            </div>
          )}
          {repsError && (
            <p className={styles.error} role="alert">
              {errorText(repsError, m)}
            </p>
          )}

          <div className={styles.grid}>
            <Field
              label={m['catalog.editorRest']}
              error={errorText(errors.restSeconds, m)}
              inputProps={{
                id: `${base}-rest`,
                type: 'number',
                inputMode: 'numeric',
                min: 0,
                max: 100000,
                value: draft.restSeconds,
                disabled: !canEdit,
                onChange: (event) =>
                  setValue('restSeconds', event.currentTarget.value),
              }}
            />
            <Field
              label={m['catalog.editorRir']}
              error={errorText(errors.rir, m)}
              inputProps={{
                id: `${base}-rir`,
                type: 'number',
                inputMode: 'numeric',
                min: 0,
                max: 10,
                value: draft.rir,
                disabled: !canEdit,
                onChange: (event) => setValue('rir', event.currentTarget.value),
              }}
            />
          </div>

          <fieldset className={styles.alternatives}>
            <legend>{m['catalog.editorAlternatives']}</legend>
            <p className={styles.hint} id={`${base}-alternatives-hint`}>
              {m['catalog.editorAlternativesHint']}
            </p>
            {alternativeOptions.length ? (
              <ul className={styles.alternativeList}>
                {alternativeOptions.map((option) => {
                  const checked = draft.alternativeExerciseIds.includes(
                    option.id,
                  );
                  const id = `${base}-alternative-${option.id}`;
                  return (
                    <li key={option.id}>
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit || (!checked && alternativesAtMax)}
                        aria-describedby={`${base}-alternatives-hint`}
                        onChange={(event) =>
                          toggleAlternative(
                            option.id,
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <label htmlFor={id}>
                        <Bidi dir="auto">
                          {alternativeName(option, locale)}
                        </Bidi>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.hint}>{m['catalog.editorNone']}</p>
            )}
            {alternativesAtMax && (
              <p className={styles.hint}>
                {m['catalog.editorAlternativesMax']}
              </p>
            )}
            {errors.alternatives && (
              <p className={styles.error} role="alert">
                {errorText(errors.alternatives, m)}
              </p>
            )}
          </fieldset>
        </fieldset>

        {canEdit ? (
          <>
            <div className={styles.actions}>
              <Button
                type="submit"
                loading={status === 'saving'}
                loadingLabel={m['catalog.editorSaving']}
              >
                {scope === 'global'
                  ? m['catalog.editorSave']
                  : m['catalog.editorSaveWorkspace']}
              </Button>
            </div>
            {canGovern && (
              <section
                className={styles.governance}
                data-testid="exercise-governance"
                aria-labelledby={`${base}-governance`}
              >
                <h3 id={`${base}-governance`}>
                  {m['catalog.editorGovernance']}
                </h3>
                <p>{m['catalog.editorGovernanceIntro']}</p>
                <dl className={styles.lifecycle}>
                  <div>
                    <dt>{m['catalog.editorLifecycle']}</dt>
                    <dd>{lifecycleLabels[state]}</dd>
                  </div>
                </dl>
                <div className={styles.governanceActions}>
                  <Button variant="destructive" onClick={onRemove}>
                    {m['catalog.editorRemove']}
                  </Button>
                  <Button variant="secondary" onClick={onRestore}>
                    {m['catalog.editorRestore']}
                  </Button>
                  <Button variant="secondary" onClick={onMerge}>
                    {m['catalog.editorMerge']}
                  </Button>
                </div>
              </section>
            )}
          </>
        ) : (
          <p className={styles.readOnly} data-testid="exercise-read-only">
            {m['catalog.editorReadOnlyNotice']}
          </p>
        )}
      </form>
    </section>
  );
}
