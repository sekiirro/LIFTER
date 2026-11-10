import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseExerciseSnapshotV2,
  parseSnapshot,
  serializeExerciseSnapshotV2,
  toExerciseSnapshotV2,
} from '../../lib/catalog/snapshot';

const fixturePath = join(
  process.cwd(),
  'tests',
  'fixtures',
  'catalog-snapshots',
  'exercise-v2-planner-entry.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

const plannerEntry = {
  name: { en: 'Planner edited name', ar: 'اسم المدرب' },
  description: 'Planner description',
  notes: 'Trainer note',
  alternatives: [{ globalExerciseId: 'ex-2' }],
  defaults: { restSeconds: 75, rir: 1, reps: { kind: 'fixed' as const, value: 10 } },
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
    expect(() => parseExerciseSnapshotV2({ ...snapshot, video: 'https://youtube.com/live' })).toThrow();
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
    expect(() => parseExerciseSnapshotV2({
      ...fixture as object,
      alternatives: [{ workspaceExerciseId: 'wex-2' }],
    })).toThrow();
  });

  it('rejects alternative objects with both or neither target key', () => {
    expect(() => parseExerciseSnapshotV2({
      schemaVersion: 2,
      source: 'workspace_private',
      workspaceExerciseId: 'wex-1',
      workspaceExerciseVersion: 2,
      name: { en: 'Private exercise' },
      defaults: {},
      alternatives: [{ globalExerciseId: 'ex-2', workspaceExerciseId: 'wex-2' }],
    })).toThrow();
    expect(() => parseExerciseSnapshotV2({
      schemaVersion: 2,
      source: 'workspace_private',
      workspaceExerciseId: 'wex-1',
      workspaceExerciseVersion: 2,
      name: { en: 'Private exercise' },
      defaults: {},
      alternatives: [{}],
    })).toThrow();
  });

  it('rejects duplicate alternatives and more than three targets', () => {
    expect(() => parseExerciseSnapshotV2({
      ...fixture as object,
      alternatives: [
        { globalExerciseId: 'ex-2' },
        { globalExerciseId: 'ex-2' },
      ],
    })).toThrow();
    expect(() => parseExerciseSnapshotV2({
      ...fixture as object,
      alternatives: [
        { globalExerciseId: 'ex-2' },
        { globalExerciseId: 'ex-3' },
        { globalExerciseId: 'ex-4' },
        { globalExerciseId: 'ex-5' },
      ],
    })).toThrow();
  });

  it('parses the V2 fixture and rejects unknown frozen fields', () => {
    expect(parseExerciseSnapshotV2(fixture)).toEqual(fixture);
    expect(parseSnapshot(fixture)).toEqual(fixture);
    expect(() => parseExerciseSnapshotV2({ ...fixture as object, video: null })).toThrow();
  });
});
