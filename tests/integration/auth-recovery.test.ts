import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActorRows } from '../../lib/auth/actor';
import { isRecoverySession } from '../../lib/auth/recovery-session';
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
let cA: Awaited<ReturnType<typeof createStaff>>;
let cB: Awaited<ReturnType<typeof createStaff>>;
let closedError: { message: string; code: string } | null;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
  cA = await createStaff(null, 'recovery-client-a');
  cB = await createStaff(null, 'recovery-client-b');
  closedError = (
    await f.po.client.rpc('recovery_link_authorize', { target: cA.userId })
  ).error;
  await db`create table if not exists public.test_recovery_targets(user_id uuid primary key, workspace_id uuid not null)`;
  await db`insert into public.test_recovery_targets(user_id, workspace_id) values (${cA.userId}, ${f.wsA.id}), (${cB.userId}, ${f.wsB.id}), (${f.woA.userId}, ${f.wsA.id})`;
  await db`create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
    language sql stable security definer set search_path = '' as $$
      select workspace_id from public.test_recovery_targets where user_id = target;
    $$`;
});

afterAll(async () => {
  try {
    await db`create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
      language sql stable security definer set search_path = '' as $$ select null::uuid; $$`;
  } finally {
    try {
      await db`drop table if exists public.test_recovery_targets`;
    } finally {
      await db.end();
    }
  }
});

async function clientTarget(workspaceId: string) {
  const user = await createStaff(null, 'recovery-extra');
  await db`insert into public.test_recovery_targets(user_id, workspace_id) values (${user.userId}, ${workspaceId})`;
  return user;
}

describe('actor', () => {
  it('reads verified staff rows and immediately removes revoked scope', async () => {
    expect(await loadActorRows(f.trainerA.client, f.trainerA.userId)).toEqual({
      userId: f.trainerA.userId,
      role: 'trainer',
      activeWorkspaceIds: [f.wsA.id],
    });
    checked(
      await f.po.client
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: f.po.userId,
        })
        .eq('user_id', f.trainerA.userId)
        .eq('workspace_id', f.wsA.id),
    );
    expect(await loadActorRows(f.trainerA.client, f.trainerA.userId)).toEqual({
      userId: f.trainerA.userId,
      role: 'trainer',
      activeWorkspaceIds: [],
    });
    // Keep the recovery matrix's Trainer denial independent of revocation.
    checked(
      await f.po.client.from('workspace_memberships').insert({
        user_id: f.trainerA.userId,
        workspace_id: f.wsA.id,
        granted_by: f.po.userId,
      }),
    );
  });
  it('has no role for an auth-only user', async () => {
    expect(await loadActorRows(cA.client, cA.userId)).toEqual({
      userId: cA.userId,
      role: null,
      activeWorkspaceIds: [],
    });
  });
});

describe('recovery', () => {
  it('denies every target before installing the P1 test seam', () => {
    expect(closedError).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
  });

  for (const [identity, workspace, allowed] of [
    ['po', 'A', true],
    ['po', 'B', true],
    ['woA', 'A', true],
    ['woA', 'B', false],
    ['trainerA', 'A', false],
    ['salesA', 'A', false],
  ] as const) {
    it(`${identity} / ${workspace}: preflight, record and exact audit attribution`, async () => {
      const caller = f[identity];
      const target = workspace === 'A' ? cA.userId : cB.userId;
      const workspaceId = workspace === 'A' ? f.wsA.id : f.wsB.id;
      const preflight = await caller.client.rpc('recovery_link_authorize', {
        target,
      });
      const record = await caller.client.rpc('recovery_link_record', {
        target,
      });
      if (!allowed) {
        for (const result of [preflight, record])
          expect(result.error).toMatchObject({
            code: '42501',
            message: 'not_permitted',
          });
        return;
      }
      expect(preflight.error).toBeNull();
      expect(preflight.data).toBe(workspaceId);
      expect(record.error).toBeNull();
      const rows =
        await db`select actor_user_id, workspace_id, details from public.audit_events
        where target_table = 'recovery_link_issuances' and target_id = ${record.data} and action = 'recovery_link.generated'`;
      expect(rows).toEqual([
        {
          actor_user_id: caller.userId,
          workspace_id: workspaceId,
          details: { target_user_id: target },
        },
      ]);
      expect(JSON.stringify(rows[0]?.details)).not.toContain('@');
    });
  }

  it('denies anonymous RPC execution', async () => {
    for (const name of ['recovery_link_authorize', 'recovery_link_record']) {
      const result = await anonClient().rpc(name, { target: cA.userId });
      expect(result.error?.code).toBe('42501');
      expect(result.data).toBeNull();
    }
  });
  it('uses identical authenticated denials for unknown, staff and self targets', async () => {
    for (const target of [randomUUID(), f.woA.userId, f.po.userId]) {
      for (const name of ['recovery_link_authorize', 'recovery_link_record']) {
        const result = await f.po.client.rpc(name, { target });
        expect(result.error).toMatchObject({
          code: '42501',
          message: 'not_permitted',
        });
      }
    }
    const self = await f.woA.client.rpc('recovery_link_record', {
      target: f.woA.userId,
    });
    expect(self.error).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
  });
  it('enforces the per-target limit across actors without a fourth row or event', async () => {
    const target = (await clientTarget(f.wsA.id)).userId;
    for (let i = 0; i < 3; i++)
      expect(
        (await f.po.client.rpc('recovery_link_record', { target })).error,
      ).toBeNull();
    for (const name of ['recovery_link_authorize', 'recovery_link_record']) {
      const result = await f.woA.client.rpc(name, { target });
      expect(result.error).toMatchObject({
        code: 'P0001',
        message: 'rate_limited',
      });
    }
    const [rows] =
      await db`select count(*)::int as count from public.recovery_link_issuances where target_user_id = ${target}`;
    const [events] =
      await db`select count(*)::int as count from public.audit_events where action = 'recovery_link.generated' and details ->> 'target_user_id' = ${target}`;
    expect(rows?.count).toBe(3);
    expect(events?.count).toBe(3);
  });
  it('serializes concurrent records at the target limit', async () => {
    const target = (await clientTarget(f.wsA.id)).userId;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        f.woA.client.rpc('recovery_link_record', { target }),
      ),
    );
    expect(results.filter((row) => !row.error)).toHaveLength(3);
    for (const row of results.filter((row) => row.error))
      expect(row.error).toMatchObject({ message: 'rate_limited' });
  });
  it('enforces the actor limit across different targets', async () => {
    // Fresh actor isolates this rolling limit from the matrix above.
    const actor = await createStaff('workspace_owner', 'recovery-limit-owner');
    checked(
      await admin().from('workspace_memberships').insert({
        user_id: actor.userId,
        workspace_id: f.wsA.id,
        granted_by: f.po.userId,
      }),
    );
    for (let i = 0; i < 7; i++) {
      const target = (await clientTarget(f.wsA.id)).userId;
      for (let j = 0; j < (i === 6 ? 2 : 3); j++)
        expect(
          (await actor.client.rpc('recovery_link_record', { target })).error,
        ).toBeNull();
    }
    const target = (await clientTarget(f.wsA.id)).userId;
    const result = await actor.client.rpc('recovery_link_record', { target });
    expect(result.error).toMatchObject({
      code: 'P0001',
      message: 'rate_limited',
    });
    const [count] =
      await db`select count(*)::int as count from public.recovery_link_issuances where issued_by = ${actor.userId}`;
    expect(count?.count).toBe(20);
  });
  it('exposes no direct table writes to any API identity', async () => {
    for (const client of [anonClient(), f.po.client, f.woA.client, admin()]) {
      const writes = [
        await client
          .from('recovery_link_issuances')
          .insert({
            workspace_id: f.wsA.id,
            target_user_id: cA.userId,
            issued_by: f.po.userId,
          })
          .select(),
        await client
          .from('recovery_link_issuances')
          .update({ issued_at: new Date().toISOString() })
          .eq('target_user_id', cA.userId)
          .select(),
        await client
          .from('recovery_link_issuances')
          .delete()
          .eq('target_user_id', cA.userId)
          .select(),
      ];
      for (const result of writes)
        expect(!!result.error || result.data?.length === 0).toBe(true);
    }
  });
  it('service_role has no privileges', async () => {
    for (const op of ['update', 'delete', 'truncate']) {
      await expect(
        db.begin(async (tx) => {
          await tx`set local role service_role`;
          if (op === 'update')
            await tx`update public.recovery_link_issuances set issued_at = now() where target_user_id = ${cA.userId}`;
          if (op === 'delete')
            await tx`delete from public.recovery_link_issuances where target_user_id = ${cA.userId}`;
          if (op === 'truncate')
            await tx`truncate public.recovery_link_issuances`;
          throw new Error('privilege check did not reject');
        }),
      ).rejects.toMatchObject({ code: '42501' });
    }
  });
  it('guards reject even the table owner', async () => {
    for (const op of ['update', 'delete', 'truncate']) {
      await expect(
        db.begin(async (tx) => {
          const id = randomUUID();
          await tx`insert into public.recovery_link_issuances (id, workspace_id, target_user_id, issued_by)
            values (${id}, ${f.wsA.id}, ${cA.userId}, ${f.po.userId})`;
          if (op === 'update')
            await tx`update public.recovery_link_issuances set issued_at = now() where id = ${id}`;
          if (op === 'delete')
            await tx`delete from public.recovery_link_issuances where id = ${id}`;
          if (op === 'truncate')
            await tx`truncate public.recovery_link_issuances`;
          throw new Error('guard did not reject');
        }),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });
});

async function hashedToken(email: string) {
  const result = await admin().auth.admin.generateLink({
    type: 'recovery',
    email,
  });
  if (result.error || !result.data.properties?.hashed_token)
    throw new Error('recovery fixture generation failed');
  return result.data.properties.hashed_token;
}
async function verify(client: SupabaseClient, token_hash: string) {
  return client.auth.verifyOtp({ type: 'recovery', token_hash });
}

async function latestAmrMethod(client: SupabaseClient) {
  const claims = await client.auth.getClaims();
  if (claims.error || !claims.data?.claims.amr?.length)
    throw new Error('session claims fixture missing');
  let latest: { method: string; timestamp: number } | null = null;
  for (const entry of claims.data.claims.amr) {
    if (typeof entry !== 'object' || typeof entry.timestamp !== 'number')
      throw new Error('session claims fixture malformed');
    if (!latest || entry.timestamp > latest.timestamp) latest = entry;
  }
  return { method: latest?.method, amr: claims.data.claims.amr };
}

describe('provider lifecycle', () => {
  it('consumes once, sets a password and signs in with that password', async () => {
    const user = await createStaff(null, 'recovery-lifecycle');
    const hash = await hashedToken(user.email);
    const client = anonClient();
    expect((await verify(client, hash)).error).toBeNull();
    const recoveryClaims = await latestAmrMethod(client);
    expect(recoveryClaims.method).toBe('otp');
    expect(
      isRecoverySession(recoveryClaims.amr, Math.floor(Date.now() / 1000)),
    ).toBe(true);
    expect((await verify(anonClient(), hash)).error).not.toBeNull();
    const password = `Recovery-${randomUUID()}-Aa1!`;
    expect((await client.auth.updateUser({ password })).error).toBeNull();
    const passwordClient = anonClient();
    expect(
      (
        await passwordClient.auth.signInWithPassword({
          email: user.email,
          password,
        })
      ).error,
    ).toBeNull();
    const passwordClaims = await latestAmrMethod(passwordClient);
    expect(passwordClaims.method).toBe('password');
    expect(
      isRecoverySession(passwordClaims.amr, Math.floor(Date.now() / 1000)),
    ).toBe(false);
  });
  it('supersedes an earlier unused hash', async () => {
    const user = await createStaff(null, 'recovery-superseded');
    const first = await hashedToken(user.email);
    const second = await hashedToken(user.email);
    expect((await verify(anonClient(), first)).error).not.toBeNull();
    expect((await verify(anonClient(), second)).error).toBeNull();
  });
  it('rejects an expired hash', async () => {
    const user = await createStaff(null, 'recovery-expired');
    const hash = await hashedToken(user.email);
    await db`update auth.users set recovery_sent_at = now() - interval '2 days' where id = ${user.userId}`;
    expect((await verify(anonClient(), hash)).error).not.toBeNull();
  });
});
