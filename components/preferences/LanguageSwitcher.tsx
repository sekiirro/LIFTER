'use client';

import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  LOCALE_COOKIE,
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
  return (
    <div className={styles.control}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        aria-busy={pending}
        data-testid="language-select"
        onChange={(event) => {
          document.cookie = serializePreferenceCookie(
            LOCALE_COOKIE,
            event.target.value,
          );
          startTransition(() => router.refresh());
        }}
      >
        <option value="ar">{labels.ar}</option>
        <option value="en">{labels.en}</option>
      </select>
    </div>
  );
}
