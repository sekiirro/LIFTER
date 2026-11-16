import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createWorkoutPlan } from '../../lib/plans/create';

function fixture(workspaceId: string) {
  const rpc = vi.fn(async () => ({ data: randomUUID(), error: null }));
  const maybeSingle = vi.fn(async () => ({
    data: { workspace_id: workspaceId },
    error: null,
  }));
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    rpc,
  } as unknown as SupabaseClient;
  const actor = {
    userId: randomUUID(),
    role: 'trainer' as const,
    activeWorkspaceIds: [workspaceId],
  };
  return { actor, client, maybeSingle, rpc };
}

describe('create workout plan API', () => {
  it('creates blank plans through the F19 root RPC with a stable operation key', async () => {
    const workspaceId = randomUUID();
    const f = fixture(workspaceId);
    const clientId = randomUUID();
    const operationKey = randomUUID();

    const result = await createWorkoutPlan(
      {
        createMode: 'blank',
        clientId,
        kind: 'workout',
        operationKey,
      },
      { actor: f.actor, client: f.client },
    );

    expect(result.status).toBe('ok');
    expect(f.rpc).toHaveBeenCalledWith('create_plan_draft', {
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_plan_kind: 'workout',
      p_content: { schema_version: 1, days: [] },
      p_operation_key: operationKey,
    });
  });

  it.each([
    {
      createMode: 'template' as const,
      templateId: randomUUID(),
      templateVersion: 2,
    },
    { createMode: 'existing_plan' as const, sourcePlanId: randomUUID() },
  ])('routes $createMode creation through the F19 copy RPC', async (mode) => {
    const workspaceId = randomUUID();
    const f = fixture(workspaceId);
    const clientId = randomUUID();
    const operationKey = randomUUID();

    const result = await createWorkoutPlan(
      {
        ...mode,
        clientId,
        kind: 'workout',
        operationKey,
      },
      { actor: f.actor, client: f.client },
    );

    expect(result.status).toBe('ok');
    expect(f.rpc).toHaveBeenCalledWith('copy_plan_to_draft', {
      p_workspace_id: workspaceId,
      p_target_client_id: clientId,
      p_create_mode: mode.createMode,
      p_source_id:
        mode.createMode === 'template' ? mode.templateId : mode.sourcePlanId,
      p_operation_key: operationKey,
      p_template_version:
        mode.createMode === 'template' ? mode.templateVersion : null,
    });
  });

  it('rejects mode-mismatched source fields before any RPC write', async () => {
    const workspaceId = randomUUID();
    const f = fixture(workspaceId);
    const result = await createWorkoutPlan(
      {
        createMode: 'blank',
        clientId: randomUUID(),
        kind: 'workout',
        operationKey: randomUUID(),
        templateVersion: 2,
      },
      { actor: f.actor, client: f.client },
    );

    expect(result).toEqual({ status: 'invalid_input' });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['sales', 'sales'],
    ['foreign trainer', 'trainer'],
    ['client', null],
  ] as const)('denies %s before any RPC write', async (_label, role) => {
    const workspaceId = randomUUID();
    const f = fixture(workspaceId);
    const actor = { ...f.actor, role, activeWorkspaceIds: [] };

    const result = await createWorkoutPlan(
      {
        createMode: 'blank',
        clientId: randomUUID(),
        kind: 'workout',
        operationKey: randomUUID(),
      },
      { actor, client: f.client },
    );

    expect(result).toEqual({ status: 'not_permitted' });
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
