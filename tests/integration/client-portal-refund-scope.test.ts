import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
  type Context,
} from './registration-approval-fixture';

// F22 T016/T035 (FR-005; S57-PO-12): "Refunded" only for a full refund. The
// F13 refund writer is used unchanged; F22 reads its ledger facts only.
async function asUser<T>(
  tx: TransactionSql,
  userId: string,
  body: () => Promise<T>,
): Promise<T> {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    return await body();
  } finally {
    await tx`reset role`;
  }
}

async function refund(
  tx: TransactionSql,
  f: Context,
  ids: Awaited<ReturnType<typeof graph>>,
  amount: string,
) {
  const result = await asUser(tx, f.po.userId, async () => {
    const [row] = await tx`select public.record_refund(${tx.json({
      workspace_id: f.wsA.id,
      client_id: ids.client,
      purchase_id: ids.subscription,
      request_key: randomUUID(),
      amount_minor: amount,
      external_confirmation: true,
    })}) as result`;
    return row!.result as { status: string };
  });
  expect(result.status, `refund ${amount}`).toBe('ok');
}

async function summary(tx: TransactionSql, f: Context, clientId: string) {
  const [row] =
    await tx`select app_private.f22_subscription_summary(${f.wsA.id}, ${clientId}) - 'subscription_id' as value`;
  return row!.value as Record<string, unknown>;
}

async function refundedFilter(tx: TransactionSql, f: Context) {
  return asUser(tx, f.trainerA.userId, async () => {
    const [row] = await tx`select public.staff_client_directory(
      ${f.wsA.id}::uuid, null, null, 'refunded', 100, 0) as value`;
    return (
      row!.value as { clients: Array<{ client_id: string }> }
    ).clients.map((c) => c.client_id);
  });
}

it('marks a partial refund partial and a full refund full, with no scope before any refund', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f); // one collected 1200 XTS installment
    expect(await summary(tx, f, ids.client)).not.toHaveProperty('refund_scope');

    await refund(tx, f, ids, '600');
    expect(await summary(tx, f, ids.client)).toEqual({
      status: 'refunded',
      effective_end_exclusive: null,
      overdue: false,
      refund_scope: 'partial',
    });
    expect(await refundedFilter(tx, f)).not.toContain(ids.client);

    await refund(tx, f, ids, '600');
    expect(await summary(tx, f, ids.client)).toEqual({
      status: 'refunded',
      effective_end_exclusive: null,
      overdue: false,
      refund_scope: 'full',
    });
    expect(await refundedFilter(tx, f)).toContain(ids.client);
  });
});

it('returns the scope on directory rows and keeps the helper private', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await refund(tx, f, ids, '1200');
    const row = await asUser(tx, f.trainerA.userId, async () => {
      const [value] = await tx`select public.staff_client_directory(
        ${f.wsA.id}::uuid, null, null, null, 100, 0) as value`;
      return (
        value!.value as { clients: Array<Record<string, unknown>> }
      ).clients.find((c) => c.client_id === ids.client);
    });
    expect(row).toMatchObject({
      subscription_status: 'refunded',
      refund_scope: 'full',
    });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [g] = await tx`select has_function_privilege(${role},
        'app_private.f22_refund_scope(uuid,uuid)', 'EXECUTE') as allowed`;
      expect(g!.allowed, role).toBe(false);
    }
  });
});

it('K5 mutation: dropping the partial-principal check labels a partial refund full (kill evidence)', async () => {
  const signature = 'app_private.f22_refund_scope(uuid,uuid)';
  const control =
    "when exists (select 1 from obligations o where o.refunded_minor < o.collected_minor) then 'partial'";
  const f = await clientContext();
  let mutant: unknown = 'not-reached';
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await refund(tx, f, ids, '600');
    const [row] =
      await tx`select pg_get_functiondef(${signature}::regprocedure) as definition`;
    const definition = row!.definition as string;
    const mutated = definition.replace(control, "when false then 'partial'");
    expect(mutated).not.toBe(definition);
    await tx.unsafe(mutated);
    mutant = (await summary(tx, f, ids.client)).refund_scope;
  });
  // The real rule returns 'partial' for this ledger (first test above).
  expect(mutant).toBe('full');
  const db = sql();
  try {
    const [row] =
      await db`select pg_get_functiondef(${signature}::regprocedure) as body`;
    expect(row!.body as string).toContain(control);
  } finally {
    await db.end();
  }
});
