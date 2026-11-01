import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';

const db = sql();
afterAll(() => db.end());

async function invokeRefund(
  tx: TransactionSql,
  userId: string,
  input: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_refund(${tx.json(input as never)}) as result`;
    return row!.result as {
      status: string;
      receipt?: Record<string, unknown>;
    };
  } finally {
    await tx`reset role`;
  }
}

it('audits refund, allocation, cancellations and deactivation with allow-listed details', async () => {
  const f = await clientContext();
  f.link = checked(
    await issue(f, f.po.client, {
      installments: [
        { seq: 1, amount_minor: '800', due_offset_days: 0 },
        { seq: 2, amount_minor: '400', due_offset_days: 30 },
      ],
    }),
  ) as string;
  await probe(async (tx) => {
    const ids = await graph(tx, f, {
      amount: '800',
      commission: '1',
      issuedRows: [
        { seq: 1, amount_minor: '800', due_offset_days: 0 },
        { seq: 2, amount_minor: '400', due_offset_days: 30 },
      ],
    });
    const input = {
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: '00000000-0000-4000-8000-000000000099',
      amount_minor: '600',
      external_confirmation: true,
    };
    const refund = await invokeRefund(tx, f.po.userId, input);
    expect(refund.status).toBe('ok');
    expect(refund.receipt).toMatchObject({
      client_id: ids.client,
      purchase_id: ids.subscription,
      amount_minor: '600',
      currency: 'XTS',
    });

    const rows = await tx`
      select action,details,
        (details->>'deactivated_at')::timestamptz =
          (select deactivated_at from public.clients where id=${ids.client}) as deactivation_timestamp_matches
      from public.audit_events
      where workspace_id=${f.wsA.id} and (
        (action='client.deactivated' and target_id=${ids.client})
        or details->>'subscription_id'=${ids.subscription}
      ) order by action,target_id`;
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'client.deactivated',
        'payment.refund_recorded',
        'payment.refund_allocated',
        'payment.obligation_cancelled',
      ]),
    );
    const deactivationAudit = rows.find(
      (row) => row.action === 'client.deactivated',
    );
    expect(deactivationAudit?.deactivation_timestamp_matches).toBe(true);
    const details = JSON.stringify(rows.map((row) => row.details));
    expect(details).not.toContain('auth_user_id');
    expect(details).not.toContain('email');
  });
});

it('rolls back refund, audit, deactivation and lockout together when audit fails', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx.unsafe(`
      create function app_private.f13_test_reject_deactivation_audit() returns trigger
      language plpgsql set search_path='' as $$
      begin
        if new.action='client.deactivated' then
          raise exception 'audit failure' using errcode='23514';
        end if;
        return new;
      end $$;
      create trigger f13_test_reject_deactivation_audit before insert on public.audit_events
      for each row execute function app_private.f13_test_reject_deactivation_audit();
    `);
    const result = await invokeRefund(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: '00000000-0000-4000-8000-000000000098',
      amount_minor: '600',
      external_confirmation: true,
    });
    expect(result.status).toBe('unavailable');
    const [counts] = await tx`
      select
        (select count(*)::int from public.refund_operations where client_id=${ids.client}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
        (select count(*)::int from app_private.client_deactivation_state where client_id=${ids.client}) as deactivation,
        (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts,
        (select count(*)::int from public.audit_events where target_id=${ids.client} and action='client.deactivated') as audits`;
    expect(counts).toEqual({
      refunds: 0,
      allocations: 0,
      deactivation: 0,
      lockouts: 0,
      audits: 0,
    });
  });
});

it('R7 rolls back refund, financial, cancellation, audit and receipt facts when outbox insertion fails', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx.unsafe(`
      create function app_private.f13_test_reject_refund_lockout() returns trigger
      language plpgsql set search_path='' as $$
      begin
        raise exception 'outbox failure' using errcode='23514';
      end $$;
      create trigger f13_test_reject_refund_lockout before insert on app_private.refund_auth_lockouts
      for each row execute function app_private.f13_test_reject_refund_lockout();
    `);

    const requestKey = '00000000-0000-4000-8000-000000000097';
    const result = await invokeRefund(tx, f.po.userId, {
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: requestKey,
      amount_minor: '600',
      external_confirmation: true,
    });
    expect(result.status).toBe('unavailable');

    const [facts] = await tx`
      select
        (select count(*)::int from public.refund_operations where client_id=${ids.client}) as refunds,
        (select count(*)::int from public.refund_allocation_events where subscription_id=${ids.subscription}) as allocations,
        (select count(*)::int from public.subscription_obligation_cancellations where subscription_id=${ids.subscription}) as cancellations,
        (select count(*)::int from app_private.client_deactivation_state where client_id=${ids.client}) as deactivation,
        (select count(*)::int from app_private.refund_auth_lockouts where client_id=${ids.client}) as lockouts,
        (select count(*)::int from app_private.registration_operations where actor_user_id=${f.po.userId} and request_key=${requestKey}) as receipts,
        (select count(*)::int from public.audit_events where target_id=${ids.client} and action='client.deactivated') as deactivation_audits,
        (select count(*)::int from public.audit_events
          where details->>'subscription_id'=${ids.subscription}
            and action in ('payment.refund_recorded','payment.refund_allocated','payment.obligation_cancelled')) as refund_audits,
        (select deactivated_at is not null from public.clients where id=${ids.client}) as inactive`;
    expect(facts).toEqual({
      refunds: 0,
      allocations: 0,
      cancellations: 0,
      deactivation: 0,
      lockouts: 0,
      receipts: 0,
      deactivation_audits: 0,
      refund_audits: 0,
      inactive: false,
    });
  });
});
