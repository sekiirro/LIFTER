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
