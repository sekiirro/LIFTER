'use client';
import type { Locale } from '../../lib/design/preferences';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { getMessages } from '../../lib/i18n';
import type {
  Installment,
  PaymentTerms,
} from '../../lib/registration-links/validation';
import {
  parseSchedule,
  parsePaymentTerms,
  exactAmount,
} from '../../lib/registration-links/validation';
import { issueRegistrationLinkAction } from '../../app/(app)/registration-links/actions';
import styles from './registration-links.module.css';
export function RegistrationLinkDialog({
  workspaceId,
  versionId,
  tierLabel,
  priceMinor,
  canSchedule,
  locale,
  onClose,
}: {
  workspaceId: string;
  versionId: string;
  tierLabel: string;
  priceMinor: string;
  canSchedule: boolean;
  locale: Locale;
  onClose: () => void;
}) {
  const m = getMessages(locale),
    router = useRouter();
  const live = useRef(true),
    pendingRef = useRef(false);
  const [pending, setPending] = useState(false),
    [link, setLink] = useState<string | null>(null),
    [failure, setFailure] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<{ amount: string; offset: string }[]>([]);
  const [upfront, setUpfront] = useState('');
  const [useDefaultSplit, setUseDefaultSplit] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const close = () => {
    live.current = false;
    setLink(null);
    onClose();
  };
  const customSchedule: Installment[] | null = rows.length
    ? rows.map((r, i) => ({
        seq: i + 1,
        amountMinor: r.amount,
        dueOffsetDays: /^[0-9]+$/.test(r.offset) ? Number(r.offset) : NaN,
      }))
    : null;
  const defaultSchedule: Installment[] | null = upfront
    ? exactAmount(upfront)
      ? BigInt(upfront) >= BigInt(priceMinor)
        ? [{ seq: 1, amountMinor: upfront, dueOffsetDays: 0 }]
        : [
            { seq: 1, amountMinor: upfront, dueOffsetDays: 0 },
            {
              seq: 2,
              amountMinor: (BigInt(priceMinor) - BigInt(upfront)).toString(),
              dueOffsetDays: 30,
            },
          ]
      : [{ seq: 1, amountMinor: upfront, dueOffsetDays: 0 }]
    : null;
  const schedule = useDefaultSplit ? defaultSchedule : customSchedule;
  const valid = parseSchedule(schedule, priceMinor) !== undefined;
  // Flexible terms: upfront is the first row amount, count includes upfront.
  // parsePaymentTerms revalidates correspondence + exact total; it agrees
  // with parseSchedule by construction (same rows, same price).
  const flexible: PaymentTerms | null | undefined =
    schedule === null
      ? null
      : parsePaymentTerms(
          {
            upfrontAmountMinor: schedule[0]?.amountMinor,
            totalPaymentCount: schedule.length,
            installments: schedule,
          },
          priceMinor,
        );
  const total = (schedule ?? [])
    .reduce(
      (sum, r) =>
        exactAmount(r.amountMinor) ? sum + BigInt(r.amountMinor) : sum,
      0n,
    )
    .toString();
  const displayedTotal = schedule === null ? priceMinor : total;
  const paymentCount = schedule?.length ?? 1;
  const issue = async () => {
    if (pendingRef.current || !valid || link) return;
    pendingRef.current = true;
    setPending(true);
    setFailure(null);
    try {
      const result = flexible
        ? await issueRegistrationLinkAction({
            workspaceId,
            packageVersionId: versionId,
            paymentTerms: {
              upfrontAmountMinor: flexible.upfrontAmountMinor,
              totalPaymentCount: flexible.totalPaymentCount,
              installments: flexible.installments,
            },
          })
        : await issueRegistrationLinkAction({
            workspaceId,
            packageVersionId: versionId,
            installments: schedule,
          });
      if (!live.current) return;
      if (result.status === 'ok') {
        setLink(result.link);
        router.refresh();
      } else setFailure(result.status);
    } catch {
      if (live.current) setFailure('unavailable');
    } finally {
      pendingRef.current = false;
      if (live.current) setPending(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      if (live.current) {
        setCopied(true);
        setFailure(null);
      }
    } catch {
      if (live.current) setFailure('copyError');
    }
  };
  return (
    <ConfirmDialog
      open
      title={m[link ? 'registration.ready' : 'registration.confirmTitle']}
      confirmLabel={m[link ? 'registration.copy' : 'registration.issue']}
      cancelLabel={m['registration.close']}
      onCancel={close}
      onConfirm={link ? copy : issue}
      loading={pending}
    >
      {link ? (
        <>
          <Field
            label={m['registration.url']}
            inputProps={{
              value: link,
              readOnly: true,
              autoComplete: 'off',
              spellCheck: false,
              dir: 'ltr',
              onFocus: (e) => e.currentTarget.select(),
            }}
          />
          <p role="status">
            {m[copied ? 'registration.copied' : 'registration.once']}
          </p>
        </>
      ) : (
        <>
          <p>{m['registration.confirmDescription']}</p>
          <p>{tierLabel}</p>
          {canSchedule && (
            <fieldset disabled={pending}>
              <legend>{m['registration.schedule']}</legend>
              <div className={styles.termsControls}>
                <Field
                  label={m['registration.defaultSplit']}
                  inputProps={{
                    type: 'checkbox',
                    checked: useDefaultSplit,
                    disabled: !useDefaultSplit && rows.length > 0,
                    className: styles.splitToggle,
                    onChange: (e) => {
                      const checked = e.currentTarget.checked;
                      if (checked) setUseDefaultSplit(true);
                      else {
                        setRows(
                          (defaultSchedule ?? []).map((row) => ({
                            amount: row.amountMinor,
                            offset: String(row.dueOffsetDays),
                          })),
                        );
                        setUseDefaultSplit(false);
                      }
                    },
                  }}
                />
                <Field
                  label={m['registration.paymentCount']}
                  inputProps={{
                    type: 'number',
                    value: paymentCount,
                    readOnly: true,
                  }}
                />
              </div>
              {useDefaultSplit ? (
                <>
                  <Field
                    label={m['registration.upfrontAmount']}
                    inputProps={{
                      type: 'text',
                      value: upfront,
                      inputMode: 'numeric',
                      onChange: (e) => setUpfront(e.target.value),
                    }}
                  />
                  <p className={styles.timingNote}>
                    {m['registration.timingAnchorNote']}
                  </p>
                  <Button
                    variant="secondary"
                    disabled={upfront !== ''}
                    onClick={() => {
                      setUseDefaultSplit(false);
                      setRows([{ amount: '', offset: '' }]);
                    }}
                  >
                    {m['registration.add']}
                  </Button>
                </>
              ) : (
                <>
                  {rows.map((row, index) => (
                    <div className={styles.installment} key={index}>
                      <Field
                        label={`${m['registration.amount']} ${index + 1}`}
                        inputProps={{
                          value: row.amount,
                          inputMode: 'numeric',
                          onChange: (e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, amount: e.target.value }
                                  : r,
                              ),
                            ),
                        }}
                      />
                      <Field
                        label={`${m['registration.offset']} ${index + 1}`}
                        inputProps={{
                          value: row.offset,
                          inputMode: 'numeric',
                          onChange: (e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, offset: e.target.value }
                                  : r,
                              ),
                            ),
                        }}
                      />
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setRows(rows.filter((_, i) => i !== index))
                        }
                      >
                        {m['registration.remove']} {index + 1}
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setRows([...rows, { amount: '', offset: '' }])
                    }
                  >
                    {m['registration.add']}
                  </Button>
                </>
              )}
              <p className={styles.total} aria-live="polite">
                {m['registration.total']}:{' '}
                <bdi>
                  {displayedTotal} / {priceMinor}
                </bdi>{' '}
                —{' '}
                {
                  m[
                    valid
                      ? 'registration.sumValid'
                      : 'registration.invalid_input'
                  ]
                }
              </p>
            </fieldset>
          )}
          {!valid && (
            <Alert tone="error" title={m['registration.invalid_input']} />
          )}
        </>
      )}
      {failure && (
        <Alert
          tone="error"
          title={
            m[`registration.${failure}` as keyof typeof m] ??
            m['registration.unavailable']
          }
        />
      )}
      {failure === 'stale_terms' && (
        <Button
          variant="secondary"
          onClick={() => {
            close();
            router.refresh();
          }}
        >
          {m['registration.reload']}
        </Button>
      )}
    </ConfirmDialog>
  );
}
