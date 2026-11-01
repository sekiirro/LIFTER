import { normalizeWorkoutDocument, type WorkoutDocument } from './schema';

export type WorkoutDocumentParser = (document: unknown) => WorkoutDocument;

export type WorkoutSchemaRegistration = Readonly<{
  parser: WorkoutDocumentParser;
}>;

const GENERIC_ERROR_MESSAGE = 'Workout schema version is unavailable';

export class SchemaRegistryError extends Error {
  readonly code = 'unavailable_workout_schema_version';

  constructor() {
    super(GENERIC_ERROR_MESSAGE);
    this.name = 'SchemaRegistryError';
  }
}

// Add a retained version here before using it. Its frozen golden fixture lives
// under tests/fixtures/workout and its parser must remain immutable.
export const workoutSchemaRegistry: Readonly<
  Record<number, WorkoutSchemaRegistration>
> = Object.freeze({
  1: Object.freeze({ parser: normalizeWorkoutDocument }),
});

export const registeredVersions: readonly number[] = Object.freeze(
  Object.keys(workoutSchemaRegistry).map((version) => Number(version)),
);

export const publishableSchemaVersions: readonly number[] = Object.freeze(
  registeredVersions.reduce<number[]>((versions, version) => {
    if (version === 1) versions.push(version);
    return versions;
  }, []),
);

function requireSchemaVersion(version: unknown): number {
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version <= 0
  ) {
    throw new SchemaRegistryError();
  }
  return version;
}

function getRegistration(version: number): WorkoutSchemaRegistration {
  const registration = workoutSchemaRegistry[version];
  if (!registration) throw new SchemaRegistryError();
  return registration;
}

export function parseWorkoutDocumentForRender(
  version: unknown,
  document: unknown,
): WorkoutDocument {
  const schemaVersion = requireSchemaVersion(version);
  return getRegistration(schemaVersion).parser(document);
}

export function parseWorkoutDocumentForPublish(
  version: unknown,
  document: unknown,
): WorkoutDocument {
  const schemaVersion = requireSchemaVersion(version);
  const registration = getRegistration(schemaVersion);
  if (!publishableSchemaVersions.includes(schemaVersion)) {
    throw new SchemaRegistryError();
  }
  return registration.parser(document);
}
