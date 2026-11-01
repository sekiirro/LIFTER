'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import styles from './page.module.css';

const subscribeToHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function PreviewForm({
  labels,
}: {
  labels: {
    name: string;
    email: string;
    password: string;
    submit: string;
    previewNote: string;
    complete: string;
  };
}) {
  const [submitted, setSubmitted] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientHydrated,
    serverHydrated,
  );
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Field
        label={labels.name}
        inputProps={{
          name: 'name',
          autoComplete: 'name',
          required: true,
          disabled: !hydrated,
        }}
      />
      <Field
        label={labels.email}
        inputProps={{
          name: 'email',
          type: 'email',
          autoComplete: 'email',
          required: true,
          disabled: !hydrated,
        }}
      />
      <Field
        label={labels.password}
        inputProps={{
          name: 'password',
          type: 'password',
          autoComplete: 'new-password',
          required: true,
          disabled: !hydrated,
        }}
      />
      <Button type="submit" disabled={!hydrated}>
        {labels.submit}
      </Button>
      <p className={styles.note}>
        {submitted ? labels.complete : labels.previewNote}
      </p>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {submitted ? labels.complete : ''}
      </span>
    </form>
  );
}
