'use server';

import { revalidatePath } from 'next/cache';
import {
  createClientNote,
  deleteClientNote,
  updateClientNote,
} from '../../../../lib/client-notes/service';

const CLIENT_DETAILS_PATH = '/clients/[clientId]';

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
