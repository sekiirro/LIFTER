import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import {
  append,
  clientContext,
  graph,
  probe,
  sql,
  type Context,
} from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

const tables = [
  'public.refund_operations',
  'public.refund_allocation_events',
  'public.subscription_obligation_cancellations',
] as const;

async function appendRefund(
  tx: TransactionSql,
  f: Context,
  ids: Awaited<ReturnType<typeof graph>>,
  amount: number,
  commission: number,
) {
  const operationId = randomUUID();
  await tx`insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,expected_installment_seq,expected_revision,canonical_args_hash,result_receipt)
    values(${operationId},${f.wsA.id},${f.po.userId},${randomUUID()},'collect',${ids.client},${ids.subscription},${ids.obligation},${ids.event},1,0,decode(repeat('cd',32),'hex'),'{}')`;
  const [refund] =
    await tx`insert into public.refund_operations(workspace_id,client_id,subscription_id,operation_id,actor_user_id,amount_minor,currency,effective_on,expected_revision)
    values(${f.wsA.id},${ids.client},${ids.subscription},${operationId},${f.po.userId},${amount},'XTS','1900-01-01',0)
    returning id`;
  await tx`insert into public.refund_allocation_events(workspace_id,subscription_id,obligation_id,refund_operation_id,source_collection_event_id,amount_minor,commission_minor,currency,effective_on,recorded_by)
    values(${f.wsA.id},${ids.subscription},${ids.obligation},${refund!.id},${ids.event},${-amount},${-commission},'XTS','1900-01-01',${f.po.userId})`;
  return refund!.id as string;
}

it('T012 refund ledger entities are postgres-owned, forced-RLS and append-only', async () => {
  for (const table of tables) {
    const [row] = await db`
      select c.relrowsecurity, c.relforcerowsecurity,
             pg_get_userbyid(c.relowner) as owner
      from pg_class c where c.oid = to_regclass(${table})`;
    expect(row).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      owner: 'postgres',
    });
    const [triggers] = await db`
      select array_agg(tgname order by tgname) as names
      from pg_trigger
      where tgrelid = to_regclass(${table}) and not tgisinternal`;
    expect(triggers!.names).toEqual(
      expect.arrayContaining([
        'f13_no_update',
        'f13_no_delete',
        'f13_no_truncate',
      ]),
    );
    for (const role of ['anon', 'authenticated', 'service_role'])
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const [grant] = await db`
          select has_table_privilege(${role}, ${table}, ${privilege}) as allowed`;
        expect(grant!.allowed).toBe(false);
      }
  }
});

it('T012 preserves F12 correction reversal uniqueness while allowing partial-source allocation keys', async () => {
  const [correction] = await db`
    select indexdef from pg_indexes
    where schemaname='public' and indexname='f12_payment_reversal'`;
  expect(correction!.indexdef).toMatch(/unique/i);
  expect(correction!.indexdef).toMatch(/reverses_event_id/i);
  const [refund] = await db`
    select indexdef from pg_indexes
    where schemaname='public' and indexname='f13_refund_allocation_operation_source'`;
  expect(refund!.indexdef).toMatch(/unique/i);
  expect(refund!.indexdef).toMatch(/refund_operation_id/i);
  expect(refund!.indexdef).toMatch(/source_collection_event_id/i);
  expect(refund!.indexdef).not.toMatch(
    /unique.*\(workspace_id,\s*subscription_id,\s*source_collection_event_id\)/i,
  );
});

it('T012 deferred validator enforces aggregate, source and purchase residual caps', async () => {
  const [row] = await db`
    select p.prosrc
    from pg_proc p
    where p.oid = to_regprocedure('app_private.f13_validate_refund_ledger(uuid,uuid)')`;
  expect(row).toBeDefined();
  expect(row!.prosrc).toMatch(/refund_operations/i);
  expect(row!.prosrc).toMatch(/refund_allocation_events/i);
  expect(row!.prosrc).toMatch(/amount_minor/i);
  expect(row!.prosrc).toMatch(/payment_events/i);
  expect(row!.prosrc).toMatch(/sum\(/i);
  expect(row!.prosrc).toMatch(/refund_source_cap_exceeded/i);
  expect(row!.prosrc).toMatch(/refund_purchase_cap_exceeded/i);
  expect(row!.prosrc).toMatch(/refund_commission_allocation_mismatch/i);
  expect(row!.prosrc).toMatch(/div\(2::numeric/i);
});

it('T012 cancellation and refund terminal facts cannot reopen obligations or successors', async () => {
  const [row] = await db`
    select p.prosrc
    from pg_proc p
    where p.oid = to_regprocedure('app_private.f13_validate_refund_ledger(uuid,uuid)')`;
  expect(row).toBeDefined();
  expect(row!.prosrc).toMatch(/subscription_obligation_cancellations/i);
  expect(row!.prosrc).toMatch(/subscription_installments/i);
  expect(row!.prosrc).toMatch(/terminal|cancel/i);
  const [guard] = await db`
    select p.prosrc from pg_proc p
    where p.oid = to_regprocedure('app_private.f13_guard_terminal_payment()')`;
  expect(guard!.prosrc).toMatch(/terminal_refund_purchase/i);
  expect(guard!.prosrc).toMatch(/cancelled_obligation/i);
});

it('T012 allows multiple partial allocations against one source up to the exact cap', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await appendRefund(tx, f, ids, 600, 1);
    await appendRefund(tx, f, ids, 600, 1);
    await tx`set constraints all immediate`;
    const rows = await tx`
      select count(*)::int as n, sum(-amount_minor)::int as principal,
        sum(-commission_minor)::int as commission
      from public.refund_allocation_events where subscription_id=${ids.subscription}`;
    expect(rows[0]).toEqual({ n: 2, principal: 1200, commission: 2 });
  });
});

it('T012 deferred caps reject cumulative partial allocations above source residual', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await expect(
      tx.savepoint(async (inner) => {
        await appendRefund(inner, f, ids, 700, 1);
        await appendRefund(inner, f, ids, 700, 1);
        await inner`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const [count] = await tx`
      select count(*)::int as n from public.refund_allocation_events where subscription_id=${ids.subscription}`;
    expect(count!.n).toBe(0);
  });
});

it('T012 correction reversal uniqueness rejects duplicate correction successors', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const reversal = await append(tx, f, ids);
    const duplicateOperation = randomUUID();
    const duplicateEvent = randomUUID();
    await expect(
      tx.savepoint(async (inner) => {
        await inner`insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,original_event_id,expected_installment_seq,expected_revision,expected_previous_event_id,canonical_args_hash,result_receipt)
          values(${duplicateOperation},${f.wsA.id},${f.po.userId},${randomUUID()},'correct',${ids.client},${ids.subscription},${ids.obligation},${duplicateEvent},${ids.event},1,2,${reversal.id},decode(repeat('ef',32),'hex'),'{}')`;
        await inner`insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,previous_event_id,kind,reverses_event_id,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,operation_id)
          values(${duplicateEvent},${f.wsA.id},${ids.subscription},${ids.obligation},1,2,${ids.event},'correction_reversal',${ids.event},-1200,'XTS',-2,null,'1900-01-02',${f.po.userId},${duplicateOperation})`;
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
