'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    // Capture the node before React clears its ref during unmount.
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) previousFocus.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-tone={tone}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      data-testid="confirm-dialog"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, [tabindex]',
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            !element.closest('[inert]') &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility === 'visible',
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        previousFocus.current?.focus();
        previousFocus.current = null;
      }}
    >
      <h3 id={`${id}-title`}>{title}</h3>
      {description && <p id={`${id}-description`}>{description}</p>}
      <div className={styles.actions}>
        <Button
          ref={cancelRef}
          variant="secondary"
          data-testid="dialog-cancel"
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'destructive' ? 'destructive' : 'primary'}
          data-testid="dialog-confirm"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
