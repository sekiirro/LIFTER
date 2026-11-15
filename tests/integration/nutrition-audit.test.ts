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

describe('F18 T016 nutrition audit allowlist', () => {
  it('records exactly one ids-and-codes event for a denied selection', async () => {
    const revisionId = randomUUID();
    const denied = await f.trainerA.client.rpc('select_nutrition_alternative', {
      p_plan_version_id: revisionId,
      p_item_id: 'item-audit-denial',
      p_alternative_id: 'alternative-audit-denial',
      p_operation_key: randomUUID(),
    });
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual({ status: 'not_permitted' });

    const events = await db`
      select actor_user_id, action, target_id, workspace_id, details
      from public.audit_events
      where action = 'client.nutrition_select'
        and target_id = ${revisionId}
        and actor_user_id = ${f.trainerA.userId}
    `;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor_user_id: f.trainerA.userId,
      action: 'client.nutrition_select',
      target_id: revisionId,
      workspace_id: null,
      details: {
        revision_id: revisionId,
        item_id: 'item-audit-denial',
        alternative_id: 'alternative-audit-denial',
        outcome: 'denied',
        reason: 'not_client',
      },
    });
    expect(
      Object.keys(events[0]!.details as Record<string, unknown>).sort(),
    ).toEqual([
      'alternative_id',
      'item_id',
      'outcome',
      'reason',
      'revision_id',
    ]);
  });

  it('records one safe event for a successful template mutation and exact replay', async () => {
    const operationKey = randomUUID();
    const marker = 'LogScrubFoodName';
    const document = {
      schemaVersion: 1,
      structure: 'single_day',
      title: { ar: 'اختبار', en: marker },
      meals: [],
      dayTypes: [],
      notes: null,
    };
    const args = {
      p_workspace_id: f.wsA.id,
      p_display_name: 'Audit fixture',
      p_document: document,
      p_schema_version: 1,
      p_operation_key: operationKey,
    };

    const created = await f.trainerA.client.rpc(
      'create_nutrition_workspace_template',
      args,
    );
    expect(created.error).toBeNull();
    const templateId = (created.data as { template_id: string }).template_id;

    const replay = await f.trainerA.client.rpc(
      'create_nutrition_workspace_template',
      args,
    );
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(created.data);

    const events = await db`
      select action, target_id, workspace_id, details
      from public.audit_events
      where action = 'template.nutrition_workspace_created'
        and target_id = ${templateId}
    `;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'template.nutrition_workspace_created',
      target_id: templateId,
      workspace_id: f.wsA.id,
      details: { version: 1 },
    });
    expect(JSON.stringify(events[0])).not.toContain(marker);
  });

  it('rejects forbidden content fields at the audit table boundary', async () => {
    const insertForbidden = async (tx: Tx) =>
      tx`
        insert into public.audit_events
          (actor_user_id, action, target_table, target_id, workspace_id, details)
        values (
          ${f.trainerA.userId}, 'template.nutrition_workspace_created',
          'nutrition_workspace_templates', ${randomUUID()}, ${f.wsA.id},
          ${tx.json({ version: 1, food_name: 'Forbidden Audit Food' })}
        )
      `;

    await expect(
      db.begin((tx) => tx.savepoint(insertForbidden)),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
