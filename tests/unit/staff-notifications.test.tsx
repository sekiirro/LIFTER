import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../../components/shell/AppShell';
import { PlatformOwnerHeader } from '../../components/shell/PlatformOwnerHeader';
import {
  StaffNotifications,
  getNotificationText,
} from '../../components/shell/StaffNotifications';
import { getMessages } from '../../lib/i18n';
import type { UnifiedStaffNotification } from '../../app/(app)/notifications/actions';

describe('StaffNotifications role gate (FR-013, S71-028ui)', () => {
  it('renders the bell button for staff roles (trainer, workspace_owner, platform_owner)', () => {
    for (const role of ['trainer', 'workspace_owner'] as const) {
      const html = renderToStaticMarkup(
        <AppShell role={role} messages={getMessages('en')}>
          <div>content</div>
        </AppShell>,
      );
      const dom = new JSDOM(html);
      const bell = dom.window.document.querySelector(
        '[data-testid="staff-notifications-bell"]',
      );
      expect(bell, `Bell should be visible for role ${role}`).not.toBeNull();
      expect(bell?.getAttribute('aria-label')).toBe('Open notifications');
    }

    const poHtml = renderToStaticMarkup(
      <PlatformOwnerHeader messages={getMessages('en')} />,
    );
    const poDom = new JSDOM(poHtml);
    const poBell = poDom.window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );
    expect(poBell, 'Bell should be visible for platform_owner').not.toBeNull();
    expect(poBell?.getAttribute('aria-label')).toBe('Open notifications');
  });

  it('never renders the bell button for non-staff roles (client, sales)', () => {
    for (const role of ['client', 'sales'] as const) {
      const html = renderToStaticMarkup(
        <AppShell role={role} messages={getMessages('en')}>
          <div>content</div>
        </AppShell>,
      );
      const dom = new JSDOM(html);
      const bell = dom.window.document.querySelector(
        '[data-testid="staff-notifications-bell"]',
      );
      expect(bell, `Bell must not be visible for non-staff ${role}`).toBeNull();
    }
  });
});

describe('StaffNotifications copy & localization (CB-P8-01, S71-PO-9)', () => {
  it('renders approved English and Egyptian Arabic copy for notification kinds', () => {
    const en = getMessages('en');
    const ar = getMessages('ar');

    const sampleDate = '2026-11-30T10:00:00Z';

    const t3Notice: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'expiry_t3',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: 'sub-1',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
      clientName: 'Ahmed',
      expiryDate: sampleDate,
    };

    const shortLeadNotice: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '22222222-1111-4111-8111-111111111111',
      kind: 'expiry_t3_short_lead',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: 'sub-2',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
      clientName: 'Sara',
      expiryDate: sampleDate,
    };

    const expiredNotice: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '33333333-1111-4111-8111-111111111111',
      kind: 'expired',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: 'sub-3',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
      clientName: 'Mohamed',
      expiryDate: sampleDate,
    };

    const formAlertClient: UnifiedStaffNotification = {
      type: 'form_alert',
      id: '44444444-1111-4111-8111-111111111111',
      stage: 'client_owners_immediate',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
    };

    const formAlertTrainer: UnifiedStaffNotification = {
      type: 'form_alert',
      id: '55555555-1111-4111-8111-111111111111',
      stage: 'trainer_initial',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
    };

    // EN tests
    expect(getNotificationText(t3Notice, en, 'en')).toContain(
      "Ahmed's subscription expires in 3 days",
    );
    expect(getNotificationText(shortLeadNotice, en, 'en')).toContain(
      "Sara's subscription expires soon",
    );
    expect(getNotificationText(expiredNotice, en, 'en')).toContain(
      "Mohamed's subscription expired on",
    );
    expect(getNotificationText(formAlertClient, en, 'en')).toBe(
      'Client form overdue',
    );
    expect(getNotificationText(formAlertTrainer, en, 'en')).toBe(
      'Trainer delivery overdue',
    );

    // AR tests (Egyptian colloquial)
    expect(getNotificationText(t3Notice, ar, 'ar')).toContain(
      'اشتراك Ahmed هينتهي كمان ٣ أيام',
    );
    expect(getNotificationText(shortLeadNotice, ar, 'ar')).toContain(
      'اشتراك Sara قرب ينتهي',
    );
    expect(getNotificationText(expiredNotice, ar, 'ar')).toContain(
      'اشتراك Mohamed انتهى يوم',
    );
    expect(getNotificationText(formAlertClient, ar, 'ar')).toBe(
      'استمارة العميل متأخرة',
    );
    expect(getNotificationText(formAlertTrainer, ar, 'ar')).toBe(
      'تسليم المدرّب متأخر',
    );
  });
});

describe('StaffNotifications accessible surface states (SC-007, FR-013)', () => {
  it('renders the empty state when there are no notices or alerts', () => {
    const messages = getMessages('en');
    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        initialOpen={true}
        initialNotifications={[]}
      />,
    );
    const dom = new JSDOM(html);
    const emptyBox = dom.window.document.querySelector(
      '[data-testid="staff-notifications-empty"]',
    );
    expect(emptyBox).not.toBeNull();
    expect(emptyBox?.textContent).toBe('You are all caught up.');

    // Egyptian AR check
    const arMessages = getMessages('ar');
    const arHtml = renderToStaticMarkup(
      <StaffNotifications
        messages={arMessages}
        locale="ar"
        initialOpen={true}
        initialNotifications={[]}
      />,
    );
    const arDom = new JSDOM(arHtml);
    const arEmptyBox = arDom.window.document.querySelector(
      '[data-testid="staff-notifications-empty"]',
    );
    expect(arEmptyBox?.textContent).toBe('مفيش إشعارات جديدة.');
  });

  it('renders notifications list with mark-read action on unread items', () => {
    const messages = getMessages('en');
    const notifications: UnifiedStaffNotification[] = [
      {
        type: 'staff_notice',
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'expiry_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-1',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName: 'Karim',
        expiryDate: '2026-11-30T10:00:00Z',
      },
      {
        type: 'form_alert',
        id: '22222222-1111-4111-8111-111111111111',
        stage: 'trainer_initial',
        workspaceId: 'ws-1',
        createdAt: '2026-11-26T10:00:00Z',
        readAt: '2026-11-26T12:00:00Z',
      },
    ];

    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        initialOpen={true}
        initialNotifications={notifications}
      />,
    );
    const dom = new JSDOM(html);

    const list = dom.window.document.querySelector(
      '[data-testid="staff-notifications-list"]',
    );
    expect(list).not.toBeNull();

    // First item is unread -> has Mark as read button
    const unreadItem = dom.window.document.querySelector(
      '[data-testid="notification-item-11111111-1111-4111-8111-111111111111"]',
    );
    expect(unreadItem?.getAttribute('data-unread')).toBe('true');
    const markReadBtn = unreadItem?.querySelector(
      '[data-testid="mark-read-11111111-1111-4111-8111-111111111111"]',
    );
    expect(markReadBtn?.textContent).toBe('Mark as read');

    // Second item is read -> no Mark as read button
    const readItem = dom.window.document.querySelector(
      '[data-testid="notification-item-22222222-1111-4111-8111-111111111111"]',
    );
    expect(readItem?.getAttribute('data-unread')).toBe('false');
    const readBtn = readItem?.querySelector('button');
    expect(readBtn).toBeNull();
  });

  it('renders accessible panel attributes', () => {
    const messages = getMessages('en');
    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        initialOpen={true}
        initialNotifications={[]}
      />,
    );
    const dom = new JSDOM(html);
    const panel = dom.window.document.querySelector(
      '[data-testid="staff-notifications-panel"]',
    );
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-labelledby')).toBe(
      'staff-notifications-title',
    );
    const title = dom.window.document.querySelector(
      '#staff-notifications-title',
    );
    expect(title?.textContent).toBe('Notifications');
  });

  it('renders standalone surface variant for notifications page', () => {
    const messages = getMessages('en');
    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={messages}
        isStandalone={true}
        initialNotifications={[]}
      />,
    );
    const dom = new JSDOM(html);
    const surface = dom.window.document.querySelector(
      '[data-testid="staff-notifications-surface"]',
    );
    expect(surface).not.toBeNull();
    // Standalone has no bell toggle button
    const bell = dom.window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );
    expect(bell).toBeNull();
  });
});
