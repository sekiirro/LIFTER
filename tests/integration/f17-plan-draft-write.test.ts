import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveWorkoutPlanDraft } from '../../lib/plans/draft-write';
import { parseWorkoutDocumentV1 } from '../../lib/workout-planner/document';
import type { WorkoutDocumentV1 } from '../../lib/workout-planner/document';
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

function document(): WorkoutDocumentV1 {
  return parseWorkoutDocumentV1({
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
            name: 'Squat',
            alternatives: [],
            sets: [],
          },
        ],
      },
      { id: randomUUID(), kind: 'rest', items: [] },
    ],
  });
}

async function createPlan(content: unknown) {
  const created = await fixture.context.trainerA.client.rpc(
    'create_plan_draft',
    {
      p_workspace_id: fixture.workspaceId,
      p_client_id: fixture.clientId,
      p_plan_kind: 'workout',
      p_content: content,
      p_operation_key: randomUUID(),
    },
  );
  expect(created.error).toBeNull();
  return created.data as string;
}

async function attempt(
  planId: string,
  content: unknown,
  expectedDraftVersion = 1,
) {
  const trainer = fixture.context.trainerA;
  return saveWorkoutPlanDraft(
    {
      planId,
      expectedDraftVersion,
      content: { kind: 'workout', schemaVersion: 1, document: content },
      operationKey: randomUUID(),
      intent: 'autosave',
    },
    {
      actor: {
        userId: trainer.userId,
        role: 'trainer',
        activeWorkspaceIds: [fixture.workspaceId],
      },
      client: trainer.client,
    },
  );
}

describe('F17 T019 workout draft writes', () => {
  it.each(['add', 'move'] as const)(
    'rejects a rest-day %s before persistence without changing the draft',
    async (operation) => {
      const original = document();
      const planId = await createPlan(original);
      const item = structuredClone(original.days[0]!.items[0]!);
      if (operation === 'add') item.id = randomUUID();
      const invalid = structuredClone(original);
      if (operation === 'add') {
        invalid.days[1]!.items.push(item);
      } else {
        invalid.days[0]!.items = [];
        invalid.days[1]!.items.push(item);
      }

      const before = await db()`
        select draft_version::int as draft_version, content from public.plan_drafts
        where workspace_id = ${fixture.workspaceId} and plan_id = ${planId}
      `;
      const receiptCount = await db()`
        select count(*)::int as count from app_private.plan_operation_keys
        where workspace_id = ${fixture.workspaceId} and plan_id = ${planId}
      `;

      const result = await attempt(planId, invalid);

      expect(result).toEqual({ status: 'invalid_document' });
      const after = await db()`
        select draft_version::int as draft_version, content from public.plan_drafts
        where workspace_id = ${fixture.workspaceId} and plan_id = ${planId}
      `;
      const receiptCountAfter = await db()`
        select count(*)::int as count from app_private.plan_operation_keys
        where workspace_id = ${fixture.workspaceId} and plan_id = ${planId}
      `;
      expect(after).toEqual(before);
      expect(receiptCountAfter).toEqual(receiptCount);
      expect(original.days[0]!.items).toHaveLength(1);
      expect(original.days[1]!.items).toHaveLength(0);
    },
  );

  it('uses F19 CAS and no-op autosave preserves published readiness', async () => {
    const original = document();
    const planId = await createPlan(original);
    const saved = structuredClone(original);
    saved.notes = 'saved';
    const first = await attempt(planId, saved);
    expect(first).toEqual({
      status: 'ok',
      receipt: { planId, draftVersion: 2 },
    });

    const stale = await attempt(planId, original);
    expect(stale).toEqual({ status: 'stale_version' });

    await db()`
      insert into public.plan_revisions (
        workspace_id, plan_id, revision_number, source_draft_version,
        plan_kind, content, authored_by
      ) values (
        ${fixture.workspaceId}, ${planId}, 1, 2, 'workout',
        ${db().json(JSON.parse(JSON.stringify(saved)))},
        ${fixture.context.trainerA.userId}
      )
    `;
    const noOp = await attempt(planId, saved, 2);
    expect(noOp).toEqual({
      status: 'ok',
      receipt: { planId, draftVersion: 3 },
    });

    const state = await db()`
      select d.draft_version::int as draft_version, d.content,
        (select count(*)::int from public.plan_revisions r
          where r.workspace_id = d.workspace_id and r.plan_id = d.plan_id) as revisions
      from public.plan_drafts d
      where d.workspace_id = ${fixture.workspaceId} and d.plan_id = ${planId}
    `;
    expect(state[0]?.draft_version).toBe(3);
    expect(state[0]?.content).toEqual(saved);
    expect(state[0]?.revisions).toBe(1);
  });
});
