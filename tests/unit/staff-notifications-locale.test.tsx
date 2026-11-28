import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
// Capture the props AppShell / PlatformOwnerHeader pass to StaffNotifications
// without rendering the real panel (which fetches and shows no date while closed).
vi.mock('../../components/shell/StaffNotifications', () => ({
  StaffNotifications: (props: { locale?: string }) => (
    <div
      data-testid="staff-notifications-mock"
      data-locale={props.locale ?? 'unset'}
    />
  ),
}));
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../../components/shell/AppShell';
import { PlatformOwnerHeader } from '../../components/shell/PlatformOwnerHeader';
import { getMessages } from '../../lib/i18n';

function mockedLocale(html: string): string | null {
  const dom = new JSDOM(html);
  const el = dom.window.document.querySelector(
    '[data-testid="staff-notifications-mock"]',
  );
  return el?.getAttribute('data-locale') ?? null;
}

describe('StaffNotifications locale forwarding (S73-UIQA-F03)', () => {
  it("AppShell with locale 'ar' passes locale 'ar' to StaffNotifications", () => {
    const html = renderToStaticMarkup(
      <AppShell role="trainer" messages={getMessages('ar')} locale="ar">
        <div>content</div>
      </AppShell>,
    );
    expect(mockedLocale(html)).toBe('ar');
  });

  it("AppShell with locale 'en' passes locale 'en' to StaffNotifications", () => {
    const html = renderToStaticMarkup(
      <AppShell role="trainer" messages={getMessages('en')} locale="en">
        <div>content</div>
      </AppShell>,
    );
    expect(mockedLocale(html)).toBe('en');
  });

  it('AppShell without locale defaults to en for StaffNotifications', () => {
    const html = renderToStaticMarkup(
      <AppShell role="trainer" messages={getMessages('en')}>
        <div>content</div>
      </AppShell>,
    );
    expect(mockedLocale(html)).toBe('en');
  });

  it("PlatformOwnerHeader with locale 'ar' passes locale 'ar' to StaffNotifications", () => {
    const html = renderToStaticMarkup(
      <PlatformOwnerHeader messages={getMessages('ar')} locale="ar" />,
    );
    expect(mockedLocale(html)).toBe('ar');
  });

  it('PlatformOwnerHeader without locale defaults to en for StaffNotifications', () => {
    const html = renderToStaticMarkup(
      <PlatformOwnerHeader messages={getMessages('en')} />,
    );
    expect(mockedLocale(html)).toBe('en');
  });
});

describe('StaffNotifications action touch targets (S73-UIQA-F04)', () => {
  it('markReadButton and dismissButton use the 44px var(--touch-min) target', () => {
    const css = readFileSync(
      new URL(
        '../../components/shell/StaffNotifications.module.css',
        import.meta.url,
      ),
      'utf8',
    );
    const rule = css.match(
      /\.markReadButton,\s*\.dismissButton\s*\{[^}]*\}/,
    )?.[0];
    expect(rule, 'markReadButton/dismissButton rule must exist').toBeDefined();
    expect(rule).toContain('min-block-size: var(--touch-min)');
    expect(rule).not.toContain('32px');
  });
});
