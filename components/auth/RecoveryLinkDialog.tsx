'use client';

import { useRef, useState, useTransition } from 'react';
import type { Messages } from '../../lib/i18n';
import { ar } from '../../lib/i18n/messages/ar';
import type { RecoveryLinkResult } from '../../lib/auth/results';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Alert } from '../ui/Alert';
import styles from './RecoveryLinkDialog.module.css';

export function RecoveryLinkDialog({
  targetUserId,
  action,
  messages: m = ar,
}: {
  targetUserId: string;
  action: (targetUserId: string) => Promise<RecoveryLinkResult>;
  messages?: Messages;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RecoveryLinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);
  function close() {
    generation.current++;
    setOpen(false);
    setResult(null);
    setCopied(false);
    setCopyFailed(false);
  }
  function confirm() {
    if (result?.status === 'ok') {
      const current = generation.current;
      startTransition(async () => {
        try {
          await navigator.clipboard.writeText(result.link);
          if (current === generation.current) setCopied(true);
        } catch {
          if (current === generation.current) setCopyFailed(true);
        }
      });
      return;
    }
    const current = ++generation.current;
    startTransition(async () => {
      try {
        const next = await action(targetUserId);
        if (current === generation.current) setResult(next);
      } catch {
        if (current === generation.current)
          setResult({ status: 'unavailable' });
      }
    });
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>{m['auth.recoveryTitle']}</Button>
      {open && (
        <ConfirmDialog
          open={open}
          title={m['auth.recoveryTitle']}
          description={
            result?.status === 'ok'
              ? m['auth.shownOnce']
              : m['auth.recoveryConfirm']
          }
          confirmLabel={
            result?.status === 'ok' ? m['auth.copy'] : m['dialog.confirm']
          }
          cancelLabel={m['auth.close']}
          onConfirm={confirm}
          onCancel={close}
          loading={pending}
        >
          <div className={styles.content}>
            {result?.status === 'ok' && (
              <Field
                label={m['auth.recoveryLink']}
                inputProps={{ value: result.link, readOnly: true, dir: 'ltr' }}
              />
            )}
            {result && result.status !== 'ok' && (
              <Alert tone="error" title={m[`auth.${result.status}`]} />
            )}
            {copied && <Alert tone="success" title={m['auth.copied']} />}
            {copyFailed && <Alert tone="error" title={m['auth.copyFailed']} />}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
