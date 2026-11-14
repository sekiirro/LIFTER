import 'server-only';
import type { Actor } from '../../../lib/auth/authorize';
import { createSessionClient } from '../../../lib/supabase/server';

export type WorkspaceOption = { id: string; name: string };

/** Workspaces the actor may view; RLS on public.workspaces applies as well. */
export async function loadViewableWorkspaces(
  actor: Actor,
): Promise<WorkspaceOption[] | null> {
  try {
    const client = await createSessionClient();
    if (!client) return null;
    const query = client.from('workspaces').select('id,name').order('name');
    const result =
      actor.role === 'platform_owner'
        ? await query
        : await query.in('id', [...actor.activeWorkspaceIds]);
    return result.error ? null : (result.data as WorkspaceOption[]);
  } catch {
    return null;
  }
}

/** A requested workspace is honored only when it is in the viewable list. */
export function selectWorkspace(
  workspaces: readonly WorkspaceOption[],
  requested: string | string[] | undefined,
): WorkspaceOption | null {
  if (Array.isArray(requested)) return null;
  if (requested === undefined) return workspaces[0] ?? null;
  return workspaces.find((workspace) => workspace.id === requested) ?? null;
}
