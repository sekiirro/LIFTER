import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';

const db = sql();

async function refund(
  tx: TransactionSql,
  actorId: string,
  input: Record<string, unknown>,
) {
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

describe.runIf(
  process.env.LIFTER_F15_T018_RED === '1' &&
    process.env.LIFTER_SUPABASE_STACK === 'd',
)(
  'T018 RED boundary is opt-in on Stack D; skipped otherwise while Closure source is unresolved',
  () => {
    it('starts retention at the authoritative refund/deactivation timestamp, not approval or assignment', async () => {
      const f = await clientContext();
      await probe(async (tx) => {
        const ids = await graph(tx, f);
        expect(
          await tx`select id from app_private.form_retention_windows
        where workspace_id=${f.wsA.id} and client_id=${ids.client}`,
        ).toHaveLength(0);

        const result = await refund(tx, f.po.userId, {
          workspace_id: f.wsA.id,
          client_id: ids.client,
          purchase_id: ids.subscription,
          request_key: randomUUID(),
          amount_minor: '600',
          external_confirmation: true,
        });
        expect(result.status).toBe('ok');

        const [source] = await tx`
      select r.recorded_at as refund_at, c.deactivated_at
      from public.refund_operations r
      join public.clients c on c.workspace_id=r.workspace_id and c.id=r.client_id
      where r.workspace_id=${f.wsA.id} and r.client_id=${ids.client}
    `;
        expect(source).toBeDefined();
        expect(source!.refund_at).toEqual(source!.deactivated_at);

        const windows = await tx`
      select source_kind,ended_at
      from app_private.form_retention_windows
      where workspace_id=${f.wsA.id} and client_id=${ids.client}
    `;
        expect(windows).toEqual(
          expect.arrayContaining([
            { source_kind: 'refund', ended_at: source!.refund_at },
            { source_kind: 'deactivation', ended_at: source!.deactivated_at },
          ]),
        );
      });
    });
    afterAll(() => db.end());
  },
);
