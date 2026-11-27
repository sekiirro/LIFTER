import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateQualityPoints } from '../../lib/workforce/quality';
import {
  admin,
  anonClient,
  checked,
  createStaff,
  sql,
  twoWorkspaceFixture,
} from './harness';

const db = sql();

type Fixture = Awaited<ReturnType<typeof twoWorkspaceFixture>>;

async function waitForAdvisoryLock(functionName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await db`
      select exists (
        select 1 from pg_catalog.pg_stat_activity
        where wait_event = 'advisory'
          and pid <> pg_catalog.pg_backend_pid()
      ) as waiting
    `;
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const activity = await db`
    select pid, state, wait_event_type, wait_event, left(query, 120) as query
    from pg_catalog.pg_stat_activity
    where datname = current_database()
    order by pid
  `;
  throw new Error(
    `Timed out waiting for ${functionName} advisory lock: ${JSON.stringify(activity)}`,
  );
}

function qualityArgs(
  f: Fixture,
  trainerId: string,
  month: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    p_workspace_id: f.wsA.id,
    p_trainer_id: trainerId,
    p_month: month,
    p_category: 'feedback',
    p_positive_count: 1,
    p_negative_count: 0,
    p_positive_weight: null,
    p_negative_weight: null,
    p_idempotency_key: `quality-${randomUUID()}`,
    p_expected_revision: 0,
    ...overrides,
  };
}

function settingsArgs(
  f: Fixture,
  trainerId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    p_workspace_id: f.wsA.id,
    p_trainer_id: trainerId,
    p_category: 'feedback',
    p_positive_weight: 1.5,
    p_negative_weight: -0.5,
    p_idempotency_key: `settings-${randomUUID()}`,
    p_expected_revision: 0,
    ...overrides,
  };
}

describe('PR #334 review-round-2 fixes', () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await twoWorkspaceFixture();
  });

  afterAll(async () => {
    await db.end();
  });

  it('334-B1: rejects a Trainer who belongs only to another workspace in both mutators', async () => {
    const foreign = await createStaff('trainer', 'quality-foreign');
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: f.wsB.id,
        user_id: foreign.userId,
        granted_by: f.po.userId,
      }),
    );

    const qualityKey = `foreign-quality-${randomUUID()}`;
    const quality = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, foreign.userId, '2026-03', {
        p_idempotency_key: qualityKey,
      }),
    );
    expect(quality.error?.code).toBe('22023');
    expect(quality.error?.message).toMatch(/trainer_not_found/);

    const settingsKey = `foreign-settings-${randomUUID()}`;
    const settings = await f.po.client.rpc(
      'set_trainer_quality_settings',
      settingsArgs(f, foreign.userId, { p_idempotency_key: settingsKey }),
    );
    expect(settings.error?.code).toBe('22023');
    expect(settings.error?.message).toMatch(/trainer_not_found/);

    const [qualityRows] = await db`
      select count(*)::int as count from public.p7_monthly_quality_revisions
      where idempotency_key = ${qualityKey}
    `;
    const [settingsRows] = await db`
      select count(*)::int as count from public.p7_trainer_quality_settings
      where idempotency_key = ${settingsKey}
    `;
    expect(qualityRows?.count).toBe(0);
    expect(settingsRows?.count).toBe(0);
  });

  it('334-B1: retains historical workspace membership as valid PO attribution evidence', async () => {
    const departed = await createStaff('trainer', 'quality-departed');
    const membership = checked(
      await admin()
        .from('workspace_memberships')
        .insert({
          workspace_id: f.wsA.id,
          user_id: departed.userId,
          granted_by: f.po.userId,
        })
        .select('id')
        .single(),
    );
    if (!membership) throw new Error('Historical membership fixture missing');
    await admin()
      .from('workspace_memberships')
      .update({ revoked_at: new Date().toISOString(), revoked_by: f.po.userId })
      .eq('id', membership.id);

    const quality = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, departed.userId, '2026-03'),
    );
    expect(quality.error).toBeNull();

    const settings = await f.po.client.rpc(
      'set_trainer_quality_settings',
      settingsArgs(f, departed.userId),
    );
    expect(settings.error).toBeNull();

    const { data: notices } = await departed.client.rpc(
      'read_staff_notices',
      {},
    );
    expect(notices.notices).toEqual([]);
  });

  it('334-B2: serializes concurrent same-key quality requests into one replayable revision', async () => {
    const key = `same-key-quality-${randomUUID()}`;
    const args = qualityArgs(f, f.trainerA.userId, '2026-04', {
      p_idempotency_key: key,
    });
    const [first, second] = await Promise.all([
      f.po.client.rpc('record_monthly_quality', args),
      f.po.client.rpc('record_monthly_quality', args),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data.id).toBe(first.data.id);
    const [row] = await db`
      select count(*)::int as count from public.p7_monthly_quality_revisions
      where idempotency_key = ${key}
    `;
    expect(row?.count).toBe(1);
  });

  it('334-B2: serializes concurrent same-key settings requests into one replayable revision', async () => {
    const key = `same-key-settings-${randomUUID()}`;
    const args = settingsArgs(f, f.trainerA.userId, { p_idempotency_key: key });
    const [first, second] = await Promise.all([
      f.po.client.rpc('set_trainer_quality_settings', args),
      f.po.client.rpc('set_trainer_quality_settings', args),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data.id).toBe(first.data.id);
    const [row] = await db`
      select count(*)::int as count from public.p7_trainer_quality_settings
      where idempotency_key = ${key}
    `;
    expect(row?.count).toBe(1);
  });

  it('334-B2: replays raw default arguments after settings change and binds expected revision to the hash', async () => {
    const trainer = await createStaff('trainer', 'quality-replay-settings');
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: f.wsA.id,
        user_id: trainer.userId,
        granted_by: f.po.userId,
      }),
    );
    const month = '2026-02';
    const key = `changed-settings-replay-${randomUUID()}`;
    const args = qualityArgs(f, trainer.userId, month, {
      p_idempotency_key: key,
    });
    const first = await f.po.client.rpc('record_monthly_quality', args);
    expect(first.error).toBeNull();

    const settings = await f.po.client.rpc(
      'set_trainer_quality_settings',
      settingsArgs(f, trainer.userId, {
        p_positive_weight: 2.5,
        p_negative_weight: -0.25,
      }),
    );
    expect(settings.error).toBeNull();

    const replay = await f.po.client.rpc('record_monthly_quality', args);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);

    const changedExpected = await f.po.client.rpc('record_monthly_quality', {
      ...args,
      p_expected_revision: 1,
    });
    expect(changedExpected.error?.code).toBe('23505');
    expect(changedExpected.error?.message).toMatch(/idempotency/i);
  });

  it('334-B2: requires nonblank idempotency keys and expected revisions', async () => {
    const omittedExpected = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, f.trainerA.userId, '2026-05', {
        p_expected_revision: undefined,
      }),
    );
    expect(omittedExpected.error?.code).toBe('22023');

    const blankKey = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, f.trainerA.userId, '2026-05', {
        p_idempotency_key: '   ',
      }),
    );
    expect(blankKey.error?.code).toBe('22023');

    const omittedSettingsKey = await f.po.client.rpc(
      'set_trainer_quality_settings',
      settingsArgs(f, f.trainerA.userId, { p_idempotency_key: undefined }),
    );
    expect(omittedSettingsKey.error?.code).toBe('22023');
  });

  it('334-B2: rejects one of two distinct-key writes sharing a stale expected revision', async () => {
    const month = '2026-05';
    const [first, second] = await Promise.all([
      f.po.client.rpc(
        'record_monthly_quality',
        qualityArgs(f, f.trainerA.userId, month),
      ),
      f.po.client.rpc(
        'record_monthly_quality',
        qualityArgs(f, f.trainerA.userId, month),
      ),
    ]);
    const results = [first, second];
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    const failure = results.find((result) => result.error !== null);
    expect(failure?.error?.code).toBe('40001');
  });

  it('334-B3/B7: quality waits on the shared period fence and rechecks PO authority before writing', async () => {
    const backupPo = await createStaff('platform_owner', 'quality-backup-po');
    expect(backupPo.userId).not.toBe(f.po.userId);
    const holder = sql();
    const month = '2026-06';
    const key = `quality-lock-revocation-${randomUUID()}`;
    let pending:
      Promise<{ data: unknown; error: { code?: string } | null }> | undefined;
    try {
      await holder.begin(async (tx) => {
        await tx`
          select pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(${`${f.wsA.id}:${month}-01`}, 0)
          )
        `;
        pending = Promise.resolve(
          f.po.client.rpc(
            'record_monthly_quality',
            qualityArgs(f, f.trainerA.userId, month, {
              p_idempotency_key: key,
            }),
          ),
        );
        await waitForAdvisoryLock('record_monthly_quality');
        await admin()
          .from('staff_profiles')
          .update({ role: 'workspace_owner' })
          .eq('user_id', f.po.userId);
      });

      const result = await pending;
      expect(result?.error?.code).toBe('42501');
      const [row] = await db`
        select count(*)::int as count from public.p7_monthly_quality_revisions
        where idempotency_key = ${key}
      `;
      expect(row?.count).toBe(0);
    } finally {
      await admin()
        .from('staff_profiles')
        .update({ role: 'platform_owner' })
        .eq('user_id', f.po.userId);
      await pending;
      await holder.end();
    }
  });

  it('334-B3: settings rechecks PO authority after its advisory wait', async () => {
    await createStaff('platform_owner', 'settings-backup-po');
    const holder = sql();
    const key = `settings-lock-revocation-${randomUUID()}`;
    let pending:
      Promise<{ data: unknown; error: { code?: string } | null }> | undefined;
    try {
      await holder.begin(async (tx) => {
        await tx`
          select pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtext('p7_settings'),
            pg_catalog.hashtext(${`${f.wsA.id}:${f.trainerA.userId}:feedback`})
          )
        `;
        pending = Promise.resolve(
          f.po.client.rpc(
            'set_trainer_quality_settings',
            settingsArgs(f, f.trainerA.userId, { p_idempotency_key: key }),
          ),
        );
        await waitForAdvisoryLock('set_trainer_quality_settings');
        await admin()
          .from('staff_profiles')
          .update({ role: 'workspace_owner' })
          .eq('user_id', f.po.userId);
      });

      const result = await pending;
      expect(result?.error?.code).toBe('42501');
      const [row] = await db`
        select count(*)::int as count from public.p7_trainer_quality_settings
        where idempotency_key = ${key}
      `;
      expect(row?.count).toBe(0);
    } finally {
      await admin()
        .from('staff_profiles')
        .update({ role: 'platform_owner' })
        .eq('user_id', f.po.userId);
      await pending;
      await holder.end();
    }
  });

  it('334-B9: matches exact SQL arithmetic for large cancelling feedback terms', async () => {
    const params = {
      category: 'feedback' as const,
      positiveCount: 1_000_000_001,
      negativeCount: 1_000_000_000,
      positiveWeight: '99999999.99',
      negativeWeight: '-99999999.99',
    };
    const expected = calculateQualityPoints(params);
    expect(expected.netPoints).toBe('99999999.99');

    const { data, error } = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, f.trainerA.userId, '2026-07', {
        p_positive_count: params.positiveCount,
        p_negative_count: params.negativeCount,
        p_positive_weight: params.positiveWeight,
        p_negative_weight: params.negativeWeight,
      }),
    );
    expect(error).toBeNull();
    expect(data.net_points).toBe(expected.netPoints);
  });

  it('334-B10: exposes canonical two-decimal text through the effective view and RPC', async () => {
    const month = '2026-08';
    const { data, error } = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, f.trainerA.userId, month, {
        p_positive_count: 1,
        p_positive_weight: 5,
        p_negative_weight: 0,
      }),
    );
    expect(error).toBeNull();

    const { data: viewRow, error: viewError } = await f.po.client
      .from('p7_monthly_quality_effective')
      .select('positive_weight,negative_weight,net_points')
      .eq('id', data.id)
      .single();
    expect(viewError).toBeNull();
    expect(viewRow).toEqual({
      positive_weight: '5.00',
      negative_weight: '0.00',
      net_points: '5.00',
    });

    const { data: rpcRows, error: rpcError } = await f.po.client.rpc(
      'get_monthly_quality_effective',
      {
        p_workspace_id: f.wsA.id,
        p_month: month,
        p_trainer_id: f.trainerA.userId,
      },
    );
    expect(rpcError).toBeNull();
    expect(rpcRows[0]).toMatchObject({
      positive_weight: '5.00',
      negative_weight: '0.00',
      net_points: '5.00',
    });

    const [columns] = await db`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'p7_monthly_quality_effective'
        and column_name in ('positive_weight', 'negative_weight', 'net_points')
      order by column_name
    `;
    expect(columns?.data_type).toBe('text');
  });

  it('S4-B10: denies authenticated raw quality and settings table reads while PO projections stay readable', async () => {
    const month = '2026-08';
    const quality = await f.po.client.rpc(
      'record_monthly_quality',
      qualityArgs(f, f.trainerA.userId, month, {
        p_positive_count: 1,
        p_positive_weight: 5,
        p_negative_weight: 0,
      }),
    );
    expect(quality.error).toBeNull();
    const settings = await f.po.client.rpc(
      'set_trainer_quality_settings',
      settingsArgs(f, f.trainerA.userId),
    );
    expect(settings.error).toBeNull();

    for (const table of [
      'p7_monthly_quality_revisions',
      'p7_trainer_quality_settings',
    ]) {
      const raw = await f.po.client.from(table).select('*').limit(1);
      expect(
        raw.error?.code,
        `${table} must reject authenticated raw access`,
      ).toBe('42501');
    }

    const { data: projection, error: projectionError } = await f.po.client
      .from('p7_monthly_quality_effective')
      .select('positive_weight,negative_weight,net_points')
      .eq('id', quality.data.id)
      .single();
    expect(projectionError).toBeNull();
    expect(projection).toEqual({
      positive_weight: '5.00',
      negative_weight: '0.00',
      net_points: '5.00',
    });
  });

  it('S4-B12: a concurrent F11 Trainer role change and quality write never holds the period fence while waiting for staff locks', async () => {
    const blocker = sql();
    let signalRoleLock!: () => void;
    let releaseRoleChange!: () => void;
    const roleLocked = new Promise<void>((resolve) => {
      signalRoleLock = resolve;
    });
    const roleChange = blocker.begin(async (tx) => {
      await tx`
        update public.staff_profiles
        set role = 'sales'::public.staff_role
        where user_id = ${f.trainerA.userId}
      `;
      signalRoleLock();
      await new Promise<void>((resolve) => {
        releaseRoleChange = resolve;
      });
    });

    let qualityWrite:
      Promise<Awaited<ReturnType<typeof f.po.client.rpc>>> | undefined;
    try {
      await roleLocked;
      qualityWrite = (async () =>
        await f.po.client.rpc(
          'record_monthly_quality',
          qualityArgs(f, f.trainerA.userId, '2026-11'),
        ))();

      const deadline = Date.now() + 8_000;
      let waiting = false;
      let qualityPid: number | undefined;
      while (!waiting && Date.now() < deadline) {
        const [activity] = await db`
          select pid, wait_event_type
          from pg_catalog.pg_stat_activity
          where datname = current_database()
            and query ilike '%record_monthly_quality%'
            and wait_event_type = 'Lock'
          order by query_start desc
          limit 1
        `;
        waiting = Boolean(activity);
        qualityPid = activity?.pid as number | undefined;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting, 'quality write must reach the held F11 staff row').toBe(
        true,
      );

      const [fence] = await db`
        select exists (
          select 1
          from pg_catalog.pg_locks l
          where l.pid = ${qualityPid}
            and l.locktype = 'advisory'
            and l.granted
            and l.classid = ((pg_catalog.hashtextextended(${f.wsA.id}::text || ':2026-11-01', 0) >> 32) & 4294967295)::oid
            and l.objid = (pg_catalog.hashtextextended(${f.wsA.id}::text || ':2026-11-01', 0) & 4294967295)::oid
        ) as held
      `;
      expect(
        fence?.held,
        'period fence must be acquired after staff locks',
      ).toBe(false);
    } finally {
      if (releaseRoleChange) releaseRoleChange();
      await Promise.allSettled([
        roleChange,
        ...(qualityWrite ? [qualityWrite] : []),
      ]);
      await blocker.end();
    }

    const result = await qualityWrite;
    expect(result?.error?.code).toBe('22023');
    expect(result?.error?.message).toMatch(/trainer_not_found/);
  });

  it.each(['NaN', 'Infinity', '-Infinity'])(
    '334-B11: rejects non-finite %s in both RPCs',
    async (special) => {
      const quality = await f.po.client.rpc(
        'record_monthly_quality',
        qualityArgs(f, f.trainerA.userId, '2026-09', {
          p_positive_weight: special,
        }),
      );
      expect(quality.error?.code).toBe('22023');

      const settings = await f.po.client.rpc(
        'set_trainer_quality_settings',
        settingsArgs(f, f.trainerA.userId, {
          p_positive_weight: special,
        }),
      );
      expect(settings.error?.code).toBe('22023');
    },
  );

  it.each(['NaN', 'Infinity', '-Infinity'])(
    '334-B11: rejects non-finite %s at both table constraints',
    async (special) => {
      const [hasHash] = await db`
        select exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'p7_monthly_quality_revisions'
            and column_name = 'request_hash'
        ) as present
      `;
      const qualityInsert = hasHash?.present
        ? db`
            insert into public.p7_monthly_quality_revisions (
              workspace_id, trainer_id, month, category, positive_count, negative_count,
              positive_weight, negative_weight, net_points, idempotency_key, created_by, request_hash
            ) values (
              ${f.wsA.id}::uuid, ${f.trainerA.userId}::uuid, '2026-10', 'feedback', 1, 0,
              ${special}::numeric, 0, ${special}::numeric, ${`direct-quality-${randomUUID()}`},
              ${f.po.userId}::uuid, extensions.digest('test'::bytea, 'sha256')
            )
          `
        : db`
            insert into public.p7_monthly_quality_revisions (
              workspace_id, trainer_id, month, category, positive_count, negative_count,
              positive_weight, negative_weight, net_points, idempotency_key, created_by
            ) values (
              ${f.wsA.id}::uuid, ${f.trainerA.userId}::uuid, '2026-10', 'feedback', 1, 0,
              ${special}::numeric, 0, ${special}::numeric, ${`direct-quality-${randomUUID()}`},
              ${f.po.userId}::uuid
            )
          `;
      await expect(qualityInsert).rejects.toMatchObject({
        code: expect.stringMatching(/^(23514|22003)$/),
      });

      const [settingsHasHash] = await db`
        select exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'p7_trainer_quality_settings'
            and column_name = 'request_hash'
        ) as present
      `;
      const settingsInsert = settingsHasHash?.present
        ? db`
            insert into public.p7_trainer_quality_settings (
              workspace_id, trainer_id, category, positive_weight, negative_weight,
              idempotency_key, created_by, request_hash
            ) values (
              ${f.wsA.id}::uuid, ${f.trainerA.userId}::uuid, 'feedback',
              ${special}::numeric, -1, ${`direct-settings-${randomUUID()}`},
              ${f.po.userId}::uuid, extensions.digest('test'::bytea, 'sha256')
            )
          `
        : db`
            insert into public.p7_trainer_quality_settings (
              workspace_id, trainer_id, category, positive_weight, negative_weight,
              idempotency_key, created_by
            ) values (
              ${f.wsA.id}::uuid, ${f.trainerA.userId}::uuid, 'feedback',
              ${special}::numeric, -1, ${`direct-settings-${randomUUID()}`},
              ${f.po.userId}::uuid
            )
          `;
      await expect(settingsInsert).rejects.toMatchObject({
        code: expect.stringMatching(/^(23514|22003)$/),
      });
    },
  );

  it('334-B8: drains a real reminder job into the PO inbox and marks the outbox sent', async () => {
    const month = '2026-11';
    const [outbox] = await db`
      select id from public.p7_monthly_reminder_outbox
      where workspace_id = ${f.wsA.id}::uuid and month = ${month}
    `;
    if (!outbox) {
      await db`
        select app_private.enqueue_monthly_reminder(${f.wsA.id}::uuid, ${month})
      `;
    }
    const [reminder] = await db`
      select * from public.p7_monthly_reminder_outbox
      where workspace_id = ${f.wsA.id}::uuid and month = ${month}
    `;
    expect(reminder).toBeDefined();
    if (!reminder) throw new Error('Monthly reminder fixture missing');

    const invalid = await f.po.client.rpc('handle_quality_monthly_reminder', {
      p_job_id: reminder.job_id,
      p_lease_token: randomUUID(),
    });
    expect(invalid.error?.code).toBe('42501');

    const claimed = await admin().rpc('jobs_claim', {
      batch: 100,
      lease_seconds: 300,
    });
    expect(claimed.error).toBeNull();
    const job = claimed.data?.find(
      (candidate: { id: string; kind: string }) =>
        candidate.id === reminder.job_id &&
        candidate.kind === 'quality.monthly_reminder',
    );
    expect(job).toBeDefined();

    const handled = await admin().rpc('handle_quality_monthly_reminder', {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
    });
    expect(handled.error).toBeNull();
    expect(handled.data).toBe(true);
    const completed = await admin().rpc('jobs_complete', {
      id: job.id,
      lease: job.lease_token,
    });
    expect(completed.error).toBeNull();
    expect(completed.data).toBe(true);

    const [sent] = await db`
      select status from public.p7_monthly_reminder_outbox where id = ${reminder.id}::uuid
    `;
    expect(sent?.status).toBe('sent');
    const [done] = await db`
      select status from public.jobs where id = ${reminder.job_id}::uuid
    `;
    expect(done?.status).toBe('done');

    const { data: poNotices, error: poNoticeError } = await f.po.client.rpc(
      'read_staff_notices',
      {},
    );
    expect(poNoticeError).toBeNull();
    expect(poNotices.notices).toContainEqual(
      expect.objectContaining({
        workspace_id: f.wsA.id,
        notice_kind: 'monthly_quality_reminder',
        source_key: reminder.id,
      }),
    );

    const { data: trainerNotices } = await f.trainerA.client.rpc(
      'read_staff_notices',
      {},
    );
    expect(trainerNotices.notices).toEqual([]);
    const { data: anonNotices } = await anonClient().rpc(
      'read_staff_notices',
      {},
    );
    expect(anonNotices).toBeNull();
  });
});
