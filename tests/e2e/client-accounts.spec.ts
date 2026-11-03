import { expect, test, type Page } from '@playwright/test';
import { localSupabaseContainer } from '../integration/local-docker';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { createHash, randomUUID } from 'node:crypto';
import {
  serverLogRawPath,
  serverLogSummaryPath,
  type ServerLogSummary,
} from './server-log-capture';
import { scanSensitiveLogLines } from './server-log-privacy';
import { parsePhoneNumber } from 'libphonenumber-js';
import { generateEgyptianMobile } from './egyptian-mobile';

const origin = 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let validToken: string;
let pendingToken: string;
let duplicateToken: string;
let providerToken: string;
let expiredToken: string;
let knownStaffEmail: string;
let fixture: Awaited<
  ReturnType<
    typeof import('../integration/registration-links-fixture').registrationFixture
  >
>;

test.beforeAll(async () => {
  if (!local) return;
  const { registrationFixture, secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  fixture = await registrationFixture();
  knownStaffEmail = fixture.po.email;
  const seed = async () => {
    const value = secret();
    checked(
      await issue(fixture, fixture.po.client, { token_hash: value.hash }),
    );
    return value.token;
  };
  validToken = await seed();
  pendingToken = await seed();
  duplicateToken = await seed();
  providerToken = await seed();
  const expired =
    await import('../integration/registration-links-fixture').then(
      ({ backdated }) =>
        backdated(
          fixture,
          new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        ),
    );
  expiredToken = expired.token;
});

type PrivacyCapture = {
  html: string[];
  rsc: string[];
  actionRequests: string[];
  actionResponses: string[];
  metadata: string[];
  browserLogs: string[];
  serverLogs: string[];
  serverLogStart: number;
  knownSensitiveLogValues: Record<string, string[]>;
  requestHeaders: Array<Record<string, string>>;
  responseJobs: Promise<void>[];
};
const privacyCaptures = new WeakMap<Page, PrivacyCapture>();

test.beforeEach(async ({ page, context }, testInfo) => {
  if (!local || testInfo.title.includes('completion capture')) return;
  const capture: PrivacyCapture = {
    html: [],
    rsc: [],
    actionRequests: [],
    actionResponses: [],
    metadata: [],
    browserLogs: [],
    serverLogs: [],
    serverLogStart: (await stat(serverLogRawPath)).size,
    knownSensitiveLogValues: {
      account_id: [fixture.po.userId],
      workspace_id: [fixture.wsA.id, fixture.wsB.id],
      ip_key: [],
      link_key: [],
      attestation: [],
    },
    requestHeaders: [],
    responseJobs: [],
  };
  privacyCaptures.set(page, capture);
  page.on('request', (request) => {
    capture.requestHeaders.push(request.headers());
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname.startsWith('/register/')
    )
      capture.actionRequests.push(
        request.postDataBuffer()?.toString('utf8') ?? '',
      );
  });
  page.on('response', (response) => {
    capture.responseJobs.push(
      (async () => {
        const contentType = response.headers()['content-type'] ?? '';
        const isRegister = new URL(response.url()).pathname.startsWith(
          '/register/',
        );
        if (
          !isRegister ||
          (response.request().method() !== 'GET' &&
            response.request().method() !== 'POST')
        )
          return;
        const body = await response.text().catch(() => '');
        if (contentType.includes('text/x-component')) capture.rsc.push(body);
        else if (contentType.includes('text/html')) {
          capture.html.push(body);
          capture.rsc.push(...embeddedRsc(body));
        }
        if (response.request().method() === 'POST')
          capture.actionResponses.push(body);
      })(),
    );
  });
  page.on('console', (message) => capture.browserLogs.push(message.text()));
  page.on('pageerror', (error) => capture.browserLogs.push(error.message));
  await context.tracing.start({
    screenshots: false,
    snapshots: true,
    sources: false,
  });
});

test.afterEach(async ({ page, context }, testInfo) => {
  const capture = privacyCaptures.get(page);
  if (!capture) return;
  const serverLogSummary = await readFile(serverLogSummaryPath, 'utf8').catch(
    () => '',
  );
  expect(serverLogSummary.length > 0).toBe(true);
  const parsedServerLogs = JSON.parse(serverLogSummary) as ServerLogSummary;
  expect(parsedServerLogs.storedPayload).toBe('scrubbed counts only');
  const traceDirectory = await mkdtemp(join(tmpdir(), 'lftr-u8-capture-'));
  const tracePath = join(traceDirectory, 'capture.zip');
  try {
    let trace = '';
    try {
      await Promise.all(capture.responseJobs);
      if (page.url().startsWith(origin)) {
        capture.html.push(await page.content().catch(() => ''));
        capture.metadata.push(
          await page
            .locator('head')
            .innerHTML()
            .catch(() => ''),
        );
      }
      await context.tracing.stop({ path: tracePath });
      trace = traceTextEntries(await readFile(tracePath)).join('\n');
    } catch {
      // The test outcome is retained as counts; raw capture files are discarded.
    }
    expect(trace.length > 0).toBe(true);
    if (page.url().startsWith(`${origin}/register/`)) {
      expect(capture.html.length > 0).toBe(true);
      expect(capture.rsc.length > 0).toBe(true);
    }
    const missingActionResponses =
      capture.actionRequests.length - capture.actionResponses.length;
    if (testInfo.title.includes('lost committed response'))
      expect(missingActionResponses).toBe(1);
    else expect(missingActionResponses).toBe(0);

    const forbiddenValues = new Set<string>([
      fixture.wsA.id,
      fixture.wsB.id,
      fixture.po.userId,
      ...capture.requestHeaders
        .map((headers) => headers['cf-connecting-ip'])
        .filter((value): value is string => !!value),
    ]);
    for (const match of page.url().matchAll(/\/register\/([A-Za-z0-9_-]{43})/g))
      forbiddenValues.add(match[1]!);
    for (const body of capture.actionRequests) {
      for (const match of body.matchAll(
        /Content-Disposition: form-data; name="[^"]+"\r?\n(?:Content-Type:[^\r\n]+\r?\n)?\r?\n([^\r\n]*)/g,
      ))
        if (match[1]) forbiddenValues.add(match[1]);
    }
    const inputValues = await page
      .locator('form input')
      .evaluateAll((inputs) =>
        inputs
          .map((input) => (input as HTMLInputElement).value)
          .filter((value) => value.length > 0),
      )
      .catch(() => [] as string[]);
    inputValues.forEach((value) => forbiddenValues.add(value));
    const cookieValues = await context
      .cookies(origin)
      .then((cookies) =>
        cookies
          .filter((cookie) => cookie.name.startsWith('sb-'))
          .map((cookie) => cookie.value),
      )
      .catch(() => [] as string[]);
    cookieValues.forEach((value) => forbiddenValues.add(value));
    Object.values(capture.knownSensitiveLogValues)
      .flat()
      .forEach((value) => forbiddenValues.add(value));

    const sensitiveLogValues: Record<string, string[]> = Object.fromEntries(
      Object.entries(capture.knownSensitiveLogValues).map(([key, values]) => [
        key,
        [...values],
      ]),
    );
    for (const key of [
      'token',
      'request_secret',
      'password',
      'email',
      'phone',
      'name',
      'test_ip',
    ])
      sensitiveLogValues[key] ??= [];
    const parsedSubmissionValues: Record<string, string[]> = {
      token: [],
      request_secret: [],
      password: [],
      email: [],
      phone: [],
      name: [],
    };
    for (const match of page
      .url()
      .matchAll(/\/register\/([A-Za-z0-9_-]{43})/g)) {
      sensitiveLogValues.token!.push(match[1]!);
      parsedSubmissionValues.token!.push(match[1]!);
    }
    for (const headers of capture.requestHeaders)
      if (headers['cf-connecting-ip'])
        sensitiveLogValues.test_ip!.push(headers['cf-connecting-ip']);
    for (const body of capture.actionRequests) {
      for (const match of body.matchAll(
        /Content-Disposition: form-data; name="([^"]+)"\r?\n(?:Content-Type:[^\r\n]+\r?\n)?\r?\n([^\r\n]*)/g,
      )) {
        const key = match[1]?.replace(/^_\d+_/, '');
        const value = match[2];
        if (!key || !value) continue;
        if (
          key === 'request_secret' ||
          key === 'password' ||
          key === 'email' ||
          key === 'name' ||
          key === 'token'
        ) {
          sensitiveLogValues[key]!.push(value);
          parsedSubmissionValues[key]!.push(value);
        }
        if (key === 'ip_key' || key === 'link_key' || key === 'attestation')
          sensitiveLogValues[key]!.push(value);
        if (key === 'phone') {
          try {
            const phone = JSON.parse(value) as {
              country?: string;
              nationalNumber?: string;
            };
            if (phone.nationalNumber) {
              sensitiveLogValues.phone!.push(phone.nationalNumber);
              parsedSubmissionValues.phone!.push(phone.nationalNumber);
              const e164 = parsePhoneNumber(
                phone.nationalNumber,
                phone.country as 'EG',
              ).number;
              sensitiveLogValues.phone!.push(e164);
              parsedSubmissionValues.phone!.push(e164);
            }
          } catch {
            sensitiveLogValues.phone!.push(value);
            parsedSubmissionValues.phone!.push(value);
          }
        }
      }
    }
    if (capture.actionRequests.length > 0) {
      for (const key of [
        'token',
        'request_secret',
        'password',
        'email',
        'phone',
        'name',
      ]) {
        expect(
          parsedSubmissionValues[key]!.length,
          `multipart submission capture includes ${key}`,
        ).toBeGreaterThan(0);
        expect(
          sensitiveLogValues[key]!.length,
          `sensitive scan includes ${key}`,
        ).toBeGreaterThan(0);
      }
    }
    for (const value of inputValues) {
      if (value.includes('@')) sensitiveLogValues.email!.push(value);
      else if (/^\+?\d[\d ()-]{7,}\d$/.test(value))
        sensitiveLogValues.phone!.push(value);
      else sensitiveLogValues.name!.push(value);
    }
    const rawServerLog = await readFile(serverLogRawPath).catch(() =>
      Buffer.alloc(0),
    );
    const scenarioLog = rawServerLog
      .subarray(capture.serverLogStart)
      .toString('utf8');
    const serverLogScan = scanSensitiveLogLines(
      scenarioLog.split(/\r?\n/).filter(Boolean),
      sensitiveLogValues,
    );
    expect(
      serverLogScan.hitCount,
      'Server log contained sensitive values; matched content withheld',
    ).toBe(0);
    capture.serverLogs.push(scenarioLog);

    const rawCaptures = [
      ...capture.html,
      ...capture.rsc,
      ...capture.actionRequests,
      ...capture.actionResponses,
      ...capture.metadata,
      ...capture.browserLogs,
      ...capture.serverLogs,
      trace,
    ];
    const scrubbed = rawCaptures.map((value) => {
      let safe = redactCapture(value, [...forbiddenValues]);
      safe = safe
        .replace(
          /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
          '[redacted]',
        )
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted]')
        .replace(
          /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi,
          '[redacted]',
        );
      return safe;
    });
    const savedSummary = {
      locale:
        (await context.cookies(origin)).find(
          (cookie) => cookie.name === LOCALE_COOKIE,
        )?.value ?? 'unknown',
      outcome: testInfo.title,
      htmlCaptures: capture.html.length,
      rscCaptures: capture.rsc.length,
      actionRequests: capture.actionRequests.length,
      actionResponses: capture.actionResponses.length,
      metadataCaptures: capture.metadata.length,
      browserLogCaptures: capture.browserLogs.length,
      serverLogSummaryCaptures: capture.serverLogs.length,
      serverLogLines: scenarioLog.split(/\r?\n/).filter(Boolean).length,
      serverLogSensitiveHits: serverLogScan.hitCount,
      serverLogSensitiveCategoriesChecked:
        Object.keys(sensitiveLogValues).length,
      traceEntries: trace ? trace.length : 0,
      storedPayload: 'scrubbed summary only',
    };
    const persisted = JSON.stringify(savedSummary);
    expect(
      /telegram|request_secret|postgres|sqlstate|duplicate key value|relation .* does not exist/i.test(
        persisted,
      ),
    ).toBe(false);
    expect(
      scrubbed.every((value) =>
        [...forbiddenValues].every(
          (secret) => !secret || !value.includes(secret),
        ),
      ),
    ).toBe(true);
    await testInfo.attach('client-signup-privacy-summary.json', {
      contentType: 'application/json',
      body: persisted,
    });
  } finally {
    await page
      .locator('form input')
      .evaluateAll((inputs) => {
        for (const input of inputs as HTMLInputElement[]) {
          if (input.type !== 'hidden') input.value = '';
          else if (input.name === 'request_secret') input.value = '';
        }
      })
      .catch(() => undefined);
    await rm(traceDirectory, { recursive: true, force: true });
  }
});

async function fillSignup(
  page: import('@playwright/test').Page,
  values: { name: string; email: string; phone?: string },
  locale: 'ar' | 'en' = 'en',
) {
  const m = getMessages(locale);
  await page
    .getByLabel(m['clientSignup.name'], { exact: true })
    .fill(values.name);
  await page
    .getByLabel(m['clientSignup.dateOfBirth'], { exact: true })
    .fill('1990-04-12');
  await page
    .getByLabel(m['clientSignup.username'], { exact: true })
    .fill(`client-${randomUUID().slice(0, 8)}`);
  await page
    .getByLabel(m['clientSignup.email'], { exact: true })
    .fill(values.email);
  await page
    .getByRole('textbox', { name: m['clientSignup.phone'] })
    .fill(values.phone ?? generateEgyptianMobile());
  await page
    .getByLabel(m['clientSignup.password'], { exact: true })
    .fill('Complex!2345');
}

function recordSensitiveLogValue(page: Page, category: string, value: string) {
  const capture = privacyCaptures.get(page);
  if (capture) (capture.knownSensitiveLogValues[category] ??= []).push(value);
}

async function issueSignupToken(useWorkspaceOwner = true) {
  const { secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  const value = secret();
  checked(
    await issue(
      fixture,
      useWorkspaceOwner ? fixture.woA.client : fixture.po.client,
      { token_hash: value.hash },
    ),
  );
  return value.token;
}

function traceTextEntries(zip: Buffer): string[] {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Privacy trace archive is invalid');
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  const output: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Privacy trace entry is invalid');
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const filenameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const filename = zip
      .subarray(cursor + 46, cursor + 46 + filenameLength)
      .toString('utf8');
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    if (filename.endsWith('.trace') || filename.startsWith('resources/')) {
      const content =
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed)
            : Buffer.alloc(0);
      output.push(content.toString('utf8'));
    }
    cursor += 46 + filenameLength + extraLength + commentLength;
  }
  return output;
}

function redactCapture(capture: string, forbiddenValues: string[]) {
  let safe = capture;
  for (const value of forbiddenValues)
    if (value) safe = safe.replaceAll(value, '[redacted]');
  return safe;
}

function scrubDynamicCapture(capture: string, privateValues: string[]) {
  return redactCapture(capture, privateValues)
    .replace(
      /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
      '[redacted]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted]')
    .replace(/\b\+?\d[\d ()-]{7,}\d\b/g, '[redacted]')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[redacted]');
}

function embeddedRsc(html: string) {
  return [...html.matchAll(/self\.__next_f\.push\([\s\S]*?\)<\/script>/g)].map(
    ([payload]) => payload,
  );
}

test('raw server-log fixture canary is detected without exposing its contents', () => {
  const result = scanSensitiveLogLines(
    ['fixture stderr token-canary password-canary email-canary@example.test'],
    {
      token: 'token-canary',
      password: 'password-canary',
      email: 'email-canary@example.test',
    },
  );
  expect(result).toEqual({
    hitCount: 3,
    matchedLineCount: 1,
    categories: ['email', 'password', 'token'],
  });
});

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} completion capture is scrubbed before recording HTML, RSC, action, metadata and trace`, async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const token = await issueSignupToken();
    const m = getMessages(locale);
    const id = randomUUID();
    const name = `Privacy Example ${id}`;
    const email = `privacy-${id}@example.test`;
    const phone = generateEgyptianMobile();
    const phoneE164 = `+20${phone.slice(1)}`;
    const password = `Privacy!${id.replaceAll('-', '').slice(0, 12)}`;
    const ip = '203.0.113.20';
    const requestSecret = Buffer.from(new Uint8Array(32).fill(7)).toString(
      'base64url',
    );
    const rawHtml: string[] = [];
    const rawRsc: string[] = [];
    const rawRequests: string[] = [];
    const rawResponses: string[] = [];
    const rawMetadata: string[] = [];
    const rawBrowserLogs: string[] = [];
    const rawServerLogs: string[] = [];
    const responseJobs: Promise<void>[] = [];
    let traceText: string[] = [];
    const traceDirectory = await mkdtemp(join(tmpdir(), 'lftr-u8-privacy-'));
    const tracePath = join(traceDirectory, 'capture.zip');
    const serverLogStart = (await stat(serverLogRawPath)).size;

    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': ip });
    await page.addInitScript(() => {
      crypto.getRandomValues = ((array: Uint8Array) => {
        array.fill(7);
        return array;
      }) as typeof crypto.getRandomValues;
    });
    page.on('request', (request) => {
      if (request.method() === 'POST')
        rawRequests.push(request.postDataBuffer()?.toString('utf8') ?? '');
    });
    page.on('response', (response) => {
      responseJobs.push(
        (async () => {
          const contentType = response.headers()['content-type'] ?? '';
          if (
            response.request().method() === 'POST' ||
            contentType.includes('text/x-component')
          ) {
            const body = await response.text().catch(() => '');
            rawResponses.push(body);
            if (contentType.includes('text/x-component')) rawRsc.push(body);
          }
        })(),
      );
    });
    page.on('console', (message) => rawBrowserLogs.push(message.text()));

    await context.tracing.start({
      screenshots: false,
      snapshots: true,
      sources: false,
    });
    try {
      const getResponse = await page.goto(`/register/${token}`);
      const documentHtml = await getResponse!.text();
      rawHtml.push(documentHtml);
      rawRsc.push(...embeddedRsc(documentHtml));
      const hydratedHtml = await page.content();
      rawHtml.push(hydratedHtml);
      rawRsc.push(...embeddedRsc(hydratedHtml));
      rawMetadata.push(await page.locator('head').innerHTML());
      await fillSignup(page, { name, email, phone }, locale);
      const actionResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: m['clientSignup.submit'] })
        .click();
      const actionResponse = await actionResponsePromise;
      expect(actionResponse.status()).toBe(200);
      await expect(page.getByRole('status')).toHaveText(
        m['clientSignup.complete'],
      );
      rawHtml.push(await page.content());
      rawMetadata.push(await page.locator('head').innerHTML());
      await Promise.all(responseJobs);
      const rawServerLog = await readFile(serverLogRawPath);
      rawServerLogs.push(
        rawServerLog.subarray(serverLogStart).toString('utf8'),
      );
      await context.tracing.stop({ path: tracePath });
      traceText = traceTextEntries(await readFile(tracePath));
    } finally {
      await context.tracing.stop({ path: tracePath }).catch(() => undefined);
      await page
        .locator('input[name="name"]')
        .fill('')
        .catch(() => undefined);
      await page
        .locator('input[name="email"]')
        .fill('')
        .catch(() => undefined);
      await page
        .locator('input[type="tel"]')
        .fill('')
        .catch(() => undefined);
      await page
        .locator('input[name="password"]')
        .fill('')
        .catch(() => undefined);
      await page
        .locator('input[name="request_secret"]')
        .evaluate((element: HTMLInputElement) => {
          element.value = '';
        })
        .catch(() => undefined);
      await rm(traceDirectory, { recursive: true, force: true });
    }

    const forbiddenValues = [
      token,
      requestSecret,
      name,
      email,
      phone,
      phoneE164,
      password,
      ip,
      fixture.wsA.id,
      fixture.po.userId,
    ];
    const serverLogScan = scanSensitiveLogLines(
      rawServerLogs[0]!.split(/\r?\n/).filter(Boolean),
      {
        token,
        request_secret: requestSecret,
        password,
        email,
        phone: [phone, phoneE164],
        name,
        test_ip: ip,
        account_id: [fixture.po.userId],
        workspace_id: [fixture.wsA.id, fixture.wsB.id],
      },
    );
    expect(
      serverLogScan.hitCount,
      'Server log contained sensitive values; matched content withheld',
    ).toBe(0);
    const rawCaptures = [
      ...rawHtml,
      ...rawRsc,
      ...rawRequests,
      ...rawResponses,
      ...rawMetadata,
      ...rawBrowserLogs,
      ...rawServerLogs,
      ...traceText,
    ];
    const scrubbedCaptures = rawCaptures.map((capture) =>
      redactCapture(capture, forbiddenValues),
    );
    expect(
      scrubbedCaptures.every((capture) =>
        forbiddenValues.every((value) => !value || !capture.includes(value)),
      ),
    ).toBe(true);
    expect(scrubbedCaptures.some((capture) => capture.length > 0)).toBe(true);
    await testInfo.attach('client-signup-privacy-summary.json', {
      contentType: 'application/json',
      body: JSON.stringify({
        locale,
        outcome: 'complete',
        capturedHtml: rawHtml.length,
        capturedRsc: rawRsc.length,
        capturedActionRequests: rawRequests.length,
        capturedActionResponses: rawResponses.length,
        capturedMetadata: rawMetadata.length,
        capturedBrowserLogs: rawBrowserLogs.length,
        capturedServerLogLines: rawServerLogs[0]!.split(/\r?\n/).filter(Boolean)
          .length,
        serverLogSensitiveHits: serverLogScan.hitCount,
        capturedTraceEntries: traceText.length,
        storedPayload: 'scrubbed summary only',
      }),
    });
  });
}

test('valid signup link renders a minimal form with private route headers', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  const response = await page.goto(`/register/${validToken}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    page.getByRole('heading', {
      name: getMessages('en')['registration.publicValid'],
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Country')).toHaveValue('EG');
  await expect(page.getByLabel('Phone number')).toBeVisible();
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.locator('input[name="token"]')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toContain(validToken);
});

test('pending submission disables the form and ignores a second submit', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.14' });
  await page.goto(`/register/${pendingToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: `client-${randomUUID()}@example.test`,
  });
  let release!: () => void;
  let received!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    intercepted = new Promise<void>((resolve) => {
      received = resolve;
    });
  let postCount = 0;
  await page.route(`**/register/${pendingToken}`, async (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      received();
      await gate;
    }
    await route.continue();
  });
  const submit = page.locator('form button[type="submit"]');
  await submit.click();
  await intercepted;
  await expect(submit).toBeDisabled();
  await page
    .locator('form')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
  expect(postCount).toBe(1);
  await page.unrouteAll();
});

test('invalid, nested and denied registration paths keep privacy headers and hide the route token', async ({
  page,
}) => {
  const token = 'x'.repeat(43);
  const invalid = await page.goto(`/register/${token}`);
  expect(invalid?.status()).toBe(200);
  expect(invalid?.headers()['referrer-policy']).toBe('no-referrer');
  expect(invalid?.headers()['cache-control']).toContain('no-store');
  expect(page.url()).not.toContain('next=');
  const denied = await page.request.get(`${origin}/register/${token}/nested`, {
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(307);
  expect(denied.headers()['referrer-policy']).toBe('no-referrer');
  expect(denied.headers()['cache-control']).toContain('no-store');
  expect((denied.headers()['location'] ?? '').includes(token)).toBe(false);
  expect(denied.headers()['location']).not.toContain('next=');
});

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} expired link renders the generic invalid state with private headers`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const m = getMessages(locale);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    const response = await page.goto(`/register/${expiredToken}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    expect(response?.headers()['cache-control']).toContain('no-store');
    await expect(
      page.getByRole('heading', { name: m['registration.publicInvalid'] }),
    ).toBeVisible();
  });
}

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} invalid fields can be corrected without consuming the signup link`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const token = await issueSignupToken();
    const m = getMessages(locale);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.15' });
    await page.goto(`/register/${token}`);
    await fillSignup(
      page,
      {
        name: 'Example Person',
        email: 'invalid',
        phone: '01012',
      },
      locale,
    );
    await page.getByRole('button', { name: m['clientSignup.submit'] }).click();
    await expect(page.locator('form p[role="alert"]')).toHaveText(
      m['clientSignup.invalidInput'],
    );
    await expect(page.getByLabel(m['clientSignup.email'])).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByLabel(m['clientSignup.email'])).toHaveAttribute(
      'aria-describedby',
      'signup-email-error',
    );
    await expect(page.getByLabel(m['clientSignup.phone'])).toHaveAttribute(
      'aria-describedby',
      'signup-phone-error',
    );
    await expect(page.getByLabel(m['clientSignup.email'])).toBeFocused();
    await fillSignup(
      page,
      {
        name: 'Example Person',
        email: `client-${randomUUID()}@example.test`,
      },
      locale,
    );
    await page.getByRole('button', { name: m['clientSignup.submit'] }).click();
    await expect(page.getByRole('status')).toHaveText(
      m['clientSignup.complete'],
    );
  });
}

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} unavailable keeps the form retryable and does not consume the link`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const token = await issueSignupToken();
    const m = getMessages(locale);
    const email = `client-${randomUUID()}@example.test`;
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    await page.goto(`/register/${token}`);
    await fillSignup(
      page,
      {
        name: 'Example Person',
        email,
      },
      locale,
    );
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: m['clientSignup.submit'] }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('status')).toHaveText(
      m['clientSignup.unavailable'],
    );
    await expect(page.locator('form')).toBeVisible();
    await expect(page.getByRole('status')).toBeFocused();
    await expect(page.getByText(m['clientSignup.complete'])).toHaveCount(0);

    const db = (
      await import('../integration/registration-links-fixture')
    ).sql();
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const [link] =
        await db`select consumed_at is null as unconsumed from public.registration_links where token_hash=${tokenHash}`;
      const [user] =
        await db`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
      expect(link?.unconsumed).toBe(true);
      expect(user?.n).toBe(0);
    } finally {
      await db.end();
    }

    await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.10' });
    const retryResponsePromise = page.waitForResponse(
      (retryResponse) => retryResponse.request().method() === 'POST',
    );
    await page.getByRole('button', { name: m['clientSignup.submit'] }).click();
    expect((await retryResponsePromise).status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText(
      m['clientSignup.complete'],
    );
  });
}

test('provider failure returns generic unavailable, then a retry can complete', async ({
  page,
  context,
}) => {
  test.skip(
    !local || process.env.LOCAL_SUPABASE_PROVIDER_FAULT_TEST !== 'true',
    'Run only against the disposable local stack with the provider fault opt-in.',
  );
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.16' });
  await page.goto(`/register/${providerToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: `provider-${randomUUID()}@example.test`,
  });
  execFileSync('docker', ['stop', localSupabaseContainer('kong')], {
    stdio: 'ignore',
  });
  try {
    const unavailableResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Create registration request' })
      .click();
    const response = await unavailableResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('status')).toHaveText(
      'Please try again later.',
    );
  } finally {
    execFileSync('docker', ['start', localSupabaseContainer('kong')], {
      stdio: 'ignore',
    });
  }
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(
            `${process.env.API_URL || process.env.SUPABASE_URL}/auth/v1/health`,
          );
          return response.status() < 500;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
});

test('committed signup retry returns invalid and never creates a second identity', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  const email = `client-${randomUUID()}@example.test`;
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.11' });
  const getResponse = await page.goto(`/register/${validToken}`);
  expect(getResponse?.headers()['referrer-policy']).toBe('no-referrer');
  expect(getResponse?.headers()['cache-control']).toContain('no-store');
  await fillSignup(page, { name: 'Example Person', email });
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  const actionResponse = await responsePromise;
  expect(actionResponse.status()).toBe(200);
  expect(actionResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect(actionResponse.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('status')).toHaveText(
    'Thank you. Your registration request is complete.',
  );
  expect(
    (await context.cookies(origin)).some((cookie) =>
      cookie.name.startsWith('sb-'),
    ),
  ).toBe(false);

  const retryResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.status()).toBe(200);
  expect(retryResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect(retryResponse.headers()['cache-control']).toContain('no-store');
  const retryView = await page.locator('main').evaluate((element) => {
    const main = element as HTMLElement;
    const text = main.innerText;
    return {
      invalid: text.includes(
        'This registration link is invalid or no longer available.',
      ),
      complete: text.includes(
        'Thank you. Your registration request is complete.',
      ),
      unavailable: text.includes('Please try again later.'),
      duplicate: text.includes(
        'This email is already registered. Contact support.',
      ),
      invalidInput: text.includes(
        'Check the highlighted fields and try again.',
      ),
      signedIn: text.includes('Please sign out before submitting'),
      form: !!main.querySelector('form'),
    };
  });
  expect(retryView).toEqual({
    invalid: true,
    complete: false,
    unavailable: false,
    duplicate: false,
    invalidInput: false,
    signedIn: false,
    form: true,
  });
  const db = (await import('../integration/registration-links-fixture')).sql();
  try {
    const [row] =
      await db`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
    expect(row!.n).toBe(1);
  } finally {
    await db.end();
  }
});

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} consumed signup link retry stays generic and creates no second identity`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const m = getMessages(locale);
    const token = await issueSignupToken();
    const email = `client-${randomUUID()}@example.test`;
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    await page.setExtraHTTPHeaders({
      'CF-Connecting-IP': `203.0.113.${Math.floor(40 + Math.random() * 200)}`,
    });
    const firstResponse = await page.goto(`/register/${token}`);
    expect(firstResponse?.status()).toBe(200);
    await fillSignup(page, { name: 'Example Person', email }, locale);
    const actionResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: m['clientSignup.submit'] }).click();
    const actionResponse = await actionResponsePromise;
    expect(actionResponse.status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText(
      m['clientSignup.complete'],
    );

    const retryResponse = await page.goto(`/register/${token}`);
    expect(retryResponse?.status()).toBe(200);
    expect(retryResponse?.headers()['referrer-policy']).toBe('no-referrer');
    expect(retryResponse?.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('heading')).toHaveText(
      m['registration.publicInvalid'],
    );
    await expect(page.getByText(m['clientSignup.complete'])).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);

    const db = (
      await import('../integration/registration-links-fixture')
    ).sql();
    try {
      const [row] =
        await db`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
      expect(row!.n).toBe(1);
    } finally {
      await db.end();
    }
  });
}

test('identity collision keeps the contract duplicate wording without field details', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.12' });
  await page.goto(`/register/${duplicateToken}`);
  await fillSignup(page, {
    name: 'Example Person',
    email: knownStaffEmail,
  });
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'This email is already registered. Contact support.',
  );
  const duplicateMessage = await page.getByRole('status').textContent();
  expect(duplicateMessage?.includes(knownStaffEmail) ?? false).toBe(false);
});

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} duplicate responses are generic and identical across D-08 collision classes`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const m = getMessages(locale);
    const dbModule = await import('../integration/registration-links-fixture');
    const database = dbModule.sql();
    const identities: Record<
      'pending' | 'active' | 'staff' | 'archived',
      { email: string; phone: string }
    > = {} as Record<
      'pending' | 'active' | 'staff' | 'archived',
      { email: string; phone: string }
    >;
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    await page.setExtraHTTPHeaders({
      'CF-Connecting-IP': `203.0.113.${Math.floor(40 + Math.random() * 200)}`,
    });

    const makeIdentity = async (
      kind: 'pending' | 'active' | 'staff' | 'archived',
    ) => {
      const email = `u8-${kind}-${randomUUID()}@example.test`;
      const phone = generateEgyptianMobile();
      const phoneE164 = `+20${phone.slice(1)}`;
      if (kind === 'pending') {
        const token = await issueSignupToken(locale === 'en');
        await page.goto(`/register/${token}`);
        await expect(page.getByRole('heading')).toHaveText(
          m['registration.publicValid'],
        );
        await fillSignup(
          page,
          { name: 'Collision Example', email, phone },
          locale,
        );
        await page
          .getByRole('button', { name: m['clientSignup.submit'] })
          .click();
        await expect(page.getByRole('status')).toHaveText(
          m['clientSignup.complete'],
        );
      } else {
        const userId = randomUUID();
        recordSensitiveLogValue(page, 'account_id', userId);
        await database.begin(async (tx) => {
          await tx`insert into auth.users(id,email,phone,email_confirmed_at,deleted_at) values(${userId},${email},${phoneE164},clock_timestamp(),${kind === 'archived' ? new Date() : null})`;
          if (kind === 'staff') {
            await tx`insert into public.staff_profiles(user_id,role) values(${userId},'trainer')`;
            await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by) values(${fixture.wsA.id},${userId},${fixture.po.userId})`;
          }
        });
      }
      identities[kind] = { email, phone };
    };

    const captures: Array<{
      status: number;
      body: string;
      headers: Record<string, string>;
    }> = [];
    try {
      for (const kind of ['pending', 'active', 'staff', 'archived'] as const)
        await makeIdentity(kind);

      const tokenByCollision = Object.fromEntries(
        await Promise.all(
          (['email', 'phone', 'both'] as const).map(async (collision) => [
            collision,
            await issueSignupToken(locale === 'en'),
          ]),
        ),
      );

      for (const kind of ['pending', 'active', 'staff', 'archived'] as const) {
        for (const collision of ['email', 'phone', 'both'] as const) {
          const token = tokenByCollision[collision];
          await page.goto(`/register/${token}`);
          await expect(
            page.getByRole('heading'),
            `${kind}/${collision} link opens valid`,
          ).toHaveText(m['registration.publicValid']);
          let actionCapture:
            | {
                status: number;
                body: string;
                headers: Record<string, string>;
              }
            | undefined;
          const identity = identities[kind]!;
          await page.route(`**/register/${token}`, async (route) => {
            if (route.request().method() !== 'POST') {
              await route.continue();
              return;
            }
            const result = await route.fetch();
            const body = await result.text();
            const requestBody =
              route.request().postDataBuffer()?.toString('utf8') ?? '';
            const privateValues = [
              token,
              identity.email,
              identity.phone,
              'Collision Example',
              'Complex!2345',
              ...[
                ...requestBody.matchAll(
                  /Content-Disposition: form-data; name="[^"]+"\r?\n(?:Content-Type:[^\r\n]+\r?\n)?\r?\n([^\r\n]*)/g,
                ),
              ]
                .map((match) => match[1])
                .filter((value): value is string => !!value),
            ];
            actionCapture = {
              status: result.status(),
              body: scrubDynamicCapture(body, privateValues),
              headers: Object.fromEntries(
                Object.entries(result.headers()).map(([key, value]) => [
                  key,
                  scrubDynamicCapture(value, privateValues),
                ]),
              ),
            };
            await route.fulfill({ response: result, body });
          });
          await fillSignup(
            page,
            {
              name: 'Collision Example',
              email:
                collision === 'phone'
                  ? `new-${randomUUID()}@example.test`
                  : identity.email,
              ...(collision === 'email'
                ? {}
                : {
                    phone:
                      collision === 'both' ? identity.phone : identity.phone,
                  }),
            },
            locale,
          );
          const responsePromise = page.waitForResponse(
            (response) => response.request().method() === 'POST',
          );
          await page
            .getByRole('button', { name: m['clientSignup.submit'] })
            .click();
          const response = await responsePromise;
          expect(response.status()).toBe(200);
          await expect(
            page.getByRole('status'),
            `${kind}/${collision} returns duplicate`,
          ).toHaveText(m['clientSignup.duplicate']);
          expect(actionCapture?.status).toBe(200);
          captures.push(actionCapture!);
          await page.unroute(`**/register/${token}`);
        }
      }
    } finally {
      await database.end();
    }

    const first = captures[0];
    expect(captures).toHaveLength(12);
    const stableHeaders = (headers: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(headers)
          .filter(
            ([key]) =>
              ![
                'date',
                'content-length',
                'connection',
                'transfer-encoding',
              ].includes(key.toLowerCase()),
          )
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    expect(
      captures.every(
        (capture) =>
          capture.status === first?.status &&
          capture.body === first!.body &&
          capture.body.includes(m['clientSignup.duplicate']) &&
          JSON.stringify(stableHeaders(capture.headers)) ===
            JSON.stringify(stableHeaders(first!.headers)),
      ),
    ).toBe(true);
  });
}

for (const locale of ['ar', 'en'] as const) {
  test(`${locale} signed-in visitors get a manual sign-out prompt and no signup form`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the disposable local Supabase stack.');
    const { createServerClient } = await import('@supabase/ssr');
    const session = (await fixture.po.client.auth.getSession()).data.session;
    expect(!!session).toBe(true);
    if (!session) return;
    type SessionCookie = {
      name: string;
      value: string;
      options?: {
        maxAge?: number;
        expires?: number | string | Date;
        httpOnly?: boolean;
        sameSite?: 'lax' | 'strict' | 'none';
      };
    };
    const collected: SessionCookie[] = [];
    const client = createServerClient(
      process.env.API_URL!,
      process.env.ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: (values) => {
            collected.push(...(values as SessionCookie[]));
          },
        },
      },
    );
    const set = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    expect(set.error === null).toBe(true);
    const now = Math.floor(Date.now() / 1000);
    await context.addCookies(
      collected.map((cookie) => {
        const options = cookie.options;
        const parsedExpiry =
          options?.expires instanceof Date
            ? Math.floor(options.expires.getTime() / 1000)
            : typeof options?.expires === 'number'
              ? Math.floor(options.expires)
              : typeof options?.expires === 'string'
                ? Math.floor(Date.parse(options.expires) / 1000)
                : undefined;
        const expires =
          parsedExpiry !== undefined && Number.isFinite(parsedExpiry)
            ? parsedExpiry
            : typeof options?.maxAge === 'number'
              ? now + Math.floor(options.maxAge)
              : now + 3600;
        const sameSite =
          options?.sameSite === 'strict'
            ? ('Strict' as const)
            : options?.sameSite === 'none'
              ? ('None' as const)
              : options?.sameSite === 'lax'
                ? ('Lax' as const)
                : undefined;
        return {
          name: cookie.name,
          value: cookie.value,
          url: origin,
          expires,
          ...(options?.httpOnly !== undefined
            ? { httpOnly: options.httpOnly }
            : {}),
          ...(sameSite ? { sameSite } : {}),
        };
      }),
    );
    expect(collected.length).toBeGreaterThan(0);
    const token = await issueSignupToken();
    const m = getMessages(locale);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ]);
    await page.goto(`/register/${token}`);
    await expect(page.getByRole('status')).toHaveText(
      m['clientSignup.signedIn'],
    );
    await expect(page.locator('main form')).toHaveCount(0);
  });
}

test('lost committed response leaves one identity and the link no longer opens as valid', async ({
  page,
  context,
}) => {
  test.skip(!local, 'Requires the disposable local Supabase stack.');
  const { secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  const state = secret();
  checked(await issue(fixture, fixture.po.client, { token_hash: state.hash }));
  const email = `client-${randomUUID()}@example.test`;
  await context.addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.13' });
  await page.goto(`/register/${state.token}`);
  await fillSignup(page, { name: 'Example Person', email });
  let committedResponseStatus = 0;
  await page.route(`**/register/${state.token}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const committedResponse = await route.fetch();
    committedResponseStatus = committedResponse.status();
    await route.abort('failed');
  });
  await page
    .getByRole('button', { name: 'Create registration request' })
    .click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.getByRole('status')).toHaveText(
    getMessages('en')['clientSignup.unavailable'],
  );
  await expect(
    page.getByLabel(getMessages('en')['clientSignup.name']),
  ).toHaveValue('Example Person');
  await expect(
    page.getByLabel(getMessages('en')['clientSignup.email']),
  ).toHaveValue(email);
  await expect(
    page.getByRole('button', { name: 'Create registration request' }),
  ).toBeEnabled();
  await page.unrouteAll();
  expect(committedResponseStatus).toBe(200);
  const db = (await import('../integration/registration-links-fixture')).sql();
  try {
    const [row] =
      await db`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
    expect(row!.n).toBe(1);
  } finally {
    await db.end();
  }
  const response = await page.goto(`/register/${state.token}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    page.getByRole('heading', {
      name: getMessages('en')['registration.publicInvalid'],
    }),
  ).toBeVisible();
  const retryDb = (
    await import('../integration/registration-links-fixture')
  ).sql();
  try {
    const [row] =
      await retryDb`select count(*)::int as n from auth.users where lower(email)=lower(${email})`;
    expect(row!.n).toBe(1);
  } finally {
    await retryDb.end();
  }
});
