'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import styles from './Field.module.css';

export type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
};

export function Field({ label, hint, error, inputProps = {} }: FieldProps) {
  const generatedId = useId();
  const id = inputProps.id ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [
      inputProps['aria-describedby'],
      hint ? hintId : undefined,
      error ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        {...inputProps}
        id={id}
        className={[styles.input, inputProps.className]
          .filter(Boolean)
          .join(' ')}
        aria-describedby={describedBy}
        aria-invalid={error ? true : inputProps['aria-invalid']}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="x-circle" />
          {error}
        </p>
      )}
    </div>
  );
}
