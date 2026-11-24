import { createHash, randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const rollback = new Error('rollback retention apply fixtures');
const mutationRollback = new Error('rollback retention guard mutation');

afterAll(() => db.end());

async function refund(tx: TransactionSql, actorId: string, input: object) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actorId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.record_refund(${tx.json(input as never)}) as result
    `;
    return row!.result as { status: string };
  } finally {
    await tx`reset role`;
  }
}

async function purgeAsOwner(
  tx: TransactionSql,
  ownerId: string,
  runId: string,
  mode: 'dry_run' | 'apply',
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ownerId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select app_private.purge_retention_for_platform_owner(${runId},${mode}) as value
    `;
    return row!.value as Record<string, unknown>;
  } finally {
    await tx`reset role`;
  }
}

async function underGuardMutant<T>(probe: (tx: TransactionSql) => Promise<T>) {
  let observed: T | undefined;
  await db
    .begin(async (tx) => {
      const signature = 'app_private.forbid_delete()';
      const [row] = await tx`
      select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
    `;
      const definition = row!.definition as string;
      const control =
        "app_private.retention_purge_context_allows(tg_relid, 'DELETE')";
      const mutated = definition.replace(control, 'true');
      expect(
        mutated,
        'the run-scoped table/operation allowlist exists',
      ).not.toBe(definition);
      await tx.unsafe(mutated);
      observed = await probe(tx);
      throw mutationRollback;
    })
    .catch((error) => {
      if (error !== mutationRollback) throw error;
    });
  return observed;
}

describe.runIf(process.env.LIFTER_SUPABASE_STACK === 'e')(
  'F26 dry-run and apply evidence (Stack E only)',
  () => {
    it('denies a non-run ledger delete and kills removal of the allowlist check', async () => {
      const f = await clientContext();
      let clientId = '';
      await db.begin(async (tx) => {
        const ids = await graph(tx, f);
        clientId = ids.client;
        const [client] = await tx`
          select auth_user_id from public.clients where id=${ids.client}::uuid
        `;
        await tx`
          insert into app_private.account_deletion_intents(
            target_user_id,target_kind,client_id,workspace_id,authorized_by_user_id,authorized_capability
          ) values (${client!.auth_user_id},'client',${ids.client},${f.wsA.id},${f.po.userId},'delete_client')
        `;
      });

      await expect(
        db.begin(async (tx) => {
          await tx`
            delete from app_private.account_deletion_intents where client_id=${clientId}::uuid
          `;
        }),
      ).rejects.toMatchObject({ code: '23514' });

      const [before] = await db`
        select pg_catalog.pg_get_functiondef('app_private.forbid_delete()'::regprocedure) as definition
      `;
      const beforeHash = createHash('sha256')
        .update(before!.definition as string)
        .digest('hex');
      const leaked = await underGuardMutant(async (tx) => {
        const rows = await tx`
          delete from app_private.account_deletion_intents
          where client_id=${clientId}::uuid returning client_id
        `;
        return rows.length;
      });
      expect(leaked).toBe(1);
      const [after] = await db`
        select pg_catalog.pg_get_functiondef('app_private.forbid_delete()'::regprocedure) as definition
      `;
      expect(after!.definition).toBe(before!.definition);
      expect(
        createHash('sha256')
          .update(after!.definition as string)
          .digest('hex'),
      ).toBe(beforeHash);
    });

    it('rolls back a failed apply and retries the same run id without partial evidence', async () => {
      const f = await clientContext();
      const [ids] = await db.begin(async (tx) => {
        const graphIds = await graph(tx, f);
        await tx`set local session_replication_role = replica`;
        await tx`
          update public.clients set deactivated_at=clock_timestamp()-interval '31 days',
            deactivation_reason='closure'
          where workspace_id=${f.wsA.id} and id=${graphIds.client}::uuid
        `;
        await tx`set local session_replication_role = origin`;
        return [graphIds];
      });
      const runId = randomUUID();
      await db.unsafe(`create function app_private.test_retention_purge_fail_client_delete() returns trigger
        language plpgsql set search_path='' as $$ begin
          raise exception 'retention_test_failure' using errcode='23514';
        end $$`);
      await db.unsafe(`create trigger z_test_retention_purge_failure before delete on public.clients
        for each row execute function app_private.test_retention_purge_fail_client_delete()`);
      try {
        await expect(
          db.begin(async (tx) => {
            const value = await purgeAsOwner(tx, f.po.userId, runId, 'apply');
            return value;
          }),
        ).rejects.toMatchObject({ code: '23514' });
        const [afterFailure] = await db`
          select
            (select count(*)::integer from public.clients where id=${ids.client}::uuid) as clients,
            (select count(*)::integer from public.subscriptions where id=${ids.subscription}::uuid) as subscriptions,
            (select count(*)::integer from app_private.retention_purge_runs where run_id=${runId}::uuid) as run_rows
        `;
        expect(afterFailure).toEqual({
          clients: 1,
          subscriptions: 1,
          run_rows: 0,
        });
      } finally {
        await db.unsafe(
          'drop trigger if exists z_test_retention_purge_failure on public.clients',
        );
        await db.unsafe(
          'drop function if exists app_private.test_retention_purge_fail_client_delete()',
        );
      }
      const [retry] = await db.begin(async (tx) => [
        await purgeAsOwner(tx, f.po.userId, runId, 'apply'),
      ]);
      expect(retry).toMatchObject({ status: 'applied' });
      const [afterRetry] = await db`
        select count(*)::integer as clients from public.clients where id=${ids.client}::uuid
      `;
      expect(afterRetry!.clients).toBe(0);
    });

    it('fails closed and rolls back when a child delete changes a parent target tuple', async () => {
      const f = await clientContext();
      const [ids] = await db.begin(async (tx) => {
        const graphIds = await graph(tx, f);
        await tx`set local session_replication_role = replica`;
        await tx`
          update public.clients set deactivated_at=clock_timestamp()-interval '31 days',
            deactivation_reason='closure'
          where workspace_id=${f.wsA.id} and id=${graphIds.client}::uuid
        `;
        await tx`set local session_replication_role = origin`;
        return [graphIds];
      });
      const runId = randomUUID();

      await expect(
        db.begin(async (tx) => {
          await tx.unsafe(
            'alter table public.clients disable trigger f12_client_transition',
          );
          await tx.unsafe(`create function app_private.test_bump_client_after_installment_delete()
          returns trigger language plpgsql set search_path='' as $$ begin
            update public.clients c set name=c.name
            from public.subscriptions s
            where s.id=old.subscription_id and c.id=s.client_id;
            return old;
          end $$`);
          await tx.unsafe(`create trigger z_test_retention_bump_client
          after delete on public.subscription_installments
          for each row execute function app_private.test_bump_client_after_installment_delete()`);
          const result = await purgeAsOwner(tx, f.po.userId, runId, 'apply');
          throw new Error(`purge unexpectedly returned ${result.status}`);
        }),
      ).rejects.toMatchObject({
        code: 'P0001',
        message: expect.stringContaining('public.clients'),
      });

      const [afterFailure] = await db`
        select
          (select count(*)::integer from public.clients where id=${ids.client}::uuid) as clients,
          (select count(*)::integer from public.subscriptions where id=${ids.subscription}::uuid) as subscriptions,
          (select count(*)::integer from public.subscription_installments where id=${ids.obligation}::uuid) as installments,
          (select count(*)::integer from app_private.registration_operations where id=${ids.operation}::uuid) as operations,
          (select count(*)::integer from public.payment_events where id=${ids.event}::uuid) as payments,
          (select count(*)::integer from app_private.retention_purge_runs where run_id=${runId}::uuid) as run_rows
      `;
      expect(afterFailure).toEqual({
        clients: 1,
        subscriptions: 1,
        installments: 1,
        operations: 1,
        payments: 1,
        run_rows: 0,
      });
    });

    it('keeps dry-run read-only, replays one apply, and preserves retained money facts and staff reads', async () => {
      const f = await clientContext();
      let step = 'graph';
      await expect(
        db
          .begin(async (tx) => {
            const ids = await graph(tx, f);
            step = 'refund';
            const refundResult = await refund(tx, f.po.userId, {
              workspace_id: f.wsA.id,
              client_id: ids.client,
              purchase_id: ids.subscription,
              request_key: randomUUID(),
              amount_minor: '1200',
              external_confirmation: true,
            });
            expect(refundResult.status).toBe('ok');

            step = 'age closure and resolve lockout';
            await tx`set local session_replication_role = replica`;
            await tx`
            update public.clients set deactivated_at=clock_timestamp()-interval '31 days',
              deactivation_reason='closure'
            where workspace_id=${f.wsA.id} and id=${ids.client}
          `;
            await tx`
            update app_private.refund_auth_lockouts
            set status='succeeded',completed_at=clock_timestamp()-interval '31 days'
            where client_id=${ids.client}::uuid
          `;
            await tx`set local session_replication_role = origin`;

            const [refundRow] = await tx`
            select id from public.refund_operations
            where workspace_id=${f.wsA.id} and client_id=${ids.client}::uuid
          `;
            const refundId = refundRow!.id as string;
            step = 'capture ledger baseline';
            step = 'payment baseline';
            const [paymentBefore] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'commission_minor',commission_minor::text,'collected_on',collected_on,
                'effective_on',effective_on,'recorded_at',recorded_at) order by id) as value
              from public.payment_events where id=${ids.event}::uuid
            `;
            step = 'refund baseline';
            const [refundBefore] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'effective_on',effective_on,'recorded_at',recorded_at) order by id) as value
              from public.refund_operations where id=${refundId}::uuid
            `;
            step = 'allocation baseline';
            const [allocationBefore] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'commission_minor',commission_minor::text,'currency',currency,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id) as value
              from public.refund_allocation_events where refund_operation_id=${refundId}::uuid
            `;
            step = 'cancellation baseline';
            const [cancellationBefore] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id) as value
              from public.subscription_obligation_cancellations where refund_operation_id=${refundId}::uuid
            `;
            const before = {
              payments: paymentBefore!.value,
              refunds: refundBefore!.value,
              allocations: allocationBefore!.value,
              cancellations: cancellationBefore!.value,
            };
            const [auditBefore] = await tx`
            select count(*)::integer as audit_rows from public.audit_events
              where target_table='clients' and target_id=${ids.client}::uuid
          `;

            const dryRunId = randomUUID();
            step = 'dry-run';
            const dryRun = await purgeAsOwner(
              tx,
              f.po.userId,
              dryRunId,
              'dry_run',
            );
            expect(dryRun).toMatchObject({ status: 'dry_run' });
            expect(JSON.stringify(dryRun)).toContain(
              'PO states Egyptian legal advice was obtained',
            );
            expect(JSON.stringify(dryRun)).toContain('S70-PO-1 item 3');
            expect(JSON.stringify(dryRun)).not.toMatch(
              /client_id|email|phone|client_name|raw_ip|ip_key|lawyer_name|lawyer_date|lawyer_file|lawyer_citation/i,
            );
            const [afterDryRun] = await tx`
            select
              (select count(*)::integer from public.clients where workspace_id=${f.wsA.id} and id=${ids.client}::uuid) as clients,
              (select count(*)::integer from public.audit_events where target_table='clients' and target_id=${ids.client}::uuid) as audit_rows
          `;
            expect(afterDryRun!.clients).toBe(1);
            expect(afterDryRun!.audit_rows).toBe(auditBefore!.audit_rows);

            const runId = randomUUID();
            step = 'apply and replay';
            const applied = await purgeAsOwner(tx, f.po.userId, runId, 'apply');
            expect(applied).toMatchObject({ status: 'applied' });
            const replay = await purgeAsOwner(tx, f.po.userId, runId, 'apply');
            expect(replay).toMatchObject({ status: 'replayed' });

            const [afterApply] = await tx`
            select
              (select count(*)::integer from public.clients where workspace_id=${f.wsA.id} and id=${ids.client}::uuid) as clients,
              (select count(*)::integer from public.subscriptions where workspace_id=${f.wsA.id} and id=${ids.subscription}::uuid) as subscriptions,
              (select count(*)::integer from app_private.registration_operations where workspace_id=${f.wsA.id} and id=${ids.operation}::uuid) as operations,
              (select count(*)::integer from public.refund_operations where id=${refundId}::uuid and client_id is not null) as identified_refunds,
              (select count(*)::integer from app_private.retention_purge_runs where run_id=${runId}) as run_rows
          `;
            expect(afterApply).toEqual({
              clients: 0,
              subscriptions: 0,
              operations: 0,
              identified_refunds: 0,
              run_rows: 1,
            });
            const [runEvidence] = await tx`
            select result from app_private.retention_purge_runs where run_id=${runId}::uuid
          `;
            expect(runEvidence!.result).toMatchObject({ status: 'applied' });
            expect(JSON.stringify(runEvidence!.result)).not.toMatch(
              /client_id|email|phone|client_name|raw_ip|ip_key|lawyer_name|lawyer_date|lawyer_file|lawyer_citation/i,
            );

            step = 'compare retained ledger facts';
            step = 'payment comparison';
            const [paymentAfter] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'commission_minor',commission_minor::text,'collected_on',collected_on,
                'effective_on',effective_on,'recorded_at',recorded_at) order by id) as value
              from public.payment_events where id=${ids.event}::uuid
            `;
            step = 'refund comparison';
            const [refundAfter] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'effective_on',effective_on,'recorded_at',recorded_at) order by id) as value
              from public.refund_operations where id=${refundId}::uuid
            `;
            step = 'allocation comparison';
            const [allocationAfter] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'commission_minor',commission_minor::text,'currency',currency,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id) as value
              from public.refund_allocation_events where refund_operation_id=${refundId}::uuid
            `;
            step = 'cancellation comparison';
            const [cancellationAfter] = await tx`
              select jsonb_agg(jsonb_build_object('id',id,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id) as value
              from public.subscription_obligation_cancellations where refund_operation_id=${refundId}::uuid
            `;
            const after = {
              payments: paymentAfter!.value,
              refunds: refundAfter!.value,
              allocations: allocationAfter!.value,
              cancellations: cancellationAfter!.value,
            };
            expect(after).toEqual(before);

            const [pathCheck] = await tx`
            select count(*)::integer as fk_paths
            from pg_catalog.pg_constraint c
            where c.contype='f'
              and c.conrelid in (
                'public.payment_events'::regclass,'public.refund_operations'::regclass,
                'public.refund_allocation_events'::regclass,'public.subscription_obligation_cancellations'::regclass
              )
              and c.confrelid in (
                'public.clients'::regclass,'public.subscriptions'::regclass,
                'public.subscription_installments'::regclass,'app_private.registration_operations'::regclass,
                'public.subscription_upgrades'::regclass
              )
          `;
            expect(pathCheck!.fk_paths).toBe(0);
            const [severed] = await tx`
            select
              (select count(*)::integer from public.subscriptions where workspace_id=${f.wsA.id} and id=${ids.subscription}) as subscription_paths,
              (select count(*)::integer from public.refund_operations where id=${refundId}::uuid and client_id is not null) as refund_client_paths
          `;
            expect(severed).toEqual({
              subscription_paths: 0,
              refund_client_paths: 0,
            });

            step = 'staff reporting reads';
            const reports = await Promise.all([
              tx`select public.package_monthly_collections(${f.wsA.id},date_trunc('month',current_date)::date) as value`,
              tx`select public.package_commission_report(${f.wsA.id},date_trunc('month',current_date)::date) as value`,
              tx`select public.package_installment_report(${f.wsA.id}) as value`,
              tx`select public.workspace_payment_queue(${f.wsA.id},null::uuid,20) as value`,
              tx`select public.subscription_commission(${f.wsA.id},${ids.subscription}) as value`,
            ]);
            expect(reports).toHaveLength(5);
            for (const [result] of reports) expect(result!.value).toBeDefined();
            throw rollback;
          })
          .catch((error) => {
            if (error !== rollback)
              throw new Error(
                `T012 integration failed at ${step}: ${error.message}`,
                { cause: error },
              );
            throw error;
          }),
      ).rejects.toBe(rollback);
    });
  },
);
