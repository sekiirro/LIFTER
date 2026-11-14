import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  anonClient,
  checked,
  createStaff,
  sql,
  twoWorkspaceFixture,
} from './harness';

const db = sql();
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let revokedId: string;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
  const revoked = await createStaff('trainer', 'display-name-revoked');
  revokedId = revoked.userId;
  checked(
    await admin().from('workspace_memberships').insert({
      workspace_id: f.wsA.id,
      user_id: revokedId,
      granted_by: f.po.userId,
    }),
  );
  checked(
    await admin()
      .from('workspace_memberships')
      .update({ revoked_at: new Date().toISOString(), revoked_by: f.po.userId })
      .eq('workspace_id', f.wsA.id)
      .eq('user_id', revokedId),
  );
});

afterAll(async () => db.end());

async function readName(client: typeof f.woA.client, userId: string) {
  return client.rpc('get_staff_display_name', {
    p_target_user_id: userId,
  });
}

async function updateName(
  client: typeof f.woA.client,
  userId: string,
  name: string,
  version: number,
  key = randomUUID(),
) {
  return client.rpc('set_staff_display_name', {
    p_target_user_id: userId,
    p_display_name: name,
    p_expected_version: version,
    p_request_key: key,
  });
}

async function profile(userId: string): Promise<{
  display_name: string | null;
  display_name_version: number;
}> {
  const result = await admin()
    .from('staff_profiles')
    .select('display_name, display_name_version')
    .eq('user_id', userId)
    .single();
  if (result.error || !result.data)
    throw new Error(result.error?.message ?? 'Staff profile missing');
  return result.data;
}

describe('F21 staff display-name database foundation', () => {
  it('normalizes and validates names at the database write boundary', async () => {
    const target = f.trainerA.userId;
    const current = await profile(target);
    const accepted = await updateName(
      f.woA.client,
      target,
      '\u00a0Cafe\u0301 Staff\u3000',
      current.display_name_version,
    );
    expect(accepted.error).toBeNull();
    expect(accepted.data).toEqual({ status: 'ok' });
    expect(await profile(target)).toEqual({
      display_name: 'Café Staff',
      display_name_version: current.display_name_version + 1,
    });

    const afterAccepted = await profile(target);
    for (const invalid of [
      'Name\tName',
      'Name\u00a0Name',
      'Name\nName',
      'Name🙂',
      'A'.repeat(81),
    ]) {
      const before = await profile(target);
      const result = await updateName(
        f.woA.client,
        target,
        invalid,
        before.display_name_version,
      );
      expect(result.error?.code).toBe('22023');
      expect(await profile(target)).toEqual(before);
    }
    expect(afterAccepted.display_name).toBe('Café Staff');
  });

  it('requires a name on new staff profiles and does not grant direct name reads', async () => {
    const unprofiled = await createStaff(null, 'display-name-required');
    const missingName = await admin().from('staff_profiles').insert({
      user_id: unprofiled.userId,
      role: 'trainer',
    });
    expect(missingName.error?.code).toBe('23514');

    const directRead = await f.trainerA.client
      .from('staff_profiles')
      .select('display_name')
      .eq('user_id', f.trainerA.userId);
    expect(directRead.error?.code).toBe('42501');
  });

  it('backfills a pre-existing unnamed profile without revoking its workspace access', async () => {
    const legacy = await createStaff(null, 'display-name-legacy');
    await db.begin(async (tx) => {
      await tx`alter table public.staff_profiles disable trigger staff_profiles_guard_display_name`;
      try {
        await tx`insert into public.staff_profiles(user_id, role)
          values (${legacy.userId}, 'trainer'::public.staff_role)`;
      } finally {
        await tx`alter table public.staff_profiles enable trigger staff_profiles_guard_display_name`;
      }
    });
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: f.wsA.id,
        user_id: legacy.userId,
        granted_by: f.po.userId,
      }),
    );
    expect((await profile(legacy.userId)).display_name).toBeNull();
    const backfill = await updateName(
      f.woA.client,
      legacy.userId,
      'Legacy Staff',
      0,
    );
    expect(backfill.error).toBeNull();
    expect(backfill.data).toEqual({ status: 'ok' });
    expect(await profile(legacy.userId)).toEqual({
      display_name: 'Legacy Staff',
      display_name_version: 1,
    });
    const membership = await admin()
      .from('workspace_memberships')
      .select('revoked_at')
      .eq('workspace_id', f.wsA.id)
      .eq('user_id', legacy.userId)
      .single();
    expect(membership).toMatchObject({
      data: { revoked_at: null },
      error: null,
    });
  });

  it('keeps name read and write RPCs owned by postgres with an empty search path', async () => {
    const functions = await db`
      select p.proname, p.prosecdef,
        pg_get_userbyid(p.proowner) as owner,
        p.proconfig @> array['search_path=""'] as empty_search_path,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_exec
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('get_staff_display_name', 'set_staff_display_name')
      order by p.proname
    `;
    expect(functions).toEqual([
      {
        proname: 'get_staff_display_name',
        prosecdef: true,
        owner: 'postgres',
        empty_search_path: true,
        authenticated_exec: true,
        anon_exec: false,
        service_role_exec: false,
      },
      {
        proname: 'set_staff_display_name',
        prosecdef: true,
        owner: 'postgres',
        empty_search_path: true,
        authenticated_exec: true,
        anon_exec: false,
        service_role_exec: false,
      },
    ]);
  });

  it('reads names only for active same-workspace staff and the Platform Owner', async () => {
    const target = f.trainerA.userId;
    const poRead = await readName(f.po.client, target);
    const ownerRead = await readName(f.woA.client, target);
    const trainerRead = await readName(f.trainerA.client, target);
    for (const result of [poRead, ownerRead, trainerRead]) {
      expect(result.error).toBeNull();
      expect(result.data).toBeTruthy();
    }

    for (const result of [
      await readName(f.salesA.client, target),
      await readName(f.trainerB.client, target),
      await readName(f.trainerA.client, revokedId),
      await readName(anonClient(), target),
    ]) {
      expect(result.error?.code).toBe('42501');
    }

    const clientActor = await createStaff(null, 'display-name-client');
    const clientRead = await readName(clientActor.client, target);
    expect(clientRead.error?.code).toBe('42501');
  });

  it('authorizes name writes by derived memberships, not by caller-supplied scope', async () => {
    const target = f.trainerA.userId;
    const foreignTarget = f.trainerB.userId;
    const current = await profile(target);
    const own = await updateName(
      f.woA.client,
      target,
      'Owner Updated',
      current.display_name_version,
    );
    expect(own.error).toBeNull();
    expect(own.data).toEqual({ status: 'ok' });

    const beforeForeign = await profile(foreignTarget);
    const foreign = await updateName(
      f.woA.client,
      foreignTarget,
      'Should Not Apply',
      beforeForeign.display_name_version,
    );
    expect(foreign.error?.code).toBe('42501');
    expect(await profile(foreignTarget)).toEqual(beforeForeign);

    const sales = await updateName(
      f.salesA.client,
      target,
      'Sales Must Not Apply',
      (await profile(target)).display_name_version,
    );
    expect(sales.error?.code).toBe('42501');
    const clientActor = await createStaff(null, 'display-name-client-write');
    const clientWrite = await updateName(
      clientActor.client,
      target,
      'Client Must Not Apply',
      (await profile(target)).display_name_version,
    );
    expect(clientWrite.error?.code).toBe('42501');
    const po = await updateName(
      f.po.client,
      foreignTarget,
      'Platform Owner Name',
      beforeForeign.display_name_version,
    );
    expect(po.error).toBeNull();
    expect(po.data).toEqual({ status: 'ok' });
  });

  it('returns status-only retries and stale conflicts without a second audit or name disclosure', async () => {
    const target = f.trainerA.userId;
    const before = await profile(target);
    const key = randomUUID();
    const auditBefore = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    const first = await updateName(
      f.woA.client,
      target,
      'Retry Safe Name',
      before.display_name_version,
      key,
    );
    expect(first.error).toBeNull();
    expect(first.data).toEqual({ status: 'ok' });
    const retry = await updateName(
      f.woA.client,
      target,
      'Retry Safe Name',
      before.display_name_version,
      key,
    );
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ status: 'ok' });
    const replayedBySales = await updateName(
      f.salesA.client,
      target,
      'Retry Safe Name',
      before.display_name_version,
      key,
    );
    expect(replayedBySales.error?.code).toBe('42501');
    const auditAfter = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    expect(Number(auditAfter[0]?.n) - Number(auditBefore[0]?.n)).toBe(1);

    const updated = await profile(target);
    const stale = await updateName(
      f.woA.client,
      target,
      'Stale Must Not Apply',
      before.display_name_version,
    );
    expect(stale.error).toBeNull();
    expect(stale.data).toEqual({ status: 'conflict' });
    expect(await profile(target)).toEqual(updated);

    const saved = await db`
      select request_hash, result from app_private.operation_keys
      where actor_user_id = ${f.woA.userId}
        and operation_key = ${key}::uuid
    `;
    expect(saved[0]?.result).toEqual({ status: 'ok' });
    expect(JSON.stringify(saved[0])).not.toContain('Retry Safe Name');
    const event = await db`
      select actor_user_id, occurred_at, details from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
      order by id desc limit 1
    `;
    expect(event[0]).toMatchObject({
      actor_user_id: f.woA.userId,
      occurred_at: expect.any(Date),
      details: {},
    });
    expect(JSON.stringify(event[0])).not.toContain(key);
  });

  it('serializes competing writes so one expected-version update wins and one conflicts', async () => {
    const target = f.trainerA.userId;
    const before = await profile(target);
    const results = await Promise.all([
      updateName(
        f.woA.client,
        target,
        'Race Winner A',
        before.display_name_version,
      ),
      updateName(
        f.woA.client,
        target,
        'Race Winner B',
        before.display_name_version,
      ),
    ]);
    expect(results.map((result) => result.data?.status).sort()).toEqual([
      'conflict',
      'ok',
    ]);
    const after = await profile(target);
    expect(after.display_name_version).toBe(before.display_name_version + 1);
    expect(['Race Winner A', 'Race Winner B']).toContain(after.display_name);
  });

  it('treats a purged applied retry as stale and never emits a second audit', async () => {
    const target = f.trainerA.userId;
    const before = await profile(target);
    const key = randomUUID();
    const changed = await updateName(
      f.woA.client,
      target,
      'Applied Before Purge',
      before.display_name_version,
      key,
    );
    expect(changed.data).toEqual({ status: 'ok' });
    await db`
      delete from app_private.operation_keys
      where actor_user_id = ${f.woA.userId}
        and action = 'staff_display_names.set'
        and operation_key = ${key}::uuid
    `;
    const auditBeforeRetry = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    const retry = await updateName(
      f.woA.client,
      target,
      'Applied Before Purge',
      before.display_name_version,
      key,
    );
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ status: 'conflict' });
    expect(await profile(target)).toEqual({
      display_name: 'Applied Before Purge',
      display_name_version: before.display_name_version + 1,
    });
    const auditAfterRetry = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    expect(auditAfterRetry[0]?.n).toBe(auditBeforeRetry[0]?.n);
  });

  it('applies a never-applied retry once when no request-key record remains', async () => {
    const target = f.trainerA.userId;
    const before = await profile(target);
    const key = randomUUID();
    const auditBefore = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    const absentKey = await db`
      select count(*)::int as n from app_private.operation_keys
      where actor_user_id = ${f.woA.userId} and operation_key = ${key}::uuid
    `;
    expect(absentKey[0]?.n).toBe(0);
    const applied = await updateName(
      f.woA.client,
      target,
      'Never Applied Retry',
      before.display_name_version,
      key,
    );
    expect(applied.error).toBeNull();
    expect(applied.data).toEqual({ status: 'ok' });
    expect(await profile(target)).toEqual({
      display_name: 'Never Applied Retry',
      display_name_version: before.display_name_version + 1,
    });
    const auditAfter = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    expect(auditAfter[0]?.n).toBe(Number(auditBefore[0]?.n) + 1);
  });

  it('rolls back the name, request-key result, and audit together on transaction failure', async () => {
    const target = f.trainerA.userId;
    const before = await profile(target);
    const key = randomUUID();
    const auditBefore = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${f.woA.userId}, true)`;
        await tx`set local role authenticated`;
        await tx`select public.set_staff_display_name(
          ${target}, 'Rollback Name', ${before.display_name_version}, ${key}::uuid
        )`;
        throw new Error('force transaction rollback');
      }),
    ).rejects.toThrow('force transaction rollback');
    expect(await profile(target)).toEqual(before);
    const saved = await db`
      select count(*)::int as n from app_private.operation_keys
      where actor_user_id = ${f.woA.userId} and operation_key = ${key}::uuid
    `;
    const auditAfter = await db`
      select count(*)::int as n from public.audit_events
      where action = 'staff.display_name_changed' and target_id = ${target}
    `;
    expect(saved[0]?.n).toBe(0);
    expect(auditAfter[0]?.n).toBe(auditBefore[0]?.n);
  });
});

it('authorizes before validating request parameters or name content', async () => {
  const target = f.trainerB.userId;
  const before = await profile(target);
  const malformedKey = '00000000-0000-1000-8000-000000000001';
  const unauthorized = await updateName(
    f.woA.client,
    target,
    '\tInvalid Name',
    before.display_name_version,
    malformedKey,
  );
  expect(unauthorized.error?.code).toBe('42501');

  const authorizedMalformed = await updateName(
    f.woA.client,
    f.trainerA.userId,
    'Valid Name',
    (await profile(f.trainerA.userId)).display_name_version,
    malformedKey,
  );
  expect(authorizedMalformed.error?.code).toBe('22023');
  expect(await profile(target)).toEqual(before);
});
