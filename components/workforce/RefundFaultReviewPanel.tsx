'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Messages } from '../../lib/i18n';
import type { StaffTotal } from '../../lib/workforce/report-types';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import {
  listOpenRefundFaultReviewsAction,
  resolveRefundFaultReviewAction,
  type OpenRefundFaultReview,
} from '../../app/(app)/workforce/report/refund-fault-actions';
import styles from './RefundFaultReviewPanel.module.css';

type Props = {
  workspaceId: string;
  locale: 'ar' | 'en';
  messages: Messages;
  staff: StaffTotal[];
};

type Decision = {
  staffFault: boolean | null;
  selected: Set<string>;
  points: Record<string, string>;
};

function toNegativeDeductionPoints(value: string): string | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match || match[1]!.length > 8) return null;

  const fraction = (match[2] ?? '').padEnd(2, '0');
  if (match[1] === '0' && fraction === '00') return null;

  return `-${match[1]}.${fraction}`;
}

export function RefundFaultReviewPanel({
  workspaceId,
  locale,
  messages: m,
  staff,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error' | 'denied'>(
    'loading',
  );
  const [reviews, setReviews] = useState<OpenRefundFaultReview[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const keys = useRef(new Map<string, { fingerprint: string; key: string }>());

  const load = useCallback(async () => {
    setStatus('loading');
    let result;
    try {
      result = await listOpenRefundFaultReviewsAction(workspaceId);
    } catch {
      setStatus('error');
      return;
    }
    if (result.status === 'ok') {
      setReviews(result.reviews);
      setStatus('ok');
    } else {
      setStatus(result.status === 'denied' ? 'denied' : 'error');
    }
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    void listOpenRefundFaultReviewsAction(workspaceId)
      .then((result) => {
        if (!active) return;
        if (result.status === 'ok') {
          setReviews(result.reviews);
          setStatus('ok');
        } else {
          setStatus(result.status === 'denied' ? 'denied' : 'error');
        }
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const getDecision = (reviewId: string): Decision =>
    decisions[reviewId] ?? {
      staffFault: null,
      selected: new Set<string>(),
      points: {},
    };

  const updateDecision = (reviewId: string, next: Decision) => {
    setDecisions((current) => ({ ...current, [reviewId]: next }));
    setMessage('');
  };

  const submit = async (review: OpenRefundFaultReview) => {
    const decision = getDecision(review.review_id);
    if (decision.staffFault === null) return;
    const selectedIds = [...decision.selected];
    if (
      decision.staffFault &&
      selectedIds.some(
        (staffUserId) =>
          toNegativeDeductionPoints(decision.points[staffUserId] ?? '') ===
          null,
      )
    ) {
      return;
    }
    const staffDeductions = decision.staffFault
      ? selectedIds.map((staffUserId) => ({
          staffUserId,
          points: toNegativeDeductionPoints(
            decision.points[staffUserId] ?? '',
          )!,
        }))
      : [];
    const fingerprint = JSON.stringify({
      staffFault: decision.staffFault,
      staffDeductions,
    });
    let request = keys.current.get(review.review_id);
    if (!request || request.fingerprint !== fingerprint) {
      request = { fingerprint, key: crypto.randomUUID() };
      keys.current.set(review.review_id, request);
    }

    setPendingId(review.review_id);
    setMessage('');
    const result = await resolveRefundFaultReviewAction({
      workspaceId,
      reviewId: review.review_id,
      requestKey: request.key,
      staffFault: decision.staffFault,
      staffDeductions,
    });
    setPendingId(null);
    if (result.status === 'ok' || result.status === 'duplicate') {
      keys.current.delete(review.review_id);
      setMessage(
        result.status === 'ok'
          ? m['workforce.report.refund.saved']
          : m['workforce.report.refund.duplicate'],
      );
      setReviews((current) =>
        current.filter((item) => item.review_id !== review.review_id),
      );
      return;
    }
    if (result.status === 'denied') {
      setStatus('denied');
      return;
    }
    setMessage(m['workforce.report.loadError']);
  };

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  if (status === 'denied') {
    return (
      <section className={styles.panel} lang={locale} dir={dir}>
        <Alert tone="error" title={m['workforce.report.denied']} />
      </section>
    );
  }
  if (status === 'error') {
    return (
      <section className={styles.panel} lang={locale} dir={dir}>
        <ErrorState
          title={m['workforce.report.loadError']}
          retryLabel={m['states.retry']}
          onRetry={() => void load()}
        />
      </section>
    );
  }
  if (status === 'loading') {
    return (
      <section
        className={styles.panel}
        lang={locale}
        dir={dir}
        aria-busy="true"
        aria-live="polite"
      >
        <h2 className={styles.title}>{m['workforce.report.loading']}</h2>
        <Skeleton lines={2} shape="text" />
      </section>
    );
  }

  return (
    <section className={styles.panel} lang={locale} dir={dir}>
      <h2 className={styles.title}>
        {m['workforce.report.refund.questionTitle']}
      </h2>
      {reviews.length === 0 ? (
        <EmptyState title={m['workforce.report.refund.emptyQueue']} />
      ) : (
        <div className={styles.list}>
          {reviews.map((review) => {
            const decision = getDecision(review.review_id);
            return (
              <fieldset className={styles.review} key={review.review_id}>
                <legend className={styles.reviewTitle}>
                  <Bidi dir="ltr">{review.purchase_id}</Bidi>
                </legend>
                <p className={styles.body}>
                  {m['workforce.report.refund.questionBody']}
                </p>
                <div className={styles.choices}>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={`staff-fault-${review.review_id}`}
                      checked={decision.staffFault === true}
                      onChange={() =>
                        updateDecision(review.review_id, {
                          ...decision,
                          staffFault: true,
                        })
                      }
                    />
                    <span>{m['workforce.report.refund.faultYes']}</span>
                  </label>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={`staff-fault-${review.review_id}`}
                      checked={decision.staffFault === false}
                      onChange={() =>
                        updateDecision(review.review_id, {
                          ...decision,
                          staffFault: false,
                        })
                      }
                    />
                    <span>{m['workforce.report.refund.faultNo']}</span>
                  </label>
                </div>
                {decision.staffFault === true && (
                  <fieldset className={styles.deductions}>
                    <legend className={styles.groupTitle}>
                      {m['workforce.report.refund.individualDeductions']}
                    </legend>
                    <p className={styles.meta}>
                      {m['workforce.report.refund.selectStaff']}
                    </p>
                    {staff.map((person) => {
                      const selected = decision.selected.has(
                        person.staff_user_id,
                      );
                      return (
                        <div
                          className={styles.staffRow}
                          key={person.staff_user_id}
                        >
                          <label className={styles.staffChoice}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                const next = new Set(decision.selected);
                                if (event.target.checked)
                                  next.add(person.staff_user_id);
                                else next.delete(person.staff_user_id);
                                updateDecision(review.review_id, {
                                  ...decision,
                                  selected: next,
                                });
                              }}
                            />
                            <span>
                              {person.display_name || (
                                <Bidi dir="ltr">{person.staff_user_id}</Bidi>
                              )}
                            </span>
                          </label>
                          {selected && (
                            <label className={styles.pointsField}>
                              <span>
                                {m['workforce.report.ledger.column.points']}
                              </span>
                              <input
                                type="number"
                                min="0.01"
                                max="99999999.99"
                                step="0.01"
                                required
                                inputMode="decimal"
                                value={
                                  decision.points[person.staff_user_id] ?? ''
                                }
                                aria-label={`${m['workforce.report.ledger.column.points']}: ${person.display_name ?? person.staff_user_id}`}
                                onChange={(event) =>
                                  updateDecision(review.review_id, {
                                    ...decision,
                                    points: {
                                      ...decision.points,
                                      [person.staff_user_id]:
                                        event.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </fieldset>
                )}
                <p className={styles.opened}>
                  <Bidi dir="ltr">{review.opened_at}</Bidi>
                </p>
                <Button
                  variant="primary"
                  loading={pendingId === review.review_id}
                  loadingLabel={m['workforce.report.loading']}
                  disabled={
                    pendingId !== null ||
                    decision.staffFault === null ||
                    (decision.staffFault &&
                      [...decision.selected].some(
                        (id) =>
                          toNegativeDeductionPoints(
                            decision.points[id] ?? '',
                          ) === null,
                      ))
                  }
                  onClick={() => void submit(review)}
                >
                  {m['dialog.confirm']}
                </Button>
              </fieldset>
            );
          })}
        </div>
      )}
      {message && (
        <p className={styles.feedback} role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
