'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireActor } from '../../../../lib/auth/actor';
import type {
  StrikeOperation,
  StrikeReasonCode,
} from '../../../../lib/workforce/strikes';
import { createSessionClient } from '../../../../lib/supabase/server';

export type CorrectStrikeResult =
  | { status: 'ok'; replayed: boolean }
  | { status: 'denied' | 'error' | 'invalid' };

const reasonCodes = new Set<StrikeReasonCode>([
  'client_caused_delay',
  'system_issue',
  'wrong_trainer',
  'duplicate',
  'po_exception',
]);

export async function correctStrikeAction(input: {
  workspaceId: string;
  strikeId: string;
  operation: StrikeOperation;
  targetTrainerUserId: string | null;
  reasonCode: StrikeReasonCode;
}): Promise<CorrectStrikeResult> {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') return { status: 'denied' };
  if (
    !input.workspaceId ||
    !input.strikeId ||
    !['void', 'reinstate', 'reattribute'].includes(input.operation) ||
    !reasonCodes.has(input.reasonCode) ||
    (input.operation === 'reattribute') !== (input.targetTrainerUserId !== null)
  ) {
    return { status: 'invalid' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'denied' };
  const { data, error } = await client.rpc('correct_workforce_strike', {
    p_workspace_id: input.workspaceId,
    p_strike_id: input.strikeId,
    p_operation: input.operation,
    p_target_trainer_user_id: input.targetTrainerUserId,
    p_reason_code: input.reasonCode,
    p_idempotency_key: randomUUID(),
  });
  if (error) {
    if (error.code === '42501' || error.message.includes('not_permitted')) {
      return { status: 'denied' };
    }
    return { status: 'error' };
  }
  const result = data as { status?: string; replayed?: boolean } | null;
  if (result?.status !== 'ok') return { status: 'error' };
  revalidatePath('/workforce/strikes');
  return { status: 'ok', replayed: result.replayed === true };
}
