'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { useToast } from '../ui/Toast';
import { parseMeasurementValue } from '../../lib/progress-coaching/correction-input';
import type { CorrectionResult } from '../../lib/progress-coaching/service';

export type MeasurementCorrectionLabels = {
  /** progress.measurement.edit (S55-PO-10). */
  edit: string;
  /** dialog.confirm / dialog.cancel (approved design-system dialog copy). */
  confirm: string;
  cancel: string;
  /** toast.success (approved design-system copy). */
  saved: string;
  /** states.error.description (approved design-system copy). */
  failed: string;
};

export type MeasurementCorrectionProps = {
  workspaceId: string;
  clientId: string;
  measurementId: string;
  value: number;
  updatedAt: string;
  /** Trainer-authored F15 question text plus unit, used as the field label. */
  fieldLabel: string;
  labels: MeasurementCorrectionLabels;
  correct: (input: {
    workspaceId: string;
    clientId: string;
    measurementId: string;
    value: number;
    expectedUpdatedAt: string;
  }) => Promise<CorrectionResult>;
};

/**
 * FR-013 staff correction: a direct in-place update. There is deliberately no
 * correction-history surface; the change is recorded in the background audit only.
 */
export function MeasurementCorrection({
  workspaceId,
  clientId,
  measurementId,
  value,
  updatedAt,
  fieldLabel,
  labels,
  correct,
}: MeasurementCorrectionProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const submit = async () => {
    if (pending) return;
    const parsed = parseMeasurementValue(draft);
    if (parsed === null) {
      setError(labels.failed);
      return;
    }
    setPending(true);
    try {
      const result = await correct({
        workspaceId,
        clientId,
        measurementId,
        value: parsed,
        expectedUpdatedAt: updatedAt,
      });
      if (result.status === 'corrected' || result.status === 'unchanged') {
        close();
        toast.success(labels.saved);
        router.refresh();
        return;
      }
      // Conflict: reload the latest version before another attempt.
      if (result.status === 'conflict') router.refresh();
      setError(labels.failed);
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        aria-label={`${labels.edit}: ${fieldLabel}`}
        data-testid="progress-measurement-edit"
        onClick={() => {
          setDraft(String(value));
          setError(undefined);
          setOpen(true);
        }}
      >
        {labels.edit}
      </Button>
      <ConfirmDialog
        open={open}
        title={labels.edit}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        loading={pending}
        onCancel={close}
        onConfirm={() => void submit()}
      >
        <Field
          label={fieldLabel}
          error={error}
          inputProps={{
            name: 'value',
            dir: 'ltr',
            inputMode: 'decimal',
            autoComplete: 'off',
            value: draft,
            required: true,
            onChange: (event) => setDraft(event.currentTarget.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            },
          }}
        />
      </ConfirmDialog>
    </>
  );
}
