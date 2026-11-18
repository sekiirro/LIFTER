import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  activate,
  bought,
  pay,
  paymentRequest,
  sql,
  type Context,
  type Purchase,
} from './registration-approval-payment-fixture';
import { admin } from './harness';

const db = sql();
let f: Context;
let p: Purchase;

beforeAll(async () => {
  f = await (await import('./registration-approval-fixture')).clientContext();
  p = await bought(f);
  await db.begin((tx) => activate(tx, f, p));
  // A Cairo-local December collection immediately follows a November UTC
  // timestamp. The fixture is synthetic and the mutation is restored in-scope.
  await db.begin(async (tx) => {
    await tx`alter table public.payment_events disable trigger f12_no_update`;
    await tx`alter table app_private.package_reporting_fx_snapshots disable trigger package_reporting_fx_snapshot_no_change`;
    await tx`update public.payment_events set recorded_at='2026-11-30T22:30:00Z'::timestamptz
      where id=${p.approved.receipt!.event_id as string}`;
    await tx`update app_private.package_reporting_fx_snapshots set transaction_at='2026-11-30T22:30:00Z'::timestamptz
      where payment_event_id=${p.approved.receipt!.event_id as string}`;
    await tx`alter table app_private.package_reporting_fx_snapshots enable trigger package_reporting_fx_snapshot_no_change`;
    await tx`alter table public.payment_events enable trigger f12_no_update`;
  });
});

afterAll(() => db.end());

it('T068 reports actual collection rows in their Africa/Cairo collection month and keeps settlement rows separate', async () => {
  const result = await f.actors.po.client.rpc('package_monthly_collections', {
    workspace_id: f.wsA.id,
    month_start: '2026-12-01',
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    status: 'ok',
    month: '2026-12',
    collections: [
      expect.objectContaining({
        event_id: p.approved.receipt!.event_id,
        amount_minor: '400',
        currency: 'USD',
        package_id: expect.any(String),
      }),
    ],
    accounting_events: [],
  });
  const [stored] = await db`
    select kind, amount_minor::text, currency, recorded_at::text
    from public.payment_events where id=${p.approved.receipt!.event_id as string}`;
  expect(stored).toMatchObject({
    kind: 'collection',
    amount_minor: '400',
    currency: 'USD',
    recorded_at: '2026-11-30 22:30:00+00',
  });
  const utcMonth = await f.actors.po.client.rpc('package_monthly_collections', {
    workspace_id: f.wsA.id,
    month_start: '2026-11-01',
  });
  expect(utcMonth.error).toBeNull();
  expect(utcMonth.data.collections).toEqual([]);
});

it('T068 keeps correction accounting events separate from actual collection rows', async () => {
  const isolated = await (
    await import('./registration-approval-fixture')
  ).clientContext();
  const purchase = await bought(isolated);
  const reversed = await pay(
    isolated.actors.po.client,
    'correct',
    paymentRequest(isolated, purchase, 'correct'),
  );
  expect(reversed.status).toBe('ok');
  const monthRows = await db`
    select to_char(clock_timestamp() at time zone 'Africa/Cairo','YYYY-MM-01') month_start`;
  const monthStart = monthRows[0]!.month_start as string;
  const report = await isolated.actors.po.client.rpc(
    'package_monthly_collections',
    {
      workspace_id: isolated.wsA.id,
      month_start: monthStart,
    },
  );
  expect(report.error).toBeNull();
  expect(report.data.collections).toEqual([
    expect.objectContaining({
      event_id: purchase.approved.receipt!.event_id,
      kind: 'collection',
    }),
  ]);
  expect(report.data.accounting_events).toEqual([
    expect.objectContaining({
      event_id: reversed.receipt!.event_id,
      kind: 'correction_reversal',
      amount_minor: '-400',
    }),
  ]);
});

it('T068 excludes pending FX lines from converted totals until accepted', async () => {
  const result = await f.actors.po.client.rpc('package_monthly_collections', {
    workspace_id: f.wsA.id,
    month_start: '2026-12-01',
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ status: 'ok' });
  expect(result.data.converted_egp_minor).toBe('0');
  expect(result.data.pending_event_ids).toContain(p.approved.receipt!.event_id);
  expect(result.data.collections[0]).toMatchObject({
    fx: { status: 'pending' },
    converted_egp_exact: null,
  });
});

it('T068 stores the pinned rate once and preserves the exact converted line value', async () => {
  const eventId = p.approved.receipt!.event_id as string;
  const saved = await admin().rpc('save_package_reporting_fx_snapshot', {
    p_workspace_id: f.wsA.id,
    p_payment_event_id: eventId,
    p_status: 'ready',
    p_provider_key: 'CBE',
    p_rate: '50',
    p_publication_date: '2026-11-30',
  });
  expect(saved.error).toBeNull();
  expect(saved.data).toMatchObject({
    status: 'ready',
    provider: 'CBE',
    rate: '50',
  });
  const retry = await admin().rpc('save_package_reporting_fx_snapshot', {
    p_workspace_id: f.wsA.id,
    p_payment_event_id: eventId,
    p_status: 'ready',
    p_provider_key: 'CBE',
    p_rate: '60',
    p_publication_date: '2026-11-29',
  });
  expect(retry.error).toBeNull();
  expect(retry.data).toMatchObject({
    status: 'ready',
    provider: 'CBE',
    rate: '50',
  });
  const report = await f.actors.po.client.rpc('package_monthly_collections', {
    workspace_id: f.wsA.id,
    month_start: '2026-12-01',
  });
  expect(report.error).toBeNull();
  expect(report.data.converted_egp_minor).toBe('20000');
  expect(report.data.collections[0].converted_egp_exact).toBe('20000');

  const [source] = await db`
    select commission_minor::text from public.payment_events
    where id=${eventId}`;
  const commissions = await f.actors.po.client.rpc(
    'package_commission_report',
    {
      workspace_id: f.wsA.id,
      month_start: '2026-12-01',
    },
  );
  expect(commissions.error).toBeNull();
  expect(commissions.data.commissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        package_id: report.data.collections[0].package_id,
        original_commission_by_currency: { USD: source!.commission_minor },
        converted_egp_exact: (
          BigInt(source!.commission_minor) * 50n
        ).toString(),
      }),
    ]),
  );
});

it('T068 sums exact converted collection lines before one half-up aggregate rounding', async () => {
  const isolated = await (
    await import('./registration-approval-fixture')
  ).clientContext();
  const purchase = await bought(isolated);
  await db.begin((tx) => activate(tx, isolated, purchase));
  const second = await pay(
    isolated.actors.po.client,
    'collect',
    paymentRequest(isolated, purchase, 'collect', {
      collected_on: '2026-11-18',
    }),
  );
  expect(second.status).toBe('ok');
  const eventIds = [
    purchase.approved.receipt!.event_id as string,
    second.receipt!.event_id as string,
  ];
  await db.begin(async (tx) => {
    await tx`alter table public.payment_events disable trigger f12_no_update`;
    await tx`alter table app_private.package_reporting_fx_snapshots disable trigger package_reporting_fx_snapshot_no_change`;
    await tx`update public.payment_events set amount_minor=1,commission_minor=1,
      recorded_at='2026-11-30T22:30:00Z'::timestamptz where id=any(${eventIds}::uuid[])`;
    await tx`update app_private.package_reporting_fx_snapshots set transaction_at='2026-11-30T22:30:00Z'::timestamptz
      where payment_event_id=any(${eventIds}::uuid[])`;
    await tx`alter table app_private.package_reporting_fx_snapshots enable trigger package_reporting_fx_snapshot_no_change`;
    await tx`alter table public.payment_events enable trigger f12_no_update`;
  });
  for (const eventId of eventIds) {
    const saved = await admin().rpc('save_package_reporting_fx_snapshot', {
      p_workspace_id: isolated.wsA.id,
      p_payment_event_id: eventId,
      p_status: 'ready',
      p_provider_key: 'CBE',
      p_rate: '1.5',
      p_publication_date: '2026-11-30',
    });
    expect(saved.error).toBeNull();
  }
  const report = await isolated.actors.po.client.rpc(
    'package_monthly_collections',
    {
      workspace_id: isolated.wsA.id,
      month_start: '2026-12-01',
    },
  );
  expect(report.error).toBeNull();
  expect(report.data.converted_egp_minor).toBe('3');
  const rows = report.data.collections.filter(
    (line: { subscription_id: string }) =>
      line.subscription_id === purchase.sid,
  );
  expect(
    rows.map(
      (line: { converted_egp_exact: string }) => line.converted_egp_exact,
    ),
  ).toEqual(['1.5', '1.5']);
  const commission = await isolated.actors.po.client.rpc(
    'package_commission_report',
    {
      workspace_id: isolated.wsA.id,
      month_start: '2026-12-01',
    },
  );
  expect(commission.data.commissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        original_commission_by_currency: { USD: '2' },
        converted_egp_exact: '3.0',
        converted_egp_minor: '3',
      }),
    ]),
  );
});

it('T060 returns installment due, paid, remaining, and installment-client data from source rows', async () => {
  const result = await f.actors.po.client.rpc('package_installment_report', {
    workspace_id: f.wsA.id,
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    status: 'ok',
    installments: expect.arrayContaining([
      expect.objectContaining({
        subscription_id: p.sid,
        seq: 1,
        due_on: null,
        amount_minor: '400',
        paid_minor: '400',
        remaining_minor: '0',
        is_installment_client: true,
      }),
      expect.objectContaining({
        subscription_id: p.sid,
        seq: 2,
        due_on: expect.any(String),
        paid_minor: '0',
        remaining_minor: '400',
        is_installment_client: true,
      }),
    ]),
  });
  expect(JSON.stringify(result.data)).not.toMatch(/commission/i);
});

it('T068 keeps snapshot storage private and limits its writer to service_role', async () => {
  const [table] = await db`
    select c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
      pg_catalog.pg_get_userbyid(c.relowner) as owner,
      has_table_privilege('anon','app_private.package_reporting_fx_snapshots','select') as anon_select,
      has_table_privilege('authenticated','app_private.package_reporting_fx_snapshots','select') as auth_select,
      has_table_privilege('service_role','app_private.package_reporting_fx_snapshots','select') as service_select
    from pg_catalog.pg_class c where c.oid='app_private.package_reporting_fx_snapshots'::regclass`;
  expect(table).toEqual({
    rls: true,
    force_rls: true,
    owner: 'postgres',
    anon_select: false,
    auth_select: false,
    service_select: false,
  });
  const [writer] = await db`
    select p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('anon',p.oid,'execute') as anon_exec,
      has_function_privilege('authenticated',p.oid,'execute') as auth_exec,
      has_function_privilege('service_role',p.oid,'execute') as service_exec
    from pg_catalog.pg_proc p where p.oid='public.save_package_reporting_fx_snapshot(uuid,uuid,text,text,text,date)'::regprocedure`;
  expect(writer).toEqual({
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
    anon_exec: false,
    auth_exec: false,
    service_exec: true,
  });
});

it('T060 keeps package commission readable by PO/WO and denied to Sales/Trainer', async () => {
  for (const role of ['po', 'woA'] as const) {
    const allowed = await f.actors[role].client.rpc(
      'package_commission_report',
      {
        workspace_id: f.wsA.id,
        month_start: '2026-12-01',
      },
    );
    expect(allowed.error, role).toBeNull();
    expect(allowed.data.status, role).toBe('ok');
  }
  for (const role of ['salesA', 'trainerA'] as const) {
    const denied = await f.actors[role].client.rpc(
      'package_commission_report',
      {
        workspace_id: f.wsA.id,
        month_start: '2026-12-01',
      },
    );
    expect(denied.error, role).toBeNull();
    expect(denied.data, role).toEqual({ status: 'not_permitted' });
    const collections = await f.actors[role].client.rpc(
      'package_monthly_collections',
      { workspace_id: f.wsA.id, month_start: '2026-12-01' },
    );
    expect(collections.error, role).toBeNull();
    expect(JSON.stringify(collections.data), role).not.toMatch(/commission/i);
  }
});
