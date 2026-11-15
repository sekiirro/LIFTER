import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
});
afterAll(async () => {
  await db.end();
});

async function asActor<T>(tx: Tx, id: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: 'authenticated' })}, true)`;
  return body();
}

async function expectRejected(
  tx: Tx,
  body: (sp: Tx) => Promise<unknown>,
  matcher: Record<string, unknown>,
) {
  await expect(tx.savepoint((sp) => body(sp))).rejects.toMatchObject(matcher);
}

const document = (suffix: string) => ({
  schema_version: 1,
  notes: suffix,
  days: [{ id: randomUUID(), kind: 'session', items: [] }],
});

describe('F17 T023/T024 workout template RPCs', () => {
  it('enforces PO-only global CRUD, workspace coaching scope, immutable versions, CAS, and safe retirement', async () => {
    const marker = 'rollback_workout_template_rpc_fixture';
    try {
      await db.begin(async (tx) => {
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.create_workout_global_template('Forbidden', null, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        const globalKey = randomUUID();
        const globalDoc = document('global-v1');
        const createdRows = await asActor(
          tx,
          f.po.userId,
          () =>
            tx`select public.create_workout_global_template('Global plan', ${tx.json(globalDoc)}, ${globalKey}) as result`,
        );
        const global = createdRows[0]?.result as {
          template_id: string;
          version: number;
        };
        expect(global).toMatchObject({ version: 1 });
        const replay = await asActor(
          tx,
          f.po.userId,
          () =>
            tx`select public.create_workout_global_template('Global plan', ${tx.json(globalDoc)}, ${globalKey}) as result`,
        );
        expect(replay[0]?.result).toEqual(global);
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.po.userId,
              () =>
                sp`select public.create_workout_global_template('Different', ${sp.json(globalDoc)}, ${globalKey})`,
            ),
          { code: '23505' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.version_workout_global_template(${global.template_id}, 1, 'Unauthorized', ${sp.json(document('unauthorized'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.retire_workout_global_template(${global.template_id}, 1, ${randomUUID()})`,
            ),
          { code: '42501' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.po.userId,
              () =>
                sp`select public.version_workout_global_template(${global.template_id}, 9, 'Stale', ${sp.json(document('stale'))}, ${randomUUID()})`,
            ),
          { code: '40001' },
        );
        const v2 = await asActor(
          tx,
          f.po.userId,
          () =>
            tx`select public.version_workout_global_template(${global.template_id}, 1, 'Global v2', ${tx.json(document('global-v2'))}, ${randomUUID()}) as result`,
        );
        expect(v2[0]?.result).toMatchObject({
          template_id: global.template_id,
          version: 2,
        });
        const globalRetired = await asActor(
          tx,
          f.po.userId,
          () =>
            tx`select public.retire_workout_global_template(${global.template_id}, 2, ${randomUUID()}) as result`,
        );
        expect(globalRetired[0]?.result).toMatchObject({
          status: 'retired',
          version: 2,
        });
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.po.userId,
              () =>
                sp`select public.version_workout_global_template(${global.template_id}, 2, 'Retired edit', ${sp.json(document('retired-global'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        const wsCreated = await asActor(
          tx,
          f.trainerA.userId,
          () =>
            tx`select public.create_workout_workspace_template(${f.wsA.id}, 'Workspace plan', ${tx.json(document('workspace-v1'))}, ${randomUUID()}) as result`,
        );
        const workspace = wsCreated[0]?.result as {
          template_id: string;
          version: number;
        };
        expect(workspace).toMatchObject({ version: 1 });
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerB.userId,
              () =>
                sp`select public.version_workout_workspace_template(${f.wsA.id}, ${workspace.template_id}, 1, 'Foreign', ${sp.json(document('foreign'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.version_workout_workspace_template(${f.wsA.id}, ${workspace.template_id}, 8, 'Stale', ${sp.json(document('stale'))}, ${randomUUID()})`,
            ),
          { code: '40001' },
        );
        const wsV2 = await asActor(
          tx,
          f.trainerA.userId,
          () =>
            tx`select public.version_workout_workspace_template(${f.wsA.id}, ${workspace.template_id}, 1, 'Workspace v2', ${tx.json(document('workspace-v2'))}, ${randomUUID()}) as result`,
        );
        expect(wsV2[0]?.result).toMatchObject({
          template_id: workspace.template_id,
          version: 2,
        });
        const retired = await asActor(
          tx,
          f.trainerA.userId,
          () =>
            tx`select public.retire_workout_workspace_template(${f.wsA.id}, ${workspace.template_id}, 2, ${randomUUID()}) as result`,
        );
        expect(retired[0]?.result).toMatchObject({
          status: 'retired',
          version: 2,
        });
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.version_workout_workspace_template(${f.wsA.id}, ${workspace.template_id}, 2, 'No resurrection', ${sp.json(document('retired'))}, ${randomUUID()})`,
            ),
          { code: '42501' },
        );

        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select origin_global_template_id, origin_global_template_version, origin_assignment_id from public.workout_workspace_templates where workspace_id=${f.wsA.id} and id=${workspace.template_id}`,
            ),
          { code: '42501' },
        );
        await tx`select set_config('role','postgres',true)`;
        await expect(
          tx`select version from public.workout_workspace_template_versions where workspace_id=${f.wsA.id} and template_id=${workspace.template_id} order by version`,
        ).resolves.toEqual([{ version: 1 }, { version: 2 }]);
        await expect(
          tx`select action from public.audit_events where target_id=${workspace.template_id} order by id`,
        ).resolves.toEqual([
          { action: 'template.workout_workspace_created' },
          { action: 'template.workout_workspace_versioned' },
          { action: 'template.workout_workspace_retired' },
        ]);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('validates schema-v1 documents and rejects private references in fresh global authoring', async () => {
    const invalid = { schema_version: 2, days: [] };
    const malformedNested = {
      schema_version: 1,
      days: [
        {
          id: randomUUID(),
          kind: 'session',
          items: [],
          client_id: randomUUID(),
        },
      ],
    };
    const privateReference = {
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
                identity_id: randomUUID(),
                version: 1,
                workspace_id: f.wsA.id,
              },
              name: 'Private exercise',
              alternatives: [],
              sets: [],
            },
          ],
        },
      ],
    };
    await db.begin(async (tx) => {
      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.po.userId,
            () =>
              sp`select public.create_workout_global_template('Invalid', ${sp.json(invalid)}, ${randomUUID()})`,
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
              sp`select public.create_workout_global_template('Malformed', ${sp.json(malformedNested)}, ${randomUUID()})`,
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
              sp`select public.create_workout_global_template('Private', ${sp.json(privateReference)}, ${randomUUID()})`,
          ),
        { code: '22023' },
      );
    });
  });
});
