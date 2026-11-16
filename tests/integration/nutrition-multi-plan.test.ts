import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;

function documentWithMeals(count: number) {
  return {
    schemaVersion: 1,
    structure: 'single_day',
    implicitDayTypeId: 'rest',
    dayTypes: [
      {
        id: 'rest',
        name: { ar: 'راحة', en: 'Rest' },
        trainingDay: false,
        targets: null,
      },
    ],
    meals: Array.from({ length: count }, (_, index) => ({
      id: `meal-${index + 1}`,
      name: { ar: `وجبة ${index + 1}`, en: `Meal ${index + 1}` },
      note: null,
      recipeUrl: null,
      items: [],
    })),
    title: { ar: 'خطة اختبارية', en: 'Regression plan' },
    notes: null,
  };
}

async function createAndPublish(content: ReturnType<typeof documentWithMeals>) {
  const created = await fixture.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: fixture.wsA.id,
    p_client_id: seeded.client,
    p_plan_kind: 'nutrition',
    p_content: content,
    p_operation_key: randomUUID(),
  });
  expect(created.error).toBeNull();
  const planId = created.data as string;
  const published = await fixture.trainerA.client.rpc(
    'publish_nutrition_revision',
    {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    },
  );
  expect(published.error).toBeNull();
  expect(published.data).toMatchObject({
    status: 'ok',
    plan_id: planId,
    revision_number: 1,
  });
  return planId;
}

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, fixture));
  await db`insert into public.subscription_activations(
    workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
  ) values (${fixture.wsA.id}, ${seeded.subscription}, clock_timestamp(), ${randomUUID()}, 'po_override')`;
});
afterAll(async () => db?.end());

describe('F18 T026 multi-plan client projection', () => {
  it('shows each delivered nutrition plan and reflects the latest revision meal count', async () => {
    const firstPlanId = await createAndPublish(documentWithMeals(1));
    const secondPlanId = await createAndPublish(documentWithMeals(2));

    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: secondPlanId,
      p_expected_draft_version: 1,
      p_content: documentWithMeals(4),
      p_operation_key: randomUUID(),
    });
    expect(saved.error).toBeNull();
    expect(saved.data).toBe(2);
    const revised = await fixture.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: secondPlanId,
        p_expected_draft_version: 2,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(revised.error).toBeNull();
    expect(revised.data).toMatchObject({
      status: 'ok',
      plan_id: secondPlanId,
      revision_number: 2,
    });

    const [client] =
      await db`select auth_user_id from public.clients where id = ${seeded.client}`;
    const projection = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: client!.auth_user_id, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      try {
        const [row] = await tx`select public.client_plan_projection() as value`;
        return row!.value as {
          status: string;
          plans: Array<{
            plan_id: string;
            plan_kind: string;
            revision_number: number;
            content: { meals: unknown[] };
          }>;
        };
      } finally {
        await tx`reset role`;
      }
    });

    expect(projection.status).toBe('ok');
    expect(projection.plans.map((plan) => plan.plan_id).sort()).toEqual(
      [firstPlanId, secondPlanId].sort(),
    );
    expect(
      projection.plans.every((plan) => plan.plan_kind === 'nutrition'),
    ).toBe(true);
    expect(
      projection.plans.find((plan) => plan.plan_id === firstPlanId),
    ).toMatchObject({
      revision_number: 1,
      content: { meals: expect.arrayContaining([expect.any(Object)]) },
    });
    expect(
      projection.plans.find((plan) => plan.plan_id === firstPlanId)?.content
        .meals,
    ).toHaveLength(1);
    expect(
      projection.plans.find((plan) => plan.plan_id === secondPlanId),
    ).toMatchObject({ revision_number: 2 });
    expect(
      projection.plans.find((plan) => plan.plan_id === secondPlanId)?.content
        .meals,
    ).toHaveLength(4);
  });
});
