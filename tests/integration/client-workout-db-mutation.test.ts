import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  asUser,
  workoutDocument,
  workoutFixture,
  type WorkoutClient,
  type WorkoutFixture,
} from './client-workout-fixture';

// F16/F17 client workout DB-level role/authorization mutation evidence
// (F22 T026 workout scope) and recorder negatives. Each kill test installs a
// mutated definition inside a transaction that is always rolled back, shows
// the negative assertion fails under the mutant, and then proves the
// installed definition still contains the control.
let p: WorkoutFixture;
let owner: WorkoutClient;
let other: WorkoutClient;
let awaiting: WorkoutClient;
let ownerPlan: string;
let ownerRevision: string;
let awaitingPlan: string;
let markerPlan: string;
let foreignPlan: string;
let privateForeign: string;
let globalMain: string;

const MARKER = 'F17K-STAFF-ONLY-MARKER';
const PLAN_SIGNATURE = 'public.client_portal_workout_plan(uuid,integer)';
const AUDIT_SIGNATURE =
  'public.record_workout_export_audit(uuid,uuid,uuid,text,text,text)';

beforeAll(async () => {
  p = await workoutFixture();
  const wsA = p.fixture.wsA.id;
  const wsB = p.fixture.wsB.id;
  owner = await p.makeClient({ activate: true });
  other = await p.makeClient({ activate: true });
  awaiting = await p.makeClient({ activate: false });
  globalMain = await p.createGlobal(`F17K main ${randomUUID()}`, null);
  privateForeign = await p.createPrivate(wsB, p.fixture.trainerB.userId, {
    name_en: `F17K foreign ${randomUUID()}`,
  });
  const global = { source: 'global' as const, identity_id: globalMain };
  ownerPlan = await p.createDraft(
    owner.clientId,
    workoutDocument('F17K owner', [{ exercise: global }]),
  );
  await p.publish(ownerPlan, 1, 0);
  ownerRevision = await p.revisionId(ownerPlan, 1);
  awaitingPlan = await p.createDraft(
    awaiting.clientId,
    workoutDocument('F17K await', [{ exercise: global }]),
  );
  await p.publish(awaitingPlan, 1, 0);
  const marked = workoutDocument('F17K marker', [
    { exercise: global },
  ]) as Record<string, unknown>;
  marked.staff_only_marker = MARKER;
  markerPlan = await p.createDraft(owner.clientId, marked);
  await p.publish(markerPlan, 1, 0);
  foreignPlan = await p.createDraft(
    owner.clientId,
    workoutDocument('F17K foreign ref', [
      {
        exercise: {
          source: 'workspace_private',
          identity_id: privateForeign,
          workspace_id: wsB,
        },
      },
    ]),
  );
  await p.publish(foreignPlan, 1, 0);
  void wsA;
});
afterAll(async () => p?.close());

const rollback = new Error('rollback F17 client workout mutation');

/** Install a mutated definition, run `probe` as `userId`, always roll back. */
async function underMutant(
  signature: string,
  mutations: [control: string, replacement: string][],
  userId: string,
  probe: (tx: TransactionSql) => Promise<unknown>,
): Promise<unknown> {
  let observed: unknown = 'not-reached';
  try {
    await p.db.begin(async (tx) => {
      const [row] =
        await tx`select pg_get_functiondef(${signature}::regprocedure) as definition`;
      let mutated = row!.definition as string;
      for (const [control, replacement] of mutations) {
        expect(mutated, `${signature} control present: ${control}`).toContain(
          control,
        );
        mutated = mutated.replaceAll(control, replacement);
      }
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      observed = await probe(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return observed;
}

async function stillInstalled(signature: string, controls: string[]) {
  const [row] =
    await p.db`select pg_get_functiondef(${signature}::regprocedure) as definition`;
  for (const control of controls)
    expect(row!.definition as string).toContain(control);
}

const readPlan = (planId: string, tx: TransactionSql) =>
  tx`select public.client_portal_workout_plan(${planId}::uuid, null::integer) as value`.then(
    (rows) => rows[0]!.value as Record<string, unknown>,
  );

describe('F17 client workout DB mutation kills (role and entitlement walls)', () => {
  it('K1 role wall: removing the signed-identity client match lets staff read; installed wall refuses staff', async () => {
    const control = 'and c.auth_user_id = auth.uid()';
    const mutant = await underMutant(
      'app_private.f17_client_portal_client()',
      [
        [
          control,
          `and (c.auth_user_id = auth.uid() or c.id = '${owner.clientId}'::uuid)`,
        ],
      ],
      p.fixture.po.userId,
      (tx) => readPlan(ownerPlan, tx),
    );
    // Under the mutant a Platform Owner is treated as the owner client.
    expect((mutant as { status: string }).status).toBe('ok');
    const installed = await p.db.begin((tx) =>
      asUser(tx, p.fixture.po.userId, (inner) => readPlan(ownerPlan, inner)),
    );
    expect(installed).toEqual({ status: 'invalid' });
    await stillInstalled('app_private.f17_client_portal_client()', [control]);
  });

  it('K2 entitlement wall: removing the F13 active gate releases content to a restricted client', async () => {
    const control = "if summary->>'status' is distinct from 'active' then";
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      [[control, 'if false then']],
      awaiting.authUserId,
      (tx) => readPlan(awaitingPlan, tx),
    );
    expect((mutant as { status: string }).status).toBe('ok');
    const installed = await p.db.begin((tx) =>
      asUser(tx, awaiting.authUserId, (inner) => readPlan(awaitingPlan, inner)),
    );
    expect((installed as { status: string }).status).toBe('restricted');
    await stillInstalled(PLAN_SIGNATURE, [control]);
  });

  it('K3 own-client wall: removing the client filters lets another client read the plan', async () => {
    const controls = [
      'and d.client_id = client_row.client_id',
      'and pr.client_id = client_row.client_id',
      "= (summary->>'subscription_id')::uuid",
    ];
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      [
        [controls[0]!, 'and true'],
        [controls[1]!, 'and true'],
        [controls[2]!, 'is not null'],
      ],
      other.authUserId,
      (tx) => readPlan(ownerPlan, tx),
    );
    expect((mutant as { status: string }).status).toBe('ok');
    const installed = await p.db.begin((tx) =>
      asUser(tx, other.authUserId, (inner) => readPlan(ownerPlan, inner)),
    );
    expect(installed).toEqual({ status: 'not_found' });
    await stillInstalled(PLAN_SIGNATURE, controls);
  });

  it('K4 workspace wall: dropping the private-exercise workspace scoping would expose a foreign exercise name', async () => {
    const controls: [string, string][] = [
      [
        'or private_workspace_value::uuid <> client_row.workspace_id',
        'or false',
      ],
      [
        'where e.workspace_id = client_row.workspace_id and e.id = identity_value::uuid',
        'where e.id = identity_value::uuid',
      ],
      [
        'client_row.workspace_id, identity_value::uuid, true) r;',
        'private_workspace_value::uuid, identity_value::uuid, true) r;',
      ],
    ];
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      controls,
      owner.authUserId,
      (tx) => readPlan(foreignPlan, tx),
    );
    expect(JSON.stringify(mutant)).toContain('F17K foreign');
    const installed = await p.db.begin((tx) =>
      asUser(tx, owner.authUserId, (inner) => readPlan(foreignPlan, inner)),
    );
    expect(installed).toEqual({ status: 'not_found' });
    await stillInstalled(
      PLAN_SIGNATURE,
      controls.map(([control]) => control),
    );
  });

  it('K5 allowlist: returning raw revision content would leak non-schema keys', async () => {
    const control =
      'safe_document := app_private.f17_client_safe_workout_document(selected.content);';
    const mutant = await underMutant(
      PLAN_SIGNATURE,
      [[control, 'safe_document := selected.content;']],
      owner.authUserId,
      (tx) => readPlan(markerPlan, tx),
    );
    expect(JSON.stringify(mutant)).toContain(MARKER);
    const installed = await p.db.begin((tx) =>
      asUser(tx, owner.authUserId, (inner) => readPlan(markerPlan, inner)),
    );
    expect((installed as { status: string }).status).toBe('ok');
    expect(JSON.stringify(installed)).not.toContain(MARKER);
    await stillInstalled(PLAN_SIGNATURE, [control]);
  });
});

async function audit(
  userId: string,
  args: {
    workspaceId: string | null;
    planId: string | null;
    revisionId: string | null;
    format: string;
    outcome: string;
    reason?: string | null;
  },
  tx?: TransactionSql,
) {
  const run = (inner: TransactionSql) =>
    inner`select public.record_workout_export_audit(
      ${args.workspaceId}::uuid, ${args.planId}::uuid, ${args.revisionId}::uuid,
      ${args.format}, ${args.outcome}, ${args.reason ?? null})`;
  if (tx) return run(tx);
  return p.db.begin((inner) => asUser(inner, userId, run));
}

const success = (format: string) => ({
  workspaceId: null,
  planId: null,
  revisionId: null as string | null,
  format,
  outcome: 'success',
});

describe('F17 workout export audit recorder: client path', () => {
  it('records the plan own client success for pdf and excel only', async () => {
    for (const format of ['pdf', 'excel'])
      await audit(owner.authUserId, {
        ...success(format),
        planId: ownerPlan,
        revisionId: ownerRevision,
      });
    for (const format of ['ai_prompt'])
      await expect(
        audit(owner.authUserId, {
          ...success(format),
          planId: ownerPlan,
          revisionId: ownerRevision,
        }),
      ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses success for another client, a staff-of-another-workspace identity, Sales, anon and unknown identities', async () => {
    for (const userId of [
      other.authUserId,
      p.fixture.trainerB.userId,
      p.fixture.salesA.userId,
      randomUUID(),
    ])
      await expect(
        audit(userId, {
          ...success('pdf'),
          planId: ownerPlan,
          revisionId: ownerRevision,
        }),
        userId,
      ).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps staff success unchanged', async () => {
    await audit(p.fixture.trainerA.userId, {
      ...success('ai_prompt'),
      planId: ownerPlan,
      revisionId: ownerRevision,
    });
    await audit(p.fixture.po.userId, {
      ...success('excel'),
      planId: ownerPlan,
      revisionId: ownerRevision,
    });
  });

  it('stores a foreign client probe without any foreign workspace, plan or revision identity', async () => {
    await audit(other.authUserId, {
      workspaceId: p.fixture.wsA.id,
      planId: ownerPlan,
      revisionId: ownerRevision,
      format: 'pdf',
      outcome: 'denied',
      reason: 'not_found',
    });
    const rows = await p.db`select workspace_id, target_id, details
      from public.audit_events
      where actor_user_id=${other.authUserId} and action='plan.workout_export'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workspace_id).toBeNull();
    expect(rows[0]!.details).toEqual({
      format: 'pdf',
      outcome: 'denied',
      reason: 'not_found',
    });
    expect(JSON.stringify(rows)).not.toContain(ownerPlan);
    expect(JSON.stringify(rows)).not.toContain(ownerRevision);
  });

  it('K6 role mutation: removing the staff-or-own-client gate would record another client success; K7 client ai_prompt', async () => {
    const gate = 'if not v_staff and not (';
    const mutant = await underMutant(
      AUDIT_SIGNATURE,
      [[gate, 'if false and not (']],
      other.authUserId,
      async (tx) => {
        try {
          await audit(
            other.authUserId,
            {
              ...success('pdf'),
              planId: ownerPlan,
              revisionId: ownerRevision,
            },
            tx,
          );
          return 'recorded';
        } catch {
          return 'refused';
        }
      },
    );
    expect(mutant).toBe('recorded');
    const formatControl = "and p_format in ('pdf', 'excel')";
    const formatMutant = await underMutant(
      AUDIT_SIGNATURE,
      [[formatControl, 'and true']],
      owner.authUserId,
      async (tx) => {
        try {
          await audit(
            owner.authUserId,
            {
              ...success('ai_prompt'),
              planId: ownerPlan,
              revisionId: ownerRevision,
            },
            tx,
          );
          return 'recorded';
        } catch {
          return 'refused';
        }
      },
    );
    expect(formatMutant).toBe('recorded');
    await stillInstalled(AUDIT_SIGNATURE, [gate, formatControl]);
  });
});
