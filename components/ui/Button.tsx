'use client';

import type { ComponentPropsWithRef } from 'react';
import styles from './Button.module.css';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'destructive';
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  children,
  className,
  onClick,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={[styles.button, styles[variant], className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || disabled || props['aria-disabled']}
      onClick={(event) => {
        if (
          loading ||
          disabled ||
          props['aria-disabled'] === true ||
          props['aria-disabled'] === 'true'
        ) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
      {loading && loadingLabel && (
        <span className={styles.srOnly}>{loadingLabel}</span>
      )}
    </button>
  );
}
