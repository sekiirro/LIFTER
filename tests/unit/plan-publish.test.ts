import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publishWorkoutPlan } from '../../lib/plans/publish';

function fixture() {
  const workspaceId = randomUUID();
  const maybeSingle = vi.fn(async () => ({
    data: { workspace_id: workspaceId, plan_kind: 'workout' },
    error: null,
  }));
  const rpc = vi.fn<
    (...args: unknown[]) => Promise<{ data: unknown; error: null }>
  >(async () => ({
    data: {
      status: 'ok',
      plan_id: randomUUID(),
      revision_id: randomUUID(),
      revision_number: 3,
      delivery_id: randomUUID(),
      subscription_id: randomUUID(),
    },
    error: null,
  }));
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })),
    rpc,
  } as unknown as SupabaseClient;
  const actor = {
    userId: randomUUID(),
    role: 'trainer' as const,
    activeWorkspaceIds: [workspaceId],
  };
  return { actor, client, maybeSingle, rpc, workspaceId };
}

describe('F17 T020 workout plan publish API', () => {
  it('publishes the explicitly selected draft and prior revision through F19', async () => {
    const f = fixture();
    const planId = randomUUID();
    const operationKey = randomUUID();

    const result = await publishWorkoutPlan(
      {
        planId,
        expectedDraftVersion: 4,
        expectedPublishedRevision: 2,
        operationKey,
      },
      { actor: f.actor, client: f.client },
    );

    expect(result).toEqual({
      status: 'ok',
      receipt: {
        planId: expect.any(String),
        revisionId: expect.any(String),
        revisionNumber: 3,
      },
    });
    expect(f.rpc).toHaveBeenCalledWith('ready_and_publish_plan', {
      p_plan_id: planId,
      p_expected_draft_version: 4,
      p_expected_published_version: 2,
      p_operation_key: operationKey,
    });
  });

  it('preserves F19 gate refusals without making a second write', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: { status: 'not_permitted' }, error: null });

    const result = await publishWorkoutPlan(
      {
        planId: randomUUID(),
        expectedDraftVersion: 1,
        expectedPublishedRevision: 0,
        operationKey: randomUUID(),
      },
      { actor: f.actor, client: f.client },
    );

    expect(result).toEqual({ status: 'not_permitted' });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });

  it('denies unauthorized plans before calling F19', async () => {
    const f = fixture();
    const result = await publishWorkoutPlan(
      {
        planId: randomUUID(),
        expectedDraftVersion: 1,
        expectedPublishedRevision: 0,
        operationKey: randomUUID(),
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
