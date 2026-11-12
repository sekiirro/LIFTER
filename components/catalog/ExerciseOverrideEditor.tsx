'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Bidi } from '../ui/Bidi';
import styles from './ExerciseEditor.module.css';
import {
  alternativeName,
  type ExerciseAlternativeOption,
  type ExerciseEditorErrorCode,
} from '../../lib/catalog/exercise-editor';
import {
  buildOverrideRequest,
  overrideDraftFromExercise,
  validateOverrideDraft,
  type OverrideDraft,
  type OverrideErrors,
  type OverrideField,
  type OverrideFieldSource,
} from '../../lib/catalog/exercise-override';
import type { NormalizedExercise } from '../../lib/catalog/schemas';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import {
  resetExerciseOverrideFieldAction,
  saveExerciseOverrideAction,
  searchAlternativeOptionsAction,
} from '../../app/(app)/exercise-library/actions';

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
  notes_too_long: 'catalog.editorErrorDescriptionTooLong',
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

export function ExerciseOverrideEditor({
  locale,
  workspaceId,
  exerciseId,
  expectedVersion,
  exercise,
  sources,
  alternatives,
  nextCursor: initialNextCursor,
}: {
  locale: Locale;
  workspaceId: string;
  exerciseId: string;
  expectedVersion: number;
  exercise: NormalizedExercise;
  sources: Record<OverrideField, OverrideFieldSource>;
  alternatives: readonly ExerciseAlternativeOption[];
  nextCursor?: string | null;
}) {
  const m = getMessages(locale);
  const router = useRouter();
  const [draft, setDraft] = useState<OverrideDraft>(() =>
    overrideDraftFromExercise(exercise),
  );
  const [dirty, setDirty] = useState<Set<OverrideField>>(new Set());
  const [errors, setErrors] = useState<OverrideErrors>({});
  const [busy, setBusy] = useState<'idle' | 'saving' | OverrideField>('idle');
  const [failed, setFailed] = useState(false);
  const [alternativeQuery, setAlternativeQuery] = useState('');
  const [alternativeOptions, setAlternativeOptions] = useState([
    ...alternatives,
  ]);
  const [alternativeCursor, setAlternativeCursor] = useState(
    initialNextCursor ?? null,
  );
  const [alternativeLoading, setAlternativeLoading] = useState(false);
  const operationKeys = useRef(new Map<string, string>());
  const alternativeSearchKey = JSON.stringify([
    workspaceId,
    exerciseId,
    alternativeQuery,
    draft.alternativeExerciseIds,
  ]);
  const latestAlternativeSearchKey = useRef(alternativeSearchKey);
  useLayoutEffect(() => {
    latestAlternativeSearchKey.current = alternativeSearchKey;
  }, [alternativeSearchKey]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAlternativeLoading(true);
      try {
        const result = await searchAlternativeOptionsAction({
          workspaceId,
          query: alternativeQuery,
          cursor: null,
          selectedIds: draft.alternativeExerciseIds,
        });
        if (cancelled) return;
        if (result.status === 'ok') {
          const data = result.data as {
            options: ExerciseAlternativeOption[];
            nextCursor: string | null;
          };
          setAlternativeOptions(data.options);
          setAlternativeCursor(data.nextCursor);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setAlternativeLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [alternativeQuery, workspaceId, exerciseId, draft.alternativeExerciseIds]);

  async function loadNextAlternatives() {
    if (!alternativeCursor || alternativeLoading) return;
    const requestedQuery = alternativeQuery;
    const requestedSearchKey = latestAlternativeSearchKey.current;
    setAlternativeLoading(true);
    try {
      const result = await searchAlternativeOptionsAction({
        workspaceId,
        query: requestedQuery,
        cursor: alternativeCursor,
        selectedIds: draft.alternativeExerciseIds,
      });
      if (requestedSearchKey !== latestAlternativeSearchKey.current) return;
      if (result.status !== 'ok') {
        setFailed(true);
        return;
      }
      const data = result.data as {
        options: ExerciseAlternativeOption[];
        nextCursor: string | null;
      };
      setAlternativeOptions((previous) => {
        const merged = new Map(
          previous.map((option) => [`${option.kind}:${option.id}`, option]),
        );
        for (const option of data.options)
          merged.set(`${option.kind}:${option.id}`, option);
        return [...merged.values()];
      });
      setAlternativeCursor(data.nextCursor);
    } catch {
      if (requestedSearchKey === latestAlternativeSearchKey.current)
        setFailed(true);
    } finally {
      if (requestedSearchKey === latestAlternativeSearchKey.current)
        setAlternativeLoading(false);
    }
  }

  function operationKeyFor(signature: string) {
    let key = operationKeys.current.get(signature);
    if (!key) {
      key = globalThis.crypto.randomUUID();
      operationKeys.current.set(signature, key);
    }
    return key;
  }

  function markDirty(field: OverrideField) {
    setDirty((previous) => new Set(previous).add(field));
  }

  function patchDraft(patch: Partial<OverrideDraft>, field: OverrideField) {
    setDraft((previous) => ({ ...previous, ...patch }));
    markDirty(field);
  }

  function toggleAlternative(value: string, checked: boolean) {
    setDraft((previous) => {
      const selected = previous.alternativeExerciseIds;
      return {
        ...previous,
        alternativeExerciseIds: checked
          ? [...selected, value]
          : selected.filter((item) => item !== value),
      };
    });
    markDirty('alternatives');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== 'idle' || dirty.size === 0) return;
    const nextErrors = validateOverrideDraft(draft, dirty, exerciseId);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const request = buildOverrideRequest(draft, dirty);
    if (!request) return;
    const signature = JSON.stringify([
      'save',
      workspaceId,
      exerciseId,
      expectedVersion,
      request,
    ]);
    setFailed(false);
    setBusy('saving');
    try {
      const result = await saveExerciseOverrideAction({
        workspaceId,
        exerciseId,
        expectedVersion,
        operationKey: operationKeyFor(signature),
        request,
      });
      if (result.status === 'ok') {
        operationKeys.current.delete(signature);
        router.refresh();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy('idle');
    }
  }

  async function reset(field: OverrideField) {
    if (busy !== 'idle' || dirty.size > 0) return;
    setFailed(false);
    setBusy(field);
    const signature = JSON.stringify([
      'reset',
      workspaceId,
      exerciseId,
      expectedVersion,
      field,
    ]);
    try {
      const result = await resetExerciseOverrideFieldAction({
        workspaceId,
        exerciseId,
        expectedVersion,
        operationKey: operationKeyFor(signature),
        field,
      });
      if (result.status === 'ok') {
        operationKeys.current.delete(signature);
        router.refresh();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy('idle');
    }
  }

  const disabled = busy !== 'idle';
  const badgeFor = (field: OverrideField) =>
    sources[field] === 'override'
      ? m['catalog.overrideCustomized']
      : m['catalog.overrideInherited'];

  const fieldHeader = (field: OverrideField, label: string) => (
    <div className={styles.overrideMeta}>
      <span className={styles.badge} data-source={sources[field]}>
        {badgeFor(field)}
      </span>
      {sources[field] === 'override' ? (
        <Button
          variant="secondary"
          disabled={disabled || dirty.size > 0}
          loading={busy === field}
          loadingLabel={m['catalog.editorSaving']}
          aria-label={`${m['catalog.overrideReset']} — ${label}`}
          onClick={() => reset(field)}
        >
          {m['catalog.overrideReset']}
        </Button>
      ) : null}
    </div>
  );

  return (
    <section
      className={styles.editor}
      dir={dirFor(locale)}
      lang={locale}
      data-testid="exercise-override-editor"
      aria-labelledby={`${exerciseId}-override-title`}
    >
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 id={`${exerciseId}-override-title`}>
            {m['catalog.editorTitle']}
          </h2>
        </div>
      </header>

      {failed && (
        <Alert tone="error" title={m['catalog.editorStatusError']}>
          <p>{m['catalog.editorStatusErrorDescription']}</p>
        </Alert>
      )}

      <form className={styles.form} onSubmit={submit} noValidate>
        <fieldset className={styles.group}>
          <legend>{m['catalog.editorBasics']}</legend>

          <div className={styles.overrideField}>
            {fieldHeader('name', m['catalog.editorNameEn'])}
            <div className={styles.grid}>
              <Field
                label={m['catalog.editorNameEn']}
                error={errorText(errors.name, m)}
                inputProps={{
                  id: `${exerciseId}-override-name-en`,
                  value: draft.names.en,
                  disabled,
                  onChange: (event) =>
                    patchDraft(
                      {
                        names: {
                          ...draft.names,
                          en: event.currentTarget.value,
                        },
                      },
                      'name',
                    ),
                }}
              />
              <Field
                label={m['catalog.editorNameAr']}
                inputProps={{
                  id: `${exerciseId}-override-name-ar`,
                  value: draft.names.ar,
                  disabled,
                  onChange: (event) =>
                    patchDraft(
                      {
                        names: {
                          ...draft.names,
                          ar: event.currentTarget.value,
                        },
                      },
                      'name',
                    ),
                }}
              />
            </div>
          </div>

          <div className={styles.overrideField}>
            {fieldHeader('description', m['catalog.editorDescription'])}
            <Field
              label={m['catalog.editorDescription']}
              error={errorText(errors.description, m)}
              inputProps={{
                id: `${exerciseId}-override-description`,
                value: draft.description,
                disabled,
                onChange: (event) =>
                  patchDraft(
                    { description: event.currentTarget.value },
                    'description',
                  ),
              }}
            />
          </div>

          <div className={styles.overrideField}>
            {fieldHeader('notes', m['catalog.editorNotes'])}
            <Field
              label={m['catalog.editorNotes']}
              error={errorText(errors.notes, m)}
              inputProps={{
                id: `${exerciseId}-override-notes`,
                value: draft.notes,
                disabled,
                onChange: (event) =>
                  patchDraft({ notes: event.currentTarget.value }, 'notes'),
              }}
            />
          </div>

          <div className={styles.overrideField}>
            {fieldHeader('video', m['catalog.editorVideo'])}
            <Field
              label={m['catalog.editorVideo']}
              error={errorText(errors.video, m)}
              inputProps={{
                id: `${exerciseId}-override-video`,
                type: 'url',
                inputMode: 'url',
                value: draft.videoUrl,
                disabled,
                onChange: (event) =>
                  patchDraft({ videoUrl: event.currentTarget.value }, 'video'),
              }}
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>{m['catalog.editorDefaultsFormTitle']}</legend>

          <div className={styles.overrideField}>
            {fieldHeader('default_reps', m['catalog.editorReps'])}
            <fieldset className={styles.repsGroup}>
              <legend>{m['catalog.editorReps']}</legend>
              <div className={styles.radioRow}>
                {(['fixed', 'range'] as const).map((mode) => (
                  <div key={mode} className={styles.radioOption}>
                    <input
                      id={`${exerciseId}-override-reps-${mode}`}
                      type="radio"
                      name={`${exerciseId}-override-reps-mode`}
                      value={mode}
                      checked={draft.repsMode === mode}
                      disabled={disabled}
                      onChange={() =>
                        patchDraft({ repsMode: mode }, 'default_reps')
                      }
                    />
                    <label htmlFor={`${exerciseId}-override-reps-${mode}`}>
                      {mode === 'fixed'
                        ? m['catalog.editorRepsFixed']
                        : m['catalog.editorRepsRange']}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
            {draft.repsMode === 'fixed' ? (
              <Field
                label={m['catalog.editorRepsFixedValue']}
                error={errorText(errors.default_reps, m)}
                inputProps={{
                  id: `${exerciseId}-override-reps-value`,
                  type: 'number',
                  inputMode: 'numeric',
                  min: 1,
                  max: 100,
                  value: draft.repsValue,
                  disabled,
                  onChange: (event) =>
                    patchDraft(
                      { repsValue: event.currentTarget.value },
                      'default_reps',
                    ),
                }}
              />
            ) : (
              <div className={styles.grid}>
                <Field
                  label={m['catalog.editorRepsMin']}
                  error={errorText(errors.default_reps, m)}
                  inputProps={{
                    id: `${exerciseId}-override-reps-min`,
                    type: 'number',
                    inputMode: 'numeric',
                    min: 1,
                    max: 100,
                    value: draft.repsMin,
                    disabled,
                    onChange: (event) =>
                      patchDraft(
                        { repsMin: event.currentTarget.value },
                        'default_reps',
                      ),
                  }}
                />
                <Field
                  label={m['catalog.editorRepsMax']}
                  inputProps={{
                    id: `${exerciseId}-override-reps-max`,
                    type: 'number',
                    inputMode: 'numeric',
                    min: 1,
                    max: 100,
                    value: draft.repsMax,
                    disabled,
                    onChange: (event) =>
                      patchDraft(
                        { repsMax: event.currentTarget.value },
                        'default_reps',
                      ),
                  }}
                />
              </div>
            )}
          </div>

          <div className={styles.overrideField}>
            {fieldHeader('default_rest_time', m['catalog.editorRest'])}
            <Field
              label={m['catalog.editorRest']}
              error={errorText(errors.default_rest_time, m)}
              inputProps={{
                id: `${exerciseId}-override-rest`,
                type: 'number',
                inputMode: 'numeric',
                min: 0,
                max: 600,
                step: 15,
                value: draft.restSeconds,
                disabled,
                onChange: (event) =>
                  patchDraft(
                    { restSeconds: event.currentTarget.value },
                    'default_rest_time',
                  ),
              }}
            />
          </div>

          <div className={styles.overrideField}>
            {fieldHeader('default_rir', m['catalog.editorRir'])}
            <Field
              label={m['catalog.editorRir']}
              error={errorText(errors.default_rir, m)}
              inputProps={{
                id: `${exerciseId}-override-rir`,
                type: 'number',
                inputMode: 'numeric',
                min: 0,
                max: 5,
                value: draft.rir,
                disabled,
                onChange: (event) =>
                  patchDraft({ rir: event.currentTarget.value }, 'default_rir'),
              }}
            />
          </div>

          <div className={styles.overrideField}>
            {fieldHeader('alternatives', m['catalog.editorAlternatives'])}
            <fieldset className={styles.alternatives}>
              <legend>{m['catalog.editorAlternatives']}</legend>
              <p className={styles.hint} id={`${exerciseId}-override-alt-hint`}>
                {m['catalog.editorAlternativesHint']}
              </p>
              <Field
                label={m['catalog.searchLabel']}
                inputProps={{
                  id: `${exerciseId}-override-alternative-search`,
                  type: 'search',
                  value: alternativeQuery,
                  disabled,
                  onChange: (event) =>
                    setAlternativeQuery(event.currentTarget.value),
                }}
              />
              <p
                role="status"
                aria-live="polite"
                aria-busy={alternativeLoading}
              >
                {alternativeLoading ? m['catalog.loading'] : ''}
              </p>
              {alternativeOptions.length ? (
                <ul className={styles.alternativeList}>
                  {alternativeOptions
                    .filter((option) => option.id !== exerciseId)
                    .map((option) => {
                      const value =
                        option.kind === 'private'
                          ? `w:${option.id}`
                          : `g:${option.id}`;
                      const checked =
                        draft.alternativeExerciseIds.includes(value);
                      const id = `${exerciseId}-override-alt-${option.id}`;
                      return (
                        <li key={value}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            disabled={
                              disabled ||
                              (!checked &&
                                draft.alternativeExerciseIds.length >= 3)
                            }
                            aria-describedby={`${exerciseId}-override-alt-hint`}
                            onChange={(event) =>
                              toggleAlternative(
                                value,
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
                <div className={styles.hint}>
                  <p>{m['catalog.noResultsTitle']}</p>
                  <p>{m['catalog.noResultsDescription']}</p>
                </div>
              )}
              {alternativeCursor ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || alternativeLoading}
                  onClick={loadNextAlternatives}
                >
                  {m['catalog.nextPage']}
                </Button>
              ) : null}
              {errors.alternatives && (
                <p className={styles.error} role="alert">
                  {errorText(errors.alternatives, m)}
                </p>
              )}
            </fieldset>
          </div>
        </fieldset>

        <div className={styles.actions}>
          <Button
            type="submit"
            loading={busy === 'saving'}
            loadingLabel={m['catalog.editorSaving']}
            disabled={disabled || dirty.size === 0}
          >
            {m['catalog.editorSaveWorkspace']}
          </Button>
        </div>
      </form>
    </section>
  );
}
