import { describe, expect, it } from 'vitest';
import {
  freezeWorkoutExercise,
  resolveWorkoutExercise,
} from '../../lib/workout-planner/exercise-resolution';

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const fields = {
  name: { value: { en: 'Cable Row', ar: 'سحب' } },
  description: { value: 'Controlled pull' },
  notes: { value: 'Keep chest up' },
  video: { value: 'https://example.test/live' },
  alternatives: {
    value: [{ source: 'global', identity_id: uuid('9'), version: 1 }],
  },
  default_rest_time: { value: 90 },
  default_rir: { value: 0 },
  default_reps: { value: { min: 8, max: 12 } },
};
const pinnedVersion = {
  identity_id: uuid('1'),
  version: 3,
  primary_muscle_code: 'back',
  secondary_muscle_codes: ['biceps'],
};

describe('F16 effective resolution adapter (T011)', () => {
  it('pins global identity and source-workspace override and copies effective values once', () => {
    const result = resolveWorkoutExercise({
      reference: { source: 'global', identity_id: uuid('1'), version: 3 },
      effectiveFields: fields,
      overrideVersion: 5,
      resolutionWorkspaceId: uuid('2'),
      destinationWorkspaceId: uuid('3'),
      authoring: 'workspace',
      resolutionScope: 'workspace',
      pinnedVersion,
    });
    expect(result.reference).toEqual({
      source: 'global',
      identity_id: uuid('1'),
      version: 3,
      overrideVersion: 5,
      overrideWorkspaceId: uuid('2'),
    });
    expect(result.entry).toMatchObject({
      name: 'Cable Row',
      description: 'Controlled pull',
      notes: 'Keep chest up',
      rir: 0,
      restSec: 90,
      reps: { min: 8, max: 12 },
      sets: [],
    });
    expect(result.entry).not.toHaveProperty('video');
    expect(result.entry.alternatives).toEqual([
      { source: 'global', identity_id: uuid('9'), version: 1 },
    ]);
  });

  it('uses canonical-only values for fresh global authoring and blanks absent defaults', () => {
    const result = resolveWorkoutExercise({
      reference: { source: 'global', identity_id: uuid('1'), version: 3 },
      effectiveFields: {
        name: fields.name,
        description: fields.description,
        notes: fields.notes,
      },
      authoring: 'global_fresh',
      resolutionScope: 'canonical',
      pinnedVersion,
    });
    expect(result.reference).toEqual({
      source: 'global',
      identity_id: uuid('1'),
      version: 3,
    });
    expect(result.entry.rir).toBeUndefined();
    expect(result.entry.restSec).toBeUndefined();
    expect(result.entry.reps).toBeUndefined();
  });

  it('rejects foreign private refs, overrides resolved as destination-local, and unresolved promoted refs', () => {
    expect(() =>
      resolveWorkoutExercise({
        reference: {
          source: 'workspace_private',
          identity_id: uuid('1'),
          version: 1,
          workspace_id: uuid('2'),
        },
        effectiveFields: fields,
        destinationWorkspaceId: uuid('3'),
        authoring: 'workspace',
        resolutionScope: 'workspace',
        pinnedVersion,
      }),
    ).toThrowError('invalid_document');
    expect(() =>
      resolveWorkoutExercise({
        reference: {
          source: 'global',
          identity_id: uuid('1'),
          version: 3,
          overrideVersion: 2,
          overrideWorkspaceId: uuid('2'),
        },
        effectiveFields: fields,
        resolutionWorkspaceId: uuid('3'),
        destinationWorkspaceId: uuid('3'),
        authoring: 'workspace',
        resolutionScope: 'workspace',
        pinnedVersion,
      }),
    ).toThrowError('invalid_document');
    expect(() =>
      resolveWorkoutExercise({
        reference: {
          source: 'workspace_private',
          identity_id: uuid('1'),
          version: 1,
          workspace_id: uuid('2'),
        },
        effectiveFields: fields,
        destinationWorkspaceId: uuid('3'),
        authoring: 'promoted_global',
        resolutionScope: 'workspace',
        resolved: false,
        pinnedVersion,
      }),
    ).toThrowError('invalid_document');
  });

  it('pins a workspace-private source version without an override', () => {
    const privateRef = {
      source: 'workspace_private' as const,
      identity_id: uuid('1'),
      version: 3,
      workspace_id: uuid('2'),
    };
    const result = resolveWorkoutExercise({
      reference: privateRef,
      effectiveFields: fields,
      destinationWorkspaceId: uuid('2'),
      authoring: 'workspace',
      resolutionScope: 'workspace',
      pinnedVersion: { ...pinnedVersion, workspace_id: uuid('2') },
    });
    expect(result.reference).toEqual(privateRef);
  });

  it('freezes trainer-edited entry values with original pins at publication', () => {
    const added = resolveWorkoutExercise({
      reference: {
        source: 'global',
        identity_id: uuid('1'),
        version: 3,
        overrideVersion: 2,
        overrideWorkspaceId: uuid('2'),
      },
      effectiveFields: fields,
      authoring: 'workspace',
      destinationWorkspaceId: uuid('2'),
      resolutionWorkspaceId: uuid('2'),
      resolutionScope: 'workspace',
      pinnedVersion,
    });
    const edited = { ...added.entry, name: 'Edited', rir: 1 };
    expect(added.reference).toMatchObject({
      version: 3,
      overrideVersion: 2,
      overrideWorkspaceId: uuid('2'),
    });
    expect(added.muscles).toEqual({ primary: 'back', secondary: ['biceps'] });
    expect(added.video).toBe('live');
    expect(edited).toMatchObject({ name: 'Edited', rir: 1 });
    expect(freezeWorkoutExercise(added.reference, edited)).toMatchObject({
      reference: added.reference,
      name: 'Edited',
      rir: 1,
    });
  });
});
