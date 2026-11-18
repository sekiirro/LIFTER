import { describe, expect, it, vi } from 'vitest';
import { runTelegramJobs } from '../../lib/forms/telegram-delivery';

const ALERT_ID = '123e4567-e89b-12d3-a456-426614174000';

function clientWithPrepareError(error: unknown) {
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
              payload: { alert_id: ALERT_ID, recipient_id: 'user' },
            },
          ],
          error: null,
        };
      if (name === 'prepare_f15_telegram_delivery')
        return { data: null, error };
      if (name === 'jobs_fail') return { data: 'pending', error: null };
      return { data: true, error: null };
    },
  };
  return { client, calls };
}

describe('T083 transient-only Telegram preparation retry (S64-PO-3)', () => {
  it.each(['08006', '40001', '40P01', '55P03'])(
    'retries transient preparation code %s with temporary_error',
    async (code) => {
      const canary = `t083-transient-canary-${code}`;
      const { client, calls } = clientWithPrepareError({
        message: canary,
        code,
      });
      const result = await runTelegramJobs({
        client,
        transport: { send: vi.fn() },
        appUrl: 'https://example.test',
      });
      expect(result).toEqual({ completed: 0, failed: 1 });
      expect(calls.find(([name]) => name === 'jobs_fail')?.[1]).toMatchObject({
        error_code: 'temporary_error',
        permanent: false,
      });
      expect(JSON.stringify(calls)).not.toContain(canary);
      expect(calls.some(([name]) => name === 'jobs_complete')).toBe(false);
    },
  );

  it.each(['23505', '42501', 'PGRST116'])(
    'dead-letters permanent preparation code %s with handler_error',
    async (code) => {
      const canary = `t083-permanent-canary-${code}`;
      const { client, calls } = clientWithPrepareError({
        message: canary,
        code,
      });
      const result = await runTelegramJobs({
        client,
        transport: { send: vi.fn() },
        appUrl: 'https://example.test',
      });
      expect(result).toEqual({ completed: 0, failed: 1 });
      expect(calls.find(([name]) => name === 'jobs_fail')?.[1]).toMatchObject({
        error_code: 'handler_error',
        permanent: true,
      });
      expect(JSON.stringify(calls)).not.toContain(canary);
      expect(calls.some(([name]) => name === 'jobs_complete')).toBe(false);
    },
  );

  it('dead-letters a no-code Error with handler_error', async () => {
    const canary = 't083-no-code-canary';
    const { client, calls } = clientWithPrepareError(new Error(canary));
    const result = await runTelegramJobs({
      client,
      transport: { send: vi.fn() },
      appUrl: 'https://example.test',
    });
    expect(result).toEqual({ completed: 0, failed: 1 });
    expect(calls.find(([name]) => name === 'jobs_fail')?.[1]).toMatchObject({
      error_code: 'handler_error',
      permanent: true,
    });
    expect(JSON.stringify(calls)).not.toContain(canary);
    expect(calls.some(([name]) => name === 'jobs_complete')).toBe(false);
  });
});
