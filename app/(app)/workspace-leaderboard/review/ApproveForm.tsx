'use client';

import { useActionState, type ReactNode } from 'react';
import styles from '../../../../components/leaderboard/leaderboard.module.css';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import type {
  CandidateStatus,
  DecisionStatus,
} from '../../../../lib/leaderboard/service';
import type { DecisionActionState, GenerateActionState } from '../actions';

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
 * FR-003/FR-020/FR-028 PO decision control: approve or reject the pending
 * candidate. The page renders this component whether or not a candidate is
 * pending, so the decision confirmation survives the revalidated re-render
 * in which the candidate is no longer pending. `children` is the
 * server-rendered list; `empty` is shown when nothing is pending.
 */
export function ApproveForm({
  action,
  publicationId,
  children,
  empty,
  label,
  rejectLabel,
  approvedMessage,
  rejectedMessage,
  failedMessage,
}: {
  action: (
    previous: DecisionActionState,
    formData: FormData,
  ) => Promise<DecisionActionState>;
  /** `null` when no candidate is pending. */
  publicationId: string | null;
  children?: ReactNode;
  empty: ReactNode;
  label: string;
  rejectLabel: string;
  approvedMessage: string;
  rejectedMessage: string;
  failedMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
    decision: 'approve',
  } satisfies DecisionActionState);
  const notice = decisionNotice(state.status, state.decision, {
    approved: approvedMessage,
    rejected: rejectedMessage,
    failed: failedMessage,
  });
  if (notice?.done) return <Alert tone={notice.tone} title={notice.title} />;
  if (!publicationId) return empty;
  return (
    <>
      {children}
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="publicationId" value={publicationId} />
        <div className={styles.actions}>
          <Button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
          >
            {label}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="reject"
            variant="secondary"
            disabled={pending}
          >
            {rejectLabel}
          </Button>
        </div>
        {notice && <Alert tone={notice.tone} title={notice.title} />}
      </form>
    </>
  );
}

export type GenerateMessages = {
  generated: string;
  pendingExists: string;
  noEligible: string;
  failed: string;
};

export function generateNotice(
  status: CandidateStatus | 'idle',
  messages: GenerateMessages,
): { tone: 'success' | 'error' | 'info'; title: string } | null {
  switch (status) {
    case 'idle':
      return null;
    case 'created':
    case 'replayed':
      return { tone: 'success', title: messages.generated };
    case 'pending_exists':
      return { tone: 'info', title: messages.pendingExists };
    case 'no_eligible_clients':
      return { tone: 'info', title: messages.noEligible };
    default:
      return { tone: 'error', title: messages.failed };
  }
}

/**
 * PO-only "Prepare monthly leaderboard". Stays mounted (hidden while a
 * candidate is pending and nothing was just generated) so its confirmation
 * survives the revalidated re-render that shows the new pending candidate.
 */
export function GenerateForm({
  action,
  workspaceId,
  hasPending,
  label,
  messages,
}: {
  action: (
    previous: GenerateActionState,
    formData: FormData,
  ) => Promise<GenerateActionState>;
  workspaceId: string;
  hasPending: boolean;
  label: string;
  messages: GenerateMessages;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: 'idle',
  } satisfies GenerateActionState);
  const notice = generateNotice(state.status, messages);
  if (hasPending)
    return notice?.tone === 'success' ? (
      <Alert tone="success" title={notice.title} />
    ) : null;
  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
      {notice && <Alert tone={notice.tone} title={notice.title} />}
    </form>
  );
}
