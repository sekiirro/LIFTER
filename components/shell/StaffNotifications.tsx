'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Icon } from '../icons/Icon';
import type { UnifiedStaffNotification } from '../../app/(app)/notifications/actions';
import styles from './StaffNotifications.module.css';

async function defaultFetch(): Promise<{
  status: 'ok' | 'error';
  notifications: UnifiedStaffNotification[];
}> {
  try {
    const { fetchStaffNotificationsAction } =
      await import('../../app/(app)/notifications/actions');
    return await fetchStaffNotificationsAction();
  } catch {
    return { status: 'error', notifications: [] };
  }
}

async function defaultMarkRead(
  type: 'form_alert' | 'staff_notice',
  id: string,
): Promise<{ status: string }> {
  try {
    const { markStaffNotificationReadAction } =
      await import('../../app/(app)/notifications/actions');
    return await markStaffNotificationReadAction(type, id);
  } catch {
    return { status: 'error' };
  }
}

export type StaffNotificationsProps = {
  messages: Messages;
  locale?: Locale;
  initialOpen?: boolean;
  initialNotifications?: UnifiedStaffNotification[];
  onFetch?: () => Promise<{
    status: 'ok' | 'error';
    notifications: UnifiedStaffNotification[];
  }>;
  onMarkRead?: (
    type: 'form_alert' | 'staff_notice',
    id: string,
  ) => Promise<{ status: string }>;
  className?: string;
  isStandalone?: boolean;
};

export function formatCairoDate(value: string, locale: Locale = 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Cairo',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function getNotificationText(
  item: UnifiedStaffNotification,
  messages: Messages,
  locale: Locale = 'en',
): string {
  if (item.type === 'form_alert') {
    if (
      item.stage === 'client_owners_immediate' ||
      item.stage === 'client_trainer_24h' ||
      item.stage === 'client_owners_24h' ||
      item.stage === 'client_owners_48h'
    ) {
      return messages['forms.staffStatus.clientLate'];
    }
    if (
      item.stage === 'trainer_initial' ||
      item.stage === 'trainer_owners_24h'
    ) {
      return messages['forms.staffStatus.trainerLate'];
    }
    return messages['forms.staffStatus.resolved'];
  }

  // staff_notice
  if (item.kind === 'food_replacement_open') {
    return (
      messages['foodReplacement.notification.open'] ??
      'Food replacement request'
    );
  }

  if (item.kind === 'expiry_t3' || item.kind === 'subscription_expiry_t3') {
    const template = messages['staff.notices.expiryT3'];
    const clientName = item.clientName ?? item.sourceKey;
    const expiryDate = item.expiryDate
      ? formatCairoDate(item.expiryDate, locale)
      : '';
    return template
      .replace('{clientName}', clientName)
      .replace('{expiryDate}', expiryDate);
  }

  if (
    item.kind === 'expiry_t3_short_lead' ||
    item.kind === 'subscription_expiry_t3_short_lead'
  ) {
    const template = messages['staff.notices.expiryT3ShortLead'];
    const clientName = item.clientName ?? item.sourceKey;
    const expiryDate = item.expiryDate
      ? formatCairoDate(item.expiryDate, locale)
      : '';
    return template
      .replace('{clientName}', clientName)
      .replace('{expiryDate}', expiryDate);
  }

  if (item.kind === 'expired' || item.kind === 'subscription_expired') {
    const template = messages['staff.notices.expired'];
    const clientName = item.clientName ?? item.sourceKey;
    const expiryDate = item.expiryDate
      ? formatCairoDate(item.expiryDate, locale)
      : '';
    return template
      .replace('{clientName}', clientName)
      .replace('{expiryDate}', expiryDate);
  }

  return item.kind;
}

export function StaffNotifications({
  messages,
  locale = 'en',
  initialOpen = false,
  initialNotifications,
  onFetch,
  onMarkRead,
  className,
  isStandalone = false,
}: StaffNotificationsProps) {
  const [open, setOpen] = useState(initialOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [notifications, setNotifications] = useState<
    UnifiedStaffNotification[]
  >(initialNotifications ?? []);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchHandler = onFetch ?? defaultFetch;
  const markReadHandler = onMarkRead ?? defaultMarkRead;

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchHandler();
      if (res.status === 'ok') {
        setNotifications(res.notifications);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchHandler]);

  // Fetch on open or standalone mount
  useEffect(() => {
    if (!open && !isStandalone) return;
    let active = true;
    fetchHandler()
      .then((res) => {
        if (!active) return;
        if (res.status === 'ok') {
          setNotifications(res.notifications);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, isStandalone, fetchHandler]);

  // Click outside and Esc key dismissal
  useEffect(() => {
    if (!open || isStandalone) return;
    const handleClickOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, isStandalone]);

  const handleMarkRead = async (item: UnifiedStaffNotification) => {
    try {
      await markReadHandler(item.type, item.id);
      // Refresh after an action
      await loadNotifications();
    } catch {
      // If action fails, still refresh to reconcile state
      await loadNotifications();
    }
  };

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  const renderContent = () => {
    if (loading) {
      return (
        <div
          className={styles.stateBox}
          data-testid="staff-notifications-loading"
          role="status"
        >
          <p>{messages['staff.notifications.loading']}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div
          className={styles.errorBox}
          data-testid="staff-notifications-error"
          role="alert"
        >
          <h3 className={styles.errorTitle}>
            {messages['staff.notifications.error']}
          </h3>
          <p className={styles.errorDescription}>
            {messages['staff.notifications.errorDescription']}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={loadNotifications}
            data-testid="staff-notifications-retry"
          >
            {messages['staff.notifications.retry']}
          </Button>
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <div
          className={styles.stateBox}
          data-testid="staff-notifications-empty"
        >
          <p>{messages['staff.notifications.empty']}</p>
        </div>
      );
    }

    return (
      <ul
        className={styles.list}
        data-testid="staff-notifications-list"
        role="list"
      >
        {notifications.map((item) => {
          const isUnread = item.readAt === null;
          const text = getNotificationText(item, messages, locale);
          return (
            <li
              key={`${item.type}-${item.id}`}
              className={styles.item}
              data-unread={isUnread ? 'true' : 'false'}
              data-testid={`notification-item-${item.id}`}
            >
              <p className={styles.itemMessage}>
                <Bidi>{text}</Bidi>
              </p>
              <div className={styles.itemFooter}>
                <span>
                  <Bidi>{formatCairoDate(item.createdAt, locale)}</Bidi>
                </span>
                {isUnread && (
                  <Button
                    type="button"
                    variant="secondary"
                    className={styles.markReadButton}
                    onClick={() => handleMarkRead(item)}
                    data-testid={`mark-read-${item.id}`}
                  >
                    {messages['staff.notifications.markRead']}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  if (isStandalone) {
    return (
      <section
        className={[styles.panel, className].filter(Boolean).join(' ')}
        data-testid="staff-notifications-surface"
        aria-labelledby="staff-notifications-title"
      >
        <header className={styles.panelHeader}>
          <h2 id="staff-notifications-title" className={styles.panelTitle}>
            {messages['staff.notifications.title']}
          </h2>
        </header>
        <div className={styles.panelBody}>{renderContent()}</div>
      </section>
    );
  }

  return (
    <div
      ref={rootRef}
      className={[styles.container, className].filter(Boolean).join(' ')}
      data-testid="staff-notifications-container"
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.bellButton}
        aria-label={messages['staff.notifications.bellLabel']}
        aria-expanded={open}
        aria-controls={open ? 'staff-notifications-panel' : undefined}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) {
              setLoading(true);
              setError(false);
            }
            return next;
          });
        }}
        data-testid="staff-notifications-bell"
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span
            className={styles.unreadBadge}
            data-testid="staff-notifications-badge"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          id="staff-notifications-panel"
          className={styles.panel}
          data-testid="staff-notifications-panel"
          role="dialog"
          aria-labelledby="staff-notifications-title"
          aria-modal="false"
        >
          <header className={styles.panelHeader}>
            <h2 id="staff-notifications-title" className={styles.panelTitle}>
              {messages['staff.notifications.title']}
            </h2>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Close"
              onClick={() => setOpen(false)}
              data-testid="staff-notifications-close"
            >
              <Icon name="x" />
            </button>
          </header>
          <div className={styles.panelBody}>{renderContent()}</div>
        </div>
      )}
    </div>
  );
}
