'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '../../../../lib/auth/actor';
import { isUuid } from '../../../../lib/client-notes/validation';
import type { GoalTypeUpdateStatus } from '../../../../lib/leaderboard/client-goal-view';
import { setClientGoalType } from '../../../../lib/leaderboard/client-goals';

export type GoalTypeActionState = { status: GoalTypeUpdateStatus | 'idle' };

/** PO 2026-11-14: trainers set or update a client's goal type (FR-018). */
export async function setClientGoalTypeAction(
  _previous: GoalTypeActionState,
  formData: FormData,
): Promise<GoalTypeActionState> {
  const workspaceId = formData.get('workspaceId');
  const clientId = formData.get('clientId');
  if (
    typeof workspaceId !== 'string' ||
    typeof clientId !== 'string' ||
    !isUuid(workspaceId) ||
    !isUuid(clientId)
  )
    return { status: 'invalid_input' };
  const status = await setClientGoalType(
    await getActor(),
    workspaceId,
    clientId,
    formData.get('goalType'),
  );
  if (status === 'updated') revalidatePath(`/clients/${clientId}`);
  return { status };
}
