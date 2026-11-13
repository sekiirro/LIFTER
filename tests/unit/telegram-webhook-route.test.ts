import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '../../lib/supabase/admin';
import { POST } from '../../app/api/telegram/webhook/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('acknowledges malformed authenticated Telegram updates with HTTP 200', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-webhook-secret');
  const request = new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-webhook-secret',
    },
    body: '{malformed',
  });

  const response = await POST(request);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'invalid' });
});

it('acknowledges an invalid or replayed authenticated start with HTTP 200', async () => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-webhook-secret');
  vi.mocked(createAdminClient).mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>);
  const token = 'a'.repeat(64);
  const request = new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-webhook-secret',
    },
    body: JSON.stringify({
      update_id: 17,
      message: {
        text: `/start ${token}`,
        from: { id: 12 },
        chat: { id: 12 },
      },
    }),
  });

  const response = await POST(request);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'invalid' });
});
