import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const rollback = new Error('rollback retention apply fixtures');

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

describe.runIf(process.env.LIFTER_SUPABASE_STACK === 'e')(
  'F26 dry-run and apply evidence (Stack E only)',
  () => {
    it('keeps dry-run read-only, replays one apply, and preserves retained money facts and staff reads', async () => {
      const f = await clientContext();
      await expect(
        db.begin(async (tx) => {
          const ids = await graph(tx, f);
          const refundResult = await refund(tx, f.po.userId, {
            workspace_id: f.wsA.id,
            client_id: ids.client,
            purchase_id: ids.subscription,
            request_key: randomUUID(),
            amount_minor: '1200',
            external_confirmation: true,
          });
          expect(refundResult.status).toBe('ok');

          await tx`set local session_replication_role = replica`;
          await tx`
            update public.clients set deactivated_at=clock_timestamp()-interval '31 days',
              deactivation_reason='closure'
            where workspace_id=${f.wsA.id} and id=${ids.client}
          `;
          await tx`
            update app_private.refund_auth_lockouts
            set status='succeeded',completed_at=clock_timestamp()-interval '31 days'
            where client_id=${ids.client}
          `;
          await tx`set local session_replication_role = origin`;

          const [refundRow] = await tx`
            select id from public.refund_operations
            where workspace_id=${f.wsA.id} and client_id=${ids.client}
          `;
          const refundId = refundRow!.id as string;
          const [before] = await tx`
            select
              (select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'commission_minor',commission_minor::text,'collected_on',collected_on,
                'effective_on',effective_on,'recorded_at',recorded_at) order by id)
                from public.payment_events where id=${ids.event}) as payments,
              (select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'effective_on',effective_on,'recorded_at',recorded_at) order by id)
                from public.refund_operations where id=${refundId}) as refunds,
              (select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'commission_minor',commission_minor::text,'currency',currency,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id)
                from public.refund_allocation_events where refund_operation_id=${refundId}) as allocations,
              (select jsonb_agg(jsonb_build_object('id',id,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id)
                from public.subscription_obligation_cancellations where refund_operation_id=${refundId}) as cancellations
          `;

          const dryRunId = randomUUID();
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
              (select count(*)::integer from public.clients where workspace_id=${f.wsA.id} and id=${ids.client}) as clients,
              (select count(*)::integer from public.audit_events where target_table='clients' and target_id=${ids.client}::text) as audit_rows
          `;
          expect(afterDryRun!.clients).toBe(1);
          expect(afterDryRun!.audit_rows).toBe(0);

          const runId = randomUUID();
          const applied = await purgeAsOwner(tx, f.po.userId, runId, 'apply');
          expect(applied).toMatchObject({ status: 'applied' });
          const replay = await purgeAsOwner(tx, f.po.userId, runId, 'apply');
          expect(replay).toMatchObject({ status: 'replayed' });

          const [afterApply] = await tx`
            select
              (select count(*)::integer from public.clients where workspace_id=${f.wsA.id} and id=${ids.client}) as clients,
              (select count(*)::integer from public.subscriptions where workspace_id=${f.wsA.id} and id=${ids.subscription}) as subscriptions,
              (select count(*)::integer from app_private.registration_operations where workspace_id=${f.wsA.id} and id=${ids.operation}) as operations,
              (select count(*)::integer from public.refund_operations where id=${refundId} and client_id is not null) as identified_refunds,
              (select count(*)::integer from app_private.retention_purge_runs where run_id=${runId}) as run_rows
          `;
          expect(afterApply).toEqual({
            clients: 0,
            subscriptions: 0,
            operations: 0,
            identified_refunds: 0,
            run_rows: 1,
          });

          const [after] = await tx`
            select
              (select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'commission_minor',commission_minor::text,'collected_on',collected_on,
                'effective_on',effective_on,'recorded_at',recorded_at) order by id)
                from public.payment_events where id=${ids.event}) as payments,
              (select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'currency',currency,'effective_on',effective_on,'recorded_at',recorded_at) order by id)
                from public.refund_operations where id=${refundId}) as refunds,
              (select jsonb_agg(jsonb_build_object('id',id,'amount_minor',amount_minor::text,
                'commission_minor',commission_minor::text,'currency',currency,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id)
                from public.refund_allocation_events where refund_operation_id=${refundId}) as allocations,
              (select jsonb_agg(jsonb_build_object('id',id,'effective_on',effective_on,
                'recorded_at',recorded_at) order by id)
                from public.subscription_obligation_cancellations where refund_operation_id=${refundId}) as cancellations
          `;
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
                'public.subscription_installments'::regclass,'app_private.registration_operations'::regclass
              )
          `;
          expect(pathCheck!.fk_paths).toBe(0);
          const [severed] = await tx`
            select
              (select count(*)::integer from public.subscriptions where workspace_id=${f.wsA.id} and id=${ids.subscription}) as subscription_paths,
              (select count(*)::integer from public.refund_operations where id=${refundId} and client_id is not null) as refund_client_paths
          `;
          expect(severed).toEqual({
            subscription_paths: 0,
            refund_client_paths: 0,
          });

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
        }),
      ).rejects.toBe(rollback);
    });
  },
);
