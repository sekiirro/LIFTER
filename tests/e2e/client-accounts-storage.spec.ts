import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE } from '../../lib/design/preferences';
import { storageReadinessDisposition } from './storage-readiness';

const apiUrl = process.env.API_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const serviceRoleKey =
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const origin = 'http://localhost:3000';
const local =
  new URL(apiUrl || 'http://invalid').hostname === '127.0.0.1' &&
  Boolean(anonKey && serviceRoleKey);

test('a real pending-client JWT cannot read or write Storage', async ({
  page,
  context,
}) => {
  test.skip(
    !local,
    'Requires the isolated local Storage-enabled Supabase stack.',
  );
  let storageDisposition: ReturnType<typeof storageReadinessDisposition> =
    'retry';
  let consecutiveUnavailable = 0;
  const requireStorage = process.env.LOCAL_SUPABASE_STORAGE_TEST === 'true';
  for (
    let attempt = 0;
    attempt < 40 && storageDisposition === 'retry';
    attempt++
  ) {
    const storageProbe = await fetch(`${apiUrl}/storage/v1/bucket`).catch(
      () => null,
    );
    let storageProbeMessage: string | null = null;
    if (storageProbe) {
      try {
        const body: unknown = await storageProbe.clone().json();
        if (
          typeof body === 'object' &&
          body !== null &&
          'message' in body &&
          typeof body.message === 'string'
        )
          storageProbeMessage = body.message;
      } catch {
        // Non-JSON responses remain unclassified and retry until the timeout.
      }
    }
    consecutiveUnavailable =
      storageProbe?.status === 503 ? consecutiveUnavailable + 1 : 0;
    storageDisposition = storageReadinessDisposition(
      storageProbe?.status ?? null,
      consecutiveUnavailable,
      requireStorage,
      storageProbeMessage,
    );
    if (storageDisposition === 'retry')
      await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(storageDisposition).not.toBe('retry');
  test.skip(
    storageDisposition === 'excluded',
    'The required local Supabase stack excludes storage-api.',
  );
  const { registrationFixture, secret, issue } =
    await import('../integration/registration-links-fixture');
  const fixture = await registrationFixture();
  const link = secret();
  if (
    (await issue(fixture, fixture.po.client, { token_hash: link.hash })).error
  )
    throw new Error('Storage fixture registration link could not be issued');

  const email = `storage-${randomUUID()}@example.test`;
  const password = 'Storage!2345';
  const bucket = `pending-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const createdBucket = await admin.storage.createBucket(bucket, {
    public: false,
  });
  expect(createdBucket.error === null).toBe(true);
  const bucketCreated = createdBucket.error === null;
  try {
    const seed = await admin.storage
      .from(bucket)
      .upload('private-seed.txt', new Blob(['local fixture']), {
        contentType: 'text/plain',
      });
    expect(seed.error === null).toBe(true);

    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.30' });
    await page.goto(`/register/${link.token}`);
    await page.getByLabel('Name', { exact: true }).fill('Storage Fixture');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page
      .getByRole('textbox', { name: 'Phone number' })
      .fill(
        `0101234${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      );
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Create registration request' })
      .click();
    await expect(page.getByRole('status')).toHaveText(
      'Thank you. Your registration request is complete.',
    );

    const db = (
      await import('../integration/registration-links-fixture')
    ).sql();
    try {
      const [row] =
        await db`select c.approval_state from public.clients c join auth.users u on u.id=c.auth_user_id where lower(u.email)=lower(${email})`;
      expect(row?.approval_state).toBe('pending-approval');
    } finally {
      await db.end();
    }

    const pending = createClient(apiUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const signedIn = await pending.auth.signInWithPassword({ email, password });
    expect(signedIn.error === null && !!signedIn.data.session).toBe(true);
    const read = await pending.storage
      .from(bucket)
      .download('private-seed.txt');
    expect(read.error !== null).toBe(true);
    const write = await pending.storage
      .from(bucket)
      .upload('pending-write.txt', new Blob(['denied']), {
        contentType: 'text/plain',
      });
    expect(write.error !== null).toBe(true);
  } finally {
    if (bucketCreated) {
      await admin.storage.emptyBucket(bucket);
      await admin.storage.deleteBucket(bucket);
    }
  }
});
