'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '../../../../lib/auth/actor';
import { confirmTrainerCheckinFollowup } from '../../../../lib/workforce/checkins';

export async function confirmTrainerFollowupAction(input: {
  workspaceId: string;
  assignmentId: string;
  currentFollowupStatus: string;
}) {
  const actor = await requireActor();
  if (
    !actor.role ||
    (actor.role !== 'platform_owner' && actor.role !== 'trainer')
  ) {
    return { status: 'denied' as const };
  }
  if (
    actor.role !== 'platform_owner' &&
    !actor.activeWorkspaceIds.includes(input.workspaceId)
  ) {
    return { status: 'denied' as const };
  }

  const result = await confirmTrainerCheckinFollowup({
    workspaceId: input.workspaceId,
    assignmentId: input.assignmentId,
    wasAlreadyFollowedUp: input.currentFollowupStatus === 'Followed Up',
  });

  if (result.status === 'ok' || result.status === 'already_recorded') {
    revalidatePath('/workforce/check-ins');
    revalidatePath('/trainer-check-ins');
  }

  return result;
}
