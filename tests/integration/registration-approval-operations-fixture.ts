import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { proof } from './client-accounts-admission-fixture';
import { clientContext, probe } from './client-accounts-fixture';
import {
  issue,
  secret,
  checked,
  publish,
  backdated,
} from './registration-links-fixture';
import { sql, loadEnv, createStaff } from './harness';
export { clientContext, probe, sql, publish };
export type Context = Awaited<ReturnType<typeof clientContext>>;
export type Kind = 'approve' | 'reject' | 'reconsider';
export const rpcs = {
  approve: 'registration_approve',
  reject: 'registration_reject',
  reconsider: 'registration_reconsider',
} as const;
export type Request = Record<string, unknown>;
export type Result = {
  status: string;
  fields?: string[];
  code?: string;
  receipt?: Record<string, unknown>;
};
export async function registered(
  f: Context,
  rows:
    | readonly { seq: number; amount_minor: string; due_offset_days: number }[]
    | null = null,
  expiresAt?: string,
) {
  const s = expiresAt ? await backdated(f, expiresAt) : secret();
  const link =
    'id' in s
      ? (s.id as string)
      : (checked(
          await issue(f, f.po.client, {
            token_hash: s.hash,
            installments: rows,
          }),
        ) as string);
  const p = proof(s.token);
  const admitted = await f.actors.anon.client.rpc('client_signup_admit', {
    token: p.token,
    request_secret: p.request,
    ip_key: '\\x' + p.ip.toString('hex'),
    link_key: '\\x' + p.link.toString('hex'),
    issued_at: new Date(p.ms).toISOString(),
    nonce: p.nonce,
    attestation: '\\x' + p.attestation.toString('hex'),
  });
  const admission = checked(admitted) as {
    status: string;
    admission_ticket?: string;
    ticket?: string;
  };
  if (admission.status !== 'admitted') {
    const db = sql();
    try {
      const [state] = await db`
        select
          auth.uid() is null as anonymous_request,
          ${new Date(p.ms).toISOString()}::timestamptz <= clock_timestamp() + interval '5 seconds' as within_future_skew,
          clock_timestamp() - ${new Date(p.ms).toISOString()}::timestamptz <= interval '60 seconds' as within_max_age,
          octet_length(${p.ip}) = 32 as valid_ip_key_length,
          octet_length(${p.link}) = 32 as valid_link_key_length,
          octet_length(${p.attestation}) = 32 as valid_attestation_length,
          exists(select 1 from app_private.signup_admission_nonces where nonce=${p.nonce}) as nonce_accepted,
          exists(select 1 from app_private.signup_rate_counters where key=${p.link}) as rate_counted,
          exists(select 1 from app_private.client_signup_attempts where link_id=${link}) as attempt_recorded
      `;
      throw new Error(
        `U3 real admission fixture failed: ${admission.status} (${JSON.stringify(state)})`,
      );
    } finally {
      await db.end();
    }
  }
  const fields = {
    name: 'U3 synthetic client',
    email: `u3-${randomUUID()}@example.test`,
    date_of_birth: '1990-04-12',
    username: `u3_${randomUUID().replaceAll('-', '').slice(0, 27)}`,
    telegram_username: '',
    phone:
      '+201' +
      BigInt('0x' + randomBytes(5).toString('hex'))
        .toString()
        .padStart(11, '0')
        .slice(-11),
    password: 'Synthetic9!' + randomUUID().replaceAll('-', ''),
  };
  const signed = checked(
    await f.actors.anon.client.rpc('client_signup', {
      token: s.token,
      request_secret: p.request,
      admission_ticket: admission.admission_ticket ?? admission.ticket,
      fields,
    }),
  ) as { status: string };
  if (signed.status !== 'complete')
    throw new Error('U3 real signup fixture failed');
  const db = sql();
  try {
    const [row] =
      await db`select id,auth_user_id from public.clients where workspace_id=${f.wsA.id} and registration_link_id=${link}`;
    if (!row) throw new Error('U3 committed client missing');
    return {
      id: row.id as string,
      userId: row.auth_user_id as string,
      link,
      rows,
      email: fields.email,
      password: fields.password,
    };
  } finally {
    await db.end();
  }
}
export type Target = {
  id: string;
  userId: string;
  link: string;
  rows:
    | readonly { seq: number; amount_minor: string; due_offset_days: number }[]
    | null;
};
export function request(
  f: Context,
  t: Target,
  kind: Kind = 'approve',
  extra: Request = {},
): Request {
  return {
    workspace_id: f.wsA.id,
    client_id: t.id,
    request_key: randomUUID(),
    expected_state: kind === 'reconsider' ? 'rejected' : 'pending-approval',
    ...(kind === 'reject'
      ? { reason_code: 'registration_rejected' }
      : {
          expected_installment_seq: 1,
          expected_amount_minor: t.rows?.[0]?.amount_minor ?? '1200',
          currency: 'XTS',
          collected_on: '1900-01-01',
          payment_confirmed: true,
        }),
    ...extra,
  };
}
export async function call(
  client: SupabaseClient,
  kind: Kind,
  input: Request,
): Promise<Result> {
  const r = await client.rpc(rpcs[kind], { request: input });
  return r.error
    ? { status: 'rpc_error', code: r.error.code }
    : (r.data as Result);
}
export async function sqlCall(
  tx: TransactionSql,
  user: string,
  kind: Kind,
  input: Request,
): Promise<Result> {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: user, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const value = tx.json(input as postgres.JSONValue);
    const [r] =
      kind === 'approve'
        ? await tx`select public.registration_approve(${value}) as result`
        : kind === 'reject'
          ? await tx`select public.registration_reject(${value}) as result`
          : await tx`select public.registration_reconsider(${value}) as result`;
    return r!.result as Result;
  } finally {
    await tx`reset role`;
  }
}
export async function state(
  db: ReturnType<typeof sql> | TransactionSql,
  t: Target,
) {
  const [r] = await db`select c.approval_state,
  (select count(*)::int from public.subscriptions s where s.workspace_id=c.workspace_id and s.client_id=c.id) as subscriptions,
  (select count(*)::int from public.subscription_installments i join public.subscriptions s on s.workspace_id=i.workspace_id and s.id=i.subscription_id where s.client_id=c.id) as installments,
  (select count(*)::int from public.payment_events e join public.subscriptions s on s.workspace_id=e.workspace_id and s.id=e.subscription_id where s.client_id=c.id) as payments,
  (select count(*)::int from app_private.registration_decisions d where d.client_id=c.id) as decisions,
  (select count(*)::int from app_private.registration_operations o where o.client_id=c.id) as receipts,
  (select count(*)::int from app_private.registration_approval_events a where a.client_id=c.id) as facts,
  (select count(*)::int from public.subscription_activations a join public.subscriptions s on s.workspace_id=a.workspace_id and s.id=a.subscription_id where s.client_id=c.id) as activations,
  (select count(*)::int from public.audit_events a where (a.target_id=c.id and a.action in ('client.approved','client.rejected','client.reconsidered')) or (a.action='payment.collected' and a.details->>'client_id'=c.id::text)) as audits
  from public.clients c where c.id=${t.id}`;
  return r!;
}
export async function approver(f: Context) {
  const actor = await createStaff('workspace_owner', 'f12-u3-approver');
  checked(
    await f.po.client
      .from('workspace_memberships')
      .insert({
        workspace_id: f.wsA.id,
        user_id: actor.userId,
        granted_by: f.po.userId,
      })
      .select('id')
      .single(),
  );
  return actor;
}
export async function waitForLock(db: ReturnType<typeof sql>, label: string) {
  for (let i = 0; i < 150; i++) {
    const rows =
      await db`select 1 from pg_stat_activity where application_name=${label} and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0`;
    if (rows.length) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}
export function worker(label: string) {
  return postgres(loadEnv().dbUrl, {
    max: 1,
    connection: { application_name: label },
  });
}
