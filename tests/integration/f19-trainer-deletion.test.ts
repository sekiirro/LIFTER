import { randomUUID } from 'node:crypto';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, checked, createStaff } from './harness';
import { clientContext, graph, sql } from './registration-approval-fixture';

let db: ReturnType<typeof sql>;

const workoutContent = (notes: string) => ({
  schema_version: 1,
  days: [],
  notes,
});

const nutritionContent = (title: string) => ({
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: 'dt-1',
  dayTypes: [
    {
      id: 'dt-1',
      trainingDay: false,
      name: { ar: 'يوم', en: title },
    },
  ],
  meals: [],
});

beforeAll(() => {
  db = sql();
});

afterAll(async () => db?.end());

async function snapshotCounts(
  workspaceId: string,
  clientId: string,
  subscriptionId: string,
  trainerId: string,
) {
  const [row] = await db`
    select
      (select count(*)::int from public.plan_roots
        where workspace_id = ${workspaceId} and client_id = ${clientId}) as roots,
      (select count(*)::int from public.plan_drafts
        where workspace_id = ${workspaceId} and created_by = ${trainerId}) as drafts,
      (select count(*)::int from public.plan_revisions
        where workspace_id = ${workspaceId} and authored_by = ${trainerId}) as revisions,
      (select count(*)::int from public.plan_revision_contributors c
        join public.plan_roots p on p.workspace_id = c.workspace_id and p.id = c.plan_id
        where c.workspace_id = ${workspaceId} and p.client_id = ${clientId}
          and c.user_id = ${trainerId}) as contributor_rows,
      (select count(*)::int from public.plan_deliveries
        where workspace_id = ${workspaceId} and client_id = ${clientId} and subscription_id = ${subscriptionId}) as deliveries,
      (select count(*)::int from public.subscription_activations
        where workspace_id = ${workspaceId} and subscription_id = ${subscriptionId}) as activations,
      (select count(*)::int from public.productivity_units
        where workspace_id = ${workspaceId} and client_id = ${clientId}) as units,
      (select count(*)::int from public.plan_audit_events
        where workspace_id = ${workspaceId} and actor_user_id = ${trainerId}) as plan_audits,
      (select count(*)::int from public.audit_events
        where workspace_id = ${workspaceId}) as audit_events,
      (select count(*)::int from app_private.plan_operation_keys
        where workspace_id = ${workspaceId} and actor_user_id = ${trainerId}) as plan_ops,
      (select count(*)::int from app_private.plan_delivery_operations
        where workspace_id = ${workspaceId} and actor_user_id = ${trainerId}) as delivery_ops
  `;
  return row!;
}

describe('F19 T031 trainer deletion retention integration', () => {
  it('enforces ON DELETE RESTRICT on all F19 staff/author foreign keys in the catalog', async () => {
    const f19StaffFks = await db`
      select
        n.nspname || '.' || c.relname as tbl,
        con.conname,
        rn.nspname || '.' || rc.relname as ref_tbl,
        con.confdeltype
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_class rc on rc.oid = con.confrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
      where con.contype = 'f'
        and (
          (n.nspname = 'public' and c.relname in (
            'plan_roots', 'plan_drafts', 'plan_revisions',
            'plan_deliveries', 'productivity_units', 'plan_audit_events',
            'plan_revision_contributors'
          ))
          or (n.nspname = 'app_private' and c.relname in (
            'plan_operation_keys', 'plan_delivery_operations',
            'subscription_reattachments', 'f19_override_operations'
          ))
        )
        and rn.nspname = 'public'
        and rc.relname = 'staff_profiles'
      order by tbl, con.conname
    `;
    expect(f19StaffFks).toHaveLength(12);
    expect(f19StaffFks.every((fk) => fk.confdeltype === 'r')).toBe(true);

    const [staffAuthFk] = await db`
      select con.confdeltype
      from pg_constraint con
      where con.contype = 'f'
        and con.conrelid = 'public.staff_profiles'::regclass
        and con.confrelid = 'auth.users'::regclass
    `;
    expect(staffAuthFk?.confdeltype).toBe('r');

    const cascadingFks = await db`
      select n.nspname || '.' || c.relname as tbl, con.conname, con.confdeltype
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where con.contype = 'f'
        and con.confdeltype in ('c', 'n')
        and (
          (n.nspname = 'public' and c.relname in (
            'plan_roots', 'plan_drafts', 'plan_revisions', 'plan_deliveries',
            'subscription_activations', 'productivity_units', 'plan_audit_events'
          ))
          or (n.nspname = 'app_private' and c.relname in (
            'plan_operation_keys', 'plan_delivery_operations',
            'subscription_reattachments', 'f19_override_operations'
          ))
        )
    `;
    expect(cascadingFks).toEqual([]);
  });

  it('refuses direct auth.users/staff_profiles deletion and preserves all F19 history & author IDs under F11 workflow', async () => {
    const context = await clientContext();
    const seeded = await db.begin((tx) => graph(tx, context));
    const trainer = await createStaff('trainer', 'f19-t031');
    const trainerPassword = `T031-${randomUUID()}-aA1!`;
    const setPw = await admin().auth.admin.updateUserById(trainer.userId, {
      password: trainerPassword,
    });
    expect(setPw.error).toBeNull();
    const preDeletionLogin = await anonClient().auth.signInWithPassword({
      email: trainer.email,
      password: trainerPassword,
    });
    expect(preDeletionLogin.error).toBeNull();

    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: context.wsA.id,
        user_id: trainer.userId,
        granted_by: context.po.userId,
      }),
    );

    // Trainer creates, edits, and delivers workout plan, then creates & delivers nutrition plan
    // to trigger initial subscription activation + productivity unit attribution.
    const workoutDraft = checked(
      await trainer.client.rpc('create_plan_draft', {
        p_workspace_id: context.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'workout',
        p_content: workoutContent('Initial workout'),
        p_operation_key: randomUUID(),
      }),
    ) as string;

    await db.begin((tx) =>
      seedSubmittedIntake(tx, context.wsA.id, seeded.client),
    );

    checked(
      await trainer.client.rpc('save_plan_draft', {
        p_plan_id: workoutDraft,
        p_expected_draft_version: 1,
        p_content: workoutContent('Updated workout'),
        p_operation_key: randomUUID(),
      }),
    );

    const workoutDelivery = await trainer.client.rpc('ready_and_publish_plan', {
      p_plan_id: workoutDraft,
      p_expected_draft_version: 2,
      p_expected_published_version: 0,
      p_operation_key: randomUUID(),
    });
    expect(workoutDelivery.error).toBeNull();
    expect((workoutDelivery.data as { status?: string } | null)?.status).toBe(
      'ok',
    );

    const nutritionDraft = checked(
      await trainer.client.rpc('create_plan_draft', {
        p_workspace_id: context.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'nutrition',
        p_content: nutritionContent('Initial nutrition'),
        p_operation_key: randomUUID(),
      }),
    ) as string;

    const nutritionDelivery = await trainer.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: nutritionDraft,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      },
    );
    expect(nutritionDelivery.error).toBeNull();
    expect((nutritionDelivery.data as { status?: string } | null)?.status).toBe(
      'ok',
    );

    const before = await snapshotCounts(
      context.wsA.id,
      seeded.client,
      seeded.subscription,
      trainer.userId,
    );
    expect(before).toMatchObject({
      roots: 2,
      drafts: 2,
      revisions: 2,
      deliveries: 2,
      activations: 1,
      units: 1,
    });
    expect(before.plan_audits).toBeGreaterThanOrEqual(4);
    expect(before.plan_ops).toBeGreaterThanOrEqual(3);
    expect(before.delivery_ops).toBe(2);

    // 1. Direct auth.users delete must be refused (RESTRICT) with zero changes.
    await expect(
      db`delete from auth.users where id = ${trainer.userId}`,
    ).rejects.toThrow();

    const adminDelete = await admin().auth.admin.deleteUser(trainer.userId);
    expect(adminDelete.error).not.toBeNull();

    await expect(
      db`delete from public.staff_profiles where user_id = ${trainer.userId}`,
    ).rejects.toThrow();

    const afterDirectDeleteAttempt = await snapshotCounts(
      context.wsA.id,
      seeded.client,
      seeded.subscription,
      trainer.userId,
    );
    expect(afterDirectDeleteAttempt).toEqual(before);

    // 2. Execute F11 P-S40-1 staff deletion steps:
    // Step (A): Ban Auth user via Auth Admin API.
    const banResult = await admin().auth.admin.updateUserById(trainer.userId, {
      ban_duration: '876000h',
    });
    expect(banResult.error).toBeNull();

    // Step (B): Revoke workspace memberships (ends any active trainer assignments, keeping ended rows).
    await db`
      update public.workspace_memberships
      set revoked_at = clock_timestamp(), revoked_by = ${context.po.userId}
      where user_id = ${trainer.userId}
        and workspace_id = ${context.wsA.id}
        and revoked_at is null
    `;

    // Step (C): Replace Auth email with non-login placeholder & clear metadata while retaining auth.users.id.
    const placeholderEmail = `deleted-${trainer.userId}@deleted.invalid`;
    const clearResult = await admin().auth.admin.updateUserById(
      trainer.userId,
      {
        email: placeholderEmail,
        user_metadata: {},
      },
    );
    expect(clearResult.error).toBeNull();

    // Verify deleted trainer cannot log in (original email or placeholder email).
    const originalLogin = await anonClient().auth.signInWithPassword({
      email: trainer.email,
      password: trainerPassword,
    });
    expect(originalLogin.error).not.toBeNull();
    expect(originalLogin.data.session).toBeNull();

    const placeholderLogin = await anonClient().auth.signInWithPassword({
      email: placeholderEmail,
      password: trainerPassword,
    });
    expect(placeholderLogin.error).not.toBeNull();
    expect(placeholderLogin.data.session).toBeNull();

    // Verify deleted trainer cannot perform F19 writes even with a pre-existing client handle.
    const writeAfterRevoke = await trainer.client.rpc('create_plan_draft', {
      p_workspace_id: context.wsA.id,
      p_client_id: seeded.client,
      p_plan_kind: 'workout',
      p_content: workoutContent('Should fail'),
      p_operation_key: randomUUID(),
    });
    expect(writeAfterRevoke.error).not.toBeNull();

    // Verify all F19 row counts are unchanged (and audit_events is append-only: >= before with all prior rows intact).
    const afterF11 = await snapshotCounts(
      context.wsA.id,
      seeded.client,
      seeded.subscription,
      trainer.userId,
    );
    expect(afterF11.audit_events).toBeGreaterThanOrEqual(before.audit_events);
    expect({ ...afterF11, audit_events: before.audit_events }).toEqual(before);

    // Verify author/actor/recipient IDs are retained unchanged (no tombstone rewrite) and non-login auth row exists.
    const [retained] = await db`
      select
        (select count(*)::int from auth.users where id = ${trainer.userId} and banned_until is not null) as auth_retained,
        (select count(*)::int from public.staff_profiles where user_id = ${trainer.userId}) as staff_retained,
        (select bool_and(created_by = ${trainer.userId}) from public.plan_roots where id in (${workoutDraft}, ${nutritionDraft})) as roots_author_intact,
        (select bool_and(created_by = ${trainer.userId} and updated_by = ${trainer.userId}) from public.plan_drafts where plan_id in (${workoutDraft}, ${nutritionDraft})) as drafts_author_intact,
        (select bool_and(authored_by = ${trainer.userId}) from public.plan_revisions where plan_id in (${workoutDraft}, ${nutritionDraft})) as revisions_author_intact,
        (select bool_and(action_codes @> array['publish']::text[]) from public.plan_revision_contributors where plan_id in (${workoutDraft}, ${nutritionDraft}) and user_id = ${trainer.userId}) as contributor_actions_intact,
        (select bool_and(delivered_by = ${trainer.userId}) from public.plan_deliveries where plan_id in (${workoutDraft}, ${nutritionDraft})) as deliveries_author_intact,
        (select recipient_trainer_user_id = ${trainer.userId} from public.productivity_units where workspace_id = ${context.wsA.id} and client_id = ${seeded.client}) as unit_recipient_intact,
        (select bool_and(actor_user_id = ${trainer.userId}) from public.plan_audit_events where plan_id in (${workoutDraft}, ${nutritionDraft})) as audit_actor_intact
    `;
    expect(retained).toEqual({
      auth_retained: 1,
      staff_retained: 1,
      roots_author_intact: true,
      drafts_author_intact: true,
      revisions_author_intact: true,
      contributor_actions_intact: true,
      deliveries_author_intact: true,
      unit_recipient_intact: true,
      audit_actor_intact: true,
    });

    // Verify client projection still returns both delivered plans.
    const [clientRow] =
      await db`select auth_user_id from public.clients where id = ${seeded.client}`;
    const projection = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: clientRow!.auth_user_id, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      try {
        const [row] = await tx`select public.client_plan_projection() as value`;
        return row!.value as {
          status: string;
          plans: Array<{ plan_id: string }>;
        };
      } finally {
        await tx`reset role`;
      }
    });
    expect(projection.status).toBe('ok');
    expect(projection.plans.map((p) => p.plan_id).sort()).toEqual(
      [workoutDraft, nutritionDraft].sort(),
    );
  });
});
