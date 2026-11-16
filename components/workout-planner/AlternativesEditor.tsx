'use client';

import { useId, useState } from 'react';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages, type Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import {
  MAX_WORKOUT_ALTERNATIVES,
  addWorkoutAlternative,
  alternativeKey,
  isAlternativeUnavailable,
  removeWorkoutAlternative,
  type AlternativeAvailability,
  type WorkoutExerciseReference,
} from '../../lib/workout-planner/alternatives';
import styles from './AlternativesEditor.module.css';

export type AlternativeCandidate = {
  ref: WorkoutExerciseReference;
  name: string;
};

export type AlternativesEditorProps = {
  locale: Locale;
  /** Current plan-entry alternatives; unavailable rows are kept, never swapped. */
  alternatives: WorkoutExerciseReference[];
  /** Catalog lifecycle per alternative, keyed by `alternativeKey`. */
  availability: Record<string, AlternativeAvailability>;
  /** Display names per alternative, keyed by `alternativeKey`. */
  names: Record<string, string>;
  /** Selectable catalog targets; only active, not-yet-added entries are offered. */
  candidates: AlternativeCandidate[];
  onChange: (next: WorkoutExerciseReference[]) => void;
};

function displayName(
  ref: WorkoutExerciseReference,
  names: Record<string, string>,
): string {
  return names[alternativeKey(ref)] ?? ref.identity_id;
}

/**
 * Edits one plan entry's manual alternatives (FR-002, FR-003; SC-011):
 * select up to three active catalog targets; removed/merged targets keep
 * their row with the `builder.alternativeUnavailable` badge and are never
 * replaced by another exercise.
 */
export function AlternativesEditor({
  locale,
  alternatives,
  availability,
  names,
  candidates,
  onChange,
}: AlternativesEditorProps) {
  const m: Messages = getMessages(locale);
  const dir = dirFor(locale);
  const headingId = useId();
  const selectId = useId();
  const atCap = alternatives.length >= MAX_WORKOUT_ALTERNATIVES;

  const taken = new Set(alternatives.map((entry) => alternativeKey(entry)));
  const eligible = candidates.filter(
    (candidate) =>
      (availability[alternativeKey(candidate.ref)] ?? 'active') === 'active' &&
      !taken.has(alternativeKey(candidate.ref)),
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    eligible.find(
      (candidate) => alternativeKey(candidate.ref) === selectedKey,
    ) ?? eligible[0];

  const handleAdd = () => {
    if (!selected || atCap) return;
    onChange(addWorkoutAlternative(alternatives, selected.ref));
  };

  return (
    <section
      dir={dir}
      lang={locale}
      aria-labelledby={headingId}
      className={styles.editor}
      data-testid="workout-alternatives-editor"
    >
      <h3 id={headingId} className={styles.heading}>
        {m['builder.alternatives']}
      </h3>
      {alternatives.length === 0 ? (
        <p className={styles.empty}>{m['builder.noAlternatives']}</p>
      ) : (
        <ul className={styles.list} data-testid="workout-alternatives-list">
          {alternatives.map((entry, index) => {
            const key = alternativeKey(entry);
            const status = availability[key] ?? 'active';
            const name = displayName(entry, names);
            return (
              <li key={key} className={styles.row}>
                <span className={styles.name}>
                  <Bidi>{name}</Bidi>
                  {isAlternativeUnavailable(status) && (
                    <span
                      className={styles.badge}
                      data-availability={status}
                      data-testid={`alternative-unavailable-${index}`}
                    >
                      {m['builder.alternativeUnavailable']}
                    </span>
                  )}
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    onChange(removeWorkoutAlternative(alternatives, index))
                  }
                  aria-label={`${m['builder.removeAlternative']}: ${name}`}
                  data-testid={`alternative-remove-${index}`}
                >
                  {m['builder.removeAlternative']}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.addBlock}>
        {eligible.length > 0 ? (
          <>
            <label htmlFor={selectId} className={styles.addLabel}>
              {m['builder.alternativeExercise']}
            </label>
            <div className={styles.addRow}>
              <select
                id={selectId}
                className={styles.select}
                value={selected ? alternativeKey(selected.ref) : ''}
                disabled={atCap}
                onChange={(event) => setSelectedKey(event.target.value)}
                data-testid="alternative-select"
              >
                {eligible.map((candidate) => (
                  <option
                    key={alternativeKey(candidate.ref)}
                    value={alternativeKey(candidate.ref)}
                  >
                    {candidate.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleAdd}
                disabled={atCap || !selected}
                data-testid="alternative-add"
              >
                {m['builder.addAlternative']}
              </Button>
            </div>
          </>
        ) : (
          <Button disabled data-testid="alternative-add">
            {m['builder.addAlternative']}
          </Button>
        )}
      </div>
    </section>
  );
}
