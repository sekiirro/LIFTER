import { describe, expect, it } from 'vitest';
import {
  addSet,
  copyDefaultsToEntry,
  deserializeEntry,
  serializeEntry,
  type LibraryDefaults,
} from '../../lib/workout-planner/entry-prescriptions';

// T053-note: FR-004/FR-005 zero-set prescription persistence (SC-001). RED
// first. Mutation target: dropping entry-level fields must break round-trip.

const DEFAULTS_V1: LibraryDefaults = {
  restSec: 90,
  rir: 1,
  reps: { min: 8, max: 12 },
};

const DEFAULTS_V2_CHANGED: LibraryDefaults = {
  restSec: 120,
  rir: 3,
  reps: { value: 10 },
};

describe('F17 zero-set prescription persistence (FR-004, FR-005, SC-001)', () => {
  it('saves and reloads an entry with zero sets, immune to later default changes', () => {
    const entry = {
      ...copyDefaultsToEntry(DEFAULTS_V1),
      notes: 'coach note',
      alternatives: ['ex-alt-1', 'ex-alt-2'],
      sets: [],
    };
    const saved = serializeEntry(entry);
    // Library defaults change after save; reload must not reread them.
    const reloaded = deserializeEntry(saved, DEFAULTS_V2_CHANGED);
    expect(reloaded.sets).toEqual([]);
    expect(reloaded.restSec).toBe(90);
    expect(reloaded.rir).toBe(1);
    expect(reloaded.reps).toEqual({ min: 8, max: 12 });
    expect(reloaded.notes).toBe('coach note');
    expect(reloaded.alternatives).toEqual(['ex-alt-1', 'ex-alt-2']);
  });

  it('retains trainer-edited entry values across save/reload', () => {
    const edited = {
      ...copyDefaultsToEntry(DEFAULTS_V1),
      restSec: 150,
      rir: 0,
      reps: { value: 5 } as const,
      notes: 'edited note',
      alternatives: ['ex-alt-9'],
      sets: [],
    };
    const reloaded = deserializeEntry(serializeEntry(edited), DEFAULTS_V2_CHANGED);
    expect(reloaded.restSec).toBe(150);
    expect(reloaded.rir).toBe(0);
    expect(reloaded.reps).toEqual({ value: 5 });
    expect(reloaded.notes).toBe('edited note');
    expect(reloaded.alternatives).toEqual(['ex-alt-9']);
  });

  it('adding a set uses entry values and performs no library reread', () => {
    const entry = {
      ...copyDefaultsToEntry(DEFAULTS_V1),
      notes: 'keep me',
      alternatives: [] as string[],
      sets: [] as { id: string; type: 'warmup' | 'working'; load: unknown }[],
    };
    const withSet = addSet(entry, {
      id: 'set-1',
      type: 'working',
      load: { mode: 'added_weight', value: '60', unit: 'kg' },
    });
    expect(withSet.sets).toHaveLength(1);
    // Entry prescriptions are byte-identical; addSet takes no library input.
    expect(withSet.restSec).toBe(90);
    expect(withSet.rir).toBe(1);
    expect(withSet.reps).toEqual({ min: 8, max: 12 });
    expect(withSet.notes).toBe('keep me');
    // Serialized reload after the set still ignores changed defaults.
    const reloaded = deserializeEntry(serializeEntry(withSet), DEFAULTS_V2_CHANGED);
    expect(reloaded.restSec).toBe(90);
    expect(reloaded.rir).toBe(1);
  });

  it('absent defaults stay absent (blank, never substituted)', () => {
    const entry = copyDefaultsToEntry({});
    expect(entry.restSec).toBeUndefined();
    expect(entry.rir).toBeUndefined();
    expect(entry.reps).toBeUndefined();
    const reloaded = deserializeEntry(
      serializeEntry({ ...entry, sets: [] }),
      DEFAULTS_V2_CHANGED,
    );
    expect(reloaded.restSec).toBeUndefined();
    expect(reloaded.rir).toBeUndefined();
    expect(reloaded.reps).toBeUndefined();
  });
});
