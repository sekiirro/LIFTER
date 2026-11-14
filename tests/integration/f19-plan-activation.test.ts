import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, sql, graph } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let db: ReturnType<typeof sql>;

beforeAll(async () => {
  db = sql();
});
afterAll(async () => db?.end());

async function newInitialSubscription() {
  const context = await clientContext();
  const seeded = await db.begin((tx) => graph(tx, context));
  return { context, seeded };
}

async function deliver(
  client: Context['trainerA']['client'] | Context['po']['client'],
  workspaceId: string,
  clientId: string,
  kind: 'workout' | 'nutrition',
  operationKey = randomUUID(),
) {
  const created = await client.rpc('create_plan_draft', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_plan_kind: kind,
    p_content: { schemaVersion: 2, document: { title: `T021 ${kind}` } },
    p_operation_key: randomUUID(),
  });
  if (created.error || typeof created.data !== 'string')
    throw new Error(
      `Plan draft failed: ${created.error?.code ?? 'missing id'}`,
    );
  return client.rpc('ready_and_publish_plan', {
    p_plan_id: created.data,
    p_expected_draft_version: 1,
    p_expected_published_version: 0,
    p_operation_key: operationKey,
  });
}

async function counts(
  workspaceId: string,
  clientId: string,
  subscriptionId: string,
) {
  const [row] = await db`
    select
      (select count(*)::int from public.plan_deliveries
        where workspace_id=${workspaceId} and client_id=${clientId} and subscription_id=${subscriptionId}) as deliveries,
      (select count(*)::int from public.subscription_activations
        where workspace_id=${workspaceId} and subscription_id=${subscriptionId}) as activations,
      (select count(*)::int from public.productivity_units
        where workspace_id=${workspaceId} and client_id=${clientId}) as units`;
  return row!;
}

async function addReturningHistory(
  context: Context,
  clientId: string,
  source: 'renewal' | 'po_override',
  addUnit: boolean,
) {
  const priorSubscriptionId = randomUUID();
  const priorActivationId = randomUUID();
  await db`alter table public.subscriptions disable trigger f12_subscription_insert`;
  await db`alter table public.subscriptions disable trigger f12_subscription_integrity`;
  try {
    await db`insert into public.subscriptions(id,workspace_id,client_id,kind,registration_link_id,package_version_id,
      price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by,predecessor_subscription_id)
      values(${priorSubscriptionId},${context.wsA.id},${clientId},'renewal',null,${context.p.versionId},
        1200,'XTS',17,30,null,${context.po.userId},
        (select id from public.subscriptions where workspace_id=${context.wsA.id} and client_id=${clientId} and kind='initial'))`;
  } finally {
    await db`alter table public.subscriptions enable trigger f12_subscription_insert`;
    await db`alter table public.subscriptions enable trigger f12_subscription_integrity`;
  }
  await db`alter table public.subscription_activations disable trigger subscription_activations_source_guard`;
  try {
    await db`insert into public.subscription_activations(id,workspace_id,subscription_id,activated_at,
      delivery_event_id,activation_source)
      values(${priorActivationId},${context.wsA.id},${priorSubscriptionId},'2000-01-01T00:00:00Z',${randomUUID()},${source})`;
  } finally {
    await db`alter table public.subscription_activations enable trigger subscription_activations_source_guard`;
  }
  if (addUnit) {
    await db`alter table public.productivity_units disable trigger productivity_units_immutable`;
    await db`insert into public.productivity_units(workspace_id,client_id,subscription_id,activation_id,
      recipient_trainer_user_id)
      values(${context.wsA.id},${clientId},${priorSubscriptionId},${priorActivationId},${context.trainerA.userId})`;
    await db`alter table public.productivity_units enable trigger productivity_units_immutable`;
  }
  return { priorSubscriptionId, priorActivationId };
}

describe('F19 T021 automatic initial activation', () => {
  it('installs typed activation sources and an immutable client-level unit', async () => {
    const [catalog] = await db`
      select
        exists(select 1 from information_schema.columns where table_schema='public'
          and table_name='subscription_activations' and column_name='activation_source') as source,
        to_regclass('public.productivity_units') as units,
        to_regprocedure('app_private.current_assigned_trainer(uuid,uuid)')::text as assignment_resolver`;
    expect(catalog).toEqual({
      source: true,
      units: 'productivity_units',
      assignment_resolver: 'app_private.current_assigned_trainer(uuid,uuid)',
    });
  });

  it('keeps either first delivery order durable, then commits exactly one activation and unit atomically', async () => {
    const { context, seeded } = await newInitialSubscription();
    const first = await deliver(
      context.trainerA.client,
      context.wsA.id,
      seeded.client,
      'nutrition',
    );
    expect(first.data).toMatchObject({ status: 'ok' });
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toEqual({
      deliveries: 1,
      activations: 0,
      units: 0,
    });

    const completingKey = randomUUID();
    const completed = await deliver(
      context.trainerA.client,
      context.wsA.id,
      seeded.client,
      'workout',
      completingKey,
    );
    expect(completed.data).toMatchObject({ status: 'ok' });
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toEqual({
      deliveries: 2,
      activations: 1,
      units: 1,
    });
    const [activation] = await db`
      select a.activation_source, a.delivery_event_id, a.workout_delivery_id,
        a.nutrition_delivery_id, u.subscription_id, u.activation_id,
        u.recipient_trainer_user_id, u.unit_count
      from public.subscription_activations a
      join public.productivity_units u on u.workspace_id=a.workspace_id and u.activation_id=a.id
      where a.workspace_id=${context.wsA.id} and a.subscription_id=${seeded.subscription}`;
    const [workout] = await db`select id from public.plan_deliveries
      where workspace_id=${context.wsA.id} and subscription_id=${seeded.subscription} and plan_kind='workout'`;
    const [nutrition] = await db`select id from public.plan_deliveries
      where workspace_id=${context.wsA.id} and subscription_id=${seeded.subscription} and plan_kind='nutrition'`;
    expect(activation).toMatchObject({
      activation_source: 'plan_deliveries',
      workout_delivery_id: workout!.id,
      nutrition_delivery_id: nutrition!.id,
      subscription_id: seeded.subscription,
      recipient_trainer_user_id: context.trainerA.userId,
      unit_count: 1,
    });
    expect(activation!.delivery_event_id).toBe(completingKey);
    await expect(db`update public.productivity_units set unit_count=2
      where workspace_id=${context.wsA.id} and client_id=${seeded.client}`).rejects.toThrow(
      /productivity_unit_immutable/,
    );
    await expect(db`delete from public.productivity_units
      where workspace_id=${context.wsA.id} and client_id=${seeded.client}`).rejects.toThrow(
      /productivity_unit_immutable/,
    );
    let uniquenessError = '';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,
          delivery_event_id,activation_source,workout_delivery_id,nutrition_delivery_id)
          values(${context.wsA.id},${seeded.subscription},clock_timestamp(),${completingKey},'plan_deliveries',
            ${workout!.id},${nutrition!.id})`;
        throw new Error('activation_uniqueness_probe_inserted');
      });
    } catch (error) {
      uniquenessError = String(error);
    }
    expect(uniquenessError).toMatch(/duplicate key|unique constraint/);
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toMatchObject({ activations: 1, units: 1 });
  });

  it('serializes opposite-order concurrent first deliveries into one activation and unit', async () => {
    const { context, seeded } = await newInitialSubscription();
    const results = await Promise.all([
      deliver(
        context.trainerA.client,
        context.wsA.id,
        seeded.client,
        'workout',
      ),
      deliver(
        context.trainerA.client,
        context.wsA.id,
        seeded.client,
        'nutrition',
      ),
    ]);
    expect(
      results.every(
        (result) => result.error === null && result.data?.status === 'ok',
      ),
    ).toBe(true);
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toEqual({
      deliveries: 2,
      activations: 1,
      units: 1,
    });
  });

  it('replays the completing delivery exactly and does not reactivate on later publication', async () => {
    const { context, seeded } = await newInitialSubscription();
    await deliver(
      context.trainerA.client,
      context.wsA.id,
      seeded.client,
      'workout',
    );
    const key = randomUUID();
    const created = await context.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: context.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: { schemaVersion: 2, document: { title: 'T021 replay' } },
      p_operation_key: randomUUID(),
    });
    const planId = created.data as string;
    const publish = () =>
      context.trainerA.client.rpc('ready_and_publish_plan', {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: key,
      });
    const completed = await publish();
    const replay = await publish();
    expect(replay.data).toEqual(completed.data);
    await deliver(
      context.trainerA.client,
      context.wsA.id,
      seeded.client,
      'workout',
    );
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toEqual({
      deliveries: 3,
      activations: 1,
      units: 1,
    });
  });

  it('activates returning clients without a unit and never duplicates a client unit', async () => {
    const { context: returningContext, seeded: returning } =
      await newInitialSubscription();
    const prior = await addReturningHistory(
      returningContext,
      returning.client,
      'renewal',
      false,
    );
    await deliver(
      returningContext.trainerA.client,
      returningContext.wsA.id,
      returning.client,
      'workout',
    );
    await deliver(
      returningContext.trainerA.client,
      returningContext.wsA.id,
      returning.client,
      'nutrition',
    );
    expect(
      await counts(
        returningContext.wsA.id,
        returning.client,
        returning.subscription,
      ),
    ).toEqual({
      deliveries: 2,
      activations: 1,
      units: 0,
    });
    expect(
      await db`select activation_source,activated_at,delivery_event_id from public.subscription_activations
      where workspace_id=${returningContext.wsA.id} and id=${prior.priorActivationId}`,
    ).toHaveLength(1);

    const { context: existingContext, seeded: existing } =
      await newInitialSubscription();
    await addReturningHistory(
      existingContext,
      existing.client,
      'po_override',
      true,
    );
    await deliver(
      existingContext.trainerA.client,
      existingContext.wsA.id,
      existing.client,
      'workout',
    );
    await deliver(
      existingContext.trainerA.client,
      existingContext.wsA.id,
      existing.client,
      'nutrition',
    );
    expect(
      await db`select count(*)::int as count from public.productivity_units
      where workspace_id=${existingContext.wsA.id} and client_id=${existing.client}`,
    ).toEqual([{ count: 1 }]);
  });

  it('refuses an unassigned non-Trainer completion without committing delivery, activation, unit, or receipt', async () => {
    const { context, seeded } = await newInitialSubscription();
    await deliver(
      context.trainerA.client,
      context.wsA.id,
      seeded.client,
      'workout',
    );
    const operationKey = randomUUID();
    const denied = await deliver(
      context.po.client,
      context.wsA.id,
      seeded.client,
      'nutrition',
      operationKey,
    );
    expect(denied.data).toMatchObject({ status: 'not_permitted' });
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toEqual({
      deliveries: 1,
      activations: 0,
      units: 0,
    });
    const [receipt] =
      await db`select count(*)::int as count from app_private.plan_delivery_operations
      where workspace_id=${context.wsA.id} and actor_user_id=${context.po.userId} and operation_key=${operationKey}`;
    expect(receipt!.count).toBe(0);
  });

  it('rolls back the completing delivery, activation, unit, receipt, and audit together on an audit failure', async () => {
    const { context, seeded } = await newInitialSubscription();
    await deliver(
      context.trainerA.client,
      context.wsA.id,
      seeded.client,
      'workout',
    );
    await db`create function app_private.test_fail_f19_activation_audit() returns trigger
      language plpgsql set search_path='' as $$begin
        if new.action='subscription.activation_committed' then
          raise exception 'synthetic_activation_audit_failure' using errcode='23514';
        end if;
        return new;
      end $$`;
    await db`create trigger test_fail_f19_activation_audit before insert on public.audit_events
      for each row execute function app_private.test_fail_f19_activation_audit()`;
    try {
      const failed = await deliver(
        context.trainerA.client,
        context.wsA.id,
        seeded.client,
        'nutrition',
      );
      expect(failed.error?.message).toContain(
        'synthetic_activation_audit_failure',
      );
    } finally {
      await db`drop trigger test_fail_f19_activation_audit on public.audit_events`;
      await db`drop function app_private.test_fail_f19_activation_audit()`;
    }
    expect(
      await counts(context.wsA.id, seeded.client, seeded.subscription),
    ).toEqual({
      deliveries: 1,
      activations: 0,
      units: 0,
    });
    const [operations] =
      await db`select count(*)::int as count from app_private.plan_delivery_operations
      where workspace_id=${context.wsA.id} and plan_id in (
        select id from public.plan_roots where workspace_id=${context.wsA.id} and client_id=${seeded.client}
      )`;
    expect(operations!.count).toBe(1);
  });

  it('rejects a new renewal-source activation write while retaining a legacy renewal fixture', async () => {
    const { context, seeded } = await newInitialSubscription();
    const legacy = await addReturningHistory(
      context,
      seeded.client,
      'renewal',
      false,
    );
    const [before] =
      await db`select activation_source, activated_at, delivery_event_id
      from public.subscription_activations where workspace_id=${context.wsA.id} and id=${legacy.priorActivationId}`;
    let sourceError = '';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,
          delivery_event_id,activation_source)
          values(${context.wsA.id},${seeded.subscription},clock_timestamp(),${randomUUID()},'renewal')`;
        throw new Error('activation_source_probe_inserted');
      });
    } catch (error) {
      sourceError = String(error);
    }
    expect(sourceError).toContain('invalid_activation_source');
    const [after] =
      await db`select activation_source, activated_at, delivery_event_id
      from public.subscription_activations where workspace_id=${context.wsA.id} and id=${legacy.priorActivationId}`;
    expect(after).toEqual(before);
  });

  it('authorizes before validating publish parameters', async () => {
    const { context, seeded } = await newInitialSubscription();
    const created = await context.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: context.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: { schemaVersion: 2, document: {} },
      p_operation_key: randomUUID(),
    });
    const denied = await context.salesA.client.rpc('ready_and_publish_plan', {
      p_plan_id: created.data,
      p_expected_draft_version: -1,
      p_expected_published_version: -1,
      p_operation_key: null,
    });
    expect(denied.data).toMatchObject({ status: 'not_permitted' });
  });
});
