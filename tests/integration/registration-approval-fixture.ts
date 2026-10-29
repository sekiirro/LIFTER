import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { clientContext, pending, probe } from './client-accounts-fixture';
export { sql } from './harness';
export { probe };
export const tables = [
  'public.subscriptions',
  'public.subscription_installments',
  'public.payment_events',
  'app_private.registration_decisions',
  'app_private.registration_operations',
  'app_private.registration_approval_events',
  'public.subscription_activations',
] as const;
export const functions = [
  'f12_commission_minor(bigint,integer)',
  'f12_actor_allowed(uuid,text,boolean)',
  'f12_guard_subscription()',
  'f12_guard_installment()',
  'f12_validate_subscription(uuid,uuid)',
  'f12_check_subscription()',
  'f12_validate_payment(uuid,uuid)',
  'f12_check_payment()',
  'f12_guard_payment()',
  'f12_guard_decision()',
  'f12_guard_client_transition()',
  'f12_check_decision()',
  'f12_u3_can_decide(uuid,boolean)',
  'f12_u3_lock_authorization(uuid,boolean)',
  'f12_u3_canonical(text,jsonb)',
  'f12_u3_purchase(uuid,uuid,uuid,uuid,text,date,timestamp with time zone)',
  'f12_u3_operation(text,jsonb)',
  'f12_u4_can_pay(uuid,boolean)',
  'f12_u4_canonical(text,jsonb)',
  'f12_u4_operation(text,jsonb)',
] as const;
export type Context = Awaited<ReturnType<typeof clientContext>>;
export { clientContext };
export async function graph(
  tx: TransactionSql,
  f: Context,
  options: {
    price?: string;
    installment?: string;
    commission?: string;
    amount?: string;
    offset?: number;
    currency?: string;
    issuedRows?: readonly {
      seq: number;
      amount_minor: string;
      due_offset_days: number;
    }[];
  } = {},
) {
  const client = await pending(tx, f);
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
  const ids = {
    client: client.id as string,
    subscription: randomUUID(),
    obligation: randomUUID(),
    event: randomUUID(),
    operation: randomUUID(),
    decision: randomUUID(),
    fact: randomUUID(),
  };
  await tx`insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,expected_installment_seq,expected_revision,canonical_args_hash,result_receipt)
    values(${ids.operation},${f.wsA.id},${f.po.userId},${randomUUID()},'approve',${ids.client},${ids.subscription},${ids.obligation},${ids.event},1,0,decode(repeat('ab',32),'hex'),'{}')`;
  await tx`insert into app_private.registration_decisions(id,workspace_id,client_id,operation_id,actor_user_id,kind,from_state,to_state)
    values(${ids.decision},${f.wsA.id},${ids.client},${ids.operation},${f.po.userId},'approve','pending-approval','approved')`;
  await tx`insert into public.subscriptions(id,workspace_id,client_id,registration_link_id,package_version_id,price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by)
    values(${ids.subscription},${f.wsA.id},${ids.client},${f.link},${f.p.versionId},${options.price ?? '1200'},'XTS',17,61,null,${f.po.userId})`;
  if (options.issuedRows) {
    for (const row of options.issuedRows)
      await tx`insert into public.subscription_installments(id,workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
      values(${row.seq === 1 ? ids.obligation : randomUUID()},${f.wsA.id},${ids.subscription},${row.seq},${row.amount_minor},'XTS',${row.due_offset_days},'issued_schedule')`;
  } else {
    await tx`insert into public.subscription_installments(id,workspace_id,subscription_id,seq,amount_minor,currency,issued_day_offset,source_kind)
    values(${ids.obligation},${f.wsA.id},${ids.subscription},1,${options.installment ?? '1200'},${options.currency ?? 'XTS'},${options.offset ?? 0},'single_payment')`;
  }
  await tx`insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,kind,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,operation_id)
    values(${ids.event},${f.wsA.id},${ids.subscription},${ids.obligation},1,1,'collection',${options.amount ?? '1200'},'XTS',${options.commission ?? '2'},'1900-01-01','1900-01-01',${f.po.userId},${ids.operation})`;
  await tx`insert into app_private.registration_approval_events(id,workspace_id,client_id,subscription_id) values(${ids.fact},${f.wsA.id},${ids.client},${ids.subscription})`;
  await tx`update public.clients set approval_state='approved' where id=${ids.client}`;
  return ids;
}
export async function append(
  tx: TransactionSql,
  f: Context,
  ids: Awaited<ReturnType<typeof graph>>,
  patch: Record<string, unknown> = {},
) {
  const operation = randomUUID(),
    id = randomUUID();
  await tx`insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,original_event_id,expected_installment_seq,expected_revision,expected_previous_event_id,canonical_args_hash,result_receipt)
    values(${operation},${f.wsA.id},${f.po.userId},${randomUUID()},'correct',${ids.client},${ids.subscription},${ids.obligation},${id},${ids.event},1,1,${ids.event},decode(repeat('ab',32),'hex'),'{}')`;
  await tx`insert into public.payment_events ${tx({ id, workspace_id: f.wsA.id, subscription_id: ids.subscription, obligation_id: ids.obligation, installment_seq: 1, revision: 2, previous_event_id: ids.event, kind: 'correction_reversal', reverses_event_id: ids.event, amount_minor: '-1200', currency: 'XTS', commission_minor: '-2', collected_on: null, effective_on: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }), recorded_by: f.po.userId, operation_id: operation, ...patch })}`;
  return { id, operation };
}
