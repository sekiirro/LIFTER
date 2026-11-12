import 'server-only';
import { getActor } from '../auth/actor';
import { authorize } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import { isUuid, normalizeClientNoteBody } from './validation';

type Status = 'denied' | 'invalid_input' | 'not_found' | 'unavailable';
type Note = {
  id: string;
  workspace_id: string;
  client_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};
type NoteResult = { status: 'ok'; note: Note } | { status: Status };
type ReadResult = { status: 'ok'; notes: Note[] } | { status: Status };

function inputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapDatabaseError(error: { code?: string } | null): Status {
  if (error?.code === '42501') return 'denied';
  if (error?.code === '22023') return 'invalid_input';
  if (error?.code === 'P0002') return 'not_found';
  return 'unavailable';
}

async function workspaceContext(workspaceId: unknown) {
  if (!isUuid(workspaceId)) return { status: 'invalid_input' } as const;
  const actor = await getActor();
  if (!actor || !authorize(actor, 'coaching_work', workspaceId))
    return { status: 'denied' } as const;
  const client = await createSessionClient();
  if (!client) return { status: 'unavailable' } as const;
  return { status: 'ok', actor, client, workspaceId } as const;
}

export async function readClientNotes(input: unknown): Promise<ReadResult> {
  try {
    const data = inputRecord(input);
    if (!isUuid(data.clientId)) return { status: 'invalid_input' };
    const context = await workspaceContext(data.workspaceId);
    if (context.status !== 'ok') return context;
    const result = await context.client
      .from('client_notes')
      .select(
        'id,workspace_id,client_id,author_user_id,body,created_at,edited_at',
      )
      .eq('workspace_id', context.workspaceId)
      .eq('client_id', data.clientId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (result.error) return { status: 'unavailable' };
    return { status: 'ok', notes: (result.data ?? []) as Note[] };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function createClientNote(input: unknown): Promise<NoteResult> {
  try {
    const data = inputRecord(input);
    if (
      !isUuid(data.clientId) ||
      typeof data.idempotencyKey !== 'string' ||
      data.idempotencyKey.length === 0
    )
      return { status: 'invalid_input' };
    const body = normalizeClientNoteBody(data.body);
    if (body === null) return { status: 'invalid_input' };
    const context = await workspaceContext(data.workspaceId);
    if (context.status !== 'ok') return context;
    const result = await context.client.rpc('create_client_note', {
      p_workspace_id: context.workspaceId,
      p_client_id: data.clientId,
      p_body: body,
      p_idempotency_key: data.idempotencyKey,
    });
    if (result.error) return { status: mapDatabaseError(result.error) };
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row || typeof row !== 'object') return { status: 'unavailable' };
    return { status: 'ok', note: row as Note };
  } catch {
    return { status: 'unavailable' };
  }
}

async function noteContext(noteId: unknown) {
  if (!isUuid(noteId)) return { status: 'invalid_input' } as const;
  const actor = await getActor();
  if (!actor) return { status: 'denied' } as const;
  const client = await createSessionClient();
  if (!client) return { status: 'unavailable' } as const;
  const result = await client
    .from('client_notes')
    .select('id,workspace_id,client_id,author_user_id')
    .eq('id', noteId)
    .maybeSingle();
  if (result.error) return { status: 'unavailable' } as const;
  // Without a note row there is no workspace scope to prove. Keep absence
  // indistinguishable from an out-of-scope identifier at this boundary.
  if (!result.data) return { status: 'denied' } as const;
  return { status: 'ok', actor, client, note: result.data } as const;
}

export async function updateClientNote(input: unknown): Promise<NoteResult> {
  try {
    const data = inputRecord(input);
    const body = normalizeClientNoteBody(data.body);
    if (body === null) return { status: 'invalid_input' };
    const context = await noteContext(data.noteId);
    if (context.status !== 'ok') return context;
    if (
      !authorize(context.actor, 'coaching_work', context.note.workspace_id) ||
      (context.actor.role !== 'platform_owner' &&
        context.note.author_user_id !== context.actor.userId)
    )
      return { status: 'denied' };
    const result = await context.client.rpc('update_client_note', {
      p_note_id: context.note.id,
      p_body: body,
    });
    if (result.error) return { status: mapDatabaseError(result.error) };
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row || typeof row !== 'object') return { status: 'unavailable' };
    return { status: 'ok', note: row as Note };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function deleteClientNote(
  input: unknown,
): Promise<{ status: Status | 'ok' }> {
  try {
    const data = inputRecord(input);
    const context = await noteContext(data.noteId);
    if (context.status !== 'ok') return context;
    if (
      context.actor.role !== 'platform_owner' ||
      !authorize(context.actor, 'delete_client', context.note.workspace_id)
    )
      return { status: 'denied' };
    const result = await context.client.rpc('delete_client_note', {
      p_note_id: context.note.id,
    });
    if (result.error) return { status: mapDatabaseError(result.error) };
    return result.data === context.note.id
      ? { status: 'ok' }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
