import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionExpiredNotice } from '../../components/plans/SubscriptionExpiredNotice';
import { LOCALE_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const mock = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mock.cookies }));

import SubscriptionExpiredPage from '../../app/(client)/subscription-expired/page';

function readApprovedExpiryCopyFromSpec() {
  const spec = readFileSync(
    join(process.cwd(), 'specs/019-plan-core/spec.md'),
    'utf8',
  );
  const sectionMarker =
    '## Approved expiry page copy (S42-PO-6; title and body)';
  const start = spec.indexOf(sectionMarker);
  expect(start).toBeGreaterThan(-1);
  const rest = spec.slice(start + sectionMarker.length);
  const nextHeading = rest.search(/^## /m);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  const extract = (label: string) => {
    const match = section.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
    expect(match?.[1]).toBeTruthy();
    return match![1]!.trimEnd();
  };

  return {
    titleEn: extract('Title EN'),
    titleAr: extract('Title AR'),
    bodyAr: extract('Body AR'),
    bodyEn: extract('Body EN'),
  };
}

function assertInformationalOnly(html: string) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const interactive = document.querySelectorAll(
    'button, a, input, select, textarea, form, [role="button"], [role="link"], [tabindex]',
  );
  expect(interactive).toHaveLength(0);
  return document;
}

describe('F19 T030 SubscriptionExpiredNotice & page', () => {
  it('renders byte-identical EN approved copy with LTR and zero interactive elements', () => {
    const approved = readApprovedExpiryCopyFromSpec();
    const html = renderToStaticMarkup(
      <SubscriptionExpiredNotice locale="en" messages={getMessages('en')} />,
    );
    const doc = assertInformationalOnly(html);
    const section = doc.querySelector('section');
    expect(section?.getAttribute('dir')).toBe('ltr');
    expect(section?.getAttribute('lang')).toBe('en');
    expect(doc.querySelector('h1')?.textContent).toBe(approved.titleEn);
    expect(doc.querySelector('p')?.textContent).toBe(approved.bodyEn);
  });

  it('renders byte-identical AR approved copy with RTL and zero interactive elements', () => {
    const approved = readApprovedExpiryCopyFromSpec();
    const html = renderToStaticMarkup(
      <SubscriptionExpiredNotice locale="ar" messages={getMessages('ar')} />,
    );
    const doc = assertInformationalOnly(html);
    const section = doc.querySelector('section');
    expect(section?.getAttribute('dir')).toBe('rtl');
    expect(section?.getAttribute('lang')).toBe('ar');
    expect(doc.querySelector('h1')?.textContent).toBe(approved.titleAr);
    expect(doc.querySelector('p')?.textContent).toBe(approved.bodyAr);
  });

  it('renders the /subscription-expired page cleanly for both locales without actions', async () => {
    const approved = readApprovedExpiryCopyFromSpec();

    mock.cookies.mockResolvedValue({
      get: (name: string) =>
        name === LOCALE_COOKIE ? { value: 'ar' } : undefined,
    });
    const arHtml = renderToStaticMarkup(await SubscriptionExpiredPage());
    const arDoc = assertInformationalOnly(arHtml);
    expect(arDoc.querySelector('h1')?.textContent).toBe(approved.titleAr);
    expect(arDoc.querySelector('p')?.textContent).toBe(approved.bodyAr);

    mock.cookies.mockResolvedValue({
      get: (name: string) =>
        name === LOCALE_COOKIE ? { value: 'en' } : undefined,
    });
    const enHtml = renderToStaticMarkup(await SubscriptionExpiredPage());
    const enDoc = assertInformationalOnly(enHtml);
    expect(enDoc.querySelector('h1')?.textContent).toBe(approved.titleEn);
    expect(enDoc.querySelector('p')?.textContent).toBe(approved.bodyEn);
  });
});
