import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NutritionDocumentV1 } from '../../lib/plans/nutrition/types';
import { admin, loadEnv, sql } from './harness';
import {
  clientContext,
  graph,
  type Context,
} from './registration-approval-fixture';

const db = sql();
const NUTRITION_ITEM_ID = '00000000-0000-4000-8000-000000000001';
const NUTRITION_ALTERNATIVE_ID = '00000000-0000-4000-8000-000000000002';
const UNAPPROVED_ALTERNATIVE_ID = '00000000-0000-4000-8000-000000000003';
const concurrencyDb = postgres(loadEnv().dbUrl, {
  // Each Promise gets its own transaction/session; cap simultaneous physical connections below
  // the local Supabase Postgres limit while still exercising independent concurrent sessions.
  max: 12,
  connect_timeout: 15,
  idle_timeout: 10,
});
let fixture: Context;
let seeded: Awaited<ReturnType<typeof graph>>;
let clientActorId: string;
let foodId: string;

const document = (
  suffix: string,
  withAlternative = false,
): NutritionDocumentV1 => ({
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: `day-${suffix}`,
  dayTypes: [
    {
      id: `day-${suffix}`,
      name: { ar: 'ÙŠÙˆÙ…', en: 'Day' },
      trainingDay: true,
      targets: null,
    },
  ],
  meals: [
    {
      id: `meal-${suffix}`,
      name: { ar: 'ÙˆØ¬Ø¨Ø©', en: 'Meal' },
      note: null,
      recipeUrl: null,
      items: withAlternative
        ? [
            {
              id: NUTRITION_ITEM_ID,
              foodId,
              foodVersion: 1,
              quantity: { value: '100', unit: { kind: 'basis', value: 'g' } },
              note: null,
              alternatives: [
                {
                  id: NUTRITION_ALTERNATIVE_ID,
                  foodId,
                  foodVersion: 1,
                  quantity: {
                    value: '120',
                    unit: { kind: 'basis', value: 'g' },
                  },
                },
              ],
            },
          ]
        : [],
    },
  ],
  title: { ar: 'Ø®Ø·Ø©', en: 'Plan' },
  notes: null,
});

async function asActor<T>(
  tx: TransactionSql,
  actorId: string,
  body: () => Promise<T>,
) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
  return body();
}

async function inSession<T>(
  actorId: string,
  body: (tx: TransactionSql) => Promise<T>,
) {
  return concurrencyDb.begin((tx) => asActor(tx, actorId, () => body(tx)));
}

async function createDraft(actorId: string, content: NutritionDocumentV1) {
  return inSession(actorId, async (tx) => {
    const [row] = await tx`select public.create_plan_draft(
      ${fixture.wsA.id}, ${seeded.client}, 'nutrition', ${tx.json(content)}, ${randomUUID()}
    ) as plan_id`;
    return row!.plan_id as string;
  });
}

async function publish(
  planId: string,
  draftVersion: number,
  publishedVersion: number,
  key: string,
) {
  return inSession(fixture.trainerA.userId, async (tx) => {
    const [row] = await tx`select public.publish_nutrition_revision(
      ${planId}, ${draftVersion}, ${publishedVersion}, ${key}, null
    ) as result`;
    return row!.result as Record<string, unknown>;
  });
}

async function waitForBlockedBy(queryFragment: string, blockerPid: number) {
  const observer = sql();
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      const [row] = await observer`
        select count(*)::int as count from pg_stat_activity a
        where a.wait_event_type = 'Lock'
          and a.query ilike ${`%${queryFragment}%`}
          and ${blockerPid} = any(pg_catalog.pg_blocking_pids(a.pid))
      `;
      if ((row?.count as number) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      `RPC did not wait behind the competing transaction: ${queryFragment}`,
    );
  } finally {
    await observer.end();
  }
}

beforeAll(async () => {
  fixture = await clientContext();
  clientActorId = '';
  const authUser = await admin().auth.admin.createUser({
    email: `f18-concurrency-${randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (authUser.error || !authUser.data.user)
    throw new Error(
      authUser.error?.message ?? 'F18 concurrency client missing',
    );
  clientActorId = authUser.data.user.id;

  seeded = await db.begin(async (tx) => {
    const g = await graph(tx, fixture, { authUserId: clientActorId });
    foodId = randomUUID();
    await tx`insert into public.foods (id, created_by, current_version)
      values (${foodId}, ${fixture.trainerA.userId}, 1)`;
    await tx`insert into public.food_versions (
      food_id, version, payload, created_by, name_ar, name_en, basis,
      product_identity_norm, preparation_identity_norm, weighing_state,
      kcal, protein_g, carbohydrate_g, fat_g, fiber_g
    ) values (
      ${foodId}, 1, '{}'::jsonb, ${fixture.trainerA.userId}, 'Ø¯Ø¬Ø§Ø¬', 'Chicken', 'g',
      ${`f18-concurrency:${foodId}`}, 'plain', 'cooked', 165, 31, 0, 3.6, null
    )`;
    await tx`insert into public.food_serving_units (
      food_id, food_version, basis, unit_key, label_ar, label_en, basis_qty
    ) values (${foodId}, 1, 'g', 'g', 'Ø¬Ø±Ø§Ù…', 'Gram', 1)`;
    return g;
  });

  await db.begin(async (tx) => {
    await tx`alter table public.subscription_activations disable trigger user`;
    await tx`insert into public.subscription_activations (
      workspace_id, subscription_id, activated_at, delivery_event_id, activation_source
    ) values (
      ${fixture.wsA.id}, ${seeded.subscription}, now(), ${randomUUID()}, 'renewal'
    ) on conflict (workspace_id, subscription_id) do update set activated_at=excluded.activated_at`;
    await tx`alter table public.subscription_activations enable trigger user`;
  });
  await db.unsafe(`
    create or replace function app_private.f18_t019_pause_selection_insert()
    returns trigger language plpgsql set search_path = '' as $$
    begin
      if pg_catalog.current_setting('app.f18_t019_pause_selection', true) = 'on' then
        perform pg_catalog.pg_advisory_xact_lock(7019, 18018);
      end if;
      return new;
    end
    $$;
    create trigger f18_t019_pause_selection_insert
      before insert on public.client_nutrition_alternative_selections
      for each row execute function app_private.f18_t019_pause_selection_insert();
  `);
}, 120_000);

afterAll(async () => {
  await db.unsafe(`
    drop trigger if exists f18_t019_pause_selection_insert on public.client_nutrition_alternative_selections;
    drop function if exists app_private.f18_t019_pause_selection_insert();
  `);
  await concurrencyDb.end();
  await db.end();
});

describe('F18 T019 concurrency and idempotency', () => {
  it('serializes 100 concurrent publish replays and recovers an ambiguous commit', async () => {
    const planId = await createDraft(
      fixture.trainerA.userId,
      document('publish', true),
    );
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => publish(planId, 1, 0, key)),
    );
    const receipt = results[0]!;
    expect(
      results.every(
        (result) => JSON.stringify(result) === JSON.stringify(receipt),
      ),
    ).toBe(true);
    expect(receipt).toMatchObject({
      status: 'ok',
      plan_id: planId,
      revision_number: 1,
    });

    // Simulate a lost response after commit: discard the first receipt and retry the same key.
    const ambiguousPlanId = await createDraft(
      fixture.trainerA.userId,
      document('ambiguous', true),
    );
    const ambiguousKey = randomUUID();
    await publish(ambiguousPlanId, 1, 0, ambiguousKey);
    const retry = await publish(ambiguousPlanId, 1, 0, ambiguousKey);
    expect(retry).toMatchObject({
      status: 'ok',
      plan_id: ambiguousPlanId,
      revision_number: 1,
    });
    const revisionId = retry.revision_id as string;
    const [counts] = await db`
      select (select count(*)::int from public.plan_revisions where plan_id=${ambiguousPlanId}) as revisions,
        (select count(*)::int from public.plan_deliveries where plan_id=${ambiguousPlanId}) as deliveries,
        (select count(*)::int from public.audit_events where action='plan.nutrition_publish' and target_id=${revisionId}) as audits
    `;
    expect(counts).toEqual({ revisions: 1, deliveries: 1, audits: 1 });
  }, 120_000);

  it('serializes concurrent publish with selection on one plan root and deduplicates 100 replays', async () => {
    const planId = await createDraft(
      fixture.trainerA.userId,
      document('selection', true),
    );
    const published = await publish(planId, 1, 0, randomUUID());
    const revisionId = published.revision_id as string;
    const blocker = sql();
    const [backend] = await blocker`select pg_catalog.pg_backend_pid() as pid`;
    const blockerPid = backend!.pid as number;
    await blocker`select pg_catalog.pg_advisory_lock(7019, 18018)`;

    const key = randomUUID();
    let selectionPid = 0;
    let markSelectionStarted!: () => void;
    const selectionStarted = new Promise<void>(
      (resolve) => (markSelectionStarted = resolve),
    );
    let nextPublish: Promise<Record<string, unknown>> | undefined;
    const selection = inSession(clientActorId, async (tx) => {
      await tx`select set_config('app.f18_t019_pause_selection', 'on', true)`;
      const [backendRow] = await tx`select pg_catalog.pg_backend_pid() as pid`;
      selectionPid = backendRow!.pid as number;
      markSelectionStarted();
      const [row] = await tx`select public.select_nutrition_alternative(
        ${revisionId}, ${NUTRITION_ITEM_ID}, ${NUTRITION_ALTERNATIVE_ID}, ${key}
      ) as result`;
      return row!.result as Record<string, unknown>;
    });
    try {
      await selectionStarted;
      await waitForBlockedBy('select_nutrition_alternative', blockerPid);
      nextPublish = publish(planId, 1, 1, randomUUID());
      await waitForBlockedBy('publish_nutrition_revision', selectionPid);
      await blocker`select pg_catalog.pg_advisory_unlock(7019, 18018)`;
      const [selected, nextReceipt] = await Promise.all([
        selection,
        nextPublish,
      ]);
      expect(selected).toMatchObject({ status: 'ok', selection_revision: 1 });
      expect(nextReceipt).toMatchObject({ status: 'ok', revision_number: 2 });
      const nextRevisionId = nextReceipt.revision_id as string;
      const [carried] = await db`
        select alternative_id from public.client_nutrition_alternative_selections
        where plan_version_id=${nextRevisionId} and item_id=${NUTRITION_ITEM_ID}
      `;
      expect(carried?.alternative_id).toBe(NUTRITION_ALTERNATIVE_ID);
    } finally {
      await blocker`select pg_catalog.pg_advisory_unlock(7019, 18018)`;
      await selection;
      if (nextPublish) await nextPublish;
      await blocker.end();
    }

    const first = await selection;
    expect(first).toMatchObject({ status: 'ok', selection_revision: 1 });
    const replayed = await Promise.all(
      Array.from({ length: 100 }, () =>
        inSession(clientActorId, async (tx) => {
          const [row] = await tx`select public.select_nutrition_alternative(
            ${revisionId}, ${NUTRITION_ITEM_ID}, ${NUTRITION_ALTERNATIVE_ID}, ${key}
          ) as result`;
          return row!.result;
        }),
      ),
    );
    expect(
      replayed.every(
        (result) => JSON.stringify(result) === JSON.stringify(first),
      ),
    ).toBe(true);
    const [counts] = await db`
      select (select count(*)::int from public.client_nutrition_alternative_selections
          where plan_version_id=${revisionId}) as selections,
        (select count(*)::int from public.audit_events where action='client.nutrition_select' and target_id=${revisionId}) as audits
    `;
    expect(counts).toEqual({ selections: 1, audits: 1 });
  }, 120_000);

  it('races selection validation with publish while enforcing the plan-root lock', async () => {
    const planId = await createDraft(
      fixture.trainerA.userId,
      document('lock-race', true),
    );
    const published = await publish(planId, 1, 0, randomUUID());
    const revisionId = published.revision_id as string;
    const blocker = sql();
    let unblock!: () => void;
    let signalHeld!: () => void;
    const held = new Promise<void>((resolve) => (signalHeld = resolve));
    let blockerPid = 0;
    const rootTransaction = blocker.begin(async (tx) => {
      await tx`select id from public.plan_roots where id=${planId} for update`;
      const [backend] = await tx`select pg_catalog.pg_backend_pid() as pid`;
      blockerPid = backend!.pid as number;
      signalHeld();
      await new Promise<void>((resolve) => (unblock = resolve));
    });
    await held;
    let signalSelectionStarted!: () => void;
    const selectionStarted = new Promise<void>(
      (resolve) => (signalSelectionStarted = resolve),
    );
    let selectionPid = 0;
    const selection = inSession(clientActorId, async (tx) => {
      const [backend] = await tx`select pg_catalog.pg_backend_pid() as pid`;
      selectionPid = backend!.pid as number;
      signalSelectionStarted();
      const [row] = await tx`select public.select_nutrition_alternative(
        ${revisionId}, ${NUTRITION_ITEM_ID}, ${UNAPPROVED_ALTERNATIVE_ID}, ${randomUUID()}
      ) as result`;
      return row!.result as Record<string, unknown>;
    });
    let nextPublish: Promise<Record<string, unknown>> | undefined;
    try {
      await selectionStarted;
      await waitForBlockedBy('select_nutrition_alternative', blockerPid);
      nextPublish = publish(planId, 1, 1, randomUUID());
      await waitForBlockedBy('publish_nutrition_revision', selectionPid);
    } finally {
      unblock();
      await rootTransaction;
      await selection;
      if (nextPublish) await nextPublish;
      await blocker.end();
    }
    const [selectionResult, publishResult] = await Promise.all([
      selection,
      nextPublish!,
    ]);
    expect(['invalid_selection', 'stale_version']).toContain(
      selectionResult.status,
    );
    expect(publishResult).toMatchObject({ status: 'ok', revision_number: 2 });
    expect(selectionPid).toBeGreaterThan(0);
  }, 120_000);

  it('returns one loaded copy for 100 concurrent template-load replays', async () => {
    const [template] = await inSession(
      fixture.trainerA.userId,
      async (tx) =>
        tx`select public.create_nutrition_workspace_template(
        ${fixture.wsA.id}, 'Concurrency source', ${tx.json(document('load'))}, 1, ${randomUUID()}
      ) as result`,
    );
    const templateId = (template!.result as { template_id: string })
      .template_id;
    const planId = await createDraft(
      fixture.trainerA.userId,
      {} as NutritionDocumentV1,
    );
    const key = randomUUID();
    const load = () =>
      inSession(fixture.trainerA.userId, async (tx) => {
        const [row] = await tx`select public.load_nutrition_template_version(
          ${planId}, 'workspace', ${templateId}, 1, ${key}
        ) as result`;
        return row!.result;
      });
    const results = await Promise.all(Array.from({ length: 100 }, load));
    expect(
      results.every(
        (result) => JSON.stringify(result) === JSON.stringify(results[0]),
      ),
    ).toBe(true);
    expect(results[0]).toMatchObject({ loaded: true, draft_version: 2 });
    const [counts] = await db`
      select draft_version::int as draft_version,
        (select count(*)::int from public.audit_events where action='plan.nutrition_template_load' and target_id=${planId}) as audits
      from public.plan_drafts where plan_id=${planId}
    `;
    expect(counts).toEqual({ draft_version: 2, audits: 1 });
  }, 120_000);

  it('creates one assignment batch and no duplicate copies for 100 concurrent retries', async () => {
    const [template] = await inSession(
      fixture.po.userId,
      async (tx) =>
        tx`select public.create_nutrition_global_template(
        ${tx.json(document('assign'))}, 1, ${randomUUID()}
      ) as result`,
    );
    const templateId = (template!.result as { template_id: string })
      .template_id;
    const key = randomUUID();
    const assign = () =>
      inSession(fixture.po.userId, async (tx) => {
        const [row] = await tx`select public.assign_nutrition_templates(
          'specific', ${[templateId]}, null, 'specific', ${[fixture.wsB.id]}, ${key}
        ) as result`;
        return row!.result;
      });
    const results = await Promise.all(Array.from({ length: 100 }, assign));
    expect(
      results.every(
        (result) => JSON.stringify(result) === JSON.stringify(results[0]),
      ),
    ).toBe(true);
    expect(results[0]).toMatchObject({ assigned_count: 1, skipped_count: 0 });
    const batchId = (results[0] as { batch_id: string }).batch_id;
    const [counts] = await db`
      select (select count(*)::int from public.nutrition_template_assignment_batches where id=${batchId}) as batches,
        (select count(*)::int from public.nutrition_template_assignment_items where batch_id=${batchId}) as items,
        (select count(*)::int from public.nutrition_workspace_templates where workspace_id=${fixture.wsB.id} and origin_global_template_id=${templateId}) as copies,
        (select count(*)::int from public.audit_events where action='template.nutrition_assign' and target_id=${batchId}) as audits
    `;
    expect(counts).toEqual({ batches: 1, items: 1, copies: 1, audits: 1 });

    const invalidKey = randomUUID();
    await expect(
      inSession(fixture.po.userId, async (tx) => {
        await tx`select public.assign_nutrition_templates(
          'specific', ${[templateId]}, null, 'specific',
          ${[fixture.wsA.id, randomUUID()]}, ${invalidKey}
        )`;
      }),
    ).rejects.toMatchObject({ code: '22023' });
    const [partial] = await db`
      select
        (select count(*)::int from public.nutrition_workspace_templates
          where workspace_id=${fixture.wsA.id} and origin_global_template_id=${templateId}) as copies,
        (select count(*)::int from public.nutrition_template_assignment_batches
          where created_by=${fixture.po.userId} and workspace_ids @> array[${fixture.wsA.id}::uuid]) as batches
    `;
    expect(partial).toEqual({ copies: 0, batches: 0 });
  }, 120_000);
});
