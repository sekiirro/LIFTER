import 'server-only';
import type { Actor } from '../auth/authorize';
import { roleHasCapability } from '../auth/capabilities';
import { createSessionClient } from '../supabase/server';
import {
  extractNearTermGoal,
  parseClientGoalRead,
  parseGoalTypeUpdate,
  type GoalTypeUpdateStatus,
} from './client-goal-view';
import { isGoalType, type GoalType } from './goals';

/**
 * Staff Goals section boundary (PO 2026-11-14). The app wall requires the
 * coaching_work capability (trainer, workspace owner, PO; never Sales); the
 * RPCs re-check it with workspace membership. Errors map to fixed statuses
 * and no answer text or provider diagnostic is ever logged.
 */
export type ClientGoalView =
  | {
      status: 'ok';
      goalType: GoalType | null;
      nearTermGoal:
        | { status: 'answered'; text: string }
        | { status: 'empty' | 'unavailable' };
    }
  | { status: 'not_permitted' | 'not_found' | 'unavailable' };

function canCoach(actor: Actor | null): boolean {
  return Boolean(actor?.role && roleHasCapability(actor.role, 'coaching_work'));
}

export async function readClientGoal(
  actor: Actor | null,
  workspaceId: string,
  clientId: string,
): Promise<ClientGoalView> {
  if (!canCoach(actor)) return { status: 'not_permitted' };
  try {
    const client = await createSessionClient();
    if (!client) return { status: 'unavailable' };
    const read = await client.rpc('client_goal_read', {
      p_workspace_id: workspaceId,
      p_client_id: clientId,
    });
    const goal = read.error
      ? ({ status: 'unavailable' } as const)
      : parseClientGoalRead(read.data);
    if (goal.status !== 'ok') return goal;
    if (!goal.referenceAssignmentId)
      return {
        status: 'ok',
        goalType: goal.goalType,
        nearTermGoal: { status: 'empty' },
      };
    // F15's single audited answer reader; only the T01 string is kept.
    const answer = await client.rpc('read_form_answer', {
      p_workspace_id: workspaceId,
      p_assignment_id: goal.referenceAssignmentId,
      p_view: 'current',
    });
    if (answer.error)
      return {
        status: 'ok',
        goalType: goal.goalType,
        nearTermGoal: { status: 'unavailable' },
      };
    const text = extractNearTermGoal(answer.data);
    return {
      status: 'ok',
      goalType: goal.goalType,
      nearTermGoal: text ? { status: 'answered', text } : { status: 'empty' },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function setClientGoalType(
  actor: Actor | null,
  workspaceId: string,
  clientId: string,
  goalType: unknown,
): Promise<GoalTypeUpdateStatus> {
  if (!canCoach(actor)) return 'not_permitted';
  if (!isGoalType(goalType)) return 'invalid_input';
  try {
    const client = await createSessionClient();
    if (!client) return 'unavailable';
    const result = await client.rpc('set_client_goal_type', {
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_goal_type: goalType,
    });
    return result.error ? 'unavailable' : parseGoalTypeUpdate(result.data);
  } catch {
    return 'unavailable';
  }
}
