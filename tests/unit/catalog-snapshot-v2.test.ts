import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseExerciseSnapshotV2,
  parseSnapshot,
  serializeExerciseSnapshotV2,
  toExerciseSnapshotV2,
  type ExerciseSnapshotV2,
} from '../../lib/catalog/snapshot';

const fixturePath = join(
  process.cwd(),
  'tests',
  'fixtures',
  'catalog-snapshots',
  'exercise-v2-planner-entry.json',
);
const fixture = JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as ExerciseSnapshotV2;

const plannerEntry = {
  name: { en: 'Planner edited name', ar: 'اسم المدرب' },
  description: 'Planner description',
  notes: 'Trainer note',
  alternatives: [{ globalExerciseId: 'ex-2' }],
  defaults: {
    restSeconds: 75,
    rir: 1,
    reps: { kind: 'fixed' as const, value: 10 },
  },
};

describe('ExerciseSnapshotV2 (T056)', () => {
  it('builds and serializes the frozen planner-entry fixture byte-for-byte', () => {
    const snapshot = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-1',
      canonicalVersion: 3,
      overrideVersion: 5,
      plannerEntry,
    });
    expect(snapshot.schemaVersion).toBe(2);
    expect(serializeExerciseSnapshotV2(snapshot)).toBe(
      readFileSync(fixturePath, 'utf8').trim(),
    );
  });

  it('keeps the planner-entry default after the library default changes before publication', () => {
    const plannerEntryAtAdd = {
      ...plannerEntry,
      defaults: { ...plannerEntry.defaults, restSeconds: 90 },
    };
    const editedEntry = {
      ...plannerEntryAtAdd,
      defaults: { ...plannerEntryAtAdd.defaults, restSeconds: 75 },
    };
    const published = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-1',
      canonicalVersion: 4,
      overrideVersion: null,
      plannerEntry: editedEntry,
      currentLibrary: {
        defaults: { ...editedEntry.defaults, restSeconds: 120 },
      },
    });
    expect(published.defaults.restSeconds).toBe(75);
    expect(published.defaults.rir).toBe(1);
    expect(published.defaults.reps).toEqual({ kind: 'fixed', value: 10 });
  });

  it('captures workspace-private identity and version without canonical or override references', () => {
    const snapshot = toExerciseSnapshotV2({
      source: 'workspace_private',
      workspaceExerciseId: 'wex-1',
      workspaceExerciseVersion: 2,
      plannerEntry,
    });
    expect(snapshot.source).toBe('workspace_private');
    expect(snapshot.workspaceExerciseId).toBe('wex-1');
    expect(snapshot.workspaceExerciseVersion).toBe(2);
    expect(snapshot).not.toHaveProperty('exerciseId');
    expect(snapshot).not.toHaveProperty('overrideVersion');
  });

  it('does not freeze Video and preserves only the immutable version references for other metadata', () => {
    const snapshot = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-1',
      canonicalVersion: 3,
      overrideVersion: null,
      plannerEntry: { ...plannerEntry, videoUrl: 'https://youtube.com/live' },
    });
    expect(snapshot).not.toHaveProperty('video');
    expect(snapshot).not.toHaveProperty('videoUrl');
    expect(snapshot.canonicalVersion).toBe(3);
    expect(serializeExerciseSnapshotV2(snapshot)).not.toContain('youtube');
    expect(() =>
      parseExerciseSnapshotV2({
        ...snapshot,
        video: 'https://youtube.com/live',
      }),
    ).toThrow();
  });

  it('copies planner entry values rather than retaining mutable references', () => {
    const entry = structuredClone(plannerEntry);
    const snapshot = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-1',
      canonicalVersion: 3,
      overrideVersion: null,
      plannerEntry: entry,
    });
    entry.defaults.restSeconds = 300;
    entry.alternatives.push({ globalExerciseId: 'ex-3' });
    expect(snapshot.defaults.restSeconds).toBe(75);
    expect(snapshot.alternatives).toEqual([{ globalExerciseId: 'ex-2' }]);
  });

  it('serializes name and defaults in canonical key order and deep-copies reps', () => {
    const source = structuredClone(fixture);
    const reordered = {
      ...source,
      name: { ar: source.name.ar, en: source.name.en },
      defaults: {
        reps: { ...source.defaults.reps },
        rir: source.defaults.rir,
        restSeconds: source.defaults.restSeconds,
      },
    };
    expect(serializeExerciseSnapshotV2(reordered as ExerciseSnapshotV2)).toBe(
      readFileSync(fixturePath, 'utf8').trim(),
    );
    const parsed = parseExerciseSnapshotV2(reordered as ExerciseSnapshotV2);
    const mutableReps = source.defaults.reps as {
      kind: 'fixed';
      value: number;
    };
    mutableReps.value = 999;
    expect(parsed.defaults.reps).toEqual(fixture.defaults.reps);
  });

  it('copies nested values from the exact object passed to the parser', () => {
    const input = structuredClone(fixture);
    const parsed = parseExerciseSnapshotV2(input);
    (input.defaults.reps as { kind: 'fixed'; value: number }).value = 999;
    input.name.en = 'mutated after parse';
    const firstAlternative = input.alternatives[0];
    expect(firstAlternative && 'globalExerciseId' in firstAlternative).toBe(
      true,
    );
    if (firstAlternative && 'globalExerciseId' in firstAlternative)
      firstAlternative.globalExerciseId = 'mutated-id';

    expect(parsed.defaults.reps).toEqual(fixture.defaults.reps);
    expect(parsed.name.en).toBe(fixture.name.en);
    expect(parsed.alternatives).toEqual(fixture.alternatives);
  });

  it('preserves both allowed target kinds for workspace-private exercises', () => {
    const snapshot = toExerciseSnapshotV2({
      source: 'workspace_private',
      workspaceExerciseId: 'wex-1',
      workspaceExerciseVersion: 2,
      plannerEntry: {
        name: { en: 'Private exercise' },
        alternatives: [
          { globalExerciseId: 'ex-2' },
          { workspaceExerciseId: 'wex-2' },
        ],
      },
    });
    expect(snapshot.alternatives).toEqual([
      { globalExerciseId: 'ex-2' },
      { workspaceExerciseId: 'wex-2' },
    ]);
  });

  it('rejects private targets on a Global source snapshot', () => {
    expect(() =>
      parseExerciseSnapshotV2({
        ...(fixture as object),
        overrideVersion: null,
        alternatives: [{ workspaceExerciseId: 'wex-2' }],
      }),
    ).toThrow();
  });

  it('round-trips a private Alternative when a Global snapshot pins a workspace override', () => {
    const snapshot = toExerciseSnapshotV2({
      source: 'global',
      exerciseId: 'ex-1',
      canonicalVersion: 3,
      overrideVersion: 5,
      plannerEntry: {
        ...plannerEntry,
        alternatives: [{ workspaceExerciseId: 'wex-2' }],
      },
    });

    expect(snapshot.alternatives).toEqual([{ workspaceExerciseId: 'wex-2' }]);
    expect(
      parseExerciseSnapshotV2(
        JSON.parse(serializeExerciseSnapshotV2(snapshot)),
      ),
    ).toEqual(snapshot);
  });

  it('rejects alternative objects with both or neither target key', () => {
    expect(() =>
      parseExerciseSnapshotV2({
        schemaVersion: 2,
        source: 'workspace_private',
        workspaceExerciseId: 'wex-1',
        workspaceExerciseVersion: 2,
        name: { en: 'Private exercise' },
        defaults: {},
        alternatives: [
          { globalExerciseId: 'ex-2', workspaceExerciseId: 'wex-2' },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseExerciseSnapshotV2({
        schemaVersion: 2,
        source: 'workspace_private',
        workspaceExerciseId: 'wex-1',
        workspaceExerciseVersion: 2,
        name: { en: 'Private exercise' },
        defaults: {},
        alternatives: [{}],
      }),
    ).toThrow();
  });

  it.each([
    ['canonicalVersion', 0],
    ['canonicalVersion', -1],
    ['overrideVersion', 0],
    ['overrideVersion', -1],
  ] as const)('rejects non-positive Global %s=%i references', (key, value) => {
    expect(() =>
      parseExerciseSnapshotV2({ ...(fixture as object), [key]: value }),
    ).toThrow();
  });

  it.each([0, -1])(
    'rejects non-positive workspace-private version %i',
    (workspaceExerciseVersion) => {
      expect(() =>
        parseExerciseSnapshotV2({
          schemaVersion: 2,
          source: 'workspace_private',
          workspaceExerciseId: 'wex-1',
          workspaceExerciseVersion,
          name: { en: 'Private exercise' },
          alternatives: [],
          defaults: {},
        }),
      ).toThrow();
    },
  );

  it('rejects duplicate alternatives and more than three targets', () => {
    expect(() =>
      parseExerciseSnapshotV2({
        ...(fixture as object),
        alternatives: [
          { globalExerciseId: 'ex-2' },
          { globalExerciseId: 'ex-2' },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseExerciseSnapshotV2({
        ...(fixture as object),
        alternatives: [
          { globalExerciseId: 'ex-2' },
          { globalExerciseId: 'ex-3' },
          { globalExerciseId: 'ex-4' },
          { globalExerciseId: 'ex-5' },
        ],
      }),
    ).toThrow();
  });

  it('parses the V2 fixture and rejects unknown frozen fields', () => {
    expect(parseExerciseSnapshotV2(fixture)).toEqual(fixture);
    expect(parseSnapshot(fixture)).toEqual(fixture);
    expect(() =>
      parseExerciseSnapshotV2({ ...(fixture as object), video: null }),
    ).toThrow();
  });
});
