import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 DB-level mutation evidence (T015, T026 read gate, T033/T038, T020).
// Each test kills one database control inside a transaction that is always
// rolled back, shows the negative assertion fails under the mutant, and then
// proves the installed definition still contains the control.
let p: PortalFixture;
let awaiting: PortalClient;
let owner: PortalClient;
let other: PortalClient;
let otherNotice: string;
let awaitingNutrition: string;
let ownerNutrition: string;
let otherWorkout: string;
let pendingClient: PortalClient;
let closedClient: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  awaiting = await p.makeClient({ activate: false, label: 'kill awaiting' });
  owner = await p.makeClient({ activate: true, label: 'kill owner' });
  other = await p.makeClient({ activate: true, label: 'kill other' });
  const plan = await p.createDraft(awaiting.clientId, 'workout', 'F22 kill');
  await p.publish(plan, 1, 0);
  awaitingNutrition = await p.createDraft(
    awaiting.clientId,
    'nutrition',
    'F22 kill n',
  );
  await p.publish(awaitingNutrition, 1, 0);
  ownerNutrition = await p.createDraft(
    owner.clientId,
    'nutrition',
    'F22 own n',
  );
  await p.publish(ownerNutrition, 1, 0);
  const [ownerRevision] = await p.db`select id from public.plan_revisions
    where plan_id=${ownerNutrition} and revision_number=1`;
  // A row for ANOTHER client on the owner's revision: only the client filter
  // keeps it out of the owner's read.
  await p.db.begin(async (tx) => {
    await tx`set local app.nutrition_selection_write = 'on'`;
    await tx`insert into public.client_nutrition_alternative_selections(
      workspace_id, plan_id, plan_version_id, client_id, item_id, alternative_id, created_by)
      values(${p.fixture.wsA.id}, ${ownerNutrition}, ${ownerRevision!.id}, ${other.clientId},
        'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', ${p.fixture.trainerA.userId})`;
  });
  // A second active client with a delivered plan: the leak target for K5/K8.
  otherWorkout = await p.createDraft(
    other.clientId,
    'workout',
    'F22 kill other',
  );
  await p.publish(otherWorkout, 1, 0);
  // Active-subscription clients that are not approved / are deactivated (K9).
  pendingClient = await p.makeClient({ activate: true, label: 'kill pending' });
  closedClient = await p.makeClient({ activate: true, label: 'kill closed' });
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update public.clients set approval_state='pending-approval' where id=${pendingClient.clientId}`;
    await tx`update public.clients set deactivated_at=clock_timestamp(), deactivation_reason='closure' where id=${closedClient.clientId}`;
  });
  const [row] = await p.db`select app_private.f22_enqueue_client_notice(
    ${p.fixture.wsA.id}::uuid, ${other.clientId}::uuid, 'workout_delivered',
    ${randomUUID()}::uuid) as id`;
  otherNotice = row!.id as string;
});
afterAll(async () => p?.close());

const rollback = new Error('rollback F22 mutation');

/** Install a mutated definition, run `probe` as `userId`, always roll back. */
async function underMutant(
  signature: string,
  control: string,
  replacement: string,
  userId: string,
  probe: (tx: TransactionSql) => Promise<unknown>,
  // Further simultaneous mutations (regex or text) for controls that are
  // defense in depth behind another independent control.
  extra: Array<[string | RegExp, string]> = [],
): Promise<unknown> {
  let observed: unknown = 'not-reached';
  try {
    await p.db.begin(async (tx) => {
      const [row] =
        await tx`select pg_get_functiondef(${signature}::regprocedure) as definition`;
      const definition = row!.definition as string;
      let mutated = definition.replace(control, replacement);
      expect(mutated, `${signature} control present`).not.toBe(definition);
      for (const [pattern, text] of extra) {
        const next = mutated.replace(pattern, text);
        expect(next, `${signature} extra control present`).not.toBe(mutated);
        mutated = next;
      }
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      observed = await probe(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return observed;
}

async function stillInstalled(signature: string, control: string) {
  const [row] =
    await p.db`select pg_get_functiondef(${signature}::regprocedure) as body`;
  expect(row!.body as string).toContain(control);
}

describe('F22 database control kill tests', () => {
  it('K1 portal entitlement gate: skipping the F13 active check leaks plans to an awaiting client', async () => {
    const signature = 'public.client_portal_overview()';
    const control = "if summary->>'status' is distinct from 'active' then";
    const observed = (await underMutant(
      signature,
      control,
      'if false then',
      awaiting.authUserId,
      async (tx) => {
        const [row] = await tx`select public.client_portal_overview() as value`;
        return row!.value;
      },
    )) as { status: string };
    // The real control returns `restricted` (client-portal-access.test.ts).
    expect(observed.status).toBe('ok');
    await stillInstalled(signature, control);
  });

  it('K2 directory workspace wall: dropping has_workspace_access lets a foreign trainer list clients', async () => {
    const signature =
      'public.staff_client_directory(uuid,text,text,text,integer,integer)';
    const control =
      "or not app_private.has_workspace_access(p_workspace_id, 'coaching_work')";
    const observed = (await underMutant(
      signature,
      control,
      'or false',
      p.fixture.trainerB.userId,
      async (tx) => {
        const [row] = await tx`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as value`;
        return row!.value;
      },
    )) as { status: string; clients: Array<{ client_id: string }> };
    // The real control raises 42501 (client-portal-isolation.test.ts).
    expect(observed.status).toBe('ok');
    expect(observed.clients.map((c) => c.client_id)).toContain(owner.clientId);
    await stillInstalled(signature, control);
  });

  it('K3 notice read scope: dropping the own-client filter shows another client’s notice', async () => {
    const signature =
      'public.read_client_notices(integer,timestamp with time zone)';
    const control = 'and n.client_id = client_row.client_id';
    const observed = (await underMutant(
      signature,
      control,
      '',
      owner.authUserId,
      async (tx) => {
        const [row] =
          await tx`select public.read_client_notices(100, null) as value`;
        return row!.value;
      },
    )) as { notices: Array<{ notice_id: string }> };
    expect(observed.notices.map((n) => n.notice_id)).toContain(otherNotice);
    await stillInstalled(signature, control);
  });

  it('K4 mark-read scope: dropping the own-client filter lets a client mark another client’s notice', async () => {
    const signature = 'public.mark_client_notice_read(uuid)';
    const control = 'and n.client_id = client_row.client_id';
    const observed = await underMutant(
      signature,
      control,
      '',
      owner.authUserId,
      async (tx) => {
        const [row] =
          await tx`select public.mark_client_notice_read(${otherNotice}::uuid) as value`;
        return row!.value;
      },
    );
    // The real control returns not_found (client-portal-notices.test.ts).
    expect(observed).toEqual({ status: 'read' });
    await stillInstalled(signature, control);
    const [after] =
      await p.db`select read_at from app_private.client_inbox_notices where id=${otherNotice}`;
    expect(after!.read_at).toBeNull();
  });

  it('K6 nutrition read entitlement gate: skipping the F13 active check leaks F18 content to an awaiting client', async () => {
    const signature = 'public.client_portal_nutrition_plan(uuid,integer)';
    const control = "if summary->>'status' is distinct from 'active' then";
    const observed = (await underMutant(
      signature,
      control,
      'if false then',
      awaiting.authUserId,
      async (tx) => {
        const [row] = await tx`select public.client_portal_nutrition_plan(
          ${awaitingNutrition}::uuid, null::integer) as value`;
        return row!.value;
      },
    )) as { status: string };
    // The real control returns `restricted` (client-nutrition-plan.test.ts).
    expect(observed.status).toBe('ok');
    await stillInstalled(signature, control);
  });

  it('K7 nutrition selection scope: dropping the own-client filter returns another client’s selection', async () => {
    const signature = 'public.client_portal_nutrition_plan(uuid,integer)';
    const control = 'and s.client_id = client_row.client_id';
    const observed = (await underMutant(
      signature,
      control,
      '',
      owner.authUserId,
      async (tx) => {
        const [row] = await tx`select public.client_portal_nutrition_plan(
          ${ownerNutrition}::uuid, null::integer) as value`;
        return row!.value;
      },
    )) as { selections: Array<{ item_id: string }> };
    expect(observed.selections.map((x) => x.item_id)).toContain(
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    );
    await stillInstalled(signature, control);
    // The installed control keeps the owner's read free of it.
    const [real] = await p.db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: owner.authUserId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      return tx`select public.client_portal_nutrition_plan(
        ${ownerNutrition}::uuid, null::integer) as value`;
    });
    expect((real!.value as { selections: unknown[] }).selections).toEqual([]);
  });

  // K5/K8: the per-client delivery filter is defense in depth. The F19 FK
  // (workspace, subscription, client) binds a subscription to its client, so
  // the subscription-resolution predicate also isolates. Each test shows the
  // client filter alone is masked (no leak), then kills BOTH independent
  // controls and shows the leak, then checks the installed definition.
  const subscriptionPredicate =
    /and app_private\.f19_resolve_subscription_id\(d\.workspace_id, d\.subscription_id\)\s*=\s*(?:p_subscription_id|\(summary->>'subscription_id'\)::uuid)/;

  it('K5 delivered-revision client filter: with the subscription binding also killed, a client reads another client’s plan', async () => {
    const signature =
      'app_private.f22_delivered_revisions(uuid,uuid,uuid,uuid)';
    const control = 'd.client_id = p_client_id';
    const probe = async (tx: TransactionSql) => {
      const [row] =
        await tx`select public.client_portal_plan(${otherWorkout}::uuid, null::integer) as value`;
      return row!.value;
    };
    const single = (await underMutant(
      signature,
      control,
      'true',
      owner.authUserId,
      probe,
    )) as { status: string };
    expect(single.status).toBe('not_found');
    const both = (await underMutant(
      signature,
      control,
      'true',
      owner.authUserId,
      probe,
      [[subscriptionPredicate, '']],
    )) as { status: string };
    // The real controls return not_found (client-portal-access.test.ts).
    expect(both.status).toBe('ok');
    await stillInstalled(signature, control);
  });

  it('K8 overview client filter: with the subscription binding also killed, the overview lists another client’s plans', async () => {
    const signature = 'public.client_portal_overview()';
    const control = 'd.client_id = client_row.client_id';
    const probe = async (tx: TransactionSql) => {
      const [row] = await tx`select public.client_portal_overview() as value`;
      return row!.value;
    };
    const ids = (value: unknown) =>
      ((value as { plans: Array<{ plan_id: string }> }).plans ?? []).map(
        (x) => x.plan_id,
      );
    expect(
      ids(
        await underMutant(signature, control, 'true', owner.authUserId, probe),
      ),
    ).not.toContain(otherWorkout);
    expect(
      ids(
        await underMutant(signature, control, 'true', owner.authUserId, probe, [
          [subscriptionPredicate, ''],
        ]),
      ),
    ).toContain(otherWorkout);
    await stillInstalled(signature, control);
  });

  it('K9 portal client wall: dropping the approved or not-deactivated condition lets an unapproved or closed client in', async () => {
    const signature = 'app_private.f22_portal_client()';
    const probe = async (tx: TransactionSql) => {
      const [row] = await tx`select public.client_portal_overview() as value`;
      return row!.value;
    };
    for (const [control, client] of [
      ["and c.approval_state = 'approved'", pendingClient],
      ['and c.deactivated_at is null', closedClient],
    ] as const) {
      // The real wall answers invalid for both (client-portal-isolation).
      const real = await p.db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.authUserId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        return probe(tx);
      });
      expect(real).toEqual({ status: 'invalid' });
      const observed = (await underMutant(
        signature,
        control,
        'and true',
        client.authUserId,
        probe,
      )) as { status: string };
      expect(observed.status, control).not.toBe('invalid');
      await stillInstalled(signature, control);
    }
  });
});
