import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  asUser,
  workoutDocument,
  workoutFixture,
  type WorkoutClient,
  type WorkoutFixture,
} from './client-workout-fixture';

vi.mock('server-only', () => ({}));

import {
  exportClientWorkoutPlan,
  readClientWorkoutView,
} from '../../lib/workout-planner/client-export';

// F22 T024/T025/T027/T028 (FR-006, FR-008, FR-010, SC-005, SC-006, SC-009),
// workout scope, end to end through the real database wall and the real F17
// export audit recorder. Synthetic data only.
let p: WorkoutFixture;
let active: WorkoutClient;
let awaiting: WorkoutClient;
let other: WorkoutClient;
let plan: string;
let otherPlan: string;
let awaitingPlan: string;
let rev1Id: string;
let rev2Id: string;
let globalMain: string;

const CANONICAL = 'https://youtu.be/canonical123';
const FORMULA = '=HYPERLINK("http://evil.example","x")';

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

/**
 * A supabase-like client over a real signed `authenticated` database
 * identity. Each call commits in its own transaction, as PostgREST would.
 */
function sessionClient(userId: string): RpcClient {
  return {
    async rpc(name, args = {}) {
      try {
        const data = await p.db.begin((tx) =>
          asUser(tx, userId, async (inner) => {
            if (name === 'client_portal_workout_plan') {
              const [row] =
                await inner`select public.client_portal_workout_plan(${args.p_plan_id as string}::uuid, ${args.p_revision_number as number | null}::integer) as value`;
              return row!.value;
            }
            if (name === 'record_workout_export_audit') {
              await inner`select public.record_workout_export_audit(
                ${args.p_workspace_id as string | null}::uuid,
                ${args.p_plan_id as string | null}::uuid,
                ${args.p_revision_id as string | null}::uuid,
                ${args.p_format as string},
                ${args.p_outcome as string},
                ${args.p_reason as string | null})`;
              return null;
            }
            throw new Error(`unexpected rpc ${name}`);
          }),
        );
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
}

async function auditRows(userId: string) {
  return p.db`select workspace_id, target_id, details from public.audit_events
    where actor_user_id=${userId} and action='plan.workout_export'
    order by id`;
}

beforeAll(async () => {
  p = await workoutFixture();
  active = await p.makeClient({ activate: true });
  awaiting = await p.makeClient({ activate: false });
  other = await p.makeClient({ activate: true });
  globalMain = await p.createGlobal('F17X main exercise', CANONICAL);
  const content = (title: string, notes = 'Client-visible coach note') => {
    const document = workoutDocument(title, [
      { exercise: { source: 'global', identity_id: globalMain } },
    ]);
    document.days[0]!.items[0]!.notes = notes;
    return document;
  };
  plan = await p.createDraft(active.clientId, content('F17X v1'));
  await p.publish(plan, 1, 0);
  await p.revise(plan, 1, content('F17X v2', FORMULA));
  await p.publish(plan, 2, 1);
  rev1Id = await p.revisionId(plan, 1);
  rev2Id = await p.revisionId(plan, 2);
  otherPlan = await p.createDraft(other.clientId, content('F17X other'));
  await p.publish(otherPlan, 1, 0);
  awaitingPlan = await p.createDraft(awaiting.clientId, content('F17X wait'));
  await p.publish(awaitingPlan, 1, 0);
});
afterAll(async () => p?.close());

describe('client workout view and export through the real wall', () => {
  it('views the selected revision as the shared F17 payload with the live video and writes no audit event', async () => {
    const before = (await auditRows(active.authUserId)).length;
    const view = await readClientWorkoutView(sessionClient(active.authUserId), {
      planId: plan,
      revisionNumber: 1,
      locale: 'en',
    });
    expect(view.status).toBe('ok');
    if (view.status !== 'ok') return;
    expect(view.revisionNumber).toBe(1);
    expect(view.payload.planIdentity).toBe('1');
    expect(view.payload.days[0]!.items[0]!.videoUrl).toBe(CANONICAL);
    expect((await auditRows(active.authUserId)).length).toBe(before);
  });

  it('exports the selected revision (not the latest) as pdf payload and excel, auditing each success identity-only', async () => {
    const client = sessionClient(active.authUserId);
    const pdf = await exportClientWorkoutPlan(client, {
      planId: plan,
      revisionNumber: 1,
      format: 'pdf',
      locale: 'en',
    });
    if (pdf.status !== 'ok' || pdf.format !== 'pdf') throw new Error('pdf');
    expect(pdf.revisionNumber).toBe(1);
    expect(pdf.payload.planNotes ?? pdf.payload.documentNotes).toBe('F17X v1');
    const excel = await exportClientWorkoutPlan(client, {
      planId: plan,
      revisionNumber: 2,
      format: 'excel',
      locale: 'en',
    });
    if (excel.status !== 'ok' || excel.format !== 'excel')
      throw new Error('excel');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.body as never);
    const cells: string[] = [];
    workbook.worksheets[0]!.eachRow((row) =>
      row.eachCell((cell) => {
        expect(typeof cell.value === 'object' && cell.value !== null).toBe(
          false,
        );
        cells.push(String(cell.value ?? ''));
      }),
    );
    expect(cells).toContain('F17X v2');
    expect(cells).not.toContain('F17X v1');
    expect(cells).toContain(FORMULA);
    expect(cells).toContain(CANONICAL);

    const events = (await auditRows(active.authUserId)).filter(
      (row) => (row.details as { outcome: string }).outcome === 'success',
    );
    expect(events.map((row) => row.details)).toEqual([
      {
        plan_id: plan,
        revision_id: rev1Id,
        format: 'pdf',
        outcome: 'success',
      },
      {
        plan_id: plan,
        revision_id: rev2Id,
        format: 'excel',
        outcome: 'success',
      },
    ]);
    expect(events.every((row) => row.workspace_id === p.fixture.wsA.id)).toBe(
      true,
    );
    expect(JSON.stringify(events)).not.toContain('F17X');
    expect(JSON.stringify(events)).not.toContain(FORMULA);
  });

  it('denies a restricted client and audits the denial with the client own scope only', async () => {
    const result = await exportClientWorkoutPlan(
      sessionClient(awaiting.authUserId),
      {
        planId: awaitingPlan,
        revisionNumber: null,
        format: 'excel',
        locale: 'en',
      },
    );
    expect(result).toEqual({ status: 'denied' });
    const rows = await auditRows(awaiting.authUserId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({
      outcome: 'denied',
      reason: 'not_permitted',
      format: 'excel',
    });
    expect(rows[0]!.workspace_id).toBe(p.fixture.wsA.id);
  });

  it('denies another client plan and records no foreign workspace, plan or revision identity', async () => {
    const result = await exportClientWorkoutPlan(
      sessionClient(active.authUserId),
      { planId: otherPlan, revisionNumber: null, format: 'pdf', locale: 'en' },
    );
    expect(result).toEqual({ status: 'denied' });
    const denied = (await auditRows(active.authUserId)).filter(
      (row) => (row.details as { outcome: string }).outcome === 'denied',
    );
    const last = denied[denied.length - 1]!;
    expect(last.workspace_id).toBeNull();
    expect(last.details).toEqual({
      format: 'pdf',
      outcome: 'denied',
      reason: 'not_found',
    });
    expect(JSON.stringify(last)).not.toContain(otherPlan);
  });

  it('denies drafts, unknown plans and staff identities with no content', async () => {
    const draft = await p.createDraft(
      active.clientId,
      workoutDocument('F17X draft', []),
    );
    for (const [userId, planId] of [
      [active.authUserId, draft],
      [active.authUserId, '00000000-0000-4000-8000-0000000000ff'],
      [p.fixture.trainerA.userId, plan],
      [p.fixture.po.userId, plan],
      [p.fixture.trainerB.userId, plan],
    ] as const)
      expect(
        await exportClientWorkoutPlan(sessionClient(userId), {
          planId,
          revisionNumber: null,
          format: 'excel',
          locale: 'en',
        }),
        `${userId} ${planId}`,
      ).toEqual({ status: 'denied' });
  });
});
