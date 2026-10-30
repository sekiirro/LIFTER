'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import styles from './page.module.css';

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
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Field
        label={labels.name}
        inputProps={{ name: 'name', autoComplete: 'name', required: true }}
      />
      <Field
        label={labels.email}
        inputProps={{
          name: 'email',
          type: 'email',
          autoComplete: 'email',
          required: true,
        }}
      />
      <Field
        label={labels.password}
        inputProps={{
          name: 'password',
          type: 'password',
          autoComplete: 'new-password',
          required: true,
        }}
      />
      <Button type="submit">{labels.submit}</Button>
      <p className={styles.note}>
        {submitted ? labels.complete : labels.previewNote}
      </p>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {submitted ? labels.complete : ''}
      </span>
    </form>
  );
}
