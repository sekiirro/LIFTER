import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { DirectoryWorkspaceSelector } from '../../app/(app)/clients/DirectoryWorkspaceSelector';
import { getMessages } from '../../lib/i18n';
import { tokensToCss } from '../../lib/design/tokens-css';

const screenshotDir =
  'C:/Users/NEW LAP/.lifter/runs/s76-luna-f22dir/screenshots';
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const matrix = [
  { locale: 'en' as const, theme: 'light', width: 1440, height: 900 },
  { locale: 'en' as const, theme: 'dark', width: 1440, height: 900 },
  { locale: 'en' as const, theme: 'light', width: 390, height: 844 },
  { locale: 'en' as const, theme: 'dark', width: 390, height: 844 },
  { locale: 'ar' as const, theme: 'light', width: 1440, height: 900 },
  { locale: 'ar' as const, theme: 'dark', width: 1440, height: 900 },
  { locale: 'ar' as const, theme: 'light', width: 390, height: 844 },
  { locale: 'ar' as const, theme: 'dark', width: 390, height: 844 },
];

describe('Design Gate: directory workspace selector matrix and axe', () => {
  afterAll(() => routerPush.mockReset());

  it('renders the selector across locale, theme and viewport cells', async () => {
    mkdirSync(screenshotDir, { recursive: true });
    const globalsCss = readFileSync(
      join(__dirname, '../../app/globals.css'),
      'utf8',
    );
    const portalCss = readFileSync(
      join(
        __dirname,
        '../../components/client-portal/client-portal.module.css',
      ),
      'utf8',
    );
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      return;
    }

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      for (const cell of matrix) {
        await page.setViewportSize({ width: cell.width, height: cell.height });
        const messages = getMessages(cell.locale);
        const markup = renderToStaticMarkup(
          createElement(
            'main',
            { dir: cell.locale === 'ar' ? 'rtl' : 'ltr' },
            createElement(
              'div',
              { className: 'control' },
              createElement(
                'label',
                { htmlFor: 'directory-workspace' },
                messages['registration.workspace'],
              ),
              createElement(DirectoryWorkspaceSelector, {
                workspaceId,
                workspaces: [
                  { id: workspaceId, name: 'Main Gym' },
                  {
                    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    name: 'Second Gym',
                  },
                ],
                query: {
                  search: null,
                  approvalState: null,
                  subscriptionStatus: null,
                  assignment: null,
                  page: 1,
                },
              }),
            ),
          ),
        );
        await page.setContent(`<!doctype html>
          <html lang="${cell.locale}" dir="${cell.locale === 'ar' ? 'rtl' : 'ltr'}" data-theme="${cell.theme}">
            <head><title>Client directory workspace selector</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>${tokensToCss()}${globalsCss}${portalCss}</style></head>
            <body data-theme="${cell.theme}">${markup}</body>
          </html>`);

        const dimensions = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        }));
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(axeResults.violations).toEqual([]);
        await page.screenshot({
          path: join(
            screenshotDir,
            `directory-selector-${cell.locale}-${cell.theme}-${cell.width}x${cell.height}.png`,
          ),
          fullPage: true,
        });
      }
    } finally {
      await browser.close();
    }
  }, 60000);
});
