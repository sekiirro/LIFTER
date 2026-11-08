'use client';

import { useRef, useState } from 'react';
import { removeExerciseAction } from '../../app/(app)/exercise-library/actions';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './ExerciseDetailView.module.css';

export function ExerciseDetailRemove({
  locale,
  scope,
  workspaceId,
  exerciseId,
  expectedRevision,
}: {
  locale: Locale;
  scope: 'global' | 'workspace';
  workspaceId: string | null;
  exerciseId: string;
  expectedRevision: number;
}) {
  const m = getMessages(locale);
  const operationKey = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [failed, setFailed] = useState(false);

  function resetDialog() {
    setOpen(false);
    setFailed(false);
    setPending(false);
  }

  async function confirmRemove() {
    setPending(true);
    setFailed(false);
    operationKey.current ??= crypto.randomUUID();
    try {
      const result = await removeExerciseAction({
        scope,
        workspaceId,
        exerciseId,
        expectedRevision,
        operationKey: operationKey.current,
      });
      if (result.status === 'ok') {
        setRemoved(true);
        setOpen(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (removed)
    return <Alert tone="success" title={m['catalog.editorLifecycleRemoved']} />;

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        {m['catalog.editorRemove']}
      </Button>
      <ConfirmDialog
        open={open}
        title={m['catalog.editorRemove']}
        confirmLabel={m['dialog.confirm']}
        cancelLabel={m['dialog.cancel']}
        tone="destructive"
        loading={pending}
        onConfirm={() => void confirmRemove()}
        onCancel={resetDialog}
      >
        {failed ? (
          <Alert tone="error" title={m['states.error.description']} />
        ) : null}
      </ConfirmDialog>
      <span className={styles.srOnly} aria-live="polite">
        {pending ? m['catalog.loading'] : ''}
      </span>
    </>
  );
}
