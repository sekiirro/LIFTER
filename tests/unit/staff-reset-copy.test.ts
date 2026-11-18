import { readFileSync } from 'node:fs';
import { renderToReadableStream } from 'react-dom/server.browser';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import RecoveryPage from '../../app/auth/recovery/page';
import { LoginForm } from '../../app/login/LoginForm';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';

const actionState = vi.hoisted(() => ({
  value: null as unknown,
  locale: 'en',
  verifyRecovery: vi.fn(async () => ({ status: 'invalid_link' })),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: actionState.locale }) }),
}));
vi.mock('../../app/auth/recovery/actions', () => ({
  verifyRecovery: actionState.verifyRecovery,
  setNewPassword: async () => ({ status: 'ok' }),
}));
vi.mock('../../components/auth/AuthPreferences', () => ({
  AuthPreferences: () => null,
}));
vi.mock('../../app/login/actions', () => ({
  signIn: async () => ({ status: 'invalid_credentials' }),
  requestStaffReset: async () => ({ status: 'staffResetConfirm' }),
}));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useActionState: () => [actionState.value, () => undefined, false],
  };
});

async function renderHtml(element: ReactNode) {
  const stream = await renderToReadableStream(element);
  return (await new Response(stream).text()).replaceAll('&#x27;', "'");
}

const approvedRows = readFileSync('specs/004-auth/copy-proposal.md', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .flatMap((cells) => {
    const key = cells[1]?.match(/`(auth\.[\w]+)`/)?.[1];
    const english = cells[2];
    const arabic = cells[3];
    return key && english !== undefined && arabic !== undefined
      ? [{ key, english, arabic }]
      : [];
  });

function sameUtf8Bytes(actual: string | undefined, expected: string) {
  return (
    actual !== undefined &&
    Buffer.from(actual, 'utf8').equals(Buffer.from(expected, 'utf8'))
  );
}

describe('approved F4 recovery copy', () => {
  it('keeps every approved auth.* value present and byte-exact in both catalogs', () => {
    expect(approvedRows.length).toBeGreaterThan(0);
    for (const row of approvedRows) {
      expect(Object.hasOwn(en, row.key), `${row.key} exists in EN`).toBe(true);
      expect(Object.hasOwn(ar, row.key), `${row.key} exists in AR`).toBe(true);
      expect(
        sameUtf8Bytes(en[row.key as keyof typeof en], row.english),
        `${row.key} EN`,
      ).toBe(true);
      expect(
        sameUtf8Bytes(ar[row.key as keyof typeof ar], row.arabic),
        `${row.key} AR`,
      ).toBe(true);
    }
  });

  it('renders staff invalid-link copy only for staff-marked links', async () => {
    const staffCopy = approvedRows.find(
      (row) => row.key === 'auth.staffInvalidLink',
    );
    const clientCopy = approvedRows.find(
      (row) => row.key === 'auth.invalid_link',
    );
    expect(staffCopy).toBeDefined();
    expect(clientCopy).toBeDefined();

    for (const locale of ['en', 'ar'] as const) {
      actionState.locale = locale;
      const staffPage = await RecoveryPage({
        searchParams: Promise.resolve({ flow: 'staff' } as never),
      });
      const clientPage = await RecoveryPage({
        searchParams: Promise.resolve({}),
      });
      const staffHtml = await renderHtml(staffPage);
      const clientHtml = await renderHtml(clientPage);
      const staffExpected =
        locale === 'en' ? staffCopy?.english : staffCopy?.arabic;
      const clientExpected =
        locale === 'en' ? clientCopy?.english : clientCopy?.arabic;
      expect(staffHtml).toContain(staffExpected);
      expect(clientHtml).toContain(clientExpected);
    }
  });

  it('does not verify a token while rendering a scanner GET for a staff link', async () => {
    actionState.locale = 'en';
    actionState.verifyRecovery.mockClear();
    const page = await RecoveryPage({
      searchParams: Promise.resolve({
        flow: 'staff',
        token_hash: 'scanner-token-fixture',
        type: 'recovery',
      } as never),
    });

    expect(actionState.verifyRecovery).not.toHaveBeenCalled();
    expect(await renderHtml(page)).toContain('Continue');
  });

  it('renders the generic reset confirmation after a request', async () => {
    actionState.value = { status: 'staffResetConfirm' };
    const confirmation = approvedRows.find(
      (row) => row.key === 'auth.staffResetConfirm',
    );

    expect(confirmation).toBeDefined();
    for (const [messages, expected] of [
      [en, confirmation?.english],
      [ar, confirmation?.arabic],
    ] as const) {
      const page = createElement(LoginForm, {
        next: '/',
        messages: messages as never,
      });
      const html = await renderHtml(page);
      expect(html).toContain(expected);
      expect(html).not.toContain('account does not exist');
    }
  });
});
