import { describe, expect, it } from 'vitest';
import {
  copyFromPublishedRevision,
  copyFromTemplateVersion,
  copyPlanContent,
} from '../../lib/plans/copy';
import type { PlanContent } from '../../lib/plans/client-contract';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import type { WorkoutDocumentV1 } from '../../lib/workout-planner/document';

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const DAY_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SET_ID = '44444444-4444-4444-8444-444444444444';

function makeWorkoutDoc(): WorkoutDocumentV1 {
  return {
    schema_version: 1,
    notes: 'Coach custom block notes',
    days: [
      {
        id: DAY_ID,
        kind: 'session',
        title: 'Upper Push',
        items: [
          {
            id: ITEM_ID,
            exercise: {
              source: 'global',
              identity_id: EXERCISE_ID,
              version: 3,
            },
            name: 'Incline Bench Press',
            description: '30-degree bench',
            reps: { min: 6, max: 8 },
            restSec: 150,
            rir: 1,
            notes: 'Pause 1s on chest',
            alternatives: [
              {
                source: 'global',
                identity_id: '55555555-5555-4555-8555-555555555555',
                version: 1,
              },
            ],
            sets: [
              {
                id: SET_ID,
                type: 'working',
                load: { mode: 'added_weight', value: '82.5', unit: 'kg' },
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeNutritionDoc(): NutritionDocumentV1 {
  return {
    schemaVersion: 1,
    structure: 'single_day',
    dayTypes: [
      {
        id: 'dt-1',
        name: { ar: 'يوم تدريب', en: 'Training Day' },
        trainingDay: true,
        targets: { kcal: '2600', protein: '190', carbs: '300', fat: '70' },
      },
    ],
    implicitDayTypeId: 'dt-1',
    meals: [
      {
        id: 'meal-1',
        name: { ar: 'الفطار', en: 'Breakfast' },
        note: 'Take with water',
        recipeUrl: 'https://example.com/oats',
        items: [
          {
            id: 'item-1',
            foodId: 'food-oats',
            foodVersion: 4,
            quantity: { value: '80', unit: { kind: 'basis', value: 'g' } },
            note: 'Rolled oats',
            alternatives: [
              {
                id: 'alt-1',
                foodId: 'food-rice',
                foodVersion: 2,
                quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
              },
            ],
          },
        ],
      },
    ],
    title: { ar: 'خطة التضخيم', en: 'Lean Bulk' },
    notes: 'Hydrate 3L daily',
  };
}

function seqUuid() {
  let n = 1;
  return () => {
    const hex = (n++).toString(16).padStart(12, '0');
    return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
  };
}

describe('F19 T012 pure plan/template copy', () => {
  it('copies workout planner-entry values with fresh structural IDs, independent mutation, and no video/ownership fields', () => {
    const sourceDoc = makeWorkoutDoc();
    const taintedSource = {
      kind: 'workout',
      schemaVersion: 1,
      document: {
        ...sourceDoc,
        videoUrl: 'https://cdn.example.com/secret.mp4',
        ownership: { workspaceId: 'ws-1', authorId: 'user-1' },
        history: [{ event: 'published' }],
        subscription: { id: 'sub-1' },
        delivery: { id: 'del-1' },
        activation: { id: 'act-1' },
      },
    } as unknown as PlanContent<WorkoutDocumentV1>;

    const copied = copyPlanContent(
      taintedSource,
      seqUuid(),
    ) as PlanContent<WorkoutDocumentV1>;

    expect(copied.kind).toBe('workout');
    expect(copied.schemaVersion).toBe(1);
    expect(copied.document.notes).toBe('Coach custom block notes');
    expect(copied.document.days[0]?.title).toBe('Upper Push');
    expect(copied.document.days[0]?.items[0]?.reps).toEqual({ min: 6, max: 8 });
    expect(copied.document.days[0]?.items[0]?.restSec).toBe(150);
    expect(copied.document.days[0]?.items[0]?.rir).toBe(1);
    expect(copied.document.days[0]?.items[0]?.notes).toBe('Pause 1s on chest');
    expect(copied.document.days[0]?.items[0]?.sets[0]?.load).toEqual({
      mode: 'added_weight',
      value: '82.5',
      unit: 'kg',
    });

    // Independent structural IDs
    expect(copied.document.days[0]?.id).not.toBe(DAY_ID);
    expect(copied.document.days[0]?.items[0]?.id).not.toBe(ITEM_ID);
    expect(copied.document.days[0]?.items[0]?.sets[0]?.id).not.toBe(SET_ID);

    // Excluded metadata/video must not be present
    const docRecord = copied.document as unknown as Record<string, unknown>;
    expect(docRecord.videoUrl).toBeUndefined();
    expect(docRecord.ownership).toBeUndefined();
    expect(docRecord.history).toBeUndefined();
    expect(docRecord.subscription).toBeUndefined();
    expect(docRecord.delivery).toBeUndefined();
    expect(docRecord.activation).toBeUndefined();

    // Mutating copy does not mutate source
    copied.document.days[0]!.items[0]!.notes = 'Edited in destination';
    expect(sourceDoc.days[0]?.items[0]?.notes).toBe('Pause 1s on chest');
  });

  it('copies nutrition content preserving food versions, targets, and notes with independent IDs', () => {
    const sourceDoc = makeNutritionDoc();
    const copied = copyFromPublishedRevision(
      {
        planKind: 'nutrition',
        content: {
          kind: 'nutrition',
          schemaVersion: 1,
          document: {
            ...sourceDoc,
            video: 'should-not-copy',
            authored_by: 'trainer-1',
          } as unknown as NutritionDocumentV1,
        },
      },
      seqUuid(),
    ) as PlanContent<NutritionDocumentV1>;

    expect(copied.kind).toBe('nutrition');
    expect(copied.document.title).toEqual({
      ar: 'خطة التضخيم',
      en: 'Lean Bulk',
    });
    expect(copied.document.notes).toBe('Hydrate 3L daily');
    expect(copied.document.dayTypes[0]?.targets).toEqual({
      kcal: '2600',
      protein: '190',
      carbs: '300',
      fat: '70',
    });
    expect(copied.document.meals?.[0]?.note).toBe('Take with water');
    expect(copied.document.meals?.[0]?.items[0]?.foodId).toBe('food-oats');
    expect(copied.document.meals?.[0]?.items[0]?.foodVersion).toBe(4);
    expect(copied.document.meals?.[0]?.items[0]?.note).toBe('Rolled oats');
    expect(copied.document.implicitDayTypeId).toBe(
      copied.document.dayTypes[0]?.id,
    );
    expect(copied.document.dayTypes[0]?.id).not.toBe('dt-1');
    expect(copied.document.meals?.[0]?.id).not.toBe('meal-1');

    const docRecord = copied.document as unknown as Record<string, unknown>;
    expect(docRecord.video).toBeUndefined();
    expect(docRecord.authored_by).toBeUndefined();
  });

  it('copies from an immutable template version and rejects kind mismatch', () => {
    const doc = makeWorkoutDoc();
    const fromTpl = copyFromTemplateVersion(
      { schemaVersion: 1, document: doc },
      seqUuid(),
    );
    expect(fromTpl.kind).toBe('workout');
    expect(
      (fromTpl.document.days[0]?.items[0]?.exercise as { version: number })
        .version,
    ).toBe(3);

    expect(() =>
      copyFromPublishedRevision({
        planKind: 'nutrition',
        content: { kind: 'workout', schemaVersion: 1, document: doc },
      }),
    ).toThrow('invalid_plan_kind_mismatch');
  });
});
