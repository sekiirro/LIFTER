'use client';

import { useActionState } from 'react';
import styles from '../../../../components/leaderboard/leaderboard.module.css';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import type { DecisionActionState } from '../actions';

export function ApproveForm({
  action,
  publicationId,
  label,
  approvedMessage,
}: {
  action: (
    previous: DecisionActionState,
    formData: FormData,
  ) => Promise<DecisionActionState>;
  publicationId: string;
  label: string;
  approvedMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
  } satisfies DecisionActionState);
  if (state.status === 'approved' || state.status === 'already_decided')
    return <Alert tone="success" title={approvedMessage} />;
  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="publicationId" value={publicationId} />
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
