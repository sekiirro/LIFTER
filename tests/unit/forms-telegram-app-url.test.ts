import { expect, it, vi } from 'vitest';
import { runTelegramJobs } from '../../lib/forms/telegram-delivery';

it('leaves alert jobs unclaimed when the app URL is not HTTPS', async () => {
  const calls: string[] = [];
  const client = {
    async rpc(name: string) {
      calls.push(name);
      return { data: [], error: null };
    },
  };
  const send = vi.fn();
  const result = await runTelegramJobs({
    client,
    transport: { send },
    appUrl: 'http://example.test',
  });
  expect(result).toEqual({ completed: 0, failed: 0 });
  expect(calls).toEqual([]);
  expect(send).not.toHaveBeenCalled();
});
