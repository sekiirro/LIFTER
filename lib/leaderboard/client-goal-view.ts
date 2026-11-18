import { isGoalType, type GoalType } from './goals';

/**
 * Pure projections for the staff Goals section (PO 2026-11-14). The near-term
 * goal is the client's F15 T01 free-text answer, read through F15's audited
 * `read_form_answer`; it is shown to coaching staff as a reference only and
 * is never logged, audited as a value, or used in scoring.
 */
export const NEAR_TERM_GOAL_QUESTION_ID = 'T01';
/** The F15 starter caps T01 at 150 characters; never render more. */
export const NEAR_TERM_GOAL_MAX_LENGTH = 150;

export type ClientGoalRead =
  | {
      status: 'ok';
      goalType: GoalType | null;
      referenceAssignmentId: string | null;
    }
  | { status: 'not_permitted' | 'not_found' | 'unavailable' };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseClientGoalRead(value: unknown): ClientGoalRead {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { status: 'unavailable' };
  const record = value as Record<string, unknown>;
  if (record.status === 'not_permitted' || record.status === 'not_found')
    return { status: record.status };
  if (record.status !== 'ok') return { status: 'unavailable' };
  const goalType = record.goal_type;
  const reference = record.reference_assignment_id;
  if (!(goalType === null || isGoalType(goalType)))
    return { status: 'unavailable' };
  if (!(
    reference === null ||
    (typeof reference === 'string' && UUID.test(reference))
  ))
    return { status: 'unavailable' };
  return {
    status: 'ok',
    goalType: goalType as GoalType | null,
    referenceAssignmentId: reference as string | null,
  };
}

/** Only the T01 string leaves the F15 answer payload; everything else is dropped. */
export function extractNearTermGoal(answers: unknown): string | null {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    return null;
  const value = (answers as Record<string, unknown>)[
    NEAR_TERM_GOAL_QUESTION_ID
  ];
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length === 0
    ? null
    : Array.from(text).slice(0, NEAR_TERM_GOAL_MAX_LENGTH).join('');
}

export type GoalTypeUpdateStatus =
  | 'updated'
  | 'unchanged'
  | 'invalid_input'
  | 'not_found'
  | 'not_permitted'
  | 'unavailable';

export function parseGoalTypeUpdate(value: unknown): GoalTypeUpdateStatus {
  const status =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { status?: unknown }).status
      : undefined;
  return status === 'updated' ||
    status === 'unchanged' ||
    status === 'invalid_input' ||
    status === 'not_found' ||
    status === 'not_permitted'
    ? status
    : 'unavailable';
}
