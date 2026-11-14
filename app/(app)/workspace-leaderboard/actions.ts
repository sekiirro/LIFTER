'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '../../../lib/auth/actor';
import {
  decideLeaderboardCandidate,
  type DecisionStatus,
} from '../../../lib/leaderboard/service';
import { isUuid } from '../../../lib/registration-links/validation';

export type DecisionActionState = { status: DecisionStatus | 'idle' };

async function decide(
  formData: FormData,
  decision: 'approve' | 'reject',
): Promise<DecisionActionState> {
  const publicationId = formData.get('publicationId');
  if (typeof publicationId !== 'string' || !isUuid(publicationId))
    return { status: 'invalid_input' };
  const status = await decideLeaderboardCandidate(
    await getActor(),
    publicationId,
    decision,
  );
  if (status === 'approved' || status === 'rejected') {
    revalidatePath('/workspace-leaderboard');
    revalidatePath('/workspace-leaderboard/review');
    revalidatePath('/leaderboard');
  }
  return { status };
}

/** FR-003/FR-028: PO-only approval after the off-app WhatsApp verification. */
export async function approveLeaderboardAction(
  _previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  return decide(formData, 'approve');
}

/**
 * FR-020/FR-026: PO-only rejection. Not rendered yet: the reject button label
 * is not in the approved copy (PO-DECISION-NEEDED).
 */
export async function rejectLeaderboardAction(
  _previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  return decide(formData, 'reject');
}
