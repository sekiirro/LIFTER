import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createSessionClient: vi.fn(),
  order: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ getActor: mocks.getActor }));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: mocks.createSessionClient,
}));

import {
  createClientNote,
  readClientNotes,
} from '../../lib/client-notes/service';

describe('Client Notes list ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: mocks.order,
      then: (resolve: (value: { data: []; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    mocks.getActor.mockResolvedValue({
      userId: 'trainer',
      role: 'trainer',
      activeWorkspaceIds: ['10000000-0000-4000-8000-000000000001'],
    });
    mocks.createSessionClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
  });

  it('orders newest-created first with a stable descending ID tie-break', async () => {
    const result = await readClientNotes({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      clientId: '20000000-0000-4000-8000-000000000001',
    });

    expect(result).toEqual({ status: 'ok', notes: [] });
    expect(mocks.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('refuses invalid body boundaries before reaching the database boundary', async () => {
    for (const body of [
      '',
      ' \t\n',
      '\u00a0',
      'x'.repeat(5001),
      `valid\u0000body`,
    ]) {
      await expect(
        createClientNote({
          workspaceId: '10000000-0000-4000-8000-000000000001',
          clientId: '20000000-0000-4000-8000-000000000001',
          idempotencyKey: 'key',
          body,
        }),
      ).resolves.toEqual({ status: 'invalid_input' });
    }
    expect(mocks.getActor).not.toHaveBeenCalled();
    expect(mocks.createSessionClient).not.toHaveBeenCalled();
  });
});
