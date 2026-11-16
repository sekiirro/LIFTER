import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeDocumentValues,
  type NutritionSnapshotMap,
} from '../../lib/plans/nutrition/macros';
import {
  nutritionUnitContextKey,
  validateNutritionDocument,
} from '../../lib/plans/nutrition/schema';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

type Envelope = {
  document: {
    max_request_bytes: number;
    max_meals: number;
    max_items: number;
    max_alternatives: number;
    max_decimal_places: number;
  };
  request_mix: {
    publish_requests: number;
    revision_read_requests: number;
    publish_max_ms: number;
    read_max_ms: number;
  };
  storage: {
    max_revision_payload_bytes: number;
    max_revision_document_bytes: number;
    max_template_document_bytes: number;
  };
};

const envelopePath = new URL(
  '../../specs/018-nutrition-planner/nutrition-benchmark-envelope.json',
  import.meta.url,
);
const envelope = JSON.parse(readFileSync(envelopePath, 'utf8')) as Envelope;
const RUN_BENCHMARK = process.env.SC006_TIMING_RUN === 'true';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let foodId: string;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin(async (tx) => {
    const g = await graph(tx, fixture);
    foodId = randomUUID();
    await tx`insert into public.foods (id, created_by, current_version)
      values (${foodId}, ${fixture.trainerA.userId}, 1)`;
    await tx`insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${foodId}, 1, '{}'::jsonb, ${fixture.trainerA.userId},
      'اختبار غذائي', 'Benchmark Food', 'g', ${`benchmark:${foodId}`},
      'benchmark', 'not_applicable', 120.0, 10.000, 20.000, 3.000, null
    )`;
    await tx`insert into public.food_serving_units (
      food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
    ) values (${foodId}, 1, 'g', 'g', 'جرام', 'Gram', 1.000)`;
    return g;
  });
});

afterAll(async () => db?.end());

function makeDocument(): NutritionDocumentV1 {
  let itemNumber = 0;
  return {
    schemaVersion: 1,
    structure: 'seven_day',
    dayTypes: [
      {
        id: 'dt-train',
        name: { ar: 'تمرين', en: 'Training' },
        trainingDay: true,
        targets: {
          kcal: '2500.125',
          protein: '180.125',
          carbs: '300.125',
          fat: '70.125',
        },
      },
    ],
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      dayTypeId: 'dt-train',
      meals: Array.from({ length: 3 }, (_, mealIndex) => ({
        id: `d${dayIndex}-m${mealIndex}`,
        name: { ar: `وجبة ${mealIndex + 1}`, en: `Meal ${mealIndex + 1}` },
        note: 'Benchmark meal note',
        recipeUrl: null,
        items: Array.from({ length: 8 }, () => {
          itemNumber += 1;
          return {
            id: `item-${itemNumber}`,
            foodId,
            foodVersion: 1,
            quantity: {
              value: '123.456',
              unit: { kind: 'basis' as const, value: 'g' as const },
            },
            note: 'Benchmark food note',
            alternatives: Array.from({ length: 3 }, (_, altIndex) => ({
              id: `item-${itemNumber}-alt-${altIndex + 1}`,
              foodId,
              foodVersion: 1,
              quantity: {
                value: '98.765',
                unit: { kind: 'basis' as const, value: 'g' as const },
              },
            })),
          };
        }),
      })),
    })),
    title: { ar: 'خطة قياس', en: 'Benchmark Plan' },
    notes: 'Synthetic benchmark payload',
  };
}

function percentile95(values: number[]): number {
  return (
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? 0
  );
}

describe('F18 T021 benchmark envelope', () => {
  it.skipIf(!RUN_BENCHMARK)(
    'measures the maximum document and fixed publish/read request mix',
    async () => {
      const doc = makeDocument();
      const serialized = JSON.stringify(doc);
      const documentBytes = Buffer.byteLength(serialized, 'utf8');
      const mealCount = doc.days!.reduce(
        (count, day) => count + day.meals.length,
        0,
      );
      const itemCount = doc.days!.reduce(
        (count, day) =>
          count + day.meals.reduce((sum, meal) => sum + meal.items.length, 0),
        0,
      );
      const alternativeCount = doc.days!.reduce(
        (count, day) =>
          count +
          day.meals.reduce(
            (sum, meal) =>
              sum +
              meal.items.reduce((n, item) => n + item.alternatives.length, 0),
            0,
          ),
        0,
      );
      const precisionValues = doc.dayTypes.flatMap((type) =>
        type.targets ? Object.values(type.targets) : [],
      );
      for (const day of doc.days!) {
        for (const meal of day.meals) {
          for (const item of meal.items) {
            precisionValues.push(
              item.quantity.value,
              ...item.alternatives.map(
                (alternative) => alternative.quantity.value,
              ),
            );
          }
        }
      }
      const decimalPlaces = Math.max(
        ...precisionValues.map((value) => value.split('.')[1]?.length ?? 0),
      );
      const publishMs: number[] = [];
      const readMs: number[] = [];
      const workerCpuMs: number[] = [];
      const revisionIds: string[] = [];

      for (let sample = 0; sample < 3; sample += 1) {
        const created = await fixture.trainerA.client.rpc('create_plan_draft', {
          p_workspace_id: fixture.wsA.id,
          p_client_id: seeded.client,
          p_plan_kind: 'nutrition',
          p_content: doc,
          p_operation_key: randomUUID(),
        });
        expect(created.error).toBeNull();
        const planId = created.data as string;
        const started = performance.now();
        const published = await fixture.trainerA.client.rpc(
          'publish_nutrition_revision',
          {
            p_plan_id: planId,
            p_expected_draft_version: 1,
            p_expected_published_version: 0,
            p_operation_key: randomUUID(),
          },
        );
        publishMs.push(performance.now() - started);
        expect(published.error).toBeNull();
        revisionIds.push(
          (published.data as { revision_id: string }).revision_id,
        );
        const revisionId = revisionIds.at(-1)!;

        for (let read = 0; read < 10; read += 1) {
          const readStarted = performance.now();
          const rows =
            await db`select schema_version, algorithm_version, document, snapshot_map, computed_values
          from public.nutrition_plan_version_contents
          where workspace_id = ${fixture.wsA.id} and revision_id = ${revisionId}`;
          expect(rows).toHaveLength(1);
          readMs.push(performance.now() - readStarted);
        }
      }

      const [storageRow] = await db`select
      max(octet_length(document::text))::int as revision_document_bytes,
      max(octet_length(snapshot_map::text))::int as snapshot_map_bytes,
      max(octet_length(computed_values::text))::int as computed_values_bytes,
      max(octet_length(document::text) + octet_length(snapshot_map::text) + octet_length(computed_values::text))::int as revision_payload_bytes
      from public.nutrition_plan_version_contents c
      where workspace_id = ${fixture.wsA.id} and revision_id = any(${revisionIds}::uuid[])`;
      const firstRevisionId = revisionIds[0]!;
      const [domainInput] = await db`select snapshot_map
      from public.nutrition_plan_version_contents
      where workspace_id = ${fixture.wsA.id} and revision_id = ${firstRevisionId}`;
      const snapshotMap = domainInput!.snapshot_map as NutritionSnapshotMap;
      const unitContext = {
        [nutritionUnitContextKey(foodId, 1)]: {
          basis: 'g' as const,
          servingUnitKeys: ['g'],
        },
      };
      for (let sample = 0; sample < 15; sample += 1) {
        const cpuStarted = process.cpuUsage();
        for (let repeat = 0; repeat < 5; repeat += 1) {
          const validated = validateNutritionDocument(doc, unitContext);
          computeDocumentValues(validated, snapshotMap);
        }
        const cpuElapsed = process.cpuUsage(cpuStarted);
        workerCpuMs.push((cpuElapsed.user + cpuElapsed.system) / 1000 / 5);
      }
      const [templateRow] =
        await db`select octet_length(${JSON.stringify(doc)}::jsonb::text)::int as template_bytes`;

      const measured = {
        document: {
          bytes: documentBytes,
          meals: mealCount,
          items: itemCount,
          alternatives: alternativeCount,
          decimal_places: decimalPlaces,
        },
        request_mix: {
          publish_requests: publishMs.length,
          revision_read_requests: readMs.length,
          publish_p95_ms: percentile95(publishMs),
          read_p95_ms: percentile95(readMs),
          domain_cpu_observation_p95_ms: percentile95(workerCpuMs),
        },
        storage: {
          revision_payload_bytes: storageRow!.revision_payload_bytes,
          revision_document_bytes: storageRow!.revision_document_bytes,
          snapshot_map_bytes: storageRow!.snapshot_map_bytes,
          computed_values_bytes: storageRow!.computed_values_bytes,
          template_document_bytes: templateRow!.template_bytes,
        },
      };
      console.info(
        `F18 benchmark measured envelope: ${JSON.stringify(measured)}`,
      );

      expect(envelope).toMatchObject({
        document: {
          max_request_bytes: expect.any(Number),
          max_meals: expect.any(Number),
          max_items: expect.any(Number),
          max_alternatives: expect.any(Number),
          max_decimal_places: expect.any(Number),
        },
        request_mix: {
          publish_requests: expect.any(Number),
          revision_read_requests: expect.any(Number),
          publish_max_ms: expect.any(Number),
          read_max_ms: expect.any(Number),
        },
        storage: {
          max_revision_payload_bytes: expect.any(Number),
          max_revision_document_bytes: expect.any(Number),
          max_template_document_bytes: expect.any(Number),
        },
      });
      expect(documentBytes).toBeLessThanOrEqual(
        envelope.document.max_request_bytes,
      );
      expect(mealCount).toBeLessThanOrEqual(envelope.document.max_meals);
      expect(itemCount).toBeLessThanOrEqual(envelope.document.max_items);
      expect(alternativeCount).toBeLessThanOrEqual(
        envelope.document.max_alternatives,
      );
      expect(decimalPlaces).toBeLessThanOrEqual(
        envelope.document.max_decimal_places,
      );
      expect(publishMs.length).toBe(envelope.request_mix.publish_requests);
      expect(readMs.length).toBe(envelope.request_mix.revision_read_requests);
      expect(measured.request_mix.publish_p95_ms).toBeLessThanOrEqual(
        envelope.request_mix.publish_max_ms,
      );
      expect(measured.request_mix.read_p95_ms).toBeLessThanOrEqual(
        envelope.request_mix.read_max_ms,
      );
      expect(storageRow!.revision_payload_bytes).toBeLessThanOrEqual(
        envelope.storage.max_revision_payload_bytes,
      );
      expect(storageRow!.revision_document_bytes).toBeLessThanOrEqual(
        envelope.storage.max_revision_document_bytes,
      );
      expect(templateRow!.template_bytes).toBeLessThanOrEqual(
        envelope.storage.max_template_document_bytes,
      );
    },
    180_000,
  );
});
