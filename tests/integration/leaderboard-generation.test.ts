import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  generateCandidateWith,
  spec023SourceFor,
  type LeaderboardRpc,
} from '../../lib/leaderboard/generation';
import { sql } from './harness';
import {
  leaderboardClient,
  leaderboardContext,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';

// End-to-end candidate generation (PO decision 2026-11-14) against the real
// F24 and spec 023 SQL, in one rolled-back transaction: PO pool -> eligibility
// (goal type required) -> 023 adherence/measurements/baselines -> production
// resolvers (FR-018 option A, last scoring input, registration order) ->
// ranking -> create_leaderboard_candidate. Synthetic data only.
type Tx = TransactionSql;

let f: LeaderboardContext;
let loser: LeaderboardClient; // fat loss 84 -> 80 kg, adherence 9/5
let keeper: LeaderboardClient; // maintenance 80 -> 80 kg, adherence 4/4
let noGoal: LeaderboardClient; // no goal type: not eligible
let noWeight: LeaderboardClient; // muscle gain, no weight this month: omitted
const db = sql();

const checkinDefinition = {
  questions: [
    {
      id: 'workoutAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
    {
      id: 'dietAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
    {
      id: 'bodyWeight',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      unit: { en: 'kg', ar: 'كجم' },
      validation: { min: 20, max: 400 },
      label: { en: 'Body weight', ar: 'الوزن' },
    },
  ],
};

async function asUser<T>(
  tx: Tx,
  userId: string,
  run: (sp: Tx) => Promise<T>,
): Promise<T> {
  return (await tx.savepoint(async (sp) => {
    await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await sp`set local role authenticated`;
    const result = await run(sp as Tx);
    await sp`reset role`;
    return result;
  })) as T;
}

/** The pipeline's RPCs, executed as SQL on the transaction (same names and arguments). */
function txRpc(tx: Tx): LeaderboardRpc {
  return async (name, args = {}) => {
    const a = args as Record<string, unknown>;
    switch (name) {
      case 'leaderboard_candidate_pool': {
        const [row] =
          await tx`select public.leaderboard_candidate_pool(${a.p_workspace_id as string}::uuid) as result`;
        return row!.result;
      }
      case 'create_leaderboard_candidate': {
        const [row] = await tx`select public.create_leaderboard_candidate(
          ${a.p_workspace_id as string}::uuid, ${a.p_client_ids as string[]}::uuid[],
          ${a.p_operation_key as string}::uuid) as result`;
        return row!.result;
      }
      case 'progress_weekly_adherence':
        return (
          await tx`select to_jsonb(t) as row from public.progress_weekly_adherence(
            ${a.p_workspace_id as string}::uuid, ${a.p_from as string}::date, ${a.p_to as string}::date) t`
        ).map((row) => row.row);
      case 'progress_measurement_history':
        return (
          await tx`select to_jsonb(t) as row from public.progress_measurement_history(
            ${a.p_workspace_id as string}::uuid, ${a.p_from as string}::date, ${a.p_to as string}::date) t`
        ).map((row) => row.row);
      case 'progress_measurement_baselines':
        return (
          await tx`select to_jsonb(t) as row from public.progress_measurement_baselines(
            ${a.p_workspace_id as string}::uuid, ${a.p_as_of as string}::date) t`
        ).map((row) => row.row);
      default:
        throw new Error(`unexpected rpc ${name}`);
    }
  };
}

function asSupabase(rpc: LeaderboardRpc): SupabaseClient {
  return {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      try {
        return { data: await rpc(name, args), error: null };
      } catch (error) {
        return {
          data: null,
          error: { code: (error as { code?: string }).code ?? 'unknown' },
        };
      }
    },
  } as unknown as SupabaseClient;
}

beforeAll(async () => {
  f = await leaderboardContext();
  loser = await leaderboardClient(f, {
    activatedDaysAgo: null,
    goalType: 'fat_loss',
  });
  keeper = await leaderboardClient(f, {
    activatedDaysAgo: null,
    goalType: 'maintenance',
  });
  noGoal = await leaderboardClient(f, {
    activatedDaysAgo: null,
    goalType: null,
  });
  noWeight = await leaderboardClient(f, {
    activatedDaysAgo: null,
    goalType: 'muscle_gain',
  });
});
afterAll(() => db.end());

describe('end-to-end candidate generation (PO 2026-11-14)', () => {
  it('ranks eligible clients by the decided formula and omits no-goal and no-weight clients', async () => {
    const rollback = new Error('rollback generation probe');
    let outcome: {
      status: string;
      pending: unknown;
      poolGoals: Record<string, unknown>;
    } | null = null;
    try {
      await db.begin(async (tx) => {
        const ws = f.wsA.id;
        const [clock] =
          await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
        const today = clock!.today as string;
        await tx`select set_config('request.jwt.claims','{}',true)`;
        // Activation exactly 21 Cairo days ago: 21 active days (>= 14) and a
        // weekly check-in due today (every 7 days after the anchor).
        for (const client of [loser, keeper, noGoal, noWeight])
          await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
            values(${ws},${client.subscriptionId},
              ((${today}::date - 21)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
        const terms = `f24-gen-${randomUUID()}`;
        const formId = randomUUID();
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${terms},'terms','published')`;
        await tx`insert into public.forms(id,workspace_id,name) values(${formId},${ws},'F24 generation check-in')`;
        await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${ws},${formId},1,${terms},${tx.json(checkinDefinition as JSONValue)},'published')`;
        const configured = await asUser(
          tx,
          f.trainerA.userId,
          (sp) =>
            sp`select public.configure_weekly_checkin_form(${ws},${formId},1) as r`,
        );
        expect(configured[0]!.r).toMatchObject({ status: 'configured' });
        // First weights 20 days ago: manual self-entries (023 lets the client record its own).
        for (const [client, weight] of [
          [loser, 84],
          [keeper, 80],
          [noGoal, 80],
        ] as const) {
          const recorded = await asUser(
            tx,
            client.userId,
            (sp) =>
              sp`select public.record_progress_measurement(${ws},${client.clientId},'bodyWeight',${weight},${today}::date - 20) as r`,
          );
          expect(recorded[0]!.r).toMatchObject({ status: 'recorded' });
        }
        await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
        await tx`select set_config('request.jwt.claims','{}',true)`;
        for (const [client, answers] of [
          [loser, { workoutAdherence: 9, dietAdherence: 5, bodyWeight: 80 }],
          [keeper, { workoutAdherence: 4, dietAdherence: 4, bodyWeight: 80 }],
          [noGoal, { workoutAdherence: 10, dietAdherence: 10, bodyWeight: 70 }],
          [noWeight, { workoutAdherence: 10, dietAdherence: 10 }],
        ] as const) {
          const [assignment] = await tx`select id from public.form_assignments
            where workspace_id=${ws} and client_id=${client.clientId}
              and occurrence_key=${'weekly_checkin:' + today}`;
          expect(assignment, client.username).toBeDefined();
          await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
            values(${ws},${assignment!.id},1,${tx.json(answers as JSONValue)})`;
          await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
            values(${ws},${assignment!.id},1,clock_timestamp())`;
        }

        // The whole pipeline runs as the PO.
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const rpc = txRpc(tx);
        const pool = (await rpc('leaderboard_candidate_pool', {
          p_workspace_id: ws,
        })) as { pool: Array<{ client_id: string; goal_type: unknown }> };
        const poolGoals = Object.fromEntries(
          pool.pool.map((row) => [row.client_id, row.goal_type]),
        );
        const status = await generateCandidateWith({
          rpc,
          workspaceId: ws,
          sourceFor: spec023SourceFor(asSupabase(rpc)),
        });
        const [pending] =
          await tx`select public.leaderboard_pending_read(${ws}::uuid) as result`;
        outcome = { status, pending: pending!.result, poolGoals };
        await tx`reset role`;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(outcome).not.toBeNull();
    expect(outcome!.poolGoals[noGoal.clientId]).toBeNull();
    expect(outcome!.poolGoals[loser.clientId]).toBe('fat_loss');
    expect(outcome!.status).toBe('created');
    // keeper: 0.5 * 0.4 + 0.5 * 1 = 0.70; loser: 0.5 * 0.7 + 0.5 * (4/84 / 10%) = 0.588.
    expect(outcome!.pending).toMatchObject({
      status: 'pending',
      entries: [
        { rank: 1, username: keeper.username },
        { rank: 2, username: loser.username },
      ],
    });
    const usernames = JSON.stringify(outcome!.pending);
    expect(usernames).not.toContain(noGoal.username);
    expect(usernames).not.toContain(noWeight.username);
  });

  it('stores nothing outside the rolled-back probe', async () => {
    const [row] = await db`
      select count(*)::int as n from public.leaderboard_publications where workspace_id=${f.wsA.id}`;
    expect(row!.n).toBe(0);
  });
});
