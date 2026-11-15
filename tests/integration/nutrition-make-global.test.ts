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

const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: id,
  dayTypes: [
    { id, name: { ar: 'يوم', en: 'Day' }, trainingDay: true, targets: null },
  ],
  meals: [],
  title: { ar: 'خطة', en: 'Plan' },
  notes: null,
  ...extra,
});

describe('F18 T015 Make it Global', () => {
  it('denies non-PO callers, refuses private fields, and promotes an unchanged separate copy', async () => {
    const marker = 'rollback_t015';
    try {
      await db.begin(async (tx) => {
        await tx`set transaction isolation level repeatable read`;
        const promotionKey = randomUUID();
        await tx`select set_config('role', 'none', true)`;
        const globalCountBefore =
          await tx`select count(*)::int n from public.nutrition_global_templates`;
        const privateTemplate = await asActor(
          tx,
          f.trainerA.userId,
          () => tx`select public.create_nutrition_workspace_template(
          ${f.wsA.id}, 'Private', ${tx.json(doc('private', { clientName: 'Synthetic Client', created_by: randomUUID(), workspaceId: f.wsA.id }))}, 1, ${randomUUID()}) result`,
        );
        const privateId = (
          privateTemplate[0]!.result as { template_id: string }
        ).template_id;
        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.po.userId,
              () => sp`select public.make_nutrition_template_global(
          ${f.wsA.id}, ${privateId}, 1, ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({
          code: '22023',
          detail: '$.clientName,$.created_by,$.workspaceId',
        });
        await tx`select set_config('role', 'none', true)`;
        const noGlobal =
          await tx`select count(*)::int n from public.nutrition_global_templates`;
        expect(noGlobal[0]?.n).toBe(globalCountBefore[0]?.n);

        const eligible = await asActor(
          tx,
          f.trainerA.userId,
          () => tx`select public.create_nutrition_workspace_template(
          ${f.wsA.id}, 'Eligible', ${tx.json(doc('eligible'))}, 1, ${randomUUID()}) result`,
        );
        const eligibleId = (eligible[0]!.result as { template_id: string })
          .template_id;
        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.po.userId,
              () => sp`select public.make_nutrition_template_global(
          ${f.wsA.id}, ${eligibleId}, 2, ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({ code: '40001' });
        const promoted = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.make_nutrition_template_global(
          ${f.wsA.id}, ${eligibleId}, 1, ${promotionKey}) result`,
        );
        expect(promoted[0]?.result).toMatchObject({ version: 1 });
        expect(
          (promoted[0]!.result as { template_id: string }).template_id,
        ).not.toBe(eligibleId);
        const replay = await asActor(
          tx,
          f.po.userId,
          () => tx`select public.make_nutrition_template_global(
          ${f.wsA.id}, ${eligibleId}, 1, ${promotionKey}) result`,
        );
        expect(replay[0]?.result).toEqual(promoted[0]?.result);
        const original =
          await tx`select display_name, current_version from public.nutrition_workspace_templates
          where workspace_id=${f.wsA.id} and id=${eligibleId}`;
        expect(original[0]).toMatchObject({
          display_name: 'Eligible',
          current_version: 1,
        });
        const sourceVersion =
          await tx`select document from public.nutrition_workspace_template_versions
          where workspace_id=${f.wsA.id} and template_id=${eligibleId} and version=1`;
        const globalVersion =
          await tx`select document from public.nutrition_global_template_versions
          where template_id=${(promoted[0]!.result as { template_id: string }).template_id} and version=1`;
        expect(
          (sourceVersion[0]!.document as { dayTypes: { id: string }[] })
            .dayTypes[0]?.id,
        ).toBe('eligible');
        expect(
          (globalVersion[0]!.document as { dayTypes: { id: string }[] })
            .dayTypes[0]?.id,
        ).not.toBe('eligible');

        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.trainerA.userId,
              () => sp`select public.make_nutrition_template_global(
          ${f.wsA.id}, ${eligibleId}, 1, ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({ code: '42501' });

        const retired = await asActor(
          tx,
          f.trainerA.userId,
          () => tx`select public.create_nutrition_workspace_template(
          ${f.wsA.id}, 'Retired', ${tx.json(doc('retired'))}, 1, ${randomUUID()}) result`,
        );
        const retiredId = (retired[0]!.result as { template_id: string })
          .template_id;
        await asActor(
          tx,
          f.po.userId,
          () => tx`select public.retire_nutrition_workspace_template(
          ${f.wsA.id}, ${retiredId}, 1, ${randomUUID()})`,
        );
        await expect(
          tx.savepoint((sp) =>
            asActor(
              sp,
              f.po.userId,
              () => sp`select public.make_nutrition_template_global(
          ${f.wsA.id}, ${retiredId}, 1, ${randomUUID()})`,
            ),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });
});
