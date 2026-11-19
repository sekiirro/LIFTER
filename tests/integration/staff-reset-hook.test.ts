import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, anonClient, loadEnv, sql } from './harness';

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', async () => ({
  createSessionClient: async () => (await import('./harness')).anonClient(),
}));

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

async function directAuthRecover(email: string, locale: 'ar' | 'en' = 'en') {
  const env = loadEnv();
  const url = new URL('/auth/v1/recover', env.apiUrl);
  url.searchParams.set('redirect_to', recoveryRedirect(locale));
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  return { status: response.status, body: await response.text() };
}

async function appReset(email: string) {
  const { requestStaffReset } = await import('../../app/login/actions');
  const form = new FormData();
  form.set('email', email);
  return requestStaffReset(null, form);
}

async function ensureApprovedStaffFixture() {
  if (testUserId) return;
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

    const result = await directAuthRecover(email, 'ar');
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({});

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
    const result = await directAuthRecover(TEST_RECIPIENT);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({});

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

  it.skipIf(process.env.S68_HOOK_UNAVAILABLE !== '1')(
    'T049b direct Auth records unavailable-hook status and body without SMTP fallback',
    async () => {
      await ensureApprovedStaffFixture();
      const messagesBefore = await capturedMessageCount();
      const [requestsBefore] = await db<{ count: string }[]>`
        select count(*)::text as count
        from app_private.staff_password_reset_hook_requests
        where auth_user_id = ${testUserId}
      `;
      const result = await directAuthRecover(TEST_RECIPIENT);
      process.stdout.write(
        `T049b direct Auth unavailable-hook response: ${JSON.stringify({ status: result.status, body: result.body })}\n`,
      );
      expect(result.status).toBe(422);
      expect(JSON.parse(result.body)).toMatchObject({
        code: 422,
        error_code: 'hook_timeout_after_retry',
      });
      expect(result.body).not.toMatch(
        /staff-reset@example\.test|token|secret/i,
      );
      expect(await capturedMessageCount()).toBe(messagesBefore);
      const [requests] = await db<{ count: string }[]>`
        select count(*)::text as count
        from app_private.staff_password_reset_hook_requests
        where auth_user_id = ${testUserId}
      `;
      expect(Number(requests?.count ?? 0)).toBe(
        Number(requestsBefore?.count ?? 0),
      );
    },
  );

  it('T049c enforces account and global caps across mixed app/direct requests', async () => {
    await ensureApprovedStaffFixture();
    const messagesBefore = await capturedMessageCount();
    const [priorRows] = await db<{ requests: number; deliveries: number }[]>`
      select count(*)::int as requests,
        count(*) filter (where delivery_reserved)::int as deliveries
      from app_private.staff_password_reset_hook_requests
      where auth_user_id = ${testUserId}
    `;
    const callsNeeded = Math.max(0, 6 - Number(priorRows?.requests ?? 0));
    if (callsNeeded > 0 && Number(priorRows?.requests ?? 0) > 0)
      await new Promise((resolve) => setTimeout(resolve, 1100));

    for (let index = 0; index < callsNeeded; index += 1) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      if (index % 2 === 0) {
        const response = await directAuthRecover(TEST_RECIPIENT);
        expect(response.status).toBe(200);
      } else {
        expect(await appReset(TEST_RECIPIENT)).toEqual({ status: 'ok' });
      }
    }
    const targetHash = createHash('sha256')
      .update(TEST_RECIPIENT)
      .digest('hex');
    const [accountRows] = await db<{ outcomes: string[] }[]>`
      select array_agg(outcome order by occurred_at, hook_id) as outcomes
      from app_private.staff_password_reset_hook_requests
      where target_hash = decode(${targetHash}, 'hex')
    `;
    expect(accountRows?.outcomes).toEqual([
      'accepted',
      'accepted',
      'delivery_limited',
      'delivery_limited',
      'delivery_limited',
      'rate_limited',
    ]);
    const expectedNewDeliveries = Math.max(
      0,
      2 - Number(priorRows?.deliveries ?? 0),
    );
    expect(await capturedMessageCount()).toBe(
      messagesBefore + expectedNewDeliveries,
    );

    await db`delete from app_private.staff_password_reset_hook_requests`;
    for (let index = 0; index < 10; index += 1) {
      const email = `mixed-cap-${index}-${randomUUID()}@example.test`;
      const created = await admin().auth.admin.createUser({
        email,
        password: `Reset-${randomUUID()}-aA1!`,
        email_confirm: true,
      });
      if (created.error) throw new Error('Mixed-cap fixture creation failed');
      await db`
        insert into public.staff_profiles (user_id, role, display_name)
        values (${created.data.user.id}, 'trainer', 'Mixed cap test')
      `;
      if (index % 2 === 0) {
        const response = await directAuthRecover(email);
        expect(response.status).toBe(200);
      } else {
        expect(await appReset(email)).toEqual({ status: 'ok' });
      }
    }
    expect(await appReset(TEST_RECIPIENT)).toEqual({ status: 'ok' });
    const [globalRows] = await db<{ outcomes: string[] }[]>`
      select array_agg(outcome order by occurred_at, hook_id) as outcomes
      from app_private.staff_password_reset_hook_requests
    `;
    expect(globalRows?.outcomes).toHaveLength(11);
    expect(globalRows?.outcomes?.slice(0, 10)).toEqual(
      Array.from({ length: 10 }, () => 'denied'),
    );
    expect(globalRows?.outcomes?.[10]).toBe('rate_limited');
    expect(await capturedMessageCount()).toBe(
      messagesBefore + expectedNewDeliveries,
    );
  }, 120_000);
});
