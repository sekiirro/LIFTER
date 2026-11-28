import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: vi.fn(async () => null),
}));
const actorMock = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock('../../lib/auth/actor', () => actorMock);

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientNotices } from '../../components/client-portal/ClientNotices';
import { StaffNotifications } from '../../components/shell/StaffNotifications';
import { getMessages } from '../../lib/i18n';
import type {
  ClientNotice,
  ClientNoticeKind,
  ClientNotices as ClientNoticesResult,
} from '../../lib/client-access/notices-projection';
import type { UnifiedStaffNotification } from '../../app/(app)/notifications/actions';
import type { StaffNoticeKind } from '../../lib/progress-coaching/food-replacement/notice-projection';

const clientNoticeIdA = '11111111-1111-4111-8111-111111111111';
const sampleDate = '2026-12-01';
const sampleTimestamp = '2026-11-28T10:00:00Z';

function makeClientNotice(
  kind: ClientNoticeKind,
  overrides: Partial<ClientNotice> = {},
): ClientNotice {
  return {
    noticeId: clientNoticeIdA,
    kind,
    createdAt: sampleTimestamp,
    readAt: null,
    expiryDate: sampleDate,
    dismissedAt: null,
    ...overrides,
  };
}

type StaffNoticeItem = Extract<
  UnifiedStaffNotification,
  { type: 'staff_notice' }
>;

function makeStaffNotice(
  kind: StaffNoticeKind,
  overrides: Partial<StaffNoticeItem> = {},
): StaffNoticeItem {
  return {
    type: 'staff_notice',
    id: '33333333-3333-4333-8333-333333333333',
    kind,
    workspaceId: '44444444-4444-4444-8444-444444444444',
    sourceKey: '55555555-5555-4555-8555-555555555555',
    createdAt: sampleTimestamp,
    readAt: null,
    clientName: 'Nour',
    expiryDate: '2026-12-01T22:00:00Z',
    ...overrides,
  };
}

/**
 * T008 (specs/028-subscription-expiry): Missing UI-level clauses verification.
 * Clause (a): Client and staff expiry notices render NO renewal call-to-action
 *             (assert absence per FR-001, FR-002, SC-004).
 * Clause (b): Empty and error states of client inbox notices and staff notices/bell
 *             surfaces render already-shipped approved keys in EN and AR (RTL).
 *
 * NOTE: Existing component behaviour already satisfies these clauses.
 * These tests are REGRESSION TESTS ensuring no renewal CTA is ever introduced
 * and that approved empty/error strings remain intact across locales.
 */
describe('T008 Clause (a): Client expiry notices render NO renewal call-to-action (regression)', () => {
  const expiryKinds: ClientNoticeKind[] = [
    'subscription_expiring_t3',
    'subscription_expiring_t3_short_lead',
    'subscription_expiring_t1',
    'subscription_expired',
  ];

  it.each(expiryKinds)(
    'client expiry notice "%s" renders no renewal CTA in English (FR-001, SC-004 regression)',
    (kind) => {
      const messages = getMessages('en');
      const notice = makeClientNotice(kind);
      const html = renderToStaticMarkup(
        <ClientNotices
          result={{ status: 'ok', notices: [notice] }}
          locale="en"
          messages={messages}
        />,
      );
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Assert presence of notification content
      const list = doc.querySelector('[data-testid="client-notices"]');
      expect(list).not.toBeNull();

      // Assert ABSENCE of any renewal call-to-action or text
      const allText = doc.body.textContent || '';
      expect(allText).not.toMatch(/renew/i);
      expect(allText).not.toMatch(/renewal/i);
      expect(allText).not.toMatch(/extend/i);
      expect(allText).not.toMatch(/upgrade/i);

      // Assert NO links (<a>) exist
      const links = doc.querySelectorAll('a');
      expect(links.length).toBe(0);

      // Assert the only buttons are the approved Mark as Read and Dismiss actions
      const buttons = Array.from(doc.querySelectorAll('button'));
      const buttonTexts = buttons.map((b) => b.textContent?.trim());
      expect(buttonTexts).toEqual([
        messages['client.portal.inbox.markRead'],
        messages['toast.dismiss'],
      ]);
    },
  );

  it.each(expiryKinds)(
    'client expiry notice "%s" renders no renewal CTA in Egyptian Arabic (FR-001, SC-004 regression)',
    (kind) => {
      const messages = getMessages('ar');
      const notice = makeClientNotice(kind);
      const html = renderToStaticMarkup(
        <ClientNotices
          result={{ status: 'ok', notices: [notice] }}
          locale="ar"
          messages={messages}
        />,
      );
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const list = doc.querySelector('[data-testid="client-notices"]');
      expect(list).not.toBeNull();

      // Assert ABSENCE of Arabic renewal words (جدد, تجديد, تمديد, اشتراك جديد)
      const allText = doc.body.textContent || '';
      expect(allText).not.toMatch(/جدد/);
      expect(allText).not.toMatch(/تجديد/);
      expect(allText).not.toMatch(/تمديد/);

      // Assert NO links exist
      const links = doc.querySelectorAll('a');
      expect(links.length).toBe(0);

      // Assert only approved buttons exist
      const buttons = Array.from(doc.querySelectorAll('button'));
      const buttonTexts = buttons.map((b) => b.textContent?.trim());
      expect(buttonTexts).toEqual([
        messages['client.portal.inbox.markRead'],
        messages['toast.dismiss'],
      ]);
    },
  );

  it('client expiry notice when read renders only dismiss button and no renewal CTA', () => {
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const notice = makeClientNotice('subscription_expiring_t3', {
        readAt: '2026-11-28T11:00:00Z',
      });
      const html = renderToStaticMarkup(
        <ClientNotices
          result={{ status: 'ok', notices: [notice] }}
          locale={locale}
          messages={messages}
        />,
      );
      const dom = new JSDOM(html);
      const buttons = Array.from(
        dom.window.document.querySelectorAll('button'),
      );
      expect(buttons).toHaveLength(1);
      expect(buttons[0]?.textContent?.trim()).toBe(messages['toast.dismiss']);
    }
  });

  it('client expiry notice when dismissed renders no buttons and no renewal CTA', () => {
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const notice = makeClientNotice('subscription_expiring_t3', {
        dismissedAt: '2026-11-28T11:00:00Z',
      });
      const html = renderToStaticMarkup(
        <ClientNotices
          result={{ status: 'ok', notices: [notice] }}
          locale={locale}
          messages={messages}
        />,
      );
      const dom = new JSDOM(html);
      const buttons = Array.from(
        dom.window.document.querySelectorAll('button'),
      );
      expect(buttons).toHaveLength(0);
    }
  });
});

describe('T008 Clause (a): Staff expiry notices render NO renewal call-to-action (regression)', () => {
  const staffExpiryKinds: StaffNoticeKind[] = [
    'subscription_expiring_t3',
    'subscription_expiring_t3_short_lead',
    'subscription_expired',
  ];

  it.each(staffExpiryKinds)(
    'staff expiry notice "%s" renders no renewal CTA in English (FR-002, FR-013 regression)',
    (kind) => {
      const messages = getMessages('en');
      const notice = makeStaffNotice(kind);
      const html = renderToStaticMarkup(
        <StaffNotifications
          messages={messages}
          locale="en"
          initialOpen={true}
          initialNotifications={[notice]}
        />,
      );
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const item = doc.querySelector(
        `[data-testid="notification-item-${notice.id}"]`,
      );
      expect(item).not.toBeNull();

      // Assert ABSENCE of renewal copy in English
      const allText = doc.body.textContent || '';
      expect(allText).not.toMatch(/renew/i);
      expect(allText).not.toMatch(/renewal/i);
      expect(allText).not.toMatch(/extend/i);

      // Assert NO links exist
      const links = doc.querySelectorAll('a');
      expect(links.length).toBe(0);

      // Assert item actions only contain Mark as read and Dismiss
      const actionButtons = Array.from(
        item?.querySelectorAll('button') || [],
      ).map((b) => b.textContent?.trim());
      expect(actionButtons).toEqual([
        messages['staff.notifications.markRead'],
        messages['toast.dismiss'],
      ]);
    },
  );

  it.each(staffExpiryKinds)(
    'staff expiry notice "%s" renders no renewal CTA in Egyptian Arabic (FR-002, FR-013 regression)',
    (kind) => {
      const messages = getMessages('ar');
      const notice = makeStaffNotice(kind);
      const html = renderToStaticMarkup(
        <StaffNotifications
          messages={messages}
          locale="ar"
          initialOpen={true}
          initialNotifications={[notice]}
        />,
      );
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const item = doc.querySelector(
        `[data-testid="notification-item-${notice.id}"]`,
      );
      expect(item).not.toBeNull();

      // Assert ABSENCE of Arabic renewal words
      const allText = doc.body.textContent || '';
      expect(allText).not.toMatch(/جدد/);
      expect(allText).not.toMatch(/تجديد/);
      expect(allText).not.toMatch(/تمديد/);

      // Assert NO links exist
      const links = doc.querySelectorAll('a');
      expect(links.length).toBe(0);

      // Assert only approved action buttons exist
      const actionButtons = Array.from(
        item?.querySelectorAll('button') || [],
      ).map((b) => b.textContent?.trim());
      expect(actionButtons).toEqual([
        messages['staff.notifications.markRead'],
        messages['toast.dismiss'],
      ]);
    },
  );
});

describe('T008 Clause (b): Staff notices & bell surface empty and error states (regression)', () => {
  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;
  let host: HTMLElement;

  function setupDOM() {
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

  it('renders shipped approved empty state in English and Egyptian Arabic (staff.notifications.empty)', () => {
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
      const testDom = new JSDOM(html);
      const emptyBox = testDom.window.document.querySelector(
        '[data-testid="staff-notifications-empty"]',
      );
      expect(
        emptyBox,
        `Empty state must render for locale ${locale}`,
      ).not.toBeNull();
      expect(emptyBox?.textContent?.trim()).toBe(
        messages['staff.notifications.empty'],
      );

      // Byte-exact assertions against approved catalog
      if (locale === 'en') {
        expect(emptyBox?.textContent?.trim()).toBe('You are all caught up.');
      } else {
        expect(emptyBox?.textContent?.trim()).toBe('مفيش إشعارات جديدة.');
      }
    }
  });

  it('renders shipped approved error state in English with role="alert" and retry button', async () => {
    setupDOM();
    const messages = getMessages('en');
    const failingFetch = vi.fn(async () => ({
      status: 'error' as const,
      notifications: [],
    }));

    await act(async () => {
      root.render(
        <StaffNotifications
          messages={messages}
          locale="en"
          initialOpen={true}
          onFetch={failingFetch}
        />,
      );
    });

    const errorBox = host.querySelector(
      '[data-testid="staff-notifications-error"]',
    );
    expect(errorBox).not.toBeNull();
    expect(errorBox?.getAttribute('role')).toBe('alert');

    // Title
    const title = errorBox?.querySelector('h3');
    expect(title?.textContent?.trim()).toBe(
      messages['staff.notifications.error'],
    );
    expect(title?.textContent?.trim()).toBe('Unable to load data');

    // Description
    const desc = errorBox?.querySelector('p');
    expect(desc?.textContent?.trim()).toBe(
      messages['staff.notifications.errorDescription'],
    );
    expect(desc?.textContent?.trim()).toBe(
      'Something went wrong. Please try again.',
    );

    // Retry button
    const retryBtn = host.querySelector(
      '[data-testid="staff-notifications-retry"]',
    );
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.textContent?.trim()).toBe(
      messages['staff.notifications.retry'],
    );
    expect(retryBtn?.textContent?.trim()).toBe('Retry');

    // Clicking retry re-triggers fetch
    await act(async () => {
      retryBtn?.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true }),
      );
    });
    expect(failingFetch).toHaveBeenCalledTimes(2);
  });

  it('renders shipped approved error state in Egyptian Arabic with role="alert" and retry button', async () => {
    setupDOM();
    const messages = getMessages('ar');
    const failingFetch = vi.fn(async () => ({
      status: 'error' as const,
      notifications: [],
    }));

    await act(async () => {
      root.render(
        <StaffNotifications
          messages={messages}
          locale="ar"
          initialOpen={true}
          onFetch={failingFetch}
        />,
      );
    });

    const errorBox = host.querySelector(
      '[data-testid="staff-notifications-error"]',
    );
    expect(errorBox).not.toBeNull();
    expect(errorBox?.getAttribute('role')).toBe('alert');

    // Title (byte-exact to approved copy-proposal.md Screen 1)
    const title = errorBox?.querySelector('h3');
    expect(title?.textContent?.trim()).toBe(
      messages['staff.notifications.error'],
    );
    expect(title?.textContent?.trim()).toBe('تعذّر تحميل البيانات');

    // Description (byte-exact to approved copy-proposal.md Screen 1)
    const desc = errorBox?.querySelector('p');
    expect(desc?.textContent?.trim()).toBe(
      messages['staff.notifications.errorDescription'],
    );
    expect(desc?.textContent?.trim()).toBe('حدث خطأ. يرجى المحاولة مرة أخرى.');

    // Retry button (byte-exact to approved copy-proposal.md Screen 1)
    const retryBtn = host.querySelector(
      '[data-testid="staff-notifications-retry"]',
    );
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.textContent?.trim()).toBe(
      messages['staff.notifications.retry'],
    );
    expect(retryBtn?.textContent?.trim()).toBe('إعادة المحاولة');

    // Clicking retry re-triggers fetch
    await act(async () => {
      retryBtn?.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true }),
      );
    });
    expect(failingFetch).toHaveBeenCalledTimes(2);
  });

  it('bell button renders approved aria-label in empty and unread states across EN and AR', () => {
    // Empty state (0 unread): uses staff.notifications.bellLabel
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const html = renderToStaticMarkup(
        <StaffNotifications
          messages={messages}
          locale={locale}
          initialNotifications={[]}
        />,
      );
      const testDom = new JSDOM(html);
      const bell = testDom.window.document.querySelector(
        '[data-testid="staff-notifications-bell"]',
      );
      expect(bell?.getAttribute('aria-label')).toBe(
        messages['staff.notifications.bellLabel'],
      );
      expect(
        testDom.window.document.querySelector(
          '[data-testid="staff-notifications-badge"]',
        ),
      ).toBeNull();
    }

    // Unread count state (>0 unread): uses staff.notifications.bellLabelWithCount
    const unreadNoticeA = makeStaffNotice('subscription_expiring_t3', {
      id: 'a1',
      readAt: null,
    });
    const unreadNoticeB = makeStaffNotice('subscription_expired', {
      id: 'b2',
      readAt: null,
    });

    const enHtml = renderToStaticMarkup(
      <StaffNotifications
        messages={getMessages('en')}
        locale="en"
        initialNotifications={[unreadNoticeA, unreadNoticeB]}
      />,
    );
    const enBell = new JSDOM(enHtml).window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );
    expect(enBell?.getAttribute('aria-label')).toBe(
      'Open notifications (2 unread)',
    );

    const arHtml = renderToStaticMarkup(
      <StaffNotifications
        messages={getMessages('ar')}
        locale="ar"
        initialNotifications={[unreadNoticeA, unreadNoticeB]}
      />,
    );
    const arBell = new JSDOM(arHtml).window.document.querySelector(
      '[data-testid="staff-notifications-bell"]',
    );
    expect(arBell?.getAttribute('aria-label')).toBe(
      'افتح الإشعارات (٢ إشعار مش مقروء)',
    );
  });
});

describe('T008 Clause (b): Client inbox notices empty and error/denied states (regression)', () => {
  it('renders shipped approved empty state in English and Egyptian Arabic (client.portal.inbox.empty)', () => {
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      const html = renderToStaticMarkup(
        <ClientNotices
          result={{ status: 'ok', notices: [] }}
          locale={locale}
          messages={messages}
        />,
      );
      const dom = new JSDOM(html);
      const emptyEl = dom.window.document.querySelector(
        '[data-testid="client-notices-empty"]',
      );
      expect(emptyEl, `Empty element must render for ${locale}`).not.toBeNull();
      expect(emptyEl?.textContent?.trim()).toBe(
        messages['client.portal.inbox.empty'],
      );

      if (locale === 'en') {
        expect(emptyEl?.textContent?.trim()).toBe('You are all caught up.');
      } else {
        expect(emptyEl?.textContent?.trim()).toBe('مفيش إشعارات جديدة.');
      }
    }
  });
});

// PO 028-05 option B (S75-PO-3 / S75-R27): a failed client-notices read shows
// the app's standard generic error state with the already-approved copy keys.
// Spec 028 does not distinguish denied from error for this inbox (the projection
// collapses every unexpected/failed response to 'denied'), so both are treated
// as the same generic error state.
describe('028-05: Client inbox generic error state on read failure', () => {
  it('renders states.error.title and states.error.description for denied/error reads in EN and AR', () => {
    for (const locale of ['en', 'ar'] as const) {
      const messages = getMessages(locale);
      for (const status of ['denied', 'error'] as const) {
        const html = renderToStaticMarkup(
          <ClientNotices
            result={{ status } as ClientNoticesResult}
            locale={locale}
            messages={messages}
          />,
        );

        const dom = new JSDOM(html);
        const errorState = dom.window.document.querySelector(
          '[role="alert"][data-testid="client-notices-error"]',
        );
        expect(
          errorState,
          `generic error state must render for ${locale}/${status}`,
        ).not.toBeNull();
        expect(errorState?.textContent).toContain(
          messages['states.error.title'],
        );
        expect(errorState?.textContent).toContain(
          messages['states.error.description'],
        );
        expect(
          dom.window.document.querySelector('[data-testid="client-notices"]'),
        ).toBeNull();
        expect(
          dom.window.document.querySelector(
            '[data-testid="client-notices-empty"]',
          ),
        ).toBeNull();
      }
    }
  });
});
