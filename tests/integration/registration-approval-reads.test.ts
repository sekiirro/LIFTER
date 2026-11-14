import { afterAll, beforeAll, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bought,
  clientContext,
  sql,
  type Context,
  type Purchase,
} from './registration-approval-payment-fixture';
import { probe } from './registration-approval-fixture';

const db = sql();
let f: Context;
let p: Purchase;
beforeAll(async () => {
  f = await clientContext();
  p = await bought(f);
});
afterAll(() => db.end());

it('T023 exposes only narrow, owned, search-path-pinned RPC readers', async () => {
  const expected = [
    'registration_approval_queue(uuid,uuid,integer)',
    'registration_approval_review(uuid,uuid)',
    'registration_approval_correction(uuid,uuid)',
    'workspace_payment_queue(uuid,uuid,integer)',
    'subscription_payment_status(uuid,uuid,uuid)',
    'subscription_commission(uuid,uuid)',
  ];
  for (const signature of expected) {
    const [row] =
      await db`select prosecdef,proconfig,pg_get_userbyid(proowner) as owner,
      has_function_privilege('public',oid,'EXECUTE') as public_exec,
      has_function_privilege('anon',oid,'EXECUTE') as anon_exec,
      has_function_privilege('authenticated',oid,'EXECUTE') as auth_exec,
      has_function_privilege('service_role',oid,'EXECUTE') as service_exec
      from pg_proc where oid=to_regprocedure(${`public.${signature}`})`;
    expect(row).toEqual({
      prosecdef: true,
      proconfig: ['search_path=""'],
      owner: 'postgres',
      public_exec: false,
      anon_exec: false,
      auth_exec: true,
      service_exec: false,
    });
  }
});

it('T035 exposes a PO-only column-limited correction projection for the initial subscription', async () => {
  const result = await f.actors.po.client.rpc(
    'registration_approval_correction',
    { workspace_id: f.wsA.id, client_id: p.t.id },
  );
  expect(result.error).toBeNull();
  expect(result.data).toEqual({
    status: 'ok',
    subscription_id: p.sid,
    corrections: {
      '1': {
        obligation_id: expect.any(String),
        revision: expect.any(Number),
        tail_event_id: expect.any(String),
      },
    },
  });
  expect(JSON.stringify(result.data)).not.toMatch(
    /email|name|amount|currency|commission|recorded_by|kind/i,
  );
  for (const [name, actor] of Object.entries(f.actors)) {
    if (name === 'po' || name === 'anon' || !actor.client) continue;
    const denied = await actor.client.rpc('registration_approval_correction', {
      workspace_id: f.wsA.id,
      client_id: p.t.id,
    });
    expect(denied.error, name).toBeNull();
    expect(denied.data, name).toEqual({ status: 'not_permitted' });
  }
  for (const target of [
    { workspace_id: f.wsB.id, client_id: p.t.id },
    {
      workspace_id: f.wsA.id,
      client_id: '00000000-0000-0000-0000-000000000000',
    },
  ]) {
    const denied = await f.actors.po.client.rpc(
      'registration_approval_correction',
      target,
    );
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual({ status: 'not_permitted' });
  }
});

it('T023 authorizes PO only for a real workspace, owners by active membership, Sales without commission', async () => {
  for (const [name, identity] of Object.entries(f.actors)) {
    if (!identity.client || !identity.userId) continue;
    const status = await identity.client.rpc('subscription_payment_status', {
      workspace_id: f.wsA.id,
      client_id: p.t.id,
      subscription_id: p.sid,
    });
    const allowed = ['po', 'woA', 'salesA', 'trainerA'].includes(name);
    if (!allowed) expect(status.data).toEqual({ status: 'not_permitted' });
    else {
      expect(status.error).toBeNull();
      expect(JSON.stringify(status.data)).not.toContain('commission');
    }
    const commission = await identity.client.rpc('subscription_commission', {
      workspace_id: f.wsA.id,
      subscription_id: p.sid,
    });
    if (name === 'po' || name === 'woA') expect(commission.error).toBeNull();
    else expect(commission.data).toEqual({ status: 'not_permitted' });
  }
  for (const workspace_id of [
    f.wsB.id,
    '00000000-0000-0000-0000-000000000000',
  ]) {
    const result = await f.po.client.rpc('subscription_payment_status', {
      workspace_id,
      client_id: p.t.id,
      subscription_id: p.sid,
    });
    expect(result.data).toEqual({ status: 'not_permitted' });
  }
});

it('T023 represents obligations without a collection event as unpaid', async () => {
  const result = await f.actors.po.client.rpc('subscription_payment_status', {
    workspace_id: f.wsA.id,
    client_id: p.t.id,
    subscription_id: p.sid,
  });

  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ status: 'ok' });
  expect(
    (
      result.data as { obligations: Array<{ paid: boolean | null }> }
    ).obligations.map((obligation) => obligation.paid),
  ).toEqual([true, false, false]);
});

it('Q1 keeps the installed subscription payment status body equal to the latest forward migration', async () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'supabase',
      'migrations',
      '20261111170858_f13_continuous_renewal.sql',
    ),
    'utf8',
  );
  const expectedBody = migration.match(
    /create\s+or\s+replace\s+function\s+public\.subscription_payment_status\b[\s\S]*?as\s+\$\$([\s\S]*?)\$\$\s*;/i,
  )?.[1];
  const [installed] = await db`
    select pg_catalog.pg_get_functiondef(
      'public.subscription_payment_status(uuid,uuid,uuid)'::regprocedure
    ) as definition`;
  const installedBody = installed!.definition.match(
    /as\s+\$function\$([\s\S]*?)\$function\$/i,
  )?.[1];
  const hash = (body: string | undefined) =>
    createHash('sha256')
      .update((body ?? '').replace(/\s+/g, ' ').trim())
      .digest('hex');
  expect(expectedBody).toBeDefined();
  expect(installedBody).toBeDefined();
  expect(hash(installedBody)).toBe(hash(expectedBody));
});

it('T023 all queue and review projections enforce their role gates and omit commission', async () => {
  for (const name of ['po', 'woA'] as const) {
    const queue = await f.actors[name].client.rpc(
      'registration_approval_queue',
      {
        workspace_id: f.wsA.id,
        cursor_id: null,
        page_size: 20,
      },
    );
    expect(queue.error).toBeNull();
    expect(queue.data.status).toBe('ok');
    expect(JSON.stringify(queue.data)).not.toContain('commission');
    const review = await f.actors[name].client.rpc(
      'registration_approval_review',
      {
        workspace_id: f.wsA.id,
        client_id: p.t.id,
      },
    );
    expect(review.error).toBeNull();
    expect(review.data.status).toBe('ok');
    expect(JSON.stringify(review.data)).not.toContain('commission');
  }
  const salesApproval = await f.actors.salesA.client.rpc(
    'registration_approval_queue',
    {
      workspace_id: f.wsA.id,
      cursor_id: null,
      page_size: 20,
    },
  );
  expect(salesApproval.data).toEqual({ status: 'not_permitted' });
  for (const name of ['po', 'woA', 'salesA'] as const) {
    const queue = await f.actors[name].client.rpc('workspace_payment_queue', {
      workspace_id: f.wsA.id,
      cursor_id: null,
      page_size: 20,
    });
    expect(queue.error).toBeNull();
    expect(queue.data.status).toBe('ok');
    expect(JSON.stringify(queue.data)).not.toContain('commission');
  }
});

it('T023 direct base reads, wildcard and embedding disclose no financial rows', async () => {
  for (const actor of [f.actors.po, f.actors.woA, f.actors.salesA]) {
    for (const table of [
      'subscriptions',
      'subscription_installments',
      'payment_events',
      'subscription_activations',
    ]) {
      const result = await actor.client.from(table).select('*');
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    }
    const embedded = await actor.client
      .from('subscriptions')
      .select('*,payment_events(*)');
    expect(embedded.error).not.toBeNull();
  }
});

it('T023 forced RLS still denies populated rows under controlled direct SELECT grants', async () => {
  await probe(async (tx) => {
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source) values(${f.wsA.id},${p.sid},now(),${randomUUID()}, 'po_override')`;
    const tables = [
      'public.subscriptions',
      'public.subscription_installments',
      'public.payment_events',
      'public.subscription_activations',
    ];
    for (const table of tables) {
      const [catalog] =
        await tx`select relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) as owner from pg_class where oid=${table}::regclass`;
      expect(catalog).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
        owner: 'postgres',
      });
      await tx.unsafe(`grant select on ${table} to authenticated`);
    }
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.actors.salesA.userId, role: 'authenticated' })},true)`;
    await tx`set local role authenticated`;
    for (const table of tables)
      expect(await tx.unsafe(`select * from ${table}`)).toEqual([]);
    await tx`reset role`;
  });
});

it('T023 unknown and foreign targets are identical and never return receipts', async () => {
  for (const target of [
    {
      workspace_id: f.wsA.id,
      client_id: '00000000-0000-0000-0000-000000000000',
      subscription_id: p.sid,
    },
    { workspace_id: f.wsB.id, client_id: p.t.id, subscription_id: p.sid },
    {
      workspace_id: f.wsA.id,
      client_id: p.t.id,
      subscription_id: '00000000-0000-0000-0000-000000000000',
    },
  ]) {
    const result = await f.actors.po.client.rpc(
      'subscription_payment_status',
      target,
    );
    expect(result.data).toEqual({ status: 'not_permitted' });
    expect(JSON.stringify(result.data)).not.toMatch(
      /receipt|email|phone|commission/i,
    );
  }
});

it('T023 authorization requires an existing target workspace and current own-workspace membership', async () => {
  const checks = [
    ['po', f.wsA.id, true],
    ['po', f.wsB.id, true],
    ['woA', f.wsA.id, true],
    ['woA', f.wsB.id, false],
    ['salesA', f.wsA.id, true],
    ['salesA', f.wsB.id, false],
    ['woB', f.wsA.id, false],
    ['woB', f.wsB.id, true],
    ['salesB', f.wsA.id, false],
    ['salesB', f.wsB.id, true],
  ] as const;
  for (const [name, workspace, expected] of checks) {
    const result = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.actors[name].userId, role: 'authenticated' })},true)`;
      return tx`select app_private.f12_u5_authorized(${workspace},'record_payment',false) as allowed`;
    });
    expect(
      result[0]!.allowed,
      `${name} on ${workspace}: expected ${expected}`,
    ).toBe(expected);
  }
  const [missing] =
    await db`select app_private.f12_u5_authorized('00000000-0000-0000-0000-000000000000','record_payment',false) as allowed`;
  expect(missing!.allowed).toBe(false);
});
