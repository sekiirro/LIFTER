import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, loadEnv, sql } from './harness';

const LOCAL_STACK = ['c', 'd'].includes(
  process.env.LIFTER_SUPABASE_STACK ?? '',
);
const STACK_C = process.env.LIFTER_SUPABASE_STACK === 'c';
const TEST_RECIPIENT = 'staff-reset@example.test';
const db = sql();
let testUserId: string | null = null;
let refusedUserId: string | null = null;
const REFUSED_TEST_EMAIL = 'staff-reset-refused@example.test';

async function capturedMessageCount() {
  const url = new URL('/api/v1/messages', loadEnv().apiUrl);
  url.port = STACK_C ? '35424' : '45424';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Local message capture is unavailable');
  const result = (await response.json()) as { messages_count?: number };
  return result.messages_count ?? 0;
}

function appOrigin() {
  return STACK_C
    ? 'http://127.0.0.1:3103'
    : (process.env.APP_ORIGIN ?? 'http://localhost:3104');
}

function recoveryRedirect(locale: 'ar' | 'en') {
  const url = new URL('/auth/recovery', appOrigin());
  url.searchParams.set('flow', 'staff');
  url.searchParams.set('locale', locale);
  return url.toString();
}

describe.skipIf(!LOCAL_STACK)('staff reset send-email hook', () => {
  beforeAll(() => {
    loadEnv();
  });

  afterAll(async () => {
    // Governance rows are immutable. Keep the single approved local fixture;
    // the next stack reset removes it without bypassing that protection.
    // The local Auth audit/request records retain this synthetic non-staff user;
    // the next stack reset clears it without bypassing immutable governance.
    await db.end();
  });

  it('rejects unsigned hook requests before any mail side effect', async () => {
    const messagesBefore = await capturedMessageCount();
    const hookUrl = new URL('/api/internal/staff-reset-hook', appOrigin());
    const response = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
    expect(await capturedMessageCount()).toBe(messagesBefore);
  });

  it('counts an unknown direct /recover call only if the hook is reached', async () => {
    const email = `unknown-${randomUUID()}@example.test`;
    const targetHash = createHash('sha256').update(email).digest('hex');
    const messagesBefore = await capturedMessageCount();

    const result = await anonClient().auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirect('ar'),
    });
    expect(result.error).toBeNull();

    const [requests] = await db<{ count: string }[]>`
      select count(*)::text as count
      from app_private.staff_password_reset_hook_requests
      where target_hash = decode(${targetHash}, 'hex')
    `;
    expect(Number(requests?.count ?? 0)).toBe(0);
    expect(await capturedMessageCount()).toBe(messagesBefore);
  });

  it('audits before sending one email to the approved local test recipient', async () => {
    const existingUsers = await admin().auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (existingUsers.error)
      throw new Error('Approved reset fixture lookup failed');
    const fixture = existingUsers.data.users.find(
      (user) => user.email?.toLowerCase() === TEST_RECIPIENT,
    );
    if (fixture) {
      testUserId = fixture.id;
    } else {
      const created = await admin().auth.admin.createUser({
        email: TEST_RECIPIENT,
        password: `Reset-${randomUUID()}-aA1!`,
        email_confirm: true,
      });
      if (created.error)
        throw new Error('Approved reset fixture creation failed');
      testUserId = created.data.user.id;
    }
    await db`
      insert into public.staff_profiles (user_id, role, display_name)
      values (${testUserId}, 'trainer', 'Reset recipient test')
      on conflict (user_id) do update
      set role = excluded.role, display_name = excluded.display_name
    `;

    const [auditRowsBefore] = await db<{ count: string }[]>`
      select count(*)::text as count
      from public.audit_events
      where action = 'staff_password_reset.requested'
        and target_id = ${testUserId}
    `;
    const auditsBefore = Number(auditRowsBefore?.count ?? 0);
    const messagesBefore = await capturedMessageCount();
    const result = await anonClient().auth.resetPasswordForEmail(
      TEST_RECIPIENT,
      {
        redirectTo: recoveryRedirect('en'),
      },
    );
    expect(result.error).toBeNull();

    const [requestRows] = await db<
      { hook_id: string; outcome: string; audit_written: boolean }[]
    >`
      select hook_id, outcome, audit_written
      from app_private.staff_password_reset_hook_requests
      where auth_user_id = ${testUserId}
      order by occurred_at desc
      limit 1
    `;
    expect(requestRows?.outcome).toBe('accepted');
    expect(requestRows?.audit_written).toBe(true);

    const [auditRows] = await db<{ count: string }[]>`
      select count(*)::text as count
      from public.audit_events
      where action = 'staff_password_reset.requested'
        and target_id = ${testUserId}
    `;
    expect(Number(auditRows?.count ?? 0)).toBe(auditsBefore + 1);
    expect(await capturedMessageCount()).toBe(messagesBefore + 1);
  });

  it('does not replace an approved link when an ineligible account is refused', async () => {
    if (!testUserId) throw new Error('Approved reset fixture is missing');
    const existingUsers = await admin().auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (existingUsers.error)
      throw new Error('Refused reset fixture lookup failed');
    const existing = existingUsers.data.users.find(
      (user) => user.email?.toLowerCase() === REFUSED_TEST_EMAIL,
    );
    if (existing) {
      refusedUserId = existing.id;
    } else {
      const created = await admin().auth.admin.createUser({
        email: REFUSED_TEST_EMAIL,
        password: `Reset-${randomUUID()}-aA1!`,
        email_confirm: true,
      });
      if (created.error)
        throw new Error('Refused reset fixture creation failed');
      refusedUserId = created.data.user.id;
    }

    const messagesBefore = await capturedMessageCount();
    await anonClient().auth.resetPasswordForEmail(REFUSED_TEST_EMAIL, {
      redirectTo: recoveryRedirect('en'),
    });

    const [request] = await db<{ outcome: string }[]>`
      select outcome
      from app_private.staff_password_reset_hook_requests
      where auth_user_id = ${refusedUserId}
      order by occurred_at desc
      limit 1
    `;
    expect(request?.outcome).toBe('denied');
    expect(await capturedMessageCount()).toBe(messagesBefore);
  });

  it('fails closed before mail when the requested-audit RPC is unavailable', async () => {
    if (!testUserId) throw new Error('Approved reset fixture is missing');
    const messagesBefore = await capturedMessageCount();
    await db`revoke execute on function public.staff_password_reset_hook_audit(text) from service_role`;
    try {
      await anonClient().auth.resetPasswordForEmail(TEST_RECIPIENT, {
        redirectTo: recoveryRedirect('en'),
      });
      expect(await capturedMessageCount()).toBe(messagesBefore);
    } finally {
      await db`grant execute on function public.staff_password_reset_hook_audit(text) to service_role`;
    }
  });
});
