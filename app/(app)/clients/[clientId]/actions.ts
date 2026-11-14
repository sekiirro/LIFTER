'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '../../../../lib/auth/actor';
import { authorize } from '../../../../lib/auth/authorize';
import {
  parseReadyAndPublishRequest,
  readyAndPublishPlan,
  type ReadyAndPublishResult,
} from '../../../../lib/plans/ready-and-publish';
import { createSessionClient } from '../../../../lib/supabase/server';
import {
  createClientNote,
  deleteClientNote,
  readClientNotes,
  updateClientNote,
} from '../../../../lib/client-notes/service';

const CLIENT_DETAILS_PATH = '/clients/[clientId]';

export async function loadClientNotesAction(input: unknown) {
  return readClientNotes(input);
}

export async function createClientNoteAction(input: unknown) {
  const result = await createClientNote(input);
  if (result.status === 'ok') revalidatePath(CLIENT_DETAILS_PATH, 'page');
  return result;
}

export async function updateClientNoteAction(input: unknown) {
  const result = await updateClientNote(input);
  if (result.status === 'ok') revalidatePath(CLIENT_DETAILS_PATH, 'page');
  return result;
}

export async function deleteClientNoteAction(input: unknown) {
  const result = await deleteClientNote(input);
  if (result.status === 'ok') revalidatePath(CLIENT_DETAILS_PATH, 'page');
  return result;
}

/**
 * F22 US1: staff Ready & Publish through F19 only. The app wall resolves the
 * plan's workspace through the RLS-protected F19 root read and requires
 * `coaching_work` there; F19's RPC re-checks at the database wall.
 */
export async function readyAndPublishPlanAction(
  input: unknown,
): Promise<ReadyAndPublishResult> {
  const request = parseReadyAndPublishRequest(input);
  if (!request) return { status: 'invalid_input' };
  const actor = await getActor();
  if (!actor?.role) return { status: 'not_permitted' };
  const client = await createSessionClient();
  if (!client) return { status: 'unavailable' };
  const root = await client
    .from('plan_roots')
    .select('workspace_id,client_id')
    .eq('id', request.planId)
    .maybeSingle();
  if (root.error) return { status: 'unavailable' };
  if (
    !root.data ||
    typeof root.data.workspace_id !== 'string' ||
    !authorize(actor, 'coaching_work', root.data.workspace_id)
  )
    return { status: 'not_permitted' };
  const result = await readyAndPublishPlan(client, request);
  if (result.status === 'ok') revalidatePath(CLIENT_DETAILS_PATH, 'page');
  return result;
}
