import { describe, expect, it, vi } from 'vitest';
import {
  markAlertRead,
  readAlertInbox,
  type AlertInboxRpc,
} from '../../lib/forms/alert-inbox';

const row = {
  delivery_id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  source_assignment_id: '33333333-3333-4333-8333-333333333333',
  stage: 'client_trainer_24h',
  created_at: '2026-11-01T00:00:00.000Z',
  read_at: null,
};

function client(data: unknown, error: unknown = null): AlertInboxRpc {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe('in-app alert inbox adapter', () => {
  it('returns only validated ID/stage/timestamp rows from the audited reader', async () => {
    const rpc = client([row]);
    await expect(readAlertInbox(rpc)).resolves.toEqual({
      ok: true,
      rows: [row],
    });
    expect(rpc.rpc).toHaveBeenCalledWith('read_form_alert_inbox', {
      p_limit: 50,
      p_before: null,
    });
  });

  it('rejects answer text, client names and unknown alert fields', async () => {
    for (const unexpected of [
      { ...row, answer_text: 'sensitive' },
      { ...row, client_name: 'private' },
      { ...row, stage: 'unknown' },
    ]) {
      await expect(readAlertInbox(client([unexpected]))).resolves.toEqual({
        ok: false,
      });
    }
  });

  it('bounds the page size and maps database errors to unavailable', async () => {
    const rpc = client([], new Error('raw database detail'));
    await expect(readAlertInbox(rpc)).resolves.toEqual({ ok: false });
    expect(rpc.rpc).toHaveBeenCalledTimes(1);
    await expect(readAlertInbox(rpc, 101)).resolves.toEqual({ ok: false });
    expect(rpc.rpc).toHaveBeenCalledTimes(1);
  });

  it('marks only a valid delivery ID and returns safe idempotent outcomes', async () => {
    const rpc = client({ status: 'read' });
    await expect(markAlertRead(rpc, row.delivery_id)).resolves.toBe('read');
    await expect(markAlertRead(rpc, 'invalid')).resolves.toBe('not_found');
    expect(rpc.rpc).toHaveBeenCalledTimes(1);
  });
});
