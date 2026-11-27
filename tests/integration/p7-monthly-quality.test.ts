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

describe('P7 Workforce Monthly Quality & Reminders (T014, T015, T016)', () => {
  let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
  let poStaff: Awaited<ReturnType<typeof createStaff>>;
  let woStaff: Awaited<ReturnType<typeof createStaff>>;
  let trainer1: Awaited<ReturnType<typeof createStaff>>;
  let trainer2: Awaited<ReturnType<typeof createStaff>>;
  let salesStaff: Awaited<ReturnType<typeof createStaff>>;
  let wsId: string;

  beforeAll(async () => {
    f = await twoWorkspaceFixture();
    poStaff = f.po;
    woStaff = f.woA;
    trainer1 = f.trainerA;
    trainer2 = f.trainerB;
    salesStaff = f.salesA;
    wsId = f.wsA.id;

    // Ensure trainer2 is also a member of wsA for same-workspace peer isolation tests
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: wsId,
        user_id: trainer2.userId,
        granted_by: poStaff.userId,
      }),
    );
  });

  afterAll(async () => {
    await db.end();
  });

  const qualityExpectedByKey = new Map<string, number>();
  const settingsExpectedByKey = new Map<string, number>();

  async function record(args: {
    p_workspace_id: string;
    p_trainer_id: string;
    p_month: string;
    p_category: string;
    p_idempotency_key?: string;
    p_expected_revision?: number;
    [key: string]: unknown;
  }) {
    const key =
      typeof args.p_idempotency_key === 'string'
        ? args.p_idempotency_key
        : `idem-quality-${randomUUID()}`;
    const [row] = await db`
      select coalesce(max(revision), 0)::int as revision
      from public.p7_monthly_quality_revisions
      where workspace_id = ${args.p_workspace_id}::uuid
        and trainer_id = ${args.p_trainer_id}::uuid
        and month = ${args.p_month}::text
        and category = ${args.p_category}::text
    `;
    const expected =
      typeof args.p_expected_revision === 'number'
        ? args.p_expected_revision
        : (qualityExpectedByKey.get(key) ?? row?.revision ?? 0);
    const result = await poStaff.client.rpc('record_monthly_quality', {
      ...args,
      p_idempotency_key: key,
      p_expected_revision: expected,
    });
    if (!result.error) qualityExpectedByKey.set(key, expected);
    return result;
  }

  async function setSettings(args: {
    p_workspace_id: string;
    p_trainer_id: string;
    p_category: string;
    p_idempotency_key?: string;
    p_expected_revision?: number;
    [key: string]: unknown;
  }) {
    const key =
      typeof args.p_idempotency_key === 'string'
        ? args.p_idempotency_key
        : `idem-settings-${randomUUID()}`;
    const [row] = await db`
      select coalesce(max(revision), 0)::int as revision
      from public.p7_trainer_quality_settings
      where workspace_id = ${args.p_workspace_id}::uuid
        and trainer_id = ${args.p_trainer_id}::uuid
        and category = ${args.p_category}::text
    `;
    const expected =
      typeof args.p_expected_revision === 'number'
        ? args.p_expected_revision
        : (settingsExpectedByKey.get(key) ?? row?.revision ?? 0);
    const result = await poStaff.client.rpc('set_trainer_quality_settings', {
      ...args,
      p_idempotency_key: key,
      p_expected_revision: expected,
    });
    if (!result.error) settingsExpectedByKey.set(key, expected);
    return result;
  }

  describe('T014: Monthly quality revisions & mathematical integrity', () => {
    it('allows PO to record monthly transformation with default weight (+1.00)', async () => {
      const month = '2026-11';
      const key = `idem-trans-1-${randomUUID()}`;

      const { data, error } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 5,
        p_negative_count: 0,
        p_positive_weight: null,
        p_negative_weight: null,
        p_idempotency_key: key,
      });

      expect(error).toBeNull();
      expect(data).toMatchObject({
        workspace_id: wsId,
        trainer_id: trainer1.userId,
        month,
        category: 'transformation',
        revision: 1,
        positive_count: 5,
        negative_count: 0,
        positive_weight: '1.00',
        negative_weight: '0.00',
        net_points: '5.00',
      });
    });

    it('allows PO to record monthly transformation with custom weight (e.g. 2.50)', async () => {
      const month = '2026-12';
      const key = `idem-trans-custom-${randomUUID()}`;

      const { data, error } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 4,
        p_negative_count: 0,
        p_positive_weight: 2.5,
        p_negative_weight: 0,
        p_idempotency_key: key,
      });

      expect(error).toBeNull();
      expect(data).toMatchObject({
        revision: 1,
        positive_count: 4,
        positive_weight: '2.50',
        net_points: '10.00',
      });
    });

    it('allows PO to record feedback counts with default +1.00 / -1.00 weights', async () => {
      const month = '2026-11';
      const key = `idem-fb-def-${randomUUID()}`;

      const { data, error } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 10,
        p_negative_count: 3,
        p_positive_weight: null,
        p_negative_weight: null,
        p_idempotency_key: key,
      });

      expect(error).toBeNull();
      expect(data).toMatchObject({
        category: 'feedback',
        positive_count: 10,
        negative_count: 3,
        positive_weight: '1.00',
        negative_weight: '-1.00',
        net_points: '7.00',
      });
    });

    it('supports custom per-Trainer feedback weights configuration and defaults lookup', async () => {
      const key = `idem-fb-custom-settings-${randomUUID()}`;

      // 1. PO sets custom weights for trainer2: +1.50 positive, -0.50 negative
      const { error: settingsError } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_category: 'feedback',
        p_positive_weight: 1.5,
        p_negative_weight: -0.5,
      });
      expect(settingsError).toBeNull();

      // 2. PO records feedback for trainer2 without supplying weights -> uses saved custom defaults!
      const { data, error } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_month: '2026-11',
        p_category: 'feedback',
        p_positive_count: 6,
        p_negative_count: 2,
        p_positive_weight: null,
        p_negative_weight: null,
        p_idempotency_key: key,
      });

      expect(error).toBeNull();
      // 6 * 1.50 + 2 * (-0.50) = 9.00 - 1.00 = 8.00
      expect(data).toMatchObject({
        positive_weight: '1.50',
        negative_weight: '-0.50',
        net_points: '8.00',
      });
    });

    it('rejects weights with more than two decimal places', async () => {
      const { error } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: '2026-11',
        p_category: 'feedback',
        p_positive_count: 1,
        p_negative_count: 1,
        p_positive_weight: 1.125,
        p_negative_weight: -1.0,
        p_idempotency_key: `idem-scale-${randomUUID()}`,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/scale|decimal/i);
    });

    it('enforces optimistic concurrency: expected revision matching vs stale revision rejection', async () => {
      const month = '2026-05';
      const key1 = `idem-occ-1-${randomUUID()}`;
      const key2 = `idem-occ-2-${randomUUID()}`;
      const key3 = `idem-occ-3-${randomUUID()}`;

      // 1. First revision: expected 0 (or null) -> revision 1
      const { data: rev1, error: err1 } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 2,
        p_negative_count: 0,
        p_idempotency_key: key1,
        p_expected_revision: 0,
      });
      expect(err1).toBeNull();
      expect(rev1.revision).toBe(1);

      // 2. Second revision with expected revision = 1 -> succeeds with revision 2
      const { data: rev2, error: err2 } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 3,
        p_negative_count: 0,
        p_idempotency_key: key2,
        p_expected_revision: 1,
      });
      expect(err2).toBeNull();
      expect(rev2.revision).toBe(2);

      // 3. Stale revision with expected revision = 1 (current is 2) -> REJECTS with stale_revision!
      const { error: errStale } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 4,
        p_negative_count: 0,
        p_idempotency_key: key3,
        p_expected_revision: 1,
      });
      expect(errStale).not.toBeNull();
      expect(errStale?.message).toMatch(/stale_revision/i);
    });

    it('handles idempotent replays and detects argument divergence', async () => {
      const month = '2026-06';
      const key = `idem-dup-${randomUUID()}`;

      // Initial write
      const { data: initial, error: errInitial } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 6,
        p_negative_count: 0,
        p_idempotency_key: key,
      });
      expect(errInitial).toBeNull();

      // Replay with identical arguments -> returns same revision idempotently
      const { data: replay, error: errReplay } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 6,
        p_negative_count: 0,
        p_idempotency_key: key,
      });
      expect(errReplay).toBeNull();
      expect(replay.id).toBe(initial.id);
      expect(replay.revision).toBe(initial.revision);

      // Replay with different arguments -> fails with idempotency conflict
      const { error: errConflict } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 99, // changed count!
        p_negative_count: 0,
        p_idempotency_key: key,
      });
      expect(errConflict).not.toBeNull();
      expect(errConflict?.message).toMatch(/idempotency/i);
    });

    it('supports zeroing a Trainer quality points', async () => {
      const month = '2026-07';
      // 1. Initial count = 5
      await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 5,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-1-${randomUUID()}`,
      });

      // 2. Zeroing out via count = 0
      const { data: zeroed, error } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 0,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-2-${randomUUID()}`,
      });

      expect(error).toBeNull();
      expect(zeroed.revision).toBe(2);
      expect(zeroed.net_points).toBe('0.00');
    });

    it('safely handles concurrent parallel writes across categories', async () => {
      const month = '2026-08';
      const [transResult, fbResult] = await Promise.all([
        record({
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 3,
          p_negative_count: 0,
          p_idempotency_key: `idem-par-trans-${randomUUID()}`,
        }),
        record({
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'feedback',
          p_positive_count: 4,
          p_negative_count: 1,
          p_idempotency_key: `idem-par-fb-${randomUUID()}`,
        }),
      ]);

      expect(transResult.error).toBeNull();
      expect(fbResult.error).toBeNull();
      expect(transResult.data.category).toBe('transformation');
      expect(fbResult.data.category).toBe('feedback');
    });
  });

  describe('T015: Latest-effective projection & history preservation', () => {
    it('returns only the latest effective revision per Trainer/month/category and does NOT sum superseded revisions', async () => {
      const month = '2026-09';
      // Rev 1: 5 points
      await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 5,
        p_negative_count: 0,
        p_idempotency_key: `idem-eff-1-${randomUUID()}`,
      });

      // Rev 2: 8 points
      await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 8,
        p_negative_count: 0,
        p_idempotency_key: `idem-eff-2-${randomUUID()}`,
      });

      // Query the latest effective projection
      const { data: effectiveRows, error } = await poStaff.client.rpc(
        'get_monthly_quality_effective',
        {
          p_workspace_id: wsId,
          p_month: month,
          p_trainer_id: trainer1.userId,
          p_category: 'transformation',
        },
      );

      expect(error).toBeNull();
      expect(effectiveRows.length).toBe(1);
      expect(effectiveRows[0]).toMatchObject({
        revision: 2,
        positive_count: 8,
        net_points: '8.00', // NOT 5 + 8 = 13! Exactly 8.00!
      });

      // Query full history to verify revision 1 is preserved
      const { data: historyRows, error: histError } = await poStaff.client.rpc(
        'get_monthly_quality_revisions',
        {
          p_workspace_id: wsId,
          p_month: month,
          p_trainer_id: trainer1.userId,
          p_category: 'transformation',
        },
      );

      expect(histError).toBeNull();
      expect(historyRows.length).toBe(2);
      expect(
        historyRows.map((r: { revision: number }) => r.revision).sort(),
      ).toEqual([1, 2]);
    });

    it('zeroed revision replaces prior positive revision in the projection without summing', async () => {
      const month = '2026-10';
      // Rev 1: 7 points
      await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 7,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-eff-1-${randomUUID()}`,
      });

      // Rev 2: zeroed
      await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 0,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-eff-2-${randomUUID()}`,
      });

      const { data: effectiveRows } = await poStaff.client.rpc(
        'get_monthly_quality_effective',
        {
          p_workspace_id: wsId,
          p_month: month,
          p_trainer_id: trainer1.userId,
          p_category: 'feedback',
        },
      );

      expect(effectiveRows.length).toBe(1);
      expect(effectiveRows[0].revision).toBe(2);
      expect(effectiveRows[0].net_points).toBe('0.00');
    });
  });

  describe('T016: Monthly PO reminder via existing notification/outbox', () => {
    it('enqueues reminder to outbox with unique workspace+month dedup and placeholder copy key', async () => {
      const month = '2026-11';
      // Call enqueue_monthly_reminder via SQL (trusted scheduler path)
      const [res1] = await db`
        select app_private.enqueue_monthly_reminder(${wsId}::uuid, ${month}) as id
      `;
      expect(res1?.id).toBeTypeOf('string');

      // Calling again for the same workspace+month returns the same id (dedup!)
      const [res2] = await db`
        select app_private.enqueue_monthly_reminder(${wsId}::uuid, ${month}) as id
      `;
      expect(res2?.id).toBe(res1?.id);

      // Verify row in p7_monthly_reminder_outbox
      const [outboxRow] = await db`
        select * from public.p7_monthly_reminder_outbox
        where workspace_id = ${wsId}::uuid and month = ${month}
      `;
      expect(outboxRow).toBeDefined();
      expect(outboxRow!.dedup_key).toBe(`p7-reminder:${wsId}:${month}`);
      expect(outboxRow!.placeholder_copy_key).toBe(
        'p7.monthly_reminder.placeholder',
      );
      expect(outboxRow!.job_id).toBeTypeOf('string');

      // Verify the corresponding job in public.jobs outbox
      const [job] = await db`
        select * from public.jobs where id = ${outboxRow!.job_id}::uuid
      `;
      expect(job).toBeDefined();
      expect(job!.kind).toBe('quality.monthly_reminder');
      // Verify payload has NO sensitive P7 details!
      expect(job!.payload).toEqual({
        workspace_id: wsId,
        month,
        placeholder_copy_key: 'p7.monthly_reminder.placeholder',
      });
    });

    it('scheduler activation gate function is present and restricted to postgres owner', async () => {
      const [fn] = await db`
        select prosecdef, pg_get_userbyid(proowner) as owner
        from pg_proc where oid = 'app_private.p7_monthly_reminder_schedule_activate()'::regprocedure
      `;
      expect(fn?.owner).toBe('postgres');

      // Verify non-postgres callers are denied
      const { error } = await poStaff.client.rpc(
        'p7_monthly_reminder_schedule_activate',
      );
      // Function is not in public or execute is revoked
      expect(error).not.toBeNull();
    });
  });

  describe('Authorization, Security & Channel Isolation', () => {
    it('denies non-PO staff (WO, Trainer, Sales, Anon) from writing quality revisions', async () => {
      const month = '2026-11';

      // 1. WO attempt -> denied
      const { error: woErr } = await woStaff.client.rpc(
        'record_monthly_quality',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 1,
          p_negative_count: 0,
          p_idempotency_key: `idem-wo-${randomUUID()}`,
        },
      );
      expect(woErr).not.toBeNull();
      expect(woErr?.message).toMatch(/not_permitted/i);

      // 2. Trainer attempt -> denied
      const { error: trErr } = await trainer1.client.rpc(
        'record_monthly_quality',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 1,
          p_negative_count: 0,
          p_idempotency_key: `idem-tr-${randomUUID()}`,
        },
      );
      expect(trErr).not.toBeNull();
      expect(trErr?.message).toMatch(/not_permitted/i);

      // 3. Sales attempt -> denied
      const { error: salesErr } = await salesStaff.client.rpc(
        'record_monthly_quality',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 1,
          p_negative_count: 0,
          p_idempotency_key: `idem-sales-${randomUUID()}`,
        },
      );
      expect(salesErr).not.toBeNull();
      expect(salesErr?.message).toMatch(/not_permitted/i);

      // 4. Anonymous attempt -> denied
      const { error: anonErr } = await anonClient().rpc(
        'record_monthly_quality',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 1,
          p_negative_count: 0,
          p_idempotency_key: `idem-anon-${randomUUID()}`,
        },
      );
      expect(anonErr).not.toBeNull();
    });

    it('Q1: Trainer (own id or another id), WO and Sales get 42501 from all 3 read RPCs', async () => {
      const month = '2026-11';
      // First ensure some revisions and settings exist for trainer1 and trainer2
      await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 5,
        p_negative_count: 0,
        p_idempotency_key: `idem-q1-init-${randomUUID()}`,
      });
      await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_category: 'feedback',
        p_positive_weight: 1.5,
        p_negative_weight: -0.5,
      });

      // 1. Trainer 1 trying to read own id -> 42501
      const { error: tr1OwnSettingsErr } = await trainer1.client.rpc(
        'get_trainer_quality_settings',
        { p_workspace_id: wsId, p_trainer_id: trainer1.userId },
      );
      expect(tr1OwnSettingsErr).not.toBeNull();
      expect(tr1OwnSettingsErr?.code).toBe('42501');

      const { error: tr1OwnRevErr } = await trainer1.client.rpc(
        'get_monthly_quality_revisions',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(tr1OwnRevErr).not.toBeNull();
      expect(tr1OwnRevErr?.code).toBe('42501');

      const { error: tr1OwnEffErr } = await trainer1.client.rpc(
        'get_monthly_quality_effective',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(tr1OwnEffErr).not.toBeNull();
      expect(tr1OwnEffErr?.code).toBe('42501');

      // 2. Trainer 1 trying to read another id (trainer2) -> 42501
      const { error: tr1OtherSettingsErr } = await trainer1.client.rpc(
        'get_trainer_quality_settings',
        { p_workspace_id: wsId, p_trainer_id: trainer2.userId },
      );
      expect(tr1OtherSettingsErr).not.toBeNull();
      expect(tr1OtherSettingsErr?.code).toBe('42501');

      const { error: tr1OtherRevErr } = await trainer1.client.rpc(
        'get_monthly_quality_revisions',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer2.userId },
      );
      expect(tr1OtherRevErr).not.toBeNull();
      expect(tr1OtherRevErr?.code).toBe('42501');

      const { error: tr1OtherEffErr } = await trainer1.client.rpc(
        'get_monthly_quality_effective',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer2.userId },
      );
      expect(tr1OtherEffErr).not.toBeNull();
      expect(tr1OtherEffErr?.code).toBe('42501');

      // 3. WO trying to read -> 42501
      const { error: woSettingsErr } = await woStaff.client.rpc(
        'get_trainer_quality_settings',
        { p_workspace_id: wsId, p_trainer_id: trainer1.userId },
      );
      expect(woSettingsErr).not.toBeNull();
      expect(woSettingsErr?.code).toBe('42501');

      const { error: woRevErr } = await woStaff.client.rpc(
        'get_monthly_quality_revisions',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(woRevErr).not.toBeNull();
      expect(woRevErr?.code).toBe('42501');

      const { error: woEffErr } = await woStaff.client.rpc(
        'get_monthly_quality_effective',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(woEffErr).not.toBeNull();
      expect(woEffErr?.code).toBe('42501');

      // 4. Sales trying to read -> 42501
      const { error: salesSettingsErr } = await salesStaff.client.rpc(
        'get_trainer_quality_settings',
        { p_workspace_id: wsId, p_trainer_id: trainer1.userId },
      );
      expect(salesSettingsErr).not.toBeNull();
      expect(salesSettingsErr?.code).toBe('42501');

      const { error: salesRevErr } = await salesStaff.client.rpc(
        'get_monthly_quality_revisions',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(salesRevErr).not.toBeNull();
      expect(salesRevErr?.code).toBe('42501');

      const { error: salesEffErr } = await salesStaff.client.rpc(
        'get_monthly_quality_effective',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(salesEffErr).not.toBeNull();
      expect(salesEffErr?.code).toBe('42501');

      // 5. PO reads stay unchanged: all 3 succeed
      const { error: poSettingsErr } = await poStaff.client.rpc(
        'get_trainer_quality_settings',
        { p_workspace_id: wsId, p_trainer_id: trainer1.userId },
      );
      expect(poSettingsErr).toBeNull();

      const { error: poRevErr } = await poStaff.client.rpc(
        'get_monthly_quality_revisions',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(poRevErr).toBeNull();

      const { error: poEffErr } = await poStaff.client.rpc(
        'get_monthly_quality_effective',
        { p_workspace_id: wsId, p_month: month, p_trainer_id: trainer1.userId },
      );
      expect(poEffErr).toBeNull();
    });

    it('Q1: raw quality tables reject authenticated reads and the PO projection returns strings', async () => {
      for (const client of [
        trainer1.client,
        trainer2.client,
        woStaff.client,
        salesStaff.client,
      ]) {
        // Table 1: p7_monthly_quality_revisions
        const { error: revError } = await client
          .from('p7_monthly_quality_revisions')
          .select('*');
        expect(revError?.code).toBe('42501');

        // Table 2: p7_trainer_quality_settings
        const { error: settsError } = await client
          .from('p7_trainer_quality_settings')
          .select('*');
        expect(settsError?.code).toBe('42501');

        // View: p7_monthly_quality_effective
        const { data: effData } = await client
          .from('p7_monthly_quality_effective')
          .select('*');
        expect(effData).toEqual([]);
      }

      // The PO reads quality only through its canonical string projection.
      const { error: poRevError } = await poStaff.client
        .from('p7_monthly_quality_revisions')
        .select('*');
      expect(poRevError?.code).toBe('42501');

      const { error: poSettsError } = await poStaff.client
        .from('p7_trainer_quality_settings')
        .select('*');
      expect(poSettsError?.code).toBe('42501');

      const { data: poEffData } = await poStaff.client
        .from('p7_monthly_quality_effective')
        .select('positive_weight,negative_weight,net_points');
      expect(poEffData?.length ?? 0).toBeGreaterThan(0);
      expect(typeof poEffData?.[0]?.positive_weight).toBe('string');
    });

    it('audit events for quality mutations carry opaque reference ONLY (FR-020, SOL-03)', async () => {
      const month = '2026-11';
      const key = `idem-audit-chk-${randomUUID()}`;

      const { data } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 7,
        p_negative_count: 0,
        p_positive_weight: 1.5,
        p_negative_weight: 0,
        p_idempotency_key: key,
      });

      // Read audit_events row
      const [auditEvent] = await db`
        select * from public.audit_events
        where target_table = 'p7_monthly_quality_revisions'
          and target_id = ${data.id}::uuid
      `;
      expect(auditEvent).toBeDefined();
      expect(auditEvent!.action).toBe('quality.revision_recorded');
      // Crucial: check that details has NO numbers, NO amounts, NO weights, NO points!
      const details = auditEvent!.details as Record<string, unknown>;
      expect(details).not.toHaveProperty('positive_count');
      expect(details).not.toHaveProperty('negative_count');
      expect(details).not.toHaveProperty('positive_weight');
      expect(details).not.toHaveProperty('negative_weight');
      expect(details).not.toHaveProperty('net_points');
      expect(details).not.toHaveProperty('count');
      expect(details).not.toHaveProperty('points');
      expect(details.revision_id).toBe(data.id);
      expect(details.month).toBe(month);
      expect(details.category).toBe('transformation');
    });

    it('mutation kill-test: verify that removing PO authorization guard fails security test', async () => {
      const [fn] = await db`
        select prosrc from pg_proc
        where oid = 'public.record_monthly_quality(uuid,uuid,text,text,integer,integer,numeric,numeric,text,integer)'::regprocedure
      `;
      expect(fn?.prosrc).toContain('p7_require_quality_actor');
      expect(
        fn?.prosrc.match(/p7_require_quality_actor/g)?.length,
      ).toBeGreaterThanOrEqual(5);

      const [guard] = await db`
        select prosrc from pg_proc
        where oid = 'app_private.p7_require_quality_actor(uuid,uuid,boolean)'::regprocedure
      `;
      expect(guard?.prosrc).toContain('platform_owner');
      expect(guard?.prosrc).toContain('not_permitted');
    });
  });

  describe('Q2: Append-only settings revisions & immutability', () => {
    it('2 successive setting changes keep both rows and current setting equals latest revision', async () => {
      // Successive changes for trainer1 transformation
      const { data: s1, error: e1 } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_category: 'transformation',
        p_positive_weight: 1.25,
        p_negative_weight: 0.0,
      });
      expect(e1).toBeNull();
      expect(s1.revision).toBe(1);

      const { data: s2, error: e2 } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_category: 'transformation',
        p_positive_weight: 1.75,
        p_negative_weight: 0.0,
      });
      expect(e2).toBeNull();
      expect(s2.revision).toBe(2);

      // Verify direct database query: both rows are kept!
      const allRows = await db`
        select * from public.p7_trainer_quality_settings
        where workspace_id = ${wsId}::uuid
          and trainer_id = ${trainer1.userId}::uuid
          and category = 'transformation'
        order by revision
      `;
      expect(allRows.length).toBe(2);
      expect(allRows[0]!.revision).toBe(1);
      expect(allRows[0]!.positive_weight).toBe('1.25');
      expect(allRows[1]!.revision).toBe(2);
      expect(allRows[1]!.positive_weight).toBe('1.75');

      // Verify get_trainer_quality_settings returns the current setting = latest revision
      const { data: currentSettings, error: getErr } = await poStaff.client.rpc(
        'get_trainer_quality_settings',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
        },
      );
      expect(getErr).toBeNull();
      const transSetting = currentSettings.find(
        (s: { category: string }) => s.category === 'transformation',
      );
      expect(transSetting).toBeDefined();
      expect(transSetting).toMatchObject({
        revision: 2,
        positive_weight: '1.75',
        negative_weight: '0.00',
      });

      // Verify record_monthly_quality resolves weights from the latest revision
      const { data: recData, error: recErr } = await record({
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: '2026-12',
        p_category: 'transformation',
        p_positive_count: 4,
        p_negative_count: 0,
        p_positive_weight: null,
        p_negative_weight: null,
        p_idempotency_key: `idem-q2-res-${randomUUID()}`,
      });
      expect(recErr).toBeNull();
      // 4 * 1.75 = 7.00
      expect(recData).toMatchObject({
        positive_weight: '1.75',
        negative_weight: '0.00',
        net_points: '7.00',
      });
    });

    it('update, delete, and truncate on p7_trainer_quality_settings are rejected by physical immutability triggers', async () => {
      // 1. Attempt UPDATE
      let updateFailed = false;
      try {
        await db`
          update public.p7_trainer_quality_settings
          set positive_weight = 9.99
          where workspace_id = ${wsId}::uuid
        `;
      } catch (err: unknown) {
        updateFailed = true;
        const e = err as { code?: string; message?: string };
        expect(e.code || e.message).toMatch(/23514|immutable/i);
      }
      expect(updateFailed).toBe(true);

      // 2. Attempt DELETE
      let deleteFailed = false;
      try {
        await db`
          delete from public.p7_trainer_quality_settings
          where workspace_id = ${wsId}::uuid
        `;
      } catch (err: unknown) {
        deleteFailed = true;
        const e = err as { code?: string; message?: string };
        expect(e.code || e.message).toMatch(/23514|immutable/i);
      }
      expect(deleteFailed).toBe(true);

      // 3. Attempt TRUNCATE
      let truncateFailed = false;
      try {
        await db`truncate table public.p7_trainer_quality_settings`;
      } catch (err: unknown) {
        truncateFailed = true;
        const e = err as { code?: string; message?: string };
        expect(e.code || e.message).toMatch(/23514|immutable/i);
      }
      expect(truncateFailed).toBe(true);
    });

    it('setting changes write an audit_events row with opaque details', async () => {
      const { data, error } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_category: 'transformation',
        p_positive_weight: 2.5,
        p_negative_weight: 0.0,
      });
      expect(error).toBeNull();

      const [auditEvent] = await db`
        select * from public.audit_events
        where target_table = 'p7_trainer_quality_settings'
          and target_id = ${data.id}::uuid
      `;
      expect(auditEvent).toBeDefined();
      expect(auditEvent!.action).toBe('quality.settings_revision_recorded');
      const details = auditEvent!.details as Record<string, unknown>;
      // Opaque details only: NO weights, NO points, NO amounts!
      expect(details).not.toHaveProperty('positive_weight');
      expect(details).not.toHaveProperty('negative_weight');
      expect(details).not.toHaveProperty('points');
      expect(details.settings_id).toBe(data.id);
      expect(details.trainer_id).toBe(trainer2.userId);
      expect(details.category).toBe('transformation');
      expect(details.revision).toBe(data.revision);
    });

    it('idempotency holds for set_trainer_quality_settings (replay returns identical row, divergence fails)', async () => {
      const idemKey = `idem-sett-${randomUUID()}`;

      // First call
      const { data: first, error: err1 } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_category: 'feedback',
        p_positive_weight: 3.0,
        p_negative_weight: -1.0,
        p_idempotency_key: idemKey,
      });
      expect(err1).toBeNull();

      // Replay with exact same parameters -> returns same row idempotently
      const { data: replay, error: err2 } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_category: 'feedback',
        p_positive_weight: 3.0,
        p_negative_weight: -1.0,
        p_idempotency_key: idemKey,
      });
      expect(err2).toBeNull();
      expect(replay.id).toBe(first.id);
      expect(replay.revision).toBe(first.revision);

      // Replay with diverged weights -> fails with idempotency conflict
      const { error: errConflict } = await setSettings({
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_category: 'feedback',
        p_positive_weight: 4.0, // changed!
        p_negative_weight: -1.0,
        p_idempotency_key: idemKey,
      });
      expect(errConflict).not.toBeNull();
      expect(errConflict?.message).toMatch(/idempotency/i);
    });

    it('serializes parallel setting changes and rejects the stale expected revision', async () => {
      // Create a third trainer for clean concurrency testing
      const trainer3 = await createStaff('trainer', 'concurrency-trainer');
      await admin().from('workspace_memberships').insert({
        workspace_id: wsId,
        user_id: trainer3.userId,
        granted_by: poStaff.userId,
      });

      const [res1, res2] = await Promise.all([
        setSettings({
          p_workspace_id: wsId,
          p_trainer_id: trainer3.userId,
          p_category: 'feedback',
          p_positive_weight: 1.1,
          p_negative_weight: -0.1,
        }),
        setSettings({
          p_workspace_id: wsId,
          p_trainer_id: trainer3.userId,
          p_category: 'feedback',
          p_positive_weight: 1.2,
          p_negative_weight: -0.2,
        }),
      ]);

      const results = [res1, res2];
      expect(results.filter((result) => result.error === null)).toHaveLength(1);
      const failure = results.find((result) => result.error !== null);
      expect(failure?.error?.code).toBe('40001');
      const [row] = await db`
        select count(*)::int as count from public.p7_trainer_quality_settings
        where workspace_id = ${wsId}::uuid
          and trainer_id = ${trainer3.userId}::uuid
          and category = 'feedback'
      `;
      expect(row?.count).toBe(1);
    });
  });
});
