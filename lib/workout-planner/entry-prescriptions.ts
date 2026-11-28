// F17 zero-set prescription persistence (T053; FR-004, FR-005, SC-001).
//
// Entry-level Rest/RIR/Reps/Notes/Alternatives live on the plan exercise
// entry independently of set rows. Copy happens once at add; save/reload
// preserves the entry values; later library edits never alter them; adding
// a set performs no library reread (addSet takes no library input at all).

export type Reps = { value: number } | { min: number; max: number };

export type LibraryDefaults = {
  restSec?: number;
  rir?: number;
  reps?: Reps;
};

export type EntryPrescriptions = {
  restSec?: number;
  rir?: number;
  reps?: Reps;
  notes?: string;
  alternatives?: string[];
};

export type PlanSet = {
  id: string;
  type: 'warmup' | 'working';
  load: unknown;
};

/**
 * The prescription bounds (S60-D3). One definition, used by both the merged
 * document validator and the entry fields UI, so the two can never drift:
 * fixed reps are a whole number in 1..100, a range is whole min/max in
 * 1..100 with min <= max, rest is whole seconds in 0..600 on the 15-second
 * grid, RIR is a whole number in 0..5.
 */
export function isValidReps(reps: unknown): reps is Reps {
  if (!reps || typeof reps !== 'object' || Array.isArray(reps)) return false;
  const value = reps as Record<string, unknown>;
  if (
    Object.keys(value).length === 1 &&
    Number.isInteger(value.value) &&
    (value.value as number) >= 1 &&
    (value.value as number) <= 100
  )
    return true;
  return (
    Object.keys(value).length === 2 &&
    Number.isInteger(value.min) &&
    Number.isInteger(value.max) &&
    (value.min as number) >= 1 &&
    (value.max as number) <= 100 &&
    (value.min as number) <= (value.max as number)
  );
}

/** Rest is whole seconds in 0..600 on the approved 15-second grid. */
export function isValidRestSec(restSec: unknown): restSec is number {
  return (
    typeof restSec === 'number' &&
    Number.isInteger(restSec) &&
    restSec >= 0 &&
    restSec <= 600 &&
    restSec % 15 === 0
  );
}

/** RIR is a whole number in 0..5. */
export function isValidRir(rir: unknown): rir is number {
  return (
    typeof rir === 'number' && Number.isInteger(rir) && rir >= 0 && rir <= 5
  );
}

export type PlanEntry = EntryPrescriptions & {
  sets: PlanSet[];
};

/** Copy the current library defaults that exist; absent stays absent. */
export function copyDefaultsToEntry(
  defaults: LibraryDefaults,
): EntryPrescriptions {
  const entry: EntryPrescriptions = {};
  if (defaults.restSec !== undefined) entry.restSec = defaults.restSec;
  if (defaults.rir !== undefined) entry.rir = defaults.rir;
  if (defaults.reps !== undefined)
    entry.reps = JSON.parse(JSON.stringify(defaults.reps)) as Reps;
  return entry;
}

export function serializeEntry(entry: PlanEntry): string {
  return JSON.stringify(entry);
}

/**
 * Reload a saved entry. The reload takes no library input by design, which is
 * what proves the entry ignores changed library defaults: there is nothing
 * to reread. Unknown fields are dropped to keep the entry shape exact.
 */
export function deserializeEntry(saved: string): PlanEntry {
  const raw = JSON.parse(saved) as Record<string, unknown>;
  const entry: PlanEntry = {
    sets: Array.isArray(raw.sets) ? (raw.sets as PlanSet[]) : [],
  };
  if (typeof raw.restSec === 'number') entry.restSec = raw.restSec;
  if (typeof raw.rir === 'number') entry.rir = raw.rir;
  if (raw.reps !== undefined && raw.reps !== null)
    entry.reps = raw.reps as Reps;
  if (typeof raw.notes === 'string') entry.notes = raw.notes;
  if (Array.isArray(raw.alternatives))
    entry.alternatives = raw.alternatives as string[];
  return entry;
}

/** Append a set row; entry prescriptions pass through untouched. */
export function addSet(entry: PlanEntry, set: PlanSet): PlanEntry {
  return { ...entry, sets: [...entry.sets, set] };
}
