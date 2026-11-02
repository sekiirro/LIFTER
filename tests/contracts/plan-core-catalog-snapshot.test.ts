import { describe, expect, it } from 'vitest';
import {
  createCatalogSnapshotRef,
  normalizeCatalogSnapshotRef,
} from '../../lib/plan-core/catalog-snapshot-ref';

const exerciseSnapshot = {
  exerciseId: '22222222-2222-4222-8222-222222222222',
  version: 7,
  names: { ar: 'ضغط صدر', en: 'Bench press' },
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  equipment: 'barbell',
};

describe('Plan Core catalog snapshot references', () => {
  it('requires an explicit immutable catalog identity and version', () => {
    expect(() =>
      normalizeCatalogSnapshotRef({
        kind: 'exercise',
        identityId: exerciseSnapshot.exerciseId,
        snapshot: exerciseSnapshot,
      }),
    ).toThrow(/version/i);

    expect(() =>
      normalizeCatalogSnapshotRef({
        kind: 'exercise',
        identityId: exerciseSnapshot.exerciseId,
        version: 7,
        snapshot: { ...exerciseSnapshot, version: undefined },
      }),
    ).toThrow(/version/i);
  });

  it('rejects a live pointer in place of a frozen snapshot', () => {
    expect(() =>
      normalizeCatalogSnapshotRef({
        kind: 'exercise',
        identityId: exerciseSnapshot.exerciseId,
        version: 7,
        snapshot: { exerciseId: exerciseSnapshot.exerciseId, version: 7 },
        live: true,
      }),
    ).toThrow();
  });

  it('pins and freezes the exact catalog version in a plan revision', () => {
    const reference = createCatalogSnapshotRef('exercise', exerciseSnapshot);

    expect(reference).toMatchObject({
      kind: 'exercise',
      identityId: exerciseSnapshot.exerciseId,
      version: 7,
      snapshot: exerciseSnapshot,
    });
    expect(Object.isFrozen(reference)).toBe(true);
    expect(Object.isFrozen(reference.snapshot)).toBe(true);
    expect(() =>
      normalizeCatalogSnapshotRef({
        ...reference,
        version: 8,
      }),
    ).toThrow(/match/i);
  });
});
