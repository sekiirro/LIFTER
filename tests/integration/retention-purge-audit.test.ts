import { createHash, randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const day = 24 * 60 * 60 * 1000;
const rollback = new Error('rollback audit-trigger probe');
const mutationRollback = new Error('rollback audit-trigger mutation');
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
        await tx.savepoint(async (inner) => operation(inner));
      } catch {
        blocked = true;
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

  await db
    .begin(async (tx) => {
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
      expect(result).toMatchObject({
        status: 'applied',
        pseudonymized_audit_events: 1,
      });

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

      const [functionInfo] = await tx`
      select p.prosecdef as security_definer,
        p.proowner = 'postgres'::regrole as postgres_owned,
        p.proconfig as function_config,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
      from pg_catalog.pg_proc p
      where p.oid='app_private.purge_retention_pseudonymize_audit(uuid,timestamptz)'::regprocedure
    `;
      expect(functionInfo).toMatchObject({
        security_definer: true,
        postgres_owned: true,
        authenticated_execute: false,
        anon_execute: false,
        service_execute: false,
      });
      expect(functionInfo!.function_config).toContain('search_path=""');

      const [predicateInfo] = await tx`
      select p.prosecdef as security_definer,
        p.proowner = 'postgres'::regrole as postgres_owned,
        p.proconfig as function_config,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
      from pg_catalog.pg_proc p
      where p.oid='app_private.retention_purge_audit_context_allows(oid,text)'::regprocedure
    `;
      expect(predicateInfo).toMatchObject({
        security_definer: false,
        postgres_owned: true,
        authenticated_execute: true,
        anon_execute: true,
        service_execute: true,
      });
      expect(predicateInfo!.function_config).toContain('search_path=""');
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) throw error;
    });

  const [protectedAudit] = await db`
    insert into public.audit_events(action,target_table,target_id,details)
    values ('retention.guard_probe','test',${randomUUID()}::uuid,'{}'::jsonb)
    returning id
  `;
  const protectedAuditId = String(protectedAudit!.id);

  expect(
    await blockedByImmutableTrigger(
      async (tx) =>
        tx`update public.audit_events set details='{}'::jsonb where id=${protectedAuditId}`,
    ),
  ).toBe(true);
  expect(
    await blockedByImmutableTrigger(
      async (tx) =>
        tx`delete from public.audit_events where id=${protectedAuditId}`,
    ),
  ).toBe(true);
  expect(
    await blockedByImmutableTrigger(
      async (tx) => tx`truncate public.audit_events`,
    ),
  ).toBe(true);
});

it('T007 kills removal of the run-scoped audit UPDATE guard and restores its function exactly', async () => {
  const [before] = await db`
    select pg_catalog.pg_get_functiondef('app_private.audit_events_immutable()'::regprocedure) as definition
  `;
  const beforeDefinition = before!.definition as string;
  const beforeHash = createHash('sha256')
    .update(beforeDefinition)
    .digest('hex');
  let leaked = 0;

  await db
    .begin(async (tx) => {
      const control =
        "and app_private.retention_purge_audit_context_allows(tg_relid,'UPDATE')";
      const mutated = beforeDefinition.replace(control, 'and true');
      expect(mutated, 'the run-scoped allowlist guard exists').not.toBe(
        beforeDefinition,
      );
      await tx.unsafe(mutated);
      const [row] = await tx`
        insert into public.audit_events(action,target_table,target_id,details)
        values ('retention.guard_probe','test',${randomUUID()}::uuid,'{}'::jsonb)
        returning id
      `;
      const changed = await tx`
        update public.audit_events
        set actor_user_id=null,target_table='retention_purged',target_id=${randomUUID()}::uuid,
          workspace_id=null,details='{}'::jsonb
        where id=${row!.id}
        returning id
      `;
      leaked = changed.length;
      throw mutationRollback;
    })
    .catch((error) => {
      if (error !== mutationRollback) throw error;
    });

  expect(leaked).toBe(1);
  expect(() => expect(leaked).toBe(0)).toThrow();
  const [after] = await db`
    select pg_catalog.pg_get_functiondef('app_private.audit_events_immutable()'::regprocedure) as definition
  `;
  expect(after!.definition).toBe(beforeDefinition);
  expect(
    createHash('sha256')
      .update(after!.definition as string)
      .digest('hex'),
  ).toBe(beforeHash);
});

it('T014 rolls back client deletion and run evidence when audit row counts do not match', async () => {
  const f = await clientContext();
  const now = Date.now();
  const runId = randomUUID();
  const rollbackAll = new Error('rollback audit row-count fixture');

  await db
    .begin(async (tx) => {
      const ids = await graph(tx, f);
      const [client] = await tx`
        select auth_user_id from public.clients where id=${ids.client}::uuid
      `;
      const actorId = client!.auth_user_id as string;
      await tx`set local session_replication_role = replica`;
      await tx`
        update public.clients
        set deactivated_at=${new Date(now - 60 * day)},deactivation_reason='closure'
        where id=${ids.client}::uuid
      `;
      await tx`set local session_replication_role = origin`;
      const [audit] = await tx`
        insert into public.audit_events(
          actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
        ) values (
          ${actorId}::uuid,'client.updated','clients',${ids.client}::uuid,
          ${f.wsA.id}::uuid,${tx.json({ client_id: ids.client, email: 'atomic-audit@example.invalid' })},
          ${new Date(now - 45 * day)}
        ) returning id
      `;
      const [clientBefore] = await tx`
        select count(*)::integer as rows from public.clients where id=${ids.client}::uuid
      `;
      expect(clientBefore!.rows).toBe(1);

      await tx.unsafe(`
        create function app_private.test_skip_retention_audit_update() returns trigger
        language plpgsql set search_path = '' as $$ begin return null; end $$
      `);
      await tx.unsafe(`
        create trigger a_retention_purge_test_skip_audit_update
        before update on public.audit_events
        for each row execute function app_private.test_skip_retention_audit_update()
      `);

      let applyError: unknown;
      try {
        await tx.savepoint(async (inner) => {
          await inner`select app_private.purge_retention_apply(${runId}::uuid,'apply')`;
        });
      } catch (error) {
        applyError = error;
      }
      expect(applyError).toMatchObject({
        code: 'P0001',
        message: expect.stringContaining('audit_events expected'),
      });

      const [state] = await tx`
        select
          (select count(*)::integer from public.clients where id=${ids.client}::uuid) as clients,
          (select count(*)::integer from public.audit_events where id=${audit!.id} and actor_user_id=${actorId}::uuid) as audit_rows,
          (select count(*)::integer from app_private.retention_purge_runs where run_id=${runId}::uuid) as runs
      `;
      expect(state).toEqual({ clients: 1, audit_rows: 1, runs: 0 });
      await tx.unsafe(
        'drop trigger a_retention_purge_test_skip_audit_update on public.audit_events',
      );
      await tx.unsafe(
        'drop function app_private.test_skip_retention_audit_update()',
      );
      throw rollbackAll;
    })
    .catch((error) => {
      if (error !== rollbackAll) throw error;
    });
});
