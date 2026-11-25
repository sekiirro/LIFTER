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
  let otherWsId: string;

  beforeAll(async () => {
    f = await twoWorkspaceFixture();
    poStaff = f.po;
    woStaff = f.woA;
    trainer1 = f.trainerA;
    trainer2 = f.trainerB;
    salesStaff = f.salesA;
    wsId = f.wsA.id;
    otherWsId = f.wsB.id;

    // Ensure trainer2 is also a member of wsA for same-workspace peer isolation tests
    await admin().from('workspace_memberships').insert({
      workspace_id: wsId,
      user_id: trainer2.userId,
    });
  });

  afterAll(async () => {
    await db.end();
  });

  describe('T014: Monthly quality revisions & mathematical integrity', () => {
    it('allows PO to record monthly transformation with default weight (+1.00)', async () => {
      const month = '2026-11';
      const key = `idem-trans-1-${randomUUID()}`;

      const { data, error } = await poStaff.client.rpc('record_monthly_quality', {
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

      const { data, error } = await poStaff.client.rpc('record_monthly_quality', {
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

      const { data, error } = await poStaff.client.rpc('record_monthly_quality', {
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
      const { error: settingsError } = await poStaff.client.rpc('set_trainer_quality_settings', {
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_category: 'feedback',
        p_positive_weight: 1.5,
        p_negative_weight: -0.5,
      });
      expect(settingsError).toBeNull();

      // 2. PO records feedback for trainer2 without supplying weights -> uses saved custom defaults!
      const { data, error } = await poStaff.client.rpc('record_monthly_quality', {
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
      const { error } = await poStaff.client.rpc('record_monthly_quality', {
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
      const { data: rev1, error: err1 } = await poStaff.client.rpc('record_monthly_quality', {
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
      const { data: rev2, error: err2 } = await poStaff.client.rpc('record_monthly_quality', {
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
      const { error: errStale } = await poStaff.client.rpc('record_monthly_quality', {
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
      const { data: initial, error: errInitial } = await poStaff.client.rpc(
        'record_monthly_quality',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 6,
          p_negative_count: 0,
          p_idempotency_key: key,
        },
      );
      expect(errInitial).toBeNull();

      // Replay with identical arguments -> returns same revision idempotently
      const { data: replay, error: errReplay } = await poStaff.client.rpc(
        'record_monthly_quality',
        {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 6,
          p_negative_count: 0,
          p_idempotency_key: key,
        },
      );
      expect(errReplay).toBeNull();
      expect(replay.id).toBe(initial.id);
      expect(replay.revision).toBe(initial.revision);

      // Replay with different arguments -> fails with idempotency conflict
      const { error: errConflict } = await poStaff.client.rpc('record_monthly_quality', {
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
      await poStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 5,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-1-${randomUUID()}`,
      });

      // 2. Zeroing out via count = 0
      const { data: zeroed, error } = await poStaff.client.rpc('record_monthly_quality', {
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
        poStaff.client.rpc('record_monthly_quality', {
          p_workspace_id: wsId,
          p_trainer_id: trainer1.userId,
          p_month: month,
          p_category: 'transformation',
          p_positive_count: 3,
          p_negative_count: 0,
          p_idempotency_key: `idem-par-trans-${randomUUID()}`,
        }),
        poStaff.client.rpc('record_monthly_quality', {
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
      await poStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 5,
        p_negative_count: 0,
        p_idempotency_key: `idem-eff-1-${randomUUID()}`,
      });

      // Rev 2: 8 points
      await poStaff.client.rpc('record_monthly_quality', {
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
      expect(historyRows.map((r: { revision: number }) => r.revision).sort()).toEqual([1, 2]);
    });

    it('zeroed revision replaces prior positive revision in the projection without summing', async () => {
      const month = '2026-10';
      // Rev 1: 7 points
      await poStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 7,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-eff-1-${randomUUID()}`,
      });

      // Rev 2: zeroed
      await poStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'feedback',
        p_positive_count: 0,
        p_negative_count: 0,
        p_idempotency_key: `idem-zero-eff-2-${randomUUID()}`,
      });

      const { data: effectiveRows } = await poStaff.client.rpc('get_monthly_quality_effective', {
        p_workspace_id: wsId,
        p_month: month,
        p_trainer_id: trainer1.userId,
        p_category: 'feedback',
      });

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
      expect(outboxRow.dedup_key).toBe(`p7-reminder:${wsId}:${month}`);
      expect(outboxRow.placeholder_copy_key).toBe('p7.monthly_reminder.placeholder');
      expect(outboxRow.job_id).toBeTypeOf('string');

      // Verify the corresponding job in public.jobs outbox
      const [job] = await db`
        select * from public.jobs where id = ${outboxRow.job_id}::uuid
      `;
      expect(job).toBeDefined();
      expect(job.kind).toBe('p7.monthly_reminder');
      // Verify payload has NO sensitive P7 details!
      expect(job.payload).toEqual({
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
      const { error } = await poStaff.client.rpc('p7_monthly_reminder_schedule_activate');
      // Function is not in public or execute is revoked
      expect(error).not.toBeNull();
    });
  });

  describe('Authorization, Security & Channel Isolation', () => {
    it('denies non-PO staff (WO, Trainer, Sales, Anon) from writing quality revisions', async () => {
      const month = '2026-11';

      // 1. WO attempt -> denied
      const { error: woErr } = await woStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 1,
        p_negative_count: 0,
        p_idempotency_key: `idem-wo-${randomUUID()}`,
      });
      expect(woErr).not.toBeNull();
      expect(woErr?.message).toMatch(/not_permitted/i);

      // 2. Trainer attempt -> denied
      const { error: trErr } = await trainer1.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 1,
        p_negative_count: 0,
        p_idempotency_key: `idem-tr-${randomUUID()}`,
      });
      expect(trErr).not.toBeNull();
      expect(trErr?.message).toMatch(/not_permitted/i);

      // 3. Sales attempt -> denied
      const { error: salesErr } = await salesStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 1,
        p_negative_count: 0,
        p_idempotency_key: `idem-sales-${randomUUID()}`,
      });
      expect(salesErr).not.toBeNull();
      expect(salesErr?.message).toMatch(/not_permitted/i);

      // 4. Anonymous attempt -> denied
      const { error: anonErr } = await anonClient().rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer1.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 1,
        p_negative_count: 0,
        p_idempotency_key: `idem-anon-${randomUUID()}`,
      });
      expect(anonErr).not.toBeNull();
    });

    it('Trainer sees NONE of another Trainer entries (strict peer isolation)', async () => {
      const month = '2026-11';
      // Record revision for Trainer 2
      await poStaff.client.rpc('record_monthly_quality', {
        p_workspace_id: wsId,
        p_trainer_id: trainer2.userId,
        p_month: month,
        p_category: 'transformation',
        p_positive_count: 15,
        p_negative_count: 0,
        p_idempotency_key: `idem-tr2-iso-${randomUUID()}`,
      });

      // Trainer 1 queries quality revisions targeting Trainer 2 -> returns empty or denied!
      const { data: tr1ReadTr2, error: tr1Err } = await trainer1.client.rpc(
        'get_monthly_quality_revisions',
        {
          p_workspace_id: wsId,
          p_month: month,
          p_trainer_id: trainer2.userId,
        },
      );
      // Trainer 1 cannot see Trainer 2's data!
      expect(tr1ReadTr2 ?? []).toEqual([]);

      // Trainer 1 direct table SELECT on p7_monthly_quality_revisions with RLS
      const { data: tableData } = await trainer1.client
        .from('p7_monthly_quality_revisions')
        .select('*')
        .eq('trainer_id', trainer2.userId);
      expect(tableData).toEqual([]);
    });

    it('WO and Sales have NO access to P7 quality tables or RPCs', async () => {
      const month = '2026-11';
      // WO direct table SELECT -> empty (RLS denies all)
      const { data: woData } = await woStaff.client
        .from('p7_monthly_quality_revisions')
        .select('*');
      expect(woData).toEqual([]);

      // Sales direct table SELECT -> empty (RLS denies all)
      const { data: salesData } = await salesStaff.client
        .from('p7_monthly_quality_revisions')
        .select('*');
      expect(salesData).toEqual([]);

      // WO RPC call -> not permitted
      const { error: woRpcErr } = await woStaff.client.rpc('get_monthly_quality_revisions', {
        p_workspace_id: wsId,
        p_month: month,
      });
      expect(woRpcErr).not.toBeNull();

      // Sales RPC call -> not permitted
      const { error: salesRpcErr } = await salesStaff.client.rpc('get_monthly_quality_revisions', {
        p_workspace_id: wsId,
        p_month: month,
      });
      expect(salesRpcErr).not.toBeNull();
    });

    it('audit events for quality mutations carry opaque reference ONLY (FR-020, SOL-03)', async () => {
      const month = '2026-11';
      const key = `idem-audit-chk-${randomUUID()}`;

      const { data } = await poStaff.client.rpc('record_monthly_quality', {
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
      expect(auditEvent.action).toBe('p7.quality_revision_recorded');
      // Crucial: check that details has NO numbers, NO amounts, NO weights, NO points!
      const details = auditEvent.details as Record<string, unknown>;
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
      // Direct assertion that PO guard is active:
      // Verify is_platform_owner check is enforced on record_monthly_quality
      const [fn] = await db`
        select prosrc from pg_proc
        where oid = 'public.record_monthly_quality(uuid,uuid,text,text,integer,integer,numeric,numeric,text,integer)'::regprocedure
      `;
      expect(fn?.prosrc).toContain('is_platform_owner');
      expect(fn?.prosrc).toContain('not_permitted');
    });
  });
});
