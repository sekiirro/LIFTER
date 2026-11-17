'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import {
  addWorkoutDay,
  addWorkoutItem,
  duplicateWorkoutDay,
  duplicateWorkoutItem,
  moveWorkoutItem,
  parseWorkoutDocumentV1,
  removeWorkoutAlternative,
  removeWorkoutDay,
  removeWorkoutItem,
  reorderWorkoutDay,
  reorderWorkoutItem,
  updatePlanNotes,
  updateWorkoutDay,
  updateWorkoutItem,
  updateWorkoutSet,
  type WorkoutDocumentV1,
} from '../../lib/workout-planner/document';
import type {
  WorkoutItem,
  WorkoutSet,
} from '../../lib/workout-planner/id-remap';
import { Bidi } from '../ui/Bidi';
import styles from './WorkoutPlanBuilder.module.css';

export type BuilderSet = WorkoutSet;

export type BuilderItem = {
  id: string;
  exercise?: unknown;
  name: string;
  description?: string;
  reps?: { value: number } | { min: number; max: number };
  restSec?: number;
  rir?: number;
  notes?: string;
  alternatives?: unknown[];
  sets: BuilderSet[];
};

export type BuilderDay = {
  id: string;
  kind: 'session' | 'rest';
  title?: string;
  notes?: string;
  items: BuilderItem[];
};

export type WorkoutPlanBuilderProps = {
  document: WorkoutDocumentV1;
  locale: Locale;
  onChange?: (document: WorkoutDocumentV1) => void;
  onError?: (error: Error) => void;
  readOnly?: boolean;
};

export function WorkoutPlanBuilder({
  document: doc,
  locale,
  onChange,
  onError,
  readOnly = false,
}: WorkoutPlanBuilderProps): React.JSX.Element {
  const m = getMessages(locale);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to commit document changes with validation
  const commit = useCallback(
    (updater: () => WorkoutDocumentV1): void => {
      if (readOnly) return;
      try {
        const nextDoc = updater();
        onChange?.(nextDoc);
      } catch (err) {
        if (err instanceof Error) {
          onError?.(err);
        } else {
          onError?.(new Error('invalid_document'));
        }
      }
    },
    [readOnly, onChange, onError],
  );

  // Listen for programmatic events on container (e.g. testing acceptance tests)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleAddItem = (e: Event): void => {
      const customEvent = e as CustomEvent<{
        dayId: string;
        item: WorkoutItem;
      }>;
      if (!customEvent.detail) return;
      const { dayId, item } = customEvent.detail;
      commit(() => addWorkoutItem(doc, dayId, item));
    };

    const handleMoveItemToDay = (e: Event): void => {
      const customEvent = e as CustomEvent<{
        itemId: string;
        targetDayId: string;
      }>;
      if (!customEvent.detail) return;
      const { itemId, targetDayId } = customEvent.detail;
      commit(() => moveWorkoutItem(doc, itemId, targetDayId));
    };

    el.addEventListener('lifter:builder:add-item', handleAddItem);
    el.addEventListener('lifter:builder:move-item-to-day', handleMoveItemToDay);

    return () => {
      el.removeEventListener('lifter:builder:add-item', handleAddItem);
      el.removeEventListener(
        'lifter:builder:move-item-to-day',
        handleMoveItemToDay,
      );
    };
  }, [doc, commit]);

  const handleAddSessionDay = (): void => {
    commit(() =>
      addWorkoutDay(doc, {
        id: crypto.randomUUID(),
        kind: 'session',
        title: '',
        notes: '',
        items: [],
      }),
    );
  };

  const handleAddRestDay = (): void => {
    commit(() =>
      addWorkoutDay(doc, {
        id: crypto.randomUUID(),
        kind: 'rest',
        title: '',
        notes: '',
        items: [],
      }),
    );
  };

  const handleMoveDay = (dayId: string, direction: 'up' | 'down'): void => {
    commit(() => reorderWorkoutDay(doc, dayId, direction));
  };

  const handleDuplicateDay = (dayId: string): void => {
    commit(() => duplicateWorkoutDay(doc, dayId));
  };

  const handleRemoveDay = (dayId: string): void => {
    commit(() => removeWorkoutDay(doc, dayId));
  };

  const handleMoveItem = (itemId: string, direction: 'up' | 'down'): void => {
    commit(() => reorderWorkoutItem(doc, itemId, direction));
  };

  const handleMoveItemToTargetDay = (
    itemId: string,
    targetDayId: string,
  ): void => {
    commit(() => moveWorkoutItem(doc, itemId, targetDayId));
  };

  const handleDuplicateItem = (itemId: string): void => {
    commit(() => duplicateWorkoutItem(doc, itemId));
  };

  const handleRemoveItem = (itemId: string): void => {
    commit(() => removeWorkoutItem(doc, itemId));
  };

  const handleAddSet = (itemId: string): void => {
    commit(() => {
      const current = parseWorkoutDocumentV1(doc);
      const day = current.days.find((d) =>
        d.items.some((item) => item.id === itemId),
      );
      if (!day) throw new Error('invalid_document');
      const item = day.items.find((i) => i.id === itemId);
      if (!item) throw new Error('invalid_document');
      const newSet: WorkoutSet = {
        id: crypto.randomUUID(),
        type: 'working',
        load: { mode: 'bodyweight' },
      };
      item.sets.push(newSet);
      return parseWorkoutDocumentV1(current);
    });
  };

  const handleRemoveSet = (itemId: string, setId: string): void => {
    commit(() => {
      const current = parseWorkoutDocumentV1(doc);
      const day = current.days.find((d) =>
        d.items.some((item) => item.id === itemId),
      );
      if (!day) throw new Error('invalid_document');
      const item = day.items.find((i) => i.id === itemId);
      if (!item) throw new Error('invalid_document');
      const setIndex = item.sets.findIndex((s) => s.id === setId);
      if (setIndex >= 0) item.sets.splice(setIndex, 1);
      return parseWorkoutDocumentV1(current);
    });
  };

  return (
    <div
      ref={containerRef}
      className={styles.builder}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-testid="workout-plan-builder"
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 className={styles.title}>{m['builder.plan']}</h2>
        </div>
        <div className={styles.planActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleAddSessionDay}
            disabled={readOnly}
          >
            {m['builder.addSession']}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={handleAddRestDay}
            disabled={readOnly}
          >
            {m['builder.addRestDay']}
          </button>
        </div>
      </header>

      <div className={styles.planNotesBlock}>
        <span className={styles.itemDescription}>{m['builder.planNotes']}</span>
        {doc.notes && <p style={{ margin: 0 }}>{doc.notes}</p>}
        <textarea
          id="plan-notes-textarea"
          className={styles.textarea}
          data-field="plan-notes"
          aria-label={m['builder.planNotes']}
          placeholder={m['builder.planNotes']}
          value={doc.notes ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            commit(() => updatePlanNotes(doc, val));
          }}
          disabled={readOnly}
        />
      </div>

      <div className={styles.daysList}>
        <h3 className={styles.title} style={{ fontSize: 'var(--text-lg)' }}>
          {m['builder.days']}
        </h3>
        {(doc.days as BuilderDay[]).map((day, dayIndex) => {
          const isRest = day.kind === 'rest';
          const dayTitle =
            day.title ||
            (isRest
              ? m['builder.restDayTitle']
              : m['builder.dayPosition'].replace(
                  '{number}',
                  String(dayIndex + 1),
                ));

          return (
            <section
              key={day.id}
              className={styles.dayCard}
              data-day-id={day.id}
              data-day-kind={day.kind}
            >
              <div className={styles.dayHeader}>
                <div className={styles.dayTitleGroup}>
                  <strong>{dayTitle}</strong>
                  {day.notes && (
                    <span className={styles.dayNotes}>({day.notes})</span>
                  )}
                  <input
                    type="text"
                    className={styles.input}
                    data-field="day-title"
                    aria-label={m['builder.dayTitle']}
                    placeholder={
                      isRest ? m['builder.restDayTitle'] : m['builder.dayTitle']
                    }
                    value={day.title ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      commit(() =>
                        updateWorkoutDay(doc, day.id, { title: val }),
                      );
                    }}
                    disabled={readOnly}
                  />

                  <input
                    type="text"
                    className={styles.input}
                    data-field="day-notes"
                    aria-label={m['builder.dayNotes']}
                    placeholder={m['builder.dayNotes']}
                    value={day.notes ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      commit(() =>
                        updateWorkoutDay(doc, day.id, { notes: val }),
                      );
                    }}
                    disabled={readOnly}
                  />

                  <select
                    className={styles.select}
                    data-field="day-kind"
                    aria-label={m['builder.dayTitle']}
                    value={day.kind}
                    onChange={(e) => {
                      const nextKind = e.target.value as 'session' | 'rest';
                      commit(() =>
                        updateWorkoutDay(doc, day.id, { kind: nextKind }),
                      );
                    }}
                    disabled={readOnly}
                  >
                    <option value="session">{m['builder.dayTitle']}</option>
                    <option value="rest">{m['builder.restDayTitle']}</option>
                  </select>
                </div>

                <div className={styles.dayActions}>
                  <button
                    type="button"
                    className={styles.btn}
                    data-action="move-day-up"
                    aria-label={m['builder.moveDayUp']}
                    onClick={() => handleMoveDay(day.id, 'up')}
                    disabled={readOnly || dayIndex === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    data-action="move-day-down"
                    aria-label={m['builder.moveDayDown']}
                    onClick={() => handleMoveDay(day.id, 'down')}
                    disabled={readOnly || dayIndex === doc.days.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    data-action="duplicate-day"
                    aria-label={m['builder.duplicateDayNamed'].replace(
                      '{name}',
                      dayTitle,
                    )}
                    onClick={() => handleDuplicateDay(day.id)}
                    disabled={readOnly}
                  >
                    {m['builder.duplicateDay']}
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    data-action="remove-day"
                    aria-label={m['builder.removeDayNamed'].replace(
                      '{name}',
                      dayTitle,
                    )}
                    onClick={() => handleRemoveDay(day.id)}
                    disabled={readOnly}
                  >
                    {m['builder.removeDay']}
                  </button>
                </div>
              </div>

              {isRest ? (
                <div className={styles.restEmpty}>{m['builder.emptyRest']}</div>
              ) : (
                <div className={styles.itemsList}>
                  {day.items.length === 0 ? (
                    <div className={styles.restEmpty}>
                      {m['builder.emptySession']}
                    </div>
                  ) : (
                    day.items.map((item, itemIndex) => {
                      const itemName = item.name || '';
                      return (
                        <article
                          key={item.id}
                          className={styles.itemCard}
                          data-item-id={item.id}
                        >
                          <div className={styles.itemHeader}>
                            <div>
                              <h4 className={styles.itemName}>
                                <Bidi>{itemName}</Bidi>
                              </h4>
                              {item.description && (
                                <p className={styles.itemDescription}>
                                  {item.description}
                                </p>
                              )}
                            </div>

                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                className={styles.btn}
                                data-action="move-item-up"
                                aria-label={m['builder.moveUpNamed'].replace(
                                  '{name}',
                                  itemName,
                                )}
                                onClick={() => handleMoveItem(item.id, 'up')}
                                disabled={readOnly || itemIndex === 0}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={styles.btn}
                                data-action="move-item-down"
                                aria-label={m['builder.moveDownNamed'].replace(
                                  '{name}',
                                  itemName,
                                )}
                                onClick={() => handleMoveItem(item.id, 'down')}
                                disabled={
                                  readOnly || itemIndex === day.items.length - 1
                                }
                              >
                                ↓
                              </button>

                              {/* Cross-day move keyboard controls */}
                              {doc.days
                                .filter(
                                  (targetDay) =>
                                    targetDay.id !== day.id &&
                                    targetDay.kind === 'session',
                                )
                                .map((targetDay, tIdx) => (
                                  <button
                                    key={targetDay.id}
                                    type="button"
                                    className={styles.btn}
                                    data-action="move-to-day"
                                    data-target-day-id={targetDay.id}
                                    aria-label={m[
                                      'builder.moveToDayNamed'
                                    ].replace('{name}', itemName)}
                                    onClick={() =>
                                      handleMoveItemToTargetDay(
                                        item.id,
                                        targetDay.id,
                                      )
                                    }
                                    disabled={readOnly}
                                  >
                                    {m['builder.moveToDay']} {tIdx + 1}
                                  </button>
                                ))}

                              <button
                                type="button"
                                className={styles.btn}
                                data-action="duplicate-item"
                                aria-label={m[
                                  'builder.duplicateExerciseNamed'
                                ].replace('{name}', itemName)}
                                onClick={() => handleDuplicateItem(item.id)}
                                disabled={readOnly}
                              >
                                {m['builder.duplicateExercise']}
                              </button>
                              <button
                                type="button"
                                className={styles.btn}
                                data-action="remove-item"
                                aria-label={m[
                                  'builder.removeExerciseNamed'
                                ].replace('{name}', itemName)}
                                onClick={() => handleRemoveItem(item.id)}
                                disabled={readOnly}
                              >
                                {m['builder.removeExercise']}
                              </button>
                            </div>
                          </div>

                          <div className={styles.itemMeta}>
                            <div className={styles.inlineGroup}>
                              <label className={styles.label}>
                                {m['builder.repsMode']}
                              </label>
                              <select
                                className={styles.select}
                                data-field="reps-mode"
                                aria-label={m['builder.repsMode']}
                                value={
                                  item.reps && 'min' in item.reps
                                    ? 'range'
                                    : 'fixed'
                                }
                                onChange={(e) => {
                                  const mode = e.target.value;
                                  if (mode === 'fixed') {
                                    const val =
                                      item.reps && 'min' in item.reps
                                        ? item.reps.min
                                        : 8;
                                    commit(() =>
                                      updateWorkoutItem(doc, item.id, {
                                        reps: { value: val },
                                      }),
                                    );
                                  } else {
                                    const min =
                                      item.reps && 'value' in item.reps
                                        ? item.reps.value
                                        : 8;
                                    commit(() =>
                                      updateWorkoutItem(doc, item.id, {
                                        reps: { min, max: min + 2 },
                                      }),
                                    );
                                  }
                                }}
                                disabled={readOnly}
                              >
                                <option value="fixed">
                                  {m['builder.fixedReps']}
                                </option>
                                <option value="range">
                                  {m['builder.repRange']}
                                </option>
                              </select>

                              {item.reps && 'min' in item.reps ? (
                                <>
                                  <label className={styles.label}>
                                    {m['builder.min']}
                                  </label>
                                  <input
                                    type="number"
                                    className={`${styles.input} ${styles.tableInput}`}
                                    data-field="reps-min"
                                    aria-label={m['builder.min']}
                                    value={item.reps.min}
                                    min="1"
                                    max="100"
                                    onChange={(e) => {
                                      const min = parseInt(e.target.value, 10);
                                      const max =
                                        item.reps && 'max' in item.reps
                                          ? item.reps.max
                                          : 10;
                                      commit(() =>
                                        updateWorkoutItem(doc, item.id, {
                                          reps: { min, max },
                                        }),
                                      );
                                    }}
                                    disabled={readOnly}
                                  />
                                  <label className={styles.label}>
                                    {m['builder.max']}
                                  </label>
                                  <input
                                    type="number"
                                    className={`${styles.input} ${styles.tableInput}`}
                                    data-field="reps-max"
                                    aria-label={m['builder.max']}
                                    value={item.reps.max}
                                    min="1"
                                    max="100"
                                    onChange={(e) => {
                                      const max = parseInt(e.target.value, 10);
                                      const min =
                                        item.reps && 'min' in item.reps
                                          ? item.reps.min
                                          : 1;
                                      commit(() =>
                                        updateWorkoutItem(doc, item.id, {
                                          reps: { min, max },
                                        }),
                                      );
                                    }}
                                    disabled={readOnly}
                                  />
                                </>
                              ) : (
                                <>
                                  <label className={styles.label}>
                                    {m['builder.reps']}
                                  </label>
                                  <input
                                    type="number"
                                    className={`${styles.input} ${styles.tableInput}`}
                                    data-field="reps-value"
                                    aria-label={m['builder.reps']}
                                    value={
                                      item.reps && 'value' in item.reps
                                        ? item.reps.value
                                        : ''
                                    }
                                    min="1"
                                    max="100"
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      commit(() =>
                                        updateWorkoutItem(doc, item.id, {
                                          reps: { value: val },
                                        }),
                                      );
                                    }}
                                    disabled={readOnly}
                                  />
                                </>
                              )}
                            </div>

                            <div className={styles.inlineGroup}>
                              <label className={styles.label}>
                                {m['builder.restHint']}
                              </label>
                              <input
                                type="number"
                                className={`${styles.input} ${styles.tableInput}`}
                                data-field="item-rest"
                                aria-label={m['builder.restHint']}
                                placeholder={m['builder.restHint']}
                                min="0"
                                max="600"
                                step="15"
                                value={item.restSec ?? ''}
                                onChange={(e) => {
                                  const val =
                                    e.target.value === ''
                                      ? undefined
                                      : parseInt(e.target.value, 10);
                                  commit(() =>
                                    updateWorkoutItem(doc, item.id, {
                                      restSec: val,
                                    }),
                                  );
                                }}
                                disabled={readOnly}
                              />
                            </div>

                            <div className={styles.inlineGroup}>
                              <label className={styles.label}>
                                {m['builder.rirHint']}
                              </label>
                              <input
                                type="number"
                                className={`${styles.input} ${styles.tableInput}`}
                                data-field="item-rir"
                                aria-label={m['builder.rirHint']}
                                placeholder={m['builder.rirHint']}
                                min="0"
                                max="5"
                                step="1"
                                value={item.rir ?? ''}
                                onChange={(e) => {
                                  const val =
                                    e.target.value === ''
                                      ? undefined
                                      : parseInt(e.target.value, 10);
                                  commit(() =>
                                    updateWorkoutItem(doc, item.id, {
                                      rir: val,
                                    }),
                                  );
                                }}
                                disabled={readOnly}
                              />
                            </div>
                          </div>

                          {item.notes && (
                            <p className={styles.itemDescription}>
                              <em>{item.notes}</em>
                            </p>
                          )}

                          <div className={styles.field}>
                            <label className={styles.label}>
                              {m['builder.exerciseNotes']}
                            </label>
                            <input
                              type="text"
                              className={styles.input}
                              data-field="item-notes"
                              aria-label={m['builder.exerciseNotes']}
                              placeholder={m['builder.exerciseNotes']}
                              value={item.notes ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                commit(() =>
                                  updateWorkoutItem(doc, item.id, {
                                    notes: val,
                                  }),
                                );
                              }}
                              disabled={readOnly}
                            />
                          </div>

                          {item.alternatives &&
                            item.alternatives.length > 0 && (
                              <div className={styles.alternativesList}>
                                <span className={styles.alternativesBadge}>
                                  {m['builder.alternatives']}:{' '}
                                  <Bidi>{item.alternatives.length}</Bidi>
                                </span>
                                {item.alternatives.map((_, altIdx) => (
                                  <div
                                    key={altIdx}
                                    className={styles.alternativeItem}
                                  >
                                    <span>
                                      {m['builder.alternativeExercise']}{' '}
                                      <Bidi>{altIdx + 1}</Bidi>
                                    </span>
                                    <button
                                      type="button"
                                      className={styles.btn}
                                      data-action="remove-alternative"
                                      aria-label={`${m['builder.removeAlternative']} ${altIdx + 1}`}
                                      onClick={() => {
                                        commit(() =>
                                          removeWorkoutAlternative(
                                            doc,
                                            item.id,
                                            altIdx,
                                          ),
                                        );
                                      }}
                                      disabled={readOnly}
                                    >
                                      {m['builder.removeAlternative']}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                          <div className={styles.setsContainer}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {m['builder.sets']}
                              </span>
                              <button
                                type="button"
                                className={styles.btn}
                                data-action="add-set"
                                onClick={() => handleAddSet(item.id)}
                                disabled={readOnly}
                              >
                                {m['builder.addSet']}
                              </button>
                            </div>

                            {item.sets.length > 0 && (
                              <table className={styles.setsTable}>
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>{m['builder.setType']}</th>
                                    <th>{m['builder.loadMode']}</th>
                                    <th>{m['builder.load']}</th>
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.sets.map((set, sIdx) => {
                                    const loadMode = (
                                      set.load as { mode: string }
                                    )?.mode;

                                    return (
                                      <tr key={set.id} data-set-id={set.id}>
                                        <td>
                                          <Bidi>{sIdx + 1}</Bidi>
                                        </td>
                                        <td>
                                          <select
                                            className={`${styles.select} ${styles.tableSelect}`}
                                            data-field="set-type"
                                            aria-label={m['builder.setType']}
                                            value={set.type}
                                            onChange={(e) => {
                                              const nextType = e.target
                                                .value as 'warmup' | 'working';
                                              commit(() =>
                                                updateWorkoutSet(doc, set.id, {
                                                  type: nextType,
                                                }),
                                              );
                                            }}
                                            disabled={readOnly}
                                          >
                                            <option value="warmup">
                                              {m['builder.warmup']}
                                            </option>
                                            <option value="working">
                                              {m['builder.working']}
                                            </option>
                                          </select>
                                        </td>
                                        <td>
                                          <select
                                            className={`${styles.select} ${styles.tableSelect}`}
                                            data-field="load-mode"
                                            aria-label={m['builder.loadMode']}
                                            value={loadMode}
                                            onChange={(e) => {
                                              const mode = e.target.value;
                                              if (mode === 'bodyweight') {
                                                commit(() =>
                                                  updateWorkoutSet(
                                                    doc,
                                                    set.id,
                                                    {
                                                      load: {
                                                        mode: 'bodyweight',
                                                      },
                                                    },
                                                  ),
                                                );
                                              } else {
                                                const nextMode = mode as
                                                  'added_weight' | 'assisted';
                                                const currentVal =
                                                  loadMode === 'added_weight' ||
                                                  loadMode === 'assisted'
                                                    ? (
                                                        set.load as {
                                                          value: string;
                                                        }
                                                      ).value
                                                    : '10.0';
                                                const currentUnit =
                                                  loadMode === 'added_weight' ||
                                                  loadMode === 'assisted'
                                                    ? (
                                                        set.load as {
                                                          unit: 'kg' | 'lb';
                                                        }
                                                      ).unit
                                                    : 'kg';
                                                commit(() =>
                                                  updateWorkoutSet(
                                                    doc,
                                                    set.id,
                                                    {
                                                      load: {
                                                        mode: nextMode,
                                                        value: currentVal,
                                                        unit: currentUnit,
                                                      },
                                                    },
                                                  ),
                                                );
                                              }
                                            }}
                                            disabled={readOnly}
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
                                        </td>
                                        <td>
                                          {loadMode === 'bodyweight' ? (
                                            <span
                                              className={styles.itemDescription}
                                            >
                                              {m['builder.bodyweight']}
                                            </span>
                                          ) : (
                                            <div className={styles.inlineGroup}>
                                              <input
                                                type="text"
                                                className={`${styles.input} ${styles.tableInput}`}
                                                data-field="load-value"
                                                aria-label={
                                                  m['builder.loadValue']
                                                }
                                                placeholder={
                                                  m['builder.loadValue']
                                                }
                                                value={
                                                  (
                                                    set.load as {
                                                      value: string;
                                                    }
                                                  ).value
                                                }
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  const unit = (
                                                    set.load as {
                                                      unit: 'kg' | 'lb';
                                                    }
                                                  ).unit;
                                                  commit(() =>
                                                    updateWorkoutSet(
                                                      doc,
                                                      set.id,
                                                      {
                                                        load: {
                                                          mode: loadMode as
                                                            | 'added_weight'
                                                            | 'assisted',
                                                          value: val,
                                                          unit,
                                                        },
                                                      },
                                                    ),
                                                  );
                                                }}
                                                disabled={readOnly}
                                              />
                                              <select
                                                className={`${styles.select} ${styles.tableSelect}`}
                                                data-field="load-unit"
                                                aria-label={m['builder.unit']}
                                                value={
                                                  (
                                                    set.load as {
                                                      unit: 'kg' | 'lb';
                                                    }
                                                  ).unit
                                                }
                                                onChange={(e) => {
                                                  const unit = e.target
                                                    .value as 'kg' | 'lb';
                                                  const val = (
                                                    set.load as {
                                                      value: string;
                                                    }
                                                  ).value;
                                                  commit(() =>
                                                    updateWorkoutSet(
                                                      doc,
                                                      set.id,
                                                      {
                                                        load: {
                                                          mode: loadMode as
                                                            | 'added_weight'
                                                            | 'assisted',
                                                          value: val,
                                                          unit,
                                                        },
                                                      },
                                                    ),
                                                  );
                                                }}
                                                disabled={readOnly}
                                              >
                                                <option value="kg">
                                                  {m['builder.kg']}
                                                </option>
                                                <option value="lb">
                                                  {m['builder.lb']}
                                                </option>
                                              </select>
                                            </div>
                                          )}
                                        </td>
                                        <td>
                                          <button
                                            type="button"
                                            className={styles.btn}
                                            data-action="remove-set"
                                            onClick={() =>
                                              handleRemoveSet(item.id, set.id)
                                            }
                                            disabled={readOnly}
                                          >
                                            {m['builder.removeSet']}
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
