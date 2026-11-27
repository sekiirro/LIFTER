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

async function defaultDismiss(
  type: 'form_alert' | 'staff_notice',
  id: string,
): Promise<{ status: string }> {
  try {
    const { dismissStaffNotificationAction } =
      await import('../../app/(app)/notifications/actions');
    return await dismissStaffNotificationAction(type, id);
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
  onDismiss?: (
    type: 'form_alert' | 'staff_notice',
    id: string,
  ) => Promise<{ status: string }>;
  className?: string;
};

export function formatCairoDate(value: string, locale: Locale = 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
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
): string | null {
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
    if (item.stage === 'resolved') {
      return messages['forms.staffStatus.resolved'];
    }
    return null;
  }

  // staff_notice
  if (item.kind === 'food_replacement_open') {
    return (
      messages['foodReplacement.notification.open'] ??
      'Food replacement request'
    );
  }

  if (item.kind === 'monthly_quality_reminder') {
    return messages['workforce.reminder.body'];
  }

  if (item.kind === 'subscription_expiring_t3' || item.kind === 'expiry_t3') {
    if (!item.clientName || !item.expiryDate) {
      console.warn(
        `[StaffNotifications] Omitting ${item.kind} missing clientName or expiryDate`,
      );
      return null;
    }
    const template = messages['staff.notices.expiryT3'];
    const expiryDate = formatCairoDate(item.expiryDate, locale);
    return template
      .replace('{clientName}', item.clientName)
      .replace('{expiryDate}', expiryDate);
  }

  if (
    item.kind === 'subscription_expiring_t3_short_lead' ||
    item.kind === 'expiry_t3_short_lead'
  ) {
    if (!item.clientName || !item.expiryDate) {
      console.warn(
        `[StaffNotifications] Omitting ${item.kind} missing clientName or expiryDate`,
      );
      return null;
    }
    const template = messages['staff.notices.expiryT3ShortLead'];
    const expiryDate = formatCairoDate(item.expiryDate, locale);
    return template
      .replace('{clientName}', item.clientName)
      .replace('{expiryDate}', expiryDate);
  }

  if (item.kind === 'subscription_expired' || item.kind === 'expired') {
    if (!item.clientName || !item.expiryDate) {
      console.warn(
        `[StaffNotifications] Omitting ${item.kind} missing clientName or expiryDate`,
      );
      return null;
    }
    const template = messages['staff.notices.expired'];
    const expiryDate = formatCairoDate(item.expiryDate, locale);
    return template
      .replace('{clientName}', item.clientName)
      .replace('{expiryDate}', expiryDate);
  }

  console.warn(
    `[StaffNotifications] Unknown staff notice kind omitted: ${item.kind}`,
  );
  return null;
}

export function StaffNotifications({
  messages,
  locale = 'en',
  initialOpen = false,
  initialNotifications,
  onFetch,
  onMarkRead,
  onDismiss,
  className,
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
  const dismissHandler = onDismiss ?? defaultDismiss;

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

  // Fetch on open
  useEffect(() => {
    if (!open) return;
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
  }, [open, fetchHandler]);

  // Click outside and Esc key dismissal
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const handleMarkRead = async (item: UnifiedStaffNotification) => {
    try {
      await markReadHandler(item.type, item.id);
      await loadNotifications();
    } catch {
      await loadNotifications();
    }
  };

  const handleDismiss = async (item: UnifiedStaffNotification) => {
    try {
      await dismissHandler(item.type, item.id);
      await loadNotifications();
    } catch {
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

    const visibleItems = notifications
      .map((item) => ({
        item,
        text: getNotificationText(item, messages, locale),
      }))
      .filter(
        (entry): entry is { item: UnifiedStaffNotification; text: string } =>
          entry.text !== null,
      );

    if (visibleItems.length === 0) {
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
        {visibleItems.map(({ item, text }) => {
          const isUnread = item.readAt === null;
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
                <div className={styles.itemActions}>
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
                  {item.type === 'staff_notice' && (
                    <Button
                      type="button"
                      variant="secondary"
                      className={styles.dismissButton}
                      onClick={() => handleDismiss(item)}
                      data-testid={`dismiss-${item.id}`}
                    >
                      {messages['toast.dismiss']}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

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
          </header>
          <div className={styles.panelBody}>{renderContent()}</div>
        </div>
      )}
    </div>
  );
}
