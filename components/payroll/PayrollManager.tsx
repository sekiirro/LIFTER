'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import type { Messages } from '../../lib/i18n';
import type {
  EligibleEmployee,
  PayrollAdjustmentCategory,
  PayrollMarket,
  PayrollMonthState,
} from '../../lib/workforce/payroll';
import {
  getPayrollMonthAction,
  setBasicSalaryAction,
  postMonetaryPayrollInputAction,
  createPayrollSnapshotAction,
  approveExternalPayrollAction,
} from '../../app/(app)/payroll/actions';
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
  isAllowedCurrencyForMarket,
} from '../../lib/workforce/payroll-money';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Bidi } from '../ui/Bidi';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/States';
import { useToast } from '../ui/Toast';
import styles from './payroll.module.css';

export type PayrollSnapshotState = {
  id: string;
  version: number;
  amountMinor: string;
  currency: string;
} | null;

export type PayrollManagerProps = {
  locale: 'ar' | 'en';
  messages: Messages;
  initialEmployees: EligibleEmployee[];
  initialMonth: string;
  initialPayrollMonth?: PayrollMonthState;
  initialPayrollError?: boolean;
  denied?: boolean;
};

const emptyPayrollMonth: PayrollMonthState = {
  salary: null,
  inputs: [],
  snapshot: null,
  approval: null,
};

function reviewedSnapshot(state: PayrollMonthState): PayrollSnapshotState {
  if (!state.approval) return state.snapshot;
  return {
    id: state.approval.snapshotId,
    version: state.approval.snapshotVersion,
    amountMinor: state.approval.amountMinor,
    currency: state.approval.currency,
  };
}

export function PayrollManager({
  locale,
  messages,
  initialEmployees,
  initialMonth,
  initialPayrollMonth = emptyPayrollMonth,
  initialPayrollError = false,
  denied = false,
}: PayrollManagerProps) {
  const { success } = useToast();
  const [isPending, startTransition] = useTransition();

  // Selected Employee & Month
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployees[0]?.userId ?? '',
  );
  const [month, setMonth] = useState<string>(initialMonth);

  // Basic Salary Form State
  const [market, setMarket] = useState<PayrollMarket>(
    initialPayrollMonth.salary?.market ?? 'Egypt',
  );
  const [salaryCurrency, setSalaryCurrency] = useState<string>(
    initialPayrollMonth.salary?.currency ?? 'EGP',
  );
  const [salaryAmount, setSalaryAmount] = useState<string>(
    initialPayrollMonth.salary
      ? minorUnitsToDecimal(initialPayrollMonth.salary.amountMinor)
      : '',
  );
  const [expectedRevision, setExpectedRevision] = useState<number>(
    initialPayrollMonth.salary?.revision ?? 0,
  );
  const [salaryError, setSalaryError] = useState<string | null>(null);

  // Active established salary for manual inputs
  const [activeSalaryCurrency, setActiveSalaryCurrency] = useState<string>(
    initialPayrollMonth.salary?.currency ?? 'EGP',
  );
  const [payrollInputs, setPayrollInputs] = useState(
    initialPayrollMonth.inputs,
  );

  // Manual Payroll Input State
  const [category, setCategory] =
    useState<PayrollAdjustmentCategory>('incentive');
  const [inputAmount, setInputAmount] = useState<string>('');
  const [supersedesInputId, setSupersedesInputId] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Snapshot & Approval State
  const [snapshot, setSnapshot] = useState<PayrollSnapshotState>(
    reviewedSnapshot(initialPayrollMonth),
  );
  const [snapshotLoading, setSnapshotLoading] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState<boolean>(
    initialPayrollMonth.approval !== null,
  );
  const [scopeLoading, setScopeLoading] = useState<boolean>(false);
  const [scopeError, setScopeError] = useState<string | null>(
    initialPayrollError ? messages['workforce.payroll.review.error'] : null,
  );

  const scopeRequest = useRef(0);
  const inputSubmitPending = useRef(false);
  const inputIntent = useRef<{
    fingerprint: string;
    reasonRef: string;
    idempotencyKey: string;
  } | null>(null);

  if (denied) {
    return (
      <main
        className={styles.page}
        lang={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className={styles.deniedState} data-testid="payroll-denied">
          <Alert
            tone="error"
            title={messages['workforce.payroll.review.denied']}
          />
        </div>
      </main>
    );
  }

  function applyPayrollMonth(state: PayrollMonthState) {
    setMarket(state.salary?.market ?? 'Egypt');
    setSalaryCurrency(state.salary?.currency ?? 'EGP');
    setSalaryAmount(
      state.salary ? minorUnitsToDecimal(state.salary.amountMinor) : '',
    );
    setExpectedRevision(state.salary?.revision ?? 0);
    setActiveSalaryCurrency(state.salary?.currency ?? 'EGP');
    setPayrollInputs(state.inputs);
    setCategory('incentive');
    setInputAmount('');
    setSupersedesInputId('');
    setSnapshot(reviewedSnapshot(state));
    setIsApproved(state.approval !== null);
    setSalaryError(null);
    setInputError(null);
    setSnapshotError(null);
    setApprovalError(null);
    setConfirmOpen(false);
  }

  async function loadPayrollScope(employeeId: string, effectiveMonth: string) {
    const request = ++scopeRequest.current;
    inputIntent.current = null;
    inputSubmitPending.current = false;
    applyPayrollMonth(emptyPayrollMonth);
    setSnapshotLoading(false);
    setScopeError(null);
    if (!employeeId) {
      setScopeLoading(false);
      return request;
    }

    setScopeLoading(true);
    try {
      const result = await getPayrollMonthAction({
        employeeId,
        effectiveMonth,
      });
      if (request !== scopeRequest.current) return request;
      if (result.status === 'ok') {
        applyPayrollMonth(result.data);
      } else if (result.status === 'denied') {
        setScopeError(messages['workforce.payroll.review.denied']);
      } else {
        setScopeError(messages['workforce.payroll.review.error']);
      }
    } catch {
      if (request === scopeRequest.current) {
        setScopeError(messages['workforce.payroll.review.error']);
      }
    } finally {
      if (request === scopeRequest.current) setScopeLoading(false);
    }
    return request;
  }

  // Update market and enforce currency
  const handleMarketChange = (newMarket: PayrollMarket) => {
    setMarket(newMarket);
    if (newMarket === 'Egypt') {
      setSalaryCurrency('EGP');
    } else if (!isAllowedCurrencyForMarket('International', salaryCurrency)) {
      setSalaryCurrency('USD');
    }
  };

  // Basic Salary Submit
  const handleSetBasicSalary = (e: FormEvent) => {
    e.preventDefault();
    setSalaryError(null);

    if (
      !selectedEmployeeId ||
      scopeLoading ||
      scopeError ||
      isPending ||
      snapshotLoading
    ) {
      setSalaryError(messages['workforce.payroll.selectEmployeeFirst']);
      return;
    }

    const request = scopeRequest.current;
    startTransition(async () => {
      try {
        const result = await setBasicSalaryAction({
          employeeId: selectedEmployeeId,
          effectiveMonth: `${month}-01`,
          market,
          currency: salaryCurrency,
          amount: salaryAmount,
          expectedRevision,
        });
        if (request !== scopeRequest.current) return;

        if (result.status === 'ok') {
          success(messages['workforce.salary.saved']);
          setSalaryCurrency(result.data.currency);
          setActiveSalaryCurrency(result.data.currency);
          setExpectedRevision(result.data.revision);
          setSalaryAmount(minorUnitsToDecimal(result.data.amount_minor));
          if (!isApproved) {
            setSnapshot(null);
            setSnapshotError(null);
          }
        } else if (result.status === 'stale') {
          setSalaryError(messages['workforce.payroll.approve.stale']);
        } else if (result.status === 'denied') {
          setSalaryError(messages['workforce.payroll.review.denied']);
        } else {
          setSalaryError(messages['workforce.payroll.input.error']);
        }
      } catch {
        if (request === scopeRequest.current) {
          setSalaryError(messages['workforce.payroll.input.error']);
        }
      }
    });
  };

  // Manual Input Submit
  const handlePostInput = (e: FormEvent) => {
    e.preventDefault();
    setInputError(null);

    if (
      !selectedEmployeeId ||
      scopeLoading ||
      scopeError ||
      isPending ||
      snapshotLoading ||
      inputSubmitPending.current
    ) {
      return;
    }

    const supersedesInputIdForRequest =
      category === 'correction' ? supersedesInputId : null;
    const amountMinor = decimalToMinorUnits(inputAmount);
    const canonicalAmount = amountMinor?.toString() ?? inputAmount.trim();
    const fingerprint = JSON.stringify([
      selectedEmployeeId,
      month,
      category,
      canonicalAmount,
      activeSalaryCurrency,
      supersedesInputIdForRequest,
    ]);
    if (
      !inputIntent.current ||
      inputIntent.current.fingerprint !== fingerprint
    ) {
      inputIntent.current = {
        fingerprint,
        reasonRef: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      };
    }
    const intent = inputIntent.current;
    inputSubmitPending.current = true;
    const request = scopeRequest.current;

    startTransition(async () => {
      try {
        const result = await postMonetaryPayrollInputAction({
          employeeId: selectedEmployeeId,
          effectiveMonth: `${month}-01`,
          category,
          amount: inputAmount,
          currency: activeSalaryCurrency,
          reasonRef: intent.reasonRef,
          idempotencyKey: intent.idempotencyKey,
          supersedesInputId: supersedesInputIdForRequest,
        });
        if (request !== scopeRequest.current) return;

        if (result.status === 'ok') {
          success(messages['workforce.payroll.input.saved']);
          inputIntent.current = null;
          setInputAmount('');
          setSupersedesInputId('');
          if (!isApproved) {
            setSnapshot(null);
            setSnapshotError(null);
          }
          if (amountMinor !== null) {
            setPayrollInputs((current) => [
              ...current,
              {
                id: result.id,
                category,
                amountMinor: amountMinor.toString(),
                currency: activeSalaryCurrency,
              },
            ]);
          }
        } else if (result.status === 'currency_mismatch') {
          setInputError(
            messages['workforce.payroll.input.currencyMismatch'].replace(
              '{currency}',
              activeSalaryCurrency,
            ),
          );
        } else if (result.status === 'denied') {
          setInputError(messages['workforce.payroll.review.denied']);
        } else {
          setInputError(messages['workforce.payroll.input.error']);
        }
      } catch {
        if (request === scopeRequest.current) {
          setInputError(messages['workforce.payroll.input.error']);
        }
      } finally {
        if (request === scopeRequest.current)
          inputSubmitPending.current = false;
      }
    });
  };

  // Generate / Review Snapshot
  const handleCreateSnapshot = async () => {
    if (
      !selectedEmployeeId ||
      scopeLoading ||
      scopeError ||
      isApproved ||
      isPending
    )
      return;
    const request = scopeRequest.current;
    setSnapshotLoading(true);
    setSnapshotError(null);
    setApprovalError(null);

    try {
      const result = await createPayrollSnapshotAction({
        employeeId: selectedEmployeeId,
        effectiveMonth: `${month}-01`,
      });
      if (request !== scopeRequest.current) return;

      if (result.status === 'ok') {
        setSnapshot({
          id: result.data.id,
          version: result.data.version,
          amountMinor: result.data.amount_minor,
          currency: result.data.currency,
        });
      } else if (result.status === 'denied') {
        setSnapshotError(messages['workforce.payroll.review.denied']);
      } else if (result.status === 'currency_mismatch') {
        setSnapshotError(
          messages['workforce.payroll.input.currencyMismatch'].replace(
            '{currency}',
            activeSalaryCurrency,
          ),
        );
      } else {
        setSnapshotError(messages['workforce.payroll.review.error']);
      }
    } catch {
      if (request === scopeRequest.current) {
        setSnapshotError(messages['workforce.payroll.review.error']);
      }
    } finally {
      if (request === scopeRequest.current) setSnapshotLoading(false);
    }
  };

  // Confirm External Payment Approval
  const handleApprovePayroll = () => {
    if (
      !snapshot ||
      !selectedEmployeeId ||
      scopeLoading ||
      scopeError ||
      isApproved ||
      snapshotLoading ||
      isPending
    )
      return;
    setApprovalError(null);
    const request = scopeRequest.current;

    startTransition(async () => {
      try {
        const result = await approveExternalPayrollAction({
          employeeId: selectedEmployeeId,
          effectiveMonth: `${month}-01`,
          snapshotId: snapshot.id,
          snapshotVersion: snapshot.version,
          amountMinor: snapshot.amountMinor,
          currency: snapshot.currency,
        });
        if (request !== scopeRequest.current) return;
        setConfirmOpen(false);

        if (result.status === 'ok') {
          success(messages['workforce.payroll.approve.success']);
          setIsApproved(true);
        } else if (result.status === 'already_approved') {
          const reloadRequest = await loadPayrollScope(
            selectedEmployeeId,
            `${month}-01`,
          );
          if (reloadRequest === scopeRequest.current) {
            setApprovalError(
              messages['workforce.payroll.approve.alreadyApproved'],
            );
          }
        } else if (result.status === 'stale') {
          setApprovalError(messages['workforce.payroll.approve.stale']);
        } else if (result.status === 'denied') {
          setApprovalError(messages['workforce.payroll.review.denied']);
        } else {
          setApprovalError(messages['workforce.payroll.approve.error']);
        }
      } catch {
        if (request === scopeRequest.current) {
          setConfirmOpen(false);
          setApprovalError(messages['workforce.payroll.approve.error']);
        }
      }
    });
  };

  const categoryLabels: Record<PayrollAdjustmentCategory, string> = {
    incentive: messages['workforce.payroll.input.category.incentive'],
    deduction: messages['workforce.payroll.input.category.deduction'],
    correction: messages['workforce.payroll.input.category.correction'],
  };

  return (
    <main
      className={styles.page}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-testid="payroll-manager"
    >
      <header className={styles.header}>
        <h1 className={styles.title}>
          {messages['workforce.payroll.review.title']}
        </h1>
      </header>

      {/* Employee and Month Selection */}
      <section
        className={styles.controlsBar}
        aria-label={messages['staff.clientDirectory.filters']}
      >
        <div className={styles.fieldGroup}>
          <label
            htmlFor="payroll-employee-select"
            className={styles.fieldLabel}
          >
            {messages['workforce.payroll.employee']}
          </label>
          <select
            id="payroll-employee-select"
            className={styles.select}
            value={selectedEmployeeId}
            onChange={(e) => {
              const employeeId = e.target.value;
              setSelectedEmployeeId(employeeId);
              void loadPayrollScope(employeeId, `${month}-01`);
            }}
          >
            {initialEmployees.map((emp) => (
              <option key={emp.userId} value={emp.userId}>
                {emp.role === 'trainer'
                  ? messages['staff.clientDirectory.assignment']
                  : messages['forms.staffRole.sales']}{' '}
                ({emp.userId.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="payroll-month-select" className={styles.fieldLabel}>
            {messages['reports.month']}
          </label>
          <input
            id="payroll-month-select"
            type="month"
            className={styles.input}
            value={month}
            onChange={(e) => {
              const nextMonth = e.target.value;
              setMonth(nextMonth);
              void loadPayrollScope(selectedEmployeeId, `${nextMonth}-01`);
            }}
          />
        </div>

        {scopeLoading && (
          <p className={styles.hint} role="status">
            {messages['workforce.payroll.review.loading']}
          </p>
        )}
        {scopeError && (
          <div
            role="alert"
            className={styles.errorBanner}
            data-testid="payroll-scope-error"
          >
            {scopeError}
          </div>
        )}
      </section>

      <div className={styles.grid}>
        {/* Basic Salary Form */}
        <Card
          as="section"
          className={styles.sectionCard}
          aria-labelledby="basic-salary-title"
        >
          <div className={styles.sectionHeader}>
            <h2 id="basic-salary-title" className={styles.sectionTitle}>
              {messages['workforce.salary.title']}
            </h2>
          </div>

          <form onSubmit={handleSetBasicSalary} className={styles.form}>
            {salaryError && (
              <div
                role="alert"
                className={styles.errorBanner}
                data-testid="salary-error"
              >
                {salaryError}
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label
                htmlFor="salary-market-select"
                className={styles.fieldLabel}
              >
                {messages['workforce.salary.market']}
              </label>
              <select
                id="salary-market-select"
                className={styles.select}
                value={market}
                onChange={(e) =>
                  handleMarketChange(e.target.value as PayrollMarket)
                }
              >
                <option value="Egypt">
                  {messages['workforce.salary.market.egypt']}
                </option>
                <option value="International">
                  {messages['workforce.salary.market.international']}
                </option>
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label
                htmlFor="salary-currency-select"
                className={styles.fieldLabel}
              >
                {messages['reports.column.currency']}
              </label>
              <select
                id="salary-currency-select"
                className={styles.select}
                value={salaryCurrency}
                onChange={(e) => setSalaryCurrency(e.target.value)}
              >
                <option value="EGP">EGP</option>
                {market === 'International' && (
                  <>
                    <option value="USD">USD</option>
                    <option value="SAR">SAR</option>
                  </>
                )}
              </select>
              <p className={styles.hint}>
                {messages['workforce.salary.currencyHint']}
              </p>
            </div>

            <div className={styles.fieldGroup}>
              <label
                htmlFor="salary-amount-input"
                className={styles.fieldLabel}
              >
                {messages['reports.column.amount']}
              </label>
              <input
                id="salary-amount-input"
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                required
              />
            </div>

            <div className={styles.buttonRow}>
              <Button
                type="submit"
                variant="primary"
                loading={isPending}
                disabled={
                  scopeLoading ||
                  Boolean(scopeError) ||
                  isPending ||
                  snapshotLoading
                }
              >
                {messages['dialog.confirm']}
              </Button>
            </div>
          </form>
        </Card>

        {/* Manual Payroll Input Form */}
        <Card
          as="section"
          className={styles.sectionCard}
          aria-labelledby="payroll-input-title"
        >
          <div className={styles.sectionHeader}>
            <h2 id="payroll-input-title" className={styles.sectionTitle}>
              {messages['workforce.payroll.input.title']}
            </h2>
          </div>

          <form onSubmit={handlePostInput} className={styles.form}>
            {inputError && (
              <div
                role="alert"
                className={styles.errorBanner}
                data-testid="payroll-input-error"
              >
                {inputError}
              </div>
            )}

            <fieldset className={styles.fieldGroup}>
              <legend className={styles.fieldLabel}>
                {messages['workforce.payroll.input.category']}
              </legend>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="payroll-category"
                    value="incentive"
                    checked={category === 'incentive'}
                    onChange={() => setCategory('incentive')}
                  />
                  {messages['workforce.payroll.input.category.incentive']}
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="payroll-category"
                    value="deduction"
                    checked={category === 'deduction'}
                    onChange={() => setCategory('deduction')}
                  />
                  {messages['workforce.payroll.input.category.deduction']}
                  <p className={styles.hint}>
                    {messages['workforce.payroll.input.deductionNote']}
                  </p>
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="payroll-category"
                    value="correction"
                    checked={category === 'correction'}
                    onChange={() => setCategory('correction')}
                  />
                  {messages['workforce.payroll.input.category.correction']}
                </label>
              </div>
            </fieldset>

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>
                {messages['workforce.payroll.input.currencyLocked']}
              </span>
              <div className={styles.readOnlyValue}>
                <Bidi dir="ltr">{activeSalaryCurrency}</Bidi>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label
                htmlFor="payroll-input-amount"
                className={styles.fieldLabel}
              >
                {messages['reports.column.amount']}
              </label>
              <input
                id="payroll-input-amount"
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                required
              />
            </div>

            {category === 'correction' && (
              <div className={styles.fieldGroup}>
                <label
                  htmlFor="payroll-supersedes-id"
                  className={styles.fieldLabel}
                >
                  {messages['workforce.payroll.review.inputs']}
                </label>
                <select
                  id="payroll-supersedes-id"
                  className={styles.select}
                  value={supersedesInputId}
                  onChange={(e) => setSupersedesInputId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    {messages['workforce.payroll.review.inputs']}
                  </option>
                  {payrollInputs.map((input) => (
                    <option key={input.id} value={input.id}>
                      {categoryLabels[input.category]}{' '}
                      {minorUnitsToDecimal(input.amountMinor)} {input.currency}{' '}
                      ({input.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.buttonRow}>
              <Button
                type="submit"
                variant="primary"
                loading={isPending}
                disabled={
                  scopeLoading ||
                  Boolean(scopeError) ||
                  isPending ||
                  snapshotLoading
                }
              >
                {messages['dialog.confirm']}
              </Button>
            </div>
          </form>
        </Card>

        {/* Snapshot Review & Approval */}
        <Card
          as="section"
          className={[styles.sectionCard, styles.fullWidth].join(' ')}
          aria-labelledby="snapshot-review-title"
        >
          <div className={styles.sectionHeader}>
            <h2 id="snapshot-review-title" className={styles.sectionTitle}>
              {messages['workforce.payroll.review.title']}
            </h2>
            <Button
              variant="secondary"
              loading={snapshotLoading}
              disabled={
                scopeLoading || Boolean(scopeError) || isApproved || isPending
              }
              onClick={handleCreateSnapshot}
              data-testid="generate-snapshot-btn"
            >
              {snapshot
                ? messages['states.retry']
                : messages['workforce.payroll.review.title']}
            </Button>
          </div>

          {snapshotLoading && (
            <p className={styles.hint} role="status">
              {messages['workforce.payroll.review.loading']}
            </p>
          )}

          {snapshotError && (
            <div
              role="alert"
              className={styles.errorBanner}
              data-testid="snapshot-error"
            >
              <span>{snapshotError}</span>
              <Button variant="secondary" onClick={handleCreateSnapshot}>
                {messages['states.retry']}
              </Button>
            </div>
          )}

          {approvalError && (
            <div
              role="alert"
              className={styles.errorBanner}
              data-testid="approval-error"
            >
              {approvalError}
            </div>
          )}

          {!snapshot && !snapshotLoading && !snapshotError && (
            <EmptyState
              title={messages['workforce.payroll.review.empty']}
              data-testid="snapshot-empty"
            />
          )}

          {snapshot && (
            <div
              className={styles.snapshotReview}
              data-testid="snapshot-details"
            >
              <div className={styles.snapshotRow}>
                <span>{messages['reports.month']}</span>
                <span>
                  <Bidi dir="ltr">{month}</Bidi>
                </span>
              </div>
              <div className={styles.snapshotRow}>
                <span>
                  {messages['workforce.payroll.review.snapshotVersion']}
                </span>
                <span>
                  <Bidi dir="ltr">{snapshot.version}</Bidi>
                </span>
              </div>
              <div className={styles.snapshotRow}>
                <span className={styles.totalHighlight}>
                  {messages['workforce.payroll.review.total']}
                </span>
                <span className={styles.totalHighlight}>
                  <Bidi dir="ltr">
                    {minorUnitsToDecimal(snapshot.amountMinor)}{' '}
                    {snapshot.currency}
                  </Bidi>
                </span>
              </div>

              <div className={styles.buttonRow}>
                <Button
                  variant="primary"
                  disabled={
                    isApproved ||
                    isPending ||
                    scopeLoading ||
                    Boolean(scopeError) ||
                    snapshotLoading
                  }
                  onClick={() => setConfirmOpen(true)}
                  data-testid="approve-payroll-btn"
                >
                  {messages['workforce.payroll.approve.action']}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={messages['workforce.payroll.approve.confirmTitle']}
        description={messages['workforce.payroll.approve.confirmBody']}
        confirmLabel={messages['dialog.confirm']}
        cancelLabel={messages['dialog.cancel']}
        loading={isPending}
        onConfirm={handleApprovePayroll}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
