import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from './client-notes-fixture';

let fixture: ClientNotesFixture;
const db = () => fixture.db;

beforeAll(async () => {
  fixture = await clientNotesFixture();
});
afterAll(async () => fixture?.close());

describe('F17 T018 plan creation', () => {
  it('returns one plan root for concurrent duplicate blank-plan submits', async () => {
    const operationKey = randomUUID();
    const workspaceId = fixture.workspaceId;
    const clientId = fixture.clientId;
    const submit = () =>
      fixture.context.trainerA.client.rpc('create_plan_draft', {
        p_workspace_id: workspaceId,
        p_client_id: clientId,
        p_plan_kind: 'workout',
        p_content: { schema_version: 1, days: [] },
        p_operation_key: operationKey,
      });

    const results = await Promise.all(Array.from({ length: 12 }, submit));
    expect(results.every((result) => result.error === null)).toBe(true);
    const planIds = new Set(results.map((result) => result.data));
    expect(planIds.size).toBe(1);
    const planId = results[0]?.data;

    const counts = await db()`
      select
        (select count(*)::int from public.plan_roots where id = ${planId}) as roots,
        (select count(*)::int from public.plan_drafts where plan_id = ${planId}) as drafts,
        (select count(*)::int from app_private.plan_operation_keys
          where workspace_id = ${workspaceId}
            and actor_user_id = ${fixture.context.trainerA.userId}
            and operation_key = ${operationKey}) as receipts
    `;
    expect(counts[0]).toEqual({ roots: 1, drafts: 1, receipts: 1 });
  });

  it('denies Sales, foreign staff and clients generically without writes', async () => {
    const operationKeys = [randomUUID(), randomUUID(), randomUUID()];
    const actors = [
      fixture.context.salesA,
      fixture.context.trainerB,
      fixture.context.actors.client,
    ];
    const before = await db()`
      select
        (select count(*)::int from public.plan_roots) as roots,
        (select count(*)::int from public.plan_drafts) as drafts,
        (select count(*)::int from app_private.plan_operation_keys) as receipts
    `;

    const results = await Promise.all(
      actors.map((actor, index) =>
        actor.client.rpc('create_plan_draft', {
          p_workspace_id: fixture.workspaceId,
          p_client_id: fixture.clientId,
          p_plan_kind: 'workout',
          p_content: { schema_version: 1, days: [] },
          p_operation_key: operationKeys[index],
        }),
      ),
    );

    expect(results.map((result) => result.error?.message)).toEqual([
      'not_permitted',
      'not_permitted',
      'not_permitted',
    ]);
    const after = await db()`
      select
        (select count(*)::int from public.plan_roots) as roots,
        (select count(*)::int from public.plan_drafts) as drafts,
        (select count(*)::int from app_private.plan_operation_keys) as receipts
    `;
    expect(after[0]).toEqual(before[0]);
    const deniedReceipts = await db()`
      select count(*)::int as count from app_private.plan_operation_keys
      where operation_key = any(${db().array(operationKeys)}::uuid[])
    `;
    expect(deniedReceipts[0]?.count).toBe(0);
  });
});
