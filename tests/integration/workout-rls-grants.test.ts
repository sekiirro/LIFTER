import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { clientContext, pending } from './client-accounts-fixture';
import { createStaff, sql, twoWorkspaceFixture } from './harness';

type Tx = postgres.TransactionSql;

const db = sql();
const templateTables = [
  'public.workout_global_templates',
  'public.workout_global_template_versions',
  'public.workout_workspace_templates',
  'public.workout_workspace_template_versions',
] as const;
const assignmentTables = [
  'public.workout_template_assignment_runs',
  'public.workout_template_assignment_items',
  'public.workout_template_assignment_copies',
  'public.workout_template_distribution_state',
] as const;
const allTables = [...templateTables, ...assignmentTables];

type Actor = { userId: string };
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let clientActor: Actor;
let unaffiliated: Actor;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
  clientActor = await createStaff(null, 'workout-planner-client-denial');
  const clientFixture = await clientContext();
  await db.begin((tx) => pending(tx, clientFixture, {}, clientActor.userId));
  unaffiliated = await createStaff(null, 'workout-planner-unaffiliated');
});

afterAll(async () => {
  await db.end();
});

async function asActor<T>(tx: Tx, actor: Actor, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
  return body();
}

async function visibleCount(
  tx: Tx,
  actor: Actor,
  rel: string,
  fixture: Awaited<ReturnType<typeof seedPolicyRows>>,
) {
  return asActor(tx, actor, async () => {
    let rows;
    switch (rel) {
      case 'public.workout_global_templates':
        rows =
          await tx`select count(*)::int as count from public.workout_global_templates where id=${fixture.globalId}`;
        break;
      case 'public.workout_global_template_versions':
        rows =
          await tx`select count(*)::int as count from public.workout_global_template_versions where template_id=${fixture.globalId}`;
        break;
      case 'public.workout_workspace_templates':
        rows =
          await tx`select count(*)::int as count from public.workout_workspace_templates where (workspace_id=${f.wsA.id} and id=${fixture.workspaceTemplateA}) or (workspace_id=${f.wsB.id} and id=${fixture.workspaceTemplateB})`;
        break;
      case 'public.workout_workspace_template_versions':
        rows =
          await tx`select count(*)::int as count from public.workout_workspace_template_versions where (workspace_id=${f.wsA.id} and template_id=${fixture.workspaceTemplateA}) or (workspace_id=${f.wsB.id} and template_id=${fixture.workspaceTemplateB})`;
        break;
      case 'public.workout_template_assignment_runs':
        rows =
          await tx`select count(*)::int as count from public.workout_template_assignment_runs where id=${fixture.assignmentRun}`;
        break;
      case 'public.workout_template_assignment_items':
        rows =
          await tx`select count(*)::int as count from public.workout_template_assignment_items where run_id=${fixture.assignmentRun}`;
        break;
      case 'public.workout_template_assignment_copies':
        rows =
          await tx`select count(*)::int as count from public.workout_template_assignment_copies where run_id=${fixture.assignmentRun}`;
        break;
      case 'public.workout_template_distribution_state':
        rows =
          await tx`select count(*)::int as count from public.workout_template_distribution_state where workspace_id=${f.wsA.id}`;
        break;
      default:
        throw new Error(`Unscoped F17 RLS table: ${rel}`);
    }
    const [row] = rows;
    return row!.count as number;
  });
}

async function foreignWorkspaceTemplateCount(
  tx: Tx,
  actor: Actor,
  rel: string,
  fixture: Awaited<ReturnType<typeof seedPolicyRows>>,
) {
  return asActor(tx, actor, async () => {
    const [row] =
      rel === 'public.workout_workspace_templates'
        ? await tx`select count(*)::int as count from public.workout_workspace_templates where workspace_id=${f.wsA.id} and id=${fixture.workspaceTemplateA}`
        : await tx`select count(*)::int as count from public.workout_workspace_template_versions where workspace_id=${f.wsA.id} and template_id=${fixture.workspaceTemplateA}`;
    return row!.count as number;
  });
}

async function seedPolicyRows(tx: Tx) {
  const globalId = randomUUID();
  const workspaceTemplateA = randomUUID();
  const workspaceTemplateB = randomUUID();
  const assignmentRun = randomUUID();
  const assignmentCopy = randomUUID();
  const doc = { schema_version: 1, days: [] };

  await tx`insert into public.workout_global_templates (id, current_version, created_by)
    values (${globalId}, 1, ${f.po.userId})`;
  await tx`insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
    values (${globalId}, 1, 'RLS fixture global', 1, ${tx.json(doc)}, ${f.po.userId})`;
  await tx`insert into public.workout_workspace_templates (workspace_id, id, current_version, created_by)
    values (${f.wsA.id}, ${workspaceTemplateA}, 1, ${f.woA.userId}),
           (${f.wsB.id}, ${workspaceTemplateB}, 1, ${f.trainerB.userId})`;
  await tx`insert into public.workout_workspace_template_versions (workspace_id, template_id, version, title, schema_version, document, created_by)
    values (${f.wsA.id}, ${workspaceTemplateA}, 1, 'RLS fixture A', 1, ${tx.json(doc)}, ${f.woA.userId}),
           (${f.wsB.id}, ${workspaceTemplateB}, 1, 'RLS fixture B', 1, ${tx.json(doc)}, ${f.trainerB.userId})`;
  await tx`insert into public.workout_template_assignment_runs (
      id, actor_id, operation_key, request_hash, template_selection_mode, target_mode,
      assigned_workspace_count, created_copies_count
    ) values (
      ${assignmentRun}, ${f.po.userId}, ${randomUUID()}, 'sha256:rls-fixture', 'all', 'all_workspaces', 1, 1
    )`;
  await tx`insert into public.workout_template_assignment_items (run_id, workspace_id, outcome)
    values (${assignmentRun}, ${f.wsA.id}, 'denied')`;
  await tx`insert into public.workout_template_assignment_copies (
      id, run_id, workspace_id, global_template_id, global_template_version,
      workspace_template_id, workspace_template_version
    ) values (
      ${assignmentCopy}, ${assignmentRun}, ${f.wsA.id}, ${globalId}, 1, ${workspaceTemplateA}, 1
    )`;
  await tx`insert into public.workout_template_distribution_state (
      workspace_id, ever_received_global_assignment, first_assigned_at, first_assignment_id, last_assignment_id
    ) values (${f.wsA.id}, true, now(), ${assignmentRun}, ${assignmentRun})`;
  return {
    globalId,
    workspaceTemplateA,
    workspaceTemplateB,
    assignmentRun,
    assignmentCopy,
  };
}

describe('F17 T016 RLS negative matrix', () => {
  it('isolates workspace templates and limits global templates and assignment ledgers to the PO', async () => {
    for (const rel of allTables) {
      const [state] = await db`
        select relrowsecurity, relforcerowsecurity
        from pg_catalog.pg_class where oid=${rel}::regclass`;
      expect(state, `${rel} row security`).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    }

    const marker = new Error('rollback F17 RLS fixture');
    let fixture: Awaited<ReturnType<typeof seedPolicyRows>> | undefined;
    try {
      await db.begin(async (tx) => {
        fixture = await seedPolicyRows(tx);
        await tx`update public.workspace_memberships
          set revoked_at=pg_catalog.clock_timestamp(), revoked_by=${f.po.userId}
          where workspace_id=${f.wsA.id} and user_id=${f.trainerA.userId} and revoked_at is null`;

        for (const rel of templateTables) {
          expect(await visibleCount(tx, f.po, rel, fixture!), `PO ${rel}`).toBe(
            rel.includes('workout_workspace_') ? 2 : 1,
          );
          expect(
            await visibleCount(tx, f.woA, rel, fixture!),
            `workspace A ${rel}`,
          ).toBe(rel.includes('workout_workspace_') ? 1 : 0);
          expect(
            await visibleCount(tx, f.trainerA, rel, fixture!),
            `revoked ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, f.trainerB, rel, fixture!),
            `workspace B ${rel}`,
          ).toBe(rel.includes('workout_workspace_') ? 1 : 0);
          expect(
            await visibleCount(tx, f.salesA, rel, fixture!),
            `Sales ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, clientActor, rel, fixture!),
            `client ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, unaffiliated, rel, fixture!),
            `unaffiliated ${rel}`,
          ).toBe(0);
        }
        for (const rel of assignmentTables) {
          expect(await visibleCount(tx, f.po, rel, fixture!), `PO ${rel}`).toBe(
            1,
          );
          expect(
            await visibleCount(tx, f.woA, rel, fixture!),
            `workspace owner ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, f.trainerB, rel, fixture!),
            `foreign trainer ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, f.salesA, rel, fixture!),
            `Sales ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, clientActor, rel, fixture!),
            `client ${rel}`,
          ).toBe(0);
          expect(
            await visibleCount(tx, unaffiliated, rel, fixture!),
            `unaffiliated ${rel}`,
          ).toBe(0);
        }
        for (const rel of templateTables.filter((table) =>
          table.includes('workout_workspace_'),
        ))
          expect(
            await foreignWorkspaceTemplateCount(tx, f.trainerB, rel, fixture!),
            `foreign lookup indistinguishable ${rel}`,
          ).toBe(0);
        throw marker;
      });
    } catch (error) {
      if (error !== marker) throw error;
    }
    expect(fixture).toBeDefined();
  });
});

describe('F17 T017 direct-DML denial and definer catalog', () => {
  it('denies client-role DML and exposes only authenticated template RPC execution', async () => {
    for (const rel of allTables) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const [grant] =
            await db`select has_table_privilege(${role}, ${rel}, ${privilege}) as allowed`;
          expect(grant!.allowed, `${role} ${privilege} ${rel}`).toBe(false);
        }
      }
    }

    const rpcSignatures = [
      'public.create_workout_global_template(text,jsonb,uuid)',
      'public.version_workout_global_template(uuid,integer,text,jsonb,uuid)',
      'public.retire_workout_global_template(uuid,integer,uuid)',
      'public.create_workout_workspace_template(uuid,text,jsonb,uuid)',
      'public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid)',
      'public.retire_workout_workspace_template(uuid,uuid,integer,uuid)',
    ];
    for (const signature of rpcSignatures) {
      const [fn] = await db`select p.proconfig,
          pg_catalog.pg_get_userbyid(p.proowner) as owner,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role,
          pg_catalog.pg_get_functiondef(p.oid) as definition
        from pg_catalog.pg_proc p where p.oid=${signature}::regprocedure`;
      expect(fn, signature).toMatchObject({
        owner: 'postgres',
        authenticated: true,
        anon: false,
        service_role: false,
      });
      expect(fn?.proconfig, signature).toContain('search_path=""');
      expect(fn?.definition, signature).toMatch(
        /public\.|app_private\.|auth\.|extensions\./,
      );
      expect(fn?.definition, signature).not.toMatch(
        /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?!public\.|app_private\.|auth\.|extensions\.)[a-z_][\w.]*/i,
      );
      expect(fn?.definition, signature).not.toMatch(
        /(?<!app_private\.)\b(?:has_workspace_access|is_platform_owner|f17_workout_[a-z_]+)\s*\(/,
      );
    }
  });
});
