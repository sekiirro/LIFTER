import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { pending } from './client-accounts-fixture';
import {
  call,
  clientContext,
  request,
  sql,
  type Target,
} from './registration-approval-operations-fixture';
import {
  checked,
  issue,
  registrationFixture,
} from './registration-links-fixture';
import { admin, createStaff } from './harness';

const db = sql();
afterAll(() => db.end());

async function funnelTarget(
  f: Awaited<ReturnType<typeof registrationFixture>>,
  issuer = f.salesA.client,
): Promise<Target> {
  const link = checked(await issue(f, issuer)) as string;
  return db.begin(async (tx) => {
    const client = await pending(
      tx,
      { ...f, link },
      { registration_link_id: link },
    );
    return {
      id: client.id as string,
      userId: client.auth_user_id as string,
      link,
      rows: null,
    };
  });
}

it('T020/T039 reports Sales funnel milestones and P7 facts by Cairo event month', async () => {
  const f = await registrationFixture();
  const target = await funnelTarget(f);
  const secondSales = await createStaff('sales', 'p7-funnel-sales');
  const membership = await admin().from('workspace_memberships').insert({
    workspace_id: f.wsA.id,
    user_id: secondSales.userId,
    granted_by: f.po.userId,
  });
  expect(membership.error).toBeNull();
  const secondTarget = await funnelTarget(f, secondSales.client);
  for (const [index, current] of [target, secondTarget].entries()) {
    const approval = request({ ...f, link: current.link }, current);
    const result = await call(f.po.client, 'approve', approval);
    expect(result.status).toBe('ok');
    expect((await call(f.po.client, 'approve', approval)).status).toBe('ok');
    if (index === 0) {
      const subscriptionId = result.receipt?.subscription_id as string;
      const refund = await f.po.client.rpc('record_refund', {
        request: {
          workspace_id: f.wsA.id,
          client_id: current.id,
          purchase_id: subscriptionId,
          request_key: randomUUID(),
          amount_minor: '1',
          external_confirmation: true,
        },
      });
      expect(refund.error).toBeNull();
      expect(refund.data).toMatchObject({ status: 'ok' });
      const repeatedRefund = await f.po.client.rpc('record_refund', {
        request: {
          workspace_id: f.wsA.id,
          client_id: current.id,
          purchase_id: subscriptionId,
          request_key: randomUUID(),
          amount_minor: '1',
          external_confirmation: true,
        },
      });
      expect(repeatedRefund.error).toBeNull();
      expect(repeatedRefund.data).toMatchObject({ status: 'ok' });
    }
  }

  const [period] = await db`
    select pg_catalog.to_char(
      pg_catalog.date_trunc('month', now() at time zone 'Africa/Cairo'),
      'YYYY-MM-DD'
    ) as month`;
  const automaticDeduction = await db`
    insert into public.p7_adjustment_entries(
      workspace_id, staff_user_id, points, effective_month, source_key,
      source_hash, reason_code
    ) values (
      ${f.wsA.id}, ${f.salesA.userId}, -0.50, ${period?.month},
      ${randomUUID()}, 't039-point-deduction-test', 'checkin_delay'
    )`;
  expect(automaticDeduction.count).toBe(1);

  for (const [operation, points] of [
    ['add', '2.50'],
    ['deduct', '-0.75'],
  ] as const) {
    const adjustment = await f.po.client.rpc('p7_post_point_adjustment', {
      p_workspace_id: f.wsA.id,
      p_staff_user_id: f.salesA.userId,
      p_operation: operation,
      p_points: points,
      p_effective_month: period?.month,
      p_original_entry_kind: null,
      p_original_entry_id: null,
      p_reason: `T039 ${operation} funnel test`,
      p_idempotency_key: randomUUID(),
    });
    expect(adjustment.error).toBeNull();
    expect(adjustment.data).toMatchObject({ status: 'ok' });
  }

  const { data, error } = await f.po.client.rpc('get_sales_funnel', {
    workspace_id: f.wsA.id,
    p_month: period?.month,
  });

  expect(error).toBeNull();
  expect(data).toHaveLength(2);
  for (const salesUserId of [f.salesA.userId, secondSales.userId]) {
    expect(data).toContainEqual({
      month: period?.month,
      sales_user_id: salesUserId,
      link_count: 1,
      registration_count: 1,
      approval_count: 1,
      first_payment_count: 1,
      acquisition_point_count: 1,
      acquisition_points: '1.00',
      refund_reversal_count: salesUserId === f.salesA.userId ? 1 : 0,
      refund_reversal_points:
        salesUserId === f.salesA.userId ? '-1.00' : '0.00',
      point_deduction_count: salesUserId === f.salesA.userId ? 1 : 0,
      point_deduction_points:
        salesUserId === f.salesA.userId ? '-0.50' : '0.00',
      po_adjustment_count: salesUserId === f.salesA.userId ? 2 : 0,
      po_adjustment_points: salesUserId === f.salesA.userId ? '1.75' : '0.00',
    });
  }
  expect(JSON.stringify(data)).not.toMatch(/client|email|phone|name|token/i);
});

it('T020/T039 assigns funnel events and facts to their Cairo months', async () => {
  const f = await registrationFixture();
  const target = await funnelTarget(f);
  expect(
    (
      await call(
        f.po.client,
        'approve',
        request({ ...f, link: target.link }, target),
      )
    ).status,
  ).toBe('ok');

  await db.begin(async (tx) => {
    await tx`alter table public.registration_links disable trigger user`;
    await tx`alter table public.clients disable trigger user`;
    await tx`alter table app_private.registration_approval_events disable trigger user`;
    await tx`alter table public.payment_events disable trigger user`;
    await tx`alter table public.p7_earned_points disable trigger p7_earned_points_immutable`;
    await tx`
      update public.registration_links
      set created_at='2026-10-31 20:30:00+00',
        expires_at='2026-11-01 20:30:00+00'
      where id=${target.link}`;
    await tx`
      update public.clients set created_at='2026-10-31 22:30:00+00'
      where id=${target.id}`;
    await tx`
      update app_private.registration_approval_events
      set approved_at='2026-11-30 22:30:00+00'
      where workspace_id=${f.wsA.id} and client_id=${target.id}`;
    await tx`
      update public.payment_events e set recorded_at='2026-11-30 22:30:00+00'
      from public.subscriptions s
      where s.workspace_id=e.workspace_id and s.id=e.subscription_id
        and s.client_id=${target.id} and e.kind='collection' and e.installment_seq=1`;
    await tx`
      update public.p7_earned_points e
      set effective_month='2027-01-01', original_month='2026-12-01',
        trigger_at='2026-11-30 22:30:00+00'
      where e.workspace_id=${f.wsA.id} and e.staff_user_id=${f.salesA.userId}`;
    await tx`alter table public.registration_links enable trigger user`;
    await tx`alter table public.clients enable trigger user`;
    await tx`alter table app_private.registration_approval_events enable trigger user`;
    await tx`alter table public.payment_events enable trigger user`;
    await tx`alter table public.p7_earned_points enable trigger p7_earned_points_immutable`;
  });

  const expected = [
    ['2026-10-01', 1, 0, 0],
    ['2026-11-01', 0, 1, 0],
    ['2026-12-01', 0, 0, 1],
    ['2027-01-01', 0, 0, 0],
  ] as const;
  for (const [month, links, registrations, approvals] of expected) {
    const { data, error } = await f.po.client.rpc('get_sales_funnel', {
      workspace_id: f.wsA.id,
      p_month: month,
    });
    expect(error).toBeNull();
    if (month === '2027-01-01') {
      expect(data).toEqual([]);
      continue;
    }
    expect(data).toEqual([
      {
        month,
        sales_user_id: f.salesA.userId,
        link_count: links,
        registration_count: registrations,
        approval_count: approvals,
        first_payment_count: month === '2026-12-01' ? 1 : 0,
        acquisition_point_count: month === '2026-12-01' ? 1 : 0,
        acquisition_points: month === '2026-12-01' ? '1.00' : '0.00',
        refund_reversal_count: 0,
        refund_reversal_points: '0.00',
        point_deduction_count: 0,
        point_deduction_points: '0.00',
        po_adjustment_count: 0,
        po_adjustment_points: '0.00',
      },
    ]);
  }
});

it('T020/T039 denies Sales, WO, Trainer, and anon without workspace disclosure', async () => {
  const f = await clientContext();
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';

  for (const actor of [f.salesA, f.woA, f.trainerA, f.actors.anon]) {
    const messages: string[] = [];
    for (const workspaceId of [f.wsA.id, f.wsB.id, unknownWorkspace]) {
      const { data, error } = await actor.client.rpc('get_sales_funnel', {
        workspace_id: workspaceId,
        p_month: '2026-11-01',
      });
      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
      expect(error?.message).not.toContain(workspaceId);
      messages.push(error?.message ?? '');
    }
    expect(new Set(messages).size).toBe(1);
  }
});
