import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { admin, loadEnv, sql } from './harness';

const LOCAL_STACK = ['c', 'd'].includes(
  process.env.LIFTER_SUPABASE_STACK ?? '',
);
const db = sql();
const runId = randomUUID();
const hookPrefix = `t044-${runId}`;
let testUserId: string | null = null;
let requestSequence = 0;

function targetHash(suffix: string): string {
  return createHash('sha256').update(`${runId}:${suffix}`).digest('hex');
}

function nextHookId(): string {
  requestSequence += 1;
  return `${hookPrefix}-${requestSequence}`;
}

async function claimRequest(
  hookId: string,
  hash: string,
  eligible = true,
  permitted = true,
) {
  if (!testUserId) throw new Error('T044 synthetic user was not initialized');
  const result = await admin().rpc('staff_password_reset_hook_claim', {
    p_hook_id: hookId,
    p_auth_user_id: testUserId,
    p_target_hash_hex: hash,
    p_eligible: eligible,
    p_permitted: permitted,
  });
  if (result.error) throw result.error;
  return result.data;
}

describe.skipIf(!LOCAL_STACK)('T044 staff reset hook schema', () => {
  beforeAll(() => {
    loadEnv();
    testUserId = randomUUID();
  });

  afterEach(async () => {
    const [schema] = await db<{ available: boolean }[]>`
      select to_regclass('app_private.staff_password_reset_hook_requests')
        is not null as available
    `;
    if (!schema?.available) return;
    await db`
      delete from app_private.staff_password_reset_hook_requests
      where hook_id like ${`${hookPrefix}-%`}
    `;
  });

  afterAll(async () => {
    await db.end();
  });

  it('applies account and delivery limits to hook-reaching claims', async () => {
    const hash = targetHash('one-account');
    const outcomes: unknown[] = [];
    for (let index = 0; index < 6; index += 1) {
      outcomes.push(await claimRequest(nextHookId(), hash));
    }

    expect(outcomes).toEqual([
      'accepted',
      'accepted',
      'delivery_limited',
      'delivery_limited',
      'delivery_limited',
      'rate_limited',
    ]);
  });

  it('applies the global request cap across distinct targets', async () => {
    const outcomes: unknown[] = [];
    for (let index = 0; index < 11; index += 1) {
      outcomes.push(
        await claimRequest(nextHookId(), targetHash(`target-${index}`)),
      );
    }

    expect(outcomes).toEqual([
      'accepted',
      'accepted',
      ...Array.from({ length: 8 }, () => 'delivery_limited'),
      'rate_limited',
    ]);
  });

  it('counts denied hook requests and does not reserve delivery for them', async () => {
    const hash = targetHash('denied');
    const first = await claimRequest(nextHookId(), hash, false, true);
    const second = await claimRequest(nextHookId(), hash, false, true);
    const [counts] = await db<{ requests: string; deliveries: string }[]>`
      select
        count(*)::text as requests,
        count(*) filter (where delivery_reserved)::text as deliveries
      from app_private.staff_password_reset_hook_requests
      where target_hash = decode(${hash}, 'hex')
    `;

    expect(first).toBe('denied');
    expect(second).toBe('denied');
    expect(counts?.requests).toBe('2');
    expect(counts?.deliveries).toBe('0');
  });

  it('keeps the request table private and exposes only service-role RPCs', async () => {
    const [privileges] = await db<
      {
        row_security: boolean;
        force_row_security: boolean;
        service_table_access: boolean;
        anon_claim: boolean;
        authenticated_claim: boolean;
        service_claim: boolean;
        anon_audit: boolean;
        authenticated_audit: boolean;
        service_audit: boolean;
        claim_is_definer: boolean;
        claim_config: string[] | null;
      }[]
    >`
      select
        relation.relrowsecurity as row_security,
        relation.relforcerowsecurity as force_row_security,
        has_table_privilege(
          'service_role',
          'app_private.staff_password_reset_hook_requests',
          'SELECT'
        ) as service_table_access,
        has_function_privilege(
          'anon',
          'public.staff_password_reset_hook_claim(text,uuid,text,boolean,boolean)'::regprocedure,
          'EXECUTE'
        ) as anon_claim,
        has_function_privilege(
          'authenticated',
          'public.staff_password_reset_hook_claim(text,uuid,text,boolean,boolean)'::regprocedure,
          'EXECUTE'
        ) as authenticated_claim,
        has_function_privilege(
          'service_role',
          'public.staff_password_reset_hook_claim(text,uuid,text,boolean,boolean)'::regprocedure,
          'EXECUTE'
        ) as service_claim,
        has_function_privilege(
          'anon',
          'public.staff_password_reset_hook_audit(text)'::regprocedure,
          'EXECUTE'
        ) as anon_audit,
        has_function_privilege(
          'authenticated',
          'public.staff_password_reset_hook_audit(text)'::regprocedure,
          'EXECUTE'
        ) as authenticated_audit,
        has_function_privilege(
          'service_role',
          'public.staff_password_reset_hook_audit(text)'::regprocedure,
          'EXECUTE'
        ) as service_audit,
        claim.prosecdef as claim_is_definer,
        claim.proconfig as claim_config
      from pg_class as relation
      join pg_namespace as schema on schema.oid = relation.relnamespace
      join pg_proc as claim
        on claim.oid = 'public.staff_password_reset_hook_claim(text,uuid,text,boolean,boolean)'::regprocedure
      where schema.nspname = 'app_private'
        and relation.relname = 'staff_password_reset_hook_requests'
    `;

    expect(privileges?.row_security).toBe(true);
    expect(privileges?.force_row_security).toBe(true);
    expect(privileges?.service_table_access).toBe(false);
    expect(privileges?.anon_claim).toBe(false);
    expect(privileges?.authenticated_claim).toBe(false);
    expect(privileges?.service_claim).toBe(true);
    expect(privileges?.anon_audit).toBe(false);
    expect(privileges?.authenticated_audit).toBe(false);
    expect(privileges?.service_audit).toBe(true);
    expect(privileges?.claim_is_definer).toBe(true);
    expect(privileges?.claim_config).toContain('search_path=""');
  });

  it('deduplicates hook IDs and writes the requested audit exactly once', async () => {
    if (!testUserId) throw new Error('T044 synthetic user was not initialized');
    const hookId = nextHookId();
    const hash = targetHash('audit');
    const rollback = new Error('rollback T044 audit fixture');

    await expect(
      db.begin(async (tx) => {
        const [firstClaim] = await tx<{ outcome: string }[]>`
          select public.staff_password_reset_hook_claim(
            ${hookId}, ${testUserId}, ${hash}, true, true
          ) as outcome
        `;
        const [duplicateClaim] = await tx<{ outcome: string }[]>`
          select public.staff_password_reset_hook_claim(
            ${hookId}, ${testUserId}, ${hash}, true, true
          ) as outcome
        `;
        const [firstAudit] = await tx<{ written: boolean }[]>`
          select public.staff_password_reset_hook_audit(${hookId}) as written
        `;
        const [secondAudit] = await tx<{ written: boolean }[]>`
          select public.staff_password_reset_hook_audit(${hookId}) as written
        `;
        const [rows] = await tx<{ count: string; audit_written: boolean }[]>`
          select
            count(audit.id)::text as count,
            bool_or(request.audit_written) as audit_written
          from app_private.staff_password_reset_hook_requests as request
          left join public.audit_events as audit
            on audit.action = 'staff_password_reset.requested'
            and audit.target_id = request.auth_user_id
          where request.hook_id = ${hookId}
        `;

        expect(firstClaim?.outcome).toBe('accepted');
        expect(duplicateClaim?.outcome).toBe('duplicate');
        expect(firstAudit?.written).toBe(true);
        expect(secondAudit?.written).toBe(true);
        expect(rows?.count).toBe('1');
        expect(rows?.audit_written).toBe(true);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('fails the audit claim closed when the requested audit insert fails', async () => {
    const hookId = nextHookId();
    const hash = targetHash('audit-failure');
    expect(await claimRequest(hookId, hash)).toBe('accepted');

    await expect(
      db.begin(async (tx) => {
        await tx`create function public.t044_test_reject_requested_audit()
          returns trigger language plpgsql set search_path = '' as $$
          begin
            if new.action = 'staff_password_reset.requested' then
              raise exception 'synthetic requested-audit failure';
            end if;
            return new;
          end $$`;
        await tx`create trigger t044_test_reject_requested_audit
          before insert on public.audit_events
          for each row execute function public.t044_test_reject_requested_audit()`;
        await tx`select public.staff_password_reset_hook_audit(${hookId})`;
      }),
    ).rejects.toThrow('synthetic requested-audit failure');

    const [request] = await db<{ audit_written: boolean }[]>`
      select audit_written
      from app_private.staff_password_reset_hook_requests
      where hook_id = ${hookId}
    `;
    expect(request?.audit_written).toBe(false);
    const [audit] = await db<{ count: string }[]>`
      select count(*)::text as count
      from public.audit_events
      where action = 'staff_password_reset.requested'
        and target_id = ${testUserId}
    `;
    expect(audit?.count).toBe('0');
  });
});
