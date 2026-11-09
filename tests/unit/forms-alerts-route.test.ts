import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const forms = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: forms.session,
}));
vi.mock('../../lib/forms/alert-inbox', () => ({
  readAlertInbox: forms.read,
  markAlertRead: vi.fn(),
}));

import { GET } from '../../app/api/forms/alerts/route';

const client = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  },
};

const alertsUrl = (query: string) =>
  new NextRequest(`https://example.test/api/forms/alerts${query}`);

afterEach(() => vi.resetAllMocks());

it('normalizes a parseable before cursor to ISO 8601 before reading the inbox', async () => {
  forms.session.mockResolvedValue(client);
  forms.read.mockResolvedValue({ ok: true, rows: [] });
  const response = await GET(
    alertsUrl(`?before=${encodeURIComponent('Tue, 03 Nov 2026 10:00:00 GMT')}`),
  );
  expect(response.status).toBe(200);
  expect(forms.read).toHaveBeenCalledWith(
    client,
    50,
    '2026-11-03T10:00:00.000Z',
  );
});

it('rejects an unparseable before cursor without reading the inbox', async () => {
  forms.session.mockResolvedValue(client);
  const response = await GET(
    alertsUrl(`?before=${encodeURIComponent('not a time')}`),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ status: 'invalid' });
  expect(forms.read).not.toHaveBeenCalled();
});
