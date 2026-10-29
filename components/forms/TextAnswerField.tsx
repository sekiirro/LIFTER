'use client';

import { useId, type ChangeEvent, type ReactNode } from 'react';
import { Bidi } from '../ui/Bidi';
import { countTextAnswer } from '../../lib/forms/validation';
import { getMessages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import styles from './TextAnswerField.module.css';

export type TextAnswerFieldProps = {
  kind: 'shortText' | 'longText';
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  charLimit?: number;
  hint?: string;
  disabled?: boolean;
  dir?: 'rtl' | 'ltr' | 'auto';
};

function formatCounter(
  template: string,
  values: { used: number; limit: number; remaining: number },
): ReactNode[] {
  return template
    .split(/(\{used\}|\{limit\}|\{remaining\})/g)
    .map((part, index) => {
      const key = part.slice(1, -1) as keyof typeof values;
      if (part.startsWith('{') && key in values) {
        return (
          <Bidi key={`${key}-${index}`} dir="ltr">
            {values[key]}
          </Bidi>
        );
      }
      return part;
    });
}

export function TextAnswerField({
  kind,
  label,
  value,
  onChange,
  locale,
  charLimit,
  hint,
  disabled = false,
  dir = locale === 'ar' ? 'rtl' : 'ltr',
}: TextAnswerFieldProps) {
  const generatedId = useId();
  const id = generatedId;
  const counterId = `${id}-counter`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const announcementId = `${id}-announcement`;
  const limit = charLimit ?? (kind === 'shortText' ? 150 : 1_000);
  const count = countTextAnswer(value, limit);
  const messages = getMessages(locale);
  const describedBy = [
    hint ? hintId : undefined,
    counterId,
    count.over ? errorId : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const controlProps = {
    id,
    name: id,
    value,
    disabled,
    dir,
    'aria-describedby': describedBy,
    'aria-invalid': count.over || undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.currentTarget.value),
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      {kind === 'shortText' ? (
        <input className={styles.control} type="text" {...controlProps} />
      ) : (
        <textarea className={styles.control} {...controlProps} />
      )}
      <p className={styles.counter} id={counterId}>
        {formatCounter(messages['forms.counter'], count)}
      </p>
      {count.over && (
        <p className={styles.error} id={errorId}>
          {messages['forms.answerTooLong']}
        </p>
      )}
      <p
        className={styles.visuallyHidden}
        id={announcementId}
        aria-live={count.used === limit ? 'polite' : 'off'}
        aria-atomic="true"
      >
        {count.used === limit ? messages['forms.limitReached'] : ''}
      </p>
    </div>
  );
}
