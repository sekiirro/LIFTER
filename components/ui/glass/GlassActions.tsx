'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { GlassSurface, type GlassFallback } from './GlassSurface';
import styles from './GlassActions.module.css';

type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'type'
> & {
  children: ReactNode;
  fallback?: GlassFallback;
  type?: 'button' | 'submit' | 'reset';
};

export function GlassToolbarButton({
  children,
  fallback = 'auto',
  type = 'button',
  ...buttonProps
}: ActionButtonProps) {
  return (
    <GlassSurface
      className={styles.toolbarSurface}
      fallback={fallback}
      data-glass-action="toolbar"
    >
      <button
        {...buttonProps}
        className={styles.toolbarButton}
        type={type}
        data-glass-action-button=""
      >
        {children}
      </button>
    </GlassSurface>
  );
}

export function GlassFab({
  children,
  fallback = 'auto',
  type = 'button',
  ...buttonProps
}: ActionButtonProps & { 'aria-label': string }) {
  return (
    <GlassSurface
      className={styles.fabSurface}
      fallback={fallback}
      data-glass-action="fab"
    >
      <button
        {...buttonProps}
        className={styles.fabButton}
        type={type}
        data-glass-action-button=""
      >
        {children}
      </button>
    </GlassSurface>
  );
}
