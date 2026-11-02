import { describe, expect, it, vi } from 'vitest';
import {
  buildTelegramMessage,
  deliverTelegramAlert,
  runTelegramJobs,
} from '../../lib/forms/telegram-delivery';
import {
  parseTelegramStart,
  validTelegramWebhookSecret,
  validTelegramWorkerSecret,
} from '../../lib/forms/telegram-webhook';

describe('staff Telegram link and delivery primitives', () => {
  it('rejects missing and forged webhook secrets and compares valid secrets', () => {
    expect(validTelegramWebhookSecret(null, 'secret')).toBe(false);
    expect(validTelegramWebhookSecret('forged', 'secret')).toBe(false);
    expect(validTelegramWebhookSecret('secret', 'secret')).toBe(true);
  });

  it('requires the configured bearer secret for the internal worker route', () => {
    expect(validTelegramWorkerSecret(null, 'secret')).toBe(false);
    expect(validTelegramWorkerSecret('secret', 'secret')).toBe(false);
    expect(validTelegramWorkerSecret('Bearer forged', 'secret')).toBe(false);
    expect(validTelegramWorkerSecret('Bearer secret', 'secret')).toBe(true);
  });

  it('accepts only /start token from the chat owner', () => {
    const token = 'a'.repeat(64);
    expect(
      parseTelegramStart({
        update_id: 3,
        message: {
          text: `/start ${token}`,
          from: { id: 12 },
          chat: { id: 12 },
        },
      }),
    ).toEqual({ token, chatId: '12', updateId: 3 });
    expect(
      parseTelegramStart({
        update_id: 3,
        message: {
          text: `/start ${token}`,
          from: { id: 12 },
          chat: { id: 13 },
        },
      }),
    ).toBeNull();
    expect(
      parseTelegramStart({
        update_id: 3,
        message: { text: '/start', from: { id: 12 }, chat: { id: 12 } },
      }),
    ).toBeNull();
  });

  it('builds generic ID-independent text with only the in-app URL and uses fake transport', async () => {
    const message = buildTelegramMessage({
      chatId: '12',
      alertId: '123e4567-e89b-12d3-a456-426614174000',
      appUrl: 'https://example.test',
    });
    expect(message?.text).toContain('https://example.test/forms/alerts');
    expect(message?.text).not.toMatch(/client|answer|health|123e4567/i);
    const send = vi.fn().mockResolvedValue(undefined);
    await deliverTelegramAlert({ message: message!, transport: { send } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      buildTelegramMessage({
        chatId: '12',
        alertId: 'bad',
        appUrl: 'http://example.test',
      }),
    ).toBeNull();
  });

  it('completes jobs without a send for an already delivered occurrence', async () => {
    const alertId = '123e4567-e89b-12d3-a456-426614174000';
    const calls: string[] = [];
    const client = {
      async rpc(name: string) {
        calls.push(name);
        if (name === 'claim_f15_form_alert_jobs')
          return {
            data: [
              {
                id: 'job',
                lease_token: 'lease',
                kind: 'forms.alert',
                payload: { alert_id: alertId, recipient_id: 'user' },
              },
            ],
            error: null,
          };
        if (name === 'prepare_f15_telegram_delivery')
          return { data: { status: 'already_delivered' }, error: null };
        return { data: true, error: null };
      },
    };
    const send = vi.fn();
    const result = await runTelegramJobs({
      client,
      transport: { send },
      appUrl: 'https://example.test',
    });
    expect(result).toEqual({ completed: 1, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(calls).toContain('jobs_complete');
  });

  it.each(['unlinked', 'unavailable'])(
    'never sends to %s recipient',
    async (status) => {
      const client = {
        async rpc(name: string) {
          if (name === 'claim_f15_form_alert_jobs')
            return {
              data: [
                {
                  id: 'job',
                  lease_token: 'lease',
                  kind: 'forms.alert',
                  payload: {
                    alert_id: '123e4567-e89b-12d3-a456-426614174000',
                    recipient_id: 'user',
                  },
                },
              ],
              error: null,
            };
          if (name === 'prepare_f15_telegram_delivery')
            return { data: { status }, error: null };
          return { data: true, error: null };
        },
      };
      const send = vi.fn();
      const result = await runTelegramJobs({
        client,
        transport: { send },
        appUrl: 'https://example.test',
      });
      expect(status === 'unlinked' ? result.completed : result.failed).toBe(1);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('routes transport failure through the bounded jobs retry path', async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const client = {
      async rpc(name: string, args?: Record<string, unknown>) {
        calls.push([name, args]);
        if (name === 'claim_f15_form_alert_jobs')
          return {
            data: [
              {
                id: 'job',
                lease_token: 'lease',
                kind: 'forms.alert',
                payload: {
                  alert_id: '123e4567-e89b-12d3-a456-426614174000',
                  recipient_id: 'user',
                },
              },
            ],
            error: null,
          };
        if (name === 'prepare_f15_telegram_delivery')
          return {
            data: { status: 'ready', delivery_id: 'delivery' },
            error: null,
          };
        if (name === 'claim_f15_telegram_delivery')
          return { data: '12345', error: null };
        return { data: true, error: null };
      },
    };
    const result = await runTelegramJobs({
      client,
      transport: {
        async send() {
          throw new Error('fake transport failure');
        },
      },
      appUrl: 'https://example.test',
    });
    expect(result.failed).toBe(1);
    expect(calls.find(([name]) => name === 'jobs_fail')?.[1]).toMatchObject({
      error_code: 'telegram_transport',
      permanent: false,
    });
  });
});
