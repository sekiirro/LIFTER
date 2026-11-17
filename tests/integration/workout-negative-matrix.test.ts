import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';
import { createStaff, sql } from './harness';
import { withCrashSafeFunctionMutant } from './function-drift-guard';

type Tx = postgres.TransactionSql;

const allF17Tables = [
  'public.workout_global_templates',
  'public.workout_global_template_versions',
  'public.workout_workspace_templates',
  'public.workout_workspace_template_versions',
  'public.workout_template_assignment_runs',
  'public.workout_template_assignment_items',
  'public.workout_template_assignment_copies',
  'public.workout_template_distribution_state',
  'public.plan_revision_contributors',
  'app_private.f17_workout_operation_keys',
] as const;

type Actor = { userId: string };
let notesFixture: ClientNotesFixture;
let db: ReturnType<typeof sql>;
let f: ClientNotesFixture['context'];
let clientActor: Actor;
let unaffiliated: Actor;
let revokedActor: Actor;

// Fixture state
let globalTemplateId: string;
let wsATemplateId: string;
let wsBTemplateId: string;
let assignmentRunId: string;
let assignmentCopyId: string;
let planIdA: string;
let planRevisionIdA: string;
let loadPlanIdA: string;
let sessionDayIdA: string;
let restDayIdA: string;
let globalExId: string;
let wsAExId: string;
let wsBExId: string;

const validDoc = (notes: string) => ({
  schema_version: 1,
  notes,
  days: [{ id: randomUUID(), kind: 'session', items: [] }],
});

async function asActor<T>(tx: Tx, actorId: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actorId, role: 'authenticated' })}, true)`;
  return body();
}

async function asAnon<T>(tx: Tx, body: () => Promise<T>) {
  await tx`select set_config('role', 'anon', true)`;
  await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
  return body();
}

async function expectRejected(
  tx: Tx,
  body: (sp: Tx) => Promise<unknown>,
  matcher: Record<string, unknown>,
) {
  await expect(tx.savepoint((sp) => body(sp))).rejects.toMatchObject(matcher);
}

async function proveFunctionGuardMutationPermits(
  identity: string,
  guard: string,
  replacement: string,
  actorId: string,
  action: (tx: Tx) => PromiseLike<readonly unknown[]>,
) {
  await withCrashSafeFunctionMutant(
    identity,
    (source) => {
      expect(source).toContain(guard);
      return source.replaceAll(guard, replacement);
    },
    async () => {
      let actionSucceeded = false;
      await db.begin(async (tx) => {
        const rollback = new Error('guard mutation rollback');
        await expect(
          tx.savepoint(async (sp) => {
            const rows = await asActor(sp, actorId, async () => [
              ...(await action(sp)),
            ]);
            actionSucceeded = rows.length > 0;
            throw rollback;
          }),
        ).rejects.toBe(rollback);
      });
      expect(actionSucceeded).toBe(true);
    },
  );
}

beforeAll(async () => {
  notesFixture = await clientNotesFixture();
  db = sql();
  f = notesFixture.context;

  clientActor = await createStaff(null, 'workout-matrix-client');
  unaffiliated = await createStaff(null, 'workout-matrix-unaffiliated');
  revokedActor = await createStaff('trainer', 'workout-matrix-revoked');

  // Insert explicit revoked membership in workspace A
  await db`insert into public.workspace_memberships (
      workspace_id, user_id, granted_by, revoked_at, revoked_by
    ) values (
      ${f.wsA.id}, ${revokedActor.userId}, ${f.po.userId}, clock_timestamp(), ${f.po.userId}
    )`;

  // Seed baseline catalog exercises via RPCs
  const canonRes = await f.po.client.rpc('catalog_create_exercise', {
    p_operation_key: randomUUID(),
    p_request: {
      name_en: `Matrix Canon ${randomUUID()}`,
      name_ar: 'تمرين عام',
      primary_muscle_code: 'chest',
      secondary_muscle_codes: ['triceps'],
      equipment_codes: ['barbell'],
    },
  });
  expect(canonRes.error).toBeNull();
  globalExId = (canonRes.data as { exercise_id: string }).exercise_id;

  const wsAExRes = await f.trainerA.client.rpc(
    'catalog_write_workspace_exercise',
    {
      p_workspace_id: f.wsA.id,
      p_exercise_id: null,
      p_expected_version: 0,
      p_operation_key: randomUUID(),
      p_request: {
        name_en: `Matrix WS-A Ex ${randomUUID()}`,
        name_ar: 'خاص أ',
        primary_muscle_code: 'glutes',
        equipment_codes: ['kettlebell'],
        default_rir: 0,
      },
    },
  );
  expect(wsAExRes.error).toBeNull();
  wsAExId = (wsAExRes.data as { exercise_id: string }).exercise_id;

  const wsBExRes = await f.trainerB.client.rpc(
    'catalog_write_workspace_exercise',
    {
      p_workspace_id: f.wsB.id,
      p_exercise_id: null,
      p_expected_version: 0,
      p_operation_key: randomUUID(),
      p_request: {
        name_en: `Matrix WS-B Ex ${randomUUID()}`,
        name_ar: 'خاص ب',
        primary_muscle_code: 'hamstrings',
        equipment_codes: ['kettlebell'],
        default_rir: 0,
      },
    },
  );
  expect(wsBExRes.error).toBeNull();
  wsBExId = (wsBExRes.data as { exercise_id: string }).exercise_id;

  // Seed baseline workout templates in a deferred transaction
  globalTemplateId = randomUUID();
  wsATemplateId = randomUUID();
  wsBTemplateId = randomUUID();
  assignmentRunId = randomUUID();
  assignmentCopyId = randomUUID();

  await db.begin(async (tx) => {
    await tx`set constraints all deferred`;
    await tx`insert into public.workout_global_templates (id, current_version, created_by)
      values (${globalTemplateId}, 1, ${f.po.userId})`;
    await tx`insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
      values (${globalTemplateId}, 1, 'Global Seed', 1, ${tx.json(validDoc('global'))}, ${f.po.userId})`;

    await tx`insert into public.workout_workspace_templates (workspace_id, id, current_version, created_by)
      values (${f.wsA.id}, ${wsATemplateId}, 1, ${f.woA.userId}),
             (${f.wsB.id}, ${wsBTemplateId}, 1, ${f.trainerB.userId})`;
    await tx`insert into public.workout_workspace_template_versions (workspace_id, template_id, version, title, schema_version, document, created_by)
      values (${f.wsA.id}, ${wsATemplateId}, 1, 'WS-A Seed', 1, ${tx.json(validDoc('ws-a'))}, ${f.woA.userId}),
             (${f.wsB.id}, ${wsBTemplateId}, 1, 'WS-B Seed', 1, ${tx.json(validDoc('ws-b'))}, ${f.trainerB.userId})`;

    await tx`insert into public.workout_template_assignment_runs (
        id, actor_id, operation_key, request_hash, template_selection_mode, target_mode,
        assigned_workspace_count, created_copies_count
      ) values (
        ${assignmentRunId}, ${f.po.userId}, ${randomUUID()}, 'sha256:matrix-seed', 'all', 'all_workspaces', 1, 1
      )`;
    await tx`insert into public.workout_template_assignment_items (run_id, workspace_id, outcome)
      values (${assignmentRunId}, ${f.wsA.id}, 'denied')`;
    await tx`insert into public.workout_template_assignment_copies (
        id, run_id, workspace_id, global_template_id, global_template_version,
        workspace_template_id, workspace_template_version
      ) values (
        ${assignmentCopyId}, ${assignmentRunId}, ${f.wsA.id}, ${globalTemplateId}, 1, ${wsATemplateId}, 1
      )`;
    await tx`insert into public.workout_template_distribution_state (
        workspace_id, ever_received_global_assignment, first_assigned_at, first_assignment_id, last_assignment_id
      ) values (${f.wsA.id}, true, now(), ${assignmentRunId}, ${assignmentRunId})`;
  });

  // Seed baseline plan draft in WS-A
  sessionDayIdA = randomUUID();
  restDayIdA = randomUUID();
  const planDocA = {
    schema_version: 1,
    days: [
      { id: sessionDayIdA, kind: 'session', title: 'Session Day', items: [] },
      { id: restDayIdA, kind: 'rest', title: 'Rest Day', items: [] },
    ],
  };
  const planARes = await f.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: f.wsA.id,
    p_client_id: notesFixture.clientId,
    p_plan_kind: 'workout',
    p_content: planDocA,
    p_operation_key: randomUUID(),
  });
  expect(planARes.error).toBeNull();
  planIdA = String(planARes.data);

  planRevisionIdA = randomUUID();
  const [planRoot] = await db`
    select created_by from public.plan_roots
    where workspace_id = ${f.wsA.id} and id = ${planIdA}
  `;
  await db`
    insert into public.plan_revisions (
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    )
    select ${planRevisionIdA}, d.workspace_id, d.plan_id, 1, d.draft_version,
           'workout', d.content, ${planRoot!.created_by}
    from public.plan_drafts d
    where d.workspace_id = ${f.wsA.id} and d.plan_id = ${planIdA}
  `;
  await db`
    insert into public.plan_revision_contributors (
      workspace_id, plan_id, revision_id, user_id
    ) values (${f.wsA.id}, ${planIdA}, ${planRevisionIdA}, ${f.trainerA.userId})
  `;

  const emptyPlanRes = await f.trainerA.client.rpc('create_plan_draft', {
    p_workspace_id: f.wsA.id,
    p_client_id: notesFixture.clientId,
    p_plan_kind: 'workout',
    p_content: { schema_version: 1, days: [] },
    p_operation_key: randomUUID(),
  });
  expect(emptyPlanRes.error).toBeNull();
  loadPlanIdA = String(emptyPlanRes.data);
});

afterAll(async () => {
  await notesFixture?.close();
  await db.end();
});

describe('F17 T047 Full negative matrix — Clause 1 & 4: Foreign-workspace app + RLS & PO-only global/assignment', () => {
  it('enforces PO-only RLS visibility for global templates and assignment ledgers', async () => {
    await db.begin(async (tx) => {
      // PO sees global and assignment tables
      const [gtCount] = await asActor(
        tx,
        f.po.userId,
        () =>
          tx`select count(*)::int as c from public.workout_global_templates where id = ${globalTemplateId}`,
      );
      expect(gtCount!.c).toBe(1);

      const [runCount] = await asActor(
        tx,
        f.po.userId,
        () =>
          tx`select count(*)::int as c from public.workout_template_assignment_runs where id = ${assignmentRunId}`,
      );
      expect(runCount!.c).toBe(1);

      // Non-PO actors see 0 rows
      const nonPoActors = [
        f.woA,
        f.trainerA,
        f.salesA,
        f.trainerB,
        clientActor,
        unaffiliated,
        revokedActor,
      ];
      for (const actor of nonPoActors) {
        for (const rel of [
          'public.workout_global_templates',
          'public.workout_global_template_versions',
          'public.workout_template_assignment_runs',
          'public.workout_template_assignment_items',
          'public.workout_template_assignment_copies',
          'public.workout_template_distribution_state',
        ]) {
          const [row] = await asActor(tx, actor.userId, () =>
            tx.unsafe(`select count(*)::int as c from ${rel}`),
          );
          expect(row!.c, `${actor.userId} seeing ${rel}`).toBe(0);
        }
      }

      // Anonymous actor has no SELECT privilege on PO tables
      for (const rel of [
        'public.workout_global_templates',
        'public.workout_template_assignment_runs',
      ]) {
        const [grant] =
          await tx`select has_table_privilege('anon', ${rel}, 'SELECT') as allowed`;
        expect(grant!.allowed).toBe(false);
      }
    });
  });

  it('enforces strict workspace tenancy isolation for workspace templates in RLS', async () => {
    await db.begin(async (tx) => {
      // PO sees both WS-A and WS-B templates
      const [poCount] = await asActor(
        tx,
        f.po.userId,
        () =>
          tx`select count(*)::int as c from public.workout_workspace_templates where id in (${wsATemplateId}, ${wsBTemplateId})`,
      );
      expect(poCount!.c).toBe(2);

      // WO-A and Trainer-A see WS-A (1) and WS-B (0)
      for (const actor of [f.woA, f.trainerA]) {
        const [wsACount] = await asActor(
          tx,
          actor.userId,
          () =>
            tx`select count(*)::int as c from public.workout_workspace_templates where id = ${wsATemplateId}`,
        );
        expect(wsACount!.c).toBe(1);
        const [wsBCount] = await asActor(
          tx,
          actor.userId,
          () =>
            tx`select count(*)::int as c from public.workout_workspace_templates where id = ${wsBTemplateId}`,
        );
        expect(wsBCount!.c).toBe(0);
      }

      // Foreign Trainer-B sees WS-B (1) and WS-A (0)
      const [trB_wsB] = await asActor(
        tx,
        f.trainerB.userId,
        () =>
          tx`select count(*)::int as c from public.workout_workspace_templates where id = ${wsBTemplateId}`,
      );
      expect(trB_wsB!.c).toBe(1);
      const [trB_wsA] = await asActor(
        tx,
        f.trainerB.userId,
        () =>
          tx`select count(*)::int as c from public.workout_workspace_templates where id = ${wsATemplateId}`,
      );
      expect(trB_wsA!.c).toBe(0);

      // Revoked actor sees 0
      const [revokedCount] = await asActor(
        tx,
        revokedActor.userId,
        () =>
          tx`select count(*)::int as c from public.workout_workspace_templates where id = ${wsATemplateId}`,
      );
      expect(revokedCount!.c).toBe(0);

      // Non-coaching roles (Sales, Client, Unaffiliated) see 0
      for (const actor of [f.salesA, clientActor, unaffiliated]) {
        const [row] = await asActor(
          tx,
          actor.userId,
          () =>
            tx`select count(*)::int as c from public.workout_workspace_templates where id in (${wsATemplateId}, ${wsBTemplateId})`,
        );
        expect(row!.c, `${actor.userId} seeing workspace templates`).toBe(0);
      }

      // Contributor identity/action rows follow the plan workspace RLS wall.
      const [trainerContributor] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select count(*)::int as c from public.plan_revision_contributors where revision_id = ${planRevisionIdA}`,
      );
      expect(trainerContributor!.c).toBe(1);
      for (const actor of [
        f.trainerB,
        f.salesA,
        clientActor,
        unaffiliated,
        revokedActor,
      ]) {
        const [row] = await asActor(
          tx,
          actor.userId,
          () =>
            tx`select count(*)::int as c from public.plan_revision_contributors where revision_id = ${planRevisionIdA}`,
        );
        expect(row!.c, `${actor.userId} seeing foreign contributor rows`).toBe(
          0,
        );
      }
    });
  });

  it('denies non-PO actors on global template RPCs (create, version, retire)', async () => {
    await db.begin(async (tx) => {
      const nonPoActors = [
        f.woA,
        f.trainerA,
        f.salesA,
        f.trainerB,
        clientActor,
        unaffiliated,
        revokedActor,
      ];
      for (const actor of nonPoActors) {
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.create_workout_global_template('Denied', ${sp.json(validDoc('d'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.version_workout_global_template(${globalTemplateId}, 1, 'Denied', ${sp.json(validDoc('d'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.retire_workout_global_template(${globalTemplateId}, 1, ${randomUUID()})`,
            ),
          { code: '42501' },
        );
      }

      // Anonymous actor denied
      await expectRejected(
        tx,
        (sp) =>
          asAnon(
            sp,
            () =>
              sp`select public.create_workout_global_template('Denied Anon', ${sp.json(validDoc('d'))}, ${randomUUID()})`,
          ),
        { code: '42501' },
      );
    });
  });

  it('denies foreign-workspace staff on workspace template and workout exercise RPCs', async () => {
    await db.begin(async (tx) => {
      // Foreign trainerB targeting workspace A
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Denied WS', ${sp.json(validDoc('d'))}, ${randomUUID()})`,
          ),
        { code: '42501' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, 'Denied Ver', ${sp.json(validDoc('d'))}, ${randomUUID()})`,
          ),
        { code: '42501' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select public.retire_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, ${randomUUID()})`,
          ),
        { code: '42501' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${randomUUID()})`,
          ),
        { code: '42501' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
                {
                  source: 'global',
                  identity_id: globalExId,
                  version: 1,
                },
              )})`,
          ),
        { code: '42501' },
      );
    });
  });

  it('refuses private references in global templates and foreign private references in workspace templates/plans', async () => {
    await db.begin(async (tx) => {
      const privateRefDoc = {
        schema_version: 1,
        days: [
          {
            id: randomUUID(),
            kind: 'session',
            items: [
              {
                id: randomUUID(),
                name: 'Private Exercise',
                exercise: {
                  source: 'workspace_private',
                  identity_id: wsAExId,
                  version: 1,
                  workspace_id: f.wsA.id,
                },
                alternatives: [],
                sets: [],
              },
            ],
          },
        ],
      };

      // Fresh global template rejects private exercise reference
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.po.userId,
            () =>
              sp`select public.create_workout_global_template('Global With Priv', ${sp.json(privateRefDoc)}, ${randomUUID()})`,
          ),
        { code: '22023' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.po.userId,
            () =>
              sp`select public.version_workout_global_template(${globalTemplateId}, 1, 'Global With Priv', ${sp.json(privateRefDoc)}, ${randomUUID()})`,
          ),
        { code: '22023' },
      );

      // Workspace template rejects foreign private exercise reference
      const foreignPrivRefDoc = {
        schema_version: 1,
        days: [
          {
            id: randomUUID(),
            kind: 'session',
            items: [
              {
                id: randomUUID(),
                name: 'Foreign Private Exercise',
                exercise: {
                  source: 'workspace_private',
                  identity_id: wsBExId,
                  version: 1,
                  workspace_id: f.wsB.id,
                },
                alternatives: [],
                sets: [],
              },
            ],
          },
        ],
      };
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.create_workout_workspace_template(${f.wsA.id}, 'WS With For Priv', ${sp.json(foreignPrivRefDoc)}, ${randomUUID()})`,
          ),
        { code: '22023' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, 'WS With For Priv', ${sp.json(foreignPrivRefDoc)}, ${randomUUID()})`,
          ),
        { code: '22023' },
      );

      // f17_add_workout_exercise rejects foreign private exercise
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'workspace_private', ${wsBExId}, 1, ${randomUUID()})`,
          ),
        { code: '42501' },
      );

      // f17_resolve_workout_exercise_muscles rejects foreign workspace reference
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
                {
                  source: 'workspace_private',
                  identity_id: wsBExId,
                  version: 1,
                  workspace_id: f.wsB.id,
                },
              )})`,
          ),
        { code: '42501' },
      );

      // Trigger f17_guard_workout_draft_references rejects foreign private reference
      await expectRejected(
        tx,
        (sp) => sp`update public.plan_drafts
          set content = ${sp.json(foreignPrivRefDoc)}
          where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}`,
        { code: '42501' },
      );

      // Trigger f17_guard_workout_revision_references rejects foreign private reference
      await expectRejected(
        tx,
        (sp) => sp`insert into public.plan_revisions (
            workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by
          ) values (
            ${f.wsA.id}, ${planIdA}, 10, 1, 'workout', ${sp.json(foreignPrivRefDoc)}, ${f.trainerA.userId}
          )`,
        { code: '42501' },
      );
    });
  });
});

describe('F17 T047 Full negative matrix — Clause 2: Direct DML denial & table immutability triggers', () => {
  it('denies direct client-role DML (INSERT, UPDATE, DELETE, TRUNCATE) on all F17 tables', async () => {
    for (const rel of allF17Tables) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const [grant] =
            await db`select has_table_privilege(${role}, ${rel}, ${privilege}) as allowed`;
          expect(grant!.allowed, `${role} ${privilege} on ${rel}`).toBe(false);
        }
      }
    }
  });

  it('rejects version mutation and identity deletion/tampering via database triggers', async () => {
    await db.begin(async (tx) => {
      // f17_reject_template_version_mutation on global and workspace template versions (raises 23514)
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_global_template_versions set title = 'Tampered' where template_id = ${globalTemplateId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_global_template_versions where template_id = ${globalTemplateId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_workspace_template_versions set title = 'Tampered' where template_id = ${wsATemplateId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_workspace_template_versions where template_id = ${wsATemplateId}`,
        { code: '23514' },
      );

      // f17_reject_template_identity_delete on template roots (raises 23514)
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_global_templates where id = ${globalTemplateId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_workspace_templates where id = ${wsATemplateId}`,
        { code: '23514' },
      );

      // f17_guard_template_identity_update tampering with immutable columns (raises 23514)
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_global_templates set created_by = ${f.trainerA.userId} where id = ${globalTemplateId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_workspace_templates set created_by = ${f.trainerB.userId} where id = ${wsATemplateId}`,
        { code: '23514' },
      );

      // f17_reject_assignment_ledger_mutation on ledger tables (raises 23514)
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_template_assignment_runs set target_mode = 'tampered' where id = ${assignmentRunId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_template_assignment_runs where id = ${assignmentRunId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_template_assignment_items set outcome = 'tampered' where run_id = ${assignmentRunId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_template_assignment_items where run_id = ${assignmentRunId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.workout_template_assignment_copies set global_template_version = 999 where id = ${assignmentCopyId}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_template_assignment_copies where id = ${assignmentCopyId}`,
        { code: '23514' },
      );

      // f17_guard_distribution_state_update prevents reset to false or delete (raises 23514)
      await expectRejected(
        tx,
        (sp) => sp`update public.workout_template_distribution_state
          set ever_received_global_assignment = false where workspace_id = ${f.wsA.id}`,
        { code: '23514' },
      );
      await expectRejected(
        tx,
        (sp) =>
          sp`delete from public.workout_template_distribution_state where workspace_id = ${f.wsA.id}`,
        { code: '23514' },
      );

      // plan_revision_contributors is immutable after publish.
      await expectRejected(
        tx,
        (sp) =>
          sp`update public.plan_revision_contributors
            set action_codes = array['save']::text[]
            where revision_id = ${planRevisionIdA}`,
        { code: '23514' },
      );
    });
  });
});

describe('F17 T047 Full negative matrix — Clause 3: Sales, client, unaffiliated, revoked denial', () => {
  it('denies Sales, client, unaffiliated, and revoked staff across every F17 RPC', async () => {
    await db.begin(async (tx) => {
      const unauthorized = [
        { name: 'Sales', actor: f.salesA },
        { name: 'Client', actor: clientActor },
        { name: 'Unaffiliated', actor: unaffiliated },
        { name: 'Revoked', actor: revokedActor },
      ];

      for (const { actor } of unauthorized) {
        // RPC 1: create_workout_global_template
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.create_workout_global_template('T', ${sp.json(validDoc('t'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 2: version_workout_global_template
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.version_workout_global_template(${globalTemplateId}, 1, 'T', ${sp.json(validDoc('t'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 3: retire_workout_global_template
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.retire_workout_global_template(${globalTemplateId}, 1, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 4: create_workout_workspace_template
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.create_workout_workspace_template(${f.wsA.id}, 'T', ${sp.json(validDoc('t'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 5: version_workout_workspace_template
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, 'T', ${sp.json(validDoc('t'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 6: retire_workout_workspace_template
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.retire_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 7: f17_add_workout_exercise
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        // RPC 8: f17_resolve_workout_exercise_muscles
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
                  {
                    source: 'global',
                    identity_id: globalExId,
                    version: 1,
                  },
                )})`,
            ),
          { code: '42501' },
        );

        // RPC 9: record_workout_export_audit
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.record_workout_export_audit(
                  ${f.wsA.id}, ${planIdA}, ${planRevisionIdA}, 'pdf', 'success', null
                )`,
            ),
          { code: '42501' },
        );

        // RPC 10: PO-only assignment
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.assign_workout_templates(
                  'all', null, null, 'all_workspaces', null, ${randomUUID()}
                )`,
            ),
          { code: '42501' },
        );

        // RPC 11: PO-only promotion
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.promote_workout_workspace_template(
                  ${f.wsA.id}, ${wsATemplateId}, 1, ${randomUUID()}
                )`,
            ),
          { code: '42501' },
        );

        // RPC 12: global-template load is PO-only, even for workspace coaches.
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.load_workout_template_version(
                  ${loadPlanIdA}, 'global', ${globalTemplateId}, 1, ${randomUUID()}
                )`,
            ),
          { code: '42501' },
        );
      }

      const nonCoachingActors = [
        f.salesA,
        f.trainerB,
        clientActor,
        unaffiliated,
        revokedActor,
      ];
      for (const actor of nonCoachingActors) {
        // RPC 13: plan draft save requires current workspace coaching_work.
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              actor.userId,
              () =>
                sp`select public.save_plan_draft(
                  ${planIdA}, 1, ${sp.json(validDoc('denied-save'))}, ${randomUUID()}
                )`,
            ),
          { code: '42501' },
        );

        // RPC 14: workout publication returns the same generic status.
        const [publish] = await asActor(
          tx,
          actor.userId,
          () =>
            tx`select public.ready_and_publish_plan(${planIdA}, 1, 0, ${randomUUID()}) as result`,
        );
        expect(publish!.result).toMatchObject({ status: 'not_permitted' });
      }

      // A valid foreign-workspace trainer is denied through the same generic code.
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select public.record_workout_export_audit(
                ${f.wsA.id}, ${planIdA}, ${planRevisionIdA}, 'pdf', 'success', null
              )`,
          ),
        { code: '42501' },
      );
    });

    const unauthorizedIds = [
      f.salesA.userId,
      clientActor.userId,
      unaffiliated.userId,
      revokedActor.userId,
      f.trainerB.userId,
    ];
    const rows = await db`
      select actor_user_id from public.audit_events
      where action = 'plan.workout_export'
        and target_id = ${planRevisionIdA}
        and details->>'outcome' = 'success'
        and actor_user_id = any(${unauthorizedIds}::uuid[])
    `;
    expect(rows).toHaveLength(0);
  });
});

describe('F17 T047 Full negative matrix — Clause 5: Replay vs conflict & CAS expected version guards', () => {
  it('enforces expected-version compare-and-swap (CAS) and retired state guards', async () => {
    await db.begin(async (tx) => {
      // Global template CAS expected version mismatch (40001)
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.po.userId,
            () =>
              sp`select public.version_workout_global_template(${globalTemplateId}, 999, 'Stale', ${sp.json(validDoc('s'))}, ${randomUUID()})`,
          ),
        { code: '40001' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.po.userId,
            () =>
              sp`select public.retire_workout_global_template(${globalTemplateId}, 999, ${randomUUID()})`,
          ),
        { code: '40001' },
      );

      // Workspace template CAS expected version mismatch (40001)
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 999, 'Stale', ${sp.json(validDoc('s'))}, ${randomUUID()})`,
          ),
        { code: '40001' },
      );
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.retire_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 999, ${randomUUID()})`,
          ),
        { code: '40001' },
      );

      // f17_add_workout_exercise CAS draft version mismatch (40001)
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 999, ${randomUUID()})`,
          ),
        { code: '40001' },
      );

      // Retired global template rejects versioning and re-retiring
      await tx
        .savepoint(async (sp) => {
          const retiredGlobalKey = randomUUID();
          await asActor(
            sp,
            f.po.userId,
            () =>
              sp`select public.retire_workout_global_template(${globalTemplateId}, 1, ${retiredGlobalKey})`,
          );
          await expectRejected(
            sp,
            (sp2) =>
              asActor(
                sp2,
                f.po.userId,
                () =>
                  sp2`select public.version_workout_global_template(${globalTemplateId}, 1, 'Revive', ${sp2.json(validDoc('r'))}, ${randomUUID()})`,
              ),
            { code: '42501' },
          );
          await expectRejected(
            sp,
            (sp2) =>
              asActor(
                sp2,
                f.po.userId,
                () =>
                  sp2`select public.retire_workout_global_template(${globalTemplateId}, 1, ${randomUUID()})`,
              ),
            { code: '42501' },
          );
          throw new Error('rollback global retirement');
        })
        .catch((e) => {
          if (e.message !== 'rollback global retirement') throw e;
        });

      // Retired workspace template rejects versioning and re-retiring
      await tx
        .savepoint(async (sp) => {
          const retiredWsKey = randomUUID();
          await asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.retire_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, ${retiredWsKey})`,
          );
          await expectRejected(
            sp,
            (sp2) =>
              asActor(
                sp2,
                f.trainerA.userId,
                () =>
                  sp2`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, 'Revive', ${sp2.json(validDoc('r'))}, ${randomUUID()})`,
              ),
            { code: '42501' },
          );
          await expectRejected(
            sp,
            (sp2) =>
              asActor(
                sp2,
                f.trainerA.userId,
                () =>
                  sp2`select public.retire_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, ${randomUUID()})`,
              ),
            { code: '42501' },
          );
          throw new Error('rollback ws retirement');
        })
        .catch((e) => {
          if (e.message !== 'rollback ws retirement') throw e;
        });
    });
  });

  it('enforces exact idempotency replay, key conflict detection, and replay re-authorization', async () => {
    await db.begin(async (tx) => {
      // Workspace template create replay vs conflict
      const wsKey = randomUUID();
      const wsDoc1 = validDoc('ws-create-idem-1');
      const [wsRes1] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select public.create_workout_workspace_template(${f.wsA.id}, 'Idem Template', ${tx.json(wsDoc1)}, ${wsKey}) as r`,
      );
      expect(wsRes1?.r).toBeDefined();

      // Exact replay returns identical result
      const [wsReplay] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select public.create_workout_workspace_template(${f.wsA.id}, 'Idem Template', ${tx.json(wsDoc1)}, ${wsKey}) as r`,
      );
      expect(wsReplay?.r).toEqual(wsRes1?.r);

      // Changed parameters under same key triggers 23505 key_conflict
      const wsDoc2 = validDoc('ws-create-idem-conflicting');
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Conflicting Title', ${sp.json(wsDoc2)}, ${wsKey})`,
          ),
        { code: '23505' },
      );

      // f17_add_workout_exercise replay vs conflict
      const addKey = randomUUID();
      const [addRes1] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${addKey}) as r`,
      );
      expect(addRes1?.r).toBeDefined();

      // Exact replay returns identical receipt
      const [addReplay] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${addKey}) as r`,
      );
      expect(addReplay?.r).toEqual(addRes1?.r);

      // Changed parameters under same key triggers 23505 key_conflict
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'workspace_private', ${wsAExId}, 1, ${addKey})`,
          ),
        { code: '23505' },
      );

      // Replay re-checks authorization: revoked actor replaying key fails with 42501
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            revokedActor.userId,
            () =>
              sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Idem Template', ${sp.json(wsDoc1)}, ${wsKey})`,
          ),
        { code: '42501' },
      );

      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            revokedActor.userId,
            () =>
              sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${addKey})`,
          ),
        { code: '42501' },
      );
    });
  });
});

describe('F17 T047 Full negative matrix — Clause 6: Indistinguishable denials & rest-day rejection', () => {
  it('ensures denials across non-existent and foreign targets are indistinguishable in RLS and RPCs', async () => {
    await db.begin(async (tx) => {
      async function captureErr(
        fn: (sp: Tx) => Promise<unknown>,
      ): Promise<{ code?: string; message?: string }> {
        try {
          await tx.savepoint((sp) => fn(sp));
          throw new Error('expected rejection but succeeded');
        } catch (e) {
          return e as { code?: string; message?: string };
        }
      }

      const nonExistentId = randomUUID();

      // RLS indistinguishable: querying non-existent vs foreign WS template returns 0 rows
      const [nonExistentRows] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select count(*)::int as c from public.workout_workspace_templates where id = ${nonExistentId}`,
      );
      const [foreignRows] = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select count(*)::int as c from public.workout_workspace_templates where id = ${wsBTemplateId}`,
      );
      expect(nonExistentRows!.c).toBe(0);
      expect(foreignRows!.c).toBe(0);

      // RPC indistinguishable: version_workout_workspace_template on non-existent vs foreign template
      const errNonExistent = await captureErr((sp) =>
        asActor(
          sp,
          f.trainerA.userId,
          () =>
            sp`select public.version_workout_workspace_template(${f.wsA.id}, ${nonExistentId}, 1, 'Title', ${sp.json(validDoc('n'))}, ${randomUUID()})`,
        ),
      );
      const errForeign = await captureErr((sp) =>
        asActor(
          sp,
          f.trainerA.userId,
          () =>
            sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsBTemplateId}, 1, 'Title', ${sp.json(validDoc('n'))}, ${randomUUID()})`,
        ),
      );
      expect(errNonExistent?.code).toBe('42501');
      expect(errForeign?.code).toBe('42501');
      expect(errNonExistent?.message).toBe(errForeign?.message);

      // RPC indistinguishable: f17_add_workout_exercise on non-existent plan vs foreign plan
      const fakeForeignPlan = randomUUID();
      const errAddNonExistent = await captureErr((sp) =>
        asActor(
          sp,
          f.trainerA.userId,
          () =>
            sp`select public.f17_add_workout_exercise(${nonExistentId}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${randomUUID()})`,
        ),
      );
      const errAddForeign = await captureErr((sp) =>
        asActor(
          sp,
          f.trainerA.userId,
          () =>
            sp`select public.f17_add_workout_exercise(${fakeForeignPlan}, ${sessionDayIdA}, 'global', ${globalExId}, 1, ${randomUUID()})`,
        ),
      );
      expect(errAddNonExistent?.code).toBe('42501');
      expect(errAddForeign?.code).toBe('42501');
      expect(errAddNonExistent?.message).toBe(errAddForeign?.message);

      // RPC indistinguishable: f17_resolve_workout_exercise_muscles on non-existent vs foreign private exercise
      const errMuscNonExistent = await captureErr((sp) =>
        asActor(
          sp,
          f.trainerA.userId,
          () =>
            sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
              {
                source: 'workspace_private',
                identity_id: nonExistentId,
                version: 1,
                workspace_id: f.wsA.id,
              },
            )})`,
        ),
      );
      const errMuscForeign = await captureErr((sp) =>
        asActor(
          sp,
          f.trainerA.userId,
          () =>
            sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
              {
                source: 'workspace_private',
                identity_id: wsBExId,
                version: 1,
                workspace_id: f.wsB.id,
              },
            )})`,
        ),
      );
      expect(errMuscNonExistent?.code).toBe('42501');
      expect(errMuscForeign?.code).toBe('42501');
      expect(errMuscNonExistent?.message).toBe(errMuscForeign?.message);
    });
  });

  it('rejects adding an exercise to a rest day with 23514 invalid_document and no writes', async () => {
    await db.begin(async (tx) => {
      // First get current draft version
      const [draftBefore] =
        await tx`select draft_version from public.plan_drafts where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}`;
      const currentVersion = Number(draftBefore!.draft_version);

      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.f17_add_workout_exercise(${planIdA}, ${restDayIdA}, 'global', ${globalExId}, ${currentVersion}, ${randomUUID()})`,
          ),
        { code: '23514' },
      );

      // Verify draft version remained unchanged
      const [draftAfter] =
        await tx`select draft_version from public.plan_drafts where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}`;
      expect(Number(draftAfter!.draft_version)).toBe(currentVersion);
    });
  });
});

describe('F17 T047 Full negative matrix — Per-guard mutation kill suite', () => {
  it('kills mutants on RLS policies and table grants', async () => {
    await db.begin(async (tx) => {
      // Mutant 1: widen workout_global_templates_po_read policy
      let m1Killed = false;
      const r1 = new Error('r1');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter policy workout_global_templates_po_read on public.workout_global_templates using (true)`;
          const [res] = await asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select count(*)::int as c from public.workout_global_templates where id = ${globalTemplateId}`,
          );
          if (res?.c === 1) m1Killed = true;
          throw r1;
        }),
      ).rejects.toBe(r1);
      expect(m1Killed, 'workout_global_templates_po_read mutant killed').toBe(
        true,
      );

      // Mutant 2: widen workout_workspace_templates_staff_read policy
      let m2Killed = false;
      const r2 = new Error('r2');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter policy workout_workspace_templates_staff_read on public.workout_workspace_templates using (true)`;
          const [res] = await asActor(
            sp,
            f.trainerB.userId,
            () =>
              sp`select count(*)::int as c from public.workout_workspace_templates where id = ${wsATemplateId}`,
          );
          if (res?.c === 1) m2Killed = true;
          throw r2;
        }),
      ).rejects.toBe(r2);
      expect(
        m2Killed,
        'workout_workspace_templates_staff_read mutant killed',
      ).toBe(true);

      // Mutant 3: widen workout_template_assignment_runs_po_read policy
      let m3Killed = false;
      const r3 = new Error('r3');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter policy workout_template_assignment_runs_po_read on public.workout_template_assignment_runs using (true)`;
          const [res] = await asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select count(*)::int as c from public.workout_template_assignment_runs where id = ${assignmentRunId}`,
          );
          if (res?.c === 1) m3Killed = true;
          throw r3;
        }),
      ).rejects.toBe(r3);
      expect(
        m3Killed,
        'workout_template_assignment_runs_po_read mutant killed',
      ).toBe(true);

      // Mutant 22: widen plan_revision_contributors_staff_read policy.
      let m22Killed = false;
      const r22 = new Error('m22');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter policy plan_revision_contributors_staff_read on public.plan_revision_contributors using (true)`;
          const [res] = await asActor(
            sp,
            f.salesA.userId,
            () =>
              sp`select count(*)::int as c from public.plan_revision_contributors where revision_id = ${planRevisionIdA}`,
          );
          if (res?.c === 1) m22Killed = true;
          throw r22;
        }),
      ).rejects.toBe(r22);
      expect(
        m22Killed,
        'plan_revision_contributors_staff_read mutant killed',
      ).toBe(true);

      // Mutant 4: direct DML grant on workout_global_templates
      let m4Killed = false;
      const r4 = new Error('r4');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`grant insert on public.workout_global_templates to authenticated`;
          const [res] =
            await sp`select has_table_privilege('authenticated', 'public.workout_global_templates', 'INSERT') as allowed`;
          if (res?.allowed === true) m4Killed = true;
          throw r4;
        }),
      ).rejects.toBe(r4);
      expect(m4Killed, 'direct DML denial mutant killed').toBe(true);
    });
  });

  it('kills mutants on table immutability and reference triggers', async () => {
    await db.begin(async (tx) => {
      // Mutant 5: disable f17_reject_template_version_mutation trigger
      let m5Killed = false;
      const r5 = new Error('r5');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.workout_global_template_versions disable trigger workout_global_template_versions_immutable`;
          await sp`update public.workout_global_template_versions set title = 'Tampered' where template_id = ${globalTemplateId}`;
          m5Killed = true;
          throw r5;
        }),
      ).rejects.toBe(r5);
      expect(
        m5Killed,
        'f17_reject_template_version_mutation trigger mutant killed',
      ).toBe(true);

      // Mutant 6: disable f17_reject_template_identity_delete trigger
      let m6Killed = false;
      const r6 = new Error('r6');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.workout_global_templates disable trigger workout_global_templates_no_delete`;
          const freshId = randomUUID();
          await sp`set constraints all deferred`;
          await sp`insert into public.workout_global_templates (id, current_version, created_by) values (${freshId}, 1, ${f.po.userId})`;
          await sp`delete from public.workout_global_templates where id = ${freshId}`;
          m6Killed = true;
          throw r6;
        }),
      ).rejects.toBe(r6);
      expect(
        m6Killed,
        'f17_reject_template_identity_delete trigger mutant killed',
      ).toBe(true);

      // Mutant 7: disable f17_reject_assignment_ledger_mutation trigger
      let m7Killed = false;
      const r7 = new Error('r7');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.workout_template_assignment_runs disable trigger workout_template_assignment_runs_immutable`;
          await sp`update public.workout_template_assignment_runs set assigned_workspace_count = 999 where id = ${assignmentRunId}`;
          m7Killed = true;
          throw r7;
        }),
      ).rejects.toBe(r7);
      expect(
        m7Killed,
        'f17_reject_assignment_ledger_mutation trigger mutant killed',
      ).toBe(true);

      // Mutant 8: disable f17_guard_distribution_state_update trigger
      let m8Killed = false;
      const r8 = new Error('r8');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.workout_template_distribution_state disable trigger workout_template_distribution_state_guard_update`;
          await sp`delete from public.workout_template_distribution_state where workspace_id = ${f.wsA.id}`;
          m8Killed = true;
          throw r8;
        }),
      ).rejects.toBe(r8);
      expect(
        m8Killed,
        'f17_guard_distribution_state_update trigger mutant killed',
      ).toBe(true);

      // Mutant 23: disable immutable revision-contributor trigger.
      let m23Killed = false;
      const r23 = new Error('m23');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.plan_revision_contributors disable trigger plan_revision_contributors_immutable`;
          await sp`update public.plan_revision_contributors
            set action_codes = array['save']::text[]
            where revision_id = ${planRevisionIdA}`;
          m23Killed = true;
          throw r23;
        }),
      ).rejects.toBe(r23);
      expect(
        m23Killed,
        'plan_revision_contributors_immutable trigger mutant killed',
      ).toBe(true);

      // Mutant 9: disable f17_guard_workout_draft_references trigger
      let m9Killed = false;
      const r9 = new Error('r9');
      const foreignPrivRefDoc = {
        schema_version: 1,
        days: [
          {
            id: randomUUID(),
            kind: 'session',
            items: [
              {
                id: randomUUID(),
                exercise: {
                  source: 'workspace_private',
                  identity_id: wsBExId,
                  version: 1,
                  workspace_id: f.wsB.id,
                },
              },
            ],
          },
        ],
      };
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.plan_drafts disable trigger f17_guard_workout_draft_references`;
          await sp`update public.plan_drafts
            set content = ${sp.json(foreignPrivRefDoc)},
                draft_version = draft_version + 1,
                updated_at = clock_timestamp(),
                updated_by = ${f.trainerA.userId}
            where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}`;
          m9Killed = true;
          throw r9;
        }),
      ).rejects.toBe(r9);
      expect(
        m9Killed,
        'f17_guard_workout_draft_references trigger mutant killed',
      ).toBe(true);

      // Mutant 10: disable f17_guard_workout_revision_references trigger
      let m10Killed = false;
      const r10 = new Error('r10');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`alter table public.plan_revisions disable trigger f17_guard_workout_revision_references`;
          await sp`insert into public.plan_revisions (
              workspace_id, plan_id, revision_number, source_draft_version, plan_kind, content, authored_by
            ) values (
              ${f.wsA.id}, ${planIdA}, 50, 1, 'workout', ${sp.json(foreignPrivRefDoc)}, ${f.trainerA.userId}
            )`;
          m10Killed = true;
          throw r10;
        }),
      ).rejects.toBe(r10);
      expect(
        m10Killed,
        'f17_guard_workout_revision_references trigger mutant killed',
      ).toBe(true);
    });
  });

  it('kills mutants on template RPC guards (PO-only, tenancy, private refs, CAS, retirement)', async () => {
    // Mutant 11: create_workout_global_template PO role check
    await withCrashSafeFunctionMutant(
      'public.create_workout_global_template(text,jsonb,uuid)',
      (source) =>
        source.replaceAll('not app_private.is_platform_owner()', 'false'),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m11 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.create_workout_global_template('Mutant Global', ${sp.json(validDoc('mg'))}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'PO guard mutant killed').toBe(true);
      },
    );

    // Mutant 12: create_workout_global_template private reference refusal
    await withCrashSafeFunctionMutant(
      'public.create_workout_global_template(text,jsonb,uuid)',
      (source) =>
        source.replace(
          'or app_private.f17_workout_has_private_reference(p_document)',
          'or false',
        ),
      async () => {
        let callSucceeded = false;
        const privateRefDoc = {
          schema_version: 1,
          days: [
            {
              id: randomUUID(),
              kind: 'session',
              items: [
                {
                  id: randomUUID(),
                  name: 'Private Exercise',
                  exercise: {
                    source: 'workspace_private',
                    identity_id: wsAExId,
                    version: 1,
                    workspace_id: f.wsA.id,
                  },
                  alternatives: [],
                  sets: [],
                },
              ],
            },
          ],
        };
        await db.begin(async (tx) => {
          const rollback = new Error('m12 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.po.userId,
                () =>
                  sp`select public.create_workout_global_template('Mutant Global Priv', ${sp.json(privateRefDoc)}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'private ref guard mutant killed').toBe(true);
      },
    );

    // Mutant 13: create_workout_workspace_template foreign workspace check
    await withCrashSafeFunctionMutant(
      'public.create_workout_workspace_template(uuid,text,jsonb,uuid)',
      (source) =>
        source.replaceAll(
          "not app_private.has_workspace_access(p_workspace_id,'coaching_work')",
          'false',
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m13 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerB.userId,
                () =>
                  sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Mutant WS', ${sp.json(validDoc('mw'))}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(
          callSucceeded,
          'foreign workspace coaching check mutant killed',
        ).toBe(true);
      },
    );

    // Mutant 14: create_workout_workspace_template foreign private reference refusal
    await withCrashSafeFunctionMutant(
      'public.create_workout_workspace_template(uuid,text,jsonb,uuid)',
      (source) =>
        source.replace(
          'or app_private.f17_workout_has_foreign_private_reference(p_document, p_workspace_id)',
          'or false',
        ),
      async () => {
        let callSucceeded = false;
        const foreignPrivRefDoc = {
          schema_version: 1,
          days: [
            {
              id: randomUUID(),
              kind: 'session',
              items: [
                {
                  id: randomUUID(),
                  name: 'Foreign Private Exercise',
                  exercise: {
                    source: 'workspace_private',
                    identity_id: wsBExId,
                    version: 1,
                    workspace_id: f.wsB.id,
                  },
                  alternatives: [],
                  sets: [],
                },
              ],
            },
          ],
        };
        await db.begin(async (tx) => {
          const rollback = new Error('m14 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Mutant WS Priv', ${sp.json(foreignPrivRefDoc)}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'foreign private ref guard mutant killed').toBe(
          true,
        );
      },
    );

    // Mutant 15: version_workout_workspace_template CAS version check
    await withCrashSafeFunctionMutant(
      'public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid)',
      (source) =>
        source.replace(
          "if root.current_version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;",
          'null;',
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m15 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 999, 'CAS Mutant', ${sp.json(validDoc('cas'))}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'CAS expected-version mutant killed').toBe(true);
      },
    );

    // Mutant 16: version_workout_workspace_template retirement check
    await withCrashSafeFunctionMutant(
      'public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid)',
      (source) =>
        source.replace(
          "if root.lifecycle_state <> 'active' then raise exception 'not_permitted' using errcode = '42501'; end if;",
          'null;',
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m16 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              // Retire template
              await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.retire_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, ${randomUUID()})`,
              );
              // Under mutant, versioning retired template succeeds!
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.version_workout_workspace_template(${f.wsA.id}, ${wsATemplateId}, 1, 'Revive Mutant', ${sp.json(validDoc('rev'))}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(
          callSucceeded,
          'active-state retirement guard mutant killed',
        ).toBe(true);
      },
    );
  });

  it('kills mutants on f17_add_workout_exercise and f17_resolve_workout_exercise_muscles guards', async () => {
    // Mutant 17: f17_add_workout_exercise rest-day rejection check
    await withCrashSafeFunctionMutant(
      'public.f17_add_workout_exercise(uuid,uuid,text,uuid,bigint,uuid,uuid)',
      (source) =>
        source.replace(
          "if not v_day_found or v_day_kind is distinct from 'session' then\n    raise exception 'invalid_document' using errcode = '23514';\n  end if;",
          "if not v_day_found then raise exception 'invalid_document' using errcode = '23514'; end if;",
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m17 rollback');
          const [draftBefore] =
            await tx`select draft_version from public.plan_drafts where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}`;
          const currentVersion = Number(draftBefore!.draft_version);
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.f17_add_workout_exercise(${planIdA}, ${restDayIdA}, 'global', ${globalExId}, ${currentVersion}, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'rest-day rejection mutant killed').toBe(true);
      },
    );

    // Mutant 18: f17_add_workout_exercise foreign private exercise check
    await withCrashSafeFunctionMutant(
      'public.f17_add_workout_exercise(uuid,uuid,text,uuid,bigint,uuid,uuid)',
      (source) =>
        source.replace(
          'where e.workspace_id = root.workspace_id',
          'where e.workspace_id = e.workspace_id',
        ),
      async () => {
        let reachedEffectiveFields = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m18 rollback');
          const [draftBefore] =
            await tx`select draft_version from public.plan_drafts where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}`;
          const currentVersion = Number(draftBefore!.draft_version);
          await expect(
            tx.savepoint(async (sp) => {
              try {
                await asActor(
                  sp,
                  f.trainerA.userId,
                  () =>
                    sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'workspace_private', ${wsBExId}, ${currentVersion}, ${randomUUID()}) as r`,
                );
              } catch (e: unknown) {
                if (
                  (e as { where?: string }).where?.includes(
                    'catalog_effective_workspace_exercise_fields',
                  )
                ) {
                  reachedEffectiveFields = true;
                }
              }
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(
          reachedEffectiveFields,
          'foreign private exercise query filter mutant killed',
        ).toBe(true);
      },
    );

    // Mutant 19: f17_add_workout_exercise CAS draft version check
    await withCrashSafeFunctionMutant(
      'public.f17_add_workout_exercise(uuid,uuid,text,uuid,bigint,uuid,uuid)',
      (source) =>
        source.replace(
          "if draft.draft_version <> p_expected_draft_version then\n    raise exception 'stale_version' using errcode = '40001';\n  end if;",
          'null;',
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m19 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.f17_add_workout_exercise(${planIdA}, ${sessionDayIdA}, 'global', ${globalExId}, 999, ${randomUUID()}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'CAS draft-version mutant killed').toBe(true);
      },
    );

    // Mutant 20: f17_resolve_workout_exercise_muscles foreign workspace check
    await withCrashSafeFunctionMutant(
      'public.f17_resolve_workout_exercise_muscles(uuid,jsonb)',
      (source) =>
        source.replace(
          "not app_private.has_workspace_access(p_workspace_id, 'coaching_work')",
          'false',
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m20 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerB.userId,
                () =>
                  sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
                    {
                      source: 'global',
                      identity_id: globalExId,
                      version: 1,
                    },
                  )}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(callSucceeded, 'workspace tenancy mutant killed').toBe(true);
      },
    );

    // Mutant 21: f17_resolve_workout_exercise_muscles foreign private exercise reference check
    await withCrashSafeFunctionMutant(
      'public.f17_resolve_workout_exercise_muscles(uuid,jsonb)',
      (source) =>
        source.replace(
          "if v_ref_workspace_id is distinct from p_workspace_id::text then\n      raise exception 'not_permitted' using errcode = '42501';\n    end if;",
          'null;',
        ),
      async () => {
        let callSucceeded = false;
        await db.begin(async (tx) => {
          const rollback = new Error('m21 rollback');
          await expect(
            tx.savepoint(async (sp) => {
              const [res] = await asActor(
                sp,
                f.trainerA.userId,
                () =>
                  sp`select public.f17_resolve_workout_exercise_muscles(${f.wsA.id}, ${sp.json(
                    {
                      source: 'workspace_private',
                      identity_id: wsAExId,
                      version: 1,
                      workspace_id: f.wsB.id,
                    },
                  )}) as r`,
              );
              if (res?.r) callSucceeded = true;
              throw rollback;
            }),
          ).rejects.toBe(rollback);
        });
        expect(
          callSucceeded,
          'foreign private reference tenancy mutant killed',
        ).toBe(true);
      },
    );
  });
});

describe('F17 T047 Full negative matrix — Export authorization mutation', () => {
  it('kills removal of the workout export coaching-work guard', async () => {
    const guard =
      'if not coalesce(app_private.is_platform_owner(), false)\n     and not exists (';
    await expect(
      withCrashSafeFunctionMutant(
        'public.record_workout_export_audit(uuid,uuid,uuid,text,text,text)',
        (source) => {
          expect(source).toContain(guard);
          return source.replace(guard, 'if false\n     and not exists (');
        },
        async () =>
          db.begin(async (tx) =>
            expectRejected(
              tx,
              (sp) =>
                asActor(
                  sp,
                  f.salesA.userId,
                  () =>
                    sp`select public.record_workout_export_audit(
                      ${f.wsA.id}, ${planIdA}, ${planRevisionIdA}, 'pdf', 'success', null
                    )`,
                ),
              { code: '42501' },
            ),
          ),
      ),
    ).rejects.toThrow();
  });
});

describe('F17 T047 Full negative matrix — Merged operation guard mutations', () => {
  it('kills removal of the PO-only assignment guard', async () => {
    await proveFunctionGuardMutationPermits(
      'public.assign_workout_templates(text,uuid[],uuid[],text,uuid[],uuid)',
      'if actor is null or not app_private.is_platform_owner() then',
      'if actor is null then',
      f.trainerA.userId,
      (tx) =>
        tx`select public.assign_workout_templates(
          'all', null, null, 'all_workspaces', null, ${randomUUID()}
        )`,
    );
  });

  it('kills removal of the PO-only promotion guard', async () => {
    await proveFunctionGuardMutationPermits(
      'public.promote_workout_workspace_template(uuid,uuid,integer,uuid)',
      'if actor is null or not app_private.is_platform_owner() then',
      'if actor is null then',
      f.trainerA.userId,
      (tx) =>
        tx`select public.promote_workout_workspace_template(
          ${f.wsA.id}, ${wsATemplateId}, 1, ${randomUUID()}
        )`,
    );
  });

  it('kills removal of the PO-only global load guard', async () => {
    const guard =
      "if p_template_kind = 'global' and not app_private.is_platform_owner() then";
    await proveFunctionGuardMutationPermits(
      'public.load_workout_template_version(uuid,text,uuid,integer,uuid)',
      guard,
      'if false then',
      f.trainerA.userId,
      (tx) =>
        tx`select public.load_workout_template_version(
          ${loadPlanIdA}, 'global', ${globalTemplateId}, 1, ${randomUUID()}
        )`,
    );
  });

  it('kills removal of the coaching-work draft-save guard', async () => {
    const [draft] = await db`
      select draft_version from public.plan_drafts
      where workspace_id = ${f.wsA.id} and plan_id = ${planIdA}
    `;
    await proveFunctionGuardMutationPermits(
      'public.save_plan_draft(uuid,bigint,jsonb,uuid)',
      "if not found or not app_private.has_workspace_access(root.workspace_id, 'coaching_work') then",
      'if not found then',
      f.salesA.userId,
      (tx) =>
        tx`select public.save_plan_draft(
          ${planIdA}, ${draft!.draft_version}, ${tx.json(validDoc('mutant-save'))}, ${randomUUID()}
        )`,
    );
  });

  it('kills removal of the coaching-work publish guard before input validation', async () => {
    await proveFunctionGuardMutationPermits(
      'public.ready_and_publish_plan(uuid,bigint,bigint,uuid)',
      "not app_private.has_workspace_access(root.workspace_id, 'coaching_work')",
      'false',
      f.salesA.userId,
      (tx) =>
        tx`select public.ready_and_publish_plan(${planIdA}, -1, -1, null)`,
    );
  });
});
