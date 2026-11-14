import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, sql, graph } from './registration-approval-fixture';
import type { Context } from './registration-approval-fixture';

let fixture: Context;
let db: ReturnType<typeof sql>;
let seeded: Awaited<ReturnType<typeof graph>>;
let planId: string;

beforeAll(async () => {
  fixture = await clientContext();
  db = sql();
  seeded = await db.begin((tx) => graph(tx, fixture));
  await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
    values(${fixture.wsA.id},${seeded.subscription},clock_timestamp(),${randomUUID()})`;
});
afterAll(async () => db?.end());

describe('F19 T020 continuity and delivery contracts', () => {
  it('installs the append-only re-attachment ledger and resolver', async () => {
    const [catalog] = await db`
      select
        to_regclass('app_private.subscription_reattachments') as ledger,
        to_regprocedure('app_private.f19_resolve_subscription_id(uuid,uuid)')::text as resolver,
        to_regprocedure('public.ready_and_publish_plan(uuid,bigint,bigint,uuid)') as delivery,
        to_regprocedure('public.client_plan_projection()') as projection
    `;

    expect(catalog).toEqual({
      ledger: 'app_private.subscription_reattachments',
      resolver: 'app_private.f19_resolve_subscription_id(uuid,uuid)',
      delivery: 'ready_and_publish_plan(uuid,bigint,bigint,uuid)',
      projection: 'client_plan_projection()',
    });
  });

  it('denies non-Platform-Owner cleanup, applies a dry-run-only immutable re-attachment, and recalculates expiry', async () => {
    const successor = randomUUID();
    await db`alter table public.subscriptions disable trigger f12_subscription_insert`;
    await db`alter table public.subscriptions disable trigger f12_subscription_integrity`;
    try {
      await db`insert into public.subscriptions(id,workspace_id,client_id,kind,registration_link_id,package_version_id,
        price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by,predecessor_subscription_id)
        values(${successor},${fixture.wsA.id},${seeded.client},'renewal',null,${fixture.p.versionId},
          1200,'XTS',17,30,null,${fixture.po.userId},${seeded.subscription})`;
    } finally {
      await db`alter table public.subscriptions enable trigger f12_subscription_insert`;
      await db`alter table public.subscriptions enable trigger f12_subscription_integrity`;
    }
    await db`alter table public.subscription_renewals disable trigger f13_renewal_audit`;
    try {
      await db`insert into public.subscription_renewals(id,workspace_id,client_id,predecessor_subscription_id,subscription_id,
        package_offer_id,package_version_id,expected_revision,recording_date,service_start_date,service_end_exclusive,recorded_by)
        values(${randomUUID()},${fixture.wsA.id},${seeded.client},${seeded.subscription},${successor},
          ${fixture.p.offer.id},${fixture.p.versionId},1,(clock_timestamp() at time zone 'Africa/Cairo')::date,
          (clock_timestamp() at time zone 'Africa/Cairo')::date,
          (clock_timestamp() at time zone 'Africa/Cairo')::date+30,${fixture.po.userId})`;
    } finally {
      await db`alter table public.subscription_renewals enable trigger f13_renewal_audit`;
    }

    const created = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: { schemaVersion: 2, document: { title: 'T020 synthetic' } },
      p_operation_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    planId = created.data as string;
    const beforeCleanupPublish = await fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(beforeCleanupPublish.data).toMatchObject({
      status: 'not_permitted',
    });
    const [blockedCounts] = await db`select
      (select count(*)::int from public.plan_revisions where plan_id=${planId}) as revisions,
      (select count(*)::int from public.plan_deliveries where plan_id=${planId}) as deliveries`;
    expect(blockedCounts).toEqual({ revisions: 0, deliveries: 0 });

    const [day] =
      await db`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
    const today = day!.today as string;
    const [before] =
      await db`select app_private.f13_project_entitlement(${fixture.wsA.id},${seeded.subscription},${today}::date)
      as projection`;
    const beforeEnd = (
      before!.projection as { effective_end_exclusive: string }
    ).effective_end_exclusive;
    const denied = await fixture.trainerA.client.rpc(
      'f19_cleanup_subscription_reattachments',
      {
        p_apply: false,
        p_dry_run_hash: null,
      },
    );
    expect(denied.error?.code).toBe('42501');

    const [beforeCounts] = await db`select
      (select count(*)::int from app_private.subscription_reattachments where successor_subscription_id=${successor}) as ledger,
      (select count(*)::int from public.subscription_renewals where subscription_id=${successor}) as renewals`;
    const dryRun = await fixture.po.client.rpc(
      'f19_cleanup_subscription_reattachments',
      {
        p_apply: false,
        p_dry_run_hash: null,
      },
    );
    expect(dryRun.error).toBeNull();
    expect(dryRun.data).toMatchObject({ status: 'dry_run' });
    expect(
      (dryRun.data as { candidate_count: number }).candidate_count,
    ).toBeGreaterThanOrEqual(1);
    expect((dryRun.data as { dry_run_hash?: string }).dry_run_hash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    const dryHash = (dryRun.data as { dry_run_hash: string }).dry_run_hash;
    const [afterDryRun] =
      await db`select count(*)::int as count from app_private.subscription_reattachments
      where successor_subscription_id=${successor}`;
    expect(afterDryRun!.count).toBe(beforeCounts!.ledger);

    const apply = await fixture.po.client.rpc(
      'f19_cleanup_subscription_reattachments',
      {
        p_apply: true,
        p_dry_run_hash: dryHash,
      },
    );
    expect(apply.error).toBeNull();
    expect(apply.data).toMatchObject({ status: 'ok' });
    expect(
      (apply.data as { reattachments_written: number }).reattachments_written,
    ).toBeGreaterThanOrEqual(1);
    const reapply = await fixture.po.client.rpc(
      'f19_cleanup_subscription_reattachments',
      {
        p_apply: true,
        p_dry_run_hash: dryHash,
      },
    );
    expect(reapply.error).toBeNull();
    expect(reapply.data).toMatchObject({
      status: 'ok',
      reattachments_written: 0,
    });
    const [afterApply] = await db`select
      (select count(*)::int from app_private.subscription_reattachments where successor_subscription_id=${successor}) as ledger,
      (select count(*)::int from public.subscription_renewals where subscription_id=${successor}) as renewals,
      (select continuous_subscription_id from app_private.subscription_reattachments where successor_subscription_id=${successor}) as continuous`;
    expect(afterApply).toMatchObject({
      ledger: 1,
      renewals: beforeCounts!.renewals,
      continuous: seeded.subscription,
    });
    const [after] =
      await db`select app_private.f13_project_entitlement(${fixture.wsA.id},${successor},${today}::date)
      as projection`;
    expect(
      (after!.projection as { effective_end_exclusive: string })
        .effective_end_exclusive,
    ).toBe(
      new Date(new Date(`${beforeEnd}T00:00:00Z`).getTime() + 30 * 86400000)
        .toISOString()
        .slice(0, 10),
    );
    await db`select app_private.f13_materialize_entitlement(${fixture.wsA.id},${successor},${today}::date)`;
    const materialized =
      await db`select subscription_id,status,effective_end_exclusive::text as effective_end_exclusive
      from app_private.subscription_entitlement_projection
      where workspace_id=${fixture.wsA.id} and subscription_id in (${seeded.subscription},${successor})`;
    expect(materialized).toEqual([
      {
        subscription_id: seeded.subscription,
        status: 'active',
        effective_end_exclusive: (
          after!.projection as { effective_end_exclusive: string }
        ).effective_end_exclusive,
      },
    ]);
    await expect(db`update app_private.subscription_reattachments set actor_user_id=${fixture.po.userId}
      where successor_subscription_id=${successor}`).rejects.toThrow(
      /subscription_reattachment_immutable/,
    );
  });

  it('publishes one immutable revision and delivery, replays exactly, and projects delivered plans only', async () => {
    const operationKey = randomUUID();
    const published = await fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: operationKey,
      },
    );
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({
      status: 'ok',
      plan_id: planId,
      revision_number: 1,
    });
    const replay = await fixture.trainerA.client.rpc('ready_and_publish_plan', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: operationKey,
    });
    expect(replay.data).toEqual(published.data);

    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: { schemaVersion: 2, document: { title: 'T020 revised' } },
      p_operation_key: randomUUID(),
    });
    expect(saved.data).toBe(2);
    const secondRevision = await fixture.trainerA.client.rpc(
      'ready_and_publish_plan',
      {
        p_plan_id: planId,
        p_expected_draft_version: 2,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(secondRevision.data).toMatchObject({
      status: 'ok',
      revision_number: 2,
    });
    const stale = await fixture.trainerA.client.rpc('ready_and_publish_plan', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    });
    expect(stale.data).toMatchObject({ status: 'stale_version' });

    const concurrentPlan = await fixture.trainerA.client.rpc(
      'create_plan_draft',
      {
        p_workspace_id: fixture.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'nutrition',
        p_content: {
          schemaVersion: 2,
          document: { title: 'Concurrent delivery' },
        },
        p_operation_key: randomUUID(),
      },
    );
    expect(concurrentPlan.error).toBeNull();
    const concurrentKey = randomUUID();
    const concurrentCalls = await Promise.all(
      Array.from({ length: 2 }, () =>
        fixture.trainerA.client.rpc('ready_and_publish_plan', {
          p_plan_id: concurrentPlan.data as string,
          p_expected_draft_version: 1,
          p_expected_published_version: 0,
          p_operation_key: concurrentKey,
        }),
      ),
    );
    expect(concurrentCalls.every((result) => result.error === null)).toBe(true);
    expect(concurrentCalls[0]!.data).toEqual(concurrentCalls[1]!.data);

    const deliveredPlanIds = [planId, concurrentPlan.data as string];
    for (let index = 0; index < 10; index += 1) {
      const created = await fixture.trainerA.client.rpc('create_plan_draft', {
        p_workspace_id: fixture.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'workout',
        p_content: { schemaVersion: 2, document: { title: `Plan ${index}` } },
        p_operation_key: randomUUID(),
      });
      expect(created.error).toBeNull();
      const id = created.data as string;
      deliveredPlanIds.push(id);
      const delivery = await fixture.trainerA.client.rpc(
        'ready_and_publish_plan',
        {
          p_plan_id: id,
          p_expected_draft_version: 1,
          p_expected_published_version: 0,
          p_operation_key: randomUUID(),
        },
      );
      expect(delivery.data).toMatchObject({ status: 'ok', revision_number: 1 });
    }
    const draftOnly = await fixture.trainerA.client.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'nutrition',
      p_content: { schemaVersion: 2, document: { title: 'Undelivered draft' } },
      p_operation_key: randomUUID(),
    });
    expect(draftOnly.error).toBeNull();

    const [counts] = await db`select
      (select count(*)::int from public.plan_revisions where plan_id=${planId}) as revisions,
      (select count(*)::int from public.plan_deliveries where plan_id=${planId}) as deliveries`;
    expect(counts).toEqual({ revisions: 2, deliveries: 2 });
    const [client] =
      await db`select auth_user_id from public.clients where id=${seeded.client}`;
    const projection = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client!.auth_user_id, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      try {
        const [row] = await tx`select public.client_plan_projection() as value`;
        return row!.value;
      } finally {
        await tx`reset role`;
      }
    });
    expect(projection).toMatchObject({ status: 'ok' });
    const projectedPlans = (
      projection as {
        plans: Array<{
          plan_id: string;
          revision_number: number;
          content: unknown;
        }>;
      }
    ).plans;
    expect(projectedPlans.map((plan) => plan.plan_id).sort()).toEqual(
      deliveredPlanIds.sort(),
    );
    expect(projectedPlans).toHaveLength(12);
    expect(
      projectedPlans.find((plan) => plan.plan_id === planId),
    ).toMatchObject({
      revision_number: 2,
      content: { schemaVersion: 2, document: { title: 'T020 revised' } },
    });
    expect(projectedPlans.map((plan) => plan.plan_id)).not.toContain(
      draftOnly.data,
    );
  });
});
