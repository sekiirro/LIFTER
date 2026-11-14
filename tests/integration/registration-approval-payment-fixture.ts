import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  registered,
  request,
  call,
  sql,
  type Context,
  type Request,
  type Result,
} from './registration-approval-operations-fixture';
export * from './registration-approval-operations-fixture';
export type PaymentKind = 'collect' | 'correct';
export const paymentRpcs = {
  collect: 'installment_collect',
  correct: 'collection_correct',
} as const;
export async function bought(f: Context) {
  const t = await registered(
    f,
    [1, 2, 3].map((seq) => ({
      seq,
      amount_minor: '400',
      due_offset_days: (seq - 1) * 30,
    })),
  );
  const approved = await call(f.po.client, 'approve', request(f, t));
  if (approved.status !== 'ok') throw new Error('Real approval failed');
  const db = sql();
  try {
    const rows =
      await db`select id,seq from public.subscription_installments where subscription_id=${approved.receipt!.subscription_id as string} order by seq`;
    return {
      t,
      approved,
      sid: approved.receipt!.subscription_id as string,
      rows,
    };
  } finally {
    await db.end();
  }
}
export type Purchase = Awaited<ReturnType<typeof bought>>;
export function paymentRequest(
  f: Context,
  p: Purchase,
  kind: PaymentKind = 'collect',
  extra: Request = {},
): Request {
  return {
    workspace_id: f.wsA.id,
    client_id: p.t.id,
    request_key: randomUUID(),
    subscription_id: p.sid,
    obligation_id: p.rows[kind === 'collect' ? 1 : 0]!.id,
    expected_installment_seq: kind === 'collect' ? 2 : 1,
    expected_revision: kind === 'collect' ? 0 : 1,
    expected_previous_event_id:
      kind === 'collect' ? null : p.approved.receipt!.event_id,
    ...(kind === 'collect'
      ? {
          expected_amount_minor: '400',
          currency: 'XTS',
          collected_on: '1900-01-01',
          payment_confirmed: true,
        }
      : {
          original_event_id: p.approved.receipt!.event_id,
          correction_confirmed: true,
        }),
    ...extra,
  };
}
export async function pay(
  client: SupabaseClient,
  kind: PaymentKind,
  input: Request,
): Promise<Result> {
  const r = await client.rpc(paymentRpcs[kind], { request: input });
  return r.error
    ? { status: 'rpc_error', code: r.error.code }
    : (r.data as Result);
}
export async function sqlPay(
  tx: postgres.TransactionSql,
  user: string,
  kind: PaymentKind,
  input: Request,
): Promise<Result> {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: user, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const value = tx.json(input as postgres.JSONValue);
    const [r] =
      kind === 'collect'
        ? await tx`select public.installment_collect(${value}) as result`
        : await tx`select public.collection_correct(${value}) as result`;
    return r!.result as Result;
  } finally {
    await tx`reset role`;
  }
}
export async function activate(
  tx: postgres.TransactionSql,
  f: Context,
  p: Purchase,
) {
  // P4-owned seam: synthetic activation exists only in a rolled-back probe.
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source) values(${f.wsA.id},${p.sid},clock_timestamp(),${randomUUID()}, 'po_override')`;
}
