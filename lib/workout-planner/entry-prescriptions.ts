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
 * Reload a saved entry. The second argument is accepted only so tests can
 * prove the reloaded entry ignores changed library defaults; it is never
 * read. Unknown fields are dropped to keep the entry shape exact.
 */
export function deserializeEntry(
  saved: string,
  _currentDefaults: LibraryDefaults,
): PlanEntry {
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
