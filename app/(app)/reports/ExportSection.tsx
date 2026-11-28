'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Bidi } from '../../../components/ui/Bidi';
import { EmptyState, Skeleton } from '../../../components/ui/States';
import type { Messages } from '../../../lib/i18n';
import {
  exportDownloadHref,
  generateExportIdempotencyKey,
  type ExportScope,
  type ExportStatus,
  type ExportViewState,
} from '../../../lib/exports/contract';
import { getClientExportStatus, requestClientExport } from './actions';
import styles from './reports.module.css';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30;

function statusMessageKey(status: ExportStatus): keyof Messages {
  switch (status) {
    case 'queued':
      return 'reports.export.status.queued';
    case 'running':
      return 'reports.export.status.running';
    case 'ready':
      return 'reports.export.status.ready';
    case 'failed':
      return 'reports.export.status.failed';
    case 'expired':
      return 'registration.expired';
  }
}

/** Presentational status region, exported so every state is unit-testable. */
export function ExportStatusPanel({
  status,
  jobId,
  messages: m,
  onRetry,
}: {
  status: ExportViewState;
  jobId: string | null;
  messages: Messages;
  onRetry: () => void;
}) {
  if (status === 'idle') return null;

  if (status === 'empty')
    return (
      <div role="status">
        <EmptyState title={m['reports.export.empty']} />
      </div>
    );

  if (status === 'error' || status === 'failed')
    return (
      <div role="alert" className={styles.exportStatus}>
        <Alert tone="error" title={m['reports.export.error']} />
        <Button
          variant="secondary"
          onClick={onRetry}
          data-testid="retry-button"
        >
          {m['states.retry']}
        </Button>
      </div>
    );

  if (status === 'expired')
    return (
      <div className={styles.exportStatus} aria-live="polite">
        <span className={styles.exportBadge}>{m['registration.expired']}</span>
        <Button
          variant="secondary"
          onClick={onRetry}
          data-testid="retry-button"
        >
          {m['states.retry']}
        </Button>
      </div>
    );

  if (status === 'queued' || status === 'running')
    return (
      <div className={styles.exportStatus} aria-live="polite" aria-busy="true">
        <span className={styles.exportBadge}>
          {m[statusMessageKey(status)]}
        </span>
        <Skeleton lines={2} />
      </div>
    );

  // ready
  return (
    <div className={styles.exportStatus} aria-live="polite">
      <span className={styles.exportBadge}>
        {m['reports.export.status.ready']}
      </span>
      {jobId && (
        <a
          className={styles.exportDownload}
          href={exportDownloadHref(jobId)}
          download
          data-testid="export-download"
        >
          {m['reports.export.download']}
        </a>
      )}
      <p className={styles.exportNotice}>{m['reports.export.expiryNotice']}</p>
    </div>
  );
}

export function ExportSection({
  canExport,
  locale,
  workspaces,
  initialScope = 'all',
  messages: m,
}: {
  canExport: boolean;
  locale: 'ar' | 'en';
  workspaces: { id: string; name: string }[];
  initialScope?: 'all' | 'workspace';
  messages: Messages;
}) {
  // PO-only surface. Non-PO callers render nothing: no section, no disclosure.
  if (!canExport) return null;
  return (
    <ExportSectionBody
      locale={locale}
      workspaces={workspaces}
      initialScope={initialScope}
      messages={m}
    />
  );
}

function ExportSectionBody({
  locale,
  workspaces,
  initialScope,
  messages: m,
}: {
  locale: 'ar' | 'en';
  workspaces: { id: string; name: string }[];
  initialScope: 'all' | 'workspace';
  messages: Messages;
}) {
  const scopeLegendId = useId();
  const [scopeKind, setScopeKind] = useState<'all' | 'workspace'>(initialScope);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '');
  const [status, setStatus] = useState<ExportViewState>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const onScopeKindChange = (kind: 'all' | 'workspace') => {
    if (kind !== scopeKind) {
      setScopeKind(kind);
      idempotencyKeyRef.current = null;
      setStatus('idle');
      setJobId(null);
    }
  };

  const onWorkspaceChange = (id: string) => {
    if (id !== workspaceId) {
      setWorkspaceId(id);
      idempotencyKeyRef.current = null;
      setStatus('idle');
      setJobId(null);
    }
  };

  const submit = useCallback(async () => {
    if (inFlightRef.current || pending) return;
    inFlightRef.current = true;
    setPending(true);

    // Generate ONE idempotency key per user intent, reuse on retry/double click,
    // new key only for a new request (e.g. after ready) or changed scope.
    const shouldReuseKey =
      idempotencyKeyRef.current !== null &&
      status !== 'ready' &&
      status !== 'empty';
    const key = shouldReuseKey
      ? idempotencyKeyRef.current!
      : generateExportIdempotencyKey();

    idempotencyKeyRef.current = key;

    const scope: ExportScope =
      scopeKind === 'all'
        ? { kind: 'all' }
        : { kind: 'workspace', workspaceId };

    try {
      const result = await requestClientExport(scope, key);
      setStatus(result.status);
      setJobId(result.jobId);
    } catch {
      setStatus('error');
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [pending, status, scopeKind, workspaceId]);

  const polling = status === 'queued' || status === 'running';
  useEffect(() => {
    if (!jobId || !polling) return;
    let attempts = 0;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const result = await getClientExportStatus(jobId);
        if (cancelled) return;
        setStatus(result.status);
        if (result.status !== 'queued' && result.status !== 'running')
          window.clearInterval(timer);
      } catch {
        if (!cancelled) {
          setStatus('error');
          window.clearInterval(timer);
        }
      }
      if (attempts >= MAX_POLLS) {
        window.clearInterval(timer);
        if (!cancelled) setStatus('error');
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // A terminal status turns `polling` false and the cleanup clears the timer.
  }, [jobId, polling]);

  return (
    <section
      className={styles.section}
      aria-labelledby="export-title"
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className={styles.sectionHeader}>
        <h2 id="export-title">{m['reports.export.title']}</h2>
        <p>{m['reports.export.description']}</p>
      </div>

      <fieldset className={styles.exportScope}>
        <legend id={scopeLegendId}>{m['reports.export.scope.label']}</legend>
        <label className={styles.exportChoice}>
          <input
            type="radio"
            name="export-scope"
            value="all"
            checked={scopeKind === 'all'}
            onChange={() => onScopeKindChange('all')}
          />
          <span>{m['reports.export.scope.all']}</span>
        </label>
        <label className={styles.exportChoice}>
          <input
            type="radio"
            name="export-scope"
            value="workspace"
            checked={scopeKind === 'workspace'}
            onChange={() => onScopeKindChange('workspace')}
          />
          <span>{m['reports.export.scope.workspace']}</span>
        </label>
        {scopeKind === 'workspace' && (
          <label className={styles.control}>
            <span>{m['packages.workspace']}</span>
            <select
              value={workspaceId}
              onChange={(event) => onWorkspaceChange(event.currentTarget.value)}
              disabled={workspaces.length === 0}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  <Bidi>{workspace.name}</Bidi>
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <p className={styles.exportHint}>{m['reports.export.confirmScope']}</p>
      <Button
        onClick={submit}
        loading={pending}
        loadingLabel={m['button.loading']}
        disabled={pending || (scopeKind === 'workspace' && !workspaceId)}
        data-testid="export-action"
      >
        {m['reports.export.action']}
      </Button>

      <ExportStatusPanel
        status={status}
        jobId={jobId}
        messages={m}
        onRetry={submit}
      />
    </section>
  );
}
