'use client';

import { useId, useOptimistic, useTransition } from 'react';
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
  const [selected, setSelected] = useOptimistic(value);
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
          document.cookie = serializePreferenceCookie(LOCALE_COOKIE, next);
          startTransition(() => {
            setSelected(next);
            router.refresh();
          });
        }}
      >
        <option value="ar">{labels.ar}</option>
        <option value="en">{labels.en}</option>
      </select>
    </div>
  );
}
