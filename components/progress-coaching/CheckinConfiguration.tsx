'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/States';
import { useToast } from '../ui/Toast';
import type { Locale } from '../../lib/design/preferences';
import type {
  CheckinConfigureStatus,
  CheckinFormOption,
} from '../../lib/progress-coaching/checkins/configuration-types';
import styles from './CheckinConfiguration.module.css';

export type CheckinConfigurationLabels = {
  select: string;
  save: string;
  saved: string;
  invalid: string;
  conflict: string;
  failed: string;
  empty: string;
};

/**
 * Staff choice of the workspace's weekly check-in form (FR-003, FR-037). The
 * database re-checks the adherence questions, the current terms and conflicts.
 */
export function CheckinConfiguration({
  workspaceId,
  locale,
  forms,
  currentFormId,
  labels,
  configure,
}: {
  workspaceId: string;
  locale: Locale;
  forms: readonly CheckinFormOption[];
  currentFormId: string | null;
  labels: CheckinConfigurationLabels;
  configure: (input: {
    workspaceId: string;
    formId: string;
    versionNumber: number;
  }) => Promise<{ status: CheckinConfigureStatus }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [selected, setSelected] = useState(
    currentFormId ?? forms[0]?.formId ?? '',
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  if (forms.length === 0)
    return (
      <Card>
        <EmptyState title={labels.empty} />
      </Card>
    );

  const submit = async () => {
    const form = forms.find((option) => option.formId === selected);
    if (!form || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await configure({
        workspaceId,
        formId: form.formId,
        versionNumber: form.versionNumber,
      });
      if (result.status === 'configured') {
        toast.success(labels.saved);
        router.refresh();
        return;
      }
      setError(
        result.status === 'invalid'
          ? labels.invalid
          : result.status === 'conflict'
            ? labels.conflict
            : labels.failed,
      );
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className={styles.field}>
          <label htmlFor={`${id}-form`}>{labels.select}</label>
          <select
            id={`${id}-form`}
            name="formId"
            className={styles.select}
            value={selected}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setSelected(event.currentTarget.value);
              setError(undefined);
            }}
          >
            {forms.map((form) => (
              <option key={form.formId} value={form.formId}>
                {form.title ? form.title[locale] : form.name}
              </option>
            ))}
          </select>
          {error ? (
            <p id={`${id}-error`} className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={styles.actions}>
          <Button
            type="submit"
            loading={pending}
            data-testid="checkin-config-save"
          >
            {labels.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}
