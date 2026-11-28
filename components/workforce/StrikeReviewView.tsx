'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Messages } from '../../lib/i18n';
import { numberingLocale } from '../../lib/i18n/format';
import type {
  StrikeOperation,
  StrikeReasonCode,
  StrikeTrainerSummary,
} from '../../lib/workforce/strikes';
import type { CorrectStrikeResult } from '../../app/(app)/workforce/strikes/actions';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Alert } from '../ui/Alert';
import { EmptyState, ErrorState } from '../ui/States';
import { useToast } from '../ui/Toast';
import styles from './StrikeReview.module.css';

type Workspace = { id: string; name: string };
type DialogState = {
  strikeId: string;
  voided: boolean;
  eligibleTrainers: StrikeTrainerSummary['strikes'][number]['eligibleTrainers'];
};

const reasonCodes: StrikeReasonCode[] = [
  'client_caused_delay',
  'system_issue',
  'wrong_trainer',
  'duplicate',
  'po_exception',
];

export function StrikeReviewView({
  locale,
  messages: m,
  workspaceId,
  workspaces = [],
  selectedWorkspaceName,
  trainers,
  status,
  onCorrect,
}: {
  locale: 'ar' | 'en';
  messages: Messages;
  workspaceId: string;
  workspaces?: Workspace[];
  selectedWorkspaceName?: string;
  trainers: StrikeTrainerSummary[];
  status: 'ok' | 'error' | 'denied';
  onCorrect: (input: {
    workspaceId: string;
    strikeId: string;
    operation: StrikeOperation;
    targetTrainerUserId: string | null;
    reasonCode: StrikeReasonCode;
  }) => Promise<CorrectStrikeResult>;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [operation, setOperation] = useState<StrikeOperation | ''>('');
  const [reasonCode, setReasonCode] = useState<StrikeReasonCode | ''>('');
  const [targetTrainerUserId, setTargetTrainerUserId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'denied' | 'error' | null>(null);
  const toast = useToast();
  const router = useRouter();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  function openCorrection(strike: DialogState) {
    setDialog(strike);
    setOperation('');
    setReasonCode('');
    setTargetTrainerUserId('');
    setError(null);
  }

  async function submitCorrection() {
    if (!dialog || !operation || !reasonCode) return;
    setPending(true);
    setError(null);
    const result = await onCorrect({
      workspaceId,
      strikeId: dialog.strikeId,
      operation,
      targetTrainerUserId:
        operation === 'reattribute' ? targetTrainerUserId || null : null,
      reasonCode,
    });
    setPending(false);
    if (result.status === 'ok') {
      setDialog(null);
      toast.success(
        result.replayed
          ? m['workforce.strike.correction.duplicate']
          : m['workforce.strike.correction.success'],
      );
      router.refresh();
      return;
    }
    setError(result.status === 'denied' ? 'denied' : 'error');
  }

  if (status === 'denied') {
    return (
      <main className={styles.container} lang={locale} dir={dir}>
        <Alert tone="error" title={m['workforce.strike.correction.denied']} />
      </main>
    );
  }
  if (status === 'error') {
    return (
      <main className={styles.container} lang={locale} dir={dir}>
        <ErrorState
          title={m['workforce.report.loadError']}
          retryLabel={m['states.retry']}
          onRetry={() => window.location.reload()}
        />
      </main>
    );
  }

  const strikes = trainers.flatMap((trainer) =>
    trainer.strikes.map((strike) => ({ trainer, strike })),
  );

  return (
    <main className={styles.container} lang={locale} dir={dir}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {m['workforce.report.strikes.title']}
          </h1>
          <p className={styles.workspaceName}>
            {m['workforce.report.strikes.window']}
          </p>
          {selectedWorkspaceName && (
            <p className={styles.workspaceName}>
              <Bidi dir="auto">{selectedWorkspaceName}</Bidi>
            </p>
          )}
        </div>
        {workspaces.length > 1 && (
          <nav
            className={styles.workspaceNav}
            aria-label={m['workforce.report.title']}
          >
            {workspaces.map((workspace) => (
              <a
                key={workspace.id}
                href={`/workforce/strikes?workspace=${encodeURIComponent(workspace.id)}`}
                aria-current={workspace.id === workspaceId ? 'page' : undefined}
                className={styles.workspaceLink}
              >
                <Bidi dir="auto">{workspace.name}</Bidi>
              </a>
            ))}
          </nav>
        )}
      </header>

      <div className={styles.note}>
        <p>{m['workforce.report.strikes.reviewOnly']}</p>
      </div>

      {strikes.length === 0 ? (
        <EmptyState title={m['workforce.strike.correction.history.empty']} />
      ) : (
        <section
          className={styles.list}
          aria-label={m['workforce.report.strikes.title']}
        >
          {trainers.map((trainer) => (
            <section className={styles.trainerSection} key={trainer.userId}>
              <header className={styles.trainerHeader}>
                <h2 className={styles.trainerName}>
                  <Bidi dir="auto">
                    {trainer.displayName || trainer.userId}
                  </Bidi>
                </h2>
                <span
                  className={styles.count}
                  aria-label={`${m['workforce.report.strikes.title']} ${new Intl.NumberFormat(numberingLocale(locale)).format(trainer.count)}${trainer.reviewThreshold ? ` ${m['workforce.report.strikes.threshold'].replace('{count}', new Intl.NumberFormat(numberingLocale(locale)).format(trainer.reviewThreshold))}` : ''}`}
                >
                  <Bidi dir="ltr">
                    {new Intl.NumberFormat(numberingLocale(locale)).format(
                      trainer.count,
                    )}
                  </Bidi>
                </span>
              </header>
              {trainer.reviewThreshold > 0 && (
                <p className={styles.pointsNote}>
                  {m['workforce.report.strikes.threshold'].replace(
                    '{count}',
                    new Intl.NumberFormat(numberingLocale(locale)).format(
                      trainer.reviewThreshold,
                    ),
                  )}
                </p>
              )}
              <p className={styles.pointsNote}>
                {m['workforce.strike.correction.effectiveHint']}
              </p>
              {trainer.strikes.map((strike) => (
                <article className={styles.strike} key={strike.strikeId}>
                  <div className={styles.strikeMeta}>
                    <Bidi dir="ltr">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                        timeZone: 'Africa/Cairo',
                      }).format(new Date(strike.breachAt))}
                    </Bidi>
                    <Bidi dir="ltr">
                      {new Intl.DateTimeFormat(locale, {
                        timeStyle: 'short',
                        timeZone: 'Africa/Cairo',
                      }).format(new Date(strike.breachAt))}
                    </Bidi>
                  </div>
                  <p className={styles.pointsNote}>
                    {m['workforce.strike.correction.pointsUnaffected']}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      openCorrection({
                        strikeId: strike.strikeId,
                        voided: strike.voided,
                        eligibleTrainers: strike.eligibleTrainers,
                      })
                    }
                  >
                    {m['workforce.strike.correction.action']}
                  </Button>
                  <section
                    className={styles.correctionHistory}
                    aria-label={m['workforce.strike.correction.history']}
                  >
                    <h3 className={styles.historyTitle}>
                      {m['workforce.strike.correction.history']}
                    </h3>
                    {strike.corrections.length === 0 ? (
                      <p className={styles.pointsNote}>
                        {m['workforce.strike.correction.history.empty']}
                      </p>
                    ) : (
                      <ol className={styles.historyList}>
                        {strike.corrections.map((correction, index) => (
                          <li
                            className={styles.historyItem}
                            key={`${correction.createdAt}-${index}`}
                          >
                            <p className={styles.historyField}>
                              <span className={styles.historyLabel}>
                                {
                                  m[
                                    'workforce.strike.correction.history.column.action'
                                  ]
                                }
                              </span>
                              <span>
                                {
                                  m[
                                    `workforce.strike.correction.${correction.action}`
                                  ]
                                }
                              </span>
                            </p>
                            <p className={styles.historyField}>
                              <span className={styles.historyLabel}>
                                {m['workforce.report.ledger.column.reason']}
                              </span>
                              <span>
                                {
                                  m[
                                    `workforce.strike.correction.reason.${correction.reasonCode}`
                                  ]
                                }
                              </span>
                            </p>
                            <p className={styles.historyField}>
                              <span className={styles.historyLabel}>
                                {m['workforce.report.ledger.column.actor']}
                              </span>
                              {correction.actorDisplayName && (
                                <Bidi dir="auto">
                                  {correction.actorDisplayName}
                                </Bidi>
                              )}
                            </p>
                            <p className={styles.historyField}>
                              <span className={styles.historyLabel}>
                                {
                                  m[
                                    'workforce.strike.correction.history.column.date'
                                  ]
                                }
                              </span>
                              <span className={styles.historyDateTime}>
                                <Bidi dir="ltr">
                                  {new Intl.DateTimeFormat(locale, {
                                    dateStyle: 'medium',
                                    timeZone: 'Africa/Cairo',
                                  }).format(new Date(correction.createdAt))}
                                </Bidi>
                                <Bidi dir="ltr">
                                  {new Intl.DateTimeFormat(locale, {
                                    timeStyle: 'short',
                                    timeZone: 'Africa/Cairo',
                                  }).format(new Date(correction.createdAt))}
                                </Bidi>
                              </span>
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </article>
              ))}
            </section>
          ))}
        </section>
      )}

      {dialog && (
        <ConfirmDialog
          open={Boolean(dialog)}
          title={m['workforce.strike.correction.confirmTitle']}
          confirmLabel={m['dialog.confirm']}
          cancelLabel={m['dialog.cancel']}
          tone={operation === 'void' ? 'destructive' : 'default'}
          loading={pending}
          onConfirm={submitCorrection}
          onCancel={() => setDialog(null)}
        >
          <div className={styles.form}>
            <p className={styles.pointsNote}>
              {m['workforce.strike.correction.pointsUnaffected']}
            </p>
            <label className={styles.field}>
              <span>
                {m['workforce.strike.correction.history.column.action']}
              </span>
              <select
                value={operation}
                onChange={(event) => {
                  setOperation(event.target.value as StrikeOperation | '');
                  setTargetTrainerUserId('');
                }}
              >
                <option value="">
                  {m['workforce.strike.correction.history.column.action']}
                </option>
                {!dialog.voided && (
                  <option value="void">
                    {m['workforce.strike.correction.void']}
                  </option>
                )}
                {dialog.voided && (
                  <option value="reinstate">
                    {m['workforce.strike.correction.reinstate']}
                  </option>
                )}
                <option value="reattribute">
                  {m['workforce.strike.correction.reattribute']}
                </option>
              </select>
            </label>
            {operation === 'reattribute' && (
              <label className={styles.field}>
                <span>{m['staff.clientDirectory.assignment']}</span>
                <select
                  value={targetTrainerUserId}
                  onChange={(event) =>
                    setTargetTrainerUserId(event.target.value)
                  }
                  aria-describedby="strike-trainer-hint"
                >
                  <option value="">
                    {m['staff.clientDirectory.assignment']}
                  </option>
                  {dialog.eligibleTrainers.map((trainer) => (
                    <option key={trainer.userId} value={trainer.userId}>
                      {trainer.displayName || trainer.userId}
                    </option>
                  ))}
                </select>
                <span id="strike-trainer-hint" className={styles.hint}>
                  {m['workforce.strike.correction.trainerHint']}
                </span>
              </label>
            )}
            <label className={styles.field}>
              <span>{m['workforce.report.ledger.column.reason']}</span>
              <select
                value={reasonCode}
                onChange={(event) =>
                  setReasonCode(event.target.value as StrikeReasonCode | '')
                }
              >
                <option value="">
                  {m['workforce.report.ledger.column.reason']}
                </option>
                {reasonCodes.map((code) => (
                  <option key={code} value={code}>
                    {m[`workforce.strike.correction.reason.${code}`]}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p className={styles.formError} role="alert">
                {
                  m[
                    error === 'denied'
                      ? 'workforce.strike.correction.denied'
                      : 'workforce.strike.correction.error'
                  ]
                }
              </p>
            )}
          </div>
        </ConfirmDialog>
      )}
    </main>
  );
}
