import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransactionSql } from 'postgres';
import { clientContext, probe } from './registration-approval-fixture';
import {
  asUser,
  portalFixture,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T035: the directory assignment filter and assignment state sit behind the F11
// wall of public.unassigned_clients (Platform Owner, or the Workspace Owner of the
// workspace) and never widen the coaching_work directory wall. Synthetic data only.
type Row = { client_id: string; assignment?: string | null };
type Result = { status: string; clients?: Row[] };

let p: PortalFixture;
let assignedId: string;
let unassignedId: string;
let pendingId: string;
let directoryUsername: string;

async function directory(
  actor: { client: SupabaseClient },
  assignment: unknown,
  workspaceId?: string,
): Promise<Result> {
  const result = await actor.client.rpc('staff_client_directory', {
    p_workspace_id: workspaceId ?? p.fixture.wsA.id,
    p_search: p.run,
    p_approval_state: null,
    p_subscription_status: null,
    p_limit: 100,
    p_offset: 0,
    ...(assignment === undefined ? {} : { p_assignment: assignment }),
  });
  expect(result.error).toBeNull();
  return result.data as Result;
}
const ids = (r: Result) => (r.clients ?? []).map((c) => c.client_id).sort();

beforeAll(async () => {
  p = await portalFixture();
  const assigned = await p.makeClient({
    activate: true,
    label: 'asg assigned',
  });
  const unassigned = await p.makeClient({ activate: true, label: 'asg free' });
  const pending = await p.makeClient({ activate: false, label: 'asg pending' });
  assignedId = assigned.clientId;
  unassignedId = unassigned.clientId;
  pendingId = pending.clientId;
  directoryUsername = `f22.${assignedId.replaceAll('-', '').slice(0, 8)}`;
  const done = await p.fixture.po.client.rpc(
    'assign_client_responsible_trainer',
    {
      p_workspace_id: p.fixture.wsA.id,
      p_client_id: assignedId,
      p_trainer_user_id: p.fixture.trainerA.userId,
    },
  );
  expect(done.data).toMatchObject({ status: 'ok' });
  await p.db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    const username = await tx`
      update public.clients set username_normalized=${directoryUsername}
      where id=${assignedId} returning id
    `;
    expect(username).toHaveLength(1);
    await tx`update public.clients set approval_state='pending-approval' where id=${pendingId}`;
  });
});
afterAll(async () => p?.close());

describe('F22 directory assignment filter (T035)', () => {
  it('lets the Workspace Owner and Platform Owner filter and see assignment, matching F11 unassigned_clients', async () => {
    for (const actor of [p.fixture.woA, p.fixture.po]) {
      const free = await directory(actor, 'unassigned');
      expect(free.status).toBe('ok');
      // Approved and without a current responsible Trainer; the pending client is excluded.
      expect(ids(free)).toEqual([unassignedId]);
      expect(free.clients![0]!.assignment).toBe('unassigned');
      expect(ids(await directory(actor, 'assigned'))).toEqual([assignedId]);
      const all = await directory(actor, null);
      expect(ids(all)).toEqual([assignedId, pendingId, unassignedId].sort());
      const state = Object.fromEntries(
        all.clients!.map((c) => [c.client_id, c.assignment]),
      );
      expect(state).toEqual({
        [assignedId]: 'assigned',
        [unassignedId]: 'unassigned',
        [pendingId]: null,
      });
    }
    // The same definition as the F11 read.
    const f11 = await p.fixture.woA.client.rpc('unassigned_clients', {
      p_workspace_id: p.fixture.wsA.id,
    });
    const f11Ids = (f11.data as { client_ids: string[] }).client_ids;
    expect(f11Ids).toContain(unassignedId);
    expect(f11Ids).not.toContain(pendingId);
    expect(f11Ids).not.toContain(assignedId);
  });

  it('rejects an unknown assignment value for an owner', async () => {
    expect(await directory(p.fixture.woA, 'mine')).toEqual({
      status: 'invalid_input',
    });
  });

  it('ignores the filter and hides assignment state for a Trainer (no widened permission)', async () => {
    for (const value of ['unassigned', 'assigned', 'bogus', undefined]) {
      const result = await directory(p.fixture.trainerA, value);
      expect(result.status).toBe('ok');
      expect(ids(result), String(value)).toEqual(
        [assignedId, pendingId, unassignedId].sort(),
      );
      for (const row of result.clients!)
        expect('assignment' in row, String(value)).toBe(false);
    }
  });

  it('keeps the existing walls: foreign workspace owners, foreign trainers and Sales get nothing', async () => {
    const foreign = await clientContext();
    for (const actor of [
      foreign.woA,
      foreign.trainerA,
      p.fixture.trainerB,
      p.fixture.salesA,
    ]) {
      const result = await actor.client.rpc('staff_client_directory', {
        p_workspace_id: p.fixture.wsA.id,
        p_search: null,
        p_approval_state: null,
        p_subscription_status: null,
        p_limit: 10,
        p_offset: 0,
        p_assignment: 'unassigned',
      });
      expect(result.error?.code).toBe('42501');
      expect(result.data).toBeNull();
    }
    // The foreign owner's own workspace never lists these clients.
    const own = await foreign.woA.client.rpc('staff_client_directory', {
      p_workspace_id: foreign.wsA.id,
      p_search: p.run,
      p_approval_state: null,
      p_subscription_status: null,
      p_limit: 10,
      p_offset: 0,
      p_assignment: 'assigned',
    });
    expect((own.data as Result).clients).toEqual([]);
  });

  it('mutation kills: widening the owner predicate or dropping the approved test is observable', async () => {
    const signature =
      'public.staff_client_directory(uuid,text,text,text,integer,integer,text)';
    const under = async (
      from: string,
      to: string,
      userId: string,
      assignment: string,
    ): Promise<Result> => {
      let observed: Result = { status: 'not-reached' };
      const rollback = new Error('rollback');
      try {
        await p.db.begin(async (tx: TransactionSql) => {
          const [d] =
            await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
          const def = d!.def as string;
          expect(def.split(from).length - 1, from).toBe(1);
          await tx.unsafe(def.replace(from, to));
          await asUser(tx, userId, async (inner) => {
            const [row] = await inner`select public.staff_client_directory(
              ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0, ${assignment}) as v`;
            observed = row!.v as Result;
          });
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
      return observed;
    };
    // K-T35-1: any workspace member passes the predicate, so a Trainer filters and sees assignment.
    const widened = await under(
      "and p.role = 'workspace_owner'",
      'and p.role is not null',
      p.fixture.trainerA.userId,
      'unassigned',
    );
    expect(ids(widened)).toEqual([unassignedId]);
    expect(widened.clients![0]!.assignment).toBe('unassigned');
    // K-T35-2: without the approved test a pending client counts as unassigned.
    const loose = await under(
      "case when can_assign and c.approval_state = 'approved' then",
      'case when can_assign then',
      p.fixture.woA.userId,
      'unassigned',
    );
    expect(ids(loose)).toContain(pendingId);
  });
});

// T034 (#264 client code) and T036 (F23 open food replacements), same staff wall.
async function codeOf(clientId: string): Promise<string> {
  const [row] =
    await p.db`select app_private.format_client_code(client_code) as code
      from public.clients where id=${clientId}`;
  return row!.code as string;
}
async function search(
  actor: { client: SupabaseClient },
  term: string,
  workspaceId?: string,
): Promise<Result & { clients?: Array<Row & { client_code?: string }> }> {
  const result = await actor.client.rpc('staff_client_directory', {
    p_workspace_id: workspaceId ?? p.fixture.wsA.id,
    p_search: term,
    p_approval_state: null,
    p_subscription_status: null,
    p_limit: 100,
    p_offset: 0,
  });
  expect(result.error).toBeNull();
  return result.data as Result;
}

describe('F22 directory client-code search (T034)', () => {
  it('lets the owner wall find a client by its exact code in any accepted spelling, and shows the code', async () => {
    const code = await codeOf(assignedId);
    for (const actor of [p.fixture.woA, p.fixture.po])
      for (const term of [
        code,
        code.toLowerCase(),
        code.replace('-', ''),
        ` ${code} `,
      ]) {
        const found = await search(actor, term);
        expect(ids(found), term).toEqual([assignedId]);
        expect(
          (found.clients as Array<{ client_code?: string }>)[0]!.client_code,
        ).toBe(code);
      }
    for (const actor of [p.fixture.woA, p.fixture.po]) {
      const found = await search(actor, directoryUsername.toUpperCase());
      expect(ids(found)).toEqual([assignedId]);
      expect(found.clients![0]!.client_code).toBe(code);
    }
  });

  it('never matches a prefix, a fragment, a wrong code or another workspace code', async () => {
    const code = await codeOf(assignedId);
    for (const term of [
      code.slice(0, 4),
      code.slice(5),
      code.slice(0, 8),
      'ZZZZ-ZZZZ',
      '0000-0000',
    ])
      expect(ids(await search(p.fixture.woA, term)), term).not.toContain(
        assignedId,
      );
    // A code of workspace A searched by a foreign owner in its own workspace finds nothing.
    const foreign = await clientContext();
    expect(ids(await search(foreign.woA, code, foreign.wsA.id))).toEqual([]);
    const denied = await foreign.woA.client.rpc('staff_client_directory', {
      p_workspace_id: p.fixture.wsA.id,
      p_search: code,
      p_approval_state: null,
      p_subscription_status: null,
      p_limit: 10,
      p_offset: 0,
    });
    expect(denied.error?.code).toBe('42501');
  });

  it('gives a Trainer no code match and no code on rows (name, email and phone search remain)', async () => {
    const code = await codeOf(assignedId);
    const found = await search(p.fixture.trainerA, code);
    expect(ids(found)).toEqual([]);
    const named = await search(p.fixture.trainerA, p.run);
    expect(ids(named).length).toBeGreaterThan(0);
    for (const row of named.clients!) expect('client_code' in row).toBe(false);
    const byUsername = await search(
      p.fixture.trainerA,
      directoryUsername.toUpperCase(),
    );
    expect(ids(byUsername)).toEqual([assignedId]);
    for (const row of byUsername.clients!)
      expect('client_code' in row).toBe(false);
  });

  it('mutation kill: opening the code wall to every caller lets a Trainer enumerate by code', async () => {
    const code = await codeOf(assignedId);
    const signature =
      'public.staff_client_directory(uuid,text,text,text,integer,integer,text)';
    const from = 'code_needle := case when can_assign then';
    let observed: Result = { status: 'not-reached' };
    const rollback = new Error('rollback');
    try {
      await p.db.begin(async (tx: TransactionSql) => {
        const [d] =
          await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
        const def = d!.def as string;
        expect(def.split(from).length - 1).toBe(1);
        await tx.unsafe(
          def.replace(from, 'code_needle := case when true then'),
        );
        await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
          const [row] = await inner`select public.staff_client_directory(
            ${p.fixture.wsA.id}::uuid, ${code}, null, null, 100, 0) as v`;
          observed = row!.v as Result;
        });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(ids(observed)).toEqual([assignedId]);
  });
});

describe('F22 directory pending food replacements (T036)', () => {
  it('counts only open requests of that client in that workspace', async () => {
    const plan = await p.createDraft(assignedId, 'nutrition', 'T036 plan');
    await p.publish(plan, 1, 0);
    const [rev] =
      await p.db`select id from public.plan_revisions where plan_id=${plan} and revision_number=1`;
    await probe(async (tx: TransactionSql) => {
      await tx`set local session_replication_role = replica`;
      const insert = (status: string, item: string) =>
        tx`insert into public.food_replacement_requests(workspace_id, client_id, plan_id, plan_version_id,
            item_id, request_text, status, requested_by, resolved_at)
          values(${p.fixture.wsA.id}, ${assignedId}, ${plan}, ${rev!.id}, ${item}, 'synthetic request', ${status},
            ${p.fixture.trainerA.userId}, ${status === 'open' ? null : new Date().toISOString()})`;
      await insert('open', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
      await insert('open', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
      await insert('rejected', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');
      await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const byId = Object.fromEntries(
          rows.map((r) => [r.client_id, r.pending_food_replacements]),
        );
        expect(byId[assignedId]).toBe(2);
        expect(byId[unassignedId]).toBe(0);
      });
    });
    // Nothing leaked out of the rolled-back probe.
    const after = await search(p.fixture.trainerA, p.run);
    expect(
      (after.clients as Array<Record<string, unknown>>).every(
        (r) => r.pending_food_replacements === 0,
      ),
    ).toBe(true);
  });
});

describe('F22 directory new check-ins (T036)', () => {
  it('counts check-in submissions in last 7 days only, excludes 8-day-old, non-check-in forms and other workspaces, and gives Trainer count without code/assignment', async () => {
    await probe(async (tx: TransactionSql) => {
      await tx`set local session_replication_role = replica`;

      const checkinPolicyId = '11111111-2222-4333-8444-555555555551';
      const checkinFormId = '11111111-2222-4333-8444-555555555552';
      await tx`insert into app_private.form_assignment_policies(
        id, workspace_id, form_id, version_number, audience_kind, specific_client_ids,
        trigger_kind, timing, stop_conditions, configured_by
      ) values (
        ${checkinPolicyId}, ${p.fixture.wsA.id}, ${checkinFormId}, 1, 'all_active_clients', '{}',
        'weekly_checkin', '{"client_deadline_days":3}'::jsonb, '{}'::jsonb, ${p.fixture.trainerA.userId}
      )`;

      const onboardingPolicyId = '11111111-2222-4333-8444-555555555553';
      const onboardingFormId = '11111111-2222-4333-8444-555555555554';
      await tx`insert into app_private.form_assignment_policies(
        id, workspace_id, form_id, version_number, audience_kind, specific_client_ids,
        trigger_kind, timing, stop_conditions, configured_by
      ) values (
        ${onboardingPolicyId}, ${p.fixture.wsA.id}, ${onboardingFormId}, 1, 'all_active_clients', '{}',
        'onboarding', '{"client_deadline_days":3}'::jsonb, '{}'::jsonb, ${p.fixture.trainerA.userId}
      )`;

      const foreignPolicyId = '11111111-2222-4333-8444-555555555555';
      const foreignFormId = '11111111-2222-4333-8444-555555555556';
      await tx`insert into app_private.form_assignment_policies(
        id, workspace_id, form_id, version_number, audience_kind, specific_client_ids,
        trigger_kind, timing, stop_conditions, configured_by
      ) values (
        ${foreignPolicyId}, ${p.fixture.wsB.id}, ${foreignFormId}, 1, 'all_active_clients', '{}',
        'weekly_checkin', '{"client_deadline_days":3}'::jsonb, '{}'::jsonb, ${p.fixture.trainerB.userId}
      )`;

      const addSubmission = async (
        id: string,
        workspaceId: string,
        clientId: string,
        policyId: string,
        formId: string,
        submittedAt: Date,
      ) => {
        await tx`insert into public.form_assignments(
          id, workspace_id, client_id, form_id, version_number, terms_policy_version,
          policy_kind, version_snapshot, policy_id, client_deadline_at, configured_by, occurrence_key
        ) values (
          ${id}, ${workspaceId}, ${clientId}, ${formId}, 1, 'terms-v1',
          'terms', '{}'::jsonb, ${policyId}, now() + interval '3 days', ${p.fixture.trainerA.userId}, ${'weekly_checkin:' + id}
        )`;
        await tx`insert into public.form_answer_revisions(
          workspace_id, assignment_id, revision, answer_values
        ) values (
          ${workspaceId}, ${id}, 1, '{"dietAdherence":8,"workoutAdherence":9}'::jsonb
        )`;
        await tx`insert into app_private.form_submissions(
          workspace_id, assignment_id, revision, submitted_at
        ) values (
          ${workspaceId}, ${id}, 1, ${submittedAt.toISOString()}::timestamptz
        )`;
      };

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      await addSubmission(
        '22222222-1111-4000-8000-000000000001',
        p.fixture.wsA.id,
        assignedId,
        checkinPolicyId,
        checkinFormId,
        new Date(now - 2 * dayMs),
      );
      await addSubmission(
        '22222222-1111-4000-8000-000000000002',
        p.fixture.wsA.id,
        assignedId,
        checkinPolicyId,
        checkinFormId,
        new Date(now - 5 * dayMs),
      );
      await addSubmission(
        '22222222-1111-4000-8000-000000000003',
        p.fixture.wsA.id,
        assignedId,
        checkinPolicyId,
        checkinFormId,
        new Date(now - 8 * dayMs),
      );
      await addSubmission(
        '22222222-1111-4000-8000-000000000004',
        p.fixture.wsA.id,
        assignedId,
        onboardingPolicyId,
        onboardingFormId,
        new Date(now - 1 * dayMs),
      );

      await addSubmission(
        '22222222-1111-4000-8000-000000000005',
        p.fixture.wsA.id,
        unassignedId,
        checkinPolicyId,
        checkinFormId,
        new Date(now - 1 * dayMs),
      );

      await addSubmission(
        '22222222-1111-4000-8000-000000000006',
        p.fixture.wsB.id,
        assignedId,
        foreignPolicyId,
        foreignFormId,
        new Date(now - 1 * dayMs),
      );

      await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const byId = Object.fromEntries(
          rows.map((r) => [r.client_id, r.new_check_ins]),
        );
        expect(byId[assignedId]).toBe(2);
        expect(byId[unassignedId]).toBe(1);
        expect(byId[pendingId]).toBe(0);

        const trainerAssignedRow = rows.find(
          (r) => r.client_id === assignedId,
        )!;
        expect('new_check_ins' in trainerAssignedRow).toBe(true);
        expect('assignment' in trainerAssignedRow).toBe(false);
        expect('client_code' in trainerAssignedRow).toBe(false);
      });

      await asUser(tx, p.fixture.woA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const woAssignedRow = rows.find((r) => r.client_id === assignedId)!;
        expect(woAssignedRow.new_check_ins).toBe(2);
        expect(woAssignedRow.assignment).toBe('assigned');
        expect(woAssignedRow.client_code).toBeTruthy();
      });
    });
  });

  it('mutation kill: dropping the 7-day predicate counts 8-day-old submissions and fails', async () => {
    const signature =
      'public.staff_client_directory(uuid,text,text,text,integer,integer,text)';
    const from = "and s.submitted_at >= now() - interval '7 days'";
    await probe(async (tx: TransactionSql) => {
      await tx`set local session_replication_role = replica`;
      const checkinPolicyId = '11111111-2222-4333-8444-555555555561';
      const checkinFormId = '11111111-2222-4333-8444-555555555562';
      await tx`insert into app_private.form_assignment_policies(
        id, workspace_id, form_id, version_number, audience_kind, specific_client_ids,
        trigger_kind, timing, stop_conditions, configured_by
      ) values (
        ${checkinPolicyId}, ${p.fixture.wsA.id}, ${checkinFormId}, 1, 'all_active_clients', '{}',
        'weekly_checkin', '{"client_deadline_days":3}'::jsonb, '{}'::jsonb, ${p.fixture.trainerA.userId}
      )`;
      const assignId = '22222222-1111-4000-8000-000000000010';
      await tx`insert into public.form_assignments(
        id, workspace_id, client_id, form_id, version_number, terms_policy_version,
        policy_kind, version_snapshot, policy_id, client_deadline_at, configured_by
      ) values (
        ${assignId}, ${p.fixture.wsA.id}, ${assignedId}, ${checkinFormId}, 1, 'terms-v1',
        'terms', '{}'::jsonb, ${checkinPolicyId}, now() + interval '3 days', ${p.fixture.trainerA.userId}
      )`;
      await tx`insert into public.form_answer_revisions(
        workspace_id, assignment_id, revision, answer_values
      ) values (
        ${p.fixture.wsA.id}, ${assignId}, 1, '{"dietAdherence":8,"workoutAdherence":9}'::jsonb
      )`;
      await tx`insert into app_private.form_submissions(
        workspace_id, assignment_id, revision, submitted_at
      ) values (
        ${p.fixture.wsA.id}, ${assignId}, 1, (now() - interval '8 days')
      )`;

      await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const byId = Object.fromEntries(
          rows.map((r) => [r.client_id, r.new_check_ins]),
        );
        expect(byId[assignedId]).toBe(0);
      });

      const [d] =
        await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
      const def = d!.def as string;
      expect(def.split(from).length - 1).toBe(1);
      await tx.unsafe(def.replace(from, ''));

      await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const byId = Object.fromEntries(
          rows.map((r) => [r.client_id, r.new_check_ins]),
        );
        expect(byId[assignedId]).toBe(1);
      });
    });
  });

  it('mutation kill: dropping the workspace predicate leaks foreign submissions and fails isolation', async () => {
    const signature =
      'public.staff_client_directory(uuid,text,text,text,integer,integer,text)';
    const from = 'where s.workspace_id = c.workspace_id';
    await probe(async (tx: TransactionSql) => {
      await tx`set local session_replication_role = replica`;
      const foreignPolicyId = '11111111-2222-4333-8444-555555555571';
      const foreignFormId = '11111111-2222-4333-8444-555555555572';
      await tx`insert into app_private.form_assignment_policies(
        id, workspace_id, form_id, version_number, audience_kind, specific_client_ids,
        trigger_kind, timing, stop_conditions, configured_by
      ) values (
        ${foreignPolicyId}, ${p.fixture.wsB.id}, ${foreignFormId}, 1, 'all_active_clients', '{}',
        'weekly_checkin', '{"client_deadline_days":3}'::jsonb, '{}'::jsonb, ${p.fixture.trainerB.userId}
      )`;
      const assignId = '22222222-1111-4000-8000-000000000020';
      await tx`insert into public.form_assignments(
        id, workspace_id, client_id, form_id, version_number, terms_policy_version,
        policy_kind, version_snapshot, policy_id, client_deadline_at, configured_by
      ) values (
        ${assignId}, ${p.fixture.wsB.id}, ${assignedId}, ${foreignFormId}, 1, 'terms-v1',
        'terms', '{}'::jsonb, ${foreignPolicyId}, now() + interval '3 days', ${p.fixture.trainerB.userId}
      )`;
      await tx`insert into public.form_answer_revisions(
        workspace_id, assignment_id, revision, answer_values
      ) values (
        ${p.fixture.wsB.id}, ${assignId}, 1, '{"dietAdherence":8,"workoutAdherence":9}'::jsonb
      )`;
      await tx`insert into app_private.form_submissions(
        workspace_id, assignment_id, revision, submitted_at
      ) values (
        ${p.fixture.wsB.id}, ${assignId}, 1, (now() - interval '1 day')
      )`;

      await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const byId = Object.fromEntries(
          rows.map((r) => [r.client_id, r.new_check_ins]),
        );
        expect(byId[assignedId]).toBe(0);
      });

      const [d] =
        await tx`select pg_get_functiondef(${signature}::regprocedure) as def`;
      const def = d!.def as string;
      expect(def.split(from).length - 1).toBe(1);
      await tx.unsafe(def.replace(from, 'where true'));

      await asUser(tx, p.fixture.trainerA.userId, async (inner) => {
        const [row] = await inner`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as v`;
        const rows = (row!.v as { clients: Array<Record<string, unknown>> })
          .clients;
        const byId = Object.fromEntries(
          rows.map((r) => [r.client_id, r.new_check_ins]),
        );
        expect(byId[assignedId]).toBe(1);
      });
    });
  });
});
