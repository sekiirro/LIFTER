'use client';

// F17 default copy/override UI (T033; FR-004, FR-005; SC-001).
//
// The values shown here were copied into the plan entry at add time by the
// merged resolver. They are ordinary editable fields of the plan item: this UI
// reads no catalog default, offers no platform-defaults control, and reopens a
// loaded draft exactly as saved.

import { useId, useState } from 'react';
import { dirFor, type Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import type {
  EntryPrescriptions,
  Reps,
} from '../../lib/workout-planner/entry-prescriptions';
import { Field } from '../ui/Field';
import styles from './EntryPrescriptionFields.module.css';

type RepsMode = 'fixed' | 'range';

type Draft = {
  mode: RepsMode;
  repsValue: string;
  repsMin: string;
  repsMax: string;
  restSec: string;
  rir: string;
};

export type EntryPrescriptionFieldsProps = {
  locale: Locale;
  /**
   * Entry values already copied into the plan item at add time. Remount with a
   * `key` when a different entry is shown; loading never re-reads a default.
   */
  value: EntryPrescriptions;
  /** Ordinary edits to the plan item; no default is ever re-applied. */
  onChange: (next: EntryPrescriptions) => void;
  disabled?: boolean;
};

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

function toLatinDigits(raw: string): string {
  return raw.replace(ARABIC_INDIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function parseWhole(raw: string): number | undefined {
  const value = toLatinDigits(raw).trim();
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Rest is whole seconds in 0..600 on the approved 15-second grid. */
function parseRest(raw: string): number | undefined {
  const rest = parseWhole(raw);
  return rest !== undefined && rest <= 600 && rest % 15 === 0
    ? rest
    : undefined;
}

/** RIR is a whole number in 0..5. */
function parseRir(raw: string): number | undefined {
  const rir = parseWhole(raw);
  return rir !== undefined && rir <= 5 ? rir : undefined;
}

function show(value: number | undefined, locale: Locale): string {
  return value === undefined ? '' : formatUiNumber(value, locale);
}

function modeOf(reps: Reps | undefined): RepsMode {
  return reps && 'min' in reps ? 'range' : 'fixed';
}

function pick(reps: Reps | undefined, part: 'value' | 'min' | 'max') {
  if (!reps || !(part in reps)) return undefined;
  return (reps as Record<string, number>)[part];
}

function initialDraft(value: EntryPrescriptions, locale: Locale): Draft {
  return {
    mode: modeOf(value.reps),
    repsValue: show(pick(value.reps, 'value'), locale),
    repsMin: show(pick(value.reps, 'min'), locale),
    repsMax: show(pick(value.reps, 'max'), locale),
    restSec: show(value.restSec, locale),
    rir: show(value.rir, locale),
  };
}

/** `undefined` means the typed reps are not a document-valid prescription. */
function draftReps(draft: Draft): Reps | null | undefined {
  if (draft.mode === 'fixed') {
    const raw = draft.repsValue.trim();
    if (raw === '') return null;
    const count = parseWhole(raw);
    if (count === undefined || count < 1 || count > 100) return undefined;
    return { value: count };
  }
  const minRaw = draft.repsMin.trim();
  const maxRaw = draft.repsMax.trim();
  if (minRaw === '' && maxRaw === '') return null;
  const min = parseWhole(minRaw);
  const max = parseWhole(maxRaw);
  if (
    min === undefined ||
    max === undefined ||
    min < 1 ||
    max > 100 ||
    min > max
  )
    return undefined;
  return { min, max };
}

/**
 * Build the entry the merged document validator accepts, or `undefined` while a
 * field holds a value that is not valid yet (the typed text stays visible).
 */
function draftPrescriptions(
  value: EntryPrescriptions,
  draft: Draft,
): EntryPrescriptions | undefined {
  const next: EntryPrescriptions = {};
  if (typeof value.notes === 'string') next.notes = value.notes;
  if (Array.isArray(value.alternatives))
    next.alternatives = [...value.alternatives];
  const restRaw = draft.restSec.trim();
  if (restRaw !== '') {
    const restSec = parseRest(restRaw);
    if (restSec === undefined) return undefined;
    next.restSec = restSec;
  }
  const rirRaw = draft.rir.trim();
  if (rirRaw !== '') {
    const rir = parseRir(rirRaw);
    if (rir === undefined) return undefined;
    next.rir = rir;
  }
  const reps = draftReps(draft);
  if (reps === undefined) return undefined;
  if (reps !== null) next.reps = reps;
  return next;
}

/**
 * Renders Rest, RIR and Reps of one plan entry as ordinary editable fields.
 * The displayed values come only from `value` (the plan document).
 */
export function EntryPrescriptionFields({
  locale,
  value,
  onChange,
  disabled = false,
}: EntryPrescriptionFieldsProps) {
  const m = getMessages(locale);
  const dir = dirFor(locale);
  const base = useId();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(value, locale));

  const reps = draftReps(draft);
  const rangeFilled =
    draft.repsMin.trim() !== '' && draft.repsMax.trim() !== '';
  const repsError =
    reps === undefined && draft.mode === 'range' && rangeFilled
      ? m['builder.invalidReps']
      : undefined;
  const restRaw = draft.restSec.trim();
  const restInvalid = restRaw !== '' && parseRest(restRaw) === undefined;
  const rirRaw = draft.rir.trim();
  const rirInvalid = rirRaw !== '' && parseRir(rirRaw) === undefined;

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    const prescriptions = draftPrescriptions(value, next);
    if (prescriptions) onChange(prescriptions);
  }

  return (
    <div
      dir={dir}
      lang={locale}
      className={styles.fields}
      data-testid="entry-prescription-fields"
    >
      <div className={styles.group}>
        <fieldset className={styles.mode}>
          <legend className={styles.legend}>{m['builder.repsMode']}</legend>
          <div className={styles.modeRow}>
            {(['fixed', 'range'] as const).map((option) => (
              <div key={option} className={styles.modeOption}>
                <input
                  id={`${base}-reps-mode-${option}`}
                  type="radio"
                  name={`${base}-reps-mode`}
                  value={option}
                  checked={draft.mode === option}
                  disabled={disabled}
                  onChange={() => update({ mode: option })}
                />
                <label htmlFor={`${base}-reps-mode-${option}`}>
                  {option === 'fixed'
                    ? m['builder.fixedReps']
                    : m['builder.repRange']}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        {draft.mode === 'fixed' ? (
          <Field
            label={m['builder.reps']}
            inputProps={{
              id: `${base}-reps-value`,
              inputMode: 'numeric',
              autoComplete: 'off',
              value: draft.repsValue,
              disabled,
              'aria-invalid': reps === undefined ? true : undefined,
              onChange: (event) =>
                update({ repsValue: event.currentTarget.value }),
            }}
          />
        ) : (
          <div className={styles.grid}>
            <Field
              label={m['builder.min']}
              inputProps={{
                id: `${base}-reps-min`,
                inputMode: 'numeric',
                autoComplete: 'off',
                value: draft.repsMin,
                disabled,
                'aria-invalid': reps === undefined ? true : undefined,
                onChange: (event) =>
                  update({ repsMin: event.currentTarget.value }),
              }}
            />
            <Field
              label={m['builder.max']}
              error={repsError}
              inputProps={{
                id: `${base}-reps-max`,
                inputMode: 'numeric',
                autoComplete: 'off',
                value: draft.repsMax,
                disabled,
                onChange: (event) =>
                  update({ repsMax: event.currentTarget.value }),
              }}
            />
          </div>
        )}
      </div>

      <div className={styles.grid}>
        <Field
          label={m['builder.restHint']}
          inputProps={{
            id: `${base}-rest`,
            inputMode: 'numeric',
            autoComplete: 'off',
            value: draft.restSec,
            disabled,
            'aria-invalid': restInvalid ? true : undefined,
            onChange: (event) => update({ restSec: event.currentTarget.value }),
          }}
        />
        <Field
          label={m['builder.rirHint']}
          inputProps={{
            id: `${base}-rir`,
            inputMode: 'numeric',
            autoComplete: 'off',
            value: draft.rir,
            disabled,
            'aria-invalid': rirInvalid ? true : undefined,
            onChange: (event) => update({ rir: event.currentTarget.value }),
          }}
        />
      </div>
    </div>
  );
}
