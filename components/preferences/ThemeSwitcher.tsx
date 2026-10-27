'use client';

import { useId, useState } from 'react';
import {
  serializePreferenceCookie,
  THEME_COOKIE,
  type ThemePreference,
} from '../../lib/design/preferences';
import styles from './ThemeSwitcher.module.css';

type ThemeSwitcherProps = {
  value: ThemePreference;
  label: string;
  labels: Record<ThemePreference, string>;
};

function applyTheme(next: ThemePreference) {
  if (next === 'system') {
    document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    delete document.documentElement.dataset.theme;
  } else {
    document.cookie = serializePreferenceCookie(THEME_COOKIE, next);
    document.documentElement.dataset.theme = next;
  }
}

export function ThemeSwitcher({ value, label, labels }: ThemeSwitcherProps) {
  const name = useId();
  const [theme, setTheme] = useState(value);
  return (
    <fieldset className={styles.group}>
      <legend>{label}</legend>
      <div className={styles.options}>
        {(['system', 'dark', 'light'] as const).map((option) => (
          <label className={styles.option} key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={theme === option}
              onChange={() => {
                applyTheme(option);
                setTheme(option);
              }}
              data-testid={`theme-${option}`}
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
