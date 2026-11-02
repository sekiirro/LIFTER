'use client';

import { useMemo, useState } from 'react';
import type { Messages } from '../../../lib/i18n';
import type { Locale } from '../../../lib/design/preferences';
import {
  duplicateWorkoutDay,
  duplicateWorkoutItem,
} from '../../../lib/plans/workout/id-continuity';
import {
  moveBuilderItem,
  moveBuilderItemBy,
} from '../../../lib/plans/workout/builder-actions';
import { reorderWorkoutDays } from '../../../lib/plans/workout/document-ops';
import { formatDigits } from '../../../lib/i18n/format-digits';
import { parseBuilderNumber } from '../../../lib/plans/workout/builder-input';
import type { WorkoutBuilderFixture } from '../../../lib/plans/workout/builder-fixtures';
import type {
  WorkoutDay,
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutItem,
  WorkoutSet,
} from '../../../lib/plans/workout/schema';
import { Button } from '../../ui/Button';
import { Bidi } from '../../ui/Bidi';
import { Field } from '../../ui/Field';
import styles from './WorkoutBuilder.module.css';

type Props = {
  locale: Locale;
  messages: Messages;
  fixture: WorkoutBuilderFixture;
};
const uuid = () => globalThis.crypto.randomUUID();
const shallow = <T,>(value: T): T => structuredClone(value);

function names(fixture: WorkoutBuilderFixture, locale: Locale) {
  return new Map(
    fixture.catalog.map((entry) => [entry.id, entry.name[locale]]),
  );
}

export function WorkoutBuilder({ locale, messages: m, fixture }: Props) {
  const [document, setDocument] = useState(() => shallow(fixture.document));
  const [notice, setNotice] = useState('');
  const [videoReferences, setVideoReferences] = useState(() => ({
    ...fixture.videoReferences,
  }));
  const catalogNames = useMemo(() => names(fixture, locale), [fixture, locale]);
  const announce = () => {
    setNotice(m['builder.updated']);
  };
  const update = (next: WorkoutDocument) => {
    setDocument(next);
    announce();
  };
  const setDay = (dayId: string, transform: (day: WorkoutDay) => WorkoutDay) =>
    update({
      ...document,
      days: document.days.map((day) =>
        day.id === dayId ? transform(day) : day,
      ),
    });
  const setItem = (
    dayId: string,
    itemId: string,
    transform: (item: WorkoutItem) => WorkoutItem,
  ) =>
    setDay(dayId, (day) => ({
      ...day,
      items: (day.items ?? []).map((item) =>
        item.id === itemId ? transform(item) : item,
      ),
    }));
  const setSet = (
    dayId: string,
    itemId: string,
    setId: string,
    transform: (set: WorkoutSet) => WorkoutSet,
  ) =>
    setItem(dayId, itemId, (item) => ({
      ...item,
      sets: item.sets.map((set) => (set.id === setId ? transform(set) : set)),
    }));
  const addDay = (kind: 'session' | 'rest') =>
    update({
      ...document,
      days: [
        ...document.days,
        {
          id: uuid(),
          kind,
          title:
            kind === 'rest' ? m['builder.restDayTitle'] : m['builder.dayTitle'],
          ...(kind === 'session' ? { items: [] } : {}),
        },
      ],
    });
  const duplicateDay = (dayId: string) => {
    const source = document.days.find((day) => day.id === dayId)!;
    const assignment = {
      dayId: uuid(),
      items: (source.items ?? []).map((item) => ({
        itemId: uuid(),
        setIds: item.sets.map(uuid),
      })),
    };
    update(duplicateWorkoutDay(document, dayId, assignment));
  };
  const duplicateItem = (dayId: string, itemId: string) => {
    const item = document.days
      .find((day) => day.id === dayId)
      ?.items?.find((candidate) => candidate.id === itemId);
    if (!item) return;
    update(
      duplicateWorkoutItem(
        document,
        { dayId, itemId },
        { itemId: uuid(), setIds: item.sets.map(uuid) },
      ),
    );
  };
  const addExercise = (dayId: string, exerciseId: string) => {
    const entry = fixture.catalog.find(
      (candidate) => candidate.id === exerciseId,
    );
    if (!entry) return;
    const item: WorkoutItem = {
      id: uuid(),
      exercise: entry.reference,
      sets: entry.defaults.map((set) => ({
        ...set,
        reps: { ...set.reps },
        load: { ...set.load },
        id: uuid(),
      })),
    };
    setDay(dayId, (day) => ({ ...day, items: [...(day.items ?? []), item] }));
  };
  const refName = (reference: WorkoutExerciseReference) =>
    catalogNames.get(reference.id) ?? reference.id;
  const patchReps = (
    set: WorkoutSet,
    field: 'value' | 'min' | 'max',
    value: string,
  ) => {
    const n = parseBuilderNumber(value, 'reps');
    if (n === null || n === undefined) return set;
    const reps = 'value' in set.reps ? { value: n } : { ...set.reps };
    if (field === 'value' && 'value' in reps) reps.value = n;
    else if (field !== 'value' && !('value' in reps)) reps[field] = n;
    return { ...set, reps };
  };

  return (
    <section
      className={styles.builder}
      data-testid="workout-builder"
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className={styles.notice}>{m['builder.projectionNotice']}</div>
      <div className={styles.planHeader}>
        <div>
          <h2>{m['builder.days']}</h2>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => addDay('session')}>
            {m['builder.addSession']}
          </Button>
          <Button variant="secondary" onClick={() => addDay('rest')}>
            {m['builder.addRestDay']}
          </Button>
        </div>
      </div>
      <Field
        label={m['builder.planNotes']}
        inputProps={{
          value: document.notes ?? '',
          onChange: (event) =>
            update({ ...document, notes: event.target.value }),
          onBlur: announce,
        }}
      />
      <p className={styles.status} role="status" aria-live="polite">
        {notice}
      </p>
      <div className={styles.days}>
        {document.days.map((day, dayIndex) => (
          <article
            className={styles.day}
            key={day.id}
            data-testid={`builder-day-${day.id}`}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes('text/plain') &&
                day.kind === 'session'
              ) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (day.kind !== 'session') return;
              try {
                const source = JSON.parse(
                  event.dataTransfer.getData('text/plain'),
                ) as { dayId?: unknown; itemId?: unknown };
                if (
                  typeof source.dayId === 'string' &&
                  typeof source.itemId === 'string' &&
                  source.dayId !== day.id
                ) {
                  update(
                    moveBuilderItem(
                      document,
                      source.dayId,
                      source.itemId,
                      day.id,
                    ),
                  );
                }
              } catch {
                // Ignore unrelated or malformed drag payloads.
              }
            }}
          >
            <header
              className={styles.dayHeader}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('text/day-id'))
                  event.preventDefault();
              }}
              onDrop={(event) => {
                const sourceId = event.dataTransfer.getData('text/day-id');
                if (!sourceId) return;
                event.preventDefault();
                const ids = document.days.map((candidate) => candidate.id);
                const sourceIndex = ids.indexOf(sourceId);
                const targetIndex = ids.indexOf(day.id);
                if (
                  sourceIndex >= 0 &&
                  targetIndex >= 0 &&
                  sourceIndex !== targetIndex
                ) {
                  ids.splice(sourceIndex, 1);
                  ids.splice(targetIndex, 0, sourceId);
                  update(reorderWorkoutDays(document, ids));
                }
              }}
            >
              <span className={styles.dayNumber}>
                {formatDigits(dayIndex + 1, locale)}
              </span>
              <span
                className={styles.dragHandle}
                draggable
                aria-label={`${m['builder.dragDay']}: ${day.title ?? ''}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/day-id', day.id);
                }}
              >
                {m['builder.dragDay']}
              </span>
              <Field
                label={m['builder.dayTitle']}
                inputProps={{
                  value: day.title ?? '',
                  onChange: (event) =>
                    setDay(day.id, (current) => ({
                      ...current,
                      title: event.target.value,
                    })),
                }}
              />
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  aria-label={`${m['builder.moveUp']}: ${day.title ?? ''}`}
                  disabled={dayIndex === 0}
                  onClick={() => {
                    const ids = document.days.map((candidate) => candidate.id);
                    [ids[dayIndex - 1], ids[dayIndex]] = [
                      ids[dayIndex]!,
                      ids[dayIndex - 1]!,
                    ];
                    update(reorderWorkoutDays(document, ids));
                  }}
                >
                  {m['builder.moveUp']}
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`${m['builder.moveDown']}: ${day.title ?? ''}`}
                  disabled={dayIndex === document.days.length - 1}
                  onClick={() => {
                    const ids = document.days.map((candidate) => candidate.id);
                    [ids[dayIndex], ids[dayIndex + 1]] = [
                      ids[dayIndex + 1]!,
                      ids[dayIndex]!,
                    ];
                    update(reorderWorkoutDays(document, ids));
                  }}
                >
                  {m['builder.moveDown']}
                </Button>
                <Button
                  variant="secondary"
                  aria-label={m['builder.duplicateDayNamed'].replace(
                    '{name}',
                    day.title ?? '',
                  )}
                  onClick={() => duplicateDay(day.id)}
                >
                  {m['builder.duplicateDayNamed'].replace(
                    '{name}',
                    day.title ?? '',
                  )}
                </Button>
                <Button
                  variant="destructive"
                  aria-label={`${m['builder.removeDay']}: ${day.title ?? ''}`}
                  onClick={() =>
                    update({
                      ...document,
                      days: document.days.filter(
                        (candidate) => candidate.id !== day.id,
                      ),
                    })
                  }
                >
                  {m['builder.removeDay']}
                </Button>
              </div>
            </header>
            <Field
              label={m['builder.dayNotes']}
              inputProps={{
                value: day.notes ?? '',
                onChange: (event) =>
                  setDay(day.id, (current) => ({
                    ...current,
                    notes: event.target.value,
                  })),
              }}
            />
            {day.kind === 'rest' ? (
              <p className={styles.empty}>{m['builder.emptyRest']}</p>
            ) : (
              <>
                {(day.items ?? []).length === 0 && (
                  <p className={styles.empty}>{m['builder.emptySession']}</p>
                )}
                <div className={styles.items}>
                  {(day.items ?? []).map((item, itemIndex) => (
                    <section
                      className={styles.item}
                      key={item.id}
                      data-testid={`builder-item-${item.id}`}
                      data-item-id={item.id}
                      data-item-exercise={item.exercise.id}
                    >
                      <div className={styles.itemHeader}>
                        <span
                          className={styles.dragHandle}
                          draggable
                          aria-label={m['builder.dragExerciseNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData(
                              'text/plain',
                              JSON.stringify({
                                dayId: day.id,
                                itemId: item.id,
                              }),
                            );
                          }}
                        >
                          {m['builder.dragExercise']}
                        </span>
                        <span className={styles.itemIndex}>
                          {formatDigits(itemIndex + 1, locale)}
                        </span>
                        <strong>
                          <Bidi>{refName(item.exercise)}</Bidi>
                        </strong>
                        <span className={styles.flex} />
                        <Button
                          variant="secondary"
                          aria-label={m['builder.moveUpNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                          disabled={itemIndex === 0}
                          onClick={() =>
                            update(
                              moveBuilderItemBy(document, day.id, item.id, -1),
                            )
                          }
                        >
                          {m['builder.moveUpNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={m['builder.moveDownNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                          disabled={itemIndex === (day.items?.length ?? 0) - 1}
                          onClick={() =>
                            update(
                              moveBuilderItemBy(document, day.id, item.id, 1),
                            )
                          }
                        >
                          {m['builder.moveDownNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                        </Button>
                        <label className={styles.moveSelect}>
                          {m['builder.moveToDay']}
                          <select
                            aria-label={m['builder.moveToDayNamed'].replace(
                              '{name}',
                              refName(item.exercise),
                            )}
                            value={day.id}
                            onChange={(event) =>
                              update(
                                moveBuilderItem(
                                  document,
                                  day.id,
                                  item.id,
                                  event.target.value,
                                ),
                              )
                            }
                          >
                            {document.days
                              .filter((target) => target.kind === 'session')
                              .map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.title}
                                </option>
                              ))}
                          </select>
                        </label>
                        <Button
                          variant="secondary"
                          aria-label={m[
                            'builder.duplicateExerciseNamed'
                          ].replace('{name}', refName(item.exercise))}
                          onClick={() => duplicateItem(day.id, item.id)}
                        >
                          {m['builder.duplicateExerciseNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          aria-label={m['builder.removeExerciseNamed'].replace(
                            '{name}',
                            refName(item.exercise),
                          )}
                          onClick={() =>
                            setDay(day.id, (current) => ({
                              ...current,
                              items: (current.items ?? []).filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            }))
                          }
                        >
                          {m['builder.removeExercise']}
                        </Button>
                      </div>
                      <div className={styles.editorGrid}>
                        <Field
                          label={m['builder.exerciseNotes']}
                          inputProps={{
                            value: item.notes ?? '',
                            onChange: (event) =>
                              setItem(day.id, item.id, (current) => ({
                                ...current,
                                notes: event.target.value,
                              })),
                          }}
                        />
                        <Field
                          label={m['builder.videoRef']}
                          hint={m['builder.videoRefHint']}
                          inputProps={{
                            value: videoReferences[item.exercise.id] ?? '',
                            dir: 'ltr',
                            onChange: (event) => {
                              setVideoReferences({
                                ...videoReferences,
                                [item.exercise.id]: event.target.value,
                              });
                              announce();
                            },
                          }}
                        />
                      </div>
                      <div className={styles.setHeading}>
                        <h3>{m['builder.sets']}</h3>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setItem(day.id, item.id, (current) => ({
                              ...current,
                              sets: [
                                ...current.sets,
                                {
                                  id: uuid(),
                                  type: 'working',
                                  reps: { value: 8 },
                                  load: { mode: 'bodyweight' },
                                  restSec: 60,
                                },
                              ],
                            }))
                          }
                        >
                          {m['builder.addSet']}
                        </Button>
                      </div>
                      {item.sets.map((set, setIndex) => (
                        <fieldset
                          className={styles.set}
                          key={set.id}
                          data-testid={`builder-set-${set.id}`}
                          data-set-id={set.id}
                        >
                          <legend>
                            {m['builder.setNumber'].replace(
                              '{number}',
                              formatDigits(setIndex + 1, locale),
                            )}
                          </legend>
                          <label>
                            {m['builder.setType']}
                            <select
                              value={set.type}
                              onChange={(event) =>
                                setSet(day.id, item.id, set.id, (current) => ({
                                  ...current,
                                  type: event.target.value as
                                    'warmup' | 'working',
                                }))
                              }
                            >
                              <option value="warmup">
                                {m['builder.warmup']}
                              </option>
                              <option value="working">
                                {m['builder.working']}
                              </option>
                            </select>
                          </label>
                          <label>
                            {m['builder.loadMode']}
                            <select
                              value={set.load.mode}
                              onChange={(event) =>
                                setSet(day.id, item.id, set.id, (current) => ({
                                  ...current,
                                  load:
                                    event.target.value === 'bodyweight'
                                      ? { mode: 'bodyweight' }
                                      : {
                                          mode: event.target.value as
                                            'added_weight' | 'assisted',
                                          value: '10',
                                          unit: 'kg',
                                        },
                                }))
                              }
                            >
                              <option value="bodyweight">
                                {m['builder.bodyweight']}
                              </option>
                              <option value="added_weight">
                                {m['builder.load']}
                              </option>
                              <option value="assisted">
                                {m['builder.assisted']}
                              </option>
                            </select>
                          </label>
                          <label>
                            {m['builder.repsMode']}
                            <select
                              value={'value' in set.reps ? 'fixed' : 'range'}
                              onChange={(event) =>
                                setSet(day.id, item.id, set.id, (current) => ({
                                  ...current,
                                  reps:
                                    event.target.value === 'fixed'
                                      ? { value: 8 }
                                      : { min: 8, max: 10 },
                                }))
                              }
                            >
                              <option value="fixed">
                                {m['builder.fixedReps']}
                              </option>
                              <option value="range">
                                {m['builder.repRange']}
                              </option>
                            </select>
                          </label>
                          {'value' in set.reps ? (
                            <label>
                              {m['builder.reps']}
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatDigits(set.reps.value, locale)}
                                onChange={(event) =>
                                  setSet(day.id, item.id, set.id, (current) =>
                                    patchReps(
                                      current,
                                      'value',
                                      event.target.value,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ) : (
                            <>
                              <label>
                                {m['builder.min']}
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatDigits(set.reps.min, locale)}
                                  onChange={(event) =>
                                    setSet(day.id, item.id, set.id, (current) =>
                                      patchReps(
                                        current,
                                        'min',
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                {m['builder.max']}
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatDigits(set.reps.max, locale)}
                                  onChange={(event) =>
                                    setSet(day.id, item.id, set.id, (current) =>
                                      patchReps(
                                        current,
                                        'max',
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </>
                          )}
                          {set.load.mode !== 'bodyweight' && (
                            <>
                              <label>
                                {m['builder.loadValue']}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={formatDigits(set.load.value, locale)}
                                  onChange={(event) => {
                                    const value = parseBuilderNumber(
                                      event.target.value,
                                      'load',
                                    );
                                    if (value === null || value === undefined)
                                      return;
                                    setSet(
                                      day.id,
                                      item.id,
                                      set.id,
                                      (current) => ({
                                        ...current,
                                        load:
                                          current.load.mode === 'bodyweight'
                                            ? current.load
                                            : {
                                                ...current.load,
                                                value,
                                              },
                                      }),
                                    );
                                  }}
                                />
                              </label>
                              <label>
                                {m['builder.unit']}
                                <select
                                  value={set.load.unit}
                                  onChange={(event) =>
                                    setSet(
                                      day.id,
                                      item.id,
                                      set.id,
                                      (current) => ({
                                        ...current,
                                        load:
                                          current.load.mode === 'bodyweight'
                                            ? current.load
                                            : {
                                                ...current.load,
                                                unit: event.target.value as
                                                  'kg' | 'lb',
                                              },
                                      }),
                                    )
                                  }
                                >
                                  <option value="kg">{m['builder.kg']}</option>
                                  <option value="lb">{m['builder.lb']}</option>
                                </select>
                              </label>
                            </>
                          )}
                          <label>
                            {m['builder.restHint']}
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatDigits(set.restSec ?? '', locale)}
                              onChange={(event) => {
                                const value = parseBuilderNumber(
                                  event.target.value,
                                  'rest',
                                );
                                if (value === null) return;
                                setSet(day.id, item.id, set.id, (current) => ({
                                  ...current,
                                  restSec: value,
                                }));
                              }}
                            />
                          </label>
                          <label>
                            {m['builder.rirHint']}
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatDigits(set.rir ?? '', locale)}
                              onChange={(event) => {
                                const value = parseBuilderNumber(
                                  event.target.value,
                                  'rir',
                                );
                                if (value === null) return;
                                setSet(day.id, item.id, set.id, (current) => ({
                                  ...current,
                                  rir: value,
                                }));
                              }}
                            />
                          </label>
                          <label className={styles.wide}>
                            {m['builder.setNotes']}
                            <input
                              value={set.notes ?? ''}
                              onChange={(event) =>
                                setSet(day.id, item.id, set.id, (current) => ({
                                  ...current,
                                  notes: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <Button
                            variant="destructive"
                            onClick={() =>
                              setItem(day.id, item.id, (current) => ({
                                ...current,
                                sets: current.sets.filter(
                                  (candidate) => candidate.id !== set.id,
                                ),
                              }))
                            }
                          >
                            {m['builder.removeSet']}
                          </Button>
                        </fieldset>
                      ))}
                      <div className={styles.setHeading}>
                        <h3>{m['builder.alternatives']}</h3>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setItem(day.id, item.id, (current) => ({
                              ...current,
                              alternatives: [
                                ...(current.alternatives ?? []),
                                fixture.catalog[0]!.reference,
                              ],
                            }))
                          }
                        >
                          {m['builder.addAlternative']}
                        </Button>
                      </div>
                      {(item.alternatives ?? []).length === 0 && (
                        <p className={styles.empty}>
                          {m['builder.noAlternatives']}
                        </p>
                      )}
                      {(item.alternatives ?? []).map(
                        (alternative, alternativeIndex) => (
                          <div
                            className={styles.alternative}
                            key={`${alternative.id}-${alternativeIndex}`}
                          >
                            <label>
                              {m['builder.alternativeExercise']}
                              <select
                                value={alternative.id}
                                onChange={(event) => {
                                  const reference = fixture.catalog.find(
                                    (entry) => entry.id === event.target.value,
                                  )?.reference;
                                  if (reference)
                                    setItem(day.id, item.id, (current) => ({
                                      ...current,
                                      alternatives: current.alternatives?.map(
                                        (candidate, index) =>
                                          index === alternativeIndex
                                            ? reference
                                            : candidate,
                                      ),
                                    }));
                                }}
                              >
                                {fixture.catalog.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.name[locale]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Button
                              variant="destructive"
                              onClick={() =>
                                setItem(day.id, item.id, (current) => ({
                                  ...current,
                                  alternatives: current.alternatives?.filter(
                                    (_, index) => index !== alternativeIndex,
                                  ),
                                }))
                              }
                            >
                              {m['builder.removeAlternative']}
                            </Button>
                          </div>
                        ),
                      )}
                    </section>
                  ))}
                </div>
                <label className={styles.addExercise}>
                  {m['builder.addExercise']}
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value)
                        addExercise(day.id, event.target.value);
                      event.currentTarget.value = '';
                    }}
                  >
                    <option value="">{m['builder.chooseExercise']}</option>
                    {fixture.catalog.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name[locale]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
