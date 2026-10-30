import { randomBytes, randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { admin, anonClient } from './harness';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect } from 'vitest';
import { sql } from './harness';
import {
  checked,
  backdated,
  issue,
  registrationFixture,
} from './registration-links-fixture';
export { registrationFixture } from './registration-links-fixture';
export { sql } from './harness';

export async function installedRecoveryTargetDefinition(
  connection: ReturnType<typeof sql>,
) {
  const [row] =
    await connection`select pg_catalog.pg_get_functiondef('app_private.recovery_target_workspace(uuid)'::regprocedure) as definition`;
  if (!row) throw new Error('Installed recovery target helper is missing');
  return row.definition as string;
}

export async function restoreRecoveryTargetFixture(
  connection: ReturnType<typeof sql>,
  installedDefinition: string,
) {
  await connection.unsafe(installedDefinition);
}

export const modelTables = [
  'public.clients',
  'app_private.account_identifier_claims',
  'app_private.client_signup_operations',
  'app_private.client_signup_attempts',
  'app_private.signup_admission_tickets',
] as const;
export const rollback = new Error('U2 synthetic rollback');
export async function probe(body: (tx: TransactionSql) => Promise<void>) {
  const db = sql();
  try {
    await db.begin(async (tx) => {
      await body(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.end();
  }
}
export async function identity(
  tx: TransactionSql,
  patch: Record<string, unknown> = {},
) {
  const row = {
    id: randomUUID(),
    email: `u2-${randomUUID()}@example.test`,
    ...patch,
  };
  await tx`insert into auth.users ${tx(row)}`;
  return row;
}
export async function ticket(tx: TransactionSql) {
  const binding = randomBytes(32);
  const request = randomBytes(32);
  const [row] =
    await tx`insert into app_private.signup_admission_tickets(link_key,request_secret_hash) values(${binding},${request}) returning id`;
  return { id: row!.id as string, binding, request };
}

export async function clientContext() {
  const f = await registrationFixture();
  const link = checked(await issue(f)) as string;
  return { ...f, link };
}
export type ClientContext = Awaited<ReturnType<typeof clientContext>>;
export async function pending(
  tx: TransactionSql,
  f: ClientContext,
  patch: Record<string, unknown> = {},
  userId?: string,
) {
  const user = userId ? { id: userId } : await identity(tx);
  await tx`select set_config('request.jwt.claims','{}',true)`;
  const [row] = await tx`insert into public.clients ${tx({
    workspace_id: f.wsA.id,
    auth_user_id: user.id,
    registration_link_id: f.link,
    package_version_id: f.p.versionId,
    email_normalized: 'IGNORED@example.test',
    phone_e164:
      '+201' +
      BigInt('0x' + randomBytes(5).toString('hex'))
        .toString()
        .padStart(13, '0')
        .slice(-11),
    name: 'U2 synthetic',
    ...patch,
  })} returning *`;
  await tx`update public.registration_links set consumed_at=now() where id=${f.link}`;
  return row!;
}

// U3 synthetic pre-admission only; U5 owns public issuance.
export async function signupFixture(f: ClientContext, executor = sql()) {
  const request = randomBytes(32).toString('base64url');
  const {
    token,
    hash,
    id: link,
  } = await backdated(f, new Date(Date.now() + 86_400_000).toISOString());
  try {
    const [t] =
      await executor`insert into app_private.signup_admission_tickets(link_key,request_secret_hash,workspace_id,link_id)
      select extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')||int4send(octet_length(${hash}::text))||convert_to(${hash},'UTF8'),decode(decrypted_secret,'hex'),'sha256'),extensions.digest(${request},'sha256'),${f.wsA.id},${link}
      from vault.decrypted_secrets where name='SIGNUP_RATE_KEY' returning id`;
    if (!t) throw new Error('Synthetic admission unavailable');
    return {
      token,
      request,
      hash,
      link,
      ticket: t.id as string,
      fields: {
        name: 'U3 synthetic',
        email: `u3-${randomUUID()}@example.test`,
        phone:
          '+201' +
          BigInt('0x' + randomBytes(5).toString('hex'))
            .toString()
            .padStart(11, '0')
            .slice(-11),
        password: 'Synthetic9!' + randomUUID().replaceAll('-', ''),
      },
    };
  } finally {
    await executor.end();
  }
}
export type SignupFixture = Awaited<ReturnType<typeof signupFixture>>;
export async function signup(
  tx: TransactionSql | ReturnType<typeof sql>,
  f: SignupFixture,
  fields = f.fields,
) {
  // Never let a provider diagnostic print statement parameters or credentials.
  try {
    const [row] =
      await tx`select public.client_signup(${f.token},${f.request},${f.ticket},${tx.json(fields)}) as result`;
    return row!.result;
  } catch (error) {
    throw new Error(
      'Signup SQL failed: ' + String((error as { code?: string }).code),
    );
  }
}

export type RecoveryClientTarget = {
  userId: string;
  workspaceId: string;
  email: string;
  password: string;
  client: ReturnType<typeof anonClient>;
};

export async function createRecoveryClientTarget(
  context: ClientContext,
): Promise<RecoveryClientTarget> {
  const fixture = await signupFixture(context);
  const connection = sql();
  try {
    const result = await signup(connection, fixture);
    if (result.status !== 'complete')
      throw new Error('Committed recovery client fixture failed');
    const [row] =
      await connection`select auth_user_id,workspace_id,approval_state from public.clients where registration_link_id=${fixture.link}`;
    if (
      !row ||
      row.workspace_id !== context.wsA.id ||
      row.approval_state !== 'pending-approval'
    )
      throw new Error('Committed recovery client fixture was not found');
    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({
      email: fixture.fields.email,
      password: fixture.fields.password,
    });
    if (signedIn.error)
      throw new Error('Recovery client sign-in fixture failed');
    return {
      userId: row.auth_user_id as string,
      workspaceId: row.workspace_id as string,
      email: fixture.fields.email,
      password: fixture.fields.password,
      client,
    };
  } finally {
    await connection.end();
  }
}

// Only identity-specific values are erased; NULL and empty-string semantics survive.
export function normalizeAuthValue(
  value: unknown,
  key: string,
  type = '',
): unknown {
  if (value === null) return null;
  if (
    type === 'timestamptz' ||
    [
      'id',
      'user_id',
      'sub',
      'provider_id',
      'email',
      'phone',
      'encrypted_password',
    ].includes(key)
  )
    return '<normalized>';
  if (Array.isArray(value)) return value.map((v) => normalizeAuthValue(v, ''));
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort()
        .map(([k, v]) => [k, normalizeAuthValue(v, k)]),
    );
  return value;
}

// Admin authority is confined to the official control creation, never signup.
export async function authReference(password: string) {
  const result = await admin().auth.admin.createUser({
    email: `u4-${randomUUID()}@example.test`,
    password,
    email_confirm: true,
  });
  if (result.error || !result.data.user)
    throw new Error('Official Auth reference creation failed');
  return result.data.user;
}
export async function anonSignup(s: SignupFixture) {
  const result = await anonClient().rpc('client_signup', {
    token: s.token,
    request_secret: s.request,
    admission_ticket: s.ticket,
    fields: s.fields,
  });
  expect(result.error === null, 'anon signup transport').toBe(true);
  expect(result.data).toEqual({ status: 'complete' });
}

// F12 RPC denials need well-shaped requests: invalid JSON is not authorization proof.
export const approvalRpcNames = [
  'registration_approve',
  'registration_reject',
  'registration_reconsider',
  'installment_collect',
  'collection_correct',
] as const;
export function approvalDenialRequest(
  context: ClientContext,
  name: string,
  clientId: string,
) {
  if (name === 'installment_collect' || name === 'collection_correct')
    return {
      workspace_id: context.wsA.id,
      client_id: clientId,
      request_key: randomUUID(),
      subscription_id: randomUUID(),
      obligation_id: randomUUID(),
      expected_installment_seq: 1,
      expected_revision: 1,
      expected_previous_event_id: randomUUID(),
      ...(name === 'collection_correct'
        ? { original_event_id: randomUUID(), correction_confirmed: true }
        : {
            expected_amount_minor: '1200',
            currency: 'XTS',
            collected_on: '1900-01-01',
            payment_confirmed: true,
          }),
    };
  return {
    workspace_id: context.wsA.id,
    client_id: clientId,
    request_key: randomUUID(),
    expected_state:
      name === 'registration_reconsider' ? 'rejected' : 'pending-approval',
    ...(name === 'registration_reject'
      ? { reason_code: 'registration_rejected' }
      : {
          expected_installment_seq: 1,
          expected_amount_minor: '1200',
          currency: 'XTS',
          collected_on: '1900-01-01',
          payment_confirmed: true,
        }),
  };
}

// Shared U2 catalog probes, now also applied to the signup-created real session.
export async function pendingHttpAccess(
  client: SupabaseClient,
  context: ClientContext,
) {
  const db = sql();
  try {
    const tables =
      await db`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`;
    for (const table of tables) {
      const result = await client.from(table.relname).select('*');
      expect(
        result.error !== null || result.data?.length === 0,
        table.relname,
      ).toBe(true);
    }
    const functions =
      await db`select p.proname,p.proargnames,to_jsonb(array(select format_type(t,null) from unnest(p.proargtypes) t)) as types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'`;
    for (const fn of functions) {
      if (fn.proname === 'client_self_status') {
        const result = await client.rpc('client_self_status');
        expect(result.error, fn.proname).toBeNull();
        expect(result.data, fn.proname).toEqual({
          status: 'ok',
          approval_state: 'pending-approval',
        });
        continue;
      }
      if ((approvalRpcNames as readonly string[]).includes(fn.proname)) {
        const [target] =
          await db`select id from public.clients where workspace_id=${context.wsA.id} order by created_at,id limit 1`;
        if (!target)
          throw new Error(
            'Pending HTTP approval probe needs a committed target',
          );
        const denied = await client.rpc(fn.proname, {
          request: approvalDenialRequest(context, fn.proname, target.id),
        });
        expect(denied.error, fn.proname).toBeNull();
        expect(denied.data, fn.proname).toEqual({ status: 'not_permitted' });
        continue;
      }
      if (
        [
          'registration_approval_queue',
          'registration_approval_review',
          'workspace_payment_queue',
          'subscription_payment_status',
          'subscription_commission',
        ].includes(fn.proname)
      ) {
        const args: Record<string, unknown> = {};
        fn.types.forEach((type: string, i: number) => {
          args[fn.proargnames[i]] = type === 'integer' ? 1 : context.wsA.id;
        });
        const result = await client.rpc(fn.proname, args);
        expect(result.error, fn.proname).toBeNull();
        expect(result.data, fn.proname).toEqual({ status: 'not_permitted' });
        continue;
      }
      const args: Record<string, unknown> = {};
      fn.types.forEach((type: string, i: number) => {
        const values: Record<string, unknown> = {
          uuid: context.wsA.id,
          text: 'synthetic-invalid',
          jsonb: null,
          integer: 1,
          smallint: 1,
          bigint: 1,
          boolean: false,
          bytea: '\\x00',
          'timestamp with time zone': new Date().toISOString(),
        };
        if (!(type in values)) throw new Error('Uncovered HTTP RPC type');
        args[fn.proargnames[i]] = values[type];
      });
      const result = await client.rpc(fn.proname, args);
      expect(
        result.error !== null ||
          result.data === null ||
          result.data === false ||
          (Array.isArray(result.data) && result.data.length === 0) ||
          result.data?.status === 'invalid' ||
          (['record_refund', 'record_renewal'].includes(fn.proname)
            ? result.data?.status === 'not_permitted'
            : ['subscription_freeze_operation'].includes(fn.proname) &&
              result.data?.status === 'invalid_input'),
        fn.proname,
      ).toBe(true);
    }
  } finally {
    await db.end();
  }
}

export class PendingRlsAccessDenied extends Error {
  constructor(target: string) {
    super(`Pending client unexpectedly accessed ${target}`);
    this.name = 'PendingRlsAccessDenied';
  }
}

// Safe fixture grants ensure RLS denials cannot be masked by missing privileges.
export async function pendingRlsAccess(
  tx: TransactionSql,
  context: ClientContext,
  claims: object,
) {
  const tables =
    await tx`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`;
  await tx`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
  for (const table of tables) {
    // The selected constant exposes no protected field. Grant SELECT on a
    // safe UUID column to prevent missing privileges from hiding bad RLS.
    const [column] =
      await tx`select attname from pg_attribute where attrelid=to_regclass(${table.nspname + '.' + table.relname}) and attnum>0 and atttypid='uuid'::regtype order by attnum limit 1`;
    if (!column) throw new Error('RLS probe needs a safe UUID column');
    const target = '"' + table.nspname + '"."' + table.relname + '"';
    await tx.unsafe(
      `grant select ("${column.attname}") on ${target} to authenticated`,
    );
    await tx.unsafe(
      `grant update ("${column.attname}") on ${target} to authenticated`,
    );
    await tx`set local role authenticated`;
    const selected = await tx.unsafe(
      `select "${column.attname}" from ${target}`,
    );
    if (selected.length !== 0)
      throw new PendingRlsAccessDenied(`${table.relname} SELECT`);
    const changed = await tx.unsafe(
      `update ${target} set "${column.attname}"="${column.attname}"`,
    );
    if (changed.count !== 0)
      throw new PendingRlsAccessDenied(`${table.relname} UPDATE`);
    await tx`reset role`;
  }
  await tx`set local role authenticated`;
  const [access] =
    await tx`select app_private.has_workspace_access(${context.wsA.id},null) as own,app_private.has_workspace_access(${context.wsB.id},null) as foreign`;
  if (!access) throw new Error('Workspace access probe returned no row');
  if (access.own || access.foreign)
    throw new PendingRlsAccessDenied('workspace access');
  await tx`reset role`;
}
