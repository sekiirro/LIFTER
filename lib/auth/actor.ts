import type { SupabaseClient } from '@supabase/supabase-js';
import type { Actor } from './authorize';
import type { Role } from './capabilities';

export function actorFromRows(
  userId: string,
  staff: { role: Role } | null,
  memberships: { workspace_id: string; revoked_at: string | null }[],
): Actor {
  return {
    userId,
    role: staff?.role ?? null,
    activeWorkspaceIds: [
      ...new Set(
        memberships
          .filter((row) => row.revoked_at === null)
          .map((row) => row.workspace_id),
      ),
    ],
  };
}

export async function loadActorRows(
  client: SupabaseClient,
  userId: string,
): Promise<Actor | null> {
  const [staff, memberships] = await Promise.all([
    client
      .from('staff_profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('workspace_memberships')
      .select('workspace_id, revoked_at')
      .eq('user_id', userId),
  ]);
  if (staff.error || memberships.error) return null;
  return actorFromRows(userId, staff.data, memberships.data ?? []);
}

export async function getActor(): Promise<Actor | null> {
  try {
    const { createSessionClient } = await import('../supabase/server');
    const client = await createSessionClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return await loadActorRows(client, data.user.id);
  } catch {
    return null;
  }
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (actor) return actor;
  const { redirect } = await import('next/navigation');
  return redirect('/login');
}
