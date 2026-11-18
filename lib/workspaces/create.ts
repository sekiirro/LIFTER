import type { SupabaseClient } from '@supabase/supabase-js';
import { authorize, type Actor } from '../auth/authorize';

export type WorkspaceCreateInput = {
  /** The client key is the workspace UUID, so the database unique key serializes retries. */
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
};

export type WorkspaceCreateResult =
  | { status: 'created' | 'existing'; workspace: WorkspaceRecord }
  | { status: 'forbidden' | 'error' };

function isValidInput(input: WorkspaceCreateInput) {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.id,
    ) &&
    input.name.trim().length > 0 &&
    [...input.name].length <= 120 &&
    input.slug.length <= 50 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(input.slug)
  );
}

export async function createWorkspace(
  client: SupabaseClient,
  actor: Actor,
  input: WorkspaceCreateInput,
): Promise<WorkspaceCreateResult> {
  if (!isValidInput(input)) return { status: 'error' };
  if (!authorize(actor, 'manage_workspaces', input.id))
    return { status: 'forbidden' };

  try {
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || auth.user?.id !== actor.userId)
      return { status: 'forbidden' };

    const existing = await loadById(client, input.id);
    if (existing.status === 'error') return { status: 'error' };
    if (existing.workspace)
      return sameRequest(existing.workspace, actor.userId, input)
        ? { status: 'existing', workspace: existing.workspace }
        : { status: 'error' };

    const inserted = await client
      .from('workspaces')
      .insert({ ...input, created_by: actor.userId })
      .select('id,name,slug,created_by')
      .single();
    if (!inserted.error && inserted.data)
      return { status: 'created', workspace: inserted.data };

    // A competing retry may have committed after the initial read. Re-read by the
    // unique client key and return only an exact replay by the same actor.
    const raced = await loadById(client, input.id);
    if (raced.status === 'error' || !raced.workspace)
      return { status: 'error' };
    return sameRequest(raced.workspace, actor.userId, input)
      ? { status: 'existing', workspace: raced.workspace }
      : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

async function loadById(client: SupabaseClient, id: string) {
  const result = await client
    .from('workspaces')
    .select('id,name,slug,created_by')
    .eq('id', id)
    .maybeSingle();
  if (result.error) return { status: 'error' as const };
  return {
    status: 'ok' as const,
    workspace: result.data as WorkspaceRecord | null,
  };
}

function sameRequest(
  workspace: WorkspaceRecord,
  actorId: string,
  input: WorkspaceCreateInput,
) {
  return (
    workspace.created_by === actorId &&
    workspace.name === input.name &&
    workspace.slug === input.slug
  );
}
