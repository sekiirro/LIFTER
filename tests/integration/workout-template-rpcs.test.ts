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
  it('promotes as a separate PO-only global copy and marks unresolved private refs RED', async () => {
    const privateId = randomUUID();
    const sourceDocument = {
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
                identity_id: privateId,
                version: 1,
                workspace_id: f.wsA.id,
              },
              name: 'Promoted private ref',
              alternatives: [],
              sets: [],
            },
          ],
        },
      ],
    };

    await db.begin(async (tx) => {
      const sourceRows = await asActor(
        tx,
        f.trainerA.userId,
        () =>
          tx`select public.create_workout_workspace_template(${f.wsA.id}, 'Promote me', ${tx.json(sourceDocument)}, ${randomUUID()}) as result`,
      );
      const source = sourceRows[0]?.result as {
        template_id: string;
        version: number;
      };

      await expectRejected(
        tx,
        (sp) =>
          asActor(
            sp,
            f.trainerA.userId,
            () =>
              sp`select public.promote_workout_workspace_template(${f.wsA.id}, ${source.template_id}, 1, ${randomUUID()})`,
          ),
        { code: '42501' },
      );

      const operationKey = randomUUID();
      const promotedRows = await asActor(
        tx,
        f.po.userId,
        () =>
          tx`select public.promote_workout_workspace_template(${f.wsA.id}, ${source.template_id}, 1, ${operationKey}) as result`,
      );
      const promoted = promotedRows[0]?.result as {
        template_id: string;
        version: number;
        unresolved_references: { path: string; status: string }[];
      };

      expect(promoted.template_id).not.toBe(source.template_id);
      expect(promoted.version).toBe(1);
      expect(promoted.unresolved_references).toEqual([
        {
          path: '$.days[0].items[0].exercise',
          status: 'RED',
        },
      ]);
      const replayRows = await asActor(
        tx,
        f.po.userId,
        () =>
          tx`select public.promote_workout_workspace_template(${f.wsA.id}, ${source.template_id}, 1, ${operationKey}) as result`,
      );
      expect(replayRows[0]?.result).toEqual(promoted);

      await tx`select set_config('role', 'postgres', true)`;
      const sourceAfter = await tx`
        select t.lifecycle_state, t.current_version, v.document, v.title
        from public.workout_workspace_templates t
        join public.workout_workspace_template_versions v
          on v.workspace_id = t.workspace_id and v.template_id = t.id and v.version = t.current_version
        where t.workspace_id = ${f.wsA.id} and t.id = ${source.template_id}
      `;
      const globalCopy = await tx`
        select g.origin_workspace_id, g.origin_workspace_template_id, g.origin_workspace_template_version,
          v.document, v.title
        from public.workout_global_templates g
        join public.workout_global_template_versions v
          on v.template_id = g.id and v.version = g.current_version
        where g.id = ${promoted.template_id}
      `;
      expect(sourceAfter[0]).toMatchObject({
        lifecycle_state: 'active',
        current_version: 1,
        title: 'Promote me',
        document: sourceDocument,
      });
      expect(globalCopy[0]).toMatchObject({
        origin_workspace_id: f.wsA.id,
        origin_workspace_template_id: source.template_id,
        origin_workspace_template_version: 1,
        title: 'Promote me',
        document: sourceDocument,
      });
    });
  });

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
    const marker = 'rollback_workout_template_validation_fixture';
    try {
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
        const globalRows = await asActor(
          tx,
          f.po.userId,
          () =>
            tx`select public.create_workout_global_template('Global canonical', ${tx.json(document('global-canonical'))}, ${randomUUID()}) as result`,
        );
        const global = globalRows[0]?.result as {
          template_id: string;
          version: number;
        };
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.po.userId,
              () =>
                sp`select public.version_workout_global_template(${global.template_id}, 1, 'Private v2', ${sp.json(privateReference)}, ${randomUUID()})`,
            ),
          { code: '22023' },
        );
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('refuses foreign workspace_private exercise and alternative references in workspace template RPCs', async () => {
    const docWithPrivateExercise = (workspaceId: string) => ({
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
                workspace_id: workspaceId,
              },
              name: 'Private exercise',
              alternatives: [],
              sets: [],
            },
          ],
        },
      ],
    });
    const docWithPrivateAlternative = (workspaceId: string) => ({
      schema_version: 1,
      days: [
        {
          id: randomUUID(),
          kind: 'session',
          items: [
            {
              id: randomUUID(),
              exercise: {
                source: 'global',
                identity_id: randomUUID(),
                version: 1,
              },
              name: 'Global exercise with private alternative',
              alternatives: [
                {
                  source: 'workspace_private',
                  identity_id: randomUUID(),
                  version: 1,
                  workspace_id: workspaceId,
                },
              ],
              sets: [],
            },
          ],
        },
      ],
    });
    const marker = 'rollback_workout_workspace_private_ref_tenancy';
    try {
      await db.begin(async (tx) => {
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Foreign private exercise', ${sp.json(docWithPrivateExercise(f.wsB.id))}, ${randomUUID()})`,
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
                sp`select public.create_workout_workspace_template(${f.wsA.id}, 'Foreign private alt', ${sp.json(docWithPrivateAlternative(f.wsB.id))}, ${randomUUID()})`,
            ),
          { code: '22023' },
        );

        const ownCreated = await asActor(
          tx,
          f.trainerA.userId,
          () =>
            tx`select public.create_workout_workspace_template(${f.wsA.id}, 'Own private ref', ${tx.json(docWithPrivateExercise(f.wsA.id))}, ${randomUUID()}) as result`,
        );
        const own = ownCreated[0]?.result as {
          template_id: string;
          version: number;
        };
        expect(own).toMatchObject({ version: 1 });

        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () =>
                sp`select public.version_workout_workspace_template(${f.wsA.id}, ${own.template_id}, 1, 'Foreign v2 exercise', ${sp.json(docWithPrivateExercise(f.wsB.id))}, ${randomUUID()})`,
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
                sp`select public.version_workout_workspace_template(${f.wsA.id}, ${own.template_id}, 1, 'Foreign v2 alt', ${sp.json(docWithPrivateAlternative(f.wsB.id))}, ${randomUUID()})`,
            ),
          { code: '22023' },
        );

        const ownV2 = await asActor(
          tx,
          f.trainerA.userId,
          () =>
            tx`select public.version_workout_workspace_template(${f.wsA.id}, ${own.template_id}, 1, 'Own v2 alt', ${tx.json(docWithPrivateAlternative(f.wsA.id))}, ${randomUUID()}) as result`,
        );
        expect(ownV2[0]?.result).toMatchObject({
          template_id: own.template_id,
          version: 2,
        });

        await tx`select set_config('role', 'postgres', true)`;
        const countRows = await tx`
          select count(*)::int as c
          from public.workout_workspace_templates
          where workspace_id = ${f.wsA.id} and id = ${own.template_id}
        `;
        expect(countRows[0]?.c).toBe(1);
        const versionRows = await tx`
          select version
          from public.workout_workspace_template_versions
          where workspace_id = ${f.wsA.id} and template_id = ${own.template_id}
          order by version
        `;
        expect(versionRows).toEqual([{ version: 1 }, { version: 2 }]);
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });
});
