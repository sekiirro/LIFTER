import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addWorkoutItem,
  moveWorkoutItem,
  parseWorkoutDocumentV1,
} from '../../lib/workout-planner/document';
import type { WorkoutDocumentV1 } from '../../lib/workout-planner/document';
import { saveWorkoutPlanDraft } from '../../lib/plans/draft-write';

const uid = () => randomUUID();

function workoutDocument(): WorkoutDocumentV1 {
  const item = {
    id: uid(),
    exercise: { source: 'global', identity_id: uid(), version: 1 },
    name: 'Squat',
    alternatives: [],
    sets: [],
  };
  return parseWorkoutDocumentV1({
    schema_version: 1 as const,
    days: [
      { id: uid(), kind: 'session' as const, items: [item] },
      { id: uid(), kind: 'rest' as const, items: [] },
    ],
  });
}

function fixture() {
  const workspaceId = uid();
  const maybeSingle = vi.fn(async () => ({
    data: { workspace_id: workspaceId, plan_kind: 'workout' },
    error: null,
  }));
  const rpc = vi.fn<
    (...args: unknown[]) => Promise<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>
  >(async () => ({ data: 5, error: null }));
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    rpc,
  } as unknown as SupabaseClient;
  const actor = {
    userId: uid(),
    role: 'trainer' as const,
    activeWorkspaceIds: [workspaceId],
  };
  return { actor, client, maybeSingle, rpc, workspaceId };
}

describe('T019 plan draft write API', () => {
  it.each(['add', 'move'] as const)(
    'rejects a rest-day %s before persistence and preserves the source document',
    async (operation) => {
      const f = fixture();
      const document = workoutDocument();
      const before = structuredClone(document);
      let attempted = document;
      if (operation === 'add') {
        const item = structuredClone(document.days[0]!.items[0]!);
        item.id = uid();
        attempted = structuredClone(document);
        attempted.days[1]!.items.push(item);
        expect(() =>
          addWorkoutItem(document, document.days[1]!.id, item),
        ).toThrow('invalid_document');
      } else {
        expect(() =>
          moveWorkoutItem(
            document,
            document.days[0]!.items[0]!.id,
            document.days[1]!.id,
          ),
        ).toThrow('invalid_document');
        const moved = structuredClone(document);
        const item = moved.days[0]!.items.pop()!;
        moved.days[1]!.items.push(item);
        attempted = moved;
      }

      const result = await saveWorkoutPlanDraft(
        {
          planId: uid(),
          expectedDraftVersion: 1,
          content: { kind: 'workout', schemaVersion: 1, document: attempted },
          operationKey: uid(),
          intent: 'autosave',
        },
        { actor: f.actor, client: f.client },
      );

      expect(result).toEqual({ status: 'invalid_document' });
      expect(f.rpc).not.toHaveBeenCalled();
      expect(document).toEqual(before);
    },
  );

  it('sends autosave and save-as-draft through F19 CAS with the expected revision', async () => {
    const f = fixture();
    const planId = uid();
    const document = workoutDocument();
    const request = {
      planId,
      expectedDraftVersion: 4,
      content: { kind: 'workout' as const, schemaVersion: 1, document },
      operationKey: uid(),
      intent: 'autosave' as const,
    };

    const result = await saveWorkoutPlanDraft(request, {
      actor: f.actor,
      client: f.client,
    });

    expect(result).toEqual({
      status: 'ok',
      receipt: { planId, draftVersion: 5 },
    });
    expect(f.rpc).toHaveBeenCalledWith('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 4,
      p_content: document,
      p_operation_key: request.operationKey,
    });
  });

  it('keeps stale revisions as conflicts', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'stale_version' },
    });
    const document = workoutDocument();

    const result = await saveWorkoutPlanDraft(
      {
        planId: uid(),
        expectedDraftVersion: 1,
        content: { kind: 'workout', schemaVersion: 1, document },
        operationKey: uid(),
        intent: 'save_draft',
      },
      { actor: f.actor, client: f.client },
    );

    expect(result).toEqual({ status: 'stale_version' });
  });

  it('authorizes the plan before reporting invalid workout content', async () => {
    const f = fixture();
    const document = workoutDocument();
    document.days[1]!.items.push(structuredClone(document.days[0]!.items[0]!));

    const result = await saveWorkoutPlanDraft(
      {
        planId: uid(),
        expectedDraftVersion: 1,
        content: { kind: 'workout', schemaVersion: 1, document },
        operationKey: uid(),
        intent: 'autosave',
      },
      {
        actor: { ...f.actor, role: 'sales', activeWorkspaceIds: [] },
        client: f.client,
      },
    );

    expect(result).toEqual({ status: 'not_permitted' });
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
