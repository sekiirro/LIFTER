'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field } from '../ui/Field';
import { useToast } from '../ui/Toast';
import {
  parseMeasurementValue,
  type MeasurementWriteResult,
} from '../../lib/progress-coaching/correction-input';

export type MeasurementAddLabels = {
  add: string;
  value: string;
  date: string;
  save: string;
  cancel: string;
  saved: string;
  duplicate: string;
  failed: string;
};

export type MeasurementAddProps = {
  workspaceId: string;
  clientId: string;
  measurementType: string;
  /** Authored check-in question text, shown as the dialog description. */
  typeLabel: string;
  unit: string | null;
  /** Cairo date (YYYY-MM-DD); entries cannot be in the future. */
  today: string;
  labels: MeasurementAddLabels;
  record: (input: {
    workspaceId: string;
    clientId: string;
    measurementType: string;
    value: number;
    recordedOn: string;
  }) => Promise<MeasurementWriteResult>;
};

/**
 * Client manual entry (FR-012/FR-015, PO 2026-11-14 "Add + edit own"). A
 * same-day duplicate is rejected by the database and the client is told to edit
 * the existing record instead.
 */
export function MeasurementAdd({
  workspaceId,
  clientId,
  measurementType,
  typeLabel,
  unit,
  today,
  labels,
  record,
}: MeasurementAddProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const submit = async () => {
    if (pending) return;
    const parsed = parseMeasurementValue(value);
    if (parsed === null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
      setError(labels.failed);
      return;
    }
    setPending(true);
    try {
      const result = await record({
        workspaceId,
        clientId,
        measurementType,
        value: parsed,
        recordedOn: date,
      });
      if (result.status === 'recorded') {
        close();
        setValue('');
        toast.success(labels.saved);
        router.refresh();
        return;
      }
      setError(
        result.status === 'duplicate_same_day'
          ? labels.duplicate
          : labels.failed,
      );
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  };

  const valueLabel = unit ? `${labels.value} (${unit})` : labels.value;
  return (
    <>
      <Button
        variant="secondary"
        aria-label={`${labels.add}: ${typeLabel}`}
        data-testid="progress-measurement-add"
        onClick={() => {
          setValue('');
          setDate(today);
          setError(undefined);
          setOpen(true);
        }}
      >
        {labels.add}
      </Button>
      <ConfirmDialog
        open={open}
        title={labels.add}
        description={typeLabel}
        confirmLabel={labels.save}
        cancelLabel={labels.cancel}
        loading={pending}
        onCancel={close}
        onConfirm={() => void submit()}
      >
        <Field
          label={valueLabel}
          error={error}
          inputProps={{
            name: 'value',
            dir: 'ltr',
            inputMode: 'decimal',
            autoComplete: 'off',
            required: true,
            value,
            onChange: (event) => setValue(event.currentTarget.value),
          }}
        />
        <Field
          label={labels.date}
          inputProps={{
            name: 'recordedOn',
            type: 'date',
            dir: 'ltr',
            required: true,
            max: today,
            value: date,
            onChange: (event) => setDate(event.currentTarget.value),
          }}
        />
      </ConfirmDialog>
    </>
  );
}
