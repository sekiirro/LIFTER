import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const day = 24 * 60 * 60 * 1000;
const rollback = new Error('rollback audit-trigger probe');
afterAll(() => db.end());

async function purgeAsOwner(
  tx: TransactionSql,
  ownerId: string,
  runId: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ownerId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select app_private.purge_retention_for_platform_owner(${runId},'apply') as value
    `;
    return row!.value as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

async function blockedByImmutableTrigger(
  operation: (tx: TransactionSql) => Promise<unknown>,
) {
  let blocked = false;
  try {
    await db.begin(async (tx) => {
      try {
        await operation(tx);
      } catch (error) {
        blocked = (error as { code?: string }).code === '23514';
      }
      if (!blocked) throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return blocked;
}

it('T007 keeps audit rows immutable outside the purge path and pseudonymizes expired rows', async () => {
  const f = await clientContext();
  const now = Date.now();
  const oldAt = new Date(now - 45 * day);
  const recentAt = new Date(now - 29 * day);
  let expiredId = '';
  let recentId = '';
  let clientId = '';

  await db.begin(async (tx) => {
    const ids = await graph(tx, f);
    clientId = ids.client;
    const [client] = await tx`
      select auth_user_id from public.clients where id=${clientId}::uuid
    `;
    await tx`set local session_replication_role = replica`;
    await tx`
      update public.clients
      set deactivated_at=${new Date(now - 60 * day)}, deactivation_reason='closure'
      where id=${clientId}::uuid
    `;
    await tx`set local session_replication_role = origin`;
    const expiredInsert = await tx`
      insert into public.audit_events(
        actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
      ) values (
        ${client!.auth_user_id},'client.updated','clients',${clientId}::uuid,
        ${f.wsA.id}::uuid,
        ${tx.json({ client_id: clientId, name: 'Purge Audit Fixture', email: 'purge-audit@example.invalid', phone: '+201000000001' })},
        ${oldAt}
      ) returning id
    `;
    expiredId = String(expiredInsert[0]!.id);
    const recent = await tx`
      insert into public.audit_events(
        actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
      ) values (
        ${client!.auth_user_id},'client.updated','clients',${clientId}::uuid,
        ${f.wsA.id}::uuid,
        ${tx.json({ client_id: clientId, name: 'Purge Audit Fixture', email: 'purge-audit@example.invalid', phone: '+201000000001' })},
        ${recentAt}
      ) returning id
    `;
    recentId = String(recent[0]!.id);

    const [before] = await tx`
      select id,actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
      from public.audit_events where id=${recentId}
    `;
    const beforeRecent = before;
    const runId = randomUUID();
    const result = await purgeAsOwner(tx, f.po.userId, runId);
    expect(result).toMatchObject({ status: 'applied' });

    const [expiredRow] = await tx`
      select id,actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
      from public.audit_events where id=${expiredId}
    `;
    expect(expiredRow).toBeDefined();
    expect(expiredRow!.id).toBe(expiredId);
    expect(expiredRow!.actor_user_id).toBeNull();
    expect(expiredRow!.action).toBe('client.updated');
    expect(expiredRow!.target_table).toBe('retention_purged');
    expect(expiredRow!.target_id).not.toBe(clientId);
    expect(expiredRow!.workspace_id).toBeNull();
    expect(expiredRow!.details).toEqual({});
    expect(JSON.stringify(expiredRow)).not.toMatch(
      /client_id|Purge Audit Fixture|purge-audit@example\.invalid|\+201000000001/i,
    );
    expect(JSON.stringify(expiredRow)).not.toContain(clientId);
    const [afterRecent] = await tx`
      select id,actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
      from public.audit_events where id=${recentId}
    `;
    expect(afterRecent).toEqual(beforeRecent);
  });

  expect(
    await blockedByImmutableTrigger(
      async (tx) =>
        tx`update public.audit_events set details='{}'::jsonb where id=${recentId}`,
    ),
  ).toBe(true);
  expect(
    await blockedByImmutableTrigger(
      async (tx) => tx`delete from public.audit_events where id=${recentId}`,
    ),
  ).toBe(true);
  expect(
    await blockedByImmutableTrigger(
      async (tx) => tx`truncate public.audit_events`,
    ),
  ).toBe(true);
});
