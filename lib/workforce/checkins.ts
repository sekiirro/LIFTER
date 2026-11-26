import { createSessionClient } from '../supabase/server';
import type { TrainerCheckinRow } from './types';

export type ReadCheckinsResult =
  | { status: 'ok'; checkins: TrainerCheckinRow[] }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export async function readTrainerCheckins(params: {
  workspaceId: string;
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
  limit?: number;
  offset?: number;
}): Promise<ReadCheckinsResult> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };

  const { data, error } = await client.rpc('get_trainer_checkins', {
    p_workspace_id: params.workspaceId,
    p_from: params.from,
    p_to: params.to,
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  });

  if (error) {
    if (error.code === '42501') return { status: 'denied' };
    return { status: 'error', message: error.message };
  }

  return { status: 'ok', checkins: (data as TrainerCheckinRow[]) ?? [] };
}

export type ConfirmFollowupResult =
  | { status: 'ok'; transitionId: string }
  | { status: 'already_recorded'; transitionId: string }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export async function confirmTrainerCheckinFollowup(params: {
  workspaceId: string;
  assignmentId: string;
  wasAlreadyFollowedUp?: boolean;
}): Promise<ConfirmFollowupResult> {
  if (params.wasAlreadyFollowedUp) {
    return { status: 'already_recorded', transitionId: '' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'denied' };

  const { data, error } = await client.rpc('confirm_trainer_checkin_followup', {
    p_workspace_id: params.workspaceId,
    p_assignment_id: params.assignmentId,
  });

  if (error) {
    if (error.code === '42501') return { status: 'denied' };
    return { status: 'error', message: error.message };
  }

  const res = data as { status?: string; transition_id?: string } | null;
  if (!res || res.status !== 'ok') {
    return { status: 'error', message: 'Unknown error' };
  }

  return {
    status: 'ok',
    transitionId: res.transition_id ?? '',
  };
}
