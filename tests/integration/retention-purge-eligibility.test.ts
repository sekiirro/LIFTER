import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const rollback = new Error('rollback retention eligibility fixtures');

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

describe.runIf(process.env.LIFTER_SUPABASE_STACK === 'e')(
  'F26 retention eligibility (Stack E only)',
  () => {
    it('uses closure for client and invoice records, creation for audit, and never selects an active account', async () => {
      const f = await clientContext();
      await expect(
        db.begin(async (tx) => {
          const ids = await graph(tx, f);
          const sampledAt = new Date();
          const days = 24 * 60 * 60 * 1000;
          const refundResult = await refund(tx, f.po.userId, {
            workspace_id: f.wsA.id,
            client_id: ids.client,
            purchase_id: ids.subscription,
            request_key: randomUUID(),
            amount_minor: '1200',
            external_confirmation: true,
          });
          expect(refundResult.status).toBe('ok');
          const [ledger] = await tx`
            select r.id as refund_id,a.id as allocation_id,c.id as cancellation_id
            from public.refund_operations r
            left join public.refund_allocation_events a
              on a.workspace_id=r.workspace_id and a.refund_operation_id=r.id
            left join public.subscription_obligation_cancellations c
              on c.workspace_id=r.workspace_id and c.refund_operation_id=r.id
            where r.workspace_id=${f.wsA.id} and r.client_id=${ids.client}
          `;
          await tx`set local session_replication_role = replica`;
          const [cancellation] = await tx`
            insert into public.subscription_obligation_cancellations(
              workspace_id,subscription_id,obligation_id,refund_operation_id,
              actor_user_id,effective_on,recorded_at
            ) values (
              ${f.wsA.id},${ids.subscription},${ids.obligation},${ledger!.refund_id},
              ${f.po.userId},'2026-11-24'::date,${sampledAt}
            ) returning id
          `;
          await tx`
            insert into public.audit_events(
              actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
            ) values (
              null,'retention.synthetic','clients',${ids.client},${f.wsA.id},'{}'::jsonb,
              ${new Date(sampledAt.getTime() - 29 * days)}
            )
          `;
          const [oldAudit] = await tx`
            insert into public.audit_events(
              actor_user_id,action,target_table,target_id,workspace_id,details,occurred_at
            ) values (
              null,'retention.synthetic','clients',${ids.client},${f.wsA.id},'{}'::jsonb,
              ${new Date(sampledAt.getTime() - 30 * days)}
            ) returning id
          `;

          const active = await tx`
            select data_class,workspace_id,record_id,client_id
            from app_private.purge_retention_candidates(${sampledAt})
          `;
          expect(active.map((row) => row.data_class)).toEqual(['audit_event']);

          await tx`update public.clients set deactivated_at=${new Date(sampledAt.getTime() - 29 * days)},
            deactivation_reason='closure' where workspace_id=${f.wsA.id} and id=${ids.client}`;
          const insideWindow = await tx`
            select data_class,workspace_id,record_id,client_id
            from app_private.purge_retention_candidates(${sampledAt})
          `;
          expect(insideWindow.map((row) => row.data_class)).toEqual([
            'audit_event',
          ]);
          const [insideSummary] = await tx`
            select app_private.purge_f11_retained_data() as value
          `;
          expect(insideSummary?.value).toMatchObject({
            eligible_by_class: { audit_event: 1 },
          });
          const [survivors] = await tx`
            select
              (select count(*)::integer from public.clients where id=${ids.client}) as clients,
              (select count(*)::integer from public.payment_events where id=${ids.event}) as payments
          `;
          expect(survivors).toEqual({ clients: 1, payments: 1 });

          await tx`update public.clients set deactivated_at=${new Date(sampledAt.getTime() - 30 * days)}
            where workspace_id=${f.wsA.id} and id=${ids.client}`;

          const eligible = await tx`
            select data_class,workspace_id,record_id,client_id
            from app_private.purge_retention_candidates(${sampledAt})
          `;
          expect(eligible).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                data_class: 'client',
                workspace_id: f.wsA.id,
                record_id: ids.client,
                client_id: ids.client,
              }),
              expect.objectContaining({
                data_class: 'payment_event',
                workspace_id: f.wsA.id,
                record_id: ids.event,
                client_id: ids.client,
              }),
              expect.objectContaining({
                data_class: 'refund_operation',
                record_id: ledger!.refund_id,
                client_id: ids.client,
              }),
              expect.objectContaining({
                data_class: 'refund_allocation_event',
                record_id: ledger!.allocation_id,
                client_id: ids.client,
              }),
              expect.objectContaining({
                data_class: 'subscription_obligation_cancellation',
                record_id: cancellation!.id,
                client_id: ids.client,
              }),
              expect.objectContaining({
                data_class: 'audit_event',
                workspace_id: f.wsA.id,
                record_id: String(oldAudit!.id),
                client_id: null,
              }),
            ]),
          );
          expect(eligible.every((row) => row.workspace_id === f.wsA.id)).toBe(
            true,
          );
          expect(
            eligible
              .filter((row) => row.data_class !== 'audit_event')
              .every((row) => row.client_id === ids.client),
          ).toBe(true);
          const [entrypoint] = await tx`
            select app_private.purge_f11_retained_data() as value
          `;
          expect(entrypoint?.value).toMatchObject({
            eligible_by_class: {
              client: 1,
              payment_event: 1,
              refund_operation: 1,
              refund_allocation_event: 1,
              subscription_obligation_cancellation: 1,
              audit_event: 1,
            },
          });
          const [retained] = await tx`
            select
              (select count(*)::integer from public.clients where id=${ids.client}) as clients,
              (select count(*)::integer from public.payment_events where id=${ids.event}) as payments
          `;
          expect(retained).toEqual({ clients: 1, payments: 1 });
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  },
);
