import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { StaffNotifications } from '../../components/shell/StaffNotifications';
import { getMessages } from '../../lib/i18n';
import type { UnifiedStaffNotification } from '../../app/(app)/notifications/actions';

function makeNotification(
  id: string,
  readAt: string | null = null,
): UnifiedStaffNotification {
  return {
    type: 'staff_notice',
    id,
    kind: 'food_replacement_open',
    workspaceId: '11111111-1111-4111-8111-111111111111',
    sourceKey: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-11-28T10:00:00Z',
    readAt,
  };
}

describe('StaffNotifications bell accessible name unread count (S73-UIQA-F05)', () => {
  it('keeps the existing bellLabel when count is 0 in EN and AR', () => {
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const notifications = [
        makeNotification('1', '2026-11-28T10:05:00Z'),
        makeNotification('2', '2026-11-28T10:06:00Z'),
      ];

      const html = renderToStaticMarkup(
        <StaffNotifications
          messages={messages}
          locale={locale}
          initialNotifications={notifications}
        />,
      );
      const dom = new JSDOM(html);
      const bell = dom.window.document.querySelector(
        '[data-testid="staff-notifications-bell"]',
      );

      expect(bell).not.toBeNull();
      expect(bell?.getAttribute('aria-label')).toBe(
        messages['staff.notifications.bellLabel'],
      );
      expect(
        dom.window.document.querySelector(
          '[data-testid="staff-notifications-badge"]',
        ),
      ).toBeNull();
    }
  });

  it('includes the unread count when count > 0 in EN ("Open notifications ({count} unread)")', () => {
    const messages = getMessages('en');
    const notifications = [
      makeNotification('1', null),
      makeNotification('2', null),
      makeNotification('3', null),
      makeNotification('4', '2026-11-28T10:05:00Z'),
    ];

    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        locale="en"
        initialNotifications={notifications}
      />,
    );
    const dom = new JSDOM(html);
    const bell = dom.window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );

    expect(bell).not.toBeNull();
    // unreadCount is 3
    expect(bell?.getAttribute('aria-label')).toBe(
      'Open notifications (3 unread)',
    );
  });

  it('includes the unread count when count > 0 in AR with Arabic-Indic digits ("افتح الإشعارات ({count} إشعار مش مقروء)")', () => {
    const messages = getMessages('ar');
    const notifications = [
      makeNotification('1', null),
      makeNotification('2', null),
      makeNotification('3', null),
    ];

    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        locale="ar"
        initialNotifications={notifications}
      />,
    );
    const dom = new JSDOM(html);
    const bell = dom.window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );

    expect(bell).not.toBeNull();
    // unreadCount is 3 formatted with ar locale digits (٣)
    expect(bell?.getAttribute('aria-label')).toBe(
      'افتح الإشعارات (٣ إشعار مش مقروء)',
    );
  });

  it('retains aria-hidden="true" on unreadBadge when count > 0', () => {
    const messages = getMessages('en');
    const notifications = [makeNotification('1', null)];

    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        locale="en"
        initialNotifications={notifications}
      />,
    );
    const dom = new JSDOM(html);
    const badge = dom.window.document.querySelector(
      '[data-testid="staff-notifications-badge"]',
    );

    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
  });
});
