'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '../../../lib/auth/actor';
import { createWorkspace } from '../../../lib/workspaces/create';
import { createSessionClient } from '../../../lib/supabase/server';

export async function createWorkspaceAction(input: unknown) {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') return { status: 'forbidden' as const };
  if (!input || typeof input !== 'object') return { status: 'error' as const };
  const value = input as Record<string, unknown>;
  const client = await createSessionClient();
  if (!client) return { status: 'error' as const };
  const result = await createWorkspace(client, actor, {
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' ? value.name : '',
    slug: typeof value.slug === 'string' ? value.slug : '',
  });
  if (result.status === 'created' || result.status === 'existing')
    revalidatePath('/workspaces');
  return result;
}
