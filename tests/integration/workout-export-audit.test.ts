import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  actor: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../lib/auth/actor', () => ({
  loadActorRows: mocks.actor,
}));

import { GET as printGET } from '../../app/api/workouts/print/route';

let fixture: ClientNotesFixture;
const db = () => fixture.db;

let publishedRevisionId: string;
let publishedPlanId: string;
let draftPlanId: string;

// Coach-authored content that must NEVER leak into an audit event.
const SECRET_NOTE = 'AUDIT-PII-SENTINEL-do-not-log-notes-or-content';

beforeAll(async () => {
  fixture = await clientNotesFixture();

  const created = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: {
        schema_version: 1,
        notes: SECRET_NOTE,
        days: [
          { id: randomUUID(), kind: 'session', title: 'Audit Day', items: [] },
        ],
      },
      p_operation_key: randomUUID(),
    },
  );
  expect(created.error).toBeNull();
  publishedPlanId = String(created.data);

  const [root] = await db()`
    select created_by from public.plan_roots
    where workspace_id = ${fixture.workspaceId} and id = ${publishedPlanId}
  `;
  publishedRevisionId = randomUUID();
  await db()`
    insert into public.plan_revisions (
      id, workspace_id, plan_id, revision_number, source_draft_version,
      plan_kind, content, authored_by
    )
    select ${publishedRevisionId}, d.workspace_id, d.plan_id, 1, d.draft_version,
           'workout', d.content, ${root!.created_by}
    from public.plan_drafts d
    where d.workspace_id = ${fixture.workspaceId} and d.plan_id = ${publishedPlanId}
  `;

  const draftOnly = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: { schema_version: 1, notes: SECRET_NOTE, days: [] },
      p_operation_key: randomUUID(),
    },
  );
  expect(draftOnly.error).toBeNull();
  draftPlanId = String(draftOnly.data);
});

afterAll(async () => {
  await fixture?.close();
});

/** Call the SECURITY DEFINER audit recorder directly as a chosen actor. */
async function callAuditAs(
  userId: string,
  args: {
    workspaceId: string | null;
    planId: string;
    revisionId: string | null;
    format?: string;
    outcome?: string;
    reason?: string | null;
  },
): Promise<string | null> {
  return db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
    await tx`create or replace function pg_temp.try_workout_export_audit(
      p_workspace_id uuid, p_plan_id uuid, p_revision_id uuid,
      p_format text, p_outcome text, p_reason text
    ) returns text language plpgsql as $fn$
    begin
      perform public.record_workout_export_audit(
        p_workspace_id, p_plan_id, p_revision_id, p_format, p_outcome, p_reason
      );
      return null;
    exception when others then
      return sqlstate;
    end;
    $fn$`;
    const [result] = await tx`
      select pg_temp.try_workout_export_audit(
        ${args.workspaceId}::uuid,
        ${args.planId}::uuid,
        ${args.revisionId}::uuid,
        ${args.format ?? 'pdf'},
        ${args.outcome ?? 'success'},
        ${args.reason ?? null}
      ) as error_code
    `;
    return result!.error_code;
  });
}

describe('F17 T039 workout export audit (FR-017; SC-008)', () => {
  it('records one identity-only success event on an authorized export (no content/PII)', async () => {
    mocks.createSessionClient.mockResolvedValue(
      fixture.context.trainerA.client,
    );
    mocks.actor.mockResolvedValue({
      userId: fixture.context.trainerA.userId,
      role: 'trainer',
      activeWorkspaceIds: [fixture.workspaceId],
    });

    const res = await printGET(
      new Request(
        `http://localhost/api/workouts/print?revision=${publishedRevisionId}&locale=en`,
      ),
    );
    expect(res.status).toBe(200);

    const rows = await db()`
      select actor_user_id, action, target_table, target_id, workspace_id, details
      from public.audit_events
      where action = 'plan.workout_export'
        and target_id = ${publishedRevisionId}
        and details->>'outcome' = 'success'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: fixture.context.trainerA.userId,
      action: 'plan.workout_export',
      target_table: 'plan_revisions',
      target_id: publishedRevisionId,
      workspace_id: fixture.workspaceId,
      details: {
        plan_id: publishedPlanId,
        revision_id: publishedRevisionId,
        format: 'pdf',
        outcome: 'success',
      },
    });
    expect(Object.keys(rows[0]!.details as object).sort()).toEqual(
      ['format', 'outcome', 'plan_id', 'revision_id'].sort(),
    );
    expect(JSON.stringify(rows[0]!.details)).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(rows[0]!.details)).not.toContain('Audit Day');
  });

  it('records a denial event for a foreign-workspace actor with no content/PII', async () => {
    mocks.createSessionClient.mockResolvedValue(
      fixture.context.trainerB.client,
    );
    mocks.actor.mockResolvedValue({
      userId: fixture.context.trainerB.userId,
      role: 'trainer',
      activeWorkspaceIds: [fixture.context.wsB.id],
    });

    const res = await printGET(
      new Request(
        `http://localhost/api/workouts/print?revision=${publishedRevisionId}&locale=en`,
      ),
    );
    expect(res.status).toBe(404);

    const rows = await db()`
      select actor_user_id, details
      from public.audit_events
      where action = 'plan.workout_export'
        and actor_user_id = ${fixture.context.trainerB.userId}
        and target_id = ${publishedRevisionId}
        and details->>'outcome' = 'denied'
    `;
    expect(rows).toHaveLength(1);
    // RLS hides the foreign revision, so it is indistinguishable from
    // not-found — the denial reason is deliberately generic.
    expect(rows[0]!.details).toMatchObject({
      format: 'pdf',
      outcome: 'denied',
      reason: 'not_found',
    });
    const serialized = JSON.stringify(rows[0]!.details);
    expect(serialized).not.toContain(SECRET_NOTE);
    expect(serialized).not.toContain('Audit Day');
  });

  it('records a denial event for an unpublished draft id', async () => {
    const [draft] = await db()`
      select plan_id from public.plan_drafts
      where workspace_id = ${fixture.workspaceId} and plan_id = ${draftPlanId}
    `;
    expect(draft?.plan_id).toBe(draftPlanId);

    mocks.createSessionClient.mockResolvedValue(
      fixture.context.trainerA.client,
    );
    mocks.actor.mockResolvedValue({
      userId: fixture.context.trainerA.userId,
      role: 'trainer',
      activeWorkspaceIds: [fixture.workspaceId],
    });

    const res = await printGET(
      new Request(
        `http://localhost/api/workouts/print?revision=${draftPlanId}&locale=en`,
      ),
    );
    expect(res.status).toBe(404);

    const rows = await db()`
      select actor_user_id, details
      from public.audit_events
      where action = 'plan.workout_export'
        and target_id = ${draftPlanId}
        and details->>'outcome' = 'denied'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({
      format: 'pdf',
      outcome: 'denied',
      reason: 'not_found',
    });
    expect(JSON.stringify(rows[0]!.details)).not.toContain(SECRET_NOTE);
  });

  it('rejects an audit row that carries content/PII (allowlist guard)', async () => {
    const sql = db();
    let error = '';
    try {
      await sql`
        insert into public.audit_events
          (actor_user_id, action, target_table, target_id, workspace_id, details)
        values (
          ${fixture.context.trainerA.userId}, 'plan.workout_export', 'plan_revisions',
          ${publishedRevisionId}, ${fixture.workspaceId},
          ${sql.json({
            plan_id: publishedPlanId,
            revision_id: publishedRevisionId,
            format: 'pdf',
            outcome: 'success',
            notes: SECRET_NOTE,
          })}
        )
      `;
    } catch (caught) {
      error = String((caught as Error).message);
    }
    expect(error).toContain('workout_audit_field_not_allowlisted');
  });

  it('rejects an unauthorized success audit attempt without writing a row', async () => {
    const error = await callAuditAs(fixture.context.trainerB.userId, {
      workspaceId: fixture.workspaceId,
      planId: publishedPlanId,
      revisionId: publishedRevisionId,
      format: 'pdf',
      outcome: 'success',
    });
    expect(error).toBe('42501');
    const rows = await db()`
      select 1 from public.audit_events
      where action = 'plan.workout_export'
        and actor_user_id = ${fixture.context.trainerB.userId}
        and target_id = ${publishedRevisionId}
        and details->>'outcome' = 'success'
    `;
    expect(rows).toHaveLength(0);
  });

  it('rejects invalid format, outcome and denial-reason codes', async () => {
    expect(
      await callAuditAs(fixture.context.trainerA.userId, {
        workspaceId: fixture.workspaceId,
        planId: publishedPlanId,
        revisionId: publishedRevisionId,
        format: 'csv',
        outcome: 'success',
      }),
    ).toBe('42501');
    expect(
      await callAuditAs(fixture.context.trainerA.userId, {
        workspaceId: fixture.workspaceId,
        planId: publishedPlanId,
        revisionId: publishedRevisionId,
        format: 'pdf',
        outcome: 'maybe',
      }),
    ).toBe('42501');
    expect(
      await callAuditAs(fixture.context.trainerA.userId, {
        workspaceId: fixture.workspaceId,
        planId: publishedPlanId,
        revisionId: publishedRevisionId,
        format: 'pdf',
        outcome: 'denied',
        reason: SECRET_NOTE,
      }),
    ).toBe('42501');
  });
});
