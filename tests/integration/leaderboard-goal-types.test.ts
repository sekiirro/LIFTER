import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, sql } from './harness';
import {
  leaderboardClient,
  leaderboardContext,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';

// PO 2026-11-14 (FR-018): trainer-set goal type per client. Coaching staff
// (trainer, workspace owner, PO) may set and read it; Sales, foreign-workspace
// staff, revoked staff, clients and anonymous callers may not.
// Synthetic data only.
let f: LeaderboardContext;
let client: LeaderboardClient;
let foreignClient: LeaderboardClient;
const db = sql();

const set = (
  caller: { rpc: LeaderboardClient['client']['rpc'] },
  goalType: string,
  workspaceId = f.wsA.id,
  clientId = client.clientId,
) =>
  caller.rpc('set_client_goal_type', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_goal_type: goalType,
  });
const read = (
  caller: { rpc: LeaderboardClient['client']['rpc'] },
  workspaceId = f.wsA.id,
  clientId = client.clientId,
) =>
  caller.rpc('client_goal_read', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
  });

beforeAll(async () => {
  f = await leaderboardContext();
  client = await leaderboardClient(f, { goalType: null });
  foreignClient = await leaderboardClient(f, { workspace: 'B' });
});
afterAll(() => db.end());

describe('set and read', () => {
  it('starts unset, then a trainer sets it; a replay is unchanged', async () => {
    expect((await read(f.trainerA.client)).data).toEqual({
      status: 'ok',
      goal_type: null,
      reference_assignment_id: null,
    });
    expect((await set(f.trainerA.client, 'fat_loss')).data).toEqual({
      status: 'updated',
    });
    expect((await set(f.trainerA.client, 'fat_loss')).data).toEqual({
      status: 'unchanged',
    });
    expect((await read(f.trainerA.client)).data).toMatchObject({
      status: 'ok',
      goal_type: 'fat_loss',
    });
    const [row] = await db`
      select goal_type, updated_by from public.client_goal_types
      where workspace_id=${f.wsA.id} and client_id=${client.clientId}`;
    expect(row).toEqual({
      goal_type: 'fat_loss',
      updated_by: f.trainerA.userId,
    });
  });

  it('lets the workspace owner and the PO update it', async () => {
    expect((await set(f.woA.client, 'muscle_gain')).data).toEqual({
      status: 'updated',
    });
    expect((await set(f.po.client, 'maintenance')).data).toEqual({
      status: 'updated',
    });
    expect((await read(f.woA.client)).data).toMatchObject({
      goal_type: 'maintenance',
    });
  });

  it('audits every change with actor and time but without the value', async () => {
    const audits = await db`
      select actor_user_id, target_id, details, occurred_at from public.audit_events
      where workspace_id=${f.wsA.id} and action='client.goal_type_changed'
        and target_id=${client.clientId}
      order by id`;
    expect(audits.map((audit) => audit.actor_user_id)).toEqual([
      f.trainerA.userId,
      f.woA.userId,
      f.po.userId,
    ]);
    for (const audit of audits) {
      expect(audit.details).toEqual({});
      expect(audit.occurred_at).toBeTruthy();
    }
  });

  it('rejects unknown goal types and missing clients', async () => {
    for (const goal of ['bulk', '', 'FAT_LOSS'])
      expect((await set(f.trainerA.client, goal)).data).toEqual({
        status: 'invalid_input',
      });
    expect(
      (await set(f.trainerA.client, 'fat_loss', f.wsA.id, randomUUID())).data,
    ).toEqual({ status: 'not_found' });
  });
});

describe('denials (Sales, foreign, revoked, client, anon)', () => {
  it('denies Sales and every non-coaching caller with not_permitted', async () => {
    for (const caller of [
      f.salesA.client,
      f.trainerB.client,
      f.actors.woB.client,
      f.actors.revoked.client,
      client.client,
    ]) {
      expect((await set(caller, 'fat_loss')).data).toEqual({
        status: 'not_permitted',
      });
      expect((await read(caller)).data).toEqual({ status: 'not_permitted' });
    }
  });

  it('never reaches a foreign-workspace client through the caller’s workspace', async () => {
    // Workspace A staff naming a workspace B client inside workspace A.
    expect(
      (
        await set(
          f.trainerA.client,
          'fat_loss',
          f.wsA.id,
          foreignClient.clientId,
        )
      ).data,
    ).toEqual({ status: 'not_found' });
    expect(
      (await read(f.trainerA.client, f.wsA.id, foreignClient.clientId)).data,
    ).toEqual({ status: 'not_found' });
    // Workspace A staff naming workspace B directly.
    expect(
      (
        await set(
          f.trainerA.client,
          'fat_loss',
          foreignClient.workspaceId,
          foreignClient.clientId,
        )
      ).data,
    ).toEqual({ status: 'not_permitted' });
  });

  it('denies anonymous execution and direct table access for every role', async () => {
    const anonymous = anonClient();
    expect((await set(anonymous, 'fat_loss')).error).not.toBeNull();
    expect((await read(anonymous)).error).not.toBeNull();
    for (const caller of [
      anonymous,
      f.trainerA.client,
      f.po.client,
      client.client,
    ]) {
      const direct = await caller
        .from('client_goal_types')
        .select('*')
        .limit(1);
      expect(direct.error).not.toBeNull();
    }
  });
});

describe('eligibility (PO 2026-11-14: no goal set -> not eligible)', () => {
  it('rejects a candidate client without a goal type at the database wall', async () => {
    const unset = await leaderboardClient(f, { goalType: null });
    const [row] = await db`
      select app_private.f24_client_eligible(${f.wsA.id}, ${unset.clientId}, app_private.f24_cairo_today()) as eligible`;
    expect(row!.eligible).toBe(false);
    expect(
      (
        await f.po.client.rpc('create_leaderboard_candidate', {
          p_workspace_id: f.wsA.id,
          p_client_ids: [unset.clientId],
          p_operation_key: randomUUID(),
        })
      ).data,
    ).toEqual({ status: 'ineligible_client' });
    expect(
      (await set(f.trainerA.client, 'fat_loss', f.wsA.id, unset.clientId)).data,
    ).toEqual({
      status: 'updated',
    });
    const [after] = await db`
      select app_private.f24_client_eligible(${f.wsA.id}, ${unset.clientId}, app_private.f24_cairo_today()) as eligible`;
    expect(after!.eligible).toBe(true);
    expect(
      (await unset.client.rpc('client_leaderboard_self')).data,
    ).toMatchObject({ eligible: true });
  });

  it('mutation: dropping the goal requirement makes an unset client eligible (kill evidence)', async () => {
    const unset = await leaderboardClient(f, { goalType: null });
    const requirement = "and f.facts->>'goal_type' is not null";
    const rollback = new Error('rollback goal-requirement mutation');
    let mutantEligible: unknown = 'not-reached';
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`
          select pg_get_functiondef('app_private.f24_client_eligible(uuid,uuid,date)'::regprocedure) as definition`;
        const definition = row!.definition as string;
        const mutated = definition.replace(requirement, '');
        expect(mutated).not.toBe(definition);
        await tx.unsafe(mutated);
        const [result] = await tx`
          select app_private.f24_client_eligible(${f.wsA.id}, ${unset.clientId}, app_private.f24_cairo_today()) as eligible`;
        mutantEligible = result!.eligible;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(mutantEligible).toBe(true);
    const [definition] = await db`
      select pg_get_functiondef('app_private.f24_client_eligible(uuid,uuid,date)'::regprocedure) as body`;
    expect(definition?.body).toContain(requirement);
  });
});
