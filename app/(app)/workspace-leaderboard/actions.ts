'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '../../../lib/auth/actor';
import {
  decideLeaderboardCandidate,
  generateLeaderboardCandidateFromSpec023,
  type CandidateStatus,
  type DecisionStatus,
} from '../../../lib/leaderboard/service';
import { isUuid } from '../../../lib/registration-links/validation';

export type DecisionActionState = {
  status: DecisionStatus | 'idle';
  decision: 'approve' | 'reject';
};

function revalidateLeaderboard() {
  revalidatePath('/workspace-leaderboard');
  revalidatePath('/workspace-leaderboard/review');
  revalidatePath('/leaderboard');
}

/**
 * FR-003/FR-020/FR-026/FR-028: the PO approves or rejects the pending
 * candidate after the off-app WhatsApp verification. The decision comes from
 * the submitting button; anything else is invalid.
 */
export async function decideLeaderboardAction(
  previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  const raw = formData.get('decision');
  const decision = raw === 'approve' || raw === 'reject' ? raw : null;
  const publicationId = formData.get('publicationId');
  if (!decision || typeof publicationId !== 'string' || !isUuid(publicationId))
    return { status: 'invalid_input', decision: previous.decision };
  const status = await decideLeaderboardCandidate(
    await getActor(),
    publicationId,
    decision,
  );
  if (
    status === 'approved' ||
    status === 'rejected' ||
    status === 'already_decided'
  )
    revalidateLeaderboard();
  return { status, decision };
}

export type GenerateActionState = { status: CandidateStatus | 'idle' };

/** PO-only: prepare this month's candidate from spec 023 data (FR-019). */
export async function generateLeaderboardAction(
  _previous: GenerateActionState,
  formData: FormData,
): Promise<GenerateActionState> {
  const workspaceId = formData.get('workspaceId');
  if (typeof workspaceId !== 'string' || !isUuid(workspaceId))
    return { status: 'invalid_input' };
  const status = await generateLeaderboardCandidateFromSpec023(
    await getActor(),
    workspaceId,
  );
  if (status === 'created' || status === 'replayed') revalidateLeaderboard();
  return { status };
}
