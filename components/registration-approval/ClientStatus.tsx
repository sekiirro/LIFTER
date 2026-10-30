'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Button } from '../ui/Button';
import buttonStyles from '../ui/Button.module.css';
import { Card } from '../ui/Card';
import { StatusBadge } from './StatusBadge';
import {
  createStatusPoller,
  performApprovedStatusRedirect,
  type ClientStatusResult,
  type StatusPollRuntime,
} from './status-polling';
import {
  preflightClientHomeNavigation,
  refreshClientStatus,
} from '../../app/(client)/account/status/actions';

function browserRuntime(): StatusPollRuntime {
  return {
    visible: () => document.visibilityState === 'visible',
    online: () => navigator.onLine,
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer as number),
    listen: (listener) => {
      document.addEventListener('visibilitychange', listener);
      window.addEventListener('online', listener);
      window.addEventListener('offline', listener);
      window.addEventListener('focus', listener);
      return () => {
        document.removeEventListener('visibilitychange', listener);
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
        window.removeEventListener('focus', listener);
      };
    },
  };
}

export function ClientStatus({
  initialStatus,
  locale,
  messages,
}: {
  initialStatus: ClientStatusResult;
  locale: Locale;
  messages: Messages;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [redirectFailed, setRedirectFailed] = useState(false);
  const [automaticAttempts, setAutomaticAttempts] = useState(0);
  const currentStatus = useRef<ClientStatusResult>(initialStatus);
  const redirected = useRef(false);
  const poller = useRef<ReturnType<typeof createStatusPoller> | null>(null);

  useEffect(() => {
    const next = createStatusPoller({
      runtime: browserRuntime(),
      initialState:
        initialStatus.status === 'ok'
          ? initialStatus.approval_state
          : initialStatus.status,
      load: refreshClientStatus,
      onAttempt: setAutomaticAttempts,
      onBusy: setRefreshing,
      onResult: async (result) => {
        const previous = currentStatus.current;
        if (result.status !== 'unavailable') currentStatus.current = result;
        setStatus(result);
        if (
          redirected.current ||
          previous.status !== 'ok' ||
          previous.approval_state !== 'pending-approval' ||
          result.status !== 'ok' ||
          result.approval_state !== 'approved'
        )
          return;
        redirected.current = true;
        const outcome = await performApprovedStatusRedirect({
          preflight: preflightClientHomeNavigation,
          navigate: (destination) => router.replace(destination),
        });
        if (outcome === 'not_permitted') {
          const denied = { status: 'not_permitted' } as const;
          currentStatus.current = denied;
          setStatus(denied);
        } else if (outcome === 'fallback') {
          setRedirectFailed(true);
        }
      },
    });
    poller.current = next;
    next.start();
    return () => {
      next.stop();
      poller.current = null;
    };
  }, [initialStatus, router]);

  async function handleRefresh() {
    if (!poller.current || refreshing) return;
    setRefreshing(true);
    try {
      await poller.current.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  if (status.status === 'not_permitted')
    return (
      <Card as="section" aria-labelledby="client-status-state" dir={direction}>
        <div role="alert">
          <h2 id="client-status-state">
            {messages['registrationApproval.statusDenied']}
          </h2>
        </div>
      </Card>
    );

  const stateLabel =
    status.status === 'unavailable'
      ? messages['registrationApproval.unavailable']
      : status.status === 'ok' && status.approval_state === 'pending-approval'
        ? messages['registrationApproval.statusPending']
        : status.status === 'ok' && status.approval_state === 'approved'
          ? messages['registrationApproval.statusApproved']
          : messages['registrationApproval.statusRejected'];
  const stateDetail =
    status.status === 'unavailable'
      ? messages['registrationApproval.unavailable']
      : status.status === 'ok' && status.approval_state === 'pending-approval'
        ? messages['registrationApproval.statusPendingDetail']
        : status.status === 'ok' && status.approval_state === 'approved'
          ? messages['registrationApproval.statusApprovedDetail']
          : messages['registrationApproval.statusRejectedDetail'];

  return (
    <Card as="section" aria-labelledby="client-status-state" dir={direction}>
      <div>
        {status.status === 'ok' && (
          <StatusBadge status={status.approval_state} messages={messages} />
        )}
        <h2 id="client-status-state">{stateLabel}</h2>
        <p>{stateDetail}</p>
        <p
          className={buttonStyles.srOnly}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {refreshing
            ? messages['registrationApproval.statusRefreshing']
            : stateLabel}
        </p>
        {status.status === 'ok' &&
          status.approval_state === 'pending-approval' &&
          automaticAttempts === 12 && (
            <p>{messages['registrationApproval.statusBudgetReached']}</p>
          )}
        {redirectFailed && (
          <p role="status" aria-live="polite">
            {messages['registrationApproval.statusRedirectFallback']}
          </p>
        )}
        {status.status === 'ok' && status.approval_state === 'approved' && (
          <Link href="/">
            {messages['registrationApproval.statusContinue']}
          </Link>
        )}
        <Button
          variant="secondary"
          onClick={handleRefresh}
          loading={refreshing}
          loadingLabel={messages['registrationApproval.statusRefreshing']}
          disabled={refreshing}
        >
          {messages['registrationApproval.statusRefresh']}
        </Button>
      </div>
    </Card>
  );
}
