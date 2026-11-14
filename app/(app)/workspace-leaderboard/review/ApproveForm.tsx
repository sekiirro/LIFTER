'use client';

import { useActionState } from 'react';
import styles from '../../../../components/leaderboard/leaderboard.module.css';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import type { DecisionStatus } from '../../../../lib/leaderboard/service';
import type { DecisionActionState } from '../actions';

export type DecisionMessages = {
  approved: string;
  rejected: string;
  /** Existing approved generic failure (reused catalog key). */
  failed: string;
};

/**
 * Maps a decision result to feedback. The RPC returns `already_decided`
 * only when the publication already holds the requested decision (a replay),
 * so that is reported as the requested outcome. A `conflict` (the opposite
 * decision won), a stale id or a failure never claims an outcome.
 */
export function decisionNotice(
  status: DecisionStatus | 'idle',
  decision: 'approve' | 'reject',
  messages: DecisionMessages,
): { tone: 'success' | 'error'; title: string; done: boolean } | null {
  if (status === 'idle') return null;
  const outcome =
    status === 'already_decided'
      ? decision === 'approve'
        ? 'approved'
        : 'rejected'
      : status;
  if (outcome === 'approved')
    return { tone: 'success', title: messages.approved, done: true };
  if (outcome === 'rejected')
    return { tone: 'success', title: messages.rejected, done: true };
  return { tone: 'error', title: messages.failed, done: false };
}

/**
 * FR-003/FR-028 PO approval control. The reject control is not rendered:
 * its button label is not approved copy (PO-DECISION-NEEDED); the reject
 * action and its result message already exist.
 */
export function ApproveForm({
  action,
  publicationId,
  label,
  approvedMessage,
  rejectedMessage,
  failedMessage,
}: {
  action: (
    previous: DecisionActionState,
    formData: FormData,
  ) => Promise<DecisionActionState>;
  publicationId: string;
  label: string;
  approvedMessage: string;
  rejectedMessage: string;
  failedMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
  } satisfies DecisionActionState);
  const notice = decisionNotice(state.status, 'approve', {
    approved: approvedMessage,
    rejected: rejectedMessage,
    failed: failedMessage,
  });
  if (notice?.done) return <Alert tone={notice.tone} title={notice.title} />;
  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="publicationId" value={publicationId} />
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
      {notice && <Alert tone={notice.tone} title={notice.title} />}
    </form>
  );
}
