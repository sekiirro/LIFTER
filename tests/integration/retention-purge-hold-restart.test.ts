import { createHash } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const rollback = new Error('rollback retention hold mutation');
const sampledAt = new Date('2026-11-24T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;
afterAll(() => db.end());

async function clientWithLockout(
  status: 'pending' | 'retry' | 'succeeded',
  closureDays: number,
  completedDays?: number,
) {
  const f = await clientContext();
  return db.begin(async (tx) => {
    const ids = await graph(tx, f);
    const [client] = await tx`
      select auth_user_id from public.clients where id=${ids.client}
    `;
    await tx`set local session_replication_role = replica`;
    await tx`
      update public.clients set deactivated_at=${new Date(sampledAt.getTime() - closureDays * day)},
        deactivation_reason='closure'
      where id=${ids.client}
    `;
    await tx`
      insert into app_private.refund_auth_lockouts(client_id,auth_user_id,status,completed_at)
      values(
        ${ids.client},${client!.auth_user_id},${status},
        ${completedDays === undefined ? null : new Date(sampledAt.getTime() - completedDays * day)}
      )
    `;
    return {
      clientId: ids.client,
      workspaceId: f.wsA.id,
      subscriptionId: ids.subscription,
    };
  });
}

async function underMutant<T>(
  signature: string,
  control: string,
  replacement: string,
  probe: (tx: TransactionSql) => Promise<T>,
) {
  let value: T | undefined;
  try {
    await db.begin(async (tx) => {
      const [row] = await tx`
        select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
      `;
      const definition = row!.definition as string;
      const mutated = definition.replace(control, replacement);
      expect(mutated, 'the lock predicate exists').not.toBe(definition);
      await tx.unsafe(mutated);
      value = await probe(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return value;
}

it('T004 holds closure data while open and restarts 30 days at resolution', async () => {
  const pendingClient = await clientWithLockout('pending', 60);
  const retryClient = await clientWithLockout('retry', 60);
  const recentlyResolvedClient = await clientWithLockout('succeeded', 60, 29);
  const resolvedClient = await clientWithLockout('succeeded', 60, 30);
  const unrelated = await clientWithLockout('succeeded', 60, 60);
  let auditId = '';

  await db.begin(async (tx) => {
    const [audit] = await tx`
      insert into public.audit_events(
        actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
      ) values (
        null,'retention.hold_probe','clients',${pendingClient.clientId},
        (select workspace_id from public.clients where id=${pendingClient.clientId}),
        '{}'::jsonb,${new Date(sampledAt.getTime() - 40 * day)}
      ) returning id
    `;
    auditId = String(audit!.id);
    await tx`
      insert into app_private.subscription_entitlement_projection(
        workspace_id,subscription_id,status,effective_end_exclusive,as_of_date
      ) values (${unrelated.workspaceId},${unrelated.subscriptionId},'expired',null,'2026-11-24')
    `;
    await tx`
      insert into public.jobs(kind,workspace_id,idempotency_key,status)
      values ('forms.alert',${unrelated.workspaceId},${`retention-hold-${unrelated.clientId}`},'running')
    `;
  });

  const candidates = await db`
    select data_class,record_id,client_id
    from app_private.purge_retention_candidates(${sampledAt})
  `;
  const clientRows = candidates.filter(
    (row) => row.data_class !== 'audit_event',
  );
  expect(
    clientRows.some((row) => row.client_id === pendingClient.clientId),
  ).toBe(false);
  expect(clientRows.some((row) => row.client_id === retryClient.clientId)).toBe(
    false,
  );
  expect(
    clientRows.some((row) => row.client_id === recentlyResolvedClient.clientId),
  ).toBe(false);
  expect(
    clientRows.some((row) => row.client_id === resolvedClient.clientId),
  ).toBe(true);
  expect(clientRows.some((row) => row.client_id === unrelated.clientId)).toBe(
    true,
  );
  expect(
    candidates.some(
      (row) => row.data_class === 'audit_event' && row.record_id === auditId,
    ),
  ).toBe(true);
  expect(candidates.some((row) => row.data_class === 'dispute')).toBe(false);

  const signature = 'app_private.purge_retention_candidates(timestamptz)';
  const control = "and (l.id is null or l.status = 'succeeded')";
  const [before] = await db`
    select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
  `;
  const hashBefore = createHash('sha256')
    .update(before!.definition as string)
    .digest('hex');
  const leaked = (await underMutant(
    signature,
    control,
    'and true',
    async (tx) =>
      tx`
        select data_class,record_id,client_id
        from app_private.purge_retention_candidates(${sampledAt})
      `,
  )) as Array<{
    data_class: string;
    record_id: string;
    client_id: string | null;
  }>;
  expect(leaked.some((row) => row.client_id === pendingClient.clientId)).toBe(
    true,
  );
  const [after] = await db`
    select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
  `;
  expect(after!.definition).toBe(before!.definition);
  expect(
    createHash('sha256')
      .update(after!.definition as string)
      .digest('hex'),
  ).toBe(hashBefore);
});
