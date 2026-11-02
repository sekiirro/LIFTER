import {
  parseSnapshot,
  type ExerciseSnapshot,
  type FoodSnapshot,
  type Snapshot,
} from '../catalog/snapshot';

export type CatalogSnapshotRef =
  | {
      kind: 'exercise';
      identityId: string;
      version: number;
      snapshot: ExerciseSnapshot;
    }
  | {
      kind: 'food';
      identityId: string;
      version: number;
      snapshot: FoodSnapshot;
    };

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireIdentityId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Catalog identity id must be a non-empty string');
  }
  return value.trim();
}

function snapshotIdentity(snapshot: Snapshot): string {
  return 'exerciseId' in snapshot ? snapshot.exerciseId : snapshot.foodId;
}

function refFromSnapshot(snapshot: Snapshot): CatalogSnapshotRef {
  if ('exerciseId' in snapshot) {
    return {
      kind: 'exercise',
      identityId: snapshot.exerciseId,
      version: snapshot.version,
      snapshot,
    };
  }
  return {
    kind: 'food',
    identityId: snapshot.foodId,
    version: snapshot.version,
    snapshot,
  };
}

/** Copy and freeze one exact F16 catalog version for inclusion in a plan revision. */
export function createCatalogSnapshotRef(
  kind: 'exercise',
  snapshot: ExerciseSnapshot,
): CatalogSnapshotRef;
export function createCatalogSnapshotRef(
  kind: 'food',
  snapshot: FoodSnapshot,
): CatalogSnapshotRef;
export function createCatalogSnapshotRef(
  kind: CatalogSnapshotRef['kind'],
  input: Snapshot,
): CatalogSnapshotRef {
  const snapshot = parseSnapshot(clone(input));
  const reference = refFromSnapshot(snapshot);
  if (reference.kind !== kind) {
    throw new Error('Catalog kind does not match snapshot');
  }
  return freezeDeep(reference);
}

/** Validate a serialized plan reference and retain its exact identity/version pair. */
export function normalizeCatalogSnapshotRef(
  input: unknown,
): CatalogSnapshotRef {
  if (!isRecord(input))
    throw new Error('Catalog snapshot reference must be an object');
  const allowed = ['kind', 'identityId', 'version', 'snapshot'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error('Catalog snapshot reference contains an unknown field');
  }
  if (input.kind !== 'exercise' && input.kind !== 'food') {
    throw new Error('Catalog snapshot reference kind is invalid');
  }
  const identityId = requireIdentityId(input.identityId);
  if (
    typeof input.version !== 'number' ||
    !Number.isInteger(input.version) ||
    input.version <= 0
  ) {
    throw new Error(
      'Catalog snapshot reference version must be a positive integer',
    );
  }
  const snapshot = parseSnapshot(clone(input.snapshot));
  const reference = refFromSnapshot(snapshot);
  if (
    reference.kind !== input.kind ||
    snapshotIdentity(snapshot) !== identityId ||
    snapshot.version !== input.version
  ) {
    throw new Error(
      'Catalog snapshot reference identity/version must match snapshot',
    );
  }
  return freezeDeep({ ...reference, identityId, version: input.version });
}
