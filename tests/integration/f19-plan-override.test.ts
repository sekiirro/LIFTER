import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext } from './client-accounts-fixture';
import { graph, sql } from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';

let db: ReturnType<typeof sql>;
let mutationOriginal: { definition: string; hash: string } | undefined;

async function applyOverrideMutation(mode: string) {
  const [row] = await db<{ definition: string; hash: string }[]>`
    select pg_get_functiondef('public.override_activate_subscription(uuid,uuid,uuid,uuid)'::regprocedure) as definition,
      md5(pg_get_functiondef('public.override_activate_subscription(uuid,uuid,uuid,uuid)'::regprocedure)) as hash`;
  if (!row?.definition || !row.hash)
    throw new Error('missing_override_mutation_target');
  mutationOriginal = row;
  const replacements: Record<string, [RegExp, string]> = {
    po_wall: [
      /if actor is null or not app_private\.is_platform_owner\(\) then/i,
      'if actor is null then',
    ],
    replay_before_refusal: [
      /-- A committed exact retry is returned before active-state or Q9 refusal checks\./,
      `if exists (select 1 from public.subscription_activations a
      where a.workspace_id = p_workspace_id and a.subscription_id = requested_target_id) then
    return jsonb_build_object('status', 'not_permitted');
  end if;
  -- A committed exact retry is returned before active-state or Q9 refusal checks.`,
    ],
    no_duplicate_unit: [
      /if not app_private\.f19_client_unit_eligible\(p_workspace_id, client_id, root_id\) then\s*assigned_trainer := null;\s*end if;/,
      '-- mutation removed the client-level eligibility guard',
    ],
  };
  const replacement = replacements[mode];
  if (!replacement) throw new Error('unknown_override_mutation');
  const mutated = row.definition.replace(replacement[0], replacement[1]);
  if (mutated === row.definition)
    throw new Error(`override_mutation_not_applied:${mode}`);
  await db.unsafe(mutated);
  console.log(`F19 T022 mutation applied: ${mode}`);
}

beforeAll(async () => {
  db = sql();
  const mutation = process.env.F19_OVERRIDE_MUTATION;
  if (mutation) await applyOverrideMutation(mutation);
});

afterAll(async () => {
  if (mutationOriginal) {
    try {
      await db.unsafe(mutationOriginal.definition);
      const [restored] = await db<{ hash: string }[]>`
        select md5(pg_get_functiondef('public.override_activate_subscription(uuid,uuid,uuid,uuid)'::regprocedure)) as hash`;
      if (restored?.hash !== mutationOriginal.hash)
        throw new Error('override_mutation_restore_hash_mismatch');
      console.log(`F19 T022 mutation restored and verified: ${restored.hash}`);
    } finally {
      mutationOriginal = undefined;
    }
  }
  await db.end();
});

async function newInitialSubscription() {
  const context = await clientContext();
  const seeded = await db.begin((tx) => graph(tx, context));
  return { context, seeded };
}

async function deliver(
  context: Awaited<ReturnType<typeof clientContext>>,
  kind: 'workout' | 'nutrition',
  clientId: string,
) {
  const created = await context.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: context.wsA.id,
    p_client_id: clientId,
    p_plan_kind: kind,
    p_content: { schemaVersion: 2, document: { title: `T022 ${kind}` } },
    p_operation_key: randomUUID(),
  });
  expect(created.error).toBeNull();
  const published = await context.trainerA.client.rpc(
    'ready_and_publish_plan',
    {
      p_plan_id: created.data,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    },
  );
  expect(published.error).toBeNull();
  expect(published.data).toMatchObject({ status: 'ok' });
}

async function addReturningUnit(
  context: Awaited<ReturnType<typeof clientContext>>,
  clientId: string,
  predecessorId: string,
) {
  const subscriptionId = randomUUID();
  const activationId = randomUUID();
  await db`alter table public.subscriptions disable trigger f12_subscription_insert`;
  await db`alter table public.subscriptions disable trigger f12_subscription_integrity`;
  try {
    await db`insert into public.subscriptions(id,workspace_id,client_id,kind,registration_link_id,package_version_id,
      price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by,predecessor_subscription_id)
      values(${subscriptionId},${context.wsA.id},${clientId},'renewal',null,${context.p.versionId},
        1200,'XTS',17,30,null,${context.po.userId},${predecessorId})`;
  } finally {
    await db`alter table public.subscriptions enable trigger f12_subscription_insert`;
    await db`alter table public.subscriptions enable trigger f12_subscription_integrity`;
  }
  await db`alter table public.subscription_activations disable trigger subscription_activations_source_guard`;
  try {
    await db`insert into public.subscription_activations(id,workspace_id,subscription_id,activated_at,
      delivery_event_id,activation_source)
      values(${activationId},${context.wsA.id},${subscriptionId},'2000-01-01T00:00:00Z',${randomUUID()},'po_override')`;
  } finally {
    await db`alter table public.subscription_activations enable trigger subscription_activations_source_guard`;
  }
  await db`alter table public.productivity_units disable trigger productivity_units_immutable`;
  try {
    await db`insert into public.productivity_units(workspace_id,client_id,subscription_id,activation_id,
      recipient_trainer_user_id) values(${context.wsA.id},${clientId},${subscriptionId},${activationId},${context.trainerA.userId})`;
  } finally {
    await db`alter table public.productivity_units enable trigger productivity_units_immutable`;
  }
}

describe('F19 T022 Platform Owner Override Activate', () => {
  it('activates an initial subscription with no deliveries and replays its exact receipt', async () => {
    const { context, seeded } = await newInitialSubscription();
    const operationKey = randomUUID();
    const selectedTrainer = context.trainerA.userId;

    const first = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: selectedTrainer,
        p_operation_key: operationKey,
      },
    );
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      status: 'ok',
      activation_source: 'po_override',
    });

    const retry = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: selectedTrainer,
        p_operation_key: operationKey,
      },
    );
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);

    const [counts] = await db`
      select
        (select count(*)::int from public.subscription_activations
          where workspace_id=${context.wsA.id} and subscription_id=${seeded.subscription}) as activations,
        (select count(*)::int from public.productivity_units
          where workspace_id=${context.wsA.id} and client_id=${seeded.client}) as units,
        (select count(*)::int from public.plan_deliveries
          where workspace_id=${context.wsA.id} and subscription_id=${seeded.subscription}) as deliveries`;
    expect(counts).toEqual({ activations: 1, units: 1, deliveries: 0 });
  });

  it('does not replay a receipt when its operation key is rebound to another subscription', async () => {
    const { context, seeded } = await newInitialSubscription();
    const otherLink = checked(await issue(context)) as string;
    const other = await db.begin((tx) =>
      graph(tx, context, { linkId: otherLink }),
    );
    const operationKey = randomUUID();
    const first = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: operationKey,
      },
    );
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ status: 'ok' });
    const rebound = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: other.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: operationKey,
      },
    );
    expect(rebound.error).toBeNull();
    expect(rebound.data).toEqual({ status: 'key_conflict' });
    const [counts] = await db`select
      (select count(*)::int from public.subscription_activations
        where workspace_id=${context.wsA.id} and subscription_id in (${seeded.subscription},${other.subscription})) as activations,
      (select count(*)::int from public.productivity_units
        where workspace_id=${context.wsA.id} and client_id=${seeded.client}) as units`;
    expect(counts).toEqual({ activations: 1, units: 1 });
  });

  it('authorizes the Platform Owner before validating caller parameters', async () => {
    const context = await clientContext();
    const result = await context.trainerA.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: null,
        p_subscription_id: null,
        p_recipient_trainer_user_id: null,
        p_operation_key: null,
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: 'not_permitted' });
  });

  it('refuses an already-active target without a receipt and writes nothing', async () => {
    const { context, seeded } = await newInitialSubscription();
    await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,
      delivery_event_id,activation_source)
      values(${context.wsA.id},${seeded.subscription},clock_timestamp(),${randomUUID()},'po_override')`;
    const [before] = await db`select
      (select count(*)::int from public.subscription_activations where subscription_id=${seeded.subscription}) as activations,
      (select count(*)::int from public.productivity_units where client_id=${seeded.client}) as units,
      (select count(*)::int from app_private.f19_override_operations where subscription_id=${seeded.subscription}) as receipts,
      (select count(*)::int from public.plan_deliveries where subscription_id=${seeded.subscription}) as deliveries`;

    const result = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: randomUUID(),
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: 'not_permitted' });
    const [after] = await db`select
      (select count(*)::int from public.subscription_activations where subscription_id=${seeded.subscription}) as activations,
      (select count(*)::int from public.productivity_units where client_id=${seeded.client}) as units,
      (select count(*)::int from app_private.f19_override_operations where subscription_id=${seeded.subscription}) as receipts,
      (select count(*)::int from public.plan_deliveries where subscription_id=${seeded.subscription}) as deliveries`;
    expect(after).toEqual(before);
  });

  it('refuses a refunded and deactivated client without adding Override facts', async () => {
    const { context, seeded } = await newInitialSubscription();
    const refund = await context.po.client.rpc('record_refund', {
      request: {
        workspace_id: context.wsA.id,
        client_id: seeded.client,
        purchase_id: seeded.subscription,
        request_key: randomUUID(),
        amount_minor: '1200',
        external_confirmation: true,
      },
    });
    expect(refund.error).toBeNull();
    expect(refund.data).toMatchObject({ status: 'ok' });
    const [before] = await db`select
      (select count(*)::int from public.subscription_activations where subscription_id=${seeded.subscription}) as activations,
      (select count(*)::int from public.productivity_units where client_id=${seeded.client}) as units,
      (select count(*)::int from app_private.f19_override_operations where subscription_id=${seeded.subscription}) as receipts,
      (select count(*)::int from public.plan_deliveries where subscription_id=${seeded.subscription}) as deliveries`;
    const result = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: randomUUID(),
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: 'not_permitted' });
    const [after] = await db`select
      (select count(*)::int from public.subscription_activations where subscription_id=${seeded.subscription}) as activations,
      (select count(*)::int from public.productivity_units where client_id=${seeded.client}) as units,
      (select count(*)::int from app_private.f19_override_operations where subscription_id=${seeded.subscription}) as receipts,
      (select count(*)::int from public.plan_deliveries where subscription_id=${seeded.subscription}) as deliveries`;
    expect(after).toEqual(before);
  });

  it('does not add a cancellation-fact refusal beyond the refunded entitlement', async () => {
    const { context, seeded } = await newInitialSubscription();
    const cancellationFks =
      await db`select pg_get_constraintdef(oid) as definition
      from pg_constraint where contype='f'
        and conrelid='public.subscription_obligation_cancellations'::regclass`;
    expect(cancellationFks.map((row) => row.definition).join(' ')).toContain(
      'REFERENCES refund_operations',
    );
    const [definition] = await db`select pg_get_functiondef(
      'public.override_activate_subscription(uuid,uuid,uuid,uuid)'::regprocedure) as body`;
    expect(definition!.body).not.toContain(
      'subscription_obligation_cancellations',
    );
    const result = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: randomUUID(),
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ status: 'ok' });
  });

  it('does not add another unit when later deliveries follow an Override', async () => {
    const { context, seeded } = await newInitialSubscription();
    await deliver(context, 'workout', seeded.client);
    const operationKey = randomUUID();
    const result = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: operationKey,
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ status: 'ok' });
    await deliver(context, 'nutrition', seeded.client);
    await deliver(context, 'workout', seeded.client);
    const [counts] = await db`select
      (select count(*)::int from public.subscription_activations where subscription_id=${seeded.subscription}) as activations,
      (select count(*)::int from public.productivity_units where client_id=${seeded.client}) as units,
      (select count(*)::int from public.plan_deliveries where subscription_id=${seeded.subscription}) as deliveries`;
    expect(counts).toEqual({ activations: 1, units: 1, deliveries: 3 });
  });

  it('does not award a second unit to a returning client who already has one', async () => {
    const { context, seeded } = await newInitialSubscription();
    await addReturningUnit(context, seeded.client, seeded.subscription);
    const result = await context.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: context.wsA.id,
        p_subscription_id: seeded.subscription,
        p_recipient_trainer_user_id: context.trainerA.userId,
        p_operation_key: randomUUID(),
      },
    );
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ status: 'ok' });
    const [counts] = await db`select
      (select count(*)::int from public.subscription_activations where workspace_id=${context.wsA.id}
        and subscription_id=${seeded.subscription}) as target_activations,
      (select count(*)::int from public.productivity_units where workspace_id=${context.wsA.id}
        and client_id=${seeded.client}) as units`;
    expect(counts).toEqual({ target_activations: 1, units: 1 });
  });
});
