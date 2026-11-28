import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../../components/shell/AppShell';
import { PlatformOwnerHeader } from '../../components/shell/PlatformOwnerHeader';
import {
  StaffNotifications,
  formatCairoDate,
  getNotificationText,
} from '../../components/shell/StaffNotifications';
import { getMessages } from '../../lib/i18n';
import type { UnifiedStaffNotification } from '../../app/(app)/notifications/actions';
import {
  parseStaffNotices,
  STAFF_NOTICE_MESSAGE,
  type StaffNoticeKind,
} from '../../lib/progress-coaching/food-replacement/notice-projection';

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

describe('StaffNotifications exact stored kinds & copy (B8, B13, CB-P8-01)', () => {
  const en = getMessages('en');
  const ar = getMessages('ar');
  const sampleDate = '2026-11-30T10:00:00Z';

  const storedKindsTable: Array<{
    kind: StaffNoticeKind;
    clientName?: string;
    expiryDate?: string;
    expectedEn: string;
    expectedAr: string;
  }> = [
    {
      kind: 'food_replacement_open',
      expectedEn: en['foodReplacement.notification.open'],
      expectedAr: ar['foodReplacement.notification.open'],
    },
    {
      kind: 'monthly_quality_reminder',
      expectedEn: en['workforce.reminder.body'],
      expectedAr: ar['workforce.reminder.body'],
    },
    {
      kind: 'subscription_expiring_t3',
      clientName: 'Ahmed',
      expiryDate: sampleDate,
      expectedEn: "Ahmed's subscription expires in 3 days",
      expectedAr: 'اشتراك Ahmed هينتهي كمان ٣ أيام',
    },
    {
      kind: 'subscription_expiring_t3_short_lead',
      clientName: 'Sara',
      expiryDate: sampleDate,
      expectedEn: "Sara's subscription expires soon",
      expectedAr: 'اشتراك Sara قرب ينتهي',
    },
    {
      kind: 'subscription_expired',
      clientName: 'Mohamed',
      expiryDate: sampleDate,
      expectedEn: "Mohamed's subscription expired on",
      expectedAr: 'اشتراك Mohamed انتهى يوم',
    },
  ];

  it.each(storedKindsTable)(
    'formats stored kind "$kind" correctly in EN and Egyptian Arabic (B8, B13)',
    ({ kind, clientName, expiryDate, expectedEn, expectedAr }) => {
      const notice: UnifiedStaffNotification = {
        type: 'staff_notice',
        id: '11111111-1111-4111-8111-111111111111',
        kind,
        workspaceId: '22222222-2222-4222-8222-222222222222',
        sourceKey: '33333333-3333-4333-8333-333333333333',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName,
        expiryDate,
      };

      const textEn = getNotificationText(notice, en, 'en');
      expect(textEn).not.toBeNull();
      expect(textEn).toContain(expectedEn);

      const textAr = getNotificationText(notice, ar, 'ar');
      expect(textAr).not.toBeNull();
      expect(textAr).toContain(expectedAr);
    },
  );

  it('verifies exact stored kinds in STAFF_NOTICE_MESSAGE and rejects aliases (B8 mutation)', () => {
    const canonicalKinds = Object.keys(STAFF_NOTICE_MESSAGE);
    expect(canonicalKinds).toEqual([
      'food_replacement_open',
      'monthly_quality_reminder',
      'subscription_expiring_t3',
      'subscription_expiring_t3_short_lead',
      'subscription_expired',
    ]);

    // Unstored aliases must not exist in STAFF_NOTICE_MESSAGE
    expect(STAFF_NOTICE_MESSAGE).not.toHaveProperty('expiry_t3');
    expect(STAFF_NOTICE_MESSAGE).not.toHaveProperty('expiry_t3_short_lead');
    expect(STAFF_NOTICE_MESSAGE).not.toHaveProperty('expired');
    expect(STAFF_NOTICE_MESSAGE).not.toHaveProperty('subscription_expiry_t3');
  });

  it('fails closed on unknown kinds, returning null and never raw kind string (B13)', () => {
    const unknownNotice: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'some_unknown_random_kind',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
    };

    const text = getNotificationText(unknownNotice, en, 'en');
    expect(text).toBeNull();
  });

  it.each(['expiry_t3', 'expiry_t3_short_lead', 'expired'])(
    'fails closed for removed alias kind "%s" even with complete expiry fields (S72-R59)',
    (kind) => {
      const notice: UnifiedStaffNotification = {
        type: 'staff_notice',
        id: '11111111-1111-4111-8111-111111111111',
        kind,
        workspaceId: '22222222-2222-4222-8222-222222222222',
        sourceKey: '33333333-3333-4333-8333-333333333333',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName: 'Ahmed',
        expiryDate: sampleDate,
      };

      expect(getNotificationText(notice, en, 'en')).toBeNull();
    },
  );

  it('never renders unapproved fallback literal "Food replacement request" (F-01)', () => {
    const notice: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'food_replacement_open',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
    };

    // When dictionary key is absent, unapproved hardcoded literal must never be returned
    const sparseMessages = { ...en };
    delete (sparseMessages as Record<string, string>)[
      'foodReplacement.notification.open'
    ];

    const textWithoutKey = getNotificationText(notice, sparseMessages);
    expect(textWithoutKey).not.toBe('Food replacement request');

    // And in normal rendering across all locales, it uses the approved key and never the literal
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const text = getNotificationText(notice, messages, locale);
      expect(text).toBe(messages['foodReplacement.notification.open']);
      expect(text).not.toBe('Food replacement request');

      const html = renderToStaticMarkup(
        <StaffNotifications
          messages={messages}
          locale={locale}
          initialOpen={true}
          initialNotifications={[notice]}
        />,
      );
      expect(html).toContain(messages['foodReplacement.notification.open']);
      expect(html).not.toContain('Food replacement request');
    }
  });
});

describe('StaffNotifications date-only Cairo formatting and clientName requirement (B9)', () => {
  const en = getMessages('en');

  it('formats Cairo calendar date without time (B9)', () => {
    const isoDate = '2026-11-30T10:00:00Z';
    const formattedEn = formatCairoDate(isoDate, 'en');
    // Date only: medium date style in en-GB is "30 Nov 2026"
    expect(formattedEn).toContain('2026');
    expect(formattedEn).toContain('Nov');
    // Must NOT contain time (no colons for hours/minutes)
    expect(formattedEn).not.toContain(':');

    const formattedAr = formatCairoDate(isoDate, 'ar');
    expect(formattedAr).not.toContain(':');
  });

  it('omits expiry notices when clientName is missing, preventing internal UUID leaks (B9)', () => {
    const noticeWithoutClientName: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'subscription_expiring_t3',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
      expiryDate: '2026-11-30T10:00:00Z',
      // clientName is omitted
    };

    const text = getNotificationText(noticeWithoutClientName, en, 'en');
    expect(text).toBeNull();
  });

  it('omits expiry notices when expiryDate is missing (B9)', () => {
    const noticeWithoutExpiryDate: UnifiedStaffNotification = {
      type: 'staff_notice',
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'subscription_expiring_t3',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      sourceKey: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-11-27T10:00:00Z',
      readAt: null,
      clientName: 'Nour',
      // expiryDate is omitted
    };

    const text = getNotificationText(noticeWithoutExpiryDate, en, 'en');
    expect(text).toBeNull();
  });
});

describe('StaffNotifications dismiss control & close button (B4, F-06, F-07, S72-PO-4, S73-UIQA)', () => {
  const en = getMessages('en');

  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;
  let host: HTMLElement;

  function setupEnvironment() {
    dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      {
        url: 'http://localhost',
      },
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
    vi.stubGlobal('HTMLHeadingElement', dom.window.HTMLHeadingElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('PointerEvent', dom.window.PointerEvent);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = dom.window.document.getElementById('root')!;
    root = createRoot(host);
  }

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    dom?.window?.close();
    vi.unstubAllGlobals();
  });

  it('renders dismiss control on staff notices using toast.dismiss key (B4)', () => {
    const notifications: UnifiedStaffNotification[] = [
      {
        type: 'staff_notice',
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'subscription_expiring_t3',
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
        messages={en}
        initialOpen={true}
        initialNotifications={notifications}
      />,
    );
    const dom = new JSDOM(html);

    // Staff notice has Dismiss button with toast.dismiss copy
    const staffNoticeItem = dom.window.document.querySelector(
      '[data-testid="notification-item-11111111-1111-4111-8111-111111111111"]',
    );
    const dismissBtn = staffNoticeItem?.querySelector(
      '[data-testid="dismiss-11111111-1111-4111-8111-111111111111"]',
    );
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn?.textContent).toBe('Dismiss notification');

    // Form alert has NO dismiss button
    const formAlertItem = dom.window.document.querySelector(
      '[data-testid="notification-item-22222222-1111-4111-8111-111111111111"]',
    );
    const formAlertDismissBtn = formAlertItem?.querySelector(
      '[data-testid="dismiss-22222222-1111-4111-8111-111111111111"]',
    );
    expect(formAlertDismissBtn).toBeNull();
  });

  it('renders explicit Close button in panel header using approved auth.close key in EN and AR (F-07)', () => {
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const html = renderToStaticMarkup(
        <StaffNotifications
          messages={messages}
          locale={locale}
          initialOpen={true}
          initialNotifications={[]}
        />,
      );
      const dom = new JSDOM(html);
      const closeBtn = dom.window.document.querySelector(
        '[data-testid="staff-notifications-close"]',
      );
      expect(closeBtn).not.toBeNull();
      expect(closeBtn?.getAttribute('aria-label')).toBe(messages['auth.close']);
    }

    // Never renders hardcoded English literal when key is missing
    const sparse = { ...en };
    delete (sparse as Record<string, string>)['auth.close'];
    const htmlSparse = renderToStaticMarkup(
      <StaffNotifications
        messages={sparse}
        initialOpen={true}
        initialNotifications={[]}
      />,
    );
    const domSparse = new JSDOM(htmlSparse);
    const closeBtnSparse = domSparse.window.document.querySelector(
      '[data-testid="staff-notifications-close"]',
    );
    expect(closeBtnSparse?.getAttribute('aria-label')).not.toBe('Close');
  });

  it('closes panel and returns focus to bell button when Close button is clicked (F-07)', async () => {
    setupEnvironment();
    await act(async () => {
      root.render(
        <StaffNotifications
          messages={en}
          initialOpen={true}
          initialNotifications={[]}
        />,
      );
    });

    const bell = host.querySelector<HTMLButtonElement>(
      '[data-testid="staff-notifications-bell"]',
    );
    const closeBtn = host.querySelector<HTMLButtonElement>(
      '[data-testid="staff-notifications-close"]',
    );
    expect(bell).not.toBeNull();
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn!.click();
    });

    // Panel is closed
    expect(
      host.querySelector('[data-testid="staff-notifications-panel"]'),
    ).toBeNull();
    expect(bell?.getAttribute('aria-expanded')).toBe('false');
    // Focus returned to bell
    expect(dom.window.document.activeElement).toBe(bell);
  });

  it('moves focus to next item first action after dismiss removes an item (F-06)', async () => {
    let notices: UnifiedStaffNotification[] = [
      {
        type: 'staff_notice',
        id: 'notice-0',
        kind: 'subscription_expiring_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-0',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName: 'Client 0',
        expiryDate: '2026-11-30T10:00:00Z',
      },
      {
        type: 'staff_notice',
        id: 'notice-1',
        kind: 'subscription_expiring_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-1',
        createdAt: '2026-11-27T09:00:00Z',
        readAt: null,
        clientName: 'Client 1',
        expiryDate: '2026-11-30T10:00:00Z',
      },
      {
        type: 'staff_notice',
        id: 'notice-2',
        kind: 'subscription_expiring_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-2',
        createdAt: '2026-11-27T08:00:00Z',
        readAt: null,
        clientName: 'Client 2',
        expiryDate: '2026-11-30T10:00:00Z',
      },
    ];

    const onFetch = vi.fn(async () => ({
      status: 'ok' as const,
      notifications: notices,
    }));
    const onDismiss = vi.fn(
      async (_type: 'form_alert' | 'staff_notice', id: string) => {
        notices = notices.filter((n) => n.id !== id);
        return { status: 'ok' };
      },
    );

    setupEnvironment();
    await act(async () => {
      root.render(
        <StaffNotifications
          messages={en}
          initialOpen={true}
          initialNotifications={notices}
          onFetch={onFetch}
          onDismiss={onDismiss}
        />,
      );
    });

    // Dismiss middle item (notice-1)
    const dismiss1 = host.querySelector<HTMLButtonElement>(
      '[data-testid="dismiss-notice-1"]',
    );
    expect(dismiss1).not.toBeNull();

    await act(async () => {
      dismiss1!.click();
    });

    // Middle item is removed, focus should move to next item's first action (mark-read or dismiss on notice-2)
    const notice2Action = host.querySelector<HTMLButtonElement>(
      '[data-testid="notification-item-notice-2"] button',
    );
    expect(notice2Action).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(notice2Action);
    expect(dom.window.document.activeElement).not.toBe(
      dom.window.document.body,
    );
  });

  it('moves focus to previous item action after dismiss removes the last item (F-06)', async () => {
    let notices: UnifiedStaffNotification[] = [
      {
        type: 'staff_notice',
        id: 'notice-0',
        kind: 'subscription_expiring_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-0',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName: 'Client 0',
        expiryDate: '2026-11-30T10:00:00Z',
      },
      {
        type: 'staff_notice',
        id: 'notice-1',
        kind: 'subscription_expiring_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-1',
        createdAt: '2026-11-27T09:00:00Z',
        readAt: null,
        clientName: 'Client 1',
        expiryDate: '2026-11-30T10:00:00Z',
      },
    ];

    const onFetch = vi.fn(async () => ({
      status: 'ok' as const,
      notifications: notices,
    }));
    const onDismiss = vi.fn(
      async (_type: 'form_alert' | 'staff_notice', id: string) => {
        notices = notices.filter((n) => n.id !== id);
        return { status: 'ok' };
      },
    );

    setupEnvironment();
    await act(async () => {
      root.render(
        <StaffNotifications
          messages={en}
          initialOpen={true}
          initialNotifications={notices}
          onFetch={onFetch}
          onDismiss={onDismiss}
        />,
      );
    });

    // Dismiss last item (notice-1)
    const dismiss1 = host.querySelector<HTMLButtonElement>(
      '[data-testid="dismiss-notice-1"]',
    );
    expect(dismiss1).not.toBeNull();

    await act(async () => {
      dismiss1!.click();
    });

    // Last item is removed and there is no next item. Focus should move to previous item's action
    const notice0Action = host.querySelector<HTMLButtonElement>(
      '[data-testid="notification-item-notice-0"] button',
    );
    expect(notice0Action).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(notice0Action);
    expect(dom.window.document.activeElement).not.toBe(
      dom.window.document.body,
    );
  });

  it('moves focus to panel heading with tabIndex=-1 when last remaining item is removed (F-06)', async () => {
    let notices: UnifiedStaffNotification[] = [
      {
        type: 'staff_notice',
        id: 'notice-0',
        kind: 'subscription_expiring_t3',
        workspaceId: 'ws-1',
        sourceKey: 'sub-0',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
        clientName: 'Client 0',
        expiryDate: '2026-11-30T10:00:00Z',
      },
    ];

    const onFetch = vi.fn(async () => ({
      status: 'ok' as const,
      notifications: notices,
    }));
    const onDismiss = vi.fn(
      async (_type: 'form_alert' | 'staff_notice', id: string) => {
        notices = notices.filter((n) => n.id !== id);
        return { status: 'ok' };
      },
    );

    setupEnvironment();
    await act(async () => {
      root.render(
        <StaffNotifications
          messages={en}
          initialOpen={true}
          initialNotifications={notices}
          onFetch={onFetch}
          onDismiss={onDismiss}
        />,
      );
    });

    const dismiss0 = host.querySelector<HTMLButtonElement>(
      '[data-testid="dismiss-notice-0"]',
    );
    expect(dismiss0).not.toBeNull();

    await act(async () => {
      dismiss0!.click();
    });

    // List is now empty. Focus should move to panel heading with tabIndex=-1
    const heading = host.querySelector<HTMLHeadingElement>(
      '#staff-notifications-title',
    );
    expect(heading).not.toBeNull();
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(dom.window.document.activeElement).toBe(heading);
    expect(dom.window.document.activeElement).not.toBe(
      dom.window.document.body,
    );
  });

  it('moves focus to next item first action after mark-read removes an item (F-06)', async () => {
    let notifications: UnifiedStaffNotification[] = [
      {
        type: 'form_alert',
        id: 'alert-0',
        stage: 'trainer_initial',
        workspaceId: 'ws-1',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
      },
      {
        type: 'form_alert',
        id: 'alert-1',
        stage: 'trainer_initial',
        workspaceId: 'ws-1',
        createdAt: '2026-11-27T09:00:00Z',
        readAt: null,
      },
    ];

    const onFetch = vi.fn(async () => ({
      status: 'ok' as const,
      notifications,
    }));
    const onMarkRead = vi.fn(
      async (_type: 'form_alert' | 'staff_notice', id: string) => {
        notifications = notifications.filter((n) => n.id !== id);
        return { status: 'ok' };
      },
    );

    setupEnvironment();
    await act(async () => {
      root.render(
        <StaffNotifications
          messages={en}
          initialOpen={true}
          initialNotifications={notifications}
          onFetch={onFetch}
          onMarkRead={onMarkRead}
        />,
      );
    });

    const markRead0 = host.querySelector<HTMLButtonElement>(
      '[data-testid="mark-read-alert-0"]',
    );
    expect(markRead0).not.toBeNull();

    await act(async () => {
      markRead0!.click();
    });

    const alert1Action = host.querySelector<HTMLButtonElement>(
      '[data-testid="notification-item-alert-1"] button',
    );
    expect(alert1Action).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(alert1Action);
    expect(dom.window.document.activeElement).not.toBe(
      dom.window.document.body,
    );
  });
});

describe('StaffNotifications single shell surface only (B12, FR-008, FR-013)', () => {
  it('renders only the shell container and bell entry point, no standalone surface', () => {
    const en = getMessages('en');
    const html = renderToStaticMarkup(
      <StaffNotifications messages={en} initialNotifications={[]} />,
    );
    const dom = new JSDOM(html);

    const container = dom.window.document.querySelector(
      '[data-testid="staff-notifications-container"]',
    );
    expect(container).not.toBeNull();

    const bell = dom.window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );
    expect(bell).not.toBeNull();

    const standaloneSurface = dom.window.document.querySelector(
      '[data-testid="staff-notifications-surface"]',
    );
    expect(standaloneSurface).toBeNull();
  });
});

describe('Staff notice parser table-driven and fail-closed tests (B8, B13)', () => {
  it('parses all stored notice kinds successfully', () => {
    const validRawNotices = [
      {
        notice_id: '11111111-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        notice_kind: 'food_replacement_open',
        source_key: '33333333-3333-4333-8333-333333333333',
        created_at: '2026-11-27T10:00:00Z',
        read_at: null,
      },
      {
        notice_id: '22222222-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        notice_kind: 'monthly_quality_reminder',
        source_key: '33333333-3333-4333-8333-333333333333',
        created_at: '2026-11-27T10:00:00Z',
        read_at: null,
      },
      {
        notice_id: '33333333-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        notice_kind: 'subscription_expiring_t3',
        source_key: '33333333-3333-4333-8333-333333333333',
        created_at: '2026-11-27T10:00:00Z',
        read_at: null,
        client_name: 'Tamer',
        expiry_date: '2026-11-30',
        dismissed_at: null,
      },
      {
        notice_id: '44444444-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        notice_kind: 'subscription_expiring_t3_short_lead',
        source_key: '33333333-3333-4333-8333-333333333333',
        created_at: '2026-11-27T10:00:00Z',
        read_at: null,
        client_name: 'Hany',
        expiry_date: '2026-11-29',
        dismissed_at: null,
      },
      {
        notice_id: '55555555-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        notice_kind: 'subscription_expired',
        source_key: '33333333-3333-4333-8333-333333333333',
        created_at: '2026-11-27T10:00:00Z',
        read_at: null,
        client_name: 'Adel',
        expiry_date: '2026-11-26',
        dismissed_at: null,
      },
    ];

    const result = parseStaffNotices({
      status: 'ok',
      notices: validRawNotices,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.notices).toHaveLength(5);
      expect(result.notices.map((n) => n.kind)).toEqual([
        'food_replacement_open',
        'monthly_quality_reminder',
        'subscription_expiring_t3',
        'subscription_expiring_t3_short_lead',
        'subscription_expired',
      ]);
    }
  });

  it('omits unknown notice kinds on UI surface without failing the whole list (B13)', () => {
    const en = getMessages('en');
    const mixedNotices: UnifiedStaffNotification[] = [
      {
        type: 'staff_notice',
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'monthly_quality_reminder',
        workspaceId: 'ws-1',
        sourceKey: 'sub-1',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
      },
      {
        type: 'staff_notice',
        id: '99999999-1111-4111-8111-111111111111',
        kind: 'unknown_mystery_kind',
        workspaceId: 'ws-1',
        sourceKey: 'sub-9',
        createdAt: '2026-11-27T10:00:00Z',
        readAt: null,
      },
    ];

    const html = renderToStaticMarkup(
      <StaffNotifications
        messages={en}
        initialOpen={true}
        initialNotifications={mixedNotices}
      />,
    );
    const dom = new JSDOM(html);
    const list = dom.window.document.querySelector(
      '[data-testid="staff-notifications-list"]',
    );
    expect(list).not.toBeNull();
    // Valid item is rendered
    expect(
      dom.window.document.querySelector(
        '[data-testid="notification-item-11111111-1111-4111-8111-111111111111"]',
      ),
    ).not.toBeNull();
    // Unknown kind is omitted
    expect(
      dom.window.document.querySelector(
        '[data-testid="notification-item-99999999-1111-4111-8111-111111111111"]',
      ),
    ).toBeNull();
  });

  it('fails parsing closed to denied when an unstored kind alias is used (mutation test evidence)', () => {
    const noticeWithAlias = {
      notice_id: '11111111-1111-4111-8111-111111111111',
      workspace_id: '22222222-2222-4222-8222-222222222222',
      notice_kind: 'subscription_expiry_t3', // mutated: alias with 'expiry' instead of 'expiring'
      source_key: '33333333-3333-4333-8333-333333333333',
      created_at: '2026-11-27T10:00:00Z',
      read_at: null,
    };

    const result = parseStaffNotices({
      status: 'ok',
      notices: [noticeWithAlias],
    });
    expect(result.status).toBe('denied');
  });
});
