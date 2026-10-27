'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  LOCALE_COOKIE,
  parseLocale,
  serializePreferenceCookie,
  type Locale,
} from '../../lib/design/preferences';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher({
  value,
  label,
  labels,
}: {
  value: Locale;
  label: string;
  labels: Record<Locale, string>;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  // Reconcile a refreshed server preference without delaying local selection.
  if (value !== previousValue) {
    setPreviousValue(value);
    setSelected(value);
  }
  return (
    <div className={styles.control}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={selected}
        aria-busy={pending}
        data-testid="language-select"
        onChange={(event) => {
          const next = parseLocale(event.currentTarget.value);
          setSelected(next);
          document.cookie = serializePreferenceCookie(LOCALE_COOKIE, next);
          startTransition(() => router.refresh());
        }}
      >
        <option value="ar">{labels.ar}</option>
        <option value="en">{labels.en}</option>
      </select>
    </div>
  );
}
