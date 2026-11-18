'use client';

import { useActionState, useId } from 'react';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import fieldStyles from '../ui/Field.module.css';
import { GOAL_TYPES, type GoalType } from '../../lib/leaderboard/goals';
import type { GoalTypeUpdateStatus } from '../../lib/leaderboard/client-goal-view';
import styles from './ClientGoals.module.css';

export type ClientGoalsMessages = {
  title: string;
  goalType: string;
  goalTypes: Record<GoalType, string>;
  notSet: string;
  nearTermGoal: string;
  nearTermGoalEmpty: string;
  save: string;
  saved: string;
  failed: string;
};

type ActionState = { status: GoalTypeUpdateStatus | 'idle' };

export function goalNotice(
  status: GoalTypeUpdateStatus | 'idle',
  messages: ClientGoalsMessages,
): { tone: 'success' | 'error'; title: string } | null {
  if (status === 'idle') return null;
  if (status === 'updated' || status === 'unchanged')
    return { tone: 'success', title: messages.saved };
  return { tone: 'error', title: messages.failed };
}

/**
 * Staff Client Details Goals section (PO 2026-11-14): the trainer-set Goal
 * Type and the client's F15 near-term goal answer as a read-only reference.
 */
export function ClientGoals({
  action,
  workspaceId,
  clientId,
  goalType,
  nearTermGoal,
  messages,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  workspaceId: string;
  clientId: string;
  goalType: GoalType | null;
  nearTermGoal:
    { status: 'answered'; text: string } | { status: 'empty' | 'unavailable' };
  messages: ClientGoalsMessages;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
  } satisfies ActionState);
  const titleId = useId();
  const selectId = useId();
  const notice = goalNotice(state.status, messages);
  return (
    <Card as="section" className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId}>{messages.title}</h2>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="clientId" value={clientId} />
        <div className={fieldStyles.field}>
          <label htmlFor={selectId}>{messages.goalType}</label>
          <select
            id={selectId}
            name="goalType"
            className={fieldStyles.input}
            defaultValue={goalType ?? ''}
            required
            disabled={pending}
          >
            {goalType === null && (
              <option value="" disabled>
                {messages.notSet}
              </option>
            )}
            {GOAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {messages.goalTypes[type]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {messages.save}
        </Button>
        {notice && <Alert tone={notice.tone} title={notice.title} />}
      </form>
      <div className={styles.reference}>
        <h3>{messages.nearTermGoal}</h3>
        {nearTermGoal.status === 'answered' ? (
          <p className={styles.answer}>
            <Bidi>{nearTermGoal.text}</Bidi>
          </p>
        ) : nearTermGoal.status === 'empty' ? (
          <p className={styles.muted}>{messages.nearTermGoalEmpty}</p>
        ) : (
          <p className={styles.muted}>{messages.failed}</p>
        )}
      </div>
    </Card>
  );
}
