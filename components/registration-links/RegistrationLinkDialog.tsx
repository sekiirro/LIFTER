'use client';
import type { Locale } from '../../lib/design/preferences';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { getMessages } from '../../lib/i18n';
import type { Installment } from '../../lib/registration-links/validation';
import {
  parseSchedule,
  exactAmount,
} from '../../lib/registration-links/validation';
import { issueRegistrationLinkAction } from '../../app/(app)/registration-links/actions';
import styles from './registration-links.module.css';
export function RegistrationLinkDialog({
  workspaceId,
  versionId,
  priceMinor,
  canSchedule,
  locale,
  onClose,
}: {
  workspaceId: string;
  versionId: string;
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
  const schedule: Installment[] | null = rows.length
    ? rows.map((r, i) => ({
        seq: i + 1,
        amountMinor: r.amount,
        dueOffsetDays: /^[0-9]+$/.test(r.offset) ? Number(r.offset) : NaN,
      }))
    : null;
  const valid = parseSchedule(schedule, priceMinor) !== undefined;
  const total = rows
    .reduce(
      (sum, r) => (exactAmount(r.amount) ? sum + BigInt(r.amount) : sum),
      0n,
    )
    .toString();
  const issue = async () => {
    if (pendingRef.current || !valid || link) return;
    pendingRef.current = true;
    setPending(true);
    setFailure(null);
    try {
      const result = await issueRegistrationLinkAction({
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
          {canSchedule && (
            <fieldset disabled={pending}>
              <legend>{m['registration.schedule']}</legend>
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
                            i === index ? { ...r, amount: e.target.value } : r,
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
                            i === index ? { ...r, offset: e.target.value } : r,
                          ),
                        ),
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    {m['registration.remove']} {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() => setRows([...rows, { amount: '', offset: '' }])}
              >
                {m['registration.add']}
              </Button>
              {rows.length > 0 && (
                <p aria-live="polite">
                  {m['registration.total']}:{' '}
                  <bdi>
                    {total} / {priceMinor}
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
              )}
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
