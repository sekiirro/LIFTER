/*
 * Blocked controls use it.fails by default.
 * Strict mode: set AUTH_RECOVERY_RED_STRICT=1 when running
 * `npm run test:integration -- tests/integration/auth-recovery.test.ts`.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActorRows } from '../../lib/auth/actor';
import { buildRecoveryUrl } from '../../lib/auth/recovery-link';
import { isRecoverySession } from '../../lib/auth/recovery-session';
import { buildStaffResetEmailLink } from '../../lib/auth/staff-reset-hook';
import {
  admin,
  anonClient,
  checked,
  createStaff,
  loadEnv,
  sql,
  twoWorkspaceFixture,
} from './harness';
import {
  installedRecoveryTargetDefinition,
  restoreRecoveryTargetFixture,
} from './client-accounts-fixture';

const db = sql();
let sessionClientOverride: (() => ReturnType<typeof anonClient>) | null = null;
const LOCAL_HOOK_TESTS =
  ['c', 'd'].includes(process.env.LIFTER_SUPABASE_STACK ?? '') &&
  process.env.LOCAL_HOOK_TESTS === '1';

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', async () => ({
  createSessionClient: async () =>
    sessionClientOverride
      ? sessionClientOverride()
      : (await import('./harness')).anonClient(),
}));

const redIt = process.env.AUTH_RECOVERY_RED_STRICT ? it : it.fails;
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let cA: Awaited<ReturnType<typeof createStaff>>;
let cB: Awaited<ReturnType<typeof createStaff>>;
let otherTrainerA: Awaited<ReturnType<typeof createStaff>>;
let revokedTrainerA: Awaited<ReturnType<typeof createStaff>>;
let closedError: { message: string; code: string } | null;
let installedRecoveryTarget: string | null = null;

beforeAll(async () => {
  installedRecoveryTarget = await installedRecoveryTargetDefinition(db);
  f = await twoWorkspaceFixture();
  cA = await createStaff(null, 'recovery-client-a');
  cB = await createStaff(null, 'recovery-client-b');
  otherTrainerA = await createStaff('trainer', 'recovery-other-trainer-a');
  revokedTrainerA = await createStaff('trainer', 'recovery-revoked-trainer-a');
  checked(
    await admin()
      .from('workspace_memberships')
      .insert([
        {
          workspace_id: f.wsA.id,
          user_id: otherTrainerA.userId,
          granted_by: f.po.userId,
        },
        {
          workspace_id: f.wsA.id,
          user_id: revokedTrainerA.userId,
          granted_by: f.po.userId,
          revoked_at: new Date().toISOString(),
          revoked_by: f.po.userId,
        },
      ]),
  );
  closedError = (
    await f.po.client.rpc('recovery_link_authorize', { target: cA.userId })
  ).error;
  await db`create table if not exists public.test_recovery_targets(user_id uuid primary key, workspace_id uuid not null)`;
  await db`insert into public.test_recovery_targets(user_id, workspace_id) values
    (${cA.userId}, ${f.wsA.id}),
    (${cB.userId}, ${f.wsB.id}),
    (${f.woA.userId}, ${f.wsA.id}),
    (${f.po.userId}, ${f.wsA.id}),
    (${f.salesA.userId}, ${f.wsA.id}),
    (${f.trainerA.userId}, ${f.wsA.id}),
    (${otherTrainerA.userId}, ${f.wsA.id})`;
  await db`create or replace function app_private.recovery_target_workspace(target uuid) returns uuid
    language sql stable security definer set search_path = '' as $$
      select workspace_id from public.test_recovery_targets where user_id = target;
    $$`;
});

afterAll(async () => {
  try {
    if (installedRecoveryTarget)
      await restoreRecoveryTargetFixture(db, installedRecoveryTarget);
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

describe('staff-reset-guard (T049a)', () => {
  // T049a control B is blocked pre-production (tasks.md:183; S67-PO-9).
  redIt(
    'a staff password update without an intent is refused and leaves the password unchanged',
    async () => {
      const originalPassword = `Original-${randomUUID()}-Aa1!`;
      const staff = await createStaff(
        'trainer',
        'reset-guard-no-intent',
        originalPassword,
      );
      const userClient = anonClient();
      const signedIn = await userClient.auth.signInWithPassword({
        email: staff.email,
        password: originalPassword,
      });
      if (signedIn.error) throw new Error('guard fixture sign-in failed');
      const changedPassword = `NoIntent-${randomUUID()}-Aa1!`;
      const result = await userClient.auth.updateUser({
        password: changedPassword,
      });
      try {
        expect(result.error).not.toBeNull();
      } finally {
        if (!result.error) {
          const restored = await admin().auth.admin.updateUserById(
            staff.userId,
            {
              password: originalPassword,
            },
          );
          if (restored.error)
            throw new Error('guard fixture password restore failed');
        }
      }
      const oldPasswordWorks = await anonClient().auth.signInWithPassword({
        email: staff.email,
        password: originalPassword,
      });
      expect(oldPasswordWorks.error).toBeNull();
    },
  );

  // T049a control B is blocked pre-production (tasks.md:183; S67-PO-9).
  redIt(
    'a second signed-in staff session cannot update the password without an intent',
    async () => {
      const originalPassword = `Original-${randomUUID()}-Aa1!`;
      const staff = await createStaff(
        'trainer',
        'reset-guard-second-session',
        originalPassword,
      );
      const secondSession = anonClient();
      const signedIn = await secondSession.auth.signInWithPassword({
        email: staff.email,
        password: originalPassword,
      });
      expect(signedIn.error).toBeNull();

      const result = await secondSession.auth.updateUser({
        password: `NoIntent-${randomUUID()}-Aa1!`,
      });
      try {
        expect(result.error).not.toBeNull();
      } finally {
        if (!result.error) {
          const restored = await admin().auth.admin.updateUserById(
            staff.userId,
            {
              password: originalPassword,
            },
          );
          if (restored.error)
            throw new Error(
              'unexpectedly changed fixture password could not be restored',
            );
        }
      }
      expect(
        (
          await anonClient().auth.signInWithPassword({
            email: staff.email,
            password: originalPassword,
          })
        ).error,
      ).toBeNull();
    },
  );

  // T049a control B is blocked pre-production (tasks.md:183; S67-PO-9).
  redIt(
    'only the recovery session that opened the intent can change a staff password',
    async () => {
      const originalPassword = `Original-${randomUUID()}-Aa1!`;
      const staff = await createStaff(
        'trainer',
        'reset-guard-session-bound',
        originalPassword,
      );
      const recoverySession = anonClient();
      const hash = await hashedToken(staff.email);
      expect((await verify(recoverySession, hash)).error).toBeNull();
      const claims = await recoverySession.auth.getClaims();
      expect(claims.error).toBeNull();
      const recoverySessionId = claims.data?.claims.session_id;
      expect(typeof recoverySessionId).toBe('string');

      const begin = await recoverySession.rpc('staff_password_reset_begin');
      expect(begin.error).toBeNull();
      const intentId = begin.data as string;
      const competingSession = anonClient();
      expect(
        (
          await competingSession.auth.signInWithPassword({
            email: staff.email,
            password: originalPassword,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await competingSession.rpc('staff_password_reset_complete', {
            p_intent_id: intentId,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await competingSession.auth.updateUser({
            password: `Competing-${randomUUID()}-Aa1!`,
          })
        ).error,
      ).not.toBeNull();

      const newPassword = `Recovery-${randomUUID()}-Aa1!`;
      expect(
        (await recoverySession.auth.updateUser({ password: newPassword }))
          .error,
      ).toBeNull();
      expect(
        (
          await recoverySession.auth.updateUser({
            password: `SecondChange-${randomUUID()}-Aa1!`,
          })
        ).error,
      ).not.toBeNull();
      const [intent] = await db`
      select auth_user_id, session_id, state, password_changed_at
      from app_private.staff_password_reset_intents
      where intent_id = ${intentId}
    `;
      expect(intent).toMatchObject({
        auth_user_id: staff.userId,
        session_id: recoverySessionId,
        state: 'open',
      });
      expect(intent?.password_changed_at).not.toBeNull();
    },
  );

  // T049a trusted request context is blocked pre-production (tasks.md:183; S67-PO-9).
  redIt(
    'GoTrue provides a trusted recovery session_id to the auth.users password trigger',
    async () => {
      const staff = await createStaff(
        'trainer',
        'reset-guard-context-probe',
        `Context-${randomUUID()}-Aa1!`,
      );
      const recoverySession = anonClient();
      expect(
        (await verify(recoverySession, await hashedToken(staff.email))).error,
      ).toBeNull();
      const claims = await recoverySession.auth.getClaims();
      const expectedSessionId = claims.data?.claims.session_id;
      expect(typeof expectedSessionId).toBe('string');

      await db`create table public.test_staff_reset_context_probe (
      user_id uuid not null,
      session_id text,
      amr jsonb
    )`;
      await db.unsafe(`
      create function public.test_capture_staff_reset_context()
      returns trigger language plpgsql security definer set search_path = '' as $$
      begin
        insert into public.test_staff_reset_context_probe(user_id, session_id, amr)
        values (new.id, auth.jwt()->>'session_id', auth.jwt()->'amr');
        return new;
      end
      $$
    `);
      await db`create trigger a_test_capture_staff_reset_context
      before update of encrypted_password on auth.users
      for each row execute function public.test_capture_staff_reset_context()`;
      try {
        const changed = await recoverySession.auth.updateUser({
          password: `ContextChanged-${randomUUID()}-Aa1!`,
        });
        expect(changed.error).toBeNull();
        const [context] = await db`
        select session_id, amr from public.test_staff_reset_context_probe
        where user_id = ${staff.userId}
      `;
        expect(context?.session_id).toBe(expectedSessionId);
        expect(context?.amr).toEqual(claims.data?.claims.amr);
      } finally {
        await db`drop trigger if exists a_test_capture_staff_reset_context on auth.users`;
        await db`drop function if exists public.test_capture_staff_reset_context()`;
        await db`drop table if exists public.test_staff_reset_context_probe`;
      }
    },
  );

  it('does not block a client manual recovery password change', async () => {
    const oldPassword = `Original-${randomUUID()}-Aa1!`;
    const client = await createStaff(
      null,
      'reset-guard-client-manual',
      oldPassword,
    );
    const recoverySession = anonClient();
    expect(
      (await verify(recoverySession, await hashedToken(client.email))).error,
    ).toBeNull();
    expect(
      (
        await recoverySession.auth.updateUser({
          password: `ClientRecovery-${randomUUID()}-Aa1!`,
        })
      ).error,
    ).toBeNull();
  });
});

describe('staff-reset-intent (T049d)', () => {
  // T049d control B is blocked pre-production (tasks.md:186; S67-PO-9).
  redIt(
    'provides the idempotent begin, one-way complete/abort, and reconciliation RPCs',
    async () => {
      const [functions] = await db`
      select
        to_regprocedure('public.staff_password_reset_begin()') is not null as begin,
        to_regprocedure('public.staff_password_reset_complete(uuid)') is not null as complete,
        to_regprocedure('public.staff_password_reset_abort(uuid)') is not null as abort,
        to_regprocedure('app_private.staff_password_reset_reconcile()') is not null as reconcile
    `;
      expect(functions).toEqual({
        begin: true,
        complete: true,
        abort: true,
        reconcile: true,
      });
    },
  );

  // T049d control B is blocked pre-production (tasks.md:186; S67-PO-9).
  redIt(
    'retries begin from one recovery session without duplicating its intent or start audit',
    async () => {
      const staff = await createStaff(
        'trainer',
        'reset-intent-idempotent',
        `Intent-${randomUUID()}-Aa1!`,
      );
      const recoverySession = anonClient();
      expect(
        (await verify(recoverySession, await hashedToken(staff.email))).error,
      ).toBeNull();

      const first = await recoverySession.rpc('staff_password_reset_begin');
      expect(first.error).toBeNull();
      const retry = await recoverySession.rpc('staff_password_reset_begin');
      expect(retry.error).toBeNull();
      expect(retry.data).toBe(first.data);

      const [intentCount] = await db`
      select count(*)::int as count
      from app_private.staff_password_reset_intents
      where auth_user_id = ${staff.userId} and state = 'open'
    `;
      const [startCount] = await db`
      select count(*)::int as count
      from public.audit_events
      where action = 'staff_password_reset.completion_started'
        and details->>'intent_id' = ${first.data as string}
    `;
      expect(intentCount?.count).toBe(1);
      expect(startCount?.count).toBe(1);
    },
  );

  // T049d control B is blocked pre-production (tasks.md:186; S67-PO-9).
  redIt(
    'closes completed and aborted intents once and records one matching audit event',
    async () => {
      const completedPassword = `IntentComplete-${randomUUID()}-Aa1!`;
      const completedStaff = await createStaff(
        'trainer',
        'reset-intent-completed',
        completedPassword,
      );
      const completedSession = anonClient();
      expect(
        (
          await verify(
            completedSession,
            await hashedToken(completedStaff.email),
          )
        ).error,
      ).toBeNull();
      const completedBegin = await completedSession.rpc(
        'staff_password_reset_begin',
      );
      expect(completedBegin.error).toBeNull();
      const completedId = completedBegin.data as string;
      expect(
        (
          await completedSession.auth.updateUser({
            password: `IntentNew-${randomUUID()}-Aa1!`,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await completedSession.rpc('staff_password_reset_complete', {
            p_intent_id: completedId,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await completedSession.rpc('staff_password_reset_complete', {
            p_intent_id: completedId,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await completedSession.rpc('staff_password_reset_abort', {
            p_intent_id: completedId,
          })
        ).error,
      ).not.toBeNull();

      const abortedStaff = await createStaff(
        'trainer',
        'reset-intent-aborted',
        `IntentAbort-${randomUUID()}-Aa1!`,
      );
      const abortedSession = anonClient();
      expect(
        (await verify(abortedSession, await hashedToken(abortedStaff.email)))
          .error,
      ).toBeNull();
      const abortedBegin = await abortedSession.rpc(
        'staff_password_reset_begin',
      );
      expect(abortedBegin.error).toBeNull();
      const abortedId = abortedBegin.data as string;
      expect(
        (
          await abortedSession.rpc('staff_password_reset_abort', {
            p_intent_id: abortedId,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await abortedSession.rpc('staff_password_reset_abort', {
            p_intent_id: abortedId,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await abortedSession.rpc('staff_password_reset_complete', {
            p_intent_id: abortedId,
          })
        ).error,
      ).not.toBeNull();

      const [rows] = await db`
      select
        (select count(*)::int from app_private.staff_password_reset_intents
         where intent_id = ${completedId} and state = 'completed') as completed,
        (select count(*)::int from public.audit_events
         where action = 'staff_password_reset.completed'
           and details->>'intent_id' = ${completedId}) as completed_audit,
        (select count(*)::int from app_private.staff_password_reset_intents
         where intent_id = ${abortedId} and state = 'aborted') as aborted,
        (select count(*)::int from public.audit_events
         where action = 'staff_password_reset.completion_aborted'
           and details->>'intent_id' = ${abortedId}) as aborted_audit
    `;
      expect(rows).toEqual({
        completed: 1,
        completed_audit: 1,
        aborted: 1,
        aborted_audit: 1,
      });
    },
  );

  // T049d control B is blocked pre-production (tasks.md:186; S67-PO-9).
  redIt(
    'reconciles only stale open intents once and preserves the password-changed fact',
    async () => {
      const staff = await createStaff(
        'trainer',
        'reset-intent-reconcile',
        `IntentReconcile-${randomUUID()}-Aa1!`,
      );
      const recoverySession = anonClient();
      expect(
        (await verify(recoverySession, await hashedToken(staff.email))).error,
      ).toBeNull();
      const claims = await recoverySession.auth.getClaims();
      const sessionId = claims.data?.claims.session_id;
      expect(typeof sessionId).toBe('string');
      const intentId = randomUUID();
      await db`
      insert into app_private.staff_password_reset_intents (
        intent_id, auth_user_id, session_id, state, started_at,
        recovery_verified_at, password_changed_at
      ) values (
        ${intentId}, ${staff.userId}, ${sessionId as string}, 'open',
        now() - interval '901 seconds', now() - interval '901 seconds', null
      )
    `;

      await db`select app_private.staff_password_reset_reconcile()`;
      const [first] = await db`
      select state, password_changed_at, closed_at
      from app_private.staff_password_reset_intents where intent_id = ${intentId}
    `;
      const [event] = await db`
      select details from public.audit_events
      where action = 'staff_password_reset.completion_reconciled'
        and details->>'intent_id' = ${intentId}
    `;
      await db`select app_private.staff_password_reset_reconcile()`;
      const [count] = await db`
      select count(*)::int as count from public.audit_events
      where action = 'staff_password_reset.completion_reconciled'
        and details->>'intent_id' = ${intentId}
    `;
      expect(first).toMatchObject({
        state: 'reconciled',
        password_changed_at: null,
      });
      expect(first?.closed_at).not.toBeNull();
      expect(event?.details).toEqual({
        intent_id: intentId,
        password_changed: false,
      });
      expect(count?.count).toBe(1);
    },
  );
});

describe('recovery', () => {
  it('denies every target before installing the P1 test seam', () => {
    expect(closedError).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
  });

  it('locks target before actor and repeats the guard before inserting', async () => {
    const [row] =
      await db`select pg_catalog.pg_get_functiondef('public.recovery_link_record(uuid)'::regprocedure) as definition`;
    const definition = row!.definition as string;
    const targetLock = definition.indexOf(
      'pg_advisory_xact_lock(hashtextextended(target::text, 0))',
    );
    const actorLock = definition.indexOf(
      'pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0))',
    );
    const repeatedGuard = definition.indexOf(
      'app_private.recovery_link_guard(target)',
    );
    const insert = definition.indexOf(
      'insert into public.recovery_link_issuances',
    );
    expect(targetLock).toBeGreaterThanOrEqual(0);
    expect(targetLock).toBeLessThan(actorLock);
    expect(actorLock).toBeLessThan(repeatedGuard);
    expect(repeatedGuard).toBeLessThan(insert);
  });

  for (const [identity, workspace, allowed] of [
    ['po', 'A', true],
    ['po', 'B', true],
    ['woA', 'A', true],
    ['woA', 'B', false],
    ['trainerA', 'A', true],
    ['trainerB', 'A', false],
    ['salesA', 'A', false],
  ] as const) {
    it(`${identity} / ${workspace}: preflight, record and exact audit attribution`, async () => {
      const caller = f[identity];
      const target = workspace === 'A' ? cA.userId : cB.userId;
      const workspaceId = workspace === 'A' ? f.wsA.id : f.wsB.id;
      const [beforeAudit] =
        await db`select count(*)::int as count from public.audit_events
          where actor_user_id = ${caller.userId} and action = 'recovery_link.generated'`;
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
        const [afterAudit] =
          await db`select count(*)::int as count from public.audit_events
            where actor_user_id = ${caller.userId} and action = 'recovery_link.generated'`;
        expect(afterAudit?.count).toBe(beforeAudit?.count);
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

  it('denies a Trainer with revoked workspace membership', async () => {
    for (const name of ['recovery_link_authorize', 'recovery_link_record']) {
      const result = await revokedTrainerA.client.rpc(name, {
        target: cA.userId,
      });
      expect(result.error).toMatchObject({
        code: '42501',
        message: 'not_permitted',
      });
    }
    const [issuances] =
      await db`select count(*)::int as count from public.recovery_link_issuances where issued_by = ${revokedTrainerA.userId}`;
    const [events] =
      await db`select count(*)::int as count from public.audit_events where actor_user_id = ${revokedTrainerA.userId} and action = 'recovery_link.generated'`;
    expect(issuances?.count).toBe(0);
    expect(events?.count).toBe(0);
  });

  it('denies a Trainer targeting staff (including self) or an unknown target', async () => {
    const targets = [
      f.woA.userId,
      f.po.userId,
      otherTrainerA.userId,
      f.salesA.userId,
      f.trainerA.userId,
      randomUUID(),
    ];
    for (const target of targets) {
      for (const name of ['recovery_link_authorize', 'recovery_link_record']) {
        const result = await f.trainerA.client.rpc(name, { target });
        expect(result.error).toMatchObject({
          code: '42501',
          message: 'not_permitted',
        });
      }
      const [events] =
        await db`select count(*)::int as count from public.audit_events
          where actor_user_id = ${f.trainerA.userId}
            and action = 'recovery_link.generated'
            and details ->> 'target_user_id' = ${target}`;
      expect(events?.count).toBe(0);
    }
  });

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
    // S31-PO-3 / T031: 10 links per issuing staff account per rolling hour.
    for (let i = 0; i < 4; i++) {
      const target = (await clientTarget(f.wsA.id)).userId;
      for (let j = 0; j < (i === 3 ? 1 : 3); j++)
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
    expect(count?.count).toBe(10);
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

// T031 (FR-010): approved S31-PO-3 limits — 10 per issuer per rolling hour,
// 3 per client per rolling 24 hours across all issuers, with separate windows.
describe('approved recovery-link limits (T031)', () => {
  async function issuer(label: string) {
    const actor = await createStaff('workspace_owner', label);
    checked(
      await admin().from('workspace_memberships').insert({
        user_id: actor.userId,
        workspace_id: f.wsA.id,
        granted_by: f.po.userId,
      }),
    );
    return actor;
  }

  it('exposes the four approved limit columns and windows', async () => {
    const [row] =
      await db`select per_actor, per_actor_win, per_target, per_target_win
      from app_private.recovery_link_limits()`;
    expect(row).toEqual({
      per_actor: 10,
      per_actor_win: '01:00:00',
      per_target: 3,
      per_target_win: '24:00:00',
    });
  });

  it('allows exactly 10 per issuer per rolling hour, then reopens after the window', async () => {
    const actor = await issuer('t031-issuer-hour');
    for (let i = 0; i < 10; i++) {
      const target = (await clientTarget(f.wsA.id)).userId;
      expect(
        (await actor.client.rpc('recovery_link_record', { target })).error,
      ).toBeNull();
    }
    const over = (await clientTarget(f.wsA.id)).userId;
    await expect(
      actor.client.rpc('recovery_link_record', { target: over }),
    ).resolves.toMatchObject({
      error: { code: 'P0001', message: 'rate_limited' },
    });
    // A fresh issuer with ten issuances from two hours ago is inside no
    // one-hour window, so capacity has reopened.
    const historical = await issuer('t031-issuer-historical');
    for (let i = 0; i < 10; i++) {
      const past = (await clientTarget(f.wsA.id)).userId;
      await db`insert into public.recovery_link_issuances
        (workspace_id, target_user_id, issued_by, issued_at)
        values (${f.wsA.id}, ${past}, ${historical.userId}, now() - interval '2 hours')`;
    }
    const afterWindow = (await clientTarget(f.wsA.id)).userId;
    expect(
      (
        await historical.client.rpc('recovery_link_record', {
          target: afterWindow,
        })
      ).error,
    ).toBeNull();
  });

  it('allows exactly 3 per client per rolling 24 hours across issuers', async () => {
    const target = (await clientTarget(f.wsA.id)).userId;
    const first = await issuer('t031-client-issuer-1');
    const second = await issuer('t031-client-issuer-2');
    const third = await issuer('t031-client-issuer-3');
    expect(
      (await first.client.rpc('recovery_link_record', { target })).error,
    ).toBeNull();
    expect(
      (await second.client.rpc('recovery_link_record', { target })).error,
    ).toBeNull();
    expect(
      (await third.client.rpc('recovery_link_record', { target })).error,
    ).toBeNull();
    const blocked = await issuer('t031-client-issuer-4');
    await expect(
      blocked.client.rpc('recovery_link_record', { target }),
    ).resolves.toMatchObject({
      error: { code: 'P0001', message: 'rate_limited' },
    });
    // A client with three issuances from two hours ago is still inside the
    // rolling 24-hour window, regardless of which issuer created them.
    const twoHourClient = (await clientTarget(f.wsA.id)).userId;
    for (let i = 0; i < 3; i++)
      await db`insert into public.recovery_link_issuances
        (workspace_id, target_user_id, issued_by, issued_at)
        values (${f.wsA.id}, ${twoHourClient}, ${blocked.userId}, now() - interval '2 hours')`;
    await expect(
      blocked.client.rpc('recovery_link_record', { target: twoHourClient }),
    ).resolves.toMatchObject({
      error: { code: 'P0001', message: 'rate_limited' },
    });
    // After 25 hours the client window reopens.
    const oldClient = (await clientTarget(f.wsA.id)).userId;
    for (let i = 0; i < 3; i++)
      await db`insert into public.recovery_link_issuances
        (workspace_id, target_user_id, issued_by, issued_at)
        values (${f.wsA.id}, ${oldClient}, ${blocked.userId}, now() - interval '25 hours')`;
    expect(
      (await blocked.client.rpc('recovery_link_record', { target: oldClient }))
        .error,
    ).toBeNull();
  });

  it('serializes concurrent issuances at both approved limits', async () => {
    const actor = await issuer('t031-concurrent-issuer');
    const targets = await Promise.all(
      Array.from(
        { length: 12 },
        async () => (await clientTarget(f.wsA.id)).userId,
      ),
    );
    const results = await Promise.all(
      targets.map((target) =>
        actor.client.rpc('recovery_link_record', { target }),
      ),
    );
    expect(results.filter((row) => !row.error)).toHaveLength(10);
    for (const row of results.filter((row) => row.error))
      expect(row.error).toMatchObject({ message: 'rate_limited' });

    const client = (await clientTarget(f.wsA.id)).userId;
    const issuers = await Promise.all(
      Array.from({ length: 6 }, async (_, index) =>
        issuer(`t031-concurrent-client-${index}`),
      ),
    );
    const clientResults = await Promise.all(
      issuers.map((one) =>
        one.client.rpc('recovery_link_record', { target: client }),
      ),
    );
    expect(clientResults.filter((row) => !row.error)).toHaveLength(3);
    for (const row of clientResults.filter((row) => row.error))
      expect(row.error).toMatchObject({ message: 'rate_limited' });
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

function appOrigin() {
  const origin = process.env.APP_ORIGIN;
  if (!origin)
    throw new Error('APP_ORIGIN must point at the running local app');
  return new URL(origin).origin;
}

function mailpitUrl(pathname: string) {
  const env = loadEnv();
  const api = new URL(env.apiUrl);
  api.port = String(Number(api.port) + 3);
  api.pathname = pathname;
  api.search = '';
  return api;
}

async function capturedMessageCount() {
  const response = await fetch(mailpitUrl('/api/v1/messages'));
  if (!response.ok) throw new Error('Local message capture is unavailable');
  const result = (await response.json()) as { messages_count?: number };
  return result.messages_count ?? 0;
}

async function ensureApprovedResetStaff() {
  const email = 'staff-reset@example.test';
  const users = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error('Approved reset fixture lookup failed');
  let user = users.data.users.find((row) => row.email?.toLowerCase() === email);
  if (!user) {
    const created = await admin().auth.admin.createUser({
      email,
      password: `Reset-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error)
      throw new Error('Approved reset fixture creation failed');
    user = created.data.user;
  }
  await db`
    insert into public.staff_profiles (user_id, role, display_name)
    values (${user.id}, 'trainer', 'Reset recipient test')
    on conflict (user_id) do update
    set role = excluded.role, display_name = excluded.display_name
  `;
  return { userId: user.id, email };
}

async function appReset(email: string) {
  const { requestStaffReset } = await import('../../app/login/actions');
  sessionClientOverride = () => anonClient();
  try {
    const form = new FormData();
    form.set('email', email);
    return await requestStaffReset(null, form);
  } finally {
    sessionClientOverride = null;
  }
}

async function directAuthRecover(email: string) {
  const env = loadEnv();
  const url = new URL('/auth/v1/recover', env.apiUrl);
  const redirect = new URL('/auth/recovery', appOrigin());
  redirect.searchParams.set('flow', 'staff');
  redirect.searchParams.set('locale', 'en');
  url.searchParams.set('redirect_to', redirect.toString());
  const response = await fetch(url, {
    method: 'POST',
    headers: { apikey: env.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return { status: response.status, body: await response.text() };
}

async function capturedMessages() {
  const response = await fetch(mailpitUrl('/api/v1/messages'));
  if (!response.ok) throw new Error('Local message capture is unavailable');
  const result = (await response.json()) as {
    messages?: { ID?: string; id?: string }[];
  };
  return result.messages ?? [];
}

async function capturedMessageBody(id: string) {
  const response = await fetch(mailpitUrl(`/api/v1/message/${id}`));
  if (!response.ok) throw new Error('Captured message lookup failed');
  const message = (await response.json()) as { Text?: string; text?: string };
  return message.Text ?? message.text ?? '';
}

function tokenHashFromMessage(body: string) {
  const match = /[?&]token_hash=([^&\s]+)/.exec(body);
  if (!match?.[1]) throw new Error('Captured recovery link has no token_hash');
  return decodeURIComponent(match[1]);
}

async function resetHookRequests() {
  await db`delete from app_private.staff_password_reset_hook_requests`;
}

async function claimHookRequest(
  email: string,
  userId: string,
  eligible: boolean,
  permitted: boolean,
) {
  const targetHash = createHash('sha256').update(email).digest('hex');
  const { data, error } = await admin().rpc('staff_password_reset_hook_claim', {
    p_hook_id: randomUUID(),
    p_auth_user_id: userId,
    p_target_hash_hex: targetHash,
    p_eligible: eligible,
    p_permitted: permitted,
  });
  if (error) throw new Error(error.message);
  return data as string;
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

describe.skipIf(!LOCAL_HOOK_TESTS)('staff-reset-prefetch (T037a)', () => {
  it('does not verify on GET/HEAD, verifies once on POST, and keeps client links distinct', async () => {
    const user = await createStaff('trainer', 'reset-prefetch');
    const hash = await hashedToken(user.email);
    const client = anonClient();
    const verifyOtp = vi.spyOn(client.auth, 'verifyOtp');
    sessionClientOverride = () => client;
    try {
      const recoveryUrl = new URL('/auth/recovery', appOrigin());
      recoveryUrl.searchParams.set('token_hash', hash);
      recoveryUrl.searchParams.set('type', 'recovery');
      recoveryUrl.searchParams.set('flow', 'staff');
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await fetch(recoveryUrl, {
          method,
          redirect: 'manual',
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('set-cookie') ?? '').not.toMatch(
          /access-token|refresh-token/i,
        );
      }
      expect(verifyOtp).not.toHaveBeenCalled();
      expect((await client.auth.getSession()).data.session).toBeNull();

      const { verifyRecovery } =
        await import('../../app/auth/recovery/actions');
      const form = new FormData();
      form.set('token_hash', hash);
      expect(await verifyRecovery(null, form)).toEqual({ status: 'ok' });
      expect(verifyOtp).toHaveBeenCalledTimes(1);
      expect((await client.auth.getSession()).data.session).not.toBeNull();
      expect(await verifyRecovery(null, form)).toEqual({
        status: 'invalid_link',
      });
      expect(verifyOtp).toHaveBeenCalledTimes(2);

      const staffUrl = new URL(
        buildStaffResetEmailLink(hash, appOrigin(), 'en'),
      );
      expect(staffUrl.pathname).toBe('/auth/recovery');
      expect(staffUrl.searchParams.get('token_hash')).toBe(hash);
      expect(staffUrl.searchParams.get('type')).toBe('recovery');
      expect(staffUrl.searchParams.get('flow')).toBe('staff');
      const clientUrl = new URL(buildRecoveryUrl(appOrigin(), hash));
      expect(clientUrl.pathname).toBe('/auth/recovery');
      expect(clientUrl.searchParams.get('token_hash')).toBe(hash);
      expect(clientUrl.searchParams.get('type')).toBe('recovery');
      expect(clientUrl.searchParams.has('flow')).toBe(false);

      const { getMessages } = await import('../../lib/i18n');
      expect(getMessages('en')['auth.invalid_link']).toBe(
        'This link is invalid or expired. Ask your coach or workspace for a new link.',
      );
    } finally {
      sessionClientOverride = null;
      verifyOtp.mockRestore();
    }
  });
});

describe.skipIf(!LOCAL_HOOK_TESTS)('staff-reset-rate (T038)', () => {
  it('enforces account and global request limits, counts denied requests, and stays generic', async () => {
    const approved = await ensureApprovedResetStaff();
    await resetHookRequests();
    const messagesBefore = await capturedMessageCount();
    const unknownEmail = `unknown-${randomUUID()}@example.test`;
    const unknown = await directAuthRecover(unknownEmail);
    expect(unknown.status).toBe(200);
    expect(JSON.parse(unknown.body)).toEqual({});
    const unknownHash = createHash('sha256').update(unknownEmail).digest('hex');
    const [unknownRows] = await db<{ count: number }[]>`
      select count(*)::int as count
      from app_private.staff_password_reset_hook_requests
      where target_hash = decode(${unknownHash}, 'hex')
    `;
    expect(unknownRows?.count).toBe(0);
    expect(await capturedMessageCount()).toBe(messagesBefore);
    const accountOutcomes: string[] = [];
    for (let index = 0; index < 6; index += 1)
      accountOutcomes.push(
        await claimHookRequest(approved.email, approved.userId, true, true),
      );
    expect(accountOutcomes).toEqual([
      'accepted',
      'accepted',
      'delivery_limited',
      'delivery_limited',
      'delivery_limited',
      'rate_limited',
    ]);
    const [accountRows] = await db<{ outcomes: string[] }[]>`
      select array_agg(outcome order by occurred_at, hook_id) as outcomes
      from app_private.staff_password_reset_hook_requests
      where auth_user_id = ${approved.userId}
    `;
    expect(accountRows?.outcomes).toHaveLength(6);
    expect(await appReset(`unknown-${randomUUID()}@example.test`)).toEqual({
      status: 'ok',
    });
    expect(await capturedMessageCount()).toBe(messagesBefore);

    await resetHookRequests();
    const globalMessagesBefore = await capturedMessageCount();
    const globalUsers = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        createStaff('trainer', `reset-global-${index}`),
      ),
    );
    const globalOutcomes: string[] = [];
    for (let index = 0; index < 10; index += 1)
      globalOutcomes.push(
        await claimHookRequest(
          globalUsers[index]!.email,
          globalUsers[index]!.userId,
          true,
          false,
        ),
      );
    globalOutcomes.push(
      await claimHookRequest(approved.email, approved.userId, true, true),
    );
    expect(globalOutcomes).toEqual([
      ...Array.from({ length: 10 }, () => 'denied'),
      'rate_limited',
    ]);
    const [globalRows] = await db<{ outcomes: string[] }[]>`
      select array_agg(outcome order by occurred_at, hook_id) as outcomes
      from app_private.staff_password_reset_hook_requests
    `;
    expect(globalRows?.outcomes).toHaveLength(11);
    expect(globalRows?.outcomes?.slice(0, 10)).toEqual(
      Array.from({ length: 10 }, () => 'denied'),
    );
    expect(globalRows?.outcomes?.[10]).toBe('rate_limited');
    expect(await appReset(`unknown-${randomUUID()}@example.test`)).toEqual({
      status: 'ok',
    });
    expect(await capturedMessageCount()).toBe(globalMessagesBefore);
  }, 120_000);
});

describe.skipIf(!LOCAL_HOOK_TESTS)('staff-reset-link (T040)', () => {
  it('supersedes, consumes once, and expires emailed staff links', async () => {
    const approved = await ensureApprovedResetStaff();
    await resetHookRequests();
    const initialMessages = await capturedMessages();
    const initialIds = new Set(
      initialMessages.map((item) => item.ID ?? item.id),
    );
    const initialCount = await capturedMessageCount();
    expect(await appReset(approved.email)).toEqual({ status: 'ok' });
    const firstMessage = (await capturedMessages()).find(
      (item) => !initialIds.has(item.ID ?? item.id),
    );
    const firstId = firstMessage?.ID ?? firstMessage?.id;
    if (!firstId) throw new Error('First staff reset email was not captured');
    const firstHash = tokenHashFromMessage(await capturedMessageBody(firstId));

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await appReset(approved.email)).toEqual({ status: 'ok' });
    const secondMessage = (await capturedMessages()).find(
      (item) =>
        !initialIds.has(item.ID ?? item.id) && (item.ID ?? item.id) !== firstId,
    );
    const secondId = secondMessage?.ID ?? secondMessage?.id;
    if (!secondId) throw new Error('Second staff reset email was not captured');
    const secondHash = tokenHashFromMessage(
      await capturedMessageBody(secondId),
    );
    expect(await capturedMessageCount()).toBe(initialCount + 2);
    expect((await verify(anonClient(), firstHash)).error).not.toBeNull();
    const recoverySession = anonClient();
    expect((await verify(recoverySession, secondHash)).error).toBeNull();
    expect((await verify(anonClient(), secondHash)).error).not.toBeNull();

    const expiredHash = await hashedToken(approved.email);
    await db`update auth.users set recovery_sent_at = now() - interval '61 minutes' where id = ${approved.userId}`;
    expect((await verify(anonClient(), expiredHash)).error).not.toBeNull();
  }, 120_000);
});

describe.skipIf(!LOCAL_HOOK_TESTS)('staff-reset-delivery-cap (T038b)', () => {
  it('returns generic confirmation on the third request without another delivery', async () => {
    const approved = await ensureApprovedResetStaff();
    // PR #305: seed the 2 prior deliveries inside this test so it
    // passes alone and in the full file — previously it relied on T040's
    // emails still being in Mailpit and its accepted claims still being
    // inside the 1-hour delivery window.
    await resetHookRequests();
    const messagesBefore = await capturedMessageCount();
    expect(await appReset(approved.email)).toEqual({ status: 'ok' });
    // Same 1.1s gap T040 uses between consecutive reset requests.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await appReset(approved.email)).toEqual({ status: 'ok' });
    expect(await capturedMessageCount()).toBe(messagesBefore + 2);
    const thirdOutcome = await claimHookRequest(
      approved.email,
      approved.userId,
      true,
      true,
    );
    expect(thirdOutcome).toBe('delivery_limited');
    expect(await appReset(approved.email)).toEqual({ status: 'ok' });
    expect(await capturedMessageCount()).toBe(messagesBefore + 2);
  }, 120_000);
});

describe('staff-reset-sessions (T049e)', () => {
  // Control C implementation is blocked by T050a/S67-PO-9; retain the exact
  // expected local Auth/Data API revocation failure as RED coverage.
  redIt(
    'revokes prior sessions and rejects replay of a pre-reset Data API token',
    async () => {
      const originalPassword = `Sessions-${randomUUID()}-Aa1!`;
      const staff = await createStaff(
        'trainer',
        'reset-session-revocation',
        originalPassword,
      );
      const initiatingSession = anonClient();
      expect(
        (
          await initiatingSession.auth.signInWithPassword({
            email: staff.email,
            password: originalPassword,
          })
        ).error,
      ).toBeNull();
      const otherSession = anonClient();
      expect(
        (
          await otherSession.auth.signInWithPassword({
            email: staff.email,
            password: originalPassword,
          })
        ).error,
      ).toBeNull();
      const accessToken = (await initiatingSession.auth.getSession()).data
        .session?.access_token;
      expect(accessToken).toBeTruthy();
      const before = await initiatingSession
        .from('staff_profiles')
        .select('user_id')
        .eq('user_id', staff.userId)
        .single();
      expect(before.error).toBeNull();
      expect(before.data?.user_id).toBe(staff.userId);

      const recoverySession = anonClient();
      expect(
        (await verify(recoverySession, await hashedToken(staff.email))).error,
      ).toBeNull();
      expect(
        (
          await recoverySession.auth.updateUser({
            password: `SessionsChanged-${randomUUID()}-Aa1!`,
          })
        ).error,
      ).toBeNull();

      const initiatingUser = await initiatingSession.auth.getUser();
      const otherUser = await otherSession.auth.getUser();
      const recoveryUser = await recoverySession.auth.getUser();
      const env = loadEnv();
      const replay = await fetch(
        new URL('/rest/v1/staff_profiles?select=user_id', env.apiUrl),
        {
          headers: {
            apikey: env.anonKey,
            authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const replayPayload = (await replay.json()) as unknown;
      const replayHasProtectedData =
        Array.isArray(replayPayload) &&
        replayPayload.some(
          (row: { user_id?: string }) => row.user_id === staff.userId,
        );
      expect({
        initiatingSessionRejected: initiatingUser.error !== null,
        otherSessionRejected: otherUser.error !== null,
        recoverySessionRejected: recoveryUser.error !== null,
        replayRejected: replay.status >= 400,
        replayHasProtectedData,
      }).toEqual({
        initiatingSessionRejected: true,
        otherSessionRejected: true,
        recoverySessionRejected: true,
        replayRejected: true,
        replayHasProtectedData: false,
      });
    },
    120_000,
  );
});

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
  it('accepts a link verified 59 minutes after it was issued', async () => {
    const user = await createStaff(null, 'recovery-window-59');
    const hash = await hashedToken(user.email);
    await db`update auth.users set recovery_sent_at = now() - interval '59 minutes' where id = ${user.userId}`;
    expect((await verify(anonClient(), hash)).error).toBeNull();
  });
  it('rejects a link verified 61 minutes after it was issued', async () => {
    const user = await createStaff(null, 'recovery-window-61');
    const hash = await hashedToken(user.email);
    await db`update auth.users set recovery_sent_at = now() - interval '61 minutes' where id = ${user.userId}`;
    expect((await verify(anonClient(), hash)).error).not.toBeNull();
  });
  it('a link verified near expiry starts a fresh 15-minute session', async () => {
    const user = await createStaff(null, 'recovery-window-session');
    const hash = await hashedToken(user.email);
    const client = anonClient();
    await db`update auth.users set recovery_sent_at = now() - interval '50 minutes' where id = ${user.userId}`;
    expect((await verify(client, hash)).error).toBeNull();
    const claims = await latestAmrMethod(client);
    const latest = Math.max(
      ...claims.amr.map((e) => (typeof e === 'object' ? e.timestamp : 0)),
    );
    expect(isRecoverySession(claims.amr, Math.floor(Date.now() / 1000))).toBe(
      true,
    );
    expect(isRecoverySession(claims.amr, latest + 900)).toBe(true);
    expect(isRecoverySession(claims.amr, latest + 901)).toBe(false);
  });
});
