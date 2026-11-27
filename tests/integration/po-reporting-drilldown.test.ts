import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { admin, anonClient, sql } from './harness';
import { clientContext, type Context } from './registration-approval-fixture';

const db = sql();
let f: Context;
let monthStart: string;
let eventId: string;
let reversalEventId: string;
let clientId: string;
let clientActor: ReturnType<typeof anonClient>;

beforeAll(async () => {
  f = await clientContext();
  const clientEmail = `report-${randomUUID()}@example.test`;
  const clientPassword = `Test-${randomUUID()}!a1`;
  const user = await admin().auth.admin.createUser({
    email: clientEmail,
    password: clientPassword,
    email_confirm: true,
  });
  if (user.error || !user.data.user)
    throw new Error('Synthetic auth identity unavailable');
  clientActor = anonClient();
  const ids = {
    client: randomUUID(),
    subscription: randomUUID(),
    installment: randomUUID(),
    event: randomUUID(),
    reversal: randomUUID(),
  };
  const phoneDigits = BigInt(`0x${ids.client.replaceAll('-', '')}`)
    .toString()
    .padStart(11, '0')
    .slice(-11);
  eventId = ids.event;
  reversalEventId = ids.reversal;
  clientId = ids.client;
  await db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`insert into public.clients(id,workspace_id,auth_user_id,registration_link_id,package_version_id,
      email_normalized,phone_e164,name,approval_state,client_code)
      values(${ids.client},${f.wsA.id},${user.data.user.id},${f.link},${f.p.versionId},
        ${`report-${ids.client}@example.test`},${`+2${phoneDigits}`},'Report fixture','approved','23456789')`;
    await tx`insert into public.subscriptions(id,workspace_id,client_id,registration_link_id,package_version_id,
      price_minor,currency,commission_rate_bp,duration_days,created_by)
      values(${ids.subscription},${f.wsA.id},${ids.client},${f.link},${f.p.versionId},1200,'USD',1000,61,${f.po.userId})`;
    await tx`insert into public.subscription_installments(id,workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
      values(${ids.installment},${f.wsA.id},${ids.subscription},1,400,'USD',0,'issued_schedule')`;
    await tx`insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,kind,
      amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,operation_id)
      values(${ids.event},${f.wsA.id},${ids.subscription},${ids.installment},1,1,'collection',400,'USD',40,
        (clock_timestamp() at time zone 'Africa/Cairo')::date,(clock_timestamp() at time zone 'Africa/Cairo')::date,
        ${f.po.userId},${randomUUID()})`;
    await tx`insert into app_private.package_reporting_fx_snapshots(workspace_id,payment_event_id,status,source_currency,provider_key,transaction_at)
      select ${f.wsA.id},${ids.event},'pending','USD','CBE',recorded_at from public.payment_events where id=${ids.event}`;
    await tx`insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,
      previous_event_id,kind,reverses_event_id,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,operation_id)
      values(${ids.reversal},${f.wsA.id},${ids.subscription},${ids.installment},1,2,${ids.event},'correction_reversal',
        ${ids.event},-400,'USD',-40,null,(clock_timestamp() at time zone 'Africa/Cairo')::date,${f.po.userId},${randomUUID()})`;
    await tx`insert into app_private.package_reporting_fx_snapshots(workspace_id,payment_event_id,status,source_currency,provider_key,transaction_at)
      select ${f.wsA.id},${ids.reversal},'pending','USD','CBE',recorded_at from public.payment_events where id=${ids.reversal}`;
  });
  const clientLogin = await clientActor.auth.signInWithPassword({
    email: clientEmail,
    password: clientPassword,
  });
  if (clientLogin.error)
    throw new Error('Synthetic client sign-in unavailable');
  const [month] =
    await db`select to_char(recorded_at at time zone 'Africa/Cairo','YYYY-MM-01') month_start
    from public.payment_events where id=${eventId}`;
  monthStart = month!.month_start as string;
});

afterAll(async () => {
  await db.end();
});

const aggregate = (
  client: Context['po']['client'],
  workspaceId: string | null,
) =>
  client.rpc('po_reporting_aggregate', {
    p_workspace_id: workspaceId,
    p_month_start: null,
    p_package_id: null,
  });

const sourceRows = (
  client: Context['po']['client'],
  workspaceId: string,
  packageId: string | null = null,
) =>
  client.rpc('po_reporting_source_rows', {
    p_workspace_id: workspaceId,
    p_month_start: null,
    p_package_id: packageId,
    p_page_size: 50,
    p_cursor_recorded_at: null,
    p_cursor_event_id: null,
  });

it('T001 denies platform aggregates to every non-PO role without count disclosure', async () => {
  for (const actor of [
    f.actors.woA,
    f.actors.trainerA,
    f.actors.salesA,
    f.actors.revoked,
    { client: clientActor },
    f.actors.anon,
  ]) {
    const result = await aggregate(actor.client, null);
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  }
});

it('T002 denies direct source-row probes to non-PO actors for own, foreign, and unknown workspaces', async () => {
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';
  for (const actor of [
    f.actors.woA,
    f.actors.trainerA,
    f.actors.salesA,
    f.actors.revoked,
    { client: clientActor },
    f.actors.anon,
  ]) {
    for (const workspaceId of [f.wsA.id, f.wsB.id, unknownWorkspace]) {
      const result = await sourceRows(actor.client, workspaceId);
      expect(result.error?.code).toBe('42501');
      expect(result.data).toBeNull();
    }
  }
});

it('T003 makes platform, workspace, month, package, and source-row reads available only to PO', async () => {
  const platform = await aggregate(f.po.client, null);
  expect(platform.error).toBeNull();
  expect(platform.data).toMatchObject({ status: 'ok' });
  const workspaceRows = platform.data.workspaces.filter(
    (row: { currency: string }) => row.currency === 'USD',
  );
  const platformCurrency = platform.data.currency_totals.find(
    (row: { currency: string }) => row.currency === 'USD',
  );
  expect(
    workspaceRows.reduce(
      (sum: bigint, row: { collection_minor: string }) =>
        sum + BigInt(row.collection_minor),
      0n,
    ),
  ).toBe(BigInt(platformCurrency.collection_minor));
  expect(
    workspaceRows.reduce(
      (sum: bigint, row: { reversal_minor: string }) =>
        sum + BigInt(row.reversal_minor),
      0n,
    ),
  ).toBe(BigInt(platformCurrency.reversal_minor));
  expect(platform.data.workspaces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ workspace_id: f.wsA.id, currency: 'USD' }),
    ]),
  );

  const workspace = await aggregate(f.po.client, f.wsA.id);
  expect(workspace.error).toBeNull();
  expect(workspace.data).toMatchObject({
    status: 'ok',
    workspace_id: f.wsA.id,
  });
  expect(workspace.data.currency_totals).toEqual([
    expect.objectContaining({
      currency: 'USD',
      collection_minor: '400',
      reversal_minor: '-400',
      commission_minor: '0',
      converted_egp_exact: null,
      pending_fx_count: 2,
    }),
  ]);
  expect(workspace.data.months).toEqual([
    expect.objectContaining({
      month: monthStart.slice(0, 7),
      currency: 'USD',
      collection_minor: '400',
    }),
  ]);
  expect(workspace.data.packages).toEqual([
    expect.objectContaining({
      package_id: f.p.offer.package_id,
      currency: 'USD',
      collection_minor: '400',
    }),
  ]);

  const rows = await sourceRows(f.po.client, f.wsA.id);
  expect(rows.error).toBeNull();
  expect(rows.data).toMatchObject({
    status: 'ok',
    has_more: false,
    next_cursor: null,
  });
  expect(rows.data.rows).toEqual([
    expect.objectContaining({
      event_id: reversalEventId,
      workspace_id: f.wsA.id,
      client_id: clientId,
      package_id: f.p.offer.package_id,
      kind: 'correction_reversal',
      amount_minor: '-400',
      currency: 'USD',
      fx: { status: 'pending' },
    }),
    expect.objectContaining({
      event_id: eventId,
      kind: 'collection',
      amount_minor: '400',
      commission_minor: '40',
    }),
  ]);
});

it('T004 applies Cairo month boundaries and package filters before source aggregation', async () => {
  const packageId = f.p.offer.package_id;
  const [unfiltered, byMonth, byPackage, monthAndPackage] = await Promise.all([
    f.po.client.rpc('po_reporting_aggregate', {
      p_workspace_id: f.wsA.id,
      p_month_start: null,
      p_package_id: null,
    }),
    f.po.client.rpc('po_reporting_aggregate', {
      p_workspace_id: f.wsA.id,
      p_month_start: monthStart,
      p_package_id: null,
    }),
    f.po.client.rpc('po_reporting_aggregate', {
      p_workspace_id: f.wsA.id,
      p_month_start: null,
      p_package_id: packageId,
    }),
    f.po.client.rpc('po_reporting_aggregate', {
      p_workspace_id: f.wsA.id,
      p_month_start: monthStart,
      p_package_id: packageId,
    }),
  ]);
  for (const result of [unfiltered, byMonth, byPackage, monthAndPackage])
    expect(result.error).toBeNull();
  expect(byMonth.data.currency_totals).toEqual(unfiltered.data.currency_totals);
  expect(byPackage.data.currency_totals).toEqual(
    unfiltered.data.currency_totals,
  );
  expect(monthAndPackage.data.currency_totals).toEqual(
    unfiltered.data.currency_totals,
  );

  const rows = await f.po.client.rpc('po_reporting_source_rows', {
    p_workspace_id: f.wsA.id,
    p_month_start: monthStart,
    p_package_id: packageId,
    p_page_size: 50,
    p_cursor_recorded_at: null,
    p_cursor_event_id: null,
  });
  expect(rows.error).toBeNull();
  expect(rows.data.rows).toHaveLength(2);
  expect(rows.data.rows[0]).toMatchObject({
    event_id: reversalEventId,
    package_id: packageId,
    amount_minor: '-400',
  });
  const firstPage = await f.po.client.rpc('po_reporting_source_rows', {
    p_workspace_id: f.wsA.id,
    p_month_start: monthStart,
    p_package_id: packageId,
    p_page_size: 1,
    p_cursor_recorded_at: null,
    p_cursor_event_id: null,
  });
  expect(firstPage.data.has_more).toBe(true);
  expect(firstPage.data.next_cursor).toMatchObject({
    event_id: reversalEventId,
  });
  const cursor = firstPage.data.next_cursor as {
    recorded_at: string;
    event_id: string;
  };
  const secondPage = await f.po.client.rpc('po_reporting_source_rows', {
    p_workspace_id: f.wsA.id,
    p_month_start: monthStart,
    p_package_id: packageId,
    p_page_size: 1,
    p_cursor_recorded_at: cursor.recorded_at,
    p_cursor_event_id: cursor.event_id,
  });
  expect(secondPage.data.has_more).toBe(false);
  expect(secondPage.data.rows).toEqual([
    expect.objectContaining({ event_id: eventId }),
  ]);
});

it('T004 returns the same safe denial for foreign and unknown workspace identifiers', async () => {
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';
  for (const workspaceId of [f.wsB.id, unknownWorkspace]) {
    const result = await sourceRows(f.actors.woA.client, workspaceId);
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  }
});

it('T005 keeps RPC execution unavailable to anon and service-role clients', async () => {
  const anon = await aggregate(f.actors.anon.client, null);
  expect(anon.error?.code).toBe('42501');

  const privileged = await admin().rpc('po_reporting_aggregate', {
    p_workspace_id: null,
    p_month_start: null,
    p_package_id: null,
  });
  expect(privileged.error?.code).toBe('42501');
});

it('T006 rejects invalid period, package, cursor, and page bounds before reading rows', async () => {
  const invalidPeriod = await f.po.client.rpc('po_reporting_aggregate', {
    p_workspace_id: f.wsA.id,
    p_month_start: '2026-12-02',
    p_package_id: null,
  });
  expect(invalidPeriod.data).toEqual({ status: 'not_permitted' });

  const invalidPackage = await f.po.client.rpc('po_reporting_aggregate', {
    p_workspace_id: f.wsA.id,
    p_month_start: null,
    p_package_id: '00000000-0000-0000-0000-000000000001',
  });
  expect(invalidPackage.data).toEqual({ status: 'not_permitted' });

  const badPageSize = await f.po.client.rpc('po_reporting_source_rows', {
    p_workspace_id: f.wsA.id,
    p_month_start: null,
    p_package_id: null,
    p_page_size: 101,
    p_cursor_recorded_at: null,
    p_cursor_event_id: null,
  });
  expect(badPageSize.data).toEqual({ status: 'not_permitted' });

  const partialCursor = await f.po.client.rpc('po_reporting_source_rows', {
    p_workspace_id: f.wsA.id,
    p_month_start: null,
    p_package_id: null,
    p_page_size: 50,
    p_cursor_recorded_at: null,
    p_cursor_event_id: eventId,
  });
  expect(partialCursor.data).toEqual({ status: 'not_permitted' });

  const [privileges] = await db`
    select has_function_privilege('anon','public.po_reporting_aggregate(uuid,date,uuid)','execute') as anon_aggregate,
      has_function_privilege('service_role','public.po_reporting_aggregate(uuid,date,uuid)','execute') as service_aggregate,
      has_function_privilege('authenticated','public.po_reporting_aggregate(uuid,date,uuid)','execute') as auth_aggregate,
      has_function_privilege('anon','public.po_reporting_source_rows(uuid,date,uuid,integer,timestamptz,uuid)','execute') as anon_rows,
      has_function_privilege('service_role','public.po_reporting_source_rows(uuid,date,uuid,integer,timestamptz,uuid)','execute') as service_rows`;
  expect(privileges).toEqual({
    anon_aggregate: false,
    service_aggregate: false,
    auth_aggregate: true,
    anon_rows: false,
    service_rows: false,
  });
});
