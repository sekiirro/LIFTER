import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { readyAndPublishPlan } from '../../lib/plans/ready-and-publish';
import { probe } from './registration-approval-fixture';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T020/T022 (FR-009, SC-007, S57-PO-10): the F19 delivery hook writes exactly one
// client notice per first-plan delivery through the F22 seam, and the delivery that
// activates the subscription states activation too. Synthetic data only.
let p: PortalFixture;
beforeAll(async () => {
  p = await portalFixture();
});
afterAll(async () => p?.close());

function request(planId: string, operationKey = randomUUID()) {
  return {
    planId,
    expectedDraftVersion: 1,
    expectedPublishedRevision: 0,
    operationKey,
  };
}
async function deliver(planId: string, operationKey = randomUUID()) {
  const result = await readyAndPublishPlan(
    p.fixture.trainerA.client,
    request(planId, operationKey),
    p.planKind(planId),
  );
  expect(result).toMatchObject({ status: 'ok' });
  return result;
}
async function notices(client: PortalClient) {
  return p.db`select n.notice_kind, n.source_key, d.plan_kind, d.id as delivery_id
    from app_private.client_inbox_notices n
    left join public.plan_deliveries d
      on d.workspace_id = n.workspace_id and d.id = n.source_key
    where n.workspace_id=${p.fixture.wsA.id} and n.client_id=${client.clientId}
    order by n.created_at, n.id`;
}
async function pair(label: string, first: 'workout' | 'nutrition') {
  const client = await p.makeClient({ activate: false, label });
  const second = first === 'workout' ? 'nutrition' : 'workout';
  const a = await p.createDraft(client.clientId, first, `${label} a`);
  await deliver(a);
  const b = await p.createDraft(client.clientId, second, `${label} b`);
  await deliver(b);
  return { client, a, b };
}

describe('F22 first-plan delivery notices (T022)', () => {
  it('writes exactly two notices for a workout-then-nutrition pair, the completing one stating activation', async () => {
    const { client } = await pair('notice wn', 'workout');
    const rows = await notices(client);
    expect(rows.map((r) => r.notice_kind)).toEqual([
      'workout_delivered',
      'nutrition_delivered_activated',
    ]);
    // source_key is the delivery id of that kind's delivery (same workspace and client).
    expect(rows.map((r) => r.plan_kind)).toEqual(['workout', 'nutrition']);
    expect(rows.every((r) => r.source_key === r.delivery_id)).toBe(true);
  });

  it('writes the mirrored kinds for a nutrition-then-workout pair', async () => {
    const { client } = await pair('notice nw', 'nutrition');
    expect((await notices(client)).map((r) => r.notice_kind)).toEqual([
      'nutrition_delivered',
      'workout_delivered_activated',
    ]);
  });

  it('adds no notice for a replay or a later revision of a delivered first plan', async () => {
    const client = await p.makeClient({
      activate: false,
      label: 'notice more',
    });
    const workout = await p.createDraft(client.clientId, 'workout', 'nm w');
    const key = randomUUID();
    await deliver(workout, key);
    await deliver(workout, key); // same operation key: authorized replay
    const nutrition = await p.createDraft(client.clientId, 'nutrition', 'nm n');
    await deliver(nutrition);
    expect(await notices(client)).toHaveLength(2);
    const draftVersion = await p.revise(workout, 1, 'nm w2');
    expect(
      await readyAndPublishPlan(
        p.fixture.trainerA.client,
        {
          planId: workout,
          expectedDraftVersion: draftVersion,
          expectedPublishedRevision: 1,
          operationKey: randomUUID(),
        },
        'workout',
      ),
    ).toMatchObject({ status: 'ok' });
    expect(await notices(client)).toHaveLength(2);
  });

  it('after a PO override activation, each first delivery gets a plain delivered notice', async () => {
    const client = await p.makeClient({ activate: false, label: 'notice ovr' });
    const overridden = await p.fixture.po.client.rpc(
      'override_activate_subscription',
      {
        p_workspace_id: p.fixture.wsA.id,
        p_subscription_id: client.subscriptionId,
        p_recipient_trainer_user_id: p.fixture.trainerA.userId,
        p_operation_key: randomUUID(),
      },
    );
    expect(overridden.error).toBeNull();
    for (const kind of ['workout', 'nutrition'] as const)
      await deliver(await p.createDraft(client.clientId, kind, `ovr ${kind}`));
    expect((await notices(client)).map((r) => r.notice_kind)).toEqual([
      'workout_delivered',
      'nutrition_delivered',
    ]);
  });

  it('keeps notices client-scoped: another client and workspace see none of them, and the owner reads both', async () => {
    const { client } = await pair('notice own', 'workout');
    const stranger = await p.makeClient({
      activate: true,
      label: 'notice stranger',
    });
    const read = async (user: string) =>
      p.db.begin((tx) =>
        asUser(tx, user, async (inner) => {
          const [row] =
            await inner`select public.read_client_notices(50, null) as v`;
          return row!.v as {
            status: string;
            notices: Array<{ notice_kind: string }>;
          };
        }),
      );
    const own = await read(client.authUserId);
    expect(own.notices.map((n) => n.notice_kind).sort()).toEqual([
      'nutrition_delivered_activated',
      'workout_delivered',
    ]);
    expect((await read(stranger.authUserId)).notices).toEqual([]);
    const [foreign] = await p.db`select count(*)::int as count
      from app_private.client_inbox_notices
      where workspace_id=${p.fixture.wsB.id} and client_id=${client.clientId}`;
    expect(foreign!.count).toBe(0);
  });

  it('mutation kills: no hook, a wrong kind or an inert first-plan test each fail the notice contract', async () => {
    const signature =
      'app_private.ready_and_publish_plan_impl(uuid,bigint,bigint,uuid)';
    const mutated = async (
      from: string,
      to: string,
      body: (tx: TransactionSql) => Promise<void>,
    ) =>
      probe(async (tx) => {
        const [d] =
          await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
        const def = d!.def as string;
        expect(def.split(from).length - 1, from).toBe(1);
        await tx.unsafe(def.replace(from, to));
        await body(tx);
      });
    const client = await p.makeClient({ activate: false, label: 'notice mut' });
    const workout = await p.createDraft(client.clientId, 'workout', 'mut w');
    const publishAsTrainer = (tx: TransactionSql) =>
      asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        await inner`select public.ready_and_publish_plan(${workout}::uuid, 1, 0, ${randomUUID()}::uuid)`;
      });
    const count = async (tx: TransactionSql) => {
      const [r] = await tx`select count(*)::int as c,
        count(*) filter (where notice_kind = 'workout_delivered')::int as plain
        from app_private.client_inbox_notices where client_id=${client.clientId}`;
      return r!;
    };
    // Control: unmutated, the delivery writes its notice.
    await probe(async (tx) => {
      await publishAsTrainer(tx);
      expect(await count(tx)).toEqual({ c: 1, plain: 1 });
    });
    await mutated('if first_of_kind then', 'if false then', async (tx) => {
      await publishAsTrainer(tx);
      expect((await count(tx)).c).toBe(0);
    });
    await mutated(
      "then '_delivered_activated' else '_delivered' end",
      "then '_delivered' else '_delivered_activated' end",
      async (tx) => {
        await publishAsTrainer(tx);
        expect((await count(tx)).plain).toBe(0);
      },
    );
    await mutated(
      "first_of_kind := target_kind = 'initial' and not exists",
      'first_of_kind := false and not exists',
      async (tx) => {
        await publishAsTrainer(tx);
        expect((await count(tx)).c).toBe(0);
      },
    );
  });
});
