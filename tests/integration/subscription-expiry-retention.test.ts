import { createHash, randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

// Spec 028 T009 (FR-011 / FR-012 / SC-006): expiry notice rows reuse F26's
// retention clocks and allowlist. All principals and records are synthetic.
const db = sql();
const rollback = new Error('rollback expiry retention fixture');
const day = 24 * 60 * 60 * 1000;
const sampledAt = new Date('2026-11-28T12:00:00.000Z');
afterAll(() => db.end());

type Fixture = Awaited<ReturnType<typeof clientContext>>;
type GraphIds = Awaited<ReturnType<typeof graph>>;

async function seedNoticeRows(tx: TransactionSql, f: Fixture, ids: GraphIds) {
  await tx`set local session_replication_role = replica`;
  const [clientNotice] = await tx`
    insert into app_private.client_inbox_notices(
      workspace_id, client_id, notice_kind, source_key, source_revision, source_stage
    ) values (
      ${f.wsA.id}::uuid, ${ids.client}::uuid, 'subscription_expired',
      ${ids.subscription}::uuid, '2026-11-01', 'expiry'
    ) returning id
  `;
  const [staffNotice] = await tx`
    insert into app_private.staff_inbox_notices(
      workspace_id, recipient_user_id, notice_kind, source_key,
      source_revision, source_stage, client_id
    ) values (
      ${f.wsA.id}::uuid, ${f.po.userId}::uuid, 'subscription_expired',
      ${ids.subscription}::uuid, '2026-11-01', 'expiry', ${ids.client}::uuid
    ) returning id
  `;
  await tx`set local session_replication_role = origin`;
  return {
    clientNoticeId: String(clientNotice!.id),
    staffNoticeId: String(staffNotice!.id),
  };
}

async function closeAt(tx: TransactionSql, ids: GraphIds, daysAgo: number) {
  await tx`set local session_replication_role = replica`;
  await tx`
    update public.clients
    set deactivated_at = ${new Date(sampledAt.getTime() - daysAgo * day)},
        deactivation_reason = 'closure'
    where id = ${ids.client}::uuid
  `;
  await tx`set local session_replication_role = origin`;
}

async function noticeCandidates(tx: TransactionSql, clientId: string) {
  return tx`
    select data_class, record_id, client_id
    from app_private.purge_retention_candidates(${sampledAt}::timestamptz)
    where client_id = ${clientId}::uuid
      and data_class in ('client_notice', 'staff_notice')
    order by data_class, record_id
  `;
}

async function applyPurge(tx: TransactionSql, ownerId: string, runId: string) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({
    sub: ownerId,
    role: 'authenticated',
  })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select app_private.purge_retention_for_platform_owner(
        ${runId}::uuid, 'apply') as value
    `;
    return row!.value as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

it('T009 keeps expiry notices on active/inside-window accounts and purges linked notice IDs after 30 days', async () => {
  const f = await clientContext();
  try {
    await db.begin(async (tx) => {
      const ids = await graph(tx, f);
      const notices = await seedNoticeRows(tx, f, ids);

      expect(await noticeCandidates(tx, ids.client)).toEqual([]);
      await closeAt(tx, ids, 29);
      expect(await noticeCandidates(tx, ids.client)).toEqual([]);

      await closeAt(tx, ids, 60);
      const eligible = await noticeCandidates(tx, ids.client);
      expect(eligible).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data_class: 'client_notice',
            record_id: notices.clientNoticeId,
            client_id: ids.client,
          }),
          expect.objectContaining({
            data_class: 'staff_notice',
            record_id: notices.staffNoticeId,
            client_id: ids.client,
          }),
        ]),
      );
      expect(eligible.every((row) => row.client_id === ids.client)).toBe(true);

      const result = await applyPurge(tx, f.po.userId, randomUUID());
      expect(result).toMatchObject({ status: 'applied' });
      const [counts] = await tx`
        select
          (select count(*)::integer from app_private.client_inbox_notices
            where id = ${notices.clientNoticeId}::uuid) as client_notices,
          (select count(*)::integer from app_private.staff_inbox_notices
            where id = ${notices.staffNoticeId}::uuid) as staff_notices,
          (select count(*)::integer from public.clients
            where id = ${ids.client}::uuid) as clients
      `;
      expect(counts).toEqual({
        client_notices: 0,
        staff_notices: 0,
        clients: 0,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

it('T009 pauses the notice clock for open refund lockouts and restarts 30 days on resolution', async () => {
  const f = await clientContext();
  try {
    await db.begin(async (tx) => {
      const ids = await graph(tx, f);
      const notices = await seedNoticeRows(tx, f, ids);
      const [client] = await tx`
        select auth_user_id from public.clients where id = ${ids.client}::uuid
      `;
      await closeAt(tx, ids, 60);
      await tx`
        insert into app_private.refund_auth_lockouts(client_id, auth_user_id, status)
        values (${ids.client}::uuid, ${client!.auth_user_id}::uuid, 'pending')
      `;

      expect(await noticeCandidates(tx, ids.client)).toEqual([]);
      await tx`
        update app_private.refund_auth_lockouts
        set status = 'retry' where client_id = ${ids.client}::uuid
      `;
      expect(await noticeCandidates(tx, ids.client)).toEqual([]);

      await tx`
        update app_private.refund_auth_lockouts
        set status = 'succeeded', completed_at = ${new Date(sampledAt.getTime() - 29 * day)}
        where client_id = ${ids.client}::uuid
      `;
      expect(await noticeCandidates(tx, ids.client)).toEqual([]);

      await tx`
        update app_private.refund_auth_lockouts
        set completed_at = ${new Date(sampledAt.getTime() - 30 * day)}
        where client_id = ${ids.client}::uuid
      `;
      expect((await noticeCandidates(tx, ids.client)).length).toBe(2);

      // Mutation evidence: removing the refund-hold predicate must expose the
      // held notice rows; the definition is restored by the savepoint.
      const signature =
        'app_private.purge_retention_candidates_pre_p7_dispute_hold(timestamptz)';
      const control = "and (l.id is null or l.status = 'succeeded')";
      const [before] = await tx`
        select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
      `;
      let leaked = 0;
      await tx
        .savepoint(async (inner) => {
          const mutated = (before!.definition as string).replace(
            control,
            'and true',
          );
          expect(mutated, 'the refund-hold predicate exists').not.toBe(
            before!.definition,
          );
          await inner.unsafe(mutated);
          await inner`
          update app_private.refund_auth_lockouts
          set status = 'pending', completed_at = null
          where client_id = ${ids.client}::uuid
        `;
          leaked = (await noticeCandidates(inner, ids.client)).length;
          expect(leaked, 'mutant exposes held notice rows').toBe(2);
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });
      expect(leaked).toBe(2);
      expect(() => expect(leaked).toBe(0)).toThrow();
      const [after] = await tx`
        select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
      `;
      expect(after!.definition).toBe(before!.definition);
      expect(
        createHash('sha256')
          .update(after!.definition as string)
          .digest('hex'),
      ).toBe(
        createHash('sha256')
          .update(before!.definition as string)
          .digest('hex'),
      );

      // Restore the resolved state and confirm the notice rows still purge.
      await tx`
        update app_private.refund_auth_lockouts
        set status = 'succeeded', completed_at = ${new Date(sampledAt.getTime() - 30 * day)}
        where client_id = ${ids.client}::uuid
      `;
      expect((await noticeCandidates(tx, ids.client)).length).toBe(2);
      expect(notices.clientNoticeId).toBeTruthy();
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

it('T009 introduces no dispute-derived retention hold for expiry notices', async () => {
  const [catalog] = await db`
    select
      (select coalesce(array_agg(n.nspname || '.' || c.relname order by 1), '{}'::text[])
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'app_private')
          and c.relkind in ('r', 'p', 'v', 'm')
          and c.relname ilike '%dispute%') as relations,
      (select coalesce(array_agg(n.nspname || '.' || p.proname order by 1), '{}'::text[])
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_private')
          and p.proname ilike '%dispute%') as functions
  `;
  expect(catalog!.relations).toEqual([]);
  expect(catalog!.functions).toEqual([
    'app_private.p7_retention_has_open_dispute',
    'app_private.purge_retention_candidates_pre_p7_dispute_hold',
  ]);

  const allowlist = await db`
    select c.relname as relation, a.can_delete, a.can_update, a.traverse
    from app_private.retention_purge_allowlist a
    join pg_catalog.pg_class c on c.oid = a.table_oid
    where c.relname in ('client_inbox_notices', 'staff_inbox_notices', 'audit_events')
    order by 1
  `;
  expect(allowlist).toEqual([
    {
      relation: 'audit_events',
      can_delete: false,
      can_update: true,
      traverse: false,
    },
    {
      relation: 'client_inbox_notices',
      can_delete: true,
      can_update: false,
      traverse: true,
    },
    {
      relation: 'staff_inbox_notices',
      can_delete: true,
      can_update: false,
      traverse: true,
    },
  ]);
});

it('T009 keeps the audit event clock independent of the relationship-end clock', async () => {
  const f = await clientContext();
  try {
    await db.begin(async (tx) => {
      const ids = await graph(tx, f);
      await seedNoticeRows(tx, f, ids);
      await closeAt(tx, ids, 60);
      const [client] = await tx`
        select auth_user_id from public.clients where id = ${ids.client}::uuid
      `;
      const [oldAudit] = await tx`
        insert into public.audit_events(
          actor_user_id, action, target_table, target_id, workspace_id, details, occurred_at
        ) values (
          ${client!.auth_user_id}::uuid, 'client.updated', 'clients', ${ids.client}::uuid,
          ${f.wsA.id}::uuid, ${tx.json({ client_id: ids.client })},
          ${new Date(sampledAt.getTime() - 45 * day)}
        ) returning id
      `;
      const [recentAudit] = await tx`
        insert into public.audit_events(
          actor_user_id, action, target_table, target_id, workspace_id, details, occurred_at
        ) values (
          ${client!.auth_user_id}::uuid, 'client.updated', 'clients', ${ids.client}::uuid,
          ${f.wsA.id}::uuid, ${tx.json({ client_id: ids.client })},
          ${new Date(sampledAt.getTime() - 29 * day)}
        ) returning id, actor_user_id, details
      `;

      await applyPurge(tx, f.po.userId, randomUUID());
      const [old] = await tx`
        select actor_user_id, target_table, workspace_id, details
        from public.audit_events where id = ${oldAudit!.id}::bigint
      `;
      expect(old).toMatchObject({
        actor_user_id: null,
        target_table: 'retention_purged',
        workspace_id: null,
        details: {},
      });
      const [recent] = await tx`
        select actor_user_id, details
        from public.audit_events where id = ${recentAudit!.id}::bigint
      `;
      expect(recent).toEqual({
        actor_user_id: recentAudit!.actor_user_id,
        details: recentAudit!.details,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
