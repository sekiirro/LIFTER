import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import {
  captureHeroScreenshot,
  expectHeroAxeClean,
  heroEvidenceDirectory,
} from './registration-hero-evidence';

/**
 * S29 screenshot evidence for the production registration hero.
 *
 * Matrix: {AR,EN} x {Light, Dark, Follow OS light, Follow OS dark} x {390,1440}
 * plus reduced-transparency per explicit theme and print Light/Dark, always on
 * the shipped textured artwork. Every capture is asserted axe-clean. Screenshots
 * and `INDEX.md` are written to the OS temp directory, never into the repo.
 */
const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const heroPath = '/showcase/f14-hero';

type ThemeName = 'Light' | 'Dark' | 'Follow OS light' | 'Follow OS dark';

type Scenario = {
  id: string;
  theme: ThemeName;
  cookie: 'light' | 'dark' | null;
  os: 'light' | 'dark';
  locale: 'ar' | 'en';
  width: 390 | 1440;
  media: 'screen' | 'print';
  reducedTransparency: boolean;
};

const scenarios: Scenario[] = [];

for (const theme of [
  { name: 'Light' as const, cookie: 'light' as const, os: 'light' as const },
  { name: 'Dark' as const, cookie: 'dark' as const, os: 'dark' as const },
  {
    name: 'Follow OS light' as const,
    cookie: null,
    os: 'light' as const,
  },
  {
    name: 'Follow OS dark' as const,
    cookie: null,
    os: 'dark' as const,
  },
]) {
  for (const locale of ['ar', 'en'] as const) {
    for (const width of [390, 1440] as const) {
      scenarios.push({
        id: `hero-screen-${theme.name.replaceAll(' ', '-').toLowerCase()}-${locale}-${width}`,
        theme: theme.name,
        cookie: theme.cookie,
        os: theme.os,
        locale,
        width,
        media: 'screen',
        reducedTransparency: false,
      });
    }
  }
}

for (const theme of [
  { name: 'Light' as const, cookie: 'light' as const, os: 'light' as const },
  { name: 'Dark' as const, cookie: 'dark' as const, os: 'dark' as const },
]) {
  for (const locale of ['ar', 'en'] as const) {
    for (const width of [390, 1440] as const) {
      scenarios.push({
        id: `hero-reduced-transparency-${theme.name.toLowerCase()}-${locale}-${width}`,
        theme: theme.name,
        cookie: theme.cookie,
        os: theme.os,
        locale,
        width,
        media: 'screen',
        reducedTransparency: true,
      });
    }
  }
}

for (const theme of [
  { name: 'Light' as const, cookie: 'light' as const, os: 'light' as const },
  { name: 'Dark' as const, cookie: 'dark' as const, os: 'dark' as const },
]) {
  for (const locale of ['ar', 'en'] as const) {
    for (const width of [390, 1440] as const) {
      scenarios.push({
        id: `hero-print-${theme.name.toLowerCase()}-${locale}-${width}`,
        theme: theme.name,
        cookie: theme.cookie,
        os: theme.os,
        locale,
        width,
        media: 'print',
        reducedTransparency: false,
      });
    }
  }
}

const captured: (Scenario & { file: string; axeViolations: number })[] = [];

async function applyPreferences(context: BrowserContext, scenario: Scenario) {
  await context.clearCookies();
  const cookies: { name: string; value: string; url: string }[] = [
    { name: LOCALE_COOKIE, value: scenario.locale, url: origin },
  ];
  if (scenario.cookie) {
    cookies.push({ name: THEME_COOKIE, value: scenario.cookie, url: origin });
  }
  await context.addCookies(cookies);
}

async function captureScenario(
  page: Page,
  context: BrowserContext,
  scenario: Scenario,
) {
  await page.setViewportSize({
    width: scenario.width,
    height: scenario.width === 390 ? 844 : 900,
  });
  await page.emulateMedia({
    colorScheme: scenario.os,
    media: scenario.media,
  });
  if (scenario.reducedTransparency) {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
  }
  await applyPreferences(context, scenario);
  await page.goto(heroPath);
  await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
    'data-has-banner',
    'true',
  );
  await expect(page.locator('[data-registration-card]')).toBeVisible();

  await expectHeroAxeClean(page);

  const file = await captureHeroScreenshot(page, scenario.id);
  captured.push({ ...scenario, file, axeViolations: 0 });
}

for (const scenario of scenarios) {
  test(`screenshot: ${scenario.id}`, async ({ page, context }) => {
    await captureScenario(page, context, scenario);
  });
}

test.afterAll(async () => {
  if (captured.length === 0) return;
  const rows = captured
    .map(
      (entry) =>
        `| \`${entry.id}.png\` | ${entry.theme} | ${entry.locale} | ${entry.width} | ${
          entry.media === 'print' ? 'print' : 'screen'
        } | ${entry.reducedTransparency ? 'reduce' : 'no-preference'} | ${
          entry.axeViolations
        } |`,
    )
    .join('\n');
  const index = `# S29 Hero Glisse screenshot evidence

- Generated: ${new Date().toISOString()}
- Source: production registration hero showcase (\`/showcase/f14-hero\`) with the shipped **textured** artwork (\`public/dev/f14-hero/desktop.webp\` at 1440 px, \`public/dev/f14-hero/mobile.webp\` at 390 px).
- Matrix: {AR, EN} x {Light, Dark, Follow OS light, Follow OS dark} x {390, 1440}, plus \`prefers-reduced-transparency: reduce\` per explicit theme and print media for Light/Dark.
- Accessibility: every capture was asserted axe-clean with \`expectHeroAxeClean\` (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa tags).
- Contrast note: this evidence set uses the shipped textured artwork. The separate worst-case bright/high-variance artwork matrix lives in \`contrast/\`; consult the run report for its final dev/prod results.

| File | Theme | Locale | Width | Media | prefers-reduced-transparency | axe violations |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
`;
  await mkdir(heroEvidenceDirectory, { recursive: true });
  await writeFile(join(heroEvidenceDirectory, 'INDEX.md'), index, 'utf8');
});
