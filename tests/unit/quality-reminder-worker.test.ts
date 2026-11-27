import { describe, expect, it, vi } from 'vitest';
import { drain, type Job, type Rpc } from '../../workers/cron/src/drain';
import { createHandlers } from '../../workers/cron/src/handlers';

const reminderJob: Job = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'quality.monthly_reminder',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  payload: {
    workspace_id: '33333333-3333-4333-8333-333333333333',
    month: '2026-11',
    placeholder_copy_key: 'p7.monthly_reminder.placeholder',
  },
  lease_token: '44444444-4444-4444-8444-444444444444',
};

function fakeRpc(handled: boolean | Error = true) {
  let claimed = false;
  return vi.fn<Rpc>().mockImplementation((async (name) => {
    if (name === 'jobs_claim') {
      if (claimed) return [];
      claimed = true;
      return [reminderJob];
    }
    if (name === 'handle_quality_monthly_reminder') {
      if (handled instanceof Error) throw handled;
      return handled;
    }
    if (name === 'jobs_complete') return true;
    if (name === 'jobs_fail') return 'dead';
    throw new Error(`Unexpected RPC ${String(name)}`);
  }) as Rpc);
}

describe('quality.monthly_reminder cron handler', () => {
  it('registers a real leased handler and completes instead of dead-lettering', async () => {
    const rpc = fakeRpc();
    const handlers = createHandlers(rpc);

    expect(handlers['quality.monthly_reminder']).toBeTypeOf('function');
    await drain({ rpc, handlers });

    expect(rpc).toHaveBeenCalledWith('handle_quality_monthly_reminder', {
      p_job_id: reminderJob.id,
      p_lease_token: reminderJob.lease_token,
    });
    expect(rpc).toHaveBeenCalledWith('jobs_complete', {
      id: reminderJob.id,
      lease: reminderJob.lease_token,
    });
    expect(rpc.mock.calls.some(([name]) => name === 'jobs_fail')).toBe(false);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      reminderJob.payload.workspace_id,
    );
  });

  it('reports a stale lease as a permanent safe failure', async () => {
    const rpc = fakeRpc(false);
    await drain({ rpc, handlers: createHandlers(rpc) });

    expect(rpc).toHaveBeenCalledWith('jobs_fail', {
      id: reminderJob.id,
      lease: reminderJob.lease_token,
      error_code: 'quality_reminder_lease_invalid',
      permanent: true,
    });
    expect(rpc.mock.calls.some(([name]) => name === 'jobs_complete')).toBe(
      false,
    );
  });

  it('sanitizes arbitrary delivery errors as retryable handler failures', async () => {
    const rpc = fakeRpc(new Error('private@example.test provider secret'));
    await drain({ rpc, handlers: createHandlers(rpc) });

    expect(rpc).toHaveBeenCalledWith('jobs_fail', {
      id: reminderJob.id,
      lease: reminderJob.lease_token,
      error_code: 'handler_error',
      permanent: false,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(
      'private@example.test',
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('provider secret');
  });
});
