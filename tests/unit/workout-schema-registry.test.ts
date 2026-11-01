import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseWorkoutDocumentForPublish,
  parseWorkoutDocumentForRender,
  publishableSchemaVersions,
  registeredVersions,
  SchemaRegistryError,
  workoutSchemaRegistry,
} from '../../lib/plans/workout/schema-registry';
import { WorkoutValidationError } from '../../lib/plans/workout/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const v1Fixture = deepFreeze(
  JSON.parse(
    readFileSync(
      join(__dirname, '../fixtures/workout/schema-v1.json'),
      'utf-8',
    ),
  ) as unknown,
);

const EXPECTED_V1 = {
  days: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      kind: 'session',
      title: 'Push',
      items: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          exercise: { source: 'global', id: 'bench-press', version: 1 },
          sets: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              type: 'working',
              reps: { min: 8, max: 10 },
              load: { mode: 'added_weight', value: '20.5', unit: 'kg' },
              restSec: 90,
              rir: 2,
              notes: 'Controlled tempo',
            },
          ],
        },
      ],
    },
    { id: '10000000-0000-4000-8000-000000000002', kind: 'rest' },
  ],
  notes: 'Week one',
};

const INVALID_VERSIONS: ReadonlyArray<readonly [string, unknown]> = [
  ['zero', 0],
  ['negative', -1],
  ['non-integer', 1.5],
  ['NaN', Number.NaN],
  ['string', '1'],
  ['missing', undefined],
  ['null', null],
  ['object', {}],
];

const GENERIC_ERROR_MESSAGE = 'Workout schema version is unavailable';

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function expectGenericRegistryError(action: () => unknown): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(SchemaRegistryError);
  expect((thrown as Error).message).toBe(GENERIC_ERROR_MESSAGE);
}

describe('workout schema registry', () => {
  describe('immutable registrations', () => {
    it('exports frozen retained and publishable version lists', () => {
      expect(registeredVersions).toEqual([1]);
      expect(publishableSchemaVersions).toEqual([1]);
      expect(Object.isFrozen(registeredVersions)).toBe(true);
      expect(Object.isFrozen(publishableSchemaVersions)).toBe(true);
    });

    it('freezes the registry and every registration', () => {
      expect(Object.isFrozen(workoutSchemaRegistry)).toBe(true);
      expect(Object.isFrozen(workoutSchemaRegistry[1])).toBe(true);
    });

    it('does not let runtime mutation change registry lookups', () => {
      const mutableRegistry = workoutSchemaRegistry as unknown as Record<
        number,
        unknown
      >;

      expect(() => {
        mutableRegistry[2] = mutableRegistry[1];
      }).toThrow();
      expect(() => {
        delete mutableRegistry[1];
      }).toThrow();
      expect(() => {
        (
          workoutSchemaRegistry[1] as unknown as Record<string, unknown>
        ).parser = () => undefined;
      }).toThrow();

      expect(parseWorkoutDocumentForRender(1, v1Fixture)).toEqual(EXPECTED_V1);
      expectGenericRegistryError(() =>
        parseWorkoutDocumentForRender(2, v1Fixture),
      );
    });

    it('keeps the registered v1 fixture deeply frozen', () => {
      expect(Object.isFrozen(v1Fixture)).toBe(true);
      expect(
        Object.isFrozen(
          (v1Fixture as { days: Array<Record<string, unknown>> }).days[0],
        ),
      ).toBe(true);
      expect(() => {
        (v1Fixture as { days: unknown[] }).days.push({});
      }).toThrow();
    });
  });

  describe('parseWorkoutDocumentForRender', () => {
    it('parses every retained version to its frozen expected value', () => {
      for (const version of registeredVersions) {
        expect(parseWorkoutDocumentForRender(version, v1Fixture)).toEqual(
          EXPECTED_V1,
        );
      }
    });

    it.each(INVALID_VERSIONS)(
      'throws one generic error for %s version',
      (_label, version) => {
        expectGenericRegistryError(() =>
          parseWorkoutDocumentForRender(version, v1Fixture),
        );
      },
    );

    it.each([
      ['unregistered', 2],
      ['far unknown', 999],
    ])('throws one generic error for %s version', (_label, version) => {
      expectGenericRegistryError(() =>
        parseWorkoutDocumentForRender(version, v1Fixture),
      );
    });

    it('does not infer a missing version from the document shape', () => {
      expectGenericRegistryError(() =>
        parseWorkoutDocumentForRender(undefined, v1Fixture),
      );
    });

    it('propagates document validation errors for a registered version', () => {
      const invalidDocument = {
        ...(v1Fixture as Record<string, unknown>),
        days: 'not-an-array',
      };
      expect(() => parseWorkoutDocumentForRender(1, invalidDocument)).toThrow(
        WorkoutValidationError,
      );
    });
  });

  describe('parseWorkoutDocumentForPublish', () => {
    it('parses every publishable version to its frozen expected value', () => {
      for (const version of publishableSchemaVersions) {
        expect(parseWorkoutDocumentForPublish(version, v1Fixture)).toEqual(
          EXPECTED_V1,
        );
      }
    });

    it.each(INVALID_VERSIONS)(
      'throws one generic error for %s version',
      (_label, version) => {
        expectGenericRegistryError(() =>
          parseWorkoutDocumentForPublish(version, v1Fixture),
        );
      },
    );

    it.each([
      ['unregistered', 2],
      ['far unknown', 999],
    ])('throws one generic error for %s version', (_label, version) => {
      expectGenericRegistryError(() =>
        parseWorkoutDocumentForPublish(version, v1Fixture),
      );
    });

    it('does not infer a missing version from the document shape', () => {
      expectGenericRegistryError(() =>
        parseWorkoutDocumentForPublish(undefined, v1Fixture),
      );
    });

    it('propagates document validation errors for a publishable version', () => {
      const invalidDocument = {
        ...(v1Fixture as Record<string, unknown>),
        days: 'not-an-array',
      };
      expect(() => parseWorkoutDocumentForPublish(1, invalidDocument)).toThrow(
        WorkoutValidationError,
      );
    });
  });
});
