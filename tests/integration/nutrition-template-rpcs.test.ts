import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let plan: ClientNotesFixture;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
  plan = await clientNotesFixture();
});
afterAll(async () => {
  await plan.close();
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
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: `day-${suffix}`,
  dayTypes: [
    {
      id: `day-${suffix}`,
      name: { ar: 'يوم', en: 'Day' },
      trainingDay: true,
      targets: null,
    },
  ],
  meals: [
    {
      id: `meal-${suffix}`,
      name: { ar: 'وجبة', en: 'Meal' },
      note: null,
      recipeUrl: null,
      items: [],
    },
  ],
  title: { ar: 'خطة', en: 'Plan' },
  notes: null,
});

async function createPlanDraft(
  tx: Tx,
  actorId: string,
  content: postgres.JSONValue,
) {
  return asActor(tx, actorId, async () => {
    const rows = await tx`select public.create_plan_draft(
      ${plan.context.wsA.id}, ${plan.clientId}, 'nutrition', ${tx.json(content)}, ${randomUUID()}
    ) as id`;
    return rows[0]!.id as string;
  });
}

describe('F18 nutrition template operations', () => {
  it('keeps global writes PO-only and versions workspace templates with compare-and-set', async () => {
    const marker = 'rollback_nutrition_template_rpc_fixture';
    try {
      await db.begin(async (tx) => {
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () => sp`select public.create_nutrition_global_template(
          ${sp.json(document('global'))},1,${randomUUID()})`,
            ),
          { code: '42501' },
        );

        const globalKey = randomUUID();
        const globalCreated = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.create_nutrition_global_template(
          ${tx.json(document('global-v1'))},1,${globalKey}) as result`,
        );
        const global = globalCreated[0]?.result as {
          template_id: string;
          version: number;
        };
        expect(global.version).toBe(1);
        const globalReplay = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.create_nutrition_global_template(
          ${tx.json(document('global-v1'))},1,${globalKey}) as result`,
        );
        expect(globalReplay[0]?.result).toEqual(global);
        await expect(
          asActor(
            tx,
            f.trainerA.userId,
            () =>
              tx`select id from public.nutrition_global_templates where id=${global.template_id}`,
          ),
        ).resolves.toEqual([]);
        const globalNext = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.version_nutrition_global_template(
          ${global.template_id},1,${tx.json(document('global-v2'))},1,${randomUUID()}) as result`,
        );
        expect(globalNext[0]?.result).toMatchObject({ version: 2 });
        const globalRetired = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.retire_nutrition_global_template(
          ${global.template_id},2,${randomUUID()}) as result`,
        );
        expect(globalRetired[0]?.result).toMatchObject({
          status: 'retired',
          version: 2,
        });

        const created = await asActor(
          tx,
          f.trainerA.userId,
          () => tx`select public.create_nutrition_workspace_template(
          ${f.wsA.id},'Workspace plan',${tx.json(document('v1'))},1,${randomUUID()}) as result`,
        );
        const identity = created[0]?.result as {
          template_id: string;
          version: number;
        };
        expect(identity.version).toBe(1);

        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerB.userId,
              () => sp`select public.version_nutrition_workspace_template(
          ${f.wsA.id},${identity.template_id},1,'Foreign edit',${sp.json(document('foreign'))},1,${randomUUID()})`,
            ),
          { code: '42501' },
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () => sp`select public.version_nutrition_workspace_template(
          ${f.wsA.id},${identity.template_id},9,'Stale edit',${sp.json(document('stale'))},1,${randomUUID()})`,
            ),
          { code: '40001' },
        );

        const next = await asActor(
          tx,
          f.trainerA.userId,
          () => tx`select public.version_nutrition_workspace_template(
          ${f.wsA.id},${identity.template_id},1,'Workspace plan v2',${tx.json(document('v2'))},1,${randomUUID()}) as result`,
        );
        expect(next[0]?.result).toMatchObject({ version: 2 });
        await expect(tx`select version,document from public.nutrition_workspace_template_versions
          where workspace_id=${f.wsA.id} and template_id=${identity.template_id} order by version`).resolves.toEqual(
          [
            { version: 1, document: document('v1') },
            { version: 2, document: document('v2') },
          ],
        );
        await expect(
          asActor(
            tx,
            f.trainerA.userId,
            () => tx`select public.retire_nutrition_workspace_template(
          ${f.wsA.id},${identity.template_id},2,${randomUUID()})`,
          ),
        ).resolves.toBeDefined();
        await expect(tx`select status,current_version from public.nutrition_workspace_templates
          where workspace_id=${f.wsA.id} and id=${identity.template_id}`).resolves.toEqual(
          [{ status: 'retired', current_version: 2 }],
        );
        await tx`select set_config('role','postgres',true)`;
        await expect(tx`select action,target_id from public.audit_events where target_id=${identity.template_id}
          order by id`).resolves.toEqual([
          {
            action: 'template.nutrition_workspace_created',
            target_id: identity.template_id,
          },
          {
            action: 'template.nutrition_workspace_versioned',
            target_id: identity.template_id,
          },
          {
            action: 'template.nutrition_workspace_retired',
            target_id: identity.template_id,
          },
        ]);
        await tx`select set_config('role','authenticated',true)`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
        await expectRejected(
          tx,
          (
            sp,
          ) => sp`update public.nutrition_workspace_template_versions set document='{}'
          where workspace_id=${f.wsA.id} and template_id=${identity.template_id} and version=1`,
          { code: '42501' },
        );
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('loads an active exact version as an independent copy into an empty nutrition draft', async () => {
    const source = document('source');
    const marker = 'rollback_nutrition_template_load_fixture';
    try {
      await db.begin(async (tx) => {
        const templateResult = await asActor(
          tx,
          plan.context.trainerA.userId,
          () => tx`select public.create_nutrition_workspace_template(
          ${plan.workspaceId},'Load source',${tx.json(source)},1,${randomUUID()}) as result`,
        );
        const template = templateResult[0]?.result as {
          template_id: string;
          version: number;
        };
        const planId = await createPlanDraft(
          tx,
          plan.context.trainerA.userId,
          {},
        );
        const loaded = await asActor(
          tx,
          plan.context.trainerA.userId,
          () => tx`select public.load_nutrition_template_version(
          ${planId},'workspace',${template.template_id},1,${randomUUID()}) as result`,
        );
        expect(loaded[0]?.result).toMatchObject({
          loaded: true,
          draft_version: 2,
        });

        const [draft] =
          await tx`select content from public.plan_drafts where workspace_id=${plan.workspaceId} and plan_id=${planId}`;
        expect(draft?.content).toMatchObject({
          structure: source.structure,
          title: source.title,
        });
        expect(draft?.content).not.toEqual(source);
        expect((draft?.content as typeof source).implicitDayTypeId).not.toBe(
          source.implicitDayTypeId,
        );
        expect((draft?.content as typeof source).meals[0]?.id).not.toBe(
          source.meals[0]?.id,
        );

        await asActor(
          tx,
          plan.context.trainerA.userId,
          () => tx`select public.version_nutrition_workspace_template(
          ${plan.workspaceId},${template.template_id},1,'Load source v2',${tx.json(document('later'))},1,${randomUUID()})`,
        );
        const [unchanged] =
          await tx`select content from public.plan_drafts where workspace_id=${plan.workspaceId} and plan_id=${planId}`;
        expect(unchanged?.content).toEqual(draft?.content);

        const nonEmptyPlan = await createPlanDraft(
          tx,
          plan.context.trainerA.userId,
          document('already-filled'),
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              plan.context.trainerA.userId,
              () => sp`select public.load_nutrition_template_version(
          ${nonEmptyPlan},'workspace',${template.template_id},1,${randomUUID()})`,
            ),
          { code: '22023' },
        );
        await expect(tx`select content,draft_version from public.plan_drafts
          where workspace_id=${plan.workspaceId} and plan_id=${nonEmptyPlan}`).resolves.toEqual(
          [{ content: document('already-filled'), draft_version: '1' }],
        );

        await tx`select set_config('role','authenticated',true)`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: plan.context.trainerA.userId, role: 'authenticated' })},true)`;
        await tx`select public.retire_nutrition_workspace_template(${plan.workspaceId},${template.template_id},2,${randomUUID()})`;
        const retiredPlan = await createPlanDraft(
          tx,
          plan.context.trainerA.userId,
          {},
        );
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              plan.context.trainerA.userId,
              () => sp`select public.load_nutrition_template_version(
          ${retiredPlan},'workspace',${template.template_id},1,${randomUUID()})`,
            ),
          { code: '42501' },
        );

        const foreignTemplate = await asActor(
          tx,
          plan.context.trainerB.userId,
          () => tx`select public.create_nutrition_workspace_template(
          ${plan.context.wsB.id},'Foreign source',${tx.json(document('foreign'))},1,${randomUUID()}) as result`,
        );
        const foreign = foreignTemplate[0]?.result as { template_id: string };
        await expectRejected(
          tx,
          (sp) =>
            asActor(
              sp,
              plan.context.trainerA.userId,
              () => sp`select public.load_nutrition_template_version(
          ${retiredPlan},'workspace',${foreign.template_id},1,${randomUUID()})`,
            ),
          { code: '42501' },
        );
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });
});
