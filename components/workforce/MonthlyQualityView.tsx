'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { localizeUiDigits } from '../../lib/i18n/format-digits';
import { numberingLocale } from '../../lib/i18n/format';
import {
  calculateQualityPoints,
  formatExactDecimal,
} from '../../lib/workforce/quality';
import type {
  MonthlyQualityRevision,
  QualityCategory,
  RecordQualityInput,
  RecordQualityResult,
} from '../../lib/workforce/quality-server';
import type { StaffTotal } from '../../lib/workforce/report-types';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { EmptyState, ErrorState } from '../ui/States';
import { useToast } from '../ui/Toast';
import styles from './MonthlyQuality.module.css';

export type MonthlyQualityViewProps = {
  locale: Locale;
  messages: Messages;
  workspaces: Array<{ id: string; name: string }>;
  trainers: StaffTotal[];
  workspaceId: string;
  trainerId: string;
  month: string;
  effective: MonthlyQualityRevision[];
  revisions: MonthlyQualityRevision[];
  isClosed: boolean;
  status: 'ok' | 'empty' | 'error';
  initialCategory?: QualityCategory;
  onSave: (input: RecordQualityInput) => Promise<RecordQualityResult>;
  onScopeChange?: (scope: {
    workspaceId: string;
    trainerId: string;
    month: string;
  }) => void;
  onReload?: () => void;
};

type Scope = { workspaceId: string; trainerId: string; month: string };
type Draft = Omit<RecordQualityInput, 'idempotencyKey'>;
type ErrorKind = 'save' | 'validation' | 'stale' | 'closed' | 'denied';
const WEIGHT = /^-?\d+(\.\d{1,2})?$/;
const MAX_COUNT = 2_147_483_647;

function formatRecordedAt(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(numberingLocale(locale), {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function MonthlyQualityView({
  locale,
  messages: m,
  workspaces,
  trainers,
  workspaceId,
  trainerId,
  month,
  effective,
  revisions,
  isClosed: closedFromServer,
  status,
  initialCategory = 'transformation',
  onSave,
  onScopeChange,
  onReload,
}: MonthlyQualityViewProps) {
  const { success } = useToast();
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<QualityCategory>(initialCategory);
  const [scope, setScope] = useState<Scope>({ workspaceId, trainerId, month });
  const [monthDraft, setMonthDraft] = useState(month);
  const [pendingScope, setPendingScope] = useState<Scope | null>(null);
  const [pendingCategory, setPendingCategory] =
    useState<QualityCategory | null>(null);
  const [zeroDraft, setZeroDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState({ positive: false, negative: false });
  const [formError, setFormError] = useState<{
    kind: ErrorKind;
    message: string;
  } | null>(null);
  const [staleBlocked, setStaleBlocked] = useState(false);
  const [closedBlocked, setClosedBlocked] = useState(false);
  const [effectiveState, setEffectiveState] = useState({
    source: effective,
    items: effective,
  });
  const [revisionState, setRevisionState] = useState({
    source: revisions,
    items: revisions,
  });

  const effectiveRows =
    effectiveState.source === effective ? effectiveState.items : effective;
  const revisionRows =
    revisionState.source === revisions ? revisionState.items : revisions;
  const initialRow = effective.find(
    (row) => row.trainer_id === trainerId && row.category === initialCategory,
  );
  const [positiveCount, setPositiveCount] = useState(
    initialRow ? String(initialRow.positive_count) : '',
  );
  const [negativeCount, setNegativeCount] = useState(
    initialRow ? String(initialRow.negative_count) : '',
  );
  const [positiveWeight, setPositiveWeight] = useState(
    initialRow
      ? initialRow.positive_weight
      : initialCategory === 'transformation'
        ? '1.00'
        : '',
  );
  const [negativeWeight, setNegativeWeight] = useState(
    initialRow?.negative_weight ?? '',
  );
  const [baselineRow, setBaselineRow] = useState<MonthlyQualityRevision | null>(
    initialRow ?? null,
  );
  const [expectedRevision, setExpectedRevision] = useState(
    initialRow?.revision ?? 0,
  );
  const latestRevision =
    effectiveRows.find(
      (row) => row.trainer_id === trainerId && row.category === category,
    )?.revision ?? 0;
  const revisionMismatch = latestRevision !== expectedRevision;
  const stale = staleBlocked || revisionMismatch;
  const positiveWeightError =
    touched.positive && positiveWeight !== '' && !WEIGHT.test(positiveWeight);
  const negativeWeightError =
    touched.negative && negativeWeight !== '' && !WEIGHT.test(negativeWeight);
  const isClosed = closedFromServer || closedBlocked;
  const controlsDisabled = isPending || isClosed || stale;
  const dirtyRef = useRef(false);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitPending = useRef(false);

  function updateDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function reload() {
    if (onReload) onReload();
    else window.location.reload();
  }

  function navigate(next: Scope) {
    setScope(next);
    setMonthDraft(next.month);
    updateDirty(false);
    setPendingScope(null);
    if (onScopeChange) {
      onScopeChange(next);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', next.workspaceId);
    if (next.trainerId) url.searchParams.set('trainer', next.trainerId);
    else url.searchParams.delete('trainer');
    url.searchParams.set('month', next.month);
    window.location.assign(url.toString());
  }

  function requestScope(next: Scope) {
    const scoped =
      next.workspaceId === scope.workspaceId
        ? next
        : { ...next, trainerId: '' };
    if (next.month === scope.month) setMonthDraft(scope.month);
    if (dirty) setPendingScope(scoped);
    else navigate(scoped);
  }

  function commitMonth() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthDraft)) {
      setMonthDraft(scope.month);
      return;
    }
    if (monthDraft !== scope.month)
      requestScope({ ...scope, month: monthDraft });
  }

  function requestCategory(next: QualityCategory) {
    if (next === category) return;
    if (dirty) setPendingCategory(next);
    else applyCategory(next);
  }

  function applyCategory(next: QualityCategory, discard = false) {
    const row = effectiveRows.find(
      (item) => item.trainer_id === trainerId && item.category === next,
    );
    const unchanged =
      positiveCount ===
        (baselineRow ? String(baselineRow.positive_count) : '') &&
      negativeCount ===
        (baselineRow ? String(baselineRow.negative_count) : '') &&
      positiveWeight ===
        (baselineRow
          ? baselineRow.positive_weight
          : category === 'transformation'
            ? '1.00'
            : '') &&
      negativeWeight === (baselineRow?.negative_weight ?? '');
    setCategory(next);
    setBaselineRow(row ?? null);
    setExpectedRevision(row?.revision ?? 0);
    setPositiveCount(row ? String(row.positive_count) : '');
    setNegativeCount(row ? String(row.negative_count) : '');
    setPositiveWeight(
      row ? row.positive_weight : next === 'transformation' ? '1.00' : '',
    );
    setNegativeWeight(row?.negative_weight ?? '');
    setTouched({ positive: false, negative: false });
    setFormError(null);
    updateDirty(discard ? false : dirty || !unchanged);
  }

  function buildDraft(): Draft | null {
    const positive = Number(positiveCount);
    const negative = category === 'feedback' ? Number(negativeCount) : 0;
    const validCount = (value: number, text: string) =>
      text.trim() !== '' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= MAX_COUNT;
    if (
      !validCount(positive, positiveCount) ||
      (category === 'feedback' && !validCount(negative, negativeCount)) ||
      (positiveWeight !== '' && !WEIGHT.test(positiveWeight)) ||
      (category === 'feedback' &&
        negativeWeight !== '' &&
        !WEIGHT.test(negativeWeight))
    ) {
      setTouched({ positive: true, negative: true });
      const invalidId = !validCount(positive, positiveCount)
        ? 'quality-positive-count'
        : category === 'feedback' && !validCount(negative, negativeCount)
          ? 'quality-negative-count'
          : positiveWeight !== '' && !WEIGHT.test(positiveWeight)
            ? 'quality-positive-weight'
            : 'quality-negative-weight';
      document.getElementById(invalidId)?.focus();
      return null;
    }
    try {
      calculateQualityPoints({
        category,
        positiveCount: positive,
        negativeCount: negative,
        positiveWeight: positiveWeight || null,
        negativeWeight: category === 'feedback' ? negativeWeight || null : null,
      });
    } catch {
      return null;
    }
    return {
      workspaceId,
      trainerId,
      month,
      category,
      positiveCount: positive,
      negativeCount: negative,
      positiveWeight: positiveWeight
        ? formatExactDecimal(positiveWeight)
        : null,
      negativeWeight:
        category === 'feedback' && negativeWeight
          ? formatExactDecimal(negativeWeight)
          : null,
      expectedRevision,
    };
  }

  function submitDraft(draft: Draft) {
    if (submitPending.current || isClosed || stale) return;
    const fingerprint = JSON.stringify(draft);
    if (!intent.current || intent.current.fingerprint !== fingerprint) {
      intent.current = { fingerprint, key: crypto.randomUUID() };
    }
    const payload = { ...draft, idempotencyKey: intent.current.key };
    submitPending.current = true;
    startTransition(async () => {
      try {
        const result = await onSave(payload);
        if (result.status === 'ok') {
          const row = result.data;
          success(m['workforce.quality.saved']);
          intent.current = null;
          setEffectiveState({
            source: effective,
            items: [
              ...effectiveRows.filter(
                (item) =>
                  !(
                    item.trainer_id === row.trainer_id &&
                    item.category === row.category
                  ),
              ),
              row,
            ],
          });
          setRevisionState({
            source: revisions,
            items: [...revisionRows.filter((item) => item.id !== row.id), row],
          });
          setPositiveCount(String(row.positive_count));
          setNegativeCount(String(row.negative_count));
          setPositiveWeight(row.positive_weight);
          setNegativeWeight(row.negative_weight);
          setBaselineRow(row);
          setExpectedRevision(row.revision);
          updateDirty(false);
          setFormError(null);
          setZeroDraft(null);
          return;
        }
        if (result.status === 'stale') {
          setFormError({
            kind: 'stale',
            message: m['workforce.quality.stale'],
          });
          setStaleBlocked(true);
        } else if (result.status === 'closed') {
          setFormError({
            kind: 'closed',
            message: m['workforce.finalize.alreadyFinalized'],
          });
          setClosedBlocked(true);
        } else if (result.status === 'denied') {
          setFormError({ kind: 'denied', message: m['packages.denied'] });
        } else if (result.status === 'invalid_input') {
          setFormError({
            kind: 'validation',
            message: m['workforce.quality.saveError'],
          });
        } else {
          if (result.status === 'idempotency_reused') intent.current = null;
          setFormError({
            kind: 'save',
            message: m['workforce.quality.saveError'],
          });
        }
      } catch {
        setFormError({
          kind: 'save',
          message: m['workforce.quality.saveError'],
        });
      } finally {
        setZeroDraft(null);
        submitPending.current = false;
      }
    });
  }

  function submitCurrent() {
    if (controlsDisabled) return;
    setFormError(null);
    const draft = buildDraft();
    if (!draft) {
      setFormError({
        kind: 'validation',
        message: m['workforce.quality.saveError'],
      });
      return;
    }
    const replacesZero =
      baselineRow &&
      ((draft.positiveCount === 0 && baselineRow.positive_count > 0) ||
        (category === 'feedback' &&
          draft.negativeCount === 0 &&
          baselineRow.negative_count > 0));
    if (replacesZero) setZeroDraft(draft);
    else submitDraft(draft);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submitCurrent();
  }

  const categoryLabel = (value: QualityCategory) =>
    value === 'feedback'
      ? m['workforce.quality.category.feedback']
      : m['workforce.quality.category.transformation'];
  const trainerName = (id: string) =>
    trainers.find((trainer) => trainer.staff_user_id === id)?.display_name;
  const latestIds = new Set(effectiveRows.map((row) => row.id));
  const history = [...revisionRows].sort(
    (a, b) =>
      (trainerName(a.trainer_id) ?? a.trainer_id).localeCompare(
        trainerName(b.trainer_id) ?? b.trainer_id,
      ) ||
      a.category.localeCompare(b.category) ||
      b.revision - a.revision,
  );
  const number = (value: number | string) => (
    <Bidi dir="ltr">{localizeUiDigits(String(value), locale)}</Bidi>
  );
  const counts = (row: MonthlyQualityRevision) => (
    <span className={styles.historyValues}>
      <span>
        <span className={styles.srOnly}>
          {row.category === 'feedback'
            ? m['workforce.quality.positiveCount']
            : m['workforce.quality.count']}
          :{' '}
        </span>
        {number(`+${row.positive_count}`)}
      </span>
      {row.category === 'feedback' && (
        <span>
          <span className={styles.srOnly}>
            {m['workforce.quality.negativeCount']}:{' '}
          </span>
          {number(`−${row.negative_count}`)}
        </span>
      )}
    </span>
  );
  const weights = (row: MonthlyQualityRevision) => (
    <span className={styles.historyValues}>
      <span>
        <span className={styles.srOnly}>
          {row.category === 'feedback'
            ? m['workforce.quality.positiveWeight']
            : m['workforce.quality.weight']}
          :{' '}
        </span>
        {number(
          row.positive_weight.startsWith('-')
            ? row.positive_weight
            : `+${row.positive_weight}`,
        )}
      </span>
      {row.category === 'feedback' && (
        <span>
          <span className={styles.srOnly}>
            {m['workforce.quality.negativeWeight']}:{' '}
          </span>
          {number(row.negative_weight)}
        </span>
      )}
    </span>
  );
  const statusLabel = (row: MonthlyQualityRevision) =>
    latestIds.has(row.id)
      ? m['workforce.quality.revision.effective']
      : m['workforce.quality.revision.earlier'];
  const actorRef = (id: string) => (
    <span className={styles.actor} title={id}>
      <Bidi dir="ltr">{id.slice(0, 8)}</Bidi>
      <span className={styles.srOnly}>{id}</span>
    </span>
  );
  const revisionNumber = (value: number) => (
    <Bidi dir="ltr">#{localizeUiDigits(String(value), locale)}</Bidi>
  );

  return (
    <main
      className={styles.page}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-testid="monthly-quality-view"
    >
      <header className={styles.header}>
        <h1 className={styles.title}>{m['workforce.quality.title']}</h1>
      </header>

      {status === 'error' ? (
        <ErrorState
          title={m['states.error.title']}
          description={m['states.error.description']}
          retryLabel={m['states.retry']}
          onRetry={reload}
        />
      ) : status === 'empty' || trainers.length === 0 ? (
        <EmptyState
          title={m['states.empty.title']}
          description={m['states.empty.description']}
        />
      ) : (
        <>
          <section className={styles.scope}>
            <label className={styles.field}>
              <span>{m['workspaces.title']}</span>
              <select
                className={styles.select}
                value={scope.workspaceId}
                disabled={isPending}
                onChange={(event) =>
                  requestScope({ ...scope, workspaceId: event.target.value })
                }
                data-testid="quality-workspace"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    <Bidi dir="auto">{workspace.name}</Bidi>
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{m['reports.month']}</span>
              <input
                className={styles.input}
                type="text"
                inputMode="text"
                autoComplete="off"
                pattern="[0-9]{4}-(0[1-9]|1[0-2])"
                maxLength={7}
                dir="ltr"
                value={monthDraft}
                disabled={isPending}
                onChange={(event) => setMonthDraft(event.target.value)}
                onBlur={commitMonth}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitMonth();
                  } else if (event.key === 'Escape') {
                    setMonthDraft(scope.month);
                  }
                }}
                data-testid="quality-month"
              />
            </label>
            <label className={styles.field}>
              <span>{m['staff.clientDirectory.assignment']}</span>
              <select
                className={styles.select}
                value={scope.trainerId}
                disabled={isPending}
                onChange={(event) =>
                  requestScope({ ...scope, trainerId: event.target.value })
                }
                data-testid="quality-trainer"
              >
                {trainers.map((trainer) => (
                  <option
                    key={trainer.staff_user_id}
                    value={trainer.staff_user_id}
                  >
                    {trainer.display_name ? (
                      <Bidi dir="auto">{trainer.display_name}</Bidi>
                    ) : (
                      <Bidi dir="ltr">{trainer.staff_user_id}</Bidi>
                    )}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {isClosed && (
            <Alert
              tone="info"
              title={m['workforce.finalize.alreadyFinalized']}
              data-testid="quality-closed"
            />
          )}

          <Card as="section" className={styles.formCard}>
            <form
              className={styles.form}
              aria-label={m['workforce.quality.title']}
              aria-busy={isPending}
              onSubmit={onSubmit}
              data-testid="quality-form"
            >
              <label className={styles.field}>
                <span>
                  {m['workforce.quality.category.transformation']} /{' '}
                  {m['workforce.quality.category.feedback']}
                </span>
                <select
                  className={styles.select}
                  value={category}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    requestCategory(event.target.value as QualityCategory)
                  }
                  data-testid="quality-category"
                >
                  <option value="transformation">
                    {m['workforce.quality.category.transformation']}
                  </option>
                  <option value="feedback">
                    {m['workforce.quality.category.feedback']}
                  </option>
                </select>
              </label>

              <div className={styles.fields}>
                <Field
                  label={
                    category === 'feedback'
                      ? m['workforce.quality.positiveCount']
                      : m['workforce.quality.count']
                  }
                  inputProps={{
                    id: 'quality-positive-count',
                    name: 'positiveCount',
                    type: 'number',
                    inputMode: 'numeric',
                    min: 0,
                    max: MAX_COUNT,
                    step: 1,
                    required: true,
                    dir: 'ltr',
                    disabled: controlsDisabled,
                    value: positiveCount,
                    onChange: (event) => {
                      setPositiveCount(event.target.value);
                      updateDirty(true);
                    },
                  }}
                />
                {category === 'feedback' && (
                  <Field
                    label={m['workforce.quality.negativeCount']}
                    inputProps={{
                      id: 'quality-negative-count',
                      name: 'negativeCount',
                      type: 'number',
                      inputMode: 'numeric',
                      min: 0,
                      max: MAX_COUNT,
                      step: 1,
                      required: true,
                      dir: 'ltr',
                      disabled: controlsDisabled,
                      value: negativeCount,
                      onChange: (event) => {
                        setNegativeCount(event.target.value);
                        updateDirty(true);
                      },
                    }}
                  />
                )}
                <Field
                  label={
                    category === 'feedback'
                      ? m['workforce.quality.positiveWeight']
                      : m['workforce.quality.weight']
                  }
                  hint={
                    category === 'feedback'
                      ? m['workforce.quality.defaultHint']
                      : undefined
                  }
                  error={
                    positiveWeightError
                      ? m['workforce.quality.weight.decimalError']
                      : undefined
                  }
                  inputProps={{
                    id: 'quality-positive-weight',
                    name: 'positiveWeight',
                    type: 'text',
                    inputMode: 'decimal',
                    dir: 'ltr',
                    disabled: controlsDisabled,
                    value: positiveWeight,
                    onChange: (event) => {
                      setPositiveWeight(event.target.value);
                      updateDirty(true);
                    },
                    onBlur: () =>
                      setTouched((value) => ({ ...value, positive: true })),
                  }}
                />
                {category === 'feedback' && (
                  <Field
                    label={m['workforce.quality.negativeWeight']}
                    error={
                      negativeWeightError
                        ? m['workforce.quality.weight.decimalError']
                        : undefined
                    }
                    inputProps={{
                      id: 'quality-negative-weight',
                      name: 'negativeWeight',
                      type: 'text',
                      inputMode: 'decimal',
                      dir: 'ltr',
                      disabled: controlsDisabled,
                      value: negativeWeight,
                      onChange: (event) => {
                        setNegativeWeight(event.target.value);
                        updateDirty(true);
                      },
                      onBlur: () =>
                        setTouched((value) => ({ ...value, negative: true })),
                    }}
                  />
                )}
              </div>

              {revisionMismatch && formError?.kind !== 'stale' && (
                <Alert
                  tone="error"
                  title={m['workforce.quality.stale']}
                  data-testid="quality-stale"
                >
                  <Button
                    variant="secondary"
                    onClick={reload}
                    data-testid="quality-retry"
                  >
                    {m['states.retry']}
                  </Button>
                </Alert>
              )}

              {formError && (
                <Alert
                  tone="error"
                  title={formError.message}
                  data-testid="quality-error"
                >
                  {(formError.kind === 'save' ||
                    formError.kind === 'stale' ||
                    formError.kind === 'closed') && (
                    <Button
                      variant="secondary"
                      onClick={
                        formError.kind === 'save' ? submitCurrent : reload
                      }
                      data-testid="quality-retry"
                    >
                      {m['states.retry']}
                    </Button>
                  )}
                </Alert>
              )}

              <div className={styles.actions}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isPending}
                  disabled={controlsDisabled}
                  data-testid="quality-save"
                >
                  {m['dialog.confirm']}
                </Button>
              </div>
            </form>
          </Card>

          <section
            className={styles.history}
            aria-labelledby="quality-history-title"
          >
            <div className={styles.historyHeader}>
              <h2 id="quality-history-title">
                {m['workforce.quality.revision.history']}
              </h2>
              <p>{m['workforce.quality.revision.latestNote']}</p>
            </div>
            {history.length === 0 ? (
              <EmptyState
                title={m['workforce.quality.revision.history.empty']}
              />
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">
                          {m['staff.clientDirectory.assignment']}
                        </th>
                        <th scope="col">
                          {m['workforce.quality.revision.effective']} /{' '}
                          {m['workforce.quality.revision.earlier']}
                        </th>
                        <th scope="col">{m['workforce.quality.count']}</th>
                        <th scope="col">{m['workforce.quality.weight']}</th>
                        <th scope="col">
                          {m['workforce.report.column.netPoints']}
                        </th>
                        <th scope="col">
                          {m['workforce.report.ledger.column.actor']}
                        </th>
                        <th scope="col">
                          {
                            m[
                              'workforce.quality.revision.history.column.recordedAt'
                            ]
                          }
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr
                          key={row.id}
                          data-testid={`quality-revision-${row.id}`}
                        >
                          <td>
                            <span className={styles.tableTrainer}>
                              <span>
                                {trainerName(row.trainer_id) ? (
                                  <Bidi dir="auto">
                                    {trainerName(row.trainer_id)}
                                  </Bidi>
                                ) : (
                                  <Bidi dir="ltr">{row.trainer_id}</Bidi>
                                )}
                              </span>
                              <span className={styles.tableCategory}>
                                {categoryLabel(row.category)}
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className={styles.statusValue}>
                              {statusLabel(row)} {revisionNumber(row.revision)}
                            </span>
                          </td>
                          <td>{counts(row)}</td>
                          <td>{weights(row)}</td>
                          <td>{number(row.net_points)}</td>
                          <td>{actorRef(row.created_by)}</td>
                          <td>
                            <Bidi dir="auto">
                              {formatRecordedAt(row.created_at, locale)}
                            </Bidi>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.cards}>
                  {history.map((row) => (
                    <article key={row.id} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <h3>
                          {trainerName(row.trainer_id) ? (
                            <Bidi dir="auto">
                              {trainerName(row.trainer_id)}
                            </Bidi>
                          ) : (
                            <Bidi dir="ltr">{row.trainer_id}</Bidi>
                          )}
                        </h3>
                        <span
                          className={
                            latestIds.has(row.id)
                              ? styles.counted
                              : styles.earlier
                          }
                        >
                          {statusLabel(row)} {revisionNumber(row.revision)}
                        </span>
                      </div>
                      <p>{categoryLabel(row.category)}</p>
                      <dl>
                        <dt>{m['workforce.quality.count']}</dt>
                        <dd>{counts(row)}</dd>
                        <dt>{m['workforce.quality.weight']}</dt>
                        <dd>{weights(row)}</dd>
                        <dt>{m['workforce.report.column.netPoints']}</dt>
                        <dd>{number(row.net_points)}</dd>
                        <dt>{m['workforce.report.ledger.column.actor']}</dt>
                        <dd>{actorRef(row.created_by)}</dd>
                        <dt>
                          {
                            m[
                              'workforce.quality.revision.history.column.recordedAt'
                            ]
                          }
                        </dt>
                        <dd>
                          <Bidi dir="auto">
                            {formatRecordedAt(row.created_at, locale)}
                          </Bidi>
                        </dd>
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={zeroDraft !== null}
        title={m['workforce.quality.zeroConfirmTitle']}
        description={m['workforce.quality.zeroConfirmBody']}
        confirmLabel={m['dialog.confirm']}
        cancelLabel={m['dialog.cancel']}
        loading={isPending}
        onConfirm={() => zeroDraft && submitDraft(zeroDraft)}
        onCancel={() => setZeroDraft(null)}
      />
      <ConfirmDialog
        open={pendingScope !== null}
        title={m['clientNotes.exitWarning.title']}
        confirmLabel={m['clientNotes.exitWarning.discard']}
        cancelLabel={m['clientNotes.exitWarning.stay']}
        onConfirm={() => pendingScope && navigate(pendingScope)}
        onCancel={() => {
          setPendingScope(null);
          setMonthDraft(scope.month);
        }}
      />
      <ConfirmDialog
        open={pendingCategory !== null}
        title={m['clientNotes.exitWarning.title']}
        confirmLabel={m['clientNotes.exitWarning.discard']}
        cancelLabel={m['clientNotes.exitWarning.stay']}
        onConfirm={() => {
          if (pendingCategory) applyCategory(pendingCategory, true);
          setPendingCategory(null);
        }}
        onCancel={() => setPendingCategory(null)}
      />
    </main>
  );
}
