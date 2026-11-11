'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import {
  EQUIPMENT_CODES,
  MUSCLE_GROUP_CODES,
  type CatalogLocale,
  type ExerciseReps,
  type NormalizedExercise,
} from '../../lib/catalog/schemas';
import {
  alternativeName,
  alternativeOptionValue,
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
  exerciseId?: string;
  alternatives?: readonly ExerciseAlternativeOption[];
  initialDraft?: ExerciseEditorDraft;
  initialErrors?: ExerciseEditorErrors;
  status?: ExerciseEditorStatus;
  onSubmit?: (draft: ExerciseEditorDraft) => void;
};

type Messages = ReturnType<typeof getMessages>;

const ERROR_MESSAGE_KEYS: Record<ExerciseEditorErrorCode, keyof Messages> = {
  required: 'catalog.editorErrorRequired',
  positive_integer: 'catalog.editorErrorPositiveInteger',
  integer_range: 'catalog.editorErrorIntegerRange',
  range_order: 'catalog.editorErrorRangeOrder',
  invalid_choice: 'catalog.editorErrorChoice',
  too_many_alternatives: 'catalog.editorErrorTooManyAlternatives',
  text_too_long: 'catalog.editorErrorTextTooLong',
  description_too_long: 'catalog.editorErrorDescriptionTooLong',
  invalid_video_url: 'catalog.videoVariationInvalidUrl',
  duplicate_alternative: 'catalog.editorErrorDuplicateAlternative',
  self_alternative: 'catalog.editorErrorSelfAlternative',
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
    description: '',
    notes: '',
    videoUrl: '',
    primaryMuscle: '',
    secondaryMuscles: [],
    equipment: '',
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
  exerciseId,
  alternatives = [],
  initialDraft,
  initialErrors,
  status = 'ready',
  onSubmit,
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
  const reps = repsFromDraft(draft);
  const repsText = formatExerciseReps(reps);
  const repsError =
    errors.repsValue ?? errors.repsMin ?? errors.repsMax ?? errors.repsMode;
  const alternativesAtMax = draft.alternativeExerciseIds.length >= 3;
  const alternativeOptions = alternatives;
  const selectedAlternatives = draft.alternativeExerciseIds.map((id) => {
    const option = alternativeOptions.find((item) => item.id === id);
    return { id, name: option ? alternativeName(option, locale) : id };
  });

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
    const nextErrors = validateExerciseEditorDraft(draft, exerciseId);
    setErrors(nextErrors);
    if (hasExerciseEditorErrors(nextErrors)) return;
    if (!buildExerciseInput(draft, exerciseId)) return;
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
              <Bidi dir="ltr">
                {draft.primaryMuscle
                  ? m[
                      `catalog.taxonomy.muscle.${draft.primaryMuscle}` as keyof typeof m
                    ]
                  : '—'}
              </Bidi>
            </dd>
          </div>
          <div>
            <dt>{m['catalog.editorEquipment']}</dt>
            <dd>
              <Bidi dir="ltr">
                {draft.equipment
                  ? m[
                      `catalog.taxonomy.equipment.${draft.equipment}` as keyof typeof m
                    ]
                  : '—'}
              </Bidi>
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
                  {selectedAlternatives.map((alternative) => (
                    <li key={alternative.id}>
                      <Bidi dir="auto">{alternative.name}</Bidi>
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
            <Field
              label={m['catalog.editorDescription']}
              error={errorText(errors.description, m)}
              inputProps={{
                id: `${base}-description`,
                value: draft.description,
                disabled: !canEdit,
                onChange: (event) =>
                  setValue('description', event.currentTarget.value),
              }}
            />
            <Field
              label={m['catalog.editorNotes']}
              error={errorText(errors.notes, m)}
              inputProps={{
                id: `${base}-notes`,
                value: draft.notes,
                disabled: !canEdit,
                onChange: (event) =>
                  setValue('notes', event.currentTarget.value),
              }}
            />
            <Field
              label={m['catalog.editorVideo']}
              error={errorText(errors.videoUrl, m)}
              inputProps={{
                id: `${base}-video`,
                type: 'url',
                inputMode: 'url',
                value: draft.videoUrl,
                disabled: !canEdit,
                onChange: (event) =>
                  setValue('videoUrl', event.currentTarget.value),
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
                    {m[`catalog.taxonomy.muscle.${code}` as keyof typeof m]}
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
                    {m[`catalog.taxonomy.equipment.${code}` as keyof typeof m]}
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
                  max: 100,
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
                  max: 100,
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
                  max: 100,
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
                max: 600,
                step: 15,
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
                max: 5,
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
                  const value = alternativeOptionValue(option);
                  const checked = draft.alternativeExerciseIds.includes(value);
                  const id = `${base}-alternative-${value}`;
                  return (
                    <li key={value}>
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit || (!checked && alternativesAtMax)}
                        aria-describedby={`${base}-alternatives-hint`}
                        onChange={(event) =>
                          toggleAlternative(value, event.currentTarget.checked)
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
