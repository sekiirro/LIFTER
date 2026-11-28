'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Messages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Button } from '../ui/Button';
import { StaffNotifications } from './StaffNotifications';
import styles from './PlatformOwnerHeader.module.css';

export function PlatformOwnerHeader({
  messages,
  locale = 'en',
}: {
  messages: Messages;
  locale?: Locale;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  return (
    <header
      ref={rootRef}
      className={styles.header}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <div className={styles.actions}>
        <StaffNotifications messages={messages} locale={locale} />
        <nav aria-label={messages['nav.label']}>
          <Button
            ref={triggerRef}
            variant="secondary"
            aria-expanded={open}
            aria-controls={open ? 'platform-owner-more-menu' : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            {messages['nav.more']}
          </Button>
          {open && (
            <ul id="platform-owner-more-menu" className={styles.menu}>
              <li>
                <Link href="/workspaces" onClick={() => setOpen(false)}>
                  {messages['workspaces.title']}
                </Link>
              </li>
            </ul>
          )}
        </nav>
      </div>
    </header>
  );
}
